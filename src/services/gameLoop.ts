import { ref } from 'vue';
import OpenAI from 'openai';
import { db } from '@/db'; // Import db directly
import { useSettingsStore } from '@/stores/settings';
import { useChatStore } from '@/stores/chat';
import { useGameStore } from '@/stores/game';
import { useToastStore } from '@/stores/toast';
import { promptService } from '@/services/prompt';
import { logicService } from '@/services/logic';
import { drawingService } from '@/services/drawing';
import { memoryService } from '@/services/memory';
// import { estimateTokens } from '@/utils/token';
import type { CombatState, Combatant, PowerLevel, SpellCard } from '@/types/combat';
import { audioManager } from './audio';
import { v4 as uuidv4 } from 'uuid';
import { useCharacterStore } from '@/stores/character';
import { PRESET_SPELLCARDS } from '@/data/spellcards';
import { CHARACTER_NAME_TO_ID_MAP, resolveCharacterId } from '@/services/characterMapping';
import { getBuffByName } from '@/data/buff';

export type GameLoopStage = 'idle' | 'preparing' | 'generating_story' | 'background_processing' | 'committing';

class GameLoopService {
  isProcessing = ref(false);
  currentStage = ref<GameLoopStage>('idle');
  error = ref<string | null>(null);
  isAborting = ref(false);
  isBackgroundProcessing = ref(false);

  // Streaming content buffer
  streamedContent = ref('');
  
  // Abort controller for cancellation
  private abortController: AbortController | null = null;

  async initializeNewGame() {
     const gameStore = useGameStore();
     const charStore = useCharacterStore();
     
     // Ensure characters are loaded
     await charStore.loadCharacters();
     
     // 1. Reset Runtime State
     gameStore.resetState();
     
     // 2. Iterate Lorebook for "Character" type entries with initial variables
     const characters = charStore.characters;
     
     for (const char of characters) {
        if ((char.type === 'character' || !char.type) && char.uuid) {
           const initialData: any = {};
           let hasInitData = false;
           
           if (char.initialPower) {
              initialData.power = char.initialPower;
              hasInitData = true;
           }
           if (char.initialMaxHp) {
              initialData.max_hp = char.initialMaxHp;
              initialData.hp = char.initialMaxHp; // Full HP on init
              hasInitData = true;
           }
           if (char.initialResidence) {
              initialData.residence = char.initialResidence;
              hasInitData = true;
           }
           
           if (hasInitData) {
              // Write to game state
              // We construct a fake action to reuse logic or directly write to state
              // Direct write is safer/faster for init
              if (!gameStore.state.npcs[char.uuid]) {
                 gameStore.state.npcs[char.uuid] = { id: char.uuid, name: char.name } as any;
              }
              const targetNpc = gameStore.state.npcs[char.uuid];
              if (targetNpc) {
                 Object.assign(targetNpc, initialData);
              }
           }
        }
     }
     
     console.log('[GameLoop] New Game Initialized. Pre-populated NPCs:', Object.keys(gameStore.state.npcs).length);
  }

  async handleUserAction(userContent: string) {
    if (this.isProcessing.value || this.isBackgroundProcessing.value) {
      console.warn('[GameLoop] handleUserAction ignored because already processing:', {
        isProcessing: this.isProcessing.value,
        isBackgroundProcessing: this.isBackgroundProcessing.value
      });
      return;
    }
    if (!userContent.trim()) {
      console.warn('[GameLoop] handleUserAction ignored because content is empty');
      return;
    }
    
    this.startLoop();
    
    try {
      // 0. Update Turn & Retrieve Memory
      const gameStore = useGameStore();
      gameStore.incrementTurn();

      // Clear pending triggers if user chose to type instead of clicking them
      // This prevents "Enter Duel" or "Quest Offer" buttons from persisting across rounds
      if (gameStore.state.system.combat?.isPending) {
        gameStore.setCombatState(null);
        console.log('[GameLoop] Cleared pending combat trigger because user performed a different action.');
      }
      
      if (gameStore.state.system.pending_quest_trigger) {
        gameStore.setPendingQuest(null);
        console.log('[GameLoop] Cleared pending quest trigger because user performed a different action.');
      }

      const settingsStore = useSettingsStore();
      const currentSaveSlotId = settingsStore.currentSaveSlotId || 1;
      
      const retrievedMemories = await memoryService.retrieve(currentSaveSlotId, userContent, gameStore.state.system.turn_count);

      // 1. Prepare Context
      this.currentStage.value = 'preparing';
      const promptContext = await promptService.build(userContent, retrievedMemories);
      
      // DEBUG: Log Context Composition
      console.log('[Prompt Debug] Context Composition:', promptContext.sections.map(s => `${s.id}: ${s.tokenCount} tokens`).join(', '));
      console.log('[Prompt Debug] Total Tokens:', promptContext.totalTokens);

      const messages = promptService.toOpenAIMessages(promptContext);
      
      // DEBUG: Log LLM1 Prompt
      console.log('【LLM1 Debug】Prompt Messages:', JSON.parse(JSON.stringify(messages)));

      // 2. LLM #1: Story Generation (Streaming)
      this.currentStage.value = 'generating_story';
      // const settingsStore = useSettingsStore(); // Already declared above
      const chatConfig = settingsStore.getEffectiveConfig('chat');
      
      if (!chatConfig.apiKey) {
        throw new Error('未配置对话模型 (LLM #1) 的 API Key');
      }

      const openai = new OpenAI({
        baseURL: chatConfig.baseUrl,
        apiKey: chatConfig.apiKey,
        dangerouslyAllowBrowser: true
      });

      const completionOptions = {
        model: chatConfig.model || 'gpt-3.5-turbo',
        messages: messages as any,
        stream: chatConfig.stream !== false, // Default true - but now properly saved
        temperature: chatConfig.temperature ?? 0.7,
        top_p: chatConfig.top_p,
        frequency_penalty: chatConfig.frequency_penalty,
        presence_penalty: chatConfig.presence_penalty,
      };

      console.log('[Game Loop] Chat Config:', {
        model: chatConfig.model,
        stream: chatConfig.stream,
        temperature: chatConfig.temperature,
        timeout: chatConfig.timeout
      });

      const requestOptions = {
        timeout: Math.round(chatConfig.timeout || 300000),
        signal: this.abortController?.signal
      };

      this.streamedContent.value = '';
      let rawContent = '';

      try {
        if (completionOptions.stream) {
          const stream = await openai.chat.completions.create(completionOptions, requestOptions) as any;
          
          for await (const chunk of stream) {
            // Check if aborted
            if (this.abortController?.signal.aborted) {
              throw new Error('Operation aborted by user');
            }
            const delta = chunk.choices[0]?.delta?.content || '';
            rawContent += delta;
            
            // Clean CoT from display (handle both <think> and <thinking>)
            this.streamedContent.value = rawContent
              .replace(/<think>[\s\S]*?<\/think>/gi, '')
              .replace(/<think>[\s\S]*/gi, '') // Hide incomplete tag
              .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
              .replace(/<thinking>[\s\S]*/gi, '');
          }
        } else {
          let response = await openai.chat.completions.create({ ...completionOptions, stream: false }, requestOptions);
          
          // Fallback: If response is a string (e.g. from a proxy), try to parse it
          if (typeof response === 'string') {
             try {
                 response = JSON.parse(response);
             } catch (e) {
                 console.warn('[Game Loop] Failed to parse string response:', e);
             }
          }

          if (!response || !response.choices || response.choices.length === 0) {
             console.error('[Game Loop] Invalid OpenAI response:', response);
             throw new Error('OpenAI API returned no choices');
          }

          rawContent = response.choices[0]?.message?.content || '';
          this.streamedContent.value = rawContent
              .replace(/<think>[\s\S]*?<\/think>/gi, '')
              .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
        }
      } catch (error: any) {
        if (error.message === 'Operation aborted by user' || error.name === 'AbortError') {
          console.log('[Game Loop] Story generation aborted');
          return; // Exit early without committing
        }
        throw error; // Re-throw other errors
      }
      
      // Use rawContent for extraction to ensure we capture the thought even if it was hidden
      let finalStory = rawContent;
      
      // DEBUG: Log LLM1 Response
      console.log('【LLM1 Debug】Raw Response:', rawContent);

      // Extract and strip COT content
      let thoughtContent = '';
      // Match both <thinking> and <think>
      const thoughtMatch = finalStory.match(/<(thinking|think)>([\s\S]*?)<\/\1>/i);
      if (thoughtMatch) {
        thoughtContent = thoughtMatch[2]?.trim() || '';
        finalStory = finalStory.replace(/<(thinking|think)>[\s\S]*?<\/\1>/gi, '').trim();
        
        // Also update streamedContent for UI consistency (if we want to hide it immediately)
        this.streamedContent.value = finalStory; 
      }

      // Extract and strip Combat Trigger
      let combatTriggerData: any = null;
      const combatMatch = finalStory.match(/<combat_trigger>([\s\S]*?)<\/combat_trigger>/);
      if (combatMatch) {
        try {
          combatTriggerData = JSON.parse(combatMatch[1]?.trim() || '{}');
          finalStory = finalStory.replace(/<combat_trigger>[\s\S]*?<\/combat_trigger>/g, '').trim();
          this.streamedContent.value = finalStory; 
        } catch (e) {
          console.error('Failed to parse combat trigger:', e);
        }
      }

      // Extract and strip Quest Trigger
      let questTriggerData: any = null;
      const questMatch = finalStory.match(/<quest_trigger>([\s\S]*?)<\/quest_trigger>/);
      if (questMatch) {
        try {
          questTriggerData = JSON.parse(questMatch[1]?.trim() || '{}');
          finalStory = finalStory.replace(/<quest_trigger>[\s\S]*?<\/quest_trigger>/g, '').trim();
          this.streamedContent.value = finalStory;
        } catch (e) {
          console.error('Failed to parse quest trigger:', e);
        }
      }

      // Extract and strip Quest Update
      let questUpdateData: any = null;
      const questUpdateMatch = finalStory.match(/<quest_update>([\s\S]*?)<\/quest_update>/);
      if (questUpdateMatch) {
        try {
          questUpdateData = JSON.parse(questUpdateMatch[1]?.trim() || '{}');
          finalStory = finalStory.replace(/<quest_update>[\s\S]*?<\/quest_update>/g, '').trim();
          this.streamedContent.value = finalStory;
        } catch (e) {
          console.error('Failed to parse quest update:', e);
        }
      }

      // Extract and strip Prediction Trigger
      let predictionTriggerData: any = null;
      const predictionMatch = finalStory.match(/<prediction_trigger>([\s\S]*?)<\/prediction_trigger>/);
      if (predictionMatch) {
        try {
          predictionTriggerData = JSON.parse(predictionMatch[1]?.trim() || '{}');
          finalStory = finalStory.replace(/<prediction_trigger>[\s\S]*?<\/prediction_trigger>/g, '').trim();
          this.streamedContent.value = finalStory;
        } catch (e) {
          console.error('Failed to parse prediction trigger:', e);
        }
      }

      // Extract and strip Promise Trigger
      let promiseTriggerData: any = null;
      const promiseMatch = finalStory.match(/<promise_trigger>([\s\S]*?)<\/promise_trigger>/);
      if (promiseMatch) {
        try {
          promiseTriggerData = JSON.parse(promiseMatch[1]?.trim() || '{}');
          finalStory = finalStory.replace(/<promise_trigger>[\s\S]*?<\/promise_trigger>/g, '').trim();
          this.streamedContent.value = finalStory;
        } catch (e) {
          console.error('Failed to parse promise trigger:', e);
        }
      }

      // Extract and strip Promise Update
      let promiseUpdateData: any = null;
      const promiseUpdateMatch = finalStory.match(/<promise_update>([\s\S]*?)<\/promise_update>/);
      if (promiseUpdateMatch) {
        try {
          promiseUpdateData = JSON.parse(promiseUpdateMatch[1]?.trim() || '{}');
          finalStory = finalStory.replace(/<promise_update>[\s\S]*?<\/promise_update>/g, '').trim();
          this.streamedContent.value = finalStory;
        } catch (e) {
          console.error('Failed to parse promise update:', e);
        }
      }

      // Extract and strip Management Trigger
      let managementTriggerData: any = null;
      const managementMatch = finalStory.match(/<management_trigger>([\s\S]*?)<\/management_trigger>/);
      if (managementMatch) {
        try {
          managementTriggerData = JSON.parse(managementMatch[1]?.trim() || '{}');
          finalStory = finalStory.replace(/<management_trigger>[\s\S]*?<\/management_trigger>/g, '').trim();
          this.streamedContent.value = finalStory;
        } catch (e) {
          console.error('Failed to parse management trigger:', e);
        }
      }

      // 3. Immediately commit the story message to chat
      const chatStore = useChatStore();
      const toastStore = useToastStore();
      
      // A. Add User Message
      await chatStore.addMessage('user', userContent);
      
      // B. Add Assistant Message (without debug info for now)
      const assistantMsgId = await chatStore.addMessage('assistant', finalStory);
      
      // Play notification sound
      audioManager.playChime();
      
      // C. Update thought content if exists
      if (thoughtContent && assistantMsgId) {
         await chatStore.updateMessage(assistantMsgId, { thought_content: thoughtContent });
      }

      // D. Trigger Combat if needed
      if (combatTriggerData && combatTriggerData.trigger) {
        this.initializeCombat(combatTriggerData);
      }

      // Trigger Management if needed
      if (managementTriggerData && managementTriggerData.trigger) {
        this.initializeManagement(managementTriggerData);
      }

      // E. Trigger Quest if needed
      if (questTriggerData && questTriggerData.trigger && questTriggerData.quests && questTriggerData.quests.length > 0) {
        const gameStore = useGameStore();
        // Take the first quest as pending
        const quest = questTriggerData.quests[0];
        if (!quest.id) quest.id = uuidv4();
        // Ensure default status
        quest.status = 'active'; // Will be set to active upon acceptance, but for now just data
        // Actually, status should be decided upon acceptance. 
        // But the store expects a Quest object. Let's set it to 'active' conceptually, 
        // but it is just a proposal until accepted.
        
        gameStore.setPendingQuest(quest);
      }

      // F. Update Quest if needed
      if (questUpdateData && questUpdateData.update && questUpdateData.quest_name) {
         const gameStore = useGameStore();
         // Find quest by name since LLM doesn't know IDs
         // We check for active quests that match the name
         const quest = gameStore.state.system.quests?.find(q => q.name === questUpdateData.quest_name && q.status === 'active');
         
         if (quest) {
             gameStore.updateQuestStatus(quest.id, questUpdateData.status, questUpdateData.summary);
             
             // Toast notification
             const statusText = questUpdateData.status === 'completed' ? '完成' : '失败';
             const type = questUpdateData.status === 'completed' ? 'success' : 'error';
             toastStore.addToast(`任务${statusText}：${quest.name}`, type);
         } else {
             console.warn('[GameLoop] Quest update requested but quest not found or not active:', questUpdateData.quest_name);
         }
      }

      // G. Trigger Promise if needed
      if (promiseTriggerData && promiseTriggerData.trigger && promiseTriggerData.promises && promiseTriggerData.promises.length > 0) {
        const gameStore = useGameStore();
        
        for (const pData of promiseTriggerData.promises) {
           const newPromise: any = {
             id: uuidv4(),
             giver: pData.giver || 'Unknown',
             content: pData.content || 'No content',
             createdTime: `${gameStore.state.player.date} ${gameStore.state.player.time}`,
             status: 'active',
             acceptedTurn: gameStore.state.system.turn_count
           };
           
           gameStore.addPromise(newPromise);
           toastStore.addToast(`新约定：${newPromise.giver} - ${newPromise.content}`, 'info');
        }
      }

      // H. Update Promise if needed
      if (promiseUpdateData && promiseUpdateData.update && promiseUpdateData.content_keyword) {
        const gameStore = useGameStore();
        const promises = gameStore.state.system.promises || [];
        
        // Fuzzy match content
        const targetPromise = promises.find(p => p.status === 'active' && p.content.includes(promiseUpdateData.content_keyword));
        
        if (targetPromise) {
           gameStore.updatePromise(targetPromise.id, {
             status: promiseUpdateData.status,
             completedTurn: gameStore.state.system.turn_count,
             completedDate: gameStore.state.player.date,
             completedTime: gameStore.state.player.time
           });
           
           const statusText = promiseUpdateData.status === 'completed' ? '达成' : '失效';
           const type = promiseUpdateData.status === 'completed' ? 'success' : 'warning';
           toastStore.addToast(`约定${statusText}：${targetPromise.content}`, type);
        }
      }

      // I. Update Prediction
      if (predictionTriggerData && predictionTriggerData.trigger && Array.isArray(predictionTriggerData.next_round_characters)) {
          gameStore.state.system.predicted_next_round_chars = predictionTriggerData.next_round_characters;
          console.log('[GameLoop] Updated predicted characters:', predictionTriggerData.next_round_characters);
      } else {
          // Clear predictions if no trigger or invalid data
          // This ensures old predictions don't persist if not renewed
          if (gameStore.state.system.predicted_next_round_chars && gameStore.state.system.predicted_next_round_chars.length > 0) {
              console.log('[GameLoop] Clearing predicted characters (no new prediction)');
              gameStore.state.system.predicted_next_round_chars = [];
          }
      }

      // Reset UI processing state but mark background processing
      this.streamedContent.value = '';
      this.currentStage.value = 'background_processing';
      this.isProcessing.value = false; // Allow UI to be responsive
      this.isBackgroundProcessing.value = true; // But block new messages

      // 4. Background Processing: LLM #2 & LLM #3 (Non-blocking)
      // CRITICAL: Only proceed if we have a valid story and not aborted
      if (!this.abortController?.signal.aborted && finalStory.trim()) {
        this.processBackgroundTasks(userContent, finalStory, currentSaveSlotId, assistantMsgId, this.abortController?.signal);
      } else {
        console.log('[GameLoop] Skipping background processing: aborted or empty story.');
        this.currentStage.value = 'idle';
        this.isBackgroundProcessing.value = false;
        this.isProcessing.value = false;
      }
    } catch (e: any) {
      console.error('Game Loop Error:', e);
      
      // Don't treat abort as an error
      if (e.message === 'Operation aborted by user' || e.name === 'AbortError') {
        this.error.value = null;
        this.currentStage.value = 'idle';
        this.isProcessing.value = false;
        this.isBackgroundProcessing.value = false;
        this.abortController = null;
        return;
      }
      
      this.error.value = e.message || '未知错误';
      this.currentStage.value = 'idle';
      this.isProcessing.value = false;
      this.isBackgroundProcessing.value = false;
      this.abortController = null;
    }
  }

  private async processBackgroundTasks(
    userContent: string, 
    finalStory: string, 
    currentSaveSlotId: number,
    assistantMsgId?: number,
    signal?: AbortSignal
  ) {
    try {
      const gameStore = useGameStore();
      const toastStore = useToastStore();
      const chatStore = useChatStore(); // Ensure chatStore is available for the whole function scope
      
      // Capture Input for Debug
      const logicInputSnapshot = JSON.stringify({
         current_state: {
             player: logicService.sanitizePlayer(gameStore.state.player),
             scene_npcs: gameStore.state.system.current_scene_npcs.map((id: string) => gameStore.state.npcs[id] || { id, name: id })
         },
         user_action: userContent,
         story_narrative: finalStory // Use cleaned story
      }, null, 2);

      // LLM #2: Logic Calculation
      const logicResult = await logicService.processLogic(
        userContent, 
        finalStory, // Use cleaned story
        gameStore.state,
        signal
      );

      // Clear Minigame Result after it has been sent to logic model
      // This prevents the same combat result from being re-processed in subsequent turns
      if (gameStore.state.system.minigame_result || gameStore.state.system.minigame_triggered) {
        gameStore.updateState({
          system: {
            ...gameStore.state.system,
            minigame_result: '',
            minigame_triggered: false
          }
        });
      }
      
      // Store Quick Replies (regardless of whether we use them immediately)
      if (logicResult.quick_replies && Array.isArray(logicResult.quick_replies)) {
         gameStore.setQuickReplies(logicResult.quick_replies);
      } else {
         gameStore.clearQuickReplies();
      }

      // Apply Actions
      if (logicResult.actions && logicResult.actions.length > 0) {
         // Sort actions: Put SCENE actions at the end.
         // This ensures that if a character is implicitly added by an UPDATE_NPC action
         // but explicitly removed by a SCENE action in the same turn, the removal wins.
         const sortedActions = [...logicResult.actions].sort((a, b) => {
            if (a.type === 'SCENE' && b.type !== 'SCENE') return 1;
            if (a.type !== 'SCENE' && b.type === 'SCENE') return -1;
            return 0;
         });

         for (const action of sortedActions) {
            gameStore.applyAction(action);
         }
      }
      
      // Update the snapshot for the assistant message to reflect new state
      if (assistantMsgId) {
         // Get the message to find its snapshotId
         const chatStore = useChatStore();
         const msg = chatStore.messages.find(m => m.id === assistantMsgId);
         if (msg && msg.snapshotId) {
            // 重要：获取最新状态的深拷贝，确保不会引用旧对象
            const currentState = JSON.parse(JSON.stringify(gameStore.state));
            
            // Update snapshot with NEW game state
            await db.snapshots.update(msg.snapshotId, {
               gameState: JSON.stringify(currentState)
            });
         }
      }
      
      // Show Summary Toast
      if (logicResult.summary) {
        toastStore.addToast(logicResult.summary, 'info', 5000);
      }
      
      // Update the assistant message with debug info
      if (assistantMsgId) {
        await chatStore.updateMessage(assistantMsgId, { 
          debugLog: {
            logicInput: logicInputSnapshot,
            logicOutput: JSON.stringify(logicResult, null, 2),
            logicThinking: logicResult.thinking || 'No thinking process returned from Logic Model.'
          }
        });
      }

      // LLM #5: Drawing (Async)
      // Fire and forget - don't block background processing state for this
      const currentSceneCharacters = gameStore.state.system.current_scene_npcs.map((id: string) => gameStore.state.npcs[id] || { id, name: id });
      
      // Pass player reference image if exists
      const extraRefImages: string[] = [];
      if (gameStore.state.player.referenceImageUrl) {
        extraRefImages.push(gameStore.state.player.referenceImageUrl);
      }

      drawingService.process(
        finalStory,
        gameStore.state.player.location,
        currentSceneCharacters,
        extraRefImages
      ).then(async (result) => {
        if (result && assistantMsgId) {
           await chatStore.updateMessage(assistantMsgId, {
             illustrationUrl: result.url,
             illustrationPrompt: result.prompt
           });
        }
      }).catch(err => console.error('[GameLoop] Drawing failed:', err));
      
      // LLM #3: Memory Extraction (Async)
      // We don't block the UI commit for this, but we should handle errors
      memoryService.extractAndSave(
        currentSaveSlotId,
        gameStore.state.system.turn_count,
        { name: gameStore.state.player.name, input: userContent },
        finalStory,
        logicResult.actions,
        {
          date: gameStore.state.player.date,
          time: gameStore.state.player.time,
          location: gameStore.state.player.location,
          characters: gameStore.state.system.current_scene_npcs.map((id: string) => {
             const npc = gameStore.state.npcs[id];
             return npc ? npc.name : id;
          })
        },
        signal
      ).catch(err => console.error('Memory Extraction Failed:', err));

    } catch (error) {
      console.error('Background processing failed:', error);
      const toastStore = useToastStore();
      toastStore.addToast('后台处理失败，但对话已保存', 'warning', 5000);
    } finally {
      // Reset background processing state
      this.isBackgroundProcessing.value = false;
      this.currentStage.value = 'idle';
      this.abortController = null;
    }
  }

  private initializeManagement(_triggerData: any) {
    // Force disabled: even if trigger received, ignore it.
    console.warn('[GameLoop] Management system is temporarily disabled. Ignoring trigger.');
    return;
  }

  // Public method to abort current processing
  abort() {
    if ((this.isProcessing.value || this.isBackgroundProcessing.value) && this.abortController) {
      this.isAborting.value = true;
      this.abortController.abort();
      console.log('[Game Loop] Aborting current operation...');
    }
  }

  private startLoop() {
    this.isProcessing.value = true;
    this.isBackgroundProcessing.value = false;
    this.error.value = null;
    this.streamedContent.value = '';
    this.isAborting.value = false;
    this.abortController = new AbortController();
  }

  public async handleCombatCompletion(resultSummary: string, combatants: Combatant[] = []) {
    try {
      // Wait for any previous background processing to finish (e.g. Logic/Memory from the turn that triggered combat)
      // This prevents race conditions and ensures handleUserAction doesn't return early
      while (this.isBackgroundProcessing.value || this.isProcessing.value) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      this.currentStage.value = 'background_processing';
      this.isBackgroundProcessing.value = true; // Lock UI during narrative generation
      
      // 0. Retrieve Context (Last Assistant Message)
      const chatStore = useChatStore();
      const lastMsg = chatStore.messages.length > 0 ? chatStore.messages[chatStore.messages.length - 1] : null;
      const contextText = lastMsg ? lastMsg.content : '';

      // 1. Generate Narrative via Logic Model (Narrator Mode)
      // This is a separate API call as requested
      console.log('[GameLoop] Calling generateCombatNarrative...');
      let narrative = await logicService.generateCombatNarrative(resultSummary, combatants, contextText);
      
      // Secondary fallback check
      if (!narrative || narrative.trim() === '') {
        console.warn('[GameLoop] Received empty narrative from LogicService. Using emergency fallback.');
        narrative = `(系统提示：由于技术原因，战斗润色描写失败。以下是战斗原始信息)\n${resultSummary}`;
      }
      
      console.log('[GameLoop] Narrative received, final length:', narrative.length);
      
      // 2. Construct User Action for Story Model
      const content = `【战斗回放】\n${narrative}\n\n(请承接以上战斗结果，继续推进剧情)`;
      console.log('[GameLoop] Final content constructed for handleUserAction.');
      
      // 3. Proceed with standard User Action handling
      this.currentStage.value = 'idle'; // Reset stage before calling handleUserAction as it sets its own stages
      this.isBackgroundProcessing.value = false; // Unlock to allow handleUserAction to proceed
      await this.handleUserAction(content);
      
    } catch (error) {
      console.error('Combat Completion Error:', error);
      this.isBackgroundProcessing.value = false; // Ensure unlock on error
      // Fallback
      const content = `(系统提示：战斗结束。以下是结算信息)\n${resultSummary}\n(请根据结算结果继续描写接下来的剧情)`;
      await this.handleUserAction(content);
    }
  }

  private initializeCombat(triggerData: any) {
    const gameStore = useGameStore();
    const charStore = useCharacterStore();
    const player = gameStore.state.player;

    // Helper to create SpellCard from string (Legacy/Heuristic)
    const createSpellCard = (name: string): SpellCard => {
      // 0. Try to find in Preset Spellcards (Static Data from spellcards.ts)
      // Checks both ID (key) and Name
      const preset = PRESET_SPELLCARDS[name] || Object.values(PRESET_SPELLCARDS).find(p => p.name === name);
      if (preset) {
         return {
            name: preset.name!,
            description: preset.description || '暂无描述',
            cost: preset.cost || 0,
            damage: preset.damage || 0,
            scope: preset.scope || 'single',
            type: preset.type || 'attack',
            effects: preset.effects,
            isUltimate: preset.isUltimate || false,
            hitRate: preset.hitRate !== undefined ? preset.hitRate : (preset.isUltimate ? 1.0 : 0.1),
            buffDetails: preset.buffDetails
         };
      }

      // 1. Try to find in Lorebook (Static DB)
      const cardEntry = charStore.characters.find(c => 
        (c.type === 'spell_card') && 
        (c.name === name || c.name.includes(name))
      );

      if (cardEntry) {
         // Parse Lorebook data
         const costStr = cardEntry.cost || '100';
         const cost = parseInt(costStr.replace(/\D/g, '')) || 100;
         
         const dmgStr = cardEntry.damage || '0';
         const dmg = parseInt(dmgStr.replace(/\D/g, '')) || 0;
         
         // Simple Multiplier Logic based on dmg vs base
         // Assuming Base Attack is ~100.
         // (Multiplier logic removed for combat calculation, only used for heuristics if needed)

         const isAoe = (cardEntry.damageType || '').includes('全') || cardEntry.tags?.includes('AOE') || false;

         return {
            id: cardEntry.uuid,
            name: cardEntry.name,
            description: cardEntry.description || 'Lorebook Defined Spell Card',
            cost: cost,
            // targetType: 'enemy', // Removed: Not in SpellCard interface
            damage: dmg,
            scope: isAoe ? 'aoe' : 'single',
            type: cardEntry.type === 'spell_card' ? 'attack' : 'buff', // Basic inference
            isUltimate: false,
            hitRate: 0.1, // Default Hit Rate
            // Pass through any buffDetails if defined in lorebook
            buffDetails: cardEntry.buffDetails
         };
      }

      // 2. Fallback to Heuristic
      let multiplier = 2.0;
      let cost = 100;
      let isAoe = false;

      if (name.includes('奥义') || name.includes('神')) {
        multiplier = 3.5;
        cost = 300;
      } else if (name.includes('符') || name.includes('卡')) {
        multiplier = 2.5;
        cost = 150;
      }
      
      if (name.includes('阵') || name.includes('界') || name.includes('全')) {
        isAoe = true;
      }

      return {
        id: uuidv4(),
        name: name,
        description: '玩家持有的符卡技能',
        cost: cost,
        // targetType: 'enemy', // Removed: Not in SpellCard interface
        damage: 0,
        scope: isAoe ? 'aoe' : 'single',
        type: 'attack',
        isUltimate: multiplier >= 3.5, // Simple heuristic: high multiplier = ultimate
        hitRate: multiplier >= 3.5 ? 1.0 : 0.1 // Heuristic Hit Rate
      };
    };

    // Helper to find preset cards by ID prefix (Auto-load from spellcards.ts)
    const findPresetCards = (npcId: string, npcName?: string): SpellCard[] => {
        if (!npcId && !npcName) return [];
        
        let matches: [string, SpellCard][] = [];
        let method = 'none';

        // 1. Try Direct Match by ID Prefix (if ID is provided)
        if (npcId) {
            const prefix = npcId.toLowerCase() + '_';
            matches = Object.entries(PRESET_SPELLCARDS)
                .filter(([key]) => key.startsWith(prefix))
                .map(([key, val]) => [key, val] as [string, SpellCard]);
            if (matches.length > 0) method = 'id_prefix';
        }
        
        // 2. If no matches, try Name Mapping (Double Layer Matching)
        if (matches.length === 0 && npcName) {
            // Debug: Check map availability
            if (Object.keys(CHARACTER_NAME_TO_ID_MAP).length === 0) {
                console.warn('[Combat Init] CHARACTER_NAME_TO_ID_MAP is empty! Check characterMapping.ts export.');
            }

            // Check if npcName is in the map (or trimmed)
            let mappedId = CHARACTER_NAME_TO_ID_MAP[npcName] || CHARACTER_NAME_TO_ID_MAP[npcName.trim()];
            
            // 2.1 Fuzzy Search (Substring) - if exact match fails
            if (!mappedId) {
                const cleanName = npcName.trim();
                // Find any key that is part of the name OR name is part of key
                const foundKey = Object.keys(CHARACTER_NAME_TO_ID_MAP).find(k => 
                    cleanName.includes(k) || k.includes(cleanName)
                );
                
                if (foundKey) {
                    mappedId = CHARACTER_NAME_TO_ID_MAP[foundKey];
                    console.log(`[Combat Init] Fuzzy mapped '${npcName}' -> '${foundKey}' -> ID: ${mappedId}`);
                }
            }

            if (mappedId) {
                // Try finding cards with this mapped ID
                const mappedPrefix = mappedId.toLowerCase() + '_';
                const allKeys = Object.keys(PRESET_SPELLCARDS);
                
                matches = Object.entries(PRESET_SPELLCARDS)
                    .filter(([key]) => key.startsWith(mappedPrefix))
                    .map(([key, val]) => [key, val] as [string, SpellCard]);
                
                if (matches.length > 0) {
                    method = 'name_mapping';
                } else {
                    console.warn(`[Combat Init] ID '${mappedId}' found but no cards with prefix '${mappedPrefix}'. Sample keys: ${allKeys.slice(0, 5).join(', ')}`);
                    // Fallback: Try to find ANY key containing the ID
                     matches = Object.entries(PRESET_SPELLCARDS)
                        .filter(([key]) => key.includes(mappedId!.toLowerCase()))
                        .map(([key, val]) => [key, val] as [string, SpellCard]);
                     if (matches.length > 0) {
                         console.log(`[Combat Init] Fallback: Found ${matches.length} cards containing ID '${mappedId}'`);
                         method = 'fallback_id_search';
                     }
                }
            } else {
                console.log(`[Combat Init] No mapped ID found for '${npcName}'`);
            }
        }
        
        if (matches.length > 0) {
             console.log(`[Combat Init] Found ${matches.length} spell cards for ${npcName} (ID: ${npcId}) via ${method}`);
        } else {
             console.log(`[Combat Init] No spell cards found for ${npcName} (ID: ${npcId}). Tried mapping: ${CHARACTER_NAME_TO_ID_MAP[npcName || '']}`);
        }

        return matches.map(([_, val]) => ({
                name: val.name!,
                description: val.description || '暂无描述',
                cost: val.cost || 0,
                damage: val.damage || 0,
                scope: val.scope || 'single',
                type: val.type || 'attack',
                effects: val.effects,
                isUltimate: val.isUltimate || false,
                hitRate: val.hitRate !== undefined ? val.hitRate : (val.isUltimate ? 1.0 : 0.1),
                buffDetails: val.buffDetails
            } as SpellCard));
    };

    // 1. Create Player Combatant
    const playerCombatant: Combatant = {
      id: 'player',
      name: player.name,
      team: 'player',
      isPlayer: true,
      hp: player.hp,
      maxHp: player.max_hp,
      mp: player.mp,
      maxMp: player.max_mp,
      power: (player.power as PowerLevel) || 'D', // Default fallback
      spellCards: (player.spell_cards || []).map((card: any) => {
         if (typeof card === 'string') {
            return createSpellCard(card);
         } else {
            return card as SpellCard;
         }
      }),
      buffs: [],
      shield: 0,
      dodgeRate: 0.15,
      actionPoints: 2,
      maxActionPoints: 2,
      combatLevel: player.combatLevel || 1
    };

    // 1.5 Apply Initial Buffs from Trigger
    if (triggerData.player_buff_name) {
        const buffValue = typeof triggerData.player_buff_value === 'number' ? triggerData.player_buff_value : undefined;
        const buff = getBuffByName(triggerData.player_buff_name, 0, buffValue);
        if (buff) {
            console.log('[Combat Init] Applying Trigger Buff:', buff.name, buffValue ? `(Value: ${buffValue})` : '(Random Value)');
            playerCombatant.buffs.push(buff);
        }
    }

    // 2. Create Enemy Combatants
    const enemies: Combatant[] = (triggerData.enemies || []).map((e: any, index: number) => {
      // Strategy: Resolve Enemy to a GameStore NPC Entry
      // 1. Try Runtime Match (Name or ID)
      // 2. Try Static DB Match (Name or UUID) -> Then use UUID to find Runtime
      
      let matchedNPC: any = null;
      const enemyNameRaw = e.name || 'Unknown';
      const enemyNameLower = enemyNameRaw.toLowerCase().trim();
      const allRuntimeNpcs = Object.values(gameStore.state.npcs || {});

      // --- Attempt 1: Direct Runtime Match ---
      matchedNPC = allRuntimeNpcs.find((npc: any) => {
          if (e.id && npc.id === e.id) return true;
          if (npc.name && npc.name.toLowerCase().trim() === enemyNameLower) return true;
          if (npc.id && npc.id.toLowerCase() === enemyNameLower) return true; // Matches "Cirno" to id="cirno"
          return false;
      });

      // --- Attempt 2: Static DB Lookup (Fallback) ---
      if (!matchedNPC) {
          const resolvedId = resolveCharacterId(enemyNameLower, charStore.characters, gameStore.state.npcs);
          
          if (resolvedId && resolvedId !== enemyNameLower) {
              const runtimeRef = gameStore.state.npcs[resolvedId];
              if (runtimeRef) {
                  matchedNPC = runtimeRef;
              } else {
                  // Not in runtime yet? Use Static Data directly if possible
                  const staticChar = charStore.characters.find(c => c.uuid === resolvedId);
                  if (staticChar) {
                      matchedNPC = {
                          id: staticChar.uuid,
                          name: staticChar.name,
                          hp: staticChar.initialMaxHp || 1000,
                          max_hp: staticChar.initialMaxHp || 1000,
                          power: staticChar.initialPower || 'C',
                          combatLevel: 1 // Default
                      };
                  }
              }
          }
      }

      if (matchedNPC) {
          console.log('[Combat Init] Resolved Enemy:', enemyNameRaw, '->', matchedNPC.name, 'Power:', matchedNPC.power);
      } else {
          console.warn('[Combat Init] Could not resolve enemy:', enemyNameRaw);
      }

      // Determine Power Level: Store > Trigger > Default
      let powerLevel: PowerLevel = (e.power as PowerLevel) || (e.power_level as PowerLevel) || 'F';
      
      // Override with Matched Data if available
      if (matchedNPC && matchedNPC.power) {
          powerLevel = matchedNPC.power;
      }

      // Determine HP
      let hp = 1000;
      let maxHp = 1000;
      
      // If we have runtime HP, use it (allows persistent damage)
      if (matchedNPC && matchedNPC.hp) {
          hp = matchedNPC.hp;
          maxHp = matchedNPC.max_hp || matchedNPC.maxHp || matchedNPC.hp;
      } else {
         // Heuristic based on Power Level
         if (['EX', 'UX', 'OMEGA', '∞'].includes(powerLevel)) { maxHp = 50000; hp = 50000; }
         else if (['S', 'S+', 'SS', 'SSS', 'US'].includes(powerLevel)) { maxHp = 10000; hp = 10000; }
         else if (['A', 'A+', 'B+', 'B'].includes(powerLevel)) { maxHp = 5000; hp = 5000; }
         else { maxHp = 2000; hp = 2000; }
      }

      // Populate Spell Cards
      const enemySpellCards: SpellCard[] = [];
      
      // 1. Auto-load from spellcards.ts based on ID or Name
      const targetId = matchedNPC ? matchedNPC.id : '';
      const targetName = matchedNPC ? matchedNPC.name : enemyNameRaw;
      
      const presets = findPresetCards(targetId, targetName);
      enemySpellCards.push(...presets);
      
      // 2. Load from Runtime/Lorebook definition (if any specific overrides or additions)
      if (matchedNPC && matchedNPC.spell_cards) {
         const manualCards = matchedNPC.spell_cards.map((c: any) => {
             if (typeof c === 'string') {
                 return createSpellCard(c);
             }
             return c as SpellCard;
         });
         
         // Merge avoiding duplicates (by name)
         for (const card of manualCards) {
             if (!enemySpellCards.some(p => p.name === card.name)) {
                 enemySpellCards.push(card);
             }
         }
      }

      return {
        id: matchedNPC ? matchedNPC.id : `enemy_${index}_${uuidv4().slice(0, 8)}`,
        name: matchedNPC ? matchedNPC.name : enemyNameRaw,
        team: 'enemy',
        isPlayer: false,
    hp: hp,
    maxHp: maxHp,
    mp: 0, 
    maxMp: 0,
    power: powerLevel,
        spellCards: enemySpellCards,
        buffs: [],
        shield: 0,
        dodgeRate: 0.15
      };
    });

    // 2.5 Create Ally Combatants
    const allies: Combatant[] = (triggerData.allies || []).map((a: any, index: number) => {
      // Strategy: Resolve Ally to a GameStore NPC Entry (Reusing Enemy Logic)
      
      let matchedNPC: any = null;
      const allyNameRaw = a.name || 'Unknown Ally';
      const allyNameLower = allyNameRaw.toLowerCase().trim();

      // --- Attempt 1: Resolve Canonical ID using centralized service ---
      const resolvedId = resolveCharacterId(a.id || allyNameLower, charStore.characters, gameStore.state.npcs);
      
      // --- Attempt 2: Runtime Match ---
      matchedNPC = gameStore.state.npcs[resolvedId];

      // --- Attempt 3: Static DB Lookup (Fallback) ---
      if (!matchedNPC) {
          const staticChar = charStore.characters.find(c => c.uuid === resolvedId);

          if (staticChar) {
              const runtimeRef = gameStore.state.npcs[staticChar.uuid];
              if (runtimeRef) {
                  matchedNPC = runtimeRef;
              } else {
                  matchedNPC = {
                      id: staticChar.uuid,
                      name: staticChar.name,
                      power: staticChar.initialPower || 'F',
                      hp: staticChar.initialMaxHp || 1000,
                      max_hp: staticChar.initialMaxHp || 1000,
                      combatLevel: 1
                  };
                  console.log('[Combat Init] Created ephemeral Ally from Static DB:', matchedNPC.name);
              }
          }
      }

      // Determine Power Level
      let powerLevel: PowerLevel = (a.power as PowerLevel) || (a.power_level as PowerLevel) || 'F';
      if (matchedNPC && matchedNPC.power) {
          powerLevel = matchedNPC.power;
      }

      // Determine HP
      let hp = 1000;
      let maxHp = 1000;
      
      if (matchedNPC && matchedNPC.hp) {
          hp = matchedNPC.hp;
          maxHp = matchedNPC.max_hp || matchedNPC.maxHp || matchedNPC.hp;
      } else {
         if (['EX', 'UX', 'OMEGA', '∞'].includes(powerLevel)) { maxHp = 50000; hp = 50000; }
         else if (['S', 'S+', 'SS', 'SSS', 'US'].includes(powerLevel)) { maxHp = 10000; hp = 10000; }
         else if (['A', 'A+', 'B+', 'B'].includes(powerLevel)) { maxHp = 5000; hp = 5000; }
         else { maxHp = 2000; hp = 2000; }
      }

      // Populate Spell Cards
      const allySpellCards: SpellCard[] = [];
      
      // 1. Auto-load from spellcards.ts based on ID or Name
      const targetId = matchedNPC ? matchedNPC.id : '';
      const targetName = matchedNPC ? matchedNPC.name : allyNameRaw;
      
      const presets = findPresetCards(targetId, targetName);
      allySpellCards.push(...presets);

      // 2. Load from Runtime/Lorebook definition
      if (matchedNPC && matchedNPC.spell_cards) {
         const manualCards = matchedNPC.spell_cards.map((c: any) => {
             if (typeof c === 'string') {
                 return createSpellCard(c);
             }
             return c as SpellCard;
         });
         
         // Merge avoiding duplicates
         for (const card of manualCards) {
             if (!allySpellCards.some(p => p.name === card.name)) {
                 allySpellCards.push(card);
             }
         }
      }

      return {
        id: matchedNPC ? matchedNPC.id : `ally_${index}_${uuidv4().slice(0, 8)}`,
        name: matchedNPC ? matchedNPC.name : allyNameRaw,
        team: 'player', // Ally is on player team
        isPlayer: false,
        hp: hp,
        maxHp: maxHp,
        mp: 0, 
        maxMp: 0,
        power: powerLevel,
        spellCards: allySpellCards,
        buffs: [],
        shield: 0,
        dodgeRate: 0.15
      };
    });

    // 3. Initialize Combat State
    const combatState: CombatState = {
      isActive: false, // Wait for user confirmation
      isPending: true, // Show "Combat Request" dialog
      turn: 0,
      combatants: [playerCombatant, ...allies, ...enemies],
      logs: [],
      bgm_suggestion: triggerData.bgm_suggestion || '常规'
    };

    gameStore.setCombatState(combatState);
    
    console.log('[Game Loop] Combat Initialized (Pending User Confirmation)');
  }
}

export const gameLoop = new GameLoopService();

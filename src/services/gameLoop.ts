import { ref } from 'vue';
import OpenAI from 'openai';
import { dbService } from '@/services/DatabaseService';
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

import { multiplayerService } from '@/services/MultiplayerService';

export type GameLoopStage = 'idle' | 'preparing' | 'generating_story' | 'background_processing' | 'committing';

class GameLoopService {
  isProcessing = ref(false);
  currentStage = ref<GameLoopStage>('idle');
  error = ref<string | null>(null);
  isAborting = ref(false);
  isBackgroundProcessing = ref(false);

  // 流式内容缓冲
  streamedContent = ref('');
  
  // 用于取消操作的终止控制器
  private abortController: AbortController | null = null;

  async initializeNewGame() {
     const gameStore = useGameStore();
     const charStore = useCharacterStore();
     
     // 确保角色已加载
     await charStore.loadCharacters();
     
     // 1. 重置运行时状态
     gameStore.resetState();
     
     // 2. 遍历设定集中带有初始变量的"Character"（角色）类型条目
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
              initialData.hp = char.initialMaxHp; // 初始化时设为满血
              hasInitData = true;
           }
           if (char.initialResidence) {
              initialData.residence = char.initialResidence;
              hasInitData = true;
           }
           
           if (hasInitData) {
              // 写入游戏状态
              // 构造伪操作以复用逻辑或直接写入状态
              // 初始化时直接写入更安全/快捷
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
     
     console.log('[游戏循环] 新游戏已初始化。预填充 NPC 数量:', Object.keys(gameStore.state.npcs).length);
  }

  async handleUserAction(userContent: string) {
    const gameStore = useGameStore();
    const toastStore = useToastStore();

    // 方案 C: 阻止客机执行操作
    if (gameStore.multiplayer.isMultiplayer && !gameStore.multiplayer.isHost) {
      toastStore.addToast('客机模式下仅供观察，无法进行操作', 'warning');
      console.warn('[游戏循环] 操作被阻止：客机模式仅为只读');
      return;
    }

    if (this.isProcessing.value || this.isBackgroundProcessing.value) {
      console.warn('[游戏循环] handleUserAction 被忽略，因为正在处理中:', {
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
      // 0. 更新回合 & 检索记忆
      const gameStore = useGameStore();
      gameStore.incrementTurn();

      // 如果用户选择输入而不是点击，则清除待处理的触发器
      // 这可以防止“进入决斗”或“任务提供”按钮在回合之间持续存在
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
      
      // 方案 B: 多人输入聚合（房主端）
      let finalUserContent = userContent;
      
      if (gameStore.multiplayer.isMultiplayer && gameStore.multiplayer.isHost) {
          const guestInputs = multiplayerService.getPendingGuestInputs();
          const guestKeys = Object.keys(guestInputs);
          
          if (guestKeys.length > 0) {
              const hostName = gameStore.state.player.name || 'Host';
              let aggregatedContent = `[${hostName} (Host)]: ${userContent}\n`;
              
              for (const key of guestKeys) {
                  const companion = gameStore.state.multiplayer_companions?.[key];
                  const name = companion?.name || `Guest(${key.substring(0,4)})`;
                  aggregatedContent += `[${name}]: ${guestInputs[key]}\n`;
              }
              
              finalUserContent = aggregatedContent;
              console.log('[GameLoop] Aggregated Multiplayer Input:\n', finalUserContent);
              
              // 获取后清除待处理的多人输入
              multiplayerService.clearPendingGuestInputs();
          }
      }

      const retrievedMemories = await memoryService.retrieve(currentSaveSlotId, finalUserContent, gameStore.state.system.turn_count);

      // 1. 准备上下文
      this.currentStage.value = 'preparing';
      const promptContext = await promptService.build(finalUserContent, retrievedMemories);
      
      // DEBUG: 打印上下文组成
      console.log('[Prompt Debug] Context Composition:', promptContext.sections.map(s => `${s.id}: ${s.tokenCount} tokens`).join(', '));
      console.log('[Prompt Debug] Total Tokens:', promptContext.totalTokens);

      const messages = promptService.toOpenAIMessages(promptContext);
      
      // DEBUG: 打印 LLM1 提示词
      console.log('【LLM1 Debug】Prompt Messages:', JSON.parse(JSON.stringify(messages)));

      // 2. LLM #1: 故事生成（流式）
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
        stream: chatConfig.stream !== false, // 默认为 true - 但现在被正确保存
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

      // 房主端: 向客机广播开始生成
      if (gameStore.multiplayer.isMultiplayer && gameStore.multiplayer.isHost) {
        multiplayerService.send('STORY_GENERATING', { stage: 'generating_story' });
      }

      try {
        if (completionOptions.stream) {
          const stream = await openai.chat.completions.create(completionOptions, requestOptions) as any;
          
          for await (const chunk of stream) {
            // 检查是否已中止
            if (this.abortController?.signal.aborted) {
              throw new Error('Operation aborted by user');
            }
            const delta = chunk.choices[0]?.delta?.content || '';
            rawContent += delta;

            // 房主端: 向客机广播 token
            if (gameStore.multiplayer.isMultiplayer && gameStore.multiplayer.isHost && delta) {
              multiplayerService.sendLLMToken(delta);
            }
            
            // 从显示中清理 CoT（处理 <think> 和 <thinking>）
            this.streamedContent.value = rawContent
              .replace(/<think>[\s\S]*?<\/think>/gi, '')
              .replace(/<think>[\s\S]*/gi, '') // 隐藏不完整的标签
              .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
              .replace(/<thinking>[\s\S]*/gi, '');
          }
        } else {
          let response = await openai.chat.completions.create({ ...completionOptions, stream: false }, requestOptions);
          
          // 后备: 如果响应是字符串（如来自代理），则尝试解析
          if (typeof response === 'string') {
             try {
                 response = JSON.parse(response);
             } catch (e) {
                 console.warn('[游戏循环] 无法解析字符串响应:', e);
             }
          }

          if (!response || !response.choices || response.choices.length === 0) {
             console.error('[游戏循环] 无效的 OpenAI 响应:', response);
             throw new Error('OpenAI API 未返回任何选项 (choices)');
          }

          rawContent = response.choices[0]?.message?.content || '';

          // 房主端: 如果未使用流式传输，则向客机广播完整内容
          if (gameStore.multiplayer.isMultiplayer && gameStore.multiplayer.isHost && rawContent) {
            multiplayerService.sendLLMToken(rawContent);
          }

          this.streamedContent.value = rawContent
              .replace(/<think>[\s\S]*?<\/think>/gi, '')
              .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
        }
      } catch (error: any) {
        if (error.message === 'Operation aborted by user' || error.name === 'AbortError') {
          console.log('[游戏循环] 剧情生成已中止');
          return; // 提前退出而不提交
        }
        throw error; // 重新抛出其他错误
      }
      
      // 使用 rawContent 进行提取，确保即使被隐藏也能捕获内部思考
      let finalStory = rawContent;
      
      // DEBUG: 打印 LLM1 响应
      console.log('【LLM1 调试】原始响应:', rawContent);

      // 提取并剥离 COT 内容
      let thoughtContent = '';
      // 同时匹配 <thinking> 和 <think>
      const thoughtMatch = finalStory.match(/<(thinking|think)>([\s\S]*?)<\/\1>/i);
      if (thoughtMatch) {
        thoughtContent = thoughtMatch[2]?.trim() || '';
        finalStory = finalStory.replace(/<(thinking|think)>[\s\S]*?<\/\1>/gi, '').trim();
        
        // 同步更新 streamedContent 以保证 UI 一致性（如果要立即隐藏）
        this.streamedContent.value = finalStory; 
      }

      // 提取并剥离战斗触发器（Combat Trigger）
      let combatTriggerData: any = null;
      const combatMatch = finalStory.match(/<combat_trigger>([\s\S]*?)<\/combat_trigger>/);
      if (combatMatch) {
        try {
          const jsonStr = combatMatch[1]?.trim();
          if (jsonStr) {
              combatTriggerData = JSON.parse(jsonStr);
          } else {
              combatTriggerData = {};
          }
          finalStory = finalStory.replace(/<combat_trigger>[\s\S]*?<\/combat_trigger>/g, '').trim();
          this.streamedContent.value = finalStory; 
        } catch (e) {
          console.warn('Failed to parse combat trigger, ignoring:', e);
        }
      }

      // 提取并剥离任务触发器（Quest Trigger）
      let questTriggerData: any = null;
      const questMatch = finalStory.match(/<quest_trigger>([\s\S]*?)<\/quest_trigger>/);
      if (questMatch) {
        try {
          const jsonStr = questMatch[1]?.trim();
          if (jsonStr) {
              questTriggerData = JSON.parse(jsonStr);
          } else {
              questTriggerData = {};
          }
          finalStory = finalStory.replace(/<quest_trigger>[\s\S]*?<\/quest_trigger>/g, '').trim();
          this.streamedContent.value = finalStory;
        } catch (e) {
          console.warn('Failed to parse quest trigger, ignoring:', e);
        }
      }

      // 提取并剥离任务更新（Quest Update）
      let questUpdateData: any = null;
      const questUpdateMatch = finalStory.match(/<quest_update>([\s\S]*?)<\/quest_update>/);
      if (questUpdateMatch) {
        try {
          const jsonStr = questUpdateMatch[1]?.trim();
          if (jsonStr) {
              questUpdateData = JSON.parse(jsonStr);
          } else {
              questUpdateData = {};
          }
          finalStory = finalStory.replace(/<quest_update>[\s\S]*?<\/quest_update>/g, '').trim();
          this.streamedContent.value = finalStory;
        } catch (e) {
          console.warn('Failed to parse quest update, ignoring:', e);
        }
      }

      // 提取并剥离预测触发器（Prediction Trigger）
      let predictionTriggerData: any = null;
      const predictionMatch = finalStory.match(/<prediction_trigger>([\s\S]*?)<\/prediction_trigger>/);
      if (predictionMatch) {
        try {
          const jsonStr = predictionMatch[1]?.trim();
          if (jsonStr) {
              predictionTriggerData = JSON.parse(jsonStr);
          } else {
              predictionTriggerData = {};
          }
          finalStory = finalStory.replace(/<prediction_trigger>[\s\S]*?<\/prediction_trigger>/g, '').trim();
          this.streamedContent.value = finalStory;
        } catch (e) {
          console.warn('Failed to parse prediction trigger, ignoring:', e);
        }
      }

      // 提取并剥离约定触发器（Promise Trigger）
      let promiseTriggerData: any = null;
      const promiseMatch = finalStory.match(/<promise_trigger>([\s\S]*?)<\/promise_trigger>/);
      if (promiseMatch) {
        try {
          const jsonStr = promiseMatch[1]?.trim();
          if (jsonStr) {
              promiseTriggerData = JSON.parse(jsonStr);
          } else {
              promiseTriggerData = {};
          }
          finalStory = finalStory.replace(/<promise_trigger>[\s\S]*?<\/promise_trigger>/g, '').trim();
          this.streamedContent.value = finalStory;
        } catch (e) {
          console.warn('解析约定的触发器失败, 已忽略:', e);
        }
      }

      // 提取并剥离约定更新（Promise Update）
      let promiseUpdateData: any = null;
      const promiseUpdateMatch = finalStory.match(/<promise_update>([\s\S]*?)<\/promise_update>/);
      if (promiseUpdateMatch) {
        try {
          const jsonStr = promiseUpdateMatch[1]?.trim();
          if (jsonStr) {
              promiseUpdateData = JSON.parse(jsonStr);
          } else {
              promiseUpdateData = {};
          }
          finalStory = finalStory.replace(/<promise_update>[\s\S]*?<\/promise_update>/g, '').trim();
          this.streamedContent.value = finalStory;
        } catch (e) {
          console.warn('解析约定的更新失败, 已忽略:', e);
        }
      }

      // 提取并剥离经营触发器（Management Trigger）
      let managementTriggerData: any = null;
      const managementMatch = finalStory.match(/<management_trigger>([\s\S]*?)<\/management_trigger>/);
      if (managementMatch) {
        try {
          const jsonStr = managementMatch[1]?.trim();
          if (jsonStr) {
              managementTriggerData = JSON.parse(jsonStr);
          } else {
              managementTriggerData = {};
          }
          finalStory = finalStory.replace(/<management_trigger>[\s\S]*?<\/management_trigger>/g, '').trim();
          this.streamedContent.value = finalStory;
        } catch (e) {
          console.warn('解析经营触发器失败, 已忽略:', e);
        }
      }

      // 房主端：向客机广播故事已完成
      if (gameStore.multiplayer.isMultiplayer && gameStore.multiplayer.isHost) {
        multiplayerService.send('STORY_FINISHED', {});
      }

      // 3. 立即将故事消息提交到聊天中
      const chatStore = useChatStore();
      const toastStore = useToastStore();
      
      // A. 添加用户消息
      await chatStore.addMessage('user', finalUserContent);

      // 房主端：向客机广播用户消息
      if (gameStore.multiplayer.isMultiplayer && gameStore.multiplayer.isHost) {
        multiplayerService.send('SYNC_CHAT_MESSAGE', {
          role: 'user',
          content: finalUserContent,
          timestamp: Date.now(),
          turnCount: gameStore.state.system.turn_count
        });
      }
      
      // B. 添加助手消息（目前暂不包含调试信息）
      const assistantMsgId = await chatStore.addMessage('assistant', finalStory);

      // 房主端：广播最终提交的消息内容，以确保客机的本地聊天记录同步
      // （客机可能在流式传输期间遗漏了某些 token，或者清理结果略有不同）
      if (gameStore.multiplayer.isMultiplayer && gameStore.multiplayer.isHost) {
        multiplayerService.send('SYNC_CHAT_MESSAGE', {
          role: 'assistant',
          content: finalStory,
          timestamp: Date.now(),
          turnCount: gameStore.state.system.turn_count
        });

        // 房主端在发送广播后，也重置本地所有玩家的就绪状态和草稿
        gameStore.multiplayer.players.forEach(p => {
          p.status = 'idle';
          p.draftContent = '';
        });
        // 房主端也发送重置事件给自己的 UI
        window.dispatchEvent(new CustomEvent('mp-reset-draft'));
      }
      
      // 播放通知音效
      audioManager.playChime();
      
      // C. 如果存在，更新思考内容
      if (thoughtContent && assistantMsgId) {
         await chatStore.updateMessage(assistantMsgId, { thought_content: thoughtContent });
      }

      // D. 取决于是否需要，触发战斗
      if (combatTriggerData && combatTriggerData.trigger) {
        this.initializeCombat(combatTriggerData);
      }

      // 取决于是否需要，触发经营
      if (managementTriggerData && managementTriggerData.trigger) {
        this.initializeManagement(managementTriggerData);
      }

      // E. 取决于是否需要，触发任务
      if (questTriggerData && questTriggerData.trigger && questTriggerData.quests && questTriggerData.quests.length > 0) {
        const gameStore = useGameStore();
        // 将第一个任务设为待处理
        const quest = questTriggerData.quests[0];
        if (!quest.id) quest.id = uuidv4();
        // 确保默认状态
        quest.status = 'active'; // 接受后将设置为 active，但目前只是数据
        // 实际上，状态应在接受时决定。
        // 但是 store 需要一个 Quest 对象。让我们在概念上将其设置为 'active'，
        // 但在被接受之前，它只是一个提议。
        
        gameStore.setPendingQuest(quest);
      }

      // F. 取决于是否需要，更新任务
      if (questUpdateData && (questUpdateData.update || questUpdateData.status || questUpdateData.log) && questUpdateData.quest_name) {
         const gameStore = useGameStore();
         // 通过名称查找任务，因为 LLM 不知道 ID
         // 我们检查名称匹配并且是 active（进行中）的任务
         const quest = gameStore.state.system.quests?.find(q => q.name === questUpdateData.quest_name && q.status === 'active');
         
         if (quest) {
             gameStore.updateQuestStatus(quest.id, {
                status: questUpdateData.status,
                summary: questUpdateData.summary,
                log: questUpdateData.log
             });
             
             // Toast 提示通知
             if (questUpdateData.status === 'completed' || questUpdateData.status === 'failed') {
                const statusText = questUpdateData.status === 'completed' ? '完成' : '失败';
                const type = questUpdateData.status === 'completed' ? 'success' : 'error';
                toastStore.addToast(`任务${statusText}：${quest.name}`, type);
             } else if (questUpdateData.log) {
                // 记录更新的 Toast 提示
                toastStore.addToast(`任务进度更新：${quest.name}`, 'info');
             }
         } else {
             console.warn('[GameLoop] Quest update requested but quest not found or not active:', questUpdateData.quest_name);
         }
      }

      // G. 取决于是否需要，触发约定
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

      // H. 取决于是否需要，更新约定
      if (promiseUpdateData && promiseUpdateData.update && promiseUpdateData.content_keyword) {
        const gameStore = useGameStore();
        const promises = gameStore.state.system.promises || [];
        
        // 模糊匹配内容
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

      // I. 更新预测
      if (predictionTriggerData && predictionTriggerData.trigger && Array.isArray(predictionTriggerData.next_round_characters)) {
          gameStore.state.system.predicted_next_round_chars = predictionTriggerData.next_round_characters;
          console.log('[GameLoop] Updated predicted characters:', predictionTriggerData.next_round_characters);
      } else {
          // 如果没有触发器或数据无效，则清除预测
          // 这可以确保旧的预测如果不更新就不会续存
          if (gameStore.state.system.predicted_next_round_chars && gameStore.state.system.predicted_next_round_chars.length > 0) {
              console.log('[GameLoop] Clearing predicted characters (no new prediction)');
              gameStore.state.system.predicted_next_round_chars = [];
          }
      }

      // 重置 UI 处理状态，但标记正在进行后台处理
      this.streamedContent.value = '';
      this.currentStage.value = 'background_processing';
      this.isProcessing.value = false; // 允许 UI 保持响应
      this.isBackgroundProcessing.value = true; // 但会阻止新消息的产生

      // 4. 后台处理：LLM #2 & LLM #3（非阻塞）
      // 关键提示：仅在我们有有效故事且未被中止时才继续
      if (!this.abortController?.signal.aborted && finalStory.trim()) {
        this.processBackgroundTasks(finalUserContent, finalStory, currentSaveSlotId, assistantMsgId, this.abortController?.signal);
      } else {
        console.log('[GameLoop] Skipping background processing: aborted or empty story.');
        this.currentStage.value = 'idle';
        this.isBackgroundProcessing.value = false;
        this.isProcessing.value = false;
      }
    } catch (e: any) {
      console.error('Game Loop Error:', e);
      
      // 不要将中止（abort）作为错误处理
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
      const chatStore = useChatStore(); // 确保在整个函数作用域内可以使用 chatStore
      
      // 捕获输入以进行调试
      const logicInputSnapshot = JSON.stringify({
         current_state: {
             player: logicService.sanitizePlayer(gameStore.state.player),
             scene_npcs: gameStore.state.system.current_scene_npcs.map((id: string) => gameStore.state.npcs[id] || { id, name: id })
         },
         user_action: userContent,
         story_narrative: finalStory // 使用清理后的故事
      }, null, 2);

      // LLM #2: 逻辑计算
      const logicResult = await logicService.processLogic(
        userContent, 
        finalStory, // Use cleaned story
        gameStore.state,
        signal
      );

      // 在发送给逻辑模型后清除小游戏结果
      // 这可防止在后续回合中重复处理相同的战斗结果
      if (gameStore.state.system.minigame_result || gameStore.state.system.minigame_triggered) {
        gameStore.updateState({
          system: {
            ...gameStore.state.system,
            minigame_result: '',
            minigame_triggered: false
          }
        });
      }
      
      // 存储快捷回复（不管我们是否立即使用它们）
      if (logicResult.quick_replies && Array.isArray(logicResult.quick_replies)) {
         gameStore.setQuickReplies(logicResult.quick_replies);
      } else {
         gameStore.clearQuickReplies();
      }

      // 应用操作
      if (logicResult.actions && logicResult.actions.length > 0) {
         // 对操作进行排序：将 SCENE 操作放在最后。
         // 这样可以确保如果一个角色在同一回合被 UPDATE_NPC 动作隐式添加，
         // 但被 SCENE 动作显式移除，则以移除为准。
         const sortedActions = [...logicResult.actions].sort((a, b) => {
            if (a.type === 'SCENE' && b.type !== 'SCENE') return 1;
            if (a.type !== 'SCENE' && b.type === 'SCENE') return -1;
            return 0;
         });

         for (const action of sortedActions) {
            gameStore.applyAction(action);
         }
      }
      
      // 更新助手消息的快照以反映新状态
      if (assistantMsgId) {
         // 获取消息以找到其快照 ID (snapshotId)
         const chatStore = useChatStore();
         const msg = chatStore.messages.find(m => m.id === assistantMsgId);
         if (msg && msg.snapshotId) {
            // 重要：获取最新状态的深拷贝，确保不会引用旧对象
            const currentState = JSON.parse(JSON.stringify(gameStore.state));
            
            // 使用新游戏状态更新快照
            await dbService.updateSnapshot(msg.snapshotId, {
               gameState: JSON.stringify(currentState)
            });
         }
      }
      
      // 显示摘要 Toast
      if (logicResult.summary) {
        toastStore.addToast(logicResult.summary, 'info', 5000);
      }
      
      // 使用调试信息更新助手消息
      if (assistantMsgId) {
        await chatStore.updateMessage(assistantMsgId, { 
          debugLog: {
            logicInput: logicInputSnapshot,
            logicOutput: JSON.stringify(logicResult, null, 2),
            logicThinking: logicResult.thinking || 'No thinking process returned from Logic Model.'
          }
        });
      }

      // LLM #5: 绘图提取（异步）
      // 即发即弃 - 不要为此阻塞后台处理状态
      const currentSceneCharacters = gameStore.state.system.current_scene_npcs.map((id: string) => gameStore.state.npcs[id] || { id, name: id });
      
      // 如果存在玩家参考图像，则传递对应参数
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
      
      // LLM #3: 记忆提取（异步）
      // 我们不为此阻塞 UI 提交，但应该处理相应的错误
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

      // 方案 C: 同步房主状态至中继服务器
      if (gameStore.multiplayer.isMultiplayer && gameStore.multiplayer.isHost) {
        multiplayerService.syncHostState(gameStore.state).catch(err => {
          console.error('[GameLoop] Multiplayer Sync Failed:', err);
        });
      }

    } catch (error) {
      console.error('Background processing failed:', error);
      const toastStore = useToastStore();
      toastStore.addToast('后台处理失败，但对话已保存', 'warning', 5000);
    } finally {
      // 重置后台处理状态
      this.isBackgroundProcessing.value = false;
      this.currentStage.value = 'idle';
      this.abortController = null;
    }
  }

  private initializeManagement(_triggerData: any) {
    // 强制禁用：即使收到触发器操作，也直接忽略。
    console.warn('[GameLoop] Management system is temporarily disabled. Ignoring trigger.');
    return;
  }

  // 中止当前处理过程的公共方法
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
      // 等待之前的任何后台处理完成（例如，触发战斗那一回合的逻辑/记忆处理）
      // 这可以防止竞态条件，并确保 handleUserAction 不会过早返回
      while (this.isBackgroundProcessing.value || this.isProcessing.value) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      this.currentStage.value = 'background_processing';
      this.isBackgroundProcessing.value = true; // 生成叙事时锁定 UI
      
      // 0. 检索上下文（最后一条助手消息）
      const chatStore = useChatStore();
      const lastMsg = chatStore.messages.length > 0 ? chatStore.messages[chatStore.messages.length - 1] : null;
      const contextText = lastMsg ? lastMsg.content : '';

      // 1. 通过逻辑模型生成叙事（旁白模式）
      // 根据要求，这是一个单独的 API 调用
      console.log('[GameLoop] Calling generateCombatNarrative...');
      let narrative = await logicService.generateCombatNarrative(resultSummary, combatants, contextText);
      
      // 次要后备检查
      if (!narrative || narrative.trim() === '') {
        console.warn('[GameLoop] Received empty narrative from LogicService. Using emergency fallback.');
        narrative = `(系统提示：由于技术原因，战斗润色描写失败。以下是战斗原始信息)\n${resultSummary}`;
      }
      
      console.log('[GameLoop] Narrative received, final length:', narrative.length);
      
      // 2. 为故事模型构造用户操作
      const content = `【战斗回放】\n${narrative}\n\n(请承接以上战斗结果，继续推进剧情)`;
      console.log('[GameLoop] Final content constructed for handleUserAction.');
      
      // 3. 继续进行标准的用户操作处理
      this.currentStage.value = 'idle'; // 在调用 handleUserAction 之前重置阶段，因为它会设置自己的阶段状态
      this.isBackgroundProcessing.value = false; // 解锁以允许 handleUserAction 继续运行
      await this.handleUserAction(content);
      
    } catch (error) {
      console.error('Combat Completion Error:', error);
      this.isBackgroundProcessing.value = false; // 出错时确保解锁 UI
      // 后备方案
      const content = `(系统提示：战斗结束。以下是结算信息)\n${resultSummary}\n(请根据结算结果继续描写接下来的剧情)`;
      await this.handleUserAction(content);
    }
  }

  private initializeCombat(triggerData: any) {
    const gameStore = useGameStore();
    const charStore = useCharacterStore();
    const player = gameStore.state.player;

    // 从字符串创建符卡的辅助函数（旧版/启发式）
    const createSpellCard = (name: string): SpellCard => {
      // 0. 尝试在预设符卡中查找（来自 spellcards.ts 的静态数据）
      // 同时检查 ID (key) 和 名称 (Name)
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

      // 1. 尝试在设定集（静态数据库）中查找
      const cardEntry = charStore.characters.find(c => 
        (c.type === 'spell_card') && 
        (c.name === name || c.name.includes(name))
      );

      if (cardEntry) {
         // 解析设定集数据（数值现在直接存储在数据库中）
         const cost = typeof cardEntry.cost === 'number' ? cardEntry.cost : (parseInt(String(cardEntry.cost || '100').replace(/\D/g, '')) || 100);
         const dmg = typeof cardEntry.damage === 'number' ? cardEntry.damage : (parseInt(String(cardEntry.damage || '0').replace(/\D/g, '')) || 0);
         
         return {
            name: cardEntry.name,
            description: cardEntry.description || '暂无描述',
            cost: cost,
            damage: dmg,
            scope: (cardEntry.scope as any) || 'single',
            type: (cardEntry.damageType as any) || 'attack',
            isUltimate: !!cardEntry.isUltimate,
            hitRate: cardEntry.hitRate !== undefined ? cardEntry.hitRate : (cardEntry.isUltimate ? 1.0 : 0.1),
            buffDetails: cardEntry.buffDetails
         };
      }

      // 2. 后退使用启发式方法
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
        isUltimate: multiplier >= 3.5, // 简单的启发式算法：高倍率 = 终极技
        hitRate: multiplier >= 3.5 ? 1.0 : 0.1 // 启发式命中率
      };
    };

    // 根据 ID 前缀查找预设符卡的辅助函数（自动从 spellcards.ts 加载）
    const findPresetCards = (npcId: string, npcName?: string): SpellCard[] => {
        if (!npcId && !npcName) return [];
        
        let matches: [string, SpellCard][] = [];
        let method = 'none';

        // 1. 根据 ID 前缀尝试直接匹配（如果提供了 ID）
        if (npcId) {
            const prefix = npcId.toLowerCase() + '_';
            matches = Object.entries(PRESET_SPELLCARDS)
                .filter(([key]) => key.startsWith(prefix))
                .map(([key, val]) => [key, val] as [string, SpellCard]);
            if (matches.length > 0) method = 'id_prefix';
        }
        
        // 2. 如果没有匹配项，尝试使用名称映射（双层匹配）
        if (matches.length === 0 && npcName) {
            // 调试：检查映射表是否可用
            if (Object.keys(CHARACTER_NAME_TO_ID_MAP).length === 0) {
                console.warn('[Combat Init] CHARACTER_NAME_TO_ID_MAP is empty! Check characterMapping.ts export.');
            }

            // 检查 npcName 是否在映射表中（或者去除了空格的名称）
            let mappedId = CHARACTER_NAME_TO_ID_MAP[npcName] || CHARACTER_NAME_TO_ID_MAP[npcName.trim()];
            
            // 2.1 模糊搜索（子字符串）- 如果精确匹配失败
            if (!mappedId) {
                const cleanName = npcName.trim();
                // 查找属于名称一部分的任意键，或者名称包含键
                const foundKey = Object.keys(CHARACTER_NAME_TO_ID_MAP).find(k => 
                    cleanName.includes(k) || k.includes(cleanName)
                );
                
                if (foundKey) {
                    mappedId = CHARACTER_NAME_TO_ID_MAP[foundKey];
                    console.log(`[Combat Init] Fuzzy mapped '${npcName}' -> '${foundKey}' -> ID: ${mappedId}`);
                }
            }

            if (mappedId) {
                // 尝试查找使用此映射 ID 的符卡
                const mappedPrefix = mappedId.toLowerCase() + '_';
                const allKeys = Object.keys(PRESET_SPELLCARDS);
                
                matches = Object.entries(PRESET_SPELLCARDS)
                    .filter(([key]) => key.startsWith(mappedPrefix))
                    .map(([key, val]) => [key, val] as [string, SpellCard]);
                
                if (matches.length > 0) {
                    method = 'name_mapping';
                } else {
                    console.warn(`[Combat Init] ID '${mappedId}' found but no cards with prefix '${mappedPrefix}'. Sample keys: ${allKeys.slice(0, 5).join(', ')}`);
                    // 后退方案：尝试查找包含该 ID 的任何键
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

    // 1. 创建玩家战斗者
    const playerCombatant: Combatant = {
      id: 'player',
      name: player.name,
      team: 'player',
      isPlayer: true,
      hp: player.hp,
      maxHp: player.max_hp,
      mp: player.mp,
      maxMp: player.max_mp,
      power: (player.power as PowerLevel) || 'D', // 默认回退值
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

    // 1.5 应用触发器的初始 Buff
    if (triggerData.player_buff_name) {
        const buffValue = typeof triggerData.player_buff_value === 'number' ? triggerData.player_buff_value : undefined;
        const buff = getBuffByName(triggerData.player_buff_name, 0, buffValue);
        if (buff) {
            console.log('[Combat Init] Applying Trigger Buff:', buff.name, buffValue ? `(Value: ${buffValue})` : '(Random Value)');
            playerCombatant.buffs.push(buff);
        }
    }

    // 2. 创建敌人战斗者
    const enemies: Combatant[] = (triggerData.enemies || []).map((e: any, index: number) => {
      // 策略：将敌人解析为 GameStore NPC 条目
      // 1. 尝试运行时匹配（名称或 ID）
      // 2. 尝试静态数据库匹配（名称或 UUID） -> 然后使用 UUID 查找运行时数据
      
      let matchedNPC: any = null;
      const enemyNameRaw = e.name || 'Unknown';
      const enemyNameLower = enemyNameRaw.toLowerCase().trim();
      const allRuntimeNpcs = Object.values(gameStore.state.npcs || {});

      // --- 尝试 1：直接运行时匹配 ---
      matchedNPC = allRuntimeNpcs.find((npc: any) => {
          if (e.id && npc.id === e.id) return true;
          if (npc.name && npc.name.toLowerCase().trim() === enemyNameLower) return true;
          if (npc.id && npc.id.toLowerCase() === enemyNameLower) return true; // Matches "Cirno" to id="cirno"
          return false;
      });

      // --- 尝试 2：静态数据库查找（后备方案） ---
      if (!matchedNPC) {
          const resolvedId = resolveCharacterId(enemyNameLower, charStore.characters, gameStore.state.npcs);
          
          if (resolvedId && resolvedId !== enemyNameLower) {
              const runtimeRef = gameStore.state.npcs[resolvedId];
              if (runtimeRef) {
                  matchedNPC = runtimeRef;
              } else {
                  // 尚未存入运行时？ 如果可行，直接使用静态数据
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

      // 决定能力水平：商店 > 触发器 > 默认值
      let powerLevel: PowerLevel = (e.power as PowerLevel) || (e.power_level as PowerLevel) || 'F';
      
      // 如果匹配到数据，则覆盖它
      if (matchedNPC && matchedNPC.power) {
          powerLevel = matchedNPC.power;
      }

      // 决定 HP 值
      let hp = 1000;
      let maxHp = 1000;
      
      // 如果我们存在运行时 HP，使用它（允许持久伤害）
      if (matchedNPC && matchedNPC.hp) {
          hp = matchedNPC.hp;
          maxHp = matchedNPC.max_hp || matchedNPC.maxHp || matchedNPC.hp;
      } else {
         // 基于战力等级的启发式算法
         if (['EX', 'UX', 'OMEGA', '∞'].includes(powerLevel)) { maxHp = 50000; hp = 50000; }
         else if (['S', 'S+', 'SS', 'SSS', 'US'].includes(powerLevel)) { maxHp = 10000; hp = 10000; }
         else if (['A', 'A+', 'B+', 'B'].includes(powerLevel)) { maxHp = 5000; hp = 5000; }
         else { maxHp = 2000; hp = 2000; }
      }

      // 填充符卡
      const enemySpellCards: SpellCard[] = [];
      
      // 1. 基于 ID 或名称自动从 spellcards.ts 加载
      const targetId = matchedNPC ? matchedNPC.id : '';
      const targetName = matchedNPC ? matchedNPC.name : enemyNameRaw;
      
      const presets = findPresetCards(targetId, targetName);
      enemySpellCards.push(...presets);
      
      // 2. 从运行时/设定集定义中加载（如果存在任何特定重写或附加）
      if (matchedNPC && matchedNPC.spell_cards) {
         const manualCards = matchedNPC.spell_cards.map((c: any) => {
             if (typeof c === 'string') {
                 return createSpellCard(c);
             }
             return c as SpellCard;
         });
         
         // 合并并避免重复项（根据名称）
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

    // 2.5 创建盟友战斗者
    const allies: Combatant[] = (triggerData.allies || []).map((a: any, index: number) => {
      // 策略：将盟友解析为 GameStore NPC 条目（复用敌人逻辑）
      
      let matchedNPC: any = null;
      const allyNameRaw = a.name || 'Unknown Ally';
      const allyNameLower = allyNameRaw.toLowerCase().trim();

      // --- 尝试 1：使用集中服务解析规范化 ID ---
      const resolvedId = resolveCharacterId(a.id || allyNameLower, charStore.characters, gameStore.state.npcs);
      
      // --- 尝试 2：运行时匹配 ---
      matchedNPC = gameStore.state.npcs[resolvedId];

      // --- 尝试 3：静态数据库查询（后备方案） ---
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

      // 决定能力水平
      let powerLevel: PowerLevel = (a.power as PowerLevel) || (a.power_level as PowerLevel) || 'F';
      if (matchedNPC && matchedNPC.power) {
          powerLevel = matchedNPC.power;
      }

      // 决定 HP 值
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

      // 填充符卡
      const allySpellCards: SpellCard[] = [];
      
      // 1. 基于 ID 或名称自动从 spellcards.ts 加载
      const targetId = matchedNPC ? matchedNPC.id : '';
      const targetName = matchedNPC ? matchedNPC.name : allyNameRaw;
      
      const presets = findPresetCards(targetId, targetName);
      allySpellCards.push(...presets);

      // 2. 从运行时/设定集定义加载
      if (matchedNPC && matchedNPC.spell_cards) {
         const manualCards = matchedNPC.spell_cards.map((c: any) => {
             if (typeof c === 'string') {
                 return createSpellCard(c);
             }
             return c as SpellCard;
         });
         
         // 合并并避免重复
         for (const card of manualCards) {
             if (!allySpellCards.some(p => p.name === card.name)) {
                 allySpellCards.push(card);
             }
         }
      }

      return {
        id: matchedNPC ? matchedNPC.id : `ally_${index}_${uuidv4().slice(0, 8)}`,
        name: matchedNPC ? matchedNPC.name : allyNameRaw,
        team: 'player', // 盟友处在玩家队伍中
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

    // 3. 初始化战斗状态
    const combatState: CombatState = {
      isActive: false, // 等待用户确认
      isPending: true, // 显示“战斗请求”对话框
      turn: 0,
      combatants: [playerCombatant, ...allies, ...enemies],
      logs: [],
      bgm_suggestion: triggerData.bgm_suggestion || '常规'
    };

    gameStore.setCombatState(combatState);
    
    // 房主端：向客机广播战斗初始化
    if (gameStore.multiplayer.isMultiplayer && gameStore.multiplayer.isHost) {
      multiplayerService.sendCombatInit(combatState);
    }
    
    console.log('[Game Loop] Combat Initialized (Pending User Confirmation)');
  }
}

export const gameLoop = new GameLoopService();

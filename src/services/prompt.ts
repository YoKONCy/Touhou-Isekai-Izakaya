import { useGameStore } from '@/stores/game';
import { useCharacterStore } from '@/stores/character';
import { useChatStore } from '@/stores/chat';
import { useSettingsStore } from '@/stores/settings';
import { usePromptStore } from '@/stores/prompt';
import { useSaveStore } from '@/stores/save';
import { MemoryService } from './memory';
import { estimateTokens } from '@/utils/token';
import { resolveCharacterId } from './characterMapping';

export interface PromptSection {
  id: string;
  name: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  tokenCount: number;
  active: boolean;
}

export interface PromptContext {
  userContent: string;
  sections: PromptSection[];
  totalTokens: number;
  maxTokens: number; // For context window management
}

export class PromptService {
  
  // Logic mapping for each block ID
  private blockHandlers: Record<string, (ctx: PromptContext, content?: string) => Promise<void>> = {};

  constructor() {
    this.registerHandlers();
  }

  private registerHandlers() {
    // 1. System Root (Static/Selectable Options)
    this.blockHandlers['system_root'] = async (ctx, content) => {
      const promptStore = usePromptStore();
      const block = promptStore.blocks.find(b => b.id === 'system_root');
      
      let finalContent = content || '';
      
      // If has options, use the selected one
      if (block && block.options && block.options.length > 0) {
        const selectedId = block.selectedOptionId || block.options[0].id;
        const selectedOption = block.options.find(o => o.id === selectedId);
        if (selectedOption) {
          finalContent = selectedOption.content;
        }
      }

      this.addSection(ctx, 'system_root', '核心规则', 'system', finalContent);
    };

    // 2. Narrative Perspective (Selectable Options)
    this.blockHandlers['narrative_perspective'] = async (ctx) => {
      const promptStore = usePromptStore();
      const block = promptStore.blocks.find(b => b.id === 'narrative_perspective');
      
      if (!block || !block.options) return;

      const selectedId = block.selectedOptionId || 'second_person';
      const selectedOption = block.options.find(o => o.id === selectedId);

      if (selectedOption) {
        let finalContent = selectedOption.content;

        // Special handling for Third Person: Replace {{user}} with player name
      if (selectedId === 'third_person') {
        const gameStore = useGameStore();
        const playerName = gameStore.state.player.name || '玩家';
        finalContent = finalContent.replace(/\{\{user\}\}/g, playerName);
      }

      this.addSection(ctx, 'narrative_perspective', `叙事人称 (${selectedOption.name})`, 'system', finalContent);
      }
    };

    // 2.5 Writing Style (Selectable Options)
    this.blockHandlers['writing_style'] = async (ctx) => {
      const promptStore = usePromptStore();
      const block = promptStore.blocks.find(b => b.id === 'writing_style');
      
      if (!block || !block.options) return;

      const selectedId = block.selectedOptionId || 'light_novel';
      const selectedOption = block.options.find(o => o.id === selectedId);

      if (selectedOption) {
        this.addSection(ctx, 'writing_style', `文风 (${selectedOption.name})`, 'system', selectedOption.content);
      }
    };

    // 3. World Info (Static/Configurable)
    this.blockHandlers['world_info'] = async (ctx, content) => {
      let finalContent = content || '';
      
      // Replace {{user}} with player name from GameStore
      const gameStore = useGameStore();
      const playerName = gameStore.state.player.name || '玩家';
      
      finalContent = finalContent.replace(/\{\{user\}\}/g, playerName);

      // Handle {{global_user_setting}} placeholder
      // If player has a specific setting (e.g. from origin), inject it here.
      
      let userSettingStr = '无特殊设定';
      const rawPersona = gameStore.state.player.persona;
      
      if (rawPersona && rawPersona.trim()) {
        try {
          const jsonObj = JSON.parse(rawPersona);
          // Remove redundant fields that are already in user_persona
          if ('详细人设' in jsonObj) delete jsonObj['详细人设'];
          if ('补充设定' in jsonObj) delete jsonObj['补充设定'];
          
          userSettingStr = JSON.stringify(jsonObj, null, 2);
        } catch (e) {
          // Not JSON. It is plain text persona.
          // Since plain text persona is already in <user_persona>, 
          // we should probably NOT put it in world_info to avoid duplication.
          userSettingStr = '无特殊设定';
        }
      }
      
      finalContent = finalContent.replace(/\{\{global_user_setting\}\}/g, userSettingStr);

      // Difficulty Injection
      const difficulty = gameStore.state.system.difficulty || 'normal';
      let difficultTag = '';
      if (difficulty === 'gentle') {
          difficultTag = '<difficult>这是一个温柔的世界。NPC会对玩家抱有极大的善意，世界观整体偏向轻松日常，即使是战斗也会点到为止。</difficult>';
      } else if (difficulty === 'cruel') {
          difficultTag = '<difficult>这是一个残酷的世界。NPC会对玩家抱有警惕甚至敌意，世界观整体偏向黑暗压抑，生存变得异常艰难。</difficult>';
      }

      if (difficultTag) {
          if (finalContent.includes('</addition_setting>')) {
              finalContent = finalContent.replace('</addition_setting>', `</addition_setting>\n${difficultTag}`);
          } else {
              finalContent += `\n\n${difficultTag}`;
          }
      }

      this.addSection(ctx, 'world_info', '世界观设定', 'system', finalContent);
    };

    // 3.1 Experimental System Rules
    this.blockHandlers['experimental_system'] = async (ctx, content) => {
      if (content && content.trim()) {
        let finalContent = content;
        // Replace {{user}}
        const gameStore = useGameStore();
        const playerName = gameStore.state.player.name || '玩家';
        finalContent = finalContent.replace(/\{\{user\}\}/g, playerName);
        
        this.addSection(ctx, 'experimental_system', '实验性系统规则', 'system', finalContent);
      }
    };

    // 3.2 COT Guide
    this.blockHandlers['cot_guide'] = async (ctx, content) => {
      if (content && content.trim()) {
        let finalContent = content;
        // Replace {{user}}
        const gameStore = useGameStore();
        const playerName = gameStore.state.player.name || '玩家';
        finalContent = finalContent.replace(/\{\{user\}\}/g, playerName);
        
        // Filter Management Logic if disabled
        const settingsStore = useSettingsStore();
        if (!settingsStore.enableManagementSystem) {
           finalContent = finalContent.replace(/【问题】经营模式预判:[\s\S]*?(?=\n\n【问题】|\n\n)/g, '');
        }
        
        this.addSection(ctx, 'cot_guide', 'COT 引导', 'system', finalContent);
      }
    };

    // 3.3 High Priority Rules
    this.blockHandlers['high_priority_rules'] = async (ctx, content) => {
      if (content && content.trim()) {
        let finalContent = content;
        // Replace {{user}}
        const gameStore = useGameStore();
        const playerName = gameStore.state.player.name || '玩家';
        finalContent = finalContent.replace(/\{\{user\}\}/g, playerName);
        
        // Filter Management Protocol if disabled
        const settingsStore = useSettingsStore();
        if (!settingsStore.enableManagementSystem) {
           finalContent = finalContent.replace(/<management_trigger_protocol>[\s\S]*?<\/management_trigger_protocol>/g, '');
        }
        
        // Inject Word Count Rule
        const chatConfig = settingsStore.llmConfigs['chat'];
        const min = chatConfig?.minWordCount ?? 800;
        const max = chatConfig?.maxWordCount ?? 1200;
        
        finalContent += `\n\n<wordage_limit>\n正文的字数（不包含cot与trigger部分）请控制在 ${min} 到 ${max} 字之间。\n</wordage_limit>`;
        
        this.addSection(ctx, 'high_priority_rules', '高权重规则', 'system', finalContent);
      }
    };

    // 4. User Persona (Static/Configurable)
    this.blockHandlers['user_persona'] = async (ctx, content) => {
      const gameStore = useGameStore();
      const p = gameStore.state.player;
      const playerName = p.name || '玩家';
      
      let personaContent = '';

      // Priority 1: Runtime State (from New Game Wizard or Game Logic)
      if (p.persona && p.persona.trim()) {
        // If persona is JSON, we try to extract "详细人设" or "补充设定"
        // Because user wants <user_persona> to ONLY contain the text description, not the full JSON.
        // Full JSON is already injected in {{global_user_setting}}.
        
        let textPersona = p.persona;
        try {
          const jsonObj = JSON.parse(p.persona);
          // Look for text fields. 
          // NewGameWizard saves text in "补充设定" (Preset) or "详细人设" (Custom)
          // Or just use the whole thing if it's not JSON (fallback)
          if (jsonObj["详细人设"]) {
             textPersona = jsonObj["详细人设"];
          } else if (jsonObj["补充设定"]) {
             textPersona = jsonObj["补充设定"];
          } else {
             // If no explicit text field, maybe it is just settings.
             // In this case, we might want to default to a simple description
             // or just leave it empty if there's no narrative persona.
             // But to be safe, let's just say "无特殊描述" or similar if we can't find text.
             // However, user said "不导入JSON格式相关提示词".
             // So if it's purely JSON without text field, we should probably output nothing or minimal.
             textPersona = "无特殊描述";
          }
        } catch (e) {
          // Not JSON, so it is a plain text persona. Use as is.
          textPersona = p.persona;
        }

        personaContent = `玩家信息：\n姓名：${playerName}\n描述：${textPersona}`;
      } else {
        // Priority 2: Static Config from Prompt Builder
        const defaultPersona = `玩家信息：\n姓名：{{user}}\n描述：一个意外迷入幻想乡的人类。`;
        personaContent = content || defaultPersona;
      }
      
      // Replace {{user}} placeholder
      personaContent = personaContent.replace(/\{\{user\}\}/g, playerName);

      this.addSection(ctx, 'user_persona', '玩家人设', 'system', `<user_persona>\n${personaContent}\n</user_persona>`);
    };

    // 5. Character Injection (Dynamic)
    this.blockHandlers['char_injection'] = async (ctx) => {
      const charStore = useCharacterStore();
      await charStore.loadCharacters(); // Ensure loaded
      
      const gameStore = useGameStore();
      const currentSceneNPCs = gameStore.state.system.current_scene_npcs;
      
      // Get history directly from store, not from ctx.sections (which might be empty depending on block order)
      const chatStore = useChatStore();
      const historyMessages = chatStore.messages.slice(-2); // Check last 2 messages for context (User input + Last AI reply)
      const historyText = historyMessages.map(m => m.content).join('\n');
      
      const playerName = gameStore.state.player.name || '玩家';
      
      const activeChars = new Map<string, any>();

      // Strategy 1: Scene based (Who is explicitly in the scene?)
      for (const npcId of currentSceneNPCs) {
        if (!npcId) continue;
        const resolvedId = resolveCharacterId(npcId, charStore.characters, gameStore.state.npcs);
        const card = charStore.characters.find(c => c.uuid === resolvedId);
        if (card) {
          activeChars.set(card.uuid, { card, reason: '当前场景角色' });
        }
      }
      
      // Strategy 2: Keyword matching in User Content OR Recent History
      const textToScan = ctx.userContent + '\n' + historyText;
      
      for (const char of charStore.characters) {
        if (activeChars.has(char.uuid)) continue;

        if (char.tags && char.tags.some(tag => textToScan.includes(tag))) {
           activeChars.set(char.uuid, { card: char, reason: '提及/回忆' });
           continue;
        }
        
        if (textToScan.includes(char.name)) {
           activeChars.set(char.uuid, { card: char, reason: '提及/回忆' });
        }
      }

      // Strategy 3: Injection from Prediction (Previous Round)
      const predictedChars = gameStore.state.system.predicted_next_round_chars || [];
      for (const predName of predictedChars) {
          const resolvedId = resolveCharacterId(predName, charStore.characters, gameStore.state.npcs);
          const card = charStore.characters.find(c => c.uuid === resolvedId);
          
          if (card && !activeChars.has(card.uuid)) {
            activeChars.set(card.uuid, { card, reason: '剧情预测' });
          }
      }

      if (activeChars.size > 0) {
        let fullContent = '<lore_info>\n';
        
        for (const { card, reason } of activeChars.values()) {
          // Remove [条目: xxx] header
          let content = `${card.description}`;
          
          // Replace {{user}} in character description
          content = content.replace(/\{\{user\}\}/g, playerName);

          if (reason === '提及/回忆' || reason === '剧情预测') {
             // Double check: Is it actually in currentSceneNPCs? (In case Strategy 1 missed it)
             const isInScene = currentSceneNPCs.some(id => {
                if (!id) return false;
                const lowerId = String(id).toLowerCase().trim();
                return (card.uuid && card.uuid.toLowerCase() === lowerId) || 
                       (card.name && card.name.toLowerCase() === lowerId);
             });

             if (!isInScene) {
                // Only show warning if NOT in current scene
                if (reason === '剧情预测') {
                  content += `\n(注意：该角色是有一定可能会在本轮登场的角色)`;
                } else {
                  content += `\n(注意：该条目当前不在场景中，仅作为回忆或提及对象)`;
                }
             } else {
                // It IS in scene, so treat it as such (and append status)
                const runtimeStatus = gameStore.state.npcs[card.uuid] || gameStore.state.npcs[card.name];
                if (runtimeStatus) {
                  content += `\n[当前状态]
好感度: ${runtimeStatus.favorability}
心情: ${runtimeStatus.mood}
姿势: ${runtimeStatus.posture}
衣着: ${runtimeStatus.clothing}`;
                }
             }
          } else {
             // Reason is '当前场景角色'
             const runtimeStatus = gameStore.state.npcs[card.uuid] || gameStore.state.npcs[card.name];
             if (runtimeStatus) {
               content += `\n[当前状态]
好感度: ${runtimeStatus.favorability}
心情: ${runtimeStatus.mood}
姿势: ${runtimeStatus.posture}
衣着: ${runtimeStatus.clothing}`;
             }
          }
          
          if (card.creatorNotes) {
            content += `\n注意：${card.creatorNotes}`;
          }
          
          fullContent += content + '\n\n';
        }
        
        fullContent += '</lore_info>';
        
        this.addSection(ctx, 'char_injection', 'Lorebook 注入', 'system', fullContent);
      }
    };

    // 6. Game State (Dynamic)
    this.blockHandlers['game_state'] = async (ctx) => {
      const gameStore = useGameStore();
      const p = gameStore.state.player;
      const charStore = useCharacterStore();
      
      let content = `<current_state>
[当前主角状态]
时间：${p.time}
日期：${p.date}
地点：${p.location}
身份：${p.identity}
着装：${p.clothing}
金钱：${p.money}
HP：${p.hp}/${p.max_hp}
MP：${p.mp}/${p.max_mp}
战斗力：${p.power}
声望：${p.reputation}
持有物品：${p.items?.map(i => typeof i === 'string' ? i : `${i.name} x${i.count} (简介: ${i.description || '无'})`).join(', ') || '无'}
符卡：${p.spell_cards?.map(c => {
        if (typeof c === 'string') return c;
        let info = `${c.name} (消耗:${c.cost}MP, 效果:${c.description}`;
        if (c.buffDetails) {
           info += `, 状态:${c.buffDetails.name}`;
           if (c.buffDetails.effects && c.buffDetails.effects.length > 0) {
              const effs = c.buffDetails.effects.map((e: any) => {
                 if (e.type === 'damage_over_time') return `真伤${e.value}`;
                 if (e.type === 'heal') return `治疗${e.value}`;
                 if (e.type === 'shield') return `盾${e.value}`;
                 if (e.type === 'stat_mod') return `${e.targetStat}${e.value > 0 ? '+' : ''}${e.value}`;
                 return e.type;
              }).join('/');
              info += `[${effs}]`;
           }
        }
        info += `)`;
        return info;
      }).join(', ') || '无'}`;

      // Add Current Scene NPCs info
      const currentSceneNPCs = gameStore.state.system.current_scene_npcs;
      
      const maleNPCs: string[] = [];
      const femaleNPCs: string[] = [];
      const otherNPCs: string[] = [];

      for (const npcId of currentSceneNPCs) {
        // Resolve canonical ID
        const resolvedId = resolveCharacterId(npcId, charStore.characters, gameStore.state.npcs);
        // Find static card data for name
        const card = charStore.characters.find(c => c.uuid === resolvedId);
        // Find runtime status
        const status = gameStore.state.npcs[npcId] || gameStore.state.npcs[resolvedId];

        // Determine display name: Priority: Card Name > Runtime Name > ID
        const name = card?.name || status?.name || npcId;
        
        let charInfo = `- ${name}`;
        if (status) {
          // Add runtime variables if available
          const details = [];
          if (status.favorability !== undefined) details.push(`好感:${status.favorability}`);
          if (status.obedience !== undefined) details.push(`服从:${status.obedience}`);
          if (status.mood) details.push(`心情:${status.mood}`);
          if (status.action) details.push(`正在:${status.action}`);
          if (status.posture) details.push(`姿势:${status.posture}`);
          if (status.clothing) details.push(`衣着:${status.clothing}`);
          if (status.hp !== undefined) details.push(`HP:${status.hp}`);
          if (status.power) details.push(`战力:${status.power}`);
          if (status.hands) details.push(`手部:${status.hands}`);
          if (status.chest) details.push(`胸部:${status.chest}`);
          if (status.buttocks) details.push(`臀部:${status.buttocks}`);
          if (status.vagina) details.push(`小穴:${status.vagina}`);
          if (status.anus) details.push(`菊穴:${status.anus}`);
          if (status.residence) details.push(`住所:${status.residence}`);
          if (status.face) details.push(`脸部:${status.face}`);
          if (status.mouth) details.push(`嘴部:${status.mouth}`);
          if (status.relationship) details.push(`关系:${status.relationship}`);
          
          if (details.length > 0) {
            charInfo += `: ${details.join(', ')}`;
          }
        }

        // Segregate by gender
        const gender = card?.gender || 'female'; // Default to female for Touhou
        if (gender === 'male') {
          maleNPCs.push(charInfo);
        } else if (gender === 'female') {
          femaleNPCs.push(charInfo);
        } else {
          otherNPCs.push(charInfo);
        }
      }

      if (maleNPCs.length > 0) {
        content += `\n\n[当前区域角色 (男性)]\n${maleNPCs.join('\n')}`;
      }
      if (femaleNPCs.length > 0) {
        content += `\n\n[当前区域角色 (女性)]\n${femaleNPCs.join('\n')}`;
      }
      if (otherNPCs.length > 0) {
        content += `\n\n[当前区域角色 (其他)]\n${otherNPCs.join('\n')}`;
      }

      if (currentSceneNPCs.length === 0) {
        content += `\n\n[当前区域角色]\n(无)`;
      }

      // --- NEW: Add Known NPCs (Persistent Data) ---
      const allRuntimeNpcs = gameStore.state.npcs;
      const knownNPCs: string[] = [];

      for (const [id, status] of Object.entries(allRuntimeNpcs)) {
        // Skip if already in current scene (they are already listed above)
        if (currentSceneNPCs.includes(id)) continue;

        // Resolve static info for name
        const resolvedId = resolveCharacterId(id, charStore.characters, allRuntimeNpcs);
        const card = charStore.characters.find(c => c.uuid === resolvedId);
        const name = card?.name || (status as any).name || id;

        // Criteria for "Known NPC": non-default favorability, obedience, or relationship
        const isSignificant = 
          (status as any).favorability !== undefined && (status as any).favorability !== 0 ||
          (status as any).obedience !== undefined && (status as any).obedience !== 0 ||
          (status as any).relationship && (status as any).relationship !== '陌生人' ||
          (status as any).residence;

        if (isSignificant) {
          let npcBrief = `- ${name}`;
          const details = [];
          if ((status as any).favorability !== undefined) details.push(`好感:${(status as any).favorability}`);
          if ((status as any).obedience !== undefined) details.push(`服从:${(status as any).obedience}`);
          if ((status as any).relationship) details.push(`关系:${(status as any).relationship}`);
          if ((status as any).residence) details.push(`住所:${(status as any).residence}`);
          
          if (details.length > 0) {
            npcBrief += `: ${details.join(', ')}`;
          }
          knownNPCs.push(npcBrief);
        }
      }

      if (knownNPCs.length > 0) {
        content += `\n\n[已知角色及关系 (不在当前区域)]\n${knownNPCs.join('\n')}`;
      }
      // ----------------------------------------------

      // Add Active Quests
      const activeQuests = gameStore.state.system.quests?.filter(q => q.status === 'active') || [];
      if (activeQuests.length > 0) {
        content += `\n\n[当前进行中的任务]\n`;
        content += activeQuests.map(q => {
          let qInfo = `- ${q.name} (发布人: ${q.giver})\n  目标: ${q.description}`;
          if (q.requirements && q.requirements.length > 0) {
            qInfo += `\n  具体要求: ${q.requirements.join(', ')}`;
          }
          return qInfo;
        }).join('\n');
      }

      // Add Active Promises
      const activePromises = gameStore.state.system.promises?.filter(p => p.status === 'active') || [];
      if (activePromises.length > 0) {
        content += `\n\n[当前有效的约定]\n`;
        content += activePromises.map(p => {
          return `- ${p.content} (约定人: ${p.giver}, 建立于: ${p.createdTime})`;
        }).join('\n');
      }

      content += `\n\n(以上状态数据仅供参考，严禁在会话中提到状态栏相关的内容)\n</current_state>`;

      this.addSection(ctx, 'game_state', '游戏变量', 'system', content);
    };

    // Global Memory (Alliance & Intelligence)
    this.blockHandlers['global_memory'] = async (ctx) => {
      const saveStore = useSaveStore();
      if (!saveStore.currentSaveId) return;

      const memoryService = new MemoryService();
      const content = await memoryService.getGlobalMemories(saveStore.currentSaveId);
      
      if (content) {
        this.addSection(ctx, 'global_memory', '全局记忆', 'system', content);
      }
    };

    // 7. Chat History (Dynamic)
    this.blockHandlers['chat_history'] = async (ctx) => {
      const chatStore = useChatStore();
      const settingsStore = useSettingsStore();
      const chatConfig = settingsStore.getEffectiveConfig('chat');
      const historyTurns = chatConfig.historyTurns || 10;

      const history = chatStore.messages.slice(-historyTurns); 
      
      let historyText = '<historic_context>\n';
      for (const msg of history) {
         if (msg.role === 'user' && msg.content === ctx.userContent) continue;
         
         if (msg.role === 'user') {
           historyText += `<user>${msg.content}</user>\n`;
         } else {
           historyText += `<role>${msg.content}</role>\n`;
         }
      }
      historyText += '</historic_context>';

      if (historyText !== '<historic_context>\n</historic_context>') {
        this.addSection(ctx, 'chat_history', '对话历史', 'system', historyText);
      }
    };

    // 8. Long Term Memory (Dynamic)
    this.blockHandlers['long_term_memory'] = async (ctx, content) => {
      // Content here is passed from the build() call (the retrieved memories)
      const gameStore = useGameStore();
      const storySummary = gameStore.state.player.storySummary;
      
      let finalContent = '';
      
      // Inject Story Summary if exists
      if (storySummary && storySummary.trim()) {
        finalContent += `<story_summary>\n${storySummary}\n</story_summary>\n\n`;
      }
      
      // Inject Retrieved Memories
      if (content && content.trim()) {
         finalContent += `<memories>\n${content}\n</memories>`;
      }
      
      if (finalContent.trim()) {
         this.addSection(ctx, 'long_term_memory', '长期记忆', 'system', finalContent);
      }
    };
  }

  private addSection(ctx: PromptContext, id: string, name: string, role: 'system'|'user'|'assistant', content: string) {
    const tokens = estimateTokens(content);
    ctx.sections.push({
      id,
      name,
      role,
      content,
      tokenCount: tokens,
      active: true
    });
    ctx.totalTokens += tokens;
  }

  async build(userContent: string, memoryContent?: string): Promise<PromptContext> {
    const ctx: PromptContext = {
      userContent,
      sections: [],
      totalTokens: 0,
      maxTokens: 4000 // Default limit
    };

    // Use PromptStore to determine order and content
    const promptStore = usePromptStore();
    
    for (const block of promptStore.blocks) {
      if (!block.enabled) continue;
      
      const handler = this.blockHandlers[block.id];
      if (handler) {
        // Special case: pass memoryContent to long_term_memory block
        const contentToPass = block.id === 'long_term_memory' ? memoryContent : block.content;
        await handler(ctx, contentToPass);
      } else {
        console.warn(`No handler found for prompt block: ${block.id}`);
      }
    }
    
    // Finally add User Instruction (Always last, not configurable in blocks for now)
    this.addSection(ctx, 'user_instruction', '当前指令', 'user', userContent);

    return ctx;
  }
  
  // Convert context to OpenAI format
  toOpenAIMessages(ctx: PromptContext) {
    return ctx.sections
      .filter(s => s.active)
      .map(s => ({
        role: s.role,
        content: s.content
      }));
  }
}

export const promptService = new PromptService();

import { useGameStore } from '@/stores/game';
import { useCharacterStore } from '@/stores/character';
import { useChatStore } from '@/stores/chat';
import { useSettingsStore } from '@/stores/settings';
import { usePromptStore } from '@/stores/prompt';
import { useSaveStore } from '@/stores/save';
import { MemoryService } from './memory';
import { estimateTokens } from '@/utils/token';
import { resolveCharacterId } from './characterMapping';
import { resolveLocationId } from './locationMapping';

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
  maxTokens: number; // 用于上下文窗口容量管理
}

export class PromptService {
  // 针对每个功能块 ID 的逻辑处理器映射表 (Handler Map)
  private blockHandlers: Record<string, (ctx: PromptContext, content?: string) => Promise<void>> =
    {};

  constructor() {
    this.registerHandlers();
  }

  private registerHandlers() {
    // 1. 系统核心根节点 (包含静态/可选的预设指令选项)
    this.blockHandlers['system_root'] = async (ctx, content) => {
      const promptStore = usePromptStore();
      const block = promptStore.blocks.find((b) => b.id === 'system_root');

      let finalContent = content || '';

      // 如果配置了选项列表，则根据用户的选择项提取内容 (Option Matching)
      if (block && block.options && block.options.length > 0) {
        const options = block.options;
        const selectedId = block.selectedOptionId || options[0]?.id;

        if (selectedId) {
          const selectedOption = options.find((o) => o.id === selectedId);
          if (selectedOption) {
            finalContent = selectedOption.content;
          }
        }
      }

      this.addSection(ctx, 'system_root', '核心规则', 'system', finalContent);
    };

    // 1.5 联机规则 (动态) - 移至前部以获得更高处理优先级
    this.blockHandlers['multiplayer_rules'] = async (ctx, content) => {
      const gameStore = useGameStore();
      if (gameStore.multiplayer.isMultiplayer) {
        // 构建当前房间内玩家列表的上下文信息 (Construct Player List)
        let playerListInfo = '当前房间玩家列表:\n';

        // 主机 (Host) 信息锁定
        const hostName = gameStore.state.player.name || '房主';
        playerListInfo += `- [Host] ${hostName} (你当前服务的对象)\n`;

        // 伙伴列表 (Guest Companions) 遍历同步
        if (gameStore.state.multiplayer_companions) {
          Object.values(gameStore.state.multiplayer_companions).forEach((comp: any) => {
            playerListInfo += `- [Guest] ${comp.name}\n`;
          });
        }

        const finalContent = `${content}\n\n${playerListInfo}`;
        this.addSection(ctx, 'multiplayer_rules', '多人模式规则', 'system', finalContent);
      }
    };

    // 2. 叙述视角设置 (可选预设方案)
    this.blockHandlers['narrative_perspective'] = async (ctx) => {
      const promptStore = usePromptStore();
      const block = promptStore.blocks.find((b) => b.id === 'narrative_perspective');

      if (!block || !block.options) return;

      const selectedId = block.selectedOptionId || 'second_person';
      const selectedOption = block.options.find((o) => o.id === selectedId);

      if (selectedOption) {
        let finalContent = selectedOption.content;

        // 针对第三人称视角做规范化处理：将 {{user}} 占位符真实替换为玩家名称进行渲染
        if (selectedId === 'third_person') {
          const gameStore = useGameStore();
          const playerName = gameStore.state.player.name || '玩家';
          finalContent = finalContent.replace(/\{\{user\}\}/g, playerName);
        }

        this.addSection(
          ctx,
          'narrative_perspective',
          `叙事人称 (${selectedOption.name})`,
          'system',
          finalContent
        );
      }
    };

    // 2.5 文风样式设定 (可选预设方案)
    this.blockHandlers['writing_style'] = async (ctx) => {
      const promptStore = usePromptStore();
      const block = promptStore.blocks.find((b) => b.id === 'writing_style');

      if (!block || !block.options) return;

      const selectedId = block.selectedOptionId || 'light_novel';
      const selectedOption = block.options.find((o) => o.id === selectedId);

      if (selectedOption) {
        this.addSection(
          ctx,
          'writing_style',
          `文风 (${selectedOption.name})`,
          'system',
          selectedOption.content
        );
      }
    };

    // 2.6 叙述转传/代入设定 (可选预设方案)
    this.blockHandlers['narrative_relay'] = async (ctx) => {
      const promptStore = usePromptStore();
      const block = promptStore.blocks.find((b) => b.id === 'narrative_relay');

      if (!block || !block.options) return;

      const selectedId = block.selectedOptionId || 'normal_relay';
      const selectedOption = block.options.find((o) => o.id === selectedId);

      if (selectedOption && selectedOption.content) {
        let finalContent = selectedOption.content;
        const gameStore = useGameStore();
        const playerName = gameStore.state.player.name || '玩家';
        finalContent = finalContent.replace(/\{\{user\}\}/g, playerName);

        this.addSection(
          ctx,
          'narrative_relay',
          `转述设定 (${selectedOption.name})`,
          'system',
          finalContent
        );
      }
    };

    // 3. 世界观背景信息 (静态/可配置的辅助插项)
    this.blockHandlers['world_info'] = async (ctx, content) => {
      let finalContent = content || '';

      // 将 {{user}} 占位符全局实时映射为 GameStore 中注册的玩家名称
      const gameStore = useGameStore();
      const playerName = gameStore.state.player.name || '玩家';

      finalContent = finalContent.replace(/\{\{user\}\}/g, playerName);

      // 处理 {{global_user_setting}} 全局用户设定占位符 (Dynamic Persona Injection)
      // 若玩家拥有基于出身或剧本的特定人设 (persona)，则将其作为元数据注入此处。

      let userSettingStr = '无特殊设定';
      const rawPersona = gameStore.state.player.persona;

      if (rawPersona && rawPersona.trim()) {
        try {
          const jsonObj = JSON.parse(rawPersona);
          // 移除已在 user_persona 区块中定义的重复字段
          if ('详细人设' in jsonObj) delete jsonObj['详细人设'];
          if ('补充设定' in jsonObj) delete jsonObj['补充设定'];

          userSettingStr = JSON.stringify(jsonObj, null, 2);
        } catch (e) {
          // 识别为纯文本个人简介，由于该项已包含在专有的 <user_persona> 区块中，
          // 此处不再重复注入 world_info 以防上下文空间浪费及权重冲突。
          userSettingStr = '无特殊设定';
        }
      }

      finalContent = finalContent.replace(/\{\{global_user_setting\}\}/g, userSettingStr);

      // 当前世界难度引擎权重注入逻辑 (Difficulty Injection)
      const difficulty = gameStore.state.system.difficulty || 'normal';
      let difficultTag = '';
      if (difficulty === 'gentle') {
        difficultTag =
          '<difficult>这是一个温柔的世界。NPC会对玩家抱有极大的善意，世界观整体偏向轻松日常，即使是战斗也会点到为止。</difficult>';
      } else if (difficulty === 'cruel') {
        difficultTag =
          '<difficult>这是一个残酷的世界。NPC会对玩家抱有警惕甚至敌意，世界观整体偏向黑暗压抑，生存变得异常艰难。</difficult>';
      }

      if (difficultTag) {
        if (finalContent.includes('</addition_setting>')) {
          finalContent = finalContent.replace(
            '</addition_setting>',
            `</addition_setting>\n${difficultTag}`
          );
        } else {
          finalContent += `\n\n${difficultTag}`;
        }
      }

      this.addSection(ctx, 'world_info', '世界观设定', 'system', finalContent);
    };

    // 3.1 实验性系统组件规则注入逻辑 (Experimental)
    this.blockHandlers['experimental_system'] = async (ctx, content) => {
      if (content && content.trim()) {
        let finalContent = content;
        // 替换 {{user}} 占位符
        const gameStore = useGameStore();
        const playerName = gameStore.state.player.name || '玩家';
        finalContent = finalContent.replace(/\{\{user\}\}/g, playerName);

        this.addSection(ctx, 'experimental_system', '实验性系统规则', 'system', finalContent);
      }
    };

    // 3.2 COT (思维链) 引导逻辑 (Logic Path Reflection)
    this.blockHandlers['cot_guide'] = async (ctx, content) => {
      if (content && content.trim()) {
        let finalContent = content;
        // Replace {{user}}
        const gameStore = useGameStore();
        const playerName = gameStore.state.player.name || '玩家';
        finalContent = finalContent.replace(/\{\{user\}\}/g, playerName);

        // 若全局设置禁用了经营系统，则主动剥离相关的预测与评估逻辑片段 (Branch Pruning)
        const settingsStore = useSettingsStore();
        if (!settingsStore.enableManagementSystem) {
          finalContent = finalContent.replace(
            /【问题】经营模式预判:[\s\S]*?(?=\n\n【问题】|\n\n)/g,
            ''
          );
        }

        this.addSection(ctx, 'cot_guide', 'COT 引导', 'system', finalContent);
      }
    };

    // 3.3 高优先级核心底层规则 (强制性系统约束)
    this.blockHandlers['high_priority_rules'] = async (ctx, content) => {
      if (content && content.trim()) {
        let finalContent = content;
        // Replace {{user}}
        const gameStore = useGameStore();
        const playerName = gameStore.state.player.name || '玩家';
        finalContent = finalContent.replace(/\{\{user\}\}/g, playerName);

        // 若核心玩法层禁用了经营模型，则过滤对应的触发协议说明 (Condition Strip)
        const settingsStore = useSettingsStore();
        if (!settingsStore.enableManagementSystem) {
          finalContent = finalContent.replace(
            /<management_trigger_protocol>[\s\S]*?<\/management_trigger_protocol>/g,
            ''
          );
        }

        // 注入正文字数限制核心约束规则 (Wordage Rule Sync)
        const chatConfig = settingsStore.llmConfigs['chat'];
        const min = chatConfig?.minWordCount ?? 800;
        const max = chatConfig?.maxWordCount ?? 1200;

        finalContent += `\n\n<wordage_limit>\n正文的字数（不包含cot与trigger部分）请控制在 ${min} 到 ${max} 字之间。\n</wordage_limit>`;

        this.addSection(ctx, 'high_priority_rules', '高权重规则', 'system', finalContent);
      }
    };

    // 4. 玩家个人设定 (静态/可配置的属性映射)
    this.blockHandlers['user_persona'] = async (ctx, content) => {
      const gameStore = useGameStore();
      const p = gameStore.state.player;
      const playerName = p.name || '玩家';

      let personaContent = '';

      // 优先级 1: 运行时实时捕获的状态链 (源自向导节点或实时交互逻辑更新)
      if (p.persona && p.persona.trim()) {
        // 设计约定：<user_persona> 区块仅保留叙述性特征文本，所有结构化 JSON 元数据
        // 已通过 {{global_user_setting}} 在上游完成注入。此处执行格式规范化提取。

        let textPersona = p.persona;
        try {
          const jsonObj = JSON.parse(p.persona);
          // 查找文本描述字段。
          // 新游戏向导会将文本保存在“补充设定”（预设）或“详细人设”（自定义）中
          // 若非 JSON 格式则回退至完整内容引用
          if (jsonObj['详细人设']) {
            textPersona = jsonObj['详细人设'];
          } else if (jsonObj['补充设定']) {
            textPersona = jsonObj['补充设定'];
          } else {
            // 安全兜底逻辑：若 JSON 结构中不含显性文本描述键值，则仅执行最简语义输出，防范不规范数据污染内容。
            textPersona = '无特殊描述';
          }
        } catch (e) {
          // 检测到源数据为纯文本个人设定，直接按原样执行渲染即可 (Plain Text Passthrough)
          textPersona = p.persona;
        }

        personaContent = `玩家信息：\n姓名：${playerName}\n描述：${textPersona}`;
      } else {
        // 优先级 2: 来自指令构建器模板文件的静态缺省配置作为兜底方案
        const defaultPersona = `玩家信息：\n姓名：{{user}}\n描述：一个意外迷入幻想乡的人类。`;
        personaContent = content || defaultPersona;
      }

      // 全局占位符同步：确保姓名标识符合当前会话语境
      personaContent = personaContent.replace(/\{\{user\}\}/g, playerName);

      this.addSection(
        ctx,
        'user_persona',
        '玩家人设',
        'system',
        `<user_persona>\n${personaContent}\n</user_persona>`
      );
    };

    // 5. 设定集 (Lorebook) 智能动态注入核心组件 (涵盖角色动态、地点分布、道具图鉴等)
    this.blockHandlers['char_injection'] = async (ctx) => {
      const charStore = useCharacterStore();
      await charStore.loadCharacters(); // 状态守卫：确保角色资源库就绪以供检索

      const gameStore = useGameStore();
      const currentSceneNPCs = gameStore.state.system.current_scene_npcs;
      const currentLocation = gameStore.state.player.location;

      // 上下文回拉：直接从 Store 溯源历史记录，降低因 Block 节点构建顺序导致的 Section 上下文隔离影响
      const chatStore = useChatStore();
      const historyMessages = chatStore.messages.slice(-2); // 扫描范围锁定为最近 2 轮对答 (涵盖用户意图与 AI 最近一次的逻辑反馈点)
      const historyText = historyMessages.map((m) => m.content).join('\n');

      const playerName = gameStore.state.player.name || '玩家';

      const activeChars = new Map<string, any>();

      // 触发策略 A: 基于当前地理坐标的角色/地点设定强制激活 (Location Affinity)
      if (currentLocation) {
        const resolvedLocId = resolveLocationId(currentLocation, charStore.characters);
        const locCard = charStore.characters.find((c) => c.uuid === resolvedLocId);
        if (locCard) {
          activeChars.set(locCard.uuid, { card: locCard, reason: '当前场景地点' });
        }
      }

      // 触发策略 B: 基于场景活跃名单的显性注入 (Who is explicitly in the scene?)
      for (const npcId of currentSceneNPCs) {
        if (!npcId) continue;
        const resolvedId = resolveCharacterId(npcId, charStore.characters, gameStore.state.npcs);
        const card = charStore.characters.find((c) => c.uuid === resolvedId);
        if (card) {
          activeChars.set(card.uuid, { card, reason: '当前场景角色' });
        }
      }

      // 触发策略 C: 基于语义相似度与关键词命中率的启发式召回策略 (Scanning User Input & Recent History)
      const textToScan = ctx.userContent + '\n' + historyText + '\n' + (currentLocation || '');

      for (const char of charStore.characters) {
        if (activeChars.has(char.uuid)) continue;

        if (char.tags && char.tags.some((tag) => textToScan.includes(tag))) {
          activeChars.set(char.uuid, { card: char, reason: '提及/回忆' });
          continue;
        }

        if (textToScan.includes(char.name)) {
          activeChars.set(char.uuid, { card: char, reason: '提及/回忆' });
        }
      }

      // 触发策略 D: 基于前一轮剧情发展链路的概率性预测注入 (Narrative Prediction)
      const predictedChars = gameStore.state.system.predicted_next_round_chars || [];
      for (const predName of predictedChars) {
        const resolvedId = resolveCharacterId(predName, charStore.characters, gameStore.state.npcs);
        const card = charStore.characters.find((c) => c.uuid === resolvedId);

        if (card && !activeChars.has(card.uuid)) {
          activeChars.set(card.uuid, { card, reason: '剧情预测' });
        }
      }

      if (activeChars.size > 0) {
        let fullContent = '<lore_info>\n';

        for (const { card, reason } of activeChars.values()) {
          // 清洗：去除底层原始数据中不必要的 [条目: xxx] 定位符前缀以优化上下文整洁度 (Header Pruning)
          let content = `${card.description}`;

          // 占位符同步：确保设定集描述中的代指对象与当前玩家定名匹配
          content = content.replace(/\{\{user\}\}/g, playerName);

          if (reason === '当前场景地点') {
            content = `[当前位置设定: ${card.name}]\n${content}`;
          } else if (reason === '提及/回忆' || reason === '剧情预测') {
            // 状态二次复检：判定该角色是否确实处于当前的“物理在场”范围？(用于区分【提及/回忆】与【实时交互】)
            const isInScene = currentSceneNPCs.some((id) => {
              if (!id) return false;
              const lowerId = String(id).toLowerCase().trim();
              return (
                (card.uuid && card.uuid.toLowerCase() === lowerId) ||
                (card.name && card.name.toLowerCase() === lowerId)
              );
            });

            if (!isInScene) {
              // 角色判定为“非在场”状态：通过系统消息追加元数据标注，约束模型进行发散性幻觉描写 (Context Warning)
              if (reason === '剧情预测') {
                content += `\n(注意：该角色是有一定可能会在本轮登场的角色)`;
              } else {
                content += `\n(注意：该条目当前不在场景中，仅作为回忆或提及对象)`;
              }
            } else {
              // 该角色确实在场：按活跃实体逻辑处理，并追加其专有的动态生理/心理状态参量 (Dynamic Status Extension)
              const runtimeStatus =
                gameStore.state.npcs[card.uuid] || gameStore.state.npcs[card.name];
              if (runtimeStatus && (card.type === 'character' || !card.type)) {
                content += `\n[当前状态]
好感度: ${runtimeStatus.favorability}
心情: ${runtimeStatus.mood}
姿势: ${runtimeStatus.posture}
衣着: ${runtimeStatus.clothing}`;
              }
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

    // 6. 全局动态游戏变量状态机注入逻辑 (High-Frequency Dynamic State)
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
持有物品：${p.items?.map((i) => (typeof i === 'string' ? i : `${i.name} x${i.count}`)).join(', ') || '无'}
符卡：${
        p.spell_cards
          ?.map((c) => {
            if (typeof c === 'string') return c;
            const info = `${c.name} (消耗:${c.cost}MP, 效果:${c.description})`;
            return info;
          })
          .join(', ') || '无'
      }`;

      // 注入当前场景的 NPC 信息总览
      const currentSceneNPCs = gameStore.state.system.current_scene_npcs;

      const maleNPCs: string[] = [];
      const femaleNPCs: string[] = [];
      const otherNPCs: string[] = [];

      for (const npcId of currentSceneNPCs) {
        // 身份解析：获取系统规范化后的 UUID 唯一标识令牌 (Canonical Key)
        const resolvedId = resolveCharacterId(npcId, charStore.characters, gameStore.state.npcs);
        // 模板溯源：反向查找静态卡片数据集以提取精准的定名 (Static Lookup)
        const card = charStore.characters.find((c) => c.uuid === resolvedId);
        // 实时捕获：拉取内存中的最新动态运行态参量 (Runtime Snap)
        const status = gameStore.state.npcs[npcId] || gameStore.state.npcs[resolvedId];

        // 名称渲染权重分发机制：优先匹配定名卡片 > 运行时重定义名称 > 原始 ID 字符串
        const name = card?.name || status?.name || npcId;

        let charInfo = `- ${name}`;
        // 类型鉴权：状态细节（好感、生理等）仅针对“角色类”实体注入，避免非生物类地点或信息条目出现逻辑异常 (Type Integrity Guard)
        if (status && (!card || card.type === 'character' || !card.type)) {
          // 动态注入角色专有的生理与心理多维参量数据 (Dynamic Variable Injection)
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

          let relStr = '';
          if (status.relationship) relStr = `关系:${status.relationship}`;
          if (status.addressing) relStr += ` (称呼你:${status.addressing})`;
          if (relStr) details.push(relStr.trim());

          if (details.length > 0) {
            charInfo += `: ${details.join(', ')}`;
          }
        }

        // 语义适配处理：基于性别分类执行逻辑排布（针对东方全员女性为主的项目语境，默认缺省为女性角色）
        const gender = card?.gender || 'female'; // 东方 Project 语境下默认缺省为女性
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

      // --- 核心持久化补丁：注入“已识角色”全局关系网络总览 (Known Persistent NPCs) ---
      const allRuntimeNpcs = gameStore.state.npcs;
      const knownNPCs: string[] = [];

      for (const [id, status] of Object.entries(allRuntimeNpcs)) {
        // 冗余项拦截：跳过已存在于当前场景活跃列表的角色，避免重复渲染干扰模型权重 (Deduplication)
        if (currentSceneNPCs.includes(id)) continue;

        // 身份追溯：解析其 UUID 并提取定名数据
        const resolvedId = resolveCharacterId(id, charStore.characters, allRuntimeNpcs);
        const card = charStore.characters.find((c) => c.uuid === resolvedId);
        const name = card?.name || (status as any).name || id;

        // “已识角色”筛选准则：非零的好感度、具现出的服从度状态、已确立的显性社交关系或已知的居住地 (Significance Filter)
        const isSignificant =
          ((status as any).favorability !== undefined && (status as any).favorability !== 0) ||
          ((status as any).obedience !== undefined && (status as any).obedience !== 0) ||
          ((status as any).relationship && (status as any).relationship !== '陌生人') ||
          (status as any).residence;

        if (isSignificant) {
          let npcBrief = `- ${name}`;
          const details = [];
          if ((status as any).favorability !== undefined)
            details.push(`好感:${(status as any).favorability}`);
          if ((status as any).obedience !== undefined)
            details.push(`服从:${(status as any).obedience}`);

          let relStr = '';
          if ((status as any).relationship) relStr = `关系:${(status as any).relationship}`;
          if ((status as any).addressing) relStr += ` (称呼你:${(status as any).addressing})`;
          if (relStr) details.push(relStr.trim());

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

      // 注入进行中的任务列表
      const activeQuests =
        gameStore.state.system.quests?.filter((q) => q.status === 'active') || [];
      if (activeQuests.length > 0) {
        content += `\n\n[当前进行中的任务]\n`;
        content += activeQuests
          .map((q) => {
            let qInfo = `- ${q.name} (发布人: ${q.giver})\n  目标: ${q.description}`;
            if (q.requirements && q.requirements.length > 0) {
              qInfo += `\n  具体要求: ${q.requirements.join(', ')}`;
            }
            return qInfo;
          })
          .join('\n');
      }

      // 注入有效的约定事项
      const activePromises =
        gameStore.state.system.promises?.filter((p) => p.status === 'active') || [];
      if (activePromises.length > 0) {
        content += `\n\n[当前有效的约定]\n`;
        content += activePromises
          .map((p) => {
            return `- ${p.content} (约定人: ${p.giver}, 建立于: ${p.createdTime})`;
          })
          .join('\n');
      }

      content += `\n\n(以上状态数据仅供参考，严禁在会话中提到状态栏相关的内容)\n</current_state>`;

      this.addSection(ctx, 'game_state', '游戏变量', 'system', content);
    };

    // 全局大记忆中枢处理器 (涵盖盟友动态与势力情报网信息汇总)
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

    // 8. 长期记忆检索注入 (Dynamic RAG)
    this.blockHandlers['long_term_memory'] = async (ctx, content) => {
      // 上下文透传：此块接收由 build() 函数预处理后的记忆相似度片段列表 (Memory Content Hub)
      const gameStore = useGameStore();
      const storySummary = gameStore.state.player.storySummary;

      let finalContent = '';

      // 剧情概括注入机制 (Story Summary Injection) — 若存在系统生成的摘要，则优先放入 context 最前沿以维持逻辑一致性
      if (storySummary && storySummary.trim()) {
        finalContent += `<story_summary>\n${storySummary}\n</story_summary>\n\n`;
      }

      // 召回记忆片段注入逻辑 (Similarity Sequence) — 包含从向量/文本索引中精准检索到的历史记忆碎片 (Recall Fragments)
      if (content && content.trim()) {
        finalContent += `<memories>\n${content}\n</memories>`;
      }

      if (finalContent.trim()) {
        this.addSection(ctx, 'long_term_memory', '长期记忆', 'system', finalContent);
      }
    };
  }

  private addSection(
    ctx: PromptContext,
    id: string,
    name: string,
    role: 'system' | 'user' | 'assistant',
    content: string
  ) {
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
      maxTokens: 4000 // 默认上下文上限
    };

    // 编排中心：利用 PromptStore 定义的全局优先级规则决定各模块的最终渲染顺序与启用状态 (Block Orchestration)
    const promptStore = usePromptStore();

    for (const block of promptStore.blocks) {
      if (!block.enabled) continue;

      const handler = this.blockHandlers[block.id];
      if (handler) {
        // 特殊路由逻辑：将预先检索到的 RAG 记忆内容透传至对应的长期记忆解构块模块
        const contentToPass = block.id === 'long_term_memory' ? memoryContent : block.content;
        await handler(ctx, contentToPass);
      } else {
        console.warn(`No handler found for prompt block: ${block.id}`);
      }
    }

    // 对话锚点注入：将用户的当前即时指令追加至 Prompt 链条的最末端，以确保最高的注意力权重分配 (Final Query Anchor)
    this.addSection(ctx, 'user_instruction', '当前指令', 'user', userContent);

    return ctx;
  }

  // 后处理：将内部 PromptContext 上下文结构转换为符合 OpenAI 强校验格式的 ChatMessage 数组序列 (Adapter Pattern)
  toOpenAIMessages(ctx: PromptContext) {
    return ctx.sections
      .filter((s) => s.active)
      .map((s) => ({
        role: s.role,
        content: s.content
      }));
  }
}

export const promptService = new PromptService();

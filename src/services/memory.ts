import { dbService } from '@/services/DatabaseService';
import { useGameStore } from '@/stores/game';
import { useCharacterStore } from '@/stores/character';
import { generateCompletion } from '@/services/llm';
import _ from 'lodash';

import { useSettingsStore } from '@/stores/settings';
import { useToastStore } from '@/stores/toast';
import { memoryGraph } from './MemoryGraphService';
import { multiplayerService } from './MultiplayerService';

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c == 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// 提示词系统 (Prompts System)
const EXTRACTION_SYSTEM_PROMPT = `
你是一个RPG游戏的“书记员”（记忆系统）。
你的任务是分析最近的互动，并将关键信息提取为结构化的记忆条目。

数据输入说明:
1. 当前回合对话内容 (Turn Dialogue)
2. 游戏状态变更记录 (Actions / Variable Changes)

输出格式 (JSON):
{
  "summary": "事件客观摘要记录（采用第三人称视角）。必须详尽（建议 30-60 个中文字符）。涵盖：核心动作、揭示的关键信息以及对话的情感背景。",
  "entities": ["具体的NPC名字", "地点", "独特物品"],
  "tags": ["具体话题", "行动", "情绪", "剧情关键词"],
  "importance": 1-5 (5为关键剧情点，1为琐事),
  "facility": {
    "id": "唯一识别码 (UUID)：若匹配现有设施则填入 ID，若判断为新设施则设为 null。",
    "name": "玩家拥有的设施的具体名称 (例如 '我的酒馆', '博丽的草屋')。若无变动则留空。",
    "location": "标准区域名称 (例如 '博丽神社', '人间之里')。必须是核心区域描述，而非微观坐标。",
    "description": "设施的功能定位、装潢档次及当前运维状态的凝练描述。",
    "status": "运营状态关键词 (例如 '正常', '扩建中', '装修中', '经营中', '荒废')。",
    "sub_locations": [
      {
        "name": "子区域名称 (例如 '厨房', '仓库', '客房')",
        "description": "该子区域的具体状况、等级或详细资产内容。"
      }
    ],
    "staff": ["在此设施任职、管理或驻留的 NPC 姓名列表"],
    "is_new_acquisition": "boolean, 若玩家在本回合刚刚获得该设施的所有权，则标记为 true"
  },
  "alliance": {
    "name": "联盟/长期合作关系的正式命名",
    "content": "合作条款、共同目标及该政治/情感联盟的本质定义",
    "related_characters": ["涉及的核心角色名单"],
    "established_time": "当前游戏世界记录的日期/时间戳字符串"
  },
  "intelligence": {
    "name": "秘密或绝密情报的标题/关键词",
    "content": "揭示的真相、禁忌知识或绝密信息的详细文本内容",
    "acquired_time": "当前游戏世界记录的日期/时间戳字符串"
  }
}

核心提取重点清单:
- 关于世界规则或角色背景的新事实 (Fact Finding)。
- 角色间羁绊、关系或立场的变动。
- 重要的玩家物理行动（如：设施建造、大型战斗、大宗交易）。
- 关键剧情里程碑的推进。
- 玩家设施所有权的获取与修正（房屋、商店、工坊等）。
- **长期联盟协议**: 形成的正式或深层战略合作（而非临时的组队探险）。
- **已知绝密情报**: 揭示的重大世界性秘密或隐藏真相（非普通八卦）。

**设施管理规则**:
- 检查输入中提供的“现有设施”列表。
- 如果对话提到现有设施（即使名称略有不同，如“我的酒馆” vs “玩家的酒馆”），**你必须**重用其 UUID 和确切名称。
- 只有在 100% 确定是首次获得的新设施时，才将 "id" 设为 null。

标签 (Tags) 指南:
- 生成 3-8 个具体关键词。
- **严格格式**: 使用简洁的单词或短语（大多为 2-4 个字符）。
- **禁止**: 不要在标签中使用符号、标点或复杂短语。(例如：不要用 "治疗/安慰", 不要用 "关系-变化")。
- **示例**:
    - 坏: "情感创伤修复", "NPC关系变化", "学习新知识", "治疗/安慰"。
    - 好: "治疗", "教育", "亲密", "魔法", "敬畏", "羞耻"。
- 包含具体名词（如 '魔导书', '茶'）和抽象概念（如 '背叛', '谈判'）。
- 避免通用标签，如 '聊天', '对话', '系统'。
`;

const RETRIEVAL_SYSTEM_PROMPT = `
你是记忆检索系统。
从提供的列表中选择最相关的记忆，以帮助游戏管理员 (GM) 生成下一个回复。

输入:
1. 当前用户输入
2. 候选记忆列表 (ID: 内容)

输出:
返回选中记忆 ID 的 JSON 数组。例如 [12, 15, 2]
仅选择与当前上下文**直接相关**的记忆。
选择上限为 20 项。
如果没有相关的，返回 []。
`;

interface MemoryEntry {
  id?: number;
  saveSlotId: number;
  turnCount: number;
  type: string;
  content: string;
  tags?: string[];
  related_entities?: string[];
  importance?: number;
  createdAt?: number;
  gameDate?: string;
  gameTime?: string;
  location?: string;
  characters?: string[];
}

/**
 * 书记员记忆服务 (Scribe Memory Service / Agentic RAG)
 *
 * 核心职责：具身智能中的“记忆与世界模型 (World Model)”。
 * 负责将原始感官数据（文本/事件）加工为高度结构化的长短期记忆，并通过图谱扩散检索机制实现长效时序一致性。
 * 核心解决了大语言模型在大规模、长周期交互中的上下文窗口受限与认知遗忘问题。
 */
export class MemoryService {
  /**
   * 更新记忆关联图谱 (Memory Graph Persistence)
   * 建立“时间轴序列 (Sequence)”与“实体星型 (Entity Star)”的多维逻辑链接。
   */
  public async updateGraph(newMemory: MemoryEntry) {
    if (!newMemory.id) return;

    try {
      // 1. 时间轴链接 (Sequence Link)：将当前动作节点链接至同类型的上一条历史记忆。
      const recentMemories = await dbService.getMemoriesByType(
        newMemory.saveSlotId,
        newMemory.type,
        2
      );

      if (recentMemories.length > 1) {
        // recentMemories[0] 指向刚刚持久化的新记忆（我们在写入后立即调用此更新）。
        // recentMemories[1] 指向该类型在此之前的最近一个历史节点。
        const prevMemory = recentMemories[1];
        if (prevMemory && prevMemory.id) {
          await dbService.addMemoryRelation(newMemory.id, prevMemory.id, 'sequence', 1.0);
          memoryGraph.addConnection(newMemory.id, prevMemory.id, 1.0, 'sequence');
        }
      }

      // 2. 实体星型链接 (Entity Star)：跨越时间维度，将提及相同实体的所有记忆节点进行强关联。
      if (newMemory.related_entities && newMemory.related_entities.length > 0) {
        for (const entity of newMemory.related_entities) {
          // 深度检索：寻找历史长河中所有提及该实体的记忆切片 (Cross-time Retrieval)
          const relevant = await dbService.searchMemories(newMemory.saveSlotId, [entity]);
          // 逻辑过滤：剔除自身节点以防生成逻辑自环
          const others = relevant.filter((m) => m.id !== newMemory.id).slice(0, 5);

          for (const other of others) {
            if (other.id) {
              await dbService.addMemoryRelation(newMemory.id, other.id, 'entity', 0.8);
              memoryGraph.addConnection(newMemory.id, other.id, 0.8, 'entity');

              // 补全双向关联 (Bidirectional Reinforcement)
              await dbService.addMemoryRelation(other.id, newMemory.id, 'entity', 0.8);
              memoryGraph.addConnection(other.id, newMemory.id, 0.8, 'entity');
            }
          }
        }
      }
    } catch (e) {
      console.error('[MemoryService] 更新记忆图谱失败:', e);
    }
  }

  private async broadcastMemory(memoryData: any) {
    const gameStore = useGameStore();
    if (gameStore.multiplayer.isMultiplayer && gameStore.multiplayer.isHost) {
      multiplayerService.sendMemorySync(memoryData);
    }
  }

  /**
   * 认知提取核心：从当前回合文本与行为中剥离并持久化记忆。
   */
  async extractAndSave(
    saveSlotId: number,
    turnCount: number,
    userParam: { name: string; input: string },
    aiResponse: string,
    actions: any[],
    context?: { date: string; time: string; location: string; characters: string[] },
    signal?: AbortSignal
  ) {
    if (signal?.aborted) return;
    // 1. 持久化“硬记忆 (Hard Memories)”：基于 Actions 进行的客观物理世界变量变更。
    // 这些是从逻辑决策系统输出的确定性事实，具有最高的真实权重。
    // [优化策略]：目前主要将具备经营与资产属性的变更（金钱、物品、符卡）记录为硬记忆项。
    if (actions && actions.length > 0) {
      const variableChanges = actions.filter((a) => {
        if (a.type === 'UPDATE_PLAYER') {
          return ['money', '金钱', '持有金钱'].includes(a.field);
        }
        if (a.type === 'INVENTORY') {
          // 标记：将物品与符卡的流动视作确定性的资产变量记忆流
          return ['items', '物品', 'spell_cards', '符卡'].includes(a.target);
        }
        return false; // 暂时跳过 NPC 好感度、HP/MP 等频繁状态变动（此类信息优先交由摘要与实时属性处理）
      });

      if (variableChanges.length > 0) {
        // [幂等保护]：删除当前回合已有的同类型变量变更记录，有效防止逻辑重入导致项重复。
        await dbService.deleteMemories(saveSlotId, 'variable_change', turnCount);

        const gameStore = useGameStore();
        const charStore = useCharacterStore();

        // 文本格式化：将原始指令载荷转换为模型可读的高质量文本 (Human-readable Injection)
        const readableContent = variableChanges
          .map((a) => {
            if (a.type === 'UPDATE_PLAYER') {
              const fieldMap: Record<string, string> = {
                money: '金钱',
                金钱: '金钱',
                持有金钱: '金钱'
              };
              const fieldName = fieldMap[a.field || ''] || a.field;
              const opStr = a.op === 'add' ? '+' : a.op === 'subtract' ? '-' : '=';
              return `${fieldName}: ${opStr}${a.value}`;
            } else if (a.type === 'INVENTORY') {
              const isAdd = a.op === 'add' || a.op === 'push';
              const opStr = isAdd ? '获得' : '失去';
              let itemName = '未知物品';
              let count = 1;

              if (typeof a.value === 'string') {
                itemName = a.value.split(',')[0].trim();
              } else if (a.value && typeof a.value === 'object') {
                itemName = a.value.name || a.value.id || '未知物品';
                count = a.value.count || 1;
              }
              return `${opStr}物品: ${itemName} x${count}`;
            }
            return '';
          })
          .filter(Boolean)
          .join('\n');

        const tags = ['system', 'variable'];
        variableChanges.forEach((a) => {
          if (a.type === 'UPDATE_PLAYER') tags.push('金钱', 'player');
          if (a.type === 'INVENTORY') tags.push('物品', 'inventory');
        });

        // [Fix] Prevent duplicates for variable changes (redundant check, but safe)
        await dbService.deleteMemories(saveSlotId, 'variable_change', turnCount);

        const memData = {
          saveSlotId,
          turnCount,
          type: 'variable_change',
          content: readableContent,
          related_entities: this.extractEntityIdsFromActions(
            variableChanges,
            charStore.characters,
            gameStore.state.npcs
          ),
          tags: [...new Set(tags)],
          importance: 2, // Default importance for stat changes
          createdAt: Date.now(),
          gameDate: context?.date,
          gameTime: context?.time,
          location: context?.location,
          characters: context?.characters
        };
        const mid = await dbService.addMemory(memData);
        await this.updateGraph({ ...memData, id: mid });
        await this.broadcastMemory({ ...memData, id: mid });
      }
    }

    // 2. 持久化“软记忆 (Soft Memories)”：通过书记员模型提取剧情摘要与关键事件 (Neural Extraction)
    // 触发策略：仅在存在实质性对话上下文时执行认知提取。
    const dialogueContent = `User (${userParam.name}): ${userParam.input}\nAI: ${aiResponse}`;

    // 语境补全：获取当前活跃的所有设施快照，辅助模型执行精准识别 (Contextual Awareness)
    const facilities = await dbService.getFacilities(saveSlotId);
    const facilitiesContext = facilities
      .map(
        (f) =>
          `- [${f.id}] ${f.name} (${f.location}): ${f.description ? f.description.substring(0, 50) + '...' : 'No description'}`
      )
      .join('\n');

    try {
      const prompt = `
Existing Facilities:
${facilitiesContext || 'None'}

Dialogue:
${dialogueContent}

Actions Taken:
${JSON.stringify(actions)}
      `;

      // 调用书记员 LLM #3 (Scribe Model) 进行认知提取
      const response = await generateCompletion({
        systemPrompt: EXTRACTION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
        jsonMode: true,
        modelType: 'memory',
        signal
      });

      if (!response) throw new Error('Empty response from Memory LLM');

      // 使用统一的清理逻辑
      const content = this.cleanJsonString(response);

      const result = JSON.parse(content);

      // 错误嗅探：检测模型是否返回了有效的 JSON 记忆载荷 (Sanity Check)
      if (result.error) {
        console.warn('Memory extraction received system error response:', result.message);
        return;
      }

      if (result.summary) {
        // [幂等保护]：清理本回合同类摘要记录，保持记忆轴线性唯一。
        await dbService.deleteMemories(saveSlotId, 'summary', turnCount);

        const summaryData = {
          saveSlotId,
          turnCount,
          type: 'summary',
          content: result.summary,
          related_entities: result.entities || [],
          tags: result.tags || [],
          importance: result.importance || 3,
          createdAt: Date.now(),
          gameDate: context?.date,
          gameTime: context?.time,
          location: context?.location,
          characters: context?.characters
        };
        const mid = await dbService.addMemory(summaryData);
        await this.updateGraph({ ...summaryData, id: mid });
        await this.broadcastMemory({ ...summaryData, id: mid });
      }

      // [设施层关联逻辑]：检测并处理设施所有权变动 (Facility Logic Guard)
      if (result.facility && result.facility.name) {
        await dbService.deleteMemories(saveSlotId, 'facility', turnCount);

        const f = result.facility;

        // --- 逻辑拦截：同步更新设施注册表 (Facility Registry Consistency) ---
        let facilityId = f.id === 'null' ? null : f.id;
        let existingFacility = facilities.find((ef) => ef.id === facilityId);

        // 纠错机制：启用名称模糊匹配 (Exact/Fuzzy Match) 以防模型因微小命名差导致设施自我复制 (Duplication Guard)
        if (!existingFacility && f.name) {
          existingFacility = facilities.find((ef) => {
            if (ef.name === f.name) return true;
            if (ef.name.includes(f.name) || f.name.includes(ef.name)) return true;
            
            const c1 = new Set(ef.name);
            const c2 = new Set(f.name);
            let intersect = 0;
            c1.forEach((c) => {
              if (c2.has(c)) intersect++;
            });
            const similarity = intersect / Math.min(c1.size, c2.size);

            const minSize = Math.min(c1.size, c2.size);
            const threshold = Math.min(3, minSize);

            return intersect >= threshold && similarity >= 0.8;
          });
          
          if (existingFacility) {
            facilityId = existingFacility.id;
            f.name = existingFacility.name; // Force use existing name
          }
        }

        // 自增引导：若判定为首次发现的新设施，则为其分配新的全局唯一识别码。
        if (!facilityId) {
          facilityId = generateUUID();
        }

        const facilityRegistryData = {
          id: facilityId,
          saveSlotId,
          name: f.name,
          location: f.location || existingFacility?.location,
          description: f.description || existingFacility?.description,
          status: f.status || existingFacility?.status,
          sub_locations: f.sub_locations || existingFacility?.sub_locations,
          staff: f.staff || existingFacility?.staff,
          is_player_owned: true,
          created_at: existingFacility?.created_at
        };

        // 物理持久化：同步写入设施定义表
        await dbService.upsertFacility(facilityRegistryData);

        const subLocs =
          f.sub_locations?.map((sl: any) => `${sl.name}(${sl.description || '正常'})`).join('、') ||
          '无';
        const staff = f.staff?.length > 0 ? f.staff.join('、') : '无';

        // 文本塑造：构建一个信息详尽、符合直觉的设施描述文本快照 (Rich Content Composition)
        let readableFacility = `【${f.name}】\n`;
        readableFacility += `地点：${f.location || '未知'}\n`;
        readableFacility += `介绍：${f.description || '无'}\n`;
        readableFacility += `状态：${f.status || '正常'}${f.is_new_acquisition ? ' (新获得)' : ''}\n`;
        readableFacility += `子地点：${subLocs}\n`;
        readableFacility += `人员：${staff}`;

        const tags = ['facility', f.name, ...(result.tags || [])];
        if (f.location) tags.push(f.location);
        if (f.status) tags.push(f.status);

        const entities = [...(result.entities || [])];
        if (!entities.includes(f.name)) entities.push(f.name);

        const facilityData = {
          saveSlotId,
          turnCount,
          type: 'facility',
          content: readableFacility,
          related_entities: entities,
          tags: [...new Set(tags)],
          importance: Math.max(result.importance || 3, f.is_new_acquisition ? 5 : 4),
          createdAt: Date.now(),
          gameDate: context?.date,
          gameTime: context?.time,
          location: context?.location,
          characters: context?.characters
        };
        const mid = await dbService.addMemory(facilityData);
        await this.updateGraph({ ...facilityData, id: mid });
        await this.broadcastMemory({ ...facilityData, id: mid });
      }

      // 联盟逻辑 (Alliance Tracking)
      if (result.alliance && result.alliance.name) {
        // [幂等保护]
        await dbService.deleteMemories(saveSlotId, 'alliance', turnCount);

        const allianceData = {
          saveSlotId,
          turnCount,
          type: 'alliance',
          content: JSON.stringify(result.alliance),
          related_entities: result.alliance.related_characters || [],
          tags: ['alliance'],
          importance: 5, // Always critical
          createdAt: Date.now(),
          gameDate: context?.date,
          gameTime: context?.time,
          location: context?.location,
          characters: context?.characters
        };
        const mid = await dbService.addMemory(allianceData);
        await this.updateGraph({ ...allianceData, id: mid });
        await this.broadcastMemory({ ...allianceData, id: mid });
      }

      // 情报逻辑 (Intelligence Tracking)
      if (result.intelligence && result.intelligence.name) {
        // [幂等保护]
        await dbService.deleteMemories(saveSlotId, 'intelligence', turnCount);

        const intelData = {
          saveSlotId,
          turnCount,
          type: 'intelligence',
          content: JSON.stringify(result.intelligence),
          related_entities: [],
          tags: ['intelligence'],
          importance: 5, // Always critical
          createdAt: Date.now(),
          gameDate: context?.date,
          gameTime: context?.time,
          location: context?.location,
          characters: context?.characters
        };
        const mid = await dbService.addMemory(intelData);
        await this.updateGraph({ ...intelData, id: mid });
        await this.broadcastMemory({ ...intelData, id: mid });
      }
    } catch (error: any) {
      console.error('书记员记忆提取时遭遇模型异常:', error);
      const toastStore = useToastStore();
      toastStore.addToast(`记忆提取失败: ${error.message}`, 'error');
      // 容错降级：由模型输出失败转为静默处理，防止阻塞主流程
    }
  }

  /**
   * 辅助逻辑：允许用户/系统针对特定 AI 消息强制触发记忆补提操作。
   */
  async retryExtraction(messageId: number) {
    // 1. Fetch the assistant message
    const assistantMsg = await dbService.getChat(messageId);
    if (!assistantMsg || assistantMsg.role !== 'assistant') {
      throw new Error('无效的消息ID或消息不是AI回复');
    }

    // 2. Fetch the user message (preceding this assistant message)
    const userMsg = await dbService.getPrecedingUserMessage(messageId, assistantMsg.saveSlotId);

    if (!userMsg) {
      throw new Error('找不到关联的用户输入');
    }

    // 3. Fetch the snapshot
    if (!assistantMsg.snapshotId) {
      throw new Error('该轮次没有关联的状态快照，无法重新生成记忆');
    }
    const snapshot = await dbService.getSnapshot(assistantMsg.snapshotId);
    if (!snapshot) {
      throw new Error('快照已丢失');
    }

    const gameState = JSON.parse(snapshot.gameState);

    // 4. Extract actions from debugLog
    let actions: any[] = [];
    if (assistantMsg.debugLog?.logicOutput) {
      try {
        const logicResult = JSON.parse(assistantMsg.debugLog.logicOutput);
        actions = logicResult.actions || [];
      } catch (e) {
        console.error('解析逻辑输出失败:', e);
      }
    }

    // 5. Call extractAndSave
    return await this.extractAndSave(
      assistantMsg.saveSlotId,
      gameState.system.turn_count,
      { name: gameState.player.name, input: userMsg.content },
      assistantMsg.content,
      actions,
      {
        date: gameState.player.date,
        time: gameState.player.time,
        location: gameState.player.location,
        characters: gameState.system.current_scene_npcs.map((id: string) => {
          const npc = gameState.npcs[id];
          return npc ? npc.name : id;
        })
      }
    );
  }

  async rollback(saveSlotId: number, targetTurnCount: number) {
    // 物理层级移除：清除所有在该目标回合 (Turn) 之后产生的历史记忆切片，实现存档时间回溯。
    // SQL: DELETE FROM memories WHERE saveSlotId = ? AND turnCount > ?
    await dbService.exec('DELETE FROM memories WHERE saveSlotId = ? AND turnCount > ?', [
      saveSlotId,
      targetTurnCount
    ]);
  }

  /**
   * 全局状态检索：获取始终生效的外部环境记忆（联盟协议、绝密情报、公约等）。
   */
  async getGlobalMemories(saveSlotId: number): Promise<string> {
    try {
      // Fetch all alliance and intelligence memories
      const alliances = await dbService.getMemoriesByType(saveSlotId, 'alliance');
      const intelligences = await dbService.getMemoriesByType(saveSlotId, 'intelligence');

      let content = '';

      if (alliances.length > 0) {
        content += '<alliances>\n';
        alliances.forEach((m) => {
          try {
            const data = JSON.parse(m.content);
            content += `- [${data.name}]: ${data.content} (Related: ${data.related_characters?.join(', ') || 'None'})\n`;
          } catch (e) {
            content += `- ${m.content}\n`;
          }
        });
        content += '</alliances>\n\n';
      }

      if (intelligences.length > 0) {
        content += '<intelligence>\n';
        intelligences.forEach((m) => {
          try {
            const data = JSON.parse(m.content);
            content += `- [${data.name}]: ${data.content}\n`;
          } catch (e) {
            content += `- ${m.content}\n`;
          }
        });
        content += '</intelligence>';
      }

      return content.trim();
    } catch (error) {
      console.error('获取全局记忆失败:', error);
      return '';
    }
  }

  /**
   * 动态记忆检索核心：根据当前输入的语义空间，检索最相关的历史切片以注入上下文 (Dynamic RAG Retrieval)。
   */
  async retrieve(
    saveSlotId: number,
    currentInput: string,
    currentTurnCount: number
  ): Promise<string> {
    const result: string[] = [];
    const settingsStore = useSettingsStore();
    const enableRefinement = settingsStore.enableMemoryRefinement;

    console.log('[记忆检索] 精炼模式:', enableRefinement ? '已启用' : '已禁用');

    // 1. 条件性包含设施变动记忆（支持多设施）
    try {
      // 查询最近的设施记录（获取较多记录以覆盖不同地点）
      const allRecentFacilities = await dbService.getMemoriesByType(saveSlotId, 'facility', 20);

      if (allRecentFacilities.length > 0) {
        // 获取主角当前位置
        const gameStore = useGameStore();
        const currentLocation = gameStore.state.player.location;
        const normalizedCurrentLocation = this.normalizeLocation(currentLocation);

        // 按设施名去重，只保留每个设施最新的状态
        const facilityMap = new Map<string, MemoryEntry>();
        // Note: allRecentFacilities is already sorted by ID DESC (newest first)
        allRecentFacilities.forEach((m) => {
          const name =
            this.extractFacilityNameFromContent(m.content) ||
            `loc:${this.extractLocationFromFacility(m.content)}`;
          if (!facilityMap.has(name)) {
            facilityMap.set(name, m);
          }
        });

        const latestFacilities = Array.from(facilityMap.values());

        console.log(
          `[Memory Retrieval] Checking ${latestFacilities.length} unique facilities. Current Location:`,
          currentLocation
        );

        // 检查哪些设施应该注入
        const matchedFacilities = latestFacilities.filter((memory) => {
          const facilityLocation = this.extractLocationFromFacility(memory.content);
          const facilityName = this.extractFacilityNameFromContent(memory.content);

          if (!facilityLocation) return false;

          const isLocationMatch =
            normalizedCurrentLocation === facilityLocation ||
            normalizedCurrentLocation.includes(facilityLocation) ||
            facilityLocation.includes(normalizedCurrentLocation);

          const isMentionMatch = facilityName && currentInput.includes(facilityName);

          return isLocationMatch || isMentionMatch;
        });

        if (matchedFacilities.length > 0) {
          console.log(
            `[Memory Retrieval] Injecting ${matchedFacilities.length} facility memories.`
          );
          result.push(
            ...matchedFacilities.map((m) => {
              let meta = '';
              if (m.gameDate) meta += `[${m.gameDate} ${m.gameTime || ''}] `;
              if (m.location) meta += `[${m.location}] `;
              if (m.characters && m.characters.length > 0)
                meta += `(在场: ${m.characters.join(', ')}) `;
              return `<memory type="${m.type}" turn="${m.turnCount}">${meta}${m.content}</memory>`;
            })
          );
        }
      }
    } catch (error) {
      console.error('Failed to retrieve facility memories:', error);
    }

    // 2. 对剧情摘要进行粗筛和精选
    try {
      // A. 获取最近的30条摘要记忆
      const recentSummaries = await dbService.getMemoriesByType(saveSlotId, 'summary', 30);

      // B. 关键词搜索所有摘要记忆 (作为图谱扩散的种子节点)
      const keywords = currentInput.split(/[\s,，.。!！?？]+/).filter((k) => k.length > 1);

      let keywordMatches: MemoryEntry[] = [];
      let graphMatches: MemoryEntry[] = [];

      if (keywords.length > 0) {
        const searchResults = await dbService.searchMemories(saveSlotId, keywords);
        keywordMatches = searchResults.filter((m) => m.type === 'summary');

        // --- PEDSA Graph Activation ---
        try {
          await memoryGraph.ensureInitialized(saveSlotId);

          if (keywordMatches.length > 0) {
            const seedMap = new Map<number, number>();
            keywordMatches.forEach((m) => {
              if (m.id) seedMap.set(m.id, 1.0); // Initial energy 1.0
            });

            const activationResults = memoryGraph.spreadActivation(seedMap);

            // Filter out seeds and take top N
            const activatedIds: number[] = [];
            for (const [id, energy] of activationResults.entries()) {
              if (!seedMap.has(id) && energy > 0.1) {
                activatedIds.push(id);
              }
            }

            // Sort by energy
            activatedIds.sort(
              (a, b) => (activationResults.get(b) || 0) - (activationResults.get(a) || 0)
            );

            // Take top 10 activated memories
            const topActivatedIds = activatedIds.slice(0, 10);

            if (topActivatedIds.length > 0) {
              console.log(
                `[MemoryGraph] Found ${topActivatedIds.length} associated memories via spreading activation.`
              );
              graphMatches = await dbService.getMemoriesByIds(topActivatedIds);
            }
          }
        } catch (e) {
          console.error('[MemoryService] Graph activation failed:', e);
        }
      }

      // C. 合并并去重
      const candidatesMap = new Map<number, MemoryEntry>();
      recentSummaries.forEach((m) => candidatesMap.set(m.id!, m));
      keywordMatches.forEach((m) => candidatesMap.set(m.id!, m));
      graphMatches.forEach((m) => candidatesMap.set(m.id!, m));
      const summaryCandidates = Array.from(candidatesMap.values());

      if (summaryCandidates.length > 0) {
        if (enableRefinement) {
          // D. LLM精选 (原有逻辑)
          // 为了节省 Token，精选前我们先简单按相关性排序并取前 50 条给 LLM
          const scoredCandidates = summaryCandidates.map((m) => ({
            memory: m,
            score: this.calculateRelevanceScore(m, keywords, currentTurnCount)
          }));
          scoredCandidates.sort((a, b) => b.score - a.score);
          const topForLLM = scoredCandidates.slice(0, 50).map((x) => x.memory);

          const selectedIds = await this.refineMemoriesWithLLM(currentInput, topForLLM);

          const finalSelection = topForLLM.filter((m) => selectedIds.includes(m.id!));

          result.push(
            ...finalSelection.map((m) => {
              let meta = '';
              if (m.gameDate) meta += `[${m.gameDate} ${m.gameTime || ''}] `;
              if (m.location) meta += `[${m.location}] `;
              if (m.characters && m.characters.length > 0)
                meta += `(在场: ${m.characters.join(', ')}) `;
              return `<memory type="${m.type}" turn="${m.turnCount}">${meta}${m.content}</memory>`;
            })
          );
        } else {
          // 兜底方案：单纯的关键词匹配打分 + 线性时间衰减修正 (Keyword Search + Time Decay)
          const scoredCandidates = summaryCandidates.map((m) => ({
            memory: m,
            score: this.calculateRelevanceScore(m, keywords, currentTurnCount)
          }));

          // 按分值逆序排列，优先保留最强关联记忆
          scoredCandidates.sort((a, b) => b.score - a.score);

          // 核心保留：选取前 10 条高质量关联切片
          const top10 = scoredCandidates.slice(0, 10).map((x) => x.memory);

          result.push(
            ...top10.map((m) => {
              let meta = '';
              if (m.gameDate) meta += `[${m.gameDate} ${m.gameTime || ''}] `;
              if (m.location) meta += `[${m.location}] `;
              if (m.characters && m.characters.length > 0)
                meta += `(在场: ${m.characters.join(', ')}) `;
              return `<memory type="${m.type}" turn="${m.turnCount}">${meta}${m.content}</memory>`;
            })
          );
        }
      }
    } catch (error) {
      console.error('检索摘要记忆失败:', error);
    }

    return result.join('\n');
  }

  // --- 辅助方法与底层处理协议 (Storage & Protocol Helpers) ---

  private extractEntityIdsFromActions(actions: any[], characters: any[], npcs: any): string[] {
    const entities = new Set<string>();

    if (!actions) return [];

    actions.forEach((action) => {
      // 第一阶段：检查 'target' 字段（通常对应 NPC UUID 或设施 ID）
      if (action.target && typeof action.target === 'string') {
        // 实体解析：尝试从运行时态或静态角色库中还原名称 (Entity Binding)
        const npc = npcs[action.target];
        if (npc) {
          entities.add(npc.name);
        } else {
          // 兜底回溯：检索全局角色定义
          const char = characters.find(
            (c: any) => c.uuid === action.target || c.id === action.target
          );
          if (char) {
            entities.add(char.name);
          } else {
            entities.add(action.target);
          }
        }
      }

      // 第二阶段：检查 'characterId' 属性字段
      if (action.characterId && typeof action.characterId === 'string') {
        const npc = npcs[action.characterId];
        if (npc) {
          entities.add(npc.name);
        } else {
          entities.add(action.characterId);
        }
      }

      // 第三阶段：解析背包物品流动记录 (Inventory Flow)
      if (action.type === 'INVENTORY' && action.value) {
        if (typeof action.value === 'string') {
          entities.add(action.value.split(',')[0]);
        } else if (action.value.name) {
          entities.add(action.value.name);
        }
      }
    });

    return Array.from(entities);
  }

  private cleanJsonString(str: string): string {
    if (!str) return '';

    // 1. 移除 <think> 标签及其内容
    let content = str.replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, '');

    // 2. 移除 Markdown 代码块标记
    content = content
      .replace(/^```json\s*/, '')
      .replace(/^```\s*/, '')
      .replace(/\s*```$/, '');

    // 3. 提取最外层的 JSON 对象/数组
    const jsonStart = Math.min(
      content.indexOf('{') === -1 ? Infinity : content.indexOf('{'),
      content.indexOf('[') === -1 ? Infinity : content.indexOf('[')
    );
    const jsonEnd = Math.max(content.lastIndexOf('}'), content.lastIndexOf(']'));

    if (jsonStart !== Infinity && jsonEnd !== -1 && jsonEnd > jsonStart) {
      content = content.substring(jsonStart, jsonEnd + 1);
    }

    return content.trim();
  }

  private normalizeLocation(loc: string): string {
    if (!loc) return '';
    return loc.replace(/[\[\]【】\s]/g, '');
  }

  private extractLocationFromFacility(content: string): string {
    const match = content.match(/地点：(.*?)\n/);
    return match && match[1] ? this.normalizeLocation(match[1]) : '';
  }

  private extractFacilityNameFromContent(content: string): string {
    const match = content.match(/【(.*?)】/);
    return match && match[1] ? match[1] : '';
  }

  /**
   * 设施数据迁移索引：同步旧版设施记忆至新版物理注册表。
   * 此方法在游戏启动阶段自动触发，确保历史存档中的设施数据能够平滑迁移。
   */
  async syncOldFacilitiesToRegistry() {
    try {
      console.log('[记忆服务] 开始同步旧版设施数据...');
      const oldMemories = await dbService.getAllMemoriesAcrossSlots();
      const facilityMemories = oldMemories.filter((m) => m.type === 'facility');

      if (facilityMemories.length === 0) {
        console.log('[记忆服务] 未发现旧版设施记忆。');
        return;
      }

      // 按存档 ID 和设施名执行分组聚合，从而获取每个槽位中各个设施的最晚状态快照 (Deduplication)
      const slotMap = new Map<number, Map<string, any>>();

      // 预置排序：输入记忆流默认为按 ID 降序排列（物理时码最新优先）
      for (const m of facilityMemories) {
        if (!slotMap.has(m.saveSlotId)) {
          slotMap.set(m.saveSlotId, new Map());
        }

        const name = this.extractFacilityNameFromContent(m.content);
        if (name && !slotMap.get(m.saveSlotId)!.has(name)) {
          slotMap.get(m.saveSlotId)!.set(name, m);
        }
      }

      let syncCount = 0;
      for (const [saveSlotId, facilities] of slotMap.entries()) {
        for (const [name, memory] of facilities.entries()) {
          // 存在性幂等校验：检查注册表中是否已备案该设施
          const existing = await dbService.getFacilityByName(saveSlotId, name);
          if (!existing) {
            // 解析：执行正则表达式解包，从非结构化描述中还原核心字段 (Context Parsing)
            const location = this.extractLocationFromFacility(memory.content);
            const descriptionMatch = memory.content.match(/介绍：(.*?)\n/);
            const statusMatch = memory.content.match(/状态：(.*?)\n/);

            await dbService.upsertFacility({
              id: generateUUID(),
              saveSlotId,
              name: name,
              location: location || '',
              description: descriptionMatch ? descriptionMatch[1] : '',
              status: statusMatch ? statusMatch[1].split(' ')[0] : '正常',
              sub_locations: [], // 备注：旧版数据格式并未包含可解析的结构化子地点字段
              staff: [],
              is_player_owned: true,
              created_at: memory.createdAt
            });
            syncCount++;
          }
        }
      }

      console.log(`[记忆服务] 旧版设施数据同步完成。已迁移 ${syncCount} 个设施。`);
    } catch (err) {
      console.error('[记忆服务] 同步旧版设施失败:', err);
    }
  }

  private calculateRelevanceScore(
    memory: MemoryEntry,
    keywords: string[],
    currentTurn: number
  ): number {
    let score = 0;
    const contentStr = (memory.content + (memory.tags?.join('') || '')).toLowerCase();

    // 关键词权重匹配：根据关键词重合度进行语义分值计算
    keywords.forEach((k) => {
      if (contentStr.includes(k.toLowerCase())) score += 10;
    });

    // 时效性增益 (Recency Boost)：执行线性时间轴衰减修正
    const turnDiff = currentTurn - memory.turnCount;
    if (turnDiff < 5) score += 5;
    else if (turnDiff < 20) score += 2;

    // 重要性增益：系统原生重要度权重的累加折算
    score += (memory.importance || 0) * 2;

    return score;
  }

  private async refineMemoriesWithLLM(input: string, candidates: MemoryEntry[]): Promise<number[]> {
    if (candidates.length === 0) return [];

    const candidateList = candidates
      .map((m) => `${m.id}: ${m.content.substring(0, 100)}...`)
      .join('\n');

    const prompt = `
Current Input: ${input}

Candidate Memories:
${candidateList}
     `;

    try {
      const response = await generateCompletion({
        systemPrompt: RETRIEVAL_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
        jsonMode: true,
        modelType: 'memory'
      });

      if (!response) return [];

      const content = this.cleanJsonString(response);

      const ids = JSON.parse(content);
      return Array.isArray(ids) ? ids : [];
    } catch (e) {
      console.error('LLM 精炼失败', e);
      return [];
    }
  }
}

export const memoryService = new MemoryService();

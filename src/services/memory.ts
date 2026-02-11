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
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Prompts
const EXTRACTION_SYSTEM_PROMPT = `
你是一个RPG游戏的“书记员”（记忆系统）。
你的任务是分析最近的互动，并将关键信息提取为结构化的记忆条目。

输入:
1. 当前回合对话
2. 游戏状态变更 (采取的行动)

输出格式 (JSON):
{
  "summary": "客观的事件总结（第三人称）。必须详细（30-60个中文字符）。包括谁做了什么、揭示的关键信息以及情感背景。",
  "entities": ["具体的NPC名字", "地点", "独特物品"],
  "tags": ["具体话题", "行动", "情绪", "剧情关键词"],
  "importance": 1-5 (5为关键剧情点，1为琐事),
  "facility": {
    "id": "UUID (如果匹配现有设施)。如果是新设施则为 null。",
    "name": "玩家拥有的设施的具体名称 (例如 '玩家的酒馆', '主角的房屋')。如果没有变化，留空。",
    "location": "标准区域名称 (例如 '博丽神社', '人间之里')。必须是大概区域，而非具体地点。",
    "description": "设施的功能、质量和当前状态的简要描述。",
    "status": "运营状态关键词 (例如 '正常', '扩建中', '装修中', '荒废', '经营中')。",
    "sub_locations": [
      {
        "name": "子区域名称 (例如 '厨房', '仓库', '客房')",
        "description": "该子区域的具体状况、等级或内容。"
      }
    ],
    "staff": ["在此设施工作或管理的NPC名字"],
    "is_new_acquisition": "boolean, 如果玩家在本回合刚获得该设施的所有权，则为 true"
  },
  "alliance": {
    "name": "联盟/合作关系的名称",
    "content": "条款、目标和联盟的性质",
    "related_characters": ["涉及的角色名字"],
    "established_time": "当前游戏内的日期/时间字符串"
  },
  "intelligence": {
    "name": "秘密或情报的名称/标题",
    "content": "揭示的真相/秘密的详细内容",
    "acquired_time": "当前游戏内的日期/时间字符串"
  }
}

关注点:
- 关于世界或角色的新事实。
- 关系的变动。
- 重要的玩家行动（建造、战斗、交易）。
- 关键剧情推进。
- 设施的获取与修改（房屋、商店、农场等）。
- **长期联盟**: 形成的正式或深度的合作关系（不仅仅是临时组队）。
- **已知情报**: 揭示的重大世界秘密或隐藏真相（非普通信息）。

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
 * Scribe Memory Service (Agentic RAG / World Model)
 * 
 * 核心职责：具身智能中的“记忆与世界模型”。
 * 负责将原始感官数据（对话/事件）加工为结构化记忆，并通过两步检索机制实现长效时序一致性。
 * 解决了大语言模型在长周期交互中的上下文窗口限制问题。
 */
export class MemoryService {
  
  /**
   * Update the memory graph with a new node.
   * establishes 'sequence' (time) and 'entity' (star) connections.
   */
  public async updateGraph(newMemory: MemoryEntry) {
    if (!newMemory.id) return;
    
    try {
      // 1. Sequence Link: Connect to the most recent memory of the same type
      const recentMemories = await dbService.getMemoriesByType(newMemory.saveSlotId, newMemory.type, 2);
      
      if (recentMemories.length > 1) {
        // recentMemories[0] is the one we just added (since we call this AFTER adding)
        // recentMemories[1] is the previous one.
        const prevMemory = recentMemories[1];
        if (prevMemory && prevMemory.id) {
            await dbService.addMemoryRelation(newMemory.id, prevMemory.id, 'sequence', 1.0);
            memoryGraph.addConnection(newMemory.id, prevMemory.id, 1.0, 'sequence');
        }
      }

      // 2. Entity Star: Connect to memories sharing the same entities
      if (newMemory.related_entities && newMemory.related_entities.length > 0) {
        for (const entity of newMemory.related_entities) {
           // Search for recent memories mentioning this entity
           const relevant = await dbService.searchMemories(newMemory.saveSlotId, [entity]);
           // Filter out self
           const others = relevant.filter(m => m.id !== newMemory.id).slice(0, 5); 
           
           for (const other of others) {
             if (other.id) {
               await dbService.addMemoryRelation(newMemory.id, other.id, 'entity', 0.8);
               memoryGraph.addConnection(newMemory.id, other.id, 0.8, 'entity');
               
               // Bidirectional
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
   * Extract and save memory from the current turn.
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
    // 1. Save "Hard" Memories (Variable Changes) based on Actions
    // These are objective facts derived from the Logic System's output.
    // [Optimization] Only record critical management-related changes (Money & Items) as hard memories.
    if (actions && actions.length > 0) {
      const variableChanges = actions.filter(a => {
        if (a.type === 'UPDATE_PLAYER') {
          return ['money', '金钱', '持有金钱'].includes(a.field);
        }
        if (a.type === 'INVENTORY') {
          // Record items and spell cards as "hard" variable memories
          return ['items', '物品', 'spell_cards', '符卡'].includes(a.target);
        }
        return false; // Skip NPC favorability, HP/MP, etc. (handled by summary/current state)
      });

      if (variableChanges.length > 0) {
        // [Fix] Prevent duplicates: Delete existing variable_change for this turn
        await dbService.deleteMemories(saveSlotId, 'variable_change', turnCount);

        const gameStore = useGameStore();
        const charStore = useCharacterStore();
        
        // Format readable content for memory injection
        const readableContent = variableChanges.map(a => {
          if (a.type === 'UPDATE_PLAYER') {
            const fieldMap: Record<string, string> = { 
              'money': '金钱', 
              '金钱': '金钱', 
              '持有金钱': '金钱'
            };
            const fieldName = fieldMap[a.field || ''] || a.field;
            const opStr = a.op === 'add' ? '+' : (a.op === 'subtract' ? '-' : '=');
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
        }).filter(Boolean).join('\n');

        const tags = ['system', 'variable'];
        variableChanges.forEach(a => {
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
          related_entities: this.extractEntityIdsFromActions(variableChanges, charStore.characters, gameStore.state.npcs),
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

    // 2. Generate "Soft" Memories (Summary & Events) using LLM
    // We only trigger this if there was meaningful dialogue
    const dialogueContent = `User (${userParam.name}): ${userParam.input}\nAI: ${aiResponse}`;
    
    // Fetch existing facilities for context
    const facilities = await dbService.getFacilities(saveSlotId);
    const facilitiesContext = facilities.map(f => 
      `- [${f.id}] ${f.name} (${f.location}): ${f.description ? f.description.substring(0, 50) + '...' : 'No description'}`
    ).join('\n');

    try {
      const prompt = `
Existing Facilities:
${facilitiesContext || 'None'}

Dialogue:
${dialogueContent}

Actions Taken:
${JSON.stringify(actions)}
      `;

      // TODO: Call LLM #3 (Scribe)
      // For now, we simulate or assume a function exists.
      // Since LLM service structure isn't fully clear, I'll write a placeholder call.
      
      const response = await generateCompletion({
        systemPrompt: EXTRACTION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
        jsonMode: true,
        modelType: 'memory',
        signal
      });

      const cleanedResponse = this.cleanJsonString(response || '{}');
      const result = JSON.parse(cleanedResponse);
      
      if (result.summary) {
        // [Fix] Prevent duplicates: Delete existing summary for this turn
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

      // [Fix] Prevent duplicates for facilities
      if (result.facility && result.facility.name) {
          await dbService.deleteMemories(saveSlotId, 'facility', turnCount);

        const f = result.facility;
        
        // --- LOGIC INTERCEPTION: Update Facility Registry ---
        let facilityId = f.id;
        let existingFacility = facilities.find(ef => ef.id === facilityId);

        // Fallback: Name match
        if (!existingFacility) {
            existingFacility = facilities.find(ef => ef.name === f.name);
            if (existingFacility) facilityId = existingFacility.id;
        }

        // Create ID if new
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

        // Update Registry
        await dbService.upsertFacility(facilityRegistryData);

        const subLocs = f.sub_locations?.map((sl: any) => `${sl.name}(${sl.description || '正常'})`).join('、') || '无';
        const staff = f.staff?.length > 0 ? f.staff.join('、') : '无';
        
        // Build a rich, readable content string
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

      // Handle Alliance
      if (result.alliance && result.alliance.name) {
         // [Fix] Prevent duplicates for alliance
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

      // Handle Intelligence
      if (result.intelligence && result.intelligence.name) {
         // [Fix] Prevent duplicates for intelligence
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
      console.error('Failed to extract memory via LLM:', error);
      const toastStore = useToastStore();
      toastStore.addToast(`记忆提取失败: ${error.message}`, 'error');
      // Fallback: Just save raw dialogue summary if LLM fails? 
      // Or just skip.
    }
  }

  /**
   * Manually retry memory extraction for a specific assistant message.
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
     // Delete all memories created AFTER the target turn count
     // SQL: DELETE FROM memories WHERE saveSlotId = ? AND turnCount > ?
     await dbService.exec(
        'DELETE FROM memories WHERE saveSlotId = ? AND turnCount > ?',
        [saveSlotId, targetTurnCount]
     );
  }

  /**
   * Retrieve global memories (Alliance & Intelligence) that are always active.
   */
  async getGlobalMemories(saveSlotId: number): Promise<string> {
    try {
      // Fetch all alliance and intelligence memories
      const alliances = await dbService.getMemoriesByType(saveSlotId, 'alliance');
      const intelligences = await dbService.getMemoriesByType(saveSlotId, 'intelligence');
      
      let content = '';
      
      if (alliances.length > 0) {
        content += '<alliances>\n';
        alliances.forEach(m => {
          try {
             const data = JSON.parse(m.content);
             content += `- [${data.name}]: ${data.content} (Related: ${data.related_characters?.join(', ') || 'None'})\n`;
          } catch(e) {
             content += `- ${m.content}\n`;
          }
        });
        content += '</alliances>\n\n';
      }
      
      if (intelligences.length > 0) {
        content += '<intelligence>\n';
        intelligences.forEach(m => {
          try {
             const data = JSON.parse(m.content);
             content += `- [${data.name}]: ${data.content}\n`;
          } catch(e) {
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
   * Retrieve relevant memories for the current context.
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
        allRecentFacilities.forEach(m => {
          const name = this.extractFacilityNameFromContent(m.content) || `loc:${this.extractLocationFromFacility(m.content)}`;
          if (!facilityMap.has(name)) {
            facilityMap.set(name, m);
          }
        });

        const latestFacilities = Array.from(facilityMap.values());

        console.log(`[Memory Retrieval] Checking ${latestFacilities.length} unique facilities. Current Location:`, currentLocation);

        // 检查哪些设施应该注入
        const matchedFacilities = latestFacilities.filter(memory => {
          const facilityLocation = this.extractLocationFromFacility(memory.content);
          const facilityName = this.extractFacilityNameFromContent(memory.content);
          
          if (!facilityLocation) return false;
          
          const isLocationMatch = normalizedCurrentLocation === facilityLocation ||
                                  normalizedCurrentLocation.includes(facilityLocation) ||
                                  facilityLocation.includes(normalizedCurrentLocation);
          
          const isMentionMatch = facilityName && currentInput.includes(facilityName);

          return isLocationMatch || isMentionMatch;
        });

        if (matchedFacilities.length > 0) {
          console.log(`[Memory Retrieval] Injecting ${matchedFacilities.length} facility memories.`);
          result.push(...matchedFacilities.map(m => {
            let meta = '';
            if (m.gameDate) meta += `[${m.gameDate} ${m.gameTime || ''}] `;
            if (m.location) meta += `[${m.location}] `;
            if (m.characters && m.characters.length > 0) meta += `(在场: ${m.characters.join(', ')}) `;
            return `<memory type="${m.type}" turn="${m.turnCount}">${meta}${m.content}</memory>`;
          }));
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
      const keywords = currentInput.split(/[\s,，.。!！?？]+/).filter(k => k.length > 1);
      
      let keywordMatches: MemoryEntry[] = [];
      let graphMatches: MemoryEntry[] = [];

      if (keywords.length > 0) {
          const searchResults = await dbService.searchMemories(saveSlotId, keywords);
          keywordMatches = searchResults.filter(m => m.type === 'summary');

          // --- PEDSA Graph Activation ---
          try {
            await memoryGraph.ensureInitialized(saveSlotId);

            if (keywordMatches.length > 0) {
                const seedMap = new Map<number, number>();
                keywordMatches.forEach(m => {
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
                activatedIds.sort((a, b) => (activationResults.get(b) || 0) - (activationResults.get(a) || 0));
                
                // Take top 10 activated memories
                const topActivatedIds = activatedIds.slice(0, 10);
                
                if (topActivatedIds.length > 0) {
                    console.log(`[MemoryGraph] Found ${topActivatedIds.length} associated memories via spreading activation.`);
                    graphMatches = await dbService.getMemoriesByIds(topActivatedIds);
                }
            }
          } catch (e) {
            console.error('[MemoryService] Graph activation failed:', e);
          }
      }

      // C. 合并并去重
      const candidatesMap = new Map<number, MemoryEntry>();
      recentSummaries.forEach(m => candidatesMap.set(m.id!, m));
      keywordMatches.forEach(m => candidatesMap.set(m.id!, m));
      graphMatches.forEach(m => candidatesMap.set(m.id!, m));
      const summaryCandidates = Array.from(candidatesMap.values());

      if (summaryCandidates.length > 0) {
        if (enableRefinement) {
          // D. LLM精选 (原有逻辑)
          // 为了节省 Token，精选前我们先简单按相关性排序并取前 50 条给 LLM
          const scoredCandidates = summaryCandidates.map(m => ({
            memory: m,
            score: this.calculateRelevanceScore(m, keywords, currentTurnCount)
          }));
          scoredCandidates.sort((a, b) => b.score - a.score);
          const topForLLM = scoredCandidates.slice(0, 50).map(x => x.memory);
          
          const selectedIds = await this.refineMemoriesWithLLM(currentInput, topForLLM);
          
          const finalSelection = topForLLM.filter(m => selectedIds.includes(m.id!));
          
          result.push(...finalSelection.map(m => {
             let meta = '';
             if (m.gameDate) meta += `[${m.gameDate} ${m.gameTime || ''}] `;
             if (m.location) meta += `[${m.location}] `;
             if (m.characters && m.characters.length > 0) meta += `(在场: ${m.characters.join(', ')}) `;
             return `<memory type="${m.type}" turn="${m.turnCount}">${meta}${m.content}</memory>`;
          }));
        } else {
          // Fallback: 简单的关键词匹配打分 + 时间衰减
          const scoredCandidates = summaryCandidates.map(m => ({
            memory: m,
            score: this.calculateRelevanceScore(m, keywords, currentTurnCount)
          }));

          // Sort by score desc
          scoredCandidates.sort((a, b) => b.score - a.score);
          
          // Take top 10
          const top10 = scoredCandidates.slice(0, 10).map(x => x.memory);
          
          result.push(...top10.map(m => {
             let meta = '';
             if (m.gameDate) meta += `[${m.gameDate} ${m.gameTime || ''}] `;
             if (m.location) meta += `[${m.location}] `;
             if (m.characters && m.characters.length > 0) meta += `(在场: ${m.characters.join(', ')}) `;
             return `<memory type="${m.type}" turn="${m.turnCount}">${meta}${m.content}</memory>`;
          }));
        }
      }
    } catch (error) {
      console.error('检索摘要记忆失败:', error);
    }

    return result.join('\n');
  }

  // --- Helper Methods ---

  private extractEntityIdsFromActions(actions: any[], characters: any[], npcs: any): string[] {
    const entities = new Set<string>();
    
    if (!actions) return [];

    actions.forEach(action => {
      // 1. Check for 'target' (usually NPC ID)
      if (action.target && typeof action.target === 'string') {
        // Try to resolve name from NPCs or Characters
        const npc = npcs[action.target];
        if (npc) {
          entities.add(npc.name);
        } else {
          // Try global characters
          const char = characters.find((c: any) => c.uuid === action.target || c.id === action.target);
          if (char) {
            entities.add(char.name);
          } else {
            entities.add(action.target);
          }
        }
      }
      
      // 2. Check for 'characterId'
      if (action.characterId && typeof action.characterId === 'string') {
         const npc = npcs[action.characterId];
         if (npc) {
            entities.add(npc.name);
         } else {
             entities.add(action.characterId);
         }
      }
      
      // 3. Inventory items
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
    return str.replace(/```json/g, '').replace(/```/g, '').trim();
  }

  private normalizeLocation(loc: string): string {
    if (!loc) return '';
    return loc.replace(/[\[\]【】\s]/g, '');
  }

  private extractLocationFromFacility(content: string): string {
    const match = content.match(/地点：(.*?)\n/);
    return (match && match[1]) ? this.normalizeLocation(match[1]) : '';
  }

  private extractFacilityNameFromContent(content: string): string {
     const match = content.match(/【(.*?)】/);
     return (match && match[1]) ? match[1] : '';
  }

  /**
   * Sync old facility memories to the new registry.
   * This is called on game startup to ensure old data is migrated.
   */
  async syncOldFacilitiesToRegistry() {
    try {
      console.log('[记忆服务] 开始同步旧版设施数据...');
      const oldMemories = await dbService.getAllMemoriesAcrossSlots();
      const facilityMemories = oldMemories.filter(m => m.type === 'facility');
      
      if (facilityMemories.length === 0) {
        console.log('[记忆服务] 未发现旧版设施记忆。');
        return;
      }

      // Group by saveSlotId and then by facility name to get the LATEST state for each facility per slot
      const slotMap = new Map<number, Map<string, any>>();
      
      // memories are already sorted by ID DESC (newest first)
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
          // Check if already in registry
          const existing = await dbService.getFacilityByName(saveSlotId, name);
          if (!existing) {
            // Extract data from content
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
              sub_locations: [], // Old format didn't have structured sub_locations easily extractable
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

  private calculateRelevanceScore(memory: MemoryEntry, keywords: string[], currentTurn: number): number {
    let score = 0;
    const contentStr = (memory.content + (memory.tags?.join('') || '')).toLowerCase();
    
    // Keyword match
    keywords.forEach(k => {
      if (contentStr.includes(k.toLowerCase())) score += 10;
    });

    // Recency boost (simple decay)
    const turnDiff = currentTurn - memory.turnCount;
    if (turnDiff < 5) score += 5;
    else if (turnDiff < 20) score += 2;

    // Importance boost
    score += (memory.importance || 0) * 2;

    return score;
  }

  private async refineMemoriesWithLLM(input: string, candidates: MemoryEntry[]): Promise<number[]> {
     if (candidates.length === 0) return [];
     
     const candidateList = candidates.map(m => `${m.id}: ${m.content.substring(0, 100)}...`).join('\n');
     
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
         
         const cleaned = this.cleanJsonString(response || '[]');
         const ids = JSON.parse(cleaned);
         return Array.isArray(ids) ? ids : [];
     } catch (e) {
         console.error('LLM 精炼失败', e);
         return [];
    }
  }
}

export const memoryService = new MemoryService();

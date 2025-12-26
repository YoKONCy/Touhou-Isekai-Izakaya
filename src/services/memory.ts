import { db, type MemoryEntry, type ChatMessage } from '@/db';
import { useGameStore } from '@/stores/game';
import { useCharacterStore } from '@/stores/character';
import { generateCompletion } from '@/services/llm';
import { resolveCharacterId } from '@/services/characterMapping';
import _ from 'lodash';

import { useSettingsStore } from '@/stores/settings';
import { useToastStore } from '@/stores/toast';

// Prompts
const EXTRACTION_SYSTEM_PROMPT = `
You are the "Scribe" (Memory System) for an RPG game.
Your task is to analyze the latest interaction and extract key information into structured memory entries.

Input:
1. Current Turn Dialogue
2. Game State Changes (Actions taken)

Output Format (JSON):
{
  "summary": "Objective summary of the event (3rd person). Must be detailed (30-60 Chinese characters). Include WHO did WHAT, key information revealed, and emotional context.",
  "entities": ["Specific NPC Names", "Locations", "Unique Items"],
  "tags": ["Specific Topics", "Actions", "Emotions", "Plot Keywords"],
  "importance": 1-5 (5 is critical plot point, 1 is trivial),
  "facility": {
    "name": "Specific name of player-owned facility (e.g., '玩家的酒馆', '主角的房屋'). If no change, leave empty.",
    "location": "Standard area name (e.g., '博丽神社', '人间之里'). Must be the general area, not specific spot.",
    "description": "Brief description of the facility's function, quality, and current state.",
    "status": "Operational status keyword (e.g., '正常', '扩建中', '装修中', '荒废', '经营中').",
    "sub_locations": [
      {
        "name": "Sub-area name (e.g., '厨房', '仓库', '客房')",
        "description": "Specific condition, level, or contents of this sub-area."
      }
    ],
    "staff": ["Names of NPCs working at or managing this facility"],
    "is_new_acquisition": "boolean, true if the player just gained ownership of this facility this turn"
  },
  "alliance": {
    "name": "Name of the alliance/partnership",
    "content": "Terms, goals, and nature of the alliance",
    "related_characters": ["Names of characters involved"],
    "established_time": "Current in-game date/time string"
  },
  "intelligence": {
    "name": "Name/Title of the secret or intelligence",
    "content": "Detailed content of the truth/secret revealed",
    "acquired_time": "Current in-game date/time string"
  }
}

Focus on:
- New facts learned about the world or characters.
- Changes in relationships.
- Significant player actions (building, fighting, trading).
- Key plot progression.
- Facility acquisitions and modifications (houses, shops, farms, etc.)
- **Long-term Alliances**: Formal or deep cooperative relationships formed (not just temporary teams).
- **Known Intelligence**: Major world secrets or hidden truths revealed (not common info).

Instructions for Tags:
- Generate 3-8 specific keywords.
- **Strict Format**: Use concise, single words or short phrases (mostly 2-4 characters).
- **Prohibited**: Do NOT use symbols, punctuation, or complex phrases within a tag. (e.g. NO "Healing/Comfort", NO "Relationship-Change").
- **Examples**:
    - Bad: "Emotional Trauma Repair", "NPC Relationship Change", "Learning New Knowledge", "Healing/Comfort".
    - Good: "Healing", "Education", "Intimacy", "Magic", "Awe", "Shame".
- Include concrete nouns (e.g. 'Grimoire', 'Tea') and abstract concepts (e.g. 'Betrayal', 'Negotiation').
- Avoid generic tags like 'chat', 'dialogue', 'system'.
`;

const RETRIEVAL_SYSTEM_PROMPT = `
You are the Memory Retrieval System.
Select the most relevant memories from the provided list to help the Game Master generate the next response.

Input:
1. Current User Input
2. List of Candidate Memories (ID: Content)

Output:
Return a JSON array of selected Memory IDs. e.g. [12, 15, 2]
Select ONLY memories that are directly relevant to the current context.
Limit your selection to a maximum of 20 items.
If nothing is relevant, return [].
`;

/**
 * Scribe Memory Service (Agentic RAG / World Model)
 * 
 * 核心职责：具身智能中的“记忆与世界模型”。
 * 负责将原始感官数据（对话/事件）加工为结构化记忆，并通过两步检索机制实现长效时序一致性。
 * 解决了大语言模型在长周期交互中的上下文窗口限制问题。
 */
export class MemoryService {
  
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
        await db.memories.where('[saveSlotId+type+turnCount]')
          .equals([saveSlotId, 'variable_change', turnCount])
          .delete();

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

        // [Fix] Prevent duplicates for variable changes
        await db.memories.where('[saveSlotId+type+turnCount]')
          .equals([saveSlotId, 'variable_change', turnCount])
          .delete();

        await db.memories.add({
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
        });
      }
    }

    // 2. Generate "Soft" Memories (Summary & Events) using LLM
    // We only trigger this if there was meaningful dialogue
    const dialogueContent = `User (${userParam.name}): ${userParam.input}\nAI: ${aiResponse}`;
    
    try {
      const prompt = `
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
        await db.memories.where('[saveSlotId+type+turnCount]')
          .equals([saveSlotId, 'summary', turnCount])
          .delete();

        await db.memories.add({
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
        });
      }

      // [Fix] Prevent duplicates for facilities
      if (result.facility && result.facility.name) {
          await db.memories.where('[saveSlotId+type+turnCount]')
            .equals([saveSlotId, 'facility', turnCount])
            .delete();

        const f = result.facility;
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

        await db.memories.add({
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
        });
      }

      // Handle Alliance
      if (result.alliance && result.alliance.name) {
         // [Fix] Prevent duplicates for alliance
         await db.memories.where('[saveSlotId+type+turnCount]')
           .equals([saveSlotId, 'alliance', turnCount])
           .delete();

         await db.memories.add({
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
         });
      }

      // Handle Intelligence
      if (result.intelligence && result.intelligence.name) {
         // [Fix] Prevent duplicates for intelligence
         await db.memories.where('[saveSlotId+type+turnCount]')
           .equals([saveSlotId, 'intelligence', turnCount])
           .delete();

         await db.memories.add({
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
         });
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
    const assistantMsg = await db.chats.get(messageId);
    if (!assistantMsg || assistantMsg.role !== 'assistant') {
      throw new Error('无效的消息ID或消息不是AI回复');
    }

    // 2. Fetch the user message (preceding this assistant message)
    const userMsg = await db.chats
      .where('id')
      .below(messageId)
      .and((m: ChatMessage) => m.saveSlotId === assistantMsg.saveSlotId && m.role === 'user')
      .last();
    
    if (!userMsg) {
      throw new Error('找不到关联的用户输入');
    }

    // 3. Fetch the snapshot
    if (!assistantMsg.snapshotId) {
      throw new Error('该轮次没有关联的状态快照，无法重新生成记忆');
    }
    const snapshot = await db.snapshots.get(assistantMsg.snapshotId);
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
        console.error('Failed to parse logic output:', e);
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
    
    console.log('[Memory Retrieval] Refinement mode:', enableRefinement ? 'ENABLED' : 'DISABLED');

    // 1. 条件性包含设施变动记忆（支持多设施）
    try {
      // 查询最近的设施记录（获取较多记录以覆盖不同地点）
      const allRecentFacilities = await db.memories
        .where(['saveSlotId', 'type'])
        .equals([saveSlotId, 'facility'])
        .reverse()
        .limit(20)
        .toArray();

      if (allRecentFacilities.length > 0) {
        // 获取主角当前位置
        const gameStore = useGameStore();
        const currentLocation = gameStore.state.player.location;
        const normalizedCurrentLocation = this.normalizeLocation(currentLocation);

        // 按设施名去重，只保留每个设施最新的状态
        const facilityMap = new Map<string, MemoryEntry>();
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
      const recentSummaries = await db.memories
        .where(['saveSlotId', 'type'])
        .equals([saveSlotId, 'summary'])
        .reverse()
        .limit(30)
        .toArray();

      // B. 关键词搜索所有摘要记忆
      const allSummaries = await db.memories
        .where(['saveSlotId', 'type'])
        .equals([saveSlotId, 'summary'])
        .reverse()
        .toArray();

      const keywords = currentInput.split(/[\s,，.。!！?？]+/).filter(k => k.length > 1);
      
      const keywordMatches = allSummaries.filter(m => {
        const contentStr = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        // Check content
        if (keywords.some(k => contentStr.includes(k))) return true;
        // Check tags
        if (m.tags && m.tags.some(t => keywords.some(k => t.includes(k) || k.includes(t)))) return true;
        // Check entities
        if (m.related_entities && m.related_entities.some(e => keywords.some(k => e.includes(k) || k.includes(e)))) return true;
        return false;
      });

      // C. 合并并去重
      const candidatesMap = new Map<number, MemoryEntry>();
      recentSummaries.forEach(m => candidatesMap.set(m.id, m));
      keywordMatches.forEach(m => candidatesMap.set(m.id, m)); // Use all keyword matches for scoring
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
          
          console.log('[Memory Retrieval] Retrieved', topForLLM.length, 'candidates for LLM refinement');

          const candidates = topForLLM.map(m => {
            let meta = '';
            if (m.gameDate) meta += `[${m.gameDate} ${m.gameTime || ''}] `;
            if (m.location) meta += `[${m.location}] `;
            if (m.characters && m.characters.length > 0) meta += `(在场: ${m.characters.join(', ')}) `;
            if (m.related_entities && m.related_entities.length > 0) meta += `(相关: ${m.related_entities.join(', ')}) `;
            const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
            return `[ID: ${m.id}] (${m.type}) ${meta}${content}`;
          }).join('\n');

          const prompt = `
Current User Input: "${currentInput}"

Candidate Memories:
${candidates}
          `;

          const response = await generateCompletion({
            systemPrompt: RETRIEVAL_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: prompt }],
            jsonMode: true,
            modelType: 'memory'
          });

          const cleanedResponse = this.cleanJsonString(response || '[]');
          const selectedIds: number[] = JSON.parse(cleanedResponse);
          console.log('[Memory Retrieval] LLM selected IDs:', selectedIds);
          
          if (Array.isArray(selectedIds) && selectedIds.length > 0) {
            const selectedMemories = topForLLM.filter(m => selectedIds.includes(m.id));
            console.log('[Memory Retrieval] Final memory count (refined):', selectedMemories.length);
            result.push(...selectedMemories.map(m => {
              let meta = '';
              if (m.gameDate) meta += `[${m.gameDate} ${m.gameTime || ''}] `;
              if (m.location) meta += `[${m.location}] `;
              if (m.characters && m.characters.length > 0) meta += `(在场: ${m.characters.join(', ')}) `;
              if (m.related_entities && m.related_entities.length > 0) meta += `(相关: ${m.related_entities.join(', ')}) `;
              return `<memory type="${m.type}">${meta}${m.content}</memory>`;
            }));
          }
        } else {
          // E. 粗筛模式 (无需 LLM)
          // 评分并取前 50 条
          const scoredCandidates = summaryCandidates.map(m => ({
            memory: m,
            score: this.calculateRelevanceScore(m, keywords, currentTurnCount)
          }));
          
          scoredCandidates.sort((a, b) => b.score - a.score);
          
          const topCandidates = scoredCandidates.slice(0, 50).map(x => x.memory);
          
          console.log('[Memory Retrieval] Coarse filtering mode - top', topCandidates.length, 'memories selected');
          console.log('[Memory Retrieval] Final memory count (coarse):', topCandidates.length);
          
          result.push(...topCandidates.map(m => {
            let meta = '';
            if (m.gameDate) meta += `[${m.gameDate} ${m.gameTime || ''}] `;
            if (m.location) meta += `[${m.location}] `;
            if (m.characters && m.characters.length > 0) meta += `(在场: ${m.characters.join(', ')}) `;
            if (m.related_entities && m.related_entities.length > 0) meta += `(相关: ${m.related_entities.join(', ')}) `;
            return `<memory type="${m.type}">${meta}${m.content}</memory>`;
          }));
        }
      }
    } catch (error: any) {
      console.error('Memory retrieval failed:', error);
      const toastStore = useToastStore();
      toastStore.addToast(`记忆检索失败: ${error.message}`, 'error');
    }

    // 3. 获取最近的变量变动（硬记忆，如金钱、道具变动）
    try {
      const recentVariables = await db.memories
        .where(['saveSlotId', 'type'])
        .equals([saveSlotId, 'variable_change'])
        .reverse()
        .limit(5)
        .toArray();
      
      if (recentVariables.length > 0) {
        result.push(...recentVariables.map(m => 
          `<memory type="variable" turn="${m.turnCount}">${m.content}</memory>`
        ));
      }
    } catch (error) {
      console.error('Failed to retrieve variable memories:', error);
    }

    return result.join('\n');
  }

  /**
   * Rollback memories to a specific turn (e.g. after loading a save).
   * Deletes all memories created AFTER the target turn.
   */
  async rollback(saveSlotId: number, targetTurnCount: number) {
    await db.memories
      .where('[saveSlotId+turnCount]')
      .between([saveSlotId, targetTurnCount + 1], [saveSlotId, Infinity])
      .delete();
  }

  private extractEntityIdsFromActions(actions: any[], staticCharacters: any[] = [], runtimeNpcs: Record<string, any> = {}): string[] {
    const entities = new Set<string>();
    actions.forEach(a => {
      if (a.npcId) entities.add(resolveCharacterId(a.npcId, staticCharacters, runtimeNpcs));
      if (a.add_chars) a.add_chars.forEach((c: any) => {
          const rawId = typeof c === 'string' ? c : c.id || c.name;
          entities.add(resolveCharacterId(rawId, staticCharacters, runtimeNpcs));
      });
    });
    return Array.from(entities);
  }

  /**
   * Helper to clean JSON string from LLM response (remove markdown, extra text)
   */
  private cleanJsonString(str: string): string {
    if (!str) return '';
    let cleaned = str.trim();
    
    // Remove markdown code blocks if present
     const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
     const match = cleaned.match(codeBlockRegex);
     if (match && match[1]) {
       cleaned = match[1].trim();
     }
    
    // Try to find the valid JSON object or array
    // Look for the first '{' or '[' and the last '}' or ']'
    const firstBrace = cleaned.search(/[{\[]/);
    if (firstBrace !== -1) {
      // Find the corresponding closing character
      const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
      if (lastBrace !== -1 && lastBrace > firstBrace) {
         cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }
    }
    
    return cleaned;
  }

  /**
   * 从设施变动条目中提取地点信息
   * 支持新格式：地点：[地点]
   * 以及旧格式：地点：[地点]，介绍：...
   */
  private extractLocationFromFacility(content: string | any): string | null {
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    // 匹配"地点："后面到换行或逗号之前的内容
    const locationMatch = contentStr.match(/地点：([^，\n\r]+)/);
    if (locationMatch && locationMatch[1]) {
      return locationMatch[1].trim();
    }
    return null;
  }

  /**
   * 从设施内容中提取设施名称
   * 支持新格式：【设施名称】
   * 以及旧格式的推断
   */
  private extractFacilityNameFromContent(content: string | any): string | null {
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    
    // 1. 匹配新格式 【设施名称】
    const nameMatch = contentStr.match(/【([^】]+)】/);
    if (nameMatch && nameMatch[1]) {
      return nameMatch[1].trim();
    }

    // 2. 兼容旧数据推断
    const locationMatch = contentStr.match(/地点：([^，\n]+)/);
    if (locationMatch && locationMatch[1]) {
      const location = locationMatch[1].trim();
      if (['博丽神社', '雾之湖', '人间之里', '红魔馆', '白玉楼', '永远亭'].includes(location)) {
        return location;
      }
      if (contentStr.includes('酒馆')) return location + '酒馆';
      if (contentStr.includes('农田')) return location + '农田';
      if (contentStr.includes('工坊')) return location + '工坊';
      return location;
    }
    return null;
  }

  /**
   * Retrieve global/permanent memories (Alliance, Intelligence).
   */
  async getGlobalMemories(saveSlotId: number): Promise<string> {
    const memories = await db.memories
      .where('[saveSlotId+type]')
      .anyOf([saveSlotId, 'alliance'], [saveSlotId, 'intelligence'])
      .toArray();

    if (memories.length === 0) return '';

    let output = '';
    
    const alliances = memories.filter(m => m.type === 'alliance');
    if (alliances.length > 0) {
      output += `<alliances>\n`;
      alliances.forEach(m => {
        try {
          const data = JSON.parse(m.content);
          output += `<alliance>\n`;
          output += `  <name>${data.name}</name>\n`;
          output += `  <content>${data.content}</content>\n`;
          if (data.related_characters && data.related_characters.length > 0) {
            output += `  <related>${data.related_characters.join(', ')}</related>\n`;
          }
          if (data.established_time) {
            output += `  <time>${data.established_time}</time>\n`;
          }
          output += `</alliance>\n`;
        } catch (e) {
          // Fallback for raw text
          output += `<alliance>${m.content}</alliance>\n`;
        }
      });
      output += `</alliances>\n`;
    }

    const intelligence = memories.filter(m => m.type === 'intelligence');
    if (intelligence.length > 0) {
      output += `<known_intelligence>\n`;
      intelligence.forEach(m => {
        try {
          const data = JSON.parse(m.content);
          output += `<intelligence>\n`;
          output += `  <name>${data.name}</name>\n`;
          output += `  <content>${data.content}</content>\n`;
          if (data.acquired_time) {
            output += `  <time>${data.acquired_time}</time>\n`;
          }
          output += `</intelligence>\n`;
        } catch (e) {
          output += `<intelligence>${m.content}</intelligence>\n`;
        }
      });
      output += `</known_intelligence>\n`;
    }

    return output;
  }

  // Calculate relevance score (simple keyword matching + recency)
  private calculateRelevanceScore(memory: MemoryEntry, keywords: string[], currentTurnCount: number): number {
    let score = 0;
    const contentStr = typeof memory.content === 'string' ? memory.content : JSON.stringify(memory.content);
    
    // 1. Keyword Matching (Content: 10 pts per match)
    keywords.forEach(k => {
      if (contentStr.includes(k)) score += 10;
    });

    // 2. Tags Matching (3 pts per match)
    if (memory.tags) {
      memory.tags.forEach(t => {
        if (keywords.some(k => t.includes(k) || k.includes(t))) score += 3;
      });
    }

    // 3. Entities Matching (5 pts per match)
    if (memory.related_entities) {
      memory.related_entities.forEach(e => {
        if (keywords.some(k => e.includes(k) || k.includes(e))) score += 5;
      });
    }

    // 4. Importance Weight (1-5) * 2
    score += (memory.importance || 1) * 2;

    // 5. Recency Decay (Linear decay based on turn count difference)
    // Recent memories get a boost.
    const age = currentTurnCount - memory.turnCount;
    if (age < 50) {
      score += Math.max(0, 20 - age * 0.4); 
    }

    return score;
  }

  /**
   * 标准化地点名称，提取主要地点部分
   * 支持：博丽神社、正殿前 → 博丽神社
   *      雾之湖，芦苇丛左侧 → 雾之湖
   *      人间之里/商业街 → 人间之里
   */
  private normalizeLocation(location: string): string {
    if (!location) return '';
    // 匹配：地点 + 分割符 + 其他内容
    // 支持更多分隔符：、，／ , / | 空格
    const match = location.match(/^([^、，／,/\s|]+)[、，／,/\s|]/);
    if (match && match[1]) {
      return match[1].trim();
    }
    return location;
  }
}

export const memoryService = new MemoryService();

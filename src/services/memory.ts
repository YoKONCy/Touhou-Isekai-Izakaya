import { db, type MemoryEntry } from '@/db';
import { useGameStore } from '@/stores/game';
import { generateCompletion } from './llm'; // Assume this exists
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
  "facility": "If player acquired/modified/renovated any building, place, property or facility that the player OWNS or has ACCESS TO, describe it with: 地点：[使用该区域的标准地点名称，如'博丽神社'、'雾之湖'、'人间之里'等，不要使用'博丽神社正殿前'这样的具体位置]，介绍：[设施简要介绍]，子地点：[设施内的具体子地点]，人员：[设施相关人员]。If no facility changes, leave empty. 注意：地点字段应使用该区域的标准名称，便于后续匹配。\n\n重要：只记录玩家拥有或可以使用控制的设施，不要记录幻想乡中原本就存在的公共设施（如博丽神社、红魔馆等），除非玩家真正获得了这些设施的所有权或管理权。\n\n设施包括但不限于：房屋、店铺、酒馆、农田、牧场、工坊、仓库、学校、医院、市场、公园、桥梁、道路、井、池塘、花园、温泉、矿山、森林、洞穴、城堡、要塞等任何玩家拥有或可以使用的固定建筑和场所。",
  "facility_name": "If there is a facility change, provide the specific name of player-owned facility (e.g., '玩家的酒馆', '雾之湖农田', '人间之里工坊', '主角的房屋'). If no facility change, leave empty. This should be a concise name that can be easily matched in conversation.",
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
    context?: { date: string; time: string; location: string; characters: string[] }
  ) {
    // 1. Save "Hard" Memories (Variable Changes) based on Actions
    // These are objective facts derived from the Logic System's output.
    if (actions && actions.length > 0) {
      const variableChanges = actions.filter(a => 
        ['UPDATE_PLAYER', 'UPDATE_NPC', 'INVENTORY'].includes(a.type)
      );

      if (variableChanges.length > 0) {
        // [Fix] Prevent duplicates: Delete existing variable_change for this turn
        await db.memories.where('[saveSlotId+type+turnCount]')
          .equals([saveSlotId, 'variable_change', turnCount])
          .delete();

        await db.memories.add({
          saveSlotId,
          turnCount,
          type: 'variable_change',
          content: JSON.stringify(variableChanges),
          related_entities: this.extractEntityIdsFromActions(variableChanges),
          tags: ['system', 'variable', ...variableChanges.map(a => a.type)],
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
        modelType: 'memory'
      });

      const result = JSON.parse(response || '{}');
      
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
      // Since we might have multiple facility entries (though unlikely), we clear all 'facility' types for this turn first
      if (result.facility || result.facility_name) {
          await db.memories.where('[saveSlotId+type+turnCount]')
            .equals([saveSlotId, 'facility', turnCount])
            .delete();
      }

      const hasFacility = result.facility && typeof result.facility === 'string' && result.facility.trim();
      const hasFacilityName = result.facility_name && typeof result.facility_name === 'string' && result.facility_name.trim();

      if (hasFacility || hasFacilityName) {
        const content = hasFacility ? result.facility : `设施变更: ${result.facility_name}`;
        const tags = ['facility', ...(result.tags || [])];
        const entities = [...(result.entities || [])];
        
        if (hasFacilityName) {
           tags.push(result.facility_name);
           if (!entities.includes(result.facility_name)) {
              entities.push(result.facility_name);
           }
        }

        await db.memories.add({
          saveSlotId,
          turnCount,
          type: 'facility',
          content: content,
          related_entities: entities,
          tags: tags,
          importance: Math.max(result.importance || 3, 4), // Facility changes are important
          createdAt: Date.now(),
          gameDate: context?.date,
          gameTime: context?.time,
          location: context?.location,
          characters: context?.characters
        });
      }

      // Handle Alliance
      if (result.alliance && result.alliance.name) {
         // Check if similar alliance already exists? Maybe just append.
         // Or rely on user not to spam it.
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

    // 1. 条件性包含最近一轮次的设施变动记忆
    try {
      // 查询最近一轮次的设施记忆（按轮次倒序，取第一条）
      const lastFacilityMemories = await db.memories
        .where(['saveSlotId', 'type'])
        .equals([saveSlotId, 'facility'])
        .reverse()
        .limit(1)
        .toArray();

      if (lastFacilityMemories.length > 0) {
        // 获取主角当前位置
        const gameStore = useGameStore();
        const currentLocation = gameStore.state.player.location;
        const normalizedCurrentLocation = this.normalizeLocation(currentLocation);

        console.log('[Memory Retrieval] Checking facility injection. Current Location:', currentLocation, 'Normalized:', normalizedCurrentLocation);

        // 检查是否应该注入设施记忆
        const shouldInjectFacilities = lastFacilityMemories.some(memory => {
          const facilityLocation = this.extractLocationFromFacility(memory.content);
          const facilityName = this.extractFacilityNameFromContent(memory.content);
          
          console.log('[Memory Retrieval] Found facility memory:', {
            location: facilityLocation,
            name: facilityName,
            content: memory.content
          });

          if (!facilityLocation) return false;
          
          const isLocationMatch = normalizedCurrentLocation === facilityLocation ||
                                  normalizedCurrentLocation.includes(facilityLocation) ||
                                  facilityLocation.includes(normalizedCurrentLocation);
          
          const isMentionMatch = facilityName && currentInput.includes(facilityName);

          console.log('[Memory Retrieval] Match result:', {
            isLocationMatch,
            isMentionMatch,
            input: currentInput
          });

          return isLocationMatch || isMentionMatch;
        });

        if (shouldInjectFacilities) {
          console.log('[Memory Retrieval] Injecting facility memory.');
          result.push(...lastFacilityMemories.map(m => {
            let meta = '';
            if (m.gameDate) meta += `[${m.gameDate} ${m.gameTime || ''}] `;
            if (m.location) meta += `[${m.location}] `;
            if (m.characters && m.characters.length > 0) meta += `(在场: ${m.characters.join(', ')}) `;
            return `<memory type="${m.type}" turn="${m.turnCount}">${meta}${m.content}</memory>`;
          }));
        } else {
          console.log('[Memory Retrieval] No facility memory injected (criteria not met).');
        }
      } else {
        console.log('[Memory Retrieval] No recent facility memories found.');
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

          const selectedIds: number[] = JSON.parse(response || '[]');
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

  private extractEntityIdsFromActions(actions: any[]): string[] {
    const entities = new Set<string>();
    actions.forEach(a => {
      if (a.npcId) entities.add(a.npcId);
      if (a.add_chars) a.add_chars.forEach((c: any) => entities.add(typeof c === 'string' ? c : c.id || c.name));
    });
    return Array.from(entities);
  }

  /**
   * 从设施变动条目中提取地点信息
   * 格式：地点：[设施所在地点]，介绍：[设施简要介绍]，子地点：[设施内的子地点]，人员：[设施相关人员]
   */
  private extractLocationFromFacility(content: string | any): string | null {
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    // 使用正则表达式匹配"地点："后面的内容
    const locationMatch = contentStr.match(/地点：([^，，\n]+)/);
    if (locationMatch && locationMatch[1]) {
      return locationMatch[1].trim();
    }
    return null;
  }

  /**
   * 从设施内容中提取设施名称（兼容旧数据）
   * 旧数据格式：地点：博丽神社，介绍：...
   * 新数据格式：通过facility_name字段单独存储
   */
  private extractFacilityNameFromContent(content: string | any): string | null {
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    // 尝试从content中推断设施名称
    // 如果是"博丽神社，介绍：..."，可以提取"博丽神社"
    const locationMatch = contentStr.match(/地点：([^，]+)/);
    if (locationMatch && locationMatch[1]) {
      const location = locationMatch[1].trim();
      // 如果地点名本身就是一个具体的设施名，直接返回
      if (['博丽神社', '雾之湖', '人间之里', '红魔馆', '白玉楼', '永远亭'].includes(location)) {
        return location;
      }
      // 否则尝试构造一个合理的设施名
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
    // 支持全角半角符号：、，／,/
    const match = location.match(/^([^、，／,]+)[、，／,]/);
    if (match && match[1]) {
      return match[1].trim();
    }
    return location;
  }
}

export const memoryService = new MemoryService();

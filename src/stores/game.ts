import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { type GameState, INITIAL_GAME_STATE, type GameAction, type Quest, type QuestStatus, type Item, type PromiseState } from '@/types/game';
import { type SpellCard } from '@/types/combat';
import { useCharacterStore } from '@/stores/character';
import { resolveCharacterId } from '@/services/characterMapping';
import { PRESET_ITEMS } from '@/data/items';
import { PRESET_SPELLCARDS } from '@/data/spellcards';
import { db } from '@/db';
import _ from 'lodash';

const NPC_FIELD_MAPPING: Record<string, string> = {
  '姓名': 'name',
  '关系': 'relationship',
  '战斗力': 'power',
  '生命值': 'hp',
  '最大生命值': 'max_hp',
  '好感度': 'favorability',
  '服从度': 'obedience',
  '衣着': 'clothing',
  '姿势': 'posture',
  '双手': 'hands',
  '嘴巴': 'mouth',
  '脸部': 'face',
  '心情': 'mood',
  '行为': 'action',
  '目前行为': 'action', // Handle alias
  '当前行为': 'action', // Handle alias
  'current_action': 'action', // Handle alias
  '心理活动': 'inner_thought',
  '目前心理活动': 'inner_thought', // Handle alias
  '性别': 'gender',
  '住所': 'residence',
  '胸部': 'chest',
  '屁股': 'buttocks',
  '臀部': 'buttocks',
  '小穴': 'vagina',
  '菊穴': 'anus'
};

const PLAYER_FIELD_MAPPING: Record<string, string> = {
  '金钱': 'money',
  '持有金钱': 'money',
  '生命值': 'hp',
  '最大生命值': 'max_hp',
  '灵力值': 'mp',
  '最大灵力值': 'max_mp',
  '战斗力': 'power',
  '声望': 'reputation',
  '身份': 'identity',
  '地点': 'location',
  '住所': 'residence',
  '时间': 'time',
  '日期': 'date',
  '衣着': 'clothing',
  '目前衣着': 'clothing',
  '战斗等级': 'combatLevel',
  '熟练等级': 'combatLevel',
  '经验': 'combatExp',
  '经验值': 'combatExp'
};

const VALID_PLAYER_FIELDS = new Set([
  'name', 'hp', 'max_hp', 'mp', 'max_mp', 'money', 'power', 'reputation',
  'identity', 'persona', 'clothing', 'location', 'residence', 'time', 'date',
  'authorities', 'items', 'recipes', 'spell_cards', 'combatLevel', 'combatExp', 'skillPoints', 'unlockedTalents',
  'avatarUrl', 'referenceImageUrl', 'storySummary'
]);

export const useGameStore = defineStore('game', () => {
  const state = ref<GameState>(_.cloneDeep(INITIAL_GAME_STATE));
  const quickReplies = computed(() => state.value.system.quick_replies || []); // Current round quick replies, derived from state

  function updateState(newState: Partial<GameState>) {
    state.value = _.merge({}, state.value, newState);
  }

  async function setPlayerAvatar(avatarUrl: string, referenceImageUrl?: string) {
    state.value.player.avatarUrl = avatarUrl;
    if (referenceImageUrl) {
      state.value.player.referenceImageUrl = referenceImageUrl;
    }
    await saveCurrentStateToLastSnapshot();
  }

  function setQuickReplies(replies: string[]) {
    // Ensure the array exists (it should from INITIAL_GAME_STATE, but just in case)
    if (!state.value.system.quick_replies) {
       state.value.system.quick_replies = [];
    }
    state.value.system.quick_replies = replies || [];
  }

  function clearQuickReplies() {
    if (state.value.system.quick_replies) {
      state.value.system.quick_replies = [];
    }
  }

  function setCombatState(combatState: any) {
    state.value.system.combat = combatState;
  }

  function setPendingQuest(quest: Quest | null) {
    state.value.system.pending_quest_trigger = quest;
  }

  function addQuest(quest: Quest) {
    // Ensure quests array exists
    if (!state.value.system.quests) {
      state.value.system.quests = [];
    }
    // Check for duplicate ID
    if (!state.value.system.quests.find(q => q.id === quest.id)) {
       state.value.system.quests.push(quest);
    }
  }

  function addPromise(promise: PromiseState) {
    if (!state.value.system.promises) {
      state.value.system.promises = [];
    }
    // Check for duplicate ID
    if (!state.value.system.promises.find(p => p.id === promise.id)) {
       state.value.system.promises.push(promise);
    }
  }

  function updatePromise(promiseId: string, updates: Partial<PromiseState>) {
    if (!state.value.system.promises) return;
    const promise = state.value.system.promises.find(p => p.id === promiseId);
    if (promise) {
      Object.assign(promise, updates);
    }
  }

  function updateQuestStatus(questId: string, status: QuestStatus, summary?: string) {
    if (!state.value.system.quests) return;
    
    const quest = state.value.system.quests.find(q => q.id === questId);
    if (quest) {
      // Prevent double completion (and double rewards)
      if (quest.status === 'completed' && status === 'completed') {
         return; 
      }

      quest.status = status;
      if (status === 'completed' || status === 'failed') {
        quest.completedTurn = state.value.system.turn_count;
        quest.completedDate = state.value.player.date;
        quest.completedTime = state.value.player.time;
        if (summary) {
          quest.completionSummary = summary;
        }
        
        // Distribute Rewards
        if (status === 'completed' && quest.rewards) {
           console.log('[GameStore] Distributing rewards for quest:', quest.name, quest.rewards);
           for (const reward of quest.rewards) {
              try {
                 if (reward.type === 'money') {
                    applyAction({
                       type: 'UPDATE_PLAYER',
                       field: 'money',
                       op: 'add',
                       value: Number(reward.value) || 0
                    });
                 } else if (reward.type === 'item') {
                    applyAction({
                       type: 'INVENTORY',
                       target: 'items',
                       op: 'add',
                       value: reward.value
                    });
                 } else if (reward.type === 'spell_card') {
                    applyAction({
                       type: 'INVENTORY',
                       target: 'spell_cards',
                       op: 'add',
                       value: reward.value
                    });
                 } else if (reward.type === 'attribute') {
                    let field = '';
                    let val = 0;

                    // Case 1: Standard Object Format
                    if (typeof reward.value === 'object' && reward.value.field) {
                        field = reward.value.field;
                        val = Number(reward.value.value) || 0;
                    } 
                    // Case 2: LLM Text Format (Infer from description/value)
                    else {
                        // Infer Field
                        const desc = (reward.description || '').toLowerCase();
                        const valStr = String(reward.value || '');
                        
                        if (desc.includes('声望') || desc.includes('reputation')) field = 'reputation';
                        else if (desc.includes('金钱') || desc.includes('money')) field = 'money';
                        else if (desc.includes('战斗力') || desc.includes('power')) field = 'power';
                        
                        // Infer Value
                        if (field) {
                            // Try extracting number first
                            const numMatch = valStr.match(/-?\d+/);
                            if (numMatch) {
                                val = parseInt(numMatch[0]);
                            } else {
                                // Fallback defaults based on field/text content
                                if (field === 'reputation') {
                                    // Heuristic for reputation levels if mentioned in text
                                    if (valStr.includes('小有名气')) val = 25;
                                    else if (valStr.includes('名声鹤起')) val = 45;
                                    else if (valStr.includes('闻名遐迩')) val = 65;
                                    else if (valStr.includes('驰名天下')) val = 85;
                                    else val = 10; // Default small boost
                                }
                                if (field === 'money') val = 1000;
                                if (field === 'power') val = 1;
                            }
                        }
                    }

                    if (field && val !== 0) {
                        applyAction({
                            type: 'UPDATE_PLAYER',
                            field: field,
                            op: 'add',
                            value: val
                        });
                        console.log(`[GameStore] Applied inferred attribute reward: ${field} += ${val}`);
                    } else {
                         console.warn('[GameStore] Could not parse attribute reward:', reward);
                    }
                 }
              } catch (e) {
                 console.error('[GameStore] Error applying reward:', reward, e);
              }
           }
        }
      }
    }
  }

  function unlockTalent(talentId: string, cost: number) {
    if (!state.value.player.unlockedTalents) {
      state.value.player.unlockedTalents = [];
    }
    
    if (state.value.player.unlockedTalents.includes(talentId)) return;
    
    if ((state.value.player.skillPoints || 0) >= cost) {
      state.value.player.skillPoints -= cost;
      state.value.player.unlockedTalents.push(talentId);
      return true;
    }
    return false;
  }

  function setState(newState: GameState) {
    // Use merge to ensure newState overwrites INITIAL_GAME_STATE
    // console.log('[GameStore] Restoring state. NPCs count:', Object.keys(newState.npcs || {}).length, 'Current Scene:', newState.system?.current_scene_npcs);
    state.value = _.merge({}, INITIAL_GAME_STATE, newState);

    // [Sync Logic] Ensure Player Combatant has latest Spell Cards/Stats from Global State
    // This fixes the issue where combat starts before LLM2 finishes variable processing (e.g. obtaining new spell cards).
    // On reload, we want to inject the latest global variables into the active combat state.
    const combat = state.value.system.combat;

    // [Optimization] Auto-revert to pending if active on load (Handle Refresh)
    // If the player refreshes during combat, revert to the "Combat Request" screen and reset the encounter.
    if (combat && combat.isActive) {
        console.log('[GameStore] Active combat detected on load. Reverting to pending confirmation (Resetting Encounter).');
        combat.isActive = false;
        combat.isPending = true;
        combat.turn = 0;
        combat.logs = [];
        
        // Reset Combatants
        if (combat.combatants) {
             combat.combatants.forEach((c: any) => {
                 // Clear Runtime Status
                 c.buffs = [];
                 c.shield = 0;
                 delete c.hasUsedUltimate;
                 
                 // Reset HP/MP for NPCs (Player is synced below)
                 if (!c.isPlayer) {
                     // Try to sync from global NPC state (Pre-combat state)
                     const npc = state.value.npcs ? state.value.npcs[c.id] : null;
                     if (npc) {
                         if (npc.hp !== undefined) c.hp = npc.hp;
                         if (npc.mp !== undefined) c.mp = npc.mp;
                     } else {
                         // Fallback: Reset to Max
                         if (c.maxHp !== undefined) c.hp = c.maxHp;
                         if (c.maxMp !== undefined) c.mp = c.maxMp;
                     }
                 }
             });
        }
    }

    if (combat && (combat.isActive || combat.isPending)) {
        const playerCombatant = combat.combatants.find(c => c.isPlayer);
        const globalPlayer = state.value.player;

        if (playerCombatant && globalPlayer) {
            // Sync Spell Cards
            if (globalPlayer.spell_cards) {
                // Use cloneDeep to avoid reference sharing issues
                playerCombatant.spellCards = _.cloneDeep(globalPlayer.spell_cards);
            }

            // Sync Stats that might have changed (Level, Power, MaxHP/MP)
            if (globalPlayer.combatLevel !== undefined) {
                playerCombatant.combatLevel = globalPlayer.combatLevel;
            }
            if (globalPlayer.power !== undefined) {
                playerCombatant.power = globalPlayer.power as any;
            }
            if (globalPlayer.max_hp !== undefined) {
                playerCombatant.maxHp = globalPlayer.max_hp;
                // If pending, also sync current HP to max if needed, or just keep as is?
                // Better to trust global HP if it's a fresh start
                if (combat.isPending) playerCombatant.hp = globalPlayer.hp;
            }
            if (globalPlayer.max_mp !== undefined) {
                playerCombatant.maxMp = globalPlayer.max_mp;
                if (combat.isPending) playerCombatant.mp = globalPlayer.mp;
            }

            console.log('[GameStore] Synced player combatant with global state on load.');
        }
    }
  }

  function resetState() {
    state.value = _.cloneDeep(INITIAL_GAME_STATE);
  }

  // Helper actions to modify specific parts
  function updatePlayer(playerUpdate: Partial<GameState['player']>) {
    // Validate numeric fields to prevent NaN/invalid values
    const NUMERIC_FIELDS = ['hp', 'max_hp', 'mp', 'max_mp', 'money', 'combatLevel', 'combatExp', 'reputation', 'skillPoints'];
    
    for (const key of NUMERIC_FIELDS) {
        // Check if key is present in the update object
        if (Object.prototype.hasOwnProperty.call(playerUpdate, key)) {
            const val = (playerUpdate as any)[key];
            if (val !== undefined && val !== null) {
                 const numVal = Number(val);
                 if (isNaN(numVal)) {
                     console.warn(`[GameStore] Invalid numeric value for ${key} in updatePlayer:`, val);
                     // Remove invalid field to prevent state corruption
                     delete (playerUpdate as any)[key]; 
                 } else {
                     // Enforce number type
                     (playerUpdate as any)[key] = numVal;
                 }
            }
        }
    }
    
    Object.assign(state.value.player, playerUpdate);
  }

  function incrementTurn() {
    state.value.system.turn_count = (state.value.system.turn_count || 0) + 1;
  }

  // Apply Action Logic
  function applyAction(action: GameAction) {
    console.log('[GameStore] Applying Action:', action);
    switch (action.type) {
      case 'UPDATE_PLAYER':
        if (action.field) {
          // Map Chinese keys to English keys if necessary
          const targetField = PLAYER_FIELD_MAPPING[action.field] || action.field;
          
          // Safety Check: Only allow whitelisted fields
          if (!VALID_PLAYER_FIELDS.has(targetField)) {
             console.warn(`[GameStore] Blocked update to invalid player field: ${targetField}`);
             return;
          }

          const currentVal = _.get(state.value.player, targetField);
          let newVal = currentVal;

          // Strict Numeric Handling
          const STRICT_NUMERIC_FIELDS = new Set(['hp', 'max_hp', 'mp', 'max_mp', 'money', 'combatLevel', 'combatExp', 'reputation', 'skillPoints']);
          
          if (STRICT_NUMERIC_FIELDS.has(targetField)) {
             const val = Number(action.value);
             // Check if val is a valid number
             if (isNaN(val)) {
                console.warn(`[GameStore] Invalid numeric value for ${targetField}:`, action.value);
                // Do not update if invalid
                return;
             }
             
             const currentNum = Number(currentVal) || 0;
             if (action.op === 'add') newVal = currentNum + val;
             else if (action.op === 'subtract') newVal = currentNum - val;
             else if (action.op === 'set') newVal = val;
          } else {
             // Default / String Handling
             if (action.op === 'add') newVal = (currentVal as number || 0) + action.value;
             if (action.op === 'subtract') newVal = (currentVal as number || 0) - action.value;
             if (action.op === 'set') newVal = action.value;
          }
          
          // --- Special Logic: Combat Level / Exp ---
          if (targetField === 'combatExp') {
              // Ensure initialization
              if (state.value.player.combatLevel === undefined) state.value.player.combatLevel = 1;
              if (state.value.player.combatExp === undefined) state.value.player.combatExp = 0;
              if (state.value.player.skillPoints === undefined) state.value.player.skillPoints = 0;
              
              const MAX_LEVEL = 100;
              const EXP_PER_LEVEL = 1000;
              
              // Recalculate based on current state + change
              // Since newVal is the resulting raw value (e.g. current + gain)
              // But wait, if op is 'add', newVal is correctly calculated above.
              
              let currentLevel = state.value.player.combatLevel;
              let totalExp = Number(newVal); // This is currentExp + gain
              
              // Level Up Loop
              while (totalExp >= EXP_PER_LEVEL && currentLevel < MAX_LEVEL) {
                  totalExp -= EXP_PER_LEVEL;
                  currentLevel++;
                  // Gain 1 Skill Point per Level
                  state.value.player.skillPoints++;
              }
              
              // Cap at Max Level
              if (currentLevel >= MAX_LEVEL) {
                  currentLevel = MAX_LEVEL;
                  totalExp = Math.min(totalExp, EXP_PER_LEVEL); // Or 0? Let's keep it maxed
              }
              
              // Apply Level Up
              state.value.player.combatLevel = currentLevel;
              newVal = totalExp; // Update exp to remainder
          }
          // ----------------------------------------

          _.set(state.value.player, targetField, newVal);
        }
        break;

      case 'UPDATE_NPC':
        if (action.npcId && action.field) {
          const charStore = useCharacterStore();
          // Handle both English ID and Chinese Name as ID
          let npcId = action.npcId;
          
          // 1. Resolve ID using centralized service
          const resolvedId = resolveCharacterId(npcId, charStore.characters, state.value.npcs);
          npcId = resolvedId;

          if (!state.value.npcs[npcId]) {
             // If still not found, try to auto-create if we have static data
             // (This happens if LLM tries to update an NPC that isn't formally in scene yet)
             const staticChar = charStore.characters.find(c => c.uuid === npcId);
             if (staticChar) {
                 state.value.npcs[npcId] = {
                     id: npcId,
                     name: staticChar.name,
                     gender: staticChar.gender as any
                 } as any;
             } else {
                 console.warn(`[GameStore] UPDATE_NPC failed: NPC '${npcId}' not found in runtime or static DB.`);
                 return; // Abort if really not found
             }
          }

          // Implicitly add to current scene if updated via UPDATE_NPC
          // Note: This provides a safety net if the model forgets to send a SCENE add_chars.
          // In gameLoop.ts, we ensure SCENE actions (removals) run LAST to override this if needed.
          if (!state.value.system.current_scene_npcs.includes(npcId)) {
             console.log(`[GameStore] Implicitly adding NPC ${npcId} to current scene via UPDATE_NPC`);
             state.value.system.current_scene_npcs.push(npcId);
          }

          const npc = state.value.npcs[npcId];
          if (!npc) return;
          
          // Map Chinese keys to English keys if necessary
          const targetField = NPC_FIELD_MAPPING[action.field] || action.field;
          
          const currentVal = _.get(npc, targetField);
          let newVal = currentVal;

          // Strict Numeric Handling for NPCs
          const STRICT_NPC_NUMERIC_FIELDS = new Set(['hp', 'max_hp', 'favorability', 'obedience']);
          
          if (STRICT_NPC_NUMERIC_FIELDS.has(targetField)) {
             const val = Number(action.value);
             if (isNaN(val)) {
                console.warn(`[GameStore] Invalid numeric value for NPC ${npcId} field ${targetField}:`, action.value);
                // Do not update if invalid
                return;
             }
             
             const currentNum = Number(currentVal) || 0;
             if (action.op === 'add') newVal = currentNum + val;
             else if (action.op === 'subtract') newVal = currentNum - val;
             else if (action.op === 'set') newVal = val;
          } else {
             if (action.op === 'add') newVal = (currentVal as number || 0) + action.value;
             if (action.op === 'subtract') newVal = (currentVal as number || 0) - action.value;
             if (action.op === 'set') newVal = action.value;
          }

          _.set(npc, targetField, newVal);
        }
        break;

      case 'INVENTORY':
        if (action.target) {
          if (action.target === 'items') {
             // Enhanced Item Logic
             const items = state.value.player.items;
             
             if (action.op === 'push' || action.op === 'add') {
                let newItem: Item;
                const val = action.value;
                
                // 1. Resolve Item Data
                if (typeof val === 'string') {
                   // Check for "Name,Type" format (e.g. "红茶,consumable")
                   let nameOrId = val;
                   let specifiedType = 'other';
                   
                   if (val.includes(',')) {
                       // Use lastIndexOf to support names with commas, assuming format "Name, Type"
                       const lastIndex = val.lastIndexOf(',');
                       nameOrId = val.substring(0, lastIndex).trim();
                       specifiedType = val.substring(lastIndex + 1).trim();
                   }

                   // Try Preset by ID (exact match) OR Name (exact match)
                   // We want to support both ID ("tea") and Name ("红茶")
                   const preset = PRESET_ITEMS[nameOrId] || Object.values(PRESET_ITEMS).find(p => p.name === nameOrId);
                   
                   if (preset) {
                      newItem = { ...preset, count: 1 };
                   } else {
                      // Create Generic
                      // If not found in preset, treat the input string as both ID and Name for now
                      newItem = {
                         id: nameOrId,
                         name: nameOrId,
                         count: 1,
                         description: '暂无描述',
                         type: specifiedType
                      };
                   }
                } else {
                   // It's an object from LLM
                   // We still check if the ID or Name matches a preset to fill in missing details
                   const rawId = val.id || val.name;
                   const preset = rawId ? (PRESET_ITEMS[rawId] || Object.values(PRESET_ITEMS).find(p => p.name === rawId)) : null;

                   if (preset) {
                      // Merge preset with LLM overrides (LLM takes priority for counts/specifics, Preset for static data)
                      newItem = {
                         ...preset,
                         ...val,
                         // Ensure critical fields exist
                         id: preset.id, // Prefer preset ID to keep consistency
                         name: val.name || preset.name,
                         count: val.count || 1
                      };
                   } else {
                      newItem = {
                         id: val.id || val.name || 'unknown',
                         name: val.name || val.id || 'Unknown Item',
                         count: val.count || 1,
                         description: val.description || '暂无描述',
                         type: val.type || 'other',
                         effects: val.effects
                      };
                   }
                }

                // 2. Add or Stack
                // Match by ID (preferred) or Name
                const existingItem = items.find(i => 
                   (newItem.id && i.id === newItem.id) || 
                   (newItem.name && i.name === newItem.name)
                );
                
                if (existingItem) {
                   existingItem.count += newItem.count;
                } else {
                   items.push(newItem);
                }
             }
             
             if (action.op === 'remove') {
                const val = action.value; // string ID or Name or Object
                const idToCheck = typeof val === 'string' ? val : (val.id || val.name);
                
                // Find by ID or Name
                const existingItem = items.find(i => i.id === idToCheck || i.name === idToCheck);
                
                if (existingItem) {
                   const countToRemove = (typeof val === 'object' && val.count) ? val.count : 1;
                   existingItem.count -= countToRemove;
                   
                   if (existingItem.count <= 0) {
                      const idx = items.indexOf(existingItem);
                      items.splice(idx, 1);
                   }
                }
             }

          } else if (action.target === 'spell_cards') {
            // Handle Spell Cards (Similar to Items)
            if (!state.value.player.spell_cards) state.value.player.spell_cards = [];
            const spellCards = state.value.player.spell_cards;
            
            if (action.op === 'add' || action.op === 'push') {
               const values = Array.isArray(action.value) ? action.value : [action.value];
               
               for (const val of values) {
                  let newCard: SpellCard;
                  
                  if (typeof val === 'string') {
                     // Look up preset
                     const preset = PRESET_SPELLCARDS[val] || Object.values(PRESET_SPELLCARDS).find(p => p.name === val);
                     if (preset) {
                        newCard = {
                           name: preset.name!,
                           description: preset.description!,
                           cost: preset.cost || 0,
                           damage: preset.damage || 0,
                           scope: preset.scope || 'single',
                           type: preset.type || 'attack',
                           effects: preset.effects,
                           isUltimate: preset.isUltimate || false,
                           hitRate: preset.hitRate, // Optional preset hitRate
                           level: 1,
                           experience: 0
                        };
                     } else {
                        // Fallback for string only (Minimal info)
                        newCard = {
                           name: val,
                           description: '暂无描述',
                           cost: 0,
                           damage: 0,
                           scope: 'single',
                           type: 'attack',
                           isUltimate: false,
                           hitRate: 0.1,
                           level: 1,
                           experience: 0
                        };
                     }
                  } else {
                     // Object from LLM
                     const rawId = val.id || val.name;
                     const preset = rawId ? (PRESET_SPELLCARDS[rawId] || Object.values(PRESET_SPELLCARDS).find(p => p.name === rawId)) : null;
                     
                     if (preset) {
                        newCard = {
                           ...preset,
                           ...val,
                           name: val.name || preset.name,
                           description: val.description || preset.description,
                           isUltimate: val.isUltimate !== undefined ? val.isUltimate : (preset.isUltimate || false),
                           hitRate: val.hitRate !== undefined ? val.hitRate : (preset.hitRate || 0.1),
                           level: val.level || 1,
                           experience: val.experience || 0
                        } as SpellCard;
                        if ('id' in newCard) delete (newCard as any).id;
                     } else {
                        newCard = {
                           name: val.name || val.id || 'Unknown Spell',
                           description: val.description || '暂无描述',
                           cost: val.cost || 0,
                           damage: val.damage || 0,
                           scope: val.scope || 'single',
                           type: val.type || 'attack',
                           isUltimate: val.isUltimate || false,
                           hitRate: val.hitRate !== undefined ? val.hitRate : (val.isUltimate ? 1.0 : 0.2),
                           buffDetails: val.buffDetails, 
                           effects: val.effects // Legacy support
                        };
                     }
                  }
                  
                  // Avoid duplicates by Name
                  if (!spellCards.find(c => c.name === newCard.name)) {
                     spellCards.push(newCard);
                  }
               }
            }
            
            if (action.op === 'remove') {
               const val = action.value;
               const nameToCheck = typeof val === 'string' ? val : (val.name || val.id);
               
               const idx = spellCards.findIndex(c => c.name === nameToCheck);
               if (idx > -1) {
                  spellCards.splice(idx, 1);
               }
            }

          } else if (action.target === 'recipes') {
            if (!state.value.player.recipes) state.value.player.recipes = [];
            const recipes = state.value.player.recipes;

            if (action.op === 'add' || action.op === 'push') {
              const values = Array.isArray(action.value) ? action.value : [action.value];
              for (const val of values) {
                let newRecipe: any;
                if (typeof val === 'string') {
                  newRecipe = {
                    id: val,
                    name: val,
                    description: '暂无描述',
                    practice: '暂无做法',
                    price: 0,
                    tags: []
                  };
                } else {
                  newRecipe = {
                    id: val.id || val.name || 'unknown',
                    name: val.name || val.id || 'Unknown Recipe',
                    description: val.description || '暂无描述',
                    practice: val.practice || '暂无做法',
                    price: Number(val.price) || 0,
                    tags: Array.isArray(val.tags) ? val.tags : []
                  };
                }
                // Avoid duplicates
                if (!recipes.find(r => r.id === newRecipe.id || r.name === newRecipe.name)) {
                  recipes.push(newRecipe);
                }
              }
            }

            if (action.op === 'remove') {
              const val = action.value;
              const idToCheck = typeof val === 'string' ? val : (val.id || val.name);
              const idx = recipes.findIndex(r => r.id === idToCheck || r.name === idToCheck);
              if (idx > -1) {
                recipes.splice(idx, 1);
              }
            }

          } else {
            // Legacy handling for strings (authorities)
            const list = _.get(state.value.player, action.target) as any[];
            if (Array.isArray(list)) {
              if (action.op === 'push' || action.op === 'add') {
                list.push(action.value);
              }
              if (action.op === 'remove') {
                const idx = list.indexOf(action.value);
                if (idx > -1) list.splice(idx, 1);
              }
            }
          }
        }
        break;
        
      case 'SCENE':
        if (action.location) {
          state.value.player.location = action.location;
        }
        
        // Compatibility: Handle if LLM put add_chars in 'value' (Common error)
        let charsToAdd = action.add_chars;
        if (!charsToAdd && action.op === 'add_chars' && Array.isArray(action.value)) {
           charsToAdd = action.value;
        }

        // Handle add_chars (Add to scene)
        if (charsToAdd && Array.isArray(charsToAdd)) {
          const charStore = useCharacterStore();
          for (const charItem of charsToAdd) {
             let charId: string;
             let charData: any = {};

             if (typeof charItem === 'string') {
                charId = charItem;
             } else {
                // It's an object (Full NPC data from LLM)
                // We need to determine an ID. If 'id' or 'uuid' is missing, use name as ID.
                charId = charItem.id || charItem.uuid || charItem.name;
                charData = charItem;
             }

             if (!charId) continue;

             // Resolve UUID using centralized service
             const resolvedId = resolveCharacterId(charId, charStore.characters, state.value.npcs);
             let staticChar = charStore.characters.find(c => c.uuid === resolvedId);
             
             // If resolveCharacterId returns the original input (fallback), try to find staticChar by other means or assume it's a new ID
             if (resolvedId === charId && !staticChar) {
                 // Try finding by name in static DB one last time (resolveCharacterId should have done this, but to be safe)
                 // Actually resolveCharacterId covers this.
             } else {
                 charId = resolvedId;
             }
             
             // If we found a static char, ensure we use its UUID and Name
             if (staticChar) {
                charId = staticChar.uuid;
                if (!state.value.npcs[charId]) {
                   state.value.npcs[charId] = { 
                     id: charId, 
                     name: staticChar.name,
                     power: staticChar.initialPower || 'F' // Pull initial power level from Lorebook
                   } as any;
                }
             }

             if (!state.value.system.current_scene_npcs.includes(charId)) {
                state.value.system.current_scene_npcs.push(charId);
             }
             
             // Update or Create NPC entry
             if (!state.value.npcs[charId]) {
                 state.value.npcs[charId] = { 
                    id: charId, 
                    name: staticChar ? staticChar.name : charId,
                    gender: staticChar?.gender as any,
                    power: staticChar?.initialPower || 'F' // Ensure power is set
                 } as any;
             } else {
                 // Patch existing NPC if gender or power is missing
                 const existingNpc = state.value.npcs[charId];
                 if (existingNpc && !existingNpc.gender && staticChar?.gender) {
                    existingNpc.gender = staticChar.gender as any;
                 }
                 if (existingNpc && !existingNpc.power && staticChar?.initialPower) {
                    existingNpc.power = staticChar.initialPower as any;
                 }
             }
             
             // If we have detailed data from LLM, merge it in!
             // We need to map Chinese keys if present in the object
             if (Object.keys(charData).length > 0) {
                const mappedData: any = {};
                for (const [key, val] of Object.entries(charData)) {
                   const mappedKey = NPC_FIELD_MAPPING[key] || key;
                   mappedData[mappedKey] = val;
                }
                _.merge(state.value.npcs[charId], mappedData);
             }
          }
        }

        // Handle remove_chars (Remove from scene)
        if (action.remove_chars && Array.isArray(action.remove_chars)) {
           const charStore = useCharacterStore();
           // Resolve all IDs to remove to their canonical internal IDs
           const resolvedIdsToRemove = action.remove_chars.map(rawId => {
               return resolveCharacterId(rawId, charStore.characters, state.value.npcs);
           });

           state.value.system.current_scene_npcs = state.value.system.current_scene_npcs.filter(
              id => !resolvedIdsToRemove.includes(id)
           );
        }
        break;
    }
  }

  /**
   * Manually save the current game state to the most recent snapshot.
   * Useful for persisting UI-driven changes (like persona or story summary) 
   * that happen outside the main game loop.
   */
  async function saveCurrentStateToLastSnapshot() {
    try {
      // Find the last chat message with a snapshot
      const lastChatWithSnapshot = await db.chats
        .where('snapshotId')
        .notEqual(0)
        .reverse()
        .first();

      if (lastChatWithSnapshot && lastChatWithSnapshot.snapshotId) {
        const currentState = JSON.parse(JSON.stringify(state.value));
        await db.snapshots.update(lastChatWithSnapshot.snapshotId, {
          gameState: JSON.stringify(currentState)
        });
        console.log('[GameStore] Persisted current state to snapshot:', lastChatWithSnapshot.snapshotId);
      }
    } catch (e) {
      console.error('[GameStore] Failed to persist state to snapshot:', e);
    }
  }

  return {
    state,
    quickReplies,
    updateState,
    setState,
    resetState,
    updatePlayer,
    incrementTurn,
    applyAction,
    setQuickReplies,
    clearQuickReplies,
    setCombatState,
    setPendingQuest,
    addQuest,
    updateQuestStatus,
    unlockTalent,
    addPromise,
    updatePromise,
    setPlayerAvatar,
    saveCurrentStateToLastSnapshot
  };
});

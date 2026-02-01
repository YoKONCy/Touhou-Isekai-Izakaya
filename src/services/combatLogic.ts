import type { PowerLevel, Combatant, SpellCard } from '@/types/combat';
import { generateCompletion } from '@/services/llm';
import { useCharacterStore } from '@/stores/character';
import { resolveCharacterId } from '@/services/characterMapping';
import { useGameStore } from '@/stores/game';

// 1. Power Level Base Damage Configuration
const POWER_LEVEL_DAMAGE: Record<PowerLevel, number> = {
  "∞": 999,
  "OMEGA": 150,
  "UX": 120,
  "EX": 100,
  "US": 90,
  "SSS": 80,
  "SS": 70,
  "S+": 65,
  "S": 60,
  "A+": 54,
  "A": 50,
  "B+": 46,
  "B": 42,
  "C+": 39,
  "C": 36,
  "D+": 33,
  "D": 30,
  "E+": 28,
  "E": 26,
  "F+": 24,
  "F": 22,
  "F-": 20
};

// Rank mapping for level difference calculation (Index 0 is highest)
const POWER_RANKS: PowerLevel[] = [
  "∞", "OMEGA", "UX", "EX", "US", "SSS", "SS", "S+", "S", 
  "A+", "A", "B+", "B", "C+", "C", "D+", "D", "E+", "E", 
  "F+", "F", "F-"
];

export function getBaseDamage(level: PowerLevel): number {
  return POWER_LEVEL_DAMAGE[level] || 50;
}

export interface DamageResult {
  damage: number;
  heal: number;
  isCrit: boolean; // Kept for compatibility, but will be false
  isHit: boolean;
  description: string;
}

import { applyStatModifiers, applyLifecycleHook, checkMechanic } from './combatModifiers';

export function getEffectiveStats(combatant: Combatant) {
  let dodgeMod = 0;
  let atkMod = 1.0;
  let defMod = 1.0; 

  // --- Base Stat Initialization ---
  let baseDodge = combatant.dodgeRate !== undefined ? combatant.dodgeRate : 0.15;

  // --- Proficiency Dodge (Player Only) ---
  // Base Dodge scales from 5% (Lv1) to 30% (Lv100)
  if (combatant.isPlayer && combatant.combatLevel) {
      const level = Math.max(1, Math.min(100, combatant.combatLevel));
      // 0.05 + 0.25 * ((L-1)/99)
      baseDodge = 0.05 + 0.25 * ((level - 1) / 99);
  }

  // --- Modifier Hooks ---
  const context = { attacker: combatant };
  baseDodge = applyStatModifiers(baseDodge, 'onCalculateDodge', combatant, context);
  atkMod = applyStatModifiers(atkMod, 'onCalculateAtk', combatant, context);
  defMod = applyStatModifiers(defMod, 'onCalculateDef', combatant, context);
  
  // New: P-Point Gain Modifier
  const pGainMod = applyStatModifiers(1.0, 'onCalculatePPointGain', combatant, context);
  
  // New: Max AP Modifier
  const maxAp = applyStatModifiers(2, 'onCalculateApMax', combatant, context);
  
  return {
    dodgeRate: Math.min(1.0, Math.max(0, baseDodge + dodgeMod)),
    atkMod: Math.max(0, atkMod),
    defMod: Math.max(0, defMod),
    pGainMod,
    maxAp
  };
}

export function calculatePPointGain(attacker: Combatant, damageDealt: number): number {
  if (damageDealt <= 0) return 5; // Base gain for misses/blocked attacks

  const basePowerVal = getBaseDamage(attacker.power);
  // Formula: 2 + 8 * (Base / Damage)
  let gain = 2 + 8 * (basePowerVal / damageDealt);
  
  // Apply Modifiers (e.g., 厚积薄发)
  const stats = getEffectiveStats(attacker);
  gain *= stats.pGainMod;
  
  // Cap at 30 to prevent explosion from very low damage or division by zero
  return Math.min(30, Math.max(0, gain));
}

export function calculateDamage(
  attacker: Combatant, 
  defender: Combatant, 
  spell?: SpellCard
): DamageResult {
  const context = { attacker, defender, spell };
  const isCrit = false;
  let description = '';
  
  // 0. Handle Non-Attack Types
  if (spell) {
    if (['buff', 'shield', 'heal'].includes(spell.type || '')) {
      return {
        damage: 0,
        heal: spell.type === 'heal' ? (spell.damage || 0) : 0,
        isCrit: false,
        isHit: true,
        description: `${attacker.name} 使用了【${spell.name}】，${spell.description || '施加了支援效果'}。`
      };
    }
  }

  // --- Buff/Debuff Calculation Layer ---
  const attStats = getEffectiveStats(attacker);
  const defStats = getEffectiveStats(defender);

  // Check Dodge
  let hitRate = 0; // Default attack hit rate bonus (0 for normal attack)
  
  if (spell) {
     if (typeof spell.hitRate === 'number') {
       hitRate = spell.hitRate;
     } else {
       // Default Logic: Ultimate = 100%, Normal Spell = 10%
       hitRate = spell.isUltimate ? 1.0 : 0.1; 
     }
   }

  // Effective Dodge Rate = Defender Dodge - Hit Rate
  const effectiveDodgeRate = Math.max(0, defStats.dodgeRate - hitRate);

  if (Math.random() < effectiveDodgeRate) {
       // New: After Dodge Hook (e.g., 反击架势)
       applyLifecycleHook('onAfterDodge', defender, { ...context, attacker: defender, defender: attacker });

       return {
        damage: 0,
        heal: 0,
        isCrit: false,
        isHit: false, // Miss
        description: `${attacker.name} 的攻击被 ${defender.name} 闪避了！`
      };
  }

  // 1. Base Damage Calculation
  // Combine Power Level Base + Spell Flat Damage (before level suppression)
  const powerBaseDmg = getBaseDamage(attacker.power);
  const spellFlatDmg = (spell && spell.damage) ? spell.damage : 0;
  
  let totalBaseDmg = powerBaseDmg + spellFlatDmg;

  // New: Apply Flat Damage Modifiers (e.g., 力量训练)
  totalBaseDmg = applyStatModifiers(totalBaseDmg, 'onCalculateFlatDamage', attacker, context);

  // --- Proficiency Modifier (Player Only) ---
  // Formula: (Base + Spell) * (1 + 0.5 * (Level - 1) / 99)
  // Range: x1.0 (Lv1) to x1.5 (Lv100)
  if (attacker.isPlayer && attacker.combatLevel) {
    const level = Math.max(1, Math.min(100, attacker.combatLevel));
    
    // New: Spell Level Bonus (e.g., 符卡掌握)
    let effectiveSpellLevel = level;
    if (spell) {
       effectiveSpellLevel = applyStatModifiers(level, 'onCalculateSpellLevel', attacker, context);
       effectiveSpellLevel = Math.min(100, effectiveSpellLevel); // Still capped at 100 for formula
    }

    const profMod = 1.0 + 0.5 * ((effectiveSpellLevel - 1) / 99);
    totalBaseDmg *= profMod;
  }
  // ------------------------------------------
  
  // 2. Level Difference Modifier (Recursive)
  const attackerRankIndex = POWER_RANKS.indexOf(attacker.power);
  const defenderRankIndex = POWER_RANKS.indexOf(defender.power);
  const rankDiff = attackerRankIndex - defenderRankIndex; // Negative = Attacker Stronger
  
  let rankModifier = 1.0;
  
  // New: Check if Level Suppression should be ignored (e.g., 裁决天平)
  const ignoreSuppression = checkMechanic('shouldIgnoreSuppression', attacker, context);

  if (!ignoreSuppression) {
    if (rankDiff < 0) {
      // Attacker is stronger
      // Recursive +4% per level: Base * (1.04 ^ levels)
      const levels = Math.abs(rankDiff);
      rankModifier = Math.pow(1.04, levels);
    } else if (rankDiff > 0) {
      // Attacker is weaker
      // Recursive -7% per level: Base * (0.93 ^ levels)
      const levels = Math.abs(rankDiff);
      rankModifier = Math.pow(0.93, levels);
      // Hard cap min modifier to avoid 0 damage? Let's keep it pure for now, or min 0.01
      rankModifier = Math.max(0.01, rankModifier);
    }
  }

  // Apply Rank Modifier
  let currentDamage = totalBaseDmg * rankModifier;

  // Apply Attack Buffs
  currentDamage *= attStats.atkMod;

  // Final Damage Calculation
  let finalDamage = currentDamage;

  // New: P-Point Bonus Calculation with Crit Hooks
  if (attacker.pPoints && attacker.pPoints > 0) {
      const pRatio = Math.min(100, attacker.pPoints) / 100;
      
      let maxBonus = 0.5; // Default 50% for enemies/NPCs
      if (attacker.isPlayer && attacker.combatLevel) {
          const level = Math.max(1, Math.min(100, attacker.combatLevel));
          
          // New: Spell Level Bonus also applies to P-Point Max Bonus calculation
          let effectiveSpellLevel = level;
          if (spell) {
             effectiveSpellLevel = applyStatModifiers(level, 'onCalculateSpellLevel', attacker, context);
             effectiveSpellLevel = Math.min(100, effectiveSpellLevel);
          }

          // 0.2 + 0.6 * ((L-1)/99) -> 0.2 to 0.8
          maxBonus = 0.2 + 0.6 * ((effectiveSpellLevel - 1) / 99);
      }

      // New: Crit Damage Modifier (e.g., 暴击强化)
      // Note: Our system uses P-points to simulate "critical power".
      let critMod = applyStatModifiers(1.0, 'onCalculateCritDmg', attacker, context);
      
      // New: Defender Crit Resist (e.g., 强韧肉体)
      critMod = applyStatModifiers(critMod, 'onCalculateCritDmgTaken', defender, context);

      maxBonus *= critMod;

      const pBonus = pRatio * maxBonus; 
      finalDamage *= (1 + pBonus);
  }

  // New: Apply Base Damage Hook (after P-Point bonus but before defense)
  finalDamage = applyStatModifiers(finalDamage, 'onCalculateBaseDamage', attacker, context);

  // Random Fluctuation for Normal Attacks (0.85 ~ 1.15)
  // Now applies to everyone for consistency, but only for normal attacks
  if (!spell) {
      const fluctuation = 0.85 + Math.random() * 0.30;
      finalDamage *= fluctuation;
  }

  // Apply Defense/Damage Reduction Buffs
  finalDamage *= defStats.defMod;

  // Modifier Hook: Incoming Damage (Defender)
  finalDamage = applyStatModifiers(finalDamage, 'onCalculateIncomingDamage', defender, context);

  // Ally Vulnerability: Allies take extra damage based on favorability
  // Favorability <= 0: 2.5x (Max Vulnerability)
  // Favorability >= 100: 1.0x (No Vulnerability)
  if (!defender.isPlayer && defender.team === 'player') {
      let multiplier = 2.5;
      try {
          const gameStore = useGameStore();
          const npc = gameStore.state.npcs[defender.id];
          if (npc) {
              const fav = npc.favorability || 0;
              if (fav >= 100) {
                  multiplier = 1.0;
              } else if (fav <= 0) {
                  multiplier = 2.5;
              } else {
                  // Linear interpolation: 0 -> 2.5, 100 -> 1.0
                  multiplier = 2.5 - (fav / 100) * 1.5;
              }
          }
      } catch (e) {
          // Ignore
      }
      finalDamage *= multiplier;
  }

  // --- World Difficulty Correction ---
  if (attacker.isPlayer) {
      try {
          const gameStore = useGameStore();
          const difficulty = gameStore.state.system.difficulty || 'normal';
          
          if (difficulty === 'normal') {
              // -5% correction
              finalDamage *= 0.95;
          } else if (difficulty === 'cruel') {
              // -15% correction
              finalDamage *= 0.85; 
          }
          // gentle: no correction
      } catch (e) {
          // Ignore if store not available (e.g. unit testing)
      }
  }

  finalDamage = Math.floor(finalDamage);

  // Modifier Hook: Final Damage (Attacker)
  finalDamage = applyStatModifiers(finalDamage, 'onCalculateFinalDamage', attacker, context);

  // New: Post-Damage Hooks (Bloodlust, etc.)
  applyLifecycleHook('onAfterDamageDealt', attacker, context, finalDamage);

  description = `${attacker.name} 对 ${defender.name} 造成了 ${finalDamage} 点伤害。`;

  // --- Shield Logic ---

  return {
    damage: finalDamage,
    heal: 0,
    isCrit: isCrit,
    isHit: true,
    description: description
  };
}

export interface PersuasionEffect {
  target: 'enemy' | 'player' | 'all_enemies' | 'ally' | 'all_allies';
  targetIndex?: number; // Optional index for specific enemy or ally
  type: 'damage' | 'heal' | 'status' | 'win' | 'escape' | 'shield';
  value: number | string;
  description: string;
  buffDetails?: {
    name: string;
    duration: number;
    effects: {
      type: 'stat_mod' | 'damage_reduction' | 'dodge_mod' | 'damage_over_time' | 'heal' | 'shield';
      targetStat?: 'attack' | 'damage_taken' | 'defense' | 'dodge';
      value: number;
    }[];
  };
}

export interface PersuasionResult {
  narrative: string;
  effects: PersuasionEffect[];
}

export async function processPersuasion(
  player: Combatant,
  enemies: Combatant[],
  allies: Combatant[],
  userInput: string,
  turn?: number
): Promise<PersuasionResult> {
  // 1. Fetch Character Personas
  const charStore = useCharacterStore();
  const gameStore = useGameStore();
  
  if (charStore.characters.length === 0) {
      await charStore.loadCharacters();
  }
  
  const getPersona = (name: string, id?: string) => {
    // Resolve ID properly using service
    const resolvedId = resolveCharacterId(id || name, charStore.characters, gameStore.state.npcs);
    
    // Find using resolved ID
    const char = charStore.characters.find(c => c.uuid === resolvedId);
    
    return char?.description ? char.description.slice(0, 500) + (char.description.length > 500 ? '...' : '') : "暂无详细设定";
  };

  // Logic for Player Persona (from GameStore)
  let playerPersonaText = "暂无详细设定";
  let playerGlobalSetting = "无特殊设定";
  
  const playerState = gameStore.state.player;
  if (playerState) {
      const rawPersona = playerState.persona || "";
      
      // Try parsing JSON
      try {
          const jsonObj = JSON.parse(rawPersona);
          
          // 1. Text Persona (user_persona)
          if (jsonObj["详细人设"]) {
              playerPersonaText = jsonObj["详细人设"];
          } else if (jsonObj["补充设定"]) {
              playerPersonaText = jsonObj["补充设定"];
          } else {
              // If purely JSON settings, maybe use raw string or default
               playerPersonaText = "无特殊描述";
          }
          
          // 2. Global Setting (global_user_setting)
          // Clone to avoid modifying original
          const settingObj = { ...jsonObj };
          if ('详细人设' in settingObj) delete settingObj['详细人设'];
          if ('补充设定' in settingObj) delete settingObj['补充设定'];
          
          playerGlobalSetting = JSON.stringify(settingObj, null, 2);
          
      } catch (e) {
          // Plain text
          playerPersonaText = rawPersona;
      }
  }
  
  const enemyPersonas = enemies.map((e, idx) => 
    `### [${idx}] ${e.name}\n${getPersona(e.name, e.id)}`
  ).join('\n\n');

  const allyPersonas = allies.length > 0 ? allies.map((a, idx) => 
    `### [${idx}] ${a.name}\n${getPersona(a.name, a.id)}`
  ).join('\n\n') : "无友军";

  // 2. Build Prompt
  const enemyDescriptions = enemies.map((e, idx) => 
    `[${idx}] ${e.name} (HP: ${e.hp}/${e.maxHp}, Power: ${e.power})`
  ).join('\n');

  const allyDescriptions = allies.length > 0 ? allies.map((a, idx) => 
    `[${idx}] ${a.name} (HP: ${a.hp}/${a.maxHp}, Power: ${a.power})`
  ).join('\n') : "无";

  const systemPrompt = `角色: 战斗裁判 (东方Project宇宙)
任务: 基于东方Project的设定和逻辑，评估玩家在战斗中“交谈/嘴炮”行动的效果。

# 角色人设 (反应参考)
## 玩家: ${player.name}
${playerPersonaText}

## 全局用户设定 (玩家出身/世界信息)
${playerGlobalSetting}

## 敌人
${enemyPersonas}

## 友军
${allyPersonas}

上下文:
回合: ${turn || '未知'}
玩家: ${player.name} (HP: ${player.hp}/${player.maxHp}, Power: ${player.power})
敌人:
${enemyDescriptions}
友军:
${allyDescriptions}

用户输入 (交谈): "${userInput}"

规则:
1. **结果判定 (世界观与人设)**:
   - 基于 用户输入、上下文 和 角色人设 判定结果。
   - **尊重设定**: 一个弱小的人类无法轻易恐吓强大的妖怪/神明，除非他们利用了特定的心理弱点。
   - **拒绝战力崩坏**: 简单的侮辱或随意的言语**不应**触发“暴击”或“神级”效果。高影响力的效果需要深刻的心理洞察、特定的设定克制或完美的时机。
   - **反应真实性**: 有些角色固执或傲慢。如果说服失败，返回“轻微”效果、无效果，甚至反击（玩家受到伤害）。
   - **友军互动**: 如果用户与友军交谈（例如：鼓励、指挥或通过言语治疗），生成针对“ally”或“all_allies”的效果。

2. **数值参考标准 (重要)**:
   - **HP 规模**:
     - 普通人类/弱妖怪: ~500 HP
     - 强者 (如灵梦): >1800 HP
     - Boss/神明: >5000 HP
   - **效果数值规模 (伤害/治疗/护盾)**:
     - **微不足道** (轻微调侃, 闲聊): 10-50
     - **轻微** (标准侮辱/鼓励): 50-100
     - **中等** (有效的说服/心理打击): 100-200
     - **显著** (深刻的情感冲击/真相): 200-400
     - **暴击** (世界观粉碎/完美克制): 400-800
     - **神级** (绝对支配/现实操控): >800
   - **属性修正规模 (stat_mod/dodge_mod)**:
     - **轻微 增益/减益**: 0.05-0.10 (5%-10%)
     - **中等 增益/减益**: 0.15-0.25 (15%-25%)
     - **强力 增益/减益**: 0.30-0.50 (30%-50%)
     - **注意**: 0.1 意味着 10%。正数表示增益，负数表示减益（但在 'defense' 中正数表示防御更强）。
   - **使用这些数值根据用户输入的质量来确定效果的幅度。**

3. **生成具体效果**:
   - "damage": 精神伤害 (减少 HP)。
   - "heal": 自我鼓励 (恢复玩家 HP) 或 友军鼓励 (恢复友军 HP)。
   - "shield": 给予护盾 (value = 数量)。
   - "status": 施加 增益/减益 及详细效果。
     - **主题一致性**:
       * *愤怒*: 增加攻击 但 减少防御/智慧。
       * *困惑/犹豫*: 减少闪避 或 造成 眩晕。
       * *恐惧*: 减少攻击/防御 或 增加逃跑几率。
       * *激励/士气*: 增加友军 攻击/防御。
     - 如果用户的行动是针对自己的（例如“我集中精神”），设置 "target" 为 "player" (增益)。
     - 如果针对敌人（例如“你很弱”），设置 "target" 为 "enemy" (减益)。
     - 如果针对友军（例如“坚持住！”），设置 "target" 为 "ally" (增益)。
     - **复杂效果**:
       * "damage_over_time": 真实伤害。
       * "heal": 持续治疗或瞬间治疗。
       * "stat_mod": 属性修正。
       * "shield": 给予护盾点数。
   - "win": 敌人投降或加入（仅当叙事完全合理时）。
   - "escape": 玩家成功干扰并逃跑。

4. **最终要求**:
   - 发挥创意但保持公正。
   - 语言要求: "narrative" 和 "description" 字段必须使用**简体中文**。

输出 JSON 格式:
{
  "narrative": "一段简短、身临其境的描述（最多50字），使用简体中文。",
  "effects": [
    {
      "target": "enemy" | "player" | "all_enemies" | "ally" | "all_allies",
      "targetIndex": 0, // 对应数组中的索引 (enemies 或 allies)
      "type": "damage" | "heal" | "shield" | "status" | "win" | "escape",
      "value": number (用于 伤害/治疗/护盾) 或 string (用于 status/win/escape),
      "description": "简短的日志文本，使用简体中文",
      "buffDetails": { // 仅当 type 为 "status" 时
         "name": "效果名称 (中文词汇, 如 '战意高昂')",
         "duration": 3, // 回合数。对于瞬间效果如真实伤害设为 1。
         "effects": [
            { 
              "type": "stat_mod" | "damage_reduction" | "dodge_mod" | "damage_over_time" | "heal" | "shield",
              "targetStat": "attack" | "defense" | "dodge" | "damage_taken" (可选, 用于 stat_mod),
              "value": 0.2 // (例如 +20% 攻击, 或 50 真实伤害)
            }
         ]
      }
    }
  ]
}`;

  try {
    console.log('[CombatLogic] Sending prompt to LLM4:', systemPrompt);
    console.log('[CombatLogic] User input:', userInput);

    const response = await generateCompletion({
      modelType: 'misc', // Use LLM4
      jsonMode: true,
      systemPrompt,
      messages: [{ role: 'user', content: userInput }]
    });

    console.log('[CombatLogic] Raw response from LLM4:', response);
    
    // Clean response: remove Markdown code blocks and conversational text
    let cleaned = response.trim();
    if (cleaned.includes('```')) {
      const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (match && match[1]) {
        cleaned = match[1].trim();
      }
    }
    
    // Find first '{' and last '}' to isolate JSON object
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    const result = JSON.parse(cleaned) as PersuasionResult;
    console.log('[CombatLogic] Parsed PersuasionResult:', result);
    return result;
  } catch (error) {
    console.error('Persuasion LLM Error:', error);
    return {
      narrative: '你的话语消散在风中，似乎没有什么效果……',
      effects: []
    };
  }
}

export function mockEnemy(name: string, level: PowerLevel, hpMultiplier: number = 10): Combatant {
  const baseHp = getBaseDamage(level) * hpMultiplier; // HP is roughly 10x base damage
  return {
    id: `enemy_${Math.random().toString(36).substr(2, 5)}`,
    name: name,
    team: 'enemy',
    isPlayer: false,
    hp: baseHp,
    maxHp: baseHp,
    mp: 0,
    maxMp: 0,
    power: level,
    spellCards: [],
    buffs: [],
    shield: 0,
    dodgeRate: 0.15
  };
}

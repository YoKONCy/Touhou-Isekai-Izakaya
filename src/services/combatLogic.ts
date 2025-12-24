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

  const systemPrompt = `Role: Combat Referee (Touhou Project Universe)
Task: Evaluate the effect of the player's "Talk/Persuade" action in combat based on Touhou lore and logic.

# Character Personas (Reference for reactions)
## Player: ${player.name}
${playerPersonaText}

## Global User Setting (Player Origin/World Info)
${playerGlobalSetting}

## Enemies
${enemyPersonas}

## Allies
${allyPersonas}

Context:
Turn: ${turn || 'Unknown'}
Player: ${player.name} (HP: ${player.hp}/${player.maxHp}, Power: ${player.power})
Enemies:
${enemyDescriptions}
Allies:
${allyDescriptions}

User Input (Talk): "${userInput}"

Rules:
1. **Outcome Determination (Worldview & Persona)**:
   - Determine the outcome based on USER INPUT, CONTEXT, and CHARACTER PERSONAS.
   - **Respect Lore**: A weak human cannot easily intimidate a powerful Youkai/God unless they exploit a specific psychological weakness.
   - **No Overpowered Nonsense**: Simple insults or random words should NOT trigger "Critical" or "God-tier" effects. High impact requires deep psychological insight, specific lore counters, or perfect timing.
   - **Reaction Reality**: Some characters are stubborn or prideful. If persuasion fails, return a "Minor" effect, no effect, or even a counter-attack (Player takes damage).
   - **Ally Interactions**: If the user talks to allies (e.g., encourages, commands, or heals via words), generate effects targeting "ally" or "all_allies".

2. **Numerical Reference Standards (IMPORTANT)**:
   - **HP Scale**:
     - Normal Human/Weak Youkai: ~500 HP
     - Strong Character (e.g. Reimu): >1800 HP
     - Boss/God: >5000 HP
   - **Effect Value Scale (Damage/Heal/Shield)**:
     - **Trivial** (Light tease, small talk): 10-50
     - **Minor** (Standard insult/encouragement): 50-100
     - **Moderate** (Effective persuasion/psychological hit): 100-200
     - **Significant** (Deep emotional impact/Truth bomb): 200-400
     - **Critical** (Shattering worldview/Perfect counter): 400-800
     - **God-tier** (Absolute dominance/Reality manipulation): >800
   - **Attribute Modification Scale (stat_mod/dodge_mod)**:
     - **Minor Buff/Debuff**: 0.05-0.10 (5%-10%)
     - **Moderate Buff/Debuff**: 0.15-0.25 (15%-25%)
     - **Strong Buff/Debuff**: 0.30-0.50 (30%-50%)
     - **Note**: 0.1 means 10%. Positive for buffs, negative for debuffs (except 'defense' where positive means stronger defense).
   - **Use these values to determine the magnitude of effects based on the quality of user input.**

3. **Generate Specific Effects**:
   - "damage": Mental damage (reduces HP).
   - "heal": Self-encouragement (restores Player HP) or Ally encouragement (restores Ally HP).
   - "shield": Grant shield (value = amount).
   - "status": Apply Buff/Debuff with detailed effects.
     - **Thematic Consistency**:
       * *Anger*: Increases Attack but decreases Defense/Wisdom.
       * *Confusion/Hesitation*: Decreases Dodge or causes Stun.
       * *Fear*: Decreases Attack/Defense or increases Escape chance.
       * *Inspiration/Morale*: Increases Ally Attack/Defense.
     - If the user's action is self-directed (e.g. "I focus"), set "target" to "player" (Buff).
     - If directed at enemy (e.g. "You are weak"), set "target" to "enemy" (Debuff).
     - If directed at ally (e.g. "Hang in there!"), set "target" to "ally" (Buff).
     - **Complex Effects**:
       * "damage_over_time": True Damage.
       * "heal": Healing over time or instant.
       * "stat_mod": Attribute modification.
       * "shield": Grant shield points.
   - "win": Enemy surrenders or joins (Only if narrative justifies it fully).
   - "escape": Player successfully distracts and runs.

4. **Final Requirements**:
   - Be creative but fair.
   - Language Requirement: The "narrative" and "description" fields MUST be in Simplified Chinese.

Output JSON Format:
{
  "narrative": "A short, immersive description (max 50 words) in Simplified Chinese.",
  "effects": [
    {
      "target": "enemy" | "player" | "all_enemies" | "ally" | "all_allies",
      "targetIndex": 0, // Index in the respective array (enemies or allies)
      "type": "damage" | "heal" | "shield" | "status" | "win" | "escape",
      "value": number (for damage/heal/shield) or string (for status/win/escape),
      "description": "Short log text in Simplified Chinese",
      "buffDetails": { // Only if type is "status"
         "name": "Effect Name (A Chinese word, such as '战意高昂')",
         "duration": 3, // Turns. Set to 1 for instant effects like True Damage.
         "effects": [
            { 
              "type": "stat_mod" | "damage_reduction" | "dodge_mod" | "damage_over_time" | "heal" | "shield",
              "targetStat": "attack" | "defense" | "dodge" | "damage_taken" (optional, for stat_mod),
              "value": 0.2 // (e.g. +20% attack, or 50 true damage)
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

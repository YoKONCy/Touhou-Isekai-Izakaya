import type { Combatant, SpellCard, Buff } from '@/types/combat';
import { TALENT_MODIFIERS } from './talentModifiers';

// --- Modifier Hook Types ---

export interface CombatContext {
  attacker: Combatant;
  defender?: Combatant;
  spell?: Combatant | SpellCard; // Use union for flexibility
  turn?: number;
  damage?: number; // For post-damage hooks
  actionType?: 'attack' | 'spell' | 'ultimate' | 'item' | 'talk';
  spellType?: 'normal' | 'ultimate' | 'buff' | 'heal' | 'shield';
  onLog?: (msg: string) => void;
  onPopup?: (target: Combatant, value: number | string, type: 'damage' | 'heal' | 'buff' | 'debuff' | 'crit') => void;
  applyBuff?: (target: Combatant, buff: any, type?: 'buff' | 'debuff') => void;
  addPopup?: (target: Combatant, value: number | string, type: 'damage' | 'heal' | 'buff' | 'debuff' | 'crit') => void;
  addLog?: (msg: string) => void;
}

// 1. Stat Calculation Hooks (Attacker/Defender Stats)
export type StatModifier = (value: number, context: CombatContext) => number;

// 2. Damage Calculation Hooks
export type DamageModifier = (damage: number, context: CombatContext) => number;

// 3. Mechanic Hooks (Boolean flags or special logic)
export type MechanicCheck = (context: CombatContext) => boolean;

// 4. Resource Hooks (Cost/Gain)
export type ResourceModifier = (amount: number, context: CombatContext) => number;

export interface CombatModifier {
  id: string;
  name: string;
  source: 'talent' | 'buff' | 'equipment' | 'system';
  priority: number; // Lower executes first (Base add), Higher executes last (Multipliers).
  
  // --- Hooks ---
  
  // Stats
  onCalculateMaxHp?: StatModifier;
  onCalculateMaxMp?: StatModifier;
  onCalculateAtk?: StatModifier; // Attack Multiplier
  onCalculateDef?: StatModifier; // Defense Multiplier
  onCalculateDodge?: StatModifier; // Flat Dodge Rate Add
  onCalculateHit?: StatModifier; // Flat Hit Rate Add
  onCalculateCritRate?: StatModifier; // Flat Crit Rate Add
  onCalculateCritDmg?: StatModifier; // Crit Dmg Multiplier Add
  
  // Combat Flow - Damage
  onCalculateBaseDamage?: DamageModifier; // Modify Base Damage (Pre-mitigation)
  onCalculateFinalDamage?: DamageModifier; // Modify Final Damage (Post-mitigation)
  onCalculateIncomingDamage?: DamageModifier; // Modify Damage Taken (Defender side)
  onCalculateFlatDamage?: DamageModifier; // Add flat damage (e.g. 力量训练)
  onCalculateSpellLevel?: StatModifier; // Modify effective spell level
  onCalculateCritDmgTaken?: StatModifier; // Modify crit damage taken multiplier
  onCalculateDoubleAttackChance?: StatModifier; // 连击几率

  // Combat Flow - Costs/Gains
  onCalculateMpCost?: ResourceModifier;
  onCalculatePPointGain?: ResourceModifier;
  onCalculateApMax?: StatModifier;
  
  // Mechanics
  shouldIgnoreDefense?: MechanicCheck;
  shouldIgnoreSuppression?: MechanicCheck;
  shouldAutoCrit?: MechanicCheck;
  shouldAutoDodge?: MechanicCheck; // e.g. "Mind Eye"
  shouldResistDebuff?: MechanicCheck; // 抵抗负面状态

  // Lifecycle
  onTurnStart?: (combatant: Combatant, context: CombatContext) => void;
  onCombatStart?: (combatant: Combatant, context: CombatContext) => void;
  onCombatWin?: (combatant: Combatant, context: CombatContext) => void;
  onAfterDodge?: (combatant: Combatant, context: CombatContext) => void;
  onAfterDamageDealt?: (combatant: Combatant, damage: number, context: CombatContext) => void;
}

// --- Registry ---

const activeModifiers: CombatModifier[] = [];

export function registerModifier(modifier: CombatModifier) {
  // Avoid duplicates
  if (activeModifiers.find(m => m.id === modifier.id)) return;
  activeModifiers.push(modifier);
  activeModifiers.sort((a, b) => a.priority - b.priority);
}

export function unregisterModifier(id: string) {
  const index = activeModifiers.findIndex(m => m.id === id);
  if (index !== -1) {
    activeModifiers.splice(index, 1);
  }
}

// --- Helper: Convert Buff to Modifier ---
function convertBuffToModifier(buff: Buff): CombatModifier {
  const mod: CombatModifier = {
    id: buff.id,
    name: buff.name,
    source: 'buff',
    priority: 20, // Buffs usually apply after base stats (Talents)
  };

  buff.effects.forEach(effect => {
    // 1. Stat Mods
    if (effect.type === 'stat_mod') {
      const val = Number(effect.value);
      
      if (effect.targetStat === 'attack') {
        mod.onCalculateAtk = (current) => current + val;
      } else if (effect.targetStat === 'defense') {
        mod.onCalculateDef = (current) => current - val;
      } else if (effect.targetStat === 'damage_taken') {
        mod.onCalculateDef = (current) => current + val;
      } else if (effect.targetStat === 'dodge') {
        mod.onCalculateDodge = (current) => current + val;
      } else if (effect.targetStat === 'mp_cost_reduction') {
         mod.onCalculateMpCost = (cost) => Math.max(0, cost * (1 - val));
      }
    } 
    // 2. MP Regen
    else if (effect.type === 'heal_mp') {
       mod.onTurnStart = (combatant) => {
          const val = Number(effect.value);
          combatant.mp = Math.min(combatant.maxMp, combatant.mp + val);
       };
    }
    // 3. Dodge Mod
    else if (effect.type === 'dodge_mod') {
       mod.onCalculateDodge = (current) => current + Number(effect.value);
    }
    // 3. Damage Reduction
    else if (effect.type === 'damage_reduction') {
       // Reduce damage taken. Similar to 'defense'.
       mod.onCalculateDef = (current) => current - Number(effect.value);
    }
    // 4. Shield (Flat or Pct)
    else if (effect.type === 'shield') {
       // Buffs that grant shields usually apply them once.
    }
    // 5. DOT/Heal
    else if (effect.type === 'damage_over_time' || effect.type === 'heal') {
       // Add lifecycle hook for turn-based effects
       const originalOnTurnStart = mod.onTurnStart;
       mod.onTurnStart = (combatant, context) => {
         if (originalOnTurnStart) originalOnTurnStart(combatant, context);
         
         const val = Number(effect.value);
         if (effect.type === 'damage_over_time') {
           const damage = val;
           if (damage > 0) {
            combatant.hp = Math.max(0, combatant.hp - damage);
            if (context.onLog) context.onLog(`${combatant.name} 受到 ${buff.name} 的持续伤害 ${damage}点！`);
            if (context.onPopup) context.onPopup(combatant, damage, 'damage');
          }
         } else if (effect.type === 'heal') {
           const heal = val;
           if (heal > 0) {
             combatant.hp = Math.min(combatant.maxHp, combatant.hp + heal);
             if (context.onLog) context.onLog(`${combatant.name} 因 ${buff.name} 恢复了 ${heal} 点生命！`);
             if (context.onPopup) context.onPopup(combatant, heal, 'heal');
           }
         }
       };
    }
  });

  return mod;
}

export function applyLifecycleHook(
  hookName: 'onTurnStart' | 'onCombatStart' | 'onCombatWin' | 'onAfterDodge' | 'onAfterDamageDealt',
  combatant: Combatant,
  context: CombatContext,
  extraVal?: number
) {
  const mods = getActiveModifiers(combatant);
  for (const mod of mods) {
    const hook = mod[hookName];
    if (hook) {
      if (hookName === 'onAfterDamageDealt') {
        (hook as (c: Combatant, d: number, ctx: CombatContext) => void)(combatant, extraVal || 0, context);
      } else {
        (hook as (c: Combatant, ctx: CombatContext) => void)(combatant, context);
      }
    }
  }
}

export function getActiveModifiers(combatant: Combatant): CombatModifier[] {
  // Filter modifiers that apply to this combatant
  // For now, we assume global registration but logic checks context.
  // Ideally, modifiers should be attached to the combatant object or derived dynamically.
  
  // REFACTOR STRATEGY: 
  // Instead of a global list, we dynamically generate the list based on:
  // 1. Combatant's Talents (if Player)
  // 2. Combatant's Buffs
  // 3. System Base Rules (Proficiency, etc.)
  
  const modifiers: CombatModifier[] = [];
  
  // 1. System Modifiers (Always active or checked internally)
  // (We might keep system logic in core functions for performance, or move here)
  
  // 2. Talent Modifiers
  if (combatant.isPlayer && combatant.unlockedTalents) {
     combatant.unlockedTalents.forEach((talentId: string) => {
        const mod = TALENT_MODIFIERS[talentId];
        if (mod) modifiers.push(mod);
     });
  }
  
  // 3. Buff Modifiers
  if (combatant.buffs) {
      combatant.buffs.forEach(buff => {
          modifiers.push(convertBuffToModifier(buff));
      });
  }
  
  return modifiers.sort((a, b) => a.priority - b.priority);
}

// --- Execution Helpers ---

export function applyStatModifiers(
  initialValue: number, 
  hookName: keyof CombatModifier, 
  combatant: Combatant, 
  context: CombatContext
): number {
  let value = initialValue;
  const mods = getActiveModifiers(combatant);
  
  for (const mod of mods) {
    const hook = mod[hookName] as StatModifier | undefined;
    if (hook) {
      value = hook(value, context);
    }
  }
  return value;
}

export function checkMechanic(
  hookName: keyof CombatModifier,
  combatant: Combatant,
  context: CombatContext
): boolean {
  const mods = getActiveModifiers(combatant);
  for (const mod of mods) {
    const hook = mod[hookName] as MechanicCheck | undefined;
    if (hook && hook(context)) return true;
  }
  return false;
}

// --- Talent Modifier Definitions (Placeholder) ---

import type { Combatant, SpellCard, Buff } from '@/types/combat';
import { TALENT_MODIFIERS } from './talentModifiers';

// --- 修正器钩子类型定义 ---

export interface CombatContext {
  attacker: Combatant;
  defender?: Combatant;
  spell?: Combatant | SpellCard; // 使用联合类型以提升扩展灵活性
  turn?: number;
  damage?: number; // 用于执行伤害发生后的回调钩子
  actionType?: 'attack' | 'spell' | 'ultimate' | 'item' | 'talk';
  spellType?: 'normal' | 'ultimate' | 'buff' | 'heal' | 'shield';
  onLog?: (msg: string) => void;
  onPopup?: (
    target: Combatant,
    value: number | string,
    type: 'damage' | 'heal' | 'buff' | 'debuff' | 'crit'
  ) => void;
  applyBuff?: (target: Combatant, buff: any, type?: 'buff' | 'debuff') => void;
  addPopup?: (
    target: Combatant,
    value: number | string,
    type: 'damage' | 'heal' | 'buff' | 'debuff' | 'crit'
  ) => void;
  addLog?: (msg: string) => void;
}

// 1. 基础属性计算钩子（作用于攻击者/防御者属性）
export type StatModifier = (value: number, context: CombatContext) => number;

// 2. 伤害推导计算钩子
export type DamageModifier = (damage: number, context: CombatContext) => number;

// 3. 机制判定钩子（返回布尔标识或特殊执行逻辑）
export type MechanicCheck = (context: CombatContext) => boolean;

// 4. 资源变动钩子（消耗/获取）
export type ResourceModifier = (amount: number, context: CombatContext) => number;

export interface CombatModifier {
  id: string;
  name: string;
  source: 'talent' | 'buff' | 'equipment' | 'system';
  priority: number; // 优先级：低数值优先执行（基础加成），高数值最后执行（倍数修正）。

  // --- Hooks ---

  // Stats
  onCalculateMaxHp?: StatModifier;
  onCalculateMaxMp?: StatModifier;
  onCalculateAtk?: StatModifier; // 攻击力倍数修正
  onCalculateDef?: StatModifier; // 防御力倍数修正
  onCalculateDodge?: StatModifier; // 基础闪避率加成
  onCalculateHit?: StatModifier; // 基础命中率加成
  onCalculateCritRate?: StatModifier; // 基础暴击率加成
  onCalculateCritDmg?: StatModifier; // 暴击伤害倍数加成

  // Combat Flow - Damage
  onCalculateBaseDamage?: DamageModifier; // 修正基础伤害（减伤前）
  onCalculateFinalDamage?: DamageModifier; // 修正最终伤害（减伤后）
  onCalculateIncomingDamage?: DamageModifier; // 修正受到的伤害（防御侧）
  onCalculateFlatDamage?: DamageModifier; // 增加固定额度伤害（如：力量训练奖励）
  onCalculateSpellLevel?: StatModifier; // 修正符卡有效等级权重
  onCalculateCritDmgTaken?: StatModifier; // 修正受到的暴击伤害权重
  onCalculateDoubleAttackChance?: StatModifier; // 连击几率

  // Combat Flow - Costs/Gains
  onCalculateMpCost?: ResourceModifier;
  onCalculatePPointGain?: ResourceModifier;
  onCalculateApMax?: StatModifier;

  // Mechanics
  shouldIgnoreDefense?: MechanicCheck;
  shouldIgnoreSuppression?: MechanicCheck;
  shouldAutoCrit?: MechanicCheck;
  shouldAutoDodge?: MechanicCheck; // 强制闪避判定（如：“心眼”效果）
  shouldResistDebuff?: MechanicCheck; // 抵抗负面状态

  // Lifecycle
  onTurnStart?: (combatant: Combatant, context: CombatContext) => void;
  onCombatStart?: (combatant: Combatant, context: CombatContext) => void;
  onCombatWin?: (combatant: Combatant, context: CombatContext) => void;
  onAfterDodge?: (combatant: Combatant, context: CombatContext) => void;
  onAfterDamageDealt?: (combatant: Combatant, damage: number, context: CombatContext) => void;
}

// --- 注册中心 ---

const activeModifiers: CombatModifier[] = [];

export function registerModifier(modifier: CombatModifier) {
  // 幂等性守卫：避免重复注册同一修正器
  if (activeModifiers.find((m) => m.id === modifier.id)) return;
  activeModifiers.push(modifier);
  activeModifiers.sort((a, b) => a.priority - b.priority);
}

export function unregisterModifier(id: string) {
  const index = activeModifiers.findIndex((m) => m.id === id);
  if (index !== -1) {
    activeModifiers.splice(index, 1);
  }
}

// --- 辅助工具：将 Buff 动态转换为修正器实体 ---
function convertBuffToModifier(buff: Buff): CombatModifier {
  const mod: CombatModifier = {
    id: buff.id,
    name: buff.name,
    source: 'buff',
    priority: 20 // 权重策略：Buff 通常在天赋（基础属性）之后执行
  };

  buff.effects.forEach((effect) => {
    // 1. 属性类修正 (Stat Mods)
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
    // 2. 灵力回复 (MP Regen)
    else if (effect.type === 'heal_mp') {
      mod.onTurnStart = (combatant) => {
        const val = Number(effect.value);
        combatant.mp = Math.min(combatant.maxMp, combatant.mp + val);
      };
    }
    // 3. 闪避修正 (Dodge Mod)
    else if (effect.type === 'dodge_mod') {
      mod.onCalculateDodge = (current) => current + Number(effect.value);
    }
    // 3. 伤害减免 (Damage Reduction)
    else if (effect.type === 'damage_reduction') {
      // 降低受到的伤害（逻辑上类似于增加动态防御值）
      mod.onCalculateDef = (current) => current - Number(effect.value);
    }
    // 4. 护盾逻辑 (Shield - 固定值或百分比)
    else if (effect.type === 'shield') {
      // 注意：提供护盾的 Buff 通常在赋予时即刻生效，无需持续挂钩
    }
    // 5. DOT/Heal
    else if (effect.type === 'damage_over_time' || effect.type === 'heal') {
      // 注入生命周期钩子以驱动回合制效果
      const originalOnTurnStart = mod.onTurnStart;
      mod.onTurnStart = (combatant, context) => {
        if (originalOnTurnStart) originalOnTurnStart(combatant, context);

        const val = Number(effect.value);
        if (effect.type === 'damage_over_time') {
          const damage = effect.isPercentage ? Math.floor(combatant.maxHp * val) : val;
          if (damage > 0) {
            combatant.hp = Math.max(0, combatant.hp - damage);
            if (context.onLog)
              context.onLog(`${combatant.name} 受到 ${buff.name} 的持续伤害 ${damage}点！`);
            if (context.onPopup) context.onPopup(combatant, damage, 'damage');
          }
        } else if (effect.type === 'heal') {
          const heal = effect.isPercentage ? Math.floor(combatant.maxHp * val) : val;
          if (heal > 0) {
            combatant.hp = Math.min(combatant.maxHp, combatant.hp + heal);
            if (context.onLog)
              context.onLog(`${combatant.name} 因 ${buff.name} 恢复了 ${heal} 点生命！`);
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
        (hook as (c: Combatant, d: number, ctx: CombatContext) => void)(
          combatant,
          extraVal || 0,
          context
        );
      } else {
        (hook as (c: Combatant, ctx: CombatContext) => void)(combatant, context);
      }
    }
  }
}

export function getActiveModifiers(combatant: Combatant): CombatModifier[] {
  // 筛选并提取当前单位身上生效的所有修正器
  // 当前阶段：基于全局注册表进行语境合法性校验
  // 演进建议：后续应将修正器直接挂载至单位对象实体，或采用动态组合模式推导

  // --- 重构演进策略 ---
  // 弃用全局清单，改用基于以下维度的动态工厂模式生成：
  // 1. 单位持有的天赋列表 (针对玩家端)
  // 2. 单位当前挂接的 Buff 状态池
  // 3. 系统底层规则（如：熟练度加成等）

  const modifiers: CombatModifier[] = [];

  // 1. 系统级修正器（常驻激活或执行内部隐式检查）
  // (出于性能考量，核心系统逻辑可能仍保留在原生函数中，或在此处封装)

  // 2. Talent Modifiers
  if (combatant.isPlayer && combatant.unlockedTalents) {
    combatant.unlockedTalents.forEach((talentId: string) => {
      const mod = TALENT_MODIFIERS[talentId];
      if (mod) modifiers.push(mod);
    });
  }

  // 3. Buff Modifiers
  if (combatant.buffs) {
    combatant.buffs.forEach((buff) => {
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

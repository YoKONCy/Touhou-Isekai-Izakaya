import type { CombatModifier, CombatContext } from './combatModifiers';
import type { Combatant, PowerLevel } from '@/types/combat';

const POWER_SCALE: Record<PowerLevel, number> = {
  "∞": 100, "OMEGA": 50, "UX": 20, "EX": 15, "US": 12, 
  "SSS": 10, "SS": 9, "S+": 8, "S": 7,
  "A+": 6, "A": 5, "B+": 4, "B": 3, "C+": 2, "C": 1, 
  "D+": 0, "D": -1, "E+": -2, "E": -3, "F+": -4, "F": -5, "F-": -6
};

export const TALENT_MODIFIERS: Record<string, CombatModifier> = {
  // --- Row 1 ---
  'c_vitality': {
    id: 'c_vitality',
    name: '体魄强健',
    source: 'talent',
    priority: 10,
    onCalculateMaxHp: (val: number) => val + 50
  },
  'c_spirit': {
    id: 'c_spirit',
    name: '灵力充盈',
    source: 'talent',
    priority: 10,
    onCalculateMaxMp: (val: number) => val + 50
  },
  'c_agility': {
    id: 'c_agility',
    name: '迅捷步法',
    source: 'talent',
    priority: 10,
    onCalculateDodge: (val: number) => val + 0.03
  },
  'c_focus': {
    id: 'c_focus',
    name: '精准打击',
    source: 'talent',
    priority: 10,
    onCalculateHit: (val: number) => val + 0.05
  },
  'c_guard': {
    id: 'c_guard',
    name: '基础格挡',
    source: 'talent',
    priority: 10,
    onCalculateIncomingDamage: (val: number) => Math.max(0, val - 5)
  },

  // --- Row 2 ---
  'c_strength': {
    id: 'c_strength',
    name: '力量训练',
    source: 'talent',
    priority: 10,
    onCalculateFlatDamage: (val: number) => val + 5
  },
  'c_endurance': {
    id: 'c_endurance',
    name: '耐力训练',
    source: 'talent',
    priority: 20, // Multiplier
    onCalculateMaxHp: (val: number) => val * 1.05
  },
  'c_meditation': {
    id: 'c_meditation',
    name: '冥想',
    source: 'talent',
    priority: 10,
    onCombatStart: (combatant: Combatant, ctx: CombatContext) => {
       // Check if onPopup and applyBuff are available in context (from CombatOverlay)
       if (ctx && ctx.applyBuff) {
          ctx.applyBuff(combatant, {
             id: 'buff_meditation',
             name: '冥想',
             type: 'buff',
             description: '冥想状态下，每回合回复50点MP',
             duration: 3,
             effects: [{ type: 'heal_mp', value: 50, isPercentage: false }]
          });
       } else {
          // Fallback if context not fully set up (should be handled in CombatOverlay)
          combatant.mp = Math.min(combatant.maxMp, combatant.mp + 10);
       }
    }
  },
  'c_reflex': {
    id: 'c_reflex',
    name: '反射神经',
    source: 'talent',
    priority: 10,
    onCalculateDodge: (val: number) => val + 0.02
  },
  'c_toughness': {
    id: 'c_toughness',
    name: '强韧肉体',
    source: 'talent',
    priority: 10,
    onCalculateCritDmgTaken: (val: number) => val * 0.7 // Reduce critical damage bonus taken by 30%
  },

  // --- Row 3 ---
  'c_insight': {
    id: 'c_insight',
    name: '弱点洞察',
    source: 'talent',
    priority: 10,
    onCalculateCritRate: (val: number) => val + 0.05
  },
  'c_recycling': {
    id: 'c_recycling',
    name: '灵力回收',
    source: 'talent',
    priority: 10,
    onCalculateMpCost: (val: number) => Math.floor(val * 0.95)
  },
  'c_morale': {
    id: 'c_morale',
    name: '战意高昂',
    source: 'talent',
    priority: 10,
    onCombatStart: (combatant: Combatant, ctx: CombatContext) => {
       combatant.pPoints = (combatant.pPoints || 0) + 20;
       if (ctx.addPopup) ctx.addPopup(combatant, '+20 P', 'buff');
       if (ctx.addLog) ctx.addLog(`${combatant.name} 触发【战意高昂】，获得 20 点 P 点！`);
    }
  },
  'c_preparation': {
    id: 'c_preparation',
    name: '快速整备',
    source: 'talent',
    priority: 10,
    onCombatStart: (combatant: Combatant, ctx: CombatContext) => {
       const healAmount = Math.floor(combatant.maxHp * 0.25);
       combatant.hp = Math.min(combatant.maxHp, combatant.hp + healAmount);
       if (ctx.addPopup) ctx.addPopup(combatant, healAmount, 'heal');
       if (ctx.addLog) ctx.addLog(`${combatant.name} 触发【快速整备】，回复了 ${healAmount} 点生命值！`);
    }
  },
  'c_willpower': {
    id: 'c_willpower',
    name: '坚韧意志',
    source: 'talent',
    priority: 10,
    shouldResistDebuff: () => Math.random() < 0.25 // 25% chance to resist any debuff
  },
  'c_lethal': {
    id: 'c_lethal',
    name: '致命一击',
    source: 'talent',
    priority: 10,
    onCalculateCritDmg: (val: number) => val + 0.2
  },

  // --- Row 4 ---
  'c_spell_mastery_1': {
    id: 'c_spell_mastery_1',
    name: '符卡掌握',
    source: 'talent',
    priority: 10,
    onCalculateSpellLevel: (val: number) => val + 5
  },
  'c_counter': {
    id: 'c_counter',
    name: '反击架势',
    source: 'talent',
    priority: 10,
    onAfterDodge: (combatant: Combatant, ctx: CombatContext) => {
       if (ctx.addPopup) ctx.addPopup(combatant, '反击准备', 'buff');
       // Logic: Next attack +20% damage. Handled via temporary buff.
       if (ctx.applyBuff) {
          ctx.applyBuff(combatant, {
             id: 'buff_counter',
             name: '反击',
             type: 'buff',
             description: '闪避后的反击，下次攻击伤害提升20%',
             duration: 1,
             effects: [{ type: 'stat_mod', targetStat: 'attack', value: 0.2, isPercentage: true }]
          });
       }
    }
  },
  'c_survival': {
    id: 'c_survival',
    name: '生存本能',
    source: 'talent',
    priority: 10,
    onCalculateDodge: (val: number, ctx: CombatContext) => {
       if (ctx.attacker.hp / ctx.attacker.maxHp < 0.3) return val + 0.1;
       return val;
    }
  },
  'c_break': {
    id: 'c_break',
    name: '破防打击',
    source: 'talent',
    priority: 10,
    onCalculateDef: (val: number, ctx: CombatContext) => {
       // If attacker has this talent, target's defense is reduced
       if (ctx.defender) return val * 0.8; // Reduce target's effective defense by 20%
       return val;
    }
  },
  'c_flow': {
    id: 'c_flow',
    name: '魔力流转',
    source: 'talent',
    priority: 10,
    onTurnStart: (combatant: Combatant, ctx: CombatContext) => {
       const healMp = Math.floor(combatant.maxMp * 0.02);
       combatant.mp = Math.min(combatant.maxMp, combatant.mp + healMp);
       if (ctx.addPopup) ctx.addPopup(combatant, healMp, 'heal');
    }
  },
  'c_precision': {
    id: 'c_precision',
    name: '精密操作',
    source: 'talent',
    priority: 10,
    onCalculateHit: (val: number) => val + 0.1
  },

  // --- Row 5 ---
  'c_accumulation': {
    id: 'c_accumulation',
    name: '厚积薄发',
    source: 'talent',
    priority: 10,
    onCalculatePPointGain: (val: number) => val * 1.4
  },
  'c_spell_mastery_2': {
    id: 'c_spell_mastery_2',
    name: '符卡精通',
    source: 'talent',
    priority: 20,
    onCalculateFinalDamage: (val: number, ctx: CombatContext) => {
       if (ctx.spell) return val * 1.1;
       return val;
    }
  },
  'c_desperation': {
    id: 'c_desperation',
    name: '绝境反击',
    source: 'talent',
    priority: 20,
    onCalculateFinalDamage: (val: number, ctx: CombatContext) => {
       if (ctx.attacker.hp / ctx.attacker.maxHp < 0.3) return val * 1.2;
       return val;
    }
  },
  'c_shield': {
    id: 'c_shield',
    name: '灵力护盾',
    source: 'talent',
    priority: 10,
    onCombatStart: (combatant: Combatant, ctx: CombatContext) => {
       const shieldAmount = Math.floor(combatant.maxHp * 0.2);
       combatant.shield = (combatant.shield || 0) + shieldAmount;
       if (ctx.addPopup) ctx.addPopup(combatant, shieldAmount, 'buff');
       if (ctx.addLog) ctx.addLog(`${combatant.name} 触发【灵力护盾】，获得 ${shieldAmount} 点护盾！`);
    }
  },
  'c_first_aid': {
    id: 'c_first_aid',
    name: '战场急救',
    source: 'talent',
    priority: 10,
    onCombatWin: (combatant: Combatant, ctx: CombatContext) => {
       const healAmount = Math.floor(combatant.maxHp * 0.1);
       combatant.hp = Math.min(combatant.maxHp, combatant.hp + healAmount);
       if (ctx.addPopup) ctx.addPopup(combatant, healAmount, 'heal');
       if (ctx.addLog) ctx.addLog(`${combatant.name} 触发【战场急救】，战斗胜利后回复 ${healAmount} 点生命值！`);
    }
  },
  'c_overload': {
    id: 'c_overload',
    name: '魔力过载',
    source: 'talent',
    priority: 10,
    onCalculateMpCost: (val: number) => Math.floor(val * 1.2),
    onCalculateFinalDamage: (val: number, ctx: CombatContext) => {
       if (ctx.spell) return val * 1.15;
       return val;
    }
  },

  // --- Row 6 ---
  'c_iron_skin': {
    id: 'c_iron_skin',
    name: '钢铁之躯',
    source: 'talent',
    priority: 20,
    onCalculateIncomingDamage: (val: number, ctx: CombatContext) => {
       if (ctx.actionType === 'attack') return Math.floor(val * 0.8);
       return val;
    }
  },
  'c_mind_eye': {
    id: 'c_mind_eye',
    name: '心眼',
    source: 'talent',
    priority: 10,
    shouldAutoDodge: (_ctx: CombatContext) => {
       // Needs state to track "First Hit". 
       // We can check turn === 1 and maybe a flag?
       // For simplicity: First turn dodge? Or first attack of combat?
       // Description says "First attack in combat".
       // We'll rely on a combat state flag handled in overlay.
       return false; // Handled specially
    }
  },
  'c_bomb_master': {
    id: 'c_bomb_master',
    name: 'BOMB专家',
    source: 'talent',
    priority: 10,
    onCalculateMpCost: (val: number, ctx: CombatContext) => {
       if (ctx.actionType === 'ultimate' || ctx.spellType === 'ultimate') return Math.floor(val * 0.6);
       return val;
    }
  },
  'c_execution': {
    id: 'c_execution',
    name: '处决',
    source: 'talent',
    priority: 20,
    onCalculateFinalDamage: (val: number, ctx: CombatContext) => {
       if (ctx.defender && ctx.defender.hp / ctx.defender.maxHp < 0.2) return val * 1.3;
       return val;
    }
  },
  'c_bloodlust': {
    id: 'c_bloodlust',
    name: '嗜血渴望',
    source: 'talent',
    priority: 10,
    onAfterDamageDealt: (combatant: Combatant, damage: number, ctx: CombatContext) => {
       if (damage > 0) {
          const heal = Math.floor(damage * 0.1); // Heal 10% of damage dealt
          combatant.hp = Math.min(combatant.maxHp, combatant.hp + heal);
          if (ctx.addPopup) ctx.addPopup(combatant, heal, 'heal');
       }
    }
  },

  // --- Row 7 ---
  'c_pain_suppress': {
    id: 'c_pain_suppress',
    name: '无惧苦痛',
    source: 'talent',
    priority: 30, // High priority reduction
    onCalculateIncomingDamage: (val: number) => Math.floor(val * 0.7)
  },
  'c_crit_master': {
    id: 'c_crit_master',
    name: '暴击强化',
    source: 'talent',
    priority: 10,
    onCalculateCritDmg: (val: number) => val + 0.5
  },
  'c_double_strike': {
    id: 'c_double_strike',
    name: '连击架势',
    source: 'talent',
    priority: 10,
    onCalculateDoubleAttackChance: (val: number) => val + 0.35
  },
  'c_burst': {
    id: 'c_burst',
    name: '灵力爆发',
    source: 'talent',
    priority: 20,
    onCalculateFinalDamage: (val: number, ctx: CombatContext) => {
       if (ctx.turn === 1) return val * 1.4;
       return val;
    }
  },

  // --- Row 8 ---
  'c_potential': {
    id: 'c_potential',
    name: '潜能解放',
    source: 'talent',
    priority: 10,
    onCalculateApMax: (val: number) => val + 1
  },
  'c_balance': {
    id: 'c_balance',
    name: '裁决天平',
    source: 'talent',
    priority: 10,
    shouldIgnoreSuppression: () => true
  },
  'c_fantasy_killer': {
    id: 'c_fantasy_killer',
    name: '幻想杀手',
    source: 'talent',
    priority: 20,
    onCalculateFinalDamage: (val: number, ctx: CombatContext) => {
       // Against enemies with power > S (assume power is a string or compare numeric value)
       // Let's assume there's a power level mapping or numeric power in defender
       if (ctx.defender) {
          const defenderPower = POWER_SCALE[ctx.defender.power];
          if (defenderPower >= POWER_SCALE["S"]) {
             return val * 1.5;
          }
       }
       return val;
    }
  }
};

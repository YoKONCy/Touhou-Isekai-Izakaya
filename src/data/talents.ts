export type TalentCategory = 'combat' | 'knowledge';

export interface TalentNode {
  id: string;
  name: string;
  description: string;
  cost: number;
  category: TalentCategory;
  prerequisites: string[]; // List of Talent IDs
  position: { x: number; y: number }; // Grid position (col, row)
  effects?: Record<string, any>; // Mechanical effects
}

export const TALENTS: Record<string, TalentNode> = {
  // --- Combat Talents (武炼极意) ---
  // Row 1 (Cost 1) - Basic Foundation (Root nodes)
  'c_vitality': {
    id: 'c_vitality',
    name: '体魄强健',
    description: '最大生命值增加 50 点',
    cost: 1,
    category: 'combat',
    prerequisites: [],
    position: { x: 0, y: 0 },
    effects: { stat_max_hp: 50 }
  },
  'c_spirit': {
    id: 'c_spirit',
    name: '灵力充盈',
    description: '最大灵力值增加 50 点',
    cost: 1,
    category: 'combat',
    prerequisites: [],
    position: { x: 2, y: 0 },
    effects: { stat_max_mp: 50 }
  },
  'c_agility': {
    id: 'c_agility',
    name: '迅捷步法',
    description: '增加 3% 的闪避率',
    cost: 1,
    category: 'combat',
    prerequisites: [],
    position: { x: -2, y: 0 },
    effects: { stat_dodge: 0.03 }
  },
  'c_focus': {
    id: 'c_focus',
    name: '精准打击',
    description: '增加 5% 的命中率',
    cost: 1,
    category: 'combat',
    prerequisites: [],
    position: { x: 4, y: 0 },
    effects: { stat_hit_rate: 0.05 }
  },
  'c_guard': {
    id: 'c_guard',
    name: '基础格挡',
    description: '受到的最终伤害减少 5 点',
    cost: 1,
    category: 'combat',
    prerequisites: [],
    position: { x: -4, y: 0 },
    effects: { stat_flat_dmg_reduction: 5 }
  },

  // Row 2 (Cost 1) - Advanced Basics
  'c_strength': {
    id: 'c_strength',
    name: '力量训练',
    description: '基础伤害增加 5 点',
    cost: 1,
    category: 'combat',
    prerequisites: ['c_focus'],
    position: { x: 4, y: 1 },
    effects: { stat_flat_dmg: 5 }
  },
  'c_endurance': {
    id: 'c_endurance',
    name: '耐力训练',
    description: '最大生命值增加 5%',
    cost: 1,
    category: 'combat',
    prerequisites: ['c_vitality'],
    position: { x: 0, y: 1 },
    effects: { stat_max_hp_pct: 0.05 }
  },
  'c_meditation': {
    id: 'c_meditation',
    name: '冥想',
    description: '战斗开始时获得每回合+50点MP的BUFF，持续3回合',
    cost: 1,
    category: 'combat',
    prerequisites: ['c_spirit'],
    position: { x: 2, y: 1 },
    effects: { combat_start_mp_regen_buff: 50, buff_duration: 3 }
  },
  'c_reflex': {
    id: 'c_reflex',
    name: '反射神经',
    description: '闪避率额外增加 2%',
    cost: 1,
    category: 'combat',
    prerequisites: ['c_agility'],
    position: { x: -2, y: 1 },
    effects: { stat_dodge: 0.02 }
  },
  'c_toughness': {
    id: 'c_toughness',
    name: '强韧肉体',
    description: '受到的暴击伤害减少 20%',
    cost: 1,
    category: 'combat',
    prerequisites: ['c_guard'],
    position: { x: -4, y: 1 },
    effects: { stat_crit_dmg_resist: 0.2 }
  },

  // Row 3 (Cost 2) - Specialization
  'c_insight': {
    id: 'c_insight',
    name: '弱点洞察',
    description: '暴击率增加 5%',
    cost: 2,
    category: 'combat',
    prerequisites: ['c_strength'],
    position: { x: 4, y: 2 },
    effects: { stat_crit_rate: 0.05 }
  },
  'c_recycling': {
    id: 'c_recycling',
    name: '灵力回收',
    description: '符卡MP消耗减少 5%',
    cost: 2,
    category: 'combat',
    prerequisites: ['c_meditation'],
    position: { x: 3, y: 2 },
    effects: { stat_mp_cost_reduction: 0.05 }
  },
  'c_morale': {
    id: 'c_morale',
    name: '战意高昂',
    description: '战斗开始时获得 20 P点',
    cost: 2,
    category: 'combat',
    prerequisites: ['c_endurance'],
    position: { x: 1, y: 2 },
    effects: { combat_start_p: 20 }
  },
  'c_preparation': {
    id: 'c_preparation',
    name: '快速整备',
    description: '战斗开始前回复25%的最大生命值',
    cost: 2,
    category: 'combat',
    prerequisites: ['c_reflex'],
    position: { x: -1.5, y: 2 },
    effects: { combat_start_heal_pct: 0.25 }
  },
  'c_willpower': {
    id: 'c_willpower',
    name: '坚韧意志',
    description: '负面状态抵抗率增加 10%',
    cost: 2,
    category: 'combat',
    prerequisites: ['c_toughness'],
    position: { x: -4, y: 2 },
    effects: { stat_debuff_resist: 0.1 }
  },
  'c_lethal': {
    id: 'c_lethal',
    name: '致命一击',
    description: '暴击伤害增加 20%',
    cost: 2,
    category: 'combat',
    prerequisites: ['c_insight'],
    position: { x: 5, y: 2.5 },
    effects: { stat_crit_dmg: 0.2 }
  },

  // Row 4 (Cost 2) - Tactics
  'c_spell_mastery_1': {
    id: 'c_spell_mastery_1',
    name: '符卡掌握',
    description: '所有符卡等级视为 +5 (上限仍为30)',
    cost: 2,
    category: 'combat',
    prerequisites: ['c_recycling'],
    position: { x: 3.5, y: 3 },
    effects: { spell_level_bonus: 5 }
  },
  'c_counter': {
    id: 'c_counter',
    name: '反击架势',
    description: '闪避成功后，下一次攻击伤害增加 10%',
    cost: 2,
    category: 'combat',
    prerequisites: ['c_preparation'],
    position: { x: -1, y: 3 },
    effects: { mechanic_dodge_counter: 0.1 }
  },
  'c_survival': {
    id: 'c_survival',
    name: '生存本能',
    description: '生命值低于 30% 时，闪避率增加 10%',
    cost: 2,
    category: 'combat',
    prerequisites: ['c_preparation'],
    position: { x: -2.5, y: 3 },
    effects: { mechanic_low_hp_dodge: 0.1 }
  },
  'c_break': {
    id: 'c_break',
    name: '破防打击',
    description: '攻击时忽略目标 10% 的防御/减伤',
    cost: 2,
    category: 'combat',
    prerequisites: ['c_insight'],
    position: { x: 4.5, y: 3.5 },
    effects: { mechanic_ignore_def: 0.1 }
  },
  'c_flow': {
    id: 'c_flow',
    name: '魔力流转',
    description: '每回合恢复 2% 最大 MP',
    cost: 2,
    category: 'combat',
    prerequisites: ['c_recycling', 'c_morale'],
    position: { x: 1.5, y: 3 },
    effects: { turn_mp_regen_pct: 0.02 }
  },
  'c_precision': {
    id: 'c_precision',
    name: '精密操作',
    description: '符卡命中率增加 10% (突破上限)',
    cost: 2,
    category: 'combat',
    prerequisites: ['c_lethal'],
    position: { x: 6, y: 3.5 },
    effects: { stat_hit_rate_bonus: 0.1 }
  },

  // Row 5 (Cost 3) - Advanced Tactics
  'c_accumulation': {
    id: 'c_accumulation',
    name: '厚积薄发',
    description: 'P点获取量增加 30%',
    cost: 3,
    category: 'combat',
    prerequisites: ['c_flow'],
    position: { x: 1, y: 4 },
    effects: { stat_p_point_gain: 0.3 }
  },
  'c_spell_mastery_2': {
    id: 'c_spell_mastery_2',
    name: '符卡精通',
    description: '符卡最终伤害增加 10%',
    cost: 3,
    category: 'combat',
    prerequisites: ['c_spell_mastery_1'],
    position: { x: 3.5, y: 4.2 },
    effects: { stat_final_dmg: 0.1 }
  },
  'c_desperation': {
    id: 'c_desperation',
    name: '绝境反击',
    description: '生命值低于 30% 时，造成伤害增加 20%',
    cost: 3,
    category: 'combat',
    prerequisites: ['c_survival'],
    position: { x: -3, y: 4 },
    effects: { mechanic_low_hp_dmg: 0.2 }
  },
  'c_shield': {
    id: 'c_shield',
    name: '灵力护盾',
    description: '战斗开始时获得 30% 最大生命值的护盾',
    cost: 3,
    category: 'combat',
    prerequisites: ['c_flow', 'c_counter'],
    position: { x: 0, y: 4 },
    effects: { combat_start_shield_hp_pct: 0.3 }
  },
  'c_first_aid': {
    id: 'c_first_aid',
    name: '战场急救',
    description: '战斗胜利后恢复 50% 最大生命值',
    cost: 3,
    category: 'combat',
    prerequisites: ['c_break'],
    position: { x: 5, y: 4.5 },
    effects: { combat_win_heal_pct: 0.1 }
  },
  'c_overload': {
    id: 'c_overload',
    name: '魔力过载',
    description: '消耗 MP 增加 20%，但伤害增加 15%',
    cost: 3,
    category: 'combat',
    prerequisites: ['c_precision'],
    position: { x: 7, y: 4.5 },
    effects: { mechanic_mp_dmg_tradeoff: 1 }
  },

  // Row 6 (Cost 3) - Mastery
  'c_iron_skin': {
    id: 'c_iron_skin',
    name: '钢铁之躯',
    description: '受到的普通攻击伤害减少20%',
    cost: 3,
    category: 'combat',
    prerequisites: ['c_shield'],
    position: { x: -1, y: 5 },
    effects: { stat_normal_atk_reduction: 0.2 }
  },
  'c_mind_eye': {
    id: 'c_mind_eye',
    name: '心眼',
    description: '必定闪避战斗中的第一次攻击',
    cost: 3,
    category: 'combat',
    prerequisites: ['c_accumulation'],
    position: { x: 1, y: 5.5 },
    effects: { mechanic_first_hit_dodge: 1 }
  },
  'c_bomb_master': {
    id: 'c_bomb_master',
    name: 'BOMB专家',
    description: '释放终极符卡时的灵力消耗减少40%',
    cost: 3,
    category: 'combat',
    prerequisites: ['c_spell_mastery_2'],
    position: { x: 3.5, y: 5.5 },
    effects: { mechanic_bomb_mp_reduction: 0.4 }
  },
  'c_execution': {
    id: 'c_execution',
    name: '处决',
    description: '对生命值低于 20% 的敌人伤害增加 30%',
    cost: 3,
    category: 'combat',
    prerequisites: ['c_first_aid'],
    position: { x: 5.5, y: 5.5 },
    effects: { mechanic_execute_dmg: 0.3 }
  },
  'c_bloodlust': {
    id: 'c_bloodlust',
    name: '嗜血渴望',
    description: '造成伤害的 5% 转化为生命值',
    cost: 3,
    category: 'combat',
    prerequisites: ['c_desperation'],
    position: { x: -3.5, y: 5.5 },
    effects: { mechanic_lifesteal: 0.05 }
  },

  // Row 7 (Cost 4) - Legendary
  'c_pain_suppress': {
    id: 'c_pain_suppress',
    name: '无惧苦痛',
    description: '固定减少 30% 的所有所受伤害',
    cost: 4,
    category: 'combat',
    prerequisites: ['c_iron_skin'],
    position: { x: -1.5, y: 6.5 },
    effects: { stat_all_dmg_reduction: 0.3 }
  },
  'c_crit_master': {
    id: 'c_crit_master',
    name: '暴击强化',
    description: '暴击伤害额外增加 50%',
    cost: 4,
    category: 'combat',
    prerequisites: ['c_execution'],
    position: { x: 6, y: 6.5 },
    effects: { stat_crit_dmg: 0.5 }
  },
  'c_double_strike': {
    id: 'c_double_strike',
    name: '连击架势',
    description: '普通攻击有 35% 概率攻击两次',
    cost: 4,
    category: 'combat',
    prerequisites: ['c_mind_eye'],
    position: { x: 1, y: 7 },
    effects: { mechanic_double_attack_chance: 0.35 }
  },
  'c_burst': {
    id: 'c_burst',
    name: '灵力爆发',
    description: '第一回合伤害增加 40%',
    cost: 4,
    category: 'combat',
    prerequisites: ['c_bomb_master'],
    position: { x: 3.5, y: 7 },
    effects: { mechanic_turn1_dmg: 0.4 }
  },

  // Row 8 (Cost 5) - Ultimate
  'c_potential': {
    id: 'c_potential',
    name: '潜能解放',
    description: '每回合的行动点（AP）从 2 点变为 3 点',
    cost: 5,
    category: 'combat',
    prerequisites: ['c_pain_suppress', 'c_double_strike'],
    position: { x: -0.5, y: 8.5 },
    effects: { stat_max_ap: 1 }
  },
  'c_balance': {
    id: 'c_balance',
    name: '裁决天平',
    description: '移除战斗中所有的战斗力等级压制修正',
    cost: 5,
    category: 'combat',
    prerequisites: ['c_crit_master', 'c_burst'],
    position: { x: 4.5, y: 8.5 },
    effects: { mechanic_ignore_suppression: 1 }
  },
  'c_fantasy_killer': {
    id: 'c_fantasy_killer',
    name: '幻想杀手',
    description: '对战斗力大于S的敌人造成50%额外伤害',
    cost: 5,
    category: 'combat',
    prerequisites: ['c_burst', 'c_double_strike'],
    position: { x: 2, y: 8.5 },
    effects: { mechanic_overpower_slayer_dmg: 0.5 }
  }
};

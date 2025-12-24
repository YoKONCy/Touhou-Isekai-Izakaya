export type PowerLevel = 
  | "∞" | "OMEGA" | "UX" | "EX" | "US" | "SSS" | "SS" | "S+" | "S" 
  | "A+" | "A" | "B+" | "B" | "C+" | "C" | "D+" | "D" | "E+" | "E" 
  | "F+" | "F" | "F-";

export interface SpellCard {
  id?: string; // Optional ID
  name: string;        // 符卡名
  description: string; // 符卡介绍
  
  // 战斗/小游戏相关 (预留)
  damage: number;      // 符卡伤害（作用于自身为0）
  scope: 'single' | 'aoe'; // 效用范围（单体/AOE）
  cost: number;        // 灵力消耗
  
  type?: 'attack' | 'buff' | 'debuff' | 'shield' | 'heal'; // 辅助分类
  effects?: Record<string, any>; // 附加DEBUFF/BUFF
  isUltimate?: boolean; // 是否为终极符卡 (释放时有特效)
  hitRate?: number; // 命中率 (默认 0.1, 终极符卡 1.0)
  
  // 熟练度系统
  level?: number;      // 当前等级 (默认 1)
  experience?: number; // 当前经验值 (0-100 升级)

  buffDetails?: { // Structure matching PersuasionEffect buffDetails
    name: string;
    duration: number;
    description: string;
    effects: BuffEffect[];
  };
}

export interface Combatant {
  id: string;
  name: string;
  team: 'player' | 'enemy';
  isPlayer: boolean; // True if this is the main character controlled by UI
  
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  
  power: PowerLevel;
  spellCards: SpellCard[];
  
  // Status effects
  buffs: Buff[];
  shield: number; // Extra HP layer
  dodgeRate: number; // Base 0.15 + buffs
  
  // P-Point System (Touhou Style)
  pPoints?: number; // 0-100 (Float allowed for calculation, display as int or formatted)
  maxPPoints?: number; // Default 100

  // Action Point System
  actionPoints?: number; // Current AP (Max 2)
  maxActionPoints?: number; // Default 2
  
  combatLevel?: number; // Player Combat Proficiency Level (1-100)
  unlockedTalents?: string[]; // IDs of unlocked talents

  hasUsedUltimate?: boolean; // Track if Ultimate has been used in this battle
}

export interface BuffEffect {
  type: 'stat_mod' | 'heal' | 'heal_mp' | 'shield' | 'damage_over_time' | 'dodge_mod' | 'damage_reduction';
  targetStat?: 'attack' | 'defense' | 'dodge' | 'damage_taken' | 'mp_cost_reduction';
  value: number; // For percentage use 0.1 for 10%, for flat use integer
  isPercentage: boolean;
}

export interface Buff {
  id: string; // Unique ID for tracking
  name: string;
  type: 'buff' | 'debuff';
  description: string;
  duration: number; // Turns remaining
  createdTurn?: number; // The turn number when this buff was applied
  effects: BuffEffect[];
}

export interface CombatLogEntry {
  turn: number;
  actorId: string;
  actorName: string;
  actionType: 'attack' | 'spell' | 'flee' | 'item' | 'wait';
  targetNames: string[];
  spellName?: string;
  damage?: number;
  isCrit?: boolean;
  isHit?: boolean; // For misses
  description: string; // "灵梦使用了梦想封印，造成了 500 点伤害"
}

export interface CombatState {
  isActive: boolean;
  isPending?: boolean; // Waiting for user confirmation
  turn: number;
  combatants: Combatant[];
  logs: CombatLogEntry[];
  result?: 'win' | 'loss' | 'escape';
  bgm_suggestion?: string;
}

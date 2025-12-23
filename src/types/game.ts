import { type CombatState, type SpellCard } from './combat';
import { type ManagementState } from './management';

export interface Item {
  id: string;          // English ID
  name: string;        // Display Name
  count: number;       // Quantity
  description: string; // Description
  type: string;        // Type (e.g., 'consumable', 'material', 'key_item')
  effects?: Record<string, any>; // Optional effects
}

export interface PlayerStatus {
  name: string;
  // Stats (Flattened)
  hp: number;
  max_hp: number;
  mp: number;
  max_mp: number;
  money: number;
  power: number | string; // Combat power, e.g. 10 or "D+"
  reputation: number; // Fame/Reputation
  
  // Combat Proficiency
  combatLevel: number; // 1-100
  combatExp: number; // 0-1000 per level

  // Descriptive Stats
  identity: string;
  persona: string; // Detailed description/personality
  clothing: string;
  location: string;
  residence: string; // Home/Base
  time: string; // e.g., "12:00"
  date: string; // e.g., "纪元123年1月1日"
  
  // Collections
  authorities: string[];
  items: Item[];
  spell_cards: SpellCard[];
}

export interface NPCStatus {
  id: string; // UUID or English ID
  name: string; // Display Name
  gender?: 'male' | 'female'; // Gender differentiation
  
  // Stats
  hp: number;
  max_hp: number;
  mp?: number;
  max_mp?: number;
  power: number | string;
  favorability: number; // 0-100+
  obedience: number;    // 0-100+
  relationship: string; // e.g. "Friend", "Enemy"
  residence?: string;   // Home/Base
  
  // State / Visuals
  clothing: string;
  posture: string;
  hands: string;
  mouth: string;
  face: string;
  chest?: string;    // Female specific
  buttocks?: string; // Female specific
  vagina?: string;   // Female specific
  anus?: string;     // Female specific
  mood: string;
  action: string; // Current action/behavior
  inner_thought: string;
}

export interface QuestReward {
  type: 'money' | 'item' | 'spell_card' | 'attribute' | 'event';
  description: string;
  value?: any;
}

export type QuestStatus = 'active' | 'completed' | 'failed';

export interface Quest {
  id: string;
  name: string;
  giver: string;
  description: string;
  requirements?: string[]; // Specific requirements/conditions for the quest
  rewards: QuestReward[];
  status: QuestStatus;
  acceptedTurn: number;
  completedTurn?: number;
  completedDate?: string;
  completedTime?: string;
  completionSummary?: string;
}

export type PromiseStatus = 'active' | 'completed' | 'failed' | 'expired';

export interface PromiseState {
  id: string;
  giver: string;
  createdTime: string; // e.g. "纪元123年1月1日 12:00"
  content: string;
  status: PromiseStatus;
  acceptedTurn: number;
  completedTurn?: number;
  completedDate?: string;
  completedTime?: string;
}

export interface GameSystemState {
  current_scene_npcs: string[]; // List of NPC IDs present
  minigame_triggered: boolean;
  minigame_result: string;
  turn_count: number; // Current turn number for memory snapshotting
  quick_replies: string[]; // Quick replies for the current turn (for rollback support)
  combat?: CombatState | null; // Active combat state
  management?: ManagementState | null; // Active management mini-game state
  
  // Custom Map Data
  customMap?: {
    layout: string[];
    theme: string;
    description: string;
  } | null;

  regenerateMapOnTrigger?: boolean;

  quests: Quest[]; // List of all quests
  promises?: PromiseState[]; // List of all promises
  pending_quest_trigger?: Quest | null; // Quest waiting for acceptance
  predicted_next_round_chars?: string[]; // Characters predicted to appear in the next round
  difficulty?: 'gentle' | 'normal' | 'cruel';
}

export interface GameState {
  player: PlayerStatus;
  npcs: Record<string, NPCStatus>;
  system: GameSystemState;
  flags: Record<string, any>; // Generic story flags
}

// Initial State Factory
export const INITIAL_GAME_STATE: GameState = {
  player: {
    name: '玩家', // Default placeholder, will be overridden by PlayerSettings
    hp: 500,
    max_hp: 500,
    mp: 1000,
    max_mp: 1000,
    money: 20000,
    power: 'D+',
    reputation: 0,
    identity: '异界来客',
    persona: '一个普通的异世界访客，对幻想乡充满好奇。',
    clothing: '现代休闲装束',
    location: '未知',
    residence: '无',
    time: '12:00',
    date: '纪元123年1月1日',
    combatLevel: 1,
    combatExp: 0,
    authorities: [],
    items: [],
    spell_cards: []
  },
  npcs: {},
  system: {
    current_scene_npcs: [],
    minigame_triggered: false,
    minigame_result: '',
    turn_count: 0,
    quick_replies: [],
    combat: null,
    management: null,
    quests: [],
    promises: [],
    pending_quest_trigger: null,
    difficulty: 'normal'
  },
  flags: {}
};

// --- Logic Action Types ---

export type ActionOperation = 'add' | 'subtract' | 'set' | 'push' | 'remove' | 'add_chars' | 'remove_chars';

export interface GameAction {
  type: 'UPDATE_PLAYER' | 'UPDATE_NPC' | 'INVENTORY' | 'SCENE';
  // Target fields
  target?: string; // For INVENTORY: 'items' | 'spell_cards' | 'authorities'
  npcId?: string;  // For UPDATE_NPC
  field?: string;  // Field to update (e.g., 'hp', 'money', 'mood')
  
  // Operation
  op: ActionOperation;
  value: any;
  
  // Scene specific
  location?: string;
  add_chars?: (string | any)[];
  remove_chars?: string[];
}

export interface LogicResult {
  thinking: string;
  actions: GameAction[];
  quick_replies: string[];
  summary: string;
}

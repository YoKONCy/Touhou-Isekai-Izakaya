export interface GameSnapshot {
  id: number;
  saveSlotId: number; // Foreign Key to SaveSlot
  chatId: number; 
  gameState: string; 
  createdAt: number;
}

export interface ChatMessage {
  id: number;
  saveSlotId: number; // Foreign Key to SaveSlot
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  snapshotId?: number;
  turnCount?: number; // The game turn this message belongs to
  
  // Debug Info
  debugLog?: {
    // LLM #1: Storyteller
    storyInput?: string;
    storyOutput?: string;
    storyThinking?: string;

    // LLM #2: Logic
    logicInput?: string;
    logicOutput?: string;
    logicThinking?: string;
  };
  
  // Chain of Thought Content (Stripped from content)
  thought_content?: string;
  
  // Illustration
  illustrationUrl?: string;
  illustrationPrompt?: string;
}

export interface SaveSlot {
  id: number;
  name: string;
  lastPlayed: number;
  summary: string; // Brief description of progress
  location: string;
}

export interface MemoryEntry {
  id: number;
  saveSlotId: number;
  turnCount: number;
  type: 'summary' | 'variable_change' | 'facility' | 'alliance' | 'intelligence';
  content: string; // JSON stringified object or plain text
  related_entities: string[]; // NPC UUIDs or Location names
  tags: string[];
  importance: number;
  createdAt: number;
  
  // New Metadata Fields
  gameDate?: string;    // e.g. "纪元123年1月1日"
  gameTime?: string;    // e.g. "12:00"
  location?: string;    // e.g. "博丽神社"
  characters?: string[]; // List of NPC names present in the scene
}

export interface GameSettings {
  id: number; // Singleton, usually 1
  globalProvider?: {
    baseUrl: string;
    apiKey: string;
  };
  llmConfigs?: Record<string, any>;
  enableMemoryRefinement?: boolean; // Toggle for LLM-based memory refinement
  enableManagementSystem?: boolean; // Toggle for Izakaya Management System
  useDefaultTilemap?: boolean; // Debug: Use hardcoded map instead of LLM generated one
  theme: 'light' | 'dark' | 'eye-protection';
  currentSaveSlotId?: number; // Active slot
  
  // Audio Settings
  audioVolume?: number;
  enableAudio?: boolean;
  bgmVolume?: number;
  sfxVolume?: number;
  
  // Drawing Settings
  drawingConfig?: {
    enabled: boolean;
    apiBaseUrl: string;
    apiKey: string;
    model: string;
  };

  // Player Persona (Global default)
  playerPersona?: {
    name: string;
    description: string; // The "User Persona" prompt section
  };
}

export interface CharacterCard {
  id?: number; // IndexedDB auto-increment ID
  uuid: string; // Unique ID for referencing
  name: string;
  description: string; // Personality / Description
  avatar?: string; // Base64 or URL
  tags: string[];
  category?: string; // Folder name, e.g., '博丽神社'
  gender?: 'female' | 'male' | 'other'; // New field for gender segregation
  
  // New Type Discrimination
  type?: 'character' | 'spell_card' | 'location' | 'info' | 'other'; 

  // Character Specific Fields
  initialPower?: string; // e.g. "S"
  initialMaxHp?: number;
  initialResidence?: string;

  // Spell Card Specific Fields
  cost?: number; // 灵力消耗
  damage?: number; // 符卡伤害
  damageType?: 'attack' | 'buff' | 'debuff' | 'shield' | 'heal'; // 符卡类型
  scope?: 'single' | 'aoe'; // 作用范围
  isUltimate?: boolean; // 是否为终极符卡
  hitRate?: number; // 命中率
  
  // Buff Details for Spell Cards of type 'buff'
  buffDetails?: any; 

  creatorNotes?: string;
}

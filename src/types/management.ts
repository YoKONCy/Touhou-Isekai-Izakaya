
export interface ManagementTrigger {
  trigger: boolean;
  context: string;
  special_guests?: string[];
  difficulty?: 'easy' | 'normal' | 'hard';
}

export interface ManagementStats {
  totalRevenue: number;
  customersServed: number;
  reputationGained: number;
  startTime: number; // timestamp
}

export interface ManagementState {
  isActive: boolean; // Is the mini-game currently running?
  isTriggered: boolean; // Has the trigger been activated by LLM?
  
  // Session Data (Reset on each run)
  context: string;
  storeDescription?: string; // Explicit store description for map generation
  previousMap?: {
    layout: string[];
    theme: string;
    description: string;
  }; // Previous map data for renovation
  specialGuests: string[];
  difficulty: 'easy' | 'normal' | 'hard';
  stats: ManagementStats;
  
  // Persistent Data (Optional, if we want to track overall progress here, 
  // though GameStore.player.money/reputation handles the main parts)
  unlockedRecipes?: string[];
  shopLevel?: number;
}

// --- Entity & Scene Types ---

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Position {
  x: number;
  y: number;
}

export interface Entity {
  id: string;
  type: 'player' | 'customer' | 'staff' | 'furniture';
  x: number; // Grid X
  y: number; // Grid Y
  pixelX: number; // Smooth animation X
  pixelY: number; // Smooth animation Y
  direction: Direction;
  isMoving: boolean;
  moveSpeed: number;
  targetX?: number;
  targetY?: number;
  sprite?: string; // Path or identifier
}

export interface Customer extends Entity {
  type: 'customer';
  name: string;
  isSpecial: boolean; // Is this a named character?
  dialogue?: string; // Pre-generated dialogue for special guests
  patience: number;
  state: 'entering' | 'waiting_seat' | 'seated' | 'ordering' | 'waiting_food' | 'eating' | 'paying' | 'leaving';
  order?: {
    dishName: string;
    requirements: string[];
    price: number;
  };
  seatId?: string; // ID of the furniture they are sitting at
  eatTimer?: number;
}

export interface Furniture extends Entity {
  type: 'furniture';
  furnitureType: 'table' | 'chair' | 'counter' | 'stove' | 'exit' | 'bed' | 'sofa' | 'lamp' | 'bookshelf' | 'toilet' | 'sink' | 'mirror';
  interactionPoint?: Position; // Where the player stands to interact
  isOccupied?: boolean;
  occupiedBy?: string; // Customer ID
  // Visuals
  width?: number; // In tiles
  height?: number; // In tiles
}

export const TileType = {
  FLOOR: 0,
  WALL: 1,
  COUNTER: 2,
  CHAIR: 3,
  KITCHEN: 4,
  EXIT: 5,
  BOWL_STACK: 6,
  COOKING_POT: 7,
  SERVING_TABLE: 8,
  WALL_WITH_PAINTING: 9,
  STAIRS: 10,
  WINDOW: 11,
  BED: 12,
  SOFA: 13,
  LAMP: 14,
  BOOKSHELF: 15,
  TOILET: 16,
  SINK: 17,
  MIRROR: 18
} as const;

export type TileType = typeof TileType[keyof typeof TileType];

export const TileTypeNames: Record<number, string> = {};
for (const key in TileType) {
    const value = TileType[key as keyof typeof TileType];
    TileTypeNames[value] = key;
}

export interface Item {
  id: string;
  name: string;
  type: 'bowl' | 'dish' | 'trash';
  icon?: string;
  data?: any; // For dish, this holds the CookingSession
}

export interface Ingredient {
  id: string;
  name: string;
  type: 'base' | 'spice' | 'main' | 'vegetable';
  icon: string; // Emoji or image url
  color: string;
}

export interface CookingSession {
  dishName: string;
  ingredients: { 
      ingredient: Ingredient; 
      timeAdded: number;
      cookedDuration: number; // Time cooked in seconds
      sequence: number; // Order of addition
  }[];
  startTime: number;
  totalDuration: number;
  accumulatedHeat: number; // Total heat energy absorbed
  finalPhase: string; // e.g. "Cooking", "Finished", "Burnt"
  status: 'cooking' | 'finished';
}

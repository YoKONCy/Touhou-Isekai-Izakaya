import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { dbService } from '@/services/DatabaseService';
import { useSettingsStore } from './settings';
import { useChatStore } from './chat';
import { useGameStore } from './game';

import { gameLoop } from '@/services/gameLoop';

// Define SaveSlot interface locally or import if available
// Assuming DatabaseService returns objects matching this structure
export interface SaveSlot {
  id: number;
  name: string;
  summary: string;
  lastPlayed: number;
  location?: string;
  gameDate?: string;
  gameTime?: string;
  playTime?: number;
  isMultiplayer?: boolean;
}

export const useSaveStore = defineStore('save', () => {
  const currentSaveId = ref<number | null>(null);
  const saves = ref<SaveSlot[]>([]);
  
  const settingsStore = useSettingsStore();
  
  async function loadSaves() {
    saves.value = await dbService.getSaveSlots();
  }

  async function init() {
    await loadSaves();
    
    // Check settings for last used save
    if (settingsStore.currentSaveSlotId) {
      const exists = saves.value.find(s => s.id === settingsStore.currentSaveSlotId);
      if (exists) {
        currentSaveId.value = exists.id;
      }
    }

    // If no save selected or found, try to select the most recent one
    if (!currentSaveId.value && saves.value.length > 0) {
      const firstSave = saves.value[0];
      if (firstSave) {
        currentSaveId.value = firstSave.id;
      }
    }

    // If still no save (fresh install), create default
    if (!currentSaveId.value) {
      await createSave('默认存档');
    }

    // Load data for the selected save
    if (currentSaveId.value) {
      await switchSave(currentSaveId.value);
    }
  }

  async function createSave(name: string, isMultiplayer: boolean = false) {
    const id = await dbService.createSaveSlot(name, '新游戏', '未知', isMultiplayer);
    
    await loadSaves();
    return id;
  }

  async function switchSave(id: number) {
    if (!id) return;
    
    // 1. Update Current Save ID
    currentSaveId.value = id;
    
    // 2. Persist to Settings
    settingsStore.currentSaveSlotId = id;
    await settingsStore.saveSettings();
    
    // 3. Update Last Played
    await dbService.updateSaveSlot(id, { lastPlayed: Date.now() });
    await loadSaves();

    // 4. Reload Game Data
    const chatStore = useChatStore();
    await chatStore.loadHistory(); 
    
    // 4.1 Sync Location from loaded state
    const gameStore = useGameStore();
    
    // 如果是联机存档，标记为联机模式，但不激活连接状态，需手动开房
    const saveInfo = saves.value.find(s => s.id === id);
    if (saveInfo?.isMultiplayer) {
      console.log('[SaveStore] 加载联机存档，准备进入联机模式。');
      gameStore.multiplayer.isMultiplayer = false; // 加载时不激活连接
      gameStore.multiplayer.isHost = false; 
    } else {
      gameStore.multiplayer.isMultiplayer = false;
      gameStore.multiplayer.isHost = false;
    }

    if (gameStore.state.player.location) {
       await dbService.updateSaveSlot(id, { location: gameStore.state.player.location });
       // Update local cache
       const saveIndex = saves.value.findIndex(s => s.id === id);
       if (saveIndex !== -1 && saves.value[saveIndex]) {
         saves.value[saveIndex].location = gameStore.state.player.location;
       }
    }
    
    // 5. Check if it's a new game (empty history)
    if (chatStore.messages.length === 0) {
       // Check if we already have an initial snapshot
       const latestSnapshot = await dbService.getLatestSnapshot(id);
       
       if (!latestSnapshot) {
          console.log('[SaveStore] 检测到新/空存档。正在初始化世界状态...');
          await gameLoop.initializeNewGame();
          await chatStore.createInitialSnapshot();
       } else {
          console.log('[SaveStore] 历史记录为空但存在快照。跳过初始化。');
       }
    }
  }

  async function renameSave(id: number, newName: string) {
    await dbService.updateSaveSlot(id, { name: newName });
    await loadSaves();
  }

  async function deleteSave(id: number) {
    if (!id) return;
    
    // Delete all related data (Cascading handled by DB Service / Schema)
    await dbService.deleteSaveSlot(id);

    if (currentSaveId.value === id) {
      currentSaveId.value = null;
      settingsStore.currentSaveSlotId = undefined;
      await settingsStore.saveSettings();
    }
    
    await loadSaves();
  }

  async function convertToMultiplayer(id: number) {
    await dbService.updateSaveSlot(id, { isMultiplayer: 1 });
    await loadSaves();
  }

  async function exportSave(id: number): Promise<Blob> {
    const numericId = Number(id);
    return await dbService.exportSave(numericId);
  }

  async function exportSaveText(id: number): Promise<string> {
    const history = await dbService.getAllChatHistory(id);
    const gameStore = useGameStore();
    
    // Try to get player name
    let playerName = '玩家';
    
    if (id === currentSaveId.value) {
      playerName = gameStore.state.player.name || '玩家';
    } else {
      // For other saves, try to get name from latest snapshot
      try {
        const snapshot = await dbService.getLatestSnapshot(id);
        if (snapshot && snapshot.gameState) {
          const state = JSON.parse(snapshot.gameState);
          if (state.player && state.player.name) {
            playerName = state.player.name;
          }
        }
      } catch (e) {
        console.warn('[SaveStore] Failed to load player name for export', e);
      }
    }

    let text = '';
    
    for (const msg of history) {
      // Skip system messages (usually prompts)
      if (msg.role === 'system') continue;
      
      const roleName = msg.role === 'user' ? `【${playerName}】` : '【GM】';
      let content = msg.content || '';
      
      // Remove <think> blocks
      content = content.replace(/<think>[\s\S]*?<\/think>/gi, '');
      
      // Remove any other XML-like tags that might be internal (optional, but <think> is the main one)
      
      content = content.trim();
      
      if (!content) continue;
      
      text += `${roleName}：\n${content}\n\n`;
    }
    
    return text;
  }

  async function importSave(fileContent: string) {
    try {
      await dbService.importSave(fileContent);
      await loadSaves();
    } catch (e) {
      console.error("Import failed:", e);
      throw e;
    }
  }

  const isDefaultSave = computed(() => {
    const current = saves.value.find(s => s.id === currentSaveId.value);
    return current?.name === '默认存档';
  });

  return {
    saves,
    currentSaveId,
    isDefaultSave,
    init,
    createSave,
    switchSave,
    renameSave,
    deleteSave,
    exportSave,
    exportSaveText,
    importSave,
    convertToMultiplayer
  };
});

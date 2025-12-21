import { defineStore } from 'pinia';
import { ref } from 'vue';
import { db, type SaveSlot } from '@/db';
import { useSettingsStore } from './settings';
import { useChatStore } from './chat';
import { useGameStore } from './game';

import { gameLoop } from '@/services/gameLoop';

export const useSaveStore = defineStore('save', () => {
  const currentSaveId = ref<number | null>(null);
  const saves = ref<SaveSlot[]>([]);
  
  const settingsStore = useSettingsStore();
  // Lazy load other stores to avoid circular dependency
  
  async function loadSaves() {
    saves.value = await db.saveSlots.orderBy('lastPlayed').reverse().toArray();
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

  async function createSave(name: string) {
    const id = await db.saveSlots.add({
      name,
      lastPlayed: Date.now(),
      summary: '新游戏',
      location: '未知'
    }) as number;
    
    await loadSaves();
    
    // Initialize Game State from Lorebook for the new save
    // We need to temporarily switch context to this save? 
    // Actually, createSave is usually followed by switchSave.
    // If we want to ensure the initial state is correct, we should do it when switching to a FRESH save.
    
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
    await db.saveSlots.update(id, { lastPlayed: Date.now() });
    await loadSaves();

    // 4. Reload Game Data
    const chatStore = useChatStore();
    await chatStore.loadHistory(); 
    
    // 4.1 Sync Location from loaded state
    const gameStore = useGameStore();
    if (gameStore.state.player.location) {
       await db.saveSlots.update(id, { location: gameStore.state.player.location });
       // Update local cache to reflect change immediately without full reload if possible, 
       // or just reload saves again.
       const saveIndex = saves.value.findIndex(s => s.id === id);
       if (saveIndex !== -1 && saves.value[saveIndex]) {
         saves.value[saveIndex].location = gameStore.state.player.location;
       }
    }
    
    // 5. Check if it's a new game (empty history)
    if (chatStore.messages.length === 0) {
       // Check if we already have an initial snapshot
       const hasSnapshot = await db.snapshots.where({ saveSlotId: id }).count();
       
       if (hasSnapshot === 0) {
          console.log('[SaveStore] Detected new/empty save. Initializing World State...');
          await gameLoop.initializeNewGame();
          await chatStore.createInitialSnapshot();
       } else {
          console.log('[SaveStore] Empty history but snapshot exists. Skipping initialization.');
       }
    }
  }

  async function renameSave(id: number, newName: string) {
    await db.saveSlots.update(id, { name: newName });
    await loadSaves();
  }

  async function deleteSave(id: number) {
    // Prevent deleting the active save if it's the only one? 
    // Or just switch to another one.
    
    await db.transaction('rw', db.saveSlots, db.chats, db.snapshots, async () => {
      await db.saveSlots.delete(id);
      await db.chats.where({ saveSlotId: id }).delete();
      await db.snapshots.where({ saveSlotId: id }).delete();
    });

    await loadSaves();

    if (currentSaveId.value === id) {
      // Switched to another save or create new
      if (saves.value.length > 0) {
        const firstSave = saves.value[0];
        if (firstSave) {
          await switchSave(firstSave.id);
        }
      } else {
        await createSave('默认存档');
        const firstSave = saves.value[0];
        if (firstSave) {
          await switchSave(firstSave.id);
        }
      }
    }
  }

  return {
    currentSaveId,
    saves,
    init,
    createSave,
    switchSave,
    renameSave,
    deleteSave
  };
});

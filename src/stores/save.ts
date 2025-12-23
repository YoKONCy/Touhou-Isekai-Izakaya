import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
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
    if (!id) return;
    
    // Delete all related data
    await db.transaction('rw', db.saveSlots, db.chats, db.memories, db.snapshots, async () => {
      await db.chats.where('saveSlotId').equals(id).delete();
      await db.memories.where('saveSlotId').equals(id).delete();
      await db.snapshots.where('saveSlotId').equals(id).delete();
      await db.saveSlots.delete(id);
    });

    if (currentSaveId.value === id) {
      currentSaveId.value = null;
      settingsStore.currentSaveSlotId = undefined;
      await settingsStore.saveSettings();
    }
    
    await loadSaves();
  }

  async function exportSave(id: number): Promise<string> {
    const saveSlot = await db.saveSlots.get(id);
    if (!saveSlot) throw new Error("Save not found");

    const chats = await db.chats.where('saveSlotId').equals(id).toArray();
    const memories = await db.memories.where('saveSlotId').equals(id).toArray();
    const snapshots = await db.snapshots.where('saveSlotId').equals(id).toArray();

    return JSON.stringify({
      version: 1,
      timestamp: Date.now(),
      saveSlot: { ...saveSlot, id: undefined }, // We don't need old saveSlot ID
      chats, // Keep IDs for mapping
      memories,
      snapshots
    }, null, 2);
  }

  async function importSave(fileContent: string) {
    try {
      const data = JSON.parse(fileContent);
      
      // Basic validation
      if (!data.saveSlot || !Array.isArray(data.chats)) {
        throw new Error("Invalid save file format");
      }

      await db.transaction('rw', db.saveSlots, db.chats, db.memories, db.snapshots, async () => {
        // 1. Create new Save Slot
        const newSaveId = await db.saveSlots.add({
          ...data.saveSlot,
          name: `${data.saveSlot.name} (导入)`,
          lastPlayed: Date.now()
        }) as number;

        // Map for Chat IDs (Old ID -> New ID)
        const chatIdMap = new Map<number, number>();

        // 2. Import Chats
        for (const chat of data.chats) {
            const oldId = chat.id;
            const newChatId = await db.chats.add({
                ...chat,
                id: undefined, // Let DB generate new ID
                saveSlotId: newSaveId
            }) as number;
            
            if (oldId) {
                chatIdMap.set(oldId, newChatId);
            }
        }

        // 3. Import Snapshots (depend on Chat IDs)
        for (const snapshot of data.snapshots) {
            const newChatId = snapshot.chatId ? chatIdMap.get(snapshot.chatId) : undefined;
            
            // If we can't map the chat ID, we might have an orphan snapshot. 
            // We should probably still import it but warn? 
            // Or if it's strictly linked, we assume map exists.
            
            // Note: snapshot.chatId is not optional in interface, but let's be safe.
            if (snapshot.chatId && !newChatId) {
                console.warn(`Skipping snapshot for missing chat ID ${snapshot.chatId}`);
                continue;
            }

            await db.snapshots.add({
                ...snapshot,
                id: undefined,
                saveSlotId: newSaveId,
                chatId: newChatId || snapshot.chatId // Fallback if no mapping (shouldn't happen)
            });
        }

        // 4. Import Memories
        for (const memory of data.memories) {
            await db.memories.add({
                ...memory,
                id: undefined,
                saveSlotId: newSaveId
            });
        }
      });
      
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
    importSave
  };
});

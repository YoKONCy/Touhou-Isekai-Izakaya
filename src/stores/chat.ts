import { defineStore } from 'pinia';
import { ref } from 'vue';
import { db, type ChatMessage } from '@/db';
import { useGameStore } from './game';
import { useSaveStore } from './save';
import { memoryService } from '@/services/memory';
import _ from 'lodash';

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([]);
  const hasMore = ref(false);
  const hasMoreFuture = ref(false);
  const pageSize = 30; // 每次加载30条
  const gameStore = useGameStore();
  const jumpTargetId = ref<number | null>(null);

  async function loadHistory(loadMore = false, direction: 'older' | 'newer' = 'older') {
    const saveStore = useSaveStore();
    if (!saveStore.currentSaveId) {
      messages.value = [];
      hasMore.value = false;
      hasMoreFuture.value = false;
      gameStore.resetState();
      return;
    }

    if (!loadMore) {
      // 初始加载：只加载最后一页（最晚的消息）
      const allMsgs = await db.chats
        .where({ saveSlotId: saveStore.currentSaveId })
        .sortBy('timestamp');
      
      if (allMsgs.length > pageSize) {
        messages.value = allMsgs.slice(-pageSize);
        hasMore.value = true;
      } else {
        messages.value = allMsgs;
        hasMore.value = false;
      }
      hasMoreFuture.value = false;
    } else {
      if (direction === 'older') {
        // 加载更早的消息 (向上滚动)
        const firstMsg = messages.value[0];
        if (!firstMsg) return;

        const olderMsgs = await db.chats
          .where('saveSlotId').equals(saveStore.currentSaveId)
          .and(m => m.timestamp < firstMsg.timestamp)
          .reverse()
          .limit(pageSize)
          .toArray();
        
        if (olderMsgs.length > 0) {
          messages.value = [...olderMsgs.reverse(), ...messages.value];
          
          const earliestTimestamp = messages.value[0]?.timestamp;
          if (earliestTimestamp !== undefined) {
            const count = await db.chats
              .where('saveSlotId').equals(saveStore.currentSaveId)
              .and(m => m.timestamp < earliestTimestamp)
              .count();
            hasMore.value = count > 0;
          }
        } else {
          hasMore.value = false;
        }
      } else {
        // 加载更晚的消息 (向下滚动)
        const lastMsg = messages.value[messages.value.length - 1];
        if (!lastMsg) return;

        const newerMsgs = await db.chats
          .where('saveSlotId').equals(saveStore.currentSaveId)
          .and(m => m.timestamp > lastMsg.timestamp)
          .limit(pageSize)
          .toArray();
        
        if (newerMsgs.length > 0) {
          messages.value = [...messages.value, ...newerMsgs];
          
          const latestTimestamp = messages.value[messages.value.length - 1]?.timestamp;
          if (latestTimestamp !== undefined) {
            const count = await db.chats
              .where('saveSlotId').equals(saveStore.currentSaveId)
              .and(m => m.timestamp > latestTimestamp)
              .count();
            hasMoreFuture.value = count > 0;
          }
        } else {
          hasMoreFuture.value = false;
        }
      }
      return;
    }
    
    // Load the latest state if exists (only on initial load)
    const allMsgsForState = await db.chats
      .where({ saveSlotId: saveStore.currentSaveId })
      .sortBy('timestamp');
    
    if (allMsgsForState.length > 0) {
      const lastMsg = allMsgsForState[allMsgsForState.length - 1];
      console.log('[ChatStore] Loading history. Count:', messages.value.length, 'Last Msg ID:', lastMsg?.id, 'SnapshotId:', lastMsg?.snapshotId);
      
      if (lastMsg && lastMsg.snapshotId) {
        const snapshot = await db.snapshots.get(lastMsg.snapshotId);
        if (snapshot) {
          console.log('[ChatStore] Restoring state from snapshot:', snapshot.id);
          gameStore.setState(JSON.parse(snapshot.gameState));
          console.log('[ChatStore] State restored. Turn Count:', gameStore.state.system.turn_count);
        } else {
            console.warn('[ChatStore] Snapshot not found for ID:', lastMsg.snapshotId);
        }
      } else {
         // If last message has no snapshot (e.g. user message), try to find the last available snapshot
         console.log('[ChatStore] Last message has no snapshot. Searching backwards...');
         const lastSnapshot = await db.snapshots
            .where({ saveSlotId: saveStore.currentSaveId })
            .reverse()
            .first();
         
         if (lastSnapshot) {
             console.log('[ChatStore] Found fallback snapshot:', lastSnapshot.id);
             gameStore.setState(JSON.parse(lastSnapshot.gameState));
         }
      }
    } else {
      // New save or empty history
      // Try to find an initial snapshot (detached from chat)
      const lastSnapshot = await db.snapshots
         .where({ saveSlotId: saveStore.currentSaveId })
         .reverse()
         .first();
      
      if (lastSnapshot) {
        gameStore.setState(JSON.parse(lastSnapshot.gameState));
      } else {
        gameStore.resetState();
        // Initialize New Game State from Lorebook
        // We need to import gameLoop dynamically or move init logic to store
        // To avoid circular dependency, we'll dispatch an event or use a service method if possible.
        // Actually, since this is called from loadHistory(), which is often called at startup...
        // Let's call the initialization logic here if it's a "fresh" start.
        
        // However, gameLoop imports chatStore. Circular dependency risk.
        // Better approach: Let the caller (SaveManager/App) handle the "New Game" init logic.
        // Or, use the gameLoop instance if available (it's a service, singleton).
        
        // For now, we will rely on gameLoop.initializeNewGame() being called when creating a NEW save.
        // If we are just loading an EMPTY save (which shouldn't happen often unless manually cleared),
        // we might miss the initialization.
      }
    }
  }

  // Create a snapshot without a chat message (for initial save state)
  async function createInitialSnapshot() {
    const saveStore = useSaveStore();
    if (!saveStore.currentSaveId) return;
    
    // Ensure we have initialized the state from Lorebook before taking snapshot
    // But this function is usually called after gameStore state is set.
    
    await db.snapshots.add({
      saveSlotId: saveStore.currentSaveId,
      chatId: 0, // 0 indicates initial/detached snapshot
      gameState: JSON.stringify(gameStore.state),
      createdAt: Date.now()
    });

    // Sync Save Metadata
    await db.saveSlots.update(saveStore.currentSaveId, {
      location: gameStore.state.player.location || '未知',
      lastPlayed: Date.now()
    });
  }

  async function addMessage(
    role: 'user' | 'assistant' | 'system', 
    content: string, 
    forcedSnapshotId?: number,
    debugLog?: ChatMessage['debugLog']
  ) {
    const saveStore = useSaveStore();
    if (!saveStore.currentSaveId) {
      throw new Error("No active save slot selected");
    }

    const timestamp = Date.now();
    
    // Save current state as snapshot for this turn (if it's an assistant message or end of turn)
    let snapshotId: number | undefined = forcedSnapshotId;

    if (!snapshotId && role === 'assistant') {
      snapshotId = await db.snapshots.add({
        saveSlotId: saveStore.currentSaveId,
        chatId: 0, // Placeholder
        gameState: JSON.stringify(gameStore.state),
        createdAt: timestamp
      }) as number;

      // Sync Save Metadata (Location & Time)
      await db.saveSlots.update(saveStore.currentSaveId, {
        location: gameStore.state.player.location || '未知',
        lastPlayed: timestamp
      });
    }

    const messageId = await db.chats.add({
      saveSlotId: saveStore.currentSaveId,
      role,
      content,
      timestamp,
      snapshotId,
      debugLog: debugLog ? JSON.parse(JSON.stringify(debugLog)) : undefined // Clean copy
    }) as number;

    // Update snapshot with correct chatId
    if (snapshotId && !forcedSnapshotId) { // Only update if we created it
      await db.snapshots.update(snapshotId, { chatId: messageId });
    }

    messages.value.push({
      id: messageId,
      saveSlotId: saveStore.currentSaveId,
      role,
      content,
      timestamp,
      snapshotId,
      debugLog
    });

    return messageId; // Return the ID so we can use it!
  }

  async function deleteTurn(messageId: number) {
    // Find the message
    const targetIndex = messages.value.findIndex(m => m.id === messageId);
    if (targetIndex === -1) return;
    
    // Determine the start index for deletion (inclusive)
    // We want to delete the target message AND its pair (if any) AND all subsequent messages
    let startIndex = targetIndex;
    const targetMsg = messages.value[targetIndex];

    if (targetMsg?.role === 'assistant') {
      // If deleting an assistant message, also include the preceding user message (the trigger)
      if (targetIndex > 0 && messages.value[targetIndex - 1]?.role === 'user') {
        startIndex = targetIndex - 1;
      }
    }
    // If target is user, startIndex is already correct (delete this user msg and everything after)

    // Identify all messages to delete
    const messagesToDelete = messages.value.slice(startIndex);
    const idsToDelete = messagesToDelete.map(m => m.id);

    if (idsToDelete.length === 0) return;

    console.log('[ChatStore] Deleting messages from index:', startIndex, 'Count:', idsToDelete.length);

    // Delete from DB
    await db.chats.bulkDelete(idsToDelete);
    
    // Delete associated snapshots
    // 1. Delete snapshots referenced by these messages
    const snapshotIds = messagesToDelete
      .map(m => m.snapshotId)
      .filter((id): id is number => !!id);
      
    if (snapshotIds.length > 0) {
       await db.snapshots.bulkDelete(snapshotIds);
    }

    // 2. Delete snapshots linked via chatId (just to be safe and clean orphans)
    await db.snapshots.where('chatId').anyOf(idsToDelete).delete();

    // Update local state
    messages.value = messages.value.slice(0, startIndex);
    
    // Restore state to the new "last" message
    if (messages.value.length > 0) {
       // Find the last valid snapshot
       let restored = false;
       for (let i = messages.value.length - 1; i >= 0; i--) {
         const msg = messages.value[i];
         if (msg && msg.snapshotId) {
           const snapshot = await db.snapshots.get(msg.snapshotId);
           if (snapshot) {
             console.log('[ChatStore] Restoring state from snapshot:', snapshot.id);
             gameStore.setState(JSON.parse(snapshot.gameState));
             restored = true;
             break;
           }
         }
       }
       
       // Fallback: If no snapshot found in history, try to find the initial snapshot (chatId=0)
       if (!restored) {
          const saveStore = useSaveStore();
          if (saveStore.currentSaveId) {
             const initialSnapshot = await db.snapshots
                .where({ saveSlotId: saveStore.currentSaveId, chatId: 0 })
                .first();
             if (initialSnapshot) {
                console.log('[ChatStore] Restoring from initial snapshot');
                gameStore.setState(JSON.parse(initialSnapshot.gameState));
                restored = true;
             }
          }
       }
       
       if (!restored) {
          console.warn('[ChatStore] No snapshot found to restore. Keeping current state (might be desynced).');
       }
    }
    // Only reset state if messages are completely empty (no history at all)
    else {
       console.log('[ChatStore] History empty. Resetting/Initializing state.');
       // Try to load initial snapshot first
       const saveStore = useSaveStore();
       if (saveStore.currentSaveId) {
          const initialSnapshot = await db.snapshots
             .where({ saveSlotId: saveStore.currentSaveId, chatId: 0 })
             .first();
          if (initialSnapshot) {
             gameStore.setState(JSON.parse(initialSnapshot.gameState));
          } else {
             gameStore.resetState();
          }
       } else {
          gameStore.resetState();
       }
    }

    // Sync Memory Rollback
    const saveStore = useSaveStore();
    if (saveStore.currentSaveId) {
       const currentTurn = gameStore.state.system.turn_count || 0;
       await memoryService.rollback(saveStore.currentSaveId, currentTurn);
    }
  }

  async function clearHistory() {
    const saveStore = useSaveStore();
    if (!saveStore.currentSaveId) return;

    // Delete chats and snapshots for this save only
    await db.chats.where({ saveSlotId: saveStore.currentSaveId }).delete();
    await db.snapshots.where({ saveSlotId: saveStore.currentSaveId }).delete();
    
    messages.value = [];
    gameStore.resetState();
  }

  async function rollbackTo(messageId: number) {
    // Find the message
    const targetIndex = messages.value.findIndex(m => m.id === messageId);
    if (targetIndex === -1) return;

    // Get the target message
    const targetMsg = messages.value[targetIndex];
    if (!targetMsg) return;

    // If it has a snapshot, load it. If not (e.g. user message), try to find previous snapshot
    let snapshotId = targetMsg.snapshotId;
    
    if (!snapshotId) {
       // Look backwards for a snapshot
       for (let i = targetIndex; i >= 0; i--) {
         const msg = messages.value[i];
         if (msg && msg.snapshotId) {
           snapshotId = msg.snapshotId;
           break;
         }
       }
    }

    if (snapshotId) {
      const snapshot = await db.snapshots.get(snapshotId);
      if (snapshot) {
        gameStore.setState(JSON.parse(snapshot.gameState));
      }
    } else {
      gameStore.resetState();
    }

    // Sync Memory Rollback
    const saveStore = useSaveStore();
    if (saveStore.currentSaveId) {
       const currentTurn = gameStore.state.system.turn_count || 0;
       await memoryService.rollback(saveStore.currentSaveId, currentTurn);
    }

    // Delete future messages from DB
    const futureMessages = messages.value.slice(targetIndex + 1);
    const futureIds = futureMessages.map(m => m.id);
    await db.chats.bulkDelete(futureIds);
    
    // We should also delete snapshots associated with future messages to keep DB clean
    // But snapshots are linked via snapshotId in chat, so if chat is gone, snapshot is orphaned.
    // Ideally we query snapshots where chatId IN futureIds (but snapshot.chatId is not indexed in my memory schema, let me check)
    // Schema: snapshots: '++id, saveSlotId, chatId, createdAt'
    // Yes, chatId is indexed.
    await db.snapshots.where('chatId').anyOf(futureIds).delete();

    // Update local state
    messages.value = messages.value.slice(0, targetIndex + 1);
  }

  async function updateMessage(id: number, updates: Partial<ChatMessage>) {
    await db.chats.update(id, updates);
    const msgIndex = messages.value.findIndex(m => m.id === id);
    if (msgIndex !== -1) {
      // console.log('[ChatStore] Updating message:', id, 'with keys:', Object.keys(updates));
      // 使用 Vue.set 或直接替换来确保响应式更新
      messages.value[msgIndex] = { ...messages.value[msgIndex], ...updates } as ChatMessage;
      // 强制触发响应式更新
      messages.value = [...messages.value];
    } else {
      console.warn('[ChatStore] Message not found for update:', id);
    }
  }

  async function jumpToTurn(turnCount: number) {
    const saveStore = useSaveStore();
    if (!saveStore.currentSaveId) return;

    console.log('[ChatStore] Jumping to turn:', turnCount);

    const snapshots = await db.snapshots
      .where('saveSlotId')
      .equals(saveStore.currentSaveId)
      .toArray();
    
    const targetSnapshot = snapshots.find(s => {
      try {
        const state = JSON.parse(s.gameState);
        return state.system?.turn_count === turnCount;
      } catch {
        return false;
      }
    });

    if (!targetSnapshot || !targetSnapshot.chatId) {
      console.warn('[ChatStore] No snapshot/chat found for turn:', turnCount);
      return;
    }

    const targetChatId = targetSnapshot.chatId;
    console.log('[ChatStore] Found target chatId:', targetChatId);
    
    const isLoaded = messages.value.some(m => m.id === targetChatId);
    console.log('[ChatStore] Message loaded status:', isLoaded);

    if (!isLoaded) {
      console.log('[ChatStore] Loading history window for jump...');
      
      // Load a window around the target message: some before, some after
      const windowSize = 40;
      const msgs = await db.chats
        .where('saveSlotId').equals(saveStore.currentSaveId)
        .and(m => m.id >= targetChatId)
        .limit(windowSize)
        .sortBy('timestamp');
    
      messages.value = msgs;
      
      // Check for older messages
      const earliestTimestamp = messages.value[0]?.timestamp;
      if (earliestTimestamp !== undefined) {
        const count = await db.chats
          .where('saveSlotId').equals(saveStore.currentSaveId)
          .and(m => m.timestamp < earliestTimestamp)
          .count();
        hasMore.value = count > 0;
      }

      // Check for newer messages
      const latestTimestamp = messages.value[messages.value.length - 1]?.timestamp;
      if (latestTimestamp !== undefined) {
        const count = await db.chats
          .where('saveSlotId').equals(saveStore.currentSaveId)
          .and(m => m.timestamp > latestTimestamp)
          .count();
        hasMoreFuture.value = count > 0;
      }
      
      console.log('[ChatStore] Window loaded, message count:', messages.value.length, 'hasMoreFuture:', hasMoreFuture.value);
    }

    jumpTargetId.value = targetChatId;
    console.log('[ChatStore] jumpTargetId set to:', jumpTargetId.value);
    
    setTimeout(() => {
      jumpTargetId.value = null;
    }, 1000);
  }

  return {
    messages,
    hasMore,
    hasMoreFuture,
    jumpTargetId,
    loadHistory,
    createInitialSnapshot,
    addMessage,
    updateMessage,
    deleteTurn,
    clearHistory,
    rollbackTo,
    jumpToTurn
  };
});

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { dbService } from '@/services/DatabaseService';
import { useGameStore } from './game';
import { useSaveStore } from './save';
import { memoryService } from '@/services/memory';
import _ from 'lodash';
import type { ChatMessage } from '@/types/db';

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
      // Dexie: sortBy('timestamp') implies ASC. slice(-pageSize) takes last 30.
      // SQL equivalent: SELECT * FROM (SELECT * FROM chats WHERE saveSlotId=? ORDER BY timestamp DESC LIMIT ?) ORDER BY timestamp ASC
      const limit = pageSize + 1; // Fetch one extra to check if there are more
      const rows = await dbService.exec(
        `SELECT * FROM chats WHERE saveSlotId = ? ORDER BY timestamp DESC LIMIT ?`,
        [saveStore.currentSaveId, limit]
      );
      
      const rowsAsc = rows.reverse(); // Now they are ASC

      if (rowsAsc.length > pageSize) {
        messages.value = rowsAsc.slice(rowsAsc.length - pageSize); // Take last pageSize
        hasMore.value = true; // We fetched more than pageSize, so there are older messages
      } else {
        messages.value = rowsAsc;
        hasMore.value = false;
      }
      hasMoreFuture.value = false;
    } else {
      if (direction === 'older') {
        // 加载更早的消息 (向上滚动)
        const firstMsg = messages.value[0];
        if (!firstMsg) return;

        // Dexie: timestamp < firstMsg.timestamp, reverse(), limit(pageSize)
        // SQL: SELECT * FROM chats WHERE saveSlotId=? AND timestamp < ? ORDER BY timestamp DESC LIMIT ?
        const olderMsgs = await dbService.exec(
            'SELECT * FROM chats WHERE saveSlotId = ? AND timestamp < ? ORDER BY timestamp DESC LIMIT ?',
            [saveStore.currentSaveId, firstMsg.timestamp, pageSize]
        );
        
        if (olderMsgs.length > 0) {
          messages.value = [...olderMsgs.reverse(), ...messages.value];
          
          const earliestTimestamp = messages.value[0]?.timestamp;
          if (earliestTimestamp !== undefined) {
            const countRes = await dbService.exec(
                'SELECT COUNT(*) as count FROM chats WHERE saveSlotId = ? AND timestamp < ?',
                [saveStore.currentSaveId, earliestTimestamp]
            );
            hasMore.value = countRes[0].count > 0;
          }
        } else {
          hasMore.value = false;
        }
      } else {
        // 加载更晚的消息 (向下滚动)
        const lastMsg = messages.value[messages.value.length - 1];
        if (!lastMsg) return;

        // Dexie: timestamp > lastMsg.timestamp, limit(pageSize)
        // SQL: SELECT * FROM chats WHERE saveSlotId=? AND timestamp > ? ORDER BY timestamp ASC LIMIT ?
        const newerMsgs = await dbService.exec(
            'SELECT * FROM chats WHERE saveSlotId = ? AND timestamp > ? ORDER BY timestamp ASC LIMIT ?',
            [saveStore.currentSaveId, lastMsg.timestamp, pageSize]
        );
        
        if (newerMsgs.length > 0) {
          messages.value = [...messages.value, ...newerMsgs];
          
          const latestTimestamp = messages.value[messages.value.length - 1]?.timestamp;
          if (latestTimestamp !== undefined) {
            const countRes = await dbService.exec(
                'SELECT COUNT(*) as count FROM chats WHERE saveSlotId = ? AND timestamp > ?',
                [saveStore.currentSaveId, latestTimestamp]
            );
            hasMoreFuture.value = countRes[0].count > 0;
          }
        } else {
          hasMoreFuture.value = false;
        }
      }
      return;
    }
    
    // Load the latest state if exists (only on initial load)
    // We need the very last message to check for snapshot
    const lastMsgRes = await dbService.exec(
        'SELECT * FROM chats WHERE saveSlotId = ? ORDER BY timestamp DESC LIMIT 1',
        [saveStore.currentSaveId]
    );
    
    if (lastMsgRes.length > 0) {
      const lastMsg = lastMsgRes[0];
      console.log('[ChatStore] Loading history. Count:', messages.value.length, 'Last Msg ID:', lastMsg?.id, 'SnapshotId:', lastMsg?.snapshotId);
      
      if (lastMsg && lastMsg.snapshotId) {
        const snapshot = await dbService.getSnapshot(lastMsg.snapshotId);
        if (snapshot) {
          console.log('[ChatStore] Restoring state from snapshot:', snapshot.id);
          gameStore.setState(JSON.parse(snapshot.gameState));
          console.log('[ChatStore] State restored. Turn Count:', gameStore.state.system.turn_count);
        } else {
            console.warn('[ChatStore] Snapshot not found for ID:', lastMsg.snapshotId);
        }
      } else {
         // If last message has no snapshot, find last available snapshot
         console.log('[ChatStore] Last message has no snapshot. Searching backwards...');
         const lastSnapshot = await dbService.getLatestSnapshot(saveStore.currentSaveId);
         
         if (lastSnapshot) {
             console.log('[ChatStore] Found fallback snapshot:', lastSnapshot.id);
             gameStore.setState(JSON.parse(lastSnapshot.gameState));
         }
      }
    } else {
      // New save or empty history
      const lastSnapshot = await dbService.getLatestSnapshot(saveStore.currentSaveId);
      
      if (lastSnapshot) {
        gameStore.setState(JSON.parse(lastSnapshot.gameState));
      } else {
        gameStore.resetState();
        // Rely on caller to initialize new game
      }
    }
  }

  // Create a snapshot without a chat message (for initial save state)
  async function createInitialSnapshot() {
    const saveStore = useSaveStore();
    if (!saveStore.currentSaveId) return;
    
    await dbService.createSnapshot(saveStore.currentSaveId, 0, gameStore.state);

    // Sync Save Metadata
    await dbService.updateSaveSlot(saveStore.currentSaveId, {
      location: gameStore.state.player.location || '未知',
      lastPlayed: Date.now()
    });
  }

  async function addMessage(
    role: 'user' | 'assistant' | 'system', 
    content: string, 
    forcedSnapshotId?: number,
    debugLog?: any
  ) {
    const saveStore = useSaveStore();
    if (!saveStore.currentSaveId) {
      throw new Error("No active save slot selected");
    }

    const timestamp = Date.now();
    
    let snapshotId: number | undefined = forcedSnapshotId;

    if (!snapshotId && role === 'assistant') {
      snapshotId = await dbService.createSnapshot(saveStore.currentSaveId, 0, gameStore.state);

      // Sync Save Metadata (Location & Time)
      await dbService.updateSaveSlot(saveStore.currentSaveId, {
        location: gameStore.state.player.location || '未知',
        lastPlayed: timestamp
      });
    }

    const messageId = await dbService.addChatMessage(saveStore.currentSaveId, {
        role,
        content,
        timestamp,
        turnCount: gameStore.state.system.turn_count,
        snapshotId,
        debugLog
    });

    // Update snapshot with correct chatId
    if (snapshotId && !forcedSnapshotId) {
      await dbService.exec('UPDATE snapshots SET chatId = ? WHERE id = ?', [messageId, snapshotId]);
    }

    messages.value.push({
      id: messageId,
      saveSlotId: saveStore.currentSaveId,
      role,
      content,
      timestamp,
      turnCount: gameStore.state.system.turn_count,
      snapshotId,
      debugLog
    });

    return messageId;
  }

  async function deleteTurn(messageId: number) {
    const targetIndex = messages.value.findIndex(m => m.id === messageId);
    if (targetIndex === -1) return;
    
    let startIndex = targetIndex;
    const targetMsg = messages.value[targetIndex];

    if (targetMsg?.role === 'assistant') {
      if (targetIndex > 0 && messages.value[targetIndex - 1]?.role === 'user') {
        startIndex = targetIndex - 1;
      }
    }

    const messagesToDelete = messages.value.slice(startIndex);
    const idsToDelete = messagesToDelete.map(m => m.id);

    if (idsToDelete.length === 0) return;

    console.log('[ChatStore] Deleting messages from index:', startIndex, 'Count:', idsToDelete.length);

    // Delete from DB
    const placeholders = idsToDelete.map(() => '?').join(',');
    await dbService.exec(`DELETE FROM chats WHERE id IN (${placeholders})`, idsToDelete);
    
    // Delete associated snapshots
    const snapshotIds = messagesToDelete
      .map(m => m.snapshotId)
      .filter((id): id is number => !!id);
      
    if (snapshotIds.length > 0) {
       const snapPlaceholders = snapshotIds.map(() => '?').join(',');
       await dbService.exec(`DELETE FROM snapshots WHERE id IN (${snapPlaceholders})`, snapshotIds);
    }

    // Delete snapshots linked via chatId
    await dbService.exec(`DELETE FROM snapshots WHERE chatId IN (${placeholders})`, idsToDelete);

    // Update local state
    messages.value = messages.value.slice(0, startIndex);
    
    // Restore state
    if (messages.value.length > 0) {
       let restored = false;
       for (let i = messages.value.length - 1; i >= 0; i--) {
         const msg = messages.value[i];
         if (msg && msg.snapshotId) {
           const snapshot = await dbService.getSnapshot(msg.snapshotId);
           if (snapshot) {
             console.log('[ChatStore] Restoring state from snapshot:', snapshot.id);
             gameStore.setState(JSON.parse(snapshot.gameState));
             restored = true;
             break;
           }
         }
       }
       
       if (!restored) {
          const saveStore = useSaveStore();
          if (saveStore.currentSaveId) {
             const initialSnapshotRes = await dbService.exec(
                 'SELECT * FROM snapshots WHERE saveSlotId = ? AND chatId = 0 LIMIT 1',
                 [saveStore.currentSaveId]
             );
             if (initialSnapshotRes.length > 0) {
                console.log('[ChatStore] Restoring from initial snapshot');
                gameStore.setState(JSON.parse(initialSnapshotRes[0].gameState));
                restored = true;
             }
          }
       }
       
       if (!restored) {
          console.warn('[ChatStore] No snapshot found to restore. Keeping current state (might be desynced).');
       }
    } else {
       console.log('[ChatStore] History empty. Resetting/Initializing state.');
       const saveStore = useSaveStore();
       if (saveStore.currentSaveId) {
          const initialSnapshotRes = await dbService.exec(
             'SELECT * FROM snapshots WHERE saveSlotId = ? AND chatId = 0 LIMIT 1',
             [saveStore.currentSaveId]
          );
          if (initialSnapshotRes.length > 0) {
             gameStore.setState(JSON.parse(initialSnapshotRes[0].gameState));
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

    await dbService.exec('DELETE FROM chats WHERE saveSlotId = ?', [saveStore.currentSaveId]);
    await dbService.exec('DELETE FROM snapshots WHERE saveSlotId = ?', [saveStore.currentSaveId]);
    
    messages.value = [];
    gameStore.resetState();
  }

  async function rollbackTo(messageId: number) {
    const targetIndex = messages.value.findIndex(m => m.id === messageId);
    if (targetIndex === -1) return;

    const targetMsg = messages.value[targetIndex];
    if (!targetMsg) return;

    let snapshotId = targetMsg.snapshotId;
    
    if (!snapshotId) {
       for (let i = targetIndex; i >= 0; i--) {
         const msg = messages.value[i];
         if (msg && msg.snapshotId) {
           snapshotId = msg.snapshotId;
           break;
         }
       }
    }

    if (snapshotId) {
      const snapshot = await dbService.getSnapshot(snapshotId);
      if (snapshot) {
        gameStore.setState(JSON.parse(snapshot.gameState));
      }
    } else {
      gameStore.resetState();
    }

    const saveStore = useSaveStore();
    if (saveStore.currentSaveId) {
       const currentTurn = gameStore.state.system.turn_count || 0;
       await memoryService.rollback(saveStore.currentSaveId, currentTurn);
    }

    const futureMessages = messages.value.slice(targetIndex + 1);
    const futureIds = futureMessages.map(m => m.id);
    if (futureIds.length > 0) {
        const placeholders = futureIds.map(() => '?').join(',');
        await dbService.exec(`DELETE FROM chats WHERE id IN (${placeholders})`, futureIds);
        await dbService.exec(`DELETE FROM snapshots WHERE chatId IN (${placeholders})`, futureIds);
    }

    messages.value = messages.value.slice(0, targetIndex + 1);
  }

  async function updateMessage(id: number, updates: Partial<ChatMessage>) {
    // updates keys might not map 1:1 to DB columns if they are extra props, but ChatMessage is mostly flat
    // We should filter keys that exist in DB or just try.
    // For now assume updates match DB columns.
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    
    if (fields.length > 0) {
        await dbService.exec(`UPDATE chats SET ${fields} WHERE id = ?`, [...values, id]);
    }

    const msgIndex = messages.value.findIndex(m => m.id === id);
    if (msgIndex !== -1) {
      messages.value[msgIndex] = { ...messages.value[msgIndex], ...updates } as ChatMessage;
      messages.value = [...messages.value];
    } else {
      console.warn('[ChatStore] Message not found for update:', id);
    }
  }

  async function jumpToTurn(turnCount: number) {
    const saveStore = useSaveStore();
    if (!saveStore.currentSaveId) return;

    console.log('[ChatStore] Jumping to turn:', turnCount);

    const snapshots = await dbService.exec(
        'SELECT * FROM snapshots WHERE saveSlotId = ?',
        [saveStore.currentSaveId]
    );
    
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

    if (!isLoaded) {
      console.log('[ChatStore] Loading history window for jump...');
      
      const windowSize = 40;
      // SQL: SELECT * FROM chats WHERE saveSlotId=? AND id >= ? ORDER BY timestamp ASC LIMIT ?
      const msgs = await dbService.exec(
        'SELECT * FROM chats WHERE saveSlotId = ? AND id >= ? ORDER BY timestamp ASC LIMIT ?',
        [saveStore.currentSaveId, targetChatId, windowSize]
      );
    
      messages.value = msgs;
      
      const earliestTimestamp = messages.value[0]?.timestamp;
      if (earliestTimestamp !== undefined) {
        const countRes = await dbService.exec(
            'SELECT COUNT(*) as count FROM chats WHERE saveSlotId = ? AND timestamp < ?',
            [saveStore.currentSaveId, earliestTimestamp]
        );
        hasMore.value = countRes[0].count > 0;
      }

      const latestTimestamp = messages.value[messages.value.length - 1]?.timestamp;
      if (latestTimestamp !== undefined) {
        const countRes = await dbService.exec(
            'SELECT COUNT(*) as count FROM chats WHERE saveSlotId = ? AND timestamp > ?',
            [saveStore.currentSaveId, latestTimestamp]
        );
        hasMoreFuture.value = countRes[0].count > 0;
      }
    }

    jumpTargetId.value = targetChatId;
    
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

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
      // 分页策略：按时间戳升序排序，截取最后 pageSize 条数据作为当前视窗 (尾窗策略)
      // SQL 逻辑：子查询按降序取记录后，在外层重新按升序校准。
      const limit = pageSize + 1; // 多抓取一条记录以判定“更早”分支是否存在更多分页 (预读抓取策略)
      const rows = await dbService.exec(
        `SELECT * FROM chats WHERE saveSlotId = ? ORDER BY timestamp DESC LIMIT ?`,
        [saveStore.currentSaveId, limit]
      );

      const rowsAsc = rows.reverse(); // 执行数组反转，使其符合 UI 渲染的升序时间轴

      if (rowsAsc.length > pageSize) {
        messages.value = rowsAsc.slice(rowsAsc.length - pageSize); // 若存在溢出，则仅保留标准的 pageSize 数量
        hasMore.value = true; // 属性判定：检测到溢出意味着磁盘中仍存有更早的历史记录 (已确认存有历史)
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

        // 关联 ID 同步：获取时间戳早于当前首条消息的旧记录分片 (向后分页拉取)
        // SQL 指令：按降序查找历史分片，随后翻转回 UI 适用的升序。
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

        // 关联 ID 同步：获取时间戳晚于当前末条消息的新记录分片 (向前分页拉取)
        // SQL 指令：按升序顺序步进加载。
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

    // 状态热恢复 (Hot Recovery)：若存在有效存档点，则在初始加载阶段同步恢复游戏全局上下文。
    // 逻辑判定：需要锁定磁盘最后一条消息以定位最新的全局快照 (定位快照恢复点)。
    const lastMsgRes = await dbService.exec(
      'SELECT * FROM chats WHERE saveSlotId = ? ORDER BY timestamp DESC LIMIT 1',
      [saveStore.currentSaveId]
    );

    if (lastMsgRes.length > 0) {
      const lastMsg = lastMsgRes[0];
      console.log(
        '[聊天商店] 正在加载历史数据喵。消息总数:',
        messages.value.length,
        '最后一条 ID:',
        lastMsg?.id,
        '快照 ID:',
        lastMsg?.snapshotId
      );

      if (lastMsg && lastMsg.snapshotId) {
        const snapshot = await dbService.getSnapshot(lastMsg.snapshotId);
        if (snapshot) {
          console.log('[聊天商店] 正在从快照恢复状态喵:', snapshot.id);
          gameStore.setState(JSON.parse(snapshot.gameState));
          console.log('[聊天商店] 状态恢复完成喵。当前回合:', gameStore.state.system.turn_count);
        } else {
          console.warn('[聊天商店] 无法找到快照 ID 对应的记录喵:', lastMsg.snapshotId);
        }
      } else {
        // 容错逻辑：若末位消息未绑定快照（可能由于并发事务崩坏），则开启回溯查找模式。
        console.log('[聊天商店] 末条消息未关联快照，正在执行反向全表扫描...');
        const lastSnapshot = await dbService.getLatestSnapshot(saveStore.currentSaveId);

        if (lastSnapshot) {
          console.log('[聊天商店] 找到了可用的回滚快照喵:', lastSnapshot.id);
          gameStore.setState(JSON.parse(lastSnapshot.gameState));
        }
      }
    } else {
      // 边界处理：检测到纯净新存档或空历史，尝试执行默认的初始化状态恢复。
      const lastSnapshot = await dbService.getLatestSnapshot(saveStore.currentSaveId);

      if (lastSnapshot) {
        gameStore.setState(JSON.parse(lastSnapshot.gameState));
      } else {
        gameStore.resetState();
        // Rely on caller to initialize new game
      }
    }
  }

  // 初始快照声明：在未产生任何对话前，手动记录一份纯净的初始游戏状态坐标点。
  async function createInitialSnapshot() {
    const saveStore = useSaveStore();
    if (!saveStore.currentSaveId) return;

    await dbService.createSnapshot(saveStore.currentSaveId, 0, gameStore.state);

    // 同步更新存档槽位的元数据 (持久化存档元数据同步)喵~
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
      throw new Error('当前未选中任何有效的存档位喵');
    }

    const timestamp = Date.now();

    let snapshotId: number | undefined = forcedSnapshotId;

    if (!snapshotId && role === 'assistant') {
      snapshotId = await dbService.createSnapshot(saveStore.currentSaveId, 0, gameStore.state);

      // 定期同步更新存档槽位的地理位置与游玩时间坐标 (触发存档点更新)喵
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

    // 引用补丁：将刚刚生成的对话 ID 反向注入快照索引中，建立持久化逻辑链接 (双向绑定消息与快照)喵
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
    const targetIndex = messages.value.findIndex((m) => m.id === messageId);
    if (targetIndex === -1) return;

    let startIndex = targetIndex;
    const targetMsg = messages.value[targetIndex];

    if (targetMsg?.role === 'assistant') {
      if (targetIndex > 0 && messages.value[targetIndex - 1]?.role === 'user') {
        startIndex = targetIndex - 1;
      }
    }

    const messagesToDelete = messages.value.slice(startIndex);
    const idsToDelete = messagesToDelete.map((m) => m.id);

    if (idsToDelete.length === 0) return;

    console.log(
      '[聊天商店] 正在执行消息物理擦除喵。起始索引:',
      startIndex,
      '待删除总数:',
      idsToDelete.length
    );

    // 物理清理：执行 SQL DELETE 命令同步擦除磁盘记录 (执行数据库删除)
    const placeholders = idsToDelete.map(() => '?').join(',');
    await dbService.exec(`DELETE FROM chats WHERE id IN (${placeholders})`, idsToDelete);

    // 级联清理：同步销毁所有已废弃的对应游戏状态快照，释放存储资源 (资源回收清理)喵
    const snapshotIds = messagesToDelete
      .map((m) => m.snapshotId)
      .filter((id): id is number => !!id);

    if (snapshotIds.length > 0) {
      const snapPlaceholders = snapshotIds.map(() => '?').join(',');
      await dbService.exec(`DELETE FROM snapshots WHERE id IN (${snapPlaceholders})`, snapshotIds);
    }

    // 深度链接清理：基于 chatId 映射关系执行次级快照表清理
    await dbService.exec(`DELETE FROM snapshots WHERE chatId IN (${placeholders})`, idsToDelete);

    // 重塑 Vue 响应式数据视窗 (State Sync)
    messages.value = messages.value.slice(0, startIndex);

    // 状态机重置：执行状态回滚，确保游戏全局上下文重定向至删除点前的有效存档位。
    if (messages.value.length > 0) {
      let restored = false;
      for (let i = messages.value.length - 1; i >= 0; i--) {
        const msg = messages.value[i];
        if (msg && msg.snapshotId) {
          const snapshot = await dbService.getSnapshot(msg.snapshotId);
          if (snapshot) {
            console.log('[聊天商店] 正在尝试从快照恢复状态喵:', snapshot.id);
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
            console.log('[聊天商店] 正在从初始快照恢复');
            gameStore.setState(JSON.parse(initialSnapshotRes[0].gameState));
            restored = true;
          }
        }
      }

      if (!restored) {
        console.warn(
          '[聊天商店] 未找到可供恢复的快照。保留当前状态 (可能会产生数据不一致喵)。'
        );
      }
    } else {
      console.log('[聊天商店] 历史记录为空喵。正在重置/初始化游戏状态...');
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

    // 关联记忆层同步：触发记忆管理系统的逻辑回滚，确保 LLM 的对话上下文深度一致。
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
    const targetIndex = messages.value.findIndex((m) => m.id === messageId);
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
    const futureIds = futureMessages.map((m) => m.id);
    if (futureIds.length > 0) {
      const placeholders = futureIds.map(() => '?').join(',');
      await dbService.exec(`DELETE FROM chats WHERE id IN (${placeholders})`, futureIds);
      await dbService.exec(`DELETE FROM snapshots WHERE chatId IN (${placeholders})`, futureIds);
    }

    messages.value = messages.value.slice(0, targetIndex + 1);
  }

  async function updateMessage(id: number, updates: Partial<ChatMessage>) {
    // 兼容性提醒：ChatMessage 更新载荷通常与数据库字段严格映射。
    // 目前采用直接透传机制，输入负载需与数据库 Schema 保持高度一致。
    const fields = Object.keys(updates)
      .map((k) => `${k} = ?`)
      .join(', ');
    const values = Object.values(updates);

    if (fields.length > 0) {
      await dbService.exec(`UPDATE chats SET ${fields} WHERE id = ?`, [...values, id]);
    }

    const msgIndex = messages.value.findIndex((m) => m.id === id);
    if (msgIndex !== -1) {
      messages.value[msgIndex] = { ...messages.value[msgIndex], ...updates } as ChatMessage;
      messages.value = [...messages.value];
    } else {
      console.warn('[聊天商店] 更新消息失败，未找到 ID 对应记录喵:', id);
    }
  }

  async function jumpToTurn(turnCount: number) {
    const saveStore = useSaveStore();
    if (!saveStore.currentSaveId) return;

    console.log('[聊天商店] 正在尝试跳转至第', turnCount, '回合喵...');

    const snapshots = await dbService.exec('SELECT * FROM snapshots WHERE saveSlotId = ?', [
      saveStore.currentSaveId
    ]);

    const targetSnapshot = snapshots.find((s) => {
      try {
        const state = JSON.parse(s.gameState);
        return state.system?.turn_count === turnCount;
      } catch {
        return false;
      }
    });

    if (!targetSnapshot || !targetSnapshot.chatId) {
      console.warn('[聊天商店] 未找到第', turnCount, '回合关联的快照或聊天记录喵');
      return;
    }

    const targetChatId = targetSnapshot.chatId;
    console.log('[聊天商店] 找到了匹配的对话 ID 喵:', targetChatId);

    const isLoaded = messages.value.some((m) => m.id === targetChatId);

    if (!isLoaded) {
      console.log('[聊天商店] 对话视窗不在显存中，正在执行历史窗口跳转加载...');

      const windowSize = 40;
      // UI 跳转逻辑：以目标 ID 为基准点，向后扩充拉取 40 条对话记录以填补前端视窗。
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

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

    // 巡检设置项目，尝试还原最后一次使用的存档 ID
    if (settingsStore.currentSaveSlotId) {
      const exists = saves.value.find((s) => s.id === settingsStore.currentSaveSlotId);
      if (exists) {
        currentSaveId.value = exists.id;
      }
    }

    // 若未选择或未命中特定存档，则尝试自动指向最近一次活跃的槽位
    if (!currentSaveId.value && saves.value.length > 0) {
      const firstSave = saves.value[0];
      if (firstSave) {
        currentSaveId.value = firstSave.id;
      }
    }

    // 若存档列表依然为空（多见于首次安装环境），则初始化创建“默认存档”
    if (!currentSaveId.value) {
      await createSave('默认存档');
    }

    // 执行选中存档的数据加载与状态迁移动作
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

    // 1. 更新当前内存中的活跃存档 ID 指针
    currentSaveId.value = id;
  
    // 2. 将存档 ID 变更持久化至本地全局配置 (Persistence)
    settingsStore.currentSaveSlotId = id;
    await settingsStore.saveSettings();
  
    // 3. 同步更新数据库槽位的最后游玩时间戳信息
    await dbService.updateSaveSlot(id, { lastPlayed: Date.now() });
    await loadSaves();

    // 4. 重载游戏核心历史数据与全局状态机 (State Reload)
    const chatStore = useChatStore();
    await chatStore.loadHistory();

    // 4.1 从已加载的状态分片中提取并同步地理位置元数据
    const gameStore = useGameStore();

    // 如果是联机存档，标记为联机模式，但不激活连接状态，需手动开房
    const saveInfo = saves.value.find((s) => s.id === id);
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
      // 同步更新本地存档列表缓存，确保 UI 响应式显示一致
      const saveIndex = saves.value.findIndex((s) => s.id === id);
      if (saveIndex !== -1 && saves.value[saveIndex]) {
        saves.value[saveIndex].location = gameStore.state.player.location;
      }
    }

    // 5. 巡检是否为新游戏（检测历史对话记录是否为空）
    if (chatStore.messages.length === 0) {
      // 巡检是否已存在初始游戏状态快照 (Snapshot Check)
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

    // 尝试通过多维渠道检索玩家名称 (Name Retrieval)
    let playerName = '玩家';

    if (id === currentSaveId.value) {
      playerName = gameStore.state.player.name || '玩家';
    } else {
      // 针对非活跃存档，尝试从其最新的磁盘快照中动态解析玩家名称
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
      // 忽略系统级消息（通常包含 Prompt 指令流）
      if (msg.role === 'system') continue;

      const roleName = msg.role === 'user' ? `【${playerName}】` : '【GM】';
      let content = msg.content || '';

      // 剔除深度思维链 <think> 代码块，净化导出的文本视界
      content = content.replace(/<think>[\s\S]*?<\/think>/gi, '');

      // (可选) 剔除其他可能存在的内部 XML 格式标签分片，维持纯净语境

      content = content.trim();

      if (!content) continue;

      text += `${roleName}：\n${content}\n\n`;
    }

    return text;
  }

  async function importSave(fileContent: ArrayBuffer) {
    try {
      await dbService.importSave(fileContent);
      await loadSaves();
    } catch (e) {
      console.error('Import failed:', e);
      throw e;
    }
  }

  const isDefaultSave = computed(() => {
    const current = saves.value.find((s) => s.id === currentSaveId.value);
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

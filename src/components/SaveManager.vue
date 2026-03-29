<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useSaveStore } from '@/stores/save';
import { useGameStore } from '@/stores/game';
import { useChatStore } from '@/stores/chat';
import NewGameWizard from './NewGameWizard.vue';
import { gameLoop } from '@/services/gameLoop';
import {
  X,
  Plus,
  Trash2,
  Edit2,
  Play,
  Check,
  Download,
  Upload,
  RefreshCw,
  FileText
} from 'lucide-vue-next';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import { useConfirm } from '@/utils/confirm';
import { generateMap } from '@/services/management/MapGenerator';
import { checkMigrationNeeded, migrateData } from '@/services/migration';
import { useToastStore } from '@/stores/toast';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const saveStore = useSaveStore();
const gameStore = useGameStore();
const chatStore = useChatStore();
const toastStore = useToastStore();
const { confirm } = useConfirm();

const isMigrating = ref(false);
const migrationProgress = ref(0);
const migrationMessage = ref('');
const showMigrationButton = ref(false);

const saves = computed(() => saveStore.saves);
const currentSaveId = computed(() => saveStore.currentSaveId);
const isGuest = computed(
  () => gameStore.multiplayer.isMultiplayer && !gameStore.multiplayer.isHost
);
const isMultiplayerActive = computed(() => gameStore.multiplayer.isMultiplayer);

const singlePlayerSaves = computed(() => saves.value.filter((s) => !s.isMultiplayer));
const multiplayerSaves = computed(() => saves.value.filter((s) => s.isMultiplayer));

const isCreating = ref(false);
const isCreatingMultiplayer = ref(false);
const newSaveName = ref('');
const editingId = ref<number | null>(null);
const editName = ref('');

const showWizard = ref(false);
const tempSaveName = ref('');
const tempIsMultiplayer = ref(false);

watch(
  () => props.isOpen,
  async (val) => {
    if (val) {
      if (saves.value.length === 0) {
        isCreating.value = true;
      }
      // 检测是否需要执行存档迁移 (Migration check) / 此处传入 true 以跳过 localStorage 冗余校验 喵
      const needed = await checkMigrationNeeded(true);
      showMigrationButton.value = needed;
    }
  }
);

async function handleManualMigration() {
  const ok = await confirm(
    '检测到旧版（Dexie）中存有数据，是否尝试迁移到新版（SQLite）？迁移不会删除旧数据。',
    {
      title: '迁移旧版存档',
      confirmText: '开始迁移',
      cancelText: '取消'
    }
  );

  if (!ok) return;

  isMigrating.value = true;
  try {
    await migrateData((msg, progress) => {
      migrationMessage.value = msg;
      migrationProgress.value = progress;
    });
    toastStore.addToast('迁移成功！页面即将刷新。', 'success');
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  } catch (e: any) {
    console.error(e);
    toastStore.addToast(`迁移失败: ${e.message}`, 'error');
    isMigrating.value = false;
  }
}

async function handleCreate() {
  if (!newSaveName.value.trim()) return;
  tempSaveName.value = newSaveName.value.trim();
  tempIsMultiplayer.value = isCreatingMultiplayer.value;
  showWizard.value = true;
  // 此处暂不关闭 SaveManager 遮盖层，直接在其上层弹出 Wizard 向导 喵
}

async function onWizardComplete(data: any) {
  showWizard.value = false;
  isCreating.value = false;
  isCreatingMultiplayer.value = false;
  newSaveName.value = '';

  // 1. 执行物理建档操作 喵
  const id = await saveStore.createSave(tempSaveName.value, tempIsMultiplayer.value);

  // 2. 切换至新存档并重置全局状态 喵
  await saveStore.switchSave(id);

  // 3. Apply Wizard Data
  gameStore.updatePlayer({
    name: data.name,
    persona: data.persona,
    hp: data.stats.hp,
    max_hp: data.stats.max_hp,
    mp: data.stats.mp,
    max_mp: data.stats.max_mp,
    money: data.stats.money,
    power: data.stats.power,
    identity: data.stats.identity,
    clothing: data.stats.clothing,
    location: data.stats.location,
    time: data.stats.time,
    date: data.stats.date,
    items: data.stats.items || [], // Initialize items from origin stats
    authorities: data.stats.authorities || [],
    spell_cards: data.stats.spell_cards || []
  });

  // 3.1 同步更新系统配置项中的难度等级 喵
  if (data.difficulty) {
    const currentSystem = gameStore.state.system;
    gameStore.updateState({
      system: {
        ...currentSystem,
        difficulty: data.difficulty
      }
    });
  }

  // 4. 发送初始对话引导词以启动剧情 喵 (Store Start)
  // 在外部定义 mapPromise 以便异步追踪背景地图的生成进度 喵
  let mapPromise: Promise<any> = Promise.resolve(null);

  if (data.initialMessage) {
    console.log('[SaveManager] Checking store description:', data.storeDescription);
    if (data.storeDescription) {
      // 根据居酒屋店铺描述并行生成初始地图瓦片 喵 (Parallel execution)
      console.log('[SaveManager] Starting initial map generation (Background)...');
      mapPromise = generateMap('New Izakaya', data.storeDescription).catch((e) => {
        console.error('Failed to generate initial map', e);
        return null;
      });
    }
  }

  // 5. 创建初始快照以持久化当前的配置化状态 喵
  await chatStore.createInitialSnapshot();

  // Close UI immediately to show game interface
  emit('close');

  // 6. 根据初始消息内容触发 LLM 剧情响应 喵
  if (data.initialMessage) {
    console.log('[SaveManager] Triggering initial LLM response with message:', data.initialMessage);
    gameLoop.handleUserAction(data.initialMessage).catch((e) => {
      console.error('[SaveManager] Failed to trigger initial action:', e);
    });
  } else {
    console.log('[SaveManager] No initial message provided, skipping LLM trigger.');
  }

  // 7. 地图生成完成后的回调处理 喵 (当资源就绪时更新状态)
  if (data.storeDescription) {
    mapPromise.then((initialMap) => {
      if (initialMap) {
        console.log('[SaveManager] Map generated in background, updating state...');
        const currentSystem = gameStore.state.system;
        gameStore.updateState({
          system: {
            ...currentSystem,
            customMap: initialMap
          }
        });
      }
    });
  }
}

async function handleExport(save: any) {
  if (!save || !save.id) {
    alert('无效的存档，无法导出');
    return;
  }

  try {
    console.log(`[SaveManager] Exporting save ${save.id} (${save.name})...`);
    const blob = await saveStore.exportSave(save.id);
    // saveStore.exportSave 现在已支持直接返回 Blob 对象，无需额外包装 喵

    // Check size
    if (blob.size > 100 * 1024 * 1024) {
      // 100MB
      console.warn(
        `[SaveManager] Large save file detected: ${(blob.size / 1024 / 1024).toFixed(2)}MB`
      );
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TouhouSave_${save.name.replace(/[\\/:*?"<>|]/g, '_')}_${dayjs().format('YYYYMMDD_HHmmss')}.json`;
    document.body.appendChild(a);
    a.click();

    // 执行延时清理，确保浏览器已成功启动下载任务 喵
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);

    console.log('[存档管理器] 导出触发成功');
  } catch (error: any) {
    console.error('Export failed:', error);
    alert(`导出存档失败: ${error.message || '未知错误'}`);
  }
}

const fileInput = ref<HTMLInputElement | null>(null);

function triggerImport() {
  fileInput.value?.click();
}

async function handleImport(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const content = e.target?.result as ArrayBuffer;
      if (!content) throw new Error('读取文件失败');

      console.log(
        `[SaveManager] Importing file size: ${(content.byteLength / 1024 / 1024).toFixed(2)}MB`
      );

      await saveStore.importSave(content);
      alert('存档导入成功！');
    } catch (error: any) {
      console.error('Import failed details:', {
        message: error?.message,
        name: error?.name,
        stack: error?.stack,
        raw: error
      });
      alert(`导入存档失败: ${error?.message || '未知错误 (请检查控制台详情)'}`);
    } finally {
      // 重置文件选择框的状态 喵
      if (fileInput.value) fileInput.value.value = '';
    }
  };
  reader.readAsArrayBuffer(file);
}

async function handleExportText(save: any) {
  if (!save || !save.id) {
    toastStore.addToast('无效的存档，无法导出', 'error');
    return;
  }
  try {
    const text = await saveStore.exportSaveText(save.id);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TouhouNovel_${save.name.replace(/[\\/:*?"<>|]/g, '_')}_${dayjs().format('YYYYMMDD_HHmmss')}.txt`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    toastStore.addToast('小说正文导出成功', 'success');
  } catch (error: any) {
    console.error('Export text failed:', error);
    toastStore.addToast(`导出失败: ${error.message || '未知错误'}`, 'error');
  }
}

function onWizardCancel() {
  showWizard.value = false;
}

async function handleSwitch(id: number) {
  await saveStore.switchSave(id);
  emit('close');
}

async function handleDelete(id: number) {
  if (await confirm('确定要删除这个存档吗？所有相关进度和对话都将丢失。', { destructive: true })) {
    await saveStore.deleteSave(id);
  }
}

function startEdit(save: any) {
  editingId.value = save.id;
  editName.value = save.name;
}

async function saveEdit(id: number) {
  if (editName.value.trim()) {
    await saveStore.renameSave(id, editName.value.trim());
  }
  editingId.value = null;
}

function formatTime(timestamp: number) {
  return dayjs(timestamp).fromNow();
}
</script>

<template>
  <Teleport to="body">
    <NewGameWizard v-if="showWizard" @complete="onWizardComplete" @cancel="onWizardCancel" />
    <div
      v-if="isOpen && !showWizard"
      class="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/80 backdrop-blur-sm p-4 animate-fade-in font-sans"
    >
      <div
        class="relative bg-stone-50 dark:bg-stone-900 w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] border-2 border-izakaya-wood/30"
      >
        <!-- 纸纹纹理装饰层 (Texture Overlay) 喵 -->
        <div
          class="absolute inset-0 pointer-events-none opacity-40 bg-texture-rice-paper z-0"
        ></div>

        <!-- Header -->
        <div
          class="relative z-10 p-4 border-b border-izakaya-wood/10 flex justify-between items-center bg-touhou-red text-white shadow-md"
        >
          <div class="flex items-center gap-3">
            <h2 class="text-xl font-bold font-display flex items-center gap-3 tracking-wide">
              <span>💾</span> 存档管理
            </h2>
            <button
              v-if="showMigrationButton"
              @click="handleManualMigration"
              class="flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 dark:text-amber-300 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 rounded-full border border-amber-200 dark:border-amber-800 transition-colors shadow-sm"
              title="检测到旧版存档，点击尝试迁移"
            >
              <RefreshCw class="w-3 h-3" />
              发现旧存档
            </button>
          </div>
          <button
            @click="emit('close')"
            class="p-1.5 hover:bg-white/20 rounded-full transition-colors text-white"
          >
            <X class="w-6 h-6" />
          </button>
        </div>

        <!-- Migration Progress Overlay -->
        <div
          v-if="isMigrating"
          class="absolute inset-0 z-50 bg-white/90 dark:bg-stone-900/90 flex flex-col items-center justify-center p-6 text-center"
        >
          <RefreshCw class="w-12 h-12 text-touhou-red animate-spin mb-4" />
          <h3 class="text-lg font-bold text-stone-900 dark:text-white mb-2">正在迁移存档数据</h3>
          <p class="text-sm text-stone-500 dark:text-stone-400 mb-4">{{ migrationMessage }}</p>
          <div
            class="w-full max-w-xs bg-stone-200 dark:bg-stone-700 rounded-full h-2.5 mb-2 overflow-hidden"
          >
            <div
              class="bg-touhou-red h-2.5 rounded-full transition-all duration-300"
              :style="{ width: `${migrationProgress}%` }"
            ></div>
          </div>
          <p class="text-xs text-stone-400">{{ Math.round(migrationProgress) }}%</p>
          <p class="mt-4 text-xs text-touhou-red font-medium">请勿关闭页面，迁移完成后将自动刷新</p>
        </div>

        <!-- Content -->
        <div
          class="relative z-10 p-4 md:p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar bg-stone-100/50 dark:bg-stone-800/50 overscroll-contain"
          style="-webkit-overflow-scrolling: touch"
        >
          <!-- Guest Mode Status -->
          <div
            v-if="isGuest"
            class="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-4 animate-fade-in"
          >
            <div
              class="w-16 h-16 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400"
            >
              <RefreshCw class="w-8 h-8 animate-spin-slow" />
            </div>
            <div>
              <h3 class="text-lg font-bold text-blue-900 dark:text-blue-100">
                当前处于远程联机模式
              </h3>
              <p class="text-sm text-blue-700/70 dark:text-blue-300/70 mt-1">
                您正在作为客机参与其他玩家的世界，本地存档已暂时卸载。
              </p>
            </div>
            <div
              class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-blue-600/20"
            >
              状态：已连接 (远程)
            </div>
            <p class="text-[10px] text-blue-400 uppercase tracking-widest font-bold">
              远程多人联机 喵
            </p>
          </div>

          <!-- Create New -->
          <div v-if="!isCreating && !isGuest" class="flex flex-wrap justify-end gap-3">
            <div
              v-if="isMultiplayerActive"
              class="flex-1 flex items-center px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400 font-medium"
            >
              <span>⚠️ 联机进行中，无法创建、切换或修改本地存档</span>
            </div>
            <button
              @click="triggerImport"
              :disabled="isMultiplayerActive"
              class="flex items-center gap-2 px-4 py-2 bg-stone-200 hover:bg-stone-300 dark:bg-stone-700 dark:hover:bg-stone-600 text-izakaya-wood dark:text-stone-200 rounded-lg transition-all shadow hover:shadow-lg text-xs font-bold font-display disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download class="w-3.5 h-3.5" /> 导入存档
            </button>
            <button
              @click="
                isCreating = true;
                isCreatingMultiplayer = false;
              "
              :disabled="isMultiplayerActive"
              class="flex items-center gap-2 px-4 py-2 bg-stone-700 hover:bg-stone-800 text-white rounded-lg transition-all shadow hover:shadow-lg text-xs font-bold font-display disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus class="w-3.5 h-3.5" /> 新建单机
            </button>
            <button
              @click="
                isCreating = true;
                isCreatingMultiplayer = true;
              "
              :disabled="isMultiplayerActive"
              class="flex items-center gap-2 px-4 py-2 bg-touhou-red hover:bg-red-700 text-white rounded-lg transition-all shadow hover:shadow-lg text-xs font-bold font-display disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus class="w-3.5 h-3.5" /> 新建联机
            </button>
          </div>

          <div
            v-else
            class="bg-white/80 dark:bg-stone-800/80 p-5 rounded-xl border-2 animate-in fade-in slide-in-from-top-2 shadow-sm"
            :class="isCreatingMultiplayer ? 'border-touhou-red' : 'border-stone-400'"
          >
            <div class="flex items-center gap-2 mb-3">
              <span
                v-if="isCreatingMultiplayer"
                class="px-2 py-0.5 bg-touhou-red text-white text-[10px] rounded-full font-bold uppercase"
                >联机存档 (房主)</span
              >
              <span
                v-else
                class="px-2 py-0.5 bg-stone-500 text-white text-[10px] rounded-full font-bold uppercase"
                >单机存档</span
              >
              <label class="text-sm font-bold text-izakaya-wood dark:text-stone-300"
                >新存档名称</label
              >
            </div>
            <div class="flex gap-3">
              <input
                v-model="newSaveName"
                @keydown.enter="handleCreate"
                type="text"
                placeholder="例如：幻想乡异闻录"
                class="flex-1 bg-white dark:bg-stone-900 dark:text-stone-100 text-stone-900 dark:border-stone-700 dark:placeholder-stone-500 border border-izakaya-wood/20 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-touhou-red outline-none transition-all shadow-inner"
                autoFocus
              />
              <button
                @click="handleCreate"
                :disabled="!newSaveName.trim()"
                class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 font-bold shadow-sm transition-colors"
              >
                创建
              </button>
              <button
                @click="isCreating = false"
                class="px-4 py-2 bg-stone-200 hover:bg-stone-300 dark:bg-stone-700 dark:hover:bg-stone-600 text-izakaya-wood dark:text-stone-200 rounded-lg font-bold transition-colors"
              >
                取消
              </button>
            </div>
          </div>

          <!-- Save List -->
          <div v-if="!isGuest" class="space-y-8">
            <!-- Multiplayer Saves -->
            <div v-if="multiplayerSaves.length > 0" class="space-y-4">
              <h3
                class="text-xs font-bold text-touhou-red uppercase tracking-widest flex items-center gap-2 px-1"
              >
                <span class="w-2 h-2 rounded-full bg-touhou-red animate-pulse"></span>
                联机存档 (房主视角)
              </h3>
              <div class="space-y-4">
                <div
                  v-for="save in multiplayerSaves"
                  :key="save.id"
                  class="group relative flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl border-2 transition-all duration-300 gap-3"
                  :class="[
                    save.id === currentSaveId
                      ? 'border-touhou-red bg-red-50/80 dark:bg-red-900/20 shadow-md transform scale-[1.01]'
                      : 'border-izakaya-wood/10 bg-white/80 dark:bg-stone-800/80 hover:border-touhou-red/30 shadow-sm hover:shadow-md'
                  ]"
                >
                  <!-- Info -->
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1.5">
                      <span
                        v-if="save.id === currentSaveId"
                        class="px-2 py-0.5 bg-izakaya-wood text-white text-[10px] rounded-full font-bold uppercase tracking-wider shadow-sm"
                        >Current</span
                      >
                      <span
                        class="px-2 py-0.5 bg-touhou-red/10 text-touhou-red border border-touhou-red/20 text-[10px] rounded-full font-bold uppercase tracking-wider"
                        >Multiplayer</span
                      >

                      <div v-if="editingId === save.id" class="flex items-center gap-2 flex-1">
                        <input
                          v-model="editName"
                          @keydown.enter="saveEdit(save.id)"
                          @blur="saveEdit(save.id)"
                          class="flex-1 bg-white dark:bg-stone-900 dark:text-stone-100 text-stone-900 dark:border-stone-700 border border-izakaya-wood/30 rounded px-2 py-1 text-sm font-bold"
                          autoFocus
                        />
                      </div>
                      <h3
                        v-else
                        class="font-bold text-lg font-display text-izakaya-wood dark:text-stone-100 truncate cursor-pointer hover:text-touhou-red transition-colors"
                        @click="startEdit(save)"
                      >
                        {{ save.name }}
                      </h3>
                    </div>

                    <div
                      class="text-xs font-serif text-izakaya-wood/60 dark:text-stone-400 flex items-center gap-4"
                    >
                      <span class="flex items-center gap-1"
                        ><span class="text-base">📍</span> {{ save.location || '未知地点' }}</span
                      >
                      <span class="flex items-center gap-1"
                        ><span class="text-base">🕒</span> {{ formatTime(save.lastPlayed) }}</span
                      >
                    </div>
                  </div>

                  <!-- Actions -->
                  <div
                    class="flex items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity focus-within:opacity-100 flex-shrink-0"
                  >
                    <button
                      v-if="editingId !== save.id"
                      @click="handleExport(save)"
                      class="p-2 text-izakaya-wood/40 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors"
                      title="导出存档"
                    >
                      <Upload class="w-4 h-4" />
                    </button>

                    <button
                      v-if="editingId !== save.id"
                      @click="handleExportText(save)"
                      class="p-2 text-izakaya-wood/40 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors"
                      title="导出小说正文"
                    >
                      <FileText class="w-4 h-4" />
                    </button>

                    <button
                      v-if="editingId !== save.id"
                      @click="startEdit(save)"
                      :disabled="isMultiplayerActive"
                      class="p-2 text-izakaya-wood/40 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="重命名"
                    >
                      <Edit2 class="w-4 h-4" />
                    </button>

                    <button
                      @click.stop="handleDelete(save.id)"
                      :disabled="isMultiplayerActive"
                      class="p-2 text-izakaya-wood/40 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="删除存档"
                    >
                      <Trash2 class="w-4 h-4" />
                    </button>

                    <div class="w-px h-6 bg-izakaya-wood/10 dark:bg-stone-700 mx-1"></div>

                    <button
                      v-if="save.id !== currentSaveId"
                      @click="handleSwitch(save.id)"
                      :disabled="isMultiplayerActive"
                      class="flex items-center gap-1 px-4 py-1.5 bg-white dark:bg-stone-700 border border-izakaya-wood/10 dark:border-stone-600 hover:border-touhou-red hover:text-touhou-red dark:hover:border-touhou-red dark:hover:text-red-400 rounded-lg text-xs font-bold transition-all shadow-sm hover:shadow hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:border-izakaya-wood/10"
                    >
                      <Play class="w-3 h-3 fill-current" /> 读取
                    </button>
                    <div
                      v-else
                      class="flex items-center gap-1 px-4 py-1.5 bg-red-100/50 dark:bg-red-900/30 text-touhou-red dark:text-red-400 rounded-lg text-xs font-bold cursor-default border border-red-200/50 dark:border-red-900/50"
                    >
                      <Check class="w-3 h-3" /> 进行中
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Single Player Saves -->
            <div class="space-y-4">
              <h3
                v-if="multiplayerSaves.length > 0"
                class="text-xs font-bold text-stone-500 uppercase tracking-widest px-1"
              >
                单机存档
              </h3>
              <div class="space-y-4">
                <div
                  v-for="save in singlePlayerSaves"
                  :key="save.id"
                  class="group relative flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl border-2 transition-all duration-300 gap-3"
                  :class="[
                    save.id === currentSaveId
                      ? 'border-izakaya-wood bg-izakaya-wood/5 dark:bg-stone-800 shadow-md transform scale-[1.01]'
                      : 'border-izakaya-wood/10 bg-white/80 dark:bg-stone-800/80 hover:border-izakaya-wood/30 shadow-sm hover:shadow-md'
                  ]"
                >
                  <!-- Info -->
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1.5">
                      <span
                        v-if="save.id === currentSaveId"
                        class="px-2 py-0.5 bg-touhou-red text-white text-[10px] rounded-full font-bold uppercase tracking-wider shadow-sm"
                        >Current</span
                      >

                      <div v-if="editingId === save.id" class="flex items-center gap-2 flex-1">
                        <input
                          v-model="editName"
                          @keydown.enter="saveEdit(save.id)"
                          @blur="saveEdit(save.id)"
                          class="flex-1 bg-white dark:bg-stone-900 dark:text-stone-100 text-stone-900 dark:border-stone-700 border border-izakaya-wood/30 rounded px-2 py-1 text-sm font-bold"
                          autoFocus
                        />
                      </div>
                      <h3
                        v-else
                        class="font-bold text-lg font-display text-izakaya-wood dark:text-stone-100 truncate cursor-pointer hover:text-touhou-red transition-colors"
                        @click="startEdit(save)"
                      >
                        {{ save.name }}
                      </h3>
                    </div>

                    <div
                      class="text-xs font-serif text-izakaya-wood/60 dark:text-stone-400 flex items-center gap-4"
                    >
                      <span class="flex items-center gap-1"
                        ><span class="text-base">📍</span> {{ save.location || '未知地点' }}</span
                      >
                      <span class="flex items-center gap-1"
                        ><span class="text-base">🕒</span> {{ formatTime(save.lastPlayed) }}</span
                      >
                    </div>
                  </div>

                  <!-- Actions -->
                  <div
                    class="flex items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity focus-within:opacity-100 flex-shrink-0"
                  >
                    <button
                      v-if="editingId !== save.id"
                      @click="handleExport(save)"
                      class="p-2 text-izakaya-wood/40 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors"
                      title="导出存档"
                    >
                      <Upload class="w-4 h-4" />
                    </button>

                    <button
                      v-if="editingId !== save.id"
                      @click="handleExportText(save)"
                      class="p-2 text-izakaya-wood/40 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors"
                      title="导出小说正文"
                    >
                      <FileText class="w-4 h-4" />
                    </button>

                    <button
                      v-if="editingId !== save.id"
                      @click="startEdit(save)"
                      :disabled="isMultiplayerActive"
                      class="p-2 text-izakaya-wood/40 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="重命名"
                    >
                      <Edit2 class="w-4 h-4" />
                    </button>

                    <button
                      @click.stop="handleDelete(save.id)"
                      :disabled="isMultiplayerActive"
                      class="p-2 text-izakaya-wood/40 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="删除存档"
                    >
                      <Trash2 class="w-4 h-4" />
                    </button>

                    <div class="w-px h-6 bg-izakaya-wood/10 dark:bg-stone-700 mx-1"></div>

                    <button
                      v-if="save.id !== currentSaveId"
                      @click="handleSwitch(save.id)"
                      :disabled="isMultiplayerActive"
                      class="flex items-center gap-1 px-4 py-1.5 bg-white dark:bg-stone-700 border border-izakaya-wood/10 dark:border-stone-600 hover:border-touhou-red hover:text-touhou-red dark:hover:border-touhou-red dark:hover:text-red-400 rounded-lg text-xs font-bold transition-all shadow-sm hover:shadow hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:border-izakaya-wood/10"
                    >
                      <Play class="w-3 h-3 fill-current" /> 读取
                    </button>
                    <div
                      v-else
                      class="flex items-center gap-1 px-4 py-1.5 bg-red-100/50 dark:bg-red-900/30 text-touhou-red dark:text-red-400 rounded-lg text-xs font-bold cursor-default border border-red-200/50 dark:border-red-900/50"
                    >
                      <Check class="w-3 h-3" /> 进行中
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <!-- 隐藏的文件上传输入控件 喵 -->
        <input type="file" ref="fileInput" class="hidden" accept=".json" @change="handleImport" />
      </div>
    </div>
  </Teleport>
</template>

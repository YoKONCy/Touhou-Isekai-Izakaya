<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useSaveStore } from '@/stores/save';
import { useGameStore } from '@/stores/game';
import { useChatStore } from '@/stores/chat';
import NewGameWizard from './NewGameWizard.vue';
import { gameLoop } from '@/services/gameLoop';
import { X, Plus, Trash2, Edit2, Play, Check, Download, Upload, RefreshCw } from 'lucide-vue-next';
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

const isCreating = ref(false);
const newSaveName = ref('');
const editingId = ref<number | null>(null);
const editName = ref('');

const showWizard = ref(false);
const tempSaveName = ref('');

watch(() => props.isOpen, async (val) => {
  if (val) {
    if (saves.value.length === 0) {
      isCreating.value = true;
    }
    // Check if migration might be needed
    const needed = await checkMigrationNeeded(true); // pass true to skip localStorage check
    showMigrationButton.value = needed;
  }
});

async function handleManualMigration() {
  const ok = await confirm('检测到旧版（Dexie）中存有数据，是否尝试迁移到新版（SQLite）？迁移不会删除旧数据。', {
    title: '迁移旧版存档',
    confirmText: '开始迁移',
    cancelText: '取消'
  });

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
  showWizard.value = true;
  // We don't close SaveManager yet, just overlay Wizard
}

async function onWizardComplete(data: any) {
  showWizard.value = false;
  isCreating.value = false;
  newSaveName.value = '';
  
  // 1. Create Save
  const id = await saveStore.createSave(tempSaveName.value);
  
  // 2. Switch to it (Resets state)
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

  // 3.1 Update System Config (Difficulty)
  if (data.difficulty) {
      const currentSystem = gameStore.state.system;
      gameStore.updateState({
          system: {
              ...currentSystem,
              difficulty: data.difficulty
          }
      });
  }
  
  // 4. Send initial message if provided (Store Start)
  // Define mapPromise outside to track background generation
  let mapPromise: Promise<any> = Promise.resolve(null);

  if (data.initialMessage) {
    console.log("[SaveManager] Checking store description:", data.storeDescription);
    if (data.storeDescription) {
        // Generate initial map from store description (Parallel execution)
        console.log("[SaveManager] Starting initial map generation (Background)...");
        mapPromise = generateMap("New Izakaya", data.storeDescription)
            .catch(e => {
                console.error("Failed to generate initial map", e);
                return null;
            });
    }
  }

  // 5. Create initial snapshot to persist the configured state
  await chatStore.createInitialSnapshot();
  
  // Close UI immediately to show game interface
  emit('close');

  // 6. Trigger LLM response if needed
  if (data.initialMessage) {
    console.log("[SaveManager] Triggering initial LLM response with message:", data.initialMessage);
    gameLoop.handleUserAction(data.initialMessage).catch(e => {
        console.error("[SaveManager] Failed to trigger initial action:", e);
    });
  } else {
    console.log("[SaveManager] No initial message provided, skipping LLM trigger.");
  }

  // 7. Handle Map Completion (Update state when ready)
  if (data.storeDescription) {
      mapPromise.then((initialMap) => {
        if (initialMap) {
            console.log("[SaveManager] Map generated in background, updating state...");
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
    // const blob = new Blob([json], { type: 'application/json' }); // exportSave now returns Blob directly
    
    // Check size
    if (blob.size > 100 * 1024 * 1024) { // 100MB
       console.warn(`[SaveManager] Large save file detected: ${(blob.size / 1024 / 1024).toFixed(2)}MB`);
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TouhouSave_${save.name.replace(/[\\/:*?"<>|]/g, '_')}_${dayjs().format('YYYYMMDD_HHmmss')}.json`;
    document.body.appendChild(a);
    a.click();
    
    // Cleanup after a delay to ensure the browser has started the download
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    
    console.log('[SaveManager] Export triggered successfully');
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
      const content = e.target?.result as string;
      await saveStore.importSave(content);
      alert('存档导入成功！');
    } catch (error) {
      console.error('Import failed:', error);
      alert('导入存档失败，请检查文件格式');
    } finally {
      // Reset input
      if (fileInput.value) fileInput.value.value = '';
    }
  };
  reader.readAsText(file);
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
    <NewGameWizard 
      v-if="showWizard" 
      @complete="onWizardComplete" 
      @cancel="onWizardCancel" 
    />
    <div v-if="isOpen && !showWizard" class="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/80 backdrop-blur-sm p-4 animate-fade-in font-sans">
      <div class="relative bg-stone-50 dark:bg-stone-900 w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] border-2 border-izakaya-wood/30">
        <!-- Texture Overlay -->
        <div class="absolute inset-0 pointer-events-none opacity-40 bg-texture-rice-paper z-0"></div>

        <!-- Header -->
        <div class="relative z-10 p-4 border-b border-izakaya-wood/10 flex justify-between items-center bg-touhou-red text-white shadow-md">
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
          <button @click="emit('close')" class="p-1.5 hover:bg-white/20 rounded-full transition-colors text-white">
            <X class="w-6 h-6" />
          </button>
        </div>

        <!-- Migration Progress Overlay -->
        <div v-if="isMigrating" class="absolute inset-0 z-50 bg-white/90 dark:bg-stone-900/90 flex flex-col items-center justify-center p-6 text-center">
          <RefreshCw class="w-12 h-12 text-touhou-red animate-spin mb-4" />
          <h3 class="text-lg font-bold text-stone-900 dark:text-white mb-2">正在迁移存档数据</h3>
          <p class="text-sm text-stone-500 dark:text-stone-400 mb-4">{{ migrationMessage }}</p>
          <div class="w-full max-w-xs bg-stone-200 dark:bg-stone-700 rounded-full h-2.5 mb-2 overflow-hidden">
            <div class="bg-touhou-red h-2.5 rounded-full transition-all duration-300" :style="{ width: `${migrationProgress}%` }"></div>
          </div>
          <p class="text-xs text-stone-400">{{ Math.round(migrationProgress) }}%</p>
          <p class="mt-4 text-xs text-touhou-red font-medium">请勿关闭页面，迁移完成后将自动刷新</p>
        </div>

        <!-- Content -->
        <div class="relative z-10 p-4 md:p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar bg-stone-100/50 dark:bg-stone-800/50 overscroll-contain" style="-webkit-overflow-scrolling: touch;">
          
          <!-- Create New -->
          <div v-if="!isCreating" class="flex justify-end gap-3">
            <button 
              @click="triggerImport"
              class="flex items-center gap-2 px-4 py-2.5 bg-stone-200 hover:bg-stone-300 dark:bg-stone-700 dark:hover:bg-stone-600 text-izakaya-wood dark:text-stone-200 rounded-lg transition-all shadow hover:shadow-lg hover:-translate-y-0.5 text-sm font-bold font-display"
            >
              <Download class="w-4 h-4" /> 导入存档
            </button>
            <button 
              @click="isCreating = true"
              class="flex items-center gap-2 px-5 py-2.5 bg-touhou-red hover:bg-red-700 text-white rounded-lg transition-all shadow hover:shadow-lg hover:-translate-y-0.5 text-sm font-bold font-display"
            >
              <Plus class="w-4 h-4" /> 新建存档
            </button>
          </div>

          <div v-else class="bg-white/80 dark:bg-stone-800/80 p-5 rounded-xl border border-izakaya-wood/20 animate-in fade-in slide-in-from-top-2 shadow-sm">
            <label class="block text-sm font-bold text-izakaya-wood dark:text-stone-300 mb-2">新存档名称</label>
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
          <div class="space-y-4">
            <div
              v-for="save in saves"
              :key="save.id"
              class="group relative flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl border-2 transition-all duration-300 gap-3"
              :class="[
                save.id === currentSaveId 
                  ? 'border-touhou-red bg-red-50/80 dark:bg-red-900/20 shadow-md transform scale-[1.01]' 
                  : 'border-transparent bg-white/80 dark:bg-stone-800/80 hover:border-izakaya-wood/20 shadow-sm hover:shadow-md'
              ]"
            >
              <!-- Info -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1.5">
                  <span v-if="save.id === currentSaveId" class="px-2 py-0.5 bg-touhou-red text-white text-[10px] rounded-full font-bold uppercase tracking-wider shadow-sm">Current</span>
                  
                  <div v-if="editingId === save.id" class="flex items-center gap-2 flex-1">
                    <input 
                      v-model="editName"
                      @keydown.enter="saveEdit(save.id)"
                      @blur="saveEdit(save.id)"
                      class="flex-1 bg-white dark:bg-stone-900 dark:text-stone-100 text-stone-900 dark:border-stone-700 border border-izakaya-wood/30 rounded px-2 py-1 text-sm font-bold"
                      autoFocus
                    />
                  </div>
                  <h3 v-else class="font-bold text-lg font-display text-izakaya-wood dark:text-stone-100 truncate cursor-pointer hover:text-touhou-red transition-colors" @click="startEdit(save)">
                    {{ save.name }}
                  </h3>
                </div>
                
                <div class="text-xs font-serif text-izakaya-wood/60 dark:text-stone-400 flex items-center gap-4">
                  <span class="flex items-center gap-1"><span class="text-base">📍</span> {{ save.location || '未知地点' }}</span>
                  <span class="flex items-center gap-1"><span class="text-base">🕒</span> {{ formatTime(save.lastPlayed) }}</span>
                </div>
              </div>

              <!-- Actions - always visible on mobile, hover on desktop -->
              <div class="flex items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity focus-within:opacity-100 flex-shrink-0">
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
                  @click="startEdit(save)"
                  class="p-2 text-izakaya-wood/40 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                  title="重命名"
                >
                  <Edit2 class="w-4 h-4" />
                </button>
                
                <button 
                  @click.stop="handleDelete(save.id)"
                  class="p-2 text-izakaya-wood/40 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                  title="删除存档"
                >
                  <Trash2 class="w-4 h-4" />
                </button>

                <div class="w-px h-6 bg-izakaya-wood/10 dark:bg-stone-700 mx-1"></div>

                <button 
                  v-if="save.id !== currentSaveId"
                  @click="handleSwitch(save.id)"
                  class="flex items-center gap-1 px-4 py-1.5 bg-white dark:bg-stone-700 border border-izakaya-wood/10 dark:border-stone-600 hover:border-touhou-red hover:text-touhou-red dark:hover:border-touhou-red dark:hover:text-red-400 rounded-lg text-xs font-bold transition-all shadow-sm hover:shadow hover:-translate-y-0.5"
                >
                  <Play class="w-3 h-3 fill-current" /> 读取
                </button>
                <div v-else class="flex items-center gap-1 px-4 py-1.5 bg-red-100/50 dark:bg-red-900/30 text-touhou-red dark:text-red-400 rounded-lg text-xs font-bold cursor-default border border-red-200/50 dark:border-red-900/50">
                  <Check class="w-3 h-3" /> 进行中
                </div>
              </div>

            </div>
          </div>

        </div>
        <!-- Hidden File Input -->
        <input 
          type="file" 
          ref="fileInput"
          class="hidden" 
          accept=".json"
          @change="handleImport"
        />
      </div>
    </div>
  </Teleport>
</template>

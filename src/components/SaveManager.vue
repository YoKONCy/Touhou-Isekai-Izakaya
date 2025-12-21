<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useSaveStore } from '@/stores/save';
import { useGameStore } from '@/stores/game';
import { useChatStore } from '@/stores/chat';
import NewGameWizard from './NewGameWizard.vue';
import { gameLoop } from '@/services/gameLoop';
import { X, Plus, Trash2, Edit2, Play, Check } from 'lucide-vue-next';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import { useConfirm } from '@/utils/confirm';
import { generateMap } from '@/services/management/MapGenerator';

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
const { confirm } = useConfirm();
const saves = computed(() => saveStore.saves);
const currentSaveId = computed(() => saveStore.currentSaveId);

const isCreating = ref(false);
const newSaveName = ref('');
const editingId = ref<number | null>(null);
const editName = ref('');

const showWizard = ref(false);
const tempSaveName = ref('');

watch(() => props.isOpen, (val) => {
  if (val && saves.value.length === 0) {
    isCreating.value = true;
  }
});

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

    // Save context for Management System
    const newSystemState: any = {
        ...gameStore.state.system,
        customMap: undefined, // Will be updated when mapPromise resolves
        management: {
            isActive: false, 
            isTriggered: true, 
            context: data.initialMessage,
            storeDescription: data.storeDescription,
            specialGuests: [],
            difficulty: 'normal',
            stats: {
                totalRevenue: 0,
                customersServed: 0,
                reputationGained: 0,
                startTime: Date.now()
            }
        }
    };

    gameStore.updateState({
        system: newSystemState
    });
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
          <h2 class="text-xl font-bold font-display flex items-center gap-3 tracking-wide">
            <span>💾</span> 存档管理
          </h2>
          <button @click="emit('close')" class="p-1.5 hover:bg-white/20 rounded-full transition-colors text-white">
            <X class="w-6 h-6" />
          </button>
        </div>

        <!-- Content -->
        <div class="relative z-10 p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar bg-stone-100/50 dark:bg-stone-800/50">
          
          <!-- Create New -->
          <div v-if="!isCreating" class="flex justify-end">
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
              class="group relative flex items-center justify-between p-4 rounded-xl border-2 transition-all duration-300"
              :class="[
                save.id === currentSaveId 
                  ? 'border-touhou-red bg-red-50/80 dark:bg-red-900/20 shadow-md transform scale-[1.01]' 
                  : 'border-transparent bg-white/80 dark:bg-stone-800/80 hover:border-izakaya-wood/20 shadow-sm hover:shadow-md'
              ]"
            >
              <!-- Info -->
              <div class="flex-1 min-w-0 mr-4">
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

              <!-- Actions -->
              <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity focus-within:opacity-100">
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
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useCharacterStore, generateUUID } from '@/stores/character';
import { type CharacterCard } from '@/types/db';
import {
  Folder,
  FileText,
  Plus,
  Trash2,
  Save,
  X,
  Edit2,
  Lock,
  ArrowLeft,
  RotateCcw,
  ShieldAlert,
  Library,
  ChevronRight
} from 'lucide-vue-next';
import { useConfirm } from '@/utils/confirm';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const copyToClipboard = (text: string) => {
  if (navigator && navigator.clipboard) {
    navigator.clipboard.writeText(text);
  }
};

const charStore = useCharacterStore();
const { confirm } = useConfirm();
const selectedCategory = ref<string>('全部');
const selectedCharId = ref<string | null>(null);
const isEditing = ref(false);
const mobileShowEditor = ref(false); // Mobile: show editor panel

// Form data
const formData = ref<Partial<CharacterCard>>({
  name: '',
  description: '',
  category: '未分类',
  tags: [],
  gender: 'female',
  type: 'character', // Default type

  // Init defaults
  initialPower: 'C',
  initialMaxHp: 100,
  initialResidence: '',

  cost: 0,
  damage: 0,
  damageType: 'attack'
});

const tagInput = ref('');

// Computed
const categories = computed(() => ['全部', ...charStore.getCategories()]);

const categoryCounts = computed(() => {
  const counts: Record<string, number> = { 全部: charStore.characters.length };
  charStore.characters.forEach((c) => {
    const cat = c.category || '未分类';
    counts[cat] = (counts[cat] || 0) + 1;
  });
  return counts;
});

const filteredCharacters = computed(() => {
  if (selectedCategory.value === '全部') {
    return charStore.characters;
  }
  return charStore.characters.filter((c) => (c.category || '未分类') === selectedCategory.value);
});

const isTypeDisabled = computed(() => {
  // 1. 现有条目禁止更改类型以维护数据一致性
  // 2. 暂时关闭除角色以外的新增权限 (根据用户要求)
  return true;
});

onMounted(async () => {
  await charStore.loadCharacters();
});

// Actions
function handleSelectChar(char: CharacterCard) {
  selectedCharId.value = char.uuid;
  formData.value = { ...char };
  isEditing.value = true;
  mobileShowEditor.value = true; // Mobile: show editor
}

function handleNewChar() {
  selectedCharId.value = null;
  formData.value = {
    uuid: generateUUID(),
    name: '新条目',
    description: '',
    category: selectedCategory.value === '全部' ? '未分类' : selectedCategory.value,
    tags: [],
    type: 'character',
    gender: 'female',
    initialPower: 'C',
    initialMaxHp: 100
  };
  isEditing.value = true;
  mobileShowEditor.value = true; // Mobile: show editor
}

function handleMobileBack() {
  mobileShowEditor.value = false;
}

async function handleReset() {
  if (await confirm('确定要重置当前编辑的内容吗？所有未保存的修改都将丢失。')) {
    if (selectedCharId.value) {
      // Re-load from store
      const original = charStore.characters.find((c) => c.uuid === selectedCharId.value);
      if (original) {
        formData.value = { ...original };
      }
    } else {
      // Reset to new char defaults
      handleNewChar();
    }
  }
}

async function handleSave() {
  if (!formData.value.name) return;

  if (selectedCharId.value) {
    await charStore.updateCharacter(selectedCharId.value, formData.value);
  } else {
    const newChar = await charStore.addCharacter(formData.value as any);
    selectedCharId.value = newChar.uuid;
  }

  // Refresh category list to include any new category added
  charStore.getCategories();
}

async function handleDelete() {
  if (!selectedCharId.value) return;
  if (await confirm('确定要删除这个条目吗？', { destructive: true })) {
    await charStore.deleteCharacter(selectedCharId.value);
    selectedCharId.value = null;
    isEditing.value = false;
  }
}

async function handleRenameCategory() {
  if (selectedCategory.value === '全部' || selectedCategory.value === '未分类') return;

  const newName = prompt('请输入新的文件夹名称:', selectedCategory.value);
  if (newName && newName !== selectedCategory.value) {
    await charStore.renameCategory(selectedCategory.value, newName);
    selectedCategory.value = newName;
  }
}

async function handleDeleteCategory() {
  if (selectedCategory.value === '全部' || selectedCategory.value === '未分类') return;

  if (
    await confirm(
      `确定要删除文件夹 "${selectedCategory.value}" 吗？\n其中的条目将被移动到 "未分类" 文件夹。`,
      { destructive: true }
    )
  ) {
    await charStore.deleteCategory(selectedCategory.value);
    selectedCategory.value = '全部';
  }
}

async function handleFactoryReset() {
  if (
    await confirm(
      '确定要恢复出厂设置吗？\n这将删除所有手动修改和新建的条目，并重新加载系统默认设置。此操作不可撤销！',
      { destructive: true }
    )
  ) {
    await charStore.factoryReset();
    selectedCharId.value = null;
    isEditing.value = false;
    selectedCategory.value = '全部';
  }
}

function addTag() {
  if (!tagInput.value.trim()) return;
  if (!formData.value.tags) formData.value.tags = [];
  formData.value.tags.push(tagInput.value.trim());
  tagInput.value = '';
}

function removeTag(index: number) {
  formData.value.tags?.splice(index, 1);
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/80 backdrop-blur-sm p-4 animate-fade-in font-sans"
  >
    <div
      class="relative bg-stone-50 dark:bg-stone-900 w-full max-w-6xl h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden border-2 border-izakaya-wood/30"
    >
      <!-- Texture Overlay -->
      <div class="absolute inset-0 pointer-events-none opacity-40 bg-texture-rice-paper z-0"></div>

      <!-- Header -->
      <div
        class="relative z-10 flex items-center justify-between p-4 border-b border-izakaya-wood/10 bg-touhou-red text-white shadow-md"
      >
        <h2 class="text-xl font-bold font-display flex items-center gap-3 tracking-wide">
          <FileText class="w-6 h-6" />
          <span>条目编辑器 (Lorebook)</span>
        </h2>
        <div class="flex items-center gap-2">
          <button
            @click="$emit('close')"
            class="p-1.5 hover:bg-white/20 rounded-full text-white transition-colors"
          >
            <X class="w-6 h-6" />
          </button>
        </div>
      </div>

      <div class="relative z-10 flex-1 flex overflow-hidden">
        <!-- Left: Category & List (Desktop always visible, Mobile hidden when editing) -->
        <div
          class="w-full md:w-80 border-r border-izakaya-wood/10 flex flex-col bg-stone-100/80 dark:bg-stone-800/80 backdrop-blur-sm overflow-hidden h-full"
          :class="{ 'hidden md:flex': mobileShowEditor }"
        >
          <!-- Category Sidebar Section -->
          <div class="flex-shrink-0 flex flex-col max-h-[40%] border-b border-izakaya-wood/10">
            <div class="p-3 pb-2 flex items-center justify-between">
              <h3
                class="text-[10px] font-bold text-izakaya-wood/40 dark:text-stone-500 uppercase tracking-wider px-2"
              >
                分类目录
              </h3>
              <span class="text-[10px] text-izakaya-wood/30 dark:text-stone-600 px-2"
                >{{ categories.length }} 文件夹</span
              >
            </div>
            <div class="flex-1 overflow-y-auto px-3 pb-3 space-y-1 custom-scrollbar">
              <div
                v-for="cat in categories"
                :key="cat"
                class="group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all"
                :class="
                  selectedCategory === cat
                    ? 'bg-touhou-red text-white shadow-md'
                    : 'hover:bg-stone-200 dark:hover:bg-stone-700 text-izakaya-wood dark:text-stone-300'
                "
                @click="selectedCategory = cat"
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  <Library v-if="cat === '全部'" class="w-4 h-4 flex-shrink-0" />
                  <Folder
                    v-else
                    class="w-4 h-4 flex-shrink-0"
                    :class="
                      selectedCategory === cat
                        ? 'text-white'
                        : 'text-izakaya-wood/40 dark:text-stone-500'
                    "
                  />
                  <span class="text-sm font-bold truncate">{{ cat }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span
                    class="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
                    :class="
                      selectedCategory === cat
                        ? 'bg-white/20 text-white'
                        : 'bg-stone-300/50 dark:bg-stone-600/50 text-izakaya-wood/60 dark:text-stone-400'
                    "
                  >
                    {{ categoryCounts[cat] || 0 }}
                  </span>
                  <!-- Actions (Only show for custom categories when active) -->
                  <div
                    v-if="cat !== '全部' && cat !== '未分类' && selectedCategory === cat"
                    class="flex items-center gap-1 ml-1 animate-fade-in"
                  >
                    <button
                      @click.stop="handleRenameCategory"
                      class="p-1 hover:bg-white/20 rounded transition-colors"
                      title="重命名"
                    >
                      <Edit2 class="w-3 h-3" />
                    </button>
                    <button
                      @click.stop="handleDeleteCategory"
                      class="p-1 hover:bg-red-400 rounded transition-colors"
                      title="删除"
                    >
                      <Trash2 class="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Character List Section -->
          <div
            class="flex-1 flex flex-col overflow-hidden bg-stone-50/30 dark:bg-stone-900/10 min-h-0"
          >
            <!-- Character List Header -->
            <div
              class="px-4 py-2 bg-stone-200/30 dark:bg-stone-900/20 border-b border-izakaya-wood/10 flex items-center justify-between flex-shrink-0"
            >
              <span
                class="text-[10px] font-bold text-izakaya-wood/40 dark:text-stone-500 uppercase tracking-wider"
                >条目列表 ({{ selectedCategory }})</span
              >
              <span class="text-[10px] text-izakaya-wood/30 dark:text-stone-600"
                >{{ filteredCharacters.length }} 项</span
              >
            </div>

            <!-- Character List -->
            <div class="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar min-h-0">
              <button
                v-for="char in filteredCharacters"
                :key="char.uuid"
                @click="handleSelectChar(char)"
                class="w-full text-left px-4 py-3 rounded-lg text-sm flex items-center gap-3 transition-all border border-transparent group"
                :class="
                  selectedCharId === char.uuid
                    ? 'bg-white dark:bg-stone-700 text-touhou-red border-touhou-red/20 shadow-sm'
                    : 'hover:bg-white/50 dark:hover:bg-stone-700/50 text-izakaya-wood/80 dark:text-stone-400 hover:border-izakaya-wood/5'
                "
              >
                <div
                  class="w-1.5 h-1.5 rounded-full transition-colors flex-shrink-0"
                  :class="
                    selectedCharId === char.uuid
                      ? 'bg-touhou-red shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                      : 'bg-stone-300 dark:bg-stone-600 group-hover:bg-touhou-red/30'
                  "
                ></div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between">
                    <span
                      class="font-bold truncate"
                      :class="
                        selectedCharId === char.uuid
                          ? 'text-touhou-red'
                          : 'text-izakaya-wood dark:text-stone-200'
                      "
                      >{{ char.name }}</span
                    >
                    <ChevronRight
                      v-if="selectedCharId === char.uuid"
                      class="w-3.5 h-3.5 opacity-50"
                    />
                  </div>
                  <div class="text-[10px] opacity-50 flex items-center gap-1 mt-0.5">
                    <span v-if="char.type === 'spell_card'">符卡</span>
                    <span v-else-if="char.type === 'location'">地点</span>
                    <span v-else-if="char.type === 'info'">信息</span>
                    <span v-else-if="char.type === 'other'">其他</span>
                    <span v-else>角色</span>
                  </div>
                </div>
              </button>

              <button
                @click="handleNewChar"
                class="w-full flex items-center justify-center gap-2 px-4 py-3 mt-4 border-2 border-dashed border-izakaya-wood/10 hover:border-touhou-red/30 rounded-lg text-izakaya-wood/40 dark:text-stone-500 hover:text-touhou-red hover:bg-white dark:hover:bg-stone-800 transition-all text-sm font-bold group"
              >
                <Plus class="w-4 h-4 transition-transform group-hover:rotate-90" /> 新建条目
              </button>
            </div>
          </div>

          <!-- Factory Reset Button at the bottom -->
          <div class="p-3 border-t border-izakaya-wood/10">
            <button
              @click="handleFactoryReset"
              class="w-full flex items-center justify-center gap-2 px-4 py-2 text-[10px] font-bold text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 rounded transition-all opacity-60 hover:opacity-100"
            >
              <ShieldAlert class="w-3 h-3" /> 恢复出厂设置
            </button>
          </div>
        </div>

        <!-- Right: Editor (Desktop always visible, Mobile slide in) -->
        <div
          class="flex-1 flex flex-col bg-white/60 dark:bg-stone-900/60 backdrop-blur-sm"
          :class="{
            'hidden md:flex': !mobileShowEditor,
            'absolute inset-0 md:relative md:inset-auto z-30 bg-stone-50 dark:bg-stone-900':
              mobileShowEditor
          }"
        >
          <div v-if="isEditing" class="flex-1 flex flex-col h-full">
            <!-- Toolbar -->
            <div
              class="h-14 md:h-16 border-b border-izakaya-wood/10 flex items-center justify-between px-4 md:px-6 bg-stone-50/80 dark:bg-stone-800/80"
            >
              <!-- Mobile back button -->
              <button
                @click="handleMobileBack"
                class="md:hidden p-2 -ml-2 hover:bg-stone-200 dark:hover:bg-stone-700 rounded-lg transition-colors"
              >
                <ArrowLeft class="w-5 h-5 text-izakaya-wood dark:text-stone-300" />
              </button>
              <span
                class="text-sm text-izakaya-wood/70 dark:text-stone-400 font-serif flex items-center gap-2 flex-1 md:flex-initial truncate"
              >
                <Edit2 class="w-4 h-4 hidden md:block" />
                <span class="truncate"
                  >正在编辑:
                  <span class="font-bold text-izakaya-wood dark:text-stone-200">{{
                    formData.name
                  }}</span></span
                >
              </span>
              <div class="flex items-center gap-3">
                <button
                  @click="handleReset"
                  class="p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-lg transition-colors"
                  title="重置修改"
                >
                  <RotateCcw class="w-5 h-5" />
                </button>
                <button
                  @click="handleDelete"
                  class="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="删除"
                >
                  <Trash2 class="w-5 h-5" />
                </button>
                <button
                  @click="handleSave"
                  class="px-5 py-2 bg-touhou-red hover:bg-red-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 shadow hover:shadow-lg transition-all transform hover:-translate-y-0.5"
                >
                  <Save class="w-4 h-4" />
                  保存
                </button>
              </div>
            </div>

            <!-- Form -->
            <div
              class="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 md:space-y-8 custom-scrollbar relative"
              style="-webkit-overflow-scrolling: touch"
            >
              <!-- Type Selector -->
              <div>
                <div class="flex items-center justify-between mb-2">
                  <label class="block text-sm font-bold text-izakaya-wood dark:text-stone-300"
                    >条目类型</label
                  >
                  <span
                    v-if="isTypeDisabled"
                    class="text-[10px] text-touhou-red font-bold flex items-center gap-1 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded"
                  >
                    <Lock class="w-3 h-3" />
                    {{
                      selectedCharId ? '已锁定 (现有条目不可更改类型)' : '暂时仅支持新增角色类型'
                    }}
                  </span>
                </div>
                <div
                  class="flex rounded-lg shadow-sm overflow-hidden border border-izakaya-wood/20 flex-wrap"
                  :class="{ 'opacity-70 cursor-not-allowed': isTypeDisabled }"
                >
                  <button
                    v-for="t in ['character', 'spell_card', 'location', 'info', 'other']"
                    :key="t"
                    @click="!isTypeDisabled && (formData.type = t as any)"
                    :disabled="isTypeDisabled"
                    class="flex-1 min-w-[80px] flex items-center justify-center gap-2 py-2 text-xs font-bold transition-all"
                    :class="[
                      formData.type === t || (!formData.type && t === 'character')
                        ? 'bg-touhou-red text-white'
                        : 'bg-white dark:bg-stone-800 text-izakaya-wood dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 border-r last:border-r-0 border-izakaya-wood/10',
                      isTypeDisabled ? 'cursor-not-allowed' : 'cursor-pointer'
                    ]"
                  >
                    {{
                      t === 'character'
                        ? '角色'
                        : t === 'spell_card'
                          ? '符卡'
                          : t === 'location'
                            ? '地点'
                            : t === 'info'
                              ? '信息'
                              : '其他'
                    }}
                  </button>
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                <div>
                  <label class="block text-sm font-bold text-izakaya-wood dark:text-stone-300 mb-2"
                    >条目名称</label
                  >
                  <input
                    v-model="formData.name"
                    type="text"
                    autofocus
                    class="w-full border-izakaya-wood/20 rounded-lg shadow-sm focus:ring-touhou-red focus:border-touhou-red dark:bg-stone-800 dark:border-stone-700 dark:text-stone-100 text-stone-900 bg-white/80 transition-all"
                    placeholder="例如：博丽神社"
                  />
                </div>
                <div>
                  <label class="block text-sm font-bold text-izakaya-wood dark:text-stone-300 mb-2"
                    >分类 (文件夹)</label
                  >
                  <div class="relative">
                    <input
                      v-model="formData.category"
                      type="text"
                      list="category-options"
                      class="w-full border-izakaya-wood/20 rounded-lg shadow-sm focus:ring-touhou-red focus:border-touhou-red dark:bg-stone-800 dark:border-stone-700 dark:text-stone-100 text-stone-900 bg-white/80 transition-all"
                      placeholder="选择或输入新分类..."
                    />
                    <datalist id="category-options">
                      <option v-for="cat in charStore.getCategories()" :key="cat" :value="cat">
                        {{ cat }}
                      </option>
                    </datalist>
                  </div>
                </div>

                <!-- Character Specific: Gender -->
                <div v-if="formData.type === 'character' || !formData.type">
                  <label class="block text-sm font-bold text-izakaya-wood dark:text-stone-300 mb-2"
                    >性别</label
                  >
                  <select
                    v-model="formData.gender"
                    class="w-full border-izakaya-wood/20 rounded-lg shadow-sm focus:ring-touhou-red focus:border-touhou-red dark:bg-stone-800 dark:border-stone-700 dark:text-stone-100 text-stone-900 bg-white/80 transition-all"
                  >
                    <option value="">未设置</option>
                    <option value="female">女性</option>
                    <option value="male">男性</option>
                    <option value="other">其他</option>
                  </select>
                </div>
              </div>

              <!-- Character Initial Stats -->
              <div
                v-if="formData.type === 'character' || !formData.type"
                class="p-4 md:p-5 bg-stone-100/80 dark:bg-stone-800/50 rounded-xl border border-izakaya-wood/10 space-y-4"
              >
                <h3
                  class="text-sm font-bold text-izakaya-wood dark:text-stone-200 flex items-center gap-2"
                >
                  <span class="w-1 h-4 bg-touhou-red rounded-full"></span>
                  初始变量配置 (初始化时写入)
                </h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  <div>
                    <label
                      class="block text-xs font-bold text-izakaya-wood/60 dark:text-stone-400 mb-1.5"
                      >UUID (对应 npcId)</label
                    >
                    <div class="flex gap-2">
                      <input
                        v-model="formData.uuid"
                        type="text"
                        :readonly="!!selectedCharId"
                        class="flex-1 text-xs bg-white dark:bg-stone-900 border border-izakaya-wood/10 rounded px-2 py-1.5 font-mono text-izakaya-wood/70 dark:text-stone-400 focus:ring-touhou-red focus:border-touhou-red"
                        :class="selectedCharId ? 'opacity-70' : 'hover:border-touhou-red/50'"
                        placeholder="输入唯一标识符..."
                      />
                      <button
                        class="text-xs text-blue-500 hover:text-blue-600 font-bold px-2"
                        @click="copyToClipboard(formData.uuid || '')"
                      >
                        复制
                      </button>
                    </div>
                  </div>
                  <div>
                    <label
                      class="block text-xs font-bold text-izakaya-wood/60 dark:text-stone-400 mb-1.5"
                      >初始住所</label
                    >
                    <input
                      v-model="formData.initialResidence"
                      type="text"
                      class="w-full text-sm border-izakaya-wood/20 rounded shadow-sm focus:ring-touhou-red focus:border-touhou-red dark:bg-stone-900 dark:border-stone-700 dark:text-stone-100 text-stone-900 bg-white"
                      placeholder="例如：博丽神社"
                    />
                  </div>
                  <div>
                    <label
                      class="block text-xs font-bold text-izakaya-wood/60 dark:text-stone-400 mb-1.5"
                      >初始最大生命值</label
                    >
                    <input
                      v-model.number="formData.initialMaxHp"
                      type="number"
                      class="w-full text-sm border-izakaya-wood/20 rounded shadow-sm focus:ring-touhou-red focus:border-touhou-red dark:bg-stone-900 dark:border-stone-700 dark:text-stone-100 text-stone-900 bg-white"
                    />
                  </div>
                  <div>
                    <label
                      class="block text-xs font-bold text-izakaya-wood/60 dark:text-stone-400 mb-1.5"
                      >初始战斗力</label
                    >
                    <select
                      v-model="formData.initialPower"
                      class="w-full text-sm border-izakaya-wood/20 rounded shadow-sm focus:ring-touhou-red focus:border-touhou-red dark:bg-stone-900 dark:border-stone-700 dark:text-stone-100 text-stone-900 bg-white"
                    >
                      <option
                        v-for="p in [
                          '∞',
                          'OMEGA',
                          'UX',
                          'EX',
                          'US',
                          'SSS',
                          'SS',
                          'S+',
                          'S',
                          'A+',
                          'A',
                          'B+',
                          'B',
                          'C+',
                          'C',
                          'D+',
                          'D',
                          'E+',
                          'E',
                          'F+',
                          'F',
                          'F-'
                        ]"
                        :key="p"
                        :value="p"
                      >
                        {{ p }}
                      </option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- Spell Card Config -->
              <div
                v-if="formData.type === 'spell_card'"
                class="p-5 bg-blue-50/80 dark:bg-blue-900/10 rounded-xl border border-blue-200 dark:border-blue-800 space-y-4"
              >
                <h3
                  class="text-sm font-bold text-blue-700 dark:text-blue-300 flex items-center gap-2"
                >
                  <span class="w-1 h-4 bg-blue-500 rounded-full"></span>
                  符卡属性配置
                </h3>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                  <div>
                    <label
                      class="block text-xs font-bold text-blue-900/60 dark:text-blue-300/60 mb-1.5"
                      >灵力消耗 (Cost)</label
                    >
                    <input
                      v-model.number="formData.cost"
                      type="number"
                      class="w-full text-sm border-blue-200 rounded shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-stone-900 dark:border-blue-800 dark:text-stone-100 text-stone-900 bg-white"
                      placeholder="如: 50"
                    />
                  </div>
                  <div>
                    <label
                      class="block text-xs font-bold text-blue-900/60 dark:text-blue-300/60 mb-1.5"
                      >伤害数值 (Damage)</label
                    >
                    <input
                      v-model.number="formData.damage"
                      type="number"
                      class="w-full text-sm border-blue-200 rounded shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-stone-900 dark:border-blue-800 dark:text-stone-100 text-stone-900 bg-white"
                      placeholder="如: 500"
                    />
                  </div>
                  <div>
                    <label
                      class="block text-xs font-bold text-blue-900/60 dark:text-blue-300/60 mb-1.5"
                      >符卡类型</label
                    >
                    <select
                      v-model="formData.damageType"
                      class="w-full text-sm border-blue-200 rounded shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-stone-900 dark:border-blue-800 dark:text-stone-100 text-stone-900 bg-white"
                    >
                      <option value="attack">攻击 (Attack)</option>
                      <option value="buff">强化 (Buff)</option>
                      <option value="debuff">减益 (Debuff)</option>
                      <option value="shield">护盾 (Shield)</option>
                      <option value="heal">治疗 (Heal)</option>
                    </select>
                  </div>
                  <div>
                    <label
                      class="block text-xs font-bold text-blue-900/60 dark:text-blue-300/60 mb-1.5"
                      >作用范围 (Scope)</label
                    >
                    <select
                      v-model="formData.scope"
                      class="w-full text-sm border-blue-200 rounded shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-stone-900 dark:border-blue-800 dark:text-stone-100 text-stone-900 bg-white"
                    >
                      <option value="single">单体 (Single)</option>
                      <option value="aoe">全体 (AOE)</option>
                    </select>
                  </div>
                </div>
                <div class="flex items-center gap-6 pt-2">
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      v-model="formData.isUltimate"
                      class="rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span class="text-xs font-bold text-blue-900/60 dark:text-blue-300/60"
                      >终极符卡 (Ultimate)</span
                    >
                  </label>
                  <div class="flex-1 flex items-center gap-2">
                    <label
                      class="text-xs font-bold text-blue-900/60 dark:text-blue-300/60 whitespace-nowrap"
                      >命中率 (Hit Rate):</label
                    >
                    <input
                      v-model.number="formData.hitRate"
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      class="flex-1 h-1.5 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <span class="text-xs font-mono text-blue-600 w-8">{{
                      formData.hitRate || 0
                    }}</span>
                  </div>
                </div>
              </div>

              <div>
                <label class="block text-sm font-bold text-izakaya-wood dark:text-stone-300 mb-2"
                  >条目内容 (Prompt Injection)</label
                >
                <p class="text-xs text-izakaya-wood/60 dark:text-stone-400 mb-2">
                  当触发关键词出现时，这段内容会被注入到 System Prompt 中。
                </p>
                <textarea
                  v-model="formData.description"
                  rows="8"
                  class="w-full border-izakaya-wood/20 rounded-lg shadow-sm focus:ring-touhou-red focus:border-touhou-red dark:bg-stone-800 dark:border-stone-700 dark:text-stone-100 text-stone-900 bg-white/80 font-mono text-sm custom-scrollbar"
                  placeholder="输入设定的详细描述..."
                ></textarea>
              </div>

              <div>
                <label class="block text-sm font-bold text-izakaya-wood dark:text-stone-300 mb-2"
                  >触发关键词 (Tags)</label
                >
                <p class="text-xs text-izakaya-wood/60 dark:text-stone-400 mb-2">
                  当用户输入或最近历史中包含这些词时，将自动注入该条目。
                </p>
                <div class="flex flex-wrap gap-2 mb-3">
                  <span
                    v-for="(tag, idx) in formData.tags"
                    :key="idx"
                    class="px-2 py-1 bg-stone-200 dark:bg-stone-700 rounded text-xs font-bold flex items-center gap-1 text-izakaya-wood dark:text-stone-300"
                  >
                    {{ tag }}
                    <button @click="removeTag(idx)" class="hover:text-red-500">
                      <X class="w-3 h-3" />
                    </button>
                  </span>
                </div>
                <div class="flex gap-2">
                  <input
                    v-model="tagInput"
                    @keydown.enter.prevent="addTag"
                    type="text"
                    placeholder="输入标签并回车 (如: 博丽神社, 灵梦)"
                    class="flex-1 border-izakaya-wood/20 rounded-lg shadow-sm focus:ring-touhou-red focus:border-touhou-red dark:bg-stone-800 dark:border-stone-700 dark:text-stone-100 text-stone-900 bg-white/80 text-sm"
                  />
                  <button
                    @click="addTag"
                    class="px-4 py-2 bg-stone-200 dark:bg-stone-700 rounded-lg hover:bg-stone-300 dark:hover:bg-stone-600 transition-colors"
                  >
                    <Plus class="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div
            v-else
            class="flex-1 flex items-center justify-center flex-col gap-4 text-izakaya-wood/30 dark:text-stone-600"
          >
            <div
              class="w-20 h-20 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center border-4 border-current"
            >
              <Folder class="w-10 h-10" />
            </div>
            <p class="font-display font-bold text-lg">选择或创建一个条目以开始编辑</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

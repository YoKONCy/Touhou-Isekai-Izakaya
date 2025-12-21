<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useCharacterStore } from '@/stores/character';
import { type CharacterCard } from '@/db';
import { Folder, FileText, Plus, Trash2, Save, X, Edit2 } from 'lucide-vue-next';
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
  
  cost: '',
  damage: '',
  damageType: ''
});

const tagInput = ref('');

// Computed
const categories = computed(() => ['全部', ...charStore.getCategories()]);

const filteredCharacters = computed(() => {
  if (selectedCategory.value === '全部') {
    return charStore.characters;
  }
  return charStore.characters.filter(c => (c.category || '未分类') === selectedCategory.value);
});

onMounted(async () => {
  await charStore.loadCharacters();
});

// Actions
function handleSelectChar(char: CharacterCard) {
  selectedCharId.value = char.uuid;
  formData.value = { ...char };
  isEditing.value = true;
}

function handleNewChar() {
  selectedCharId.value = null;
  formData.value = {
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
}

async function handleSave() {
  if (!formData.value.name) return;

  if (selectedCharId.value) {
    await charStore.updateCharacter(selectedCharId.value, formData.value);
  } else {
    const newChar = await charStore.addCharacter(formData.value as any);
    selectedCharId.value = newChar.uuid;
  }
  // isEditing.value = false; // Keep editing
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
  
  if (await confirm(`确定要删除文件夹 "${selectedCategory.value}" 吗？\n其中的条目将被移动到 "未分类" 文件夹。`, { destructive: true })) {
    await charStore.deleteCategory(selectedCategory.value);
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
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/80 backdrop-blur-sm p-4 animate-fade-in font-sans">
    <div class="relative bg-stone-50 dark:bg-stone-900 w-full max-w-6xl h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden border-2 border-izakaya-wood/30">
      <!-- Texture Overlay -->
      <div class="absolute inset-0 pointer-events-none opacity-40 bg-texture-rice-paper z-0"></div>
      
      <!-- Header -->
      <div class="relative z-10 flex items-center justify-between p-4 border-b border-izakaya-wood/10 bg-touhou-red text-white shadow-md">
        <h2 class="text-xl font-bold font-display flex items-center gap-3 tracking-wide">
          <FileText class="w-6 h-6" />
          <span>条目编辑器 (Lorebook)</span>
        </h2>
        <div class="flex items-center gap-2">
            <button @click="$emit('close')" class="p-1.5 hover:bg-white/20 rounded-full text-white transition-colors">
                <X class="w-6 h-6" />
            </button>
        </div>
      </div>

      <div class="relative z-10 flex-1 flex overflow-hidden">
        
        <!-- Left: Category & List -->
        <div class="w-72 border-r border-izakaya-wood/10 flex flex-col bg-stone-100/80 dark:bg-stone-800/80 backdrop-blur-sm">
          
          <!-- Categories -->
          <div class="p-3 border-b border-izakaya-wood/10 overflow-x-auto flex gap-2 custom-scrollbar">
            <button 
              v-for="cat in categories" 
              :key="cat"
              @click="selectedCategory = cat"
              class="px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-all border border-transparent"
              :class="selectedCategory === cat ? 'bg-touhou-red text-white shadow-md' : 'bg-stone-200 dark:bg-stone-700 text-izakaya-wood dark:text-stone-300 hover:border-touhou-red/30'"
            >
              {{ cat }}
            </button>
          </div>
          
          <!-- Category Actions (Only show for custom categories) -->
          <div 
             v-if="selectedCategory !== '全部' && selectedCategory !== '未分类'" 
             class="px-4 py-3 border-b border-izakaya-wood/10 bg-stone-200/50 dark:bg-stone-700/50 flex items-center justify-between"
          >
             <span class="text-sm text-izakaya-wood dark:text-stone-200 font-bold font-display">{{ selectedCategory }}</span>
             <div class="flex items-center gap-1">
               <button @click="handleRenameCategory" class="p-1.5 hover:bg-white dark:hover:bg-stone-600 rounded text-izakaya-wood dark:text-stone-300 transition-colors" title="重命名文件夹">
                 <Edit2 class="w-3.5 h-3.5" />
               </button>
               <button @click="handleDeleteCategory" class="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-touhou-red transition-colors" title="删除文件夹">
                 <Trash2 class="w-3.5 h-3.5" />
               </button>
             </div>
          </div>

          <!-- Character List -->
          <div class="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
            <button 
              v-for="char in filteredCharacters" 
              :key="char.uuid"
              @click="handleSelectChar(char)"
              class="w-full text-left px-4 py-3 rounded-lg text-sm flex items-center gap-3 transition-all border border-transparent group"
              :class="selectedCharId === char.uuid 
                ? 'bg-red-50 dark:bg-red-900/20 text-touhou-red border-touhou-red/30 shadow-sm' 
                : 'hover:bg-white dark:hover:bg-stone-700 text-izakaya-wood dark:text-stone-300 hover:border-izakaya-wood/10'"
            >
              <div class="w-2.5 h-2.5 rounded-full transition-colors" :class="selectedCharId === char.uuid ? 'bg-touhou-red scale-110' : 'bg-stone-300 dark:bg-stone-600 group-hover:bg-touhou-red/50'"></div>
              <span class="font-bold truncate">{{ char.name }}</span>
            </button>

            <button 
              @click="handleNewChar"
              class="w-full flex items-center justify-center gap-2 px-4 py-3 mt-4 border-2 border-dashed border-izakaya-wood/20 hover:border-touhou-red/50 rounded-lg text-izakaya-wood/60 dark:text-stone-400 hover:text-touhou-red hover:bg-touhou-red/5 transition-all text-sm font-bold"
            >
              <Plus class="w-4 h-4" /> 新建条目
            </button>
          </div>
        </div>

        <!-- Right: Editor -->
        <div class="flex-1 flex flex-col bg-white/60 dark:bg-stone-900/60 backdrop-blur-sm">
          <div v-if="isEditing" class="flex-1 flex flex-col h-full">
            <!-- Toolbar -->
            <div class="h-16 border-b border-izakaya-wood/10 flex items-center justify-between px-6 bg-stone-50/80 dark:bg-stone-800/80">
              <span class="text-sm text-izakaya-wood/70 dark:text-stone-400 font-serif flex items-center gap-2">
                <Edit2 class="w-4 h-4" />
                正在编辑: <span class="font-bold text-izakaya-wood dark:text-stone-200">{{ formData.name }}</span>
              </span>
              <div class="flex items-center gap-3">
                <button @click="handleDelete" class="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="删除">
                  <Trash2 class="w-5 h-5" />
                </button>
                <button @click="handleSave" class="px-5 py-2 bg-touhou-red hover:bg-red-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 shadow hover:shadow-lg transition-all transform hover:-translate-y-0.5">
                  <Save class="w-4 h-4" /> 保存
                </button>
              </div>
            </div>

            <!-- Form -->
            <div class="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
              
              <!-- Type Selector -->
              <div>
                 <label class="block text-sm font-bold text-izakaya-wood dark:text-stone-300 mb-2">条目类型</label>
                 <div class="flex rounded-lg shadow-sm overflow-hidden border border-izakaya-wood/20">
                    <button 
                      v-for="t in ['character', 'spell_card', 'other']" 
                      :key="t"
                      @click="formData.type = t as any"
                      class="flex-1 px-4 py-2.5 text-sm font-bold transition-colors focus:outline-none"
                      :class="formData.type === t 
                        ? 'bg-touhou-red text-white' 
                        : 'bg-white dark:bg-stone-800 text-izakaya-wood dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 border-r last:border-r-0 border-izakaya-wood/10'"
                    >
                      {{ t === 'character' ? '角色 (Character)' : t === 'spell_card' ? '符卡 (Spell Card)' : '其他 (Other)' }}
                    </button>
                 </div>
              </div>

              <div class="grid grid-cols-3 gap-6">
                <div>
                  <label class="block text-sm font-bold text-izakaya-wood dark:text-stone-300 mb-2">条目名称</label>
                  <input v-model="formData.name" type="text" autofocus class="w-full border-izakaya-wood/20 rounded-lg shadow-sm focus:ring-touhou-red focus:border-touhou-red dark:bg-stone-800 dark:border-stone-700 dark:text-stone-100 text-stone-900 bg-white/80 transition-all" placeholder="例如：博丽神社">
                </div>
                <div>
                  <label class="block text-sm font-bold text-izakaya-wood dark:text-stone-300 mb-2">分类 (文件夹)</label>
                  <div class="relative">
                    <input 
                      v-model="formData.category" 
                      type="text" 
                      list="category-list" 
                      class="w-full border-izakaya-wood/20 rounded-lg shadow-sm focus:ring-touhou-red focus:border-touhou-red dark:bg-stone-800 dark:border-stone-700 dark:text-stone-100 text-stone-900 bg-white/80 transition-all"
                      placeholder="选择或输入新分类..."
                    >
                    <datalist id="category-list">
                      <option v-for="cat in charStore.getCategories()" :key="cat" :value="cat"></option>
                    </datalist>
                  </div>
                </div>
                
                <!-- Character Specific: Gender -->
                <div v-if="formData.type === 'character' || !formData.type">
                  <label class="block text-sm font-bold text-izakaya-wood dark:text-stone-300 mb-2">性别</label>
                  <select v-model="formData.gender" class="w-full border-izakaya-wood/20 rounded-lg shadow-sm focus:ring-touhou-red focus:border-touhou-red dark:bg-stone-800 dark:border-stone-700 dark:text-stone-100 text-stone-900 bg-white/80 transition-all">
                     <option value="female">女性</option>
                     <option value="male">男性</option>
                     <option value="other">其他</option>
                  </select>
                </div>
              </div>

              <!-- Character Initial Stats -->
              <div v-if="formData.type === 'character' || !formData.type" class="p-5 bg-stone-100/80 dark:bg-stone-800/50 rounded-xl border border-izakaya-wood/10 space-y-4">
                 <h3 class="text-sm font-bold text-izakaya-wood dark:text-stone-200 flex items-center gap-2">
                    <span class="w-1 h-4 bg-touhou-red rounded-full"></span>
                    初始变量配置 (初始化时写入)
                 </h3>
                 <div class="grid grid-cols-2 gap-6">
                    <div>
                       <label class="block text-xs font-bold text-izakaya-wood/60 dark:text-stone-400 mb-1.5">UUID (对应 npcId)</label>
                       <div class="flex gap-2">
                          <input :value="selectedCharId" type="text" readonly class="flex-1 text-xs bg-white dark:bg-stone-900 border border-izakaya-wood/10 rounded px-2 py-1.5 font-mono text-izakaya-wood/70 dark:text-stone-400">
                          <button class="text-xs text-blue-500 hover:text-blue-600 font-bold px-2" @click="copyToClipboard(selectedCharId || '')">复制</button>
                       </div>
                    </div>
                    <div>
                       <label class="block text-xs font-bold text-izakaya-wood/60 dark:text-stone-400 mb-1.5">初始住所</label>
                       <input v-model="formData.initialResidence" type="text" class="w-full text-sm border-izakaya-wood/20 rounded shadow-sm focus:ring-touhou-red focus:border-touhou-red dark:bg-stone-900 dark:border-stone-700 dark:text-stone-100 text-stone-900 bg-white" placeholder="例如：博丽神社">
                    </div>
                    <div>
                       <label class="block text-xs font-bold text-izakaya-wood/60 dark:text-stone-400 mb-1.5">初始最大生命值</label>
                       <input v-model.number="formData.initialMaxHp" type="number" class="w-full text-sm border-izakaya-wood/20 rounded shadow-sm focus:ring-touhou-red focus:border-touhou-red dark:bg-stone-900 dark:border-stone-700 dark:text-stone-100 text-stone-900 bg-white">
                    </div>
                    <div>
                       <label class="block text-xs font-bold text-izakaya-wood/60 dark:text-stone-400 mb-1.5">初始战斗力</label>
                       <select v-model="formData.initialPower" class="w-full text-sm border-izakaya-wood/20 rounded shadow-sm focus:ring-touhou-red focus:border-touhou-red dark:bg-stone-900 dark:border-stone-700 dark:text-stone-100 text-stone-900 bg-white">
                          <option v-for="p in ['∞', 'OMEGA', 'UX', 'EX', 'US', 'SSS', 'SS', 'S+', 'S', 'A+', 'A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'E+', 'E', 'F+', 'F', 'F-']" :key="p" :value="p">{{ p }}</option>
                       </select>
                    </div>
                 </div>
              </div>

              <!-- Spell Card Config -->
              <div v-if="formData.type === 'spell_card'" class="p-5 bg-blue-50/80 dark:bg-blue-900/10 rounded-xl border border-blue-200 dark:border-blue-800 space-y-4">
                 <h3 class="text-sm font-bold text-blue-700 dark:text-blue-300 flex items-center gap-2">
                    <span class="w-1 h-4 bg-blue-500 rounded-full"></span>
                    符卡属性配置
                 </h3>
                 <div class="grid grid-cols-3 gap-6">
                    <div>
                       <label class="block text-xs font-bold text-blue-900/60 dark:text-blue-300/60 mb-1.5">释放消耗</label>
                       <input v-model="formData.cost" type="text" class="w-full text-sm border-blue-200 rounded shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-stone-900 dark:border-blue-800 dark:text-stone-100 text-stone-900 bg-white" placeholder="如: 50 MP">
                    </div>
                    <div>
                       <label class="block text-xs font-bold text-blue-900/60 dark:text-blue-300/60 mb-1.5">伤害数值</label>
                       <input v-model="formData.damage" type="text" class="w-full text-sm border-blue-200 rounded shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-stone-900 dark:border-blue-800 dark:text-stone-100 text-stone-900 bg-white" placeholder="如: 500">
                    </div>
                    <div>
                       <label class="block text-xs font-bold text-blue-900/60 dark:text-blue-300/60 mb-1.5">伤害类型</label>
                       <input v-model="formData.damageType" type="text" class="w-full text-sm border-blue-200 rounded shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-stone-900 dark:border-blue-800 dark:text-stone-100 text-stone-900 bg-white" placeholder="如: 魔法">
                    </div>
                 </div>
              </div>

              <div>
                <label class="block text-sm font-bold text-izakaya-wood dark:text-stone-300 mb-2">条目内容 (Prompt Injection)</label>
                <p class="text-xs text-izakaya-wood/60 dark:text-stone-400 mb-2">当触发关键词出现时，这段内容会被注入到 System Prompt 中。</p>
                <textarea v-model="formData.description" rows="8" class="w-full border-izakaya-wood/20 rounded-lg shadow-sm focus:ring-touhou-red focus:border-touhou-red dark:bg-stone-800 dark:border-stone-700 dark:text-stone-100 text-stone-900 bg-white/80 font-mono text-sm custom-scrollbar" placeholder="输入设定的详细描述..."></textarea>
              </div>

              <div>
                <label class="block text-sm font-bold text-izakaya-wood dark:text-stone-300 mb-2">触发关键词 (Tags)</label>
                <p class="text-xs text-izakaya-wood/60 dark:text-stone-400 mb-2">当用户输入或最近历史中包含这些词时，将自动注入该条目。</p>
                <div class="flex flex-wrap gap-2 mb-3">
                  <span v-for="(tag, idx) in formData.tags" :key="idx" class="px-2 py-1 bg-stone-200 dark:bg-stone-700 rounded text-xs font-bold flex items-center gap-1 text-izakaya-wood dark:text-stone-300">
                    {{ tag }}
                    <button @click="removeTag(idx)" class="hover:text-red-500"><X class="w-3 h-3" /></button>
                  </span>
                </div>
                <div class="flex gap-2">
                  <input 
                    v-model="tagInput" 
                    @keydown.enter.prevent="addTag"
                    type="text" 
                    placeholder="输入标签并回车 (如: 博丽神社, 灵梦)" 
                    class="flex-1 border-izakaya-wood/20 rounded-lg shadow-sm focus:ring-touhou-red focus:border-touhou-red dark:bg-stone-800 dark:border-stone-700 dark:text-stone-100 text-stone-900 bg-white/80 text-sm"
                  >
                  <button @click="addTag" class="px-4 py-2 bg-stone-200 dark:bg-stone-700 rounded-lg hover:bg-stone-300 dark:hover:bg-stone-600 transition-colors">
                    <Plus class="w-4 h-4" />
                  </button>
                </div>
              </div>

            </div>
          </div>
          
          <div v-else class="flex-1 flex items-center justify-center flex-col gap-4 text-izakaya-wood/30 dark:text-stone-600">
            <div class="w-20 h-20 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center border-4 border-current">
              <Folder class="w-10 h-10" />
            </div>
            <p class="font-display font-bold text-lg">选择或创建一个条目以开始编辑</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

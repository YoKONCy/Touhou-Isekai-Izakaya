<script setup lang="ts">
import { ref, watch } from 'vue';
import { db, type MemoryEntry } from '@/db';
import { useSaveStore } from '@/stores/save';
import { X, Search, Trash2, Calendar, FileText, Activity, Database, Users, Brain, Edit2, Save, Clock, MapPin } from 'lucide-vue-next';
import _ from 'lodash';

const props = defineProps<{
  isOpen: boolean
}>();

const emit = defineEmits(['close']);

const saveStore = useSaveStore();
const memories = ref<MemoryEntry[]>([]);
const searchQuery = ref('');
const filterType = ref<string>('all');

async function loadMemories() {
  if (!saveStore.currentSaveId) return;
  
  let collection = db.memories
    .where('saveSlotId')
    .equals(saveStore.currentSaveId)
    .reverse(); // Newest first
    
  let items = await collection.toArray();
  
  if (filterType.value !== 'all') {
    items = items.filter(m => m.type === filterType.value);
  }
  
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    items = items.filter(m => 
      String(m.content).toLowerCase().includes(q) ||
      m.tags.some(t => t.toLowerCase().includes(q))
    );
  }
  
  memories.value = items;
}

const isEditing = ref(false);
const editingMemory = ref<MemoryEntry | null>(null);
const editingContentData = ref<Record<string, any>>({});
const editingRawContent = ref('');
const editingMode = ref<'json' | 'text'>('text');
const newTagInput = ref('');

function addTag() {
  if (!newTagInput.value.trim() || !editingMemory.value) return;
  if (!editingMemory.value.tags) editingMemory.value.tags = [];
  editingMemory.value.tags.push(newTagInput.value.trim());
  newTagInput.value = '';
}

function removeTag(index: number) {
  if (!editingMemory.value || !editingMemory.value.tags) return;
  editingMemory.value.tags.splice(index, 1);
}

function openEditModal(mem: MemoryEntry) {
  editingMemory.value = _.cloneDeep(mem);
  
  // Try parsing content
  try {
    const parsed = JSON.parse(mem.content);
    if (typeof parsed === 'object' && parsed !== null) {
      editingContentData.value = parsed;
      editingMode.value = 'json';
    } else {
      throw new Error('Not an object');
    }
  } catch (e) {
    editingRawContent.value = mem.content;
    editingMode.value = 'text';
  }
  
  isEditing.value = true;
}

async function saveEdit() {
  if (!editingMemory.value) return;
  
  try {
    let newContent = '';
    if (editingMode.value === 'json') {
      newContent = JSON.stringify(editingContentData.value);
    } else {
      newContent = editingRawContent.value;
    }
    
    // Update DB
    await db.memories.update(editingMemory.value.id, {
      content: newContent,
      gameDate: editingMemory.value.gameDate,
      gameTime: editingMemory.value.gameTime,
      location: editingMemory.value.location,
      tags: editingMemory.value.tags
    });
    
    isEditing.value = false;
    editingMemory.value = null;
    await loadMemories();
    
  } catch (e) {
    alert('保存失败: ' + e);
  }
}

watch(() => props.isOpen, (newVal) => {
  if (newVal) loadMemories();
});

watch([searchQuery, filterType], () => {
  loadMemories();
});

async function deleteMemory(id: number) {
  if (!window.confirm('确定要删除这条记忆吗？')) return;
  await db.memories.delete(id);
  await loadMemories();
}

function formatContent(content: any) {
  try {
    const str = typeof content === 'string' ? content : JSON.stringify(content);
    if (str.trim().startsWith('{') || str.trim().startsWith('[')) {
      const obj = JSON.parse(str);
      // Format Alliance/Intelligence
      if (obj.name && obj.content) {
        let res = `【${obj.name}】\n${obj.content}`;
        if (obj.related_characters && Array.isArray(obj.related_characters)) {
          res += `\n相关人物: ${obj.related_characters.join(', ')}`;
        }
        if (obj.established_time) res += `\n成立时间: ${obj.established_time}`;
        if (obj.acquired_time) res += `\n获取时间: ${obj.acquired_time}`;
        return res;
      }
      return JSON.stringify(obj, null, 2);
    }
    return str;
  } catch (e) {
    return typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  }
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'summary': return FileText;
    case 'variable_change': return Activity;
    case 'facility': return Database;
    case 'alliance': return Users;
    case 'intelligence': return Brain;
    default: return FileText;
  }
}

function getTypeLabel(type: string) {
  switch (type) {
    case 'summary': return '摘要';
    case 'variable_change': return '变量';
    case 'facility': return '设施';
    case 'alliance': return '联盟';
    case 'intelligence': return '情报';
    default: return type;
  }
}
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-izakaya-wood/60 backdrop-blur-sm animate-in fade-in duration-200">
    <div class="bg-izakaya-paper w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden rounded-xl shadow-2xl border-2 border-touhou-red/30 relative">
      <!-- Texture -->
      <div class="absolute inset-0 pointer-events-none opacity-10 bg-texture-rice-paper"></div>
      
      <!-- Header -->
      <div class="p-4 border-b border-izakaya-wood/10 flex items-center justify-between bg-touhou-red/5 relative z-10">
        <h2 class="text-xl font-bold font-display flex items-center gap-2 text-izakaya-wood">
          <Database class="w-6 h-6 text-touhou-red" />
          记忆库 (Memory Bank)
        </h2>
        <button @click="$emit('close')" class="p-1.5 hover:bg-white/50 text-izakaya-wood/50 hover:text-touhou-red rounded-full transition-colors">
          <X class="w-6 h-6" />
        </button>
      </div>

      <!-- Toolbar -->
      <div class="p-3 border-b border-izakaya-wood/10 flex gap-3 bg-white/40 relative z-10">
        <div class="relative flex-1 group">
          <Search class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-izakaya-wood/40 group-focus-within:text-touhou-red transition-colors" />
          <input 
            v-model="searchQuery"
            type="text" 
            placeholder="搜索记忆内容、标签..." 
            class="w-full pl-9 pr-4 py-2 text-sm border border-izakaya-wood/20 rounded-md bg-white/50 focus:outline-none focus:ring-2 focus:ring-touhou-red/20 focus:border-touhou-red/50 transition-all placeholder:text-izakaya-wood/30 text-izakaya-wood"
          >
        </div>
        <select v-model="filterType" class="px-3 py-2 text-sm border border-izakaya-wood/20 rounded-md bg-white/50 focus:outline-none focus:ring-2 focus:ring-touhou-red/20 focus:border-touhou-red/50 transition-all text-izakaya-wood cursor-pointer hover:bg-white/80">
          <option value="all">全部类型</option>
          <option value="summary">剧情摘要</option>
          <option value="facility">设施变动</option>
          <option value="alliance">长期联盟</option>
          <option value="intelligence">已知情报</option>
        </select>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-4 bg-white/20 space-y-3 relative z-10 custom-scrollbar">
        <div v-if="memories.length === 0" class="text-center py-10 text-izakaya-wood/40 flex flex-col items-center gap-2">
          <Database class="w-12 h-12 opacity-20" />
          <span>暂无相关记忆</span>
        </div>

        <div v-for="mem in memories" :key="mem.id" class="bg-white/60 p-4 rounded-lg border border-izakaya-wood/10 shadow-sm hover:shadow-md hover:border-touhou-red/20 transition-all relative group animate-in slide-in-from-bottom-2 duration-300">
          
          <div class="flex items-start justify-between mb-2 pr-16">
            <div class="flex items-center gap-2">
              <span class="bg-izakaya-wood/5 text-xs px-2 py-1 rounded font-mono text-izakaya-wood/60 border border-izakaya-wood/5">Turn {{ mem.turnCount }}</span>
              <span :class="['text-xs px-2 py-1 rounded flex items-center gap-1 border', 
                mem.type === 'summary' ? 'bg-blue-50 text-blue-700 border-blue-100' : 
                mem.type === 'variable_change' ? 'bg-purple-50 text-purple-700 border-purple-100' : 
                mem.type === 'alliance' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                mem.type === 'intelligence' ? 'bg-cyan-50 text-cyan-700 border-cyan-100' :
                'bg-gray-50 text-gray-700 border-gray-100'
              ]">
                <component :is="getTypeIcon(mem.type)" class="w-3 h-3" />
                {{ getTypeLabel(mem.type) }}
              </span>
            </div>
          </div>

          <div v-if="mem.gameDate || mem.gameTime || mem.location" class="flex flex-wrap gap-3 text-xs text-izakaya-wood/50 mb-3 font-serif pl-1 bg-izakaya-wood/5 p-1.5 rounded w-fit">
             <span v-if="mem.gameDate" class="flex items-center gap-1" title="游戏日期">
                <Calendar class="w-3 h-3 opacity-70" />
                {{ mem.gameDate }}
             </span>
             <span v-if="mem.gameTime" class="flex items-center gap-1" title="游戏时间">
                <Clock class="w-3 h-3 opacity-70" />
                {{ mem.gameTime }}
             </span>
             <span v-if="mem.location" class="flex items-center gap-1" title="地点">
                <MapPin class="w-3 h-3 opacity-70" />
                {{ mem.location }}
             </span>
          </div>

          <div class="text-sm text-izakaya-wood whitespace-pre-wrap font-sans leading-relaxed pl-1">
            {{ formatContent(mem.content) }}
          </div>

          <div class="mt-3 flex items-end justify-between gap-4">
            <div class="flex flex-wrap gap-2">
              <span v-for="tag in mem.tags" :key="tag" class="text-[10px] bg-izakaya-wood/5 text-izakaya-wood/60 px-1.5 py-0.5 rounded border border-izakaya-wood/10 hover:bg-izakaya-wood/10 transition-colors cursor-default">
                #{{ tag }}
              </span>
              <span v-for="entity in mem.related_entities" :key="entity" class="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded border border-green-100 hover:bg-green-100 transition-colors cursor-default">
                @{{ entity }}
              </span>
            </div>
            <span class="text-xs text-izakaya-wood/40 font-mono shrink-0">{{ new Date(mem.createdAt).toLocaleString() }}</span>
          </div>

          <!-- Actions -->
          <div class="absolute top-2 right-2 flex items-center gap-1">
             <button 
              @click="openEditModal(mem)"
              class="p-1.5 text-izakaya-wood/60 bg-white/40 hover:bg-white hover:text-blue-600 shadow-sm hover:shadow rounded-full transition-all border border-transparent hover:border-blue-100"
              title="编辑记忆"
            >
              <Edit2 class="w-4 h-4" />
            </button>
            <button 
              @click="deleteMemory(mem.id)"
              class="p-1.5 text-izakaya-wood/60 bg-white/40 hover:bg-white hover:text-touhou-red shadow-sm hover:shadow rounded-full transition-all border border-transparent hover:border-red-100"
              title="删除记忆"
            >
              <Trash2 class="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>

    </div>

    <!-- Edit Modal -->
    <div v-if="isEditing && editingMemory" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" @click.self="isEditing = false">
      <div class="bg-izakaya-paper w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl shadow-2xl border border-izakaya-wood/20 overflow-hidden animate-in zoom-in-95 duration-200">
         <div class="p-4 border-b border-izakaya-wood/10 bg-white/50 flex justify-between items-center">
            <h3 class="font-bold text-lg text-izakaya-wood flex items-center gap-2">
              <Edit2 class="w-5 h-5 text-blue-600" />
              编辑记忆
            </h3>
            <button @click="isEditing = false" class="text-izakaya-wood/40 hover:text-touhou-red">
              <X class="w-5 h-5" />
            </button>
         </div>

         <div class="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-white/30">
            
            <!-- Metadata Editing -->
            <div class="grid grid-cols-2 gap-4">
               <div class="space-y-1">
                 <label class="text-xs font-bold text-izakaya-wood/60 uppercase tracking-wider">游戏日期</label>
                 <input v-model="editingMemory.gameDate" type="text" class="w-full px-3 py-2 bg-white/60 border border-izakaya-wood/10 rounded focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none text-sm font-serif text-izakaya-wood" placeholder="例如：纪元123年1月1日">
               </div>
               <div class="space-y-1">
                 <label class="text-xs font-bold text-izakaya-wood/60 uppercase tracking-wider">游戏时间</label>
                 <input v-model="editingMemory.gameTime" type="text" class="w-full px-3 py-2 bg-white/60 border border-izakaya-wood/10 rounded focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none text-sm font-serif text-izakaya-wood" placeholder="例如：12:00">
               </div>
               <div class="col-span-2 space-y-1">
                 <label class="text-xs font-bold text-izakaya-wood/60 uppercase tracking-wider">地点</label>
                 <input v-model="editingMemory.location" type="text" class="w-full px-3 py-2 bg-white/60 border border-izakaya-wood/10 rounded focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none text-sm font-serif text-izakaya-wood" placeholder="例如：博丽神社">
               </div>
            </div>

            <!-- Tags Editing -->
            <div class="space-y-1 pt-2">
              <label class="text-xs font-bold text-izakaya-wood/60 uppercase tracking-wider">标签 (Tags)</label>
              <div class="flex flex-wrap gap-2 mb-2 p-2 bg-white/60 border border-izakaya-wood/10 rounded min-h-[42px] focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400 transition-all">
                <span v-for="(tag, index) in editingMemory.tags" :key="index" class="text-xs bg-izakaya-wood/10 text-izakaya-wood px-2 py-1 rounded flex items-center gap-1 border border-izakaya-wood/5 animate-in zoom-in duration-200">
                  #{{ tag }}
                  <button @click="removeTag(index)" class="hover:text-red-500 hover:bg-red-100 rounded-full p-0.5 transition-colors ml-0.5">
                    <X class="w-3 h-3" />
                  </button>
                </span>
                <input 
                  v-model="newTagInput"
                  @keydown.enter.prevent="addTag"
                  @blur="addTag"
                  type="text" 
                  class="bg-transparent border-none outline-none text-sm text-izakaya-wood min-w-[60px] flex-1 placeholder:text-izakaya-wood/30"
                  placeholder="添加标签..."
                >
              </div>
            </div>

            <!-- Content Editing -->
            <div class="space-y-3 pt-4 border-t border-izakaya-wood/10">
               <div class="flex items-center justify-between">
                 <label class="text-xs font-bold text-izakaya-wood/60 uppercase tracking-wider">内容详情</label>
                 <div class="flex bg-izakaya-wood/5 rounded p-0.5 text-xs">
                    <button 
                      @click="editingMode = 'json'" 
                      :class="['px-3 py-1 rounded transition-all', editingMode === 'json' ? 'bg-white shadow text-blue-600 font-bold' : 'text-izakaya-wood/50 hover:text-izakaya-wood/80']"
                      :disabled="typeof editingContentData !== 'object'"
                    >
                      字段模式
                    </button>
                    <button 
                      @click="editingMode = 'text'"
                      :class="['px-3 py-1 rounded transition-all', editingMode === 'text' ? 'bg-white shadow text-blue-600 font-bold' : 'text-izakaya-wood/50 hover:text-izakaya-wood/80']"
                    >
                      源文本模式
                    </button>
                 </div>
               </div>

               <div v-if="editingMode === 'json'" class="space-y-4">
                  <div v-for="(val, key) in editingContentData" :key="key" class="space-y-1">
                     <label class="text-xs text-izakaya-wood/50 font-mono">{{ key }}</label>
                     <textarea 
                        v-if="typeof val === 'string'"
                        v-model="editingContentData[key]" 
                        rows="2"
                        class="w-full px-3 py-2 bg-white/60 border border-izakaya-wood/10 rounded focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none text-sm text-izakaya-wood"
                     ></textarea>
                     <div v-else class="text-xs text-izakaya-wood/40 italic px-3 py-2 bg-black/5 rounded">
                       复杂对象，请切换到源文本模式编辑
                     </div>
                  </div>
               </div>
               
               <textarea 
                  v-else
                  v-model="editingRawContent"
                  rows="10"
                  class="w-full px-3 py-3 bg-white/60 border border-izakaya-wood/10 rounded focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none text-sm font-mono text-izakaya-wood leading-relaxed"
                  placeholder="输入记忆内容..."
               ></textarea>
            </div>

         </div>

         <div class="p-4 border-t border-izakaya-wood/10 bg-white/50 flex justify-end gap-3">
            <button @click="isEditing = false" class="px-4 py-2 text-sm text-izakaya-wood/60 hover:bg-izakaya-wood/5 rounded transition-colors">取消</button>
            <button @click="saveEdit" class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-200 rounded transition-all flex items-center gap-2">
              <Save class="w-4 h-4" />
              保存修改
            </button>
         </div>
      </div>
    </div>
  </div>
</template>
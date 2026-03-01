<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { type ChatMessage } from '@/types/db';
import { User, Bot, Trash2, Bug, Copy, Edit, MoreVertical, Terminal, X, RefreshCw, ChevronDown, ChevronRight } from 'lucide-vue-next';
import { useChatStore } from '@/stores/chat';
import { useGameStore } from '@/stores/game';
import { useConfirm } from '@/utils/confirm';
import { useToastStore } from '@/stores/toast';
import { parseMarkdown } from '@/utils/markdown';
import { memoryService } from '@/services/memory';

const props = defineProps<{
  message: ChatMessage;
}>();

const chatStore = useChatStore();
const gameStore = useGameStore();
const { confirm } = useConfirm();
const toastStore = useToastStore();
const showDebug = ref(false);
const isEditing = ref(false);
const isRegenerating = ref(false);
const editContent = ref('');
const showActionMenu = ref(false);
const closeMenuTimer = ref<number | null>(null);
const isTouchDevice = ref(false);

// 调试面板展开状态
const expandedSections = ref({
  input: false,
  thinking: true, // 默认展开思维链
  output: false,
  illustration: false
});

function toggleSection(section: keyof typeof expandedSections.value) {
  console.log('[ChatBubble] Toggling section:', section, 'Current state:', expandedSections.value[section]);
  expandedSections.value[section] = !expandedSections.value[section];
}

// 获取思维链内容，优先使用 thought_content
const logicThinkingContent = computed(() => {
  return props.message.thought_content || props.message.debugLog?.logicThinking || '';
});

onMounted(() => {
  isTouchDevice.value = window.matchMedia('(pointer: coarse)').matches;
  // 监听外部点击以关闭菜单
  document.addEventListener('click', closeMenuOnOutsideClick);
});

onUnmounted(() => {
  document.removeEventListener('click', closeMenuOnOutsideClick);
});

function closeMenuOnOutsideClick() {
  if (showActionMenu.value) {
    showActionMenu.value = false;
  }
}

function handleMouseEnterMenu() {
  if (isTouchDevice.value) return; // 触摸设备忽略悬停
  if (closeMenuTimer.value) {
    clearTimeout(closeMenuTimer.value);
    closeMenuTimer.value = null;
  }
  showActionMenu.value = true;
}

function handleMouseLeaveMenu() {
  if (isTouchDevice.value) return; // 触摸设备忽略悬停
  closeMenuTimer.value = window.setTimeout(() => {
    showActionMenu.value = false;
  }, 150);
}

function toggleActionMenu(e: Event) {
  e.stopPropagation();
  showActionMenu.value = !showActionMenu.value;
}

const isUser = computed(() => props.message.role === 'user');
const isSystem = computed(() => props.message.role === 'system');

const renderedContent = computed(() => {
  if (!props.message.content) return '';
  return parseMarkdown(props.message.content);
});

const hasDebugLog = computed(() => {
  const hasLog = !!props.message.debugLog || !!props.message.thought_content;
  return hasLog;
});

// Watch for debug log changes to ensure reactivity
watch(() => props.message.debugLog, (newVal) => {
  if (newVal) {
    // console.log('[ChatBubble] Debug log received for msg:', props.message.id);
  }
}, { deep: true });

async function handleCopy() {
  try {
    await navigator.clipboard.writeText(props.message.content);
    toastStore.addToast('内容已复制到剪贴板', 'success');
  } catch (err) {
    console.error('复制失败:', err);
    toastStore.addToast('复制失败', 'error');
  }
}

function handleEdit() {
  isEditing.value = true;
  editContent.value = props.message.content;
}

async function handleSaveEdit() {
  if (await confirm('确定要修改这条消息吗？这将影响后续的对话历史。')) {
    await chatStore.updateMessage(props.message.id, { content: editContent.value });
    isEditing.value = false;
    toastStore.addToast('消息已修改', 'success');
  }
}

function handleCancelEdit() {
  isEditing.value = false;
  editContent.value = '';
}

async function handleDelete() {
  if (await confirm('确定要删除本轮及之后的所有对话吗？（将删除此轮及后续所有消息，并回滚状态）', { destructive: true })) {
    chatStore.deleteTurn(props.message.id);
  }
}

async function handleRegenerateMemory() {
  if (isRegenerating.value) return;
  
  if (await confirm('确定要重新生成本轮记忆吗？这将再次调用 AI 进行总结，并覆盖已有的记忆条目。')) {
    try {
      isRegenerating.value = true;
      await memoryService.retryExtraction(props.message.id);
      toastStore.addToast('记忆已成功重新生成', 'success');
      showActionMenu.value = false;
    } catch (err: any) {
      console.error('重新生成记忆失败:', err);
      toastStore.addToast(`生成失败: ${err.message}`, 'error');
    } finally {
      isRegenerating.value = false;
    }
  }
}
</script>

<template>
  <div 
    :id="`msg-${message.id}`"
    class="flex gap-4 mb-6 group/message transition-all duration-300" 
    :class="{ 'flex-row-reverse': isUser, 'opacity-75 hover:opacity-100': isSystem }"
  >
    <!-- Avatar -->
    <div class="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center shadow-floating border-2 border-white/50 relative overflow-hidden transition-transform duration-300 group-hover/message:scale-105 group-hover/message:rotate-3 z-10"
      :class="isUser ? 'bg-izakaya-wood-light text-white' : (isSystem ? 'bg-izakaya-wood/20 text-izakaya-wood' : 'bg-touhou-red text-white')">
      <!-- 结绳装饰 -->
       <div v-if="!isUser && !isSystem" class="absolute inset-0 border-2 border-white/30 rounded-full m-1"></div>
      <User v-if="isUser" class="w-6 h-6 relative z-10" />
      <Terminal v-else-if="isSystem" class="w-6 h-6 relative z-10" />
      <Bot v-else class="w-7 h-7 relative z-10" />
    </div>

    <!-- Message Body -->
    <div class="relative flex flex-col min-w-[200px]" :class="{ 'items-end': isUser, 'max-w-[80%]': !isEditing, 'max-w-full': isEditing }">
      <!-- Sender Name -->
      <div class="text-xs mb-1 px-1 opacity-70 font-display flex items-center gap-2" :class="{ 'flex-row-reverse': isUser }">
        <span class="font-bold">{{ message.role === 'user' ? (gameStore.me.name || '你') : (message.role === 'system' ? '系统' : 'Storyteller') }}</span>
        <div class="flex items-center gap-1.5" :class="{ 'flex-row-reverse': isUser }">
          <span class="text-[10px] opacity-50">{{ new Date(message.timestamp).toLocaleTimeString() }}</span>
          <span v-if="message.turnCount" class="text-[10px] px-2 py-0.5 rounded-full bg-touhou-red/10 text-touhou-red border border-touhou-red/20 font-bold tracking-tight flex items-center gap-1 shadow-sm">
            <span class="opacity-70 text-[8px] uppercase tracking-widest font-sans">Turn</span>
            <span class="font-serif-display text-sm leading-none">{{ message.turnCount }}</span>
          </span>
        </div>
      </div>

      <!-- Bubble -->
      <div 
        class="relative p-5 shadow-sm transition-all duration-300 group-hover/message:shadow-md"
        :class="[
          isUser 
            ? 'bg-izakaya-wood/10 text-ink rounded-2xl rounded-tr-sm backdrop-blur-sm' 
            : (isSystem 
                ? 'bg-gray-100 text-gray-600 rounded-lg border border-dashed border-gray-300 text-sm font-mono' 
                : 'bg-izakaya-paper text-ink rounded-none shadow-paper border-y-2 border-touhou-red/10 border-x border-x-transparent')
        ]"
      >
        <!-- Assistant Special Styling -->
        <template v-if="!isUser && !isSystem">
            <!-- Texture -->
            <div class="absolute inset-0 pointer-events-none opacity-20 bg-texture-rice-paper mix-blend-multiply"></div>
            <!-- Corners -->
            <div class="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-touhou-red/30"></div>
            <div class="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-touhou-red/30"></div>
            <div class="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-touhou-red/30"></div>
            <div class="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-touhou-red/30"></div>
        </template>

        <!-- Edit Mode -->
      <div v-if="isEditing" class="p-4 rounded-lg shadow-paper glass-paper w-full min-w-[300px] md:min-w-[700px] border border-touhou-red/30 animate-in fade-in zoom-in-95 duration-200">
        <textarea 
          v-model="editContent"
          class="w-full p-3 border border-izakaya-wood/20 rounded bg-white/60 resize-y focus:outline-none focus:ring-2 focus:ring-touhou-red/20 font-serif-display text-izakaya-wood custom-scrollbar"
          rows="10"
        ></textarea>
        <div class="flex gap-2 mt-3 justify-end">
          <button @click="handleCancelEdit" class="px-3 py-1 text-sm rounded border border-izakaya-wood/20 hover:bg-izakaya-wood/10 text-izakaya-wood transition-colors">
            取消
          </button>
          <button @click="handleSaveEdit" class="px-3 py-1 text-sm rounded bg-touhou-red text-white hover:bg-touhou-red-dark shadow-sm transition-colors">
            保存
          </button>
        </div>
      </div>
      
      <!-- Normal Display -->
      <div v-else 
        class="relative z-10 leading-relaxed group/bubble animate-pop"
        :class="isSystem ? 'text-center' : 'font-serif-display'"
      >
        
        <!-- Content -->
        <div 
          class="prose prose-stone max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-pre:my-2 break-words text-base"
          v-html="renderedContent"
        ></div>

        <!-- Illustration -->
        <div v-if="message.illustrationUrl" class="mt-4 relative group/image">
            <img 
              :src="message.illustrationUrl" 
              class="rounded-lg shadow-md border border-izakaya-wood/20 max-w-full h-auto object-cover hover:shadow-lg transition-shadow duration-300 min-w-[200px]"
              alt="Generated Illustration"
              loading="lazy"
            />
            <div class="absolute bottom-2 right-2 opacity-0 group-hover/image:opacity-100 transition-opacity bg-black/50 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
               Generated by AI
            </div>
        </div>
      </div>
    </div>
      
      <!-- Debug Panel -->
      <div v-if="showDebug" class="mt-2 w-full max-w-2xl animate-in slide-in-from-top-2 fade-in duration-300 relative z-30">
        <div class="bg-gray-900/95 text-gray-100 rounded-lg text-xs font-mono overflow-hidden border border-touhou-red/30 shadow-xl backdrop-blur-sm">
           <!-- Header -->
           <div class="flex items-center justify-between px-3 py-2 bg-gray-800/50 border-b border-gray-700">
              <span class="flex items-center gap-2 font-bold text-gray-400">
                <Terminal class="w-3 h-3" />
                Debug Info
              </span>
              <button @click="showDebug = false" class="text-gray-500 hover:text-white transition-colors"><X class="w-3 h-3" /></button>
           </div>
           
           <div class="p-3 overflow-x-auto custom-scrollbar max-h-[400px]">
             <div v-if="hasDebugLog" class="space-y-4">
                <!-- Logic Input -->
                <div class="group/debug-section">
                   <div 
                      @click="toggleSection('input')"
                      class="text-green-400 font-bold mb-1 flex items-center gap-2 opacity-80 group-hover/debug-section:opacity-100 transition-opacity cursor-pointer select-none"
                   >
                      <ChevronDown v-if="expandedSections.input" class="w-3 h-3" />
                      <ChevronRight v-else class="w-3 h-3" />
                      <span class="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                      逻辑输入 (上下文)
                   </div>
                   <pre v-if="expandedSections.input" class="bg-black/30 p-2 rounded border border-gray-800 text-gray-300 animate-in slide-in-from-top-1 duration-200 overflow-x-auto">{{ message.debugLog?.logicInput }}</pre>
                </div>
                
                <!-- Logic Thinking (CoT) -->
                <div class="group/debug-section">
                   <div 
                      @click="toggleSection('thinking')"
                      class="text-marisa-gold font-bold mb-1 flex items-center gap-2 opacity-80 group-hover/debug-section:opacity-100 transition-opacity cursor-pointer select-none"
                   >
                      <ChevronDown v-if="expandedSections.thinking" class="w-3 h-3" />
                      <ChevronRight v-else class="w-3 h-3" />
                      <span class="w-1.5 h-1.5 rounded-full bg-marisa-gold"></span>
                      思维链 (CoT)
                   </div>
                   <div v-if="expandedSections.thinking" class="bg-black/30 p-2 rounded border border-gray-800 text-gray-300 whitespace-pre-wrap animate-in slide-in-from-top-1 duration-200">{{ logicThinkingContent || '暂无思维链内容' }}</div>
                </div>
                
                <!-- Logic Output -->
                <div class="group/debug-section">
                   <div 
                      @click="toggleSection('output')"
                      class="text-blue-400 font-bold mb-1 flex items-center gap-2 opacity-80 group-hover/debug-section:opacity-100 transition-opacity cursor-pointer select-none"
                   >
                      <ChevronDown v-if="expandedSections.output" class="w-3 h-3" />
                      <ChevronRight v-else class="w-3 h-3" />
                      <span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                      逻辑输出 (JSON)
                   </div>
                   <pre v-if="expandedSections.output" class="bg-black/30 p-2 rounded border border-gray-800 text-gray-300 animate-in slide-in-from-top-1 duration-200 overflow-x-auto">{{ message.debugLog?.logicOutput }}</pre>
                </div>

                <!-- Illustration Prompt -->
                <div v-if="message.illustrationPrompt" class="group/debug-section">
                   <div 
                      @click="toggleSection('illustration')"
                      class="text-purple-400 font-bold mb-1 flex items-center gap-2 opacity-80 group-hover/debug-section:opacity-100 transition-opacity cursor-pointer select-none"
                   >
                      <ChevronDown v-if="expandedSections.illustration" class="w-3 h-3" />
                      <ChevronRight v-else class="w-3 h-3" />
                      <span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                      插画提示词
                   </div>
                   <div v-if="expandedSections.illustration" class="bg-black/30 p-2 rounded border border-gray-800 text-gray-300 whitespace-pre-wrap text-xs animate-in slide-in-from-top-1 duration-200">{{ message.illustrationPrompt }}</div>
                </div>
             </div>
             <div v-else class="text-center text-gray-500 py-8 flex flex-col items-center gap-2">
                <Bug class="w-8 h-8 opacity-20" />
                <div class="font-medium">调试信息暂未生成</div>
                <div class="text-[10px] opacity-60">后台处理完成后自动刷新</div>
             </div>
           </div>
        </div>
      </div>

      <!-- Actions -->
      <div v-if="!isEditing" 
           class="absolute top-0 transition-opacity duration-200 z-20" 
           :class="[
             isUser ? '-left-10' : '-right-10',
             isTouchDevice ? 'opacity-100' : 'opacity-0 group-hover/message:opacity-100'
           ]"
           @mouseenter="handleMouseEnterMenu"
           @mouseleave="handleMouseLeaveMenu">
        
        <!-- Action Menu Container -->
        <div class="relative">
          <!-- Menu Toggle Button -->
          <button @click.stop="toggleActionMenu" class="p-1.5 bg-white/80 backdrop-blur rounded-full shadow-sm border border-izakaya-wood/10 hover:bg-white hover:border-touhou-red/30 transition-all text-izakaya-wood/60 hover:text-touhou-red">
            <MoreVertical class="w-4 h-4" />
          </button>
          
          <!-- Dropdown Menu -->
          <div class="absolute top-full mt-2 glass-paper rounded-lg py-1 min-w-[140px] z-50 transition-all duration-200 shadow-paper border border-izakaya-wood/10"
               :class="[
                 showActionMenu ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible -translate-y-2',
                 isUser ? 'left-0' : 'right-0'
               ]">
            
            <!-- Texture -->
            <div class="absolute inset-0 pointer-events-none opacity-20 bg-texture-rice-paper rounded-lg"></div>

            <div class="relative z-10">
              <!-- Common Actions -->
              <button @click.stop="handleCopy" class="w-full px-3 py-2 text-sm text-left hover:bg-touhou-red/5 flex items-center gap-2 text-izakaya-wood transition-colors group/item">
                <Copy class="w-4 h-4 text-izakaya-wood/40 group-hover/item:text-touhou-red" />
                <span>复制内容</span>
              </button>
              
              <button @click.stop="handleEdit" class="w-full px-3 py-2 text-sm text-left hover:bg-touhou-red/5 flex items-center gap-2 text-izakaya-wood transition-colors group/item">
                <Edit class="w-4 h-4 text-izakaya-wood/40 group-hover/item:text-touhou-red" />
                <span>编辑内容</span>
              </button>

              <!-- Assistant Specific -->
              <template v-if="!isUser && !isSystem">
                 <button @click.stop="showDebug = !showDebug" class="w-full px-3 py-2 text-sm text-left hover:bg-touhou-red/5 flex items-center gap-2 transition-colors group/item" :class="showDebug ? 'text-touhou-red bg-touhou-red/5' : 'text-izakaya-wood'">
                  <Bug class="w-4 h-4" :class="showDebug ? 'text-touhou-red' : 'text-izakaya-wood/40 group-hover/item:text-touhou-red'" />
                  <span>调试信息</span>
                  <div v-if="!hasDebugLog" class="ml-auto text-[10px] text-izakaya-wood/30">(空)</div>
                </button>

                <button @click.stop="handleRegenerateMemory" 
                        class="w-full px-3 py-2 text-sm text-left hover:bg-touhou-red/5 flex items-center gap-2 transition-colors group/item text-izakaya-wood"
                        :disabled="isRegenerating">
                  <RefreshCw class="w-4 h-4 text-izakaya-wood/40 group-hover/item:text-touhou-red" :class="{ 'animate-spin': isRegenerating }" />
                  <span>{{ isRegenerating ? '更新中...' : '更新记忆条目' }}</span>
                </button>
              </template>
              
              <!-- Divider -->
              <div class="border-t border-izakaya-wood/10 my-1 mx-2"></div>
              
              <!-- Delete -->
              <button @click.stop="handleDelete" class="w-full px-3 py-2 text-sm text-left hover:bg-red-50 flex items-center gap-2 text-red-600 transition-colors group/item">
                <Trash2 class="w-4 h-4 opacity-60 group-hover/item:opacity-100" />
                <span>删除对话</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
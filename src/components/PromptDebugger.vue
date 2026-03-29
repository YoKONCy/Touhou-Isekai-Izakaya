<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { promptService, type PromptContext } from '@/services/prompt';
import { useSettingsStore } from '@/stores/settings';
import { X, RefreshCw, Copy } from 'lucide-vue-next';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const settingsStore = useSettingsStore();
const context = ref<PromptContext | null>(null);
const isLoading = ref(false);

const totalTokens = computed(() => context.value?.totalTokens || 0);
const maxTokens = computed(() => {
  const chatConfig = settingsStore.getEffectiveConfig('chat');
  return chatConfig.maxContextTokens || 4000;
});

async function loadPreview() {
  isLoading.value = true;
  try {
    // Use a dummy user input for preview
    context.value = await promptService.build('(预览: 玩家的当前输入)');
  } catch (e) {
    console.error('[PromptDebugger] Failed to load preview:', e);
  } finally {
    isLoading.value = false;
  }
}

// 当对话框开启时自动触发预览加载 (Load preview) 喵
watch(
  () => props.isOpen,
  (val) => {
    if (val) {
      loadPreview();
    }
  },
  { immediate: true }
);

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
  alert('已复制到剪贴板');
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/80 backdrop-blur-sm p-4 animate-fade-in font-sans"
  >
    <div
      class="relative bg-izakaya-paper dark:bg-stone-900 w-full max-w-4xl h-[80vh] rounded-xl shadow-2xl overflow-hidden flex flex-col transition-all border-2 border-izakaya-wood/30"
    >
      <!-- 纸张纹理蒙层 (Texture Overlay) 喵 -->
      <div class="absolute inset-0 pointer-events-none opacity-40 bg-texture-rice-paper z-0"></div>

      <!-- 顶部标题栏 (Header) 喵 -->
      <div
        class="relative z-10 flex items-center justify-between p-4 border-b border-izakaya-wood/20 bg-white/40 backdrop-blur-sm"
      >
        <div class="flex items-center gap-4">
          <h2 class="text-lg font-bold font-display text-izakaya-wood flex items-center gap-2">
            <span class="text-touhou-red">👁️‍🗨️</span>
            Prompt 实时预览
          </h2>
          <div v-if="context" class="flex items-center gap-2 text-sm font-serif">
            <span
              class="px-2 py-1 bg-izakaya-wood/10 text-izakaya-wood rounded border border-izakaya-wood/20 font-mono text-xs"
            >
              <span class="font-bold">{{ totalTokens }}</span> Tokens
            </span>
            <span class="text-izakaya-wood/50">/ {{ maxTokens }} (Est.)</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            @click="loadPreview"
            class="p-2 hover:bg-izakaya-wood/10 rounded-full text-izakaya-wood/60 hover:text-izakaya-wood transition-colors"
            title="刷新"
          >
            <RefreshCw class="w-5 h-5" :class="{ 'animate-spin': isLoading }" />
          </button>
          <button
            @click="$emit('close')"
            class="p-2 hover:bg-touhou-red/10 rounded-full text-izakaya-wood/50 hover:text-touhou-red transition-colors"
          >
            <X class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- 提示词内容展示区 (Content) 喵 -->
      <div class="relative z-10 flex-1 overflow-y-auto p-4 bg-izakaya-wood/5 custom-scrollbar">
        <div v-if="context" class="space-y-4">
          <div
            v-for="section in context.sections"
            :key="section.id"
            class="bg-white/80 dark:bg-stone-800/80 rounded-lg shadow-sm border border-izakaya-wood/10 overflow-hidden hover:shadow-md transition-all duration-300 group"
          >
            <!-- 单个积木区块头部 (Section Header) 喵 -->
            <div
              class="px-4 py-2 bg-izakaya-wood/5 border-b border-izakaya-wood/10 flex justify-between items-center"
            >
              <div class="flex items-center gap-3">
                <span
                  class="text-[10px] font-bold uppercase px-2 py-0.5 rounded border shadow-sm tracking-wider"
                  :class="{
                    'bg-purple-100 text-purple-700 border-purple-200': section.role === 'system',
                    'bg-blue-100 text-blue-700 border-blue-200': section.role === 'user',
                    'bg-green-100 text-green-700 border-green-200': section.role === 'assistant'
                  }"
                >
                  {{ section.role }}
                </span>
                <span class="font-bold font-display text-sm text-izakaya-wood">{{
                  section.name
                }}</span>
                <span class="text-xs text-izakaya-wood/40 font-mono">#{{ section.id }}</span>
              </div>
              <div class="flex items-center gap-3">
                <span
                  class="text-xs font-mono text-izakaya-wood/50 bg-white/50 px-1.5 py-0.5 rounded"
                  >{{ section.tokenCount }} tks</span
                >
                <button
                  @click="copyToClipboard(section.content)"
                  class="text-izakaya-wood/40 hover:text-touhou-red transition-colors p-1 rounded hover:bg-touhou-red/5"
                >
                  <Copy class="w-4 h-4" />
                </button>
              </div>
            </div>

            <!-- 积木实际内容 (Section Content) 喵 -->
            <div
              class="p-4 font-mono text-xs whitespace-pre-wrap text-izakaya-wood/80 leading-relaxed max-h-60 overflow-y-auto custom-scrollbar bg-white/50 relative"
            >
              <!-- 内容区域内的微妙背景图案 喵 -->
              <div
                class="absolute inset-0 pointer-events-none opacity-[0.02] bg-texture-stardust mix-blend-multiply"
              ></div>
              <div class="relative z-10">{{ section.content }}</div>
            </div>
          </div>
        </div>

        <div
          v-else
          class="flex flex-col items-center justify-center h-full text-izakaya-wood/40 font-serif"
        >
          <RefreshCw class="w-8 h-8 mb-2 animate-spin opacity-50" v-if="isLoading" />
          <div v-else class="text-center">
            <p>正在生成预览...</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

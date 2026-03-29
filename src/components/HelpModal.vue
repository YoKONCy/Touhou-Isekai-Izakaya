<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { X, HelpCircle, ArrowRight, MousePointer2 } from 'lucide-vue-next';
import { GUIDE_CONTENT } from '@/data/guideContent';
import { parseMarkdown } from '@/utils/markdown';
import { audioManager } from '@/services/audio';

const props = defineProps<{
  isOpen: boolean;
  initialSectionId?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'action', action: string): void;
}>();

const activeSectionId = ref(GUIDE_CONTENT[0]?.id || '');
const searchQuery = ref('');

const activeSection = computed(
  () => GUIDE_CONTENT.find((s) => s.id === activeSectionId.value) || GUIDE_CONTENT[0]
);

const filteredSections = computed(() => {
  if (!searchQuery.value) return GUIDE_CONTENT;
  return GUIDE_CONTENT.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      s.content.toLowerCase().includes(searchQuery.value.toLowerCase())
  );
});

// 当模态框开启时，同步注入初始激活的章节 ID 喵 (Sync section)
watch(
  () => props.isOpen,
  (val) => {
    if (val) {
      audioManager.playWindowOpen();
      if (props.initialSectionId) {
        activeSectionId.value = props.initialSectionId;
      }
    } else if (val === false) {
      // 仅在真实关闭动作发生时播放收回音效喵 (Close sound)
      audioManager.playWindowClose();
    }
  }
);

function handleSectionClick(id: string) {
  activeSectionId.value = id;
  audioManager.playClick();
}

function handleContentClick(event: MouseEvent) {
  const target = event.target as HTMLElement;
  // 嗅探点击元素是否为带有特殊指令的锚点标签喵 (Action Link)
  const anchor = target.closest('a');
  if (anchor) {
    const href = anchor.getAttribute('href');
    if (href && href.startsWith('action:')) {
      event.preventDefault();
      const action = href.replace('action:', '');
      console.log('[HelpModal] Triggering action:', action);

      if (action === 'stay') {
        // 自引用逻辑，保持当前状态不动喵 (Self-ref)
        return;
      }

      audioManager.playClick();
      emit('action', action);
      // 执行动作后通常关闭引导框，以便用户观察交互反馈喵 (Assumption: close for flow)
      if (action !== 'stay') {
        emit('close');
      }
    }
  }
}

// 注入自定义渲染管道，为 Markdown 转化的 HTML 应用样式喵 (HTML Injector)
const parsedContent = computed(() => {
  if (!activeSection.value) return '';
  let html = parseMarkdown(activeSection.value.content);
  // 此处可对 HTML 进行二次增强逻辑，例如注入自定义图标等 喵
  return html;
});
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0 scale-95"
    enter-to-class="opacity-100 scale-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100 scale-100"
    leave-to-class="opacity-0 scale-95"
  >
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      @click.self="emit('close')"
    >
      <!-- 半透明背景遮罩 (Backdrop) 喵 -->
      <div
        class="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        @click="emit('close')"
      ></div>

      <!-- 引导框主体容器 (Modal Card) 喵 -->
      <div
        class="relative bg-izakaya-paper w-full max-w-5xl h-[80vh] rounded-xl shadow-2xl flex flex-col overflow-hidden border-2 border-izakaya-wood/20"
      >
        <!-- 东方风格蒙层纹理 (Texture Overlay) 喵 -->
        <div
          class="absolute inset-0 pointer-events-none opacity-20 bg-texture-rice-paper mix-blend-multiply z-0"
        ></div>

        <!-- 顶部功能标题栏 (Header) 喵 -->
        <div
          class="relative z-10 flex items-center justify-between px-6 py-4 bg-izakaya-wood/5 border-b border-izakaya-wood/10"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-full bg-touhou-red text-white flex items-center justify-center shadow-sm"
            >
              <HelpCircle class="w-6 h-6" />
            </div>
            <div>
              <h2 class="text-xl font-bold font-display text-izakaya-wood">帮助与引导</h2>
              <p class="text-xs text-izakaya-wood/60">幻想乡异闻录 - 新手指南</p>
            </div>
          </div>

          <button
            @click="emit('close')"
            class="p-2 hover:bg-izakaya-wood/10 rounded-full transition-colors text-izakaya-wood/60 hover:text-izakaya-wood"
          >
            <X class="w-6 h-6" />
          </button>
        </div>

        <!-- 面板核心内容区 (Body Area) 喵 -->
        <div class="relative z-10 flex flex-col md:flex-row flex-1 min-h-0">
          <!-- 导航侧边栏 (Sidebar/TOC)：桌面端侧置，移动端顶部切换 喵 -->
          <div
            class="md:w-64 bg-white/50 border-b md:border-b-0 md:border-r border-izakaya-wood/10 flex flex-col flex-shrink-0"
          >
            <!-- 移动端专供：横向滚动视口 喵 -->
            <div
              class="md:hidden overflow-x-auto p-2 flex gap-2"
              style="-webkit-overflow-scrolling: touch"
            >
              <button
                v-for="section in filteredSections"
                :key="section.id"
                @click="handleSectionClick(section.id)"
                class="flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap"
                :class="[
                  activeSectionId === section.id
                    ? 'bg-touhou-red text-white shadow-md'
                    : 'bg-izakaya-wood/5 text-izakaya-wood/70'
                ]"
              >
                {{ section.title }}
              </button>
            </div>

            <!-- 桌面端专供：纵向章节列表 喵 -->
            <div class="hidden md:block flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              <button
                v-for="section in filteredSections"
                :key="section.id"
                @click="handleSectionClick(section.id)"
                class="w-full text-left px-4 py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-between group"
                :class="[
                  activeSectionId === section.id
                    ? 'bg-touhou-red text-white shadow-md'
                    : 'text-izakaya-wood/70 hover:bg-izakaya-wood/5 hover:text-izakaya-wood'
                ]"
              >
                <span>{{ section.title }}</span>
                <ArrowRight v-if="activeSectionId === section.id" class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- 文档正文渲染区 (Content Area) 喵 -->
          <div
            class="flex-1 overflow-y-auto bg-white/80 p-4 md:p-8 custom-scrollbar relative"
            style="-webkit-overflow-scrolling: touch"
          >
            <div
              class="max-w-3xl mx-auto prose prose-stone prose-headings:font-display prose-headings:text-izakaya-wood prose-a:text-touhou-red prose-a:no-underline prose-a:font-bold prose-a:border-b-2 prose-a:border-touhou-red/20 hover:prose-a:border-touhou-red hover:prose-a:bg-touhou-red/5 prose-a:transition-all prose-a:px-1 prose-a:rounded-sm prose-img:rounded-xl prose-strong:text-touhou-red/80"
            >
              <!-- 渲染后的 Markdown 内容 喵 -->
              <div v-html="parsedContent" @click="handleContentClick"></div>
            </div>

            <!-- 操作交互提示 (Interaction Hint) 喵 -->
            <div
              class="mt-12 pt-6 border-t border-izakaya-wood/10 text-center text-xs text-izakaya-wood/40 flex items-center justify-center gap-2"
            >
              <MousePointer2 class="w-3 h-3" />
              <span>点击文档中的高亮链接可快速跳转功能</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style>
/* 针对该模态框的自定义滚动条样式 喵 (Custom Scrollbar) */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.1);
  border-radius: 3px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: rgba(0, 0, 0, 0.2);
}
</style>

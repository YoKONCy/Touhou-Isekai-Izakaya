<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { X, HelpCircle, ArrowRight, MousePointer2 } from 'lucide-vue-next';
import { GUIDE_CONTENT } from '@/data/guideContent';
import { parseMarkdown } from '@/utils/markdown';
import { audioManager } from '@/services/audio';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'action', action: string): void;
}>();

const activeSectionId = ref(GUIDE_CONTENT[0]?.id || '');
const searchQuery = ref('');

const activeSection = computed(() => 
  GUIDE_CONTENT.find(s => s.id === activeSectionId.value) || GUIDE_CONTENT[0]
);

const filteredSections = computed(() => {
  if (!searchQuery.value) return GUIDE_CONTENT;
  return GUIDE_CONTENT.filter(s => 
    s.title.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
    s.content.toLowerCase().includes(searchQuery.value.toLowerCase())
  );
});

// Watch open state to reset scroll or selection if needed
watch(() => props.isOpen, (val) => {
  if (val) {
    audioManager.playWindowOpen();
  } else {
    audioManager.playWindowClose();
  }
});

function handleSectionClick(id: string) {
  activeSectionId.value = id;
  audioManager.playClick();
}

function handleContentClick(event: MouseEvent) {
  const target = event.target as HTMLElement;
  // Check if clicked element is an anchor tag with special action
  const anchor = target.closest('a');
  if (anchor) {
    const href = anchor.getAttribute('href');
    if (href && href.startsWith('action:')) {
      event.preventDefault();
      const action = href.replace('action:', '');
      console.log('[HelpModal] Triggering action:', action);
      
      if (action === 'stay') {
        // Do nothing for self-reference
        return;
      }
      
      audioManager.playClick();
      emit('action', action);
      // Close help modal for most actions to allow user to see the result
      // But maybe we want to keep it open? Let's assume close for navigation actions.
      if (action !== 'stay') {
        emit('close');
      }
    }
  }
}

// Custom parser wrapper to inject custom styles for action links
const parsedContent = computed(() => {
  if (!activeSection.value) return '';
  let html = parseMarkdown(activeSection.value.content);
  // We can enhance the HTML here if needed, e.g. adding icons to links
  // But standard markdown parser output with simple <a> tags is enough if styled correctly
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
    <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" @click.self="emit('close')">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" @click="emit('close')"></div>

      <!-- Modal Card -->
      <div class="relative bg-izakaya-paper w-full max-w-5xl h-[80vh] rounded-xl shadow-2xl flex flex-col overflow-hidden border-2 border-izakaya-wood/20">
        
        <!-- Texture Overlay -->
        <div class="absolute inset-0 pointer-events-none opacity-20 bg-texture-rice-paper mix-blend-multiply z-0"></div>

        <!-- Header -->
        <div class="relative z-10 flex items-center justify-between px-6 py-4 bg-izakaya-wood/5 border-b border-izakaya-wood/10">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-touhou-red text-white flex items-center justify-center shadow-sm">
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

        <!-- Body -->
        <div class="relative z-10 flex flex-1 min-h-0">
          
          <!-- Sidebar (TOC) -->
          <div class="w-64 bg-white/50 border-r border-izakaya-wood/10 flex flex-col">
            <!-- Search (Optional, for future) -->
            <!-- <div class="p-3 border-b border-izakaya-wood/5">
              <div class="relative">
                <Search class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-izakaya-wood/40" />
                <input 
                  v-model="searchQuery"
                  type="text" 
                  placeholder="搜索主题..."
                  class="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-izakaya-wood/10 rounded-md focus:outline-none focus:border-touhou-red/50 transition-colors"
                />
              </div>
            </div> -->

            <div class="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
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

          <!-- Content Area -->
          <div class="flex-1 overflow-y-auto bg-white/80 p-8 custom-scrollbar relative">
             <div class="max-w-3xl mx-auto prose prose-stone prose-headings:font-display prose-headings:text-izakaya-wood prose-a:text-touhou-red prose-a:no-underline prose-a:font-bold prose-a:border-b-2 prose-a:border-touhou-red/20 hover:prose-a:border-touhou-red hover:prose-a:bg-touhou-red/5 prose-a:transition-all prose-a:px-1 prose-a:rounded-sm prose-img:rounded-xl prose-strong:text-touhou-red/80">
                <!-- Render Content -->
                <div v-html="parsedContent" @click="handleContentClick"></div>
             </div>

             <!-- Interaction Hint -->
             <div class="mt-12 pt-6 border-t border-izakaya-wood/10 text-center text-xs text-izakaya-wood/40 flex items-center justify-center gap-2">
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
/* Custom Scrollbar for this modal */
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

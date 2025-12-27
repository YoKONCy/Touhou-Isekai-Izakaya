<script setup lang="ts">
import { ref } from 'vue';
import {
  X, Settings, Save, Book, Database, Blocks, HelpCircle,
  ChevronRight
} from 'lucide-vue-next';
import { audioManager } from '@/services/audio';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'open-settings'): void;
  (e: 'open-save-manager'): void;
  (e: 'open-char-editor'): void;
  (e: 'open-memory-panel'): void;
  (e: 'open-prompt-builder'): void;
  (e: 'open-help'): void;
  (e: 'open-map'): void;
}>();

const menuItems = [
  { id: 'save', icon: Save, label: '存档管理', description: '切换/管理游戏存档', event: 'open-save-manager' },
  { id: 'char', icon: Book, label: '条目编辑器', description: 'Lorebook 角色设定', event: 'open-char-editor' },
  { id: 'memory', icon: Database, label: '记忆库', description: '管理游戏记忆', event: 'open-memory-panel' },
  { id: 'prompt', icon: Blocks, label: '提示词拼接', description: '调整提示词结构', event: 'open-prompt-builder' },
  { id: 'help', icon: HelpCircle, label: '帮助与引导', description: '游戏操作指南', event: 'open-help' },
  { id: 'settings', icon: Settings, label: '设置', description: 'API 与系统设置', event: 'open-settings' },
] as const;

function handleMenuClick(event: typeof menuItems[number]['event']) {
  audioManager.playPageFlip();
  emit(event as any);
  emit('close');
}

function handleClose() {
  audioManager.playSoftClick();
  emit('close');
}

// Handle touch events for swipe to close
const touchStartX = ref(0);
const touchCurrentX = ref(0);
const isSwiping = ref(false);

function handleTouchStart(e: TouchEvent) {
  touchStartX.value = e.touches[0]?.clientX ?? 0;
  isSwiping.value = true;
}

function handleTouchMove(e: TouchEvent) {
  if (!isSwiping.value) return;
  touchCurrentX.value = e.touches[0]?.clientX ?? 0;
}

function handleTouchEnd() {
  if (!isSwiping.value) return;

  const diff = touchStartX.value - touchCurrentX.value;
  // Swipe right to close (negative diff means swiping right)
  if (diff < -50) {
    handleClose();
  }

  isSwiping.value = false;
  touchStartX.value = 0;
  touchCurrentX.value = 0;
}
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <Transition name="fade">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm md:hidden"
        @click="handleClose"
      ></div>
    </Transition>

    <!-- Drawer Panel -->
    <Transition name="slide">
      <div
        v-if="isOpen"
        class="fixed top-0 right-0 bottom-0 z-[201] w-72 bg-izakaya-paper shadow-2xl md:hidden flex flex-col overflow-hidden"
        @touchstart="handleTouchStart"
        @touchmove="handleTouchMove"
        @touchend="handleTouchEnd"
      >
        <!-- Texture Overlay -->
        <div class="absolute inset-0 pointer-events-none opacity-20 bg-texture-rice-paper"></div>

        <!-- Header -->
        <div class="relative z-10 flex items-center justify-between p-4 border-b border-izakaya-wood/10 bg-touhou-red/5">
          <div class="flex items-center gap-2">
            <span class="text-xl">⛩️</span>
            <span class="font-display font-bold text-izakaya-wood">菜单</span>
          </div>
          <button
            @click="handleClose"
            class="p-2 text-izakaya-wood/60 hover:text-touhou-red active:scale-95 transition-all rounded-full hover:bg-white/50"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Menu Items -->
        <div class="relative z-10 flex-1 overflow-y-auto py-2">
          <button
            v-for="item in menuItems"
            :key="item.id"
            @click="handleMenuClick(item.event)"
            class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/50 active:bg-white/80 transition-colors group"
          >
            <div class="w-10 h-10 rounded-lg bg-white/60 border border-izakaya-wood/10 flex items-center justify-center group-hover:border-touhou-red/30 group-hover:bg-white transition-colors">
              <component :is="item.icon" class="w-5 h-5 text-izakaya-wood/70 group-hover:text-touhou-red transition-colors" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-display font-bold text-sm text-izakaya-wood group-hover:text-touhou-red transition-colors">
                {{ item.label }}
              </div>
              <div class="text-xs text-izakaya-wood/50 truncate">
                {{ item.description }}
              </div>
            </div>
            <ChevronRight class="w-4 h-4 text-izakaya-wood/30 group-hover:text-touhou-red/50 group-hover:translate-x-0.5 transition-all" />
          </button>
        </div>

        <!-- Footer -->
        <div class="relative z-10 p-4 border-t border-izakaya-wood/10 bg-white/30">
          <div class="text-xs text-center text-izakaya-wood/40 font-display">
            东方异界食堂 <span class="text-touhou-red">Beta</span>
          </div>
          <div class="text-[10px] text-center text-izakaya-wood/30 mt-1">
            向右滑动关闭菜单
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Fade transition for backdrop */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Slide transition for drawer */
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}
</style>

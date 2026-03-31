<script setup lang="ts">
import { useSaveStore } from '@/stores/save';
import { useChatStore } from '@/stores/chat';
import { Swords, X, Play } from 'lucide-vue-next';
import { audioManager } from '@/services/audio';

const saveStore = useSaveStore();
const chatStore = useChatStore();

const emit = defineEmits<{
  (e: 'startDemo'): void;
}>();

const isVisible = defineModel<boolean>('isVisible', { default: true });

function handleStartDemo() {
  audioManager.playClick();
  emit('startDemo');
}

function dismiss() {
  audioManager.playSoftClick();
  isVisible.value = false;
}
</script>

<template>
  <Transition
    enter-active-class="transition duration-500 ease-out"
    enter-from-class="transform -translate-y-4 opacity-0"
    enter-to-class="transform translate-y-0 opacity-100"
    leave-active-class="transition duration-300 ease-in"
    leave-from-class="transform translate-y-0 opacity-100"
    leave-to-class="transform -translate-y-4 opacity-0"
  >
    <div
      v-if="isVisible && saveStore.isDefaultSave && chatStore.messages.length < 20"
      class="mx-4 mb-4 relative group"
    >
      <!-- 试玩专属的冰蓝风格的毛玻璃渐降背景 喵 -->
      <div
        class="absolute inset-0 bg-blue-900/5 backdrop-blur-md rounded-xl border-2 border-blue-900/20 shadow-lg group-hover:shadow-blue-900/10 transition-shadow duration-500"
      ></div>

      <div class="relative px-5 py-4 flex items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <!-- 战斗刀剑图标筐 喵 -->
          <div
            class="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/30"
          >
            <Swords class="w-5 h-5 animate-bounce" />
          </div>

          <div class="flex flex-col">
            <h3
              class="font-display font-bold text-izakaya-wood text-sm md:text-base flex items-center gap-2"
            >
              战斗系统试玩
              <span
                class="px-1.5 py-0.5 bg-blue-500/10 text-blue-600 text-[10px] rounded uppercase tracking-wider"
                >沙盒模式喵</span
              >
            </h3>
            <p class="text-xs md:text-sm text-izakaya-wood/70 font-serif">
              想要提前体验一下华丽的战斗对决吗？
              <span class="hidden md:inline">您可以随时进入完全独立的沙盒进行实战演练！</span>
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <!-- 直接进入试玩！-->
          <button
            @click="handleStartDemo"
            class="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs md:text-sm font-bold shadow-sm hover:shadow-md transition-all active:scale-95 group/btn"
          >
            <Play class="w-4 h-4" />
            <span>进入试玩</span>
          </button>

          <!-- 关闭入口 喵 -->
          <button
            @click="dismiss"
            class="p-2 text-izakaya-wood/40 hover:text-izakaya-wood/80 hover:bg-white/50 rounded-full transition-all"
            title="暂时忽略"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- 星尘静帧肌理 -->
      <div
        class="absolute inset-0 pointer-events-none opacity-[0.03] bg-texture-stardust rounded-xl"
      ></div>
    </div>
  </Transition>
</template>

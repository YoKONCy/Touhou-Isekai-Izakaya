<script setup lang="ts">
import { ref } from 'vue';
import { useSaveStore } from '@/stores/save';
import { useChatStore } from '@/stores/chat';
import { Sparkles, X, ArrowRight, Save, HelpCircle } from 'lucide-vue-next';
import { audioManager } from '@/services/audio';

const saveStore = useSaveStore();
const chatStore = useChatStore();
const isVisible = ref(true);

const emit = defineEmits<{
  (e: 'openSaveManager'): void;
  (e: 'openHelp'): void;
}>();

function handleOpenSaveManager() {
  audioManager.playClick();
  emit('openSaveManager');
}

function handleOpenHelp() {
  audioManager.playClick();
  emit('openHelp');
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
    <div v-if="isVisible && saveStore.isDefaultSave && chatStore.messages.length < 20" class="mx-4 mt-2 mb-4 relative group">
      <!-- Background with Glassmorphism and Touhou Theme -->
      <div class="absolute inset-0 bg-touhou-red/5 backdrop-blur-md rounded-xl border-2 border-touhou-red/20 shadow-lg group-hover:shadow-touhou-red/10 transition-shadow duration-500"></div>
      
      <!-- Content Container -->
      <div class="relative px-5 py-4 flex items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <!-- Animated Icon Box -->
          <div class="w-10 h-10 rounded-full bg-touhou-red text-white flex items-center justify-center shadow-md animate-pulse-slow">
            <Sparkles class="w-5 h-5" />
          </div>
          
          <div class="flex flex-col">
            <h3 class="font-display font-bold text-izakaya-wood text-sm md:text-base flex items-center gap-2">
              新玩家引导
              <span class="px-1.5 py-0.5 bg-touhou-red/10 text-touhou-red text-[10px] rounded uppercase tracking-wider">Recommended</span>
            </h3>
            <p class="text-xs md:text-sm text-izakaya-wood/70 font-serif">
              您当前正处于 <span class="font-bold text-touhou-red">默认存档</span>。为了获得完整的角色定制体验，建议您创建一个专属存档。
              <span class="hidden md:inline">此外，您可以查看操作指南了解游戏玩法。</span>
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <!-- Secondary Action: Help -->
          <button 
            @click="handleOpenHelp"
            class="hidden md:flex items-center gap-2 px-3 py-2 bg-white/50 hover:bg-white/80 text-izakaya-wood/70 hover:text-izakaya-wood rounded-lg text-xs font-bold border border-izakaya-wood/10 transition-all active:scale-95"
            title="查看操作指南"
          >
            <HelpCircle class="w-4 h-4" />
            <span>玩法说明</span>
          </button>

          <!-- Primary Action -->
          <button 
            @click="handleOpenSaveManager"
            class="flex items-center gap-2 px-4 py-2 bg-touhou-red hover:bg-touhou-red-dark text-white rounded-lg text-xs md:text-sm font-bold shadow-sm hover:shadow-md transition-all active:scale-95 group/btn"
          >
            <Save class="w-4 h-4" />
            <span>去创建存档</span>
            <ArrowRight class="w-3 h-3 group-hover/btn:translate-x-1 transition-transform" />
          </button>

          <!-- Dismiss -->
          <button 
            @click="dismiss"
            class="p-2 text-izakaya-wood/40 hover:text-izakaya-wood/80 hover:bg-white/50 rounded-full transition-all"
            title="暂时忽略"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <!-- Decorative Texture Overlay -->
      <div class="absolute inset-0 pointer-events-none opacity-[0.03] bg-texture-stardust rounded-xl"></div>
    </div>
  </Transition>
</template>

<style scoped>
.animate-pulse-slow {
  animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.85;
    transform: scale(0.95);
  }
}
</style>

<script setup lang="ts">
import { watch } from 'vue';
import { confirmState } from '@/utils/confirm';
import { AlertTriangle, HelpCircle } from 'lucide-vue-next';
import { audioManager } from '@/services/audio';

watch(() => confirmState.value.isOpen, (newVal) => {
  if (newVal) {
    audioManager.playPopupSound();
  }
});

function handleConfirm() {
  audioManager.playClick();
  if (confirmState.value.resolve) {
    confirmState.value.resolve(true);
  }
  confirmState.value.isOpen = false;
}

function handleCancel() {
  audioManager.playSoftClick();
  if (confirmState.value.resolve) {
    confirmState.value.resolve(false);
  }
  confirmState.value.isOpen = false;
}
</script>

<template>
  <Teleport to="body">
    <div v-if="confirmState.isOpen" class="fixed inset-0 z-[200] flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div class="relative bg-[#fcfae8] dark:bg-stone-900 w-full max-w-sm rounded-xl shadow-2xl overflow-hidden transform scale-100 transition-all border-2 border-izakaya-wood/30 dark:border-stone-600">
        
        <!-- Texture Overlay -->
        <div class="absolute inset-0 pointer-events-none opacity-40 bg-texture-rice-paper"></div>

        <div class="relative z-10 p-6 text-center">
          <!-- Icon -->
          <div class="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 border-2 shadow-inner"
               :class="confirmState.options.destructive 
                  ? 'bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800' 
                  : 'bg-marisa-gold/20 border-marisa-gold/30'">
            <AlertTriangle v-if="confirmState.options.destructive" class="w-7 h-7 text-touhou-red" />
            <HelpCircle v-else class="w-7 h-7 text-marisa-gold" />
          </div>
          
          <h3 class="text-xl font-bold text-izakaya-wood dark:text-stone-200 mb-3 font-serif">{{ confirmState.options.title }}</h3>
          <p class="text-sm text-izakaya-wood/80 dark:text-stone-400 whitespace-pre-wrap leading-relaxed font-sans">{{ confirmState.options.message }}</p>
        </div>

        <div class="relative z-10 flex border-t border-izakaya-wood/10 dark:border-stone-700 bg-izakaya-wood/5 dark:bg-stone-800/50">
          <button 
            @click.stop="handleCancel"
            class="flex-1 px-4 py-3 text-sm font-medium text-izakaya-wood/70 dark:text-stone-400 hover:bg-izakaya-wood/10 dark:hover:bg-stone-700 transition-colors border-r border-izakaya-wood/10 dark:border-stone-700 font-serif"
          >
            {{ confirmState.options.cancelText }}
          </button>
          <button 
            @click.stop="handleConfirm"
            class="flex-1 px-4 py-3 text-sm font-bold transition-colors font-serif"
            :class="confirmState.options.destructive 
              ? 'text-touhou-red hover:bg-red-50 dark:hover:bg-red-900/20' 
              : 'text-izakaya-wood dark:text-stone-200 hover:bg-marisa-gold/10'"
          >
            {{ confirmState.options.confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useToastStore } from '@/stores/toast';
import { X, Info, CheckCircle, AlertTriangle, AlertOctagon } from 'lucide-vue-next';

const toastStore = useToastStore();

function getIcon(type: string) {
  switch (type) {
    case 'success': return CheckCircle;
    case 'warning': return AlertTriangle;
    case 'error': return AlertOctagon;
    default: return Info;
  }
}

function getClasses(type: string) {
  // Base classes for all toasts
  const base = "bg-izakaya-paper relative overflow-hidden shadow-paper border backdrop-blur-sm";
  
  switch (type) {
    case 'success': 
      return `${base} border-green-200 text-green-800`;
    case 'warning': 
      return `${base} border-marisa-gold/50 text-yellow-900`;
    case 'error': 
      return `${base} border-touhou-red/30 text-touhou-red-dark`;
    default: 
      return `${base} border-izakaya-wood/20 text-izakaya-wood`;
  }
}

function getIconColor(type: string) {
    switch (type) {
    case 'success': return "text-green-600";
    case 'warning': return "text-marisa-gold-dim";
    case 'error': return "text-touhou-red";
    default: return "text-izakaya-wood/60";
  }
}
</script>

<template>
  <div class="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
    <TransitionGroup 
      enter-active-class="transform ease-out duration-300 transition"
      enter-from-class="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
      enter-to-class="translate-y-0 opacity-100 sm:translate-x-0"
      leave-active-class="transition ease-in duration-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div 
        v-for="toast in toastStore.toasts" 
        :key="toast.id"
        class="pointer-events-auto w-full max-w-sm rounded-lg flex items-start p-4 gap-3 group"
        :class="getClasses(toast.type)"
      >
        <!-- Texture Overlay -->
        <div class="absolute inset-0 pointer-events-none opacity-10 bg-texture-rice-paper"></div>
        
        <!-- Icon -->
        <div class="relative z-10 mt-0.5" :class="getIconColor(toast.type)">
             <component :is="getIcon(toast.type)" class="w-5 h-5" />
        </div>

        <!-- Content -->
        <div class="relative z-10 flex-1 min-w-0">
             <p class="text-sm font-medium font-display leading-tight">{{ toast.message }}</p>
        </div>

        <!-- Close Button -->
        <button 
            @click="toastStore.removeToast(toast.id)" 
            class="relative z-10 text-current opacity-40 hover:opacity-100 transition-opacity p-0.5 hover:bg-black/5 rounded"
        >
          <X class="w-4 h-4" />
        </button>
        
        <!-- Decorative Side Bar -->
        <div class="absolute left-0 top-0 bottom-0 w-1" 
             :class="{
                 'bg-green-500': toast.type === 'success',
                 'bg-marisa-gold': toast.type === 'warning',
                 'bg-touhou-red': toast.type === 'error',
                 'bg-izakaya-wood/40': !['success', 'warning', 'error'].includes(toast.type)
             }">
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

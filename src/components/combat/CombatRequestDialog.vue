<template>
  <!-- Combat Request Dialog -->
  <div class="absolute inset-0 z-50 flex items-center justify-center bg-stone-900/80 backdrop-blur-sm">
    <div class="relative max-w-md w-full rounded-xl overflow-hidden shadow-2xl animate-scale-in group">
       <!-- Background & Texture -->
       <div class="absolute inset-0 bg-stone-100 dark:bg-stone-900"></div>
       <div class="absolute inset-0 opacity-40 bg-texture-rice-paper"></div>
       <div class="absolute inset-0 opacity-10 bg-texture-stardust animate-pulse-slow"></div>
       
       <!-- Content -->
       <div class="relative z-10 p-8 text-center">
         <h2 class="text-3xl font-bold font-display text-touhou-red mb-6 tracking-wider flex items-center justify-center gap-3">
           <span class="animate-bounce">⚠</span> 
           <span class="drop-shadow-sm">战斗遭遇</span> 
           <span class="animate-bounce">⚠</span>
         </h2>
         
         <div class="mb-8 p-4 bg-stone-200/50 dark:bg-stone-800/50 rounded-lg border border-izakaya-wood/20 backdrop-blur-sm">
           <p class="text-izakaya-wood dark:text-stone-300 mb-2 font-serif text-lg">
             遭遇敌人
           </p>
           <div class="text-2xl font-bold text-touhou-red font-display mb-4">{{ enemyNames }}</div>
           <p class="text-sm text-izakaya-wood/70 dark:text-stone-500 italic">
             "是否展开弹幕结界进行迎击？"
           </p>
         </div>

         <!-- Multiplayer Host Note -->
         <div v-if="isMultiplayer && !isHost" class="mb-4 p-2 bg-blue-50/10 border border-blue-500/30 rounded text-xs text-blue-300">
            <span class="font-bold">联机提示：</span> 等待房主开启战斗...
         </div>

         <div class="flex justify-center gap-4">
            <button @click="$emit('start-combat')" 
              :disabled="isMultiplayer && !isHost"
              class="group relative px-8 py-3 bg-touhou-red hover:bg-red-700 text-white rounded-lg font-bold font-display shadow-lg hover:shadow-touhou-red/40 transform hover:-translate-y-0.5 transition-all overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed">
              <div class="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
              <span class="relative flex items-center gap-2">
                <span>⚔️</span> {{ (isMultiplayer && !isHost) ? '等待房主' : '符卡展开' }}
              </span>
            </button>
            
            <button @click="$emit('skip-combat')" 
              :disabled="isMultiplayer && !isHost"
              class="group px-8 py-3 bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600 text-izakaya-wood dark:text-stone-200 rounded-lg font-bold font-display shadow transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
              <span>🕊️</span> 
              <span>避战</span>
            </button>
         </div>
       </div>
       
       <!-- Decorative Borders -->
       <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-touhou-red to-transparent opacity-50"></div>
       <div class="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-touhou-red to-transparent opacity-50"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  enemyNames: string;
  isMultiplayer: boolean;
  isHost: boolean;
}>();

defineEmits<{
  'start-combat': [];
  'skip-combat': [];
}>();
</script>

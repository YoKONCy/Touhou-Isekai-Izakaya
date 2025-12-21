<script setup lang="ts">
import { Map, Cloud } from 'lucide-vue-next';
</script>

<template>
  <div class="bg-izakaya-paper/60 backdrop-blur-md rounded-xl h-64 flex flex-col items-center justify-center text-izakaya-wood/60 border border-izakaya-wood/20 relative overflow-hidden group shadow-sm hover:shadow-md transition-all duration-500">
    <!-- 装饰性背景: 纸张纹理 -->
    <div class="absolute inset-0 pointer-events-none opacity-10 bg-texture-rice-paper"></div>
    <!-- 装饰性背景: 云纹/地图纹理 -->
    <div class="absolute inset-0 pointer-events-none opacity-5 bg-texture-stardust mix-blend-multiply"></div>
    
    <!-- 边角装饰 -->
    <div class="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-izakaya-wood/20 rounded-tl"></div>
    <div class="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-izakaya-wood/20 rounded-tr"></div>
    <div class="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-izakaya-wood/20 rounded-bl"></div>
    <div class="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-izakaya-wood/20 rounded-br"></div>

    <div class="relative z-10 flex flex-col items-center transition-transform duration-500 group-hover:scale-105">
      <div class="relative">
          <div class="w-20 h-20 rounded-full bg-izakaya-wood/5 flex items-center justify-center mb-4 border border-izakaya-wood/10 group-hover:border-touhou-red/30 group-hover:bg-touhou-red/5 transition-colors duration-300 backdrop-blur-sm">
            <Map class="w-10 h-10 opacity-50 group-hover:text-touhou-red group-hover:opacity-80 transition-all duration-300" />
          </div>
          <!-- Floating clouds/elements -->
          <Cloud class="absolute -top-2 -right-4 w-8 h-8 text-izakaya-wood/20 animate-pulse delay-75" />
          <Cloud class="absolute -bottom-1 -left-4 w-6 h-6 text-izakaya-wood/10 animate-pulse delay-300" />
      </div>
      
      <h3 class="text-lg font-display font-bold tracking-widest text-izakaya-wood group-hover:text-touhou-red transition-colors">
        幻想乡全图
      </h3>
      <div class="flex items-center gap-2 mt-2">
         <span class="h-px w-8 bg-izakaya-wood/20"></span>
         <span class="text-xs font-serif italic opacity-60">绘制中...</span>
         <span class="h-px w-8 bg-izakaya-wood/20"></span>
      </div>
    </div>
  </div>
</template>

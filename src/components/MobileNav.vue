<script setup lang="ts">
import { User, Map, Users, ListTodo, MessageCircle, Menu } from 'lucide-vue-next';
import { audioManager } from '@/services/audio';

const emit = defineEmits<{
  (e: 'switch-panel', panel: 'chat' | 'status' | 'map' | 'characters' | 'quests'): void;
  (e: 'open-drawer'): void;
  (e: 'open-settings'): void;
  (e: 'open-save-manager'): void;
  (e: 'open-char-editor'): void;
  (e: 'open-memory-panel'): void;
  (e: 'open-prompt-builder'): void;
  (e: 'open-help'): void;
}>();

const props = defineProps<{
  activePanel: 'chat' | 'status' | 'map' | 'characters' | 'quests';
}>();

const navItems = [
  { id: 'chat', icon: MessageCircle, label: '对话' },
  { id: 'status', icon: User, label: '状态' },
  { id: 'map', icon: Map, label: '地图' },
  { id: 'characters', icon: Users, label: '角色' },
  { id: 'quests', icon: ListTodo, label: '任务' },
] as const;

function handleNavClick(panel: typeof navItems[number]['id']) {
  audioManager.playSoftClick();
  emit('switch-panel', panel);
}
</script>

<template>
  <!-- Bottom Navigation Bar - Mobile Only -->
  <nav class="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-izakaya-paper/95 backdrop-blur-md border-t-2 border-izakaya-wood/20 safe-area-bottom">
    <div class="flex items-center justify-around h-16 px-2">
      <button
        v-for="item in navItems"
        :key="item.id"
        @click="handleNavClick(item.id)"
        class="flex flex-col items-center justify-center flex-1 h-full py-1 transition-all duration-200 relative"
        :class="[
          activePanel === item.id
            ? 'text-touhou-red'
            : 'text-izakaya-wood/60 active:text-izakaya-wood'
        ]"
      >
        <!-- Active indicator -->
        <div
          v-if="activePanel === item.id"
          class="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-touhou-red rounded-b-full"
        ></div>

        <component
          :is="item.icon"
          class="w-5 h-5 mb-0.5 transition-transform duration-200"
          :class="{ 'scale-110': activePanel === item.id }"
        />
        <span class="text-[10px] font-bold font-display">{{ item.label }}</span>
      </button>

      <!-- Menu button -->
      <button
        @click="emit('open-drawer')"
        class="flex flex-col items-center justify-center flex-1 h-full py-1 text-izakaya-wood/60 active:text-izakaya-wood transition-colors"
      >
        <Menu class="w-5 h-5 mb-0.5" />
        <span class="text-[10px] font-bold font-display">菜单</span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
/* Safe area for devices with home indicator */
.safe-area-bottom {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
</style>

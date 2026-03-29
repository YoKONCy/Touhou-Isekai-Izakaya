<script setup lang="ts">
import { useToastStore } from '@/stores/toast';
import { X, Info, CheckCircle, AlertTriangle, AlertOctagon } from 'lucide-vue-next';

const toastStore = useToastStore();

// 根据提示消息的语义类型（成功/警告/错误等）动态分发对应的 Lucide 图标 喵
function getIcon(type: string) {
  switch (type) {
    case 'success':
      return CheckCircle;
    case 'warning':
      return AlertTriangle;
    case 'error':
      return AlertOctagon;
    default:
      return Info;
  }
}

// 根据消息类型动态计算并返回对应的 CSS 样式类名数组 喵
function getClasses(type: string) {
  // 所有提示框的基础样式类集 (Base classes for all toasts) 喵
  const base = 'bg-izakaya-paper relative overflow-hidden shadow-paper border backdrop-blur-sm';

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

// 根据消息类型动态计算并返回对应的图标文本着色类 喵
function getIconColor(type: string) {
  switch (type) {
    case 'success':
      return 'text-green-600';
    case 'warning':
      return 'text-marisa-gold-dim';
    case 'error':
      return 'text-touhou-red';
    default:
      return 'text-izakaya-wood/60';
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
        <!-- 纸纹装饰层 (Texture Overlay) 喵 -->
        <div class="absolute inset-0 pointer-events-none opacity-10 bg-texture-rice-paper"></div>

        <!-- 类型图标 (Icon) 喵 -->
        <div class="relative z-10 mt-0.5" :class="getIconColor(toast.type)">
          <component :is="getIcon(toast.type)" class="w-5 h-5" />
        </div>

        <!-- 提示消息正文 (Content) 喵 -->
        <div class="relative z-10 flex-1 min-w-0">
          <p class="text-sm font-medium font-display leading-tight">{{ toast.message }}</p>
        </div>

        <!-- 手动关闭按钮 (Close Button) 喵 -->
        <button
          @click="toastStore.removeToast(toast.id)"
          class="relative z-10 text-current opacity-40 hover:opacity-100 transition-opacity p-0.5 hover:bg-black/5 rounded"
        >
          <X class="w-4 h-4" />
        </button>

        <!-- 装饰性侧边条 (Decorative Side Bar) 喵 -->
        <div
          class="absolute left-0 top-0 bottom-0 w-1"
          :class="{
            'bg-green-500': toast.type === 'success',
            'bg-marisa-gold': toast.type === 'warning',
            'bg-touhou-red': toast.type === 'error',
            'bg-izakaya-wood/40': !['success', 'warning', 'error'].includes(toast.type)
          }"
        ></div>
      </div>
    </TransitionGroup>
  </div>
</template>

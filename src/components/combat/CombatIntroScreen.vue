<template>
  <!-- 战斗开始动画 (VS 对峙画面) -->
  <transition name="intro-fade">
    <div
      v-if="show"
      class="fixed inset-0 z-[100] bg-black overflow-hidden flex items-center justify-center font-display pointer-events-none"
    >
      <!-- 背景斜切滑入效果 (Background Split) -->
      <div class="absolute inset-0 bg-white clip-split-left animate-bg-slide-left z-0"></div>
      <div class="absolute inset-0 bg-red-600 clip-split-right animate-bg-slide-right z-0"></div>

      <!-- 半色调网格纹理叠加 (Halftone Pattern Overlay) -->
      <div class="absolute inset-0 bg-texture-stardust opacity-20 mix-blend-multiply z-10"></div>

      <!-- 玩家阵营侧 (左侧) -->
      <div class="absolute left-0 bottom-0 h-full w-1/2 flex items-end justify-start z-20">
        <div class="relative w-full h-full animate-char-slide-left">
          <!-- 玩家立绘 -->
          <img
            :src="playerSpriteUrl"
            @error="(e) => ((e.target as HTMLImageElement).src = defaultSprite)"
            class="absolute bottom-0 left-[-10%] h-[110%] object-cover object-top drop-shadow-2xl brightness-0 contrast-100 grayscale transform skew-x-[-10deg] scale-110"
          />
          <!-- 角色名称 -->
          <div
            class="absolute bottom-1/3 left-10 text-8xl font-black italic text-black tracking-tighter drop-shadow-white rotate-[-5deg]"
          >
            <span class="block text-4xl text-red-600 mb-2">玩家</span>
            {{ playerName }}
          </div>
        </div>
      </div>

      <!-- 敌方阵营侧 (右侧) -->
      <div class="absolute right-0 top-0 h-full w-1/2 flex items-start justify-end z-20">
        <div
          class="relative w-full h-full animate-char-slide-right transform-gpu will-change-transform"
        >
          <!-- 敌人立绘 -->
          <img
            :src="enemySpriteUrl"
            @error="(e) => ((e.target as HTMLImageElement).src = defaultSprite)"
            class="absolute bottom-0 right-[-10%] h-[110%] w-auto object-cover object-top drop-shadow-2xl brightness-0 contrast-100 grayscale transform skew-x-[-10deg] scale-110 transform-gpu"
            style="image-rendering: -webkit-optimize-contrast; backface-visibility: hidden"
          />
          <!-- 敌人名称 -->
          <div
            class="absolute top-1/3 right-10 text-8xl font-black italic text-white tracking-tighter drop-shadow-red rotate-[-5deg] text-right"
          >
            <span class="block text-4xl text-black mb-2">对手</span>
            {{ enemyName }}
          </div>
        </div>
      </div>

      <!-- VS 标志弹出 (VS Logo) -->
      <div class="absolute z-50 flex items-center justify-center animate-slam">
        <div class="relative">
          <span
            class="text-[15rem] font-black italic text-yellow-400 drop-shadow-[10px_10px_0_rgba(0,0,0,1)] tracking-tighter transform -skew-x-12 rotate-[-10deg] block"
          >
            VS
          </span>
          <div
            class="absolute inset-0 animate-pulse-fast mix-blend-overlay bg-white/50 skew-x-12"
          ></div>
        </div>
      </div>

      <!-- Flash Overlay -->
      <div class="absolute inset-0 bg-white animate-flash-out z-[60] pointer-events-none"></div>
    </div>
  </transition>
</template>

<script setup lang="ts">
defineProps<{
  show: boolean;
  playerName: string;
  playerSpriteUrl: string;
  enemyName: string;
  enemySpriteUrl: string;
  defaultSprite: string;
}>();
</script>

<style scoped>
.clip-split-left {
  clip-path: polygon(0 0, 70% 0, 30% 100%, 0 100%);
}
.clip-split-right {
  clip-path: polygon(70% 0, 100% 0, 100% 100%, 30% 100%);
}

.animate-bg-slide-left {
  animation: bgSlideLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.animate-bg-slide-right {
  animation: bgSlideRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.animate-char-slide-left {
  animation: charSlideLeft 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s backwards;
}
.animate-char-slide-right {
  animation: charSlideRight 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.4s backwards;
}
.animate-slam {
  animation: slam 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 1.2s backwards;
}
.animate-flash-out {
  animation: flashOut 3.5s ease-out forwards;
}
.animate-pulse-fast {
  animation: pulse 0.1s infinite;
}
.drop-shadow-white {
  text-shadow: 4px 4px 0px rgba(255, 255, 255, 1);
}
.drop-shadow-red {
  text-shadow: 4px 4px 0px rgba(220, 38, 38, 1);
}

.intro-fade-enter-active,
.intro-fade-leave-active {
  transition: opacity 0.5s ease;
}
.intro-fade-enter-from,
.intro-fade-leave-to {
  opacity: 0;
}

@keyframes bgSlideLeft {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
}
@keyframes bgSlideRight {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}
@keyframes charSlideLeft {
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
@keyframes charSlideRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
@keyframes slam {
  0% {
    transform: scale(3) rotate(-20deg);
    opacity: 0;
  }
  100% {
    transform: scale(1) rotate(0deg);
    opacity: 1;
  }
}
@keyframes flashOut {
  0% {
    opacity: 1;
  }
  20% {
    opacity: 0;
  }
  100% {
    opacity: 0;
  }
}
</style>

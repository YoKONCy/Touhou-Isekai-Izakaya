<template>
  <!-- 顶部状态栏：回合计数 + 行动阶段 + 战斗日志摘要 -->
  <div
    class="absolute top-0 left-0 w-full p-6 flex justify-between items-start bg-gradient-to-b from-black/80 to-transparent"
  >
    <div class="flex flex-col">
      <div
        class="text-6xl font-black italic font-display text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-red-600 drop-shadow-lg tracking-tighter"
      >
        回合 {{ turn }}
      </div>
      <div class="text-sm text-gray-400 font-mono mt-1 tracking-widest uppercase">
        阶段: {{ phase === 'player' ? '玩家行动' : '敌方回合' }}
        <span v-if="selectionMode" class="text-red-500 font-bold animate-pulse ml-4"
          >&gt;&gt; 请选择目标 &lt;&lt;</span
        >
        <span v-if="isActing" class="text-yellow-500 font-bold animate-pulse ml-4"
          >&gt;&gt; 正在执行... &lt;&lt;</span
        >
      </div>

      <!-- 消息轮播/战斗日志 HUD -->
      <div
        class="mt-4 w-[450px] flex flex-col gap-1 transition-all duration-300 ease-out origin-top-left relative group/log"
        :class="[
          isLogExpanded
            ? 'pointer-events-auto h-[500px] overflow-y-auto bg-black/90 border border-white/20 backdrop-blur-md p-4 rounded-lg z-[100] shadow-2xl custom-scrollbar'
            : 'pointer-events-auto mask-image-fade min-h-[100px] max-h-[150px] overflow-hidden cursor-pointer hover:bg-black/20 rounded'
        ]"
        @click="$emit('toggle-log')"
      >
        <div
          v-if="isLogExpanded"
          class="flex justify-between items-center mb-2 sticky top-0 bg-black/95 pb-2 border-b border-white/10 z-10"
        >
          <span class="text-white font-bold font-display italic">战斗日志</span>
          <span class="text-xs text-gray-400 font-mono hover:text-white transition-colors"
            >[点击关闭]</span
          >
        </div>

        <transition-group name="log-fade" tag="div" class="flex flex-col gap-1">
          <!-- 正在输入的流式文本 -->
          <div
            v-if="streamingNarrative"
            key="streaming"
            class="text-sm font-mono text-shadow-sm flex gap-2 items-start text-blue-300 animate-pulse"
          >
            <span class="font-bold whitespace-nowrap drop-shadow-md">[旁白]</span>
            <span class="drop-shadow-md leading-tight"
              >{{ streamingNarrative
              }}<span class="inline-block w-1 h-4 bg-blue-400 animate-blink ml-1"></span
            ></span>
          </div>
          <div
            v-for="log in isLogExpanded ? combatLogs : combatLogs.slice(0, 5)"
            :key="log.id"
            class="text-sm font-mono text-shadow-sm flex gap-2 items-start"
          >
            <span class="text-yellow-400 font-bold whitespace-nowrap drop-shadow-md"
              >回合 {{ log.turn }}</span
            >
            <span class="text-white/90 drop-shadow-md leading-tight">{{ log.content }}</span>
          </div>
        </transition-group>

        <div
          v-if="!isLogExpanded"
          class="absolute bottom-0 w-full text-center pb-1 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover/log:opacity-100 transition-opacity pointer-events-none"
        >
          <span class="text-[10px] text-gray-300 font-mono tracking-widest uppercase"
            >点击展开历史记录</span
          >
        </div>
      </div>
    </div>

    <!-- 退出/完成结算按钮 -->
    <button
      v-if="isGameOver"
      @click="$emit('close-combat')"
      class="pointer-events-auto px-4 py-2 bg-white/10 hover:bg-red-600 text-white rounded font-bold transition-colors border border-white/20 animate-bounce-in"
    >
      战斗结束
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  turn: number;
  phase: 'player' | 'ally' | 'enemy';
  selectionMode: boolean;
  isActing: boolean;
  isLogExpanded: boolean;
  streamingNarrative: string;
  combatLogs: Array<{ id: number; turn: number; content: string }>;
  isGameOver: boolean;
}>();

defineEmits<{
  'toggle-log': [];
  'close-combat': [];
}>();
</script>

<style scoped>
.mask-image-fade {
  mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
}
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.2);
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(239, 68, 68, 0.3);
  border-radius: 3px;
}
.log-fade-enter-active,
.log-fade-leave-active {
  transition: all 0.5s ease;
}
.log-fade-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}
.log-fade-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}
.animate-bounce-in {
  animation: bounceIn 0.5s cubic-bezier(0.68, -0.55, 0.27, 1.55) forwards;
}
.animate-blink {
  animation: blink 1s step-end infinite;
}
@keyframes bounceIn {
  0% {
    transform: scale(0.5);
    opacity: 0;
  }
  60% {
    transform: scale(1.1);
    opacity: 1;
  }
  100% {
    transform: scale(1);
  }
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
</style>

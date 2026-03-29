<template>
  <div
    v-if="pendingQuest && visible"
    class="fixed inset-0 bg-stone-900/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in font-sans"
  >
    <div
      class="group relative bg-stone-50 dark:bg-stone-900 rounded-xl max-w-lg w-full shadow-2xl overflow-hidden transform transition-all border-2 border-izakaya-wood/30"
    >
      <!-- 背景纹理 (Texture) 喵 -->
      <div class="absolute inset-0 pointer-events-none opacity-40 bg-texture-rice-paper z-0"></div>

      <!-- 顶部标题栏 (Header) 喵 -->
      <div
        class="relative z-10 bg-touhou-red text-white p-5 flex justify-between items-center shadow-md"
      >
        <div class="absolute inset-0 bg-texture-stardust opacity-20 animate-pulse-slow"></div>
        <div class="relative font-bold font-display text-xl flex items-center gap-3 tracking-wide">
          <span class="text-2xl filter drop-shadow">📜</span>
          <span class="drop-shadow-sm">新任务委托</span>
        </div>
      </div>

      <!-- 委托内容详情 (Content) 喵 -->
      <div class="p-8 space-y-6 relative z-10">
        <div class="text-center mb-4">
          <h2 class="text-3xl font-bold font-display text-izakaya-wood dark:text-stone-200 mb-2">
            {{ pendingQuest.name }}
          </h2>
          <div
            class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-touhou-red/10 border border-touhou-red/20 text-touhou-red font-bold font-serif text-sm"
          >
            <span class="opacity-70">委托人:</span>
            {{ pendingQuest.giver }}
          </div>
        </div>

        <div
          class="bg-white/60 dark:bg-stone-800/60 p-6 rounded-xl border border-izakaya-wood/10 dark:border-stone-700 text-izakaya-wood dark:text-stone-300 font-serif text-lg leading-relaxed relative shadow-inner"
        >
          <span
            class="absolute top-2 left-3 text-5xl text-izakaya-wood/10 dark:text-white/5 font-serif leading-none font-bold"
            >“</span
          >
          <p class="relative z-10 italic text-center px-4">{{ pendingQuest.description }}</p>
          <span
            class="absolute bottom-[-10px] right-4 text-5xl text-izakaya-wood/10 dark:text-white/5 font-serif leading-none transform rotate-180 font-bold"
            >“</span
          >
        </div>

        <div v-if="pendingQuest.requirements && pendingQuest.requirements.length > 0" class="mt-4">
          <h3
            class="font-bold font-display text-izakaya-wood dark:text-stone-200 mb-2 flex items-center gap-2 text-sm opacity-80"
          >
            <span class="w-1 h-4 bg-izakaya-wood rounded-full"></span>
            具体要求
          </h3>
          <ul class="space-y-2 bg-white/40 p-4 rounded-lg border border-izakaya-wood/5">
            <li
              v-for="(req, idx) in pendingQuest.requirements"
              :key="idx"
              class="flex items-start gap-3 text-izakaya-wood/90 dark:text-stone-300 font-serif"
            >
              <span class="text-touhou-red font-bold mt-0.5">▪</span>
              <span>{{ req }}</span>
            </li>
          </ul>
        </div>

        <div v-if="pendingQuest.rewards && pendingQuest.rewards.length > 0" class="mt-6">
          <h3
            class="font-bold font-display text-izakaya-wood dark:text-stone-200 mb-3 flex items-center gap-2 text-lg"
          >
            <span
              class="w-1.5 h-5 bg-marisa-gold rounded-full shadow-[0_0_10px_rgba(251,191,36,0.5)]"
            ></span>
            完成奖励
          </h3>
          <div class="space-y-3">
            <div
              v-for="(reward, idx) in pendingQuest.rewards"
              :key="idx"
              class="flex items-center gap-4 bg-white/80 dark:bg-stone-800/80 p-3 rounded-lg border border-izakaya-wood/10 dark:border-stone-700 hover:border-marisa-gold/50 transition-colors group/reward shadow-sm"
            >
              <div
                class="w-10 h-10 flex items-center justify-center bg-marisa-gold/10 text-marisa-gold rounded-full border border-marisa-gold/20 group-hover/reward:scale-110 transition-transform"
              >
                <!-- 此处可根据奖励类型动态展示对应图标 喵 -->
                <span class="text-lg">{{ getRewardTypeIcon(reward.type) }}</span>
              </div>
              <div class="flex-1">
                <div
                  class="font-bold font-display text-izakaya-wood dark:text-stone-200 group-hover/reward:text-marisa-gold transition-colors"
                >
                  {{ reward.description }}
                </div>
                <div
                  v-if="reward.value"
                  class="text-xs text-izakaya-wood/60 dark:text-stone-400 font-serif mt-0.5 font-bold"
                >
                  {{ formatRewardValue(reward) }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 操作按钮（接受/拒绝） (Actions) 喵 -->
      <div
        class="p-6 bg-stone-100/50 dark:bg-stone-800/50 border-t border-izakaya-wood/10 dark:border-stone-700 flex justify-end gap-4 relative z-10"
      >
        <button
          @click="handleDecline"
          class="px-5 py-2.5 font-display text-izakaya-wood/70 dark:text-stone-400 hover:text-touhou-red hover:bg-touhou-red/5 rounded-lg transition-colors border border-transparent hover:border-touhou-red/10"
        >
          残忍拒绝
        </button>
        <button
          @click="handleAccept"
          class="px-8 py-2.5 bg-touhou-red hover:bg-red-700 text-white font-bold font-display rounded-lg shadow-lg hover:shadow-touhou-red/40 transform hover:-translate-y-0.5 transition-all flex items-center gap-2 group/btn"
        >
          <span class="group-hover/btn:scale-125 transition-transform duration-300">✍️</span>
          接受委托
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useGameStore } from '@/stores/game';
import { useToastStore } from '@/stores/toast';
import { audioManager } from '@/services/audio';

const gameStore = useGameStore();
const toastStore = useToastStore();

const props = defineProps<{
  visible?: boolean;
}>();

const emit = defineEmits(['close']);

const pendingQuest = computed(() => gameStore.state.system.pending_quest_trigger);

watch(
  () => pendingQuest.value,
  (newVal) => {
    if (newVal) {
      audioManager.playPopupSound();
    }
  }
);

function getRewardTypeIcon(type: string) {
  const map: Record<string, string> = {
    money: '💰',
    item: '📦',
    spell_card: '🎴',
    attribute: '💪',
    event: '❤️'
  };
  return map[type] || '🎁';
}

function formatRewardValue(reward: any) {
  if (!reward.value) return '';

  // 针对“名称,类型”格式的物品，仅截取显示名称 喵
  if (reward.type === 'item' && typeof reward.value === 'string' && reward.value.includes(',')) {
    return reward.value.split(',')[0];
  }

  // 针对金钱或其他简单数值，按原样展示 喵 (数值会被自动转为字符串)
  return reward.value;
}

function handleAccept() {
  audioManager.playClick();
  if (pendingQuest.value) {
    const quest = {
      ...pendingQuest.value,
      status: 'active' as const,
      acceptedTurn: gameStore.state.system.turn_count
    };
    gameStore.addQuest(quest);
    gameStore.setPendingQuest(null);
    toastStore.addToast(`已接受任务：${quest.name}`, 'success');
    emit('close');
  }
}

function handleDecline() {
  audioManager.playSoftClick();
  if (pendingQuest.value) {
    gameStore.setPendingQuest(null);
    toastStore.addToast('已拒绝委托', 'info');
    emit('close');
  }
}
</script>

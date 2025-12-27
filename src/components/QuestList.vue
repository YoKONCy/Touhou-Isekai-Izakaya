<template>
  <div class="flex flex-col h-full bg-izakaya-paper shadow-floating rounded-none border-x-4 border-y border-x-izakaya-wood/20 border-y-izakaya-wood/10 overflow-hidden relative">
    <!-- Texture Overlay -->
    <div class="absolute inset-0 pointer-events-none opacity-30 bg-texture-rice-paper mix-blend-multiply z-0"></div>

    <!-- Main Category Switcher (Quest vs Promise) -->
    <div class="border-b border-izakaya-wood/20 bg-izakaya-wood/5 relative z-10">
      <button 
        @click="viewMode = viewMode === 'quests' ? 'promises' : 'quests'"
        class="w-full py-2.5 flex items-center justify-center gap-3 text-sm font-bold font-display tracking-wider transition-all duration-300 group hover:bg-white/40 text-izakaya-wood relative overflow-hidden"
      >
        <!-- Quests Label -->
        <span class="transition-all duration-300 relative z-10" :class="viewMode === 'quests' ? 'opacity-100 scale-105 text-touhou-red' : 'opacity-40 scale-95'">任务栏</span>
        
        <!-- Switch Icon -->
        <span class="text-xs opacity-30 group-hover:opacity-60 transition-opacity relative z-10">⇄</span>
        
        <!-- Promises Label -->
        <span class="transition-all duration-300 relative z-10" :class="viewMode === 'promises' ? 'opacity-100 scale-105 text-blue-600' : 'opacity-40 scale-95'">约定栏</span>
        
        <!-- Sliding Indicator Background -->
        <div class="absolute bottom-0 h-0.5 transition-all duration-500 ease-out z-0"
             :class="viewMode === 'quests' ? 'left-0 w-1/2 bg-touhou-red' : 'left-1/2 w-1/2 bg-blue-500'"></div>
      </button>
    </div>

    <!-- Status Tabs (Active vs Completed) -->
    <div class="flex border-b border-izakaya-wood/10 bg-white/20 relative z-10">
      <button 
        @click="switchTab('active')"
        class="flex-1 py-3 text-xs font-bold font-display tracking-wider transition-all duration-300 relative"
        :class="currentTab === 'active' ? 'text-touhou-red' : 'text-izakaya-wood/50 hover:text-izakaya-wood hover:bg-white/40'"
      >
        <span class="relative z-10">进行中</span>
        <div v-if="currentTab === 'active'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-touhou-red shadow-[0_0_8px_rgba(211,47,47,0.4)]"></div>
      </button>
      <button 
        @click="switchTab('completed')"
        class="flex-1 py-3 text-xs font-bold font-display tracking-wider transition-all duration-300 relative"
        :class="currentTab === 'completed' ? 'text-izakaya-wood' : 'text-izakaya-wood/50 hover:text-izakaya-wood hover:bg-white/40'"
      >
        <span class="relative z-10">已结束</span>
        <div v-if="currentTab === 'completed'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-izakaya-wood/50"></div>
      </button>
    </div>

    <!-- Content Area -->
    <div class="flex-1 overflow-y-auto min-h-0 space-y-2 p-2 custom-scrollbar relative z-10 overscroll-contain" style="-webkit-overflow-scrolling: touch;">
      
      <!-- QUESTS VIEW -->
      <template v-if="viewMode === 'quests'">
        <!-- Active Quests -->
        <template v-if="currentTab === 'active'">
          <div v-if="activeQuests.length === 0" class="text-xs text-izakaya-wood/40 py-8 text-center font-serif">
            <div class="mb-2 opacity-50 text-xl">📭</div>
            暂无进行中的任务
          </div>
          <div 
            v-for="quest in activeQuests" 
            :key="quest.id"
            class="bg-white/60 p-3 rounded shadow-sm border border-izakaya-wood/10 cursor-pointer hover:bg-white hover:border-touhou-red/20 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group"
            @click="handleSelectQuest(quest)"
          >
            <div class="flex justify-between items-start gap-2">
              <div class="text-sm font-bold font-display text-izakaya-wood group-hover:text-touhou-red transition-colors">{{ quest.name }}</div>
              <span class="text-[10px] bg-touhou-red/10 text-touhou-red px-1.5 py-0.5 rounded border border-touhou-red/20 whitespace-nowrap">进行中</span>
            </div>
            <div class="text-xs text-izakaya-wood/60 mt-2 flex items-center gap-1 font-serif">
                <span class="w-1.5 h-1.5 rounded-full bg-izakaya-wood/20"></span>
                发布人: {{ quest.giver }}
            </div>
          </div>
        </template>

        <!-- Completed Quests -->
        <template v-else>
          <div v-if="completedQuests.length === 0" class="text-xs text-izakaya-wood/40 py-8 text-center font-serif">
            <div class="mb-2 opacity-50 text-xl">📜</div>
            暂无已结束的任务
          </div>
          <div 
            v-for="quest in completedQuests" 
            :key="quest.id"
            class="bg-izakaya-wood/5 p-3 rounded border border-izakaya-wood/5 cursor-pointer hover:bg-white/40 transition-all duration-300 opacity-80 hover:opacity-100"
            @click="handleSelectQuest(quest)"
          >
            <div class="flex justify-between items-start">
              <div class="text-sm font-medium font-display text-izakaya-wood/60 line-through decoration-izakaya-wood/30">{{ quest.name }}</div>
              <span 
                class="text-[10px] px-1.5 py-0.5 rounded border"
                :class="quest.status === 'completed' ? 'bg-green-100/50 text-green-700 border-green-200/50' : 'bg-red-100/50 text-red-700 border-red-200/50'"
              >
                {{ quest.status === 'completed' ? '完成' : '失败' }}
              </span>
            </div>
            <div class="text-xs text-izakaya-wood/40 mt-1 font-serif">发布人: {{ quest.giver }}</div>
          </div>
        </template>
      </template>

      <!-- PROMISES VIEW -->
      <template v-else>
        <!-- Active Promises -->
        <template v-if="currentTab === 'active'">
          <div v-if="activePromises.length === 0" class="text-xs text-izakaya-wood/40 py-8 text-center font-serif">
            <div class="mb-2 opacity-50 text-xl">🤝</div>
            暂无进行中的约定
          </div>
          <div 
            v-for="promise in activePromises" 
            :key="promise.id"
            class="bg-white/60 p-3 rounded shadow-sm border border-izakaya-wood/10 cursor-pointer hover:bg-white hover:border-blue-500/20 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group"
            @click="handleSelectPromise(promise)"
          >
            <div class="flex justify-between items-start gap-2">
               <div class="text-sm font-bold font-display text-izakaya-wood group-hover:text-blue-600 transition-colors line-clamp-2">{{ promise.content }}</div>
               <span class="text-[10px] bg-blue-500/10 text-blue-600 px-1.5 py-0.5 rounded border border-blue-500/20 whitespace-nowrap">约定</span>
            </div>
            <div class="text-xs text-izakaya-wood/60 mt-2 flex items-center gap-1 font-serif justify-between">
                <span class="flex items-center gap-1">
                   <span class="w-1.5 h-1.5 rounded-full bg-blue-400/40"></span>
                   {{ promise.giver }}
                </span>
                <span class="text-[10px] opacity-70">{{ promise.createdTime.split(' ')[1] }}</span>
            </div>
          </div>
        </template>

        <!-- Completed Promises -->
        <template v-else>
          <div v-if="completedPromises.length === 0" class="text-xs text-izakaya-wood/40 py-8 text-center font-serif">
            <div class="mb-2 opacity-50 text-xl">📓</div>
            暂无已结束的约定
          </div>
          <div 
            v-for="promise in completedPromises" 
            :key="promise.id"
            class="bg-izakaya-wood/5 p-3 rounded border border-izakaya-wood/5 cursor-pointer hover:bg-white/40 transition-all duration-300 opacity-80 hover:opacity-100"
            @click="handleSelectPromise(promise)"
          >
            <div class="flex justify-between items-start">
              <div class="text-sm font-medium font-display text-izakaya-wood/60 line-through decoration-izakaya-wood/30 line-clamp-2">{{ promise.content }}</div>
              <span 
                class="text-[10px] px-1.5 py-0.5 rounded border"
                :class="promise.status === 'completed' ? 'bg-green-100/50 text-green-700 border-green-200/50' : 'bg-gray-100/50 text-gray-700 border-gray-200/50'"
              >
                {{ promise.status === 'completed' ? '达成' : '失效' }}
              </span>
            </div>
            <div class="text-xs text-izakaya-wood/40 mt-1 font-serif flex justify-between">
               <span>{{ promise.giver }}</span>
               <span>{{ promise.completedTime?.split(' ')[1] }}</span>
            </div>
          </div>
        </template>
      </template>

    </div>

    <!-- Details Modal (Quests Only) -->
    <div v-if="selectedQuest" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-izakaya-wood/20 backdrop-blur-sm animate-fade-in" @click.self="handleCloseQuest">
      <div class="bg-izakaya-paper w-full max-w-md rounded-xl shadow-paper border border-izakaya-wood/10 relative overflow-hidden flex flex-col max-h-[80vh]">
        <!-- Texture -->
        <div class="absolute inset-0 pointer-events-none opacity-10 bg-texture-rice-paper"></div>

        <div class="p-5 border-b border-izakaya-wood/10 relative z-10 bg-white/40 flex justify-between items-start">
          <div>
              <h3 class="text-lg font-bold font-display text-izakaya-wood flex items-center gap-2">
                <span class="text-touhou-red">◈</span>
                {{ selectedQuest.name }}
              </h3>
              <div class="flex items-center gap-2 mt-1">
                 <span class="text-xs font-serif text-izakaya-wood/60">发布人: {{ selectedQuest.giver }}</span>
                 <span 
                    v-if="selectedQuest.status !== 'active'"
                    class="px-1.5 py-0.5 text-[10px] font-bold rounded border"
                    :class="selectedQuest.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'"
                >
                    {{ selectedQuest.status === 'completed' ? '已完成' : '已失败' }}
                </span>
              </div>
          </div>
          <button @click="handleCloseQuest" class="text-izakaya-wood/40 hover:text-touhou-red transition-colors">
             <span class="text-xl">×</span>
          </button>
        </div>
        
        <div class="flex-1 overflow-y-auto p-6 space-y-5 text-sm relative z-10 custom-scrollbar">
          
          <div class="bg-white/50 p-4 rounded-lg border border-izakaya-wood/5 text-izakaya-wood/80 leading-relaxed font-serif shadow-sm">
            {{ selectedQuest.description }}
          </div>
          
          <div v-if="selectedQuest.requirements && selectedQuest.requirements.length > 0">
            <div class="font-bold font-display text-izakaya-wood mb-2 text-xs opacity-70">具体要求</div>
            <ul class="space-y-1">
              <li v-for="(req, idx) in selectedQuest.requirements" :key="idx" class="flex items-start gap-2 text-izakaya-wood/80 text-sm font-serif">
                <span class="text-izakaya-wood/40 mt-1 text-[10px]">●</span>
                <span>{{ req }}</span>
              </li>
            </ul>
          </div>
          
          <div v-if="selectedQuest.completionSummary" class="bg-marisa-gold/5 p-4 rounded-lg border border-marisa-gold/20">
            <div class="font-bold font-display text-marisa-gold-dim mb-1 flex items-center gap-2">
                <span class="text-lg">📜</span> 结案
            </div>
            <div class="italic text-izakaya-wood/80 font-serif">{{ selectedQuest.completionSummary }}</div>
          </div>

          <div v-if="selectedQuest.rewards && selectedQuest.rewards.length > 0">
            <div class="font-bold font-display text-izakaya-wood mb-2 border-b border-izakaya-wood/10 pb-1">奖励</div>
            <ul class="space-y-2">
              <li v-for="(reward, idx) in selectedQuest.rewards" :key="idx" class="flex items-start gap-2 text-izakaya-wood/80">
                <span class="text-touhou-red mt-0.5">◆</span>
                <span>
                    <span class="text-marisa-gold-dim font-bold text-xs bg-marisa-gold/10 px-1 rounded mr-1">[{{ getRewardTypeName(reward.type) }}]</span> 
                    {{ reward.description }}
                    <span v-if="reward.value" class="text-izakaya-wood/50 text-xs ml-1 font-mono">({{ formatRewardValue(reward) }})</span>
                </span>
              </li>
            </ul>
          </div>

          <div class="text-xs text-izakaya-wood/40 pt-4 border-t border-izakaya-wood/10 space-y-1 font-mono">
            <div>接受于第 {{ selectedQuest.acceptedTurn }} 轮</div>
            <div v-if="selectedQuest.completedTurn">
              结束于第 {{ selectedQuest.completedTurn }} 轮
              <span v-if="selectedQuest.completedDate">({{ selectedQuest.completedDate }} {{ selectedQuest.completedTime }})</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Details Modal (Promises) -->
    <div v-if="selectedPromise" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-izakaya-wood/20 backdrop-blur-sm animate-fade-in" @click.self="handleClosePromise">
      <div class="bg-izakaya-paper w-full max-w-md rounded-xl shadow-paper border border-izakaya-wood/10 relative overflow-hidden flex flex-col max-h-[80vh]">
        <!-- Texture -->
        <div class="absolute inset-0 pointer-events-none opacity-10 bg-texture-rice-paper"></div>

        <div class="p-5 border-b border-izakaya-wood/10 relative z-10 bg-white/40 flex justify-between items-start">
          <div>
              <h3 class="text-lg font-bold font-display text-izakaya-wood flex items-center gap-2">
                <span class="text-blue-600">◈</span>
                约定详情
              </h3>
              <div class="flex items-center gap-2 mt-1">
                 <span class="text-xs font-serif text-izakaya-wood/60">相关方: {{ selectedPromise.giver }}</span>
                 <span 
                    v-if="selectedPromise.status !== 'active'"
                    class="px-1.5 py-0.5 text-[10px] font-bold rounded border"
                    :class="selectedPromise.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-700 border-gray-200'"
                >
                    {{ selectedPromise.status === 'completed' ? '已达成' : (selectedPromise.status === 'expired' ? '已失效' : '已失败') }}
                </span>
              </div>
          </div>
          <button @click="handleClosePromise" class="text-izakaya-wood/40 hover:text-touhou-red transition-colors">
             <span class="text-xl">×</span>
          </button>
        </div>
        
        <div class="flex-1 overflow-y-auto p-6 space-y-5 text-sm relative z-10 custom-scrollbar">
          
          <div class="bg-white/50 p-4 rounded-lg border border-izakaya-wood/5 text-izakaya-wood/80 leading-relaxed font-serif shadow-sm">
            {{ selectedPromise.content }}
          </div>
          
          <div class="text-xs text-izakaya-wood/40 pt-4 border-t border-izakaya-wood/10 space-y-1 font-mono">
            <div>立誓于第 {{ selectedPromise.acceptedTurn }} 轮</div>
            <div class="opacity-70">{{ selectedPromise.createdTime }}</div>
            <div v-if="selectedPromise.completedTurn" class="mt-2 pt-2 border-t border-dashed border-izakaya-wood/10">
              结束于第 {{ selectedPromise.completedTurn }} 轮
              <span v-if="selectedPromise.completedDate">
                <br>({{ selectedPromise.completedDate }} {{ selectedPromise.completedTime }})
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useGameStore } from '@/stores/game';
import type { Quest, PromiseState } from '@/types/game';
import { audioManager } from '@/services/audio';

const gameStore = useGameStore();
const currentTab = ref<'active' | 'completed'>('active');
const viewMode = ref<'quests' | 'promises'>('quests');

const activeQuests = computed(() => {
  return (gameStore.state.system.quests || []).filter(q => q.status === 'active');
});

const completedQuests = computed(() => {
  return (gameStore.state.system.quests || [])
    .filter(q => q.status === 'completed' || q.status === 'failed')
    .sort((a, b) => (b.completedTurn || 0) - (a.completedTurn || 0)); // Newest first
});

const activePromises = computed(() => {
  return (gameStore.state.system.promises || []).filter(p => p.status === 'active');
});

const completedPromises = computed(() => {
  return (gameStore.state.system.promises || [])
    .filter(p => p.status === 'completed' || p.status === 'failed' || p.status === 'expired')
    .sort((a, b) => (b.completedTurn || 0) - (a.completedTurn || 0));
});

const selectedQuest = ref<Quest | null>(null);
const selectedPromise = ref<PromiseState | null>(null);

function switchTab(tab: 'active' | 'completed') {
  currentTab.value = tab;
  audioManager.playSoftClick();
}

function handleSelectQuest(quest: Quest) {
  selectedQuest.value = quest;
  audioManager.playPageFlip();
}

function handleCloseQuest() {
  selectedQuest.value = null;
  audioManager.playSoftClick();
}

function handleSelectPromise(promise: PromiseState) {
  selectedPromise.value = promise;
  audioManager.playPageFlip();
}

function handleClosePromise() {
  selectedPromise.value = null;
  audioManager.playSoftClick();
}

function getRewardTypeName(type: string) {
  const map: Record<string, string> = {
    'money': '金钱',
    'item': '物品',
    'spell_card': '符卡',
    'attribute': '属性',
    'event': '事件'
  };
  return map[type] || type;
}

function formatRewardValue(reward: any) {
  if (!reward.value) return '';
  if (reward.type === 'item' && typeof reward.value === 'string' && reward.value.includes(',')) {
    return reward.value.split(',')[0];
  }
  return reward.value;
}
</script>

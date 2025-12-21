<script setup lang="ts">
import { onMounted, ref, nextTick, watch, computed } from 'vue';
import { useGameStore } from '@/stores/game';
import { useChatStore } from '@/stores/chat';
import { useSettingsStore } from '@/stores/settings';
import { useSaveStore } from '@/stores/save';
import StatusCard from '@/components/StatusCard.vue';
import ChatBubble from '@/components/ChatBubble.vue';
import MapPlaceholder from '@/components/MapPlaceholder.vue';
import CharacterList from '@/components/CharacterList.vue';
import SettingsModal from '@/components/SettingsModal.vue';
import CharacterEditor from '@/components/CharacterEditor.vue';
import SaveManager from '@/components/SaveManager.vue';
import MemoryPanel from '@/components/MemoryPanel.vue';
import SummaryModal from '@/components/SummaryModal.vue';
import ToastContainer from '@/components/ToastContainer.vue';
import { Send, Settings as SettingsIcon, Save, Loader2, Square, Book, Database, Blocks, Brain, Hammer } from 'lucide-vue-next';
import PromptBuilder from '@/components/PromptBuilder.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import CombatOverlay from '@/components/CombatOverlay.vue';
import IzakayaGame from '@/components/management/IzakayaGame.vue';
import QuestList from '@/components/QuestList.vue';
import QuestOfferModal from '@/components/QuestOfferModal.vue';
import { gameLoop } from '@/services/gameLoop';
import { parseMarkdown } from '@/utils/markdown';
import { useSmoothStream } from '@/composables/useSmoothStream';
import SakuraBackground from '@/components/SakuraBackground.vue';
import { audioManager } from '@/services/audio';

const chatStore = useChatStore();
const settingsStore = useSettingsStore();
const saveStore = useSaveStore();
const gameStore = useGameStore();

// Setup smooth streaming
const { displayed: smoothContent } = useSmoothStream(
  gameLoop.streamedContent,
  gameLoop.isProcessing,
  { minChunkSize: 20, typingSpeed: 25 }
);

const userInput = ref('');
const isInputFocused = ref(false);

const shouldRegenerateMap = computed({
  get: () => gameStore.state.system.regenerateMapOnTrigger || false,
  set: (val) => {
    gameStore.updateState({
      system: {
        ...gameStore.state.system,
        regenerateMapOnTrigger: val
      }
    });
  }
});

const chatContainer = ref<HTMLElement | null>(null);
const isSettingsOpen = ref(false);
const isCharEditorOpen = ref(false);
const isSaveManagerOpen = ref(false);
const isPromptBuilderOpen = ref(false);
const isMemoryPanelOpen = ref(false);
const isSummaryModalOpen = ref(false);
const summaryTurnCount = ref(20);

// Scroll to bottom when messages change
watch(() => chatStore.messages.length, () => {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
    }
  });
});

onMounted(async () => {
  await settingsStore.loadSettings();
  
  // Init Audio
  audioManager.setVolume(settingsStore.audioVolume);
  audioManager.setMute(!settingsStore.enableAudio);
  audioManager.setBgmVolume(settingsStore.bgmVolume);
  audioManager.setSfxVolume(settingsStore.sfxVolume);

  // Init Theme
  watch(() => settingsStore.theme, (newTheme) => {
    const html = document.documentElement;
    html.classList.remove('dark', 'theme-dark', 'theme-eye-protection');
    
    if (newTheme === 'dark') {
      html.classList.add('dark', 'theme-dark');
    } else if (newTheme === 'eye-protection') {
      html.classList.add('theme-eye-protection');
    }
  }, { immediate: true });

  await saveStore.init(); // This will load history for the active save
});

async function handleSend() {
  const content = userInput.value.trim();
  if (!content || gameLoop.isProcessing.value || gameLoop.isBackgroundProcessing.value) return;
  
  // Clear input immediately to prevent double send
  userInput.value = '';
  gameStore.clearQuickReplies(); // Clear quick replies on new action
  
  audioManager.playClick();
  await gameLoop.handleUserAction(content);
}

function handleQuickReply(reply: string) {
  audioManager.playClick();
  userInput.value = reply;
  handleSend();
}

async function handleInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    await handleSend();
  }
}

function handleAbort() {
  gameLoop.abort();
  audioManager.playSoftClick();
}

function handleOpenSummary(turnCount: number) {
  summaryTurnCount.value = turnCount;
  isSummaryModalOpen.value = true;
}

function handleManagementClose() {
  if (gameStore.state.system.management) {
    gameStore.state.system.management.isActive = false;
  }
}
</script>

<template>
  <div class="h-screen flex flex-col overflow-hidden font-sans text-ink relative">
    
    <SakuraBackground />
    <ToastContainer />

    <!-- Top Bar: 居酒屋暖帘风格 -->
    <header class="h-14 bg-white/90 backdrop-blur-md border-b-2 border-touhou-red/20 flex items-center justify-between px-6 shadow-sm z-20 flex-shrink-0 relative">
      <!-- 装饰性纹理叠加 -->
      <div class="absolute inset-0 pointer-events-none opacity-5 bg-texture-stardust"></div>
      
      <div class="font-display font-bold text-xl flex items-center gap-3 relative z-10 text-izakaya-wood">
        <span class="text-2xl filter drop-shadow-sm">⛩️</span>
        <div class="flex items-center gap-2">
          <span class="tracking-widest font-serif-display text-2xl">东方异界食堂</span>
          <span class="px-1.5 py-0.5 text-[10px] font-bold text-white bg-touhou-red rounded-sm uppercase tracking-wider shadow-sm transform translate-y-0.5">beta</span>
        </div>
      </div>
      
      <div class="flex items-center gap-2 relative z-10">
        <button 
          @click="isSaveManagerOpen = true; audioManager.playPageFlip()"
          class="btn-touhou-ghost flex items-center gap-2"
          title="切换/管理存档"
        >
          <Save class="w-5 h-5" />
          <span v-if="saveStore.currentSaveId" class="text-sm font-display font-medium max-w-[100px] truncate hidden md:inline-block">
            {{ saveStore.saves.find(s => s.id === saveStore.currentSaveId)?.name }}
          </span>
        </button>
        <button @click="isCharEditorOpen = true; audioManager.playPageFlip()" class="btn-touhou-ghost" title="条目编辑器 (Lorebook)">
          <Book class="w-5 h-5" />
        </button>
        <button @click="isMemoryPanelOpen = true; audioManager.playPageFlip()" class="btn-touhou-ghost" title="记忆库 (Memory)">
          <Database class="w-5 h-5" />
        </button>
        <button @click="isPromptBuilderOpen = true; audioManager.playPageFlip()" class="btn-touhou-ghost" title="提示词拼接中心">
          <Blocks class="w-5 h-5" />
        </button>
        <button @click="isSettingsOpen = true; audioManager.playPageFlip()" class="btn-touhou-ghost" title="设置">
          <SettingsIcon class="w-5 h-5" />
        </button>
      </div>
    </header>

    <!-- Settings Modal -->
    <SettingsModal :is-open="isSettingsOpen" @close="isSettingsOpen = false" @open-summary="handleOpenSummary" />
    <CharacterEditor :is-open="isCharEditorOpen" @close="isCharEditorOpen = false" />
    <SaveManager :is-open="isSaveManagerOpen" @close="isSaveManagerOpen = false" />
    <MemoryPanel :is-open="isMemoryPanelOpen" @close="isMemoryPanelOpen = false" />
    <SummaryModal :is-open="isSummaryModalOpen" @close="isSummaryModalOpen = false" :turn-count="summaryTurnCount" />
    <PromptBuilder :is-open="isPromptBuilderOpen" @close="isPromptBuilderOpen = false" />
    <ConfirmDialog />
    <CombatOverlay />
    <IzakayaGame v-if="gameStore.state.system.management?.isActive" @close="handleManagementClose" />
    <QuestOfferModal />

    <!-- Main Content -->
    <div class="flex-1 flex overflow-hidden relative z-10">
      
      <!-- Left Sidebar (Status) -->
      <aside class="w-72 bg-izakaya-paper/60 backdrop-blur-md border-r border-izakaya-wood/10 p-4 hidden md:flex flex-col gap-4 h-full shadow-[2px_0_10px_rgba(0,0,0,0.02)] overflow-y-auto custom-scrollbar">
        <StatusCard class="flex-shrink-0" />
        <QuestList class="flex-1 min-h-[300px]" />
      </aside>

      <!-- Center (Chat) -->
      <main class="flex-1 flex flex-col relative min-w-0">
        <!-- Chat Area -->
        <div ref="chatContainer" class="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
          <div v-if="chatStore.messages.length === 0" class="text-center text-izakaya-wood/50 mt-20 flex flex-col items-center gap-4">
            <div class="text-4xl opacity-50 filter drop-shadow-sm">🍵</div>
            <p class="font-display text-lg">还没有任何对话...</p>
            <p class="text-sm">点一杯茶，开始你的幻想乡物语吧。</p>
          </div>
          <ChatBubble v-for="msg in chatStore.messages" :key="msg.id" :message="msg" />
          
          <!-- Loading Indicator / Stream Buffer -->
          <div v-if="gameLoop.isProcessing.value" class="flex gap-4 mb-6 px-4 group/message">
             <div class="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-md border-2 border-white/50 relative overflow-hidden bg-touhou-red text-white">
                <Loader2 class="w-6 h-6 animate-spin relative z-10" />
             </div>
             
             <div class="relative max-w-[85%] flex flex-col items-start">
               <div class="p-5 rounded-2xl shadow-sm leading-relaxed relative bg-izakaya-paper border border-touhou-red/10 text-izakaya-wood font-serif-display rounded-tl-sm shadow-paper-hover">
                  <!-- Texture -->
                  <div class="absolute inset-0 pointer-events-none opacity-10 bg-texture-rice-paper rounded-2xl"></div>
                  
                  <div class="relative z-10 min-w-[60px]">
                       <div v-if="gameLoop.currentStage.value === 'preparing'" class="text-sm text-izakaya-wood/60 animate-pulse flex items-center gap-2">
                         <Loader2 class="w-3 h-3 animate-spin" />
                         <span>正在构建上下文...</span>
                       </div>
                       <div v-else-if="gameLoop.currentStage.value === 'generating_story'">
                           <div v-if="smoothContent" 
                                class="prose prose-stone max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-pre:my-2 break-words text-base typing-effect"
                                v-html="parseMarkdown(smoothContent)">
                           </div>
                           <div v-else class="text-sm text-izakaya-wood/60 flex items-center gap-2">
                             <span class="animate-bounce">✍️</span> 正在撰写物语...
                           </div>
                       </div>
                       <div v-else-if="gameLoop.currentStage.value === 'background_processing'" class="text-sm text-blue-500 flex items-center gap-2">
                          <Brain class="w-3 h-3 animate-pulse" />
                          <span>正在处理游戏逻辑...</span>
                       </div>
                   </div>
               </div>
             </div>
          </div>

          <!-- Background Processing Indicator -->
          <div v-if="gameLoop.isBackgroundProcessing.value" class="flex gap-4 mb-6 px-4 group/message">
             <div class="flex-shrink-0 w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center animate-pulse border-2 border-blue-100 shadow-md">
                <Brain class="w-6 h-6 animate-pulse" />
             </div>
             
             <div class="relative max-w-[85%] flex flex-col items-start">
                <div class="p-5 rounded-2xl shadow-sm leading-relaxed relative bg-white/95 border border-blue-100 text-blue-800 rounded-tl-sm shadow-paper-hover">
                   <div class="text-sm">
                      <div class="flex items-center gap-2 font-bold mb-1">
                         <Brain class="w-4 h-4 animate-pulse" />
                         <span>正在后台处理游戏逻辑和记忆...</span>
                      </div>
                      <div class="text-xs text-blue-500 opacity-80">请稍等，处理完成后即可继续对话</div>
                   </div>
                </div>
             </div>
          </div>

          <!-- Error Message -->
          <div v-if="gameLoop.error.value" class="text-center p-2 text-sm text-red-600 bg-red-50 rounded border border-red-200 mx-4 shadow-sm">
            错误: {{ gameLoop.error.value }}
          </div>
        </div>

        <!-- Input Area -->
        <div class="p-6 bg-izakaya-paper border-t-4 border-izakaya-wood/20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] relative z-20">
          <!-- Texture -->
          <div class="absolute inset-0 pointer-events-none opacity-40 bg-texture-rice-paper mix-blend-multiply"></div>
          
          <div class="relative max-w-4xl mx-auto space-y-3">
            
            <!-- Quick Replies -->
            <div v-if="gameStore.quickReplies.length > 0 && !gameLoop.isProcessing.value && !gameLoop.isBackgroundProcessing.value" 
                 class="flex flex-wrap gap-2 animate-fade-in-up">
              <button 
                v-for="(reply, idx) in gameStore.quickReplies" 
                :key="idx"
                @click="handleQuickReply(reply)"
                class="px-4 py-1.5 bg-white/80 hover:bg-touhou-red hover:text-white text-touhou-red font-display rounded-sm border border-touhou-red/20 transition-all shadow-sm hover:shadow-md text-left truncate max-w-xs relative overflow-hidden group"
                :title="reply"
              >
                <div class="absolute inset-0 bg-touhou-red/5 group-hover:bg-transparent transition-colors"></div>
                {{ reply }}
              </button>
            </div>

            <div class="flex items-end gap-3">
              <!-- Textarea Wrapper -->
              <div class="relative group h-14 flex-1">
                <textarea 
                  v-model="userInput"
                  @focus="isInputFocused = true"
                  @blur="isInputFocused = false"
                  @keydown="handleInputKeydown"
                  :disabled="gameLoop.isProcessing.value || gameLoop.isBackgroundProcessing.value"
                  :placeholder="gameLoop.isBackgroundProcessing.value ? '正在后台处理，请稍等...' : '在此书写你的行动...'"
                  class="absolute bottom-0 left-0 w-full rounded-none px-2 py-3 focus:outline-none resize-none transition-all duration-300 ease-out origin-bottom font-serif-display text-xl text-ink placeholder:text-ink-light/40 leading-relaxed"
                  :class="[
                    (isInputFocused || userInput) ? 'h-40 bg-izakaya-paper shadow-[-4px_-4px_15px_rgba(0,0,0,0.1)] rounded-t-lg border-2 border-izakaya-wood/30 z-30' : 'h-14 bg-transparent border-b-2 border-izakaya-wood/30 z-10'
                  ]"
                ></textarea>
                
                <!-- Ink Stone / Send Button Container -->
                <div class="absolute right-2 bottom-1.5 z-40 flex gap-2">
                    <button 
                      v-if="!gameLoop.isProcessing.value && !gameLoop.isBackgroundProcessing.value"
                      @click="handleSend"
                      class="p-3 bg-touhou-red hover:bg-touhou-red-dark text-white rounded-full transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 border-4 border-white/20 group/send"
                      :disabled="!userInput.trim()"
                      title="发送 (Enter)"
                    >
                      <Send class="w-5 h-5 group-hover/send:translate-x-0.5 group-hover/send:-translate-y-0.5 transition-transform" />
                    </button>
                    <button 
                      v-else-if="gameLoop.isProcessing.value"
                      @click="handleAbort"
                      class="p-3 bg-touhou-red-dark hover:bg-red-900 text-white rounded-full transition-colors shadow-md border-4 border-white/20"
                      title="终止生成"
                    >
                      <Square class="w-5 h-5" />
                    </button>
                    <button 
                      v-else
                      disabled
                      class="p-3 bg-blue-500 text-white rounded-full transition-colors opacity-75 cursor-not-allowed shadow-md border-4 border-white/20"
                      title="后台处理中，请稍等"
                    >
                      <Brain class="w-5 h-5 animate-pulse" />
                    </button>
                </div>
              </div>

              <!-- Map Regeneration Toggle (Outside) -->
              <button
                @click="shouldRegenerateMap = !shouldRegenerateMap"
                class="flex-shrink-0 mb-1.5 p-3 rounded-full border-2 transition-all duration-300 relative group/regen"
                :class="[
                  shouldRegenerateMap 
                    ? 'bg-izakaya-wood text-izakaya-paper border-izakaya-wood shadow-md' 
                    : 'bg-transparent text-izakaya-wood/40 border-izakaya-wood/10 hover:border-izakaya-wood/30 hover:text-izakaya-wood/60'
                ]"
                title="重新装修 (下次经营时重新生成地图)"
              >
                <Hammer class="w-5 h-5" :class="{ 'animate-bounce-subtle': shouldRegenerateMap }" />
                
                <!-- Tooltip / Label -->
                <span class="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-bold px-2 py-1 rounded bg-izakaya-wood text-izakaya-paper opacity-0 group-hover/regen:opacity-100 transition-opacity pointer-events-none shadow-sm">
                  {{ shouldRegenerateMap ? '重新装修: 开启' : '重新装修: 关闭' }}
                </span>
                
                <!-- Status Indicator Dot -->
                <span v-if="shouldRegenerateMap" class="absolute top-0 right-0 w-2.5 h-2.5 bg-touhou-red rounded-full border border-white"></span>
              </button>
            </div>
          </div>
        </div>
      </main>

      <!-- Right Sidebar (Auxiliary) -->
      <aside class="w-80 bg-izakaya-paper/60 backdrop-blur-md border-l border-izakaya-wood/10 p-4 overflow-y-auto hidden lg:flex flex-col gap-4 shadow-[-2px_0_10px_rgba(0,0,0,0.02)]">
        <MapPlaceholder />
        <CharacterList />
      </aside>
      
    </div>

    <!-- Debug Trigger - Removed -->
  </div>
</template>

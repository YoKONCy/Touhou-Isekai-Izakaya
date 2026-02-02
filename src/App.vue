<script setup lang="ts">
import { onMounted, ref, nextTick, watch, computed } from 'vue';
  import { useGameStore } from '@/stores/game';
import { useChatStore } from '@/stores/chat';
import { useSettingsStore } from '@/stores/settings';
import { useSaveStore } from '@/stores/save';
import StatusCard from '@/components/StatusCard.vue';
import ChatBubble from '@/components/ChatBubble.vue';
import MapPlaceholder from '@/components/MapPlaceholder.vue';
import MapPanel from '@/components/MapPanel.vue';
import CharacterList from '@/components/CharacterList.vue';
import SettingsModal from '@/components/SettingsModal.vue';
import CharacterEditor from '@/components/CharacterEditor.vue';
import SaveManager from '@/components/SaveManager.vue';
import MemoryPanel from '@/components/MemoryPanel.vue';
import SummaryModal from '@/components/SummaryModal.vue';
import HelpModal from '@/components/HelpModal.vue';
import ToastContainer from '@/components/ToastContainer.vue';
import NewPlayerGuide from '@/components/NewPlayerGuide.vue';
import { Send, Settings as SettingsIcon, Save, Loader2, Square, Book, Database, Blocks, Brain, Hammer, Store, RefreshCw, HelpCircle, History } from 'lucide-vue-next';
import PromptBuilder from '@/components/PromptBuilder.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import { useConfirm } from '@/utils/confirm';
import CombatOverlay from '@/components/CombatOverlay.vue';
import IzakayaGame from '@/components/management/IzakayaGame.vue';
import QuestList from '@/components/QuestList.vue';
import QuestOfferModal from '@/components/QuestOfferModal.vue';
import { gameLoop } from '@/services/gameLoop';
import { parseMarkdown } from '@/utils/markdown';
import { useSmoothStream } from '@/composables/useSmoothStream';
import SakuraBackground from '@/components/SakuraBackground.vue';
import { audioManager } from '@/services/audio';
import MusicPlayer from '@/components/MusicPlayer.vue';
import MobileNav from '@/components/MobileNav.vue';
import MobileDrawer from '@/components/MobileDrawer.vue';
import { checkMigrationNeeded, migrateData } from '@/services/migration';
import { dbService } from '@/services/DatabaseService';
import { memoryService } from '@/services/memory';
import { useToastStore } from '@/stores/toast';

const chatStore = useChatStore();
const settingsStore = useSettingsStore();
const saveStore = useSaveStore();
const gameStore = useGameStore();
const toastStore = useToastStore();
const { confirm } = useConfirm();

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
const statusCardRef = ref<any>(null);
const isSettingsOpen = ref(false);
const isCharEditorOpen = ref(false);
const isSaveManagerOpen = ref(false);
const isPromptBuilderOpen = ref(false);
const isLoadingMore = ref(false);
const isLoadingFuture = ref(false);
const isMemoryPanelOpen = ref(false);
const isMapOpen = ref(false);
const isHelpOpen = ref(false);
const helpInitialSectionId = ref<string | undefined>(undefined);

// Mobile navigation state
const mobileActivePanel = ref<'chat' | 'status' | 'map' | 'characters' | 'quests'>('chat');
const isMobileDrawerOpen = ref(false);

const isMigrating = ref(false);
const migrationProgress = ref(0);
const migrationMessage = ref('');

const userOpenCombat = ref(false);
const userOpenQuest = ref(false);

// Audio Unlock Logic
const hasInteracted = ref(false);
const handleFirstInteraction = async () => {
  if (!hasInteracted.value) {
    hasInteracted.value = true;
    await audioManager.resume();
    // Remove listeners once unlocked
    window.removeEventListener('click', handleFirstInteraction);
    window.removeEventListener('keydown', handleFirstInteraction);
    window.removeEventListener('touchstart', handleFirstInteraction);
  }
};

onMounted(() => {
  // Listen for first user interaction to unlock audio
  window.addEventListener('click', handleFirstInteraction);
  window.addEventListener('keydown', handleFirstInteraction);
  window.addEventListener('touchstart', handleFirstInteraction);
});

const hasPendingTriggers = computed(() => {
  return !!gameStore.state.system.combat?.isPending || !!gameStore.state.system.pending_quest_trigger;
});

// Reset manual open state when new triggers arrive
watch(() => gameStore.state.system.combat?.isPending, (isPending) => {
  if (isPending) {
    userOpenCombat.value = false;
  }
});

watch(() => gameStore.state.system.pending_quest_trigger, (quest) => {
  if (quest) {
    userOpenQuest.value = false;
  }
});

function handleOpenHelp(sectionId?: string) {
  helpInitialSectionId.value = sectionId;
  isHelpOpen.value = true;
  audioManager.playPageFlip();
}
const isSummaryModalOpen = ref(false);
const summaryTurnCount = ref(20);

// Scroll to bottom when messages change
watch(() => chatStore.messages.length, () => {
  nextTick(() => {
    // Only auto-scroll to bottom if we are NOT in the middle of a jump
    if (chatContainer.value && !chatStore.jumpTargetId) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
    }
  });
});

// Handle Jump to message
watch(() => chatStore.jumpTargetId, async (newId) => {
  if (newId === null) return;

  console.log('[App] jumpTargetId changed to:', newId);

  // Give it a bit more time for DOM to stabilize, especially if messages were just loaded
  await nextTick();
  await new Promise(resolve => setTimeout(resolve, 100)); // Extra buffer for rendering
  
  // Find the message element
  const selector = `[data-message-id="${newId}"]`;
  let element = document.querySelector(selector);
  
  if (!element) {
    // Try finding it by ID if it's on the component root
    element = document.getElementById(`msg-${newId}`);
  }

  console.log('[App] Looking for element with selector:', selector);
  console.log('[App] Element found:', !!element);

  if (element && chatContainer.value) {
    console.log('[App] Scrolling to element...');
    
    // Use a more robust scrolling method
    const container = chatContainer.value;
    const elementRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const scrollTarget = elementRect.top - containerRect.top + container.scrollTop - (containerRect.height / 2) + (elementRect.height / 2);

    container.scrollTo({
      top: scrollTarget,
      behavior: 'smooth'
    });
    
    // Add a temporary highlight effect
    element.classList.add('highlight-message');
    setTimeout(() => {
      element.classList.remove('highlight-message');
    }, 2000);
  } else {
    console.warn('[App] Could not scroll: element or chatContainer missing', { 
      element: !!element, 
      chatContainer: !!chatContainer.value 
    });
  }
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

  // Database Migration Check
  await dbService.init();
  const needsMigration = await checkMigrationNeeded();
  if (needsMigration) {
      isMigrating.value = true;
      try {
          await migrateData((msg: string, progress: number) => {
              migrationMessage.value = msg;
              migrationProgress.value = progress;
          });
          // Migration successful
          window.location.reload(); // Reload to ensure clean state
      } catch (e) {
          console.error(e);
          alert('数据迁移失败，请刷新重试。详细错误请查看控制台。');
          isMigrating.value = false;
      }
      return; // Stop further initialization until reload
  }

  await saveStore.init(); // This will load history for the active save
  
  // Check Persistence Status
  try {
    const dbInfo = await dbService.getDbInfo();
    if (dbInfo.type !== 'opfs') {
        const message = dbInfo.type === 'memory-fallback' 
            ? '警告：OPFS 数据库初始化失败，已回退到内存模式。刷新页面将丢失存档！'
            : '警告：当前浏览器环境不支持持久化存储（OPFS），刷新页面将丢失存档。';
        toastStore.addToast(message, 'error', 15000);
        console.warn('Database is running in non-persistent mode:', dbInfo);
    }
  } catch(e) {
      console.error("Failed to check DB info:", e);
  }

  await memoryService.syncOldFacilitiesToRegistry();
});

async function handleLoadMore() {
  if (isLoadingMore.value || !chatStore.hasMore) return;
  
  isLoadingMore.value = true;
  
  // Save current scroll position and height
  const container = chatContainer.value;
  const oldScrollHeight = container?.scrollHeight || 0;
  
  try {
    await chatStore.loadHistory(true, 'older');
    
    // Wait for DOM update
    await nextTick();
    
    // Restore relative scroll position
    if (container) {
      const newScrollHeight = container.scrollHeight;
      container.scrollTop = newScrollHeight - oldScrollHeight;
    }
  } catch (e) {
    console.error('Failed to load more history:', e);
  } finally {
    isLoadingMore.value = false;
  }
}

async function handleLoadFuture() {
  if (isLoadingFuture.value || !chatStore.hasMoreFuture) return;
  
  isLoadingFuture.value = true;
  
  try {
    await chatStore.loadHistory(true, 'newer');
  } catch (e) {
    console.error('Failed to load future history:', e);
  } finally {
    isLoadingFuture.value = false;
  }
}

async function handleJumpToPresent() {
  audioManager.playSoftClick();
  await chatStore.loadHistory(false);
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
    }
  });
}

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

async function handleRefresh() {
  if (gameLoop.isProcessing.value || gameLoop.isBackgroundProcessing.value) return;

  const messages = chatStore.messages;
  if (messages.length === 0) return;

  const lastMsg = messages[messages.length - 1];
  if (!lastMsg) return;

  let textToResend = '';
  let msgToDeleteId: number | undefined;

  // Scenario 1: Last message is Assistant (Normal reply exists)
  if (lastMsg.role === 'assistant') {
    // Check if there is a preceding user message
    if (messages.length >= 2) {
      const prevMsg = messages[messages.length - 2];
      if (prevMsg && prevMsg.role === 'user') {
        textToResend = prevMsg.content;
        msgToDeleteId = lastMsg.id;
      }
    }
  } 
  // Scenario 2: Last message is User (Generation failed / No reply yet)
  else if (lastMsg.role === 'user') {
    textToResend = lastMsg.content;
    msgToDeleteId = lastMsg.id;
  }

  if (textToResend && msgToDeleteId !== undefined) {
    const confirmed = await confirm('确定要重新开始本轮对话吗？这将回滚到此轮开始前的状态并重新生成回复。', {
      title: '重新开始对话',
      confirmText: '确定',
      cancelText: '取消',
      destructive: true
    });

    if (!confirmed) return;

    audioManager.playClick();
    
    // 1. Delete the turn(s)
    await chatStore.deleteTurn(msgToDeleteId);
    
    // 2. Resend the text
    await gameLoop.handleUserAction(textToResend);
  }
}

function handleHelpAction(action: string) {
  switch (action) {
    case 'openSettings':
      isSettingsOpen.value = true;
      break;
    case 'openSaveManager':
      isSaveManagerOpen.value = true;
      break;
    case 'openMemoryPanel':
      isMemoryPanelOpen.value = true;
      break;
    case 'openCharEditor':
      isCharEditorOpen.value = true;
      break;
    case 'openPromptBuilder':
      isPromptBuilderOpen.value = true;
      break;
    case 'openPlayerConfig':
      if (statusCardRef.value) {
        statusCardRef.value.openPlayerConfig();
      }
      break;
    case 'openItems':
      if (statusCardRef.value) {
        statusCardRef.value.handleOpenItems();
      }
      break;
    case 'openTalentTree':
      if (statusCardRef.value) {
        statusCardRef.value.handleOpenTalentTree();
      }
      break;
    case 'openSpells':
      if (statusCardRef.value) {
        statusCardRef.value.handleOpenSpells();
      }
      break;
    case 'openFacility':
      if (statusCardRef.value) {
        statusCardRef.value.handleOpenFacility();
      }
      break;
    case 'openMap':
      isMapOpen.value = true;
      audioManager.playPageFlip();
      break;
    case 'highlightQuests':
    case 'highlightCharacters':
      // TODO: Maybe scroll to or highlight these sections?
      // For now, just open a toast or log
      // But actually, on mobile these might be hidden, so we could open the drawer if we had one.
      // On desktop, they are visible.
      // Let's just play a sound.
      audioManager.playClick();
      break;
    case 'highlightRefresh':
      // Flash the refresh button?
      // For now, no-op or just sound
      break;
  }
}

// Mobile panel switch handler
function handleMobilePanelSwitch(panel: 'chat' | 'status' | 'map' | 'characters' | 'quests') {
  mobileActivePanel.value = panel;
  // If switching to map, open the map modal
  if (panel === 'map') {
    isMapOpen.value = true;
    audioManager.playPageFlip();
    // Reset to chat after opening map modal
    setTimeout(() => {
      mobileActivePanel.value = 'chat';
    }, 100);
  }
}
</script>

<template>
  <!-- Migration Overlay -->
  <div v-if="isMigrating" class="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center text-white p-8">
    <Loader2 class="w-16 h-16 animate-spin mb-4 text-primary-400" />
    <h2 class="text-2xl font-bold mb-2">正在升级数据库...</h2>
    <p class="text-gray-300 mb-6">为了提升性能，我们正在将存档迁移到新数据库。<br>请勿关闭页面，这可能需要几分钟。</p>
    
    <div class="w-full max-w-md bg-gray-800 rounded-full h-4 mb-2 overflow-hidden">
      <div class="bg-primary-500 h-full transition-all duration-300" :style="{ width: `${migrationProgress}%` }"></div>
    </div>
    <p class="text-sm text-gray-400">{{ migrationMessage }} ({{ Math.floor(migrationProgress) }}%)</p>
  </div>

  <div class="fixed inset-0 flex flex-col overflow-hidden font-sans text-ink bg-izakaya-paper">
    
    <SakuraBackground />
    <ToastContainer />
    <MusicPlayer />

    <!-- Top Bar: 居酒屋暖帘风格 -->
    <header class="h-12 md:h-14 bg-white/90 backdrop-blur-md border-b-2 border-touhou-red/20 flex items-center justify-between px-3 md:px-6 shadow-sm z-20 flex-shrink-0 relative">
      <!-- 装饰性纹理叠加 -->
      <div class="absolute inset-0 pointer-events-none opacity-5 bg-texture-stardust"></div>

      <div class="font-display font-bold text-xl flex items-center gap-2 md:gap-3 relative z-10 text-izakaya-wood">
        <span class="text-xl md:text-2xl filter drop-shadow-sm">⛩️</span>
        <div class="flex items-center gap-1 md:gap-2">
          <span class="tracking-widest font-serif-display text-lg md:text-2xl">东方异界食堂</span>
          <span class="px-1 md:px-1.5 py-0.5 text-[8px] md:text-[10px] font-bold text-white bg-touhou-red rounded-sm uppercase tracking-wider shadow-sm transform translate-y-0.5">beta</span>
        </div>
      </div>

      <!-- Desktop navigation buttons -->
      <div class="hidden md:flex items-center gap-2 relative z-10">
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
        <button @click="handleOpenHelp()" class="btn-touhou-ghost" title="帮助与引导">
          <HelpCircle class="w-5 h-5" />
        </button>
        <button @click="isSettingsOpen = true; audioManager.playPageFlip()" class="btn-touhou-ghost" title="设置">
          <SettingsIcon class="w-5 h-5" />
        </button>
      </div>

      <!-- Mobile: Save button only (other options in drawer) -->
      <div class="flex md:hidden items-center gap-1 relative z-10">
        <button
          @click="isSaveManagerOpen = true; audioManager.playPageFlip()"
          class="btn-touhou-ghost p-2"
          title="存档"
        >
          <Save class="w-5 h-5" />
        </button>
      </div>
    </header>

    <!-- Settings Modal -->
    <SettingsModal :is-open="isSettingsOpen" @close="isSettingsOpen = false" @open-summary="handleOpenSummary" />
    <CharacterEditor :is-open="isCharEditorOpen" @close="isCharEditorOpen = false" />
    <SaveManager :is-open="isSaveManagerOpen" @close="isSaveManagerOpen = false" />
    <MemoryPanel :is-open="isMemoryPanelOpen" @close="isMemoryPanelOpen = false" />
    <HelpModal :is-open="isHelpOpen" :initial-section-id="helpInitialSectionId" @close="isHelpOpen = false" @action="handleHelpAction" />
    <SummaryModal :is-open="isSummaryModalOpen" @close="isSummaryModalOpen = false" :turn-count="summaryTurnCount" />
    <PromptBuilder :is-open="isPromptBuilderOpen" @close="isPromptBuilderOpen = false" />
    <MapPanel :is-open="isMapOpen" @close="isMapOpen = false" />
    <ConfirmDialog />
    <CombatOverlay :visible="userOpenCombat" @close="userOpenCombat = false" />
    <IzakayaGame v-if="gameStore.state.system.management?.isActive" @close="handleManagementClose" />
    <QuestOfferModal :visible="userOpenQuest" @close="userOpenQuest = false" />

    <!-- Main Content -->
    <div class="flex-1 flex overflow-hidden relative z-10">

      <!-- Left Sidebar (Status) - Desktop only -->
      <aside class="w-72 bg-izakaya-paper/60 backdrop-blur-md border-r border-izakaya-wood/10 p-4 hidden md:flex flex-col gap-4 h-full shadow-[2px_0_10px_rgba(0,0,0,0.02)] overflow-y-auto custom-scrollbar">
        <StatusCard ref="statusCardRef" class="flex-shrink-0" @open-help="handleOpenHelp" @open-summary="handleOpenSummary" />
        <QuestList class="flex-1 min-h-[300px]" />
      </aside>

      <!-- Mobile Panels Container -->
      <div class="flex-1 flex flex-col relative min-w-0 md:hidden">
        <!-- Mobile: Status Panel -->
        <div
          v-show="mobileActivePanel === 'status'"
          class="absolute inset-0 overflow-y-auto p-4 space-y-4 pb-20 bg-izakaya-paper/40 overscroll-contain"
          style="-webkit-overflow-scrolling: touch;"
        >
          <StatusCard ref="statusCardRef" @open-help="handleOpenHelp" @open-summary="handleOpenSummary" />
        </div>

        <!-- Mobile: Characters Panel -->
        <div
          v-show="mobileActivePanel === 'characters'"
          class="absolute inset-0 overflow-y-auto p-4 pb-20 bg-izakaya-paper/40 overscroll-contain"
          style="-webkit-overflow-scrolling: touch;"
        >
          <CharacterList />
        </div>

        <!-- Mobile: Quests Panel -->
        <div
          v-show="mobileActivePanel === 'quests'"
          class="absolute inset-0 overflow-y-auto p-4 pb-20 bg-izakaya-paper/40 overscroll-contain"
          style="-webkit-overflow-scrolling: touch;"
        >
          <QuestList />
        </div>

        <!-- Mobile: Chat Panel (default) -->
        <div
          v-show="mobileActivePanel === 'chat'"
          class="absolute inset-0 flex flex-col overflow-hidden pb-[calc(4rem+env(safe-area-inset-bottom))]"
        >
          <!-- Chat Area -->
          <div ref="chatContainer" class="flex-1 overflow-y-auto p-3 space-y-4 scroll-smooth overscroll-contain" style="-webkit-overflow-scrolling: touch;">
          <!-- New Player Guide -->
          <NewPlayerGuide @open-save-manager="isSaveManagerOpen = true" @open-help="isHelpOpen = true" />

          <!-- Load More Button -->
          <div v-if="chatStore.hasMore" class="flex justify-center py-2">
            <button 
              @click="handleLoadMore" 
              class="px-4 py-2 bg-izakaya-wood/5 hover:bg-izakaya-wood/10 text-izakaya-wood/60 text-sm rounded-full transition-colors flex items-center gap-2 border border-izakaya-wood/10"
              :disabled="isLoadingMore"
            >
              <Loader2 v-if="isLoadingMore" class="w-3 h-3 animate-spin" />
              <History v-else class="w-3 h-3" />
              {{ isLoadingMore ? '加载中...' : '加载更早的对话' }}
            </button>
          </div>

          <div v-if="chatStore.messages.length === 0" class="text-center text-izakaya-wood/50 mt-20 flex flex-col items-center gap-4">
            <div class="text-4xl opacity-50 filter drop-shadow-sm">🍵</div>
            <p class="font-display text-lg">还没有任何对话...</p>
            <p class="text-sm">点一杯茶，开始你的幻想乡物语吧。</p>
          </div>
          <ChatBubble v-for="msg in chatStore.messages" :key="msg.id" :message="msg" :data-message-id="msg.id" />
          
          <!-- Load Future Button -->
          <div v-if="chatStore.hasMoreFuture" class="flex flex-col items-center gap-3 py-4 border-t border-izakaya-wood/5 mt-4">
            <button 
              @click="handleLoadFuture" 
              class="px-6 py-2 bg-touhou-red/5 hover:bg-touhou-red/10 text-touhou-red text-sm rounded-full transition-all flex items-center gap-2 border border-touhou-red/20 shadow-sm"
              :disabled="isLoadingFuture"
            >
              <Loader2 v-if="isLoadingFuture" class="w-4 h-4 animate-spin" />
              <History v-else class="w-4 h-4 rotate-180" />
              {{ isLoadingFuture ? '加载中...' : '加载后续对话' }}
            </button>
            <button 
              @click="handleJumpToPresent" 
              class="text-xs text-izakaya-wood/40 hover:text-touhou-red transition-colors flex items-center gap-1"
            >
              直接回到现在 <RefreshCw class="w-3 h-3" />
            </button>
          </div>
          
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

        <!-- Input Area (Mobile) -->
          <div class="p-3 bg-izakaya-paper border-t-2 border-izakaya-wood/20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] relative z-20 flex-shrink-0">
            <!-- Texture -->
            <div class="absolute inset-0 pointer-events-none opacity-40 bg-texture-rice-paper mix-blend-multiply"></div>

            <div class="relative space-y-2">
              <!-- Pending Triggers Notification -->
              <div v-if="hasPendingTriggers" class="flex flex-wrap gap-2 mb-2 animate-fade-in">
                <!-- Combat Trigger -->
                <button
                    v-if="gameStore.state.system.combat?.isPending"
                    @click="userOpenCombat = true; audioManager.playChime()"
                    class="group flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-touhou-red to-red-600 text-white rounded-lg shadow-lg text-sm"
                >
                    <span class="text-base animate-bounce">⚔️</span>
                    <span class="font-display">进���战斗</span>
                </button>

                <!-- Quest Trigger -->
                <button
                    v-if="gameStore.state.system.pending_quest_trigger"
                    @click="userOpenQuest = true; audioManager.playPageFlip()"
                    class="group flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-izakaya-wood to-stone-700 text-white rounded-lg shadow-lg text-sm"
                >
                    <span class="text-base animate-pulse">📜</span>
                    <span class="font-display">查看任务</span>
                </button>
              </div>

              <!-- Quick Replies -->
              <div v-if="gameStore.quickReplies.length > 0 && !gameLoop.isProcessing.value && !gameLoop.isBackgroundProcessing.value"
                   class="flex flex-wrap gap-1.5 animate-fade-in-up">
                <button
                  v-for="(reply, idx) in gameStore.quickReplies"
                  :key="idx"
                  @click="handleQuickReply(reply)"
                  class="px-3 py-1 bg-white/80 text-touhou-red font-display text-sm rounded-sm border border-touhou-red/20 truncate max-w-[45%]"
                  :title="reply"
                >
                  {{ reply }}
                </button>
              </div>

              <div class="flex items-end gap-2">
                <!-- Textarea Wrapper -->
                <div class="relative flex-1">
                  <textarea
                    v-model="userInput"
                    @focus="isInputFocused = true"
                    @blur="isInputFocused = false"
                    :disabled="gameLoop.isProcessing.value || gameLoop.isBackgroundProcessing.value"
                    :placeholder="gameLoop.isBackgroundProcessing.value ? '处理中...' : '输入行动...'"
                    rows="1"
                    class="w-full px-3 py-2 bg-white/80 border border-izakaya-wood/20 rounded-lg focus:outline-none focus:border-touhou-red/50 resize-none font-serif-display text-base"
                  ></textarea>
                </div>

                <!-- Send Button -->
                <button
                  v-if="!gameLoop.isProcessing.value && !gameLoop.isBackgroundProcessing.value"
                  @click="handleSend"
                  class="p-2.5 bg-touhou-red text-white rounded-full shadow-md disabled:opacity-50"
                  :disabled="!userInput.trim()"
                >
                  <Send class="w-5 h-5" />
                </button>
                <button
                  v-else-if="gameLoop.isProcessing.value"
                  @click="handleAbort"
                  class="p-2.5 bg-touhou-red-dark text-white rounded-full shadow-md"
                >
                  <Square class="w-5 h-5" />
                </button>
                <button
                  v-else
                  disabled
                  class="p-2.5 bg-blue-500 text-white rounded-full shadow-md opacity-75"
                >
                  <Brain class="w-5 h-5 animate-pulse" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Desktop: Center (Chat) -->
      <main class="hidden md:flex flex-1 flex-col relative min-w-0">
        <!-- Chat Area -->
        <div ref="chatContainer" class="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
          <!-- New Player Guide -->
          <NewPlayerGuide @open-save-manager="isSaveManagerOpen = true" @open-help="isHelpOpen = true" />

          <!-- Load More Button -->
          <div v-if="chatStore.hasMore" class="flex justify-center py-2">
            <button
              @click="handleLoadMore"
              class="px-4 py-2 bg-izakaya-wood/5 hover:bg-izakaya-wood/10 text-izakaya-wood/60 text-sm rounded-full transition-colors flex items-center gap-2 border border-izakaya-wood/10"
              :disabled="isLoadingMore"
            >
              <Loader2 v-if="isLoadingMore" class="w-3 h-3 animate-spin" />
              <History v-else class="w-3 h-3" />
              {{ isLoadingMore ? '加载中...' : '加载更早的对话' }}
            </button>
          </div>

          <div v-if="chatStore.messages.length === 0" class="text-center text-izakaya-wood/50 mt-20 flex flex-col items-center gap-4">
            <div class="text-4xl opacity-50 filter drop-shadow-sm">🍵</div>
            <p class="font-display text-lg">还没有任何对话...</p>
            <p class="text-sm">点一杯茶，开始你的幻想乡物语吧。</p>
          </div>
          <ChatBubble v-for="msg in chatStore.messages" :key="msg.id" :message="msg" :data-message-id="msg.id" />

          <!-- Load Future Button -->
          <div v-if="chatStore.hasMoreFuture" class="flex flex-col items-center gap-3 py-4 border-t border-izakaya-wood/5 mt-4">
            <button
              @click="handleLoadFuture"
              class="px-6 py-2 bg-touhou-red/5 hover:bg-touhou-red/10 text-touhou-red text-sm rounded-full transition-all flex items-center gap-2 border border-touhou-red/20 shadow-sm"
              :disabled="isLoadingFuture"
            >
              <Loader2 v-if="isLoadingFuture" class="w-4 h-4 animate-spin" />
              <History v-else class="w-4 h-4 rotate-180" />
              {{ isLoadingFuture ? '加载中...' : '加载后续对话' }}
            </button>
            <button
              @click="handleJumpToPresent"
              class="text-xs text-izakaya-wood/40 hover:text-touhou-red transition-colors flex items-center gap-1"
            >
              直接回到现在 <RefreshCw class="w-3 h-3" />
            </button>
          </div>

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

        <!-- Desktop Input Area -->
        <div class="p-6 bg-izakaya-paper border-t-4 border-izakaya-wood/20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] relative z-20">
          <!-- Texture -->
          <div class="absolute inset-0 pointer-events-none opacity-40 bg-texture-rice-paper mix-blend-multiply"></div>
          
          <div class="relative max-w-4xl mx-auto space-y-3">
            
            <!-- Pending Triggers Notification -->
            <div v-if="hasPendingTriggers" class="flex flex-wrap gap-3 mb-3 animate-fade-in">
                <!-- Combat Trigger -->
                <button 
                    v-if="gameStore.state.system.combat?.isPending"
                    @click="userOpenCombat = true; audioManager.playChime()"
                    class="group flex items-center gap-3 px-4 py-2 bg-gradient-to-r from-touhou-red to-red-600 text-white rounded-lg shadow-lg hover:shadow-red-500/40 transform hover:-translate-y-0.5 transition-all border border-white/20"
                >
                    <span class="text-xl animate-bounce">⚔️</span>
                    <div class="text-left">
                        <div class="text-xs font-bold opacity-80 uppercase tracking-tighter">发现战斗遭遇</div>
                        <div class="text-sm font-display">点击进入对决</div>
                    </div>
                </button>

                <!-- Quest Trigger -->
                <button 
                    v-if="gameStore.state.system.pending_quest_trigger"
                    @click="userOpenQuest = true; audioManager.playPageFlip()"
                    class="group flex items-center gap-3 px-4 py-2 bg-gradient-to-r from-izakaya-wood to-stone-700 text-white rounded-lg shadow-lg hover:shadow-stone-500/40 transform hover:-translate-y-0.5 transition-all border border-white/20"
                >
                    <span class="text-xl animate-pulse">📜</span>
                    <div class="text-left">
                        <div class="text-xs font-bold opacity-80 uppercase tracking-tighter">新的委托任务</div>
                        <div class="text-sm font-display">查看任务详情</div>
                    </div>
                </button>
            </div>

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
                    (isInputFocused || userInput) ? 'h-40 bg-izakaya-paper shadow-[-4px_-4px_15px_rgba(0,0,0,0.1)] rounded-t-lg border-2 border-izakaya-wood/30 z-30' : 'h-14 bg-white/50 border-b-2 border-izakaya-wood/30 z-10'
                  ]"
                ></textarea>
                
                <!-- Ink Stone / Send Button Container -->
                <div 
                  class="absolute right-2 bottom-1.5 z-40 flex gap-2 transition-opacity duration-300"
                  :class="{ 'opacity-25 hover:opacity-100': userInput.trim().length > 0 }"
                >
                    <button 
                      v-if="chatStore.messages.length > 0"
                      @click="handleRefresh"
                      :disabled="gameLoop.isProcessing.value || gameLoop.isBackgroundProcessing.value"
                      class="p-3 bg-touhou-red hover:bg-touhou-red-dark text-white rounded-full transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 border-4 border-white/20 mr-2 group/refresh"
                      title="重新开始本轮对话 (Refresh)"
                    >
                      <RefreshCw class="w-5 h-5 group-hover/refresh:rotate-180 transition-transform duration-500" />
                    </button>

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
                v-if="settingsStore.enableManagementSystem"
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

              <!-- Management System Toggle (Temporarily Disabled) -->
              <button
                disabled
                class="flex-shrink-0 mb-1.5 ml-2 p-3 rounded-full border-2 transition-all duration-300 relative group/mgmt opacity-50 cursor-not-allowed bg-transparent text-izakaya-wood/20 border-izakaya-wood/10"
                title="营业系统 (开发中 - 暂时禁用)"
              >
                <Store class="w-5 h-5 text-izakaya-wood/40" />
                
                <!-- Tooltip / Label -->
                <span class="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-bold px-2 py-1 rounded bg-izakaya-wood text-izakaya-paper opacity-0 group-hover/mgmt:opacity-100 transition-opacity pointer-events-none shadow-sm">
                  营业系统: 开发中
                </span>
              </button>
            </div>
          </div>
        </div>
      </main>

      <!-- Right Sidebar (Auxiliary) - Desktop only -->
      <aside class="w-80 bg-izakaya-paper/60 backdrop-blur-md border-l border-izakaya-wood/10 p-4 overflow-y-auto hidden lg:flex flex-col gap-4 shadow-[-2px_0_10px_rgba(0,0,0,0.02)]">
        <MapPlaceholder @click="isMapOpen = true; audioManager.playPageFlip()" />
        <CharacterList />
      </aside>

    </div>

    <!-- Mobile Navigation -->
    <MobileNav
      :active-panel="mobileActivePanel"
      @switch-panel="handleMobilePanelSwitch"
      @open-drawer="isMobileDrawerOpen = true"
    />

    <!-- Mobile Drawer -->
    <MobileDrawer
      :is-open="isMobileDrawerOpen"
      @close="isMobileDrawerOpen = false"
      @open-settings="isSettingsOpen = true"
      @open-save-manager="isSaveManagerOpen = true"
      @open-char-editor="isCharEditorOpen = true"
      @open-memory-panel="isMemoryPanelOpen = true"
      @open-prompt-builder="isPromptBuilderOpen = true"
      @open-help="isHelpOpen = true"
      @open-map="isMapOpen = true"
    />
  </div>
</template>

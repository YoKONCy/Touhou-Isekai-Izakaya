<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useGameStore } from '@/stores/game';
import { multiplayerService } from '@/services/MultiplayerService';
import { audioManager } from '@/services/audio';
import { 
  X, Send, Gavel, Users, MessageSquare, Scroll, 
  Dices, User, Activity, Zap, CheckCircle2, 
  Clock, AlertCircle, Info, Vote
} from 'lucide-vue-next';
import _ from 'lodash';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'submit', action: string): void;
}>();

const gameStore = useGameStore();
const activeTab = ref<'action' | 'interaction' | 'logs'>('action');

// --- Action Logic ---
const actionInput = ref('');
const isReady = ref(false);

// Debounced draft update
const updateDraft = _.debounce((content: string) => {
  if (gameStore.multiplayer.isMultiplayer) {
    multiplayerService.sendDraft(content);
  }
}, 500);

// 处理输入框失去焦点
const handleInputBlur = () => {
  if (gameStore.multiplayer.isMultiplayer) {
    // 立即发送一个空草稿，通知 Host 玩家已停止输入
    multiplayerService.sendDraft('');
  }
};

watch(actionInput, (newVal) => {
  updateDraft(newVal);
});

function handleActionSubmit() {
  if (!actionInput.value.trim()) return;
  
  isReady.value = true;
  audioManager.playClick();
  
  // If Host, we don't necessarily "submit" to self yet, 
  // we wait for everyone or click the final "Broadcast" button in App.vue (handleMultiplayerSubmit)
  // Actually, the App.vue expects the host action to be passed back.
  
  // For Guest, we send to Host
  if (!gameStore.multiplayer.isHost) {
    multiplayerService.sendGuestAction(actionInput.value);
  } else {
    // Host just updates their own status locally for others to see
    const me = gameStore.multiplayer.players.find(p => p.isMe);
    if (me) me.status = 'ready';
  }
}

function handleCancelReady() {
  isReady.value = false;
  audioManager.playClick();
  
  if (!gameStore.multiplayer.isHost) {
    // Re-send draft with empty or original content to trigger Host side status change
    // Host logic will update player status based on PLAYER_ACTION or PLAYER_DRAFT
    // To explicitly "unready", we should send a message that Host interprets as "drafting"
    multiplayerService.sendDraft(actionInput.value); 
  } else {
    const me = gameStore.multiplayer.players.find(p => p.isMe);
    if (me) me.status = 'drafting';
  }
}

function finalizeDecision() {
  if (!gameStore.multiplayer.isHost) return;
  emit('submit', actionInput.value);
  actionInput.value = '';
  isReady.value = false;
}

// --- Interaction Logic ---
const chatInput = ref('');
const oocMessages = ref<Array<{senderId: string, name: string, content: string, timestamp: number}>>([]);

function sendChat() {
  if (!chatInput.value.trim()) return;
  multiplayerService.sendChat(chatInput.value);
  
  // Local append ONLY for Host. 
  // For Guest, the message will come back via 'mp-chat-message' from Host broadcast.
  if (gameStore.multiplayer.isHost) {
    const myPlayer = gameStore.multiplayer.players.find(p => p.isMe);
    oocMessages.value.push({
      senderId: multiplayerService.identityKey,
      name: myPlayer?.name || '我',
      content: chatInput.value,
      timestamp: Date.now()
    });
  }
  
  chatInput.value = '';
  audioManager.playSoftClick();
}

const handleChatMessage = (e: any) => {
  const { senderId, content, timestamp } = e.detail;
  const player = gameStore.multiplayer.players.find(p => p.id === senderId);
  oocMessages.value.push({
    senderId,
    name: player?.name || `玩家 ${senderId.substring(0,4)}`,
    content,
    timestamp
  });
  
  // Keep last 50 messages
  if (oocMessages.value.length > 50) {
    oocMessages.value.shift();
  }
};

// --- System Logs ---
const systemLogs = ref<Array<{type: 'info' | 'success' | 'warning' | 'error' | 'roll', message: string, timestamp: number}>>([]);

function addLog(message: string, type: 'info' | 'success' | 'warning' | 'error' | 'roll' = 'info') {
  systemLogs.value.unshift({ message, type, timestamp: Date.now() });
  if (systemLogs.value.length > 30) systemLogs.value.pop();
}

// --- Voting Logic ---
const activeVote = ref<{
  id: string;
  proposal: string;
  options: string[];
  initiatorId: string;
  hasVoted: boolean;
} | null>(null);

const handleVoteStarted = (e: any) => {
  const { voteId, proposal, options, initiatorId } = e.detail;
  activeVote.value = {
    id: voteId,
    proposal,
    options,
    initiatorId,
    hasVoted: false
  };
  addLog(`发起了一项投票: ${proposal}`, 'info');
  audioManager.playNotification();
};

const handleVoteResult = (e: any) => {
  const { resultIndex, counts } = e.detail;
  const winner = activeVote.value?.options[resultIndex];
  addLog(`投票结束: ${winner} (得票: ${counts[resultIndex]})`, 'success');
  activeVote.value = null;
  audioManager.playSuccess();
};

function castVote(index: number) {
  if (!gameStore.multiplayer.activeVote || gameStore.multiplayer.activeVote.isEnded) return;
  multiplayerService.castVote(gameStore.multiplayer.activeVote.id, index);
  addLog(`你投给了: ${gameStore.multiplayer.activeVote.options[index]}`, 'info');
  audioManager.playClick();
}

const isVoteCreationOpen = ref(false);
const voteCreationProposal = ref('');
const voteCreationOptions = ref('同意,反对');

function openVoteCreation() {
  voteCreationProposal.value = '';
  voteCreationOptions.value = '同意,反对';
  isVoteCreationOpen.value = true;
}

function closeVoteCreation() {
  isVoteCreationOpen.value = false;
}

function submitVoteCreation() {
  const proposal = voteCreationProposal.value.trim();
  if (!proposal) {
    alert('请输入投票议题');
    return;
  }
  
  const options = voteCreationOptions.value.split(',').map(s => s.trim()).filter(s => s);
  if (options.length < 2) {
    alert('至少需要两个选项');
    return;
  }
  
  multiplayerService.startVote(proposal, options);
  closeVoteCreation();
}


// --- Energy Logic ---
const totalEnergy = computed(() => gameStore.multiplayer.totalEnergy || 0);

const isContributing = ref(false);
const contributionAmount = ref(100);

function handleContribute() {
  multiplayerService.contributeEnergy(contributionAmount.value);
  addLog(`你贡献了 ${contributionAmount.value} 点能源`, 'success');
  audioManager.playClick();
  isContributing.value = false;
}

function handleRequestEnergy() {
  if (!gameStore.multiplayer.isHost) return;
  multiplayerService.requestEnergy();
  addLog('你向所有玩家请求了能源支持', 'info');
  audioManager.playClick();
}

// --- Dice Logic ---
const isRolling = ref(false);
const lastRollResult = ref<{ type: string, value: number } | null>(null);

const myPlayer = computed(() => gameStore.multiplayer.players.find(p => p.isMe));
const hasRolledThisTurn = computed(() => {
  return myPlayer.value?.lastDiceRollTurn === gameStore.state.system.turn_count;
});

function handleDiceRoll(sides: number) {
  if (isRolling.value || hasRolledThisTurn.value) return;
  
  isRolling.value = true;
  audioManager.playClick();
  
  // 模拟滚动动效延迟
  setTimeout(() => {
    const result = Math.floor(Math.random() * sides) + 1;
    const playerName = myPlayer.value?.name || '我';
    
    const message = `${playerName} 投掷了 D${sides}，结果为：${result}`;
    addLog(message, 'roll');
    
    // 立即更新本地状态 (针对房主或单机)
    if (myPlayer.value) {
      myPlayer.value.lastDiceRollTurn = gameStore.state.system.turn_count;
    }
    
    // 联机模式同步
    if (gameStore.multiplayer.isMultiplayer) {
      multiplayerService.sendDiceRoll(sides, result);
    }
    
    lastRollResult.value = { type: `D${sides}`, value: result };
    isRolling.value = false;
    audioManager.playSuccess();
  }, 600);
}

const handleDiceEvent = (e: any) => {
  const { senderId, sides, result } = e.detail;
  const player = gameStore.multiplayer.players.find(p => p.id === senderId);
  const playerName = player?.name || `玩家 ${senderId.substring(0,4)}`;
  
  addLog(`${playerName} 投掷了 D${sides}，结果为：${result}`, 'roll');
  audioManager.playNotification();
};

// --- Event Listeners ---
onMounted(() => {
  window.addEventListener('mp-chat-message', handleChatMessage);
  window.addEventListener('mp-vote-started', handleVoteStarted);
  window.addEventListener('mp-vote-result', handleVoteResult);
  window.addEventListener('mp-dice-roll', handleDiceEvent);
  
  // Listen for other system events that might come via MultiplayerService
  addLog('已进入跑团决策系统', 'success');
});

onUnmounted(() => {
  window.removeEventListener('mp-chat-message', handleChatMessage);
  window.removeEventListener('mp-vote-started', handleVoteStarted);
  window.removeEventListener('mp-vote-result', handleVoteResult);
  window.removeEventListener('mp-dice-roll', handleDiceEvent);
});

// --- Computed ---
const players = computed(() => gameStore.multiplayer.players);
const companions = computed(() => {
  const list = [];
  if (gameStore.state.multiplayer_companions) {
    for (const id in gameStore.state.multiplayer_companions) {
      list.push(gameStore.state.multiplayer_companions[id]);
    }
  }
  return list;
});

const allReady = computed(() => {
  return players.value.every(p => p.status === 'ready');
});

</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-8">
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="emit('close')"></div>
    
    <!-- Modal -->
    <div class="relative w-full max-w-4xl h-[80vh] bg-izakaya-paper rounded-2xl shadow-2xl flex flex-col overflow-hidden border-2 border-izakaya-wood/20 animate-fade-in-up">
      <!-- Texture -->
      <div class="absolute inset-0 pointer-events-none opacity-40 bg-texture-rice-paper mix-blend-multiply"></div>

      <!-- Header -->
      <header class="h-14 bg-izakaya-wood text-white px-6 flex items-center justify-between relative z-10">
        <div class="flex items-center gap-3">
          <Gavel class="w-6 h-6" />
          <h2 class="font-display text-xl font-bold tracking-wider">跑团决策系统</h2>
          <div class="px-2 py-0.5 bg-white/20 rounded text-xs font-mono uppercase">
            {{ gameStore.multiplayer.isHost ? '房主端' : '客机端' }}
          </div>
        </div>
        <button @click="emit('close')" class="p-1 hover:bg-white/20 rounded-full transition-colors">
          <X class="w-6 h-6" />
        </button>
      </header>

      <!-- Tabs Navigation -->
      <nav class="flex bg-white/50 border-b border-izakaya-wood/10 relative z-10">
        <button 
          @click="activeTab = 'action'"
          :class="['flex-1 py-3 flex items-center justify-center gap-2 font-display transition-all border-b-2', 
                   activeTab === 'action' ? 'border-touhou-red text-touhou-red bg-touhou-red/5' : 'border-transparent text-gray-500 hover:bg-gray-50']"
        >
          <Scroll class="w-5 h-5" />
          <span>行动决策</span>
        </button>
        <button 
          @click="activeTab = 'interaction'"
          :class="['flex-1 py-3 flex items-center justify-center gap-2 font-display transition-all border-b-2', 
                   activeTab === 'interaction' ? 'border-touhou-red text-touhou-red bg-touhou-red/5' : 'border-transparent text-gray-500 hover:bg-gray-50']"
        >
          <MessageSquare class="w-5 h-5" />
          <span>互动与状态</span>
        </button>
        <button 
          @click="activeTab = 'logs'"
          :class="['flex-1 py-3 flex items-center justify-center gap-2 font-display transition-all border-b-2', 
                   activeTab === 'logs' ? 'border-touhou-red text-touhou-red bg-touhou-red/5' : 'border-transparent text-gray-500 hover:bg-gray-50']"
        >
          <Clock class="w-5 h-5" />
          <span>系统日志</span>
        </button>
      </nav>

      <!-- Content Area -->
      <main class="flex-1 overflow-hidden flex flex-col relative z-10">
        
        <!-- 1. Action Tab -->
        <div v-if="activeTab === 'action'" class="flex-1 flex flex-col md:flex-row overflow-hidden">
          <!-- Left: Input & Drafts -->
          <div class="flex-1 flex flex-col p-4 border-r border-izakaya-wood/10 overflow-hidden">
            <div class="flex-1 flex flex-col gap-4 overflow-hidden">
              <!-- Action Input -->
              <div class="space-y-2">
                <label class="text-sm font-bold text-izakaya-wood flex items-center gap-2">
                  <Activity class="w-4 h-4" /> 你的行动描述
                </label>
                <textarea 
                  v-model="actionInput"
                  :disabled="isReady"
                  @blur="handleInputBlur"
                  placeholder="例如：*环顾四周*，看看有没有什么可疑的人物..."
                  class="w-full h-32 p-4 bg-white/80 border-2 border-izakaya-wood/20 rounded-xl focus:outline-none focus:border-touhou-red/50 resize-none font-serif-display text-lg shadow-inner"
                ></textarea>
                <div class="flex justify-between items-center">
                  <span class="text-xs text-gray-400">所有玩家将实时看到你的输入草稿</span>
                  <div class="flex gap-2">
                    <button 
                      v-if="isReady"
                      @click="handleCancelReady"
                      class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-display flex items-center gap-2 hover:bg-gray-300 transition-all"
                    >
                      <X class="w-4 h-4" />
                      撤回
                    </button>
                    <button 
                      @click="handleActionSubmit"
                      :disabled="isReady || !actionInput.trim()"
                      class="px-6 py-2 bg-touhou-red text-white rounded-lg font-display flex items-center gap-2 shadow-md hover:bg-touhou-red-dark disabled:opacity-50 transition-all"
                    >
                      <CheckCircle2 class="w-4 h-4" />
                      {{ isReady ? '已就绪' : '提交行动' }}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Real-time Drafts -->
              <div class="flex-1 flex flex-col min-h-0">
                <h3 class="text-sm font-bold text-izakaya-wood mb-2 flex items-center gap-2">
                  <Zap class="w-4 h-4 text-yellow-600" /> 实时草稿流
                </h3>
                <div class="flex-1 overflow-y-auto space-y-2 pr-2">
                  <div v-for="p in players" :key="p.id" 
                       :class="['p-3 rounded-lg border flex flex-col gap-1 transition-all', 
                                p.status === 'ready' ? 'bg-green-50 border-green-200' : 'bg-white/60 border-izakaya-wood/10']">
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-bold" :class="p.isHost ? 'text-touhou-red' : 'text-izakaya-wood'">
                        {{ p.name }} {{ p.isHost ? '(房主)' : '' }}
                      </span>
                      <span v-if="p.status === 'ready'" class="text-[10px] bg-green-500 text-white px-1.5 py-0.5 rounded flex items-center gap-1">
                        <CheckCircle2 class="w-3 h-3" /> 就绪
                      </span>
                      <span v-else-if="p.status === 'drafting'" class="text-[10px] bg-yellow-500 text-white px-1.5 py-0.5 rounded animate-pulse">
                        正在输入...
                      </span>
                    </div>
                    <p class="text-sm italic text-gray-600 break-words">
                      {{ p.draftContent || (p.status === 'ready' ? '(已提交行动)' : '等待输入...') }}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Host Control -->
            <div v-if="gameStore.multiplayer.isHost" class="mt-4 p-4 bg-touhou-red/5 rounded-xl border border-touhou-red/20">
              <div class="flex items-center justify-between gap-4">
                <div class="flex-1">
                  <h4 class="text-sm font-bold text-touhou-red flex items-center gap-2">
                    <Gavel class="w-4 h-4" /> 房主最终裁定
                  </h4>
                  <p class="text-xs text-gray-500">当所有玩家就绪或你决定开始时，汇总所有输入并提交。</p>
                </div>
                <div class="flex gap-2">
                  <button 
                    @click="openVoteCreation"
                    class="px-4 py-3 bg-white border border-touhou-red text-touhou-red rounded-xl font-display text-sm shadow-sm hover:bg-touhou-red hover:text-white transition-all flex items-center gap-2"
                  >
                    <Vote class="w-4 h-4" />
                    <span>发起投票</span>
                  </button>
                  <button 
                    @click="finalizeDecision"
                    class="px-6 py-3 bg-touhou-red text-white rounded-xl font-display text-lg shadow-lg hover:bg-touhou-red-dark transform hover:scale-105 transition-all flex items-center gap-2"
                  >
                    <Send class="w-5 h-5" />
                    <span>汇总并提交</span>
                  </button>
                </div>
              </div>
              <div v-if="!allReady" class="mt-2 text-[10px] text-touhou-red/60 flex items-center gap-1">
                <AlertCircle class="w-3 h-3" /> 提示：仍有玩家未完成输入
              </div>
            </div>
          </div>

          <!-- Right: Roll Tools & Energy & Vote -->
          <div class="w-full md:w-72 p-4 bg-izakaya-paper/50 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
            <!-- 1. Dice Tools (命运之骰) -->
            <section class="flex-shrink-0 p-4 bg-white/60 rounded-2xl border border-izakaya-wood/10 shadow-sm">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-bold text-izakaya-wood flex items-center gap-2">
                  <Dices class="w-4 h-4 text-touhou-red" /> 命运之骰
                </h3>
                <span v-if="hasRolledThisTurn" class="text-[10px] text-gray-400 font-bold bg-gray-100 px-2 py-0.5 rounded">
                  本轮已投
                </span>
              </div>
              
              <div class="grid grid-cols-2 gap-2">
                <button 
                  @click="handleDiceRoll(6)"
                  :disabled="isRolling || hasRolledThisTurn"
                  class="flex flex-col items-center gap-1 p-2 rounded-xl border border-izakaya-wood/10 hover:bg-touhou-red/5 hover:border-touhou-red/30 transition-all group disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:border-izakaya-wood/10"
                >
                  <span class="text-[10px] font-bold text-gray-400 group-hover:text-touhou-red/60">D6</span>
                  <div class="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-lg group-hover:bg-touhou-red/10">
                    <Dices class="w-5 h-5 text-gray-600 group-hover:text-touhou-red" />
                  </div>
                </button>
                <button 
                  @click="handleDiceRoll(20)"
                  :disabled="isRolling || hasRolledThisTurn"
                  class="flex flex-col items-center gap-1 p-2 rounded-xl border border-izakaya-wood/10 hover:bg-touhou-red/5 hover:border-touhou-red/30 transition-all group disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:border-izakaya-wood/10"
                >
                  <span class="text-[10px] font-bold text-gray-400 group-hover:text-touhou-red/60">D20</span>
                  <div class="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-lg group-hover:bg-touhou-red/10">
                    <Activity class="w-5 h-5 text-gray-600 group-hover:text-touhou-red" />
                  </div>
                </button>
              </div>

              <div v-if="hasRolledThisTurn" class="mt-2 text-[10px] text-center text-gray-400">
                每轮行动仅允许投掷一次骰子
              </div>

              <div v-if="lastRollResult" class="mt-3 p-2 bg-touhou-red/5 rounded-lg border border-touhou-red/10 text-center animate-fade-in">
                <span class="text-[10px] text-touhou-red/60 block uppercase font-bold">{{ lastRollResult.type }} 结果</span>
                <span class="text-2xl font-mono font-bold text-touhou-red">{{ lastRollResult.value }}</span>
              </div>
            </section>

            <!-- 2. API Energy Pool (API 能源池) -->
            <section class="flex-shrink-0 p-4 bg-gradient-to-br from-yellow-500/10 to-orange-500/10 rounded-2xl border border-yellow-500/20 shadow-sm overflow-hidden relative">
              <div class="flex items-center justify-between mb-2">
                <h3 class="text-sm font-bold text-yellow-700 flex items-center gap-2">
                  <Zap class="w-4 h-4" /> API 能源池
                </h3>
                <div class="flex gap-1">
                  <button 
                    v-if="gameStore.multiplayer.isHost"
                    @click="handleRequestEnergy" 
                    class="p-1 hover:bg-orange-500/20 rounded-full transition-colors text-orange-600" 
                    title="请求能源"
                  >
                    <AlertTriangle class="w-4 h-4" />
                  </button>
                  <button 
                    @click="isContributing = !isContributing" 
                    class="p-1 hover:bg-yellow-500/20 rounded-full transition-colors text-yellow-600" 
                    :title="isContributing ? '取消' : '贡献能源'"
                  >
                    <PlusCircle v-if="!isContributing" class="w-4 h-4" />
                    <X v-else class="w-4 h-4" />
                  </button>
                </div>
              </div>

              <!-- Status View -->
              <div v-if="!isContributing" class="space-y-2 animate-fade-in">
                <div class="flex justify-between items-end">
                  <span :class="['text-2xl font-mono font-bold', totalEnergy < 0 ? 'text-red-600 animate-pulse' : 'text-yellow-600']">
                    {{ totalEnergy }}
                  </span>
                  <span :class="['text-[10px] font-bold mb-1', totalEnergy < 0 ? 'text-red-700/60' : 'text-yellow-700/60']">POINTS</span>
                </div>
                <div class="h-2 bg-yellow-500/10 rounded-full overflow-hidden">
                  <div 
                    class="h-full transition-all duration-500" 
                    :class="[totalEnergy < 0 ? 'bg-red-500' : 'bg-yellow-500 animate-pulse']"
                    :style="{ width: Math.max(0, Math.min(100, (totalEnergy / 10000) * 100)) + '%' }"
                  ></div>
                </div>
                <p v-if="totalEnergy < 0" class="text-[10px] text-red-500 font-bold italic animate-pulse">
                  能源已透支！请尽快贡献能源。
                </p>
                <p v-else class="text-[10px] text-gray-400 italic">能源池由所有玩家共同贡献。</p>
              </div>

              <!-- Contribution View -->
              <div v-else class="space-y-3 animate-fade-in-up">
                <div class="grid grid-cols-2 gap-2">
                  <button 
                    v-for="amt in [100, 500, 1000, 2000]" 
                    :key="amt"
                    @click="contributionAmount = amt"
                    :class="['py-1.5 rounded-lg border text-xs font-mono transition-all', 
                             contributionAmount === amt ? 'bg-yellow-500 text-white border-yellow-600' : 'bg-white text-yellow-600 border-yellow-200 hover:border-yellow-400']"
                  >
                    {{ amt }}
                  </button>
                </div>
                <button 
                  @click="handleContribute"
                  class="w-full py-2 bg-yellow-500 text-white rounded-xl font-display text-sm shadow-md hover:bg-yellow-600 transition-all flex items-center justify-center gap-2"
                >
                  <Heart class="w-4 h-4 fill-current" />
                  <span>确认贡献</span>
                </button>
              </div>
            </section>

            <!-- 3. Active Vote (进行中投票) -->
            <section v-if="gameStore.multiplayer.activeVote" class="flex-shrink-0 p-4 bg-white/80 rounded-2xl border-2 border-touhou-red/20 shadow-lg animate-bounce-in">
              <h3 class="text-sm font-bold text-touhou-red mb-2 flex items-center gap-2">
                <Vote class="w-4 h-4" /> 进行中投票
              </h3>
              <p class="text-xs font-bold text-izakaya-wood mb-3 line-clamp-2">{{ gameStore.multiplayer.activeVote.proposal }}</p>
              
              <div class="space-y-2">
                <button 
                  v-for="(opt, idx) in gameStore.multiplayer.activeVote.options" 
                  :key="idx"
                  @click="castVote(idx)"
                  :disabled="gameStore.multiplayer.activeVote.isEnded"
                  :class="['w-full p-2 text-left text-xs rounded-lg border transition-all flex items-center justify-between',
                           gameStore.multiplayer.activeVote.votes[multiplayerService.identityKey] === idx ? 'bg-touhou-red/10 border-touhou-red text-touhou-red' : 'bg-white border-gray-100 hover:border-touhou-red/30']"
                >
                  <span class="truncate">{{ opt }}</span>
                  <span class="font-mono text-[10px] opacity-60">
                    {{ Object.values(gameStore.multiplayer.activeVote.votes).filter(v => v === idx).length }}
                  </span>
                </button>
              </div>
            </section>
            
            <!-- 4. Room Members (房内成员) -->
            <section class="flex-shrink-0 p-4 bg-white/40 rounded-xl border border-izakaya-wood/5">
              <h4 class="text-xs font-bold text-izakaya-wood mb-2 flex items-center gap-1">
                <Users class="w-3 h-3" /> 房内成员 ({{ players.length }})
              </h4>
              <div class="space-y-2">
                <div v-for="p in players" :key="p.id" class="flex items-center justify-between text-xs">
                  <div class="flex items-center gap-2">
                    <div class="w-2 h-2 rounded-full" :class="p.status === 'ready' ? 'bg-green-500' : 'bg-gray-300'"></div>
                    <span class="truncate max-w-[100px]">{{ p.name }}</span>
                  </div>
                  <span class="text-[10px] text-gray-400 px-1.5 py-0.5 bg-gray-100 rounded">{{ p.isHost ? '房主' : '客机' }}</span>
                </div>
              </div>
            </section>
          </div>
        </div>

        <!-- 2. Interaction Tab -->
        <div v-if="activeTab === 'interaction'" class="flex-1 flex flex-col md:flex-row overflow-hidden">
          <!-- Left: OOC Chat -->
          <div class="flex-1 flex flex-col p-4 border-r border-izakaya-wood/10 overflow-hidden">
            <h3 class="text-sm font-bold text-izakaya-wood mb-2 flex items-center gap-2">
              <MessageSquare class="w-4 h-4" /> OOC (戏外交流)
            </h3>
            <div class="flex-1 bg-white/40 rounded-xl border border-izakaya-wood/10 overflow-y-auto p-3 space-y-3 mb-4 shadow-inner">
              <div v-for="(msg, idx) in oocMessages" :key="idx" class="flex flex-col gap-0.5">
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-bold" :class="msg.senderId === multiplayerService.identityKey ? 'text-touhou-red' : 'text-blue-600'">
                    {{ msg.name }}
                  </span>
                  <span class="text-[8px] text-gray-400">{{ new Date(msg.timestamp).toLocaleTimeString() }}</span>
                </div>
                <p class="text-sm bg-white p-2 rounded-lg border border-izakaya-wood/5 shadow-sm inline-block self-start max-w-[90%] break-words">
                  {{ msg.content }}
                </p>
              </div>
              <div v-if="oocMessages.length === 0" class="h-full flex items-center justify-center text-gray-400 text-sm italic">
                还没有聊天记录...
              </div>
            </div>
            <div class="flex gap-2">
              <input 
                v-model="chatInput"
                @keydown.enter="sendChat"
                placeholder="在此发送戏外交流内容..."
                class="flex-1 px-4 py-2 bg-white/80 border border-izakaya-wood/20 rounded-lg focus:outline-none focus:border-touhou-red/50 text-sm"
              />
              <button @click="sendChat" class="p-2 bg-izakaya-wood text-white rounded-lg hover:bg-izakaya-wood/80 transition-colors">
                <Send class="w-5 h-5" />
              </button>
            </div>
          </div>

          <!-- Right: Character Status -->
          <div class="w-full md:w-80 p-4 overflow-y-auto">
            <h3 class="text-sm font-bold text-izakaya-wood mb-4 flex items-center gap-2">
              <User class="w-4 h-4" /> 角色实时状态
            </h3>
            <div class="space-y-4">
              <div v-for="comp in companions" :key="comp?.id || Math.random()" class="p-4 bg-white/80 rounded-2xl border border-izakaya-wood/10 shadow-sm relative overflow-hidden">
                <!-- Avatar Background -->
                <div v-if="comp?.avatarUrl" class="absolute right-0 top-0 w-16 h-16 opacity-10 pointer-events-none">
                  <img :src="comp.avatarUrl" class="w-full h-full object-cover rounded-bl-full" />
                </div>
                
                <div class="flex items-center gap-3 mb-2">
                  <div class="w-10 h-10 rounded-full border-2 border-touhou-red/20 overflow-hidden bg-gray-100">
                    <img v-if="comp?.avatarUrl" :src="comp.avatarUrl" class="w-full h-full object-cover" />
                    <User v-else class="w-full h-full p-2 text-gray-400" />
                  </div>
                  <div>
                    <div class="text-sm font-bold text-izakaya-wood flex items-center gap-2">
                      {{ comp?.name || '未知访客' }}
                      <span v-if="comp?.isMe" class="text-[10px] bg-touhou-red text-white px-1 py-0.5 rounded">我</span>
                    </div>
                    <div class="text-[10px] text-gray-500">{{ comp?.identity || '访客' }}</div>
                  </div>
                </div>

                <div class="space-y-1.5">
                  <!-- HP Bar -->
                  <div class="space-y-0.5">
                    <div class="flex justify-between text-[10px]">
                      <span class="flex items-center gap-1"><Activity class="w-3 h-3 text-red-500" /> HP</span>
                      <span>{{ comp?.hp || 0 }}/{{ comp?.max_hp || 100 }}</span>
                    </div>
                    <div class="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden border border-izakaya-wood/5">
                      <div class="h-full bg-gradient-to-r from-red-500 to-pink-500 transition-all duration-500" :style="{ width: `${((comp?.hp || 0) / (comp?.max_hp || 100)) * 100}%` }"></div>
                    </div>
                  </div>
                  <!-- MP Bar -->
                  <div class="space-y-0.5">
                    <div class="flex justify-between text-[10px]">
                      <span class="flex items-center gap-1"><Zap class="w-3 h-3 text-blue-500" /> MP</span>
                      <span>{{ comp?.mp || 0 }}/{{ comp?.max_mp || 100 }}</span>
                    </div>
                    <div class="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden border border-izakaya-wood/5">
                      <div class="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500" :style="{ width: `${((comp?.mp || 0) / (comp?.max_mp || 100)) * 100}%` }"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. Logs Tab -->
        <div v-if="activeTab === 'logs'" class="flex-1 flex flex-col p-6 overflow-hidden">
          <div class="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
            <div v-for="(log, idx) in systemLogs" :key="idx" 
                 :class="['p-3 rounded-xl border flex gap-3 items-start animate-fade-in', 
                          log.type === 'success' ? 'bg-green-50 border-green-100 text-green-800' : 
                          log.type === 'warning' ? 'bg-yellow-50 border-yellow-100 text-yellow-800' :
                          log.type === 'error' ? 'bg-red-50 border-red-100 text-red-800' :
                          log.type === 'roll' ? 'bg-touhou-red/5 border-touhou-red/20 text-touhou-red font-bold' :
                          'bg-gray-50 border-gray-100 text-gray-600']">
              <div class="mt-0.5">
                <CheckCircle2 v-if="log.type === 'success'" class="w-4 h-4" />
                <AlertCircle v-else-if="log.type === 'warning' || log.type === 'error'" class="w-4 h-4" />
                <Dices v-else-if="log.type === 'roll'" class="w-4 h-4 animate-bounce" />
                <Info v-else class="w-4 h-4" />
              </div>
              <div class="flex-1">
                <p class="text-sm leading-relaxed">{{ log.message }}</p>
                <span class="text-[10px] opacity-50 font-mono">{{ new Date(log.timestamp).toLocaleTimeString() }}</span>
              </div>
            </div>
          </div>
        </div>

      </main>

      <!-- Footer / API Info -->
      <footer class="h-10 bg-white/80 border-t border-izakaya-wood/10 px-6 flex items-center justify-between text-[10px] text-gray-400 relative z-10">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-1">
            <div class="w-1.5 h-1.5 rounded-full bg-green-500"></div>
            <span>服务器已连接</span>
          </div>
          <span>房间号: {{ gameStore.multiplayer.roomId }}</span>
        </div>
        <div class="flex items-center gap-2">
          <span>API 共享状态:</span>
          <span class="text-touhou-red font-bold">活跃</span>
        </div>
      </footer>
    </div>
    
    <!-- Vote Creation Modal -->
    <div v-if="isVoteCreationOpen" class="absolute inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
      <div class="bg-izakaya-paper rounded-xl shadow-2xl p-6 max-w-md w-full border-2 border-izakaya-wood/20 relative overflow-hidden">
        <!-- Texture -->
        <div class="absolute inset-0 pointer-events-none opacity-40 bg-texture-rice-paper mix-blend-multiply"></div>
        
        <h3 class="relative text-lg font-bold text-izakaya-wood mb-4 flex items-center gap-2">
          <Vote class="w-5 h-5 text-touhou-red" />
          发起新投票
        </h3>
        
        <div class="relative space-y-4">
          <div class="space-y-1">
            <label class="text-xs font-bold text-gray-500">投票议题</label>
            <input 
              v-model="voteCreationProposal"
              placeholder="例如：是否同意进入神秘洞穴？"
              class="w-full px-3 py-2 bg-white/80 border border-izakaya-wood/20 rounded-lg focus:outline-none focus:border-touhou-red/50 text-sm font-serif-display"
              autofocus
            />
          </div>
          
          <div class="space-y-1">
            <label class="text-xs font-bold text-gray-500">选项 (用逗号分隔)</label>
            <input 
              v-model="voteCreationOptions"
              placeholder="同意,反对"
              class="w-full px-3 py-2 bg-white/80 border border-izakaya-wood/20 rounded-lg focus:outline-none focus:border-touhou-red/50 text-sm font-serif-display"
            />
            <p class="text-[10px] text-gray-400">至少需要两个选项</p>
          </div>
          
          <div class="flex justify-end gap-2 mt-6">
            <button 
              @click="closeVoteCreation"
              class="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg text-xs font-bold transition-colors"
            >
              取消
            </button>
            <button 
              @click="submitVoteCreation"
              class="px-4 py-2 bg-touhou-red text-white rounded-lg text-xs font-bold hover:bg-touhou-red-dark shadow-md transition-all"
            >
              发起投票
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Voting Modal -->
    <div v-if="activeVote" class="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
       <div class="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full border border-izakaya-wood/20">
          <h3 class="text-lg font-bold text-izakaya-wood mb-2 flex items-center gap-2">
             <Gavel class="w-5 h-5 text-touhou-red" />
             {{ activeVote.proposal }}
          </h3>
          <p class="text-xs text-gray-500 mb-4">由 {{ activeVote.initiatorId === multiplayerService.identityKey ? '我' : '其他玩家' }} 发起</p>
          
          <div class="space-y-2">
             <button 
               v-for="(opt, idx) in activeVote.options" 
               :key="idx"
               @click="castVote(idx)"
               :disabled="activeVote.hasVoted"
               class="w-full p-3 text-left rounded-lg border border-izakaya-wood/10 hover:bg-touhou-red/5 hover:border-touhou-red/30 transition-all flex items-center justify-between group disabled:opacity-50"
               :class="activeVote.hasVoted ? 'cursor-not-allowed' : 'cursor-pointer'"
             >
               <span class="font-bold text-izakaya-wood group-hover:text-touhou-red transition-colors">{{ opt }}</span>
               <div v-if="activeVote.hasVoted" class="text-xs text-gray-400">已投票</div>
             </button>
          </div>
          <div v-if="activeVote.hasVoted" class="mt-4 text-center text-xs text-gray-400 animate-pulse">
             等待其他玩家投票...
          </div>
       </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in-up {
  animation: fadeInUp 0.3s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-right {
  animation: fadeInRight 0.3s ease-out;
}

@keyframes fadeInRight {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.animate-fade-in {
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.typing-effect {
  overflow: hidden;
  border-right: .15em solid orange;
  white-space: nowrap;
  margin: 0 auto;
  letter-spacing: .15em;
  animation: 
    typing 3.5s steps(40, end),
    blink-caret .75s step-end infinite;
}

::-webkit-scrollbar {
  width: 4px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(139, 69, 19, 0.1);
  border-radius: 10px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(139, 69, 19, 0.2);
}
</style>

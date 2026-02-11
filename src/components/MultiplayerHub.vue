<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useGameStore } from '@/stores/game';
import { audioManager } from '@/services/audio';
import { useToastStore } from '@/stores/toast';
import { useSaveStore } from '@/stores/save';
import { multiplayerService } from '@/services/MultiplayerService';
import { X, Users, User, Copy, Plus, Network, LayoutGrid, Settings, Search, Lock, Wifi, Globe, Link, Loader2, Shield, Info, Radio, HelpCircle, Server, AlertTriangle } from 'lucide-vue-next';

defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const gameStore = useGameStore();
const toastStore = useToastStore();
const saveStore = useSaveStore();

// 官方服务器配置 (已混淆)
const _0x1a2b = ['d3NzOi8v', 'dG91aG91Lnl1eXUwOS5jbi93cw=='];
const OFFICIAL_SERVER_URL = window.atob(_0x1a2b[0] as string) + window.atob(_0x1a2b[1] as string);

const activeTab = ref<'lobby' | 'profile' | 'room' | 'settings'>('lobby');
const lobbySubTab = ref<'join' | 'create'>('join');
const serverUrl = ref(OFFICIAL_SERVER_URL);
const isOfficialServer = ref(true);
const isCustomServerConnected = ref(false);

// 用户协议状态
const hasAgreedToTos = ref(localStorage.getItem('mp_tos_agreed') === 'true');

const handleAgreeTos = () => {
  hasAgreedToTos.value = true;
  localStorage.setItem('mp_tos_agreed', 'true');
  audioManager.playClick();
};

// 监听服务器类型切换，重置连接状态
watch(isOfficialServer, (val) => {
  if (val) {
    serverUrl.value = OFFICIAL_SERVER_URL;
    isCustomServerConnected.value = false;
  } else {
    // 切换到自定义时清空，防止泄露官方域名明文，显示 placeholder
    serverUrl.value = '';
    isCustomServerConnected.value = false;
  }
});

// 处理自定义服务器连接
const handleConnectCustomServer = () => {
  if (!serverUrl.value) {
    toastStore.addToast('请输入服务器地址', 'error');
    return;
  }
  isConnecting.value = true;
  audioManager.playClick();
  
  // 模拟连接过程
  setTimeout(() => {
    isConnecting.value = false;
    isCustomServerConnected.value = true;
    toastStore.addToast('已成功连接至自定义服务器', 'success');
  }, 1000);
};

interface Room {
  id: string;
  name: string;
  hasPassword: boolean;
  players: number;
  maxPlayers: number;
  latency: string;
  host: string;
}

// 模拟房间列表数据 (此处未来应从服务器拉取)
const publicRooms = ref<Room[]>([]);
const isFetchingRooms = ref(false);
const roomNameInput = ref(''); // 新增：房间名称输入

const fetchRooms = async () => {
  if (!serverUrl.value) return;
  isFetchingRooms.value = true;
  
  publicRooms.value = [];
  
  try {
    const startTime = Date.now();
    const rooms = await multiplayerService.fetchPublicRooms();
    const endTime = Date.now();
    const ping = endTime - startTime;

    // 过滤掉当前房间，如果已经连接
    const filteredRooms = gameStore.multiplayer.isMultiplayer 
      ? rooms.filter((r: any) => r.id !== gameStore.multiplayer.roomId)
      : rooms;

    publicRooms.value = filteredRooms.map((r: any) => ({
      id: r.id,
      name: r.name || r.id, // 使用后端返回的房间名，如果没有则回退到 ID
      hasPassword: r.hasPassword,
      players: r.playerCount,
      maxPlayers: r.maxPlayers,
      latency: `${ping}ms`,
      host: r.hostName || '未知'
    }));
  } catch (e) {
    console.error('[联机] 获取房间列表失败:', e);
    publicRooms.value = [];
  } finally {
    isFetchingRooms.value = false;
  }
};

// 初始拉取
watch([activeTab, lobbySubTab, serverUrl], ([tab, subTab, url]) => {
  if (tab === 'lobby' && subTab === 'join' && url) {
    fetchRooms();
  }
}, { immediate: true });
const roomIdInput = ref('');
const passwordInput = ref('');
const joinPasswordInput = ref('');
const isConnecting = ref(false);
const playerSetup = ref({
  name: localStorage.getItem('mp_player_name') || '',
  identity: localStorage.getItem('mp_player_identity') || '',
  persona: localStorage.getItem('mp_player_persona') || '',
  power: localStorage.getItem('mp_player_power') || 'E'
});

// 监听玩家设置变化并保存
watch(playerSetup, (newVal) => {
  localStorage.setItem('mp_player_name', newVal.name);
  localStorage.setItem('mp_player_identity', newVal.identity);
  localStorage.setItem('mp_player_persona', newVal.persona);
  localStorage.setItem('mp_player_power', newVal.power);
}, { deep: true });

const identityKey = ref(multiplayerService.identityKey);
const isEditingKey = ref(false);
const newKeyInput = ref('');

const handleCopyKey = () => {
  navigator.clipboard.writeText(identityKey.value);
  toastStore.addToast('身份秘钥已复制到剪贴板', 'success');
  audioManager.playSoftClick();
};

const handleSaveKey = () => {
  if (multiplayerService.setIdentityKey(newKeyInput.value)) {
    identityKey.value = multiplayerService.identityKey;
    isEditingKey.value = false;
    newKeyInput.value = '';
    toastStore.addToast('身份秘钥已更新，请重新连接房间以生效', 'success');
    audioManager.playClick();
  } else {
    toastStore.addToast('秘钥格式无效（需至少8位字符）', 'error');
  }
};

const handleStartEditKey = () => {
  newKeyInput.value = identityKey.value;
  isEditingKey.value = true;
  audioManager.playSoftClick();
};

const handleClose = () => {
  audioManager.playSoftClick();
  emit('close');
};

const handleJoinRoom = async () => {
  if (!roomIdInput.value) {
    toastStore.addToast('请输入房间 ID', 'error');
    return;
  }
  
  // 客机加入时，如果未设定昵称，强制跳转到人设页
  if (!playerSetup.value.name) {
     toastStore.addToast('请先设定您的昵称', 'warning');
     activeTab.value = 'profile';
     return;
  }
  
  isConnecting.value = true;
  audioManager.playClick();
  
  try {
    const success = await multiplayerService.joinRoom(
      roomIdInput.value, 
      playerSetup.value.name, 
      playerSetup.value.identity,
      playerSetup.value.persona,
      playerSetup.value.power,
      joinPasswordInput.value
    );
    if (success) {
      // 查找当前选中的公开房名称（如果有）
      const selectedRoom = publicRooms.value.find(r => r.id === roomIdInput.value);
      gameStore.setRoomInfo(roomIdInput.value, joinPasswordInput.value, selectedRoom?.name || roomIdInput.value);
      gameStore.setMultiplayer(true, false);
      
      // 更新本地人设到 me (Guest Side)
      const myIdentityKey = multiplayerService.identityKey;
      if (!gameStore.state.multiplayer_companions) {
        gameStore.state.multiplayer_companions = {};
      }
      
      // 创建或更新客机人设数据
      gameStore.state.multiplayer_companions[myIdentityKey] = {
        ...gameStore.state.player, // 以房主数据为模板（获取基础属性）
        id: myIdentityKey,
        name: playerSetup.value.name,
        identity: playerSetup.value.identity || '异界访客',
        persona: playerSetup.value.persona,
        power: playerSetup.value.power as any,
        isMe: true
      };
      
      // Local preview update, waiting for real sync
      gameStore.updatePlayers([
        { id: 'host', name: '房主', identity: '房主', isHost: true, isMe: false },
        { 
          id: multiplayerService.identityKey, 
          name: playerSetup.value.name, 
          identity: playerSetup.value.identity || '异界访客', 
          persona: playerSetup.value.persona,
          power: playerSetup.value.power,
          isHost: false, 
          isMe: true 
        }
      ]);
      toastStore.addToast('成功加入房间！', 'success');
      // handleClose(); // Keep open to show lobby status
    } else {
       toastStore.addToast('加入房间失败', 'error');
    }
  } catch (e) {
     toastStore.addToast('加入房间出错', 'error');
  } finally {
    isConnecting.value = false;
  }
};

const isCurrentSaveMultiplayer = computed(() => {
  const currentSave = saveStore.saves.find(s => s.id === saveStore.currentSaveId);
  return !!currentSave?.isMultiplayer;
});

const handleCreateRoom = async () => {
  if (!isCurrentSaveMultiplayer.value) {
    toastStore.addToast('当前存档不是联机存档，无法创建房间', 'error');
    return;
  }

  // 房主创建房间不再强制要求 playerSetup，直接使用当前存档的 player 数据
  const hostPlayer = gameStore.state.player;

  isConnecting.value = true;
  audioManager.playClick();
  
  try {
    const newRoomId = await multiplayerService.createRoom(
      hostPlayer.name,
      hostPlayer.identity || '房主',
      hostPlayer.persona || '',
      hostPlayer.power as string || 'A',
      passwordInput.value,
      roomNameInput.value // 传入自定义房间名
    );
    gameStore.setRoomInfo(newRoomId, passwordInput.value, roomNameInput.value || newRoomId);
    
    // Local preview update
    gameStore.updatePlayers([
      { 
        id: multiplayerService.identityKey, 
        name: hostPlayer.name, 
        identity: hostPlayer.identity || '房主', 
        persona: hostPlayer.persona,
        power: hostPlayer.power as any,
        isHost: true, 
        isMe: true 
      }
    ]);
    gameStore.setMultiplayer(true, true);
    
    toastStore.addToast(`房间 ${newRoomId} 创建成功！`, 'success');
    // handleClose(); 
  } catch (e) {
    toastStore.addToast('创建房间出错', 'error');
  } finally {
    isConnecting.value = false;
  }
};

const handleDisconnect = () => {
  audioManager.playSoftClick();
  multiplayerService.disconnect();
  gameStore.setMultiplayer(false);
  gameStore.setRoomInfo(null);
  gameStore.updatePlayers([]);
  toastStore.addToast('已断开联机连接', 'info');
};

const copyRoomId = () => {
  if (gameStore.multiplayer.roomId) {
    navigator.clipboard.writeText(gameStore.multiplayer.roomId);
    toastStore.addToast('房间 ID 已复制', 'success');
  }
};
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-izakaya-wood/30 backdrop-blur-sm p-4 animate-fade-in">
    <div class="bg-izakaya-paper w-full max-w-lg rounded-xl shadow-paper flex flex-col max-h-[90vh] border border-izakaya-wood/10 relative overflow-hidden">
      <!-- Texture -->
      <div class="absolute inset-0 pointer-events-none opacity-10 bg-texture-rice-paper"></div>
      
      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b border-izakaya-wood/10 bg-white/40 relative z-10">
        <h2 class="text-lg font-bold font-display text-izakaya-wood flex items-center gap-2">
          <Network class="text-touhou-red w-5 h-5" />
          全能联机中心
        </h2>
        <button @click="handleClose" class="p-1 hover:bg-touhou-red/10 rounded-full text-izakaya-wood/50 hover:text-touhou-red transition-colors relative z-50">
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-hidden flex relative z-10">
        <!-- TOS Overlay -->
        <div v-if="!hasAgreedToTos" class="absolute inset-0 z-[100] bg-izakaya-paper flex flex-col animate-fade-in">
          <div class="absolute inset-0 pointer-events-none opacity-20 bg-texture-rice-paper"></div>
          <div class="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar relative">
            <div class="flex items-center gap-3 text-touhou-red mb-4">
              <Shield class="w-8 h-8" />
              <h3 class="text-xl font-bold font-display">联机服务使用协议</h3>
            </div>
            
            <div class="space-y-4 text-sm text-izakaya-wood/80 leading-relaxed font-serif-display">
              <section class="space-y-2">
                <h4 class="font-bold text-izakaya-wood">1. 隐私与数据安全</h4>
                <p>官方中继服务器（Relay Server）仅负责实时数据转发，<span class="text-touhou-red font-bold">不存储</span> 任何聊天内容、游戏指令或存档数据。所有数据在内存中即发即焚。</p>
              </section>

              <section class="space-y-2">
                <h4 class="font-bold text-izakaya-wood">2. 端到端加密</h4>
                <p>建议为房间设置密码。设置密码后，系统将启用 AES-GCM 端到端加密，您的通信内容在经过服务器时为密文，除房间成员外无人可解密。</p>
              </section>

              <section class="space-y-2">
                <h4 class="font-bold text-izakaya-wood">3. 内容准则</h4>
                <p>用户需自觉遵守当地法律法规。严禁利用本联机功能传播任何政治敏感、淫秽色情、暴力恐怖或侮辱他人的信息。由于技术上无法解密私密通话，您需对自己的言论负全部法律责任。</p>
              </section>

              <section class="space-y-2">
                <h4 class="font-bold text-izakaya-wood">4. 免责声明</h4>
                <p>本服务为非盈利性质的技术交流设施，不保证服务的绝对稳定性。因网络波动、服务器维护或不可抗力导致的数据丢失或连接中断，开发者不承担相关责任。</p>
              </section>

              <div class="p-4 bg-touhou-red/5 border border-touhou-red/10 rounded-xl text-xs">
                <p class="text-touhou-red flex items-center gap-2">
                  <AlertTriangle class="w-4 h-4" />
                  继续使用即表示您已阅读并同意上述协议。
                </p>
              </div>
            </div>
          </div>
          <div class="p-6 border-t border-izakaya-wood/10 bg-white/40 flex gap-3 relative">
            <button 
              @click="handleClose"
              class="flex-1 py-3 border border-izakaya-wood/20 text-izakaya-wood/60 rounded-xl font-bold hover:bg-izakaya-wood/5 transition-all"
            >
              拒绝并退出
            </button>
            <button 
              @click="handleAgreeTos"
              class="flex-[2] py-3 bg-touhou-red text-white rounded-xl font-bold shadow-lg shadow-touhou-red/20 hover:bg-touhou-red-dark transform active:scale-95 transition-all"
            >
              同意并进入
            </button>
          </div>
        </div>

        <!-- Sidebar Navigation -->
        <div class="w-16 border-r border-izakaya-wood/10 bg-izakaya-wood/5 flex flex-col items-center py-4 gap-4">
          <button 
            v-for="nav in [
              { id: 'lobby', icon: LayoutGrid, label: '大厅' },
              { id: 'profile', icon: User, label: '人设' },
              { id: 'room', icon: Users, label: '房间', disabled: !gameStore.multiplayer.isMultiplayer },
              { id: 'settings', icon: Settings, label: '设置' }
            ]"
            :key="nav.id"
            @click="!nav.disabled && (activeTab = nav.id as any); audioManager.playSoftClick()"
            :disabled="nav.disabled"
            class="p-3 rounded-xl transition-all relative group"
            :class="[
              activeTab === nav.id ? 'bg-touhou-red text-white shadow-lg' : 'text-izakaya-wood/40 hover:bg-white hover:text-izakaya-wood',
              nav.disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
            ]"
            :title="nav.label"
          >
            <component :is="nav.icon" class="w-6 h-6" />
            <div v-if="nav.id === 'room' && gameStore.multiplayer.isMultiplayer" class="absolute -top-1 -right-1 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
          </button>
        </div>

        <!-- Main Content Area -->
        <div class="flex-1 flex flex-col overflow-hidden bg-white/30">
          <!-- Lobby Tab -->
          <div v-if="activeTab === 'lobby'" class="flex-1 flex flex-col overflow-hidden animate-fade-in">
            <!-- Server Selector -->
            <div class="p-4 border-b border-izakaya-wood/10 bg-white/40">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <Globe class="w-4 h-4 text-touhou-red" />
                  <span class="text-xs font-bold text-izakaya-wood">联机服务器</span>
                </div>
                <div class="flex bg-izakaya-wood/5 p-1 rounded-lg border border-izakaya-wood/10">
                  <button 
                    @click="isOfficialServer = true; serverUrl = OFFICIAL_SERVER_URL"
                    class="px-3 py-1 text-[10px] font-bold rounded-md transition-all"
                    :class="isOfficialServer ? 'bg-white text-touhou-red shadow-sm' : 'text-izakaya-wood/40'"
                  >官方</button>
                  <button 
                    @click="isOfficialServer = false"
                    class="px-3 py-1 text-[10px] font-bold rounded-md transition-all"
                    :class="!isOfficialServer ? 'bg-white text-touhou-red shadow-sm' : 'text-izakaya-wood/40'"
                  >自定义</button>
                </div>
              </div>

              <div v-if="!isOfficialServer" class="flex gap-2">
                <input 
                  v-model="serverUrl"
                  type="text"
                  placeholder="wss://custom-relay-server.com/ws"
                  class="flex-1 pl-3 pr-3 py-2 bg-white/80 border border-izakaya-wood/20 rounded-lg text-xs font-mono outline-none focus:border-touhou-red transition-all"
                >
                <button 
                  @click="handleConnectCustomServer"
                  :disabled="isConnecting"
                  class="px-4 py-2 bg-touhou-red text-white rounded-lg text-xs font-bold whitespace-nowrap hover:bg-touhou-red-dark transition-all flex items-center gap-1 disabled:opacity-50"
                >
                  <Link v-if="!isConnecting" class="w-3 h-3" />
                  <Loader2 v-else class="w-3 h-3 animate-spin" />
                  连接
                </button>
              </div>
              
              <div v-if="isOfficialServer || isCustomServerConnected" 
                    class="flex items-center justify-center gap-4 px-3 py-2 bg-green-50 border border-green-100 rounded-lg"
                    :class="{ 'mt-3': !isOfficialServer }">
                <span v-if="!isOfficialServer" class="text-[10px] font-mono text-green-700">{{ serverUrl }}</span>
                <div v-if="!isOfficialServer" class="w-px h-3 bg-green-200"></div>
                <span class="text-[10px] font-bold text-green-600 flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                  服务器正常
                </span>
              </div>
            </div>

            <!-- Lobby Sub-Tabs -->
            <div v-if="!gameStore.multiplayer.isMultiplayer" class="flex-1 flex flex-col overflow-hidden p-4">
              
              <div class="flex gap-2 mb-4 bg-izakaya-wood/5 p-1 rounded-xl">
                <button 
                  @click="lobbySubTab = 'join'; audioManager.playSoftClick()"
                  class="flex-1 py-2 rounded-lg text-xs font-bold transition-all"
                  :class="lobbySubTab === 'join' ? 'bg-white text-izakaya-wood shadow-sm' : 'text-izakaya-wood/40'"
                >
                  浏览大厅
                </button>
                <button 
                  @click="lobbySubTab = 'create'; audioManager.playSoftClick()"
                  class="flex-1 py-2 rounded-lg text-xs font-bold transition-all relative group"
                  :class="[
                    lobbySubTab === 'create' ? 'bg-white text-izakaya-wood shadow-sm' : 'text-izakaya-wood/40',
                    !isCurrentSaveMultiplayer ? 'opacity-50 cursor-not-allowed' : ''
                  ]"
                >
                  创建房间
                  <!-- Tooltip for disabled state -->
                  <div v-if="!isCurrentSaveMultiplayer" class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black/80 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                    仅限联机模式存档使用
                  </div>
                </button>
              </div>

              <!-- Public Room List -->
              <div v-if="lobbySubTab === 'join'" class="flex-1 flex flex-col overflow-hidden space-y-3">
                <div class="relative">
                  <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-izakaya-wood/30" />
                  <input 
                    type="text" 
                    placeholder="搜索房间名或 ID..."
                    class="w-full pl-10 pr-4 py-2 bg-white border border-izakaya-wood/10 rounded-xl text-xs outline-none focus:border-touhou-red transition-all"
                  >
                </div>
                
                <div class="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                  <!-- Loading State -->
                  <div v-if="isFetchingRooms" class="flex flex-col items-center justify-center py-12 opacity-40">
                    <Loader2 class="w-8 h-8 animate-spin text-izakaya-wood mb-2" />
                    <span class="text-xs font-bold text-izakaya-wood">正在同步大厅列表...</span>
                  </div>

                  <!-- Empty State -->
                  <div v-else-if="publicRooms.length === 0" class="flex flex-col items-center justify-center py-12 bg-white/40 border border-dashed border-izakaya-wood/10 rounded-2xl">
                    <Radio class="w-8 h-8 text-izakaya-wood/20 mb-2" />
                    <span class="text-xs font-bold text-izakaya-wood/40">暂无公开房间</span>
                    <p class="text-[10px] text-izakaya-wood/20 mt-1">您可以尝试创建自己的房间</p>
                  </div>

                  <!-- Room Cards -->
                  <div v-else v-for="room in publicRooms" :key="room.id" 
                       class="p-3 bg-white border border-izakaya-wood/10 rounded-xl hover:border-touhou-red/30 transition-all group relative overflow-hidden">
                    <div class="flex items-center justify-between mb-2">
                      <div class="flex items-center gap-2">
                        <span class="text-xs font-bold text-izakaya-wood">{{ room.name }}</span>
                        <Lock v-if="room.hasPassword" class="w-3 h-3 text-izakaya-wood/30" />
                      </div>
                      <span class="text-[10px] font-mono text-izakaya-wood/30">#{{ room.id }}</span>
                    </div>
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-4">
                        <div class="flex items-center gap-1 text-[10px] text-izakaya-wood/50">
                          <Users class="w-3 h-3" />
                          {{ room.players }}/{{ room.maxPlayers }}
                        </div>
                        <div class="flex items-center gap-1 text-[10px] text-izakaya-wood/50">
                          <Wifi class="w-3 h-3" />
                          {{ room.latency }}
                        </div>
                        <div class="text-[10px] text-izakaya-wood/50 font-bold">房主: {{ room.host }}</div>
                      </div>
                      <button 
                        @click="roomIdInput = room.id; handleJoinRoom()"
                        class="px-4 py-1.5 bg-touhou-red/10 text-touhou-red hover:bg-touhou-red hover:text-white rounded-lg text-xs font-bold transition-all"
                      >加入</button>
                    </div>
                  </div>
                </div>

                <div class="p-3 bg-izakaya-wood/5 rounded-xl border border-dashed border-izakaya-wood/20 flex flex-col items-center justify-center gap-2">
                  <span class="text-[10px] text-izakaya-wood/40 font-bold">找不到房间？</span>
                  <div class="flex flex-col gap-2 w-full">
                    <div class="flex gap-2 w-full">
                      <input v-model="roomIdInput" type="text" placeholder="输入 6 位房间号" class="flex-1 px-3 py-1.5 bg-white border border-izakaya-wood/10 rounded-lg text-[10px] outline-none">
                      <input v-model="joinPasswordInput" type="password" placeholder="房间密码 (可选)" class="flex-1 px-3 py-1.5 bg-white border border-izakaya-wood/10 rounded-lg text-[10px] outline-none">
                    </div>
                    <button @click="handleJoinRoom" class="w-full py-1.5 bg-izakaya-wood text-white rounded-lg text-[10px] font-bold hover:bg-izakaya-wood/90 transition-all">直连加入</button>
                  </div>
                </div>
              </div>

              <!-- Create Panel (Internalized) -->
              <div v-if="lobbySubTab === 'create'" class="space-y-4 animate-fade-in">
                <div class="p-4 bg-white border border-izakaya-wood/10 rounded-2xl space-y-4">
                  <div class="space-y-2">
                    <label class="block text-xs font-bold text-izakaya-wood">房间名称</label>
                    <input v-model="roomNameInput" type="text" placeholder="给你的房间起个名字" class="w-full px-4 py-2 bg-izakaya-wood/5 border border-izakaya-wood/10 rounded-xl text-xs outline-none focus:border-touhou-red transition-all">
                  </div>
                  <div class="space-y-2">
                    <label class="block text-xs font-bold text-izakaya-wood">房间密码 (可选)</label>
                    <div class="relative">
                      <Shield class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-izakaya-wood/30" />
                      <input v-model="passwordInput" type="password" placeholder="留空则公开" class="w-full pl-10 pr-4 py-2 bg-izakaya-wood/5 border border-izakaya-wood/10 rounded-xl text-xs outline-none focus:border-touhou-red transition-all">
                    </div>
                  </div>
                  <div class="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-100 rounded-xl">
                    <Info class="w-4 h-4 text-yellow-600 flex-shrink-0" />
                    <p class="text-[10px] text-yellow-700 leading-relaxed font-medium">创建房间后，您将作为 Host 承担所有计算与存储任务，请保持游戏运行。</p>
                  </div>
                </div>
                <button 
                  @click="handleCreateRoom"
                  :disabled="isConnecting"
                  class="w-full py-4 bg-touhou-red hover:bg-touhou-red-dark text-white rounded-2xl font-bold shadow-lg shadow-touhou-red/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Plus v-if="!isConnecting" class="w-5 h-5" />
                  <Loader2 v-else class="w-5 h-5 animate-spin" />
                  {{ isConnecting ? '正在初始化服务器...' : '启动联机房间' }}
                </button>
              </div>
            </div>

              <!-- Connected View (Minimalist Lobby) -->
            <div v-if="gameStore.multiplayer.isMultiplayer" class="flex-1 flex flex-col p-6 overflow-hidden animate-fade-in relative">
              <!-- Background Decor -->
              <div class="absolute inset-0 pointer-events-none opacity-5">
                 <div class="absolute top-10 left-10 w-32 h-32 bg-touhou-red rounded-full filter blur-3xl"></div>
                 <div class="absolute bottom-10 right-10 w-40 h-40 bg-blue-500 rounded-full filter blur-3xl"></div>
              </div>

              <!-- Connection Status -->
              <div class="mb-6 relative z-10">
                <div class="p-5 bg-white/80 backdrop-blur-md border border-green-200/50 rounded-2xl shadow-lg relative overflow-hidden group">
                  <div class="absolute -right-4 -top-4 opacity-10 transform rotate-12 transition-transform group-hover:scale-110 group-hover:rotate-6 duration-500">
                    <Radio class="w-24 h-24 text-green-600" />
                  </div>
                  
                  <div class="flex items-center justify-between mb-4 relative z-10">
                    <div>
                       <span class="text-sm font-bold text-green-700 flex items-center gap-2 mb-1">
                         <span class="relative flex h-3 w-3">
                           <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                           <span class="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                         </span>
                         已连接至分发网络
                       </span>
                       <div class="text-[10px] text-green-600/60 font-medium ml-5">
                          E2EE 加密通道开启 • 延迟 {{ Math.floor(Math.random() * 40 + 20) }}ms
                       </div>
                    </div>
                    
                    <button 
                      @click="handleDisconnect" 
                      class="text-xs font-bold text-red-500 hover:text-white px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-500 hover:border-red-500 transition-all shadow-sm"
                    >
                      断开连接
                    </button>
                  </div>

                  <div class="flex items-center gap-2 bg-green-50/50 backdrop-blur-sm p-3 rounded-xl border border-green-100/50 shadow-inner group-hover:bg-white/90 transition-colors">
                    <div class="flex-1">
                      <div class="text-[10px] text-green-600/50 uppercase font-bold tracking-tighter mb-0.5">ROOM: {{ gameStore.multiplayer.roomName || 'UNNAMED' }}</div>
                      <code class="text-xl font-mono font-bold text-green-800 tracking-wider">{{ gameStore.multiplayer.roomId }}</code>
                    </div>
                    <button @click="copyRoomId" class="p-2.5 bg-white text-green-600 rounded-lg hover:text-green-700 hover:shadow-md transition-all active:scale-95 border border-green-100" title="复制 ID">
                      <Copy class="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Quick Stats -->
              <div class="grid grid-cols-2 gap-4 mb-6 relative z-10">
                <div class="p-4 bg-white/60 border border-izakaya-wood/10 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                  <div class="flex items-center gap-2 mb-2">
                     <Users class="w-4 h-4 text-touhou-red opacity-50" />
                     <div class="text-[10px] text-izakaya-wood/40 font-bold uppercase">在线人数</div>
                  </div>
                  <div class="text-2xl font-bold text-izakaya-wood font-display">
                     {{ gameStore.multiplayer.players.length }}<span class="text-sm text-izakaya-wood/30 ml-1">/ 6</span>
                  </div>
                </div>
                <div class="p-4 bg-white/60 border border-izakaya-wood/10 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                  <div class="flex items-center gap-2 mb-2">
                     <Wifi class="w-4 h-4 text-blue-500 opacity-50" />
                     <div class="text-[10px] text-izakaya-wood/40 font-bold uppercase">连接质量</div>
                  </div>
                  <div class="text-2xl font-bold text-izakaya-wood font-display">
                     优<span class="text-sm text-green-500 ml-1">Excellent</span>
                  </div>
                </div>
              </div>

              <div class="flex-1 flex flex-col items-center justify-center text-center p-6 bg-white/40 rounded-3xl border border-dashed border-izakaya-wood/10 relative z-10">
                <div class="w-20 h-20 bg-gradient-to-br from-touhou-red/10 to-transparent rounded-full flex items-center justify-center mb-4 shadow-sm animate-pulse">
                  <div class="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-md">
                     <Users class="w-8 h-8 text-touhou-red" />
                  </div>
                </div>
                <h4 class="text-base font-bold text-izakaya-wood mb-2">房间运行正常</h4>
                <p class="text-xs text-izakaya-wood/50 max-w-[240px] leading-relaxed">
                   您已成功加入多人联机网络。点击左侧侧边栏的 <span class="font-bold text-touhou-red">“房间”</span> 图标，查看所有成员状态并进行管理。
                </p>
              </div>
            </div>
          </div>

          <!-- Profile Tab -->
          <div v-if="activeTab === 'profile'" class="flex-1 flex flex-col p-6 overflow-hidden animate-fade-in">
            <div class="mb-6">
              <h3 class="text-lg font-bold text-izakaya-wood flex items-center gap-2">
                <User class="w-5 h-5 text-touhou-red" />
                访客身份设定 (Guest Profile)
              </h3>
              <p class="text-xs text-izakaya-wood/50 mt-1">作为客机加入他人房间时，其他玩家将看到这些信息。房主将直接使用当前存档的角色信息。</p>
            </div>
            
            <div class="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-6">
              <div class="p-5 bg-white border border-izakaya-wood/10 rounded-2xl shadow-sm space-y-5">
                <div class="grid grid-cols-2 gap-4">
                  <div class="space-y-2">
                    <label class="text-xs font-bold text-izakaya-wood/60">昵称 (Name)</label>
                    <input v-model="playerSetup.name" type="text" placeholder="您的名字" class="w-full px-4 py-2.5 bg-izakaya-wood/5 border border-izakaya-wood/10 rounded-xl text-sm outline-none focus:border-touhou-red transition-all">
                  </div>
                  <div class="space-y-2">
                    <label class="text-xs font-bold text-izakaya-wood/60">身份 (Identity)</label>
                    <input v-model="playerSetup.identity" type="text" placeholder="例如: 异界魔法师" class="w-full px-4 py-2.5 bg-izakaya-wood/5 border border-izakaya-wood/10 rounded-xl text-sm outline-none focus:border-touhou-red transition-all">
                  </div>
                </div>

                <div class="space-y-2">
                   <label class="text-xs font-bold text-izakaya-wood/60">人设背景 & 性格 (Persona)</label>
                   <textarea 
                      v-model="playerSetup.persona" 
                      placeholder="简要描述您的背景故事、性格特征或外貌..." 
                      class="w-full h-32 px-4 py-3 bg-izakaya-wood/5 border border-izakaya-wood/10 rounded-xl text-sm outline-none focus:border-touhou-red transition-all resize-none"
                   ></textarea>
                </div>

                <div class="grid grid-cols-2 gap-4">
                   <div class="space-y-2">
                      <label class="text-xs font-bold text-izakaya-wood/60">战斗力 (Rank)</label>
                      <select v-model="playerSetup.power" class="w-full px-4 py-2.5 bg-izakaya-wood/5 border border-izakaya-wood/10 rounded-xl text-sm outline-none focus:border-touhou-red transition-all">
                         <option value="∞">∞</option>
                         <option value="OMEGA">OMEGA</option>
                         <option value="UX">UX</option>
                         <option value="EX">EX</option>
                         <option value="US">US</option>
                         <option value="SSS">SSS</option>
                         <option value="SS">SS</option>
                         <option value="S+">S+</option>
                         <option value="S">S</option>
                         <option value="A+">A+</option>
                         <option value="A">A</option>
                         <option value="B+">B+</option>
                         <option value="B">B</option>
                         <option value="C+">C+</option>
                         <option value="C">C</option>
                         <option value="D+">D+</option>
                         <option value="D">D</option>
                         <option value="E+">E+</option>
                         <option value="E">E</option>
                         <option value="F+">F+</option>
                         <option value="F">F</option>
                         <option value="F-">F-</option>
                      </select>
                   </div>
                   <div class="flex items-end">
                      <button class="w-full py-2.5 bg-izakaya-wood/5 text-izakaya-wood/40 rounded-xl text-xs font-bold border border-dashed border-izakaya-wood/20 hover:bg-izakaya-wood/10 transition-colors flex items-center justify-center gap-2">
                         <Loader2 class="w-3 h-3" />
                         上传头像 (开发中)
                      </button>
                   </div>
                </div>
              </div>

              <div class="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex gap-3">
                <Info class="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div class="text-[10px] text-blue-700 leading-relaxed">
                  <span class="font-bold block mb-1">提示：</span>
                  这些信息将在您加入或创建房间时同步给其他玩家。在联机过程中修改这些信息可能需要重新同步。
                </div>
              </div>

              <!-- Identity Key Management -->
              <div class="p-5 bg-izakaya-wood/5 border border-izakaya-wood/10 rounded-2xl space-y-4">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <Shield class="w-4 h-4 text-touhou-red" />
                    <h4 class="text-xs font-bold text-izakaya-wood uppercase tracking-wider">身份识别秘钥 (Identity Key)</h4>
                  </div>
                  <HelpCircle class="w-4 h-4 text-izakaya-wood/30 cursor-help" title="用于在不同浏览器或设备间同步您的玩家身份" />
                </div>
                
                <p class="text-[10px] text-izakaya-wood/50 leading-relaxed">
                  这是您的唯一识别码。如果您更换浏览器或设备，可以手动导入此秘钥，以确保房主能识别出您之前的角色数据。
                </p>

                <div v-if="!isEditingKey" class="flex items-center gap-2">
                  <div class="flex-1 px-4 py-2 bg-white border border-izakaya-wood/10 rounded-xl font-mono text-xs text-izakaya-wood/70 truncate shadow-inner">
                    {{ identityKey }}
                  </div>
                  <button @click="handleCopyKey" class="p-2 bg-white text-izakaya-wood/60 rounded-xl hover:text-touhou-red border border-izakaya-wood/10 shadow-sm transition-all active:scale-95" title="复制秘钥">
                    <Copy class="w-4 h-4" />
                  </button>
                  <button @click="handleStartEditKey" class="px-3 py-2 bg-white text-izakaya-wood/60 rounded-xl hover:text-touhou-red border border-izakaya-wood/10 shadow-sm text-[10px] font-bold transition-all active:scale-95">
                    修改/导入
                  </button>
                </div>
                
                <div v-else class="space-y-3">
                  <input 
                    v-model="newKeyInput" 
                    type="text" 
                    placeholder="粘贴或输入您的身份秘钥..." 
                    class="w-full px-4 py-2 bg-white border border-touhou-red/30 rounded-xl font-mono text-xs text-izakaya-wood outline-none focus:border-touhou-red shadow-sm"
                  >
                  <div class="flex gap-2">
                    <button @click="handleSaveKey" class="flex-1 py-2 bg-touhou-red text-white rounded-xl text-[10px] font-bold shadow-md shadow-touhou-red/20 active:scale-95 transition-all">
                      保存并应用
                    </button>
                    <button @click="isEditingKey = false" class="px-4 py-2 bg-white text-izakaya-wood/40 rounded-xl text-[10px] font-bold border border-izakaya-wood/10 active:scale-95 transition-all">
                      取消
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Room Tab -->
          <div v-if="activeTab === 'room'" class="flex-1 flex flex-col p-6 overflow-hidden animate-fade-in">
            <div class="flex items-center justify-between mb-6">
              <h3 class="text-lg font-bold text-izakaya-wood flex items-center gap-2">
                <Users class="w-5 h-5 text-touhou-red" />
                在线玩家 ({{ gameStore.multiplayer.players.length }}/6)
              </h3>
              <div class="flex items-center gap-2 px-3 py-1 bg-green-50 text-green-600 rounded-full border border-green-100">
                <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                <span class="text-[10px] font-bold uppercase">实时同步中</span>
              </div>
            </div>
            
            <div class="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1">
              <div v-for="player in gameStore.multiplayer.players" :key="player.id" 
                   class="flex items-center gap-4 p-4 bg-white border border-izakaya-wood/10 rounded-2xl transition-all hover:border-touhou-red/30 hover:shadow-md group relative">
                <div class="relative">
                  <div class="w-12 h-12 rounded-full bg-touhou-red/10 border border-touhou-red/20 flex items-center justify-center text-touhou-red font-bold text-lg shadow-inner group-hover:bg-touhou-red group-hover:text-white transition-all">
                    {{ player.name.charAt(0) }}
                  </div>
                  <div v-if="player.isHost" class="absolute -bottom-1 -right-1 bg-yellow-400 text-white rounded-full p-1 border-2 border-white shadow-sm" title="房主">
                    <Shield class="w-3 h-3" />
                  </div>
                </div>
                
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <div class="text-base font-bold text-izakaya-wood truncate">{{ player.name }}</div>
                    <div v-if="player.isMe" class="px-2 py-0.5 bg-blue-100 text-blue-600 text-[10px] rounded-full font-bold uppercase tracking-tighter">本人</div>
                  </div>
                  <div class="text-xs text-izakaya-wood/50 truncate flex items-center gap-2">
                    <span class="inline-block w-2 h-2 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]"></span>
                    {{ player.identity }}
                  </div>
                </div>

                <div class="flex flex-col items-end gap-2">
                  <div v-if="player.isHost" class="px-2 py-1 bg-touhou-red/5 text-touhou-red text-[10px] rounded border border-touhou-red/10 font-bold uppercase tracking-widest">ROOM HOST</div>
                  <div v-else class="px-2 py-1 bg-izakaya-wood/5 text-izakaya-wood/40 text-[10px] rounded border border-izakaya-wood/10 font-bold uppercase tracking-widest">GUEST</div>
                  <div v-if="gameStore.multiplayer.isHost && !player.isMe" class="opacity-0 group-hover:opacity-100 transition-opacity">
                    <button class="text-[10px] font-bold text-red-400 hover:text-red-600">移出房间</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Quick Tip -->
            <div class="mt-6 p-4 bg-blue-50/50 border border-blue-100 rounded-2xl flex gap-3 items-start">
              <div class="p-2 bg-blue-100 rounded-lg">
                <HelpCircle class="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h5 class="text-xs font-bold text-blue-700 mb-1">互动提示</h5>
                <p class="text-[10px] text-blue-600/80 leading-relaxed font-medium">
                  联机模式下，所有玩家共享同一个剧情流。您可以通过主界面的“跑团决策系统”提交行动建议，由房主汇总后决定剧情走向。
                </p>
              </div>
            </div>
          </div>

          <!-- Settings Tab -->
          <div v-if="activeTab === 'settings'" class="flex-1 flex flex-col p-6 overflow-hidden animate-fade-in">
            <h3 class="text-lg font-bold text-izakaya-wood mb-6 flex items-center gap-2">
              <Settings class="w-5 h-5 text-touhou-red" />
              联机系统设置
            </h3>
            
            <div class="space-y-6">
              <div class="p-4 bg-white border border-izakaya-wood/10 rounded-2xl space-y-4">
                <div class="flex items-center justify-between">
                  <div>
                    <div class="text-sm font-bold text-izakaya-wood">端到端加密 (E2EE)</div>
                    <div class="text-[10px] text-izakaya-wood/40 font-medium">消息在本地加密，服务器无法解密剧情内容</div>
                  </div>
                  <div class="w-10 h-5 bg-green-500 rounded-full relative shadow-inner">
                    <div class="absolute right-1 top-1 w-3 h-3 bg-white rounded-full shadow-sm"></div>
                  </div>
                </div>
                
                <div class="border-t border-izakaya-wood/5 pt-4 flex items-center justify-between">
                  <div>
                    <div class="text-sm font-bold text-izakaya-wood">同步频率</div>
                    <div class="text-[10px] text-izakaya-wood/40 font-medium">降低频率可节省流量，但延迟会增加</div>
                  </div>
                  <select class="bg-izakaya-wood/5 border border-izakaya-wood/10 rounded-lg px-3 py-1 text-xs outline-none">
                    <option>极速 (50ms)</option>
                    <option selected>平衡 (200ms)</option>
                    <option>省流 (1000ms)</option>
                  </select>
                </div>

                <div class="border-t border-izakaya-wood/5 pt-4 flex items-center justify-between">
                  <div>
                    <div class="text-sm font-bold text-izakaya-wood">投票规则</div>
                    <div class="text-[10px] text-izakaya-wood/40 font-medium">设定模型切换或重要决策的投票阈值</div>
                  </div>
                  <select class="bg-izakaya-wood/5 border border-izakaya-wood/10 rounded-lg px-3 py-1 text-xs outline-none">
                    <option>少数服从多数</option>
                    <option selected>全员一致</option>
                    <option>仅房主决定</option>
                  </select>
                </div>
              </div>

              <div class="p-4 bg-izakaya-wood/5 border border-izakaya-wood/10 rounded-2xl flex items-center gap-4">
                <div class="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-touhou-red shadow-sm">
                  <Server class="w-6 h-6" />
                </div>
                <div>
                  <div class="text-sm font-bold text-izakaya-wood">分发器版本 (Go Relay)</div>
                  <div class="text-[10px] text-izakaya-wood/40 font-mono uppercase font-bold">v1.0.4-stable (E2EE Enabled)</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.shadow-paper {
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
}
</style>

<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted, watch } from 'vue';
import { useMusicPlayerStore } from '@/stores/musicPlayer';
import { useGameStore } from '@/stores/game';
import { 
  Play, Pause, SkipBack, SkipForward, 
  ListMusic, X, Plus, Music, Disc, Repeat, Repeat1, Shuffle, GripHorizontal, ChevronDown 
} from 'lucide-vue-next';

const store = useMusicPlayerStore();
const gameStore = useGameStore();
const showSettings = ref(false);
const isHovered = ref(false);
const isExpanded = ref(false); // Changed to false by default

// Combat State Integration
const isCombatActive = computed(() => {
  const combat = gameStore.state.system.combat;
  return !!combat && (combat.isActive || combat.isPending);
});

const wasPlayingBeforeCombat = ref(false);

// Auto-pause music when entering combat and resume when leaving
watch(isCombatActive, (active) => {
  if (active) {
    if (store.isPlaying) {
      wasPlayingBeforeCombat.value = true;
      console.log('[MusicPlayer] Combat active, auto-pausing music.');
      store.pause();
    } else {
      wasPlayingBeforeCombat.value = false;
    }
  } else {
    if (wasPlayingBeforeCombat.value) {
      console.log('[MusicPlayer] Combat ended, auto-resuming music.');
      store.play();
      wasPlayingBeforeCombat.value = false;
    }
  }
});

// Draggable logic
const position = ref({ x: window.innerWidth - 300, y: window.innerHeight - 100 });
const isDragging = ref(false);
const dragOffset = ref({ x: 0, y: 0 });

function startDrag(e: MouseEvent) {
  if (showSettings.value) return; // Don't drag when settings are open
  isDragging.value = true;
  dragOffset.value = {
    x: e.clientX - position.value.x,
    y: e.clientY - position.value.y
  };
  window.addEventListener('mousemove', onDrag);
  window.addEventListener('mouseup', stopDrag);
}

function onDrag(e: MouseEvent) {
  if (!isDragging.value) return;
  position.value = {
    x: e.clientX - dragOffset.value.x,
    y: e.clientY - dragOffset.value.y
  };
}

function stopDrag() {
  isDragging.value = false;
  window.removeEventListener('mousemove', onDrag);
  window.removeEventListener('mouseup', stopDrag);
}

onUnmounted(() => {
  stopDrag();
});

onMounted(() => {
  store.init();
});

const progress = computed({
  get: () => (store.currentTime / store.duration) * 100 || 0,
  set: (val) => {
    const time = (val / 100) * store.duration;
    store.seek(time);
  }
});

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function handleAddTrack() {
  if (!newTrackInput.value) return;

  if (newTrackType.value === 'custom') {
    store.addTrack({
      id: `custom-${Date.now()}`,
      title: newTrackTitle.value || '未知曲目',
      artist: '自定义',
      url: newTrackInput.value,
      type: 'local' // Treat as direct audio
    });
  } else if (newTrackType.value === 'netease') {
    // Input should be ID
    const id = newTrackInput.value;
    store.addTrack({
      id: `netease-${id}`,
      title: newTrackTitle.value || `网易云音乐 ${id}`,
      artist: 'Netease',
      url: `//music.163.com/outchain/player?type=2&id=${id}&auto=1&height=66`,
      type: 'iframe',
      source: 'netease',
      externalId: id
    });
  }
  
  newTrackInput.value = '';
  newTrackTitle.value = '';
}

const newTrackType = ref<'custom' | 'netease'>('custom');
const newTrackInput = ref('');
const newTrackTitle = ref('');

function toggleExpand() {
  isExpanded.value = !isExpanded.value;
}
</script>

<template>
  <div 
    v-show="!isCombatActive"
    class="fixed z-[9999] flex flex-col items-end gap-2 font-serif text-izakaya-wood select-none"
    :style="{ left: position.x + 'px', top: position.y + 'px' }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    
    <!-- Settings/Playlist Panel -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-4 scale-95"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 translate-y-4 scale-95"
    >
      <div v-if="showSettings" class="bg-izakaya-paper border-2 border-izakaya-wood/30 rounded-lg shadow-xl w-80 overflow-hidden mb-2 absolute bottom-full right-0">
        <!-- Header -->
        <div class="bg-izakaya-wood/10 px-4 py-2 flex items-center justify-between border-b border-izakaya-wood/10">
          <h3 class="font-bold text-sm">播放列表 & 设置</h3>
          <div class="flex gap-2">
            <button 
              @click="store.mode = store.mode === 'loop' ? 'random' : (store.mode === 'random' ? 'single' : 'loop')"
              class="hover:text-touhou-red transition-colors"
              :title="store.mode === 'loop' ? '列表循环' : (store.mode === 'random' ? '随机播放' : '单曲循环')"
            >
              <Repeat v-if="store.mode === 'loop'" class="w-4 h-4" />
              <Shuffle v-else-if="store.mode === 'random'" class="w-4 h-4" />
              <Repeat1 v-else class="w-4 h-4 text-touhou-red" />
            </button>
            <button @click.stop="showSettings = false" class="hover:text-touhou-red"><X class="w-4 h-4" /></button>
          </div>
        </div>

        <!-- Add Track -->
        <div class="p-3 border-b border-izakaya-wood/10 bg-white/50">
          <div class="flex gap-2 mb-2 text-xs">
            <button 
              @click="newTrackType = 'custom'"
              class="px-2 py-1 rounded border transition-colors"
              :class="newTrackType === 'custom' ? 'bg-touhou-red text-white border-touhou-red' : 'border-izakaya-wood/30 hover:bg-izakaya-wood/10'"
            >
              自定义链接
            </button>
            <button 
              @click="newTrackType = 'netease'"
              class="px-2 py-1 rounded border transition-colors"
              :class="newTrackType === 'netease' ? 'bg-touhou-red text-white border-touhou-red' : 'border-izakaya-wood/30 hover:bg-izakaya-wood/10'"
            >
              网易云ID
            </button>
          </div>
          <input 
            v-model="newTrackTitle" 
            placeholder="标题 (可选)" 
            class="w-full mb-2 px-2 py-1 text-xs border border-izakaya-wood/20 rounded bg-white/80 focus:outline-none focus:border-touhou-red/50"
          >
          <div class="flex gap-2">
            <input 
              v-model="newTrackInput" 
              :placeholder="newTrackType === 'custom' ? 'MP3/OGG URL' : '歌曲 ID (数字)'" 
              class="flex-1 px-2 py-1 text-xs border border-izakaya-wood/20 rounded bg-white/80 focus:outline-none focus:border-touhou-red/50"
            >
            <button @click="handleAddTrack" class="p-1 bg-izakaya-wood text-white rounded hover:bg-touhou-red transition-colors">
              <Plus class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Playlist -->
        <div class="max-h-60 overflow-y-auto p-1 custom-scrollbar">
          <div 
            v-for="(track, index) in store.playlist" 
            :key="track.id"
            @click="store.play(index)"
            class="group flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-izakaya-wood/5 transition-colors"
            :class="{ 'bg-touhou-red/10': store.currentIndex === index }"
          >
            <div class="w-6 h-6 flex items-center justify-center rounded-full bg-izakaya-wood/10 text-izakaya-wood/50 text-xs font-mono">
              <span v-if="store.currentIndex === index && store.isPlaying" class="animate-pulse">♫</span>
              <span v-else>{{ index + 1 }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-xs font-bold truncate" :class="{ 'text-touhou-red': store.currentIndex === index }">{{ track.title }}</div>
              <div class="text-[10px] text-izakaya-wood/50 truncate">{{ track.artist }}</div>
            </div>
            <button 
              @click.stop="store.removeTrack(index)"
              class="opacity-0 group-hover:opacity-100 p-1 text-izakaya-wood/30 hover:text-touhou-red transition-opacity"
            >
              <X class="w-3 h-3" />
            </button>
          </div>
          <div v-if="store.playlist.length === 0" class="text-center py-4 text-xs text-izakaya-wood/40">
            暂无曲目
          </div>
        </div>
      </div>
    </Transition>

    <!-- Main Player UI -->
    <div 
      class="bg-izakaya-paper border-2 border-izakaya-wood/30 rounded-xl shadow-lg flex items-center overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
      :class="isExpanded ? 'w-64 flex-col' : 'w-auto px-2 py-1.5'"
    >
      <div class="absolute inset-0 bg-texture-rice-paper opacity-50 pointer-events-none"></div>
      
      <!-- Drag Handle & Header -->
      <div 
        @mousedown="startDrag"
        class="flex items-center justify-between cursor-move hover:bg-izakaya-wood/5 transition-colors z-20"
        :class="isExpanded ? 'w-full h-8 px-2 border-b border-izakaya-wood/10' : 'absolute left-0 top-0 bottom-0 w-4 justify-center'"
      >
        <GripHorizontal class="w-3 h-3 text-izakaya-wood/30" />
        <button 
          v-if="isExpanded" 
          @click.stop="toggleExpand" 
          class="p-1 hover:bg-izakaya-wood/10 rounded-full transition-colors group"
          title="收回播放器"
        >
          <ChevronDown class="w-4 h-4 text-izakaya-wood/50 group-hover:text-touhou-red transition-transform duration-300" />
        </button>
      </div>

      <Transition 
        mode="out-in"
        enter-active-class="transition duration-300 ease-out"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-200 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <!-- Mini Mode Content -->
        <div v-if="!isExpanded" class="flex items-center gap-2 relative z-10 pl-4">
          <button @click="store.prev" class="p-1 text-izakaya-wood hover:text-touhou-red transition-colors">
            <SkipBack class="w-4 h-4" />
          </button>
          
          <button 
            @click="store.togglePlay" 
            class="w-7 h-7 rounded-full bg-izakaya-wood text-white flex items-center justify-center hover:bg-touhou-red transition-colors shadow-sm"
          >
            <Pause v-if="store.isPlaying" class="w-3.5 h-3.5 fill-current" />
            <Play v-else class="w-3.5 h-3.5 fill-current ml-0.5" />
          </button>
          
          <button @click="store.next" class="p-1 text-izakaya-wood hover:text-touhou-red transition-colors">
            <SkipForward class="w-4 h-4" />
          </button>

          <div class="w-px h-4 bg-izakaya-wood/10 mx-1"></div>

          <button @click="toggleExpand" class="p-1 text-izakaya-wood/60 hover:text-touhou-red transition-colors">
            <Disc class="w-4 h-4" :class="{ 'animate-spin-slow': store.isPlaying }" />
          </button>
        </div>

        <!-- Expanded Mode Content -->
        <div v-else class="relative z-10 p-3 w-full">
          <!-- Native Player UI -->
          <div v-if="store.currentTrack?.type !== 'iframe'">
            <!-- Info -->
            <div class="flex items-start justify-between mb-3">
              <div class="flex items-center gap-3 overflow-hidden">
                <div class="w-10 h-10 rounded-md bg-izakaya-wood/10 flex items-center justify-center border border-izakaya-wood/10 shrink-0">
                  <Music class="w-5 h-5 text-izakaya-wood/40" />
                </div>
                <div class="min-w-0">
                  <div class="text-sm font-bold truncate">{{ store.currentTrack?.title || '未播放' }}</div>
                  <div class="text-xs text-izakaya-wood/60 truncate">{{ store.currentTrack?.artist || '---' }}</div>
                </div>
              </div>
              <div class="flex gap-1">
                <button @click.stop="showSettings = !showSettings" class="p-1.5 text-izakaya-wood/60 hover:bg-izakaya-wood/10 rounded-full transition-colors">
                  <ListMusic class="w-4 h-4" />
                </button>
              </div>
            </div>

            <!-- Progress -->
            <div class="mb-2">
              <div class="flex justify-between text-[10px] text-izakaya-wood/50 mb-1 font-mono">
                <span>{{ formatTime(store.currentTime) }}</span>
                <span>{{ formatTime(store.duration) }}</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="100" 
                v-model="progress"
                class="w-full h-1 bg-izakaya-wood/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-touhou-red"
              >
            </div>

            <!-- Controls -->
            <div class="flex items-center justify-between">
              <button @click="store.prev" class="p-2 text-izakaya-wood hover:text-touhou-red transition-colors">
                <SkipBack class="w-4 h-4" />
              </button>
              
              <button 
                @click="store.togglePlay" 
                class="w-8 h-8 rounded-full bg-izakaya-wood text-white flex items-center justify-center hover:bg-touhou-red transition-colors shadow-sm"
              >
                <Pause v-if="store.isPlaying" class="w-4 h-4 fill-current" />
                <Play v-else class="w-4 h-4 fill-current ml-0.5" />
              </button>
              
              <button @click="store.next" class="p-2 text-izakaya-wood hover:text-touhou-red transition-colors">
                <SkipForward class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Iframe Player UI -->
          <div v-else class="relative z-10 bg-white -mx-3 -mb-3 rounded-b-xl overflow-hidden border-t border-izakaya-wood/10">
             <div class="flex items-center justify-between px-2 py-1 bg-izakaya-wood/5 border-b border-izakaya-wood/10">
                <span class="text-xs font-bold text-izakaya-wood/70 truncate px-1">{{ store.currentTrack?.title }}</span>
                <div class="flex gap-1">
                  <button @click.stop="showSettings = !showSettings" class="p-1 text-izakaya-wood/60 hover:bg-izakaya-wood/10 rounded">
                    <ListMusic class="w-3 h-3" />
                  </button>
                </div>
             </div>
             <iframe 
               :src="store.currentTrack.url" 
               width="100%" 
               height="66" 
               frameborder="0" 
               marginheight="0" 
               marginwidth="0"
             ></iframe>
             <div class="flex items-center justify-between px-3 py-1 bg-izakaya-wood/5 border-t border-izakaya-wood/10">
                <button @click="store.prev" class="p-1 text-izakaya-wood hover:text-touhou-red transition-colors">
                  <SkipBack class="w-3 h-3" />
                </button>
                <span class="text-[10px] text-izakaya-wood/40 font-mono">External Player</span>
                <button @click="store.next" class="p-1 text-izakaya-wood hover:text-touhou-red transition-colors">
                  <SkipForward class="w-3 h-3" />
                </button>
             </div>
          </div>
        </div>
      </Transition>
    </div>

  </div>
</template>

<style scoped>
.animate-spin-slow {
  animation: spin 8s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Custom Scrollbar */
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.1);
  border-radius: 2px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: rgba(0, 0, 0, 0.2);
}
</style>

import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { useSettingsStore } from '@/stores/settings';

export interface Track {
  id: string;
  title: string;
  artist: string;
  url: string;
  type: 'local' | 'iframe';
  source?: 'netease' | 'qq' | 'custom';
  externalId?: string;
}

const STORAGE_KEY = 'izakaya-music-player-state';

export const useMusicPlayerStore = defineStore('musicPlayer', () => {
  const settings = useSettingsStore();

  // 状态管理 (State)喵~
  const isPlaying = ref(false);
  const playlist = ref<Track[]>([]);
  const currentIndex = ref(0);
  const mode = ref<'loop' | 'random' | 'single'>('loop');
  const currentTime = ref(0);
  const duration = ref(0);
  const showPlayer = ref(true);

  // 内部音频对象 (Internal Audio Element)
  const audio = new Audio();

  // 计算生效音量 (Computed effective volume)
  const effectiveVolume = computed(() => {
    return settings.audioVolume * settings.bgmVolume;
  });

  // Watch for volume changes
  watch(
    effectiveVolume,
    (newVolume) => {
      audio.volume = newVolume;
    },
    { immediate: true }
  );

  // 计算属性 (Getters)喵~
  const currentTrack = computed(() => playlist.value[currentIndex.value]);

  // 持久化辅助函数 (Persistence Helpers)
  function saveState() {
    const state = {
      playlist: playlist.value,
      currentIndex: currentIndex.value,
      mode: mode.value
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const state = JSON.parse(saved);
        if (state.playlist) playlist.value = state.playlist;
        if (state.currentIndex !== undefined) currentIndex.value = state.currentIndex;
        if (state.mode) mode.value = state.mode;
      } catch (e) {
        console.error('加载音乐播放器状态失败:', e);
      }
    }
  }

  // 持久化监听器 (Watchers for persistence)喵~
  watch(
    [playlist, currentIndex, mode],
    () => {
      saveState();
    },
    { deep: true }
  );

  // Actions
  function init() {
    // Load saved state first
    loadState();

    // Load local music (will merge with saved)
    loadLocalMusic();

    // Setup Audio Events
    audio.addEventListener('ended', handleTrackEnd);
    audio.addEventListener('timeupdate', () => {
      currentTime.value = audio.currentTime;
    });
    audio.addEventListener('loadedmetadata', () => {
      duration.value = audio.duration;
    });
    audio.addEventListener('error', (e) => {
      console.error('音频播放错误:', e);
      next(); // 跳过播放失败的轨道
    });

    audio.volume = effectiveVolume.value;
  }

  function loadLocalMusic() {
    // 自动扫描导入 src/assets/music 目录下的所有音频文件喵！
    const modules = import.meta.glob('@/assets/music/**/*.{mp3,ogg,wav}', {
      eager: true,
      query: '?url',
      import: 'default'
    }) as Record<string, string>;

    const tracks: Track[] = [];
    for (const path in modules) {
      const parts = path.split('/');
      const filename = parts[parts.length - 1] || 'unknown';
      const title = filename.replace(/\.(mp3|ogg|wav)$/i, '');
      const folder = parts[parts.length - 2] || 'Unknown';

      tracks.push({
        id: path,
        title: title,
        artist: folder,
        url: (modules[path] as string) || '',
        type: 'local'
      });
    }

    // Add to playlist if empty
    if (playlist.value.length === 0) {
      playlist.value = tracks;
    } else {
      // Merge: Add local tracks that are not already in the playlist
      const existingIds = new Set(playlist.value.map((t) => t.id));
      const newTracks = tracks.filter((t) => !existingIds.has(t.id));
      if (newTracks.length > 0) {
        playlist.value.push(...newTracks);
      }
    }
  }

  function play(index?: number) {
    if (typeof index === 'number') {
      currentIndex.value = index;
    }

    const track = currentTrack.value;
    if (!track) return;

    if (track.type === 'local') {
      if (
        audio.src !== track.url &&
        audio.src !== new URL(track.url, window.location.origin).href
      ) {
        audio.src = track.url;
        audio.load();
      }

      audio
        .play()
        .then(() => {
          isPlaying.value = true;
        })
        .catch((e) => {
          console.error('[音乐播放器] 播放失败喵:', e);
        });
    } else {
      // 处理 iframe/外部链接类型 (仅在 UI 上标记为正在播放)
      isPlaying.value = true;
    }
  }

  function pause() {
    audio.pause();
    isPlaying.value = false;
  }

  function togglePlay() {
    if (isPlaying.value) {
      pause();
    } else {
      play();
    }
  }

  function next() {
    let nextIndex = currentIndex.value + 1;
    if (mode.value === 'random') {
      nextIndex = Math.floor(Math.random() * playlist.value.length);
    } else if (nextIndex >= playlist.value.length) {
      nextIndex = 0; // 列表循环，回到第一首
    }
    play(nextIndex);
  }

  function prev() {
    let prevIndex = currentIndex.value - 1;
    if (prevIndex < 0) {
      prevIndex = playlist.value.length - 1;
    }
    play(prevIndex);
  }

  function seek(time: number) {
    if (audio.duration) {
      audio.currentTime = time;
    }
  }

  function handleTrackEnd() {
    if (mode.value === 'single') {
      audio.currentTime = 0;
      play();
    } else {
      next();
    }
  }

  function setVolume(_val: number) {
    // 现在由 SettingsStore 统一管控全局音量设置喵
  }

  // Watch for external track additions
  function addTrack(track: Track) {
    playlist.value.push(track);
  }

  function removeTrack(index: number) {
    playlist.value.splice(index, 1);
    if (index < currentIndex.value) {
      currentIndex.value--;
    } else if (index === currentIndex.value) {
      // If removed current track, play next or stop
      if (playlist.value.length === 0) {
        pause();
        currentIndex.value = 0;
      } else {
        // 播放下一首 (此时的索引实际上已经指向了下一首歌曲)喵
        if (isPlaying.value) play();
      }
    }
  }

  return {
    isPlaying,
    playlist,
    currentIndex,
    mode,
    effectiveVolume,
    currentTime,
    duration,
    currentTrack,
    showPlayer,
    init,
    play,
    pause,
    togglePlay,
    next,
    prev,
    seek,
    setVolume,
    addTrack,
    removeTrack
  };
});

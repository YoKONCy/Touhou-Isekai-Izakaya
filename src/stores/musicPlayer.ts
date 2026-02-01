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
  
  // State
  const isPlaying = ref(false);
  const playlist = ref<Track[]>([]);
  const currentIndex = ref(0);
  const mode = ref<'loop' | 'random' | 'single'>('loop');
  const currentTime = ref(0);
  const duration = ref(0);
  const showPlayer = ref(true);
  
  // Internal Audio Element
  const audio = new Audio();
  
  // Computed effective volume
  const effectiveVolume = computed(() => {
    return settings.audioVolume * settings.bgmVolume;
  });

  // Watch for volume changes
  watch(effectiveVolume, (newVolume) => {
    audio.volume = newVolume;
  }, { immediate: true });

  // Getters
  const currentTrack = computed(() => playlist.value[currentIndex.value]);

  // Persistence Helpers
  function saveState() {
    const state = {
      playlist: playlist.value,
      currentIndex: currentIndex.value,
      mode: mode.value,
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
        console.error('Failed to load music player state:', e);
      }
    }
  }

  // Watchers for persistence
  watch([playlist, currentIndex, mode], () => {
    saveState();
  }, { deep: true });

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
      console.error('Audio playback error:', e);
      next(); // Skip error track
    });

    audio.volume = effectiveVolume.value;
  }

  function loadLocalMusic() {
    // Glob import all audio files in src/assets/music
    const modules = import.meta.glob('@/assets/music/**/*.{mp3,ogg,wav}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
    
    const tracks: Track[] = [];
    for (const path in modules) {
      const parts = path.split('/');
      const filename = parts[parts.length - 1] || 'unknown';
      const title = filename.replace(/\.(mp3|ogg|wav)$/, '');
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
      const existingIds = new Set(playlist.value.map(t => t.id));
      const newTracks = tracks.filter(t => !existingIds.has(t.id));
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
      if (audio.src !== track.url && audio.src !== new URL(track.url, window.location.origin).href) {
        audio.src = track.url;
        audio.load();
      }
      
      audio.play().then(() => {
        isPlaying.value = true;
      }).catch(e => {
        console.error("Play failed", e);
      });
    } else {
      // Handle iframe/external types (just mark as playing for UI)
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
      nextIndex = 0; // Loop back
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
    // This is now handled by settings store
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
        // play next (which is now at the same index)
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

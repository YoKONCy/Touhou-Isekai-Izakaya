<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useGameStore } from '@/stores/game';
import { audioManager } from '@/services/audio';
import { X, Save, User, Camera, Image as ImageIcon, BookOpen, Sparkles } from 'lucide-vue-next';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'open-summary', turnCount: number): void;
}>();

const gameStore = useGameStore();
const player = computed(() => gameStore.state.player);

// Form State
const formData = ref({
  name: '',
  persona: '',
  storySummary: ''
});

const summaryTurnCount = ref(20);

// Initialize form data when modal opens
watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    formData.value.name = player.value.name;
    
    // Smart Persona Loading
    const rawPersona = player.value.persona;
    try {
      const jsonObj = JSON.parse(rawPersona);
      if (jsonObj["详细人设"]) {
        formData.value.persona = jsonObj["详细人设"];
      } else if (jsonObj["补充设定"]) {
        formData.value.persona = jsonObj["补充设定"];
      } else {
        // Fallback if no known keys
        formData.value.persona = rawPersona; // Or empty?
      }
    } catch (e) {
      // Not JSON, use raw text
      formData.value.persona = rawPersona;
    }

    formData.value.storySummary = player.value.storySummary || '';
  }
});

// Watch for store changes to storySummary (for auto-populate)
watch(() => player.value.storySummary, (newVal) => {
  if (newVal) {
    formData.value.storySummary = newVal;
  }
});

async function handleSave() {
  // Smart Persona Saving
  let finalPersona = formData.value.persona;
  const rawPersona = player.value.persona;
  
  try {
    const jsonObj = JSON.parse(rawPersona);
    // Update existing JSON structure
    if (jsonObj["详细人设"]) {
      jsonObj["详细人设"] = formData.value.persona;
    } else if (jsonObj["补充设定"]) {
      jsonObj["补充设定"] = formData.value.persona;
    } else {
      // If it was JSON but didn't have these keys, maybe add one?
      // Or just treat it as a custom JSON object the user manually made?
      // Let's default to creating "详细人设" if we are in JSON mode but missing keys
      jsonObj["详细人设"] = formData.value.persona;
    }
    finalPersona = JSON.stringify(jsonObj, null, 2);
  } catch (e) {
    // Not JSON, save as plain text
    finalPersona = formData.value.persona;
  }

  // Update GameStore
  gameStore.state.player.name = formData.value.name;
  gameStore.state.player.persona = finalPersona;
  gameStore.state.player.storySummary = formData.value.storySummary;

  // Persist to IndexedDB immediately so it's not lost on refresh
  await gameStore.saveCurrentStateToLastSnapshot();

  audioManager.playLevelUp(); // Success sound
  emit('close');
}

function handleStartSummary() {
  audioManager.playClick();
  emit('open-summary', summaryTurnCount.value);
  // We don't close the modal here because we want to see the summary being populated
}

// Avatar Upload & Crop Logic
const fileInput = ref<HTMLInputElement | null>(null);
const showCropperModal = ref(false);
const rawImage = ref<string | null>(null);
const cropperImage = ref<HTMLImageElement | null>(null);

// Cropper State
const cropperState = ref({
  scale: 1,
  x: 0,
  y: 0,
  dragging: false,
  startX: 0,
  startY: 0
});

function triggerAvatarUpload() {
  fileInput.value?.click();
  audioManager.playSoftClick();
}

function handleAvatarFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    rawImage.value = event.target?.result as string;
    showCropperModal.value = true;
    
    // Reset state
    cropperState.value = {
      scale: 1,
      x: 0,
      y: 0,
      dragging: false,
      startX: 0,
      startY: 0
    };
  };
  reader.readAsDataURL(file);
  
  // Reset input
  if (fileInput.value) fileInput.value.value = '';
}

// Cropper Interaction
function handleMouseDown(e: MouseEvent) {
  cropperState.value.dragging = true;
  cropperState.value.startX = e.clientX - cropperState.value.x;
  cropperState.value.startY = e.clientY - cropperState.value.y;
}

function clampState() {
  if (!cropperImage.value) return;
  const img = cropperImage.value;
  const targetSize = 200; // The size of our circular crop area

  // 1. Ensure scale is not too small (must cover the 200px crop area)
  const minScale = Math.max(targetSize / img.naturalWidth, targetSize / img.naturalHeight);
  if (cropperState.value.scale < minScale) {
    cropperState.value.scale = minScale;
  }

  // 2. Clamp x and y to keep the image covering the 200px crop area
  // The image is centered at (0,0) in our coordinate system initially.
  // Its scaled dimensions are:
  const sw = img.naturalWidth * cropperState.value.scale;
  const sh = img.naturalHeight * cropperState.value.scale;

  // The crop area is from -100 to +100 in our coordinate system.
  // The image boundaries are:
  // left: x - sw/2, right: x + sw/2
  // top: y - sh/2, bottom: y + sh/2
  
  // We need:
  // x - sw/2 <= -100  =>  x <= sw/2 - 100
  // x + sw/2 >= 100   =>  x >= 100 - sw/2
  // y - sh/2 <= -100  =>  y <= sh/2 - 100
  // y + sh/2 >= 100   =>  y >= 100 - sh/2

  const limitX = Math.max(0, sw / 2 - targetSize / 2);
  const limitY = Math.max(0, sh / 2 - targetSize / 2);

  cropperState.value.x = Math.max(-limitX, Math.min(limitX, cropperState.value.x));
  cropperState.value.y = Math.max(-limitY, Math.min(limitY, cropperState.value.y));
}

function handleMouseMove(e: MouseEvent) {
  if (!cropperState.value.dragging) return;
  e.preventDefault();
  cropperState.value.x = e.clientX - cropperState.value.startX;
  cropperState.value.y = e.clientY - cropperState.value.startY;
  clampState();
}

function handleMouseUp() {
  cropperState.value.dragging = false;
  clampState();
}

function handleWheel(e: WheelEvent) {
  e.preventDefault();
  const zoomFactor = 1.1;
  const delta = e.deltaY > 0 ? 1 / zoomFactor : zoomFactor;
  const newScale = cropperState.value.scale * delta;
  
  cropperState.value.scale = Math.max(0.01, Math.min(20, newScale));
  clampState();
}

function onImageLoad(e: Event) {
  const img = e.target as HTMLImageElement;
  if (!img.naturalWidth || !img.naturalHeight) return;

  // The crop circle is 200px
  const targetSize = 200;
  
  // Calculate scale to fit the image reasonably
  // We want the image to initially cover the crop area
  const scaleX = targetSize / img.naturalWidth;
  const scaleY = targetSize / img.naturalHeight;
  
  // Start with a scale that fits the image nicely in the 400px view area
  // but ensures it's at least as big as the 200px crop circle
  const fitScale = Math.max(scaleX, scaleY) * 1.2; // 1.2x margin
  
  cropperState.value.scale = fitScale;
  cropperState.value.x = 0;
  cropperState.value.y = 0;
}

async function handleCropConfirm() {
  if (!cropperImage.value) return;

  // Create an offscreen canvas for the final crop
  const canvas = document.createElement('canvas');
  const size = 256; // Final avatar size
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Fill background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, size, size);

  // Calculate draw parameters
  // The viewer is 300x300 (viewport). The mask is a circle in the center.
  // We want to capture what's inside the circle.
  // Current implementation in StatusCard was a bit simplified.
  // Let's make a robust one here.
  
  // Save reference image (Original)
  const referenceUrl = rawImage.value;
  
  // Generate Avatar (Cropped)
  // Manual calculation is better for performance and correctness.
  const img = cropperImage.value;
  const scale = cropperState.value.scale;
  const x = cropperState.value.x;
  const y = cropperState.value.y;
  
  // The crop window in UI is centered.
  // Image is drawn at (center + x, center + y) with scale.
  
  // To draw on 256x256 canvas:
  // The center of the canvas (128, 128) corresponds to the center of the UI crop window.
  // The image should be drawn relative to that center.
  
  ctx.translate(size/2, size/2);
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.drawImage(img, -img.naturalWidth/2, -img.naturalHeight/2);
  
  const avatarUrl = canvas.toDataURL('image/png');
  
  // Save to store
  if (referenceUrl) {
    gameStore.setPlayerAvatar(avatarUrl, referenceUrl);
  }
  
  showCropperModal.value = false;
  rawImage.value = null;
  audioManager.playLevelUp();
}

</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div class="w-full max-w-2xl bg-[#fdf6e3] dark:bg-stone-900 rounded-xl shadow-2xl border-2 border-izakaya-wood overflow-hidden flex flex-col max-h-[90vh]">
        
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b border-izakaya-wood/20 bg-izakaya-wood/5 dark:bg-stone-800">
          <div class="flex items-center gap-2">
            <User class="w-5 h-5 text-touhou-red" />
            <h2 class="font-bold text-lg text-izakaya-wood dark:text-stone-200 font-display">玩家配置</h2>
          </div>
          <button @click="emit('close')" class="p-1 hover:bg-black/10 rounded-full transition-colors text-izakaya-wood dark:text-stone-400">
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar overscroll-contain" style="-webkit-overflow-scrolling: touch;">
          
          <!-- Avatar Section -->
          <div class="flex flex-col sm:flex-row gap-6 items-start">
            <div class="flex-shrink-0 flex flex-col items-center gap-3">
              <div class="relative group cursor-pointer w-32 h-32 rounded-full ring-4 ring-izakaya-wood/20 overflow-hidden bg-stone-200 dark:bg-stone-800 shadow-inner"
                   @click="triggerAvatarUpload">
                <img v-if="player.avatarUrl" :src="player.avatarUrl" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                <div v-else class="w-full h-full flex items-center justify-center text-izakaya-wood/40">
                  <User class="w-12 h-12" />
                </div>
                
                <!-- Overlay -->
                <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera class="w-8 h-8 text-white drop-shadow-md" />
                </div>
              </div>
              <span class="text-xs font-medium text-izakaya-wood/60 dark:text-stone-500">点击更换头像</span>
              <input type="file" ref="fileInput" class="hidden" accept="image/*" @change="handleAvatarFile" />
            </div>

            <div class="flex-1 space-y-4 w-full">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="space-y-1.5">
                  <label class="text-xs font-bold text-izakaya-wood/60 dark:text-stone-500 uppercase">昵称</label>
                  <input v-model="formData.name" type="text" class="w-full bg-white dark:bg-stone-800 border border-izakaya-wood/20 rounded-lg px-3 py-2 text-sm text-izakaya-wood dark:text-stone-200 focus:ring-2 focus:ring-touhou-red/30 outline-none" placeholder="玩家名称" />
                </div>
                <div class="space-y-1.5">
                  <label class="text-xs font-bold text-izakaya-wood/60 dark:text-stone-500 uppercase">当前身份</label>
                  <div class="w-full bg-izakaya-wood/5 dark:bg-stone-800/50 border border-izakaya-wood/10 rounded-lg px-3 py-2 text-sm text-izakaya-wood/70 dark:text-stone-400 italic">
                    {{ player.identity || '无' }}
                  </div>
                </div>
              </div>
              
              <div class="space-y-1.5">
                <label class="text-xs font-bold text-izakaya-wood/60 dark:text-stone-500 uppercase">外貌与着装</label>
                <div class="w-full bg-izakaya-wood/5 dark:bg-stone-800/50 border border-izakaya-wood/10 rounded-lg px-3 py-2 text-sm text-izakaya-wood/70 dark:text-stone-400 italic">
                  {{ player.clothing || '暂无描述' }}
                </div>
              </div>
            </div>
          </div>

          <!-- Persona Section -->
          <div class="space-y-2">
             <div class="flex items-center justify-between">
                <label class="text-sm font-bold text-izakaya-wood dark:text-stone-300 flex items-center gap-2">
                  <ImageIcon class="w-4 h-4" />
                  详细人设
                </label>
                <span class="text-xs text-izakaya-wood/50 bg-izakaya-wood/5 px-2 py-0.5 rounded">Prompt 注入内容</span>
             </div>
             <p class="text-xs text-izakaya-wood/60 dark:text-stone-500">
               这段描述将直接影响 AI 对您的认知和剧情互动。建议包含性格、背景故事以及特殊能力描述。
             </p>
             <textarea 
               v-model="formData.persona"
               rows="8"
               class="w-full bg-white dark:bg-stone-800 border border-izakaya-wood/20 rounded-lg px-4 py-3 text-sm text-izakaya-wood dark:text-stone-200 focus:ring-2 focus:ring-touhou-red/30 outline-none resize-none custom-scrollbar leading-relaxed"
               placeholder="在此输入您的详细人设..."
             ></textarea>
          </div>

          <!-- Story Summary Section -->
          <div class="space-y-4 pt-4 border-t border-izakaya-wood/10">
             <div class="flex items-center justify-between">
                <div class="space-y-1">
                   <label class="text-sm font-bold text-izakaya-wood dark:text-stone-300 flex items-center gap-2">
                     <BookOpen class="w-4 h-4" />
                     故事大总结
                   </label>
                   <p class="text-xs text-izakaya-wood/60 dark:text-stone-500">
                     总结当前剧情进度，作为长期记忆的一部分。
                   </p>
                </div>
                <div class="flex items-center gap-3">
                   <div class="flex flex-col items-end gap-1">
                      <span class="text-[10px] text-izakaya-wood/40 uppercase font-bold">回顾轮数: {{ summaryTurnCount }}</span>
                      <input type="range" v-model="summaryTurnCount" min="5" max="100" step="5" class="w-24 accent-touhou-red" />
                   </div>
                   <button @click="handleStartSummary" class="flex items-center gap-1.5 px-3 py-1.5 bg-izakaya-wood/10 hover:bg-izakaya-wood/20 text-izakaya-wood dark:text-stone-300 rounded-lg text-xs font-bold transition-all active:scale-95">
                      <Sparkles class="w-3.5 h-3.5 text-touhou-red" />
                      开始总结
                   </button>
                </div>
             </div>
             
             <textarea 
               v-model="formData.storySummary"
               rows="6"
               class="w-full bg-white dark:bg-stone-800 border border-izakaya-wood/20 rounded-lg px-4 py-3 text-sm text-izakaya-wood dark:text-stone-200 focus:ring-2 focus:ring-touhou-red/30 outline-none resize-none custom-scrollbar leading-relaxed"
               placeholder="点击上方按钮生成总结，或手动输入..."
             ></textarea>
          </div>

        </div>

        <!-- Footer -->
        <div class="p-4 border-t border-izakaya-wood/10 bg-white/50 dark:bg-stone-800/50 flex justify-end gap-3">
          <button @click="emit('close')" class="px-4 py-2 text-sm font-medium text-izakaya-wood/70 hover:bg-black/5 rounded-lg transition-colors">
            取消
          </button>
          <button @click="handleSave" class="px-6 py-2 bg-touhou-red text-white text-sm font-medium rounded-lg hover:bg-red-700 shadow-lg shadow-red-500/20 flex items-center gap-2 transition-all active:scale-95">
            <Save class="w-4 h-4" />
            保存配置
          </button>
        </div>

      </div>
    </div>

    <!-- Cropper Modal (Nested) -->
    <div v-if="showCropperModal" class="fixed inset-0 z-[110] bg-black/90 flex flex-col items-center justify-center p-4">
      <div class="w-full max-w-lg bg-stone-900 rounded-xl overflow-hidden flex flex-col shadow-2xl">
        <div class="p-4 flex justify-between items-center border-b border-white/10">
          <h3 class="text-white font-medium">裁剪头像</h3>
          <button @click="showCropperModal = false" class="text-white/50 hover:text-white"><X class="w-5 h-5"/></button>
        </div>
        
        <div class="relative h-[400px] w-full bg-[#1a1a1a] overflow-hidden cursor-move select-none"
             @mousedown="handleMouseDown"
             @mousemove="handleMouseMove"
             @mouseup="handleMouseUp"
             @mouseleave="handleMouseUp"
             @wheel="handleWheel">
             
          <!-- Image Layer -->
          <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
             <img ref="cropperImage" :src="rawImage || ''" 
                  class="max-w-none transition-none"
                  :style="{ 
                    transform: `translate(${cropperState.x}px, ${cropperState.y}px) scale(${cropperState.scale})` 
                  }"
                  draggable="false"
                  @load="onImageLoad"
             />
          </div>

          <!-- Overlay Mask -->
          <div class="absolute inset-0 pointer-events-none">
             <!-- Dark overlay outside the circle -->
             <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
               <defs>
                 <mask id="hole">
                   <rect width="100%" height="100%" fill="white"/>
                   <!-- Center Circle Hole -->
                   <!-- We need to calculate circle position relative to SVG. 
                        Let's use a simpler CSS approach for the visual mask. 
                   -->
                 </mask>
               </defs>
             </svg>
             <div class="absolute inset-0 bg-black/50 flex items-center justify-center">
                <div class="w-[200px] h-[200px] rounded-full border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"></div>
             </div>
          </div>
          
          <!-- Instructions -->
          <div class="absolute bottom-4 left-0 right-0 text-center text-white/50 text-xs pointer-events-none">
            拖动移动 / 滚轮缩放
          </div>
        </div>
        
        <div class="p-4 flex justify-end gap-3 bg-stone-800">
           <button @click="showCropperModal = false" class="px-4 py-2 text-white/70 hover:text-white text-sm">取消</button>
           <button @click="handleCropConfirm" class="px-6 py-2 bg-touhou-red text-white rounded-lg text-sm hover:bg-red-600">确认裁剪</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(139, 69, 19, 0.2);
  border-radius: 3px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(139, 69, 19, 0.4);
}
.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
}
</style>

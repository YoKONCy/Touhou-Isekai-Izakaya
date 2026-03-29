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

// 表单响应式状态 (Form Reactive State)
const formData = ref({
  name: '',
  persona: '',
  storySummary: ''
});

const summaryTurnCount = ref(20);

// 弹窗打开时初始化表单数据 (Lifecycle Initialization)
watch(
  () => props.isOpen,
  (newVal) => {
    if (newVal) {
      formData.value.name = player.value.name;

      // 智能人设解析加载逻辑 (Smart Persona Loading)
      const rawPersona = player.value.persona;
      try {
        const jsonObj = JSON.parse(rawPersona);
        if (jsonObj['详细人设']) {
          formData.value.persona = jsonObj['详细人设'];
        } else if (jsonObj['补充设定']) {
          formData.value.persona = jsonObj['补充设定'];
        } else {
          // 键值未匹配下的兜底加载策略
          formData.value.persona = rawPersona;
        }
      } catch (e) {
      // 非 JSON 原始文本处理
        formData.value.persona = rawPersona;
      }

      formData.value.storySummary = player.value.storySummary || '';
    }
  }
);

// 监听 Store 中故事总结的变化（用于自动填充 AI 生成的摘要数据）
watch(
  () => player.value.storySummary,
  (newVal) => {
    if (newVal) {
      formData.value.storySummary = newVal;
    }
  }
);

async function handleSave() {
  // 智能人设保存策略 (Smart Persona Persistence)
  let finalPersona = formData.value.persona;
  const rawPersona = player.value.persona;

  try {
    const jsonObj = JSON.parse(rawPersona);
    // 更新已有的 JSON 结构字段 (Structural Integrity Update)
    if (jsonObj['详细人设']) {
      jsonObj['详细人设'] = formData.value.persona;
    } else if (jsonObj['补充设定']) {
      jsonObj['补充设定'] = formData.value.persona;
    } else {
      // 若是有效 JSON 但缺少预设键，则默认补齐“详细人设”字段以便后续识别
      jsonObj['详细人设'] = formData.value.persona;
    }
    finalPersona = JSON.stringify(jsonObj, null, 2);
  } catch (e) {
    // 识别为非 JSON 格式，按纯文本形式执行覆盖保存
    finalPersona = formData.value.persona;
  }

  // 同步至状态机并立即执行数据库持久化，以防刷新后数据丢失 (Persistence Guard)
  gameStore.state.player.name = formData.value.name;
  gameStore.state.player.persona = finalPersona;
  gameStore.state.player.storySummary = formData.value.storySummary;

  await gameStore.saveCurrentStateToLastSnapshot();

  audioManager.playLevelUp(); // 播放保存成功提示音 (Feedback Sound)
  emit('close');
}

function handleStartSummary() {
  audioManager.playClick();
  emit('open-summary', summaryTurnCount.value);
  // 此处不立即关闭弹窗，以便用户实时核对 AI 自动填充的摘要内容 (Experience Polish)
}

// 头像上传与裁剪核心逻辑 (Avatar Assets Flow)
const fileInput = ref<HTMLInputElement | null>(null);
const showCropperModal = ref(false);
const rawImage = ref<string | null>(null);
const cropperImage = ref<HTMLImageElement | null>(null);

// 裁剪器内部状态位寄存 (Cropper Coordinate State)
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

  // 在渲染到预览器前执行位图物理压缩，防范超大文件导致 Worker OOM 崩溃 (Pre-compression)
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      // 尺寸缩放逻辑：设定最大长边阈值为 1024px
      const MAX_SIZE = 1024;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        }
      } else {
        if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        // 策略选择：大体积位图统一转存为 JPEG 0.85 以削减高达 90% 的内存/存储占用 (Storage Optimization)
        // 注意：这会牺牲源图的透明通道，但对于玩家头像（通常为照片或完整艺术图）通常利大于弊。
        let mimeType = file.type;
        if (mimeType === 'image/svg+xml') mimeType = 'image/png'; // Convert SVG to raster

        // 存储性能平衡：若源图体积或格式可能导致 OOM，则统一执行 JPEG 0.85 强力压缩以获得最佳加载性能。
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);

        rawImage.value = compressedDataUrl;
        showCropperModal.value = true;

        // 重置裁剪状态缓存 (State Reset)
        cropperState.value = {
          scale: 1,
          x: 0,
          y: 0,
          dragging: false,
          startX: 0,
          startY: 0
        };
      }
    };
    img.src = event.target?.result as string;
  };
  reader.readAsDataURL(file);

  // 任务完成后重置 input 状态以支持重复上传同名文件 喵
  if (fileInput.value) fileInput.value.value = '';
}

// 裁剪器交互事件处理器 (Input Event Listeners)
function handleMouseDown(e: MouseEvent) {
  cropperState.value.dragging = true;
  cropperState.value.startX = e.clientX - cropperState.value.x;
  cropperState.value.startY = e.clientY - cropperState.value.y;
}

function clampState() {
  if (!cropperImage.value) return;
  const img = cropperImage.value;
  const targetSize = 200; // 设定目标圆形裁剪区域的直径像素值 喵

  // 1. 安全比例校验：确保图像始终能覆盖 200px 裁剪圆形区，不露出背景白边。
  const minScale = Math.max(targetSize / img.naturalWidth, targetSize / img.naturalHeight);
  if (cropperState.value.scale < minScale) {
    cropperState.value.scale = minScale;
  }

  // 2. 坐标钳向 (Clamping)：强制重置 X/Y 偏移以确保图像纹理填满裁剪区域
  // 核心逻辑：计算缩放后的实际物理边界偏移量
  const sw = img.naturalWidth * cropperState.value.scale;
  const sh = img.naturalHeight * cropperState.value.scale;

  // 物理映射判定：目标裁剪圆横跨 [-100, 100] 区间
  // 须满足：左边界 <= -100 且 右边界 >= 100 以此类推。

  // 边界约束逻辑：
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

  // 裁剪圆直径常量 (Crop Diameter)
  const targetSize = 200;

  // 初始适配策略：计算出一组能将图像恰好覆盖 200px 核心圆的“最优缩放比”
  const scaleX = targetSize / img.naturalWidth;
  const scaleY = targetSize / img.naturalHeight;

  // 以 1.2 倍安全余量作为起步渲染比例，确保视觉过渡顺滑
  const fitScale = Math.max(scaleX, scaleY) * 1.2;

  cropperState.value.scale = fitScale;
  cropperState.value.x = 0;
  cropperState.value.y = 0;
}

async function handleCropConfirm() {
  if (!cropperImage.value) return;

  // 创建离屏像素空间执行最终采样 (Offscreen Snapshot)
  const canvas = document.createElement('canvas');
  const size = 256; // 最终产出的头像尺寸 (Target Storage Size)
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // 渲染底色填充 (防穿透背景渲染)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, size, size);

  // 获取渲染变换矩阵参数 (Transformation Matrix Params)
  // 核心目标：精准捕获预览圆内的像素负载部分，相较于 CSS 方案，离屏手动渲染能提供更高质量的抗锯齿与像素纠偏。
  const img = cropperImage.value;
  const scale = cropperState.value.scale;
  const x = cropperState.value.x;
  const y = cropperState.value.y;

  // 物理映射逻辑：Canvas 中心点 (128, 128) 对应 UI 视窗绝对中心。
  // 执行基于交互偏移量 (x, y) 与缩放比 (scale) 的平移变换。

  // 矩阵变换与原点平移 (Inverse Matrix Map)

  ctx.translate(size / 2, size / 2);
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

  const avatarUrl = canvas.toDataURL('image/png');
  
  // 同步至全局状态机并重置临时显存 (State Commit)
  if (rawImage.value) {
    gameStore.setPlayerAvatar(avatarUrl, rawImage.value);
  } else {
    gameStore.setPlayerAvatar(avatarUrl);
  }

  showCropperModal.value = false;
  rawImage.value = null;
  audioManager.playLevelUp();
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div
        class="w-full max-w-2xl bg-[#fdf6e3] dark:bg-stone-900 rounded-xl shadow-2xl border-2 border-izakaya-wood overflow-hidden flex flex-col max-h-[90vh]"
      >
        <!-- 弹窗页眉标题栏 喵 (Modal Header) -->
        <div
          class="flex items-center justify-between p-4 border-b border-izakaya-wood/20 bg-izakaya-wood/5 dark:bg-stone-800"
        >
          <div class="flex items-center gap-2">
            <User class="w-5 h-5 text-touhou-red" />
            <h2 class="font-bold text-lg text-izakaya-wood dark:text-stone-200 font-display">
              玩家配置
            </h2>
          </div>
          <button
            @click="emit('close')"
            class="p-1 hover:bg-black/10 rounded-full transition-colors text-izakaya-wood dark:text-stone-400"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- 核心配置交互内容区 喵 (Config Content) -->
        <div
          class="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar overscroll-contain"
          style="-webkit-overflow-scrolling: touch"
        >
          <!-- 头像上传控制与基础个人资料项 喵 (Avatar & Bio) -->
          <div class="flex flex-col sm:flex-row gap-6 items-start">
            <div class="flex-shrink-0 flex flex-col items-center gap-3">
              <div
                class="relative group cursor-pointer w-32 h-32 rounded-full ring-4 ring-izakaya-wood/20 overflow-hidden bg-stone-200 dark:bg-stone-800 shadow-inner"
                @click="triggerAvatarUpload"
              >
                <img
                  v-if="player.avatarUrl"
                  :src="player.avatarUrl"
                  class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div
                  v-else
                  class="w-full h-full flex items-center justify-center text-izakaya-wood/40"
                >
                  <User class="w-12 h-12" />
                </div>

                <!-- 悬浮交互遮罩 (Layer Overlay) -->
                <div
                  class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Camera class="w-8 h-8 text-white drop-shadow-md" />
                </div>
              </div>
              <span class="text-xs font-medium text-izakaya-wood/60 dark:text-stone-500"
                >点击更换头像</span
              >
              <input
                type="file"
                ref="fileInput"
                class="hidden"
                accept="image/*"
                @change="handleAvatarFile"
              />
            </div>

            <div class="flex-1 space-y-4 w-full">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="space-y-1.5">
                  <label
                    class="text-xs font-bold text-izakaya-wood/60 dark:text-stone-500 uppercase"
                    >昵称</label
                  >
                  <input
                    v-model="formData.name"
                    type="text"
                    class="w-full bg-white dark:bg-stone-800 border border-izakaya-wood/20 rounded-lg px-3 py-2 text-sm text-izakaya-wood dark:text-stone-200 focus:ring-2 focus:ring-touhou-red/30 outline-none"
                    placeholder="玩家名称"
                  />
                </div>
                <div class="space-y-1.5">
                  <label
                    class="text-xs font-bold text-izakaya-wood/60 dark:text-stone-500 uppercase"
                    >当前身份</label
                  >
                  <div
                    class="w-full bg-izakaya-wood/5 dark:bg-stone-800/50 border border-izakaya-wood/10 rounded-lg px-3 py-2 text-sm text-izakaya-wood/70 dark:text-stone-400 italic"
                  >
                    {{ player.identity || '无' }}
                  </div>
                </div>
              </div>

              <div class="space-y-1.5">
                <label class="text-xs font-bold text-izakaya-wood/60 dark:text-stone-500 uppercase"
                  >外貌与着装</label
                >
                <div
                  class="w-full bg-izakaya-wood/5 dark:bg-stone-800/50 border border-izakaya-wood/10 rounded-lg px-3 py-2 text-sm text-izakaya-wood/70 dark:text-stone-400 italic"
                >
                  {{ player.clothing || '暂无描述' }}
                </div>
              </div>
            </div>
          </div>

          <!-- 核心人设设定展示区 喵 (System Meta) -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label
                class="text-sm font-bold text-izakaya-wood dark:text-stone-300 flex items-center gap-2"
              >
                <ImageIcon class="w-4 h-4" />
                详细人设
              </label>
              <span class="text-xs text-izakaya-wood/50 bg-izakaya-wood/5 px-2 py-0.5 rounded"
                >Prompt 指令注入点喵</span
              >
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

          <!-- 故事阶段总结同步模块 喵 (Long-term Story Summary) -->
          <div class="space-y-4 pt-4 border-t border-izakaya-wood/10">
            <div class="flex items-center justify-between">
              <div class="space-y-1">
                <label
                  class="text-sm font-bold text-izakaya-wood dark:text-stone-300 flex items-center gap-2"
                >
                  <BookOpen class="w-4 h-4" />
                  故事大总结
                </label>
                <p class="text-xs text-izakaya-wood/60 dark:text-stone-500">
                  总结当前剧情进度，作为长期记忆的一部分。
                </p>
              </div>
              <div class="flex items-center gap-3">
                <div class="flex flex-col items-end gap-1">
                  <span class="text-[10px] text-izakaya-wood/40 uppercase font-bold"
                    >记忆回顾轮数喵: {{ summaryTurnCount }}</span
                  >
                  <input
                    type="range"
                    v-model="summaryTurnCount"
                    min="5"
                    max="100"
                    step="5"
                    class="w-24 accent-touhou-red"
                  />
                </div>
                <button
                  @click="handleStartSummary"
                  class="flex items-center gap-1.5 px-3 py-1.5 bg-izakaya-wood/10 hover:bg-izakaya-wood/20 text-izakaya-wood dark:text-stone-300 rounded-lg text-xs font-bold transition-all active:scale-95"
                >
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

        <!-- 全局操作导航底栏 喵 (Action Footer) -->
        <div
          class="p-4 border-t border-izakaya-wood/10 bg-white/50 dark:bg-stone-800/50 flex justify-end gap-3"
        >
          <button
            @click="emit('close')"
            class="px-4 py-2 text-sm font-medium text-izakaya-wood/70 hover:bg-black/5 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            @click="handleSave"
            class="px-6 py-2 bg-touhou-red text-white text-sm font-medium rounded-lg hover:bg-red-700 shadow-lg shadow-red-500/20 flex items-center gap-2 transition-all active:scale-95"
          >
            <Save class="w-4 h-4" />
            保存配置
          </button>
        </div>
      </div>
    </div>

    <!-- 头像二次裁剪组件 (Layered Cropper) -->
    <div
      v-if="showCropperModal"
      class="fixed inset-0 z-[110] bg-black/90 flex flex-col items-center justify-center p-4"
    >
      <div class="w-full max-w-lg bg-stone-900 rounded-xl overflow-hidden flex flex-col shadow-2xl">
        <div class="p-4 flex justify-between items-center border-b border-white/10">
          <h3 class="text-white font-medium">裁剪头像</h3>
          <button @click="showCropperModal = false" class="text-white/50 hover:text-white">
            <X class="w-5 h-5" />
          </button>
        </div>

        <div
          class="relative h-[400px] w-full bg-[#1a1a1a] overflow-hidden cursor-move select-none"
          @mousedown="handleMouseDown"
          @mousemove="handleMouseMove"
          @mouseup="handleMouseUp"
          @mouseleave="handleMouseUp"
          @wheel="handleWheel"
        >
          <!-- 位图渲染层 (Image Render Pipe) -->
          <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
            <img
              ref="cropperImage"
              :src="rawImage || ''"
              class="max-w-none transition-none"
              :style="{
                transform: `translate(${cropperState.x}px, ${cropperState.y}px) scale(${cropperState.scale})`
              }"
              draggable="false"
              @load="onImageLoad"
            />
          </div>

          <!-- 定位遮罩掩模 (Optical Mask Layer) -->
          <div class="absolute inset-0 pointer-events-none">
            <!-- 圆外半透明区域蒙板设计 -->
            <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <mask id="hole">
                  <rect width="100%" height="100%" fill="white" />
                  <!-- Center Circle Hole -->
                  <!-- We need to calculate circle position relative to SVG. 
                        Let's use a simpler CSS approach for the visual mask. 
                   -->
                </mask>
              </defs>
            </svg>
            <div class="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div
                class="w-[200px] h-[200px] rounded-full border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
              ></div>
            </div>
          </div>

          <!-- 操作指引说明 (Guidance Overlay) -->
          <div
            class="absolute bottom-4 left-0 right-0 text-center text-white/50 text-xs pointer-events-none"
          >
            拖动移动 / 滚轮缩放
          </div>
        </div>

        <div class="p-4 flex justify-end gap-3 bg-stone-800">
          <button
            @click="showCropperModal = false"
            class="px-4 py-2 text-white/70 hover:text-white text-sm"
          >
            取消
          </button>
          <button
            @click="handleCropConfirm"
            class="px-6 py-2 bg-touhou-red text-white rounded-lg text-sm hover:bg-red-600"
          >
            确认裁剪
          </button>
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

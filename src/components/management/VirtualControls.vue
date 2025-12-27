<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';

const emit = defineEmits<{
  (e: 'move', direction: { x: number; y: number }): void;
  (e: 'action'): void;
}>();

// Joystick state
const joystickContainer = ref<HTMLDivElement | null>(null);
const isDragging = ref(false);
const joystickX = ref(0);
const joystickY = ref(0);
const touchId = ref<number | null>(null);

// Configuration
const maxDistance = 50;
const deadZone = 10;

// Compute the clamped position
const joystickStyle = computed(() => ({
  transform: `translate(${joystickX.value}px, ${joystickY.value}px)`,
  transition: isDragging.value ? 'none' : 'transform 0.2s ease-out'
}));

function handleTouchStart(e: TouchEvent) {
  if (touchId.value !== null) return;
  const touch = e.changedTouches[0];
  if (!touch || !joystickContainer.value) return;

  touchId.value = touch.identifier;
  isDragging.value = true;

  updatePosition(touch);
  e.preventDefault();
}

function handleTouchMove(e: TouchEvent) {
  if (touchId.value === null) return;

  const touch = Array.from(e.changedTouches).find(t => t.identifier === touchId.value);
  if (!touch) return;

  updatePosition(touch);
  e.preventDefault();
}

function handleTouchEnd(e: TouchEvent) {
  const touch = Array.from(e.changedTouches).find(t => t.identifier === touchId.value);
  if (!touch) return;

  touchId.value = null;
  isDragging.value = false;
  joystickX.value = 0;
  joystickY.value = 0;
  emit('move', { x: 0, y: 0 });
}

function updatePosition(touch: Touch) {
  if (!joystickContainer.value) return;

  const rect = joystickContainer.value.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  let dx = touch.clientX - centerX;
  let dy = touch.clientY - centerY;

  // Calculate distance from center
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Clamp to max distance
  if (distance > maxDistance) {
    dx = (dx / distance) * maxDistance;
    dy = (dy / distance) * maxDistance;
  }

  joystickX.value = dx;
  joystickY.value = dy;

  // Emit direction (normalized -1 to 1)
  if (distance > deadZone) {
    emit('move', {
      x: dx / maxDistance,
      y: dy / maxDistance
    });
  } else {
    emit('move', { x: 0, y: 0 });
  }
}

// Prevent scrolling when touching joystick
onMounted(() => {
  document.addEventListener('touchmove', preventScroll, { passive: false });
});

onUnmounted(() => {
  document.removeEventListener('touchmove', preventScroll);
});

function preventScroll(e: TouchEvent) {
  if (isDragging.value) {
    e.preventDefault();
  }
}
</script>

<template>
  <div class="virtual-controls md:hidden">
    <!-- Virtual Joystick -->
    <div
      ref="joystickContainer"
      class="joystick-container"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
      @touchcancel="handleTouchEnd"
    >
      <div class="joystick-base">
        <div class="joystick-stick" :style="joystickStyle">
          <div class="joystick-inner"></div>
        </div>
      </div>
      <div class="joystick-arrows">
        <div class="arrow up">▲</div>
        <div class="arrow right">▶</div>
        <div class="arrow down">▼</div>
        <div class="arrow left">◀</div>
      </div>
    </div>

    <!-- Action Button -->
    <button
      class="action-button"
      @touchstart.prevent="emit('action')"
    >
      <span class="action-icon">✋</span>
      <span class="action-label">互动</span>
    </button>
  </div>
</template>

<style scoped>
.virtual-controls {
  position: absolute;
  bottom: 80px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  padding: 0 20px;
  pointer-events: none;
  z-index: 100;
}

.joystick-container {
  pointer-events: auto;
  position: relative;
  width: 140px;
  height: 140px;
  touch-action: none;
}

.joystick-base {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 100px;
  height: 100px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.3);
  display: flex;
  justify-content: center;
  align-items: center;
}

.joystick-stick {
  width: 50px;
  height: 50px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
}

.joystick-inner {
  width: 20px;
  height: 20px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 50%;
}

.joystick-arrows {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}

.arrow {
  position: absolute;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.4);
}

.arrow.up { top: 0; left: 50%; transform: translateX(-50%); }
.arrow.right { right: 0; top: 50%; transform: translateY(-50%); }
.arrow.down { bottom: 0; left: 50%; transform: translateX(-50%); }
.arrow.left { left: 0; top: 50%; transform: translateY(-50%); }

.action-button {
  pointer-events: auto;
  width: 80px;
  height: 80px;
  background: linear-gradient(135deg, #4CAF50, #43A047);
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.5);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  box-shadow: 0 4px 15px rgba(76, 175, 80, 0.4);
  touch-action: none;
  transition: transform 0.1s;
}

.action-button:active {
  transform: scale(0.95);
}

.action-icon {
  font-size: 24px;
}

.action-label {
  font-size: 11px;
  font-weight: bold;
  color: white;
  margin-top: 2px;
}
</style>

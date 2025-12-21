<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

const canvas = ref<HTMLCanvasElement | null>(null);
let animationId: number;

interface Petal {
  x: number;
  y: number;
  z: number; // 用于视差
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
  opacity: number;
}

const petals: Petal[] = [];
const PARTICLE_COUNT = 40; // 樱花数量

function initPetals(width: number, height: number) {
  petals.length = 0;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    petals.push(createPetal(width, height, true));
  }
}

function createPetal(width: number, height: number, randomY = false): Petal {
  return {
    x: Math.random() * width,
    y: randomY ? Math.random() * height : -20,
    z: Math.random() * 0.5 + 0.5, // 0.5 - 1.0
    vx: (Math.random() - 0.5) * 1.5, // 左右漂移
    vy: Math.random() * 1.5 + 0.8, // 下落速度
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 2,
    size: Math.random() * 8 + 6,
    opacity: Math.random() * 0.4 + 0.3,
  };
}

function drawPetal(ctx: CanvasRenderingContext2D, p: Petal) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate((p.rotation * Math.PI) / 180);
  ctx.globalAlpha = p.opacity;
  
  // 绘制樱花瓣形状
  ctx.beginPath();
  ctx.moveTo(0, 0);
  // 使用贝塞尔曲线绘制花瓣
  ctx.bezierCurveTo(p.size / 2, -p.size / 2, p.size, 0, 0, p.size);
  ctx.bezierCurveTo(-p.size, 0, -p.size / 2, -p.size / 2, 0, 0);
  
  // 樱花粉色渐变
  const gradient = ctx.createLinearGradient(-p.size, -p.size, 0, p.size);
  gradient.addColorStop(0, '#FFCDD2'); // touhou-red-light
  gradient.addColorStop(1, '#E1BEE7'); // 淡紫色
  
  ctx.fillStyle = gradient;
  ctx.fill();
  
  ctx.restore();
}

function animate() {
  if (!canvas.value) return;
  const ctx = canvas.value.getContext('2d');
  if (!ctx) return;
  
  const width = canvas.value.width;
  const height = canvas.value.height;
  
  ctx.clearRect(0, 0, width, height);
  
  // Update and draw petals
  petals.forEach((p, index) => {
    p.x += p.vx * p.z;
    p.y += p.vy * p.z;
    p.rotation += p.rotationSpeed;
    
    // 简单的风力扰动
    p.vx += (Math.random() - 0.5) * 0.05;
    // 限制最大水平速度
    if (p.vx > 2) p.vx = 2;
    if (p.vx < -2) p.vx = -2;

    drawPetal(ctx, p);
    
    // Reset if out of bounds
    if (p.y > height + 20 || p.x > width + 20 || p.x < -20) {
      petals[index] = createPetal(width, height);
    }
  });
  
  animationId = requestAnimationFrame(animate);
}

function handleResize() {
  if (canvas.value) {
    canvas.value.width = window.innerWidth;
    canvas.value.height = window.innerHeight;
    // 不重置现有花瓣，只在超出范围时自然消失
  }
}

// 鼠标视差交互
function handleMouseMove(e: MouseEvent) {
  const mouseX = e.clientX;
  const centerX = window.innerWidth / 2;
  // 简单的风力影响
  const wind = (mouseX - centerX) / centerX * 0.05;
  petals.forEach(p => {
    p.vx += wind * 0.01;
  });
}

onMounted(() => {
  if (canvas.value) {
    canvas.value.width = window.innerWidth;
    canvas.value.height = window.innerHeight;
    initPetals(window.innerWidth, window.innerHeight);
    animate();
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
  }
});

onUnmounted(() => {
  cancelAnimationFrame(animationId);
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('mousemove', handleMouseMove);
});
</script>

<template>
  <canvas 
    ref="canvas" 
    class="fixed inset-0 pointer-events-none z-0 opacity-60"
    style="mix-blend-mode: multiply;"
  ></canvas>
</template>

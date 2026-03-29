<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

const canvas = ref<HTMLCanvasElement | null>(null);
let animationId: number;

interface Petal {
  x: number;
  y: number;
  z: number; // 用于计算视差深度 喵
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number; // 随机旋转角速度 喵
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
    z: Math.random() * 0.5 + 0.5, // 定义 0.5 - 1.0 的深度层级 喵
    vx: (Math.random() - 0.5) * 1.5, // 初始左右漂移分量 喵
    vy: Math.random() * 1.5 + 0.8, // 恒定纵向下落速度 喵
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 2,
    size: Math.random() * 8 + 6,
    opacity: Math.random() * 0.4 + 0.3
  };
}

function drawPetal(ctx: CanvasRenderingContext2D, p: Petal) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate((p.rotation * Math.PI) / 180);
  ctx.globalAlpha = p.opacity;

  // 逐帧绘制樱花瓣的数学物理形状 喵
  ctx.beginPath();
  ctx.moveTo(0, 0);
  // 执行双向贝塞尔曲线指令以勾勒圆润的花瓣边缘 喵
  ctx.bezierCurveTo(p.size / 2, -p.size / 2, p.size, 0, 0, p.size);
  ctx.bezierCurveTo(-p.size, 0, -p.size / 2, -p.size / 2, 0, 0);

  // 初始化樱花专属的透亮粉紫色线性渐变 喵
  const gradient = ctx.createLinearGradient(-p.size, -p.size, 0, p.size);
  gradient.addColorStop(0, '#FFCDD2'); // 东方红 Light 系列色阶 喵
  gradient.addColorStop(1, '#E1BEE7'); // 柔和淡紫色高光 喵

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

  // 更新并绘制每一片花瓣喵
  petals.forEach((p, index) => {
    p.x += p.vx * p.z;
    p.y += p.vy * p.z;
    p.rotation += p.rotationSpeed;

    // 添加模拟自然风压的随机横向扰动因子 喵
    p.vx += (Math.random() - 0.5) * 0.05;
    // 为防风速失控，强制限制最大水平飘移位移量 喵
    if (p.vx > 2) p.vx = 2;
    if (p.vx < -2) p.vx = -2;

    drawPetal(ctx, p);

    // 如果花瓣超出边界，则重置它喵
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
  const wind = ((mouseX - centerX) / centerX) * 0.05;
  petals.forEach((p) => {
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
    style="mix-blend-mode: multiply"
  ></canvas>
</template>

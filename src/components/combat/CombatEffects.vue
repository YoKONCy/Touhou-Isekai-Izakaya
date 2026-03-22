<template>
  <!-- Effect Overlay Layer -->
  <div class="absolute inset-0 z-[60] pointer-events-none">
    <!-- 1. Point-based Effects (Slash / Enemy Hit / Talk / Hit / Single Spell) -->
    <div
      v-if="
        activeEffect.show &&
        !['spell_aoe', 'ultimate_impact', 'hit_aoe'].includes(activeEffect.type)
      "
      class="absolute z-[60] pointer-events-none flex items-center justify-center"
      :style="{ left: activeEffect.x + 'px', top: activeEffect.y + 'px' }"
    >
      <!-- Single Spell Effect (Focused Beam) -->
      <div
        v-if="activeEffect.type === 'spell_single'"
        class="relative flex items-center justify-center"
      >
        <div
          class="absolute w-[100px] h-[400px] bg-cyan-400 blur-md animate-slash mix-blend-screen origin-bottom"
        ></div>
        <div
          class="absolute w-[200px] h-[200px] border-4 border-cyan-200 rounded-full animate-ping-fast"
        ></div>
        <div
          class="absolute w-[150px] h-[150px] bg-white opacity-50 blur-lg animate-flash-fade"
        ></div>
      </div>

      <!-- Slash Effect (Combo) -->
      <div v-if="activeEffect.type === 'slash'" class="relative w-[300px] h-[300px]">
        <div
          class="absolute inset-0 bg-white clip-shard-diag-1 animate-slash-combo-1 mix-blend-overlay"
        ></div>
        <div
          class="absolute inset-0 bg-blue-100 clip-shard-diag-2 animate-slash-combo-2 mix-blend-screen"
        ></div>
        <div
          class="absolute inset-0 bg-white clip-rect-left animate-slash-combo-3 mix-blend-overlay"
        ></div>
      </div>

      <!-- Enemy Hit Effect (Spark) - P5 Style -->
      <div
        v-if="activeEffect.type === 'enemy' || activeEffect.type === 'hit'"
        class="w-[300px] h-[300px] flex items-center justify-center"
      >
        <!-- 1. Background Black/Red Flash -->
        <div
          class="absolute w-[120%] h-[120%] bg-black clip-starburst animate-flash-fade opacity-80"
        ></div>
        <!-- 2. Core Yellow Spark -->
        <div
          class="absolute w-full h-full bg-yellow-300 clip-starburst animate-hit-spark mix-blend-screen drop-shadow-[0_0_10px_rgba(255,255,0,0.8)]"
        ></div>
        <!-- 3. Red Inner jagged -->
        <div
          class="absolute w-[80%] h-[80%] bg-red-600 clip-jagged-slash-2 animate-hit-spark mix-blend-multiply delay-75"
        ></div>
        <!-- 4. Expanding Ring (Jagged) -->
        <div
          class="absolute w-[150%] h-[150%] border-[10px] border-white clip-starburst animate-ping-slow opacity-80"
        ></div>
      </div>

      <!-- Talk Effect (Word Projectile) -->
      <div
        v-if="activeEffect.type === 'talk'"
        class="relative flex items-center justify-center w-[800px] pointer-events-none"
      >
        <div
          class="text-7xl md:text-9xl font-black italic text-white drop-shadow-[0_0_20px_rgba(255,0,0,0.8)] animate-word-projectile whitespace-nowrap transform -rotate-12 border-y-4 border-white/50 py-2 bg-black/30 backdrop-blur-sm"
        >
          {{ activeEffect.extra || '异议！' }}
        </div>
      </div>
    </div>

    <!-- 2. Fullscreen Spell Effect (Magic Circle) -->
    <div
      v-if="activeEffect.show && activeEffect.type === 'spell_aoe'"
      class="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none overflow-hidden"
    >
      <!-- Background Dim & Flash -->
      <div class="absolute inset-0 bg-black/40 animate-fade-in-fast backdrop-blur-[2px]"></div>

      <!-- Magic Circle Container -->
      <div
        class="relative w-[min(90vw,90vh)] h-[min(90vw,90vh)] flex items-center justify-center animate-scale-in-elastic"
      >
        <!-- Layer 0: Rotating Background Rays -->
        <div class="absolute inset-[-50%] animate-spin-slow opacity-30">
          <div
            class="w-full h-full bg-[conic-gradient(from_0deg,transparent_0deg,purple_20deg,transparent_40deg,purple_60deg,transparent_80deg,purple_100deg,transparent_120deg,purple_140deg,transparent_160deg,purple_180deg,transparent_200deg,purple_220deg,transparent_240deg,purple_260deg,transparent_280deg,purple_300deg,transparent_320deg,purple_340deg,transparent_360deg)] opacity-20 mix-blend-screen"
          ></div>
        </div>

        <!-- Shockwave Ring -->
        <div
          class="absolute inset-0 border-[50px] border-purple-400 opacity-50 rounded-full animate-shockwave mix-blend-screen"
        ></div>

        <!-- Layer 1: Outer Runes Ring -->
        <div
          class="absolute w-full h-full border-[2px] border-purple-500/40 rounded-full animate-spin-slow shadow-[0_0_30px_rgba(168,85,247,0.3)]"
        >
          <div
            class="absolute inset-2 border border-dashed border-purple-300/30 rounded-full"
          ></div>
          <!-- Cardinal Points Decor -->
          <div
            class="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-8 bg-purple-500 rotate-45 border-4 border-white shadow-[0_0_20px_white]"
          ></div>
          <div
            class="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-8 bg-purple-500 rotate-45 border-4 border-white shadow-[0_0_20px_white]"
          ></div>
          <div
            class="absolute left-0 top-1/2 -translate-y-1/2 w-8 h-8 bg-purple-500 rotate-45 border-4 border-white shadow-[0_0_20px_white]"
          ></div>
          <div
            class="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 bg-purple-500 rotate-45 border-4 border-white shadow-[0_0_20px_white]"
          ></div>
        </div>

        <!-- Layer 2: Middle Geometry (Hexagram Simulation) -->
        <div class="absolute w-[75%] h-[75%] animate-spin-reverse-slow">
          <div class="absolute inset-0 border-[6px] border-purple-400/60 rounded-full"></div>
          <div
            class="absolute inset-0 border-[3px] border-purple-200/50 rotate-0 clip-triangle"
          ></div>
          <div
            class="absolute inset-0 border-[3px] border-purple-200/50 rotate-180 clip-triangle"
          ></div>
          <div
            class="absolute inset-[15%] border-4 border-dotted border-white/40 rounded-full"
          ></div>
        </div>

        <!-- Layer 3: Inner Core Ring -->
        <div
          class="absolute w-[40%] h-[40%] border-[8px] border-white/90 rounded-full animate-spin shadow-[0_0_50px_#d8b4fe]"
        >
          <div class="absolute inset-0 border-t-[8px] border-t-purple-600 rounded-full"></div>
        </div>

        <!-- Layer 4: Central Energy Blast -->
        <div
          class="absolute w-[10%] h-[10%] bg-white rounded-full animate-pulse shadow-[0_0_80px_#fff,0_0_120px_#a855f7]"
        ></div>

        <!-- Layer 5: Expanding Shockwaves -->
        <div
          class="absolute inset-0 border-[2px] border-purple-100 rounded-full animate-ping-slow opacity-60"
        ></div>
        <div
          class="absolute inset-[20%] border-[20px] border-purple-500/10 rounded-full animate-pulse"
        ></div>

        <!-- Layer 6: Cross Beams -->
        <div
          class="absolute w-[150%] h-[4px] bg-gradient-to-r from-transparent via-white to-transparent rotate-45 animate-pulse opacity-80"
        ></div>
        <div
          class="absolute w-[150%] h-[4px] bg-gradient-to-r from-transparent via-white to-transparent -rotate-45 animate-pulse delay-75 opacity-80"
        ></div>
      </div>

      <!-- Extra Particles -->
      <div
        class="absolute inset-0 bg-texture-stardust opacity-50 animate-pulse mix-blend-screen pointer-events-none"
      ></div>
    </div>

    <!-- 3. AOE Hit Effect (Massive Explosion) -->
    <div
      v-if="activeEffect.show && activeEffect.type === 'hit_aoe'"
      class="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none"
    >
      <!-- Background Flash -->
      <div
        class="absolute inset-0 bg-red-600 opacity-20 animate-flash-fade mix-blend-overlay"
      ></div>

      <!-- 1. Expanding Shockwave Ring -->
      <div
        class="absolute w-[120vw] h-[120vw] border-[100px] border-white/80 rounded-full animate-shockwave opacity-80 mix-blend-screen"
      ></div>

      <!-- 2. Inner Explosion Core -->
      <div
        class="absolute w-[50vw] h-[50vw] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-yellow-100 via-orange-500 to-transparent animate-ping-fast opacity-90 mix-blend-screen"
      ></div>

      <!-- 3. Burst Rays -->
      <div class="absolute inset-0 animate-spin opacity-60 mix-blend-screen">
        <div
          class="absolute top-1/2 left-1/2 w-[200vw] h-[10vh] bg-gradient-to-r from-transparent via-white to-transparent -translate-y-1/2 -translate-x-1/2 rotate-0"
        ></div>
        <div
          class="absolute top-1/2 left-1/2 w-[200vw] h-[10vh] bg-gradient-to-r from-transparent via-white to-transparent -translate-y-1/2 -translate-x-1/2 rotate-45"
        ></div>
        <div
          class="absolute top-1/2 left-1/2 w-[200vw] h-[10vh] bg-gradient-to-r from-transparent via-white to-transparent -translate-y-1/2 -translate-x-1/2 rotate-90"
        ></div>
        <div
          class="absolute top-1/2 left-1/2 w-[200vw] h-[10vh] bg-gradient-to-r from-transparent via-white to-transparent -translate-y-1/2 -translate-x-1/2 rotate-135"
        ></div>
      </div>

      <!-- 4. Screen Whiteout -->
      <div class="absolute inset-0 bg-white opacity-60 animate-flash-out mix-blend-screen"></div>
    </div>

    <!-- 4. Ultimate Impact (Fullscreen Beam) -->
    <div
      v-if="activeEffect.show && activeEffect.type === 'ultimate_impact'"
      class="fixed inset-0 z-[250] flex items-center justify-center pointer-events-none overflow-hidden"
    >
      <!-- Flash -->
      <div class="absolute inset-0 bg-white animate-flash-fade"></div>

      <!-- Beam -->
      <div
        class="absolute w-full h-[50vh] bg-gradient-to-r from-yellow-200 via-white to-yellow-200 mix-blend-overlay animate-beam-expand blur-xl"
      ></div>
      <div
        class="absolute w-full h-[20vh] bg-white animate-beam-expand shadow-[0_0_100px_rgba(255,255,255,0.8)]"
      ></div>

      <!-- Shatter Overlay -->
      <div class="absolute inset-0 border-[50px] border-white/50 animate-ping-slow"></div>

      <!-- Screen Distortion -->
      <div class="absolute inset-0 backdrop-blur-[2px] animate-screen-shatter"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  activeEffect: {
    type:
      | 'slash'
      | 'spell'
      | 'spell_aoe'
      | 'spell_single'
      | 'enemy'
      | 'hit'
      | 'hit_aoe'
      | 'talk'
      | 'ultimate_impact';
    x: number;
    y: number;
    show: boolean;
    extra?: string;
  };
}>();
</script>

<style scoped>
.clip-shard-diag-1 {
  clip-path: polygon(100% 0, 0 0, 0 100%);
}
.clip-shard-diag-2 {
  clip-path: polygon(100% 0, 0 0, 100% 100%);
}
.clip-triangle {
  clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
}

.animate-spin-slow {
  animation: spin 8s linear infinite;
}
.animate-spin-reverse-slow {
  animation: spin 12s linear infinite reverse;
}
.animate-ping-slow {
  animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
}
.animate-fade-in-fast {
  animation: fadeIn 0.2s ease-out forwards;
}
.animate-scale-in-elastic {
  animation: scaleInElastic 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.animate-flash-fade {
  animation: flashFade 0.3s ease-out forwards;
}
.animate-ping-fast {
  animation: ping-fast 0.6s cubic-bezier(0, 0, 0.2, 1) infinite;
}
.animate-slash {
  animation: slash 0.3s ease-out forwards;
}

@keyframes shockwave {
  0% {
    transform: scale(0);
    opacity: 0.8;
    border-width: 50px;
  }
  100% {
    transform: scale(2);
    opacity: 0;
    border-width: 0px;
  }
}
.animate-shockwave {
  animation: shockwave 1.2s ease-out forwards;
}

@keyframes ping-fast {
  75%,
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
@keyframes ping {
  75%,
  100% {
    transform: scale(2);
    opacity: 0;
  }
}
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes scaleInElastic {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  60% {
    transform: scale(1.2);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
@keyframes flashFade {
  0% {
    opacity: 1;
    filter: brightness(2);
  }
  100% {
    opacity: 0;
  }
}
@keyframes slash {
  0% {
    transform: scale(0) rotate(45deg);
    opacity: 0;
  }
  50% {
    transform: scale(1.5) rotate(45deg);
    opacity: 1;
  }
  100% {
    transform: scale(1) rotate(45deg);
    opacity: 0;
  }
}
</style>

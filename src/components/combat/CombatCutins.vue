<template>
  <!-- Ultimate Spell Cut-in Overlay -->
  <transition name="intro-fade">
    <div
      v-if="showUltimate"
      class="fixed inset-0 z-[200] overflow-hidden pointer-events-none flex items-center justify-center font-display"
    >
      <!-- Background Flash/Speed Lines -->
      <div class="absolute inset-0 bg-black/80 animate-flash-fade z-0"></div>
      <!-- Speed Lines Effect -->
      <div
        class="absolute inset-0 opacity-30 animate-pulse-fast mix-blend-overlay z-10 radial-speed-lines"
      ></div>

      <!-- Character Portrait Slide-in -->
      <div
        class="absolute h-full w-full flex items-center z-20"
        :class="ultimateData.isPlayer ? 'justify-start' : 'justify-end'"
      >
        <div
          class="relative h-full w-2/3 transition-all duration-500"
          :class="ultimateData.isPlayer ? 'animate-slide-in-left' : 'animate-slide-in-right'"
        >
          <div class="w-full h-full animate-portrait-move origin-center">
            <img
              :src="ultimateData.spriteUrl"
              class="h-full w-full object-cover object-top drop-shadow-[0_0_50px_rgba(255,255,255,0.5)] transform"
              :class="ultimateData.isPlayer ? 'skew-x-12' : '-skew-x-12 scale-x-[-1]'"
            />
            <div
              class="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent mix-blend-overlay"
            ></div>
          </div>
        </div>
      </div>

      <!-- Spell Name Text -->
      <div class="absolute z-30 flex flex-col items-center justify-center w-full">
        <div
          class="text-6xl md:text-8xl font-black italic text-white drop-shadow-[0_0_20px_rgba(255,0,0,1)] tracking-tighter animate-slam font-display transform -rotate-6 border-y-8 border-yellow-400 py-4 bg-black/50 backdrop-blur-md px-20"
        >
          <span class="block text-3xl text-yellow-400 mb-2 tracking-[1em] text-center uppercase"
            >Spell Card</span
          >
          {{ ultimateData.spellName }}
        </div>
        <div class="mt-4 text-3xl text-white font-serif tracking-widest animate-fade-in">
          {{ ultimateData.charName }}
        </div>
      </div>
    </div>
  </transition>

  <!-- Skill Cut-in (Simple) -->
  <transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition duration-200 ease-in"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="showSkill"
      class="fixed inset-0 z-[190] pointer-events-none flex flex-col justify-center overflow-hidden font-display"
    >
      <!-- Strip Background -->
      <div
        class="absolute w-full h-40 md:h-56 bg-black/60 backdrop-blur-sm border-y-4 border-white/20 flex items-center animate-slide-in-fast origin-left"
        :class="[
          !skillData.isPlayer
            ? 'bg-gradient-to-l from-red-900/90 to-transparent'
            : skillData.isSpecial
              ? 'bg-gradient-to-r from-amber-500 via-yellow-400 to-transparent'
              : 'bg-gradient-to-r from-purple-900/95 via-rose-900/90 to-transparent'
        ]"
      >
        <!-- Sprite (masked) -->
        <div
          class="absolute top-[-50%] h-[200%] w-1/2 md:w-1/3 opacity-90 mix-blend-normal"
          :class="
            skillData.isPlayer
              ? 'left-0 md:left-20 animate-slide-in-left'
              : 'right-0 md:right-20 animate-slide-in-right'
          "
        >
          <img
            :src="skillData.spriteUrl"
            class="h-full w-full object-cover object-top mask-image-fade-bottom"
          />
        </div>

        <!-- Text -->
        <div
          class="w-full px-10 md:px-32 flex flex-col justify-center relative z-10"
          :class="skillData.isPlayer ? 'items-end text-right' : 'items-start text-left'"
        >
          <div
            class="text-4xl md:text-6xl text-white font-black italic drop-shadow-[0_0_10px_rgba(255,255,255,0.5)] animate-fade-in-up"
          >
            {{ skillData.spellName }}
          </div>
          <div class="text-xl md:text-2xl text-white/80 font-serif mt-1 tracking-widest">
            {{ skillData.charName }}
          </div>
        </div>
      </div>
    </div>
  </transition>

  <!-- Combat Flow Animation Overlay -->
  <Teleport to="body">
    <div
      v-if="showCombatFlow"
      class="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden pointer-events-none font-display"
    >
      <!-- Background: Deep Void -->
      <div class="absolute inset-0 bg-black animate-fade-in duration-500"></div>

      <!-- Moving Purple Fog/Nebula -->
      <div
        class="absolute inset-0 bg-gradient-to-br from-purple-900/60 via-transparent to-black mix-blend-screen animate-pulse-slow"
      ></div>

      <!-- Character Cut-in (Centered, Glowing) -->
      <div
        class="absolute inset-0 flex items-center justify-center z-10 transition-all duration-1000"
        :class="
          combatFlowPhase === 'start'
            ? 'opacity-0 scale-150 blur-sm'
            : 'opacity-100 scale-100 blur-0'
        "
      >
        <img
          :src="playerSpriteUrl"
          class="h-[80vh] object-contain drop-shadow-[0_0_50px_rgba(168,85,247,0.8)] filter brightness-125 contrast-125 animate-float-slow"
        />
      </div>

      <!-- Text Layer -->
      <div
        class="absolute z-20 flex flex-col items-center justify-center gap-4 mix-blend-hard-light"
        v-if="combatFlowPhase === 'impact' || combatFlowPhase === 'end'"
      >
        <h1
          class="text-8xl md:text-9xl font-black italic text-transparent bg-clip-text bg-gradient-to-t from-white to-purple-300 font-display animate-glitch-slam tracking-tighter drop-shadow-[0_0_20px_rgba(255,255,255,0.8)]"
        >
          COMBAT FLOW
        </h1>
        <div class="h-1 w-0 bg-white animate-expand-width shadow-[0_0_10px_white]"></div>
        <p
          class="text-2xl md:text-3xl text-purple-200 font-mono tracking-[1em] animate-fade-in-up uppercase"
        >
          Zone Activated
        </p>
      </div>

      <!-- Vignette & Speed lines -->
      <div
        class="absolute inset-0 bg-[radial-gradient(circle,transparent_40%,#000_100%)] z-30"
      ></div>
      <div
        class="absolute inset-0 z-10 opacity-30 animate-pulse-fast bg-[repeating-linear-gradient(90deg,transparent,transparent_50px,rgba(168,85,247,0.1)_50px,rgba(168,85,247,0.1)_51px)]"
        v-if="combatFlowPhase === 'impact'"
      ></div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
defineProps<{
  showUltimate: boolean;
  ultimateData: {
    isPlayer: boolean;
    charName: string;
    spellName: string;
    spriteUrl: string;
  };
  showSkill: boolean;
  skillData: {
    isPlayer: boolean;
    isSpecial: boolean;
    charName: string;
    spellName: string;
    spriteUrl: string;
  };
  showCombatFlow: boolean;
  combatFlowPhase: string;
  playerSpriteUrl: string;
}>();
</script>

<style scoped>
.radial-speed-lines {
  background: repeating-conic-gradient(
    from 0deg,
    transparent 0deg,
    transparent 2deg,
    rgba(255, 255, 255, 0.5) 2.5deg,
    transparent 3deg
  );
  mask-image: radial-gradient(circle, transparent 30%, black 100%);
  -webkit-mask-image: radial-gradient(circle, transparent 30%, black 100%);
}

.intro-fade-enter-active,
.intro-fade-leave-active {
  transition: opacity 0.5s ease;
}
.intro-fade-enter-from,
.intro-fade-leave-to {
  opacity: 0;
}

.animate-portrait-move {
  animation: portraitMove 3s ease-out forwards;
}
@keyframes portraitMove {
  0% {
    transform: scale(1);
    filter: brightness(1);
  }
  15% {
    transform: scale(1.05);
    filter: brightness(1.5) contrast(1.2);
  }
  100% {
    transform: scale(1.2);
    filter: brightness(1);
  }
}

.mix-blend-hard-light {
  mix-blend-mode: hard-light;
}
.animate-glitch-slam {
  animation: glitch-slam 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
.animate-expand-width {
  animation: expand-width 0.8s ease-out forwards 0.5s;
}
.animate-float-slow {
  animation: float-slow 4s ease-in-out infinite;
}

@keyframes glitch-slam {
  0% {
    transform: scale(2) skew(20deg);
    opacity: 0;
    filter: blur(10px);
  }
  20% {
    transform: scale(1) skew(0deg);
    opacity: 1;
    filter: blur(0px);
  }
  25% {
    transform: translate(-5px, 0);
  }
  30% {
    transform: translate(5px, 0);
  }
  35% {
    transform: translate(0, 0);
  }
  100% {
    transform: scale(1.05);
  }
}
@keyframes expand-width {
  0% {
    width: 0;
    opacity: 0;
  }
  100% {
    width: 100%;
    opacity: 1;
  }
}
@keyframes float-slow {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-20px);
  }
}
</style>

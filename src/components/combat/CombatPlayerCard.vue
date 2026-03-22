<template>
  <!-- Player Side (Bottom Left) -->
  <div
    class="absolute bottom-0 left-0 w-[45%] h-[70%] flex flex-col justify-end items-start pl-10 pb-10"
  >
    <div
      class="relative group w-full h-full flex flex-col justify-end items-center transition-all duration-500 hover:scale-105 transform translate-y-10 -translate-x-10"
    >
      <!-- Character Sprite Placeholder -->
      <div class="relative w-full h-full flex items-end justify-center pointer-events-auto">
        <!-- Alive State -->
        <div
          v-if="player && player.hp > 0"
          class="w-80 h-[500px] relative animate-float transform skew-x-[-5deg]"
        >
          <!-- Ally Sprite (Blurred Background) with Transition -->
          <transition name="ally-fade" mode="out-in">
            <div
              v-if="sortedAllies[0]"
              :key="sortedAllies[0].id"
              class="absolute -top-32 -left-32 w-[110%] h-[100%] z-[-1] pointer-events-none opacity-50 blur-[2px] grayscale-[0.1] brightness-90 scale-105"
            >
              <img
                :src="getSpriteUrl(sortedAllies[0].name)"
                @error="(e) => ((e.target as HTMLImageElement).src = defaultSprite)"
                class="w-full h-full object-cover object-top"
                :alt="sortedAllies[0].name"
              />
              <div
                class="absolute inset-0 bg-blue-400/10 mix-blend-screen rounded-full blur-2xl"
              ></div>
            </div>
          </transition>

          <!-- 1. Card Base -->
          <div
            class="absolute inset-0 rounded-t-3xl overflow-hidden backdrop-blur-sm border-b-4 border-red-500 shadow-[0_0_50px_rgba(220,38,38,0.3)] bg-gradient-to-t from-red-900/40 to-transparent z-0"
          ></div>

          <!-- 2. Character Sprite (Popping out) -->
          <div
            class="absolute -bottom-0 -left-12 w-[130%] h-[115%] z-10 pointer-events-none flex items-end"
          >
            <img
              :src="getSpriteUrl('主角')"
              @error="(e) => ((e.target as HTMLImageElement).src = defaultSprite)"
              class="w-full h-full object-cover object-top drop-shadow-2xl transition-transform duration-500 group-hover:scale-[1.02]"
              alt="Player"
            />
          </div>

          <!-- 3. Overlay & Text -->
          <div class="absolute inset-0 rounded-t-3xl overflow-hidden z-20 pointer-events-none">
            <div
              class="absolute inset-0 bg-gradient-to-t from-red-600/60 to-transparent mix-blend-overlay"
            ></div>
            <span
              class="absolute bottom-10 left-0 w-full text-center text-5xl font-bold font-display text-white drop-shadow-[0_0_10px_rgba(255,0,0,0.8)] tracking-widest"
            >
              {{ player?.name }}
            </span>
          </div>
        </div>

        <!-- Dead State (Shattered) -->
        <div
          v-else-if="player"
          class="w-80 h-[500px] relative transform skew-x-[-5deg] pointer-events-none"
        >
          <div
            class="absolute inset-0 w-full h-full rounded-t-3xl backdrop-blur-sm border-b-4 border-red-500 animate-shatter-1 overflow-hidden"
            style="clip-path: polygon(0 0, 100% 0, 60% 100%, 0% 80%)"
          >
            <div class="absolute -bottom-0 -left-12 w-[130%] h-[115%] flex items-end">
              <img
                :src="getSpriteUrl('主角')"
                @error="(e) => ((e.target as HTMLImageElement).src = defaultSprite)"
                class="w-full h-full object-cover object-top"
              />
            </div>
            <div
              class="absolute inset-0 bg-gradient-to-t from-red-600/60 to-transparent mix-blend-overlay"
            ></div>
            <span
              class="absolute bottom-10 left-0 w-full text-center text-5xl font-bold font-display text-white drop-shadow-[0_0_10px_rgba(255,0,0,0.8)] tracking-widest"
            >
              {{ player?.name }}
            </span>
          </div>
          <div
            class="absolute inset-0 w-full h-full rounded-t-3xl backdrop-blur-sm border-b-4 border-red-500 animate-shatter-2 overflow-hidden"
            style="clip-path: polygon(100% 0, 100% 100%, 0% 100%, 60% 100%, 0% 80%)"
          >
            <div class="absolute -bottom-0 -left-12 w-[130%] h-[115%] flex items-end">
              <img
                :src="getSpriteUrl('主角')"
                @error="(e) => ((e.target as HTMLImageElement).src = defaultSprite)"
                class="w-full h-full object-cover object-top"
              />
            </div>
            <div
              class="absolute inset-0 bg-gradient-to-t from-red-600/60 to-transparent mix-blend-overlay"
            ></div>
          </div>
        </div>

        <!-- Damage Popup for Player -->
        <div
          v-for="p in player?.popups"
          :key="p.id"
          class="absolute top-1/3 left-1/2 transform -translate-x-1/2 z-50 text-6xl font-black italic font-display animate-damage-pop pointer-events-none whitespace-nowrap"
          :class="{
            'text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.8)]': p.type === 'heal',
            'text-blue-400 drop-shadow-[0_0_10px_rgba(96,165,250,0.8)]': p.type === 'buff',
            'text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]':
              p.type === 'damage' || p.type === 'crit'
          }"
        >
          {{ p.text }}
        </div>
      </div>

      <!-- Player Status HUD -->
      <div
        v-if="player"
        class="absolute -right-20 top-[46%] flex flex-col gap-3 transform skew-x-[-10deg] pointer-events-auto"
      >
        <!-- HP Bar -->
        <div class="relative transition-transform hover:scale-110 group">
          <div
            class="bg-black/80 border-l-8 pl-6 pr-10 py-3 text-3xl font-bold font-mono clip-hud-left relative"
            :style="getPlayerHpStyle(player.hp, player.maxHp)"
          >
            HP <span class="text-white">{{ player.hp }}</span>
            <span class="text-sm text-gray-400">/ {{ player.maxHp }}</span>
            <div
              v-if="player.shield > 0"
              class="absolute -top-6 right-0 text-cyan-400 text-lg font-bold flex items-center gap-1 drop-shadow-md animate-pulse"
            >
              <Shield class="w-5 h-5 fill-cyan-400/20" /> {{ player.shield }}
            </div>
          </div>

          <!-- AP Display -->
          <div
            class="absolute -left-2 -top-12 flex gap-2 pointer-events-none transform skew-x-[10deg] z-50"
          >
            <div
              v-for="i in player.maxActionPoints || 2"
              :key="i"
              class="w-8 h-8 rounded-full border-2 border-white shadow-[0_0_15px_rgba(255,255,255,0.6)] transition-all duration-500"
              :class="
                (player.actionPoints !== undefined ? player.actionPoints : 2) >= i
                  ? 'bg-yellow-300 shadow-[0_0_20px_rgba(253,224,71,1)] scale-110 animate-pulse-slow'
                  : 'bg-gray-900/80 border-gray-600 opacity-60 scale-90'
              "
            ></div>
          </div>
        </div>

        <!-- MP Bar -->
        <div class="relative ml-8 transition-transform hover:scale-110 group">
          <div
            class="bg-black/80 border-l-8 border-blue-500 pl-6 pr-8 py-2 text-2xl font-bold font-mono text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.4)] clip-hud-left"
          >
            MP <span class="text-white">{{ player.mp }}</span>
            <span class="text-sm text-gray-400">/ {{ player.maxMp }}</span>
          </div>
        </div>

        <!-- P Point Gauge -->
        <div
          class="absolute -left-24 top-0 w-20 h-20 bg-black/80 rounded-full border-2 flex items-center justify-center transition-transform hover:scale-110"
          :class="[
            (player.pPoints || 0) >= 80
              ? 'border-orange-500 animate-burning z-[60]'
              : 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]'
          ]"
        >
          <div
            v-if="(player.pPoints || 0) >= 80"
            class="absolute inset-[-4px] rounded-full border-4 border-orange-400/30 blur-sm animate-pulse"
          ></div>
          <svg class="w-full h-full transform -rotate-90 p-1" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="40"
              stroke="rgba(255,255,255,0.1)"
              stroke-width="8"
              fill="none"
            />
            <circle
              cx="50"
              cy="50"
              r="40"
              :stroke="(player.pPoints || 0) >= 80 ? '#ff8c00' : '#ef4444'"
              stroke-width="8"
              fill="none"
              stroke-linecap="round"
              :stroke-dasharray="251.2"
              :stroke-dashoffset="251.2 * (1 - (player.pPoints || 0) / 100)"
              class="transition-all duration-500 ease-out"
              :class="{ 'animate-fire-flicker': (player.pPoints || 0) >= 80 }"
            />
          </svg>
          <div
            class="absolute inset-0 flex flex-col items-center justify-center font-bold font-mono"
          >
            <span
              class="text-[10px] leading-none"
              :class="(player.pPoints || 0) >= 80 ? 'text-orange-400' : 'text-red-400'"
              >P</span
            >
            <span
              class="text-xl text-white leading-none"
              :class="{ 'drop-shadow-[0_0_5px_rgba(255,140,0,0.8)]': (player.pPoints || 0) >= 80 }"
            >
              {{ (player.pPoints || 0).toFixed(0) }}
            </span>
          </div>
        </div>

        <!-- Shield & Dodge Stats -->
        <div class="flex gap-2 ml-12">
          <div
            class="bg-black/80 border-l-4 border-cyan-400 pl-4 pr-4 py-1 text-lg font-bold font-mono text-cyan-400 clip-hud-left flex items-center gap-2"
          >
            <Shield class="w-4 h-4" />
            <span class="text-white">{{ player.shield }}</span>
          </div>
          <div
            class="bg-black/80 border-l-4 border-green-400 pl-4 pr-4 py-1 text-lg font-bold font-mono text-green-400 clip-hud-left flex items-center gap-2"
          >
            <Zap class="w-4 h-4" />
            <span class="text-white">{{ Math.round((player.dodgeRate || 0) * 100) }}%</span>
          </div>
        </div>

        <!-- Buffs -->
        <div
          class="flex flex-wrap gap-1 mt-2 ml-16 max-w-[280px] transform skew-x-[10deg] pointer-events-auto min-h-[32px] justify-start"
        >
          <div v-for="buff in player.buffs" :key="buff.id" class="relative group/buff">
            <div
              class="w-8 h-8 rounded bg-black/60 border border-gray-500 flex items-center justify-center text-xs text-white cursor-help overflow-hidden transition-transform hover:scale-110"
            >
              <span class="scale-75">{{ buff.name.substring(0, 1) }}</span>
            </div>
            <div
              class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-black/90 border border-gray-600 text-white text-xs p-2 rounded pointer-events-none opacity-0 group-hover/buff:opacity-100 transition-opacity z-[100] shadow-xl"
            >
              <div class="font-bold text-yellow-400 mb-1">{{ buff.name }}</div>
              <div class="mb-1 text-gray-300 leading-tight">{{ buff.description }}</div>
              <div
                v-if="buff.effects && buff.effects.length > 0"
                class="mt-1 mb-1 border-t border-gray-700 pt-1"
              >
                <div
                  v-for="(eff, idx) in buff.effects"
                  :key="idx"
                  class="flex justify-between text-gray-400"
                >
                  <span>{{ getEffectName(eff) }}</span>
                  <span :class="eff.value > 0 ? 'text-green-400' : 'text-red-400'">
                    {{ eff.value > 0 ? '+' : ''
                    }}{{
                      eff.isPercentage === false ||
                      ['heal', 'heal_mp', 'shield', 'damage_over_time'].includes(eff.type)
                        ? Math.round(eff.value)
                        : Math.round(eff.value * 100) + '%'
                    }}
                  </span>
                </div>
              </div>
              <div class="text-blue-400 font-mono text-[10px] text-right">
                剩余 {{ buff.duration }} 轮
              </div>
            </div>
          </div>
        </div>

        <!-- Allies Stack -->
        <div
          v-if="allies.length > 0"
          class="relative mt-2 ml-12 w-[280px] h-[140px] transform skew-x-[10deg] pointer-events-none perspective-[1000px]"
        >
          <transition-group name="list-complete" tag="div" class="relative w-full h-full">
            <div
              v-for="(ally, index) in sortedAllies"
              :key="ally.id"
              class="absolute top-0 left-0 w-full transition-all duration-500 ease-out pointer-events-auto cursor-pointer group/ally"
              :style="{
                zIndex: 100 - index,
                transform: `translateY(${index * 18}px) translateZ(${-index * 20}px) scale(${1 - index * 0.04})`,
                opacity: index === 0 ? 1 : Math.max(0.3, 0.8 - index * 0.15),
                filter: index === 0 ? 'none' : 'blur(0.5px) grayscale(30%)'
              }"
              @click.stop="$emit('activate-ally', ally.id)"
            >
              <div
                class="w-full bg-black/90 border-l-4 p-2 flex items-center gap-3 shadow-lg backdrop-blur-md relative"
                :class="[
                  index === 0
                    ? 'border-blue-500 bg-gradient-to-r from-blue-900/40 to-black'
                    : 'border-gray-600 bg-gray-900/80 hover:border-blue-400 hover:bg-gray-800',
                  { 'opacity-50 grayscale': ally.hp <= 0 }
                ]"
              >
                <div
                  class="w-10 h-10 rounded overflow-hidden border bg-blue-900/20 flex-shrink-0 transition-colors duration-300"
                  :class="index === 0 ? 'border-blue-400' : 'border-gray-600'"
                >
                  <img
                    :src="getSpriteUrl(ally.name)"
                    @error="(e) => ((e.target as HTMLImageElement).src = defaultSprite)"
                    class="w-full h-full object-cover object-top"
                  />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex justify-between items-center">
                    <span
                      class="font-bold truncate text-xs transition-colors duration-300"
                      :class="
                        index === 0 ? 'text-white' : 'text-gray-400 group-hover/ally:text-white'
                      "
                    >
                      {{ ally.name }}
                    </span>
                    <span v-if="index === 0" class="text-[10px] text-blue-300 font-mono"
                      >{{ ally.hp }}/{{ ally.maxHp }}</span
                    >
                  </div>
                  <div class="w-full h-1.5 bg-gray-700 rounded-full mt-1 overflow-hidden">
                    <div
                      class="h-full transition-all duration-500"
                      :class="ally.hp < ally.maxHp * 0.3 ? 'bg-red-500' : 'bg-blue-500'"
                      :style="{ width: `${(ally.hp / ally.maxHp) * 100}%` }"
                    ></div>
                  </div>
                </div>
                <div
                  v-if="index === 0"
                  class="absolute -right-1 -top-1 w-3 h-3 bg-blue-400 rounded-full animate-ping"
                ></div>
              </div>

              <!-- Buffs (Top Card Only) -->
              <div
                v-if="index === 0 && ally.buffs && ally.buffs.length > 0"
                class="flex flex-wrap gap-1 mt-1 pl-2 animate-fade-in relative z-[101]"
              >
                <div v-for="buff in ally.buffs" :key="buff.id" class="relative group/buff">
                  <div
                    class="w-6 h-6 rounded bg-black/80 border border-blue-500 flex items-center justify-center text-[10px] text-white cursor-help overflow-hidden shadow-md hover:scale-110 transition-transform"
                  >
                    <span class="scale-90 font-bold">{{ buff.name.substring(0, 1) }}</span>
                  </div>
                  <div
                    class="absolute bottom-full left-0 mb-2 w-40 bg-black/95 border border-blue-500 text-white text-xs p-2 rounded pointer-events-none opacity-0 group-hover/buff:opacity-100 transition-opacity z-[200] shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                  >
                    <div class="font-bold text-yellow-400 mb-1">
                      <span>{{ buff.name }}</span>
                    </div>
                    <div class="mb-1 text-gray-300 leading-tight border-b border-gray-700 pb-1">
                      {{ buff.description }}
                    </div>
                    <div class="text-blue-400 font-mono text-[10px] text-right mt-1">
                      剩余 {{ buff.duration }} 轮
                    </div>
                  </div>
                </div>
              </div>

              <!-- Damage Popup -->
              <div
                v-for="p in ally.popups"
                :key="p.id"
                class="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-full z-50 text-xl font-black italic font-display animate-damage-pop pointer-events-none whitespace-nowrap"
                :style="{ zIndex: 200 }"
                :class="{
                  'text-green-400 drop-shadow-md': p.type === 'heal',
                  'text-blue-400 drop-shadow-md': p.type === 'buff',
                  'text-red-500 drop-shadow-md': p.type === 'damage'
                }"
              >
                {{ p.text }}
              </div>
            </div>
          </transition-group>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Shield, Zap } from 'lucide-vue-next';
import type { Buff, BuffEffect } from '@/types/combat';

interface Popup {
  id: number;
  text: string | number;
  type: 'damage' | 'heal' | 'crit' | 'buff' | 'debuff';
}

interface UICombatant {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  shield: number;
  dodgeRate?: number;
  pPoints?: number;
  actionPoints?: number;
  maxActionPoints?: number;
  isPlayer?: boolean;
  team?: string;
  buffs: Buff[];
  popups: Popup[];
}

defineProps<{
  player: UICombatant | null;
  allies: UICombatant[];
  sortedAllies: UICombatant[];
  defaultSprite: string;
  getSpriteUrl: (name?: string) => string;
  getPlayerHpStyle: (hp: number, maxHp: number) => Record<string, string>;
  getEffectName: (effect: BuffEffect) => string;
}>();

defineEmits<{
  'activate-ally': [id: string];
}>();
</script>

<style scoped>
.clip-hud-left {
  clip-path: polygon(0 0, 100% 0, 85% 100%, 0 100%);
}
.animate-float {
  animation: float 6s ease-in-out infinite;
}
.animate-shatter-1 {
  animation: shatter1 2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.animate-shatter-2 {
  animation: shatter2 2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.animate-damage-pop {
  animation: damagePop 0.8s cubic-bezier(0.2, 0.9, 0.3, 1) forwards;
}
.animate-burning {
  animation: burning-pulse 1.5s infinite ease-in-out;
}
.animate-fire-flicker {
  animation: fire-flicker 0.4s infinite ease-in-out;
}

.ally-fade-enter-active,
.ally-fade-leave-active {
  transition: all 0.5s ease;
}
.ally-fade-enter-from {
  opacity: 0;
  transform: translateX(-20px) scale(1);
}
.ally-fade-leave-to {
  opacity: 0;
  transform: translateX(20px) scale(1);
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}
@keyframes shatter1 {
  0% {
    transform: translate(0, 0) rotate(0);
    opacity: 1;
  }
  100% {
    transform: translate(-100px, -50px) rotate(-45deg);
    opacity: 0;
  }
}
@keyframes shatter2 {
  0% {
    transform: translate(0, 0) rotate(0);
    opacity: 1;
  }
  100% {
    transform: translate(100px, 50px) rotate(45deg);
    opacity: 0;
  }
}
@keyframes damagePop {
  0% {
    transform: translate(-50%, 0) scale(0.5);
    opacity: 0;
  }
  20% {
    transform: translate(-50%, -40px) scale(1.5);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -100px) scale(1);
    opacity: 0;
  }
}
@keyframes burning-pulse {
  0% {
    box-shadow: 0 0 15px rgba(239, 68, 68, 0.5);
    border-color: #ef4444;
  }
  50% {
    box-shadow:
      0 0 30px rgba(255, 140, 0, 0.8),
      0 0 50px rgba(239, 68, 68, 0.4);
    border-color: #ff8c00;
  }
  100% {
    box-shadow: 0 0 15px rgba(239, 68, 68, 0.5);
    border-color: #ef4444;
  }
}
@keyframes fire-flicker {
  0%,
  100% {
    opacity: 0.8;
    transform: scale(1);
    filter: brightness(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.05);
    filter: brightness(1.3);
  }
}
</style>

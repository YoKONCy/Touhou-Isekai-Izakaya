<template>
  <!-- Enemy Side (Top Right) -->
  <div class="absolute top-0 right-0 w-[60%] h-[60%] flex flex-row justify-end items-start pr-10 pt-10 gap-8 pointer-events-none">
     
     <!-- Reserve Enemies (Compact Mode) -->
     <div v-if="reserveEnemies.length > 0" class="flex flex-col gap-2 pt-4 pointer-events-auto mr-4 animate-fade-in">
        <div 
           v-for="(en) in reserveEnemies" 
           :key="en.id"
           @click="$emit('select-target', en)"
           class="relative w-48 bg-black/80 border-l-4 border-purple-500 p-3 transform transition-all duration-300 hover:scale-105 hover:bg-purple-900/40 cursor-pointer group"
           :class="{
              'opacity-50 cursor-not-allowed': isActing || (phase === 'enemy'),
              'border-red-500 bg-red-900/20': selectionMode
           }"
        >
            <div class="flex justify-between items-center mb-1">
                <span class="font-bold font-display text-white truncate text-sm">{{ en.name }}</span>
                <span class="text-xs font-mono text-purple-300">WAITING</span>
            </div>
            <div class="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div class="h-full bg-purple-500 transition-all duration-500" :style="{ width: `${(en.hp / en.maxHp) * 100}%` }"></div>
            </div>
            <div class="text-right text-[10px] font-mono text-gray-400 mt-1">HP {{ en.hp }}</div>
            <div class="absolute right-full top-0 mr-2 w-20 h-20 hidden group-hover:block z-50 border-2 border-purple-500 rounded bg-black">
                <img :src="getSpriteUrl(en.name)" class="w-full h-full object-cover object-top" />
            </div>
        </div>
     </div>

     <!-- Active Enemies (Full Card Mode) -->
     <div 
        v-for="(en, idx) in activeEnemies" 
        :key="en.id"
        @click="$emit('select-target', en)"
        @mouseenter="$emit('hover-enemy', en.id)"
        @mouseleave="$emit('hover-enemy', null)"
        class="relative flex-1 min-w-0 max-w-[220px] h-full flex flex-col justify-start items-center transform transition-all duration-500 pointer-events-auto"
        :class="{ 
          'hover:scale-105': en.hp > 0 && !selectionMode && !isActing,
          'cursor-crosshair hover:scale-105 hover:brightness-125': selectionMode && en.hp > 0 && !isActing,
          'cursor-not-allowed opacity-80': isActing || (phase === 'enemy')
        }"
        :style="{ 
           transform: `translateY(${idx * 30}px)`,
           zIndex: hoveredEnemyId === en.id ? 50 : (activeEnemies.length - idx)
        }"
     >
         <!-- Enemy Sprite / Card -->
         <div class="relative w-full h-full flex items-start justify-center animate-float-delayed">
            <!-- Alive State -->
            <div v-if="en.hp > 0" class="w-full h-full relative group" :class="{'grayscale brightness-50': en.hp <= 0}">
               <div class="absolute inset-0 rounded-b-3xl overflow-hidden backdrop-blur-sm border-t-4 border-purple-500 shadow-[0_0_30px_rgba(168,85,247,0.3)] bg-gradient-to-b from-purple-900/40 to-transparent z-0"></div>
               <div class="absolute -top-4 left-0 w-full h-[115%] z-10 pointer-events-none flex items-start justify-center">
                  <img :src="getSpriteUrl(en.name)" @error="(e) => (e.target as HTMLImageElement).src = defaultSprite"
                       class="w-full h-full object-cover object-top drop-shadow-2xl transition-transform duration-500 group-hover:scale-[1.02]" alt="Enemy" />
               </div>
               <div class="absolute inset-0 rounded-b-3xl overflow-hidden z-20 pointer-events-none">
                  <div class="absolute inset-0 bg-gradient-to-b from-purple-600/60 to-transparent mix-blend-overlay"></div>
                  <span class="absolute top-10 left-0 w-full text-center text-2xl font-bold font-display text-white drop-shadow-[0_0_10px_rgba(168,85,247,0.8)] tracking-widest px-2 break-words">
                    {{ en.name }}
                  </span>
               </div>
            </div>

            <!-- Dead State (Shattered) -->
            <div v-else class="absolute inset-0 w-full h-full pointer-events-none">
               <div class="absolute inset-0 w-full h-full rounded-b-3xl backdrop-blur-sm border-t-4 border-purple-500 animate-shatter-1 overflow-hidden" 
                    style="clip-path: polygon(0 0, 100% 0, 60% 100%, 0% 80%);">
                 <div class="absolute -top-4 left-0 w-full h-[115%] flex items-start justify-center">
                     <img :src="getSpriteUrl(en.name)" @error="(e) => (e.target as HTMLImageElement).src = defaultSprite" class="w-full h-full object-cover object-top" />
                 </div>
                 <div class="absolute inset-0 bg-gradient-to-b from-purple-600/60 to-transparent mix-blend-overlay"></div>
                 <span class="absolute top-10 left-0 w-full text-center text-2xl font-bold font-display text-white drop-shadow-[0_0_10px_rgba(168,85,247,0.8)] tracking-widest px-2 break-words">{{ en.name }}</span>
               </div>
               <div class="absolute inset-0 w-full h-full rounded-b-3xl backdrop-blur-sm border-t-4 border-purple-500 animate-shatter-2 overflow-hidden" 
                    style="clip-path: polygon(100% 0, 100% 100%, 0% 100%, 60% 100%, 0% 80%);">
                 <div class="absolute -top-4 left-0 w-full h-[115%] flex items-start justify-center">
                     <img :src="getSpriteUrl(en.name)" @error="(e) => (e.target as HTMLImageElement).src = defaultSprite" class="w-full h-full object-cover object-top" />
                 </div>
                 <div class="absolute inset-0 bg-gradient-to-b from-purple-600/60 to-transparent mix-blend-overlay"></div>
               </div>
            </div>
            
            <!-- Damage Popup -->
            <div v-for="p in en.popups" :key="p.id" 
                 class="absolute top-10 left-1/2 transform -translate-x-1/2 z-50 text-5xl font-black italic font-display animate-damage-pop pointer-events-none whitespace-nowrap"
                 :class="{
                    'text-green-400': p.type === 'heal',
                    'text-blue-400 drop-shadow-[0_0_10px_rgba(96,165,250,0.8)]': p.type === 'buff',
                    'text-yellow-400 drop-shadow-[0_0_10px_rgba(234,179,8,0.8)]': p.type === 'damage' || p.type === 'crit'
                 }">
              {{ p.text }}
            </div>
         </div>
         
         <!-- Enemy Status HUD -->
         <div class="absolute -left-10 bottom-10 flex flex-col gap-2 transform skew-x-[10deg] items-end w-full transition-all duration-500"
              :class="en.hp > 0 ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-10 pointer-events-none'">
            <div class="border-r-4 pr-4 pl-6 py-1 text-lg font-bold font-mono clip-hud-right w-full text-right transition-all duration-300"
                 :style="getEnemyHpStyle(en.hp, en.maxHp)">
              HP <span class="text-white">{{ en.hp }}</span>
            </div>

            <div class="flex gap-2 justify-end w-full">
                <div class="bg-black/80 border-r-4 border-green-400 pr-2 pl-2 py-0.5 text-xs font-bold font-mono text-green-400 clip-hud-right flex items-center gap-1">
                    <span class="text-white">{{ Math.round((getEnemyEffectiveDodge(en) || 0) * 100) }}%</span>
                    <Zap class="w-3 h-3" />
                </div>
                <div class="bg-black/80 border-r-4 border-cyan-400 pr-2 pl-2 py-0.5 text-xs font-bold font-mono text-cyan-400 clip-hud-right flex items-center gap-1">
                    <span class="text-white">{{ en.shield || 0 }}</span>
                    <Shield class="w-3 h-3" />
                </div>
            </div>

            <!-- Buffs -->
            <div class="flex flex-wrap gap-1 justify-end max-w-[150px]">
               <div v-for="buff in en.buffs" :key="buff.id" class="relative group/buff">
                  <div class="w-6 h-6 rounded bg-black/60 border border-gray-500 flex items-center justify-center text-[10px] text-white cursor-help overflow-hidden">
                      <span class="scale-75">{{ buff.name.substring(0, 1) }}</span>
                  </div>
                  <div class="absolute bottom-full right-0 mb-2 w-32 bg-black/90 border border-gray-600 text-white text-xs p-2 rounded pointer-events-none opacity-0 group-hover/buff:opacity-100 transition-opacity z-[100] shadow-xl text-right">
                      <div class="font-bold text-yellow-400 mb-1">{{ buff.name }}</div>
                      <div class="mb-1 text-gray-300 leading-tight">{{ buff.description }}</div>
                      <div v-if="buff.effects && buff.effects.length > 0" class="mt-1 mb-1 border-t border-gray-700 pt-1">
                          <div v-for="(eff, idx) in buff.effects" :key="idx" class="flex justify-between text-gray-400 text-[10px]">
                              <span>{{ getEffectName(eff) }}</span>
                              <span :class="eff.value > 0 ? 'text-green-400' : 'text-red-400'">
                                  {{ eff.value > 0 ? '+' : '' }}{{ 
                                      (eff.isPercentage === false || ['heal', 'heal_mp', 'shield', 'damage_over_time'].includes(eff.type))
                                      ? Math.round(eff.value) 
                                      : Math.round(eff.value * 100) + '%' 
                                  }}
                              </span>
                          </div>
                      </div>
                      <div class="text-blue-400 font-mono text-[10px]">剩余 {{ buff.duration }} 轮</div>
                  </div>
               </div>
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
  shield?: number;
  dodgeRate?: number;
  isPlayer?: boolean;
  team?: string;
  buffs: Buff[];
  popups: Popup[];
  [key: string]: any;
}

defineProps<{
  activeEnemies: UICombatant[];
  reserveEnemies: UICombatant[];
  selectionMode: boolean;
  isActing: boolean;
  phase: 'player' | 'ally' | 'enemy';
  hoveredEnemyId: string | null;
  defaultSprite: string;
  getSpriteUrl: (name?: string) => string;
  getEnemyHpStyle: (hp: number, maxHp: number) => Record<string, string>;
  getEnemyEffectiveDodge: (enemy: any) => number;
  getEffectName: (effect: BuffEffect) => string;
}>();

defineEmits<{
  'select-target': [enemy: any];
  'hover-enemy': [id: string | null];
}>();
</script>

<style scoped>
.clip-hud-right { clip-path: polygon(15% 0, 100% 0, 100% 100%, 0 100%); }
.animate-float-delayed { animation: float 6s ease-in-out infinite 3s; }
.animate-shatter-1 { animation: shatter1 2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
.animate-shatter-2 { animation: shatter2 2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
.animate-damage-pop { animation: damagePop 0.8s cubic-bezier(0.2, 0.9, 0.3, 1) forwards; }

@keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
@keyframes shatter1 { 0% { transform: translate(0, 0) rotate(0); opacity: 1; } 100% { transform: translate(-100px, -50px) rotate(-45deg); opacity: 0; } }
@keyframes shatter2 { 0% { transform: translate(0, 0) rotate(0); opacity: 1; } 100% { transform: translate(100px, 50px) rotate(45deg); opacity: 0; } }
@keyframes damagePop { 0% { transform: translate(-50%, 0) scale(0.5); opacity: 0; } 20% { transform: translate(-50%, -40px) scale(1.5); opacity: 1; } 100% { transform: translate(-50%, -100px) scale(1); opacity: 0; } }
</style>

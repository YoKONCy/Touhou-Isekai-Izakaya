<template>
  <!-- Action Wheel (Bottom Right - Persona 5 Style) -->
  <div
    class="absolute bottom-10 right-20 pointer-events-auto perspective-1000"
    :class="{
      'opacity-50 blur-[2px] pointer-events-none':
        selectionMode || isActing || phase !== 'player' || isGameOver
    }"
  >
    <!-- Main Menu -->
    <div
      v-if="currentMenu === 'main'"
      class="relative w-64 h-64 transition-all duration-500 transform-style-3d flex items-center justify-center"
      @mouseenter="isMenuOpen = true"
      @mouseleave="isMenuOpen = false"
    >
      <!-- Center: Attack (Pentagon) -->
      <button
        @click="$emit('action', 'attack')"
        @mouseenter="$emit('hover-sound')"
        class="absolute z-50 w-40 h-40 bg-red-600 hover:bg-red-500 text-white font-black text-3xl italic font-display shadow-[0_0_40px_rgba(220,38,38,0.8)] flex items-center justify-center pt-4 transition-all duration-500 ease-out group clip-pentagon-core animate-pulse-slow disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
        :class="{ 'rotate-[360deg] scale-110': isMenuOpen }"
        :disabled="!canAttack"
      >
        <span
          class="transform transition-transform drop-shadow-md"
          :class="isMenuOpen ? '-rotate-[360deg]' : ''"
          >ATTACK</span
        >
      </button>

      <!-- 1. Spell (Top Right, 36deg) -->
      <button
        @click="$emit('switch-menu', 'spell')"
        @mouseenter="$emit('hover-sound')"
        class="absolute z-20 w-32 h-32 -ml-16 -mt-16 bg-black border-2 border-purple-400 hover:bg-purple-600 hover:border-white text-purple-400 hover:text-white font-bold text-lg font-display italic flex items-center justify-center clip-wedge transition-all duration-500 ease-out hover:z-40 group"
        :style="{
          transform: isMenuOpen
            ? 'rotate(36deg) translateY(-105px) scale(1)'
            : 'rotate(216deg) translateY(0px) scale(0.5)',
          opacity: isMenuOpen ? 1 : 0,
          pointerEvents: isMenuOpen ? 'auto' : 'none'
        }"
      >
        <span
          class="transform -rotate-[36deg] group-hover:scale-110 transition-transform text-xl block"
          >SPELL</span
        >
      </button>

      <!-- 2. Item (Bottom Right, 108deg) -->
      <button
        @click="$emit('switch-menu', 'item')"
        @mouseenter="$emit('hover-sound')"
        class="absolute z-20 w-32 h-32 -ml-16 -mt-16 bg-black border-2 border-blue-400 hover:bg-blue-600 hover:border-white text-blue-400 hover:text-white font-bold text-lg font-display italic flex items-center justify-center clip-wedge transition-all duration-500 ease-out hover:z-40 group"
        :style="{
          transform: isMenuOpen
            ? 'rotate(108deg) translateY(-105px) scale(1)'
            : 'rotate(288deg) translateY(0px) scale(0.5)',
          opacity: isMenuOpen ? 1 : 0,
          pointerEvents: isMenuOpen ? 'auto' : 'none'
        }"
      >
        <span
          class="transform -rotate-[108deg] group-hover:scale-110 transition-transform text-xl block"
          >ITEM</span
        >
      </button>

      <!-- 3. Special -->
      <button
        @click="$emit('switch-menu', 'special')"
        @mouseenter="$emit('hover-sound')"
        class="absolute z-20 w-32 h-32 -ml-16 -mt-16 bg-black border-2 border-yellow-400 hover:bg-yellow-600 hover:border-white text-yellow-400 hover:text-white font-bold text-lg font-display italic flex items-center justify-center clip-wedge transition-all duration-500 ease-out hover:z-40 group"
        :style="{
          transform: isMenuOpen
            ? 'rotate(180deg) translateY(-105px) scale(1)'
            : 'rotate(360deg) translateY(0px) scale(0.5)',
          opacity: isMenuOpen ? 1 : 0,
          pointerEvents: isMenuOpen ? 'auto' : 'none'
        }"
      >
        <span
          class="transform -rotate-[180deg] group-hover:scale-110 transition-transform text-xl block"
          >SPECIAL</span
        >
      </button>

      <!-- 4. Escape (Disabled) -->
      <button
        class="absolute z-20 w-32 h-32 -ml-16 -mt-16 bg-black border-2 border-gray-700 text-gray-700 font-bold text-lg font-display italic flex items-center justify-center clip-wedge transition-all duration-500 ease-out cursor-not-allowed"
        :style="{
          transform: isMenuOpen
            ? 'rotate(252deg) translateY(-105px) scale(1)'
            : 'rotate(432deg) translateY(0px) scale(0.5)',
          opacity: isMenuOpen ? 0.5 : 0
        }"
      >
        <span class="transform -rotate-[252deg] text-xl block">ESCAPE</span>
      </button>

      <!-- 5. Talk -->
      <button
        @click="$emit('switch-menu', 'talk')"
        @mouseenter="$emit('hover-sound')"
        class="absolute z-20 w-32 h-32 -ml-16 -mt-16 bg-black border-2 border-green-400 hover:bg-green-600 hover:border-white text-green-400 hover:text-white font-bold text-lg font-display italic flex items-center justify-center clip-wedge transition-all duration-500 ease-out hover:z-40 group"
        :style="{
          transform: isMenuOpen
            ? 'rotate(324deg) translateY(-105px) scale(1)'
            : 'rotate(504deg) translateY(0px) scale(0.5)',
          opacity: isMenuOpen ? 1 : 0,
          pointerEvents: isMenuOpen ? 'auto' : 'none'
        }"
      >
        <span
          class="transform -rotate-[324deg] group-hover:scale-110 transition-transform text-xl block"
          >TALK</span
        >
      </button>
    </div>

    <!-- Sub Menu: Spells -->
    <div
      v-else-if="currentMenu === 'spell'"
      class="relative w-80 min-h-[300px] flex flex-col gap-2 items-end animate-slide-in-right"
    >
      <div class="text-3xl font-black italic text-purple-400 mb-4 drop-shadow-glow font-display">
        SPELL CARDS
      </div>

      <!-- Hover Info Panel -->
      <div
        v-if="hoveredSpell"
        class="absolute right-[110%] top-0 w-64 bg-black/80 border border-purple-500/50 p-4 rounded-lg backdrop-blur-md shadow-[0_0_20px_rgba(168,85,247,0.3)] animate-fade-in-fast z-50 pointer-events-none"
      >
        <h3 class="text-xl font-bold text-purple-300 mb-2 border-b border-purple-500/30 pb-1">
          {{ hoveredSpell.name }}
        </h3>
        <div class="text-sm text-gray-300 space-y-2">
          <p class="italic text-gray-400 text-xs">{{ hoveredSpell.description }}</p>
          <div class="flex justify-between text-purple-200">
            <span>消耗 MP:</span>
            <span class="font-mono font-bold">{{ hoveredSpell.cost }}</span>
          </div>
          <div v-if="hoveredSpell.damage" class="flex justify-between text-red-300">
            <span>威力:</span>
            <span class="font-mono font-bold">{{ hoveredSpell.damage }}</span>
          </div>
          <div class="flex justify-between text-blue-300">
            <span>类型:</span>
            <span>{{ getSpellTypeName(hoveredSpell.type || '') }}</span>
          </div>
          <div
            v-if="hoveredSpell.buffDetails"
            class="text-xs text-green-300 border-t border-white/10 pt-1 mt-1"
          >
            <div class="font-bold mb-0.5">附加效果:</div>
            <div>{{ hoveredSpell.buffDetails.description || hoveredSpell.buffDetails.name }}</div>
            <div class="opacity-70">持续 {{ hoveredSpell.buffDetails.duration }} 回合</div>
          </div>
        </div>
      </div>

      <button
        v-for="(spell, idx) in spells"
        :key="idx"
        @click="$emit('action', 'spell', spell)"
        @mouseenter="
          $emit('hover-sound');
          hoveredSpell = spell;
        "
        @mouseleave="hoveredSpell = null"
        class="w-full text-right px-6 py-3 border-r-4 transition-all clip-rect-left"
        :class="[
          canAffordSpell(spell)
            ? 'bg-black/80 border-purple-500 hover:bg-purple-900/50 hover:border-white text-white hover:-translate-x-4 cursor-pointer'
            : 'bg-gray-900/80 border-gray-700 text-gray-500 cursor-not-allowed opacity-60'
        ]"
      >
        {{ spell.name }}
        <span
          class="text-xs ml-2"
          :class="canAffordSpell(spell) ? 'text-purple-300' : 'text-gray-600'"
          >MP {{ getSpellCost(spell) }}</span
        >
      </button>

      <button
        @click="$emit('switch-menu', 'main')"
        @mouseenter="$emit('hover-sound')"
        class="mt-4 text-gray-400 hover:text-white font-bold italic transition-colors"
      >
        BACK
      </button>
    </div>

    <!-- Sub Menu: Items -->
    <div
      v-else-if="currentMenu === 'item'"
      class="relative w-80 min-h-[300px] flex flex-col gap-2 items-end animate-slide-in-right"
    >
      <div class="text-3xl font-black italic text-blue-400 mb-4 drop-shadow-glow font-display">
        ITEMS
      </div>

      <button
        v-for="(item, idx) in items"
        :key="idx"
        @click="item.count > 0 ? $emit('action', 'item', item) : null"
        @mouseenter="$emit('hover-sound')"
        class="w-full text-right px-6 py-3 border-r-4 transition-all clip-rect-left"
        :class="[
          item.count > 0
            ? 'bg-black/80 border-blue-500 hover:bg-blue-900/50 hover:border-white text-white hover:-translate-x-4 cursor-pointer'
            : 'bg-gray-900/80 border-gray-700 text-gray-500 cursor-not-allowed opacity-60'
        ]"
      >
        {{ item.name }} <span class="text-xs text-blue-300 ml-2">x{{ item.count }}</span>
      </button>

      <button
        @click="$emit('switch-menu', 'main')"
        @mouseenter="$emit('hover-sound')"
        class="mt-4 text-gray-400 hover:text-white font-bold italic transition-colors"
      >
        BACK
      </button>
    </div>

    <!-- Sub Menu: Talk -->
    <div
      v-else-if="currentMenu === 'talk'"
      class="relative w-96 min-h-[300px] flex flex-col gap-2 items-end animate-slide-in-right"
    >
      <div
        class="text-3xl font-black italic text-green-400 mb-4 drop-shadow-glow font-display flex items-center gap-2"
      >
        <MessageSquare class="w-8 h-8" />
        PERSUASION
      </div>

      <div class="w-full bg-black/80 border-2 border-green-500 p-4 relative">
        <textarea
          v-model="talkInputModel"
          placeholder="说点什么来动摇对方..."
          class="w-full h-32 bg-transparent !text-yellow-400 caret-yellow-400 font-bold resize-none outline-none font-sans text-lg placeholder:text-gray-500 drop-shadow-md"
          :disabled="isProcessingTalk"
          @keydown.enter.prevent="$emit('handle-talk')"
        ></textarea>

        <div
          v-if="isProcessingTalk"
          class="absolute inset-0 bg-black/50 flex items-center justify-center"
        >
          <span class="text-green-400 animate-pulse font-bold">思考中...</span>
        </div>
      </div>

      <div class="flex gap-4 w-full justify-end mt-2 items-center">
        <div
          v-if="playerPPoints < 15"
          class="text-red-500 text-xs font-bold bg-black/50 px-2 py-1 rounded border border-red-500/50"
        >
          需要 15 P 点
        </div>
        <button
          @click="$emit('handle-talk')"
          :disabled="!talkInputModel.trim() || isProcessingTalk || playerPPoints < 15"
          class="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold transition-colors clip-rect-left"
        >
          <Send class="w-4 h-4" />
          SEND <span class="text-xs ml-1 opacity-90 font-mono">(15P)</span>
        </button>
      </div>

      <button
        @click="$emit('switch-menu', 'main')"
        @mouseenter="$emit('hover-sound')"
        class="mt-4 text-gray-400 hover:text-white font-bold italic transition-colors"
      >
        BACK
      </button>
    </div>

    <!-- Sub Menu: Special -->
    <div
      v-else-if="currentMenu === 'special'"
      class="relative w-80 min-h-[300px] flex flex-col gap-2 items-end animate-slide-in-right"
    >
      <div class="text-3xl font-black italic text-yellow-400 mb-4 drop-shadow-glow font-display">
        SPECIAL
      </div>
      <div class="w-full h-[300px] overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-2">
        <button
          v-for="skill in specialSkills"
          :key="skill.id"
          @click="$emit('special-action', skill)"
          @mouseenter="$emit('hover-sound')"
          class="w-full text-right px-6 py-3 border-r-4 transition-all clip-rect-left flex flex-col items-end group"
          :class="[
            canAffordSkill(skill)
              ? `bg-black/80 ${getSkillThemeClasses(skill.theme).border} ${getSkillThemeClasses(skill.theme).hoverBg} hover:border-white text-white hover:-translate-x-4 cursor-pointer`
              : 'bg-gray-900/80 border-gray-700 text-gray-500 cursor-not-allowed opacity-60'
          ]"
        >
          <div class="flex items-center gap-2">
            <span class="font-bold italic">{{ skill.name }}</span>
            <span
              class="text-xs font-mono"
              :class="
                canAffordSkillP(skill) ? getSkillThemeClasses(skill.theme).textP : 'text-red-500'
              "
              >{{ skill.costP }}P</span
            >
            <span
              class="text-xs font-mono"
              :class="canAffordSkillAP(skill) ? 'text-blue-300' : 'text-red-500'"
              >{{ skill.costAP }}AP</span
            >
          </div>
          <div class="text-[10px] opacity-70 group-hover:opacity-100 transition-opacity">
            {{ skill.description }}
          </div>
        </button>
      </div>

      <button
        @click="$emit('switch-menu', 'main')"
        @mouseenter="$emit('hover-sound')"
        class="mt-4 text-gray-400 hover:text-white font-bold italic transition-colors"
      >
        BACK
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { MessageSquare, Send } from 'lucide-vue-next';
import type { SpellCard } from '@/types/combat';
import type { Item } from '@/types/game';

const props = defineProps<{
  currentMenu: 'main' | 'spell' | 'item' | 'talk' | 'special';
  selectionMode: boolean;
  isActing: boolean;
  phase: 'player' | 'ally' | 'enemy';
  isGameOver: boolean;
  canAttack: boolean;
  spells: SpellCard[];
  items: Item[];
  playerMp: number;
  playerPPoints: number;
  playerActionPoints: number;
  isProcessingTalk: boolean;
  talkInput: string;
  specialSkills: Array<{
    id: string;
    name: string;
    costP: number;
    costAP: number;
    description: string;
    theme: string;
  }>;
  getSpellCostFn: (spell: SpellCard) => number;
}>();

const emit = defineEmits<{
  action: [type: string, payload?: any];
  'switch-menu': [menu: 'main' | 'spell' | 'item' | 'talk' | 'special'];
  'special-action': [skill: any];
  'handle-talk': [];
  'hover-sound': [];
  'update:talkInput': [value: string];
}>();

const isMenuOpen = ref(false);
const hoveredSpell = ref<SpellCard | null>(null);

const talkInputModel = ref(props.talkInput);
// Sync with parent
import { watch } from 'vue';
watch(
  () => props.talkInput,
  (v) => {
    talkInputModel.value = v;
  }
);
watch(talkInputModel, (v) => emit('update:talkInput', v));

function getSpellCost(spell: SpellCard) {
  return props.getSpellCostFn(spell);
}

function canAffordSpell(spell: SpellCard) {
  return props.playerMp >= getSpellCost(spell);
}

function canAffordSkillP(skill: any) {
  return props.playerPPoints >= skill.costP;
}

function canAffordSkillAP(skill: any) {
  return props.playerActionPoints >= skill.costAP;
}

function canAffordSkill(skill: any) {
  return canAffordSkillP(skill) && canAffordSkillAP(skill);
}

function getSpellTypeName(type: string): string {
  const map: Record<string, string> = {
    attack: '攻击',
    buff: '增益',
    debuff: '减益',
    shield: '护盾',
    heal: '治疗'
  };
  return map[type] || '特殊';
}

function getSkillThemeClasses(theme: string) {
  const map: Record<string, any> = {
    blue: { border: 'border-cyan-500', hoverBg: 'hover:bg-cyan-900/50', textP: 'text-cyan-300' },
    red: { border: 'border-red-500', hoverBg: 'hover:bg-red-900/50', textP: 'text-red-300' },
    orange: {
      border: 'border-orange-500',
      hoverBg: 'hover:bg-orange-900/50',
      textP: 'text-orange-300'
    },
    purple: {
      border: 'border-purple-500',
      hoverBg: 'hover:bg-purple-900/50',
      textP: 'text-purple-300'
    },
    yellow: {
      border: 'border-yellow-500',
      hoverBg: 'hover:bg-yellow-900/50',
      textP: 'text-yellow-300'
    }
  };
  return map[theme] || map.yellow;
}
</script>

<style scoped>
.clip-pentagon-core {
  clip-path: polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%);
}
.clip-wedge {
  clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%);
}
.clip-rect-left {
  clip-path: polygon(10% 0, 100% 0, 100% 100%, 0% 100%);
}
.perspective-1000 {
  perspective: 1000px;
}
.transform-style-3d {
  transform-style: preserve-3d;
}
.font-display {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.animate-slide-in-right {
  animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes slideInRight {
  from {
    transform: translateX(50px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
.animate-fade-in-fast {
  animation: fadeIn 0.2s ease-out forwards;
}
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.2);
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(239, 68, 68, 0.3);
  border-radius: 3px;
}
</style>

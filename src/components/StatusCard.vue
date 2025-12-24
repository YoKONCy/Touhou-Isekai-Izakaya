<script setup lang="ts">
import { useGameStore } from '@/stores/game';
import { computed, ref } from 'vue';
import { 
  Coins, Heart, MapPin, Clock, Zap, Star, User, Shield, Package, Sparkles, X, 
  GitBranch, Lock, Check, Sword, Activity, Wind, Target, Brain, 
  Flame, Droplets, Sun, Moon, Search, HelpCircle, Camera
} from 'lucide-vue-next';
import { audioManager } from '@/services/audio';
import { TALENTS } from '@/data/talents';

import PlayerConfigModal from './PlayerConfigModal.vue';

const gameStore = useGameStore();

const emit = defineEmits<{
  (e: 'open-help', sectionId?: string): void;
}>();

const player = computed(() => gameStore.state.player);

// Player Config Modal
const showPlayerConfig = ref(false);

function openPlayerConfig() {
  showPlayerConfig.value = true;
  audioManager.playSoftClick();
}

// Talent Tree Logic
const activeTalentTab = ref<'combat' | 'knowledge'>('combat');
const selectedTalentId = ref<string | null>(null);

// Drag to scroll logic
const treeContainer = ref<HTMLElement | null>(null);
const isDragging = ref(false);
const startX = ref(0);
const startY = ref(0);
const scrollLeft = ref(0);
const scrollTop = ref(0);
const hasMoved = ref(false);
const zoomLevel = ref(1);

function handleWheel(e: WheelEvent) {
  if (!treeContainer.value) return;
  e.preventDefault();
  
  const zoomStep = 0.1;
  const minZoom = 0.4;
  const maxZoom = 2.0;
  
  if (e.deltaY < 0) {
    // Zoom in
    zoomLevel.value = Math.min(maxZoom, zoomLevel.value + zoomStep);
  } else {
    // Zoom out
    zoomLevel.value = Math.max(minZoom, zoomLevel.value - zoomStep);
  }
}

function handleMouseDown(e: MouseEvent) {
  const container = treeContainer.value;
  if (!container) return;
  isDragging.value = true;
  hasMoved.value = false;
  startX.value = e.pageX - container.offsetLeft;
  startY.value = e.pageY - container.offsetTop;
  scrollLeft.value = container.scrollLeft;
  scrollTop.value = container.scrollTop;
  container.style.cursor = 'grabbing';
}

function handleMouseMove(e: MouseEvent) {
  const container = treeContainer.value;
  if (!isDragging.value || !container) return;
  e.preventDefault();
  const x = e.pageX - container.offsetLeft;
  const y = e.pageY - container.offsetTop;
  
  // Natural dragging: move 1:1 with mouse movement
  // The scrollable area already scales with zoomLevel, so we don't need to compensate here
  const walkX = (x - startX.value) * 1.5;
  const walkY = (y - startY.value) * 1.5;
  
  if (Math.abs(walkX) > 5 || Math.abs(walkY) > 5) {
    hasMoved.value = true;
  }
  
  container.scrollLeft = scrollLeft.value - walkX;
  container.scrollTop = scrollTop.value - walkY;
}

function handleMouseUp() {
  isDragging.value = false;
  if (treeContainer.value) {
    treeContainer.value.style.cursor = 'grab';
  }
}

function handleMouseLeave() {
  isDragging.value = false;
  if (treeContainer.value) {
    treeContainer.value.style.cursor = 'grab';
  }
}

const combatTalents = computed(() => {
  return Object.values(TALENTS).filter(t => t.category === 'combat');
});

const selectedTalent = computed(() => {
  return selectedTalentId.value ? TALENTS[selectedTalentId.value] : null;
});

function handleTalentClick(talent: any) {
  if (hasMoved.value) return;
  selectedTalentId.value = talent.id;
  audioManager.playSoftClick();
}

function getTalentStatus(talent: any) {
  const unlocked = player.value.unlockedTalents || [];
  if (unlocked.includes(talent.id)) return 'unlocked';
  
  // Check prerequisites
  const prereqs = talent.prerequisites || [];
  if (prereqs.length === 0) return 'available';
  
  const allMet = prereqs.every((id: string) => unlocked.includes(id));
  
  if (allMet) return 'available';
  return 'locked';
}

function getLineStatus(fromId: string, toId: string) {
  const unlocked = player.value.unlockedTalents || [];
  // Path is active if both are unlocked
  if (unlocked.includes(fromId) && unlocked.includes(toId)) return 'active';
  // Path is "potential" if prerequisite is unlocked but child is not
  if (unlocked.includes(fromId)) return 'available';
  return 'inactive';
}

function getCurvedPath(fromNode: any, toNode: any) {
  // Calculate coordinates based on the same logic as the nodes
  const x1 = fromNode.position.x * 160 + 800 + 55; // center x (offset 800 for 1600px width)
  const y1 = fromNode.position.y * 140 + 100 + 55; // center y
  const x2 = toNode.position.x * 160 + 800 + 55; // center x
  const y2 = toNode.position.y * 140 + 100 + 55; // center y
  
  // If they are in the same column, draw a straighter line
  if (Math.abs(x1 - x2) < 5) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  
  // Use a more "tensioned" cubic bezier curve
  // Control points are adjusted based on vertical distance to prevent deep S-curves
  const distY = Math.abs(y2 - y1);
  const cpOffset = Math.min(distY * 0.5, 60); // Cap the offset for long vertical jumps
  
  return `M ${x1} ${y1} C ${x1} ${y1 + cpOffset}, ${x2} ${y2 - cpOffset}, ${x2} ${y2}`;
}

function getTalentIcon(talent: any) {
  const id = talent.id;
  if (id.includes('vitality') || id.includes('spirit')) return Activity;
  if (id.includes('strength')) return Sword;
  if (id.includes('agility') || id.includes('reflex')) return Wind;
  if (id.includes('focus') || id.includes('insight')) return Target;
  if (id.includes('guard') || id.includes('toughness') || id.includes('iron_skin')) return Shield;
  if (id.includes('meditation') || id.includes('wisdom')) return Brain;
  if (id.includes('lethal') || id.includes('burst')) return Flame;
  if (id.includes('recycling')) return Droplets;
  if (id.includes('potential')) return Sun;
  if (id.includes('fantasy_killer')) return Moon;
  return GitBranch;
}

async function handleUnlockTalent() {
  if (!selectedTalent.value) return;
  
  const success = gameStore.unlockTalent(selectedTalent.value.id, selectedTalent.value.cost);
  if (success) {
    audioManager.playLevelUp();
  } else {
    audioManager.playError();
  }
}

// Display Name: Prioritize PromptStore's metadata, fallback to GameStore
const displayName = computed(() => {
  return player.value.name || '玩家';
});

const hpPercentage = computed(() => {
  if (!player.value || !player.value.max_hp) return 0;
  return Math.min(100, Math.max(0, (player.value.hp / player.value.max_hp) * 100));
});

const mpPercentage = computed(() => {
  if (!player.value || !player.value.max_mp) return 0;
  return Math.min(100, Math.max(0, (player.value.mp / player.value.max_mp) * 100));
});

const combatLevel = computed(() => player.value.combatLevel || 1);
const combatExp = computed(() => player.value.combatExp || 0);
const combatExpPercentage = computed(() => {
  return Math.min(100, Math.max(0, (combatExp.value / 1000) * 100));
});

const reputationLabel = computed(() => {
  const val = player.value.reputation || 0;
  if (val >= 80) return '驰名天下';
  if (val >= 60) return '闻名遐迩';
  if (val >= 40) return '名声鹤起';
  if (val >= 20) return '小有名气';
  if (val >= -20) return '名不见传';
  if (val >= -50) return '恶名昭著';
  return '罄竹难书';
});

// Modals
const showItemsModal = ref(false);
const showSpellsModal = ref(false);
const showTalentTreeModal = ref(false);
const selectedItem = ref<any>(null);
const selectedSpell = ref<any>(null);

function handleOpenItems() {
  showItemsModal.value = true;
  audioManager.playPageFlip();
}

function handleOpenSpells() {
  showSpellsModal.value = true;
  audioManager.playPageFlip();
}

function handleOpenTalentTree() {
  showTalentTreeModal.value = true;
  audioManager.playPageFlip();
}

function handleSelectItem(item: any) {
  selectedItem.value = typeof item === 'object' ? item : { name: item, description: '暂无描述', type: 'unknown', count: 1 };
  audioManager.playSoftClick();
}

function handleSelectSpell(spell: any) {
  selectedSpell.value = typeof spell === 'object' ? spell : { name: spell, description: '暂无描述', cost: 0, damage: 0 };
  audioManager.playSoftClick();
}

function handleCloseItems() {
  showItemsModal.value = false;
  selectedItem.value = null;
  audioManager.playSoftClick();
}

function handleCloseSpells() {
  showSpellsModal.value = false;
  selectedSpell.value = null;
  audioManager.playSoftClick();
}

function handleCloseTalentTree() {
  showTalentTreeModal.value = false;
  audioManager.playSoftClick();
}

function handleBackToItems() {
  selectedItem.value = null;
  audioManager.playPageFlip();
}

function handleBackToSpells() {
  selectedSpell.value = null;
  audioManager.playPageFlip();
}

// Avatar Upload & Crop Logic
// Logic moved to PlayerConfigModal.vue

function getItemTypeLabel(type: string) {
  const map: Record<string, string> = {
    'material': '素材',
    'consumable': '消耗品',
    'equipment': '装备',
    'special': '特殊',
    'key_item': '关键道具'
  };
  return map[type] || '未知';
}

function getItemIconText(type: string) {
  const map: Record<string, string> = {
    'material': '材',
    'consumable': '药',
    'equipment': '装',
    'special': '特',
    'key_item': '钥'
  };
  return map[type] || '?';
}

function getSpellScopeLabel(scope: string) {
   const map: Record<string, string> = {
    'single': '单体',
    'aoe': '全体'
  };
  return map[scope] || scope;
}

function formatBuffEffect(effect: any) {
  if (effect.type === 'damage_over_time') return `每回合真实伤害 ${effect.value}`;
  if (effect.type === 'heal') return `治疗/恢复 ${effect.value}`;
  if (effect.type === 'shield') return `获得护盾 ${effect.value}`;
  
  if (effect.type === 'stat_mod') {
    const statMap: Record<string, string> = { 
      'attack': '攻击力', 
      'damage_taken': '受到伤害', 
      'defense': '防御力', 
      'dodge': '闪避率' 
    };
    const statName = statMap[effect.targetStat] || effect.targetStat;
    const val = Number(effect.value);
    const sign = val > 0 ? '+' : '';
    // Assume percentage for stat mods usually
    return `${statName} ${sign}${Math.round(val * 100)}%`;
  }
  
  if (effect.type === 'damage_reduction') return `伤害减免 ${Math.round(Number(effect.value) * 100)}%`;
  if (effect.type === 'dodge_mod') return `闪避率 ${Number(effect.value) > 0 ? '+' : ''}${Math.round(Number(effect.value) * 100)}%`;
  
  return `${effect.type}: ${effect.value}`;
}

</script>

<template>
  <div class="bg-izakaya-paper shadow-floating rounded-none p-5 space-y-5 font-sans text-izakaya-wood transition-all duration-300 border-x-4 border-y border-x-izakaya-wood/20 border-y-izakaya-wood/10 relative overflow-hidden group/card">
    <!-- Texture Overlay -->
    <div class="absolute inset-0 pointer-events-none opacity-30 bg-texture-rice-paper mix-blend-multiply"></div>
    
    <!-- Decorative Shimenawa (Simulated) -->
    <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-touhou-red/80 via-white to-touhou-red/80 opacity-50"></div>
    
    <!-- Header: Name & Identity -->
    <div class="border-b-2 border-dashed border-izakaya-wood/20 pb-3 relative z-10 flex flex-col items-center">
      <div 
        @click="openPlayerConfig"
        class="w-16 h-16 rounded-full border-4 border-izakaya-wood/10 bg-white/50 flex items-center justify-center mb-2 overflow-hidden shadow-inner cursor-pointer hover:border-touhou-red/50 transition-all group/avatar relative"
        title="点击配置玩家信息"
      >
        <img v-if="player.avatarUrl" :src="player.avatarUrl" class="w-full h-full object-cover animate-in fade-in zoom-in duration-500" />
        <User v-else class="w-8 h-8 text-touhou-red opacity-80" />
        
        <!-- Hover Overlay -->
        <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
          <Camera class="w-6 h-6 text-white" />
        </div>
      </div>
      <h2 class="text-2xl font-display font-bold flex items-center gap-2 text-izakaya-wood group-hover/card:text-touhou-red transition-colors duration-300">
        {{ displayName }}
      </h2>
      <div class="text-xs text-izakaya-wood/70 mt-2 flex gap-2">
        <span class="bg-izakaya-wood/5 border border-izakaya-wood/20 px-3 py-0.5 rounded-sm font-serif-display">{{ player.identity }}</span>
        <span class="bg-izakaya-wood/5 border border-izakaya-wood/20 px-3 py-0.5 rounded-sm font-serif-display">{{ player.clothing }}</span>
      </div>
    </div>
    
    <!-- Bars: HP & MP -->
    <div class="space-y-4 relative z-10 px-1">
      <!-- HP -->
      <div class="space-y-1.5 group/hp">
        <div class="flex justify-between text-xs font-bold font-serif-display tracking-wide">
          <span class="flex items-center gap-1 text-touhou-red group-hover/hp:scale-105 transition-transform"><Heart class="w-3.5 h-3.5 fill-current"/> 生命 (HP)</span>
          <span class="font-mono text-touhou-red">{{ player.hp }} / {{ player.max_hp }}</span>
        </div>
        <div class="w-full bg-touhou-red/10 h-3 border border-touhou-red/30 relative">
          <!-- 斜纹背景 -->
          <div class="absolute inset-0 opacity-20" style="background-image: repeating-linear-gradient(45deg, transparent, transparent 5px, #D32F2F 5px, #D32F2F 10px);"></div>
          <div class="bg-touhou-red h-full transition-all duration-500 shadow-[0_0_10px_rgba(211,47,47,0.4)] relative overflow-hidden" :style="{ width: `${hpPercentage}%` }">
             <div class="absolute inset-0 bg-white/20 animate-pulse-slow"></div>
          </div>
        </div>
      </div>
      
      <!-- MP -->
      <div class="space-y-1.5 group/mp">
        <div class="flex justify-between text-xs font-bold font-serif-display tracking-wide">
          <span class="flex items-center gap-1 text-blue-700 group-hover/mp:scale-105 transition-transform"><Zap class="w-3.5 h-3.5 fill-current"/> 灵力 (MP)</span>
          <span class="font-mono text-blue-700">{{ player.mp }} / {{ player.max_mp }}</span>
        </div>
        <div class="w-full bg-blue-100/50 h-3 border border-blue-600/30 relative">
          <!-- 斜纹背景 -->
           <div class="absolute inset-0 opacity-20" style="background-image: repeating-linear-gradient(45deg, transparent, transparent 5px, #2563EB 5px, #2563EB 10px);"></div>
          <div class="bg-blue-600 h-full transition-all duration-500 shadow-[0_0_10px_rgba(37,99,235,0.3)] relative overflow-hidden" :style="{ width: `${mpPercentage}%` }">
             <div class="absolute inset-0 bg-white/20 animate-pulse-slow"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-2 gap-y-3 gap-x-2 text-sm py-2 px-1 relative z-10">
      <div class="flex items-center gap-2 group/stat" title="金钱">
        <Coins class="w-4 h-4 text-marisa-gold group-hover/stat:rotate-12 transition-transform" />
        <span class="font-mono font-bold text-izakaya-wood">{{ player.money }}</span>
      </div>
      <div class="flex items-center gap-2 group/stat relative" title="战斗力">
        <!-- Burning Effect Background -->
        <div v-if="Number(player.power) >= 80" class="absolute -inset-3 bg-orange-500/20 rounded-full blur-md -z-10 animate-pulse pointer-events-none"></div>
        
        <Shield class="w-4 h-4 text-orange-500 group-hover/stat:scale-110 transition-transform" :class="{ 'text-red-500 animate-[bounce_2s_infinite]': Number(player.power) >= 80 }" />
        <span class="font-mono text-izakaya-wood relative" :class="{ 'text-burning': Number(player.power) >= 80 }">
          {{ player.power }}
          <!-- Flame Particles -->
          <template v-if="Number(player.power) >= 80">
             <span class="flame-particle -top-3 -left-1 opacity-70" style="animation-delay: 0s;"></span>
             <span class="flame-particle -top-2 right-0 opacity-60" style="animation-delay: 0.3s;"></span>
             <span class="flame-particle bottom-0 -right-3 opacity-80" style="animation-delay: 0.6s;"></span>
          </template>
        </span>
      </div>
      <div class="flex items-center gap-2 group/stat" title="声望">
        <Star class="w-4 h-4 text-purple-500 group-hover/stat:rotate-180 transition-transform duration-500" />
        <span class="font-mono text-izakaya-wood">{{ player.reputation }} <span class="text-xs text-izakaya-wood/60 font-serif-display">({{ reputationLabel }})</span></span>
      </div>
      <div class="flex items-center gap-2 group/stat" title="时间">
        <Clock class="w-4 h-4 text-izakaya-wood-light group-hover/stat:rotate-[360deg] transition-transform duration-700" />
        <div class="flex flex-col text-xs leading-tight">
          <span class="font-bold text-izakaya-wood">{{ player.time }}</span>
          <span class="scale-90 origin-left text-izakaya-wood/60">{{ player.date }}</span>
        </div>
      </div>
    </div>

    <!-- Combat Level / Proficiency -->
    <div class="px-2 py-1 mb-2 relative z-10 group/lvl" title="战斗熟练等级">
        <div class="flex justify-between items-center text-xs mb-1">
            <span class="font-bold text-izakaya-wood flex items-center gap-1">
                <Sparkles class="w-3.5 h-3.5 text-pink-500 group-hover/lvl:animate-spin" />
                战斗熟练度 Lv.{{ combatLevel }}
            </span>
            <span class="font-mono text-[10px] text-izakaya-wood/60">{{ combatExp }} / 1000 EXP</span>
        </div>
        <div class="w-full bg-black/5 h-1.5 rounded-full overflow-hidden border border-black/5">
            <div class="bg-gradient-to-r from-pink-400 to-purple-500 h-full transition-all duration-700 relative" :style="{ width: `${combatExpPercentage}%` }">
                 <div class="absolute inset-0 bg-white/30 animate-[shimmer_2s_infinite]"></div>
            </div>
        </div>
    </div>

    <!-- Location -->
    <div class="flex items-center gap-2 text-sm bg-white/40 border border-izakaya-wood/10 p-2.5 rounded-lg text-izakaya-wood shadow-sm relative z-10 hover:bg-white/60 transition-colors">
      <MapPin class="w-4 h-4 text-touhou-red animate-bounce" />
      <span class="font-medium font-display truncate">{{ player.location }}</span>
    </div>

    <!-- Interactive Collections -->
    <div class="space-y-2 pt-1 relative z-10">
      <div class="grid grid-cols-2 gap-2">
        <button 
          @click="handleOpenItems"
          class="flex flex-col items-center justify-center p-2.5 bg-white/40 hover:bg-white/80 hover:shadow-md rounded-xl transition-all duration-300 border border-izakaya-wood/5 hover:border-touhou-red/30 group hover:-translate-y-1"
        >
          <Package class="w-5 h-5 text-izakaya-wood/60 group-hover:text-touhou-red mb-1 transition-colors" />
          <span class="text-xs font-medium text-izakaya-wood group-hover:text-touhou-red font-display">物品栏</span>
          <span class="text-[10px] text-izakaya-wood/50">{{ player.items?.length || 0 }}</span>
        </button>

        <button 
          @click="handleOpenSpells"
          class="flex flex-col items-center justify-center p-2.5 bg-white/40 hover:bg-white/80 hover:shadow-md rounded-xl transition-all duration-300 border border-izakaya-wood/5 hover:border-marisa-gold/50 group hover:-translate-y-1"
        >
          <Sparkles class="w-5 h-5 text-izakaya-wood/60 group-hover:text-marisa-gold mb-1 transition-colors" />
          <span class="text-xs font-medium text-izakaya-wood group-hover:text-marisa-gold-dim font-display">符卡技能</span>
          <span class="text-[10px] text-izakaya-wood/50">{{ player.spell_cards?.length || 0 }}</span>
        </button>
      </div>

      <button 
        @click="handleOpenTalentTree"
        class="w-full flex items-center justify-between px-4 py-2.5 bg-white/40 hover:bg-white/80 hover:shadow-md rounded-xl transition-all duration-300 border border-izakaya-wood/5 hover:border-green-500/50 group hover:-translate-y-0.5"
      >
        <div class="flex items-center gap-3">
          <GitBranch class="w-5 h-5 text-izakaya-wood/60 group-hover:text-green-600 transition-colors" />
          <span class="text-xs font-medium text-izakaya-wood group-hover:text-green-700 font-display">技能天赋树</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-[10px] text-izakaya-wood/50">可用点数</span>
          <span class="text-xs font-bold text-green-600">{{ player.skillPoints || 0 }}</span>
        </div>
      </button>
    </div>

    <!-- Modals -->
    <!-- Item Modal -->
    <Teleport to="body">
      <div v-if="showItemsModal" class="fixed inset-0 z-[100] flex items-center justify-center bg-izakaya-wood/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div class="bg-izakaya-paper w-full max-w-md rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh] border-2 border-touhou-red/30 relative">
          <!-- Texture -->
          <div class="absolute inset-0 pointer-events-none opacity-10 bg-texture-stardust"></div>
          
          <div class="p-4 border-b border-izakaya-wood/10 flex justify-between items-center bg-marisa-gold/5 relative z-10">
            <h3 class="font-bold font-display flex items-center gap-2 text-izakaya-wood text-lg"><Package class="w-5 h-5 text-touhou-red"/> 物品清单</h3>
            <button @click="handleCloseItems" class="text-izakaya-wood/50 hover:text-touhou-red transition-colors bg-white/50 rounded-full p-1 hover:bg-white"><X class="w-5 h-5"/></button>
          </div>
          <div class="p-4 overflow-y-auto min-h-[300px] bg-white/30 relative z-10 custom-scrollbar">
            <!-- List View -->
            <div v-if="!selectedItem" class="grid grid-cols-3 gap-3">
              <div v-if="!player.items || player.items.length === 0" class="col-span-3 text-center text-izakaya-wood/50 py-8 flex flex-col items-center gap-2">
                <span class="text-3xl opacity-50">📦</span>
                <span>背包空空如也</span>
              </div>
              <div 
                v-else 
                v-for="(item, idx) in player.items" 
                :key="idx" 
                @click="handleSelectItem(item)"
                class="relative cursor-pointer group flex flex-col items-center p-3 bg-white/60 border border-izakaya-wood/10 rounded-lg text-center hover:shadow-md hover:-translate-y-0.5 transition-all hover:border-touhou-red/30 hover:bg-white/90" 
              >
                <div class="w-10 h-10 bg-marisa-gold/10 rounded-full flex items-center justify-center mb-2 text-marisa-gold-dim text-xs font-bold border border-marisa-gold/20 group-hover:scale-110 transition-transform">
                   {{ typeof item === 'object' ? getItemIconText(item.type) : '?' }}
                </div>
                <span class="text-xs font-medium line-clamp-2 text-izakaya-wood font-display">{{ typeof item === 'object' ? item.name : item }}</span>
                <span class="absolute top-1 right-1 bg-touhou-red text-white text-[10px] px-1.5 py-0.5 rounded-full shadow-sm" v-if="typeof item === 'object' && item.count > 1">x{{ item.count }}</span>
              </div>
            </div>

            <!-- Detail View -->
            <div v-else class="flex flex-col h-full animate-in slide-in-from-right-4 fade-in duration-200">
              <button @click="handleBackToItems" class="self-start mb-4 flex items-center gap-1 text-sm text-izakaya-wood/60 hover:text-touhou-red transition-colors">
                &larr; 返回列表
              </button>
              
              <div class="flex flex-col items-center p-6 bg-white/60 rounded-xl border border-izakaya-wood/10 shadow-sm relative overflow-hidden">
                 <div class="absolute inset-0 bg-touhou-red/5 pointer-events-none"></div>
                 <div class="w-16 h-16 bg-marisa-gold/10 rounded-full flex items-center justify-center mb-4 text-marisa-gold-dim text-xl font-bold shadow-sm border border-marisa-gold/20 relative z-10">
                   {{ getItemIconText(selectedItem.type) }}
                 </div>
                 <h4 class="text-xl font-bold mb-1 font-display text-izakaya-wood relative z-10">{{ selectedItem.name }}</h4>
                 <div class="flex gap-2 mb-4 relative z-10">
                    <span class="text-xs px-2 py-1 bg-izakaya-wood/10 rounded text-izakaya-wood border border-izakaya-wood/10">
                      {{ getItemTypeLabel(selectedItem.type) }}
                    </span>
                    <span v-if="selectedItem.count > 1" class="text-xs px-2 py-1 bg-marisa-gold/10 text-marisa-gold-dim rounded border border-marisa-gold/20">
                      持有: {{ selectedItem.count }}
                    </span>
                 </div>
                 
                 <div class="w-full text-left bg-white/80 p-4 rounded-lg border border-izakaya-wood/10 mb-4 relative z-10">
                    <p class="text-sm text-izakaya-wood leading-relaxed whitespace-pre-wrap">{{ selectedItem.description || '暂无描述' }}</p>
                 </div>

                 <div v-if="selectedItem.effects" class="w-full text-left space-y-2 relative z-10">
                    <h5 class="text-xs font-bold text-izakaya-wood/60 uppercase tracking-wider">效果</h5>
                    <div class="grid grid-cols-2 gap-2">
                      <div v-for="(val, key) in selectedItem.effects" :key="key" class="text-xs p-2 bg-blue-50 text-blue-700 rounded flex justify-between border border-blue-100">
                        <span class="font-medium">{{ key }}</span>
                        <span>{{ val }}</span>
                      </div>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Spell Modal -->
    <Teleport to="body">
      <div v-if="showSpellsModal" class="fixed inset-0 z-[100] flex items-center justify-center bg-izakaya-wood/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div class="bg-izakaya-paper w-full max-w-md rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh] border-2 border-touhou-red/30 relative">
          <!-- Texture -->
          <div class="absolute inset-0 pointer-events-none opacity-10 bg-texture-stardust"></div>
          
          <div class="p-4 border-b border-izakaya-wood/10 flex justify-between items-center bg-marisa-gold/5 relative z-10">
            <h3 class="font-bold flex items-center gap-2 font-display text-izakaya-wood text-lg"><Sparkles class="w-5 h-5 text-marisa-gold-dim"/> 符卡名录</h3>
            <button @click="handleCloseSpells" class="text-izakaya-wood/50 hover:text-touhou-red transition-colors bg-white/50 rounded-full p-1 hover:bg-white"><X class="w-5 h-5"/></button>
          </div>
          <div class="p-4 overflow-y-auto min-h-[300px] relative z-10 custom-scrollbar">
            <!-- List View -->
            <div v-if="!selectedSpell" class="grid grid-cols-1 gap-2">
              <div v-if="!player.spell_cards || player.spell_cards.length === 0" class="text-center text-izakaya-wood/50 py-8">尚未领悟任何符卡</div>
              <div 
                v-else 
                v-for="(spell, idx) in player.spell_cards" 
                :key="idx" 
                @click="handleSelectSpell(spell)"
                class="cursor-pointer p-3 bg-white/40 border border-izakaya-wood/10 rounded flex items-center gap-3 hover:bg-white/80 hover:border-marisa-gold/30 hover:shadow-md transition-all group"
              >
                <div class="w-10 h-10 rounded bg-marisa-gold/10 flex items-center justify-center text-marisa-gold-dim font-bold text-xs shrink-0 border border-marisa-gold/20 group-hover:scale-110 transition-transform">
                  <span v-if="typeof spell === 'object' && spell.type === 'attack'">攻</span>
                  <span v-else-if="typeof spell === 'object' && spell.type === 'buff'">增</span>
                  <span v-else-if="typeof spell === 'object' && spell.isUltimate" class="text-purple-500">终</span>
                  <span v-else>符</span>
                </div>
                <div class="flex-1">
                   <div class="flex items-center gap-2">
                      <div class="font-bold text-izakaya-wood font-display text-sm group-hover:text-marisa-gold-dim transition-colors">{{ typeof spell === 'object' ? spell.name : spell }}</div>
                      <div v-if="typeof spell === 'object' && spell.level" class="text-[10px] px-1 bg-marisa-gold/20 text-marisa-gold-dim rounded border border-marisa-gold/30">
                        Lv.{{ spell.level }}
                      </div>
                   </div>
                   <div v-if="typeof spell === 'object'" class="mt-1">
                      <div class="text-[10px] text-izakaya-wood/60 flex justify-between mb-0.5">
                         <span>消耗: {{ spell.cost }} MP</span>
                         <span v-if="(spell.level || 1) < 30">{{ spell.experience || 0 }} / 100 EXP</span>
                         <span v-else class="text-touhou-red font-bold">MAX</span>
                      </div>
                      <div class="w-full h-1 bg-stone-200 rounded-full overflow-hidden">
                         <div 
                           class="h-full bg-gradient-to-r from-marisa-gold to-marisa-gold-dim transition-all duration-500"
                           :style="{ width: `${(spell.level || 1) >= 30 ? 100 : (spell.experience || 0)}%` }"
                         ></div>
                      </div>
                   </div>
                </div>
                <div class="text-xs text-izakaya-wood/30 group-hover:translate-x-1 transition-transform">&rarr;</div>
              </div>
            </div>

            <!-- Detail View -->
            <div v-else class="flex flex-col h-full animate-in slide-in-from-right-4 fade-in duration-200">
              <button @click="handleBackToSpells" class="self-start mb-4 flex items-center gap-1 text-sm text-izakaya-wood/60 hover:text-touhou-red transition-colors">
                &larr; 返回列表
              </button>
              
              <div class="flex flex-col items-center p-6 bg-white/60 rounded-xl border border-izakaya-wood/10 shadow-sm relative overflow-hidden">
                 <div class="absolute inset-0 bg-marisa-gold/5 pointer-events-none"></div>
                 <div class="w-16 h-16 bg-marisa-gold/10 rounded-full flex items-center justify-center mb-4 text-marisa-gold-dim text-xl font-bold shadow-sm relative z-10 border border-marisa-gold/20">
                   符
                 </div>
                 <h4 class="text-xl font-bold mb-1 font-display text-izakaya-wood relative z-10">{{ selectedSpell.name }}</h4>
                 
                 <!-- Level & Experience -->
                 <div class="w-full max-w-[200px] mb-4 relative z-10">
                    <div class="flex justify-between items-end mb-1">
                       <span class="text-xs font-bold text-izakaya-wood/70">等级 {{ selectedSpell.level || 1 }}</span>
                       <span class="text-[10px] text-izakaya-wood/50" v-if="(selectedSpell.level || 1) < 30">
                          {{ selectedSpell.experience || 0 }} / 100 EXP
                       </span>
                       <span class="text-[10px] text-touhou-red font-bold" v-else>MAX LEVEL</span>
                    </div>
                    <div class="w-full h-1.5 bg-stone-200 rounded-full overflow-hidden shadow-inner">
                       <div 
                         class="h-full bg-gradient-to-r from-marisa-gold to-marisa-gold-dim transition-all duration-700"
                         :style="{ width: `${(selectedSpell.level || 1) >= 30 ? 100 : (selectedSpell.experience || 0)}%` }"
                       ></div>
                    </div>
                 </div>

                 <!-- Stats Badge -->
                 <div class="flex flex-wrap justify-center gap-2 mb-4 relative z-10">
                    <span class="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded border border-blue-200">
                      消耗: {{ selectedSpell.cost }} MP
                    </span>
                    <span class="text-xs px-2 py-1 bg-red-100 text-red-700 rounded border border-red-200" v-if="selectedSpell.damage > 0">
                      威力: {{ selectedSpell.damage }}
                    </span>
                    <span class="text-xs px-2 py-1 bg-izakaya-wood/10 text-izakaya-wood rounded border border-izakaya-wood/20">
                      {{ getSpellScopeLabel(selectedSpell.scope) }}
                    </span>
                 </div>
                 
                 <div class="w-full text-left bg-white/80 p-4 rounded-lg border border-izakaya-wood/10 mb-4 relative z-10">
                    <p class="text-sm text-izakaya-wood leading-relaxed whitespace-pre-wrap">{{ selectedSpell.description || '暂无描述' }}</p>
                 </div>

                 <div v-if="selectedSpell.effects" class="w-full text-left space-y-2 relative z-10">
                    <h5 class="text-xs font-bold text-izakaya-wood/60 uppercase tracking-wider">附加效果</h5>
                    <div class="grid grid-cols-2 gap-2">
                      <div v-for="(val, key) in selectedSpell.effects" :key="key" class="text-xs p-2 bg-purple-50 text-purple-700 rounded flex justify-between border border-purple-100">
                        <span class="font-medium">{{ key }}</span>
                        <span>{{ val }}</span>
                      </div>
                    </div>
                 </div>

                 <div v-if="selectedSpell.buffDetails" class="w-full text-left space-y-2 relative z-10 mt-2">
                    <h5 class="text-xs font-bold text-izakaya-wood/60 uppercase tracking-wider">技能效果详情</h5>
                    <div class="bg-purple-50 rounded border border-purple-100 p-3 text-xs space-y-2 shadow-sm">
                       <div class="flex justify-between items-center border-b border-purple-200 pb-2">
                          <span class="font-bold text-purple-800 text-sm">{{ selectedSpell.buffDetails.name }}</span>
                          <span class="text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded text-[10px] border border-purple-200">
                             {{ selectedSpell.buffDetails.duration === 1 ? '即时/单回合' : `持续 ${selectedSpell.buffDetails.duration} 回合` }}
                          </span>
                       </div>
                       <div class="space-y-1.5 pt-1">
                          <div v-for="(eff, i) in selectedSpell.buffDetails.effects" :key="i" class="flex items-start gap-2 text-purple-700">
                             <span class="w-1.5 h-1.5 bg-purple-400 rounded-full mt-1.5 shrink-0"></span>
                             <span class="leading-relaxed">{{ formatBuffEffect(eff) }}</span>
                          </div>
                       </div>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Talent Tree Modal -->
    <Teleport to="body">
      <div v-if="showTalentTreeModal" class="fixed inset-0 z-[100] flex items-center justify-center bg-izakaya-wood/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div class="bg-izakaya-paper w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden flex flex-col h-[85vh] border-2 border-green-500/30 relative">
          <!-- Texture -->
          <div class="absolute inset-0 pointer-events-none opacity-10 bg-texture-stardust"></div>
          
          <!-- Header -->
          <div class="p-4 border-b border-izakaya-wood/10 flex justify-between items-center bg-green-500/5 relative z-10">
            <div class="flex items-center gap-4">
               <h3 class="font-bold font-display flex items-center gap-2 text-izakaya-wood text-lg"><GitBranch class="w-5 h-5 text-green-600"/> 技能天赋树</h3>
               
               <!-- Tabs -->
               <div class="flex bg-white/40 p-1 rounded-lg border border-izakaya-wood/10">
                  <button 
                    @click="activeTalentTab = 'combat'"
                    class="px-3 py-1 text-xs font-bold rounded-md transition-all"
                    :class="activeTalentTab === 'combat' ? 'bg-green-600 text-white shadow-sm' : 'text-izakaya-wood/60 hover:text-green-600'"
                  >
                    武炼极意
                  </button>
                  <button 
                    @click="activeTalentTab = 'knowledge'"
                    class="px-3 py-1 text-xs font-bold rounded-md transition-all"
                    :class="activeTalentTab === 'knowledge' ? 'bg-blue-600 text-white shadow-sm' : 'text-izakaya-wood/60 hover:text-blue-600'"
                  >
                    森罗万象
                  </button>
               </div>
            </div>
            
            <div class="flex items-center gap-4">
               <div class="flex items-center gap-2 bg-green-100 px-3 py-1 rounded-full border border-green-200">
                  <span class="text-xs text-green-800 font-medium">可用点数</span>
                  <span class="font-mono font-bold text-green-700">{{ player.skillPoints || 0 }}</span>
               </div>
               <button 
                  @click="emit('open-help', 'talent-tree')" 
                  class="text-izakaya-wood/50 hover:text-touhou-red transition-colors bg-white/50 rounded-full p-1.5 hover:bg-white"
                  title="帮助与引导"
               >
                  <HelpCircle class="w-5 h-5"/>
               </button>
               <button @click="handleCloseTalentTree" class="text-izakaya-wood/50 hover:text-touhou-red transition-colors bg-white/50 rounded-full p-1.5 hover:bg-white"><X class="w-5 h-5"/></button>
            </div>
          </div>
          
          <div class="flex-1 flex overflow-hidden relative z-10 bg-white/30">
             <!-- Zoom Indicator (Fixed relative to viewport) -->
             <div class="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-white/90 backdrop-blur-md px-4 py-1.5 rounded-full border border-izakaya-wood/20 shadow-md pointer-events-none transition-opacity duration-300">
                <Search class="w-3.5 h-3.5 text-izakaya-wood/60" />
                <span class="text-xs font-mono font-bold text-izakaya-wood/80">{{ Math.round(zoomLevel * 100) }}%</span>
             </div>

             <!-- Tree View (Left/Center) -->
             <div 
               ref="treeContainer"
               class="flex-1 overflow-auto custom-scrollbar relative p-8 bg-izakaya-paper/50 cursor-grab active:cursor-grabbing select-none group"
               @mousedown="handleMouseDown"
               @mousemove="handleMouseMove"
               @mouseup="handleMouseUp"
               @mouseleave="handleMouseLeave"
               @wheel.prevent="handleWheel"
             >
                <!-- Scaling Wrapper: 
                     1. Outer div expands to the scaled size to ensure scrollbars work correctly 
                     2. Inner div uses transform: scale and origin: 0 0 for performance
                -->
                <div 
                  class="relative mx-auto" 
                  :style="{ 
                    width: `${1600 * zoomLevel}px`, 
                    height: `${1200 * zoomLevel}px`,
                    minWidth: '100%'
                  }"
                >
                   <div 
                     class="absolute top-0 left-0 transition-transform duration-200 ease-out origin-top-left" 
                     :style="{ 
                       width: '1600px', 
                       height: '1200px',
                       willChange: 'transform',
                       transform: `scale(${zoomLevel})`
                     }"
                   >
                      
                      <!-- Web Background Effect (Optimized) -->
                      <div class="absolute inset-0 pointer-events-none opacity-[0.02] overflow-hidden">
                         <svg width="100%" height="100%" style="will-change: transform;">
                            <defs>
                               <pattern id="hexagons" width="50" height="43.4" patternUnits="userSpaceOnUse" patternTransform="scale(2)">
                                  <path d="M25 0 L50 14.4 L50 43.4 L25 57.8 L0 43.4 L0 14.4 Z" fill="none" stroke="currentColor" stroke-width="1" class="text-izakaya-wood" />
                               </pattern>
                            </defs>
                            <rect width="100%" height="100%" fill="url(#hexagons)" />
                         </svg>
                      </div>

                      <!-- Connecting Lines (Curved Paths) -->
                      <svg class="absolute inset-0 w-full h-full pointer-events-none z-0" style="will-change: transform;">
                         <template v-for="talent in (activeTalentTab === 'combat' ? combatTalents : [])" :key="'lines-' + talent.id">
                            <template v-for="prereqId in talent.prerequisites" :key="prereqId">
                              <path 
                                v-if="TALENTS[prereqId]"
                                :d="getCurvedPath(TALENTS[prereqId], talent)"
                                fill="none"
                                stroke="currentColor" 
                                :stroke-width="getLineStatus(prereqId, talent.id) === 'active' ? 3 : (getLineStatus(prereqId, talent.id) === 'available' ? 2 : 1.5)"
                                :class="{
                                   'text-green-500/60 transition-colors duration-500': getLineStatus(prereqId, talent.id) === 'active',
                                   'text-green-500/20': getLineStatus(prereqId, talent.id) === 'available',
                                   'text-izakaya-wood/5': getLineStatus(prereqId, talent.id) === 'inactive'
                                }"
                                :style="getLineStatus(prereqId, talent.id) === 'active' ? 'filter: drop-shadow(0 0 5px rgba(34, 197, 94, 0.4));' : ''"
                              />
                            </template>
                         </template>
                      </svg>

                      <!-- Nodes -->
                      <div 
                         v-for="talent in (activeTalentTab === 'combat' ? combatTalents : [])" 
                         :key="talent.id"
                         class="talent-node absolute w-[110px] h-[110px] flex flex-col items-center justify-center p-3 transition-transform cursor-pointer z-10"
                         :class="{
                            'is-unlocked': getTalentStatus(talent) === 'unlocked',
                            'is-available': getTalentStatus(talent) === 'available',
                            'is-locked': getTalentStatus(talent) === 'locked',
                            'is-selected': selectedTalentId === talent.id
                         }"
                         :style="{ 
                           transform: `translate(${talent.position.x * 160 + 800}px, ${talent.position.y * 140 + 100}px)`,
                           willChange: 'transform'
                         }"
                         @click="handleTalentClick(talent)"
                      >
                      <!-- Hexagonal Shape via Clip-path -->
                      <div class="absolute inset-0 bg-current opacity-10 rounded-xl transform rotate-45 scale-90 border-2 border-transparent transition-transform duration-300 node-bg"></div>
                      
                      <div class="relative z-10 flex flex-col items-center text-center">
                        <div class="w-8 h-8 mb-1.5 flex items-center justify-center rounded-full bg-white/50 shadow-inner">
                           <component 
                              :is="getTalentIcon(talent)" 
                              class="w-4 h-4"
                              :class="getTalentStatus(talent) === 'unlocked' ? 'text-green-600' : 'text-izakaya-wood/40'"
                           />
                        </div>
                        <div class="text-[10px] font-bold mb-0.5 leading-tight line-clamp-2 px-1">{{ talent.name }}</div>
                        <div class="flex items-center gap-1 text-[8px] font-mono opacity-60">
                           <span v-if="getTalentStatus(talent) === 'unlocked'" class="flex items-center"><Check class="w-2.5 h-2.5"/></span>
                           <span v-else>{{ talent.cost }}P</span>
                        </div>
                      </div>

                      <!-- Connection Points (Visual only) -->
                      <div v-if="talent.prerequisites.length > 0" class="absolute -top-1 w-2 h-2 rounded-full bg-current opacity-40"></div>
                   </div>
                   
                   <div v-if="activeTalentTab === 'knowledge'" class="flex flex-col items-center justify-center w-full h-full text-izakaya-wood/40">
                      <Lock class="w-12 h-12 mb-2"/>
                      <span>森罗万象板块尚未开放</span>
                   </div>
                   </div>
                </div>
             </div>
             
             <!-- Sidebar Info (Right) -->
             <div class="w-64 bg-white/60 border-l border-izakaya-wood/10 p-4 flex flex-col shadow-xl backdrop-blur-sm z-20">
                <div v-if="selectedTalent" class="animate-in slide-in-from-right-4 fade-in duration-200">
                   <h4 class="text-xl font-bold text-izakaya-wood font-display mb-1">{{ selectedTalent.name }}</h4>
                   <div class="flex gap-2 mb-4">
                      <span 
                        class="text-xs px-2 py-0.5 rounded border"
                        :class="getTalentStatus(selectedTalent) === 'unlocked' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-izakaya-wood/10 text-izakaya-wood/60 border-izakaya-wood/20'"
                      >
                         {{ getTalentStatus(selectedTalent) === 'unlocked' ? '已掌握' : (getTalentStatus(selectedTalent) === 'available' ? '可学习' : '未解锁') }}
                      </span>
                      <span class="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 border border-yellow-200 rounded">
                         消耗: {{ selectedTalent.cost }} 点
                      </span>
                   </div>
                   
                   <div class="bg-white/50 p-3 rounded-lg border border-izakaya-wood/10 mb-4 min-h-[80px]">
                      <p class="text-sm text-izakaya-wood leading-relaxed">{{ selectedTalent.description }}</p>
                   </div>
                   
                   <!-- Prerequisites Section -->
                   <div v-if="selectedTalent.prerequisites.length > 0" class="mb-6">
                      <div class="text-[10px] uppercase tracking-wider text-izakaya-wood/40 font-bold mb-2">前置需求</div>
                      <div class="flex flex-wrap gap-1.5">
                         <div 
                           v-for="prereqId in selectedTalent.prerequisites" 
                           :key="prereqId"
                           class="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border transition-colors"
                           :class="{
                             'bg-green-50 text-green-700 border-green-200': player.unlockedTalents?.includes(prereqId),
                             'bg-red-50 text-red-700 border-red-200': !player.unlockedTalents?.includes(prereqId)
                           }"
                         >
                            <component 
                              :is="player.unlockedTalents?.includes(prereqId) ? Check : Lock" 
                              class="w-2.5 h-2.5"
                            />
                            {{ TALENTS[prereqId]?.name || '未知天赋' }}
                         </div>
                      </div>
                   </div>
                   
                   <button 
                     @click="handleUnlockTalent"
                     :disabled="getTalentStatus(selectedTalent) !== 'available' || (player.skillPoints || 0) < selectedTalent.cost"
                     class="w-full py-3 rounded-lg font-bold shadow-md transition-all flex items-center justify-center gap-2"
                     :class="{
                        'bg-gradient-to-r from-green-500 to-green-600 text-white hover:shadow-lg hover:-translate-y-0.5': getTalentStatus(selectedTalent) === 'available' && (player.skillPoints || 0) >= selectedTalent.cost,
                        'bg-gray-200 text-gray-400 cursor-not-allowed': getTalentStatus(selectedTalent) !== 'available' || (player.skillPoints || 0) < selectedTalent.cost,
                        'bg-green-100 text-green-800 border border-green-200 cursor-default shadow-none': getTalentStatus(selectedTalent) === 'unlocked'
                     }"
                   >
                      <span v-if="getTalentStatus(selectedTalent) === 'unlocked'">已掌握奥义</span>
                      <span v-else-if="getTalentStatus(selectedTalent) === 'locked'">前置未解锁</span>
                      <span v-else-if="(player.skillPoints || 0) < selectedTalent.cost">点数不足</span>
                      <span v-else>学习天赋</span>
                   </button>
                </div>
                <div v-else class="flex flex-col items-center justify-center h-full text-izakaya-wood/30 text-center">
                   <GitBranch class="w-12 h-12 mb-2 opacity-50"/>
                   <p class="text-sm">选择一个天赋节点<br>查看详情</p>
                </div>
             </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Player Config Modal -->
    <PlayerConfigModal :is-open="showPlayerConfig" @close="showPlayerConfig = false" />
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.2);
}

.talent-node.is-unlocked {
  color: #16a34a; /* green-600 */
}

.talent-node.is-available {
  color: #4b5563; /* gray-600 */
}

.talent-node.is-locked {
  color: #9ca3af; /* gray-400 */
}

.talent-node.is-selected .node-bg {
  opacity: 0.2;
  transform: rotate(45deg) scale(1.05);
  border-color: currentColor;
  box-shadow: 0 0 15px currentColor;
}

.talent-node:hover .node-bg {
  opacity: 0.15;
  transform: rotate(45deg) scale(1);
}

.talent-node.is-unlocked .node-bg {
  background-color: #dcfce7; /* green-100 */
  border-color: #22c55e; /* green-500 */
  opacity: 0.8;
}

.talent-node.is-available .node-bg {
  background-color: white;
  border-color: #d1d5db; /* gray-300 */
  opacity: 0.9;
}

.talent-node.is-locked .node-bg {
  background-color: #f3f4f6; /* gray-100 */
  border-color: #e5e7eb; /* gray-200 */
  opacity: 0.5;
  filter: grayscale(1);
}

.node-bg {
  @apply border-2;
  transition: transform 0.3s, opacity 0.3s, border-color 0.3s, box-shadow 0.3s;
  backface-visibility: hidden;
}
</style>
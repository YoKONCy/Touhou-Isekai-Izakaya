<script setup lang="ts">
import { useGameStore } from '@/stores/game';
import { usePromptStore } from '@/stores/prompt';
import { computed, ref } from 'vue';
import { Coins, Heart, MapPin, Clock, Zap, Star, User, Shield, Package, Sparkles, X } from 'lucide-vue-next';
import { audioManager } from '@/services/audio';

const gameStore = useGameStore();
const promptStore = usePromptStore();

const player = computed(() => gameStore.state.player);

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

function handleBackToItems() {
  selectedItem.value = null;
  audioManager.playPageFlip();
}

function handleBackToSpells() {
  selectedSpell.value = null;
  audioManager.playPageFlip();
}

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
      <div class="w-16 h-16 rounded-full border-4 border-izakaya-wood/10 bg-white/50 flex items-center justify-center mb-2 overflow-hidden shadow-inner">
         <User class="w-8 h-8 text-touhou-red opacity-80" />
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
      <div class="flex items-center gap-2 group/stat" title="战斗力">
        <Shield class="w-4 h-4 text-orange-500 group-hover/stat:scale-110 transition-transform" />
        <span class="font-mono text-izakaya-wood">{{ player.power }}</span>
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
                符卡熟练 Lv.{{ combatLevel }}
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
    <div class="grid grid-cols-2 gap-3 pt-1 relative z-10">
      <button 
        @click="handleOpenItems"
        class="flex flex-col items-center justify-center p-3 bg-white/40 hover:bg-white/80 hover:shadow-md rounded-xl transition-all duration-300 border border-izakaya-wood/5 hover:border-touhou-red/30 group hover:-translate-y-1"
      >
        <Package class="w-6 h-6 text-izakaya-wood/60 group-hover:text-touhou-red mb-1.5 transition-colors" />
        <span class="text-xs font-medium text-izakaya-wood group-hover:text-touhou-red font-display">物品栏</span>
        <span class="text-[10px] text-izakaya-wood/50">{{ player.items?.length || 0 }} 个物品</span>
      </button>

      <button 
        @click="handleOpenSpells"
        class="flex flex-col items-center justify-center p-3 bg-white/40 hover:bg-white/80 hover:shadow-md rounded-xl transition-all duration-300 border border-izakaya-wood/5 hover:border-marisa-gold/50 group hover:-translate-y-1"
      >
        <Sparkles class="w-6 h-6 text-izakaya-wood/60 group-hover:text-marisa-gold mb-1.5 transition-colors" />
        <span class="text-xs font-medium text-izakaya-wood group-hover:text-marisa-gold-dim font-display">符卡技能</span>
        <span class="text-[10px] text-izakaya-wood/50">{{ player.spell_cards?.length || 0 }} 张符卡</span>
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
                   <div class="font-bold text-izakaya-wood font-display text-sm group-hover:text-marisa-gold-dim transition-colors">{{ typeof spell === 'object' ? spell.name : spell }}</div>
                   <div class="text-[10px] text-izakaya-wood/60 line-clamp-1" v-if="typeof spell === 'object'">
                      消耗: {{ spell.cost }} MP
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

  </div>
</template>
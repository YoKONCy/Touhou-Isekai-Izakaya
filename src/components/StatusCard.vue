<script setup lang="ts">
import { useGameStore } from '@/stores/game';
import { computed, ref } from 'vue';
import {
  Coins,
  Heart,
  MapPin,
  Clock,
  Zap,
  Star,
  User,
  Shield,
  Package,
  Sparkles,
  X,
  GitBranch,
  Lock,
  Check,
  Sword,
  Activity,
  Wind,
  Target,
  Brain,
  Flame,
  Droplets,
  Sun,
  Moon,
  Search,
  HelpCircle,
  Camera,
  Home,
  Utensils,
  Trash2
} from 'lucide-vue-next';
import { audioManager } from '@/services/audio';
import { TALENTS } from '@/data/talents';
import { useToastStore } from '@/stores/toast';

import PlayerConfigModal from './PlayerConfigModal.vue';
import FacilityPanel from './FacilityPanel.vue';

const gameStore = useGameStore();
const toastStore = useToastStore();

const emit = defineEmits<{
  (e: 'open-help', sectionId?: string): void;
  (e: 'open-summary', turnCount: number): void;
}>();

const player = computed(() => gameStore.me);

// 玩家信息配置模态框控制喵
const showPlayerConfig = ref(false);

function openPlayerConfig() {
  showPlayerConfig.value = true;
  audioManager.playSoftClick();
}

defineExpose({
  openPlayerConfig,
  handleOpenItems,
  handleOpenTalentTree,
  handleOpenSpells,
  handleOpenRecipes,
  handleOpenFacility
}); // 这里是暴露给外层调用的接口喵 (Expose) 喵

// 技能等级与天赋树逻辑 (思维导图式交互 - Talent Tree Logic)喵
const activeTalentTab = ref<'combat' | 'knowledge'>('combat');
const selectedTalentId = ref<string | null>(null);

// 画布拖拽滚动逻辑 (交互增强 - Drag to scroll logic)喵
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

  const zoomStep = 0.1; // 缩放步长 喵
  const minZoom = 0.4; // 最小缩放比例 喵
  const maxZoom = 2.0; // 最大缩放比例 喵

  if (e.deltaY < 0) {
    // 放大画布 (Zoom in) 喵
    zoomLevel.value = Math.min(maxZoom, zoomLevel.value + zoomStep);
  } else {
    // 缩小画布 (Zoom out) 喵
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

  // 自然拖拽体验：物理移动与滑鼠同步 (平滑位移 - Natural dragging)喵
  // 滚动区域已随缩放比例自适应，此处无需额外补偿喵
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

// 适配行动端的触摸事件处理器 (跨端交互 - Touch event handlers)喵
function handleTouchStart(e: TouchEvent) {
  const container = treeContainer.value;
  if (!container || !e.touches[0]) return;
  isDragging.value = true;
  hasMoved.value = false;
  const touch = e.touches[0];
  startX.value = touch.pageX - container.offsetLeft;
  startY.value = touch.pageY - container.offsetTop;
  scrollLeft.value = container.scrollLeft;
  scrollTop.value = container.scrollTop;
}

function handleTouchMove(e: TouchEvent) {
  const container = treeContainer.value;
  if (!isDragging.value || !container || !e.touches[0]) return;
  e.preventDefault();
  const touch = e.touches[0];
  const x = touch.pageX - container.offsetLeft;
  const y = touch.pageY - container.offsetTop;

  const walkX = (x - startX.value) * 1.5;
  const walkY = (y - startY.value) * 1.5;

  if (Math.abs(walkX) > 5 || Math.abs(walkY) > 5) {
    hasMoved.value = true;
  }

  container.scrollLeft = scrollLeft.value - walkX;
  container.scrollTop = scrollTop.value - walkY;
}

function handleTouchEnd() {
  isDragging.value = false;
}

const combatTalents = computed(() => {
  return Object.values(TALENTS).filter((t) => t.category === 'combat');
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

  // 校验学习前置条件 (Check prerequisites) 喵
  const prereqs = talent.prerequisites || [];
  if (prereqs.length === 0) return 'available';

  const allMet = prereqs.every((id: string) => unlocked.includes(id));

  if (allMet) return 'available';
  return 'locked';
}

function getLineStatus(fromId: string, toId: string) {
  const unlocked = player.value.unlockedTalents || [];
  // 若两端节点均已解锁，则连线呈激活态 (Path is active) 喵
  if (unlocked.includes(fromId) && unlocked.includes(toId)) return 'active';
  // 若仅前置节点解锁，则连线呈待选态 (Potential) 喵
  if (unlocked.includes(fromId)) return 'available';
  return 'inactive';
}

function getCurvedPath(fromNode: any, toNode: any) {
  // Calculate coordinates based on the same logic as the nodes
  // 根据节点位置计算对应的画布坐标 喵
  const x1 = fromNode.position.x * 160 + 800 + 55; // 起点中心 X (基于 1600 像素总宽度偏移) 喵
  const y1 = fromNode.position.y * 140 + 100 + 55; // 起点中心 Y 喵
  const x2 = toNode.position.x * 160 + 800 + 55; // 终点中心 X 喵
  const y2 = toNode.position.y * 140 + 100 + 55; // 终点中心 Y 喵

  // 若起始点位于同一垂线，则绘制直线以增强秩序感 喵
  if (Math.abs(x1 - x2) < 5) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  // 使用带有极性拉力的三次贝塞尔曲线 喵
  // 根据垂向距离动态调整控制点，防止过度弯折 喵 (S-curves prevention) 喵
  const distY = Math.abs(y2 - y1);
  const cpOffset = Math.min(distY * 0.5, 60); // 限制大跨度跳跃时的弯曲幅度 喵

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

// 玩家昵称显示：优先从 PromptStore 获取元数据，若无则回退到 GameStore 的基础定义喵
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

// 各类功能菜单模态框状态管理 (各系统容器 - Modals)喵
const showItemsModal = ref(false);
const showSpellsModal = ref(false);
const showRecipesModal = ref(false);
const showTalentTreeModal = ref(false);
const showFacilityModal = ref(false);
const selectedItem = ref<any>(null);
const selectedSpell = ref<any>(null);
const selectedRecipe = ref<any>(null);

function handleOpenItems() {
  showItemsModal.value = true;
  audioManager.playPageFlip();
}

function handleOpenSpells() {
  showSpellsModal.value = true;
  audioManager.playPageFlip();
}

function handleOpenRecipes() {
  showRecipesModal.value = true;
  audioManager.playPageFlip();
}

function handleOpenTalentTree() {
  showTalentTreeModal.value = true;
  audioManager.playPageFlip();
}

function handleOpenFacility() {
  showFacilityModal.value = true;
  audioManager.playPageFlip();
}

function handleSelectItem(item: any) {
  selectedItem.value =
    typeof item === 'object'
      ? item
      : { name: item, description: '暂无详细设定喵', type: 'unknown', count: 1 };
  audioManager.playSoftClick();
}

function handleSelectSpell(spell: any) {
  selectedSpell.value =
    typeof spell === 'object'
      ? spell
      : { name: spell, description: '暂无描述', cost: 0, damage: 0 };
  audioManager.playSoftClick();
}

function handleSelectRecipe(recipe: any) {
  selectedRecipe.value = recipe;
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

function handleCloseRecipes() {
  showRecipesModal.value = false;
  selectedRecipe.value = null;
  audioManager.playSoftClick();
}

function handleCloseTalentTree() {
  showTalentTreeModal.value = false;
  audioManager.playSoftClick();
}

function handleCloseFacility() {
  showFacilityModal.value = false;
  audioManager.playSoftClick();
}

function handleBackToItems() {
  selectedItem.value = null;
  audioManager.playPageFlip();
}

function handleDiscardItem(item: any) {
  if (!item) return;
  if (confirm(`确定要丢弃 [${item.name || item.id}] 吗？\n这是不可逆转的操作，请三思喵！`)) {
    gameStore.applyAction({
      type: 'INVENTORY',
      target: 'items',
      op: 'remove',
      value: { id: item.id || item.name, count: item.count || 1 }
    });
    toastStore.addToast({ message: `已丢弃 ${item.name || item.id}`, type: 'warning' });
    audioManager.playError();
    handleBackToItems();
  }
}

function handleBackToSpells() {
  selectedSpell.value = null;
  audioManager.playPageFlip();
}

function handleBackToRecipes() {
  selectedRecipe.value = null;
  audioManager.playPageFlip();
}

// 头像上传与裁剪逻辑 (已迁移至 PlayerConfigModal.vue 统筹管理喵)
function getItemTypeLabel(type: string) {
  const map: Record<string, string> = {
    material: '素材',
    consumable: '消耗品',
    equipment: '装备',
    special: '特殊',
    key_item: '关键道具'
  };
  return map[type] || '未知';
}

function getItemIconText(type: string) {
  const map: Record<string, string> = {
    material: '材',
    consumable: '药',
    equipment: '装',
    special: '特',
    key_item: '钥'
  };
  return map[type] || '?';
}

function getSpellScopeLabel(scope: string) {
  const map: Record<string, string> = {
    single: '单体',
    aoe: '全体'
  };
  return map[scope] || scope;
}

function formatBuffEffect(effect: any) {
  if (effect.type === 'damage_over_time') return `每回合真实伤害 ${effect.value}`;
  if (effect.type === 'heal') return `治疗/恢复 ${effect.value}`;
  if (effect.type === 'shield') return `获得护盾 ${effect.value}`;

  if (effect.type === 'stat_mod') {
    const statMap: Record<string, string> = {
      attack: '攻击力',
      damage_taken: '受到伤害',
      defense: '防御力',
      dodge: '闪避率'
    };
    const statName = statMap[effect.targetStat] || effect.targetStat;
    const val = Number(effect.value);
    const sign = val > 0 ? '+' : '';
    // 通常情况下默认为百分比属性加成喵
    return `${statName} ${sign}${Math.round(val * 100)}%`;
  }

  if (effect.type === 'damage_reduction')
    return `伤害减免 ${Math.round(Number(effect.value) * 100)}%`;
  if (effect.type === 'dodge_mod')
    return `闪避率 ${Number(effect.value) > 0 ? '+' : ''}${Math.round(Number(effect.value) * 100)}%`;

  return `${effect.type}: ${effect.value}`;
}
</script>

<template>
  <div
    class="bg-izakaya-paper shadow-floating rounded-none p-5 space-y-5 font-sans text-izakaya-wood transition-all duration-300 border-x-4 border-y border-x-izakaya-wood/20 border-y-izakaya-wood/10 relative overflow-hidden group/card"
  >
    <!-- 纹理层叠装饰 (Texture Overlay)喵 -->
    <div
      class="absolute inset-0 pointer-events-none opacity-30 bg-texture-rice-paper mix-blend-multiply"
    ></div>

    <!-- 装饰性注连绳构件 (模拟注连绳 - Decorative Shimenawa)喵 -->
    <div
      class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-touhou-red/80 via-white to-touhou-red/80 opacity-50"
    ></div>

    <!-- 角色基础信息栏 (Header: Name & Identity) 喵 -->
    <div
      class="border-b-2 border-dashed border-izakaya-wood/20 pb-3 relative z-10 flex flex-col items-center"
    >
      <div
        @click="openPlayerConfig"
        class="w-16 h-16 rounded-full border-4 border-izakaya-wood/10 bg-white/50 flex items-center justify-center mb-2 overflow-hidden shadow-inner cursor-pointer hover:border-touhou-red/50 transition-all group/avatar relative"
        title="点击配置玩家信息"
      >
        <img
          v-if="player.avatarUrl"
          :src="player.avatarUrl"
          class="w-full h-full object-cover animate-in fade-in zoom-in duration-500"
        />
        <User v-else class="w-8 h-8 text-touhou-red opacity-80" />

        <!-- 头像悬浮编辑器遮罩 (Hover Overlay) 喵 -->
        <div
          class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity"
        >
          <Camera class="w-6 h-6 text-white" />
        </div>
      </div>
      <h2
        class="text-2xl font-display font-bold flex items-center gap-2 text-izakaya-wood group-hover/card:text-touhou-red transition-colors duration-300"
      >
        {{ displayName }}
      </h2>
      <div class="text-xs text-izakaya-wood/70 mt-2 flex gap-2">
        <span
          class="bg-izakaya-wood/5 border border-izakaya-wood/20 px-3 py-0.5 rounded-sm font-serif-display"
          >{{ player.identity }}</span
        >
        <span
          class="bg-izakaya-wood/5 border border-izakaya-wood/20 px-3 py-0.5 rounded-sm font-serif-display"
          >{{ player.clothing }}</span
        >
      </div>
    </div>

    <!-- 核心状态条区 (Bars: HP & MP) 喵 -->
    <div class="space-y-4 relative z-10 px-1">
      <!-- 气血状态 (HP) 喵 -->
      <div class="space-y-1.5 group/hp">
        <div class="flex justify-between text-xs font-bold font-serif-display tracking-wide">
          <span
            class="flex items-center gap-1 text-touhou-red group-hover/hp:scale-105 transition-transform"
            ><Heart class="w-3.5 h-3.5 fill-current" /> 生命 (HP)</span
          >
          <span class="font-mono text-touhou-red">{{ player.hp }} / {{ player.max_hp }}</span>
        </div>
        <div class="w-full bg-touhou-red/10 h-3 border border-touhou-red/30 relative">
          <!-- 斜纹背景 -->
          <div
            class="absolute inset-0 opacity-20"
            style="
              background-image: repeating-linear-gradient(
                45deg,
                transparent,
                transparent 5px,
                #d32f2f 5px,
                #d32f2f 10px
              );
            "
          ></div>
          <div
            class="bg-touhou-red h-full transition-all duration-500 shadow-[0_0_10px_rgba(211,47,47,0.4)] relative overflow-hidden"
            :style="{ width: `${hpPercentage}%` }"
          >
            <div class="absolute inset-0 bg-white/20 animate-pulse-slow"></div>
          </div>
        </div>
      </div>

      <!-- 灵力状态 (MP) 喵 -->
      <div class="space-y-1.5 group/mp">
        <div class="flex justify-between text-xs font-bold font-serif-display tracking-wide">
          <span
            class="flex items-center gap-1 text-blue-700 group-hover/mp:scale-105 transition-transform"
            ><Zap class="w-3.5 h-3.5 fill-current" /> 灵力 (MP)</span
          >
          <span class="font-mono text-blue-700">{{ player.mp }} / {{ player.max_mp }}</span>
        </div>
        <div class="w-full bg-blue-100/50 h-3 border border-blue-600/30 relative">
          <!-- 斜纹背景 -->
          <div
            class="absolute inset-0 opacity-20"
            style="
              background-image: repeating-linear-gradient(
                45deg,
                transparent,
                transparent 5px,
                #2563eb 5px,
                #2563eb 10px
              );
            "
          ></div>
          <div
            class="bg-blue-600 h-full transition-all duration-500 shadow-[0_0_10px_rgba(37,99,235,0.3)] relative overflow-hidden"
            :style="{ width: `${mpPercentage}%` }"
          >
            <div class="absolute inset-0 bg-white/20 animate-pulse-slow"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 基础属性网格区 (Stats Grid) 喵 -->
    <div class="grid grid-cols-2 gap-y-3 gap-x-2 text-sm py-2 px-1 relative z-10">
      <div class="flex items-center gap-2 group/stat" title="金钱">
        <Coins class="w-4 h-4 text-marisa-gold group-hover/stat:rotate-12 transition-transform" />
        <span class="font-mono font-bold text-izakaya-wood">{{ player.money }}</span>
      </div>
      <div class="flex items-center gap-2 group/stat relative" title="战斗力">
        <!-- 焚毁特效背景 (Burning Effect) 喵 -->
        <div
          v-if="Number(player.power) >= 80"
          class="absolute -inset-3 bg-orange-500/20 rounded-full blur-md -z-10 animate-pulse pointer-events-none"
        ></div>

        <Shield
          class="w-4 h-4 text-orange-500 group-hover/stat:scale-110 transition-transform"
          :class="{ 'text-red-500 animate-[bounce_2s_infinite]': Number(player.power) >= 80 }"
        />
        <span
          class="font-mono text-izakaya-wood relative"
          :class="{ 'text-burning': Number(player.power) >= 80 }"
        >
          {{ player.power }}
          <!-- 动态火焰粒子 (Flame Particles) 喵 -->
          <template v-if="Number(player.power) >= 80">
            <span
              class="flame-particle -top-3 -left-1 opacity-70"
              style="animation-delay: 0s"
            ></span>
            <span
              class="flame-particle -top-2 right-0 opacity-60"
              style="animation-delay: 0.3s"
            ></span>
            <span
              class="flame-particle bottom-0 -right-3 opacity-80"
              style="animation-delay: 0.6s"
            ></span>
          </template>
        </span>
      </div>
      <div class="flex items-center gap-2 group/stat" title="声望">
        <Star
          class="w-4 h-4 text-purple-500 group-hover/stat:rotate-180 transition-transform duration-500"
        />
        <span class="font-mono text-izakaya-wood"
          >{{ player.reputation }}
          <span class="text-xs text-izakaya-wood/60 font-serif-display"
            >({{ reputationLabel }})</span
          ></span
        >
      </div>
      <div class="flex items-center gap-2 group/stat" title="时间">
        <Clock
          class="w-4 h-4 text-izakaya-wood-light group-hover/stat:rotate-[360deg] transition-transform duration-700"
        />
        <div class="flex flex-col text-xs leading-tight">
          <span class="font-bold text-izakaya-wood">{{ player.time }}</span>
          <span class="scale-90 origin-left text-izakaya-wood/60">{{ player.date }}</span>
        </div>
      </div>
    </div>

    <!-- 战斗等级与熟练度进度条 (Combat Level / Proficiency) 喵 -->
    <div class="px-2 py-1 mb-2 relative z-10 group/lvl" title="战斗熟练等级">
      <div class="flex justify-between items-center text-xs mb-1">
        <span class="font-bold text-izakaya-wood flex items-center gap-1">
          <Sparkles class="w-3.5 h-3.5 text-pink-500 group-hover/lvl:animate-spin" />
          战斗熟练度 Lv.{{ combatLevel }}
        </span>
        <span class="font-mono text-[10px] text-izakaya-wood/60">{{ combatExp }} / 1000 EXP</span>
      </div>
      <div class="w-full bg-black/5 h-1.5 rounded-full overflow-hidden border border-black/5">
        <div
          class="bg-gradient-to-r from-pink-400 to-purple-500 h-full transition-all duration-700 relative"
          :style="{ width: `${combatExpPercentage}%` }"
        >
          <div class="absolute inset-0 bg-white/30 animate-[shimmer_2s_infinite]"></div>
        </div>
      </div>
    </div>

    <!-- 当前方位与设施管理 (Location & Facility) 喵 -->
    <div class="flex items-center gap-2 relative z-10">
      <div
        class="flex-1 flex items-center gap-2 text-sm bg-white/40 border border-izakaya-wood/10 p-2.5 rounded-lg text-izakaya-wood shadow-sm hover:bg-white/60 transition-colors truncate"
      >
        <MapPin class="w-4 h-4 text-touhou-red animate-bounce flex-shrink-0" />
        <span class="font-medium font-display truncate">{{ player.location }}</span>
      </div>

      <button
        @click="handleOpenFacility"
        class="p-2.5 bg-white/40 hover:bg-white/80 hover:shadow-md rounded-lg transition-all duration-300 border border-izakaya-wood/10 hover:border-touhou-red/30 group"
        title="查看设施"
      >
        <Home class="w-4 h-4 text-izakaya-wood/60 group-hover:text-touhou-red transition-colors" />
      </button>
    </div>

    <!-- 交互式收集要素菜单 (Interactive Collections) 喵 -->
    <div class="space-y-2 pt-1 relative z-10">
      <div class="grid grid-cols-3 gap-2">
        <button
          @click="handleOpenItems"
          class="flex flex-col items-center justify-center p-2 bg-white/40 hover:bg-white/80 hover:shadow-md rounded-lg transition-all duration-300 border border-izakaya-wood/5 hover:border-touhou-red/30 group hover:-translate-y-1 h-16"
        >
          <Package
            class="w-4 h-4 text-izakaya-wood/60 group-hover:text-touhou-red mb-1 transition-colors"
          />
          <span
            class="text-[10px] font-bold text-izakaya-wood group-hover:text-touhou-red font-display"
            >物品</span
          >
          <span class="text-[9px] text-izakaya-wood/50">{{ player.items?.length || 0 }}</span>
        </button>

        <button
          @click="handleOpenSpells"
          class="flex flex-col items-center justify-center p-2 bg-white/40 hover:bg-white/80 hover:shadow-md rounded-lg transition-all duration-300 border border-izakaya-wood/5 hover:border-marisa-gold/50 group hover:-translate-y-1 h-16"
        >
          <Sparkles
            class="w-4 h-4 text-izakaya-wood/60 group-hover:text-marisa-gold mb-1 transition-colors"
          />
          <span
            class="text-[10px] font-bold text-izakaya-wood group-hover:text-marisa-gold-dim font-display"
            >符卡</span
          >
          <span class="text-[9px] text-izakaya-wood/50">{{ player.spell_cards?.length || 0 }}</span>
        </button>

        <button
          @click="handleOpenRecipes"
          class="flex flex-col items-center justify-center p-2 bg-white/40 hover:bg-white/80 hover:shadow-md rounded-lg transition-all duration-300 border border-izakaya-wood/5 hover:border-orange-400/50 group hover:-translate-y-1 h-16"
        >
          <Utensils
            class="w-4 h-4 text-izakaya-wood/60 group-hover:text-orange-500 mb-1 transition-colors"
          />
          <span
            class="text-[10px] font-bold text-izakaya-wood group-hover:text-orange-600 font-display"
            >菜单</span
          >
          <span class="text-[9px] text-izakaya-wood/50">{{ player.recipes?.length || 0 }}</span>
        </button>
      </div>

      <button
        @click="handleOpenTalentTree"
        class="w-full flex items-center justify-between px-4 py-2.5 bg-white/40 hover:bg-white/80 hover:shadow-md rounded-xl transition-all duration-300 border border-izakaya-wood/5 hover:border-green-500/50 group hover:-translate-y-0.5"
      >
        <div class="flex items-center gap-3">
          <GitBranch
            class="w-5 h-5 text-izakaya-wood/60 group-hover:text-green-600 transition-colors"
          />
          <span
            class="text-xs font-medium text-izakaya-wood group-hover:text-green-700 font-display"
            >技能天赋树</span
          >
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-[10px] text-izakaya-wood/50">可用点数</span>
          <span class="text-xs font-bold text-green-600">{{ player.skillPoints || 0 }}</span>
        </div>
      </button>
    </div>

    <!-- 各子系统弹窗容器集群 (Modals) 喵 -->
    <!-- 背包物品陈列弹窗 (Item Modal) 喵 -->
    <Teleport to="body">
      <div
        v-if="showItemsModal"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-izakaya-wood/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      >
        <div
          class="bg-izakaya-paper w-full max-w-md rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh] border-2 border-touhou-red/30 relative"
        >
          <!-- Texture -->
          <div class="absolute inset-0 pointer-events-none opacity-10 bg-texture-stardust"></div>

          <div
            class="p-4 border-b border-izakaya-wood/10 flex justify-between items-center bg-marisa-gold/5 relative z-10"
          >
            <h3 class="font-bold font-display flex items-center gap-2 text-izakaya-wood text-lg">
              <Package class="w-5 h-5 text-touhou-red" /> 物品清单
            </h3>
            <button
              @click="handleCloseItems"
              class="text-izakaya-wood/50 hover:text-touhou-red transition-colors bg-white/50 rounded-full p-1 hover:bg-white"
            >
              <X class="w-5 h-5" />
            </button>
          </div>
          <div class="p-4 overflow-y-auto min-h-[300px] bg-white/30 relative z-10 custom-scrollbar">
            <!-- 物品列表浏览模式 (List View) 喵 -->
            <div v-if="!selectedItem" class="grid grid-cols-3 gap-3">
              <div
                v-if="!player.items || player.items.length === 0"
                class="col-span-3 text-center text-izakaya-wood/50 py-8 flex flex-col items-center gap-2"
              >
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
                <div
                  class="w-10 h-10 bg-marisa-gold/10 rounded-full flex items-center justify-center mb-2 text-marisa-gold-dim text-xs font-bold border border-marisa-gold/20 group-hover:scale-110 transition-transform"
                >
                  {{ typeof item === 'object' ? getItemIconText(item.type) : '?' }}
                </div>
                <span class="text-xs font-medium line-clamp-2 text-izakaya-wood font-display">{{
                  typeof item === 'object' ? item.name : item
                }}</span>
                <div
                  v-if="typeof item === 'object' && item.count > 1"
                  class="absolute top-1 right-1 bg-touhou-red text-white text-[10px] px-1.5 py-0.5 rounded-full shadow-sm z-20 pointer-events-none"
                >
                  x{{ item.count }}
                </div>

                <!-- 快速丢弃按钮 (仅在悬浮时显示)喵 -->
                <button
                  @click.stop="handleDiscardItem(item)"
                  class="absolute bottom-1 right-1 p-1.5 bg-red-500/80 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-sm z-30"
                  title="快速丢弃"
                >
                  <Trash2 class="w-2.5 h-2.5" />
                </button>
              </div>
            </div>

            <!-- 物品详细信息展示模式 (Detail View) 喵 -->
            <div
              v-else
              class="flex flex-col h-full animate-in slide-in-from-right-4 fade-in duration-200"
            >
              <div class="flex justify-between items-center mb-4 w-full">
                <button
                  @click="handleBackToItems"
                  class="flex items-center gap-1 text-sm text-izakaya-wood/60 hover:text-touhou-red transition-colors"
                >
                  &larr; 返回列表
                </button>
                <button
                  @click="handleDiscardItem(selectedItem)"
                  class="flex items-center gap-1 text-xs text-red-500/70 py-1 px-2 hover:bg-red-50 hover:text-red-700 rounded transition-colors group border border-transparent hover:border-red-200"
                  title="丢弃该物品"
                >
                  <Trash2 class="w-3.5 h-3.5 group-hover:-rotate-12 transition-transform" />
                  丢弃
                </button>
              </div>

              <div
                class="flex flex-col items-center p-6 bg-white/60 rounded-xl border border-izakaya-wood/10 shadow-sm relative overflow-hidden"
              >
                <div class="absolute inset-0 bg-touhou-red/5 pointer-events-none"></div>
                <div
                  class="w-16 h-16 bg-marisa-gold/10 rounded-full flex items-center justify-center mb-4 text-marisa-gold-dim text-xl font-bold shadow-sm border border-marisa-gold/20 relative z-10"
                >
                  {{ getItemIconText(selectedItem.type) }}
                </div>
                <h4 class="text-xl font-bold mb-1 font-display text-izakaya-wood relative z-10">
                  {{ selectedItem.name }}
                </h4>
                <div class="flex gap-2 mb-4 relative z-10">
                  <span
                    class="text-xs px-2 py-1 bg-izakaya-wood/10 rounded text-izakaya-wood border border-izakaya-wood/10"
                  >
                    {{ getItemTypeLabel(selectedItem.type) }}
                  </span>
                  <span
                    v-if="selectedItem.count > 1"
                    class="text-xs px-2 py-1 bg-marisa-gold/10 text-marisa-gold-dim rounded border border-marisa-gold/20"
                  >
                    持有: {{ selectedItem.count }}
                  </span>
                </div>

                <div
                  class="w-full text-left bg-white/80 p-4 rounded-lg border border-izakaya-wood/10 mb-4 relative z-10"
                >
                  <p class="text-sm text-izakaya-wood leading-relaxed whitespace-pre-wrap">
                    {{ selectedItem.description || '暂无描述' }}
                  </p>
                </div>

                <div v-if="selectedItem.effects" class="w-full text-left space-y-2 relative z-10">
                  <h5 class="text-xs font-bold text-izakaya-wood/60 uppercase tracking-wider">
                    效果
                  </h5>
                  <div class="grid grid-cols-2 gap-2">
                    <div
                      v-for="(val, key) in selectedItem.effects"
                      :key="key"
                      class="text-xs p-2 bg-blue-50 text-blue-700 rounded flex justify-between border border-blue-100"
                    >
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

    <!-- 符卡名录模态框 (Spell Modal)喵 -->
    <Teleport to="body">
      <div
        v-if="showSpellsModal"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-izakaya-wood/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      >
        <div
          class="bg-izakaya-paper w-full max-w-md rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh] border-2 border-touhou-red/30 relative"
        >
          <!-- 背景星尘纹理 (Texture)喵 -->
          <div class="absolute inset-0 pointer-events-none opacity-10 bg-texture-stardust"></div>

          <div
            class="p-4 border-b border-izakaya-wood/10 flex justify-between items-center bg-marisa-gold/5 relative z-10"
          >
            <h3 class="font-bold flex items-center gap-2 font-display text-izakaya-wood text-lg">
              <Sparkles class="w-5 h-5 text-marisa-gold-dim" /> 符卡名录
            </h3>
            <button
              @click="handleCloseSpells"
              class="text-izakaya-wood/50 hover:text-touhou-red transition-colors bg-white/50 rounded-full p-1 hover:bg-white"
            >
              <X class="w-5 h-5" />
            </button>
          </div>
          <div class="p-4 overflow-y-auto min-h-[300px] relative z-10 custom-scrollbar">
            <!-- 符卡列表视图 (List View)喵 -->
            <div v-if="!selectedSpell" class="grid grid-cols-1 gap-2">
              <div
                v-if="!player.spell_cards || player.spell_cards.length === 0"
                class="text-center text-izakaya-wood/50 py-8"
              >
                尚未领悟任何符卡
              </div>
              <div
                v-else
                v-for="(spell, idx) in player.spell_cards"
                :key="idx"
                @click="handleSelectSpell(spell)"
                class="cursor-pointer p-3 bg-white/40 border border-izakaya-wood/10 rounded flex items-center gap-3 hover:bg-white/80 hover:border-marisa-gold/30 hover:shadow-md transition-all group"
              >
                <div
                  class="w-10 h-10 rounded bg-marisa-gold/10 flex items-center justify-center text-marisa-gold-dim font-bold text-xs shrink-0 border border-marisa-gold/20 group-hover:scale-110 transition-transform"
                >
                  <span v-if="typeof spell === 'object' && spell.type === 'attack'">攻</span>
                  <span v-else-if="typeof spell === 'object' && spell.type === 'buff'">增</span>
                  <span
                    v-else-if="typeof spell === 'object' && spell.isUltimate"
                    class="text-purple-500"
                    >终</span
                  >
                  <span v-else>符</span>
                </div>
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <div
                      class="font-bold text-izakaya-wood font-display text-sm group-hover:text-marisa-gold-dim transition-colors"
                    >
                      {{ typeof spell === 'object' ? spell.name : spell }}
                    </div>
                    <div
                      v-if="typeof spell === 'object' && spell.level"
                      class="text-[10px] px-1 bg-marisa-gold/20 text-marisa-gold-dim rounded border border-marisa-gold/30"
                    >
                      Lv.{{ spell.level }}
                    </div>
                  </div>
                  <div v-if="typeof spell === 'object'" class="mt-1">
                    <div class="text-[10px] text-izakaya-wood/60 flex justify-between mb-0.5">
                      <span>消耗: {{ spell.cost }} MP</span>
                      <span v-if="(spell.level || 1) < 30"
                        >{{ spell.experience || 0 }} / 100 EXP</span
                      >
                      <span v-else class="text-touhou-red font-bold">MAX</span>
                    </div>
                    <div class="w-full h-1 bg-stone-200 rounded-full overflow-hidden">
                      <div
                        class="h-full bg-gradient-to-r from-marisa-gold to-marisa-gold-dim transition-all duration-500"
                        :style="{
                          width: `${(spell.level || 1) >= 30 ? 100 : spell.experience || 0}%`
                        }"
                      ></div>
                    </div>
                  </div>
                </div>
                <div
                  class="text-xs text-izakaya-wood/30 group-hover:translate-x-1 transition-transform"
                >
                  &rarr;
                </div>
              </div>
            </div>

            <!-- 符卡详细信息展示模式 (Detail View) 喵 -->
            <div
              v-else
              class="flex flex-col h-full animate-in slide-in-from-right-4 fade-in duration-200"
            >
              <button
                @click="handleBackToSpells"
                class="self-start mb-4 flex items-center gap-1 text-sm text-izakaya-wood/60 hover:text-touhou-red transition-colors"
              >
                &larr; 返回列表
              </button>

              <div
                class="flex flex-col items-center p-6 bg-white/60 rounded-xl border border-izakaya-wood/10 shadow-sm relative overflow-hidden"
              >
                <div class="absolute inset-0 bg-marisa-gold/5 pointer-events-none"></div>
                <div
                  class="w-16 h-16 bg-marisa-gold/10 rounded-full flex items-center justify-center mb-4 text-marisa-gold-dim text-xl font-bold shadow-sm relative z-10 border border-marisa-gold/20"
                >
                  符
                </div>
                <h4 class="text-xl font-bold mb-1 font-display text-izakaya-wood relative z-10">
                  {{ selectedSpell.name }}
                </h4>

                <!-- 等级与经验信息 (Level & EXP Info)喵 -->
                <div class="flex items-center justify-between w-full mb-1 relative z-10 px-2">
                  <span class="text-[10px] text-izakaya-wood/40 uppercase font-bold tracking-wider">
                    等级熟练度 (EXP)
                  </span>
                  <span v-if="(selectedSpell.level || 1) < 30" class="text-[10px] text-marisa-gold-dim font-bold">
                    Lv.{{ selectedSpell.level || 1 }}
                  </span>
                  <span v-else class="text-[10px] text-touhou-red font-bold">
                    已达到巅峰等级喵 (MAX)
                  </span>
                </div>
                <div class="w-full h-1.5 bg-stone-200 rounded-full overflow-hidden shadow-inner mb-4">
                  <div
                    class="h-full bg-gradient-to-r from-marisa-gold to-marisa-gold-dim transition-all duration-700"
                    :style="{
                      width: `${(selectedSpell.level || 1) >= 30 ? 100 : selectedSpell.experience || 0}%`
                    }"
                  ></div>
                </div>

              <!-- 属性徽章栏 (Stats Badge)喵 -->
              <div class="flex flex-wrap justify-center gap-2 mb-4 relative z-10">
                  <span
                    class="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded border border-blue-200"
                  >
                    消耗: {{ selectedSpell.cost }} MP
                  </span>
                  <span
                    class="text-xs px-2 py-1 bg-red-100 text-red-700 rounded border border-red-200"
                    v-if="selectedSpell.damage > 0"
                  >
                    威力: {{ selectedSpell.damage }}
                  </span>
                  <span
                    class="text-xs px-2 py-1 bg-izakaya-wood/10 text-izakaya-wood rounded border border-izakaya-wood/20"
                  >
                    {{ getSpellScopeLabel(selectedSpell.scope) }}
                  </span>
                </div>

                <div
                  class="w-full text-left bg-white/80 p-4 rounded-lg border border-izakaya-wood/10 mb-4 relative z-10"
                >
                  <p class="text-sm text-izakaya-wood leading-relaxed whitespace-pre-wrap">
                    {{ selectedSpell.description || '暂无描述' }}
                  </p>
                </div>

                <div v-if="selectedSpell.effects" class="w-full text-left space-y-2 relative z-10">
                  <h5 class="text-xs font-bold text-izakaya-wood/60 uppercase tracking-wider">
                    附加效果
                  </h5>
                  <div class="grid grid-cols-2 gap-2">
                    <div
                      v-for="(val, key) in selectedSpell.effects"
                      :key="key"
                      class="text-xs p-2 bg-purple-50 text-purple-700 rounded flex justify-between border border-purple-100"
                    >
                      <span class="font-medium">{{ key }}</span>
                      <span>{{ val }}</span>
                    </div>
                  </div>
                </div>

                <div
                  v-if="selectedSpell.buffDetails"
                  class="w-full text-left space-y-2 relative z-10 mt-2"
                >
                  <h5 class="text-xs font-bold text-izakaya-wood/60 uppercase tracking-wider">
                    技能效果详情
                  </h5>
                  <div
                    class="bg-purple-50 rounded border border-purple-100 p-3 text-xs space-y-2 shadow-sm"
                  >
                    <div class="flex justify-between items-center border-b border-purple-200 pb-2">
                      <span class="font-bold text-purple-800 text-sm">{{
                        selectedSpell.buffDetails.name
                      }}</span>
                      <span
                        class="text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded text-[10px] border border-purple-200"
                      >
                        {{
                          selectedSpell.buffDetails.duration === 1
                            ? '即时/单回合'
                            : `持续 ${selectedSpell.buffDetails.duration} 回合`
                        }}
                      </span>
                    </div>
                    <div class="space-y-1.5 pt-1">
                      <div
                        v-for="(eff, i) in selectedSpell.buffDetails.effects"
                        :key="i"
                        class="flex items-start gap-2 text-purple-700"
                      >
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

    <!-- 食谱名录展示弹窗 (Recipe Modal) 喵 -->
    <Teleport to="body">
      <div
        v-if="showRecipesModal"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-izakaya-wood/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      >
        <div
          class="bg-izakaya-paper w-full max-w-md rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh] border-2 border-orange-400/30 relative"
        >
          <!-- 背景纸纹装饰层 (Texture Overlay) 喵 -->
          <div class="absolute inset-0 pointer-events-none opacity-10 bg-texture-stardust"></div>

          <div
            class="p-4 border-b border-izakaya-wood/10 flex justify-between items-center bg-orange-500/5 relative z-10"
          >
            <h3 class="font-bold flex items-center gap-2 font-display text-izakaya-wood text-lg">
              <Utensils class="w-5 h-5 text-orange-500" /> 食谱菜单
            </h3>
            <button
              @click="handleCloseRecipes"
              class="text-izakaya-wood/50 hover:text-touhou-red transition-colors bg-white/50 rounded-full p-1 hover:bg-white"
            >
              <X class="w-5 h-5" />
            </button>
          </div>
          <div class="p-4 overflow-y-auto min-h-[300px] bg-white/30 relative z-10 custom-scrollbar">
            <!-- 食谱列表视图 (List View)喵 -->
            <div v-if="!selectedRecipe" class="grid grid-cols-1 gap-2">
              <div
                v-if="!player.recipes || player.recipes.length === 0"
                class="text-center text-izakaya-wood/50 py-8"
              >
                尚未学会任何菜品
              </div>
              <div
                v-else
                v-for="(recipe, idx) in player.recipes"
                :key="idx"
                @click="handleSelectRecipe(recipe)"
                class="cursor-pointer p-3 bg-white/60 border border-izakaya-wood/10 rounded flex items-center gap-3 hover:bg-white/90 hover:border-orange-400/30 hover:shadow-md transition-all group"
              >
                <div
                  class="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-xs shrink-0 border border-orange-200 group-hover:scale-110 transition-transform"
                >
                  食
                </div>
                <div class="flex-1">
                  <div
                    class="font-bold text-izakaya-wood font-display text-sm group-hover:text-orange-600 transition-colors"
                  >
                    {{ typeof recipe === 'object' ? recipe.name : recipe }}
                  </div>
                  <div class="flex gap-1 mt-1" v-if="typeof recipe === 'object'">
                    <span
                      v-for="tag in recipe.tags"
                      :key="tag"
                      class="text-[9px] px-1.5 py-0.5 bg-orange-50 text-orange-600 rounded-full border border-orange-100"
                    >
                      {{ tag }}
                    </span>
                  </div>
                </div>
                <div
                  class="text-xs font-mono text-orange-700 font-bold"
                  v-if="typeof recipe === 'object'"
                >
                  {{ recipe.price }}<span class="text-[10px] ml-0.5">円</span>
                </div>
              </div>
            </div>

            <!-- 菜品详细设定展示模式 (Detail View) 喵 -->
            <div
              v-else
              class="flex flex-col h-full animate-in slide-in-from-right-4 fade-in duration-200"
            >
              <button
                @click="handleBackToRecipes"
                class="self-start mb-4 flex items-center gap-1 text-sm text-izakaya-wood/60 hover:text-orange-600 transition-colors"
              >
                &larr; 返回列表
              </button>

              <div
                class="flex flex-col items-center p-6 bg-white/60 rounded-xl border border-izakaya-wood/10 shadow-sm relative overflow-hidden"
              >
                <div class="absolute inset-0 bg-orange-400/5 pointer-events-none"></div>
                <div
                  class="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4 text-orange-600 text-xl font-bold shadow-sm border border-orange-200 relative z-10"
                >
                  食
                </div>
                <h4 class="text-xl font-bold mb-1 font-display text-izakaya-wood relative z-10">
                  {{ selectedRecipe.name }}
                </h4>
                <div class="flex gap-2 mb-4 relative z-10">
                  <span
                    v-for="tag in selectedRecipe.tags"
                    :key="tag"
                    class="text-xs px-2 py-1 bg-orange-50 text-orange-600 rounded-full border border-orange-100"
                  >
                    {{ tag }}
                  </span>
                  <span
                    class="text-xs px-2 py-1 bg-izakaya-wood/5 text-izakaya-wood/60 rounded border border-izakaya-wood/10"
                  >
                    售价: {{ selectedRecipe.price }}円
                  </span>
                </div>

                <div
                  class="w-full text-left bg-white/80 p-4 rounded-lg border border-izakaya-wood/10 mb-4 relative z-10"
                >
                  <h5 class="text-xs font-bold text-izakaya-wood/60 uppercase tracking-wider mb-2">
                    菜品简介
                  </h5>
                  <p class="text-sm text-izakaya-wood leading-relaxed whitespace-pre-wrap">
                    {{ selectedRecipe.description || '暂无描述' }}
                  </p>
                </div>

                <div
                  class="w-full text-left bg-orange-50/50 p-4 rounded-lg border border-orange-100 mb-4 relative z-10"
                >
                  <h5 class="text-xs font-bold text-orange-800/60 uppercase tracking-wider mb-2">
                    制作配方/心得
                  </h5>
                  <p class="text-sm text-orange-900 leading-relaxed italic whitespace-pre-wrap">
                    {{ selectedRecipe.practice || '暂无详细做法' }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 技能天赋树全局看板 (Talent Tree Modal)喵 -->
    <Teleport to="body">
      <div
        v-if="showTalentTreeModal"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-izakaya-wood/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      >
        <div
          class="bg-izakaya-paper w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden flex flex-col h-[85vh] border-2 border-green-500/30 relative"
        >
          <!-- 装饰纹理 (Texture)喵 -->
          <div class="absolute inset-0 pointer-events-none opacity-10 bg-texture-stardust"></div>

          <!-- 顶部栏 (Header)喵 -->
          <div
            class="p-4 border-b border-izakaya-wood/10 flex justify-between items-center bg-green-500/5 relative z-10"
          >
            <div class="flex items-center gap-4">
              <h3 class="font-bold font-display flex items-center gap-2 text-izakaya-wood text-lg">
                <GitBranch class="w-5 h-5 text-green-600" /> 技能天赋树
              </h3>

              <!-- 选项卡 (Tabs)喵 -->
              <div class="flex bg-white/40 p-1 rounded-lg border border-izakaya-wood/10">
                <button
                  @click="activeTalentTab = 'combat'"
                  class="px-3 py-1 text-xs font-bold rounded-md transition-all"
                  :class="
                    activeTalentTab === 'combat'
                      ? 'bg-green-600 text-white shadow-sm'
                      : 'text-izakaya-wood/60 hover:text-green-600'
                  "
                >
                  武炼极意
                </button>
                <button
                  @click="activeTalentTab = 'knowledge'"
                  class="px-3 py-1 text-xs font-bold rounded-md transition-all"
                  :class="
                    activeTalentTab === 'knowledge'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-izakaya-wood/60 hover:text-blue-600'
                  "
                >
                  森罗万象
                </button>
              </div>
            </div>

            <div class="flex items-center gap-4">
              <div
                class="flex items-center gap-2 bg-green-100 px-3 py-1 rounded-full border border-green-200"
              >
                <span class="text-xs text-green-800 font-medium">可用点数</span>
                <span class="font-mono font-bold text-green-700">{{
                  player.skillPoints || 0
                }}</span>
              </div>
              <button
                @click="
                  handleCloseTalentTree();
                  emit('open-help', 'talent-tree');
                "
                class="text-izakaya-wood/50 hover:text-touhou-red transition-colors bg-white/50 rounded-full p-1.5 hover:bg-white"
                title="帮助与引导"
              >
                <HelpCircle class="w-5 h-5" />
              </button>
              <button
                @click="handleCloseTalentTree"
                class="text-izakaya-wood/50 hover:text-touhou-red transition-colors bg-white/50 rounded-full p-1.5 hover:bg-white"
              >
                <X class="w-5 h-5" />
              </button>
            </div>
          </div>

          <div class="flex-1 flex overflow-hidden relative z-10 bg-white/30">
            <!-- 环境缩放指示器 (Zoom Indicator) 喵 -->
            <div
              class="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-white/90 backdrop-blur-md px-4 py-1.5 rounded-full border border-izakaya-wood/20 shadow-md pointer-events-none transition-opacity duration-300"
            >
              <Search class="w-3.5 h-3.5 text-izakaya-wood/60" />
              <span class="text-xs font-mono font-bold text-izakaya-wood/80"
                >{{ Math.round(zoomLevel * 100) }}%</span
              >
            </div>

            <!-- 天赋树主画布区域 (Tree View)喵 -->
            <div
              ref="treeContainer"
              class="flex-1 overflow-auto custom-scrollbar relative p-8 bg-izakaya-paper/50 cursor-grab active:cursor-grabbing select-none group touch-none"
              @mousedown="handleMouseDown"
              @mousemove="handleMouseMove"
              @mouseup="handleMouseUp"
              @mouseleave="handleMouseLeave"
              @touchstart.passive="handleTouchStart"
              @touchmove="handleTouchMove"
              @touchend="handleTouchEnd"
              @touchcancel="handleTouchEnd"
              @wheel.prevent="handleWheel"
            >
              <!-- 缩放容器包装层：
                     1. 外层 div 随缩放比例动态扩充画布，确保滚动条逻辑精确计算喵
                     2. 内层 div 利用 CSS Transform: Scale 以榨取最佳渲染性能喵 (硬件加速方案)
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
                  <!-- 背景特效 -->
                  <div class="absolute inset-0 pointer-events-none opacity-[0.02] overflow-hidden">
                    <svg width="100%" height="100%" style="will-change: transform">
                      <defs>
                        <pattern
                          id="hexagons"
                          width="50"
                          height="43.4"
                          patternUnits="userSpaceOnUse"
                          patternTransform="scale(2)"
                        >
                          <path
                            d="M25 0 L50 14.4 L50 43.4 L25 57.8 L0 43.4 L0 14.4 Z"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1"
                            class="text-izakaya-wood"
                          />
                        </pattern>
                      </defs>
                      <rect width="100%" height="100%" fill="url(#hexagons)" />
                    </svg>
                  </div>

                  <!-- 连线 -->
                  <svg
                    class="absolute inset-0 w-full h-full pointer-events-none z-0"
                    style="will-change: transform"
                  >
                    <template
                      v-for="talent in activeTalentTab === 'combat' ? combatTalents : []"
                      :key="'lines-' + talent.id"
                    >
                      <template v-for="prereqId in talent.prerequisites" :key="prereqId">
                        <path
                          v-if="TALENTS[prereqId]"
                          :d="getCurvedPath(TALENTS[prereqId], talent)"
                          fill="none"
                          stroke="currentColor"
                          :stroke-width="
                            getLineStatus(prereqId, talent.id) === 'active'
                              ? 3
                              : getLineStatus(prereqId, talent.id) === 'available'
                                ? 2
                                : 1.5
                          "
                          :class="{
                            'text-green-500/60 transition-colors duration-500':
                              getLineStatus(prereqId, talent.id) === 'active',
                            'text-green-500/20': getLineStatus(prereqId, talent.id) === 'available',
                            'text-izakaya-wood/5': getLineStatus(prereqId, talent.id) === 'inactive'
                          }"
                          :style="
                            getLineStatus(prereqId, talent.id) === 'active'
                              ? 'filter: drop-shadow(0 0 5px rgba(34, 197, 94, 0.4));'
                              : ''
                          "
                        />
                      </template>
                    </template>
                  </svg>

                  <!-- 天赋节点 (Nodes)喵 -->
                  <div
                    v-for="talent in activeTalentTab === 'combat' ? combatTalents : []"
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
                    <!-- 利用齐次切片方案绘制的六边形节点背景 (Hexagonal Shape) 喵 -->
                    <div
                      class="absolute inset-0 bg-current opacity-10 rounded-xl transform rotate-45 scale-90 border-2 border-transparent transition-transform duration-300 node-bg"
                    ></div>

                    <div class="relative z-10 flex flex-col items-center text-center">
                      <div
                        class="w-8 h-8 mb-1.5 flex items-center justify-center rounded-full bg-white/50 shadow-inner"
                      >
                        <component
                          :is="getTalentIcon(talent)"
                          class="w-4 h-4"
                          :class="
                            getTalentStatus(talent) === 'unlocked'
                              ? 'text-green-600'
                              : 'text-izakaya-wood/40'
                          "
                        />
                      </div>
                      <div class="text-[10px] font-bold mb-0.5 leading-tight line-clamp-2 px-1">
                        {{ talent.name }}
                      </div>
                      <div class="flex items-center gap-1 text-[8px] font-mono opacity-60">
                        <span
                          v-if="getTalentStatus(talent) === 'unlocked'"
                          class="flex items-center"
                          ><Check class="w-2.5 h-2.5"
                        /></span>
                        <span v-else>{{ talent.cost }}P</span>
                      </div>
                    </div>

                    <!-- 逻辑连接锚点视觉渲染 (Connection Points) 喵 -->
                    <div
                      v-if="talent.prerequisites.length > 0"
                      class="absolute -top-1 w-2 h-2 rounded-full bg-current opacity-40"
                    ></div>
                  </div>

                  <div
                    v-if="activeTalentTab === 'knowledge'"
                    class="flex flex-col items-center justify-center w-full h-full text-izakaya-wood/40"
                  >
                    <Lock class="w-12 h-12 mb-2" />
                    <span>森罗万象板块尚未开放</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 详情信息侧边栏 (Sidebar Info)喵 -->
            <div
              class="w-64 bg-white/60 border-l border-izakaya-wood/10 p-4 flex flex-col shadow-xl backdrop-blur-sm z-20"
            >
              <div
                v-if="selectedTalent"
                class="animate-in slide-in-from-right-4 fade-in duration-200"
              >
                <h4 class="text-xl font-bold text-izakaya-wood font-display mb-1">
                  {{ selectedTalent.name }}
                </h4>
                <div class="flex gap-2 mb-4">
                  <span
                    class="text-xs px-2 py-0.5 rounded border"
                    :class="
                      getTalentStatus(selectedTalent) === 'unlocked'
                        ? 'bg-green-100 text-green-700 border-green-200'
                        : 'bg-izakaya-wood/10 text-izakaya-wood/60 border-izakaya-wood/20'
                    "
                  >
                    {{
                      getTalentStatus(selectedTalent) === 'unlocked'
                        ? '已掌握'
                        : getTalentStatus(selectedTalent) === 'available'
                          ? '可学习'
                          : '未解锁'
                    }}
                  </span>
                  <span
                    class="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 border border-yellow-200 rounded"
                  >
                    消耗: {{ selectedTalent.cost }} 点
                  </span>
                </div>

                <div
                  class="bg-white/50 p-3 rounded-lg border border-izakaya-wood/10 mb-4 min-h-[80px]"
                >
                  <p class="text-sm text-izakaya-wood leading-relaxed">
                    {{ selectedTalent.description }}
                  </p>
                </div>

                <!-- 前置条件需求面板 (Prerequisites Section)喵 -->
                <div v-if="selectedTalent.prerequisites.length > 0" class="mb-6">
                  <div
                    class="text-[10px] uppercase tracking-wider text-izakaya-wood/40 font-bold mb-2"
                  >
                    前置需求
                  </div>
                  <div class="flex flex-wrap gap-1.5">
                    <div
                      v-for="prereqId in selectedTalent.prerequisites"
                      :key="prereqId"
                      class="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border transition-colors"
                      :class="{
                        'bg-green-50 text-green-700 border-green-200':
                          player.unlockedTalents?.includes(prereqId),
                        'bg-red-50 text-red-700 border-red-200':
                          !player.unlockedTalents?.includes(prereqId)
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
                  :disabled="
                    getTalentStatus(selectedTalent) !== 'available' ||
                    (player.skillPoints || 0) < selectedTalent.cost
                  "
                  class="w-full py-3 rounded-lg font-bold shadow-md transition-all flex items-center justify-center gap-2"
                  :class="{
                    'bg-gradient-to-r from-green-500 to-green-600 text-white hover:shadow-lg hover:-translate-y-0.5':
                      getTalentStatus(selectedTalent) === 'available' &&
                      (player.skillPoints || 0) >= selectedTalent.cost,
                    'bg-gray-200 text-gray-400 cursor-not-allowed':
                      getTalentStatus(selectedTalent) !== 'available' ||
                      (player.skillPoints || 0) < selectedTalent.cost,
                    'bg-green-100 text-green-800 border border-green-200 cursor-default shadow-none':
                      getTalentStatus(selectedTalent) === 'unlocked'
                  }"
                >
                  <span v-if="getTalentStatus(selectedTalent) === 'unlocked'">已掌握奥义</span>
                  <span v-else-if="getTalentStatus(selectedTalent) === 'locked'">前置未解锁</span>
                  <span v-else-if="(player.skillPoints || 0) < selectedTalent.cost">点数不足</span>
                  <span v-else>学习天赋</span>
                </button>
              </div>
              <div
                v-else
                class="flex flex-col items-center justify-center h-full text-izakaya-wood/30 text-center"
              >
                <GitBranch class="w-12 h-12 mb-2 opacity-50" />
                <p class="text-sm">选择一个天赋节点<br />查看详情</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 玩家人物资料编辑器入口 (Player Config Modal) 喵 -->
    <PlayerConfigModal
      :is-open="showPlayerConfig"
      @close="showPlayerConfig = false"
      @open-summary="(count) => emit('open-summary', count)"
    />

    <!-- 居酒屋设施状况概览 (Facility Modal) 喵 -->
    <FacilityPanel :is-open="showFacilityModal" @close="handleCloseFacility" />
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
  border-width: 2px;
  transition:
    transform 0.3s,
    opacity 0.3s,
    border-color 0.3s,
    box-shadow 0.3s;
  backface-visibility: hidden;
}
</style>

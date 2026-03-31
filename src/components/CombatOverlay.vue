<template>
  <div v-if="showOverlay" class="fixed inset-0 z-50 font-sans overflow-hidden animate-fade-in">
    <!-- 战斗请求确认弹窗 -->
    <CombatRequestDialog
      v-if="isPending"
      :enemyNames="enemyNames"
      :isMultiplayer="gameStore.multiplayer.isMultiplayer"
      :isHost="gameStore.multiplayer.isHost"
      @start-combat="startCombat"
      @skip-combat="skipCombat"
    />

    <!-- 战斗主容器 -->
    <div
      v-else-if="isActive"
      class="absolute inset-0 bg-black text-white font-sans overflow-hidden"
    >
      <!-- 动态背景层 -->
      <div class="absolute inset-0 z-0 overflow-hidden">
        <img
          :src="currentBackground"
          class="w-full h-full object-cover opacity-50 mix-blend-normal blur-[1px] scale-105"
        />
        <div class="absolute inset-0 bg-texture-stardust opacity-10 mix-blend-multiply"></div>
        <div
          class="absolute inset-0 bg-gradient-to-br from-red-900/40 via-black/60 to-black/80 mix-blend-multiply"
        ></div>
      </div>

      <!-- 战斗开场动画 (VS界面) -->
      <CombatIntroScreen
        :show="showIntro"
        :playerName="player?.name || 'Reimu'"
        :playerSpriteUrl="getSpriteUrl('主角')"
        :enemyName="enemies[0]?.name || 'Unknown'"
        :enemySpriteUrl="getSpriteUrl(enemies[0]?.name)"
        :defaultSprite="defaultSprite"
      />

      <!-- 技能立绘切入层 (终极技能、符卡、战斗心流) -->
      <CombatCutins
        :showUltimate="showUltimateCutin"
        :ultimateData="ultimateCutinData"
        :showSkill="showSkillCutin"
        :skillData="skillCutinData"
        :showCombatFlow="showCombatFlowAnim"
        :combatFlowPhase="combatFlowPhase"
        :playerSpriteUrl="getSpriteUrl('主角')"
      />

      <!-- 第0层：底层背景 (新增空处点击取消预选动作之锚点功能喵) -->
      <div 
        class="absolute inset-0 bg-gradient-to-br from-red-900/20 via-black to-blue-900/20 z-[5]"
        :class="selectionMode && !isActing ? 'cursor-pointer' : ''"
        @click="cancelSelection"
      >
        <div class="absolute inset-0 bg-texture-stardust opacity-10 mix-blend-overlay"></div>
        <div class="absolute inset-0 overflow-hidden">
          <div
            class="absolute -left-20 top-1/2 w-[200%] h-40 bg-red-600/20 -rotate-12 blur-3xl transform-gpu animate-pulse"
          ></div>
          <div
            class="absolute -right-20 top-1/4 w-[200%] h-20 bg-blue-600/10 rotate-12 blur-2xl transform-gpu"
          ></div>
        </div>
      </div>

      <!-- 第1层：战场本体 (角色与特效实体) -->
      <div
        class="absolute inset-0 z-10 overflow-hidden pointer-events-none transition-transform duration-100"
        :class="{ 'animate-shake': isScreenShaking }"
      >
        <!-- 全局特效遮罩 -->
        <CombatEffects :activeEffect="activeEffect" />

        <!-- 己方阵营卡片 -->
        <CombatPlayerCard
          :player="player"
          :allies="allies"
          :sortedAllies="sortedAllies"
          :defaultSprite="defaultSprite"
          :getSpriteUrl="getSpriteUrl"
          :getPlayerHpStyle="getPlayerHpStyle"
          :getEffectName="getEffectName"
          @activate-ally="activateAlly"
        />

        <!-- 敌方阵营卡片 -->
        <CombatEnemyCard
          :activeEnemies="activeEnemies"
          :reserveEnemies="reserveEnemies"
          :selectionMode="selectionMode"
          :isActing="isActing"
          :phase="phase"
          :hoveredEnemyId="hoveredEnemyId"
          :defaultSprite="defaultSprite"
          :getSpriteUrl="getSpriteUrl"
          :getEnemyHpStyle="getEnemyHpStyle"
          :getEnemyEffectiveDodge="getEnemyEffectiveDodge"
          :getEffectName="getEffectName"
          @select-target="selectTarget"
          @hover-enemy="(id) => (hoveredEnemyId = id)"
        />
      </div>

      <!-- 第2层：前端 UI 控制台 -->
      <div class="absolute inset-0 z-20 pointer-events-none">
        <!-- 顶部状态信息栏 -->
        <CombatTopBar
          :turn="turn"
          :phase="phase"
          :selectionMode="selectionMode"
          :isActing="isActing"
          :isLogExpanded="isLogExpanded"
          :streamingNarrative="streamingNarrative"
          :combatLogs="combatLogs"
          :isGameOver="false"
          @toggle-log="isLogExpanded = !isLogExpanded"
          @close-combat="closeCombat"
        />

        <!-- 下部操作动作选单 -->
        <CombatActionMenu
          :currentMenu="currentMenu"
          :selectionMode="selectionMode"
          :isActing="isActing"
          :phase="phase"
          :isGameOver="isGameOver"
          :canAttack="canAttack"
          :spells="spells"
          :items="items"
          :playerMp="player?.mp || 0"
          :playerPPoints="player?.pPoints || 0"
          :playerActionPoints="player?.actionPoints ?? 2"
          :isProcessingTalk="isProcessingTalk"
          :talkInput="talkInput"
          :specialSkills="specialSkills"
          :getSpellCostFn="(spell) => getSpellCost(spell, player)"
          @action="handleAction"
          @switch-menu="switchMenu"
          @special-action="handleSpecialAction"
          @handle-talk="handleTalk"
          @hover-sound="audioManager.playHover()"
          @update:talkInput="(v) => (talkInput = v)"
        />

        <!-- 游戏结束结算大幕 -->
        <div
          v-if="showResultScreen"
          class="absolute inset-0 flex items-center justify-center z-50 pointer-events-auto transition-all duration-1000 overflow-hidden"
          :class="
            gameResult === 'win'
              ? 'bg-black/60 backdrop-blur-sm'
              : 'bg-black/90 backdrop-blur-md'
          "
        >
          <!-- 背景特效层 (Background Effects) -->
          <div
            v-if="gameResult === 'loss'"
            class="absolute inset-0 z-0 opacity-20 bg-[repeating-linear-gradient(transparent,transparent_2px,rgba(255,0,0,0.1)_2px,rgba(255,0,0,0.1)_4px)] mix-blend-color-burn"
          ></div>
          <div
            v-if="gameResult === 'loss'"
            class="absolute inset-0 z-0 bg-[radial-gradient(circle,transparent_30%,#300_100%)] opacity-80"
          ></div>

          <div
            v-if="gameResult === 'win'"
            class="absolute inset-0 z-0 bg-[radial-gradient(circle,rgba(250,204,21,0.2)_0%,transparent_60%)] animate-pulse-slow"
          ></div>

          <!-- 前景交互层 (Foreground Interaction) -->
          <div class="relative z-10 w-full max-w-6xl mx-auto flex items-center justify-center h-full">
            
            <!-- 核心大字组 (Title Group) -->
            <div 
              class="absolute flex flex-col items-center animate-title-sequence"
            >
              <div
                class="text-7xl md:text-9xl font-black italic font-display tracking-tighter"
                :class="
                  gameResult === 'win'
                    ? 'text-yellow-400 drop-shadow-[0_0_30px_rgba(234,179,8,0.8)]'
                    : 'text-red-700 drop-shadow-[0_0_30px_rgba(220,38,38,1)] pb-2 pr-4 text-transparent bg-clip-text bg-gradient-to-b from-red-600 to-red-900 border-b-2 border-red-900/50'
                "
              >
                {{ gameResult === 'win' ? '战斗胜利' : '满身疮痍' }}
              </div>
              <div
                class="mt-2 text-xl md:text-3xl font-serif font-bold tracking-[1em] uppercase"
                :class="gameResult === 'win' ? 'text-yellow-200/80' : 'text-red-500/80'"
              >
                {{ gameResult === 'win' ? 'STAGE CLEAR' : 'GAME OVER' }}
              </div>
            </div>

            <!-- 按钮动作组 (Action Buttons Group) -->
            <div 
              class="absolute flex flex-col md:flex-row gap-4 md:gap-6 animate-buttons-sequence right-8 md:right-[15%]"
            >
              <!-- 战败独有：再次挑战按钮 -->
              <button
                v-if="gameResult === 'loss'"
                @click="handleRetry"
                class="px-8 md:px-12 py-3 rounded-full font-bold tracking-widest transition-all bg-red-950/50 text-red-500 border border-red-900/50 hover:bg-red-900 hover:text-white hover:shadow-[0_0_20px_rgba(185,28,28,0.8)]"
              >
                再次挑战
              </button>

              <!-- 通用：回到故事按钮 -->
              <button
                @click="closeCombat()"
                class="px-8 md:px-12 py-3 rounded-full font-bold tracking-widest transition-all"
                :class="
                  gameResult === 'win'
                    ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/50 hover:bg-yellow-500 hover:text-white hover:shadow-[0_0_20px_rgba(234,179,8,0.6)]'
                    : 'bg-izakaya-wood/20 text-izakaya-wood/80 border border-izakaya-wood/40 hover:bg-izakaya-wood hover:text-white'
                "
              >
                回到故事
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive, onUnmounted, onMounted } from 'vue';
import type { Combatant, SpellCard, Buff, BuffEffect } from '@/types/combat';
import type { Item } from '@/types/game';
import {
  calculateDamage,
  processPersuasion,
  calculatePPointGain,
  getBaseDamage,
  getEffectiveStats
} from '@/services/combatLogic';
import { applyLifecycleHook, applyStatModifiers } from '@/services/combatModifiers';
import { useGameStore } from '@/stores/game';
import { useToastStore } from '@/stores/toast';
import { gameLoop } from '@/services/gameLoop';
import { audioManager } from '@/services/audio';
import { findBattleSprite } from '@/services/characterMapping';
import defaultSprite from '@/assets/images/battle_sprites/其他角色.png';
import { multiplayerService } from '@/services/MultiplayerService';

// 子组件导入
import CombatRequestDialog from '@/components/combat/CombatRequestDialog.vue';
import CombatIntroScreen from '@/components/combat/CombatIntroScreen.vue';
import CombatCutins from '@/components/combat/CombatCutins.vue';
import CombatEffects from '@/components/combat/CombatEffects.vue';
import CombatTopBar from '@/components/combat/CombatTopBar.vue';
import CombatActionMenu from '@/components/combat/CombatActionMenu.vue';
import CombatPlayerCard from '@/components/combat/CombatPlayerCard.vue';
import CombatEnemyCard from '@/components/combat/CombatEnemyCard.vue';

const gameStore = useGameStore();

function handleRetry() {
  emit('retry'); // 统一交给父级执行环境进行状态回滚或沙箱重启喵
}

// 监听战斗激活状态以同步（仅限主机段）
watch(
  () => gameStore.state.system.combat,
  (newCombat) => {
    if (newCombat && newCombat.isPending && (newCombat as any).tutorialMode) {
      console.log('[CombatOverlay] 教学模式检测中: 正在自动开启战斗演示喵...');
      startCombat();
    }
  },
  { immediate: true, deep: true }
);

// 监听战斗激活状态以同步（仅限主机段）
watch(
  () => gameStore.state.system.combat?.isActive,
  () => {
    if (gameStore.multiplayer.isHost && gameStore.multiplayer.isMultiplayer) {
      multiplayerService.syncHostState(gameStore.state);
    }
  }
);

// 监听战斗回合变化以同步（仅限主机段）
watch(
  () => gameStore.state.system.combat?.turn,
  () => {
    if (gameStore.multiplayer.isHost && gameStore.multiplayer.isMultiplayer) {
      multiplayerService.syncHostState(gameStore.state);
    }
  }
);

const props = defineProps<{
  visible?: boolean;
}>();
const emit = defineEmits(['close', 'combat-end', 'retry']);

// 监听外层控制组件开启的生命周期：在此强制剥离上一场残留的结算与日志状态喵！
watch(
  () => props.visible,
  (newVal, oldVal) => {
    if (newVal && !oldVal) {
      console.log('[CombatOverlay] 监听到面板重新拉起，清理战斗幽灵缓存喵');
      isGameOver.value = false;
      showResultScreen.value = false;
      gameResult.value = null;
      exitedEnemyIds.value = [];
      combatLogs.value = [];
      phase.value = 'player';
      selectionMode.value = false;
      pendingAction.value = null;
    }
  }
);

// --- BGM 背景音乐管理模块 ---
const bgmFiles = import.meta.glob(
  '/src/assets/audio/bgm/RPG_battle/**/*.{mp3,wav,ogg,flac,m4a,aac}',
  { query: '?url', import: 'default', eager: true }
) as Record<string, string>;

// --- 战斗背景图管理模块 喵 ---
const backgroundImages = import.meta.glob('/src/assets/images/battle_bg/*.{jpg,png,webp}', {
  query: '?url',
  import: 'default',
  eager: true
}) as Record<string, string>;

const currentBackground = computed(() => {
  // 尝试匹配获取玩家当前地理位置对应的战场背景素材 喵
  const location = gameStore.state.player?.location;
  console.log('[战斗界面] 背景检查 - 位置:', location);

  if (location) {
    // 优先级 1：执行文件 ID 级精确匹配（剔除文件后缀干扰项）喵
    const exactMatch = Object.keys(backgroundImages).find((path) => {
      const filename = path.split('/').pop()?.split('.')[0];
      return filename === location;
    });
    if (exactMatch) {
      console.log('[战斗界面] 找到完美契合的背景喵:', exactMatch);
      return backgroundImages[exactMatch];
    }
  }

  // 优先级 2：若无匹配则执行降级回退方案，默认博丽神社喵
  const fallback = Object.keys(backgroundImages).find((path) => path.includes('博丽神社'));
  console.log('[战斗界面] 无法精准匹配，回退至神社背景喵:', fallback);
  return fallback ? backgroundImages[fallback] : '';
});

function playCombatBgm() {
  if (!combatState.value?.bgm_suggestion) return;

  const styleKey = combatState.value.bgm_suggestion;

  // 匹配策略 A：基于 BGM 风格锚点关键字执行硬匹配（如 "常规"、"激战"）喵
  let matchingFiles = Object.keys(bgmFiles).filter((path) => path.includes(styleKey));

  // 匹配策略 B：若硬匹配失效，则执行模糊语义关键字的层次化探测 喵
  if (matchingFiles.length === 0) {
    if (styleKey.includes('轻快')) {
      matchingFiles = Object.keys(bgmFiles).filter((path) => path.includes('轻快'));
    } else if (styleKey.includes('BOSS') || styleKey.includes('Boss')) {
      matchingFiles = Object.keys(bgmFiles).filter(
        (path) => path.includes('BOSS') || path.includes('Boss')
      );
    } else if (styleKey.includes('激战')) {
      matchingFiles = Object.keys(bgmFiles).filter((path) => path.includes('激战'));
    } else if (styleKey.includes('常规') || styleKey.includes('一般')) {
      matchingFiles = Object.keys(bgmFiles).filter((path) => path.includes('常规'));
    }
  }

  if (matchingFiles.length > 0) {
    const randomFile = matchingFiles[Math.floor(Math.random() * matchingFiles.length)];
    if (randomFile) {
      const url = bgmFiles[randomFile] as string;
      if (typeof url === 'string') {
        audioManager.playBgm(url);
      }
    }
  } else {
    console.warn('[战斗界面] 风格曲库未命中喵:', styleKey);
    // 最终兜底：非指定常规风格时，强制回退至默认战斗曲目 喵
    if (styleKey !== '常规') {
      const fallbackFiles = Object.keys(bgmFiles).filter((path) => path.includes('常规'));
      if (fallbackFiles.length > 0) {
        const randomFallback = fallbackFiles[Math.floor(Math.random() * fallbackFiles.length)];
        if (randomFallback) {
          const url = bgmFiles[randomFallback] as string;
          if (typeof url === 'string') {
            audioManager.playBgm(url);
          }
        }
      }
    }
  }
}

onUnmounted(() => {
  audioManager.stopBgm();
});

onMounted(() => {
  // [架构优化] 初始化相关逻辑已移交至 GameStore.setState 以进行中心化状态清洗治理。
  window.addEventListener('mp-combat-action', handleRemoteAction as unknown as EventListener);
  window.addEventListener('mp-combat-effect', handleRemoteEffect as unknown as EventListener);
  window.addEventListener('mp-combat-log', handleRemoteLog as unknown as EventListener);
  window.addEventListener('mp-combat-popup', handleRemotePopup as unknown as EventListener);
  window.addEventListener('mp-llm-token', handleRemoteLLMToken as unknown as EventListener);
});

onUnmounted(() => {
  audioManager.stopBgm();
  window.removeEventListener('mp-combat-action', handleRemoteAction as unknown as EventListener);
  window.removeEventListener('mp-combat-effect', handleRemoteEffect as unknown as EventListener);
  window.removeEventListener('mp-combat-log', handleRemoteLog as unknown as EventListener);
  window.removeEventListener('mp-combat-popup', handleRemotePopup as unknown as EventListener);
  window.removeEventListener('mp-llm-token', handleRemoteLLMToken as unknown as EventListener);
});

// [联机] 多人同步：处理远程主机发来的 LLM 对话词流 (Token)
function handleRemoteLLMToken(e: CustomEvent) {
  const { token } = e.detail;
  if (token) {
    streamingNarrative.value += token;
    // 视觉反馈优化：当检测到词句流式输出时，自动展开日志面板以便实时查阅 喵
    if (!isLogExpanded.value) isLogExpanded.value = true;
  }
}

async function handleRemoteEffect(e: CustomEvent) {
  const data = e.detail;
  console.log('[战斗界面] 收到远程特效:', data);

  if (data.type === 'shake') {
    triggerShake(true);
  } else if (data.type === 'effect') {
    const rect = document.body.getBoundingClientRect();
    triggerEffect(
      data.effectType,
      data.xRatio * rect.width,
      data.yRatio * rect.height,
      data.extra,
      true
    );
  } else if (data.type === 'combat_flow') {
    playCombatFlowAnimation(true);
  } else if (data.type === 'ultimate_anim') {
    // 为动画播报功能组装的模拟对象 (幻影实体 - Mock Object)喵
    const mockCombatant = {
      id: data.actorId,
      name: data.charName,
      isPlayer: data.isPlayer,
      team: data.isPlayer ? 'player' : 'enemy'
      // 满足动画分发器所需的最小属性集喵
    } as any;
    playUltimateAnimation(mockCombatant, data.spellName, true);
  } else if (data.type === 'skill_anim') {
    const mockCombatant = {
      id: data.actorId,
      name: data.charName,
      isPlayer: data.isPlayer,
      team: data.isPlayer ? 'player' : 'enemy'
    } as any;
    playSkillAnimation(mockCombatant, data.spellName, data.isSpecial, true);
  }
}

async function handleRemoteLog(e: CustomEvent) {
  const data = e.detail;
  addLog(data.content, true);
}

async function handleRemotePopup(e: CustomEvent) {
  const data = e.detail;
  const target = combatState.value?.combatants.find((c) => c.id === data.targetId);
  if (target) {
    addPopup(
      { ...target, popups: getPopups(target.id) } as UICombatant,
      data.value,
      data.type,
      true
    );
  }
}

async function handleRemoteAction(e: CustomEvent) {
  const { senderId, type, payload, targetId } = e.detail;
  console.log('[战斗界面] 收到远程行动:', type, payload);

  // 定位行动发起者 (主角或敌方单位 - Actor)喵
  const actor = combatState.value?.combatants.find((c) => c.ownerId === senderId);
  if (!actor) {
    console.warn('[战斗界面] 未找到发送者的角色:', senderId);
    return;
  }

  // 在当前参战对阵名单中定位具体的受击目标实体 喵
  let target: UICombatant | undefined;
  if (targetId) {
    const found = combatState.value?.combatants.find((c) => c.id === targetId);
    if (found) {
      target = { ...found, popups: getPopups(found.id) } as UICombatant;
    }
  }

  // 激活底层的逻辑执行流水线 (Execution Pipe) 喵
  // 将行动者类型隐式断言并合并为 UICombatant 视觉实体以便分发 喵
  const uiActor = { ...actor, popups: getPopups(actor.id) } as UICombatant;

  await executeCombatLogic(uiActor, type, payload, target);
}

// 历经抽离解耦的核心战斗循环逻辑
async function executeCombatLogic(
  actor: UICombatant,
  type: string,
  payload: any,
  target?: UICombatant
) {
  if (type === 'attack' && target) {
    audioManager.playSlash();
    const rect = document.body.getBoundingClientRect();
    triggerEffect('slash', rect.width * 0.7, rect.height * 0.3);
    await sleep(200);
    audioManager.playHeavyHit();
    triggerShake();

    await executeAction(actor, target);

    // 计算并后置扣减该次动作涉及的行动点 (AP) 存量 喵
    const currentAP = actor.actionPoints !== undefined ? actor.actionPoints : 2;
    updateCombatantState(actor.id, { actionPoints: Math.max(0, currentAP - 2) });

    if (target.hp <= 0) audioManager.playShatter();
    await sleep(1500);
  } else if (type === 'spell') {
    const spell = payload as SpellCard;
    const actualCost = getSpellCost(spell, actor);

    // 扣减符卡所需灵力 (MP)
    const newMp = actor.mp - actualCost;
    actor.mp = newMp;
    updateCombatantState(actor.id, { mp: newMp });

    // 触发技能立绘与动画表现
    if (spell.isUltimate) {
      await playUltimateAnimation(actor, spell.name);
    } else {
      playSkillAnimation(actor, spell.name);
      await sleep(800);
    }

    // 步入数值计算闭环：覆盖伤害推演、护盾消耗与增益回写 喵
    const rect = document.body.getBoundingClientRect();

    if (spell.scope === 'aoe') {
      // 执行全场范围覆盖物理打击 (AOE) 结算逻辑 喵
      if (spell.isUltimate) {
        audioManager.playSpellCastAoE();
        triggerEffect('ultimate_impact', rect.width * 0.5, rect.height * 0.5);
        setTimeout(() => audioManager.playShatter(), 200);
        await sleep(2500);
      } else {
        audioManager.playSpellCastAoE();
        triggerEffect('spell_aoe', rect.width * 0.5, rect.height * 0.5);
        await sleep(2200);
      }

      triggerShake();
      audioManager.playAoEExplosion();
      triggerEffect('hit_aoe', rect.width * 0.5, rect.height * 0.5);

      // 落实数值伤害作用至各个所判定的目标头上
      // 甄别该符卡本质是辅助支援类型还是进攻类型
      const typeStr = (spell.type || '').toLowerCase();
      let isSupport = ['buff', 'heal', 'shield'].includes(typeStr);
      if (!isSupport && (typeStr === 'attack' || !typeStr) && spell.damage <= 0) {
        if (/治愈|恢复|回复|护盾|祝福|支援|祈祷|守护|Heal|Shield|Buff|Support/i.test(spell.name))
          isSupport = true;
        else if (
          spell.buffDetails &&
          spell.buffDetails.effects.some((e) =>
            ['heal', 'shield', 'damage_reduction', 'dodge_mod'].includes(e.type)
          )
        )
          isSupport = true;
      }

      if (isSupport) {
        const targets = [actor, ...allies.value].filter((t) => t.hp > 0);
        let hasHealed = false;
        for (const t of targets) {
          // Buff 附着
          if (spell.buffDetails) applyBuff(t, spell.buffDetails, 'buff');
          
          // 如果该群体技能是纯治疗且带固定回复量，则执行群体拉血喵
          if (typeStr === 'heal' && spell.damage && spell.damage > 0) {
            const newHp = Math.min(t.maxHp, t.hp + spell.damage);
            t.hp = newHp;
            updateCombatantState(t.id, { hp: newHp });
            addPopup(t, spell.damage, 'heal');
            hasHealed = true;
          }
        }
        if (hasHealed) audioManager.playHeal();
        addLog(`${actor.name} 释放了 ${spell.name}，温暖的光芒包围了大家喵！`);
      } else {
        for (const enemy of enemies.value) {
          if (enemy.hp > 0) {
            const result = calculateDamage(actor as Combatant, enemy, spell);

            let finalDamage = result.damage;
            if (finalDamage > 0 && enemy.shield && enemy.shield > 0) {
              finalDamage = applyShieldDamage(enemy, finalDamage, actor as Combatant, '攻击', true);
            }

            if (finalDamage > 0) {
              const newHp = Math.max(0, enemy.hp - finalDamage);
              enemy.hp = newHp;
              updateCombatantState(enemy.id, { hp: newHp });
              addPopup(enemy, finalDamage, 'damage');
            } else if (result.damage <= 0 && !spell.buffDetails) {
              addPopup(enemy, 'MISS', 'damage');
            }
            if (spell.buffDetails) applyBuff(enemy, spell.buffDetails, 'debuff');
          }
        }
        addLog(`${actor.name} 释放了 ${spell.name}，对所有敌人降下了神罚喵！`);
      }

      await sleep(1500);
    } else {
      // 单体指定目标结算（对自己或他者）
      // 优先取指针目标；若为空则默认砸给自己（常用以处理自身的增益 Buff）
      const finalTarget = target || actor;

      if (spell.isUltimate) {
        audioManager.playSpellCastAoE();
        triggerEffect('ultimate_impact', rect.width * 0.5, rect.height * 0.5);
        setTimeout(() => audioManager.playShatter(), 200);
        await sleep(2500);
      } else {
        if (finalTarget === actor) {
          audioManager.playSpellCast();
          triggerEffect('spell', rect.width * 0.2, rect.height * 0.8);
        } else {
          audioManager.playSpellCastSingle();
          triggerEffect('spell_single', rect.width * 0.75, rect.height * 0.4);
        }
        await sleep(1500);
      }

      if (spell.type === 'shield' || spell.type === 'heal' || spell.type === 'buff') {
        // 完全委托给底层的 executeAction，以实现精准的平白加血与 Buff 触发生效喵！
        await executeAction(actor, finalTarget, 'spell', spell);
      } else {
        if (!spell.isUltimate) {
          triggerShake();
          audioManager.playHeavyHit();
          triggerEffect('hit', rect.width * 0.75, rect.height * 0.4);
          await sleep(150); // 留出一丝受击停顿感喵
        }
        // 逻辑降级回退方案：执行常规定向打击结算模块 喵
        await executeAction(actor, finalTarget, 'spell', spell);
      }
    }

    // 实时分发由此动作产生的所有成长项与数值结算存量 喵
    const currentAP = actor.actionPoints !== undefined ? actor.actionPoints : 2;
    updateCombatantState(actor.id, { actionPoints: Math.max(0, currentAP - 2) });

    // 赚取战斗经验与符卡熟练度成长 (EXP)
    const expGain = Math.floor(Math.random() * 6) + 5;
    const { levelUp, newLevel } = addSpellExp(spell, expGain);
    if (levelUp && actor.isPlayer) addPopup(actor, `符卡升级! Lv.${newLevel}`, 'buff');
  } else if (type === 'item') {
    const item = payload as Item;
    item.count--; // (待审验：这里或需与库存管理器做直接联动同步)
    // 备注：普通物品库存同步实为由 gameStore 处理，多端联机状态下只有主局才可进行该状态下发更变。
    // （假定该 item 对象已由全局仓库做过底层透传实例化绑定）

    let processed = false;
    const effects = item.effects || {};

    const healAmount = Number(effects.heal) || Number(effects.hp) || 0;
    if (healAmount > 0) {
      const newHp = Math.min(actor.maxHp, actor.hp + healAmount);
      actor.hp = newHp;
      updateCombatantState(actor.id, { hp: newHp });
      addPopup(actor, healAmount, 'heal');
      processed = true;
    }

    const mpAmount = Number(effects.mp) || 0;
    if (mpAmount > 0) {
      const newMp = Math.min(actor.maxMp, actor.mp + mpAmount);
      actor.mp = newMp;
      updateCombatantState(actor.id, { mp: newMp });
      addPopup(actor, mpAmount, 'heal');
      processed = true;
    }

    if (processed) {
      addLog(`${actor.name} 使用了道具 ${item.name}！`);
      audioManager.playHeal();
    } else {
      addLog(`${actor.name} 使用了 ${item.name}，但是没有效果。`);
    }

    await sleep(1000);
    const currentAP = actor.actionPoints !== undefined ? actor.actionPoints : 2;
    updateCombatantState(actor.id, { actionPoints: Math.max(0, currentAP - 1) });
  } else if (type === 'special') {
    const skill = payload;
    const currentP = actor.pPoints || 0;
    const currentAP = actor.actionPoints !== undefined ? actor.actionPoints : 2;

    updateCombatantState(actor.id, {
      pPoints: Math.max(0, currentP - skill.costP),
      actionPoints: Math.max(0, currentAP - skill.costAP)
    });

    playSkillAnimation(actor, skill.name, true);
    await sleep(800);

    // 路由处理主角专有的特技/战法流执行引擎 喵
    const baseDmg = getBaseDamage(actor.power);

    if (skill.id === 'active_defense') {
      const shieldVal = Math.round(0.5 * baseDmg);
      actor.shield = (actor.shield || 0) + shieldVal;
      updateCombatantState(actor.id, { shield: actor.shield });
      addPopup(actor, shieldVal, 'buff');
      addLog(`${actor.name} 发动【主动防御】！`);
      audioManager.playHeal();
    } else if (skill.id === 'indomitable_will') {
      const healVal = Math.round(1.0 * baseDmg);
      const newHp = Math.min(actor.maxHp, actor.hp + healVal);
      actor.hp = newHp;
      updateCombatantState(actor.id, { hp: newHp });

      const buff: Buff = {
        id: `buff_will_${Date.now()}`,
        name: '不屈意志',
        type: 'buff',
        description: '受到的伤害降低60%',
        duration: 2,
        createdTurn: turn.value,
        effects: [{ type: 'damage_reduction', value: 0.6, isPercentage: true }]
      };

      if (!actor.buffs) actor.buffs = [];
      actor.buffs.push(buff);
      updateCombatantState(actor.id, { buffs: actor.buffs });

      const rect = document.body.getBoundingClientRect();
      triggerEffect('spell', rect.width * 0.25, rect.height * 0.6);

      addPopup(actor, healVal, 'heal');
      addLog(`${actor.name} 发动【不屈意志】！`);
      audioManager.playHeal();
    } else if (skill.id === 'combat_flow') {
      await playCombatFlowAnimation();

      const buff: Buff = {
        id: `buff_flow_${Date.now()}`,
        name: '战斗心流',
        type: 'buff',
        description: '全属性大幅提升',
        duration: 3,
        createdTurn: turn.value,
        effects: [
          { type: 'stat_mod', targetStat: 'attack', value: 0.4, isPercentage: true },
          { type: 'damage_reduction', value: 0.4, isPercentage: true },
          { type: 'dodge_mod', value: 0.4, isPercentage: true },
          { type: 'stat_mod', targetStat: 'mp_cost_reduction', value: 0.2, isPercentage: true }
        ]
      };

      if (!actor.buffs) actor.buffs = [];
      actor.buffs.push(buff);
      updateCombatantState(actor.id, { buffs: actor.buffs });

      addLog(`${actor.name} 进入了【战斗心流】状态！`);
    } else if (skill.id === 'inner_power' && target) {
      audioManager.playSpellCast();
      const rect = document.body.getBoundingClientRect();
      triggerEffect('spell', rect.width * 0.7, rect.height * 0.3);

      const damageMult = 1.2 + Math.random() * 0.3;
      const trueDmg = Math.round(damageMult * baseDmg);
      const buff: Buff = {
        id: `debuff_inner_${Date.now()}`,
        name: '内伤',
        type: 'debuff',
        description: `受到真实伤害`,
        duration: 3,
        effects: [{ type: 'damage_over_time', value: trueDmg, isPercentage: false }]
      };
      if (!target.buffs) target.buffs = [];
      target.buffs.push(buff);
      updateCombatantState(target.id, { buffs: target.buffs });
      addPopup(target, '内伤', 'debuff');
      addLog(`${actor.name} 对 ${target.name} 施加了【内伤】喵！`);
    }
    // 槽位预留：后续用于动态扩展其余特技类型的判定逻辑 喵
    await sleep(1000);
  }

  checkTurnEnd();
}

// --- 统一全局仓库集成 (Store Integration) ---
const combatState = computed(() => gameStore.state.system.combat);
const isPending = computed(() => !!combatState.value?.isPending);
const isActive = computed(() => !!combatState.value?.isActive);
const showOverlay = computed(() => {
  if (!combatState.value) return false;
  // 若战斗处在活跃进行阶段 (Active)，无视其它约束强行挂载渲染层
  if (isActive.value) return true;
  // 若处在战斗发起的待确认期，依靠父传递下来的可见参数决议是否弹窗
  if (isPending.value) return !!props.visible;
  return false;
});

// --- 前端 UI 数据接口防腐层 (Interfaces) --- 喵
interface CombatLog {
  id: number;
  turn: number;
  content: string;
}

interface Popup {
  id: number;
  text: string | number;
  type: 'damage' | 'heal' | 'crit' | 'buff' | 'debuff';
}

interface UICombatant extends Combatant {
  popups: Popup[];
  items?: Item[];
}

// --- 前端主进程持有的瞬时视效与动效缓存状态分量 喵 ---
const popupMap = reactive<Record<string, Popup[]>>({});

const getPopups = (id: string) => {
  if (!popupMap[id]) popupMap[id] = [];
  return popupMap[id];
};

const enemies = computed(() => {
  return (
    combatState.value?.combatants.filter((c) => !c.isPlayer && c.team !== 'player') || []
  ).map((c) => ({
    ...c,
    popups: getPopups(c.id)
  })) as UICombatant[];
});

const player = computed(() => {
  if (!combatState.value) return null;

  let p: Combatant | undefined;

  if (gameStore.multiplayer.isMultiplayer) {
    const myId = multiplayerService.identityKey;
    // 1. 尝试匹配由当前客户端掌控的角色身份 (Owner ID match)喵
    p = combatState.value.combatants.find((c) => c.id === myId || c.ownerId === myId);

    // 2. 主机回退策略：若未分配显式拥有权，则默认接管主“玩家”实体 (Host Control Fallback)喵
    if (!p && gameStore.multiplayer.isHost) {
      p = combatState.value.combatants.find((c) => c.isPlayer && !c.ownerId);
    }
  } else {
    // 纯洁单机模式：直接获取系统主角色喵
    p = combatState.value.combatants.find((c) => c.isPlayer);
  }

  if (!p) return null;

  const stats = getEffectiveStats(p);

  return {
    ...p,
    buffs: p.buffs || [],
    dodgeRate: stats.dodgeRate,
    popups: getPopups(p.id)
  } as UICombatant;
});

const allies = computed(() => {
  // 盟友系统：定位所有处于玩家阵营，且逻辑标识不等于当前受控角色的实体 喵
  const myId = player.value?.id;
  return (
    combatState.value?.combatants.filter((c) => c.team === 'player' && c.id !== myId) || []
  ).map((c) => ({
    ...c,
    popups: getPopups(c.id)
  })) as UICombatant[];
});

// --- 参战队友阵列堆叠与活跃状态管理模块 喵 ---
const activeAllyId = ref<string | null>(null);

// 动态监控参战队友列表，维护有效的活跃指针，并在队友阵亡时实现自动补位流转 喵
watch(
  allies,
  (newAllies) => {
    if (!newAllies || newAllies.length === 0) {
      return;
    }

    const exists = newAllies.some((a) => a.id === activeAllyId.value);
    if (!activeAllyId.value || !exists) {
      const firstAlive = newAllies.find((a) => a.hp > 0);
      activeAllyId.value = firstAlive ? firstAlive.id : newAllies[0]?.id || null;
      return;
    }

    const currentActive = newAllies.find((a) => a.id === activeAllyId.value);
    if (currentActive && currentActive.hp <= 0) {
      const firstAlive = newAllies.find((a) => a.hp > 0);
      if (firstAlive && firstAlive.id !== activeAllyId.value) {
        activeAllyId.value = firstAlive.id;
      }
    }
  },
  { immediate: true, deep: true }
);

const sortedAllies = computed(() => {
  if (!allies.value || allies.value.length === 0) return [];

  // 初步排序：存活者优先，随后按名字拼音排序
  let list = [...allies.value].sort((a, b) => {
    if (a.hp > 0 && b.hp <= 0) return -1;
    if (a.hp <= 0 && b.hp > 0) return 1;
    return a.name.localeCompare(b.name, 'zh-CN');
  });

  // 重新调整顺序：将当前活跃的队友置于首位 (栈顶预览)
  const activeIndex = list.findIndex((a) => a.id === activeAllyId.value);
  if (activeIndex > -1) {
    const [active] = list.splice(activeIndex, 1);
    if (active) list.unshift(active);
  }

  return list;
});

function activateAlly(id: string) {
  // 如果点击的是当前已激活的队友，且存在多名队友，则轮换到下一个角色
  if (activeAllyId.value === id && sortedAllies.value.length > 1) {
    const currentIndex = sortedAllies.value.findIndex((a) => a.id === id);
    if (currentIndex !== -1) {
      const nextIndex = (currentIndex + 1) % sortedAllies.value.length;
      const nextAlly = sortedAllies.value[nextIndex];
      if (nextAlly) {
        activeAllyId.value = nextAlly.id;
      }
    }
  } else {
    activeAllyId.value = id;
  }

  audioManager.playClick();
}

const canAttack = computed(() => {
  if (isActing.value) return false;
  if (phase.value !== 'player') return false;
  if (!player.value) return false;

  const ap = player.value.actionPoints !== undefined ? player.value.actionPoints : 2;
  return ap > 0;
});

const enemyNames = computed(() => enemies.value.map((e) => e.name).join(', '));
const turn = computed(() => combatState.value?.turn || 1);

// 战斗数据访问层 (Getters)
const spells = computed(() => player.value?.spellCards || []);
const items = computed(() => {
  // 教学模式优先使用战斗员自带的虚拟道具喵
  if (combatState.value?.tutorialMode && player.value?.items) {
    return player.value.items;
  }
  const allItems = gameStore.state.player.items || [];
  return allItems.filter((item) => {
    // 显式排除特殊物品、关键道具、装备等不可直接消耗的项目
    if (['special', 'key_item', 'equipment'].includes(item.type)) return false;

    // 包含显式标记为消耗品或素材的项目
    if (item.type === 'consumable' || item.type === 'material') return true;

    // 回退方案：如果项目含有战斗增益/回复逻辑，也予以包含
    if (
      item.effects &&
      (item.effects.heal || item.effects.hp || item.effects.mp || item.effects.buff)
    ) {
      return true;
    }

    return false;
  });
});

// 动画及视觉状态引用 (Refs)
const currentMenu = ref<'main' | 'spell' | 'item' | 'talk' | 'special'>('main');
const isScreenShaking = ref(false);
const showIntro = ref(false); // 战斗开场 VS 动画状态位
const isActing = ref(false);
const selectionMode = ref(false);
const pendingAction = ref<{ type: string; payload?: any } | null>(null);
const activeEffect = ref<{
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
}>({ type: 'slash', x: 0, y: 0, show: false });
const phase = ref<'player' | 'ally' | 'enemy'>('player');
const hoveredEnemyId = ref<string | null>(null);

const isGameOver = ref(false);
const showResultScreen = ref(false); // 控制最终结算画面淡入时机的视觉状态位喵
const gameResult = ref<'win' | 'loss' | 'escape' | null>(null);
const combatLogs = ref<CombatLog[]>([]);
const isLogExpanded = ref(false);
const streamingNarrative = ref('');

// --- 非玩家单位的预备驻留池与战线补给系统 喵 ---
const exitedEnemyIds = ref<string[]>([]);

const visibleEnemies = computed(() => {
  return enemies.value.filter((e) => !exitedEnemyIds.value.includes(e.id));
});

const activeEnemies = computed(() => visibleEnemies.value.slice(0, 3));
const reserveEnemies = computed(() => visibleEnemies.value.slice(3));

// 实时监测生命体征：触发对应的像素破碎退场与后备力量递补动画 喵
watch(
  enemies,
  (newEnemies) => {
    newEnemies.forEach((e) => {
      if (e.hp <= 0 && !exitedEnemyIds.value.includes(e.id)) {
        // 延迟退场，为破碎 (Shatter) 死亡特效预留演出时间
        // [优化建议]：后续可考虑为每个敌人独立维护计时器，目前采用通用延时已满足表现。
        setTimeout(() => {
          if (!exitedEnemyIds.value.includes(e.id)) {
            exitedEnemyIds.value.push(e.id);
          }
        }, 2500); // 2.5 秒延迟，确保破碎特效播放完毕
      }
    });
  },
  { deep: true }
);

// 终极技能 (Ultimate) 切入动画状态数据
const showUltimateCutin = ref(false);
const ultimateCutinData = ref({
  isPlayer: true,
  charName: '',
  spellName: '',
  spriteUrl: ''
});

// 常规型战技与奥义切入动画的瞬时状态寄存器 喵
const showSkillCutin = ref(false);
const showCombatFlowAnim = ref(false);
const combatFlowPhase = ref('start'); // 'start', 'impact', 'end'
const skillCutinData = ref({
  isPlayer: true,
  isSpecial: false,
  charName: '',
  spellName: '',
  spriteUrl: ''
});

// 战斗系统全局状态生命周期侦听器群 (Watchers) 喵
watch(isActive, (val) => {
  if (val) {
    // 战斗开启时重置上下文状态分量
    isGameOver.value = false;
    showResultScreen.value = false;
    gameResult.value = null;
    phase.value = 'player';
    isActing.value = false;
    selectionMode.value = false;
    currentMenu.value = 'main';
    combatLogs.value = [];
    exitedEnemyIds.value = []; // 清空已退场敌人名单
    // 清理残留的动效漂浮文字 (Popups)
    for (const key in popupMap) {
      popupMap[key] = [];
    }
  }
});

// --- 内部辅助函数 (Helpers) ---
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function playCombatFlowAnimation(isRemote: boolean = false) {
  if (!isRemote && gameStore.multiplayer.isHost && gameStore.multiplayer.isMultiplayer) {
    multiplayerService.sendCombatEffect({
      type: 'combat_flow'
    });
  }

  // 1. 初始化阶段 (Init)
  showCombatFlowAnim.value = true;
  combatFlowPhase.value = 'start';

  // 音效 (SFX)：初始化
  audioManager.playSkillCutin();

  // 2. 开始阶段 (0-1000ms): 背景变暗，角色登场
  await sleep(1000);

  // 3. 冲击阶段 (1000-2500ms): 文本闪烁，紫色闪屏
  combatFlowPhase.value = 'impact';
  audioManager.playSpellCastAoE(); // 爆发音效
  // 触发背景中的冲击特效
  const rect = document.body.getBoundingClientRect();
  triggerEffect('ultimate_impact', rect.width / 2, rect.height / 2, undefined, true); // 仅本地触发，不进行联机二次广播以免死循环

  await sleep(2500);

  // 4. 结束阶段 (End)
  combatFlowPhase.value = 'end';
  await sleep(500); // 渐隐退场时长
  showCombatFlowAnim.value = false;
}

async function playUltimateAnimation(
  combatant: Combatant | UICombatant,
  spellName: string,
  isRemote: boolean = false
) {
  if (!isRemote && gameStore.multiplayer.isHost && gameStore.multiplayer.isMultiplayer) {
    multiplayerService.sendCombatEffect({
      type: 'ultimate_anim',
      charName: combatant.name,
      spellName: spellName,
      isPlayer: combatant.isPlayer || combatant.team === 'player',
      actorId: combatant.id
    });
  }

  const isPlayerTeam = combatant.isPlayer || combatant.team === 'player';
  ultimateCutinData.value = {
    isPlayer: isPlayerTeam,
    charName: combatant.name,
    spellName: spellName,
    // 立绘逻辑修正：仅当 ID 为 'player' 时使用 '主角'，否则回退至角色真实名称进行模糊匹配
    spriteUrl: getSpriteUrl(combatant.id === 'player' ? '主角' : combatant.name)
  };

  // 触发施法音效
  audioManager.playSpellCast();

  // 显示全屏切入立绘
  showUltimateCutin.value = true;

  // 等待动画周期（闪光 + 滑入 + 驻留）完成
  await sleep(2500);

  // 隐藏切入层
  showUltimateCutin.value = false;
}

async function playSkillAnimation(
  combatant: Combatant | UICombatant,
  spellName: string,
  isSpecial: boolean = false,
  isRemote: boolean = false
) {
  if (!isRemote && gameStore.multiplayer.isHost && gameStore.multiplayer.isMultiplayer) {
    multiplayerService.sendCombatEffect({
      type: 'skill_anim',
      charName: combatant.name,
      spellName: spellName,
      isSpecial: isSpecial,
      isPlayer: combatant.isPlayer || combatant.team === 'player',
      actorId: combatant.id
    });
  }

  const isPlayerTeam = combatant.isPlayer || combatant.team === 'player';
  skillCutinData.value = {
    isPlayer: isPlayerTeam,
    isSpecial: isSpecial,
    charName: combatant.name,
    spellName: spellName,
    spriteUrl: getSpriteUrl(combatant.id === 'player' ? '主角' : combatant.name)
  };

  audioManager.playSkillCutin();

  showSkillCutin.value = true;
  await sleep(800); // 较短的演出持续时间
  showSkillCutin.value = false;
}

function switchMenu(menu: 'main' | 'spell' | 'item' | 'talk' | 'special') {
  audioManager.playClick();
  currentMenu.value = menu;
  selectionMode.value = false;
  pendingAction.value = null;
}

function addLog(content: string, isRemote: boolean = false) {
  // 当有正式的日志条目加入时，清空当前正在流式生成的叙事文本缓存
  streamingNarrative.value = '';

  if (!isRemote && gameStore.multiplayer.isHost && gameStore.multiplayer.isMultiplayer) {
    multiplayerService.sendCombatLog({
      content: content,
      turn: turn.value
    });
  }

  combatLogs.value.unshift({
    id: Date.now() + Math.random(),
    turn: turn.value,
    content
  });
  // 已移除容量上限限制，以支持全量历史记录追溯回看
  // if (combatLogs.value.length > 5) combatLogs.value.pop();

  // 同步至全局 Store (为大语言模型提供全量战斗历史参照)
  if (combatState.value) {
    if (!combatState.value.logs) combatState.value.logs = [];
    combatState.value.logs.push({
      turn: turn.value,
      actorId: 'system',
      actorName: '系统',
      actionType: 'wait',
      targetNames: [],
      description: content
    });
  }
}

let popupIdCounter = 0;

function getEffectName(effect: BuffEffect): string {
  if (effect.type === 'stat_mod') {
    const statMap: Record<string, string> = {
      attack: '攻击',
      defense: '防御',
      dodge: '闪避',
      damage_taken: '受伤修正'
    };
    return statMap[effect.targetStat || ''] || '属性';
  } else if (effect.type === 'damage_reduction') {
    return '减伤';
  } else if (effect.type === 'dodge_mod') {
    return '闪避修正';
  } else if (effect.type === 'shield') {
    return '护盾';
  } else if (effect.type === 'heal') {
    return '每回合回复';
  } else if (effect.type === 'damage_over_time') {
    return '持续受伤';
  }
  return '效果';
}

function addPopup(
  target: UICombatant,
  value: number | string,
  type: 'damage' | 'heal' | 'crit' | 'buff' | 'debuff' = 'damage',
  isRemote: boolean = false
) {
  if (!isRemote && gameStore.multiplayer.isHost && gameStore.multiplayer.isMultiplayer) {
    multiplayerService.sendCombatPopup({
      targetId: target.id,
      value,
      type
    });
  }

  const id = popupIdCounter++;
  const list = getPopups(target.id);
  list.push({ id, text: value, type });

  setTimeout(() => {
    const idx = list.findIndex((p) => p.id === id);
    if (idx > -1) list.splice(idx, 1);
  }, 1000);
}

const characterSprites = import.meta.glob('/src/assets/images/battle_sprites/*.png', {
  query: '?url',
  import: 'default',
  eager: true
}) as Record<string, string>;

function getSpriteUrl(name?: string) {
  if (!name) return defaultSprite;
  return findBattleSprite(name, characterSprites) || defaultSprite;
}

import {
  getLevelCostReduction,
  addSpellExp,
  getCombatLevelCostReduction
} from '@/utils/spellGrowth';

// ... existing code ...

function getSpellCost(spell: SpellCard, combatant: UICombatant | null) {
  if (!combatant) return spell.cost;

  let baseReduction = 0;

  // 1. 基于符卡等级的成本减免 (0% - 29%)
  if (spell.level && spell.level > 1) {
    baseReduction += getLevelCostReduction(spell.level);
  }

  // 2. 基于 Buff 效果的成本减免 (旧版手动检查逻辑，为协议兼容性予以保留)
  if (combatant.buffs) {
    combatant.buffs.forEach((b) => {
      b.effects.forEach((e) => {
        if (e.type === 'stat_mod' && e.targetStat === 'mp_cost_reduction') {
          baseReduction += e.value;
        }
      });
    });
  }

  // 应用第一层成本折算结果
  let finalCost = spell.cost * (1 - Math.min(1.0, baseReduction));

  // 3. 新增：基于生命周期钩子的灵力成本修正 (如针对 BOMB专家、灵力回收等特殊天赋处理)
  const context = {
    attacker: combatant as Combatant,
    spell,
    actionType: spell.isUltimate ? 'ultimate' : ('spell' as any),
    spellType: spell.isUltimate ? 'ultimate' : ((spell.type || 'normal') as any)
  };
  finalCost = applyStatModifiers(finalCost, 'onCalculateMpCost', combatant as Combatant, context);

  // 4. 基于战斗等级 (Combat Level) 的成本减免 (第二层计算，属于乘法叠加)
  // 从 51 级开始起步生效，在 100 级时最高达到 25% 减免幅度
  if (combatant.isPlayer && combatant.combatLevel && combatant.combatLevel > 50) {
    const combatReduction = getCombatLevelCostReduction(combatant.combatLevel);
    finalCost *= 1 - combatReduction;
  }

  return Math.max(0, Math.floor(finalCost));
}

function getEnemyEffectiveDodge(enemy: UICombatant) {
  const baseDodge = enemy.dodgeRate || 0.15;
  let dodgeMod = 0;
  if (enemy.buffs) {
    enemy.buffs.forEach((b) => {
      b.effects.forEach((e) => {
        if (e.type === 'dodge_mod') {
          dodgeMod += e.value;
        }
      });
    });
  }
  return baseDodge + dodgeMod;
}

// --- 视觉动画样式辅助层 (Visual Style Helpers) ---
function getPlayerHpStyle(hp: number, maxHp: number) {
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  let r, g, b;
  if (ratio > 0.5) {
    const t = (ratio - 0.5) * 2;
    r = Math.round(234 + (34 - 234) * t);
    g = Math.round(179 + (197 - 179) * t);
    b = Math.round(8 + (94 - 8) * t);
  } else {
    const t = ratio * 2;
    r = Math.round(239 + (234 - 239) * t);
    g = Math.round(68 + (179 - 68) * t);
    b = Math.round(68 + (8 - 68) * t);
  }
  const color = `rgb(${r}, ${g}, ${b})`;
  return { borderColor: color, color: color, boxShadow: `0 0 20px rgba(${r}, ${g}, ${b}, 0.4)` };
}

function getEnemyHpStyle(hp: number, maxHp: number) {
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  const r = Math.round(254 + (220 - 254) * ratio);
  const g = Math.round(202 + (38 - 202) * ratio);
  const b = Math.round(202 + (38 - 202) * ratio);
  const color = `rgb(${r}, ${g}, ${b})`;
  const percent = ratio * 100;
  return {
    borderColor: color,
    color: color,
    boxShadow: `0 0 10px rgba(${r}, ${g}, ${b}, 0.4)`,
    background: `linear-gradient(to left, rgba(${r}, ${g}, ${b}, 0.3) ${percent}%, rgba(0,0,0,0.8) ${percent}%)`
  };
}

async function triggerShake(isRemote: boolean = false) {
  if (!isRemote && gameStore.multiplayer.isHost && gameStore.multiplayer.isMultiplayer) {
    multiplayerService.sendCombatEffect({
      type: 'shake'
    });
  }

  isScreenShaking.value = true;
  await sleep(500);
  isScreenShaking.value = false;
}

async function triggerEffect(
  type:
    | 'slash'
    | 'spell'
    | 'spell_aoe'
    | 'spell_single'
    | 'enemy'
    | 'hit'
    | 'hit_aoe'
    | 'talk'
    | 'ultimate_impact',
  x: number,
  y: number,
  extra?: string,
  isRemote: boolean = false
) {
  if (!isRemote && gameStore.multiplayer.isHost && gameStore.multiplayer.isMultiplayer) {
    // 坐标系归一化处理：确保在不同分辨率屏幕下特效位置对齐 (Coordinate Normalization)喵
    const rect = document.body.getBoundingClientRect();
    multiplayerService.sendCombatEffect({
      type: 'effect',
      effectType: type,
      xRatio: x / rect.width,
      yRatio: y / rect.height,
      extra
    });
  }

  activeEffect.value = { type, x, y, show: true, extra };

  let duration = 1000;
  if (type === 'spell' || type === 'spell_aoe' || type === 'spell_single') duration = 2200;
  else if (type === 'ultimate_impact') duration = 2500;
  else if (type === 'talk') duration = 2000;
  else if (type === 'slash') duration = 800;
  else if (type === 'hit_aoe') duration = 1000;
  else if (type === 'hit') duration = 500;

  await sleep(duration);
  activeEffect.value.show = false;
}

// --- 战斗核心执行逻辑架构 (Combat Logic) ---

function startCombat() {
  if (combatState.value) {
    // 作为主动发起战斗的双重保险，抹除结算幽灵状态喵
    isGameOver.value = false;
    showResultScreen.value = false;
    gameResult.value = null;
    exitedEnemyIds.value = [];
    // 首先启动全屏战斗开场演出序列 (Intro Animation Sequence)喵
    showIntro.value = true;
    playIntroSequence();

    // 为场上所有参战单位触发生命周期钩子：onCombatStart
    const allCombatants = [player.value, ...allies.value, ...enemies.value].filter(
      (c) => c !== null
    ) as UICombatant[];
    const startContext = {
      attacker: null as any,
      turn: turn.value,
      applyBuff: (target: Combatant, buff: any, type: 'buff' | 'debuff' = 'buff') =>
        applyBuff(target as UICombatant, buff, type),
      addPopup: (
        target: Combatant,
        val: string | number,
        type: 'damage' | 'heal' | 'crit' | 'buff' | 'debuff' = 'damage'
      ) => addPopup(target as UICombatant, val, type),
      addLog: (msg: string) => addLog(msg)
    };
    for (const c of allCombatants) {
      startContext.attacker = c;
      applyLifecycleHook('onCombatStart', c, startContext);
    }

    gameStore.updateState({
      system: {
        ...gameStore.state.system,
        combat: { ...combatState.value, isPending: false, isActive: true }
      }
    });
  }
}

async function playIntroSequence() {
  // 1. 冲击爆发音效阶段
  audioManager.playChime();

  // 2. 角色立绘滑入阶段 (左右对阵)
  await sleep(200);
  audioManager.playSlash(); // Left
  await sleep(400);
  audioManager.playSlash(); // Right

  // 3. VS 字样震地 Slam 效果阶段
  await sleep(600);
  audioManager.playHeavyHit();
  triggerShake();

  // 4. 驻留静止与平滑渐隐阶段
  await sleep(2500);
  showIntro.value = false;
  playCombatBgm();
}

function skipCombat() {
  const toastStore = useToastStore();
  audioManager.stopBgm();
  gameStore.updateState({ system: { ...gameStore.state.system, combat: null } });
  toastStore.addToast('已切换至自由剧情模式', 'info');
  emit('close');
}

// --- 战斗全局状态同步与存档持久化辅助 (Sync & Persistence Helpers) ---喵
function updateCombatantState(id: string, updates: Partial<Combatant>) {
  // 入参校验：严防 NaN 脏数据对数值系统造成连锁污染
  if (updates.hp !== undefined) {
    const val = Number(updates.hp);
    if (isNaN(val)) {
      console.warn('[CombatOverlay] Ignored invalid HP update:', updates.hp);
      delete updates.hp;
    } else {
      updates.hp = val;
    }
  }
  if (updates.mp !== undefined) {
    const val = Number(updates.mp);
    if (isNaN(val)) {
      console.warn('[CombatOverlay] Ignored invalid MP update:', updates.mp);
      delete updates.mp;
    } else {
      updates.mp = val;
    }
  }

  // 1. 首先同步至战斗系统专有的局部快照 (当前战斗的 Source of Truth)
  if (combatState.value) {
    const storeCombatant = combatState.value.combatants.find((c) => c.id === id);
    if (storeCombatant) {
      Object.assign(storeCombatant, updates);

      // 作为主机时，若处在联机状态则立即尝试同步变更到其他玩家端
      if (gameStore.multiplayer.isHost && gameStore.multiplayer.isMultiplayer) {
        // 权衡：由于多段打击可能导致高频同步请求，此处后续可能需要引入节流控制
        // 目前主要依赖于 isActive/turn 监听器或针对关键节点的 syncHostState 手动调用保证同步
        multiplayerService.syncHostState(gameStore.state);
      }
    }
  }

  // 2. 将变更同步至全局状态仓库以便持久化 (Player or NPC Persistence)喵
  // 判定当前实体是否为主玩家喵
  if (gameStore.state.player && id === 'player') {
    if (updates.hp !== undefined) {
      gameStore.applyAction({
        type: 'UPDATE_PLAYER',
        field: 'hp',
        op: 'set',
        value: updates.hp
      });
    }
    if (updates.mp !== undefined) {
      gameStore.applyAction({
        type: 'UPDATE_PLAYER',
        field: 'mp',
        op: 'set',
        value: updates.mp
      });
    }
  } else {
    // 若是 NPC (包含普通敌人实体)
    // 强制尝试更新或初次创建该 NPC 在全局仓库中的存档条目
    // 这能确保即使是临时的敌人（来自于静态数据库）其当前数值状态也能被正确固化。
    // 这也能从根源解决 CharacterList 界面中某些角色可能出现的 "HP: ?" 这种状态未初始化问题。
    if (updates.hp !== undefined) {
      gameStore.applyAction({
        type: 'UPDATE_NPC',
        npcId: id,
        field: 'hp',
        op: 'set',
        value: updates.hp
      });
    }
    // 注意：目前为避免配置冗余，暂不在此处强制同步 NPC 的灵力 (MP) 槽
    // 因为在大部系统下敌人均采用冷却/特定模式脚本进行出招而非硬逻辑计费 MP。
    // 后续如有明确的精英怪 MP 槽需求，可在此处扩展字段白名单。
  }
}

// --- 护盾逻辑处理器 (护盾闸机制处理) ---
function applyShieldDamage(
  target: UICombatant,
  damage: number,
  attacker: Combatant,
  actionName: string = '攻击',
  isAoE: boolean = false
) {
  if (!target.shield || target.shield <= 0) return damage;

  const damageToShield = Math.min(target.shield, damage);

  if (damage >= target.shield) {
    // 护盾击碎状态流程 (Shield Break)
    target.shield = 0;
    audioManager.playShatter();
    addPopup(target, damageToShield, 'buff');
    if (!isAoE) addLog(`${attacker.name} ${actionName}，击碎了 ${target.name} 的护盾！`);
  } else {
    // 护盾残余量扣除流程 (Shield Reduce)
    target.shield -= damage;
    addPopup(target, damage, 'buff');
    if (!isAoE) addLog(`${attacker.name} ${actionName}，造成了 ${damage} 点护盾伤害！`);
  }

  updateCombatantState(target.id, { shield: target.shield });

  // 只要护盾尚存，其表现即为吸收该次动作涉及的所有伤害 (Shield Gate)
  return 0;
}

// 战斗核心原子动作执行器包装 (Action Wrapper)
async function executeAction(
  attacker: Combatant,
  defender: UICombatant,
  actionName: string = '普通攻击',
  spell?: SpellCard
) {
  // 判定该次行动涉及的连击次数 (Attack Counts)
  let attackCount = 1;
  if (actionName === '普通攻击' && !spell) {
    const doubleChance = applyStatModifiers(0, 'onCalculateDoubleAttackChance', attacker, {
      attacker,
      defender: defender as any
    });
    if (Math.random() < doubleChance) {
      attackCount = 2;
    }
  }

  for (let i = 0; i < attackCount; i++) {
    if (i > 0) {
      if (defender.hp <= 0) break;
      addLog(`触发连击！${attacker.name} 再次发动了攻击！`);
      await sleep(600);
    }

    // 调用底层核心计算逻辑进行精确伤害推演 (Damage Calculation)
    const result = calculateDamage(attacker, defender, spell);

    // 应用符卡附加效果（如 Buff 加成或 Debuff 减益）—— 对于多段打击法术，仅在首击应用效果，以防重复叠加。
    if (spell && spell.buffDetails && i === 0) {
      // 意图推导：根据法术原本类型映射对应的增减益性质（回复/护盾 -> Buff类；进攻/削弱 -> Debuff类）
      const type = ['buff', 'shield', 'heal'].includes(spell.type || '') ? 'buff' : 'debuff';
      applyBuff(defender, spell.buffDetails, type);
    }

    if (result.damage > 0) {
      let remainingDamage = result.damage;

      if (defender.shield && defender.shield > 0) {
        remainingDamage = applyShieldDamage(defender, remainingDamage, attacker, actionName);
      }

      if (remainingDamage > 0) {
        const newHp = Math.max(0, defender.hp - remainingDamage);
        defender.hp = newHp; // 本地渲染层即时状态推演更新 (用于动画同步)
        updateCombatantState(defender.id, { hp: newHp });

        addPopup(defender, remainingDamage, 'damage');

        // 触发受击火花动效层 (Hit Spark)
        const isPlayer = defender.isPlayer || defender.team === 'player';
        const rect = document.body.getBoundingClientRect();
        const targetX = isPlayer ? rect.width * 0.25 : rect.width * 0.75;
        const targetY = rect.height * 0.4;

        triggerEffect('hit', targetX, targetY);
        addLog(result.description);
      }
    }

    // 处理治疗结算逻辑 (Heal)
    if (result.heal > 0) {
      const newHp = Math.min(defender.maxHp, defender.hp + result.heal);
      defender.hp = newHp;
      updateCombatantState(defender.id, { hp: newHp });

      audioManager.playHeal();
      addPopup(defender, result.heal, 'heal');
      addLog(result.description || `${attacker.name} 恢复了 ${result.heal} 点HP！`);
    } else if (result.damage <= 0) {
      // 处理闪避 (Miss) 或 0 点伤害的边缘情况 (仅在无伤害且无治疗时触发)喵
      if (result.isHit && spell && spell.buffDetails) {
        addPopup(defender, spell.buffDetails.name, 'buff');
        addLog(result.description);
      } else if (result.isHit) {
        addPopup(defender, '0', 'damage');
        addLog(result.description);
      } else {
        addPopup(defender, 'MISS', 'damage');
        addLog(
          result.description || `${attacker.name} 的${actionName}对 ${defender.name} 擦身而过喵！`
        );
      }
    }

    // P 点 (灵力获取) 增长逻辑：仅限玩家发起的普通打击喵
    if ((attacker.isPlayer || attacker.team === 'player') && !spell) {
      // 即使被闪避，也能通过“战斗意志”获得少量 P 点补给 (未击中补偿率为 60%)喵
      let pGain = calculatePPointGain(attacker, result.damage);

      if (!result.isHit) {
        pGain *= 0.6; // 未能命中的话，获取效率会打折喵
      }

      if (pGain > 0) {
        const currentP = attacker.pPoints || 0;
        const maxP = attacker.maxPPoints || 100;
        const newP = Math.min(maxP, currentP + pGain);

        updateCombatantState(attacker.id, { pPoints: newP });

        const uiAttacker = attacker.id === player.value?.id ? player.value : null;
        if (uiAttacker) {
          addPopup(uiAttacker, `+${pGain.toFixed(1)} P`, 'buff');
        }
      }
    }
  }
}

// --- 增减益状态 (Buff/Debuff) 应用辅助函数 ---
function applyBuff(target: UICombatant, buffDetails: any, type: 'buff' | 'debuff' = 'buff') {
  if (!buffDetails) return;

  // 优先检视瞬时生效型项目 (如瞬间护盾、即时治疗)
  let isInstantHeal = false;
  if (buffDetails.effects) {
    for (const effect of buffDetails.effects) {
      if (effect.type === 'shield') {
        const val = Number(effect.value);
        if (val > 0) {
          target.shield = (target.shield || 0) + val;
          updateCombatantState(target.id, { shield: target.shield });
          addPopup(target, val, 'buff');
        }
      } else if (effect.type === 'heal' && buffDetails.duration === 1) {
        // 结算并应用瞬时治疗 (即时生效 - Instant Heal)喵
        const val = Number(effect.value);
        if (val > 0) {
          const newHp = Math.min(target.maxHp, target.hp + val);
          target.hp = newHp;
          updateCombatantState(target.id, { hp: newHp });
          addPopup(target, val, 'heal');
          isInstantHeal = true;
        }
      }
    }
  }

  if (isInstantHeal) return;

  if (!target.buffs) target.buffs = [];

  const newBuff: Buff = {
    id: `buff_${Date.now()}_${Math.random()}`,
    name: buffDetails.name || '未知效果',
    type: type,
    description: buffDetails.description || buffDetails.name || '效果持续中',
    duration: buffDetails.duration || 3,
    createdTurn: turn.value,
    effects: (buffDetails.effects || []).map((e: any) => {
      const isPct =
        e.isPercentage !== undefined
          ? String(e.isPercentage) === 'true'
          : ['stat_mod', 'damage_reduction', 'dodge_mod'].includes(e.type);

      // 额外修正：heal, damage_over_time, shield 强制不作为百分比处理，除非显式指定
      const finalIsPct = ['heal', 'damage_over_time', 'shield', 'heal_mp'].includes(e.type)
        ? false
        : isPct;

      return {
        type: e.type,
        targetStat: e.targetStat,
        value: Number(e.value) || 0,
        isPercentage: finalIsPct
      };
    })
  };

  target.buffs.push(newBuff);
  updateCombatantState(target.id, { buffs: target.buffs });
  addPopup(target, newBuff.name, type);
  addLog(`${target.name} ${type === 'buff' ? '获得了' : '陷入了'}状态：${newBuff.name}！`);
}

// 玩家侧动作主处理器 (Main Action Handler)
async function handleAction(type: string, payload?: any) {
  if (isActing.value || phase.value !== 'player') return;
  if (!player.value) return;

  // 行动点 (AP) 强制锁死校验
  const currentAP = player.value.actionPoints !== undefined ? player.value.actionPoints : 2;
  if (currentAP < 1) {
    addPopup(player.value, '行动点不足', 'damage');
    return;
  }

  if (type === 'attack') {
    audioManager.playClick();
    selectionMode.value = true;
    pendingAction.value = { type, payload };
  } else if (type === 'spell') {
    const spell = payload as SpellCard;
    if (!player.value) return;

    const actualCost = getSpellCost(spell, player.value);
    if (player.value.mp >= actualCost) {
      // 特殊情况：针对自身施放的 Buff / 护盾 / 治疗 (且非全场 AOE) 直接立即执行，无需等待目标选择流程
      if (
        (spell.type === 'buff' || spell.type === 'shield' || spell.type === 'heal') &&
        spell.scope !== 'aoe'
      ) {
        // 立即执行链路
        if (gameStore.multiplayer.isMultiplayer && !gameStore.multiplayer.isHost) {
          multiplayerService.sendCombatAction(type, payload);
          return;
        }

        isActing.value = true;
        currentMenu.value = 'main';
        await executeCombatLogic(player.value, type, payload);
        isActing.value = false;
        return;
      }

      if (spell.scope === 'aoe') {
        // 针对群体 AOE 直接开启结算流程
        if (gameStore.multiplayer.isMultiplayer && !gameStore.multiplayer.isHost) {
          multiplayerService.sendCombatAction(type, payload);
          return;
        }

        isActing.value = true;
        currentMenu.value = 'main';
        await executeCombatLogic(player.value, type, payload);
        isActing.value = false;
      } else {
        // 单体指向型符卡 -> 进入敌群目标选取模式
        audioManager.playClick();
        selectionMode.value = true;
        pendingAction.value = { type: 'spell', payload: spell };
      }
    } else {
      addPopup(player.value, 'MP不足', 'damage');
    }
  } else if (type === 'item') {
    const item = payload as Item;
    if (!player.value) return;

    // 物件类型合规性校验 (防腐层)
    if (['special', 'key_item', 'equipment'].includes(item.type)) {
      addPopup(player.value, '不可使用', 'damage');
      return;
    }

    if (item.count > 0) {
      // 针对自身的道具使用，直接开启执行链路
      if (gameStore.multiplayer.isMultiplayer && !gameStore.multiplayer.isHost) {
        multiplayerService.sendCombatAction(type, payload);
        return;
      }

      isActing.value = true;
      currentMenu.value = 'main';
      await executeCombatLogic(player.value, type, payload);
      isActing.value = false;
    }
  }
}

// 嘴遁 (Talk/Persuasion) 逻辑控制枢纽
const talkInput = ref('');
const isProcessingTalk = ref(false);

const specialSkills = [
  {
    id: 'active_defense',
    name: '主动防御',
    costP: 30,
    costAP: 1,
    description: '获得一层数值为“0.5 * 基础攻击力”的护盾',
    theme: 'blue'
  },
  {
    id: 'inner_power',
    name: '内源之力',
    costP: 50,
    costAP: 2,
    description: '施加“内伤”DEBUFF，下三回合造成(1.2~1.5)倍攻击力的真实伤害',
    theme: 'red'
  },
  {
    id: 'indomitable_will',
    name: '不屈意志',
    costP: 60,
    costAP: 1,
    description: '恢复1倍攻击力的生命，并获得60%伤害减免(2回合)',
    theme: 'orange'
  },
  {
    id: 'combat_flow',
    name: '战斗心流',
    costP: 100,
    costAP: 1,
    description: '3回合内增加40%增伤、40%减伤及40%闪避率，且MP消耗降低20%',
    theme: 'purple'
  }
];

async function handleSpecialAction(skill: any) {
  const p = player.value;
  if (!p) return;

  // 资源消耗预检 (Cost & Requirement Check)喵
  const currentP = p.pPoints || 0;
  const currentAP = p.actionPoints !== undefined ? p.actionPoints : 2;

  if (currentP < skill.costP) {
    addPopup(p, 'P点不足喵', 'damage');
    audioManager.playSoftClick();
    return;
  }
  if (currentAP < skill.costAP) {
    addPopup(p, 'AP不足喵', 'damage');
    audioManager.playSoftClick();
    return;
  }

  // For targeted skills, enter selection mode BEFORE deducting costs
  if (skill.id === 'inner_power') {
    // isActing.value = true; // REMOVED: Do not block UI before selection
    currentMenu.value = 'main';
    selectionMode.value = true;
    pendingAction.value = { type: 'special', payload: skill };
    audioManager.playClick();
    return;
  }

  // For self-cast skills, execute immediately
  if (gameStore.multiplayer.isMultiplayer && !gameStore.multiplayer.isHost) {
    multiplayerService.sendCombatAction('special', skill);
    return;
  }

  if (!player.value) return;

  // Deduct Costs
  const curP = player.value.pPoints || 0;
  const curAP = player.value.actionPoints !== undefined ? player.value.actionPoints : 2;
  updateCombatantState(player.value.id, {
    pPoints: Math.max(0, curP - skill.costP),
    actionPoints: Math.max(0, curAP - skill.costAP)
  });

  isActing.value = true;
  currentMenu.value = 'main';

  // 触发特技专属切入动画 (Play Skill Animation)喵
  playSkillAnimation(player.value, skill.name, true);
  await sleep(800);

  try {
    const baseDmg = getBaseDamage(player.value.power);

    if (skill.id === 'active_defense') {
      const shieldVal = Math.round(0.5 * baseDmg);
      player.value.shield = (player.value.shield || 0) + shieldVal;
      updateCombatantState(player.value.id, { shield: player.value.shield });

      const rect = document.body.getBoundingClientRect();
      triggerEffect('spell', rect.width * 0.25, rect.height * 0.6); // 视觉反馈喵

      addPopup(player.value, shieldVal, 'buff');
      addLog(`${player.value.name} 发动【主动防御】，获得了 ${shieldVal} 点护盾喵！`);
      audioManager.playHeal();

      await sleep(1000);
      checkTurnEnd();
    } else if (skill.id === 'indomitable_will') {
      const healVal = Math.round(1.0 * baseDmg);
      const newHp = Math.min(player.value.maxHp, player.value.hp + healVal);
      player.value.hp = newHp;
      updateCombatantState(player.value.id, { hp: newHp });

      // 状态：2回合内受到的伤害降低 60%喵
      const buff: Buff = {
        id: `buff_will_${Date.now()}`,
        name: '不屈意志',
        type: 'buff',
        description: '受到的伤害降低60%',
        duration: 2,
        createdTurn: turn.value,
        effects: [{ type: 'damage_reduction', value: 0.6, isPercentage: true }]
      };

      if (!player.value.buffs) player.value.buffs = [];
      player.value.buffs.push(buff);
      updateCombatantState(player.value.id, { buffs: player.value.buffs });

      const rect = document.body.getBoundingClientRect();
      triggerEffect('spell', rect.width * 0.25, rect.height * 0.6); // 视觉反馈喵

      addPopup(player.value, healVal, 'heal');
      addLog(`${player.value.name} 发动【不屈意志】，恢复了 ${healVal} 点生命并获得了高额减伤喵！`);
      audioManager.playHeal();

      await sleep(1000);
      checkTurnEnd();
    } else if (skill.id === 'combat_flow') {
      // 触发战斗心流过场动画喵
      await playCombatFlowAnimation();

      const buff: Buff = {
        id: `buff_flow_${Date.now()}`,
        name: '战斗心流',
        type: 'buff',
        description: '攻防提升，闪避提升，MP消耗降低',
        duration: 3,
        createdTurn: turn.value,
        effects: [
          { type: 'stat_mod', targetStat: 'attack', value: 0.4, isPercentage: true },
          { type: 'damage_reduction', value: 0.4, isPercentage: true },
          { type: 'dodge_mod', value: 0.4, isPercentage: true },
          { type: 'stat_mod', targetStat: 'mp_cost_reduction', value: 0.2, isPercentage: true }
        ]
      };

      if (!player.value.buffs) player.value.buffs = [];
      player.value.buffs.push(buff);
      updateCombatantState(player.value.id, { buffs: player.value.buffs });

      addLog(`${player.value.name} 进入了【战斗心流】状态！`);

      await sleep(1000);
      checkTurnEnd();
    }
  } catch (e) {
    console.error('Special action failed:', e);
    addLog(`[错误] 技能发动失败: ${e}`);
  } finally {
    if (phase.value === 'player') {
      isActing.value = false;
    }
  }
}

async function handleTalk() {
  if (!talkInput.value.trim() || !player.value) return;

  // Cost Check
  const currentP = player.value.pPoints || 0;
  const currentAP = player.value.actionPoints !== undefined ? player.value.actionPoints : 2;
  if (currentP < 15) {
    addPopup(player.value, 'P点不足', 'damage');
    return;
  }
  if (currentAP < 2) {
    addPopup(player.value, 'AP不足', 'damage');
    return;
  }

  // 调试后门指令: /debug buff (用于在无需进行嘴遁时验证 UI 状态显示)
  if (talkInput.value.trim() === '/debug buff') {
    const debugBuff: Buff = {
      id: `debug_${Date.now()}`,
      name: '测试BUFF',
      type: 'buff',
      description: '这是一个用于测试UI显示的BUFF',
      duration: 3,
      createdTurn: turn.value,
      effects: [{ type: 'stat_mod', targetStat: 'attack', value: 0.5, isPercentage: true }]
    };
    if (!player.value.buffs) player.value.buffs = [];
    player.value.buffs.push(debugBuff);
    addPopup(player.value, '测试BUFF', 'buff');
    addLog('已手动添加测试BUFF');
    talkInput.value = '';
    return;
  }

  isProcessingTalk.value = true;
  audioManager.playClick();

  try {
    const result = await processPersuasion(
      player.value,
      enemies.value,
      allies.value,
      talkInput.value,
      turn.value
    );

    // 渲染生成的叙事文本日志段落
    addLog(`[嘴遁] ${result.narrative}`);

    // 依次分发并生效叙事生成的各项数值/状态变更 (Apply Game-State Effects)
    for (const effect of result.effects) {
      console.log('[HandleTalk] Processing Effect:', effect);

      if (effect.target === 'ally' || effect.target === 'all_allies') {
        // 搜寻生效目标 (Allies)流
        const targets = [];
        if (effect.target === 'ally' && typeof effect.targetIndex === 'number') {
          if (allies.value[effect.targetIndex]) targets.push(allies.value[effect.targetIndex]);
        } else {
          targets.push(...allies.value);
        }

        for (const target of targets) {
          if (!target || target.hp <= 0) continue;

          if (effect.type === 'heal') {
            const heal = Number(effect.value) || 0;
            if (heal > 0) {
              const newHp = Math.min(target.maxHp, target.hp + heal);
              target.hp = newHp;
              updateCombatantState(target.id, { hp: newHp });
              addPopup(target, heal, 'heal');
              addLog(`${target.name} 恢复了 ${heal} 点生命！`);
            }
          } else if (effect.type === 'shield') {
            const val = Number(effect.value) || 0;
            if (val > 0) {
              target.shield = (target.shield || 0) + val;
              updateCombatantState(target.id, { shield: target.shield });
              addPopup(target, val, 'buff');
              addLog(`${target.name} 获得了 ${val} 点护盾！`);
            }
          } else if (effect.type === 'status' && effect.buffDetails) {
            if (!target.buffs) target.buffs = [];
            const newBuff: Buff = {
              id: `buff_${Date.now()}_${Math.random()}`,
              name: effect.buffDetails.name,
              type: 'buff',
              description: effect.description || effect.buffDetails.name,
              duration: effect.buffDetails.duration,
              createdTurn: turn.value,
              effects: effect.buffDetails.effects.map((e: any) => {
                const isPct =
                  e.isPercentage !== undefined
                    ? String(e.isPercentage) === 'true'
                    : ['stat_mod', 'damage_reduction', 'dodge_mod'].includes(e.type);

                // 强制修正：heal, damage_over_time, shield 强制不作为百分比处理，除非显式指定
                const finalIsPct = ['heal', 'damage_over_time', 'shield', 'heal_mp'].includes(
                  e.type
                )
                  ? false
                  : isPct;

                return {
                  type: e.type,
                  targetStat: e.targetStat,
                  value: Number(e.value) || 0,
                  isPercentage: finalIsPct
                };
              })
            };
            target.buffs.push(newBuff);
            updateCombatantState(target.id, { buffs: target.buffs });
            addPopup(target, newBuff.name, 'buff');
            addLog(`${target.name} 获得了状态：${newBuff.name}！`);
          }
        }
      } else if (effect.target === 'enemy' || effect.target === 'all_enemies') {
        // 搜寻生效目标 (Enemies)流
        const targets = [];
        if (effect.target === 'enemy' && typeof effect.targetIndex === 'number') {
          if (enemies.value[effect.targetIndex]) targets.push(enemies.value[effect.targetIndex]);
        } else {
          targets.push(...enemies.value);
        }

        for (const target of targets) {
          if (!target || target.hp <= 0) continue;

          if (effect.type === 'damage') {
            const dmg = Number(effect.value) || 0;
            if (dmg > 0) {
              const newHp = Math.max(0, target.hp - dmg);
              target.hp = newHp;
              updateCombatantState(target.id, { hp: newHp });

              addPopup(target, dmg, 'damage');

              // 渲染声光电特效反馈层 (Hit Sound & Effect)
              audioManager.playHeavyHit();
              const rect = document.body.getBoundingClientRect();
              triggerEffect('hit', rect.width * 0.75, rect.height * 0.4);

              addLog(`${target.name} 受到了 ${dmg} 点精神伤害！`);
            }
          } else if (effect.type === 'shield') {
            const val = Number(effect.value) || 0;
            if (val > 0) {
              target.shield = (target.shield || 0) + val;
              updateCombatantState(target.id, { shield: target.shield });
              addPopup(target, val, 'buff');
              addLog(`${target.name} 获得了 ${val} 点护盾！`);
            }
          } else if (effect.type === 'status') {
            if (effect.buffDetails) {
              if (!target.buffs) target.buffs = [];
              const newBuff: Buff = {
                id: `buff_${Date.now()}_${Math.random()}`,
                name: effect.buffDetails.name,
                type: 'buff',
                description: effect.description || effect.buffDetails.name,
                duration: effect.buffDetails.duration,
                createdTurn: turn.value,
                effects: effect.buffDetails.effects.map((e: any) => {
                  const isPct =
                    e.isPercentage !== undefined
                      ? String(e.isPercentage) === 'true'
                      : ['stat_mod', 'damage_reduction', 'dodge_mod'].includes(e.type);

                  // 强制修正：heal, damage_over_time, shield 强制不作为百分比处理，除非显式指定
                  const finalIsPct = ['heal', 'damage_over_time', 'shield', 'heal_mp'].includes(
                    e.type
                  )
                    ? false
                    : isPct;

                  return {
                    type: e.type,
                    targetStat: e.targetStat,
                    value: Number(e.value) || 0,
                    isPercentage: finalIsPct
                  };
                })
              };
              target.buffs.push(newBuff);
              updateCombatantState(target.id, { buffs: target.buffs });
              addPopup(target, newBuff.name, 'buff');
              addLog(`${target.name} 获得了状态：${newBuff.name}！`);
            } else {
              addPopup(target, String(effect.value), 'buff');
              addLog(`${target.name} 陷入了 ${effect.value} 状态！`);
            }
          } else if (effect.type === 'win') {
            addLog(`${target.name} 失去了战斗意志！`);
            target.hp = 0; // 为简化逻辑，精神破防后直接判定其 HP 归零 (即退出战斗)
            updateCombatantState(target.id, { hp: 0 });
            audioManager.playShatter();
          }
        }
      } else if (effect.target === 'player') {
        if (effect.type === 'heal') {
          const heal = Number(effect.value) || 0;
          if (heal > 0 && player.value) {
            const newHp = Math.min(player.value.maxHp, player.value.hp + heal);
            player.value.hp = newHp;
            updateCombatantState(player.value.id, { hp: newHp });

            addPopup(player.value, heal, 'heal');
            addLog(`${player.value.name} 恢复了 ${heal} 点生命！`);
          }
        } else if (effect.type === 'shield') {
          const val = Number(effect.value) || 0;
          if (val > 0 && player.value) {
            player.value.shield = (player.value.shield || 0) + val;
            updateCombatantState(player.value.id, { shield: player.value.shield });
            addPopup(player.value, val, 'buff');
            addLog(`${player.value.name} 获得了 ${val} 点护盾！`);
          }
        } else if (effect.type === 'status' && effect.buffDetails && player.value) {
          if (!player.value.buffs) player.value.buffs = [];
          const newBuff: Buff = {
            id: `buff_${Date.now()}_${Math.random()}`,
            name: effect.buffDetails.name,
            type: 'buff',
            description: effect.description || effect.buffDetails.name,
            duration: effect.buffDetails.duration,
            createdTurn: turn.value,
            effects: effect.buffDetails.effects.map((e: any) => {
              const isPct =
                e.isPercentage !== undefined
                  ? String(e.isPercentage) === 'true'
                  : ['stat_mod', 'damage_reduction', 'dodge_mod'].includes(e.type);

              // 强制修正：heal, damage_over_time, shield 强制不作为百分比处理，除非显式指定
              const finalIsPct = ['heal', 'damage_over_time', 'shield', 'heal_mp'].includes(e.type)
                ? false
                : isPct;

              return {
                type: e.type,
                targetStat: e.targetStat,
                value: Number(e.value) || 0,
                isPercentage: finalIsPct
              };
            })
          };
          console.log('[嘴遁] 正在为主角注入增益状态喵:', newBuff);
          player.value.buffs.push(newBuff);
          updateCombatantState(player.value.id, { buffs: player.value.buffs });
          addPopup(player.value, newBuff.name, 'buff');
          addLog(`${player.value.name} 获得了状态：${newBuff.name}喵！`);
        } else if (effect.type === 'escape') {
          gameResult.value = 'escape';
          isGameOver.value = true;
          addLog(`${player.value.name} 成功逃脱了！`);
        }
      }
    }

    await sleep(2000);

    // 扣减行动成本 (AP: 2, P: 15)
    if (player.value) {
      const currentAPFinal =
        player.value.actionPoints !== undefined ? player.value.actionPoints : 2;
      const currentPFinal = player.value.pPoints || 0;
      updateCombatantState(player.value.id, {
        actionPoints: Math.max(0, currentAPFinal - 2),
        pPoints: Math.max(0, currentPFinal - 15)
      });
    }

    checkTurnEnd();
  } catch (error) {
    console.error('[嘴遁] 处理流程出现逻辑崩溃喵:', error);
    addLog('嘴遁失败，由于未知的位面力量干扰，逻辑闭环断裂了喵...');
  } finally {
    isProcessingTalk.value = false;
    talkInput.value = '';
    currentMenu.value = 'main';
  }
}

// 点击战场空白处、安全取消并抛弃任何正在手边的动作锚点 喵
function cancelSelection() {
  if (selectionMode.value && !isActing.value) {
    audioManager.playSoftClick(); // 播放一声柔和的回退提示音
    selectionMode.value = false;
    pendingAction.value = null;
    currentMenu.value = 'main'; // 降级退回至战斗决策主菜单
    addLog('[系统] 取消了动作预选。');
  }
}

// 目标选取完成后的执行回调 (目标选取与执行)
async function selectTarget(target: UICombatant) {
  if (!selectionMode.value || !pendingAction.value || isActing.value || phase.value !== 'player')
    return;
  if (target.hp <= 0) return;

  const { type, payload } = pendingAction.value;

  // 开启正式动作序列流程控制锁
  selectionMode.value = false;
  pendingAction.value = null;

  if (gameStore.multiplayer.isMultiplayer && !gameStore.multiplayer.isHost) {
    multiplayerService.sendCombatAction(type, payload, target.id);
    return;
  }

  isActing.value = true;

  try {
    if (player.value) {
      await executeCombatLogic(player.value, type, payload, target);
    }
  } catch (error) {
    console.error('Action execution failed:', error);
    addLog(`[错误] 行动失败: ${error}`);
  } finally {
    // [重要提示] 必须在结算完毕后重置 isActing 状态位，否则当前回合后续无法再进行 UI 交互。
    // 放置在 finally 块中以兜底任何潜在的逻辑崩溃。
    if (phase.value === 'player') {
      isActing.value = false;
    }
  }
}

function checkTurnEnd() {
  if (!player.value) return;

  const currentAP = player.value.actionPoints !== undefined ? player.value.actionPoints : 0;

  if (currentAP <= 0) {
    checkWinLoss();
    if (!isGameOver.value) {
      isActing.value = false;

      // 轮换至队友阶段 (若存在可行动队友)
      if (allies.value.length > 0 && allies.value.some((a) => a.hp > 0)) {
        phase.value = 'ally';
        processAllyTurn();
      } else {
        if (combatState.value) combatState.value.turn++;
        phase.value = 'enemy';
        processEnemyTurn();
      }
    }
  } else {
    // 若 AP 尚存，则放回控制权，允许玩家继续发起后续动作 (如连击或道具使用)
    isActing.value = false;
    currentMenu.value = 'main';
    selectionMode.value = false;
  }
}

// --- 战斗流推进与阵营生命周期管理 (回合与阶段管理) ---喵
function processTurnStart() {
  if (!combatState.value) return;

  // 在玩家阶段开启时，重置并刷新玩家持有的战斗行动点 (AP) 数额
  if (phase.value === 'player' && player.value) {
    updateCombatantState(player.value.id, { actionPoints: 2 });
  }

  const allCombatants = [player.value, ...allies.value, ...enemies.value].filter(
    (c) => c !== null
  ) as UICombatant[];

  for (const c of allCombatants) {
    const prevHp = c.hp;
    const prevMp = c.mp || 0;

    // 触发生命周期钩子 onTurnStart (在此统一结算 DoT 扣血、HoT 回血以及各类基于回合数的天赋动效)
    applyLifecycleHook('onTurnStart', c, {
      attacker: c,
      turn: turn.value,
      onLog: (msg) => addLog(msg),
      onPopup: (target, val, type) => addPopup(target as UICombatant, val, type)
    });

    if (!c.buffs || c.buffs.length === 0) {
      // 即便没有任何状态位，为了应对天赋或其他隐蔽钩子带来的静默变更，也需在此处进行 HP/MP 快照同步。
      if (c.hp !== prevHp || (c.mp || 0) !== prevMp) {
        updateCombatantState(c.id, { hp: c.hp, mp: c.mp });
      }
      continue;
    }

    const expiredBuffs: Buff[] = [];
    const activeBuffs: Buff[] = [];
    let changed = false;

    for (const buff of c.buffs) {
      // 状态持续时间逻辑优化 (Duration Logic Optimization):
      // 避免新加载的状态在同一个大回合内过早地发生衰减，从而确保其至少能存续一整个闭环大环节。
      let shouldDecrement = true;
      if (buff.createdTurn !== undefined && combatState.value) {
        const currentTurn = combatState.value.turn;
        if (c.isPlayer) {
          // 玩家身上刚在前一个回合 (currentTurn - 1) 建立的状态此处不应执行衰减
          // 这确保了玩家赋予的反制型 Buff 能涵盖当前整个操作周期。
          if (buff.createdTurn === currentTurn - 1) {
            shouldDecrement = false;
          }
        } else {
          // 敌方身上在当前大回合 (敌方阶段) 刚刚生成的状态此处不执行衰减。
          if (buff.createdTurn === currentTurn) {
            shouldDecrement = false;
          }
        }
      }

      if (shouldDecrement) {
        buff.duration--;
      }

      if (buff.duration <= 0) {
        expiredBuffs.push(buff);
        changed = true;
      } else {
        activeBuffs.push(buff);
        // Note: changed = true if duration changed, but we only need to sync if it's new or removed?
        // Actually, duration is displayed in UI, so we should sync.
        changed = true;
      }
    }

    // 在一轮结算完毕后，将处理好的状态集合以及由于 DoT/HoT 导致的生理属性变化统一同步回 Store。
    const hpChanged = c.hp !== prevHp;
    const mpChanged = (c.mp || 0) !== prevMp;

    if (changed || hpChanged || mpChanged) {
      const updates: any = {};
      if (changed) {
        c.buffs = activeBuffs;
        updates.buffs = activeBuffs;
      }
      if (hpChanged) updates.hp = c.hp;
      if (mpChanged) updates.mp = c.mp;

      updateCombatantState(c.id, updates);

      for (const b of expiredBuffs) {
        addLog(`${c.name} 的状态 【${b.name}】 已失效。`);
      }
    }
  }

  // 即使在回合刚开始时，也需检查是否由于 DoT 或 Buff 效果导致单位阵亡 (Check Win/Loss)
  checkWinLoss();
}

// --- 盟友回合自动化决策逻辑 (Ally Turn Automation) ---喵
async function processAllyTurn() {
  if (phase.value !== 'ally') return;

  console.log('[战斗] 盟友回合处理开始');

  try {
    await sleep(500);

    const aliveAllies = allies.value.filter((a) => a.hp > 0);

    for (const ally of aliveAllies) {
      if (isGameOver.value) break;

      // 搜寻当前活跃的敌对目标 (Enemies Filter)喵
      const opponents = enemies.value.filter((e) => e.hp > 0);
      if (opponents.length === 0) break;

      // 搜寻当前可用的友方支援目标 (包含主角与其他盟友 - Allies & Player)喵
      const friends: UICombatant[] = [];
      if (player.value && player.value.hp > 0) friends.push(player.value);
      friends.push(...allies.value.filter((a) => a.id !== ally.id && a.hp > 0));
      // 将自身加入友方列表，以支持对自己施加增益性符卡 (Self-Buffs)
      friends.push(ally);

      // 盟友 AI 决策权重演算心核 (Combat Decision Heart - AI Logic)喵
      let action: 'attack' | 'spell' = 'attack';
      let selectedSpell: SpellCard | undefined;
      let isUltimateTrigger = false;

      console.log(
        `[Combat AI Ally] ${ally.name} (HP: ${ally.hp}) 正在思考。可用符卡: ${ally.spellCards?.length || 0}`
      );
      if (ally.spellCards && ally.spellCards.length > 0) {
        console.log(
          `[Combat AI Ally] 符卡列表: ${ally.spellCards.map((s) => s.name).join('、')}`
        );
      }

      // 1. 终极奥义触发校验 (当 HP 低于 40% 且未曾施放过奥义)
      if (ally.hp < ally.maxHp * 0.4 && !ally.hasUsedUltimate) {
        const ult = ally.spellCards?.find((s) => s.isUltimate);
        if (ult) {
          selectedSpell = ult;
          action = 'spell';
          isUltimateTrigger = true;
        }
      }

      // 2. 常规行动倾向 (60% 概率普通攻击，40% 概率施展符卡)
      if (!selectedSpell) {
        if (ally.spellCards && ally.spellCards.length > 0 && Math.random() < 0.4) {
          // 随机选取一张非奥义类符卡施放
          const regularSpells = ally.spellCards.filter((s) => !s.isUltimate);
          if (regularSpells.length > 0) {
            selectedSpell = regularSpells[Math.floor(Math.random() * regularSpells.length)];
            action = 'spell';
          }
        }
      }

      // 3. 智能目标锁定策略 (智能选取最优目标 - Target Selection)喵
      let targets: UICombatant[] = [];

      if (action === 'spell' && selectedSpell) {
        const isSupport = ['heal', 'buff', 'shield'].includes(selectedSpell.type || '');
        const pool = isSupport ? friends : opponents;

        if (pool.length > 0) {
          if (selectedSpell.scope === 'aoe') {
            targets = pool;
          } else {
            const t = pool[Math.floor(Math.random() * pool.length)];
            if (t) targets = [t];
          }
        }
      } else {
        // 执行常规物理攻击流程
        if (opponents.length > 0) {
          const randomOpponent = opponents[Math.floor(Math.random() * opponents.length)];
          if (randomOpponent) targets = [randomOpponent];
        }
      }

      if (targets.length === 0) continue;

      // 4. 正式执行链路 (Execution Loop)
      if (action === 'spell' && selectedSpell) {
        addLog(`${ally.name} 发动了符卡：${selectedSpell.name}！`);

        if (isUltimateTrigger) {
          updateCombatantState(ally.id, { hasUsedUltimate: true });
          await playUltimateAnimation(ally, selectedSpell.name);
        } else {
          await playSkillAnimation(ally, selectedSpell.name);
        }

        const isSupport = ['heal', 'buff', 'shield'].includes(selectedSpell.type || '');
        const isAoE = selectedSpell.scope === 'aoe' || targets.length > 1;
        const rect = document.body.getBoundingClientRect();

        // 触发对应的施法音效表现层
        if (isAoE) audioManager.playSpellCastAoE();
        else audioManager.playSpellCastSingle();

        // 渲染对应的视觉特效表现层 (视觉动效分发 - Visuals Distribution)喵
        if (isUltimateTrigger || isAoE) {
          if (isSupport) {
            // 锚定在己方阵营中心 (左侧半场)
            triggerEffect('spell_aoe', rect.width * 0.25, rect.height * 0.5);
          } else {
            // 锚定在敌方阵营中心 (右侧半场)
            triggerEffect('spell_aoe', rect.width * 0.75, rect.height * 0.5);
          }
        } else {
          // 单体目标指向性特效定位逻辑
          const t = targets[0];
          let tx = rect.width * 0.5;
          let ty = rect.height * 0.5;
          if (t) {
            // 根据阵营属性估算特效应出现的屏幕坐标位置
            // 盟友攻击敌人 -> 渲染在敌方半场 (右侧)
            // 盟友支援队友 -> 渲染在己方半场 (左侧)
            const isTargetEnemy = !t.isPlayer && t.team === 'enemy';
            tx = isTargetEnemy ? rect.width * 0.75 : rect.width * 0.25;
            ty = rect.height * 0.6;
          }
          triggerEffect('spell_single', tx, ty);
        }

        await sleep(isUltimateTrigger ? 1500 : isAoE ? 1000 : 500);

        if (!isSupport) {
          triggerShake();
          if (isAoE) {
            audioManager.playAoEExplosion();
            triggerEffect('hit_aoe', rect.width * 0.5, rect.height * 0.5);
          } else {
            audioManager.playHeavyHit();
            // 在目标坐标处播放爆炸受击特效点缀
            const t = targets[0];
            let hitTx = rect.width * 0.5;
            let hitTy = rect.height * 0.5;
            if (t) {
              const isTargetEnemy = !t.isPlayer && t.team === 'enemy';
              hitTx = isTargetEnemy ? rect.width * 0.75 : rect.width * 0.25;
              hitTy = rect.height * 0.6;
            }
            triggerEffect('hit', hitTx, hitTy);
          }
        }

        // 对所有命中的目标执行数值结算核算逻辑喵
        for (const target of targets) {
          await executeAction(ally, target, selectedSpell.name, selectedSpell);
        }
      } else {
        // 普通物理攻击执行分支
        const target = targets[0];
        if (!target) continue;
        audioManager.playSlash();
        const rect = document.body.getBoundingClientRect();
        triggerEffect('slash', rect.width * 0.7, rect.height * 0.3);

        await sleep(300);
        triggerShake();
        audioManager.playHeavyHit();

        await executeAction(ally, target, '普通攻击');
      }

      await sleep(500);
      checkWinLoss();
    }

    if (!isGameOver.value) {
      if (combatState.value) combatState.value.turn++;
      phase.value = 'enemy';
      processEnemyTurn();
    }
  } catch (e) {
    console.error('[Combat] Ally turn error:', e);
    // 如果盟友回合执行异常，降级回退至敌人阶段，防止流程挂死
    phase.value = 'enemy';
    processEnemyTurn();
  }
}

// --- 敌人回合自动化执行引擎 (Enemy Turn Automation Engine) ---喵
async function processEnemyTurn() {
  if (phase.value !== 'enemy') return;

  console.log('[战斗] 敌人回合处理开始');

  try {
    // 模拟 AI 决策思考延迟时长
    await sleep(800);

    const aliveEnemies = enemies.value.filter((e) => e.hp > 0);

    for (const enemy of aliveEnemies) {
      try {
        if (isGameOver.value) break;

        // 定义攻击对象池 (Player + Allies)
        const opponents: UICombatant[] = [];
        if (player.value && player.value.hp > 0) opponents.push(player.value);
        opponents.push(...allies.value.filter((a) => a.hp > 0));

        if (opponents.length === 0) break;

        // 定义队友互助池 (Self + Other Enemies)
        const friends = [enemy, ...enemies.value.filter((e) => e.id !== enemy.id && e.hp > 0)];

        // 敌人 AI 决策倾向演算引擎 (Enemy Logic Heart)喵
        let action: 'attack' | 'spell' = 'attack';
        let selectedSpell: SpellCard | undefined;
        let isUltimateTrigger = false;

        console.log(
          `[Combat AI Enemy] ${enemy.name} (HP: ${enemy.hp}) 正在思考。可用符卡: ${enemy.spellCards?.length || 0}`
        );
        if (enemy.spellCards && enemy.spellCards.length > 0) {
          console.log(
            `[Combat AI Enemy] 符卡列表: ${enemy.spellCards.map((s) => s.name).join('、')}`
          );
        }

        // 1. 【精英/头目专属】终极奥义生命阈值自动感应 (HP < 40% 触发)喵
        if (enemy.hp < enemy.maxHp * 0.4 && !enemy.hasUsedUltimate) {
          const ult = enemy.spellCards?.find((s) => s.isUltimate);
          if (ult) {
            selectedSpell = ult;
            action = 'spell';
            isUltimateTrigger = true;
          }
        }

        // 2. 敌人常规行动分布控制 (60% 物攻, 40% 怪技)
        if (!selectedSpell) {
          if (enemy.spellCards && enemy.spellCards.length > 0 && Math.random() < 0.4) {
            const regularSpells = enemy.spellCards.filter((s) => !s.isUltimate);
            if (regularSpells.length > 0) {
              selectedSpell = regularSpells[Math.floor(Math.random() * regularSpells.length)];
              action = 'spell';
            }
          }
        }

        // 3. 敌方目标锁定策略引擎 (仇恨与目标映射 - Target Selection)喵
        let targets: UICombatant[] = [];

        if (action === 'spell' && selectedSpell) {
          const isSupport = ['heal', 'buff', 'shield'].includes(selectedSpell.type || '');
          const pool = isSupport ? friends : opponents;

          if (pool.length > 0) {
            if (selectedSpell.scope === 'aoe') {
              targets = pool;
            } else {
              const randomTarget = pool[Math.floor(Math.random() * pool.length)];
              if (randomTarget) targets = [randomTarget];
            }
          }
        } else {
          // 物理平砍攻击分支
          if (opponents.length > 0) {
            const randomOpponent = opponents[Math.floor(Math.random() * opponents.length)];
            if (randomOpponent) targets = [randomOpponent];
          }
        }

        if (targets.length === 0) continue;

        // 4. 正式物理/法术逻辑下发与指令集执行 (Logic Execution)喵
        if (action === 'spell' && selectedSpell) {
          addLog(`${enemy.name} 发动了符卡：${selectedSpell.name}！`);

          if (isUltimateTrigger) {
            updateCombatantState(enemy.id, { hasUsedUltimate: true });
            await playUltimateAnimation(enemy, selectedSpell.name);
          } else {
            await playSkillAnimation(enemy, selectedSpell.name);
          }

          if (isUltimateTrigger) audioManager.playSpellCast();

          // 渲染敌人侧特有的视效分层 (Enemy Side Visuals)喵
          const isSupport = ['heal', 'buff', 'shield'].includes(selectedSpell.type || '');
          const rect = document.body.getBoundingClientRect();

          // 精准计算并缓存敌方目标的受击坐标喵
          let hitTx = rect.width * 0.25;
          let hitTy = rect.height * 0.5;
          const hitTarget = targets[0];
          if (hitTarget) {
            const isTargetPlayer = hitTarget.isPlayer || hitTarget.team === 'player';
            hitTx = isTargetPlayer ? rect.width * 0.25 : rect.width * 0.75;
            hitTy = isTargetPlayer ? rect.height * 0.6 : rect.height * 0.7;
          }

          if (isUltimateTrigger) {
            if (isSupport) {
              // 作用在敌方自己半场 (右侧)
              triggerEffect('spell', rect.width * 0.75, rect.height * 0.5);
            } else {
              // 作用在玩家正义半场 (左侧)
              triggerEffect('spell', rect.width * 0.25, rect.height * 0.5);
            }
          } else {
            // 普通技能补全单体弹道追踪视效喵
            triggerEffect('spell_single', hitTx, hitTy);
          }

          await sleep(isUltimateTrigger ? 1500 : 800);
          if (!isSupport) {
            triggerShake();
            audioManager.playHeavyHit();
            if (!isUltimateTrigger) {
              triggerEffect('hit', hitTx, hitTy);
            }
          }

          // 针对判定的所有受影响目标进行数值摊派执行
          for (const target of targets) {
            await executeAction(enemy, target, selectedSpell.name, selectedSpell);
          }
        } else {
          // 普通物理撕咬/暴力打击执行分支 (Regular Physical Attack)喵
          const target = targets[0];
          if (!target) continue;

          audioManager.playSlash();
          const rect = document.body.getBoundingClientRect();

          // 特效在受击者所在的方位进行渲染定位
          const isTargetPlayer = target.isPlayer || target.team === 'player';
          const tx = isTargetPlayer ? rect.width * 0.25 : rect.width * 0.75;
          const ty = isTargetPlayer ? rect.height * 0.6 : rect.height * 0.7;

          triggerEffect('enemy', tx, ty);

          await sleep(200);
          triggerShake();
          audioManager.playHeavyHit();

          await executeAction(enemy, target);
        }
      } catch (err) {
        console.error(`Error during enemy ${enemy.name} turn:`, err);
        addLog(`[系统] ${enemy.name} 行动出错，已跳过。`);
      }

      await sleep(500);
      checkWinLoss();
    }

    if (!isGameOver.value) {
      console.log('[战斗] 敌人回合结束，切换到玩家');
      phase.value = 'player';
      processTurnStart();
    }
  } catch (e) {
    console.error('[Combat] Critical error in processEnemyTurn:', e);
    addLog('[系统] 敌方回合发生严重错误，强制结束。');
    phase.value = 'player';
  }
}

function checkWinLoss() {
  if (isGameOver.value) return; // 防止因 DoT 或多次追击导致重复结算喵

  if (enemies.value.every((e) => e.hp <= 0)) {
    isGameOver.value = true;
    gameResult.value = 'win';

    // 触发生命周期钩子：onCombatWin (结算战后天赋、词条奖励等)
    if (player.value) {
      applyLifecycleHook('onCombatWin', player.value, {
        attacker: player.value,
        turn: turn.value,
        onLog: (msg) => addLog(msg),
        onPopup: (target, val, type) => addPopup(target as UICombatant, val, type)
      });
    }

    // 延迟拉起最终大幕，留出 2.5 秒供敌人破碎、化作光粒退场喵
    setTimeout(() => {
      if (isGameOver.value && gameResult.value === 'win') {
        showResultScreen.value = true;
      }
    }, 2500);

  } else if (player.value && player.value.hp <= 0) {
    isGameOver.value = true;
    gameResult.value = 'loss';

    // 战败可以快一点，但也要给个 1.5 秒的震惊/倒下缓冲期喵
    setTimeout(() => {
      if (isGameOver.value && gameResult.value === 'loss') {
        showResultScreen.value = true;
      }
    }, 1500);
  }
}

function closeCombat() {
  const finalCombatants = combatState.value?.combatants || [];
  const isTutorial = combatState.value?.tutorialMode;

  audioManager.stopBgm();

  if (isTutorial) {
    console.log('[CombatOverlay] 教学模式结束，跳过数据持久化与回写喵。');
    gameStore.updateState({
      system: {
        ...gameStore.state.system,
        combat: null
      }
    });
    emit('close');
    return;
  }

  // 1. 玩家侧核心数值回写与战后成长核算 (Player Stats Sync & Growth)喵
  if (player.value) {
    let expGain = 0;
    let logMsg = '';

    // 实时计算并分发参战符卡的熟练度经验值 (Spell Card Proficiency Growth)喵
    if (gameResult.value === 'win' && player.value.spellCards) {
      let levelUpMsg = '';
      player.value.spellCards.forEach((spell) => {
        const { levelUp, newLevel } = addSpellExp(spell, 50);
        if (levelUp) {
          levelUpMsg += `\n- ${spell.name} 升级至 Lv.${newLevel}`;
        }
      });
      if (levelUpMsg) {
        logMsg += `【系统】战斗胜利！所有符卡获得50点经验。${levelUpMsg}\n`;
      } else {
        logMsg += `【系统】战斗胜利！所有符卡获得50点经验。\n`;
      }
    }

    // 2. 战斗熟练度与天赋点核算 (Talent Points 实际触发逻辑封装在 GameStore.applyAction 内部)
    if (gameResult.value === 'win') {
      // 胜利报酬阶梯：200 ~ 800 点 EXP
      expGain = Math.floor(Math.random() * 601) + 200;
    } else {
      // 惜败/撤退报酬阶梯：50 ~ 100 点 EXP
      expGain = Math.floor(Math.random() * 51) + 50;
    }

    if (expGain > 0) {
      logMsg += `【系统】获得战斗熟练度经验: ${expGain} 点。`;
      gameStore.applyAction({
        type: 'UPDATE_PLAYER',
        field: 'combatExp',
        op: 'add',
        value: expGain
      });
    }

    if (logMsg) {
      addLog(logMsg);
    }

    gameStore.updatePlayer({
      hp: player.value.hp,
      mp: player.value.mp,
      spell_cards: player.value.spellCards
    });
  }

  // 2. 敌方单位状态持久化同步 (NPC Database Persistence Sync)喵
  for (const enemy of enemies.value) {
    if (enemy.id && gameStore.state.npcs[enemy.id]) {
      gameStore.applyAction({
        type: 'UPDATE_NPC',
        npcId: enemy.id,
        field: 'hp',
        op: 'set',
        value: Math.max(0, enemy.hp)
      });
    }
  }

  // 3. 凝练战斗回顾简报，为叙事驱动引擎提供上下文锚点 (Combat Summary Generation)喵
  const logsText =
    combatState.value?.logs.map((l) => `[第${l.turn}回合] ${l.description}`).join('\n') ||
    '（无战斗记录）';

  const resultSummary =
    `战斗结束。结果：${gameResult.value === 'win' ? '胜利' : '失败'}。` +
    `剩余HP: ${player.value?.hp}。\n\n【战斗日志】\n${logsText}`;

  gameStore.updateState({
    system: {
      ...gameStore.state.system,
      minigame_triggered: true,
      minigame_result: resultSummary,
      combat: null
    }
  });

  emit('close');
  gameLoop.handleCombatCompletion(resultSummary, finalCombatants);
}
</script>

<style scoped>
/* 沿用自 CombatSandbox 的核心战斗 CSS 动画/切图方案库 */
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

.clip-hexagon {
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
}
.clip-diamond {
  clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
}
.clip-pentagon {
  clip-path: polygon(0 0, 100% 0, 80% 100%, 20% 100%);
}
.clip-pentagon-core {
  clip-path: polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%);
}
.clip-wedge {
  /* 根据需求，此处修正为正方形切口 (Square) */
  clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%);
}

.clip-rect-left {
  clip-path: polygon(10% 0, 100% 0, 100% 100%, 0% 100%);
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

.clip-shard-diag-1 {
  clip-path: polygon(100% 0, 0 0, 0 100%);
}
.clip-shard-diag-2 {
  clip-path: polygon(100% 0, 0 0, 100% 100%);
}
.clip-hud-left {
  clip-path: polygon(0 0, 100% 0, 85% 100%, 0 100%);
}
.clip-hud-right {
  clip-path: polygon(15% 0, 100% 0, 100% 100%, 0 100%);
}

/* 战斗开场 VS 分屏动画专有样式 */
.clip-split-left {
  clip-path: polygon(0 0, 70% 0, 30% 100%, 0 100%);
}
.clip-split-right {
  clip-path: polygon(70% 0, 100% 0, 100% 100%, 30% 100%);
}

.animate-bg-slide-left {
  animation: bgSlideLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.animate-bg-slide-right {
  animation: bgSlideRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.animate-char-slide-left {
  animation: charSlideLeft 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s backwards;
}
.animate-char-slide-right {
  animation: charSlideRight 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.4s backwards;
}
.animate-slam {
  animation: slam 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 1.2s backwards;
}
.animate-flash-out {
  animation: flashOut 3.5s ease-out forwards;
}
.animate-pulse-fast {
  animation: pulse 0.1s infinite;
}

.drop-shadow-white {
  text-shadow: 4px 4px 0px rgba(255, 255, 255, 1);
}
.drop-shadow-red {
  text-shadow: 4px 4px 0px rgba(220, 38, 38, 1);
}

.animate-float {
  animation: float 6s ease-in-out infinite;
}
.animate-float-delayed {
  animation: float 6s ease-in-out infinite 3s;
}
.animate-pulse-slow {
  animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
.animate-shake {
  animation: shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
}
.animate-slash {
  animation: slash 0.3s ease-out forwards;
}
.animate-flash-fade {
  animation: flashFade 0.3s ease-out forwards;
}
.animate-spell-burst {
  animation: spellBurst 1s ease-out forwards;
}
.animate-damage-pop {
  animation: damagePop 0.8s cubic-bezier(0.2, 0.9, 0.3, 1) forwards;
}
.animate-shatter-1 {
  animation: shatter1 2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.animate-shatter-2 {
  animation: shatter2 2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.animate-bounce-in {
  animation: bounceIn 0.5s cubic-bezier(0.68, -0.55, 0.27, 1.55) forwards;
}

@keyframes shake {
  10%,
  90% {
    transform: translate3d(-10px, -5px, 0);
  }
  20%,
  80% {
    transform: translate3d(10px, 5px, 0);
  }
  30%,
  50%,
  70% {
    transform: translate3d(-15px, 5px, 0);
  }
  40%,
  60% {
    transform: translate3d(15px, -5px, 0);
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

@keyframes flashFade {
  0% {
    opacity: 1;
    filter: brightness(2);
  }
  100% {
    opacity: 0;
  }
}

@keyframes spellBurst {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  50% {
    transform: scale(1.2);
    opacity: 1;
  }
  100% {
    transform: scale(1.5);
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

/* 战斗心流 (Combat Flow) 状态机专用视觉动画集 */
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

.animate-burning {
  animation: burning-pulse 1.5s infinite ease-in-out;
}

.animate-fire-flicker {
  animation: fire-flicker 0.4s infinite ease-in-out;
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

.mix-blend-hard-light {
  mix-blend-mode: hard-light;
}

/* 新增：符卡特技通用动效库 (Spell Effect Animations) */
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
.animate-ping-fast {
  animation: ping-fast 0.6s cubic-bezier(0, 0, 0.2, 1) infinite;
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

@keyframes bounceIn {
  0% {
    transform: scale(0.5);
    opacity: 0;
  }
  60% {
    transform: scale(1.1);
    opacity: 1;
  }
  100% {
    transform: scale(1);
  }
}

@keyframes bgSlideLeft {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
}
@keyframes bgSlideRight {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}
@keyframes charSlideLeft {
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
@keyframes charSlideRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
@keyframes slam {
  0% {
    transform: scale(3) rotate(-20deg);
    opacity: 0;
  }
  100% {
    transform: scale(1) rotate(0deg);
    opacity: 1;
  }
}
@keyframes flashOut {
  0% {
    opacity: 1;
  }
  10% {
    opacity: 0;
  }
  90% {
    opacity: 0;
  }
  100% {
    opacity: 0.5;
  } /* Slight fade back for transition? No, better 0 */
}
/* 覆盖 flashOut 以实现更平滑的淡出过渡 */
@keyframes flashOut {
  0% {
    opacity: 1;
  }
  15% {
    opacity: 0;
  }
  85% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  } /* 逻辑校验：此处应确保遮罩层最终处于全白状态以衔接后续转场喵 */
}
/* 
   逻辑修正：Flash 遮罩层应当以全白（不透明度 1）起始，随后立即向透明过渡。
   通常流程：
   1. 序章开启 -> 屏幕全白 -> 逐渐显现 VS 战场画面。
   2. VS 画面动画播放中。
   3. 战斗正式切入 -> 屏幕全白 -> 逐渐显现 3D/2D 战斗环境。
   
   简易演化方案：
   Flash Out (起始点逻辑): 全白 -> 完全透明喵
*/
@keyframes flashOut {
  0% {
    opacity: 1;
  }
  20% {
    opacity: 0;
  }
  100% {
    opacity: 0;
  }
}

.intro-fade-enter-active,
.intro-fade-leave-active {
  transition: opacity 0.5s ease;
}

.intro-fade-enter-from,
.intro-fade-leave-to {
  opacity: 0;
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

/* 为 HUD 作战日志自定义滚动条样式 (如果容器溢出) */
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

/* 战斗日志条目进场/退场过渡 (日志流转 - Log Transitions)喵 */
.log-fade-enter-active,
.log-fade-leave-active {
  transition: all 0.5s ease;
}
.log-fade-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}
.log-fade-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}
.mask-image-fade {
  mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
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

.animate-slide-in-left {
  animation: slideInLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes slideInLeft {
  from {
    transform: translateX(-50px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

/* --- 战斗视觉动效实体层 (New Combat Effects) --- */

/* 1. 物理斩击连段 - P5 (Persona 5) 风格实现 */
.clip-starburst {
  clip-path: polygon(
    50% 0%,
    61% 35%,
    98% 35%,
    68% 57%,
    79% 91%,
    50% 70%,
    21% 91%,
    32% 57%,
    2% 35%,
    39% 35%
  );
}
.clip-jagged-slash-1 {
  clip-path: polygon(0% 20%, 20% 0%, 100% 40%, 90% 100%, 0% 80%);
}
.clip-jagged-slash-2 {
  clip-path: polygon(20% 0%, 80% 0%, 100% 80%, 40% 100%, 0% 20%);
}

.animate-slash-combo-1 {
  animation: slashCombo1 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.animate-slash-combo-2 {
  animation: slashCombo2 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.1s forwards;
}
.animate-slash-combo-3 {
  animation: slashCombo3 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s forwards;
}

@keyframes slashCombo1 {
  0% {
    transform: scale(0) rotate(20deg) translate(-50px, -50px);
    opacity: 0;
  }
  30% {
    transform: scale(1.5) rotate(20deg) translate(0, 0);
    opacity: 1;
  }
  100% {
    transform: scale(1.2) rotate(20deg) translate(20px, 20px);
    opacity: 0;
  }
}
@keyframes slashCombo2 {
  0% {
    transform: scale(0) rotate(-20deg) translate(50px, -50px);
    opacity: 0;
  }
  30% {
    transform: scale(1.5) rotate(-20deg) translate(0, 0);
    opacity: 1;
  }
  100% {
    transform: scale(1.2) rotate(-20deg) translate(-20px, 20px);
    opacity: 0;
  }
}
@keyframes slashCombo3 {
  0% {
    transform: scale(0) rotate(0deg);
    opacity: 0;
  }
  40% {
    transform: scale(1.5) rotate(180deg);
    opacity: 1;
  }
  100% {
    transform: scale(2) rotate(180deg);
    opacity: 0;
  }
}

/* 2. 嘴遁 (Talk/Zuidun) 专属弹幕动效 */
.animate-word-projectile {
  animation: wordProjectile 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.animate-word-impact {
  animation: wordImpact 0.3s ease-out forwards;
}

@keyframes wordProjectile {
  0% {
    transform: translateX(-100vw) scale(0.5) rotate(-10deg);
    opacity: 0;
    filter: blur(10px);
  }
  60% {
    transform: translateX(0) scale(1.2) rotate(0deg);
    opacity: 1;
    filter: blur(0);
  }
  80% {
    transform: translateX(20px) scale(1) rotate(5deg);
  }
  100% {
    transform: translateX(0) scale(1) rotate(0deg);
    opacity: 0;
  }
}

/* 3. 终极冲击 (Ultimate Impact) 环境震荡波 */
.animate-beam-expand {
  animation: beamExpand 1.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
.animate-screen-shatter {
  animation: screenShatter 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
}

@keyframes beamExpand {
  0% {
    transform: scaleX(0);
    opacity: 0;
  }
  10% {
    transform: scaleX(0.1);
    opacity: 1;
    background: white;
  }
  30% {
    transform: scaleX(1.5);
    background: yellow;
  }
  100% {
    transform: scaleX(2);
    opacity: 0;
  }
}

@keyframes screenShatter {
  0% {
    transform: translate(0, 0) rotate(0);
    filter: hue-rotate(0deg);
  }
  25% {
    transform: translate(-20px, 20px) rotate(-2deg);
    filter: hue-rotate(90deg) invert(1);
  }
  50% {
    transform: translate(20px, -20px) rotate(2deg);
    filter: hue-rotate(180deg) invert(0);
  }
  75% {
    transform: translate(-10px, -10px) rotate(-1deg);
    filter: hue-rotate(270deg) invert(1);
  }
  100% {
    transform: translate(0, 0) rotate(0);
    filter: hue-rotate(0deg) invert(0);
  }
}

/* 4. 受击火花反馈 (击中火星 - Hit Spark) 原子动效喵 */
.animate-hit-spark {
  animation: hitSpark 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
@keyframes hitSpark {
  0% {
    transform: scale(0.2) rotate(0deg);
    opacity: 1;
  }
  30% {
    transform: scale(1.8) rotate(45deg);
    opacity: 1;
  }
  100% {
    transform: scale(1.5) rotate(45deg);
    opacity: 0;
  }
}

/* 队友堆叠列表项的移动与布局过渡 (List Transitions) */
.list-complete-move,
.list-complete-enter-active,
.list-complete-leave-active {
  transition: all 0.5s cubic-bezier(0.55, 0, 0.1, 1);
}

.list-complete-enter-from,
.list-complete-leave-to {
  opacity: 0;
  transform: translateY(30px) scale(0.9);
}

.list-complete-leave-active {
  position: absolute;
}

/* 5. 结算画面 (Game Over / Stage Clear) 分段式出场特效 */
@keyframes title-slide-left {
  0% { transform: translateX(0) scale(1.4); opacity: 0; filter: blur(10px); }
  10% { transform: translateX(0) scale(1); opacity: 1; filter: drop-shadow(0 0 50px rgba(255,255,255,0.8)); }
  45% { transform: translateX(0) scale(1); opacity: 1; filter: blur(0); }
  60% { transform: translateX(-25vw) scale(0.85); opacity: 1; filter: blur(1px); }
  100% { transform: translateX(-25vw) scale(0.85); opacity: 1; filter: blur(0); }
}
.animate-title-sequence {
  animation: title-slide-left 4.5s cubic-bezier(0.25, 1, 0.5, 1) forwards;
}

@keyframes buttons-appear {
  0% { opacity: 0; transform: translateX(40px); pointer-events: none; filter: blur(10px); }
  55% { opacity: 0; transform: translateX(40px); pointer-events: none; filter: blur(5px); }
  70% { opacity: 1; transform: translateX(0); pointer-events: auto; filter: blur(0); }
  100% { opacity: 1; transform: translateX(0); pointer-events: auto; filter: blur(0); }
}
.animate-buttons-sequence {
  animation: buttons-appear 4.5s cubic-bezier(0.25, 1, 0.5, 1) forwards;
}
</style>

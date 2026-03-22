<template>
  <div v-if="showOverlay" class="fixed inset-0 z-50 font-sans overflow-hidden animate-fade-in">
    <!-- Combat Request Dialog -->
    <CombatRequestDialog
      v-if="isPending"
      :enemyNames="enemyNames"
      :isMultiplayer="gameStore.multiplayer.isMultiplayer"
      :isHost="gameStore.multiplayer.isHost"
      @start-combat="startCombat"
      @skip-combat="skipCombat"
    />

    <!-- Main Combat Container -->
    <div
      v-else-if="isActive"
      class="absolute inset-0 bg-black text-white font-sans overflow-hidden"
    >
      <!-- Dynamic Background Layer -->
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

      <!-- Combat Intro Animation (VS Screen) -->
      <CombatIntroScreen
        :show="showIntro"
        :playerName="player?.name || 'Reimu'"
        :playerSpriteUrl="getSpriteUrl('主角')"
        :enemyName="enemies[0]?.name || 'Unknown'"
        :enemySpriteUrl="getSpriteUrl(enemies[0]?.name)"
        :defaultSprite="defaultSprite"
      />

      <!-- Cut-in Overlays (Ultimate, Skill, Combat Flow) -->
      <CombatCutins
        :showUltimate="showUltimateCutin"
        :ultimateData="ultimateCutinData"
        :showSkill="showSkillCutin"
        :skillData="skillCutinData"
        :showCombatFlow="showCombatFlowAnim"
        :combatFlowPhase="combatFlowPhase"
        :playerSpriteUrl="getSpriteUrl('主角')"
      />

      <!-- Layer 0: Background -->
      <div class="absolute inset-0 bg-gradient-to-br from-red-900/20 via-black to-blue-900/20 z-0">
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

      <!-- Layer 1: Battlefield (Characters + Effects) -->
      <div
        class="absolute inset-0 z-10 overflow-hidden pointer-events-none transition-transform duration-100"
        :class="{ 'animate-shake': isScreenShaking }"
      >
        <!-- Effect Overlay -->
        <CombatEffects :activeEffect="activeEffect" />

        <!-- Player Side -->
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

        <!-- Enemy Side -->
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

      <!-- Layer 2: UI Overlay -->
      <div class="absolute inset-0 z-20 pointer-events-none">
        <!-- Top Bar -->
        <CombatTopBar
          :turn="turn"
          :phase="phase"
          :selectionMode="selectionMode"
          :isActing="isActing"
          :isLogExpanded="isLogExpanded"
          :streamingNarrative="streamingNarrative"
          :combatLogs="combatLogs"
          :isGameOver="isGameOver"
          @toggle-log="isLogExpanded = !isLogExpanded"
          @close-combat="closeCombat"
        />

        <!-- Action Menu -->
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

        <!-- Game Over Overlay -->
        <div
          v-if="isGameOver"
          class="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-30 animate-fade-in pointer-events-auto"
        >
          <div
            class="text-8xl font-black italic font-display mb-4 animate-slam tracking-tighter"
            :class="
              gameResult === 'win'
                ? 'text-yellow-400 drop-shadow-[0_0_30px_rgba(234,179,8,0.8)]'
                : 'text-red-600 drop-shadow-[0_0_30px_rgba(220,38,38,0.8)]'
            "
          >
            {{ gameResult === 'win' ? 'VICTORY' : 'DEFEATED' }}
          </div>
          <div class="text-xl text-white/80 font-serif tracking-widest animate-fade-in-up">
            {{ gameResult === 'win' ? '战斗胜利' : '战斗失败' }}
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

// Sub-components
import CombatRequestDialog from '@/components/combat/CombatRequestDialog.vue';
import CombatIntroScreen from '@/components/combat/CombatIntroScreen.vue';
import CombatCutins from '@/components/combat/CombatCutins.vue';
import CombatEffects from '@/components/combat/CombatEffects.vue';
import CombatTopBar from '@/components/combat/CombatTopBar.vue';
import CombatActionMenu from '@/components/combat/CombatActionMenu.vue';
import CombatPlayerCard from '@/components/combat/CombatPlayerCard.vue';
import CombatEnemyCard from '@/components/combat/CombatEnemyCard.vue';

const gameStore = useGameStore();

// Watch for combat active state to sync (Host only)
watch(
  () => gameStore.state.system.combat?.isActive,
  () => {
    if (gameStore.multiplayer.isHost && gameStore.multiplayer.isMultiplayer) {
      multiplayerService.syncHostState(gameStore.state);
    }
  }
);

// Watch for combat turn changes to sync (Host only)
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
const emit = defineEmits(['close', 'combat-end']);

// --- BGM Management ---
const bgmFiles = import.meta.glob(
  '/src/assets/audio/bgm/RPG_battle/**/*.{mp3,wav,ogg,flac,m4a,aac}',
  { query: '?url', import: 'default', eager: true }
) as Record<string, string>;

// --- Background Management ---
const backgroundImages = import.meta.glob('/src/assets/images/battle_bg/*.{jpg,png,webp}', {
  query: '?url',
  import: 'default',
  eager: true
}) as Record<string, string>;

const currentBackground = computed(() => {
  // Attempt to match current location
  const location = gameStore.state.player?.location;
  console.log('[战斗界面] 背景检查 - 位置:', location);

  if (location) {
    // Try exact match first (ignoring extension)
    const exactMatch = Object.keys(backgroundImages).find((path) => {
      const filename = path.split('/').pop()?.split('.')[0];
      return filename === location;
    });
    if (exactMatch) {
      console.log('[战斗界面] 找到匹配背景:', exactMatch);
      return backgroundImages[exactMatch];
    }
  }

  // Fallback: Hakurei Shrine
  const fallback = Object.keys(backgroundImages).find((path) => path.includes('博丽神社'));
  console.log('[战斗界面] 回退至背景:', fallback);
  return fallback ? backgroundImages[fallback] : '';
});

function playCombatBgm() {
  if (!combatState.value?.bgm_suggestion) return;

  const styleKey = combatState.value.bgm_suggestion;

  // Strategy 1: Direct match (e.g. "常规", "激战")
  let matchingFiles = Object.keys(bgmFiles).filter((path) => path.includes(styleKey));

  // Strategy 2: Keyword match if direct match fails
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
    console.warn('[战斗界面] 未找到对应风格的 BGM:', styleKey);
    // Fallback to '常规' if specific style not found
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
  // [Optimization] Logic moved to GameStore.setState to handle refresh state sanitization centrally.
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

// 多人同步：处理远程 LLM Token
function handleRemoteLLMToken(e: CustomEvent) {
  const { token } = e.detail;
  if (token) {
    streamingNarrative.value += token;
    // 如果日志没展开，自动展开以便看到正在输入的文本
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
    // Mock object for animation
    const mockCombatant = {
      id: data.actorId,
      name: data.charName,
      isPlayer: data.isPlayer,
      team: data.isPlayer ? 'player' : 'enemy'
      // ... minimal required props
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

  // Find Actor
  const actor = combatState.value?.combatants.find((c) => c.ownerId === senderId);
  if (!actor) {
    console.warn('[战斗界面] 未找到发送者的角色:', senderId);
    return;
  }

  // Find Target (if any)
  let target: UICombatant | undefined;
  if (targetId) {
    const found = combatState.value?.combatants.find((c) => c.id === targetId);
    if (found) {
      target = { ...found, popups: getPopups(found.id) } as UICombatant;
    }
  }

  // Execute
  // We need to cast actor to UICombatant to match signatures, assuming it has necessary props or we add them
  const uiActor = { ...actor, popups: getPopups(actor.id) } as UICombatant;

  await executeCombatLogic(uiActor, type, payload, target);
}

// Extracted Core Logic
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

    // Update AP
    const currentAP = actor.actionPoints !== undefined ? actor.actionPoints : 2;
    updateCombatantState(actor.id, { actionPoints: Math.max(0, currentAP - 2) });

    if (target.hp <= 0) audioManager.playShatter();
    await sleep(1500);
  } else if (type === 'spell') {
    const spell = payload as SpellCard;
    const actualCost = getSpellCost(spell, actor);

    // Deduct MP
    const newMp = actor.mp - actualCost;
    actor.mp = newMp;
    updateCombatantState(actor.id, { mp: newMp });

    // Animation
    if (spell.isUltimate) {
      await playUltimateAnimation(actor, spell.name);
    } else {
      playSkillAnimation(actor, spell.name);
      await sleep(800);
    }

    // Logic
    const rect = document.body.getBoundingClientRect();

    if (spell.scope === 'aoe') {
      // AOE Logic
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

      // Apply to Targets
      // Determine if Support or Attack
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
        for (const t of targets) {
          if (spell.buffDetails) applyBuff(t, spell.buffDetails, 'buff');
          else if (typeStr === 'heal' && spell.damage > 0) {
            const newHp = Math.min(t.maxHp, t.hp + spell.damage);
            t.hp = newHp;
            updateCombatantState(t.id, { hp: newHp });
            addPopup(t, spell.damage, 'heal');
          }
        }
        addLog(`${actor.name} 释放了 ${spell.name}，支援了全员！`);
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
        addLog(`${actor.name} 释放了 ${spell.name}，攻击了所有敌人！`);
      }

      await sleep(1500);
    } else {
      // Single Target (Self or Targeted)
      // If target provided, use it. If not, assume Self (for Buffs)
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
        if (spell.buffDetails) applyBuff(finalTarget, spell.buffDetails, 'buff');
        addLog(`${actor.name} 释放了 ${spell.name}！`);
      } else {
        // Attack Logic
        await executeAction(actor, finalTarget, 'spell', spell);
      }
    }

    // Deduct AP
    const currentAP = actor.actionPoints !== undefined ? actor.actionPoints : 2;
    updateCombatantState(actor.id, { actionPoints: Math.max(0, currentAP - 2) });

    // Gain Exp
    const expGain = Math.floor(Math.random() * 6) + 5;
    const { levelUp, newLevel } = addSpellExp(spell, expGain);
    if (levelUp && actor.isPlayer) addPopup(actor, `符卡升级! Lv.${newLevel}`, 'buff');
  } else if (type === 'item') {
    const item = payload as Item;
    item.count--; // This might need syncing inventory?
    // Note: Inventory sync is handled by gameStore updates usually, but here we modify item object directly?
    // In multiplayer, Host should update inventory.
    // Assuming item object is from store.

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

    // Logic for specials
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
      addLog(`${actor.name} 对 ${target.name} 施加了【内伤】！`);
    }
    // ... other specials
    await sleep(1000);
  }

  checkTurnEnd();
}

// --- Store Integration ---
const combatState = computed(() => gameStore.state.system.combat);
const isPending = computed(() => !!combatState.value?.isPending);
const isActive = computed(() => !!combatState.value?.isActive);
const showOverlay = computed(() => {
  if (!combatState.value) return false;
  // If combat is active (started), always show
  if (isActive.value) return true;
  // If combat is pending (request stage), only show if visible prop is true
  if (isPending.value) return !!props.visible;
  return false;
});

// --- Interfaces for UI ---
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
}

// --- Local State for UI/Animations ---
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
    // 1. Try to find My Character (Owner ID match)
    p = combatState.value.combatants.find((c) => c.ownerId === myId);

    // 2. Fallback for Host: Control the main "Player" if no specific owner assigned
    if (!p && gameStore.multiplayer.isHost) {
      p = combatState.value.combatants.find((c) => c.isPlayer && !c.ownerId);
    }
  } else {
    // Single Player
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
  // Allies are anyone on 'player' team who is NOT 'player' (the current user's character)
  const myId = player.value?.id;
  return (
    combatState.value?.combatants.filter((c) => c.team === 'player' && c.id !== myId) || []
  ).map((c) => ({
    ...c,
    popups: getPopups(c.id)
  })) as UICombatant[];
});

// --- Ally Stack Management ---
const activeAllyId = ref<string | null>(null);

// Watch allies to maintain a valid activeAllyId and handle auto-switching when pinned ally dies
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

  // Sort initially: Alive first, then by name
  let list = [...allies.value].sort((a, b) => {
    if (a.hp > 0 && b.hp <= 0) return -1;
    if (a.hp <= 0 && b.hp > 0) return 1;
    return a.name.localeCompare(b.name, 'zh-CN');
  });

  // Reorder: Active ally first
  const activeIndex = list.findIndex((a) => a.id === activeAllyId.value);
  if (activeIndex > -1) {
    const [active] = list.splice(activeIndex, 1);
    if (active) list.unshift(active);
  }

  return list;
});

function activateAlly(id: string) {
  // If clicking the already active ally, cycle to the next one
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

// Data Access
const spells = computed(() => player.value?.spellCards || []);
const items = computed(() => {
  const allItems = gameStore.state.player.items || [];
  return allItems.filter((item) => {
    // Exclude special/key/equipment items explicitly
    if (['special', 'key_item', 'equipment'].includes(item.type)) return false;

    // Include if explicitly consumable or material
    if (item.type === 'consumable' || item.type === 'material') return true;

    // Include if has combat effects (fallback)
    if (
      item.effects &&
      (item.effects.heal || item.effects.hp || item.effects.mp || item.effects.buff)
    ) {
      return true;
    }

    return false;
  });
});

// Animation Refs
const currentMenu = ref<'main' | 'spell' | 'item' | 'talk' | 'special'>('main');
const isScreenShaking = ref(false);
const showIntro = ref(false); // New Intro State
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
const gameResult = ref<'win' | 'loss' | 'escape' | null>(null);
const combatLogs = ref<CombatLog[]>([]);
const isLogExpanded = ref(false);
const streamingNarrative = ref('');

// --- Enemy Queue System ---
const exitedEnemyIds = ref<string[]>([]);

const visibleEnemies = computed(() => {
  return enemies.value.filter((e) => !exitedEnemyIds.value.includes(e.id));
});

const activeEnemies = computed(() => visibleEnemies.value.slice(0, 3));
const reserveEnemies = computed(() => visibleEnemies.value.slice(3));

// Watch for deaths to trigger exit
watch(
  enemies,
  (newEnemies) => {
    newEnemies.forEach((e) => {
      if (e.hp <= 0 && !exitedEnemyIds.value.includes(e.id)) {
        // Delay exit to allow death animation (shatter) to play
        // Use a unique timeout per enemy? Simple timeout is fine.
        setTimeout(() => {
          if (!exitedEnemyIds.value.includes(e.id)) {
            exitedEnemyIds.value.push(e.id);
          }
        }, 2500); // 2.5 seconds delay (Shatter animation is ~1s, FlashOut is 3.5s? Shatter is infinite? No)
      }
    });
  },
  { deep: true }
);

// Ultimate Cut-in State
const showUltimateCutin = ref(false);
const ultimateCutinData = ref({
  isPlayer: true,
  charName: '',
  spellName: '',
  spriteUrl: ''
});

// Skill Cut-in State
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

// Watchers
watch(isActive, (val) => {
  if (val) {
    // Reset state on combat start
    isGameOver.value = false;
    gameResult.value = null;
    phase.value = 'player';
    isActing.value = false;
    selectionMode.value = false;
    currentMenu.value = 'main';
    combatLogs.value = [];
    exitedEnemyIds.value = []; // Clear exited enemies
    // Clear popups
    for (const key in popupMap) {
      popupMap[key] = [];
    }
  }
});

// --- Helpers ---
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function playCombatFlowAnimation(isRemote: boolean = false) {
  if (!isRemote && gameStore.multiplayer.isHost && gameStore.multiplayer.isMultiplayer) {
    multiplayerService.sendCombatEffect({
      type: 'combat_flow'
    });
  }

  // 1. Init
  showCombatFlowAnim.value = true;
  combatFlowPhase.value = 'start';

  // SFX: Init
  audioManager.playSkillCutin();

  // 2. Start (0-1000ms): Dim background, Character appears
  await sleep(1000);

  // 3. Impact (1000-2500ms): Text Glitch, Purple Flash
  combatFlowPhase.value = 'impact';
  audioManager.playSpellCastAoE(); // Burst sound
  // Trigger impact effect in background too
  const rect = document.body.getBoundingClientRect();
  triggerEffect('ultimate_impact', rect.width / 2, rect.height / 2, undefined, true); // Don't re-broadcast internal effect

  await sleep(2500);

  // 4. End
  combatFlowPhase.value = 'end';
  await sleep(500); // Fade out
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
    // Correct Sprite Logic: Use '主角' only if it's the player ID, otherwise use name
    spriteUrl: getSpriteUrl(combatant.id === 'player' ? '主角' : combatant.name)
  };

  // SFX
  audioManager.playSpellCast();

  // Show Cut-in
  showUltimateCutin.value = true;

  // Wait for animation (Flash + Slide + Hold)
  await sleep(2500);

  // Hide
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
  await sleep(800); // Shorter duration
  showSkillCutin.value = false;
}

function switchMenu(menu: 'main' | 'spell' | 'item' | 'talk' | 'special') {
  audioManager.playClick();
  currentMenu.value = menu;
  selectionMode.value = false;
  pendingAction.value = null;
}

function addLog(content: string, isRemote: boolean = false) {
  // Clear streaming narrative when a final log entry is added
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
  // Removed limit to allow full history viewing
  // if (combatLogs.value.length > 5) combatLogs.value.pop();

  // Sync to Store (Full History for LLM)
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

  // 1. Spell Level-based reduction (0% - 29%)
  if (spell.level && spell.level > 1) {
    baseReduction += getLevelCostReduction(spell.level);
  }

  // 2. Buff-based reduction (Legacy manual check - kept for backward compatibility if needed)
  if (combatant.buffs) {
    combatant.buffs.forEach((b) => {
      b.effects.forEach((e) => {
        if (e.type === 'stat_mod' && e.targetStat === 'mp_cost_reduction') {
          baseReduction += e.value;
        }
      });
    });
  }

  // Apply first layer of reduction
  let finalCost = spell.cost * (1 - Math.min(1.0, baseReduction));

  // 3. New: Lifecycle Hook for MP Cost Reduction (e.g. BOMB专家, 灵力回收)
  const context = {
    attacker: combatant as Combatant,
    spell,
    actionType: spell.isUltimate ? 'ultimate' : ('spell' as any),
    spellType: spell.isUltimate ? 'ultimate' : ((spell.type || 'normal') as any)
  };
  finalCost = applyStatModifiers(finalCost, 'onCalculateMpCost', combatant as Combatant, context);

  // 4. Combat Level-based reduction (Layer 2, multiplicative)
  // Starts from Level 51, up to 25% at Level 100
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

// --- Visual Style Helpers ---
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
    // Normalize coordinates
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

// --- Combat Logic ---

function startCombat() {
  if (combatState.value) {
    // Trigger Intro First
    showIntro.value = true;
    playIntroSequence();

    // Trigger onCombatStart for all participants
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
  // 1. Initial Burst
  audioManager.playChime();

  // 2. Slide In (Left/Right)
  await sleep(200);
  audioManager.playSlash(); // Left
  await sleep(400);
  audioManager.playSlash(); // Right

  // 3. VS Slam
  await sleep(600);
  audioManager.playHeavyHit();
  triggerShake();

  // 4. Hold & Fade
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

// --- Helper to Sync State ---
function updateCombatantState(id: string, updates: Partial<Combatant>) {
  // Validate inputs to prevent NaN propagation
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

  // 1. Update Store Combat State (Source of Truth for Combat)
  if (combatState.value) {
    const storeCombatant = combatState.value.combatants.find((c) => c.id === id);
    if (storeCombatant) {
      Object.assign(storeCombatant, updates);

      // Sync immediately for HP changes if Host
      if (gameStore.multiplayer.isHost && gameStore.multiplayer.isMultiplayer) {
        // Debounce or sync? HP changes can be frequent (multi-hit).
        // But syncHostState sends the whole state.
        // Let's rely on the watchers on isActive/turn or manual trigger.
        // Or maybe trigger here for critical updates?
        // Let's debounce sync.
        multiplayerService.syncHostState(gameStore.state);
      }
    }
  }

  // 2. Update Global State (Player or NPC)
  // Find if it's player
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
    // It's an NPC (or Enemy)
    // Always try to update/create the NPC in store.
    // This ensures that even ephemeral enemies (from Static DB) get their state persisted,
    // preventing the "HP: ?" issue in CharacterList if they are added to the scene later.
    if (updates.hp !== undefined) {
      gameStore.applyAction({
        type: 'UPDATE_NPC',
        npcId: id,
        field: 'hp',
        op: 'set',
        value: updates.hp
      });
    }
    if (updates.mp !== undefined) {
      // Only update MP if the store supports it for NPCs (currently UPDATE_NPC might strictly check fields)
      // But let's try it, as gameStore might ignore invalid fields gracefully or we can add it.
      // Looking at gameStore, 'mp' is NOT in STRICT_NPC_NUMERIC_FIELDS (hp, max_hp, favorability, obedience).
      // But it might be allowed as a generic field.
      // However, NPCs usually don't track MP in this system (they use cooldowns/patterns).
      // But if we want to track it, we can.
      // For now, let's skip MP to avoid clutter/warnings if not supported, unless necessary.
      // Actually, gameStore UPDATE_NPC allows generic fields.
      // But let's focus on HP which is the reported issue.
    }
  }
}

// --- Helper to Apply Shield Logic (Shield Gate) ---
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
    // Shield Break
    target.shield = 0;
    audioManager.playShatter();
    addPopup(target, damageToShield, 'buff');
    if (!isAoE) addLog(`${attacker.name} ${actionName}，击碎了 ${target.name} 的护盾！`);
  } else {
    // Shield Reduce
    target.shield -= damage;
    addPopup(target, damage, 'buff');
    if (!isAoE) addLog(`${attacker.name} ${actionName}，造成了 ${damage} 点护盾伤害！`);
  }

  updateCombatantState(target.id, { shield: target.shield });

  // Shield Gate: Absorbs ALL damage if shield was present
  return 0;
}

// Core Logic Wrapper
async function executeAction(
  attacker: Combatant,
  defender: UICombatant,
  actionName: string = '普通攻击',
  spell?: SpellCard
) {
  // Determine number of attacks
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

    // Use existing service logic for calculation
    const result = calculateDamage(attacker, defender, spell);

    // Apply Spell Effects (Debuffs or Buffs) - Only on first hit for multi-hit spells if any
    if (spell && spell.buffDetails && i === 0) {
      // Fix: Determine type based on spell type (buff/shield/heal -> buff, attack/debuff -> debuff)
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
        defender.hp = newHp; // Local visual update
        updateCombatantState(defender.id, { hp: newHp });

        addPopup(defender, remainingDamage, 'damage');

        // Trigger Hit Spark
        const isPlayer = defender.isPlayer || defender.team === 'player';
        const rect = document.body.getBoundingClientRect();
        const targetX = isPlayer ? rect.width * 0.25 : rect.width * 0.75;
        const targetY = rect.height * 0.4;

        triggerEffect('hit', targetX, targetY);
        addLog(result.description);
      }
    }

    // Handle Heal
    if (result.heal > 0) {
      const newHp = Math.min(defender.maxHp, defender.hp + result.heal);
      defender.hp = newHp;
      updateCombatantState(defender.id, { hp: newHp });

      addPopup(defender, result.heal, 'heal');
      addLog(`${attacker.name} ${actionName}，恢复了 ${result.heal} 点HP！`);
    } else if (result.damage <= 0) {
      // Handle Miss / 0 Damage (Only if no damage and no heal)
      if (result.isHit && spell && spell.buffDetails) {
        addPopup(defender, spell.buffDetails.name, 'buff');
        addLog(result.description);
      } else if (result.isHit) {
        addPopup(defender, '0', 'damage');
        addLog(result.description);
      } else {
        addPopup(defender, 'MISS', 'damage');
        addLog(
          result.description || `${attacker.name} 的${actionName}对 ${defender.name} 未命中！`
        );
      }
    }

    // P-Point Gain Logic (Player Normal Attack)
    if ((attacker.isPlayer || attacker.team === 'player') && !spell) {
      // Gain P-points even if missed (60% gain on miss)
      let pGain = calculatePPointGain(attacker, result.damage);

      if (!result.isHit) {
        pGain *= 0.6; // 60% penalty for missing
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

// --- Helper to Apply Buffs ---
function applyBuff(target: UICombatant, buffDetails: any, type: 'buff' | 'debuff' = 'buff') {
  if (!buffDetails) return;

  // Check for Immediate Effects (Shield, Instant Heal)
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
        // Instant Heal
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

// Main Action Handler (Player)
async function handleAction(type: string, payload?: any) {
  if (isActing.value || phase.value !== 'player') return;
  if (!player.value) return;

  // AP Check
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
      // Special Case: Self-Buff / Shield / Heal (Immediate Execution) - Non-AOE only
      if (
        (spell.type === 'buff' || spell.type === 'shield' || spell.type === 'heal') &&
        spell.scope !== 'aoe'
      ) {
        // Immediate
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
        // Immediate AOE
        if (gameStore.multiplayer.isMultiplayer && !gameStore.multiplayer.isHost) {
          multiplayerService.sendCombatAction(type, payload);
          return;
        }

        isActing.value = true;
        currentMenu.value = 'main';
        await executeCombatLogic(player.value, type, payload);
        isActing.value = false;
      } else {
        // Single Target -> Selection Mode
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

    // Safety Check
    if (['special', 'key_item', 'equipment'].includes(item.type)) {
      addPopup(player.value, '不可使用', 'damage');
      return;
    }

    if (item.count > 0) {
      // Immediate (Self-Use)
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

// Talk Logic
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

  // Cost Check
  const currentP = p.pPoints || 0;
  const currentAP = p.actionPoints !== undefined ? p.actionPoints : 2;

  if (currentP < skill.costP) {
    addPopup(p, 'P点不足', 'damage');
    audioManager.playSoftClick(); // Or error sound
    return;
  }
  if (currentAP < skill.costAP) {
    addPopup(p, 'AP不足', 'damage');
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

  // Play Skill Animation
  playSkillAnimation(player.value, skill.name, true);
  await sleep(800);

  try {
    const baseDmg = getBaseDamage(player.value.power);

    if (skill.id === 'active_defense') {
      const shieldVal = Math.round(0.5 * baseDmg);
      player.value.shield = (player.value.shield || 0) + shieldVal;
      updateCombatantState(player.value.id, { shield: player.value.shield });

      const rect = document.body.getBoundingClientRect();
      triggerEffect('spell', rect.width * 0.25, rect.height * 0.6); // Visual

      addPopup(player.value, shieldVal, 'buff');
      addLog(`${player.value.name} 发动【主动防御】，获得了 ${shieldVal} 点护盾！`);
      audioManager.playHeal();

      await sleep(1000);
      checkTurnEnd();
    } else if (skill.id === 'indomitable_will') {
      const healVal = Math.round(1.0 * baseDmg);
      const newHp = Math.min(player.value.maxHp, player.value.hp + healVal);
      player.value.hp = newHp;
      updateCombatantState(player.value.id, { hp: newHp });

      // Buff: 60% Damage Reduction for 2 turns
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
      triggerEffect('spell', rect.width * 0.25, rect.height * 0.6); // Visual

      addPopup(player.value, healVal, 'heal');
      addLog(`${player.value.name} 发动【不屈意志】，恢复了 ${healVal} 点生命并获得了伤害减免！`);
      audioManager.playHeal();

      await sleep(1000);
      checkTurnEnd();
    } else if (skill.id === 'combat_flow') {
      // Play Animation
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

  // Debug Command: /debug buff
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

    // Log Narrative
    addLog(`[嘴遁] ${result.narrative}`);

    // Apply Effects
    for (const effect of result.effects) {
      console.log('[HandleTalk] Processing Effect:', effect);

      if (effect.target === 'ally' || effect.target === 'all_allies') {
        // Find targets
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
        // Find targets
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

              // Hit Sound & Effect
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
            target.hp = 0; // Force defeat for simplicity
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
          console.log('[HandleTalk] Adding Buff to Player:', newBuff);
          player.value.buffs.push(newBuff);
          updateCombatantState(player.value.id, { buffs: player.value.buffs });
          addPopup(player.value, newBuff.name, 'buff');
          addLog(`${player.value.name} 获得了状态：${newBuff.name}！`);
        } else if (effect.type === 'escape') {
          gameResult.value = 'escape';
          isGameOver.value = true;
          addLog(`${player.value.name} 成功逃脱了！`);
        }
      }
    }

    await sleep(2000);

    // Deduct Costs (AP: 2, P: 15)
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
    console.error('Talk failed', error);
    addLog('嘴遁失败，由于未知的力量干扰...');
  } finally {
    isProcessingTalk.value = false;
    talkInput.value = '';
    currentMenu.value = 'main';
  }
}

// Target Selection & Execution
async function selectTarget(target: UICombatant) {
  if (!selectionMode.value || !pendingAction.value || isActing.value || phase.value !== 'player')
    return;
  if (target.hp <= 0) return;

  const { type, payload } = pendingAction.value;

  // Start Sequence
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
    // IMPORTANT: Reset isActing to allow UI interaction if turn hasn't ended
    // This is now in finally block to ensure it runs
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

      // Check for allies
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
    // Allow more actions
    isActing.value = false;
    currentMenu.value = 'main';
    selectionMode.value = false;
  }
}

// Turn Management
function processTurnStart() {
  if (!combatState.value) return;

  // Reset Player AP at start of Player Phase
  if (phase.value === 'player' && player.value) {
    updateCombatantState(player.value.id, { actionPoints: 2 });
  }

  const allCombatants = [player.value, ...allies.value, ...enemies.value].filter(
    (c) => c !== null
  ) as UICombatant[];

  for (const c of allCombatants) {
    const prevHp = c.hp;
    const prevMp = c.mp || 0;

    // Trigger onTurnStart lifecycle hooks (handles DoT, HoT, and other turn-based talent effects)
    applyLifecycleHook('onTurnStart', c, {
      attacker: c,
      turn: turn.value,
      onLog: (msg) => addLog(msg),
      onPopup: (target, val, type) => addPopup(target as UICombatant, val, type)
    });

    if (!c.buffs || c.buffs.length === 0) {
      // Even if no buffs, we need to sync HP/MP changes from talents or other hooks
      if (c.hp !== prevHp || (c.mp || 0) !== prevMp) {
        updateCombatantState(c.id, { hp: c.hp, mp: c.mp });
      }
      continue;
    }

    const expiredBuffs: Buff[] = [];
    const activeBuffs: Buff[] = [];
    let changed = false;

    for (const buff of c.buffs) {
      // Duration Logic Optimization:
      // Ensure buffs last for full round cycles by skipping decrement if applied recently
      let shouldDecrement = true;
      if (buff.createdTurn !== undefined && combatState.value) {
        const currentTurn = combatState.value.turn;
        if (c.isPlayer) {
          // Player buffs created in previous turn (currentTurn - 1) should not decrement yet
          // This ensures they last for the current turn + future turns
          if (buff.createdTurn === currentTurn - 1) {
            shouldDecrement = false;
          }
        } else {
          // Enemy buffs created in current turn (Enemy Phase) should not decrement yet
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

    // Sync both buffs and potential HP/MP changes from DoT/HoT hooks
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

  // Check for deaths caused by DoT/Buffs at the start of turn
  checkWinLoss();
}

// Ally Turn Automation
async function processAllyTurn() {
  if (phase.value !== 'ally') return;

  console.log('[战斗] 盟友回合处理开始');

  try {
    await sleep(500);

    const aliveAllies = allies.value.filter((a) => a.hp > 0);

    for (const ally of aliveAllies) {
      if (isGameOver.value) break;

      // Define Opponents (Enemies)
      const opponents = enemies.value.filter((e) => e.hp > 0);
      if (opponents.length === 0) break;

      // Define Friends (Player + Other Allies)
      const friends: UICombatant[] = [];
      if (player.value && player.value.hp > 0) friends.push(player.value);
      friends.push(...allies.value.filter((a) => a.id !== ally.id && a.hp > 0));
      // Add self to friends for self-buffs
      friends.push(ally);

      // AI Logic
      let action: 'attack' | 'spell' = 'attack';
      let selectedSpell: SpellCard | undefined;
      let isUltimateTrigger = false;

      console.log(
        `[Combat AI Ally] ${ally.name} (HP: ${ally.hp}) thinking. Spells available: ${ally.spellCards?.length || 0}`
      );
      if (ally.spellCards && ally.spellCards.length > 0) {
        console.log(
          `[Combat AI Ally] Spell list: ${ally.spellCards.map((s) => s.name).join(', ')}`
        );
      }

      // 1. Ultimate Trigger Check (HP < 40%)
      if (ally.hp < ally.maxHp * 0.4 && !ally.hasUsedUltimate) {
        const ult = ally.spellCards?.find((s) => s.isUltimate);
        if (ult) {
          selectedSpell = ult;
          action = 'spell';
          isUltimateTrigger = true;
        }
      }

      // 2. Regular AI (60% Attack, 40% Spell)
      if (!selectedSpell) {
        if (ally.spellCards && ally.spellCards.length > 0 && Math.random() < 0.4) {
          // Use random non-ultimate spell
          const regularSpells = ally.spellCards.filter((s) => !s.isUltimate);
          if (regularSpells.length > 0) {
            selectedSpell = regularSpells[Math.floor(Math.random() * regularSpells.length)];
            action = 'spell';
          }
        }
      }

      // 3. Target Selection
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
        // Attack
        if (opponents.length > 0) {
          const randomOpponent = opponents[Math.floor(Math.random() * opponents.length)];
          if (randomOpponent) targets = [randomOpponent];
        }
      }

      if (targets.length === 0) continue;

      // 4. Execution
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

        // Cast Sound
        if (isAoE) audioManager.playSpellCastAoE();
        else audioManager.playSpellCastSingle();

        // Visuals
        if (isUltimateTrigger || isAoE) {
          if (isSupport) {
            // Center on self/allies (Left side)
            triggerEffect('spell_aoe', rect.width * 0.25, rect.height * 0.5);
          } else {
            // Center on enemies (Right side)
            triggerEffect('spell_aoe', rect.width * 0.75, rect.height * 0.5);
          }
        } else {
          // Single Target Effect
          const t = targets[0];
          let tx = rect.width * 0.5;
          let ty = rect.height * 0.5;
          if (t) {
            // Estimate position based on team
            // Ally attacking Enemy -> Enemy side (Right)
            // Ally buffing Ally -> Ally side (Left)
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
          }
        }

        // Apply to all targets
        for (const target of targets) {
          await executeAction(ally, target, selectedSpell.name, selectedSpell);
        }
      } else {
        // Regular Attack
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
    // Fallback to enemy phase
    phase.value = 'enemy';
    processEnemyTurn();
  }
}

// Enemy Turn Automation
async function processEnemyTurn() {
  if (phase.value !== 'enemy') return;

  console.log('[战斗] 敌人回合处理开始');

  try {
    // Simulate thinking
    await sleep(800);

    const aliveEnemies = enemies.value.filter((e) => e.hp > 0);

    for (const enemy of aliveEnemies) {
      try {
        if (isGameOver.value) break;

        // Define Opponents (Player + Allies)
        const opponents: UICombatant[] = [];
        if (player.value && player.value.hp > 0) opponents.push(player.value);
        opponents.push(...allies.value.filter((a) => a.hp > 0));

        if (opponents.length === 0) break;

        // Define Friends (Self + Other Enemies)
        const friends = [enemy, ...enemies.value.filter((e) => e.id !== enemy.id && e.hp > 0)];

        // AI Logic
        let action: 'attack' | 'spell' = 'attack';
        let selectedSpell: SpellCard | undefined;
        let isUltimateTrigger = false;

        console.log(
          `[Combat AI Enemy] ${enemy.name} (HP: ${enemy.hp}) thinking. Spells available: ${enemy.spellCards?.length || 0}`
        );
        if (enemy.spellCards && enemy.spellCards.length > 0) {
          console.log(
            `[Combat AI Enemy] Spell list: ${enemy.spellCards.map((s) => s.name).join(', ')}`
          );
        }

        // 1. Ultimate Trigger Check (HP < 40%)
        if (enemy.hp < enemy.maxHp * 0.4 && !enemy.hasUsedUltimate) {
          const ult = enemy.spellCards?.find((s) => s.isUltimate);
          if (ult) {
            selectedSpell = ult;
            action = 'spell';
            isUltimateTrigger = true;
          }
        }

        // 2. Regular AI (60% Attack, 40% Spell)
        if (!selectedSpell) {
          if (enemy.spellCards && enemy.spellCards.length > 0 && Math.random() < 0.4) {
            const regularSpells = enemy.spellCards.filter((s) => !s.isUltimate);
            if (regularSpells.length > 0) {
              selectedSpell = regularSpells[Math.floor(Math.random() * regularSpells.length)];
              action = 'spell';
            }
          }
        }

        // 3. Target Selection
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
          // Attack
          if (opponents.length > 0) {
            const randomOpponent = opponents[Math.floor(Math.random() * opponents.length)];
            if (randomOpponent) targets = [randomOpponent];
          }
        }

        if (targets.length === 0) continue;

        // 4. Execution
        if (action === 'spell' && selectedSpell) {
          addLog(`${enemy.name} 发动了符卡：${selectedSpell.name}！`);

          if (isUltimateTrigger) {
            updateCombatantState(enemy.id, { hasUsedUltimate: true });
            await playUltimateAnimation(enemy, selectedSpell.name);
          } else {
            await playSkillAnimation(enemy, selectedSpell.name);
          }

          if (isUltimateTrigger) audioManager.playSpellCast();

          // Visuals
          const isSupport = ['heal', 'buff', 'shield'].includes(selectedSpell.type || '');
          const rect = document.body.getBoundingClientRect();

          if (isUltimateTrigger) {
            if (isSupport) {
              // Center on self/enemies (Right side)
              triggerEffect('spell', rect.width * 0.75, rect.height * 0.5);
            } else {
              // Center on player/allies (Left side)
              triggerEffect('spell', rect.width * 0.25, rect.height * 0.5);
            }
          }

          await sleep(isUltimateTrigger ? 1500 : 300);
          if (!isSupport) {
            triggerShake();
            audioManager.playHeavyHit();
          }

          // Execute for all targets
          for (const target of targets) {
            await executeAction(enemy, target, selectedSpell.name, selectedSpell);
          }
        } else {
          // Regular Attack
          const target = targets[0];
          if (!target) continue;

          audioManager.playSlash();
          const rect = document.body.getBoundingClientRect();

          // Visual on target side
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
  if (enemies.value.every((e) => e.hp <= 0)) {
    isGameOver.value = true;
    gameResult.value = 'win';

    // Trigger onCombatWin lifecycle hook
    if (player.value) {
      applyLifecycleHook('onCombatWin', player.value, {
        attacker: player.value,
        turn: turn.value,
        onLog: (msg) => addLog(msg),
        onPopup: (target, val, type) => addPopup(target as UICombatant, val, type)
      });
    }
  } else if (player.value && player.value.hp <= 0) {
    isGameOver.value = true;
    gameResult.value = 'loss';
  }
}

function closeCombat() {
  const finalCombatants = combatState.value?.combatants || [];

  audioManager.stopBgm();

  // Sync Player
  if (player.value) {
    let expGain = 0;
    let logMsg = '';

    // 1. Spell Card EXP
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

    // 2. Combat Proficiency EXP (Talent Points are awarded inside GameStore.applyAction)
    if (gameResult.value === 'win') {
      // Win: 200-800 exp
      expGain = Math.floor(Math.random() * 601) + 200;
    } else {
      // Loss/Flee: 50-100 exp
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

  // Sync Enemies
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

  // Generate Summary
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
/* Copied styles from CombatSandbox */
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
  /* Changed to square as requested */
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

/* Intro Split Screen */
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

/* Combat Flow Animations */
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

/* New Spell Effect Animations */
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
/* Override flashOut for clean fade */
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
  } /* Wait, this is overlay on top? */
}
/* Correction: The flash overlay starts white (opacity 1) then fades to 0 immediately? 
   No, we want a flash at start? Or flash at end?
   Usually: 
   1. Intro starts -> Screen White -> Fades to VS scene.
   2. VS Scene plays.
   3. Transition to Combat -> Screen White -> Fades to Combat.
   
   Let's keep it simple: 
   Flash Out (Start): White -> Transparent
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

/* Custom Scrollbar for HUD logs if needed */
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

/* Log Transitions */
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

/* --- New Combat Effects --- */

/* 1. Slash Combo - P5 Style */
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

/* 2. Talk / Zuidun */
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

/* 3. Ultimate Impact */
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

/* 4. Hit Spark */
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

/* List Transitions for Ally Stack */
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
</style>

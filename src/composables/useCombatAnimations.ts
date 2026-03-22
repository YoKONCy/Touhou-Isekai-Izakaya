/**
 * useCombatAnimations - 战斗动画控制 Composable
 * 管理 Cut-in、特效、震屏、战斗心流等动画的触发与生命周期
 */
import { ref } from 'vue';
import { audioManager } from '@/services/audio';
import { multiplayerService } from '@/services/MultiplayerService';
import { useGameStore } from '@/stores/game';
import { findBattleSprite } from '@/services/characterMapping';
import defaultSpriteUrl from '@/assets/images/battle_sprites/其他角色.png';
import type { Combatant } from '@/types/combat';

export const defaultSprite = defaultSpriteUrl;

const characterSprites = import.meta.glob(
  '/src/assets/images/battle_sprites/*.png',
  { query: '?url', import: 'default', eager: true }
) as Record<string, string>;

export function getSpriteUrl(name?: string): string {
  if (!name) return defaultSprite;
  return findBattleSprite(name, characterSprites) || defaultSprite;
}

export function useCombatAnimations() {
  const gameStore = useGameStore();
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // --- Screen Shake ---
  const isScreenShaking = ref(false);

  async function triggerShake(isRemote = false) {
    if (!isRemote && gameStore.multiplayer.isHost && gameStore.multiplayer.isMultiplayer) {
      multiplayerService.sendCombatEffect({ type: 'shake' });
    }
    isScreenShaking.value = true;
    await sleep(500);
    isScreenShaking.value = false;
  }

  // --- Active Effect ---
  type EffectType = 'slash' | 'spell' | 'spell_aoe' | 'spell_single' | 'enemy' | 'hit' | 'hit_aoe' | 'talk' | 'ultimate_impact';

  const activeEffect = ref<{
    type: EffectType;
    x: number;
    y: number;
    show: boolean;
    extra?: string;
  }>({ type: 'slash', x: 0, y: 0, show: false });

  async function triggerEffect(type: EffectType, x: number, y: number, extra?: string, isRemote = false) {
    if (!isRemote && gameStore.multiplayer.isHost && gameStore.multiplayer.isMultiplayer) {
      const rect = document.body.getBoundingClientRect();
      multiplayerService.sendCombatEffect({
        type: 'effect',
        effectType: type,
        xRatio: x / rect.width,
        yRatio: y / rect.height,
        extra,
      });
    }
    activeEffect.value = { type, x, y, show: true, extra };

    const durations: Record<string, number> = {
      slash: 800, spell: 2200, spell_aoe: 2200, spell_single: 2200,
      ultimate_impact: 2500, talk: 2000, hit_aoe: 1000, hit: 500,
    };
    await sleep(durations[type] ?? 1000);
    activeEffect.value.show = false;
  }

  // --- Intro ---
  const showIntro = ref(false);

  async function playIntroSequence() {
    audioManager.playChime();
    await sleep(200);
    audioManager.playSlash();
    await sleep(400);
    audioManager.playSlash();
    await sleep(600);
    audioManager.playHeavyHit();
    triggerShake();
    await sleep(2500);
    showIntro.value = false;
  }

  // --- Ultimate Cut-in ---
  const showUltimateCutin = ref(false);
  const ultimateCutinData = ref({
    isPlayer: true,
    charName: '',
    spellName: '',
    spriteUrl: '',
  });

  async function playUltimateAnimation(combatant: Combatant | any, spellName: string, isRemote = false) {
    if (!isRemote && gameStore.multiplayer.isHost && gameStore.multiplayer.isMultiplayer) {
      multiplayerService.sendCombatEffect({
        type: 'ultimate_anim',
        charName: combatant.name,
        spellName,
        isPlayer: combatant.isPlayer || combatant.team === 'player',
        actorId: combatant.id,
      });
    }
    const isPlayerTeam = combatant.isPlayer || combatant.team === 'player';
    ultimateCutinData.value = {
      isPlayer: isPlayerTeam,
      charName: combatant.name,
      spellName,
      spriteUrl: getSpriteUrl(combatant.id === 'player' ? '主角' : combatant.name),
    };
    audioManager.playSpellCast();
    showUltimateCutin.value = true;
    await sleep(2500);
    showUltimateCutin.value = false;
  }

  // --- Skill Cut-in ---
  const showSkillCutin = ref(false);
  const skillCutinData = ref({
    isPlayer: true,
    isSpecial: false,
    charName: '',
    spellName: '',
    spriteUrl: '',
  });

  async function playSkillAnimation(combatant: Combatant | any, spellName: string, isSpecial = false, isRemote = false) {
    if (!isRemote && gameStore.multiplayer.isHost && gameStore.multiplayer.isMultiplayer) {
      multiplayerService.sendCombatEffect({
        type: 'skill_anim',
        charName: combatant.name,
        spellName,
        isSpecial,
        isPlayer: combatant.isPlayer || combatant.team === 'player',
        actorId: combatant.id,
      });
    }
    const isPlayerTeam = combatant.isPlayer || combatant.team === 'player';
    skillCutinData.value = {
      isPlayer: isPlayerTeam,
      isSpecial,
      charName: combatant.name,
      spellName,
      spriteUrl: getSpriteUrl(combatant.id === 'player' ? '主角' : combatant.name),
    };
    audioManager.playSkillCutin();
    showSkillCutin.value = true;
    await sleep(800);
    showSkillCutin.value = false;
  }

  // --- Combat Flow ---
  const showCombatFlowAnim = ref(false);
  const combatFlowPhase = ref('start');

  async function playCombatFlowAnimation(isRemote = false) {
    if (!isRemote && gameStore.multiplayer.isHost && gameStore.multiplayer.isMultiplayer) {
      multiplayerService.sendCombatEffect({ type: 'combat_flow' });
    }
    showCombatFlowAnim.value = true;
    combatFlowPhase.value = 'start';
    audioManager.playSkillCutin();
    await sleep(1000);
    combatFlowPhase.value = 'impact';
    audioManager.playSpellCastAoE();
    const rect = document.body.getBoundingClientRect();
    triggerEffect('ultimate_impact', rect.width / 2, rect.height / 2, undefined, true);
    await sleep(2500);
    combatFlowPhase.value = 'end';
    await sleep(500);
    showCombatFlowAnim.value = false;
  }

  return {
    // Screen
    isScreenShaking,
    triggerShake,
    // Effects
    activeEffect,
    triggerEffect,
    // Intro
    showIntro,
    playIntroSequence,
    // Ultimate
    showUltimateCutin,
    ultimateCutinData,
    playUltimateAnimation,
    // Skill
    showSkillCutin,
    skillCutinData,
    playSkillAnimation,
    // Combat Flow
    showCombatFlowAnim,
    combatFlowPhase,
    playCombatFlowAnimation,
    // Utility
    sleep,
  };
}

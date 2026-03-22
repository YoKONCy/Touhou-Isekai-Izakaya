/**
 * useCombatUI - 战斗 UI 辅助 Composable
 * 管理弹窗、日志、HUD 样式计算、buff 名称映射等纯 UI 逻辑
 */
import { ref, reactive } from 'vue';
import type { Combatant, BuffEffect, Buff } from '@/types/combat';
import { multiplayerService } from '@/services/MultiplayerService';
import { useGameStore } from '@/stores/game';

// --- Interfaces ---
export interface CombatLog {
  id: number;
  turn: number;
  content: string;
}

export interface Popup {
  id: number;
  text: string | number;
  type: 'damage' | 'heal' | 'crit' | 'buff' | 'debuff';
}

export interface UICombatant extends Combatant {
  popups: Popup[];
}

export function useCombatUI() {
  const gameStore = useGameStore();

  // --- Popup System ---
  const popupMap = reactive<Record<string, Popup[]>>({});
  let popupIdCounter = 0;

  function getPopups(id: string): Popup[] {
    if (!popupMap[id]) popupMap[id] = [];
    return popupMap[id];
  }

  function clearPopups() {
    for (const key in popupMap) {
      popupMap[key] = [];
    }
  }

  function addPopup(
    target: UICombatant,
    value: number | string,
    type: 'damage' | 'heal' | 'crit' | 'buff' | 'debuff' = 'damage',
    isRemote = false
  ) {
    if (!isRemote && gameStore.multiplayer.isHost && gameStore.multiplayer.isMultiplayer) {
      multiplayerService.sendCombatPopup({ targetId: target.id, value, type });
    }
    const id = popupIdCounter++;
    const list = getPopups(target.id);
    list.push({ id, text: value, type });
    setTimeout(() => {
      const idx = list.findIndex((p) => p.id === id);
      if (idx > -1) list.splice(idx, 1);
    }, 1000);
  }

  // --- Combat Log ---
  const combatLogs = ref<CombatLog[]>([]);
  const isLogExpanded = ref(false);
  const streamingNarrative = ref('');

  function addLog(content: string, turnValue: number, combatState: any, isRemote = false) {
    streamingNarrative.value = '';
    if (!isRemote && gameStore.multiplayer.isHost && gameStore.multiplayer.isMultiplayer) {
      multiplayerService.sendCombatLog({ content, turn: turnValue });
    }
    combatLogs.value.unshift({
      id: Date.now() + Math.random(),
      turn: turnValue,
      content
    });
    // Sync to store
    if (combatState) {
      if (!combatState.logs) combatState.logs = [];
      combatState.logs.push({
        turn: turnValue,
        actorId: 'system',
        actorName: '系统',
        actionType: 'wait',
        targetNames: [],
        description: content
      });
    }
  }

  // --- Effect Name Mapping ---
  function getEffectName(effect: BuffEffect): string {
    if (effect.type === 'stat_mod') {
      const statMap: Record<string, string> = {
        attack: '攻击',
        defense: '防御',
        dodge: '闪避',
        damage_taken: '受伤修正'
      };
      return statMap[effect.targetStat || ''] || '属性';
    }
    const typeMap: Record<string, string> = {
      damage_reduction: '减伤',
      dodge_mod: '闪避修正',
      shield: '护盾',
      heal: '每回合回复',
      damage_over_time: '持续受伤',
      heal_mp: 'MP回复'
    };
    return typeMap[effect.type] || '效果';
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

  // --- HP Style Helpers ---
  function getPlayerHpStyle(hp: number, maxHp: number) {
    const ratio = Math.max(0, Math.min(1, hp / maxHp));
    let r: number, g: number, b: number;
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
    return { borderColor: color, color, boxShadow: `0 0 20px rgba(${r}, ${g}, ${b}, 0.4)` };
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
      color,
      boxShadow: `0 0 10px rgba(${r}, ${g}, ${b}, 0.4)`,
      background: `linear-gradient(to left, rgba(${r}, ${g}, ${b}, 0.3) ${percent}%, rgba(0,0,0,0.8) ${percent}%)`
    };
  }

  // --- Skill Theme Classes ---
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

  // --- Enemy Dodge Calculation ---
  function getEnemyEffectiveDodge(enemy: UICombatant | any): number {
    const baseDodge = enemy.dodgeRate || 0.15;
    let dodgeMod = 0;
    if (enemy.buffs) {
      enemy.buffs.forEach((b: Buff) => {
        b.effects.forEach((e: BuffEffect) => {
          if (e.type === 'dodge_mod') dodgeMod += e.value;
        });
      });
    }
    return baseDodge + dodgeMod;
  }

  return {
    // Popup
    popupMap,
    getPopups,
    clearPopups,
    addPopup,
    // Log
    combatLogs,
    isLogExpanded,
    streamingNarrative,
    addLog,
    // Names
    getEffectName,
    getSpellTypeName,
    // Styles
    getPlayerHpStyle,
    getEnemyHpStyle,
    getSkillThemeClasses,
    // Dodge
    getEnemyEffectiveDodge
  };
}

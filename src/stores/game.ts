import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  type GameState,
  INITIAL_GAME_STATE,
  type GameAction,
  type Quest,
  type QuestStatus,
  type Item,
  type PromiseState,
  type MultiplayerState,
  type MultiplayerPlayer,
  type PlayerStatus
} from '@/types/game';
import { type SpellCard } from '@/types/combat';
import { useCharacterStore } from '@/stores/character';
import { useSettingsStore } from '@/stores/settings';
import { resolveCharacterId } from '@/services/characterMapping';
import { PRESET_ITEMS } from '@/data/items';
import { PRESET_SPELLCARDS } from '@/data/spellcards';
import { dbService } from '@/services/DatabaseService';
import _ from 'lodash';

const NPC_FIELD_MAPPING: Record<string, string> = {
  姓名: 'name',
  关系: 'relationship',
  战斗力: 'power',
  生命值: 'hp',
  最大生命值: 'max_hp',
  好感度: 'favorability',
  服从度: 'obedience',
  衣着: 'clothing',
  姿势: 'posture',
  双手: 'hands',
  嘴巴: 'mouth',
  脸部: 'face',
  心情: 'mood',
  行为: 'action',
  目前行为: 'action', // 支持别名映射
  当前行为: 'action', // 支持别名映射
  current_action: 'action', // 支持别名映射
  心理活动: 'inner_thought',
  目前心理活动: 'inner_thought', // 支持别名映射
  性别: 'gender',
  住所: 'residence',
  胸部: 'chest',
  屁股: 'buttocks',
  臀部: 'buttocks',
  小穴: 'vagina',
  菊穴: 'anus'
};

const PLAYER_FIELD_MAPPING: Record<string, string> = {
  金钱: 'money',
  持有金钱: 'money',
  生命值: 'hp',
  最大生命值: 'max_hp',
  灵力值: 'mp',
  最大灵力值: 'max_mp',
  战斗力: 'power',
  声望: 'reputation',
  身份: 'identity',
  地点: 'location',
  住所: 'residence',
  时间: 'time',
  日期: 'date',
  衣着: 'clothing',
  目前衣着: 'clothing',
  战斗等级: 'combatLevel',
  熟练等级: 'combatLevel',
  经验: 'combatExp',
  经验值: 'combatExp'
};

const VALID_PLAYER_FIELDS = new Set([
  'name',
  'hp',
  'max_hp',
  'mp',
  'max_mp',
  'money',
  'power',
  'reputation',
  'identity',
  'persona',
  'clothing',
  'location',
  'residence',
  'time',
  'date',
  'authorities',
  'items',
  'recipes',
  'spell_cards',
  'combatLevel',
  'combatExp',
  'skillPoints',
  'unlockedTalents',
  'avatarUrl',
  'referenceImageUrl',
  'storySummary'
]);

export const useGameStore = defineStore('game', () => {
  const state = ref<GameState>(_.cloneDeep(INITIAL_GAME_STATE));
  const quickReplies = computed(() => state.value.system.quick_replies || []); // 当前回合的快捷回复选项，派生自系统状态库

  // 联机相关状态
  const multiplayer = ref<MultiplayerState>({
    isMultiplayer: false,
    isHost: false,
    roomId: null,
    players: [],
    status: 'idle',
    activeVote: null,
    totalEnergy: 0,
    isSharingEnergy: false
  });

  // 计算属性: "Me" (代表当前运行环境下的“玩家自己”)
  // 根据联机角色 (主机/客机/单机) 返回正确的 PlayerStatus 对象库引用
  const me = computed(() => {
    // 1. 若为单机模式，直接指向全局唯一的主玩家对象
    if (!multiplayer.value.isMultiplayer) {
      return state.value.player;
    }

    // 2. 若为主机，我依然是主玩家 (但可能携带了来自联机同步枢纽的实时修正数据)
    if (multiplayer.value.isHost) {
      return state.value.player;
    }

    // 3. 若为客机，通过本地标识 Key (Identity Key) 在伙伴列表中自寻身位
    if (typeof window !== 'undefined') {
      const myKey = localStorage.getItem('mp_identity_key');
      if (
        myKey &&
        state.value.multiplayer_companions &&
        state.value.multiplayer_companions[myKey]
      ) {
        return state.value.multiplayer_companions[myKey];
      }

      // 3.1 若尚未在伙伴列表中注册 (例如刚进入房间尚未提交人设)，则在原始成员列表寻找自己
      const myId = localStorage.getItem('mp_player_id');
      if (myId) {
        const playerInfo = multiplayer.value.players.find((p) => p.id === myId);
        if (playerInfo) {
          // 基于原始连接信息构建一个 PlayerStatus 的预览分身 (Partial View)
          return {
            ...INITIAL_GAME_STATE.player,
            name: playerInfo.name || '客机玩家',
            identity: playerInfo.identity || '联机客机',
            avatarUrl: playerInfo.avatarUrl || '',
            hp: playerInfo.hp || 100,
            max_hp: playerInfo.max_hp || 100,
            mp: playerInfo.mp || 100,
            max_mp: playerInfo.max_mp || 100,
            power: playerInfo.power || '?',
            isMe: true
          } as PlayerStatus;
        }
      }
    }

    // 兜底逻辑：若无匹配项，暂时返回主机玩家的状态引用 (多见于人设尚未注入的阶段)
    return state.value.player;
  });

  function setMultiplayer(isMultiplayer: boolean, isHost: boolean = false) {
    multiplayer.value.isMultiplayer = isMultiplayer;
    multiplayer.value.isHost = isHost;
  }

  function setRoomInfo(roomId: string | null, password?: string, roomName?: string) {
    multiplayer.value.roomId = roomId;
    multiplayer.value.roomPassword = password;
    if (roomName) {
      multiplayer.value.roomName = roomName;
    }
  }

  function updatePlayers(players: MultiplayerPlayer[]) {
    multiplayer.value.players = players;
  }

  function addPlayer(player: MultiplayerPlayer) {
    if (!multiplayer.value.players.find((p) => p.id === player.id)) {
      multiplayer.value.players.push(player);
    }
  }

  function removePlayer(playerId: string) {
    multiplayer.value.players = multiplayer.value.players.filter((p) => p.id !== playerId);
  }

  function setMultiplayerStatus(status: MultiplayerState['status'], error?: string) {
    multiplayer.value.status = status;
    multiplayer.value.error = error;
  }

  function setVote(vote: any) {
    multiplayer.value.activeVote = vote;
  }

  function updateVote(votes: Record<string, number>) {
    if (multiplayer.value.activeVote) {
      multiplayer.value.activeVote.votes = votes;
    }
  }

  function setTotalEnergy(energy: number) {
    multiplayer.value.totalEnergy = energy;
  }

  function setEnergySharing(isSharing: boolean) {
    multiplayer.value.isSharingEnergy = isSharing;
  }

  function updatePlayerEnergy(playerId: string, energy: number) {
    const player = multiplayer.value.players.find((p) => p.id === playerId);
    if (player) {
      player.energy = energy;
    }
  }

  function updateState(newState: Partial<GameState>) {
    state.value = _.merge({}, state.value, newState);
  }

  async function setPlayerAvatar(avatarUrl: string, referenceImageUrl?: string) {
    state.value.player.avatarUrl = avatarUrl;
    if (referenceImageUrl) {
      state.value.player.referenceImageUrl = referenceImageUrl;
    }
    await saveCurrentStateToLastSnapshot();
  }

  function setQuickReplies(replies: string[]) {
    // 健壮性校验：确保系统状态中的快捷回复容器存在 (通常由 INITIAL_GAME_STATE 保证)
    if (!state.value.system.quick_replies) {
      state.value.system.quick_replies = [];
    }
    state.value.system.quick_replies = replies || [];
  }

  function clearQuickReplies() {
    if (state.value.system.quick_replies) {
      state.value.system.quick_replies = [];
    }
  }

  function setCombatState(combatState: any) {
    state.value.system.combat = combatState;
  }

  function startCombatTutorial() {
    clearQuickReplies();

    const playerCombatant: any = {
      id: 'player',
      name: state.value.player.name || '旅人',
      team: 'player',
      isPlayer: true,
      hp: 1000,
      maxHp: 1000,
      mp: 500,
      maxMp: 500,
      power: 'D+',
      spellCards: [
        {
          id: 'tutorial_spell_1',
          name: '简单弹幕',
          description: '基础的弹幕攻击，威力稳定喵。',
          damage: 100,
          scope: 'single',
          cost: 30,
          type: 'attack',
          hitRate: 0.95,
          level: 30
        },
        {
          id: 'tutorial_spell_2',
          name: '小小奇迹',
          description: '集中精神，为自己恢复生命值喵。',
          damage: 250,
          scope: 'single',
          cost: 60,
          type: 'heal',
          level: 1
        }
      ],
      buffs: [],
      shield: 0,
      dodgeRate: 0.15,
      pPoints: 70,
      maxPPoints: 100,
      actionPoints: 2,
      maxActionPoints: 2,
      combatLevel: 10,
      items: [
        {
          id: 'tutorial_item_1',
          name: '咸饭团',
          description: '恢复 150 点生命值。',
          type: 'consumable',
          count: 3,
          effects: { heal: 150 }
        }
      ]
    };

    const enemyCombatant: any = {
      id: 'enemy_tutorial',
      name: '练习妖精',
      team: 'enemy',
      isPlayer: false,
      hp: 500,
      maxHp: 500,
      mp: 200,
      maxMp: 200,
      power: 'D',
      spellCards: [],
      buffs: [],
      shield: 0,
      dodgeRate: 0.1,
      pPoints: 0,
      maxPPoints: 100,
      actionPoints: 1,
      maxActionPoints: 1
    };

    const combatState: any = {
      isActive: false,
      isPending: true,
      tutorialMode: true, // 标记为教学模式以自动开启
      turn: 1,
      combatants: [playerCombatant, enemyCombatant],
      logs: [
        {
          turn: 1,
          actorId: 'system',
          actorName: '系统',
          actionType: 'wait',
          targetNames: [],
          description: '进入了战斗教学沙箱！这里的数值与您的主剧情无关喵。'
        }
      ],
      bgm_suggestion: '常规'
    };

    state.value.system.combat = combatState;
  }

  function setPendingQuest(quest: Quest | null) {
    state.value.system.pending_quest_trigger = quest;
  }

  function addQuest(quest: Quest) {
    // 确保任务队列容器已初始化
    if (!state.value.system.quests) {
      state.value.system.quests = [];
    }
    // 幂等性检查：避免重复注入相同 ID 的任务项
    if (!state.value.system.quests.find((q) => q.id === quest.id)) {
      state.value.system.quests.push(quest);
    }
  }

  function addPromise(promise: PromiseState) {
    if (!state.value.system.promises) {
      state.value.system.promises = [];
    }
    // 幂等性检查：避免重复注入相同 ID 的约定项
    if (!state.value.system.promises.find((p) => p.id === promise.id)) {
      state.value.system.promises.push(promise);
    }
  }

  function updatePromise(promiseId: string, updates: Partial<PromiseState>) {
    if (!state.value.system.promises) return;
    const promise = state.value.system.promises.find((p) => p.id === promiseId);
    if (promise) {
      Object.assign(promise, updates);
    }
  }

  function updateQuestStatus(
    questId: string,
    updates: { status?: QuestStatus; summary?: string; log?: string }
  ) {
    if (!state.value.system.quests) return;

    const quest = state.value.system.quests.find((q) => q.id === questId);
    if (quest) {
      // 1. 处理任务日志追加 (进度汇报链路)
      if (updates.log) {
        if (!quest.logs) quest.logs = [];
        quest.logs.push({
          content: updates.log,
          time: state.value.player.time,
          date: state.value.player.date,
          turn: state.value.system.turn_count
        });
      }

      // 2. 处理任务状态迁移 (State Transition)
      const newStatus = updates.status;
      if (newStatus) {
        // 终态锁死机制：防止任务重复完成导致多重结算漏洞 (防止重复领奖)
        if (quest.status === 'completed' && newStatus === 'completed') {
          return;
        }

        quest.status = newStatus;
        if (newStatus === 'completed' || newStatus === 'failed') {
          quest.completedTurn = state.value.system.turn_count;
          quest.completedDate = state.value.player.date;
          quest.completedTime = state.value.player.time;
          if (updates.summary) {
            quest.completionSummary = updates.summary;
          }

          // 自动派发任务报酬结算 (发放奖励)
          if (newStatus === 'completed' && quest.rewards) {
            console.log('[游戏存档] 正在为任务派发奖励：', quest.name, quest.rewards);
            for (const reward of quest.rewards) {
              try {
                if (reward.type === 'money') {
                  applyAction({
                    type: 'UPDATE_PLAYER',
                    field: 'money',
                    op: 'add',
                    value: Number(reward.value) || 0
                  });
                } else if (reward.type === 'item') {
                  applyAction({
                    type: 'INVENTORY',
                    target: 'items',
                    op: 'add',
                    value: reward.value
                  });
                } else if (reward.type === 'spell_card') {
                  applyAction({
                    type: 'INVENTORY',
                    target: 'spell_cards',
                    op: 'add',
                    value: reward.value
                  });
                } else if (reward.type === 'attribute') {
                  let field = '';
                  let val = 0;

                  // 情况 1: 标准结构化对象定义格式 (Standard Object)
                  if (typeof reward.value === 'object' && reward.value.field) {
                    field = reward.value.field;
                    val = Number(reward.value.value) || 0;
                  }
                  // 情况 2: LLM 非结构化叙述格式 (需根据 description/value 进行语义启发式解析)
                  else {
                    // 推断受影响的属性字段 (推断字段名)
                    const desc = (reward.description || '').toLowerCase();
                    const valStr = String(reward.value || '');

                    if (desc.includes('声望') || desc.includes('reputation')) field = 'reputation';
                    else if (desc.includes('金钱') || desc.includes('money')) field = 'money';
                    else if (desc.includes('战斗力') || desc.includes('power')) field = 'power';

                    // 推断具体的数值变更量 (推断属性值)
                    if (field) {
                      // 优先尝试从文本中提取原生数值字符段
                      const numMatch = valStr.match(/-?\d+/);
                      if (numMatch) {
                        val = parseInt(numMatch[0]);
                      } else {
                        // 基于语义的默认报酬兜底方案
                        if (field === 'reputation') {
                          // 声望关键字启发式映射关系 (声望语义解析)
                          if (valStr.includes('小有名气')) val = 25;
                          else if (valStr.includes('名声鹤起')) val = 45;
                          else if (valStr.includes('闻名遐迩')) val = 65;
                          else if (valStr.includes('驰名天下')) val = 85;
                          else val = 10; // 无法识别时的极小默认增幅
                        }
                        if (field === 'money') val = 1000;
                        if (field === 'power') val = 1;
                      }
                    }
                  }

                  if (field && val !== 0) {
                    applyAction({
                      type: 'UPDATE_PLAYER',
                      field: field,
                      op: 'add',
                      value: val
                    });
                    console.log(
                      `[游戏存档] 已应用推论得到的属性奖励: ${field} += ${val}`
                    );
                  } else {
                    console.warn('[游戏存档] 未能成功解析属性奖励项:', reward);
                  }
                }
              } catch (e) {
                console.error('[游戏存档] 应用奖励内容时遭遇错误:', reward, e);
              }
            }
          }
        }
      }
    }
  }

  function unlockTalent(talentId: string, cost: number) {
    if (!state.value.player.unlockedTalents) {
      state.value.player.unlockedTalents = [];
    }

    if (state.value.player.unlockedTalents.includes(talentId)) return;

    if ((state.value.player.skillPoints || 0) >= cost) {
      state.value.player.skillPoints -= cost;
      state.value.player.unlockedTalents.push(talentId);
      return true;
    }
    return false;
  }

  function setState(newState: GameState) {
    // 使用 merge 策略，确保外部注入状态能精准覆盖 INITIAL_GAME_STATE 的空缺位
    // console.log('[GameStore] Restoring state. NPCs count:', Object.keys(newState.npcs || {}).length, 'Current Scene:', newState.system?.current_scene_npcs);
    state.value = _.merge({}, INITIAL_GAME_STATE, newState);

    // [同步逻辑] 强制让战斗对象同步全局状态中的最新符卡/属性。
    // 这修复了在 LLM2 处理变量 (如获取新符卡) 异步完成前，战斗阶段便过早开启导致的同步失效。
    // 在持久化重载时，我们将最新全局变量反向注入回激活中的战斗副本。
    const combat = state.value.system.combat;

    // [负载优化] 页面刷新后的战斗重置逻辑 (处理热重载或页面刷新)
    // 若检测到玩家在战斗交互中刷新页面，则回退至“战前确认”界面并重置本次遭遇的运行时数据。
    if (combat && combat.isActive) {
      console.log(
        '[游戏存档] 加载时检测到激活中的战斗。正在回退至“确认中”状态（强制重置本次遭遇）。'
      );
      combat.isActive = false;
      combat.isPending = true;
      combat.turn = 0;
      combat.logs = [];

      // 重置所有战斗参与者 (重置战斗单元运行时上下文)
      if (combat.combatants) {
        combat.combatants.forEach((c: any) => {
          // 清除易失性运行状态 (清除战斗临时数据)
          c.buffs = [];
          c.shield = 0;
          delete c.hasUsedUltimate;

          // 为 NPC 单位恢复生理属性 (玩家同步逻辑在后续独立处理)
          if (!c.isPlayer) {
            // 尝试从全局 NPC 注册中心同步战前快照 (同步战前状态)
            const npc = state.value.npcs ? state.value.npcs[c.id] : null;
            if (npc) {
              if (npc.hp !== undefined) c.hp = npc.hp;
              if (npc.mp !== undefined) c.mp = npc.mp;
            } else {
              // 兜底：若注册中心无数据，则重置回最大值 (Fallback to Max)
              if (c.maxHp !== undefined) c.hp = c.maxHp;
              if (c.maxMp !== undefined) c.mp = c.maxMp;
            }
          }
        });
      }
    }

    if (combat && (combat.isActive || combat.isPending)) {
      const playerCombatant = combat.combatants.find((c) => c.isPlayer);
      const globalPlayer = state.value.player;

      if (playerCombatant && globalPlayer) {
        // 同步参战符卡列表 (同步符卡数据)
        if (globalPlayer.spell_cards) {
          // 采用深拷贝机制防止跨副本间的变量引用污染
          playerCombatant.spellCards = _.cloneDeep(globalPlayer.spell_cards);
        }

        // 同步可能发生变更的关键生理与阶级属性 (Level, Power, MaxHP/MP)
        if (globalPlayer.combatLevel !== undefined) {
          playerCombatant.combatLevel = globalPlayer.combatLevel;
        }
        if (globalPlayer.power !== undefined) {
          playerCombatant.power = globalPlayer.power as any;
        }
        if (globalPlayer.max_hp !== undefined) {
          playerCombatant.maxHp = globalPlayer.max_hp;
          // 若处于确认阶段，此时应更信任全局存储的生命值数据 (Fresh Start Principle)
          if (combat.isPending) playerCombatant.hp = globalPlayer.hp;
        }
        if (globalPlayer.max_mp !== undefined) {
          playerCombatant.maxMp = globalPlayer.max_mp;
          if (combat.isPending) playerCombatant.mp = globalPlayer.mp;
        }

        console.log('[游戏存档] 加载时已将玩家战斗数据与全局状态库同步。');
      }
    }
  }

  function resetState() {
    state.value = _.cloneDeep(INITIAL_GAME_STATE);
  }

  // --- 原子动作封装 Action Methods ---
  function updatePlayer(playerUpdate: Partial<GameState['player']>) {
    // 数值合规性清洗：防止非数字类型 (NaN/Null) 混入关键状态导致 UI 崩溃
    const NUMERIC_FIELDS = [
      'hp',
      'max_hp',
      'mp',
      'max_mp',
      'money',
      'combatLevel',
      'combatExp',
      'reputation',
      'skillPoints'
    ];

    for (const key of NUMERIC_FIELDS) {
      // 巡检更新对象中是否存在对应的 Key 映射项
      if (Object.prototype.hasOwnProperty.call(playerUpdate, key)) {
        const val = (playerUpdate as any)[key];
        if (val !== undefined && val !== null) {
          const numVal = Number(val);
          if (isNaN(numVal)) {
            console.warn(`[游戏存档] updatePlayer 传入的字段 ${key} 数值非法:`, val);
            // 剔除非法字段，防止状态应用崩溃 (State Corruption)
            delete (playerUpdate as any)[key];
          } else {
            // 强制转换为 Number 原生类型
            (playerUpdate as any)[key] = numVal;
          }
        }
      }
    }

    Object.assign(state.value.player, playerUpdate);
  }

  function incrementTurn() {
    state.value.system.turn_count = (state.value.system.turn_count || 0) + 1;
  }

  // 状态应用器动作主逻辑 (应用游戏动作逻辑)
  function applyAction(action: GameAction) {
    console.log('[游戏存档] 正在应用操作 (Action):', action);
    switch (action.type) {
      case 'UPDATE_PLAYER':
        if (action.field) {
          // 若检测到中文 Key 映射，则将其适配为标准英文持久化 Key (键位映射适配)
          const targetField = PLAYER_FIELD_MAPPING[action.field] || action.field;

          // 白名单强制性校验：拦截所有非法字段的注入尝试 (安全防护)
          if (!VALID_PLAYER_FIELDS.has(targetField)) {
            console.warn(`[游戏存档] 更新被拦截：尝试操作非合规的玩家字段 ${targetField}`);
            return;
          }

          const currentVal = _.get(state.value.player, targetField);
          let newVal = currentVal;

          // 严格数值加法平衡逻辑 (严格数值类型处理)
          const STRICT_NUMERIC_FIELDS = new Set([
            'hp',
            'max_hp',
            'mp',
            'max_mp',
            'money',
            'combatLevel',
            'combatExp',
            'reputation',
            'skillPoints'
          ]);

          if (STRICT_NUMERIC_FIELDS.has(targetField)) {
            const val = Number(action.value);
            // 输入源合法性校验：拦截非法数字输入流 (输入合法性检查)
            if (isNaN(val)) {
              console.warn(`[游戏存档] 字段 ${targetField} 的数值校验不通过:`, action.value);
              // 非法输入熔断 (Abort on Invalid)
              return;
            }

            const currentNum = Number(currentVal) || 0;
            if (action.op === 'add') newVal = currentNum + val;
            else if (action.op === 'subtract') newVal = currentNum - val;
            else if (action.op === 'set') newVal = val;
          } else {
            // 非核心数值/字符串型数据的处理链路 (Default Handling)
            if (action.op === 'add') newVal = ((currentVal as number) || 0) + action.value;
            if (action.op === 'subtract') newVal = ((currentVal as number) || 0) - action.value;
            if (action.op === 'set') newVal = action.value;
          }

          // --- 核心业务组件：战斗等级与经验池平衡逻辑 ---
          if (targetField === 'combatExp') {
            // 属性池空缺初始化 (Initialization)
            if (state.value.player.combatLevel === undefined) state.value.player.combatLevel = 1;
            if (state.value.player.combatExp === undefined) state.value.player.combatExp = 0;
            if (state.value.player.skillPoints === undefined) state.value.player.skillPoints = 0;

            const MAX_LEVEL = 100;
            const EXP_PER_LEVEL = 1000;

            // 基于“当前状态 + 全增量”进行闭合重算 (重新闭合计算)
            // 此时 newVal 代表包含了本次操作后的累计总额基数。

            let currentLevel = state.value.player.combatLevel;
            let totalExp = Number(newVal); // 这里的 newVal 代表了“当前累计经验 + 本次刚获取的增量”喵

            // 循环等级溢出检测 (升级结算循环)
            while (totalExp >= EXP_PER_LEVEL && currentLevel < MAX_LEVEL) {
              totalExp -= EXP_PER_LEVEL;
              currentLevel++;
              // 等级进阶奖励：每升 1 级回馈 1 点天赋点 (Skill Point)
              state.value.player.skillPoints++;
            }

            // 设置角色上限等级天花板 (Cap at Max Level)
            if (currentLevel >= MAX_LEVEL) {
              currentLevel = MAX_LEVEL;
              totalExp = Math.min(totalExp, EXP_PER_LEVEL); // 或者重置为0？先保持满额经验
            }

            // 落实数值迁移与等级写入 (Apply State)
            state.value.player.combatLevel = currentLevel;
            newVal = totalExp; // 将经验池修正为扣除进阶消耗后的余盈值 (Remainder Update)
          }
          // ----------------------------------------

          _.set(state.value.player, targetField, newVal);
        }
        break;

      case 'UPDATE_NPC':
        if (action.npcId && action.field) {
          const charStore = useCharacterStore();
          // 支持混合引用标识：英文 UUID 或 中文限定真名 (Hybrid Identity Resolution)
          let npcId = action.npcId;

          // 1. 调用中心化服务层解析真实的 UUID 身份令牌
          const resolvedId = resolveCharacterId(npcId, charStore.characters, state.value.npcs);
          npcId = resolvedId;

          if (!state.value.npcs[npcId]) {
            // 若注册中心未命中，则尝试基于静态角色模版库自动生成对应的运行时对象副本
            // (多见于 LLM 尝试操纵一个尚未在主场景环节正式登场的静态单位)
            const staticChar = charStore.characters.find((c) => c.uuid === npcId);
            if (staticChar) {
              state.value.npcs[npcId] = {
                id: npcId,
                name: staticChar.name,
                gender: staticChar.gender as any
              } as any;
            } else {
              console.warn(
                `[游戏存档] UPDATE_NPC 动作异常: NPC '${npcId}' 在当前运行时或静态库中均未命中。`
              );
              return; // 目标不存在，拦截操作以规避逻辑空环
            }
          }

          // 隐式场景置入逻辑：通过 UPDATE_NPC 成功修改的对象将自动补录进当前活动场景映射表
          // 注：这为模型偶尔遗忘 SCENE.add_chars 操作提供了逻辑安全垫层。
          // 在后续 gameLoop.ts 消费阶段，SCENE 专属动作具备更高优先级，如有冲突会以其为准。
          if (!state.value.system.current_scene_npcs.includes(npcId)) {
            console.log(
              `[游戏存档] 正在通过 UPDATE_NPC 动作隐式地将 NPC ${npcId} 加入当前活动场景列表`
            );
            state.value.system.current_scene_npcs.push(npcId);
          }

          const npc = state.value.npcs[npcId];
          if (!npc) return;

          // 属性映射：若有必要，将中文键值对转换为标准英文物理字段
          const targetField = NPC_FIELD_MAPPING[action.field] || action.field;

          const currentVal = _.get(npc, targetField);
          let newVal = currentVal;

          // NPC 关键生理生理指标严格锁死校验 (Strict Numeric Handling for NPCs)
          const STRICT_NPC_NUMERIC_FIELDS = new Set(['hp', 'max_hp', 'favorability', 'obedience']);

          if (STRICT_NPC_NUMERIC_FIELDS.has(targetField)) {
            const val = Number(action.value);
            if (isNaN(val)) {
              console.warn(
                `[游戏存档] NPC ${npcId} 的字段 ${targetField} 数值校验失败:`,
                action.value
              );
              // 输入源非法，静默拦截防止崩溃 (Shield from crash)
              return;
            }

            const currentNum = Number(currentVal) || 0;
            if (action.op === 'add') newVal = currentNum + val;
            else if (action.op === 'subtract') newVal = currentNum - val;
            else if (action.op === 'set') newVal = val;
          } else {
            if (action.op === 'add') newVal = ((currentVal as number) || 0) + action.value;
            if (action.op === 'subtract') newVal = ((currentVal as number) || 0) - action.value;
            if (action.op === 'set') newVal = action.value;
          }

          _.set(npc, targetField, newVal);
        }
        break;

      case 'UPDATE_COMPANION':
        if ((action.targetKey || action.targetName) && action.field) {
          let targetKey = action.targetKey;

          // 确保联机伙伴数据库连接映射表已挂载 (Initialization Safe Guard)
          if (!state.value.multiplayer_companions) {
            state.value.multiplayer_companions = {};
          }

          // 身份重定向：若缺省 Key，则基于显示名称 (targetName) 尝试反推伙伴映射关系 (Key Resolution)
          if (!targetKey && action.targetName) {
            const nameToFind = action.targetName.trim();
            // 第一优先级：真名全量完全匹配检测 (Exact Match)
            const foundEntry = Object.entries(state.value.multiplayer_companions).find(
              ([_, comp]) => comp.name === nameToFind
            );

            if (foundEntry) {
              targetKey = foundEntry[0];
            } else {
              // 第二优先级：基于名称子串包含关系的模糊匹配检测 (Fuzzy Match)
              const fuzzyEntry = Object.entries(state.value.multiplayer_companions).find(
                ([_, comp]) => comp.name.includes(nameToFind) || nameToFind.includes(comp.name)
              );
              if (fuzzyEntry) {
                targetKey = fuzzyEntry[0];
              }
            }

            if (!targetKey) {
              console.warn(
                `[游戏存档] UPDATE_COMPANION 异常: 未能定位名为 '${action.targetName}' 的伙伴节点`
              );
              // 无法确定该伙伴身份，静默拦截并记录异常日志 (Abort on Identity Unknown)
              return;
            }
          }

          // 联机鲁棒性注入：若存在有效 Key 但伙伴数据尚未同步，则实时构造一份符合 INITIAL 协议的占位对象副本 (Robust Creation)
          // 此时假设远端伙伴状态最终会趋于强一致性同步。
          if (targetKey && !state.value.multiplayer_companions[targetKey]) {
            console.warn(
              `[游戏存档] UPDATE_COMPANION 提示: 伙伴 ${targetKey} 记录不存在，正在按协议创建占位对象。`
            );
            // 载入最小可用原型数据集 (Minimal Data Initialization)
            state.value.multiplayer_companions[targetKey] = {
              name: action.targetName || '未知同伴',
              hp: 500,
              max_hp: 500,
              mp: 1000,
              max_mp: 1000,
              money: 0,
              power: 'D+',
              reputation: 0,
              identity: '异界来客',
              persona: '',
              clothing: '',
              location: '',
              residence: '',
              time: '',
              date: '',
              combatLevel: 1,
              combatExp: 0,
              skillPoints: 0,
              unlockedTalents: [],
              authorities: [],
              items: [],
              recipes: [],
              spell_cards: []
            };
          }

          const companion = state.value.multiplayer_companions[targetKey!];
          if (companion) {
            // 字段映射由于联机伙伴在底层物理字段集上与玩家高度趋同，此处复用 PLAYER_FIELD_MAPPING 策略。
            const targetField = PLAYER_FIELD_MAPPING[action.field] || action.field;

            const currentVal = _.get(companion, targetField);
            let newVal = currentVal;

            // 严格数值类型处理：旨在对齐主玩家的数据清洗策略 (Strict Numeric Type Handling)喵
            const STRICT_NUMERIC_FIELDS = new Set([
              'hp',
              'max_hp',
              'mp',
              'max_mp',
              'money',
              'combatLevel',
              'combatExp',
              'reputation'
            ]);

            if (STRICT_NUMERIC_FIELDS.has(targetField)) {
              const val = Number(action.value);
              if (isNaN(val)) return;

              const currentNum = Number(currentVal) || 0;
              if (action.op === 'add') newVal = currentNum + val;
              else if (action.op === 'subtract') newVal = currentNum - val;
              else if (action.op === 'set') newVal = val;
            } else {
              if (action.op === 'add') newVal = ((currentVal as number) || 0) + action.value;
              if (action.op === 'subtract') newVal = ((currentVal as number) || 0) - action.value;
              if (action.op === 'set') newVal = action.value;
            }

            _.set(companion, targetField, newVal);
          }
        }
        break;

      case 'INVENTORY':
        if (action.target) {
          if (action.target === 'items') {
            // 增强型物品逻辑核心 (物品系统核心逻辑)
            const items = state.value.player.items;

            if (action.op && ['push', 'add', 'set'].includes(action.op)) {
              let newItem: Item;
              const val = action.value;

              // 1. 物品数据身份解析 (解析物品定义)
              if (typeof val === 'string') {
                // 适配 "物品名,类型" 的便捷输入格式 (例如 "红茶,consumable")
                let nameOrId = val;
                let specifiedType = 'other';

                if (val.includes(',')) {
                  // 贪婪匹配策略：使用 lastIndexOf 以兼容物品名本身含有逗号的情况 (Greedy Match)喵
                  const lastIndex = val.lastIndexOf(',');
                  nameOrId = val.substring(0, lastIndex).trim();
                  specifiedType = val.substring(lastIndex + 1).trim();
                }

                // 先尝试从预设库中根据 ID (全量匹配) 或 名称 (全量匹配) 寻找原型对象数据
                // 我们期望同时支持原始 ID ("tea") 与 显示名称 ("红茶") 的双向查询 (全量反查)
                const preset =
                  PRESET_ITEMS[nameOrId] ||
                  Object.values(PRESET_ITEMS).find((p) => p.name === nameOrId);

                if (preset) {
                  newItem = { ...preset, count: 1 };
                } else {
                  // 构造通用兜底对象 (通用物品对象 - Generic Fallback)喵
                  // 若预设库未注册，则暂时将输入字符同时映射至 ID 与名称字段 (LLM Raw Input Processing)喵
                  newItem = {
                    id: nameOrId,
                    name: nameOrId,
                    count: 1,
                    description: '暂无描述',
                    type: specifiedType
                  };
                }
              } else {
                // 场景：传入的是来自 LLM 序列化后的完整结构化对象 (结构化数据)
                // 此时依然需要巡检预设库，以补全描述、图标等 LLM 可能遗漏的元数据 (元数据自动补全)
                const rawId = val.id || val.name;
                const preset = rawId
                  ? PRESET_ITEMS[rawId] || Object.values(PRESET_ITEMS).find((p) => p.name === rawId)
                  : null;

                if (preset) {
                  // 合并预设模板与 LLM 传入的运行时数据 (LLM 拥有更高优先级以覆盖数量/特定属性)
                  newItem = {
                    ...preset,
                    ...val,
                    // 数据一致性校验层：强制维持关键特征字段的合规性 (Consistency Guard)喵
                    id: preset.id, // 优先溯源至预设库 ID 以维持全局引用一致性喵
                    name: val.name || preset.name,
                    count: val.count || 1
                  };
                } else {
                  newItem = {
                    id: val.id || val.name || 'unknown',
                    name: val.name || val.id || '未知物品',
                    count: val.count || 1,
                    description: val.description || '暂无描述',
                    type: val.type || 'other',
                    effects: val.effects
                  };
                }
              }

              // 匹配原则：优先匹配 ID，其次匹配显示名称 (身份标识解析)
              // 增强：引入字符相似度检测，应对 LLM 输出的微小名称变动（如“红茶” vs “一袋红茶”）
              let existingItem = items.find(
                (i) =>
                  (newItem.id && i.id === newItem.id) || (newItem.name && i.name === newItem.name)
              );

              if (!existingItem && newItem.name) {
                existingItem = items.find((i) => {
                  const s1 = i.name;
                  const s2 = newItem.name;
                  if (s1.includes(s2) || s2.includes(s1)) return true;

                  // 字符集重合度检测 (Jaccard-like Similarity)
                  const c1 = new Set(s1);
                  const c2 = new Set(s2);
                  let intersect = 0;
                  c1.forEach((c) => {
                    if (c2.has(c)) intersect++;
                  });
                  const minSize = Math.min(c1.size, c2.size);
                  const similarity = intersect / minSize;

                  // 判定阈值：重合字符数 >= 2 且 相似度 >= 0.75 (应对“施工现场” vs “施工中”)
                  return intersect >= Math.min(2, minSize) && similarity >= 0.75;
                });
              }

              if (existingItem) {
                // 现存物品更新逻辑 (Update logic)喵
                if (action.op === 'add' || action.op === 'push') {
                  // 分类处理：特殊概念型物品不执行物理堆叠，强制维持 1 份喵 (Concept Anti-stacking)喵
                  const isConcept =
                    (newItem.type === 'special' || newItem.type === 'other') &&
                    !newItem.name.match(/(钥匙|硬币|碎片|代币|魂|钱|币|球|卷|券|水|药|果)/);

                  if (isConcept) {
                    existingItem.count = 1;
                  } else {
                    existingItem.count += (newItem.count || 1);
                  }
                } else if (action.op === 'set') {
                  existingItem.count = newItem.count;
                }

                // 元数据流深度同步：针对历史留存数据执行运行时属性校准 (Metadata Patching)喵
                // 即使物品已存在，也要保持其描述与效果与最新的预设库对齐喵
                existingItem.description = newItem.description || existingItem.description;
                existingItem.type = newItem.type || existingItem.type;
                existingItem.effects = newItem.effects || existingItem.effects;
              } else {
                // 非存量物品，按协议直接压入背包列表 (Fresh insertion)喵
                items.push(newItem);
              }
            }

            if (action.op === 'remove') {
              const val = action.value; // 支持字符串 ID、名称或结构化对象
              let countToRemove = 1;
              let idToCheck = '';

              if (typeof val === 'string') {
                // 适配 "物品名,数量" 的批量移动格式 (例如 "Apple,5")
                if (val.includes(',')) {
                  const lastIndex = val.lastIndexOf(',');
                  const possibleCount = parseInt(val.substring(lastIndex + 1).trim());
                  if (!isNaN(possibleCount)) {
                    idToCheck = val.substring(0, lastIndex).trim();
                    countToRemove = possibleCount;
                  } else {
                    idToCheck = val;
                  }
                } else {
                  idToCheck = val;
                }
              } else {
                idToCheck = val.id || val.name;
                countToRemove = val.count || 1;
              }

              // 按 ID 或名称检索目标物品
              const existingItem = items.find((i) => i.id === idToCheck || i.name === idToCheck);

              if (existingItem) {
                existingItem.count -= countToRemove;

                if (existingItem.count <= 0) {
                  const idx = items.indexOf(existingItem);
                  items.splice(idx, 1);
                }
              }
            }
          } else if (action.target === 'spell_cards') {
            // 符卡 (Spell Cards) 仓储管理逻辑 (逻辑对齐背包系统)
            if (!state.value.player.spell_cards) state.value.player.spell_cards = [];
            const spellCards = state.value.player.spell_cards;

            if (action.op && ['push', 'add', 'set'].includes(action.op)) {
              const values = Array.isArray(action.value) ? action.value : [action.value];

              for (const val of values) {
                let newCard: SpellCard;

                if (typeof val === 'string') {
                  // 在符卡库中反查预设原型 (Preset Lookup)
                  const preset =
                    PRESET_SPELLCARDS[val] ||
                    Object.values(PRESET_SPELLCARDS).find((p) => p.name === val);
                  if (preset) {
                    newCard = {
                      name: preset.name!,
                      description: preset.description!,
                      cost: preset.cost || 0,
                      damage: preset.damage || 0,
                      scope: preset.scope || 'single',
                      type: preset.type || 'attack',
                      effects: preset.effects,
                      isUltimate: preset.isUltimate || false,
                      hitRate: preset.hitRate, // 可选：从预设中继承原生命中率配置
                      level: 1,
                      experience: 0
                    };
                  } else {
                    // 纯文本降级处理 (仅存最简元数据)
                    newCard = {
                      name: val,
                      description: '暂无描述',
                      cost: 0,
                      damage: 0,
                      scope: 'single',
                      type: 'attack',
                      isUltimate: false,
                      hitRate: 0.1,
                      level: 1,
                      experience: 0
                    };
                  }
                } else {
                  // 接收来自 LLM 的结构化数据指令
                  const rawId = val.id || val.name;
                  const preset = rawId
                    ? PRESET_SPELLCARDS[rawId] ||
                      Object.values(PRESET_SPELLCARDS).find((p) => p.name === rawId)
                    : null;

                  if (preset) {
                    newCard = {
                      ...preset,
                      ...val,
                      name: val.name || preset.name,
                      description: val.description || preset.description,
                      isUltimate:
                        val.isUltimate !== undefined ? val.isUltimate : preset.isUltimate || false,
                      hitRate: val.hitRate !== undefined ? val.hitRate : preset.hitRate || 0.1,
                      level: val.level || 1,
                      experience: val.experience || 0
                    } as SpellCard;
                    if ('id' in newCard) delete (newCard as any).id;
                  } else {
                    newCard = {
                      name: val.name || val.id || '未知符卡',
                      description: val.description || '暂无描述',
                      cost: val.cost || 0,
                      damage: val.damage || 0,
                      scope: val.scope || 'single',
                      type: val.type || 'attack',
                      isUltimate: val.isUltimate || false,
                      hitRate: val.hitRate !== undefined ? val.hitRate : val.isUltimate ? 1.0 : 0.2,
                      buffDetails: val.buffDetails,
                      effects: val.effects // 遗留字段兼容支持
                    };
                  }
                }

                // 幂等性防护：基于名称防重，但允许在 SET 模式下更新既有卡牌的阶级属性 (Deduplication)
                const existingCard = spellCards.find((c) => c.name === newCard.name);
                if (existingCard) {
                  if (action.op === 'set') {
                    // 覆盖既有符卡的属性字段 (Prop Overwrite)
                    Object.assign(existingCard, newCard);
                  }
                } else {
                  spellCards.push(newCard);
                }
              }
            }

            if (action.op === 'remove') {
              const val = action.value;
              const nameToCheck = typeof val === 'string' ? val : val.name || val.id;

              const idx = spellCards.findIndex((c) => c.name === nameToCheck);
              if (idx > -1) {
                spellCards.splice(idx, 1);
              }
            }
          } else if (action.target === 'recipes') {
            if (!state.value.player.recipes) state.value.player.recipes = [];
            const recipes = state.value.player.recipes;

            if (action.op === 'add' || action.op === 'push') {
              const values = Array.isArray(action.value) ? action.value : [action.value];
              for (const val of values) {
                let newRecipe: any;
                if (typeof val === 'string') {
                  newRecipe = {
                    id: val,
                    name: val,
                    description: '暂无描述',
                    practice: '暂无做法',
                    price: 0,
                    tags: []
                  };
                } else {
                  newRecipe = {
                    id: val.id || val.name || 'unknown',
                    name: val.name || val.id || '未知配方',
                    description: val.description || '暂无描述',
                    practice: val.practice || '暂无做法',
                    price: Number(val.price) || 0,
                    tags: Array.isArray(val.tags) ? val.tags : []
                  };
                }
                // Avoid duplicates
                if (!recipes.find((r) => r.id === newRecipe.id || r.name === newRecipe.name)) {
                  recipes.push(newRecipe);
                }
              }
            }

            if (action.op === 'remove') {
              const val = action.value;
              const idToCheck = typeof val === 'string' ? val : val.id || val.name;
              const idx = recipes.findIndex((r) => r.id === idToCheck || r.name === idToCheck);
              if (idx > -1) {
                recipes.splice(idx, 1);
              }
            }
          } else {
            // 针对纯字符串列表 (如“权限”标识集) 的遗留处理链路 (Legacy Handling)
            const list = _.get(state.value.player, action.target) as any[];
            if (Array.isArray(list)) {
              if (action.op === 'push' || action.op === 'add') {
                list.push(action.value);
              }
              if (action.op === 'remove') {
                const idx = list.indexOf(action.value);
                if (idx > -1) list.splice(idx, 1);
              }
            }
          }
        }
        break;

      case 'SCENE':
        if (action.location) {
          state.value.player.location = action.location;
        }

        // 结构兼容性处理：处理模型将 add_chars 误传至 value 字段的常见偏差 (修正模型幻觉)
        let charsToAdd = action.add_chars;
        if (!charsToAdd && action.op === 'add_chars' && Array.isArray(action.value)) {
          charsToAdd = action.value;
        }

        // 处理角色进场指令
        if (charsToAdd && Array.isArray(charsToAdd)) {
          const charStore = useCharacterStore();
          for (const charItem of charsToAdd) {
            let charId: string;
            let charData: any = {};

            if (typeof charItem === 'string') {
              charId = charItem;
            } else {
              // 情况：LLM 传回了结构化的 NPC 完整定义数据集 (Full NPC Context)
              // 身份识别优先级：优先使用显式 ID 字段，缺失时回退至使用名称作为主键。
              charId = charItem.id || charItem.uuid || charItem.name;
              charData = charItem;
            }

            if (!charId) continue;

            // 调用中心化身份识别服务解析标准的 UUID 主键
            const resolvedId = resolveCharacterId(charId, charStore.characters, state.value.npcs);
            const staticChar = charStore.characters.find((c) => c.uuid === resolvedId);

            // 若解析器回退至原始输入，尝试在静态模版库中进行二次交叉比对以锁定身份 (Fallback Verification)
            if (resolvedId === charId && !staticChar) {
              // 最后一次尝试：在静态数据库中按名称检索（虽然 resolveCharacterId 通常已覆盖此场景，但仍作为二级兜底）
              // 内部提示：resolveCharacterId 的上层逻辑实际上已覆盖此类情况，此处做二次确认。
            } else {
              charId = resolvedId;
            }

            // 预设注入：若成功锁定静态模版，则强制同步全局统一的 UUID 与 规范名称基准 (Sync from Lorebook)
            if (staticChar) {
              charId = staticChar.uuid;
              if (!state.value.npcs[charId]) {
                state.value.npcs[charId] = {
                  id: charId,
                  name: staticChar.name,
                  power: staticChar.initialPower || 'F' // 从角色设计手册 (Lorebook) 中拉取初始战力基准值喵
                } as any;
              }
            }

            if (!state.value.system.current_scene_npcs.includes(charId)) {
              state.value.system.current_scene_npcs.push(charId);
            }

            // 执行 NPC 注册记录的新建或增量更新工作 (Upsert Registry)
            if (!state.value.npcs[charId]) {
              state.value.npcs[charId] = {
                id: charId,
                name: staticChar ? staticChar.name : charId,
                gender: staticChar?.gender as any,
                power: staticChar?.initialPower || 'F' // 强化属性初始化：确保战力评级字段受控喵
              } as any;
            } else {
              // 属性打补丁：若既有 NPC 缺失关键字段 (如性别、战力等级)，则由静态模版库自动注标 (Lazy Patching)
              const existingNpc = state.value.npcs[charId];
              if (existingNpc && !existingNpc.gender && staticChar?.gender) {
                existingNpc.gender = staticChar.gender as any;
              }
              if (existingNpc && !existingNpc.power && staticChar?.initialPower) {
                existingNpc.power = staticChar.initialPower as any;
              }
            }

            // 深度上下文聚合：合并来自 LLM 推理生成的复杂人格特征与环境标记喵！ (Deep Context Merging)
            // 语义适配层：智能识别入参中待映射的中文属性 Key (China-Key Adapter)喵
            if (Object.keys(charData).length > 0) {
              const mappedData: any = {};
              for (const [key, val] of Object.entries(charData)) {
                const mappedKey = NPC_FIELD_MAPPING[key] || key;
                mappedData[mappedKey] = val;
              }
              const npc = state.value.npcs[charId];
              if (npc) {
                _.merge(npc, mappedData);
              }
            }
          }
        }

        // 处理角色离场指令 (Remove from scene)
        if (action.remove_chars && Array.isArray(action.remove_chars)) {
          const charStore = useCharacterStore();
          // 在剔除动作前，先将所有待处理 ID 规整化为系统内部标准 UUID 令牌 (Canonical Mapping)
          const resolvedIdsToRemove = action.remove_chars.map((rawId) => {
            return resolveCharacterId(rawId, charStore.characters, state.value.npcs);
          });

          state.value.system.current_scene_npcs = state.value.system.current_scene_npcs.filter(
            (id) => !resolvedIdsToRemove.includes(id)
          );
        }
        break;
    }
  }

  /**
   * 手动将当前实时游戏状态持久化至最近一次的聊天快照节点中。
   * 常用于在非全局循环链路逻辑下（如通过 UI 驱动的人设变更、剧情梗概更新等）维持即时存档的强一致性。
   */
  async function saveCurrentStateToLastSnapshot() {
    try {
      const settingsStore = useSettingsStore();
      const currentSaveSlotId = settingsStore.currentSaveSlotId;
      if (!currentSaveSlotId) return;

      // 溯源：寻找关联了特定存档插槽的最后一条携带快照的聊天记录项
      const lastChatWithSnapshot = await dbService.getLastChatWithSnapshot(currentSaveSlotId);

      if (lastChatWithSnapshot && lastChatWithSnapshot.snapshotId) {
        const currentState = JSON.parse(JSON.stringify(state.value));
        await dbService.updateSnapshot(lastChatWithSnapshot.snapshotId, {
          gameState: JSON.stringify(currentState)
        });
        console.log(
          '[游戏存档] 已成功将当前实时状态持久化至快照节点:',
          lastChatWithSnapshot.snapshotId
        );
      }
    } catch (e) {
      console.error('[游戏状态存储] 状态持久化至快照节点失败喵:', e);
    }
  }

  return {
    state,
    quickReplies,
    me,
    updateState,
    setState,
    resetState,
    updatePlayer,
    incrementTurn,
    applyAction,
    setQuickReplies,
    clearQuickReplies,
    setCombatState,
    startCombatTutorial,
    setPendingQuest,
    addQuest,
    updateQuestStatus,
    unlockTalent,
    addPromise,
    updatePromise,
    setVote,
    updateVote,
    setTotalEnergy,
    setEnergySharing,
    updatePlayerEnergy,
    setPlayerAvatar,
    saveCurrentStateToLastSnapshot,
    // 联机模块指令暴露 (Multiplayer Actions)
    multiplayer,
    setMultiplayer,
    setRoomInfo,
    updatePlayers,
    addPlayer,
    removePlayer,
    setMultiplayerStatus
  };
});

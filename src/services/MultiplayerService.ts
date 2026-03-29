import { useGameStore } from '@/stores/game';
import { useToastStore } from '@/stores/toast';
import { useChatStore } from '@/stores/chat';
import { useSaveStore } from '@/stores/save';
import { dbService } from './DatabaseService';
import { memoryService } from './memory';
import { cryptoService } from './CryptoService';
import { audioManager } from './audio';

// 官方生产环境地址
const OFFICIAL_SERVER_URL = 'wss://wo.jiushi.gay/ws';
// 默认开发环境地址
const DEFAULT_SERVER_URL = OFFICIAL_SERVER_URL;

class MultiplayerService {
  private static instance: MultiplayerService;
  private ws: WebSocket | null = null;
  private cryptoKey: CryptoKey | null = null;

  // 房主侧：推行顺序执行逻辑的指令队列，防止高并发导致的状态竞争。
  private commandQueue: any[] = [];
  private isProcessingQueue: boolean = false;

  // 房主侧：暂存当前所有访客的原子化输入内容。
  private pendingGuestInputs: Record<string, string> = {};

  // 同步优化相关的内部变量
  private lastSentState: string = '';
  private lastSyncTime: number = 0;
  private readonly SYNC_INTERVAL = 100; // 限制同步频率为 10Hz (100ms)

  // 房主侧：表决投票状态机
  private activeVote: {
    id: string;
    proposal: string;
    options: string[];
    votes: Record<string, number>; // playerId -> optionIndex
    totalPlayers: number;
    isEnded?: boolean;
  } | null = null;

  private constructor() {}

  public static getInstance(): MultiplayerService {
    if (!MultiplayerService.instance) {
      MultiplayerService.instance = new MultiplayerService();
    }
    return MultiplayerService.instance;
  }

  public get OFFICIAL_SERVER_URL(): string {
    // 始终使用官方服务器地址
    return DEFAULT_SERVER_URL;
  }

  /**
   * 功能：从远程中继节点拉取当前开放渲染的所有公共房间列表。
   */
  public async fetchPublicRooms(): Promise<any[]> {
    try {
      // 路径转换：WebSocket 地址为 wss://.../ws，我们需要转换为 API 地址 https://.../rooms
      const baseUrl = this.OFFICIAL_SERVER_URL.replace('wss://', 'https://')
        .replace('ws://', 'http://')
        .replace('/ws', '');
      const response = await fetch(`${baseUrl}/rooms`);
      if (!response.ok) throw new Error('Failed to fetch rooms');
      return await response.json();
    } catch (e) {
      console.error('[联机] 获取房间列表失败:', e);
      return [];
    }
  }

  public get identityKey(): string {
    if (typeof window === 'undefined') return '';
    let key = localStorage.getItem('mp_identity_key');
    if (!key) {
      key = Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem('mp_identity_key', key);
    }
    return key;
  }

  public setIdentityKey(key: string) {
    if (typeof window === 'undefined') return;
    if (!key || key.trim().length < 8) return false;
    localStorage.setItem('mp_identity_key', key.trim());
    return true;
  }

  /**
   * 核心流程：作为房主 (Host) 角色发起并初始化一个新的联机房间节点。
   */
  public async createRoom(
    hostName: string,
    identity: string = '房主',
    persona: string = '',
    power: string = 'A',
    password?: string,
    roomName?: string
  ): Promise<string> {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    // 构造连接 URL 字符串 (WebSocket URL)
    let url = `${this.OFFICIAL_SERVER_URL}?action=create&room=${roomId}&host=true&id=${this.identityKey}&name=${encodeURIComponent(hostName)}`;
    if (password) {
      url += `&pass=${encodeURIComponent(password)}`;
    }
    if (roomName) {
      url += `&roomName=${encodeURIComponent(roomName)}`;
    }

    // 密钥派生：若设置了房间密码，则启动加密密钥生成流程。
    if (password) {
      try {
        this.cryptoKey = await cryptoService.deriveKey(password);
        console.log('[联机] 已启用端到端加密');
      } catch (e) {
        console.error('[联机] 密钥生成失败:', e);
      }
    } else {
      this.cryptoKey = null;
    }

    console.log(`[联机] 正在创建房间 ${roomId}，地址：${url}`);

    return new Promise((resolve, reject) => {
      this.connect(
        url,
        () => {
          console.log(`[联机] 房间已创建: ${roomId}`);

          // 初始化玩家列表（仅包含当前玩家自己）
          const gameStore = useGameStore();
          (gameStore as any).updatePlayers([
            {
              id: this.identityKey,
              name: hostName,
              identity: identity,
              persona: persona,
              power: power,
              isHost: true,
              isMe: true
            }
          ]);

          resolve(roomId);
        },
        (err) => {
          console.error('[联机] 创建房间失败:', err);
          reject(err);
        }
      );
    });
  }

  /**
   * 核心流程：作为访客 (Guest) 角色申请加入已存在的联机房间。
   */
  public async joinRoom(
    roomId: string,
    playerName: string,
    identity: string = '异界访客',
    persona: string = '',
    power: string = 'E',
    password?: string,
    initialStats?: { hp: number; mp: number; money: number }
  ): Promise<boolean> {
    // 构造加入房间的连接 URL (WebSocket URL)
    let url = `${this.OFFICIAL_SERVER_URL}?action=join&room=${roomId}&host=false&id=${this.identityKey}&name=${encodeURIComponent(playerName)}`;
    if (password) {
      url += `&pass=${encodeURIComponent(password)}`;
    }

    // 密钥派生：若设置了房间密码，则启动端到端解密密钥准备。
    if (password) {
      try {
        this.cryptoKey = await cryptoService.deriveKey(password);
        console.log('[联机] 已启用端到端加密');
      } catch (e) {
        console.error('[联机] 密钥生成失败:', e);
      }
    } else {
      this.cryptoKey = null;
    }

    console.log(`[联机] 正在加入房间 ${roomId}，地址：${url}`);

    return new Promise((resolve, reject) => {
      this.connect(
        url,
        () => {
          console.log(`[联机] 已加入房间: ${roomId}`);

          // Send Player Info immediately
          this.send('PLAYER_INFO', {
            name: playerName,
            identity: identity || '异界访客',
            persona: persona,
            power: power,
            avatarUrl: '', // 待办：对接自定义头像系统支持
            initialStats: initialStats // 发送自定义初始数值
          });

          // 初始化玩家列表（自身已确定，其他成员将通过后续事件逐步同步）
          const gameStore = useGameStore();
          (gameStore as any).updatePlayers([
            {
              id: this.identityKey,
              name: playerName,
              identity: identity || '访客',
              persona: persona,
              power: power,
              isHost: false,
              isMe: true,
              ...initialStats // 本地预览也加上
            }
          ]);

          resolve(true);
        },
        (err) => {
          console.error('[联机] 加入房间失败:', err);
          reject(err);
        }
      );
    });
  }

  private connect(url: string, onOpen: () => void, onError: (err: any) => void) {
    if (this.ws) {
      // 彻底清理并析构旧的 WebSocket 句柄。
      this.ws.onopen = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.onmessage = null;
      this.ws.close();
    }

    // 设置连接超时熔断机制。
    const connectionTimeout = setTimeout(() => {
      if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
        console.error('[联机] 连接官方服务器超时');
        this.ws.close();
        onError(new Error('Connection timeout'));
      }
    }, 10000);

    try {
      console.log(`[联机] 正在建立 WebSocket 连接: ${url}`);
      this.ws = new WebSocket(url);
    } catch (e) {
      clearTimeout(connectionTimeout);
      onError(e);
      return;
    }

    this.ws.onopen = () => {
      clearTimeout(connectionTimeout);
      onOpen();
    };

    this.ws.onclose = (event) => {
      clearTimeout(connectionTimeout);
      console.warn(`[联机] WebSocket 已关闭: 代码=${event.code}, 原因=${event.reason || '无'}`);

      const gameStore = useGameStore();
      const toastStore = useToastStore();

      if (gameStore.multiplayer.isMultiplayer) {
        const reason = event.reason || (event.code === 1008 ? '房间已满 (Max 6)' : '连接断开');
        toastStore.addToast(`联机中断: ${reason}`, 'error');

        // 断开连接后重置联机相关的运行时状态
        gameStore.setMultiplayer(false);
        gameStore.setRoomInfo(null);
        this.ws = null;
        this.cryptoKey = null;
        this.activeVote = null;
      }
    };

    this.ws.onerror = (err) => {
      clearTimeout(connectionTimeout);
      // 注意：WebSocket 的 error 事件返回的信息通常非常有限，仅包含连接层异常
      console.error('[联机] WebSocket 错误详情:', err);
      const toastStore = useToastStore();
      toastStore.addToast('无法连接到联机服务器，请检查网络或稍后再试', 'error');
      onError(err);
    };

    this.ws.onmessage = async (event) => {
      try {
        const data = event.data;
        if (typeof data !== 'string') return;

        // 处理可能存在的“粘包”情况（多个 JSON 消息由换行符分隔）
        const messages = data.split('\n').filter((line) => line.trim() !== '');

        for (const rawMsg of messages) {
          try {
            const msg = JSON.parse(rawMsg);
            await this.handleMessage(msg);
          } catch (e) {
            console.warn('[联机] 解析单条消息失败:', rawMsg, e);
          }
        }
      } catch (e) {
        console.warn('[联机] 解析消息流失败:', event.data, e);
      }
    };
  }

  public disconnect() {
    if (this.ws) {
      console.log('[联机] 正在断开与服务器的连接并清理本地状态副本。');
      this.ws.close();
      this.ws = null;
      this.cryptoKey = null;
      this.activeVote = null;
    }
  }

  /**
   * 底层通信接口：向中继服务器 (Relay Server) 派发消息。
   * 支持端到端透明加密逻辑。
   */
  public async send(type: string, payload: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[联机] 发送失败: WebSocket 未连接');
      return;
    }

    let finalPayload = payload;
    let isEncrypted = false;

    // 若密钥已就绪且消息类型非系统内部事件，则执行加密处理
    if (this.cryptoKey) {
      try {
        const encrypted = await cryptoService.encrypt(payload, this.cryptoKey);
        finalPayload = encrypted;
        isEncrypted = true;
      } catch (e) {
        console.error('[联机] 加密失败:', e);
        return;
      }
    }

    const message = {
      type,
      senderId: this.identityKey,
      payload: finalPayload,
      isEncrypted
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * 房主广播：将最新的玩家逻辑列表（含生理生理快照）实时同步至所有访客节点。
   */
  public syncPlayerList() {
    const gameStore = useGameStore();
    if (!gameStore.multiplayer.isHost) return;

    const playersToSend = gameStore.multiplayer.players.map((p) => {
      const stats: any = {};

      if (p.isHost) {
        // Host uses local player state
        stats.hp = gameStore.state.player.hp;
        stats.max_hp = gameStore.state.player.max_hp;
        stats.mp = gameStore.state.player.mp;
        stats.max_mp = gameStore.state.player.max_mp;
        stats.money = gameStore.state.player.money;
      } else {
        // Guests use companions state
        const comp = gameStore.state.multiplayer_companions?.[p.id];
        if (comp) {
          stats.hp = comp.hp;
          stats.max_hp = comp.max_hp;
          stats.mp = comp.mp;
          stats.max_mp = comp.max_mp;
          stats.money = comp.money;
        }
      }

      return {
        id: p.id,
        name: p.name,
        identity: p.identity,
        persona: p.persona,
        power: p.power,
        isHost: p.isHost,
        avatarUrl: p.avatarUrl,
        status: p.status,
        lastDiceRollTurn: p.lastDiceRollTurn,
        ...stats
      };
    });

    this.send('SYNC_PLAYERS', { players: playersToSend });
  }

  /**
   * 房主广播：将全量或增量的游戏逻辑状态快照下派至所有访客侧。
   */
  public async syncHostState(gameState: any) {
    const gameStore = useGameStore();
    if (!gameStore.multiplayer.isHost) return;

    // 1. 频率限制 (Throttling)
    const now = Date.now();
    if (now - this.lastSyncTime < this.SYNC_INTERVAL) {
      return;
    }

    // 2. Delta 压缩 (极其简易的实现：仅发送变更部分或跳过重复状态)
    const currentStateStr = JSON.stringify(gameState);
    if (currentStateStr === this.lastSentState) {
      return;
    }

    this.lastSyncTime = now;
    this.lastSentState = currentStateStr;

    this.send('SYNC_STATE', { state: gameState });
  }

  /**
   * 访客上行：向房主中心节点提交当前回合的对话输入内容。
   */
  public sendGuestAction(content: string) {
    this.send('PLAYER_ACTION', { content });
  }

  /** 访客侧：向房主提交战斗指令载荷 */
  public sendCombatAction(type: string, payload: any, targetId?: string) {
    this.send('COMBAT_ACTION', { type, payload, targetId });
  }

  /**
   * 通用通信：派发 OOC (Out of Character) 聊天频道的消息内容。
   */
  public sendChat(content: string) {
    this.send('CHAT_MESSAGE', { content });
  }

  /** 房主侧：向所有访客广播战斗视觉特效指令 */
  public sendCombatEffect(effectData: any) {
    this.send('COMBAT_EFFECT', { ...effectData });
  }

  /** 房主侧：向所有访客广播战斗日志报文 */
  public sendCombatLog(logData: any) {
    this.send('COMBAT_LOG', { ...logData });
  }

  /** 访客侧：在上报输入草稿状态（含节流处理） */
  public sendDraft(content: string) {
    this.send('PLAYER_DRAFT', { content });
  }

  /**
   * 房主管理：向所有客户端发起一项新的全场表决投票 (Vote)。
   */
  public startVote(proposal: string, options: string[]) {
    const gameStore = useGameStore();
    if (!gameStore.multiplayer.isHost) return;

    const voteId = Math.random().toString(36).substring(2, 8);
    this.activeVote = {
      id: voteId,
      proposal,
      options,
      votes: {},
      totalPlayers: gameStore.multiplayer.players.length
    };

    const voteData = {
      id: voteId,
      proposal,
      options,
      votes: {},
      totalPlayers: gameStore.multiplayer.players.length,
      endTime: Date.now() + 60000, // 默认 60 秒
      initiatorId: this.identityKey,
      isEnded: false
    };

    // Update Local Store
    (gameStore as any).setVote(voteData);

    // Broadcast Vote Start
    this.send('VOTE_PROPOSAL', voteData);
  }

  /** 参与全场表决投票 */
  public castVote(voteId: string, optionIndex: number) {
    const gameStore = useGameStore();
    if (gameStore.multiplayer.activeVote?.id === voteId) {
      this.send('VOTE_CAST', { voteId, optionIndex });
      // 如果是房主，直接在本地记录
      if (gameStore.multiplayer.isHost && this.activeVote) {
        this.activeVote.votes[this.identityKey] = optionIndex;
        (gameStore as any).updateVote({ ...this.activeVote.votes });
      }
    }
  }

  /** 向房主贡献联机能源资产 */
  public contributeEnergy(amount: number) {
    this.send('ENERGY_CONTRIBUTION', { amount });
  }

  /** 房主侧：向所有房客发起能源资助请求 */
  public requestEnergy() {
    const gameStore = useGameStore();
    if (!gameStore.multiplayer.isHost) return;
    this.send('ENERGY_REQUEST', { requesterName: gameStore.state.player.name });
  }

  /** 房主侧：更新当前房间的能源池总量 */
  public updateEnergy(amount: number) {
    const gameStore = useGameStore();
    if (!gameStore.multiplayer.isHost) return;

    const newTotal = (gameStore.multiplayer.totalEnergy || 0) + amount;
    (gameStore as any).setTotalEnergy(newTotal);
    this.send('SYNC_ENERGY', { totalEnergy: newTotal });
  }

  /** 房主侧：切换能源池全场共享开关 */
  public toggleEnergySharing(isSharing: boolean) {
    const gameStore = useGameStore();
    if (!gameStore.multiplayer.isHost) return;

    (gameStore as any).setEnergySharing(isSharing);
    this.send('SYNC_ENERGY_SHARING', { isSharing });
  }

  /** 广播掷骰子的结果点数 */
  public sendDiceRoll(sides: number, result: number) {
    this.send('DICE_ROLL', { sides, result });
  }

  /** 房主侧：向所有访客广播战斗数值弹窗 */
  public sendCombatPopup(popupData: any) {
    this.send('COMBAT_POPUP', { ...popupData });
  }

  /**
   * 房主管理：强制踢出指定 ID 的玩家个体，并同步最新的成员清单。
   */
  public kickPlayer(playerId: string) {
    const gameStore = useGameStore();
    if (!gameStore.multiplayer.isHost) return;

    // 1. 向目标玩家下发“已被踢出”的强制退出报文
    this.send('PLAYER_KICKED', { targetId: playerId });

    // 2. 在本地清单中移除目标玩家（随后将通过同步操作使所有节点保持一致）
    gameStore.multiplayer.players = gameStore.multiplayer.players.filter((p) => p.id !== playerId);

    // 3. 全场广播更新后的成玩家员清单
    this.syncPlayerList();

    console.log(`[联机] 房主踢出了玩家: ${playerId}`);
  }

  /** 房主侧：向所有访客广播实时流式 LLM Token 载荷 */
  public sendLLMToken(token: string) {
    this.send('LLM_TOKEN', { token });
  }

  /** 房主侧：将系统记忆（如剧情概括）同步至所有访客侧 */
  public sendMemorySync(memoryData: any) {
    this.send('MEMORY_SYNC', { memoryData });
  }

  /** 房主侧：向所有客户端广播战斗初始化的环境报文 */
  public sendCombatInit(combatState: any) {
    this.send('COMBAT_INIT', { combatState });
  }

  /** 房主侧：向特定访客同步全量状态（通常用于新成员加入时的冷启动） */
  public async syncFullStateToGuest(targetGuestId: string) {
    const gameStore = useGameStore();
    if (!gameStore.multiplayer.isHost) return;

    console.log(`[联机] 开始向访客 ${targetGuestId} 同步全量状态...`);

    // 1. 同步核心游戏状态（含剧情变量、NPC 动态镜像等数据）
    this.send('SYNC_STATE', { state: gameStore.state });

    // 2. 同步聊天历史记录（默认回溯最近 50 条消息载荷）
    const chatStore = useChatStore();
    const recentMessages = chatStore.messages.slice(-50);
    this.send('SYNC_CHAT_HISTORY', { messages: recentMessages });

    // 3. 同步系统记忆数据库（如果存在）
    try {
      const saveStore = useSaveStore();
      const saveSlotId = saveStore.currentSaveId;
      if (saveSlotId) {
        const memories = await dbService.getAllMemories(saveSlotId);
        if (memories && memories.length > 0) {
          // 数据分片策略：是以批次下发还是作为完整的大型载荷一次性同步？
          // 优化建议：为防范载荷过大，目前仅同步最近的 20 条关键记忆。
          const recentMemories = memories.slice(0, 20);
          this.send('SYNC_MEMORIES', { memories: recentMemories });
        }
      }
    } catch (e) {
      console.error('[联机] 同步记忆失败:', e);
    }

    // 4. 同步能源池存量及全场共享配置状态
    this.send('SYNC_ENERGY', { totalEnergy: gameStore.multiplayer.totalEnergy });
    this.send('SYNC_ENERGY_SHARING', { isSharing: gameStore.multiplayer.isSharingEnergy });

    // 5. 同步当前正在进行的表决投票（如果存在）
    if (this.activeVote && !this.activeVote.isEnded) {
      this.send('VOTE_PROPOSAL', {
        ...this.activeVote
        // 注意：若后续需要支持匿名投票，则需要在此处剥离具体的投票细节。
      });
      this.send('SYNC_VOTES', { voteId: this.activeVote.id, votes: this.activeVote.votes });
    }
  }

  /**
   * 核心逻辑处理器：负责拆解、校验并应用外部下发的各类消息载荷。
   */
  private async handleMessage(msg: any) {
    const gameStore = useGameStore();

    // 执行解密逻辑（若消息已加密）
    if (msg.isEncrypted) {
      if (!this.cryptoKey) {
        console.warn('[联机] 收到加密消息但本地无密钥 (可能密码错误)');
        return;
      }
      try {
        const { ciphertext, iv } = msg.payload;
        if (!ciphertext || !iv) throw new Error('Invalid encrypted payload');

        const decryptedPayload = await cryptoService.decrypt(ciphertext, iv, this.cryptoKey);
        msg.payload = decryptedPayload;
      } catch (e) {
        console.error('[联机] 解密失败:', e);
        return;
      }
    }

    // 房主侧特权逻辑：特定的原子化指令将被注入顺序队列中平滑执行，防止竞态冲突。
    if (gameStore.multiplayer.isHost) {
      const queueableTypes = ['PLAYER_ACTION', 'COMBAT_ACTION', 'PLAYER_INFO', 'VOTE_CAST'];
      if (queueableTypes.includes(msg.type)) {
        this.enqueueCommand(msg);
        return;
      }
    }

    await this.executeMessage(msg);
  }

  /**
   * 辅助逻辑：向顺序处理队列压入一条待执行指令（房主模式专用）。
   */
  private enqueueCommand(msg: any) {
    this.commandQueue.push(msg);
    this.processQueue();
  }

  /**
   * 调度核心：按压入顺序串行处理并发过来的指令载荷。
   */
  private async processQueue() {
    if (this.isProcessingQueue || this.commandQueue.length === 0) return;

    this.isProcessingQueue = true;

    while (this.commandQueue.length > 0) {
      const msg = this.commandQueue.shift();
      try {
        await this.executeMessage(msg);
      } catch (e) {
        console.error('[联机] 执行指令失败:', e, msg);
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * 动作映射：将解析后的消息载荷对齐至具体的业务逻辑方法。
   */
  private async executeMessage(msg: any) {
    const gameStore = useGameStore();
    const toastStore = useToastStore();

    switch (msg.type) {
      case 'SYNC_CHAT_MESSAGE': {
        const senderId = msg.senderId;
        const sender = gameStore.multiplayer.players.find((p) => p.id === senderId);

        if (!gameStore.multiplayer.isHost && sender?.isHost && msg.payload) {
          const chatStore = useChatStore();
          const { role, content, timestamp } = msg.payload;

          // 重复项校验：防止网络原因导致的重复消息解析同步
          const exists = chatStore.messages.some(
            (m) =>
              m.role === role &&
              m.content === content &&
              Math.abs(m.timestamp - (timestamp || 0)) < 2000 // 频率窗口：2 秒内视为重复
          );

          if (!exists) {
            chatStore.addMessage(role, content, timestamp);
            console.log(`[联机] 同步收到新消息: ${role}`);

            // 如果收到助手消息，重置所有玩家的就绪状态和草稿
            if (role === 'assistant') {
              gameStore.multiplayer.players.forEach((p) => {
                p.status = 'idle';
                p.draftContent = '';
              });
              // 发送事件通知 UI 组件重置本地状态
              window.dispatchEvent(new CustomEvent('mp-reset-draft'));
            }
          }
        } else if (!gameStore.multiplayer.isHost && !sender?.isHost) {
          console.warn(`[联机] 拦截到非房主发送的消息同步: 来自 ${senderId}`);
        }
        break;
      }

      case 'SYNC_STATE':
        // 逻辑析构：访客接收并全量应用来自房主的权威游戏状态同步资产。
        if (!gameStore.multiplayer.isHost && msg.payload?.state) {
          gameStore.setState(msg.payload.state);
          console.log('[联机] 已同步最新游戏状态');
        }
        break;

      case 'SYNC_CHAT_HISTORY': {
        if (!gameStore.multiplayer.isHost && msg.payload?.messages) {
          const chatStore = useChatStore();
          // 冲突处理：在初始化同步阶段，直接替换本地副本比合并冲突更具时空一致性。
          // 默认在建立连接后执行覆盖式初始化。
          // [优化建议]：后续应对重复消息做更严谨的 UUID 幂等性校验。
          const incoming = msg.payload.messages;
          // We might want to clear existing if it's a fresh join?
          // For now, let's just append ones we don't have
          // actually, chatStore.setMessages(incoming) might be better if we trust host completely
          // But user might have their own system messages.
          // Let's use a merge strategy
          incoming.forEach((m: any) => {
            if (!chatStore.messages.find((existing) => existing.id === m.id)) {
              chatStore.addMessage(m.role, m.content, m.timestamp); // 注意：此处需确保 ID 的幂等性同步
              // chatStore.addMessage generates new ID.
              // We should probably force set the messages array if possible or expose a bulk add
              // For simplicity:
            }
          });
          // Re-fetch store to update list (hacky)
          chatStore.messages = incoming; // Direct overwrite for full sync context
          console.log('[联机] 已同步聊天记录');
        }
        break;
      }

      case 'SYNC_MEMORIES': {
        // 访客解析：接收来自房主的记忆推导数据并强制还原至本地索引。
        if (!gameStore.multiplayer.isHost && msg.payload?.memories) {
          for (const mem of msg.payload.memories) {
            // 解析幂等性检查
            // 执行原子化持久化映射 (Minimal Sync)
            await dbService.addMemory(mem);
            await memoryService.updateGraph(mem);
          }
          console.log('[联机] 已同步记忆库');
        }
        break;
      }

      case 'PLAYER_DRAFT': {
        const senderId = msg.senderId;
        const content = msg.payload?.content;
        const player = gameStore.multiplayer.players.find((p) => p.id === senderId);
        if (player) {
          // 如果内容为空且当前状态不是 ready，则设为 idle
          if (!content && player.status !== 'ready') {
            player.status = 'idle';
          } else if (player.status !== 'ready') {
            player.status = 'drafting';
          }
          player.draftContent = content;
        }
        break;
      }

      case 'COMBAT_ACTION':
        // 房主接收：分发并处理来自访客提交的战斗动作指令序列。
        if (gameStore.multiplayer.isHost) {
          const senderId = msg.senderId;
          const { type, payload, targetId } = msg.payload;

          const event = new CustomEvent('mp-combat-action', {
            detail: { senderId, type, payload, targetId }
          });
          window.dispatchEvent(event);
        }
        break;

      case 'COMBAT_EFFECT': {
        if (!gameStore.multiplayer.isHost) {
          const event = new CustomEvent('mp-combat-effect', {
            detail: msg.payload
          });
          window.dispatchEvent(event);
        }
        break;
      }

      case 'COMBAT_LOG': {
        if (!gameStore.multiplayer.isHost) {
          const event = new CustomEvent('mp-combat-log', {
            detail: msg.payload
          });
          window.dispatchEvent(event);
        }
        break;
      }

      case 'COMBAT_POPUP': { // 房主侧广播战斗数值弹窗
        if (!gameStore.multiplayer.isHost) {
          const event = new CustomEvent('mp-combat-popup', {
            detail: msg.payload
          });
          window.dispatchEvent(event);
        }
        break;
      }

      case 'STORY_GENERATING': { // 房主侧广播故事生成状态
        if (!gameStore.multiplayer.isHost) {
          const event = new CustomEvent('mp-story-generating', {
            detail: msg.payload
          });
          window.dispatchEvent(event);
        }
        break;
      }

      case 'LLM_TOKEN': { // 房主侧广播 LLM Stream Token
        if (!gameStore.multiplayer.isHost) {
          const event = new CustomEvent('mp-llm-token', {
            detail: msg.payload
          });
          window.dispatchEvent(event);
        }
        break;
      }

      case 'MEMORY_SYNC': { // 房主侧同步系统记忆数据
        if (!gameStore.multiplayer.isHost) {
          const event = new CustomEvent('mp-memory-sync', {
            detail: msg.payload
          });
          window.dispatchEvent(event);
        }
        break;
      }

      case 'STORY_FINISHED': { // 房主侧广播故事生成完成
        if (!gameStore.multiplayer.isHost) {
          const event = new CustomEvent('mp-story-finished', {
            detail: msg.payload
          });
          window.dispatchEvent(event);
        }
        break;
      }

      case 'COMBAT_INIT': { // 房主侧广播战斗初始化指令
        if (!gameStore.multiplayer.isHost) {
          const event = new CustomEvent('mp-combat-init', {
            detail: msg.payload
          });
          window.dispatchEvent(event);
        }
        break;
      }

      case 'PLAYER_ACTION': {
        const senderIdAction = msg.senderId;
        const pAction = gameStore.multiplayer.players.find((p) => p.id === senderIdAction);
        if (pAction) {
          pAction.status = 'ready';
        }

        if (gameStore.multiplayer.isHost) {
          const content = msg.payload?.content;
          if (senderIdAction && content) {
            this.addGuestInput(senderIdAction, content);
            toastStore.addToast(`收到玩家输入`, 'info');
          }
        }
        break;
      }

      case 'PLAYER_INFO': {
        // 房主接收：访客连接成功后的身份设定包（同步人设、战力等级等元数据）。
        if (gameStore.multiplayer.isHost) {
          const { name, identity, avatarUrl, persona, power, initialStats } = msg.payload;
          const senderIdInfo = msg.senderId || msg.payload.id;

          if (!senderIdInfo) break;

          const existing = gameStore.multiplayer.players.find((p) => p.id === senderIdInfo);
          if (existing) {
            existing.name = name || existing.name;
            existing.identity = identity || existing.identity;
            existing.avatarUrl = avatarUrl || existing.avatarUrl;
            existing.persona = persona || existing.persona;
            existing.power = power || existing.power;
            if (initialStats) { // 应用访客上报的初始属性数据
              existing.hp = initialStats.hp;
              existing.max_hp = initialStats.hp;
              existing.mp = initialStats.mp;
              existing.max_mp = initialStats.mp;
              existing.money = initialStats.money;
            }
          } else {
            (gameStore as any).addPlayer({
              id: senderIdInfo,
              name: name || `Player ${senderIdInfo.substring(0, 4)}`,
              identity: identity || '访客',
              persona: persona,
              power: power,
              isHost: false,
              isMe: false,
              hp: initialStats?.hp,
              mp: initialStats?.mp,
              money: initialStats?.money
            });
          }

          if (!gameStore.state.multiplayer_companions) {
            gameStore.state.multiplayer_companions = {};
          }

          let companion = gameStore.state.multiplayer_companions[senderIdInfo];

          if (!companion) {
            // 属性继承策略：仅针对首次加入的玩家应用初始数值，旧玩家沿用存档状态
            companion = {
              ...gameStore.state.player,
              id: senderIdInfo,
              isMe: senderIdInfo === this.identityKey,
              hp: initialStats?.hp ?? gameStore.state.player.hp,
              max_hp: initialStats?.hp ?? gameStore.state.player.max_hp,
              mp: initialStats?.mp ?? gameStore.state.player.mp,
              max_mp: initialStats?.mp ?? gameStore.state.player.max_mp,
              money: initialStats?.money ?? 0
            };
          }

          // 无论是否是老玩家，都允许更新这些“人设”信息
          companion.name = name || companion.name;
          companion.identity = identity || companion.identity;
          companion.persona = persona || companion.persona;
          companion.power = power || companion.power;
          if (avatarUrl) companion.avatarUrl = avatarUrl;

          // 如果是 Host，只有在 companion 还是“初始状态”或者这是个新 companion 时才应用 initialStats
          // 这里我们已经通过 if (!companion) 处理了。
          // 这样即使客机配置里写了 500 金钱，只要主机存档里他已经有 10000 了，就不会被覆写。

          gameStore.state.multiplayer_companions[senderIdInfo] = companion;

          this.syncPlayerList();
        }
        break;
      }

      case 'SYNC_PLAYERS':
        if (!gameStore.multiplayer.isHost) {
          gameStore.updatePlayers(msg.payload.players);

          const players = msg.payload.players as any[];
          if (!gameStore.state.multiplayer_companions) {
            gameStore.state.multiplayer_companions = {};
          }

          players.forEach((p) => {
            if (p.id === this.identityKey) return;

            if (!gameStore.state.multiplayer_companions![p.id]) {
              gameStore.state.multiplayer_companions![p.id] = {
                ...gameStore.state.player,
                id: p.id,
                name: p.name,
                identity: p.identity,
                persona: p.persona,
                power: p.power,
                avatarUrl: p.avatarUrl,
                hp: p.hp ?? gameStore.state.player.hp,
                max_hp: p.max_hp ?? gameStore.state.player.max_hp,
                mp: p.mp ?? gameStore.state.player.mp,
                max_mp: p.max_mp ?? gameStore.state.player.max_mp,
                money: p.money ?? 0,
                isMe: false
              };
            } else {
              const comp = gameStore.state.multiplayer_companions![p.id];
              if (comp) {
                comp.name = p.name;
                comp.identity = p.identity;
                comp.persona = p.persona;
                comp.power = p.power;
                comp.avatarUrl = p.avatarUrl;
                if (p.hp !== undefined) comp.hp = p.hp;
                if (p.max_hp !== undefined) comp.max_hp = p.max_hp;
                if (p.mp !== undefined) comp.mp = p.mp;
                if (p.max_mp !== undefined) comp.max_mp = p.max_mp;
                if (p.money !== undefined) comp.money = p.money;
              }
            }
          });
        }
        break;

      case 'SYSTEM_EVENT': {
        if (msg.payload?.event === 'ROOM_INFO') {
          const { id, name } = msg.payload;
          if (id && name) {
            console.log(`[联机] 收到房间信息: ${name} (${id})`);
            // 更新本地状态机中的房间名称信息
            const currentPass = gameStore.multiplayer.roomPassword;
            gameStore.setRoomInfo(id, currentPass, name);
          }
        } else if (msg.payload?.event === 'PLAYER_JOINED') {
          const { id, name, isHost } = msg.payload;
          const displayName = name || `玩家 ${id.substring(0, 4)}`;
          toastStore.addToast(`${displayName} 加入了房间`, 'info');

          (gameStore as any).addPlayer({
            id: id,
            name: displayName,
            identity: isHost ? '房主' : '访客',
            isHost: isHost,
            isMe: id === this.identityKey
          });

          if (gameStore.multiplayer.isHost) {
            this.syncPlayerList();
            // 对新加入的玩家触发一次全量游戏状态同步
            this.syncFullStateToGuest(id);
          }
        } else if (msg.payload?.event === 'PLAYER_LEFT') {
          const { id } = msg.payload;
          // 在执行移除操作前，尝试在本地清单中回溯玩家名称以供日志输出
          const p = gameStore.multiplayer.players.find((p) => p.id === id);
          const displayName = p ? p.name : `玩家 ${id.substring(0, 4)}`;

          toastStore.addToast(`${displayName} 离开了房间`, 'info');

          (gameStore as any).removePlayer(id);

          if (gameStore.multiplayer.isHost) {
            this.syncPlayerList();
          }
        }
        break;
      }

      case 'CHAT_MESSAGE': {
        const senderIdChat = msg.senderId;
        const content = msg.payload?.content;
        if (senderIdChat && content) {
          const event = new CustomEvent('mp-chat-message', {
            detail: { senderId: senderIdChat, content, timestamp: Date.now() }
          });
          window.dispatchEvent(event);
        }
        break;
      }

      case 'VOTE_PROPOSAL': {
        const senderId = msg.senderId;
        const sender = gameStore.multiplayer.players.find((p) => p.id === senderId);

        if (!gameStore.multiplayer.isHost && sender?.isHost) {
          (gameStore as any).setVote(msg.payload);
        } else if (!gameStore.multiplayer.isHost) {
          console.warn(`[联机] 拦截到非房主发起的投票: 来自 ${senderId}`);
        }
        break;
      }

      case 'VOTE_CAST': {
        if (
          gameStore.multiplayer.isHost &&
          this.activeVote &&
          this.activeVote.id === msg.payload.voteId
        ) {
          const voterId = msg.senderId;
          const optionIndex = msg.payload.optionIndex;
          this.activeVote.votes[voterId] = optionIndex;

          // Update Host Store
          (gameStore as any).updateVote({ ...this.activeVote.votes });

          // Broadcast partial results if needed, or just wait for finish
          this.send('SYNC_VOTES', { voteId: this.activeVote.id, votes: this.activeVote.votes });

          const voteCount = Object.keys(this.activeVote.votes).length;
          if (voteCount >= this.activeVote.totalPlayers) {
            const counts = new Array(this.activeVote.options.length).fill(0);
            Object.values(this.activeVote.votes).forEach((idx) => counts[idx]++);

            let maxVotes = -1;
            let winningIndex = -1;
            counts.forEach((c, i) => {
              if (c > maxVotes) {
                maxVotes = c;
                winningIndex = i;
              }
            });

            this.send('VOTE_RESULT', {
              voteId: this.activeVote.id,
              resultIndex: winningIndex,
              counts
            });

            // Update Host Store Result
            if (gameStore.multiplayer.activeVote) {
              gameStore.multiplayer.activeVote.isEnded = true;
              gameStore.multiplayer.activeVote.resultIndex = winningIndex;
            }

            this.activeVote = null;
          }
        }
        break;
      }

      case 'SYNC_VOTES': {
        if (
          !gameStore.multiplayer.isHost &&
          gameStore.multiplayer.activeVote?.id === msg.payload.voteId
        ) {
          (gameStore as any).updateVote(msg.payload.votes);
        }
        break;
      }

      case 'VOTE_RESULT': {
        const senderId = msg.senderId;
        const sender = gameStore.multiplayer.players.find((p) => p.id === senderId);

        if (
          !gameStore.multiplayer.isHost &&
          sender?.isHost &&
          gameStore.multiplayer.activeVote?.id === msg.payload.voteId
        ) {
          const vote = gameStore.multiplayer.activeVote;
          if (vote) {
            vote.isEnded = true;
            vote.resultIndex = msg.payload.resultIndex;
          }
        } else if (!gameStore.multiplayer.isHost && !sender?.isHost) {
          console.warn(`[联机] 拦截到非房主发布的投票结果: 来自 ${senderId}`);
        }
        break;
      }

      case 'ENERGY_CONTRIBUTION': {
        if (gameStore.multiplayer.isHost) {
          const amount = msg.payload.amount || 0;
          const senderId = msg.senderId;
          const player = gameStore.multiplayer.players.find((p) => p.id === senderId);

          // 贡献结算：记录该访客贡献的单笔能源额度
          (gameStore as any).updatePlayerEnergy(senderId, (player?.energy || 0) + amount);
          // 贡献结算：同步更新房间能源池的总量平衡表
          this.updateEnergy(amount);

          toastStore.addToast(
            `收到玩家 ${player?.name || senderId.substring(0, 4)} 贡献的 ${amount} 点能源`,
            'success'
          );
        }
        break;
      }

      case 'SYNC_ENERGY': {
        const senderId = msg.senderId;
        const sender = gameStore.multiplayer.players.find((p) => p.id === senderId);

        if (!gameStore.multiplayer.isHost && sender?.isHost) {
          (gameStore as any).setTotalEnergy(msg.payload.totalEnergy);
        } else if (!gameStore.multiplayer.isHost) {
          console.warn(`[联机] 拦截到非房主发送的能源同步: 来自 ${senderId}`);
        }
        break;
      }

      case 'SYNC_ENERGY_SHARING': {
        const senderId = msg.senderId;
        const sender = gameStore.multiplayer.players.find((p) => p.id === senderId);

        if (!gameStore.multiplayer.isHost && sender?.isHost) {
          (gameStore as any).setEnergySharing(msg.payload.isSharing);
        } else if (!gameStore.multiplayer.isHost) {
          console.warn(`[联机] 拦截到非房主发送的能源共享同步: 来自 ${senderId}`);
        }
        break;
      }

      case 'PLAYER_KICKED': {
        const targetId = msg.payload?.targetId;
        const senderId = msg.senderId;
        const sender = gameStore.multiplayer.players.find((p) => p.id === senderId);

        // 权限鉴权：执行踢出指令前，校验操作发起人是否具备房主权限
        if (!sender?.isHost) {
          console.warn(`[联机] 拦截到非房主发送的踢人指令: 来自 ${senderId}`);
          break;
        }

        if (targetId === this.identityKey) {
          // 本地处理：作为被踢出方，执行物理断开与状态重置流程
          const toastStore = useToastStore();
          toastStore.addToast('你已被房主踢出房间', 'error');
          this.disconnect();

          // 后置处理：延时 2 秒后强制刷新页面以清理所有内存状态残余
          setTimeout(() => {
            window.location.reload(); // Simple way to reset state
          }, 2000);
        }
        break;
      }

      case 'DICE_ROLL': {
        const { sides, result } = msg.payload;
        const senderId = msg.senderId;

        // 更新玩家投骰子的回合
        const player = gameStore.multiplayer.players.find((p) => p.id === senderId);
        if (player) {
          player.lastDiceRollTurn = gameStore.state.system.turn_count;
        }

        const event = new CustomEvent('mp-dice-roll', {
          detail: { senderId, sides, result }
        });
        window.dispatchEvent(event);

        // 如果是房主，同步更新后的玩家列表
        if (gameStore.multiplayer.isHost) {
          this.syncPlayerList();
        }
        break;
      }

      case 'ENERGY_REQUEST': {
        if (!gameStore.multiplayer.isHost) {
          toastStore.addToast(`房主 ${msg.payload.requesterName} 请求大家贡献 API 能源`, 'warning');
          audioManager.playNotification();
        }
        break;
      }

      default:
        console.log('[联机] 未知消息类型:', msg.type);
    }
  }

  // --- 输入聚合模块 (房主侧专用) ---

  public addGuestInput(playerId: string, input: string) {
    if (!input || !input.trim()) {
      delete this.pendingGuestInputs[playerId];
      return;
    }
    this.pendingGuestInputs[playerId] = input;
  }

  public getPendingGuestInputs() {
    return this.pendingGuestInputs;
  }

  public clearPendingGuestInputs() {
    this.pendingGuestInputs = {};
  }

  public startGuestPolling() {}
  public stopGuestPolling() {}
}

export const multiplayerService = MultiplayerService.getInstance();

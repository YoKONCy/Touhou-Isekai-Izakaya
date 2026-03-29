// 基于 Web Audio API 的音频管理器 (Audio Hub)
// 通过程序化合成音效，避免外部重型音频资源依赖 (Zero-dependency SFX)

class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null; // 新增：音效独立混音通道 (SFX Bus)
  private isMuted: boolean = false;
  private volume: number = 0.25;
  private bgmVolume: number = 1.0; // 相对于主音量的分量权重
  private sfxVolume: number = 1.0; // 相对于主音量的分量权重

  // 书写中动态音效状态 (Dynamic Writing SFX)
  private writingSource: AudioBufferSourceNode | null = null;
  private writingGain: GainNode | null = null;
  private writingFilter: BiquadFilterNode | null = null;
  private writingTimer: any = null;

  // 背景音乐 (BGM) 播放状态
  private currentBgm: HTMLAudioElement | null = null;
  private bgmUrl: string | null = null;

  constructor() {
    // 音频上下文 (AudioContext) 处于安全审计考虑，通常需在用户交互手势后才能激活
    // 此处采用懒加载 (Lazy Init) 策略
  }

  /**
   * 在用户交互后解锁音频上下文 (Audio Interaction Guard)
   * 现代浏览器在监听到明确的用户手势前会强制静音网页音频节点。
   */
  public async resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    // 容错处理：若 BGM 之前由于交互限制被策略拦截，此处尝试重新拉起播放链路 (Auto-Resume)
    if (this.currentBgm && this.currentBgm.paused && this.bgmUrl) {
      try {
        await this.currentBgm.play();
      } catch (e) {
        console.warn('Failed to resume BGM after interaction:', e);
      }
    }
  }

  private init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContext();

      // 主音量总线增益节点 (Master Output Gain)
      this.masterGain = this.ctx!.createGain();
      this.masterGain.connect(this.ctx!.destination);

      // 音效专用总线 (SFX Bus, 串联至主音量总线出口)
      this.sfxGain = this.ctx!.createGain();
      this.sfxGain.connect(this.masterGain);

      this.setVolume(this.volume);
      this.setSfxVolume(this.sfxVolume);
    }
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setVolume(val: number) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain) {
      this.masterGain.gain.value = this.isMuted ? 0 : this.volume;
    }
    this.updateBgmVolume();
  }

  public setBgmVolume(val: number) {
    this.bgmVolume = Math.max(0, Math.min(1, val));
    this.updateBgmVolume();
  }

  public setSfxVolume(val: number) {
    this.sfxVolume = Math.max(0, Math.min(1, val));
    if (this.sfxGain) {
      this.sfxGain.gain.value = this.sfxVolume;
    }
  }

  private updateBgmVolume() {
    if (this.currentBgm) {
      // 最终 BGM 物理音量 = 主音量 * BGM 分量音量系数
      // 注意：HTMLAudioElement.volume 接口仅接受 [0, 1] 区间的规范化浮点数。
      this.currentBgm.volume = this.isMuted ? 0 : this.volume * this.bgmVolume;
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public setMute(mute: boolean) {
    this.isMuted = mute;
    if (this.masterGain) {
      this.masterGain.gain.value = this.isMuted ? 0 : this.volume;
    }
    this.updateBgmVolume();
  }

  public toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain) {
      this.masterGain.gain.value = this.isMuted ? 0 : this.volume;
    }
    this.updateBgmVolume();
    return this.isMuted;
  }

  // --- 背景音乐 (BGM) 调度管理逻辑 (Playlist Orchestration) ---
  public playBgm(url: string) {
    if (this.bgmUrl === url && this.currentBgm && !this.currentBgm.paused) {
      return; // 目标音轨正在活跃播放中，跳过冗余请求 (Duplicate Guard)
    }

    this.stopBgm();

    this.bgmUrl = url;
    this.currentBgm = new Audio(url);
    this.currentBgm.loop = true;
    this.updateBgmVolume(); // 执行初始分量音量配置
    this.currentBgm.muted = false; // 静音逻辑在上层 updateBgmVolume 中通过 0 增益处理，无需触发 DOM 级 Mute 标记

    this.currentBgm.play().catch((e) => {
      console.warn('BGM 播放拦截告警（可能因缺乏必要的用户交互手势）：', e);
    });
  }

  public stopBgm() {
    if (this.currentBgm) {
      this.currentBgm.pause();
      this.currentBgm.currentTime = 0;
      this.currentBgm = null;
    }
    this.bgmUrl = null;
  }

  // 音效算法：短促清脆的 UI 点击音（Procedural Woodblock）
  public playClick() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.sfxGain);

    // 模拟木鱼/敲击木板的中频物理特性 (Wood-block Tonal Quality)
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  // 音效算法：轻柔细腻的交互悬浮音 (Subtle UI Hover Feel)
  public playHover() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.sfxGain);

    // 采用亮色调的高频正弦波点缀 (High-pitched Tonal Ping)
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1000, this.ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.05, this.ctx.currentTime); // 极小增益，防听觉疲劳 (Anti-fatigue)
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }

  // 音效算法：模拟真实书写的持续摩擦音 (Dynamically Sustained Texture)
  public playWritingSound() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const now = this.ctx.currentTime;

    // 物理引擎：若对应音色源已激活，则执行包络维持与随机压力调制 (Dynamic Modulation)
    if (this.writingSource && this.writingGain && this.writingFilter) {
      if (this.writingTimer) {
        clearTimeout(this.writingTimer);
        this.writingTimer = null;
      }

      // 振幅调制：模拟真实书写时的压力动态不确定性 (Pressure Fluctuations)
      this.writingGain.gain.cancelScheduledValues(now);
      this.writingGain.gain.linearRampToValueAtTime(0.06 + Math.random() * 0.04, now + 0.05);

      // 频率调制：模拟纸张纤维导致的微观材质感 (Texture Granularity)
      this.writingFilter.frequency.cancelScheduledValues(now);
      this.writingFilter.frequency.linearRampToValueAtTime(3000 + Math.random() * 2000, now + 0.05);

      // 物理释放回收逻辑 (Source Reclamation)
      this.writingTimer = setTimeout(() => {
        this.stopWritingSound();
      }, 150); // 若超过 150ms 无写入指令流，则平滑回收物理节点以节省 CPU 消耗

      return;
    }

    // 初始化物理噪声循环缓存 (Start New Noise Loop)
    const bufferSize = this.ctx.sampleRate * 2.0; // 构建 2 秒长度的样本滚动循环 (Rolling Buffer)
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // 采用粉红噪声算法 (Pinkish Noise) 模拟具备低音质感的真实摩擦感 (Acoustic Approximation)
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      const val = (lastOut + 0.02 * white) / 1.02;
      lastOut = val;
      data[i] = val * 3.5; // 静态补偿：对滤波导致的幅度损失执行物理增益补偿 (Static Gain Compensation)
    }

    this.writingSource = this.ctx.createBufferSource();
    this.writingSource.buffer = buffer;
    this.writingSource.loop = true;

    // 合并滤波链路：[高通滤波: 削弱浑浊低频] -> [带通滤波: 提取书写核心特征频段] (Filter Matrix)
    const highpass = this.ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 500;

    this.writingFilter = this.ctx.createBiquadFilter();
    this.writingFilter.type = 'bandpass';
    this.writingFilter.frequency.value = 4000;
    this.writingFilter.Q.value = 0.6;

    this.writingGain = this.ctx.createGain();
    this.writingGain.gain.value = 0;

    this.writingSource.connect(highpass);
    highpass.connect(this.writingFilter);
    this.writingFilter.connect(this.writingGain);
    this.writingGain.connect(this.sfxGain);

    this.writingSource.start();

    // 渐入 (Fade in)
    this.writingGain.gain.linearRampToValueAtTime(0.06, now + 0.05);

    // 预定停止任务 (Schedule stop)
    this.writingTimer = setTimeout(() => {
      this.stopWritingSound();
    }, 150);
  }

  private stopWritingSound() {
    if (this.writingGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.writingGain.gain.cancelScheduledValues(now);
      this.writingGain.gain.setTargetAtTime(0, now, 0.05); // 极平滑衰减，防音轨切断爆鸣 (Smooth Fade-out / Anti-pop)

      const source = this.writingSource;
      setTimeout(() => {
        if (source) {
          try {
            source.stop();
          } catch (e) {}
        }
      }, 200);
    }
    this.writingSource = null;
    this.writingGain = null;
    this.writingFilter = null;
    this.writingTimer = null;
  }

  // 音效算法：活泼、富有弹性的气泡弹窗音 (Cute Bubble UI Pop)
  public playPopupSound() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.type = 'sine';
    // 指数级扫频模拟气泡上浮破裂的视觉共感 (Psychological Synesthesia)
    osc.frequency.setValueAtTime(440, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(880, this.ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.1, this.ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.25);
  }

  // 音效算法：模拟物理纸张翻动/摩擦的白噪声纹理 (Physical Page Flip / Paper Rustle)
  public playPageFlip() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const duration = 0.25;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1500, this.ctx.currentTime);
    filter.frequency.linearRampToValueAtTime(500, this.ctx.currentTime + duration);

    const gain = this.ctx.createGain();
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    const now = this.ctx.currentTime; // 获取当前音轨时间点
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
    gain.gain.linearRampToValueAtTime(0, now + duration);

    noise.start();
  }

  public playWindowOpen() {
    this.playPageFlip();
  }

  public playWindowClose() {
    this.playSoftClick();
  }

  // 音效算法：标准的系统消息通知铃声 (System Notification Chime)
  public playNotification() {
    this.playChime();
  }

  // 音效算法：具有前进感的成功三连音 (UI Success Fanfare Expansion)
  public playSuccess() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.1);
      gain.gain.setValueAtTime(0, now + i * 0.1);
      gain.gain.linearRampToValueAtTime(0.1, now + i * 0.1 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.4);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.4);
    });
  }

  // 音效算法：极轻的软性按钮触发反馈 (Soft Interaction Tick)
  public playSoftClick() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(2000, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }

  // 音效算法：亮丽的水晶提示铃声 (Crystalline Chime for Notifications)
  public playChime() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, this.ctx.currentTime); // 配置指向性的亮色调高频频率 (Focused High-pitch)

    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, this.ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.5);

    osc.start();
    osc.stop(this.ctx.currentTime + 1.5);
  }

  // 音效算法：极轻的掠过气流声（风铃草语境交互）(Subtle Air/Wind Swish)
  public playHoverWind() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.02, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  // 音效算法：重型战斗打击音效 (Combat Heavy Blunt Impact)
  public playHeavyHit() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;

    // 频率坠落层：模拟具备足量厚度感的物理撞击核心 (Sub-bass Physical Core / Kick-like)
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();

    osc.connect(oscGain);
    oscGain.connect(this.sfxGain);

    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.5);

    oscGain.gain.setValueAtTime(1.0, t);
    oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);

    osc.start(t);
    osc.stop(t + 0.5);

    // 冲击噪声层：叠加宽频白噪声以模拟碰撞瞬间的空气物理震荡 (Impact Shockwave Tail)
    const bufferSize = this.ctx.sampleRate * 0.3;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1000;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);
    noise.start(t);
  }

  // 音效算法：锋利的战斗斩击反馈 (Combat Blade Slash / Swoosh)
  public playSlash() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;

    // 噪声扫频：模拟冷兵器切断空气生成的物理湍流感 (White-noise Swoosh)
    const bufferSize = this.ctx.sampleRate * 0.3;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.linearRampToValueAtTime(3000, t + 0.2); // 采用快速上行扫频以提升动作的敏捷感 (Upward Pitch Sweep)
    filter.Q.value = 1;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.1);
    gain.gain.linearRampToValueAtTime(0, t + 0.3);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(t);
  }

  // 音效算法：标准咒法释放提示音 (Generic Magic Casting)
  public playSpellCast() {
    this.playSpellCastSingle(); // 默认回退逻辑
  }

  // 音效算法：单体及瞬发型轻快咒法音 (Sharp Single-Target Spell)
  public playSpellCastSingle() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;

    // 合成逻辑：配置双路高频闪烁振荡器 (Two-tone Shimmer Matrix)
    [660, 880].forEach((freq) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.linearRampToValueAtTime(freq * 1.5, t + 0.3); // 极速音阶攀升，模拟法力流的极速坍缩感 (Quick Ascension)

      const lfo = this.ctx!.createOscillator();
      lfo.frequency.value = 20; // 高频颤音 (Fast Mystical Vibrato)
      const lfoGain = this.ctx!.createGain();
      lfoGain.gain.value = 30;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(t);

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.1, t + 0.05);
      gain.gain.linearRampToValueAtTime(0, t + 0.5);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  }

  // 音效算法：广域/群体咒法蓄力与释放音 (Ethereal AoE Charging & Manifestation)
  public playSpellCastAoE() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;

    // 1. 底层沉浸音 (Deep Drone): 模拟周围大气环境开始法力汇聚时的共鸣律动 (Atmospheric Power Gathering)
    const drone = this.ctx.createOscillator();
    const droneGain = this.ctx.createGain();
    drone.type = 'sawtooth';
    drone.frequency.setValueAtTime(110, t); // 核心基准 A 调 (Low A)
    drone.frequency.linearRampToValueAtTime(220, t + 1.5); // 包络缓慢上升，营造大招将至的压迫感 (Tension Build-up)

    // 滤波器包络开启 (Low-pass Filter Manifestation)
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, t);
    filter.frequency.exponentialRampToValueAtTime(2000, t + 1.5);

    droneGain.gain.setValueAtTime(0, t);
    droneGain.gain.linearRampToValueAtTime(0.08, t + 0.5);
    droneGain.gain.linearRampToValueAtTime(0, t + 1.5);

    drone.connect(filter);
    filter.connect(droneGain);
    droneGain.connect(this.sfxGain);
    drone.start(t);
    drone.stop(t + 1.5);

    // 2. 高频轨道环绕 (Phase Swirling Highs)
    [440, 554, 659, 880].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain(); // 配置分量增益节点

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      // 低频 LFO 逻辑：模拟法力球在施法者周身盘旋的相位旋转感 (Swirl Effect)
      const lfo = this.ctx!.createOscillator();
      lfo.frequency.value = 4 + i;
      const lfoGain = this.ctx!.createGain();
      lfoGain.gain.value = 20;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(t);

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.05, t + 0.2 + i * 0.1);
      gain.gain.linearRampToValueAtTime(0, t + 1.5);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 1.5);
    });
  }

  // 音效算法：超大规模法术爆破/炸裂音 (Massive AoE Explosion / Detonation)
  public playAoEExplosion() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    // 1. 物理极低频下潜音 (Sub-bass Physical Manifestation): 直接触发显示设备共振感的巨象冲击层 (Massive Thump)
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(10, t + 1.0); // 采用指数级锐减，复写“大爆炸后瞬间失聪”的沉寂感 (Vacuum Collapse Effect)

    oscGain.gain.setValueAtTime(1.0, t);
    oscGain.gain.exponentialRampToValueAtTime(0.01, t + 1.0);

    osc.connect(oscGain);
    oscGain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 1.0);

    // 2. 宽频谱噪声余波 (Wide Noise Shockwave): 模拟尘土扬起与屏障碎裂后的物理余热 (Post-impact Wash)
    const bufferSize = this.ctx.sampleRate * 1.5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.linearRampToValueAtTime(100, t + 1.5); // 尾随频率下行，模拟爆炸后的闷声消散过程 (Muffle Decay)

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.8, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 1.5);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);
    noise.start(t);
  }

  // 音效算法：必杀技/立绘切入插画音 (Thematic Skill Cut-in / Ethereal Arc)
  public playSkillCutin() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;

    // 1. “月光”水晶编钟韵律 (Glassy/Crystalline Moonlight Chimes)
    // 核心谐和和弦：A Major 7 (基于 A 大调构建具备神圣感与优雅度的视觉背景感)
    const freqs = [880, 1318.5, 1661.2, 2217.5];

    freqs.forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);

      // 微弱的频率下行漂移，模拟月华伴随立绘屏风缓缓落下的动态错觉 (Ethereal Falling Feel)
      osc.frequency.exponentialRampToValueAtTime(f * 0.98, t + 0.6);

      osc.connect(gain);
      gain.connect(this.sfxGain!);

      // 采用极速琶音序列 (Staggered Arpeggio) 构建华丽的瞬态响应感
      // 构建极微小的物理相位偏差，营造一种带有“闪烁感”的多维听觉纹理 (Shimmering Phase Jitter)
      const start = t + i * 0.04;
      const duration = 0.6 - i * 0.05;

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.08, start + 0.05); // 极软的包络攻击感，防止生硬触发毁掉氛围 (Soft Attack Envelope)
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.start(start);
      osc.stop(start + duration);
    });

    // 2. 高频颗粒感闪烁组件 (Ethereal Sparkle Details)
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 15; // 高频随机闪烁 LFO 震荡 (Fast Particle Shimmering)

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 500;

    const carrier = this.ctx.createOscillator();
    carrier.type = 'triangle';
    carrier.frequency.setValueAtTime(3000, t); // 配置超高频点缀频率，提升视觉聚焦力 (Focus High-pitch)

    const carrierGain = this.ctx.createGain();

    lfo.connect(lfoGain);
    lfoGain.connect(carrier.frequency); // 物理算法：基于频率调制 (FM Synthesis) 合成出带有波光粼粼感的音频质地 (Twinkling Sound Design)

    carrier.connect(carrierGain);
    carrierGain.connect(this.sfxGain);

    carrierGain.gain.setValueAtTime(0, t);
    carrierGain.gain.linearRampToValueAtTime(0.03, t + 0.1);
    carrierGain.gain.linearRampToValueAtTime(0, t + 0.5);

    lfo.start(t);
    carrier.start(t);
    lfo.stop(t + 0.5);
    carrier.stop(t + 0.5);

    // 3. 全局沉降式环境 Wash (Narrative Falling Wash)
    const bufferSize = this.ctx.sampleRate * 0.8;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1;
    filter.frequency.setValueAtTime(3000, t); // 起点定位于高频空域，模拟光芒初现之势 (High Altitude Start)
    filter.frequency.exponentialRampToValueAtTime(500, t + 0.6); // 采用下行指数扫频，模拟立绘完全展开后的沉降稳固感 (Acoustic Falling Motion)

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0, t);
    noiseGain.gain.linearRampToValueAtTime(0.05, t + 0.1);
    noiseGain.gain.linearRampToValueAtTime(0, t + 0.6);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);
    noise.start(t);
  }

  // 音效算法：视觉破碎/屏幕轰塌反馈 (Revised: Balanced Impact & Glass Shatter Crunch)
  public playShatter() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;

    // 1. 基底重击层 (The "Thump"): 提供具备足量物理存在感的极低频重击底蕴 (Sub-bass Physical Momentum)
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(100, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.25);

    oscGain.gain.setValueAtTime(0.5, t); // 权重补偿：提供扎实的撞击感基石 (Solid Impact Foundation)
    oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);

    osc.connect(oscGain);
    oscGain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.3);

    // 预置噪声缓存 (Noise Buffer Initialization)
    const bufferSize = this.ctx.sampleRate * 0.8;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    // 2. 锐利崩裂层 (The "Crack"): 模拟脆性材质被彻底撕裂瞬间的极速脉冲 (High-frequency Tonal Snap)
    // 设计逻辑：采用带通滤波锁定 1.5kHz - 2.5kHz 核心频段，旨在提供极致清脆度的同时，
    // 也能成功避开 5kHz 以上导致听觉迅速疲劳的尖锐噪声污染域。 (Optimized Presence Filter)
    const crackSrc = this.ctx.createBufferSource();
    crackSrc.buffer = buffer;

    const crackFilter = this.ctx.createBiquadFilter();
    crackFilter.type = 'bandpass';
    crackFilter.frequency.setValueAtTime(1800, t); // 这里是模拟“嘎吱”碎裂感的物理频率黄金分割点
    crackFilter.Q.value = 0.8;

    const crackGain = this.ctx.createGain();
    crackGain.gain.setValueAtTime(0.6, t); // 强力撞击瞬态增益 (Peak Impact)
    crackGain.gain.exponentialRampToValueAtTime(0.01, t + 0.15); // 极速衰减，模拟能量释放瞬间 (Fast Power Decay)

    crackSrc.connect(crackFilter);
    crackFilter.connect(crackGain);
    crackGain.connect(this.sfxGain);
    crackSrc.start(t);

    // 3. 碎屑滑落/余震 (Debris Falling / Crumble)
    // 采用低通扫频 (Low-pass Sweep Down) 模拟碎玻璃块在地面滚动并逐渐停下的物理过程。
    const crumbleSrc = this.ctx.createBufferSource();
    crumbleSrc.buffer = buffer;

    const crumbleFilter = this.ctx.createBiquadFilter();
    crumbleFilter.type = 'lowpass';
    crumbleFilter.frequency.setValueAtTime(1000, t); // 初始保留部分物理纹理质感
    crumbleFilter.frequency.linearRampToValueAtTime(200, t + 0.5); // 随着位移结束，声音趋于闷响并消散 (Muffled Cessation)

    const crumbleGain = this.ctx.createGain();
    crumbleGain.gain.setValueAtTime(0.3, t);
    crumbleGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

    crumbleSrc.connect(crumbleFilter);
    crumbleFilter.connect(crumbleGain);
    crumbleGain.connect(this.sfxGain);
    crumbleSrc.start(t);
  }

  // 音效算法：治疗/生命值恢复 (Heal & Life Recovery)
  public playHeal() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;

    // 柔和的上行正弦波和弦逻辑，构建具备神圣感、天使般的治愈氛围 (Ethereal Healing Chord)
    [330, 440, 554, 659].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      // 注入轻微包络颤音以提升空灵感 (Gentle Vibrato)
      const lfo = this.ctx!.createOscillator();
      lfo.frequency.value = 5;
      const lfoGain = this.ctx!.createGain();
      lfoGain.gain.value = 5;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(t);

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.5 + i * 0.1);
      gain.gain.linearRampToValueAtTime(0, t + 2.0);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 2.0);
    });

    // 星点噪声组件 (Sparkle Noise): 基于带通滤波模拟治愈法阵生成的闪影星星点点 (Shimmering Particles)
    const bufferSize = this.ctx.sampleRate * 1.5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3000, t);
    filter.frequency.linearRampToValueAtTime(6000, t + 1.5);
    filter.Q.value = 5;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0, t);
    noiseGain.gain.linearRampToValueAtTime(0.03, t + 0.5);
    noiseGain.gain.linearRampToValueAtTime(0, t + 1.5);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);
    noise.start(t);
  }

  // 音效算法：等级提升/胜利凯旋铃声 (Triumphant Level Up Chime)
  public playLevelUp() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;

    // 凯旋大调琶音序列 (Triumphant Major Chord Arpeggio)
    // 核心 C 大调结构：C4 (261.63), E4 (329.63), G4 (392.00), C5 (523.25)
    [261.63, 329.63, 392.0, 523.25].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + i * 0.1);

      gain.gain.setValueAtTime(0, t + i * 0.1);
      gain.gain.linearRampToValueAtTime(0.2, t + i * 0.1 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 1.0);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t + i * 0.1);
      osc.stop(t + i * 0.1 + 1.0);
    });
  }

  // 音效算法：错误/操作失败提示音 (Dull Error Buzz / Reject Sound)
  public playError() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.linearRampToValueAtTime(100, t + 0.2);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.1, t + 0.05);
    gain.gain.linearRampToValueAtTime(0, t + 0.2);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.2);
  }
}

export const audioManager = new AudioManager();

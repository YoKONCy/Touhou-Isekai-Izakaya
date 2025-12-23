// Audio Manager using Web Audio API
// Generates procedural sounds to avoid external dependencies

class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null; // New SFX Bus
  private isMuted: boolean = false;
  private volume: number = 0.25;
  private bgmVolume: number = 1.0; // Relative to Master
  private sfxVolume: number = 1.0; // Relative to Master

  // Writing sound state
  private writingSource: AudioBufferSourceNode | null = null;
  private writingGain: GainNode | null = null;
  private writingFilter: BiquadFilterNode | null = null;
  private writingTimer: any = null;

  // BGM State
  private currentBgm: HTMLAudioElement | null = null;
  private bgmUrl: string | null = null;

  constructor() {
    // AudioContext must be initialized after user interaction usually
    // We'll initialize it lazily
  }

  private init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContext();
      
      // Master Gain
      this.masterGain = this.ctx!.createGain();
      this.masterGain.connect(this.ctx!.destination);
      
      // SFX Gain (Connects to Master)
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
      // BGM volume is Master * BGM Sub-volume
      // Note: HTMLAudioElement volume is 0-1.
      this.currentBgm.volume = this.isMuted ? 0 : (this.volume * this.bgmVolume);
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

  // --- BGM Management ---
  public playBgm(url: string) {
    if (this.bgmUrl === url && this.currentBgm && !this.currentBgm.paused) {
      return; // Already playing this track
    }

    this.stopBgm();

    this.bgmUrl = url;
    this.currentBgm = new Audio(url);
    this.currentBgm.loop = true;
    this.updateBgmVolume(); // Set initial volume
    this.currentBgm.muted = false; // Mute handled by volume=0 in updateBgmVolume
    
    this.currentBgm.play().catch(e => {
      console.warn('BGM play failed (user interaction needed?):', e);
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

  // Sound: Short crisp click for UI interaction
  public playClick() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.sfxGain);

    // Wood block style click
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  // Sound: Subtle hover sound
  public playHover() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.sfxGain);

    // High, soft ping
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1000, this.ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.05, this.ctx.currentTime); // Very quiet
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }

  // Sound: Continuous writing sound (Sustained scratch)
  public playWritingSound() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const now = this.ctx.currentTime;

    // If already playing, sustain and modulate it
    if (this.writingSource && this.writingGain && this.writingFilter) {
      if (this.writingTimer) {
        clearTimeout(this.writingTimer);
        this.writingTimer = null;
      }
      
      // Modulate amplitude (pressure)
      this.writingGain.gain.cancelScheduledValues(now);
      this.writingGain.gain.linearRampToValueAtTime(0.06 + Math.random() * 0.04, now + 0.05);
      
      // Modulate frequency (texture/speed)
      this.writingFilter.frequency.cancelScheduledValues(now);
      this.writingFilter.frequency.linearRampToValueAtTime(3000 + Math.random() * 2000, now + 0.05);

      // Schedule stop
      this.writingTimer = setTimeout(() => {
        this.stopWritingSound();
      }, 150); // Stop after 150ms of silence
      
      return;
    }

    // Start new sound loop
    const bufferSize = this.ctx.sampleRate * 2.0; // 2s loop
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    // Pinkish noise approximation
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        const val = (lastOut + (0.02 * white)) / 1.02;
        lastOut = val;
        data[i] = val * 3.5; // Compensate for gain loss
    }

    this.writingSource = this.ctx.createBufferSource();
    this.writingSource.buffer = buffer;
    this.writingSource.loop = true;

    // Filter chain: Highpass -> Bandpass
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
    
    // Fade in
    this.writingGain.gain.linearRampToValueAtTime(0.06, now + 0.05);

    // Schedule stop
    this.writingTimer = setTimeout(() => {
      this.stopWritingSound();
    }, 150);
  }

  private stopWritingSound() {
    if (this.writingGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.writingGain.gain.cancelScheduledValues(now);
      this.writingGain.gain.setTargetAtTime(0, now, 0.05); // Smooth fade out
      
      const source = this.writingSource;
      setTimeout(() => {
        if (source) {
            try { source.stop(); } catch(e) {}
        }
      }, 200);
    }
    this.writingSource = null;
    this.writingGain = null;
    this.writingFilter = null;
    this.writingTimer = null;
  }

  // Sound: Cute pop for alerts/confirmations
  public playPopupSound() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.sfxGain);
    
    osc.type = 'sine';
    // Cute upward slide (Bubble sound)
    osc.frequency.setValueAtTime(440, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(880, this.ctx.currentTime + 0.15);
    
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.1, this.ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.25);
  }

  // Sound: Page flip / Paper rustle (for opening menus/cards)
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

    const now = this.ctx.currentTime;
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

  // Sound: Soft click for minor interactions
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

  // Sound: Bell chime for notifications/turns
  public playChime() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, this.ctx.currentTime); // High pitch

    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, this.ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.5);

    osc.start();
    osc.stop(this.ctx.currentTime + 1.5);
  }
  
  // Sound: Hover effect (very subtle wind/breath)
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

  // Sound: Heavy Hit (Combat)
  public playHeavyHit() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;

    // Low boom (Kick-like)
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

    // Impact noise
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

  // Sound: Slash (Combat)
  public playSlash() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    
    // White noise swoosh
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
    filter.frequency.linearRampToValueAtTime(3000, t + 0.2); // Upward sweep
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

  // Sound: Spell Cast (Combat)
  public playSpellCast() {
    this.playSpellCastSingle(); // Default fallback
  }

  // Sound: Single Target Spell Cast (Fast, Sharp)
  public playSpellCastSingle() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;

    // Fast, high-pitched shimmer
    [660, 880].forEach((freq) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.linearRampToValueAtTime(freq * 1.5, t + 0.3); // Quick pitch up
        
        const lfo = this.ctx!.createOscillator();
        lfo.frequency.value = 20; // Fast vibrato
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

  // Sound: AOE Spell Cast (Deep, Resonant, Charging)
  public playSpellCastAoE() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;

    // 1. Deep Drone (Power gathering)
    const drone = this.ctx.createOscillator();
    const droneGain = this.ctx.createGain();
    drone.type = 'sawtooth';
    drone.frequency.setValueAtTime(110, t); // Low A
    drone.frequency.linearRampToValueAtTime(220, t + 1.5); // Slow rise
    
    // Lowpass filter opening up
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

    // 2. Swirling Highs
    [440, 554, 659, 880].forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        
        // Slow LFO for "swirl"
        const lfo = this.ctx!.createOscillator();
        lfo.frequency.value = 4 + i; 
        const lfoGain = this.ctx!.createGain();
        lfoGain.gain.value = 20;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start(t);

        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.05, t + 0.2 + (i * 0.1));
        gain.gain.linearRampToValueAtTime(0, t + 1.5);

        osc.connect(gain);
        gain.connect(this.sfxGain!);
        osc.start(t);
        osc.stop(t + 1.5);
    });
  }

  // Sound: AOE Explosion (Massive Boom)
  public playAoEExplosion() {
      this.init();
      if (!this.ctx || !this.sfxGain) return;
      const t = this.ctx.currentTime;

      // 1. Sub-bass Boom
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(80, t);
      osc.frequency.exponentialRampToValueAtTime(10, t + 1.0); // Deep drop
      
      oscGain.gain.setValueAtTime(1.0, t);
      oscGain.gain.exponentialRampToValueAtTime(0.01, t + 1.0);
      
      osc.connect(oscGain);
      oscGain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 1.0);

      // 2. Wide Noise Wash
      const bufferSize = this.ctx.sampleRate * 1.5;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, t);
      filter.frequency.linearRampToValueAtTime(100, t + 1.5); // Muffle down
      
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.8, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 1.5);
      
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.sfxGain);
      noise.start(t);
  }

  // Sound: Skill Cut-in (Moonlight/Ethereal theme)
  public playSkillCutin() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;

    // 1. "Moonlight" Chimes (Crystal/Glassy)
    // A Major 7 chord: A (880), E (1318), G# (1661), C# (2217)
    const freqs = [880, 1318.5, 1661.2, 2217.5]; 
    
    freqs.forEach((f, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, t);
        
        // Subtle downward drift (Falling feel)
        osc.frequency.exponentialRampToValueAtTime(f * 0.98, t + 0.6);

        osc.connect(gain);
        gain.connect(this.sfxGain!);

        // Staggered entry (arpeggio effect) - very fast descending feel? 
        // Actually slightly staggered start creates a "shimmer"
        const start = t + (i * 0.04); 
        const duration = 0.6 - (i * 0.05);

        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.08, start + 0.05); // Soft attack
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

        osc.start(start);
        osc.stop(start + duration);
    });

    // 2. "Shimmer" (High frequency sparkle)
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 15; // Fast shimmer

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 500;

    const carrier = this.ctx.createOscillator();
    carrier.type = 'triangle';
    carrier.frequency.setValueAtTime(3000, t); // High pitch

    const carrierGain = this.ctx.createGain();
    
    lfo.connect(lfoGain);
    lfoGain.connect(carrier.frequency); // FM Synthesis for sparkle

    carrier.connect(carrierGain);
    carrierGain.connect(this.sfxGain);

    carrierGain.gain.setValueAtTime(0, t);
    carrierGain.gain.linearRampToValueAtTime(0.03, t + 0.1);
    carrierGain.gain.linearRampToValueAtTime(0, t + 0.5);

    lfo.start(t);
    carrier.start(t);
    lfo.stop(t + 0.5);
    carrier.stop(t + 0.5);

    // 3. "Falling" Wash (Filtered Noise)
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
    filter.frequency.setValueAtTime(3000, t); // Start high
    filter.frequency.exponentialRampToValueAtTime(500, t + 0.6); // Sweep down (Falling)

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0, t);
    noiseGain.gain.linearRampToValueAtTime(0.05, t + 0.1);
    noiseGain.gain.linearRampToValueAtTime(0, t + 0.6);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);
    noise.start(t);
  }

  // Sound: Screen Break (Revised: Balanced Impact + Crunch)
  public playShatter() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;

    // 1. The "Thump" (Sub-bass Impact)
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    
    osc.type = 'triangle'; 
    osc.frequency.setValueAtTime(100, t); 
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.25); 
    
    oscGain.gain.setValueAtTime(0.5, t); // Good base weight
    oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
    
    osc.connect(oscGain);
    oscGain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.3);

    // Prepare Noise Buffer
    const bufferSize = this.ctx.sampleRate * 0.8;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    // 2. The "Crack" (The sharp breaking sound)
    // We use a Bandpass filter centered in the "presence" range (1.5kHz - 2.5kHz)
    // This gives the crisp "snap" without the >5kHz harshness
    const crackSrc = this.ctx.createBufferSource();
    crackSrc.buffer = buffer;

    const crackFilter = this.ctx.createBiquadFilter();
    crackFilter.type = 'bandpass';
    crackFilter.frequency.setValueAtTime(1800, t); // Sweet spot for "crunch"
    crackFilter.Q.value = 0.8; 
    
    const crackGain = this.ctx.createGain();
    crackGain.gain.setValueAtTime(0.6, t); // Loud impact
    crackGain.gain.exponentialRampToValueAtTime(0.01, t + 0.15); // Fast decay

    crackSrc.connect(crackFilter);
    crackFilter.connect(crackGain);
    crackGain.connect(this.sfxGain);
    crackSrc.start(t);

    // 3. The "Crumble" (Debris falling)
    // A Lowpass filter sweeping down simulates pieces settling
    const crumbleSrc = this.ctx.createBufferSource();
    crumbleSrc.buffer = buffer;
    
    const crumbleFilter = this.ctx.createBiquadFilter();
    crumbleFilter.type = 'lowpass';
    crumbleFilter.frequency.setValueAtTime(1000, t); // Start with some texture
    crumbleFilter.frequency.linearRampToValueAtTime(200, t + 0.5); // Muffle out
    
    const crumbleGain = this.ctx.createGain();
    crumbleGain.gain.setValueAtTime(0.3, t);
    crumbleGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    
    crumbleSrc.connect(crumbleFilter);
    crumbleFilter.connect(crumbleGain);
    crumbleGain.connect(this.sfxGain);
    crumbleSrc.start(t);
  }

  // Sound: Heal / Recovery
  public playHeal() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;

    // Soft ascending sine waves (Angelic chord)
    [330, 440, 554, 659].forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        
        // Gentle vibrato
        const lfo = this.ctx!.createOscillator();
        lfo.frequency.value = 5;
        const lfoGain = this.ctx!.createGain();
        lfoGain.gain.value = 5;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start(t);

        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.08, t + 0.5 + (i * 0.1));
        gain.gain.linearRampToValueAtTime(0, t + 2.0);

        osc.connect(gain);
        gain.connect(this.sfxGain!);
        osc.start(t);
        osc.stop(t + 2.0);
    });

    // Sparkle noise (High frequency bandpass)
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
}

export const audioManager = new AudioManager();

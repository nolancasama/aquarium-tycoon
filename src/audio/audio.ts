/**
 * Procedural Web Audio: no files, no network. The aquarium hum, bubbles, a
 * gentle music-box tune and every effect are synthesised.
 *
 * Buses: music and ambience duck under spoken English and go silent while the
 * microphone listens (classroom speakers bleed into the mic).
 */

type Wave = OscillatorType;
type Tune = "aquarium" | "celebrate";

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export type SfxName =
  | "correct"
  | "error"
  | "tick"
  | "micOn"
  | "micOff"
  | "coin"
  | "purchase"
  | "bubble"
  | "sprinkle"
  | "gulp"
  | "splash"
  | "scrub"
  | "happy"
  | "wow"
  | "hmm"
  | "place"
  | "pick"
  | "unlock"
  | "flash"
  | "trophy"
  | "door";

class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private musicDuck!: GainNode;
  private ambBus!: GainNode;
  private ambDuck!: GainNode;
  private sfxBus!: GainNode;
  private noise!: AudioBuffer;
  private musicVolume = 0.2;
  private sfxVolume = 0.75;
  private speaking = false;
  private listening = false;
  private hum: GainNode | null = null;
  private musicTimer = 0;
  private music: { next: number; step: number; tune: Tune } | null = null;
  private lastPlayed = new Map<SfxName, number>();

  /** Must be called from a user gesture (Start button). */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(ctx.destination);
      this.musicDuck = ctx.createGain();
      this.musicBus = ctx.createGain();
      this.musicBus.connect(this.musicDuck).connect(this.master);
      this.ambDuck = ctx.createGain();
      this.ambBus = ctx.createGain();
      this.ambBus.connect(this.ambDuck).connect(this.master);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.noise = this.makeNoise(3);
      this.applyVolumes();
      document.addEventListener("visibilitychange", () => {
        if (!this.ctx) return;
        if (document.hidden) void this.ctx.suspend();
        else void this.ctx.resume();
      });
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = last * 0.6 + (Math.random() * 2 - 1) * 0.4;
      data[i] = last * 1.6;
    }
    return buf;
  }

  setVolumes(music: number, sfx: number) {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.musicVolume * 0.35, t, 0.05);
    this.ambBus.gain.setTargetAtTime(Math.max(this.musicVolume, 0.2) * 0.5, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.sfxVolume * 0.9, t, 0.05);
    this.applyDuck();
  }

  private applyDuck() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const music = this.listening ? 0 : this.speaking ? 0.25 : 1;
    const amb = this.listening ? 0 : this.speaking ? 0.45 : 1;
    this.musicDuck.gain.setTargetAtTime(music, t, 0.08);
    this.ambDuck.gain.setTargetAtTime(amb, t, 0.08);
  }

  /** English is being spoken: duck the background. */
  setSpeaking(on: boolean) {
    this.speaking = on;
    this.applyDuck();
  }

  /** Microphone open: silence the background. */
  setListening(on: boolean) {
    this.listening = on;
    this.applyDuck();
  }

  // ------------------------------------------------------------------ helpers

  private env(gain: GainNode, t: number, peak: number, attack: number, decay: number) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(freq: number, t: number, opts: { type?: Wave; peak?: number; attack?: number; decay?: number; to?: number; bus?: AudioNode }) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? "sine";
    osc.frequency.setValueAtTime(freq, t);
    const attack = opts.attack ?? 0.008;
    const decay = opts.decay ?? 0.3;
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + attack + decay);
    this.env(g, t, opts.peak ?? 0.2, attack, decay);
    osc.connect(g).connect(opts.bus ?? this.sfxBus);
    osc.start(t);
    osc.stop(t + attack + decay + 0.05);
  }

  private noiseBurst(
    t: number,
    opts: { filter?: BiquadFilterType; freq?: number; to?: number; q?: number; peak?: number; attack?: number; decay?: number; bus?: AudioNode }
  ) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = opts.filter ?? "lowpass";
    f.frequency.setValueAtTime(opts.freq ?? 1200, t);
    f.Q.value = opts.q ?? 0.8;
    const attack = opts.attack ?? 0.01;
    const decay = opts.decay ?? 0.2;
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + attack + decay);
    const g = ctx.createGain();
    this.env(g, t, opts.peak ?? 0.2, attack, decay);
    src.connect(f).connect(g).connect(opts.bus ?? this.sfxBus);
    src.start(t, Math.random() * 2, attack + decay + 0.1);
  }

  /** One rising bubble "blip". */
  private blip(t: number, base: number, peak: number, bus?: AudioNode) {
    this.tone(base, t, { to: base * 2.2, peak, attack: 0.004, decay: 0.07, bus });
  }

  private get now(): number {
    return this.ctx ? this.ctx.currentTime + 0.01 : 0;
  }

  private ready(): boolean {
    return Boolean(this.ctx && this.ctx.state === "running");
  }

  // --------------------------------------------------------------- one-shots

  play(name: SfxName) {
    if (!this.ready()) return;
    // The same sound twice within 60 ms is one sound (many fish eating at once).
    const last = this.lastPlayed.get(name) ?? -1;
    if (performance.now() - last < 60) return;
    this.lastPlayed.set(name, performance.now());
    const t = this.now;
    switch (name) {
      case "correct":
        this.tone(midi(79), t, { peak: 0.14, decay: 0.3, type: "triangle" });
        this.tone(midi(84), t + 0.11, { peak: 0.14, decay: 0.5, type: "triangle" });
        break;
      case "error":
        this.tone(midi(64), t, { peak: 0.07, decay: 0.16, type: "triangle" });
        this.tone(midi(60), t + 0.17, { peak: 0.07, decay: 0.24, type: "triangle" });
        break;
      case "tick":
        this.tone(1250, t, { peak: 0.05, decay: 0.03 });
        break;
      case "micOn":
        this.tone(880, t, { to: 1320, peak: 0.09, decay: 0.08 });
        break;
      case "micOff":
        this.tone(1100, t, { to: 700, peak: 0.06, decay: 0.08 });
        break;
      case "coin":
        this.tone(midi(88), t, { peak: 0.09, decay: 0.08, type: "square" });
        this.tone(midi(95), t + 0.07, { peak: 0.08, decay: 0.32, type: "square" });
        break;
      case "purchase":
        [76, 80, 83].forEach((m, i) => this.tone(midi(m), t + i * 0.06, { peak: 0.08, decay: 0.18, type: "triangle" }));
        this.tone(midi(88), t + 0.2, { peak: 0.1, decay: 0.5, type: "triangle" });
        this.noiseBurst(t, { filter: "highpass", freq: 4000, peak: 0.04, decay: 0.12 });
        break;
      case "bubble":
        for (let i = 0; i < 3; i++) this.blip(t + i * 0.08 + Math.random() * 0.03, 400 + Math.random() * 400, 0.05);
        break;
      case "sprinkle":
        for (let i = 0; i < 7; i++) this.noiseBurst(t + i * 0.045, { filter: "bandpass", freq: 3500 + Math.random() * 2500, q: 2, peak: 0.05, decay: 0.03 });
        for (let i = 0; i < 4; i++) this.blip(t + 0.25 + i * 0.09, 500 + i * 80, 0.03);
        break;
      case "gulp":
        this.tone(340, t, { to: 160, peak: 0.08, decay: 0.07 });
        this.blip(t + 0.06, 700, 0.03);
        break;
      case "splash":
        this.noiseBurst(t, { filter: "bandpass", freq: 2200, to: 500, q: 0.6, peak: 0.22, attack: 0.015, decay: 0.4 });
        [460, 620, 780].forEach((f, i) => this.tone(f, t + i * 0.05, { to: f * 0.45, peak: 0.06, decay: 0.12 }));
        for (let i = 0; i < 5; i++) this.blip(t + 0.2 + i * 0.07, 380 + Math.random() * 500, 0.04);
        break;
      case "scrub":
        for (let i = 0; i < 6; i++) this.noiseBurst(t + i * 0.2, { filter: "bandpass", freq: 1500 + (i % 2) * 700, q: 1.2, peak: 0.07, attack: 0.05, decay: 0.12 });
        [84, 88, 91].forEach((m, i) => this.tone(midi(m), t + 1.2 + i * 0.07, { peak: 0.05, decay: 0.4 }));
        break;
      case "happy":
        [79, 83, 86, 91].forEach((m, i) => this.tone(midi(m), t + i * 0.07, { peak: 0.07, decay: 0.2, type: "triangle" }));
        break;
      case "wow":
        this.tone(midi(67), t, { to: midi(79), peak: 0.07, attack: 0.05, decay: 0.3, type: "triangle" });
        this.tone(midi(84), t + 0.25, { peak: 0.05, decay: 0.3, type: "triangle" });
        break;
      case "hmm":
        this.tone(midi(62), t, { to: midi(58), peak: 0.05, attack: 0.05, decay: 0.35, type: "triangle" });
        break;
      case "place":
        this.tone(midi(72), t, { to: midi(79), peak: 0.1, decay: 0.12, type: "triangle" });
        this.noiseBurst(t, { filter: "lowpass", freq: 600, peak: 0.08, decay: 0.12 });
        this.blip(t + 0.1, 500, 0.04);
        break;
      case "pick":
        this.tone(midi(79), t, { to: midi(84), peak: 0.07, decay: 0.1, type: "triangle" });
        break;
      case "unlock":
        [72, 76, 79, 84].forEach((m, i) => this.tone(midi(m), t + i * 0.12, { peak: 0.13, decay: 0.25, type: "triangle" }));
        this.tone(midi(88), t + 0.5, { peak: 0.14, attack: 0.02, decay: 1.4, type: "triangle" });
        this.tone(midi(84), t + 0.5, { peak: 0.07, attack: 0.02, decay: 1.4 });
        this.tone(midi(79), t + 0.5, { peak: 0.07, attack: 0.02, decay: 1.4 });
        for (let i = 0; i < 10; i++) this.tone(2000 + Math.random() * 2600, t + 0.55 + i * 0.07, { peak: 0.02, decay: 0.3 });
        break;
      case "flash":
        this.noiseBurst(t, { filter: "highpass", freq: 3000, peak: 0.08, attack: 0.002, decay: 0.05 });
        this.tone(2400, t + 0.02, { to: 600, peak: 0.04, decay: 0.15 });
        break;
      case "trophy":
        [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => this.tone(midi(m), t + i * 0.09, { peak: 0.11, decay: 0.3, type: "triangle" }));
        [72, 76, 79, 84].forEach((m) => this.tone(midi(m), t + 0.7, { peak: 0.08, attack: 0.02, decay: 2, type: "triangle" }));
        for (let i = 0; i < 16; i++) this.tone(1800 + Math.random() * 3000, t + 0.7 + i * 0.06, { peak: 0.02, decay: 0.3 });
        break;
      case "door":
        this.tone(midi(84), t, { peak: 0.06, decay: 0.4 });
        this.tone(midi(79), t + 0.18, { peak: 0.06, decay: 0.6 });
        break;
    }
  }

  // ------------------------------------------------------------- ambience

  startAmbience() {
    if (!this.ctx || this.hum) return;
    const ctx = this.ctx;
    // A soft, low aquarium hum that swells slowly.
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 260;
    f.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.value = 0.35;
    const swell = ctx.createGain();
    swell.gain.value = 0.7;
    src.connect(f).connect(g).connect(swell).connect(this.ambBus);
    src.start(0, Math.random() * 2);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const depth = ctx.createGain();
    depth.gain.value = 0.25;
    lfo.connect(depth).connect(swell.gain);
    lfo.start();
    this.hum = g;
    window.setInterval(() => this.bubbles(), 700);
  }

  /** Sparse bubble blips from the filters; never while listening. */
  private bubbles() {
    if (!this.ready() || this.listening) return;
    if (Math.random() > 0.35) return;
    const t = this.now;
    const n = 1 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this.blip(t + i * (0.06 + Math.random() * 0.08), 300 + Math.random() * 500, 0.03, this.ambBus);
  }

  // ------------------------------------------------------------------ music

  startMusic(tune: Tune = "aquarium") {
    if (!this.ctx) return;
    if (this.music?.tune === tune) return;
    window.clearInterval(this.musicTimer);
    this.music = { next: this.ctx.currentTime + 0.2, step: 0, tune };
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 60);
  }

  stopMusic() {
    window.clearInterval(this.musicTimer);
    this.music = null;
  }

  private scheduleMusic() {
    const ctx = this.ctx;
    const m = this.music;
    if (!ctx || !m) return;
    const bpm = m.tune === "celebrate" ? 112 : 84;
    const eighth = 60 / bpm / 2;
    while (m.next < ctx.currentTime + 0.3) {
      this.playStep(m.step, m.next, eighth, m.tune);
      m.step++;
      m.next += eighth;
    }
  }

  /** Music box / celesta: a sine with a bright, quickly fading partial. */
  private bell(f: number, t: number, peak: number) {
    const bus = this.musicBus;
    this.tone(f, t, { peak, attack: 0.004, decay: 0.9, bus });
    this.tone(f * 4.01, t, { peak: peak * 0.18, attack: 0.002, decay: 0.12, bus });
  }

  private playStep(step: number, t: number, eighth: number, tune: Tune) {
    // 8 bars of 8 eighths. C – Am – F – G, twice, with a floating melody.
    const MELODY: number[][] =
      tune === "celebrate"
        ? [
            [72, 0, 76, 0, 79, 0, 84, 0],
            [81, 0, 79, 0, 76, 0, 79, 0],
            [77, 0, 81, 0, 84, 0, 81, 0],
            [79, 0, 0, 0, 74, 0, 0, 0],
            [76, 0, 79, 0, 84, 0, 88, 0],
            [86, 0, 84, 0, 81, 0, 79, 0],
            [77, 0, 76, 74, 0, 72, 74, 0],
            [72, 0, 0, 0, 0, 0, 0, 0]
          ]
        : [
            [76, 0, 0, 0, 79, 0, 0, 0],
            [81, 0, 0, 79, 76, 0, 0, 0],
            [77, 0, 0, 0, 72, 0, 74, 0],
            [74, 0, 0, 0, 0, 0, 0, 0],
            [76, 0, 0, 0, 79, 0, 84, 0],
            [83, 0, 0, 81, 79, 0, 0, 0],
            [77, 0, 76, 0, 74, 0, 71, 0],
            [72, 0, 0, 0, 0, 0, 0, 0]
          ];
    const ROOT = [48, 45, 41, 43, 48, 45, 41, 43];
    const CHORD = [
      [0, 4, 7],
      [0, 3, 7],
      [0, 4, 7],
      [0, 4, 7]
    ];
    const bar = Math.floor(step / 8) % 8;
    const s = step % 8;
    const note = MELODY[bar][s];
    if (note) this.bell(midi(note), t, tune === "celebrate" ? 0.11 : 0.085);
    const root = ROOT[bar];
    if (s === 0) this.tone(midi(root), t, { peak: 0.1, attack: 0.02, decay: eighth * 6, bus: this.musicBus, type: "triangle" });
    // Gentle broken chord.
    if (s % 2 === 1) {
      const c = CHORD[bar % 4];
      const n = root + 12 + c[((s - 1) / 2) % 3];
      this.tone(midi(n), t, { peak: 0.03, attack: 0.01, decay: 0.5, bus: this.musicBus });
    }
  }
}

export const audio = new AudioEngine();

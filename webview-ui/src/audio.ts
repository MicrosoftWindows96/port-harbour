// Synthesized retro audio. No external assets. Web Audio API only.
// Channels: horn, birds, waves, music. Each independently toggleable.

import type { AudioSettings, DockerEvent } from "./types";

export function defaultAudioSettings(): AudioSettings {
  return { master: 0.5, horn: true, birds: true, waves: true, music: false };
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private settings: AudioSettings = defaultAudioSettings();
  private wavesNode: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private musicTimer: number | null = null;
  private birdsTimer: number | null = null;
  private primed = false;
  private musicStep = 0;

  prime() {
    if (this.primed) return;
    try {
      const Ctx =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx: AudioContext = new Ctx();
      const master = ctx.createGain();
      master.gain.value = this.settings.master;
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.primed = true;
      this.applySettings(this.settings);
    } catch {
      /* silent */
    }
  }

  applySettings(s: AudioSettings) {
    this.settings = s;
    if (!this.ctx || !this.master) return;
    this.master.gain.linearRampToValueAtTime(
      s.master,
      this.ctx.currentTime + 0.05
    );

    if (s.waves && !this.wavesNode) this.startWaves();
    if (!s.waves && this.wavesNode) this.stopWaves();

    if (s.music && this.musicTimer === null) this.startMusic();
    if (!s.music && this.musicTimer !== null) this.stopMusic();

    if (s.birds && this.birdsTimer === null) this.scheduleBirds();
    if (!s.birds && this.birdsTimer !== null) this.stopBirds();
  }

  onDockerEvent(evt: DockerEvent) {
    if (!this.settings.horn) return;
    if (evt.action === "start" || evt.action === "create") this.playHorn(0.65);
    else if (evt.action === "die" || evt.action === "stop" || evt.action === "kill")
      this.playHorn(0.35);
  }

  // Higher pitch for higher port (mapped log-scale into a pleasant range).
  playPortChime(port: number, opening: boolean) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.settings.horn) return;
    const now = ctx.currentTime;
    const ratio = Math.min(1, Math.log10(port + 1) / Math.log10(65536));
    const f = opening ? 500 + ratio * 1100 : 220 + ratio * 300;
    const osc = ctx.createOscillator();
    osc.type = opening ? "triangle" : "sine";
    osc.frequency.setValueAtTime(f, now);
    osc.frequency.exponentialRampToValueAtTime(opening ? f * 1.5 : f * 0.5, now + 0.18);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.01);
    gain.gain.linearRampToValueAtTime(0, now + 0.25);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  // Crickets ambient (used by App on night detection)
  playCricketChirp() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.settings.birds) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(4400 + Math.random() * 800, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.04, now + 0.005);
    gain.gain.linearRampToValueAtTime(0, now + 0.04);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  playBoatCreak() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.settings.waves) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.linearRampToValueAtTime(80, now + 0.5);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 350;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.05, now + 0.05);
    gain.gain.linearRampToValueAtTime(0, now + 0.6);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.65);
  }

  playOwlHoot() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.settings.birds) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.3);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.05);
    gain.gain.linearRampToValueAtTime(0, now + 0.45);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.5);
    // Second "hoot"
    setTimeout(() => {
      if (!this.ctx) return;
      const t2 = this.ctx.currentTime;
      const o2 = this.ctx.createOscillator();
      o2.type = "sine";
      o2.frequency.value = 360;
      const g2 = this.ctx.createGain();
      g2.gain.setValueAtTime(0, t2);
      g2.gain.linearRampToValueAtTime(0.1, t2 + 0.05);
      g2.gain.linearRampToValueAtTime(0, t2 + 0.5);
      o2.connect(g2);
      g2.connect(this.master!);
      o2.start(t2);
      o2.stop(t2 + 0.6);
    }, 700);
  }

  // Cathedral bell on the hour. Played as bell-like additive tones.
  playBellToll(count: number = 1) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const bellOnce = (offset: number) => {
      const t = ctx.currentTime + offset;
      const partials = [440, 880, 1320, 1760];
      const gains = [0.18, 0.1, 0.06, 0.04];
      for (let i = 0; i < partials.length; i++) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = partials[i];
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(gains[i], t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
        o.connect(g);
        g.connect(master);
        o.start(t);
        o.stop(t + 2.3);
      }
    };
    const max = Math.min(count, 12);
    for (let i = 0; i < max; i++) bellOnce(i * 0.8);
  }

  // --- Foghorn ---
  playHorn(strength = 0.5) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.settings.horn) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.linearRampToValueAtTime(70, now + 1.6);
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(55, now);
    sub.frequency.linearRampToValueAtTime(38, now + 1.6);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.45 * strength, now + 0.15);
    gain.gain.linearRampToValueAtTime(0.2 * strength, now + 1.0);
    gain.gain.linearRampToValueAtTime(0, now + 1.8);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 800;
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(now);
    sub.start(now);
    osc.stop(now + 1.9);
    sub.stop(now + 1.9);
  }

  // --- Bird chirp ---
  private playBird() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    const base = 1800 + Math.random() * 1200;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.linearRampToValueAtTime(base * 1.6, now + 0.05);
    osc.frequency.linearRampToValueAtTime(base * 0.9, now + 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.02);
    gain.gain.linearRampToValueAtTime(0, now + 0.18);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  private scheduleBirds() {
    const fire = () => {
      if (!this.settings.birds) {
        this.birdsTimer = null;
        return;
      }
      this.playBird();
      if (Math.random() < 0.4) {
        setTimeout(() => this.playBird(), 120 + Math.random() * 200);
      }
      const next = 1500 + Math.random() * 6000;
      this.birdsTimer = window.setTimeout(fire, next);
    };
    this.birdsTimer = window.setTimeout(fire, 1500);
  }

  private stopBirds() {
    if (this.birdsTimer !== null) clearTimeout(this.birdsTimer);
    this.birdsTimer = null;
  }

  // --- Waves (continuous filtered noise) ---
  private startWaves() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const bufSize = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5;
    }
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 600;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();

    // Gentle volume modulation for wave swell
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.08;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    lfo.start();

    gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 1.5);

    this.wavesNode = { source, gain };
  }

  private stopWaves() {
    const ctx = this.ctx;
    if (!ctx || !this.wavesNode) return;
    const { source, gain } = this.wavesNode;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
    setTimeout(() => {
      try {
        source.stop();
        source.disconnect();
        gain.disconnect();
      } catch {
        /* ignore */
      }
    }, 700);
    this.wavesNode = null;
  }

  // --- Continuous melodic music (sequencer, ambient piano) ---
  // 64-step grid at eighth-note resolution. 80 BPM → 375 ms/step → ~24 s loop.
  // Melody, bass and 2-bar pad chords play in lockstep, creating a real
  // continuous track instead of random notes.
  private padNode: { oscs: OscillatorNode[]; gain: GainNode } | null = null;

  // Note frequencies (Hz).
  private static readonly MELODY: number[] = [
    // Bar 1 — C major arpeggio + step
    329.63, 0, 392.0, 0, 523.25, 0, 392.0, 0,
    261.63, 293.66, 329.63, 0, 0, 0, 0, 0,
    // Bar 2 — passing tones into A minor
    392.0, 0, 440.0, 0, 392.0, 0, 329.63, 0,
    261.63, 0, 293.66, 0, 0, 0, 0, 0,
    // Bar 3 — F major resolve
    349.23, 0, 440.0, 0, 523.25, 0, 440.0, 0,
    349.23, 293.66, 0, 0, 0, 0, 0, 0,
    // Bar 4 — G7 to home
    392.0, 0, 493.88, 0, 587.33, 0, 493.88, 0,
    392.0, 0, 329.63, 0, 261.63, 0, 0, 0
  ];

  private static readonly BASS: number[] = [
    // Bar 1 C
    65.41, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    // Bar 2 A minor
    55.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    // Bar 3 F
    87.31, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    // Bar 4 G
    98.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
  ];

  // Pad chord per bar (3 freqs). At step 0/16/32/48 chord swaps.
  private static readonly CHORDS: number[][] = [
    [261.63, 329.63, 392.0], // C
    [220.0, 261.63, 329.63], // Am
    [174.61, 261.63, 349.23], // F
    [196.0, 246.94, 293.66] // G
  ];

  private currentChordIdx = -1;

  private startMusic() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    // Build pad oscillators (3 sines, lowpass filtered) gain controlled by chord changes
    const padGain = ctx.createGain();
    padGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.connect(padGain);
    padGain.connect(master);
    const oscs: OscillatorNode[] = [];
    // Start with first chord
    const chord = AudioEngine.CHORDS[0];
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = chord[i];
      o.connect(filter);
      o.start();
      oscs.push(o);
    }
    padGain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 3);
    this.padNode = { oscs, gain: padGain };
    this.currentChordIdx = 0;

    this.musicStep = 0;
    const stepMs = 375; // 80 BPM eighth notes
    const tick = () => {
      if (!this.settings.music) {
        this.musicTimer = null;
        return;
      }
      this.stepSequencer();
      this.musicTimer = window.setTimeout(tick, stepMs);
    };
    this.musicTimer = window.setTimeout(tick, stepMs);
  }

  private stopMusic() {
    if (this.musicTimer !== null) clearTimeout(this.musicTimer);
    this.musicTimer = null;
    const ctx = this.ctx;
    if (ctx && this.padNode) {
      const { oscs, gain } = this.padNode;
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);
      setTimeout(() => {
        try {
          oscs.forEach((o) => {
            o.stop();
            o.disconnect();
          });
          gain.disconnect();
        } catch {
          /* ignore */
        }
      }, 1400);
      this.padNode = null;
    }
  }

  private stepSequencer() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const step = this.musicStep % 64;
    this.musicStep++;
    const now = ctx.currentTime;

    // Pad chord swap every 16 steps
    const chordIdx = Math.floor(step / 16);
    if (chordIdx !== this.currentChordIdx && this.padNode) {
      const chord = AudioEngine.CHORDS[chordIdx];
      this.padNode.oscs.forEach((o, i) => {
        o.frequency.linearRampToValueAtTime(chord[i], now + 0.6);
      });
      this.currentChordIdx = chordIdx;
    }

    // Melody note
    const mf = AudioEngine.MELODY[step];
    if (mf > 0) {
      this.playPianoNote(mf, 0.16, 1.4);
    }

    // Bass note
    const bf = AudioEngine.BASS[step];
    if (bf > 0) {
      this.playBassNote(bf, 0.12, 3.6);
    }
  }

  private playPianoNote(freq: number, level: number, decay: number) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const partial = (f: number, g: number, d: number) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const gn = ctx.createGain();
      gn.gain.setValueAtTime(0, now);
      gn.gain.linearRampToValueAtTime(g, now + 0.01);
      gn.gain.exponentialRampToValueAtTime(0.0001, now + d);
      const flt = ctx.createBiquadFilter();
      flt.type = "lowpass";
      flt.frequency.value = 2400;
      o.connect(flt);
      flt.connect(gn);
      gn.connect(master);
      o.start(now);
      o.stop(now + d + 0.05);
    };
    partial(freq, level, decay);
    partial(freq * 2, level * 0.3, decay * 0.6);
    partial(freq * 0.5, level * 0.5, decay * 1.3);
  }

  private playBassNote(freq: number, level: number, decay: number) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(level, now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 600;
    o.connect(filter);
    filter.connect(g);
    g.connect(master);
    o.start(now);
    o.stop(now + decay + 0.05);
  }
}

export const audio = new AudioEngine();

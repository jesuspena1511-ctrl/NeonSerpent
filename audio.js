/* ============================================================
   NEON SERPENT — Audio Engine
   Música synthwave y efectos generados en tiempo real con WebAudio.
   Sin archivos externos: todo es síntesis procedural.
   ============================================================ */
(function () {
  'use strict';

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.ready = false;
      this.muted = false;
      this.musicVolume = 0.55;
      this.sfxVolume = 0.8;
      this.master = null;
      this.musicGain = null;
      this.sfxGain = null;
      this.reverb = null;
      this.delay = null;
      this.noiseBuffer = null;
      this.musicTimer = null;
      this.nextNote = 0;
      this.step = 0;
      this.intensity = 0.35;
      this.lastEat = 0;
      this.lastCandy = 0;
      this.candyStreak = 0;
      this.boostGain = null;
      this.boostFilter = null;
      this.boostSource = null;
      this.musicPlaying = false;
      this.themeId = 'aurora';
      this.themeStyle = 'calm';
      this.themeGain = .7;
      this.currentMode = 'menu';
      this.bpm = 64;
      this.beat = 60 / this.bpm / 4;

      this._unlock = () => this.init();
      document.addEventListener('pointerdown', this._unlock, { capture: true });
      document.addEventListener('keydown', this._unlock, { capture: true });
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) {
          this.stopMusic();
        } else if (!this.musicPlaying) {
          this.startMusic();
        }
      });
    }

    init() {
      if (this.ready) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch (e) {
        return;
      }
      const ctx = this.ctx;

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 22;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.25;
      compressor.connect(ctx.destination);

      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.92;
      this.master.connect(compressor);

      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = this.musicVolume * (this.themeStyle === 'synth' ? .42 : .34);
      this.musicGain.connect(this.master);

      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume * 0.82 * this.themeGain;
      this.sfxGain.connect(this.master);

      // Reverb procedural
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.makeImpulse(2.1, 2.8);
      const wet = ctx.createGain();
      wet.gain.value = 0.24;
      this.reverb.connect(wet);
      wet.connect(this.master);
      this.reverbSend = ctx.createGain();
      this.reverbSend.gain.value = 1;
      this.reverbSend.connect(this.reverb);

      // Delay para arpegios
      this.delay = ctx.createDelay(1.0);
      this.delay.delayTime.value = this.beat * 3;
      const fb = ctx.createGain();
      fb.gain.value = 0.28;
      const dWet = ctx.createGain();
      dWet.gain.value = 0.18;
      this.delay.connect(fb);
      fb.connect(this.delay);
      this.delay.connect(dWet);
      dWet.connect(this.master);
      this.delaySend = ctx.createGain();
      this.delaySend.gain.value = 1;
      this.delaySend.connect(this.delay);

      this.noiseBuffer = this.makeNoise(2);
      this.ready = true;
      if (ctx.state === 'suspended') ctx.resume();
      this.startMusic();
    }

    makeNoise(seconds) {
      const ctx = this.ctx;
      const len = Math.floor(ctx.sampleRate * seconds);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    }

    makeImpulse(seconds, decay) {
      const ctx = this.ctx;
      const rate = ctx.sampleRate;
      const len = Math.floor(rate * seconds);
      const buf = ctx.createBuffer(2, len, rate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
        }
      }
      return buf;
    }

    setVolumes(music, sfx) {
      this.musicVolume = clamp(music / 100, 0, 1);
      this.sfxVolume = clamp(sfx / 100, 0, 1);
      if (this.ready) {
        const t = this.ctx.currentTime;
        this.musicGain.gain.setTargetAtTime(this.musicVolume * (this.themeStyle === 'synth' ? .42 : .34), t, 0.08);
        this.sfxGain.gain.setTargetAtTime(this.sfxVolume * 0.82 * this.themeGain, t, 0.05);
      }
    }

    setTheme(id, cfg) {
      this.themeId = id || 'aurora';
      const conf = cfg || { bpm: 64, style: 'calm', gain: .7 };
      this.themeStyle = conf.style || 'calm';
      this.themeGain = conf.gain == null ? .7 : conf.gain;
      const bpm = conf.bpm || 64;
      if (bpm !== this.bpm) {
        this.bpm = bpm;
        this.beat = 60 / this.bpm / 4;
        if (this.ready && this.delay) {
          this.delay.delayTime.setTargetAtTime(this.beat * 3, this.ctx.currentTime, .2);
        }
      }
      if (this.ready) {
        const t = this.ctx.currentTime;
        this.sfxGain.gain.setTargetAtTime(this.sfxVolume * 0.82 * this.themeGain, t, .08);
        this.musicGain.gain.setTargetAtTime(this.musicVolume * (this.themeStyle === 'synth' ? .42 : .34), t, .08);
      }
      this.setMode(this.currentMode);
    }

    setMuted(muted) {
      this.muted = !!muted;
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.92, t, 0.04);
      if (!this.muted && this.ctx.state === 'suspended') this.ctx.resume();
    }

    setMode(mode) {
      this.currentMode = mode;
      if (this.themeStyle === 'synth') this.intensity = mode === 'game' ? 1 : 0.38;
      else this.intensity = mode === 'game' ? 0.78 : 0.3;
    }

    startMusic() {
      if (!this.ready || this.musicPlaying) return;
      this.musicPlaying = true;
      this.nextNote = this.ctx.currentTime + 0.12;
      this.step = 0;
      this.musicTimer = setInterval(() => this.schedule(), 25);
    }

    stopMusic() {
      this.musicPlaying = false;
      if (this.musicTimer) clearInterval(this.musicTimer);
      this.musicTimer = null;
    }

    schedule() {
      if (!this.ready || !this.musicPlaying) return;
      const now = this.ctx.currentTime;
      if (this.nextNote < now - 0.5) this.nextNote = now + 0.05;
      let guard = 0;
      while (this.nextNote < now + 0.22 && guard++ < 24) {
        this.playStep(this.step, this.nextNote);
        this.nextNote += this.beat;
        this.step = (this.step + 1) % 64;
      }
    }

    playStep(step, t) {
      if (this.themeId === 'halloween') {
        this.playSpookyStep(step, t);
        return;
      }
      if (this.themeId === 'fiesta') {
        this.playPartyStep(step, t);
        return;
      }
      if (this.themeStyle !== 'synth') {
        this.playCalmStep(step, t);
        return;
      }
      const ctx = this.ctx;
      const bar = Math.floor(step / 16);
      const s = step % 16;
      const chords = [
        { pad: [57, 60, 64], bass: 45, arp: [69, 72, 76, 79] }, // Am
        { pad: [53, 57, 60], bass: 41, arp: [65, 69, 72, 77] }, // F
        { pad: [48, 52, 55], bass: 48, arp: [60, 64, 67, 72] }, // C
        { pad: [55, 59, 62], bass: 43, arp: [67, 71, 74, 79] }  // G
      ];
      const c = chords[bar];
      const intensity = this.intensity;

      if (s === 0) this.pad(c.pad, t, this.beat * 16, intensity);

      // Bass en negras
      if (s % 4 === 0) {
        this.bassNote(c.bass, t, this.beat * 3.6, intensity);
        if (s === 0) this.bassNote(c.bass, t, this.beat * 3.6, intensity);
      }

      // Kick suave (mitad de tempo)
      if (s === 0 || s === 8) this.kick(t, 0.11 * intensity);
      if (s === 6 || s === 14) this.kick(t, 0.05 * intensity);

      // Hi-hats
      if (s % 2 === 0) this.hat(t, (s % 4 === 0 ? 0.022 : 0.012) * (0.5 + intensity * 0.5));
      if (s === 15 && intensity > 0.7) this.hat(t, 0.032);

      // Arpegio
      const pattern = [0, -1, 2, -1, 1, -1, 3, -1, 2, -1, 1, 3, -1, 2, -1, 3];
      const idx = pattern[s];
      if (idx >= 0) {
        const notes = c.arp;
        const n = notes[idx % notes.length] + (bar === 2 ? 12 : 0);
        this.pluck(n, t, 0.035 * (0.35 + intensity * 0.9), bar % 2 === 1);
      }
      // Sparkle superior ocasional
      if (intensity > 0.6 && s === 10 && bar % 2 === 0) {
        this.pluck(c.arp[3] + 12, t + this.beat * 0.5, 0.02, true);
      }
    }

    playCalmStep(step, t) {
      const bar = Math.floor(step / 16);
      const s = step % 16;
      const deep = this.themeStyle === 'deep';
      const calmChords = [
        { pad: [57, 60, 64, 67], bass: 45, arp: [69, 72, 76, 79, 83] },
        { pad: [53, 57, 60, 64], bass: 41, arp: [65, 69, 72, 77, 81] },
        { pad: [48, 52, 55, 59], bass: 48, arp: [60, 64, 67, 72, 76] },
        { pad: [55, 59, 62, 65], bass: 43, arp: [67, 71, 74, 79, 81] }
      ];
      const deepChords = [
        { pad: [50, 57, 60, 64], bass: 38, arp: [62, 69, 72, 76, 81] },
        { pad: [46, 53, 57, 60], bass: 34, arp: [58, 65, 69, 72, 76] },
        { pad: [43, 50, 55, 59], bass: 31, arp: [55, 62, 67, 71, 74] },
        { pad: [48, 55, 58, 62], bass: 36, arp: [60, 67, 70, 74, 79] }
      ];
      const c = (deep ? deepChords : calmChords)[bar];
      const intensity = this.intensity;
      if (s === 0) this.pad(c.pad, t, this.beat * 16, intensity);
      if (s === 0 || s === 8) this.bassNote(c.bass, t, this.beat * 6.8, intensity);
      const pattern = [0, -1, -1, 2, -1, 3, -1, -1, 1, -1, -1, 2, -1, 0, -1, 3];
      const idx = pattern[s];
      if (idx >= 0) {
        const n = c.arp[idx % c.arp.length] + (bar === 2 ? 12 : 0);
        this.pluck(n, t, (deep ? .019 : .023) * (0.55 + intensity * .7), bar % 2 === 1);
      }
      if (s === 12 && bar % 2 === 0) {
        this.pluck(c.arp[c.arp.length - 1] + 12, t + this.beat * .5, .012, true);
      }
    }

    playSpookyStep(step, t) {
      const bar = Math.floor(step / 16);
      const s = step % 16;
      const chords = [
        { pad: [50, 53, 57, 62], bass: 38, arp: [62, 65, 69, 74, 77] }, // Dm
        { pad: [46, 50, 53, 58], bass: 34, arp: [58, 62, 65, 70, 74] }, // Bb
        { pad: [43, 46, 50, 55], bass: 31, arp: [55, 58, 62, 67, 70] }, // Gm
        { pad: [45, 49, 52, 57], bass: 33, arp: [57, 61, 64, 69, 73] }  // A
      ];
      const c = chords[bar];
      const intensity = this.intensity;
      if (s === 0) this.pad(c.pad, t, this.beat * 16, intensity * .72);
      if (s === 0 || s === 10) this.bassNote(c.bass, t, this.beat * 7.2, intensity * .8);
      const pattern = [0, -1, -1, 2, -1, -1, 4, -1, 1, -1, -1, 3, -1, 0, -1, -1];
      const idx = pattern[s];
      if (idx >= 0) {
        const n = c.arp[idx % c.arp.length] - (bar % 2 ? 0 : 12);
        this.pluck(n, t, .014 * (0.7 + intensity * .65), true);
      }
      if (s === 6 && bar % 2 === 0) {
        this.pluck(c.arp[c.arp.length - 1] + 12, t + this.beat * .5, .009, true);
      }
      if (s === 0 || s === 8) this.kick(t, .055 * intensity);
      if (s === 4 && intensity > .5) this.hat(t, .008 * intensity);
      if (s === 14 && bar === 3) this.pluck(c.arp[0] - 12, t + this.beat * .5, .011, true);
    }

    playPartyStep(step, t) {
      const bar = Math.floor(step / 16);
      const s = step % 16;
      const chords = [
        { pad: [60, 64, 67], bass: 48, arp: [72, 76, 79, 84] }, // C
        { pad: [55, 59, 62], bass: 43, arp: [67, 71, 74, 79] }, // G
        { pad: [57, 60, 64], bass: 45, arp: [69, 72, 76, 81] }, // Am
        { pad: [53, 57, 60], bass: 41, arp: [65, 69, 72, 77] }  // F
      ];
      const c = chords[bar];
      const intensity = this.intensity;
      if (s === 0) this.pad(c.pad, t, this.beat * 16, intensity * .92);
      if (s === 0 || s === 6 || s === 10) this.bassNote(c.bass, t, this.beat * 3, intensity);
      if (s % 4 === 0) this.kick(t, .1 * intensity);
      if (s === 4 || s === 12) this.kick(t, .045 * intensity);
      if (s % 2 === 0) this.hat(t, (s % 4 === 0 ? .019 : .011) * (.55 + intensity * .5));
      if (s === 7 || s === 15) this.hat(t, .02);
      const pattern = [0, 2, 1, 2, 0, 3, 1, 2, 0, 2, 1, 3, 2, 1, 3, 2];
      const idx = pattern[s];
      if (idx >= 0) {
        const n = c.arp[idx % c.arp.length] + (bar % 2 === 1 ? 12 : 0);
        this.pluck(n, t, .024 * (.5 + intensity * .8), s % 4 === 2);
      }
      if (bar === 3 && s >= 12) {
        this.pluck(c.arp[(s - 12) % c.arp.length] + 12, t, .028, true);
      }
    }

    pad(notes, t, dur, intensity) {
      const ctx = this.ctx;
      const calm = this.themeStyle !== 'synth';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(calm ? 440 : 620, t);
      filter.frequency.linearRampToValueAtTime(calm ? 760 : 1150, t + dur * 0.55);
      filter.frequency.linearRampToValueAtTime(calm ? 520 : 700, t + dur);
      filter.Q.value = calm ? .7 : 1.2;

      const g = ctx.createGain();
      const peak = (calm ? .038 : .028) * (0.5 + intensity * 0.6);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + (calm ? 1.1 : .5));
      g.gain.setValueAtTime(peak, t + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      filter.connect(g);
      g.connect(this.musicGain);
      g.connect(this.reverbSend);

      notes.forEach((n, i) => {
        const o = ctx.createOscillator();
        o.type = calm ? (i % 2 === 0 ? 'sine' : 'triangle') : (i === 0 ? 'sawtooth' : 'triangle');
        o.frequency.value = mtof(n);
        o.detune.value = (i - 1) * (calm ? 3 : 7);
        o.connect(filter);
        o.start(t);
        o.stop(t + dur + 0.05);
      });
    }

    bassNote(note, t, dur, intensity) {
      const ctx = this.ctx;
      const calm = this.themeStyle !== 'synth';
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      o.type = calm ? 'sine' : 'sawtooth';
      o.frequency.value = mtof(note);
      f.type = 'lowpass';
      f.frequency.setValueAtTime(calm ? 190 : 260, t);
      f.frequency.exponentialRampToValueAtTime(calm ? 95 : 120, t + dur);
      f.Q.value = calm ? .8 : 2;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime((calm ? .044 : .06) * (0.6 + intensity * 0.5), t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(this.musicGain);
      o.start(t); o.stop(t + dur + 0.02);
    }

    pluck(note, t, gain, delay) {
      const ctx = this.ctx;
      const calm = this.themeStyle !== 'synth';
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      o.type = calm ? 'sine' : 'triangle';
      o.frequency.value = mtof(note);
      f.type = 'lowpass';
      f.frequency.setValueAtTime(calm ? 2400 : 3400, t);
      f.frequency.exponentialRampToValueAtTime(calm ? 760 : 900, t + (calm ? .55 : .35));
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (calm ? .95 : .42));
      o.connect(f); f.connect(g);
      g.connect(this.musicGain);
      g.connect(this.reverbSend);
      if (delay) g.connect(this.delaySend);
      o.start(t); o.stop(t + (calm ? 1 : .45));
    }

    kick(t, gain) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g); g.connect(this.musicGain);
      o.start(t); o.stop(t + 0.27);
    }

    hat(t, gain) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
      src.connect(f); f.connect(g); g.connect(this.musicGain);
      src.start(t, Math.random() * 1.4, 0.08);
    }

    setBoost(active) {
      if (!this.ready) return;
      if (!this.boostGain) this.makeBoostLoop();
      const t = this.ctx.currentTime;
      if (active) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const calm = this.themeStyle !== 'synth';
        this.boostFilter.frequency.setTargetAtTime(calm ? 760 : 1350, t, 0.08);
        this.boostGain.gain.setTargetAtTime((calm ? .032 : .05) * Math.max(0.35, this.sfxVolume), t, 0.07);
      } else {
        this.boostGain.gain.setTargetAtTime(0.0001, t, 0.09);
      }
    }

    makeBoostLoop() {
      const ctx = this.ctx;
      this.boostSource = ctx.createBufferSource();
      this.boostSource.buffer = this.noiseBuffer;
      this.boostSource.loop = true;
      this.boostFilter = ctx.createBiquadFilter();
      this.boostFilter.type = 'bandpass';
      this.boostFilter.frequency.value = this.themeStyle === 'synth' ? 900 : 620;
      this.boostFilter.Q.value = 1.4;
      this.boostGain = ctx.createGain();
      this.boostGain.gain.value = 0.0001;
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 2400;
      this.boostSource.connect(this.boostFilter);
      this.boostFilter.connect(this.boostGain);
      this.boostGain.connect(low);
      low.connect(this.sfxGain);
      this.boostSource.start();
    }

    /* -------- SFX -------- */
    play(name, opts) {
      if (!this.ready || this.ctx.state === 'suspended') {
        if (this.ready && this.ctx.state === 'suspended') this.ctx.resume();
      }
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      switch (name) {
        case 'eat': this.sfxEat(t, opts); break;
        case 'rare': this.sfxRare(t); break;
        case 'kill': this.sfxKill(t); break;
        case 'death': this.sfxDeath(t); break;
        case 'click': this.sfxClick(t); break;
        case 'open': this.sfxWhoosh(t, 1); break;
        case 'close': this.sfxWhoosh(t, -1); break;
        case 'buy': this.sfxBuy(t); break;
        case 'error': this.sfxError(t); break;
        case 'shield': this.sfxShield(t); break;
        case 'count': this.sfxBeep(t, 440, 0.12); break;
        case 'go': this.sfxGo(t); break;
        case 'rankup': this.sfxRank(t); break;
        case 'coin': this.sfxCoin(t); break;
        case 'booststart': this.sfxBoostStart(t); break;
        case 'powerup': this.sfxPowerup(t, opts); break;
        case 'achievement': this.sfxAchievement(t); break;
        case 'candy': this.sfxCandy(t); break;
        case 'candyRare': this.sfxCandyRare(t); break;
        case 'equip': this.sfxEquip(t); break;
        case 'event': this.sfxEvent(t); break;
        default: break;
      }
      try {
        window.dispatchEvent(new CustomEvent('ns-sound', { detail: { name } }));
      } catch (e) { /* ignore */ }
    }

    out(gain, reverb) {
      const g = this.ctx.createGain();
      g.gain.value = gain;
      g.connect(this.sfxGain);
      if (reverb) g.connect(this.reverbSend);
      return g;
    }

    env(g, t, attack, hold, release, peak) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack);
      g.gain.setValueAtTime(peak, t + attack + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    }

    sfxEat(t, opts) {
      if (t - this.lastEat < 0.035) return;
      this.lastEat = t;
      const ctx = this.ctx;
      const combo = opts && opts.pitch ? opts.pitch : 0;
      const base = 580 + Math.min(combo, 16) * 24 + Math.random() * 90;
      const o = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o2.type = 'triangle';
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 1.55, t + 0.085);
      o2.frequency.setValueAtTime(base * 2, t);
      o2.frequency.exponentialRampToValueAtTime(base * 2.8, t + 0.07);
      const g2 = ctx.createGain();
      g2.gain.value = 0.25;
      o2.connect(g2); g2.connect(g);
      o.connect(g);
      this.env(g, t, 0.004, 0.01, 0.09, 0.055);
      g.connect(this.sfxGain);
      o.start(t); o.stop(t + 0.13);
      o2.start(t); o2.stop(t + 0.11);
    }

    sfxRare(t) {
      const ctx = this.ctx;
      [880, 1174.66, 1567.98].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        const start = t + i * 0.055;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(0.045, start + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.38);
        o.connect(g); g.connect(this.sfxGain); g.connect(this.reverbSend);
        o.start(start); o.stop(start + 0.4);
      });
    }

    noiseBurst(t, dur, freq, gain, type, reverb) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const f = ctx.createBiquadFilter();
      f.type = type || 'lowpass';
      f.frequency.setValueAtTime(freq, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.3), t + dur);
      f.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.sfxGain);
      if (reverb) g.connect(this.reverbSend);
      src.start(t, Math.random() * 0.8, dur + 0.05);
    }

    sfxKill(t) {
      const ctx = this.ctx;
      this.noiseBurst(t, 0.32, 950, 0.12, 'lowpass', true);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(180, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.36);
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g); g.connect(this.sfxGain); g.connect(this.reverbSend);
      o.start(t); o.stop(t + 0.42);
    }

    sfxDeath(t) {
      this.noiseBurst(t, 0.9, 1200, 0.18, 'lowpass', true);
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(32, t + 0.85);
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g); g.connect(this.sfxGain); g.connect(this.reverbSend);
      o.start(t); o.stop(t + 0.92);
      [220, 277, 330].forEach((f, i) => {
        const oo = ctx.createOscillator();
        const gg = ctx.createGain();
        oo.type = 'sawtooth';
        oo.frequency.value = f;
        oo.detune.value = i * 5;
        gg.gain.setValueAtTime(0.0001, t);
        gg.gain.exponentialRampToValueAtTime(0.022, t + 0.08);
        gg.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
        oo.connect(gg); gg.connect(this.sfxGain); gg.connect(this.reverbSend);
        oo.start(t); oo.stop(t + 1.25);
      });
    }

    sfxClick(t) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, t);
      o.frequency.exponentialRampToValueAtTime(1250, t + 0.025);
      g.gain.setValueAtTime(0.035, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + 0.06);
    }

    sfxWhoosh(t, dir) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 1.1;
      f.frequency.setValueAtTime(dir > 0 ? 400 : 1600, t);
      f.frequency.exponentialRampToValueAtTime(dir > 0 ? 1800 : 380, t + 0.22);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.055, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      src.connect(f); f.connect(g); g.connect(this.sfxGain);
      src.start(t, 0.2, 0.3);
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(dir > 0 ? 300 : 620, t);
      o.frequency.exponentialRampToValueAtTime(dir > 0 ? 620 : 300, t + 0.2);
      og.gain.setValueAtTime(0.025, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      o.connect(og); og.connect(this.sfxGain);
      o.start(t); o.stop(t + 0.26);
    }

    sfxBuy(t) {
      const ctx = this.ctx;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        const st = t + i * 0.065;
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.06, st + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.32);
        o.connect(g); g.connect(this.sfxGain); g.connect(this.reverbSend);
        o.start(st); o.stop(st + 0.35);
      });
    }

    sfxError(t) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(150, t);
      o.frequency.linearRampToValueAtTime(95, t + 0.14);
      g.gain.setValueAtTime(0.04, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 500;
      o.connect(f); f.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + 0.19);
    }

    sfxShield(t) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(320, t);
      o.frequency.exponentialRampToValueAtTime(1450, t + 0.42);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(g); g.connect(this.sfxGain); g.connect(this.reverbSend);
      o.start(t); o.stop(t + 0.58);
      [659.25, 987.77, 1318.5].forEach((f, i) => {
        const oo = ctx.createOscillator();
        const gg = ctx.createGain();
        oo.type = 'triangle';
        oo.frequency.value = f;
        const st = t + 0.12 + i * 0.07;
        gg.gain.setValueAtTime(0.0001, st);
        gg.gain.exponentialRampToValueAtTime(0.035, st + 0.01);
        gg.gain.exponentialRampToValueAtTime(0.0001, st + 0.5);
        oo.connect(gg); gg.connect(this.sfxGain); gg.connect(this.reverbSend);
        oo.start(st); oo.stop(st + 0.55);
      });
    }

    sfxBeep(t, freq, dur) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.035, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.sfxGain); g.connect(this.reverbSend);
      o.start(t); o.stop(t + dur + 0.02);
    }

    sfxGo(t) {
      const ctx = this.ctx;
      [523.25, 783.99, 1046.5].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        const st = t + i * 0.02;
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.06, st + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.55);
        o.connect(g); g.connect(this.sfxGain); g.connect(this.reverbSend);
        o.start(st); o.stop(st + 0.58);
      });
    }

    sfxRank(t) {
      const ctx = this.ctx;
      [659.25, 880, 1318.5].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        const st = t + i * 0.08;
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.05, st + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.4);
        o.connect(g); g.connect(this.sfxGain); g.connect(this.reverbSend);
        o.start(st); o.stop(st + 0.42);
      });
    }

    sfxCoin(t) {
      const ctx = this.ctx;
      [1046.5, 1318.5, 1568].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        const st = t + i * 0.045;
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.04, st + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.24);
        o.connect(g); g.connect(this.sfxGain); g.connect(this.reverbSend);
        o.start(st); o.stop(st + 0.26);
      });
    }

    sfxBoostStart(t) {
      this.noiseBurst(t, 0.24, 500, 0.05, 'bandpass');
    }

    tone(t, freq, dur, gain, type, opts) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      const target = opts && opts.to ? opts.to : freq;
      if (target !== freq) {
        if (opts && opts.linear) o.frequency.linearRampToValueAtTime(target, t + dur);
        else o.frequency.exponentialRampToValueAtTime(Math.max(20, target), t + dur);
      }
      if (opts && opts.detune) o.detune.value = opts.detune;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + (opts && opts.attack ? opts.attack : 0.008));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(this.sfxGain);
      if (!opts || opts.reverb !== false) g.connect(this.reverbSend);
      o.start(t);
      o.stop(t + dur + 0.03);
      return o;
    }

    sfxPowerup(t, opts) {
      const type = opts && opts.type ? opts.type : 'invincible';
      const ctx = this.ctx;
      const accent = type === 'magnet' ? 0 : type === 'jackpot' ? 2 : type === 'zoom' ? 4 : 7;
      const base = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77, 1046.5][accent];
      this.tone(t, base * .5, .34, .05, 'sine', { to: base, reverb: false });
      [0, 4, 7, 12].forEach((semi, i) => {
        const st = t + i * (type === 'jackpot' ? .045 : .055);
        this.tone(st, base * Math.pow(2, semi / 12), .38, .036, type === 'magnet' ? 'triangle' : 'sine');
      });
      if (type === 'invincible') {
        this.tone(t + .05, 1046.5, .8, .022, 'triangle', { to: 2093, attack: .16 });
      } else if (type === 'magnet') {
        const o = this.tone(t, 180, .55, .05, 'sawtooth', { to: 460, linear: true, reverb: false });
        o.detune.setValueAtTime(-20, t);
      } else if (type === 'jackpot') {
        [1318.5, 1567.98, 2093].forEach((f, i) => this.tone(t + .1 + i * .05, f, .3, .03, 'triangle'));
        this.noiseBurst(t + .04, .3, 4200, .018, 'highpass');
      } else if (type === 'zoom') {
        this.noiseBurst(t, .38, 2400, .025, 'bandpass');
        this.tone(t + .04, 1200, .45, .024, 'sine', { to: 340, attack: .12 });
      }
      this.tone(t, base * .25, .22, .045, 'sine', { to: base * .2, reverb: false });
    }

    sfxAchievement(t) {
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      notes.forEach((f, i) => {
        const st = t + i * .085;
        this.tone(st, f, .6, .045, i < 2 ? 'triangle' : 'sine');
        this.tone(st, f * .5, .5, .012, 'sine');
      });
      this.tone(t + .42, 1568, 1.1, .03, 'sine', { attack: .05 });
      this.noiseBurst(t + .38, .45, 6200, .018, 'highpass');
    }

    sfxCandy(t) {
      if (t - this.lastCandy < .045) return;
      if (t - this.lastCandy > .65) this.candyStreak = 0;
      this.lastCandy = t;
      const step = this.candyStreak++ % 6;
      const base = 740 + step * 62;
      this.tone(t, base, .14, .028, 'triangle', { to: base * 1.28, reverb: false });
      this.tone(t + .012, base * 2.02, .1, .012, 'sine', { reverb: false });
    }

    sfxCandyRare(t) {
      [880, 1108.73, 1318.5, 1760].forEach((f, i) => {
        const st = t + i * .04;
        this.tone(st, f, .42, .036, 'triangle');
      });
      this.tone(t, 220, .3, .035, 'sine', { to: 330, reverb: false });
      this.tone(t + .13, 2637, .7, .014, 'sine', { attack: .03 });
      this.noiseBurst(t + .02, .3, 7000, .014, 'highpass');
    }

    sfxEquip(t) {
      this.noiseBurst(t, .12, 3200, .022, 'highpass');
      this.tone(t + .01, 392, .16, .03, 'triangle', { to: 523.25, reverb: false });
      this.tone(t + .08, 783.99, .22, .022, 'sine');
    }

    sfxEvent(t) {
      this.noiseBurst(t, .7, 1400, .06, 'lowpass', true);
      this.tone(t, 155.56, 1.15, .05, 'sine', { to: 116.54, linear: true });
      this.tone(t + .04, 311.13, 1.05, .03, 'triangle', { to: 233.08, linear: true });
      this.tone(t + .16, 622.25, .8, .018, 'sine', { to: 466.16, linear: true });
      [1046.5, 1244.5, 1661.2].forEach((f, i) => {
        const st = t + .42 + i * .09;
        this.tone(st, f, .85, .022, 'sine', { attack: .012 });
      });
      this.tone(t + .72, 83.41, .5, .055, 'sine', { reverb: false });
    }
  }

  window.AudioEngine = AudioEngine;
  window.gameAudio = new AudioEngine();
})();

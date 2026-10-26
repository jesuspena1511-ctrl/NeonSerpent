/* ============================================================
   NEON SERPENT — Game loop, input, rules
   ============================================================ */
(function () {
  'use strict';
  const NS = window.NS;
  const {
    TAU, clamp, rand, randInt, pick, dist2, hypot, CFG, SKINS, SKIN_MAP,
    OUTFITS, ACCESSORIES, OUTFIT_MAP, ACCESSORY_MAP,
    BOT_NAMES, HALLOWEEN_BOT_NAMES, ACHIEVEMENTS, COSMETIC_TYPES,
    formatTime, Save
  } = NS;

  /* ============================================================
     INPUT
     ============================================================ */
  const MOVE_CODES = {
    ArrowUp: [0, -1], KeyW: [0, -1], KeyI: [0, -1], Numpad8: [0, -1],
    ArrowDown: [0, 1], KeyS: [0, 1], KeyK: [0, 1], Numpad2: [0, 1],
    ArrowLeft: [-1, 0], KeyA: [-1, 0], KeyJ: [-1, 0], Numpad4: [-1, 0],
    ArrowRight: [1, 0], KeyD: [1, 0], KeyL: [1, 0], Numpad6: [1, 0]
  };

  class Input {
    constructor(game) {
      this.game = game;
      this.mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      this.hasPointer = false;
      this.mouseDown = false;
      this.boostKey = false;
      this.boostTouch = false;
      this.boostTouchId = null;
      this.touchId = null;
      this.keys = new Set();
      this.keyVec = { x: 0, y: 0, active: false };
      this.stick = { x: 0, y: 0, active: false };
      this.dpad = { x: 0, y: 0, active: false };
      this.gamepad = { x: 0, y: 0, boost: false, connected: false };
      this.padStart = false;
      this.controlMode = game.save.settings.controls;
      this.canvas = NS.$('#game');
      this.bind();
    }

    resetAxes() {
      this.mouseDown = false;
      this.touchId = null;
      this.boostTouch = false;
      this.boostTouchId = null;
      this.stick.x = 0;
      this.stick.y = 0;
      this.stick.active = false;
      this.dpad.x = 0;
      this.dpad.y = 0;
      this.dpad.active = false;
      this.resetStick(NS.$('#stickKnob'));
      NS.$$('.dpad-btn').forEach((btn) => btn.classList.remove('active'));
    }

    syncControlMode(mode) {
      if (this.controlMode === mode) return;
      this.controlMode = mode;
      this.resetAxes();
    }

    gamepadActive() {
      const mode = this.game.save.settings.controls;
      return mode === 'auto' || mode === 'gamepad' || mode === 'hybrid';
    }

    get boosting() {
      return this.mouseDown || this.boostKey || this.boostTouch || (this.gamepadActive() && this.gamepad.boost);
    }

    pointerSteering() {
      const mode = this.game.save.settings.controls;
      return mode === 'auto' || mode === 'mouse' || mode === 'touch' || mode === 'hybrid';
    }

    movementVector() {
      if (this.keyVec.active) return this.keyVec;
      if (this.stick.active && (this.stick.x || this.stick.y)) return this.stick;
      if (this.dpad.active && (this.dpad.x || this.dpad.y)) return this.dpad;
      if (this.gamepadActive() && this.gamepad.connected && (this.gamepad.x || this.gamepad.y)) return this.gamepad;
      return null;
    }

    syncKeys() {
      let x = 0, y = 0;
      for (const code of this.keys) {
        const v = MOVE_CODES[code];
        if (v) { x += v[0]; y += v[1]; }
      }
      const len = Math.hypot(x, y) || 1;
      this.keyVec.x = x / len;
      this.keyVec.y = y / len;
      this.keyVec.active = !!(x || y);
    }

    setStickFromEvent(e, base, knob) {
      const r = base.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const max = r.width * .34;
      const len = Math.hypot(dx, dy);
      if (len > max) { dx = dx / len * max; dy = dy / len * max; }
      const nx = dx / max, ny = dy / max;
      this.stick.x = nx; this.stick.y = ny; this.stick.active = true;
      knob.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
    }

    resetStick(knob) {
      this.stick.x = 0; this.stick.y = 0; this.stick.active = false;
      if (knob) knob.style.transform = '';
    }

    pollGamepad() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : null;
      let pad = null;
      if (pads) for (const p of pads) if (p && p.connected) { pad = p; break; }
      if (!pad) {
        this.gamepad.connected = false;
        this.gamepad.x = 0; this.gamepad.y = 0; this.gamepad.boost = false;
        this.padStart = false;
        return;
      }
      let x = pad.axes[0] || 0, y = pad.axes[1] || 0;
      if (Math.abs(x) < .2) x = 0;
      if (Math.abs(y) < .2) y = 0;
      const b = pad.buttons;
      if (b[14] && b[14].pressed) x = -1;
      if (b[15] && b[15].pressed) x = 1;
      if (b[12] && b[12].pressed) y = -1;
      if (b[13] && b[13].pressed) y = 1;
      const len = Math.hypot(x, y) || 1;
      this.gamepad.x = x / len;
      this.gamepad.y = y / len;
      this.gamepad.connected = true;
      this.gamepad.boost = !!(b[0] && b[0].pressed) || !!(b[5] && b[5].pressed) || !!(b[7] && (b[7].pressed || b[7].value > .3));
      const start = !!(b[9] && b[9].pressed);
      if (start && !this.padStart) {
        if (this.game.state === 'playing') this.game.pause();
        else if (this.game.state === 'paused') this.game.resume();
      }
      this.padStart = start;
    }

    bind() {
      const canvas = this.canvas;
      const c = (e) => {
        const r = canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };

      window.addEventListener('pointermove', (e) => {
        if (!this.pointerSteering()) return;
        if (e.pointerType === 'touch' && e.pointerId !== this.touchId) return;
        const p = c(e);
        this.mouse.x = p.x;
        this.mouse.y = p.y;
        this.hasPointer = true;
      }, { passive: true });

      canvas.addEventListener('pointerdown', (e) => {
        window.gameAudio.init();
        if (!this.pointerSteering()) return;
        const p = c(e);
        this.mouse.x = p.x;
        this.mouse.y = p.y;
        this.hasPointer = true;
        if (e.pointerType === 'touch') {
          e.preventDefault();
          if (this.touchId === null) {
            this.touchId = e.pointerId;
            try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
          } else if (e.pointerId !== this.touchId) {
            this.boostTouch = true;
            this.boostTouchId = e.pointerId;
          }
        } else if (e.button === 0) {
          this.mouseDown = true;
        }
      }, { passive: false });

      const release = (e) => {
        if (e && e.pointerType === 'touch') {
          if (e.pointerId === this.boostTouchId) {
            this.boostTouchId = null;
            this.boostTouch = false;
          }
          if (e.pointerId === this.touchId) {
            this.touchId = null;
            if (this.boostTouchId === null) this.boostTouch = false;
          }
        } else {
          this.mouseDown = false;
        }
      };
      window.addEventListener('pointerup', release);
      window.addEventListener('pointercancel', release);
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());

      const boostBtn = NS.$('#mobileBoost');
      if (boostBtn) {
        boostBtn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          window.gameAudio.init();
          this.boostTouch = true;
          boostBtn.classList.add('active');
          try { boostBtn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        });
        const up = () => {
          this.boostTouch = false;
          boostBtn.classList.remove('active');
        };
        boostBtn.addEventListener('pointerup', up);
        boostBtn.addEventListener('pointercancel', up);
        boostBtn.addEventListener('pointerleave', (e) => { if (e.buttons === 0) up(); });
      }

      const stick = NS.$('#touchStick');
      if (stick) {
        const base = NS.$('.stick-base', stick);
        const knob = NS.$('#stickKnob');
        let stickPointer = null;
        const move = (e) => {
          if (e.pointerId !== stickPointer) return;
          e.preventDefault();
          this.setStickFromEvent(e, base, knob);
        };
        const end = (e) => {
          if (e.pointerId !== stickPointer) return;
          stickPointer = null;
          this.resetStick(knob);
        };
        base.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          window.gameAudio.init();
          stickPointer = e.pointerId;
          try { base.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
          this.setStickFromEvent(e, base, knob);
        });
        base.addEventListener('pointermove', move);
        base.addEventListener('pointerup', end);
        base.addEventListener('pointercancel', end);
        window.addEventListener('pointerup', end);
        window.addEventListener('pointercancel', end);
      }

      const dpad = NS.$('#dpad');
      if (dpad) {
        const active = new Map();
        const apply = () => {
          let x = 0, y = 0;
          for (const dir of active.values()) {
            if (dir === 'up') y -= 1;
            else if (dir === 'down') y += 1;
            else if (dir === 'left') x -= 1;
            else if (dir === 'right') x += 1;
          }
          const len = Math.hypot(x, y) || 1;
          this.dpad.x = x / len; this.dpad.y = y / len; this.dpad.active = !!(x || y);
        };
        NS.$$('.dpad-btn', dpad).forEach((btn) => {
          const down = (e) => {
            e.preventDefault();
            window.gameAudio.init();
            active.set(e.pointerId, btn.dataset.dir);
            btn.classList.add('active');
            try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            apply();
          };
          const up = (e) => {
            if (!active.has(e.pointerId)) return;
            active.delete(e.pointerId);
            btn.classList.remove('active');
            apply();
          };
          btn.addEventListener('pointerdown', down);
          btn.addEventListener('pointerup', up);
          btn.addEventListener('pointercancel', up);
          btn.addEventListener('pointerleave', (e) => { if (e.buttons === 0) up(e); });
        });
      }

      window.addEventListener('keydown', (e) => {
        const el = document.activeElement;
        const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
        if (typing) {
          if (e.code === 'Enter' && el.id === 'playerName') {
            el.blur();
            this.game.startRun();
          }
          return;
        }
        const panelOpen = !NS.$('#panelLayer').classList.contains('hidden');
        if (panelOpen && e.code !== 'Escape') return;
        if (MOVE_CODES[e.code]) {
          e.preventDefault();
          this.keys.add(e.code);
          this.syncKeys();
          return;
        }
        if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
          if (this.game.state === 'playing' || this.game.state === 'paused') {
            e.preventDefault();
            this.boostKey = true;
          }
        } else if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          if (panelOpen) this.game.ui.closePanels();
          else if (this.game.state === 'playing' || this.game.state === 'paused') this.game.togglePause();
        } else if (e.code === 'KeyM') {
          this.game.ui.toggleMute();
        } else if (e.code === 'KeyF') {
          this.game.ui.toggleFullscreen();
        } else if (e.code === 'KeyH') {
          if (this.game.state === 'menu') this.game.ui.openPanel('help');
        } else if (e.code === 'KeyR') {
          if (this.game.state === 'gameover') this.game.retry();
        } else if (e.code === 'Enter') {
          if (this.game.state === 'menu' && !panelOpen) this.game.startRun();
          else if (this.game.state === 'gameover') this.game.retry();
        }
      });
      window.addEventListener('keyup', (e) => {
        if (MOVE_CODES[e.code]) {
          this.keys.delete(e.code);
          this.syncKeys();
        }
        if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.boostKey = false;
      });
      const clear = () => {
        this.mouseDown = false;
        this.boostKey = false;
        this.boostTouch = false;
        this.boostTouchId = null;
        this.touchId = null;
        this.keys.clear();
        this.syncKeys();
        this.resetStick(NS.$('#stickKnob'));
        NS.$('#mobileBoost')?.classList.remove('active');
        if (this.game.state === 'playing' && this.game.save.settings.pauseOnBlur) this.game.pause();
      };
      window.addEventListener('blur', clear);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.game.state === 'playing' && this.game.save.settings.pauseOnBlur) this.game.pause();
      });
    }
  }

  /* ============================================================
     GAME
     ============================================================ */
  class Game {
    constructor() {
      this.save = Save.load();
      NS.setTheme(this.save.settings.theme);
      this.isCoarse = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
      this.autoQualityStep = 0;
      this.lowFpsTime = 0;
      this.quality = 'high';
      this.resolveQuality();
      this.particlesEnabled = this.save.settings.particles;
      this.mode = this.save.mode;
      this.difficulty = this.save.difficulty;
      this.variant = 'classic';
      this.menuMode = true;
      this.online = null;
      this.onlineDeathToken = null;
      this.botSessions = { classic: null, halloween: null };
      this.pendingSessionInfo = null;
      document.body.classList.toggle('touch-ui', this.isCoarse);
      this.state = 'menu';
      this.time = 0;
      this.realTime = 0;
      this.runId = 0;
      this.snakes = [];
      this.player = null;
      this.topList = [];
      this.hudTimer = 0;
      this.rankTimer = 0;
      this.botRespawnTimer = 0;
      this.wasBoosting = false;
      this.flash = 0;
      this.deadTimer = 0;
      this.gameOverShown = false;
      this.deathResults = null;
      this.killStreak = 0;
      this.lastKillTime = -99;
      this.lastRank = 99;
      this.lastRankToast = -99;
      this.lastFrame = performance.now();
      this.fps = 60;
      this.fpsAccum = 0;
      this.fpsFrames = 0;

      this.renderer = new NS.Renderer(this);
      this.camera = new NS.Camera(this);
      this.particles = new NS.ParticleSystem(this);
      this.foods = new NS.FoodManager(this);
      this.powerups = new NS.PowerupManager(this);
      this.input = new Input(this);
      this.ui = new NS.UI(this);
      if (NS.Online) NS.Online.init(this);

      this.applySettings();
      window.gameAudio.setMode('menu');
      this.resetWorld(true);
      this.ui.init();
      this.checkAchievements(true);
      this.lastFrame = performance.now();
      requestAnimationFrame(this.loop);
    }

    resolveQuality() {
      const s = this.save.settings;
      let q = s.quality;
      if (q === 'auto') {
        const cores = navigator.hardwareConcurrency || 4;
        q = this.isCoarse ? (cores >= 8 ? 'medium' : 'low') : (cores >= 6 ? 'high' : 'medium');
        if (s.autoQuality) {
          const order = ['low', 'medium', 'high'];
          const idx = Math.max(0, order.indexOf(q) - this.autoQualityStep);
          q = order[idx];
        }
      }
      this.quality = q;
      return q;
    }

    applySettings() {
      const s = this.save.settings;
      const eventRun = this.variant === 'halloween' && !this.menuMode;
      const theme = NS.setTheme(eventRun ? 'halloween' : s.theme);
      this.resolveQuality();
      this.particlesEnabled = s.particles;
      this.mode = this.save.mode;
      this.difficulty = this.save.difficulty;
      window.gameAudio.setTheme?.(theme.id, theme.audio);
      window.gameAudio.setVolumes(s.music, s.sfx);
      window.gameAudio.setMuted(s.muted);
      if (this.renderer) {
        if (this.renderer.setTheme) this.renderer.setTheme(theme.id);
        else this.renderer.resize();
      }
      const body = document.body;
      const modes = ['auto', 'mouse', 'touch', 'keys', 'joystick', 'dpad', 'gamepad', 'hybrid'];
      for (const m of modes) body.classList.toggle('control-' + m, s.controls === m);
      if (this.input) this.input.syncControlMode(s.controls);
      const cb = ['none', 'deuter', 'prot', 'trit'];
      for (const c of cb) body.classList.toggle('colorblind-' + c, s.colorblind === c);
      body.classList.toggle('muted', s.muted);
      body.classList.toggle('motion-reduced', s.motion === 'reduced');
      body.classList.toggle('motion-soft', s.motion === 'soft');
      body.classList.toggle('captions-off', !s.captions);
      body.classList.toggle('high-contrast', s.highContrast);
      body.classList.toggle('large-ui', s.largeUI);
      body.classList.toggle('minimap-off', s.minimap === false);
      body.classList.toggle('name-tags-off', s.nameTags === false);
      body.classList.toggle('flashes-off', s.flashes === false);
      body.classList.toggle('power-alerts-off', s.powerAlerts === false);
      body.classList.toggle('event-mode', eventRun);
      const qClasses = ['low', 'medium', 'high'];
      for (const q of qClasses) body.classList.toggle('quality-' + q, this.quality === q);
      const fps = NS.$('#fpsTag');
      if (fps) fps.classList.toggle('hidden', !s.fpsMeter);
      const meta = NS.$('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', theme.canvas.bg0);
      if (this.ui && this.ui.el && this.ui.el.setMusic) {
        this.ui.syncSettings();
        this.ui.applyModeUI();
      }
    }

    difficultyProfile() {
      return NS.DIFFICULTIES[this.difficulty] || NS.DIFFICULTIES.normal;
    }

    modeLabel() {
      const online = this.mode === 'online';
      if (this.online) {
        const region = this.online.regionLabel || 'ONLINE';
        const room = this.online.room && this.online.room.name ? this.online.room.name : 'ARENA';
        return (this.variant === 'halloween' ? 'HALLOWEEN · ' : 'ONLINE · ') + region + ' · ' + room;
      }
      if (this.variant === 'halloween') {
        return 'HALLOWEEN · ' + (online ? 'MULTIJUGADOR' : 'BOTS · ' + this.difficultyProfile().name);
      }
      if (online) return 'MULTIJUGADOR · BUSCANDO SERVIDOR';
      return 'BOTS · ' + this.difficultyProfile().name;
    }

    monitorQuality(raw) {
      if (this.state !== 'playing' || this.save.settings.quality !== 'auto' || !this.save.settings.autoQuality) return;
      if (this.fps < 44) this.lowFpsTime += raw;
      else this.lowFpsTime = Math.max(0, this.lowFpsTime - raw * .6);
      if (this.lowFpsTime > 3 && this.quality !== 'low') {
        this.autoQualityStep++;
        this.lowFpsTime = 0;
        this.resolveQuality();
        if (this.renderer) this.renderer.resize();
        const qClasses = ['low', 'medium', 'high'];
        for (const q of qClasses) document.body.classList.toggle('quality-' + q, this.quality === q);
        if (!this.autoQualityToast) {
          this.autoQualityToast = true;
          this.ui.toast('CALIDAD AJUSTADA', 'Se redujo el detalle para mantener la fluidez.', 'lime', 'i-speed');
        }
      }
    }

    upgradeLevel(id) {
      return this.save.upgrades[id] || 0;
    }

    shieldCharges() {
      const l = this.upgradeLevel('shield');
      if (l <= 0) return 0;
      if (l <= 2) return 1;
      if (l <= 4) return 2;
      return 3;
    }

    /* ---------------- World ---------------- */
    resetWorld(menuMode) {
      this.menuMode = !!menuMode;
      if (menuMode) this.variant = 'classic';
      this.snakes.length = 0;
      this.player = null;
      this.topList = [];
      this.particles.reset();
      this.foods.reset(menuMode);
      this.flash = 0;
      this.deadTimer = 0;
      this.gameOverShown = false;
      this.deathResults = null;
      this.wasBoosting = false;
      this.killStreak = 0;
      this.lastKillTime = -99;
      this.lastRank = 99;
      this.lastRankToast = -99;
      this.botRespawnTimer = 0;
      this.time = 0;
      this.camera.spectate = null;
      this.camera.spectateTimer = 0;
      window.gameAudio.setBoost(false);
      this.camera.shakeValue = 0;
      this.mode = this.save.mode;
      this.difficulty = this.save.difficulty;
      const diff = this.difficultyProfile();
      const count = menuMode ? 12 : (this.mode === 'online' ? 0 : diff.bots);
      this.pendingSessionInfo = null;
      if (menuMode) {
        for (let i = 0; i < count; i++) this.spawnBot(true, true);
      } else if (this.mode === 'bots') {
        const snapshot = this.botSessions[this.variant];
        if (snapshot && snapshot.bots && snapshot.bots.length) {
          this.restoreBotArena(snapshot);
        } else {
          for (let i = 0; i < count; i++) this.spawnBot(true, false);
        }
      }
      this.powerups.reset(menuMode);
      if (menuMode) {
        this.camera.x = 0;
        this.camera.y = 0;
        this.camera.zoom = .58;
        this.camera.targetZoom = .74;
      }
      this.updateLeaderboard();
    }

    captureBotArena() {
      if (this.mode !== 'bots' || this.menuMode) return null;
      const bots = [];
      for (const s of this.snakes) {
        if (!s.alive || s.isPlayer) continue;
        bots.push({
          name: s.name, skinId: s.skinId, mass: s.mass, kills: s.kills,
          outfit: s.outfit, accessory: s.accessory
        });
      }
      if (!bots.length) return null;
      this.botSessions[this.variant] = { savedAt: Date.now(), bots };
      return this.botSessions[this.variant];
    }

    restoreBotArena(snapshot) {
      const away = clamp((Date.now() - snapshot.savedAt) / 1000, 0, 2400);
      const growth = Math.min(520, away * .72);
      const target = this.difficultyProfile().bots;
      for (const data of snapshot.bots) {
        if (this.snakes.length >= target) break;
        const extraMass = growth * rand(.78, 1.22);
        this.spawnBot(false, false, {
          name: data.name,
          skinId: data.skinId,
          outfit: data.outfit,
          accessory: data.accessory,
          mass: Math.min(2400, data.mass + extraMass),
          kills: data.kills || 0
        });
      }
      let guard = 0;
      while (this.snakes.length < target && guard++ < target) this.spawnBot(false, false);
      this.pendingSessionInfo = {
        away,
        bots: this.snakes.filter((s) => !s.isPlayer).length,
        growth: Math.round(growth)
      };
      return this.pendingSessionInfo;
    }

    findSpawnPoint(clearance, ignore) {
      const R = CFG.worldRadius;
      let best = { x: 0, y: 0 };
      let bestScore = -1;
      for (let tries = 0; tries < 30; tries++) {
        const a = rand(0, TAU);
        const rr = Math.sqrt(Math.random()) * (R - 400);
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        let minD = 1e12;
        for (const s of this.snakes) {
          if (!s.alive || s === ignore) continue;
          const d = dist2(x, y, s.x, s.y);
          if (d < minD) minD = d;
          for (let i = 0; i < s.bodyPoints.length; i += 7) {
            const p = s.bodyPoints[i];
            const dd = dist2(x, y, p.x, p.y);
            if (dd < minD) minD = dd;
          }
        }
        if (minD > bestScore) { bestScore = minD; best = { x, y }; }
        if (minD > clearance * clearance) return { x, y };
      }
      return best;
    }

    spawnBot(initial, menuMode, extra) {
      const used = new Set(this.snakes.map((s) => s.name));
      const pool = this.variant === 'halloween' ? HALLOWEEN_BOT_NAMES : BOT_NAMES;
      let name = extra && extra.name ? extra.name : pick(pool);
      let guard = 0;
      while (used.has(name) && guard++ < 30) {
        name = extra && extra.name ? name + ' ' + randInt(2, 9) : pick(pool);
      }
      if (used.has(name)) name = name + ' ' + randInt(2, 9);
      const p = this.findSpawnPoint(450);
      const skin = extra && SKIN_MAP[extra.skinId] ? SKIN_MAP[extra.skinId] : pick(SKINS);
      let mass = initial ? rand(CFG.startMass, CFG.startMass + 16) : rand(CFG.startMass, CFG.startMass + 22);
      if (menuMode) mass = rand(40, 240);
      if (extra && Number.isFinite(extra.mass)) mass = extra.mass;
      const outfitPool = this.variant === 'halloween' ? OUTFITS : OUTFITS.filter((c) => !c.event);
      const accessoryPool = this.variant === 'halloween' ? ACCESSORIES : ACCESSORIES.filter((c) => !c.event);
      const outfit = extra && OUTFIT_MAP[extra.outfit]
        ? extra.outfit
        : (Math.random() < .58 ? pick(outfitPool).id : 'none');
      const accessory = extra && ACCESSORY_MAP[extra.accessory]
        ? extra.accessory
        : (Math.random() < .4 ? pick(accessoryPool).id : 'none');
      const diff = this.difficultyProfile();
      const bot = new NS.Snake(this, {
        x: p.x, y: p.y, angle: rand(0, TAU), mass,
        name, skin, isPlayer: false, invuln: 1.2,
        outfit, accessory,
        speedMod: (menuMode ? 1 : diff.speed) * rand(.94, 1.04)
      });
      if (extra && extra.kills) bot.kills = Math.max(0, Math.floor(extra.kills));
      if (bot.brain && !menuMode) {
        bot.brain.skill = rand(diff.skill[0], diff.skill[1]);
        bot.brain.aggression = rand(diff.aggression[0], diff.aggression[1]);
        bot.brain.greed = rand(diff.greed[0], diff.greed[1]);
      }
      this.snakes.push(bot);
      return bot;
    }

    spawnPlayer() {
      const p = this.findSpawnPoint(700);
      const startMass = CFG.startMass + this.upgradeLevel('seed') * 8;
      const skin = SKIN_MAP[this.save.skin] || SKINS[0];
      const name = (this.save.name || 'Jugador#1').slice(0, 14);
      const player = new NS.Snake(this, {
        x: p.x, y: p.y,
        angle: Math.atan2(-p.y, -p.x) + rand(-.4, .4),
        mass: startMass,
        name, skin, isPlayer: true,
        outfit: this.save.outfit || 'none',
        accessory: this.save.accessory || 'none',
        invuln: 3.4,
        shieldCharges: this.shieldCharges()
      });
      this.player = player;
      this.snakes.push(player);
      this.camera.x = player.x;
      this.camera.y = player.y;
      this.camera.zoom = 1.02;
      this.camera.targetZoom = 1.02;
      this.camera.shakeValue = 0;
      return player;
    }

    startRun(options) {
      if (this.state === 'playing') return;
      const earlyMode = (options && options.mode) || this.save.mode;
      if (earlyMode === 'online') {
        if (this.online) {
          if (this.state === 'gameover') this.online.respawn();
          return;
        }
        if (NS.Online) NS.Online.openBrowser((options && options.variant) || 'classic');
        return;
      }
      const opts = options || {};
      const variant = opts.variant || (this.state === 'gameover' ? this.variant : 'classic');
      const mode = opts.mode || this.save.mode;
      this.variant = variant === 'halloween' ? 'halloween' : 'classic';
      this.mode = mode === 'online' ? 'online' : 'bots';
      this.save.mode = this.mode;
      this.menuMode = false;
      Save.write();
      window.gameAudio.init();
      this.ui.closePanels();
      this.ui.hideMenu();
      this.ui.hideGameOver();
      this.ui.hidePause();
      this.applySettings();
      this.runId++;
      this.resetWorld(false);
      this.spawnPlayer();
      this.state = 'playing';
      this.lastFrame = performance.now();
      this.hudTimer = 0;
      this.ui.onRunStart();
      window.gameAudio.setMode('game');
      window.gameAudio.setBoost(false);
      this.updateLeaderboard();
      this.ui.updateHUD(this, true);
      if (this.pendingSessionInfo) {
        const info = this.pendingSessionInfo;
        const awayText = info.away < 60
          ? 'Unos segundos'
          : info.away < 3600
            ? Math.round(info.away / 60) + ' min'
            : Math.round(info.away / 3600) + ' h';
        this.ui.toast(
          'ARENA EN CURSO',
          'Los bots han seguido creciendo durante ' + awayText + '. Ventaja media: +' + info.growth + ' de masa.',
          this.variant === 'halloween' ? 'pink' : 'cyan',
          this.variant === 'halloween' ? 'i-pumpkin' : 'i-bot'
        );
      }
    }

    beginOnlineSession(session) {
      this.online = session;
      this.mode = 'online';
      this.variant = session.room && session.room.variant === 'halloween' ? 'halloween' : 'classic';
      this.save.mode = 'online';
      this.menuMode = false;
      this.runId++;
      this.deathResults = null;
      this.gameOverShown = false;
      this.onlineDeathToken = null;
      this.lastRank = 99;
      this.lastRankToast = -99;
      this.killStreak = 0;
      this.lastKillTime = -99;
      this.applySettings();
      this.ui.closePanels();
      this.ui.hideMenu();
      this.ui.hideGameOver();
      this.ui.hidePause();
      this.resetWorld(false);
      this.snakes = [];
      this.player = null;
      this.topList = [];
      this.foods.list = [];
      this.powerups.list = [];
      this.state = 'playing';
      this.lastFrame = performance.now();
      this.hudTimer = 0;
      this.wasBoosting = false;
      session.start();
      this.state = 'playing';
      this.ui.onRunStart();
      window.gameAudio.init();
      window.gameAudio.setMode('game');
      window.gameAudio.setBoost(false);
      this.ui.toast(
        'CONECTADO AL SERVIDOR',
        'Región: ' + (session.regionLabel || 'Online') + ' · Sala: ' + (session.room.name || 'Arena') + '.',
        this.variant === 'halloween' ? 'pink' : 'cyan',
        'i-users'
      );
      this.ui.updateHUD(this, true);
    }

    retry() {
      if (this.online) {
        if (this.state === 'gameover') this.online.respawn();
        return;
      }
      this.startRun();
    }

    onlineDeath(res, session) {
      if (!this.online) return;
      if (res && res.id && this.onlineDeathToken === res.id) return;
      this.onlineDeathToken = res ? res.id : 'unknown';
      const data = res || {};
      const event = (data.variant || this.variant) === 'halloween';
      const score = Number.isFinite(data.score) ? data.score : 0;
      const oldBest = this.save.best;
      const newBest = score > oldBest;
      this.save.best = Math.max(oldBest, score);
      const reward = Math.max(0, Number.isFinite(data.reward)
        ? data.reward
        : (event ? (data.candies || 0) : (data.coins || 0)));
      if (event) {
        this.save.candy = Math.min(9999999, this.save.candy + reward);
        this.save.stats.candyEarned += reward;
        this.save.stats.halloweenRuns++;
        this.save.stats.halloweenKills += data.kills || 0;
      } else {
        this.save.coins = Math.min(9999999, this.save.coins + reward);
      }
      this.save.stats.runs++;
      this.save.stats.kills += data.kills || 0;
      this.save.stats.time += data.time || 0;
      this.save.stats.orbs += data.orbs || 0;
      this.save.stats.powerups += data.powerups || 0;
      this.save.stats.bestCombo = Math.max(this.save.stats.bestCombo || 0, data.comboBest || 0);
      this.save.stats.bestMass = Math.max(this.save.stats.bestMass || 0, data.mass || 0);
      if (data.rank === 1) this.save.stats.wins++;
      const unlocked = this.checkAchievements(false);
      Save.write();
      const results = Object.assign({}, data, {
        best: this.save.best,
        newBest,
        oldBest,
        totalCoins: this.save.coins,
        totalCandy: this.save.candy,
        currency: event ? 'candy' : 'coins',
        reward,
        totalCurrency: event ? this.save.candy : this.save.coins,
        variant: event ? 'halloween' : 'classic',
        comboBest: data.comboBest || 0,
        unlocked: unlocked.length,
        online: true,
        room: this.online && this.online.room ? this.online.room.name : 'Online'
      });
      this.deathResults = results;
      this.state = 'gameover';
      this.flash = .8;
      this.wasBoosting = false;
      this.ui.hideHud();
      this.ui.hidePause();
      this.ui.showGameOver(results);
      window.gameAudio.setMode('menu');
      window.gameAudio.setBoost(false);
      window.gameAudio.play('death');
      this.ui.updateMenu();
    }

    onlineRespawned(msg, session) {
      if (!this.online) return;
      this.state = 'playing';
      this.deathResults = null;
      this.gameOverShown = false;
      this.onlineDeathToken = null;
      this.wasBoosting = false;
      this.flash = 0;
      this.ui.hideGameOver();
      this.ui.hidePause();
      this.ui.onRunStart();
      window.gameAudio.setMode('game');
      window.gameAudio.setBoost(false);
      this.lastFrame = performance.now();
      this.hudTimer = 0;
      this.ui.toast('DE VUELTA EN LA ARENA', 'Has reaparecido en ' + (this.online.regionLabel || 'el servidor') + '.', 'lime', 'i-retry');
      this.ui.updateHUD(this, true);
    }

    onlineDisconnected(message) {
      if (!this.online) return;
      this.online = null;
      if (this.state === 'menu') return;
      this.backToMenu();
      this.ui.toast('CONEXIÓN PERDIDA', message || 'El servidor cerró la conexión.', 'pink', 'i-users');
    }

    backToMenu(openPanel) {
      if (this.online) {
        const session = this.online;
        this.online = null;
        session.leave();
      }
      if (!this.menuMode && this.mode === 'bots' && (this.state === 'playing' || this.state === 'paused')) {
        this.captureBotArena();
      }
      this.variant = 'classic';
      this.menuMode = true;
      this.runId++;
      this.state = 'menu';
      this.ui.closePanels();
      this.ui.hideGameOver();
      this.ui.hidePause();
      this.ui.hideHud();
      this.applySettings();
      this.resetWorld(true);
      this.ui.showMenu(openPanel);
      window.gameAudio.setMode('menu');
      window.gameAudio.setBoost(false);
      this.wasBoosting = false;
      this.ui.updateMenu();
    }

    pause() {
      if (this.state !== 'playing') return;
      this.state = 'paused';
      this.input.mouseDown = false;
      this.input.boostKey = false;
      window.gameAudio.setBoost(false);
      window.gameAudio.setMode('menu');
      this.ui.showPause();
    }

    resume() {
      if (this.state !== 'paused') return;
      this.state = 'playing';
      this.lastFrame = performance.now();
      this.ui.hidePause();
      window.gameAudio.setMode('game');
    }

    togglePause() {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
    }

    quitToMenu() {
      if (this.state === 'playing' || this.state === 'paused') {
        this.backToMenu();
      }
    }

    /* ---------------- Update loop ---------------- */
    loop = (now) => {
      requestAnimationFrame(this.loop);
      const raw = (now - this.lastFrame) / 1000;
      this.lastFrame = now;
      const dt = clamp(raw, 0, .05);
      this.realTime += dt;
      this.input.pollGamepad();
      this.fpsAccum += raw; this.fpsFrames++;
      if (this.fpsAccum > 1) {
        const span = this.fpsAccum;
        this.fps = Math.round(this.fpsFrames / span);
        this.fpsAccum = 0; this.fpsFrames = 0;
        const fpsTag = NS.$('#fpsTag');
        if (fpsTag && this.save.settings.fpsMeter) {
          fpsTag.textContent = this.fps + ' FPS';
          fpsTag.classList.toggle('warn', this.fps < 50 && this.fps >= 38);
          fpsTag.classList.toggle('bad', this.fps < 38);
        }
        this.monitorQuality(span);
      }

      if (this.state === 'menu') {
        this.updateSimulation(dt, true);
        this.camera.update(dt, 'menu');
        this.ui.tickMenuLive();
      } else if (this.state === 'playing') {
        if (this.online) this.online.update(dt);
        else this.updatePlaying(dt);
      } else if (this.state === 'dead') {
        this.updateDead(dt);
      } else if (this.state === 'gameover') {
        this.particles.update(dt * .18);
        this.flash = Math.max(0, this.flash - dt * 1.6);
        this.camera.shakeValue *= Math.exp(-4 * dt);
      }

      this.renderer.render(this.realTime);
      if (this.state === 'playing' || this.state === 'dead') {
        this.renderer.drawMinimap(this.realTime);
      }
      this.ui.drawPreviews(this.realTime);
    };

    updatePlaying(dt) {
      const p = this.player;
      if (p && p.alive) {
        const aim = this.getAimAngle(p);
        const control = { targetAngle: aim, boost: this.input.boosting, turnScale: this.save.settings.sensitivity / 100 };
        p.update(dt, control);
        if (p.boosting && !this.wasBoosting) {
          window.gameAudio.play('booststart');
          this.camera.shake(1.4);
        }
        if (p.boosting !== this.wasBoosting) {
          window.gameAudio.setBoost(p.boosting);
          this.wasBoosting = p.boosting;
        }
        if (p.boosting && Math.random() < .55) {
          this.particles.emitDirectional(
            p.x - Math.cos(p.angle) * p.radius * 1.3,
            p.y - Math.sin(p.angle) * p.radius * 1.3,
            p.angle + Math.PI, p.skin.colors.glow, 1, 90, p.radius * .25, .42
          );
        }
      } else if (this.wasBoosting) {
        window.gameAudio.setBoost(false);
        this.wasBoosting = false;
      }

      for (let i = 0; i < this.snakes.length; i++) {
        const s = this.snakes[i];
        if (s.isPlayer || !s.alive) continue;
        s.brain.update(dt);
      }

      this.updateSimulation(dt, false, true);
      this.camera.update(dt, 'game');
      this.flash = Math.max(0, this.flash - dt * 2.6);

      this.hudTimer -= dt;
      if (this.hudTimer <= 0) {
        this.hudTimer = .09;
        this.ui.updateHUD(this, false);
      }
    }

    updateSimulation(dt, menuMode, skipInput) {
      this.time += dt;
      for (let i = 0; i < this.snakes.length; i++) {
        const s = this.snakes[i];
        if (s.isPlayer) continue;
        if (s.alive && !skipInput) s.brain.update(dt);
      }
      this.foods.handleSnakes(this.snakes, dt);
      this.powerups.update(dt);
      if (this.player && this.player.alive) this.powerups.handle(this.player);
      this.particles.update(dt);
      this.handleCollisions(menuMode);
      this.respawnBots(dt, menuMode);
      this.updateLeaderboard();
      if (menuMode) {
        this.foods.targetNormal = Math.floor(CFG.normalFood * .62);
        this.foods.targetRare = Math.floor(CFG.rareFood * .6);
      } else {
        const diff = this.difficultyProfile();
        const modeScale = this.mode === 'online' ? .66 : 1;
        this.foods.targetNormal = Math.floor(CFG.normalFood * diff.food * modeScale);
        this.foods.targetRare = Math.floor(CFG.rareFood * (this.mode === 'online' ? .8 : 1));
      }
    }

    updateDead(dt) {
      this.time += dt * .35;
      this.particles.update(dt * .6);
      this.flash = Math.max(0, this.flash - dt * 1.8);
      this.camera.shakeValue *= Math.exp(-5 * dt);
      this.camera.targetZoom *= .999;
      this.camera.zoom = NS.smoothTo(this.camera.zoom, Math.max(.45, this.camera.zoom * .94), 1.5, dt);
      this.camera.x = NS.smoothTo(this.camera.x, this.camera.targetX, 1.5, dt);
      this.camera.y = NS.smoothTo(this.camera.y, this.camera.targetY, 1.5, dt);
      this.deadTimer -= dt;
      if (this.deadTimer <= 0 && !this.gameOverShown) {
        this.gameOverShown = true;
        this.finishGameOver();
      }
    }

    getAimAngle(player) {
      const input = this.input;
      const vec = input.movementVector();
      if (vec) return Math.atan2(vec.y, vec.x);
      if (!input.pointerSteering() || !input.hasPointer) return player.angle;
      const hs = this.camera.worldToScreen(player.x, player.y, this.renderer.w, this.renderer.h);
      const dx = input.mouse.x - hs.x;
      const dy = input.mouse.y - hs.y;
      if (dx * dx + dy * dy < 18 * 18) return player.angle;
      return Math.atan2(dy, dx);
    }

    respawnBots(dt, menuMode) {
      const target = menuMode ? 12 : (this.mode === 'online' ? 0 : this.difficultyProfile().bots);
      if (target <= 0) return;
      let alive = 0;
      for (const s of this.snakes) if (s.alive && !s.isPlayer) alive++;
      if (alive >= target) { this.botRespawnTimer = 0; return; }
      this.botRespawnTimer -= dt;
      if (this.botRespawnTimer <= 0) {
        this.spawnBot(false, menuMode);
        this.botRespawnTimer = menuMode ? 1.5 : 2.2;
      }
    }

    /* ---------------- Collisions ---------------- */
    handleCollisions(menuMode) {
      const snakes = this.snakes.slice();
      const R = CFG.worldRadius;
      const cell = CFG.gridCell;

      // Muro de contención
      for (const s of snakes) {
        if (!s.alive) continue;
        const d = hypot(s.x, s.y);
        if (d > R - 3) this.killSnake(s, 'wall', null);
      }

      // Rejilla espacial de cuerpos
      const grid = new Map();
      for (const s of snakes) {
        if (!s.alive) continue;
        const pts = s.bodyPoints;
        for (let i = 4; i < pts.length; i += 2) {
          const p = pts[i];
          const cx = Math.floor(p.x / cell) + 64;
          const cy = Math.floor(p.y / cell) + 64;
          const key = cx * 512 + cy;
          let arr = grid.get(key);
          if (!arr) { arr = []; grid.set(key, arr); }
          arr.push(p.x, p.y, s);
        }
      }

      // Choques frontales
      for (let i = 0; i < snakes.length; i++) {
        const a = snakes[i];
        if (!a.alive || a.invuln > 0) continue;
        for (let j = i + 1; j < snakes.length; j++) {
          const b = snakes[j];
          if (!b.alive || b.invuln > 0) continue;
          const rr = (a.radius + b.radius) * .74;
          if (dist2(a.x, a.y, b.x, b.y) < rr * rr) {
            this.killSnake(a, 'head', b);
            if (b.alive) this.killSnake(b, 'head', a);
          }
        }
      }

      // Cabeza contra cuerpo ajeno
      for (const s of snakes) {
        if (!s.alive || s.invuln > 0) continue;
        const prevX = Number.isFinite(s.prevX) ? s.prevX : s.x;
        const prevY = Number.isFinite(s.prevY) ? s.prevY : s.y;
        const checkCells = new Set();
        const addCells = (x, y) => {
          const cx = Math.floor(x / cell) + 64;
          const cy = Math.floor(y / cell) + 64;
          for (let ox = -1; ox <= 1; ox++) {
            for (let oy = -1; oy <= 1; oy++) checkCells.add((cx + ox) * 512 + (cy + oy));
          }
        };
        addCells(s.x, s.y);
        addCells(prevX, prevY);
        const hitFactor = s.isPlayer ? .8 : .86;
        let dead = false;
        for (const key of checkCells) {
          const arr = grid.get(key);
          if (!arr) continue;
          for (let k = 0; k < arr.length; k += 3) {
            const ox = arr[k], oy = arr[k + 1], owner = arr[k + 2];
            if (!owner.alive || owner === s) continue;
            const rr = s.radius * hitFactor + owner.radius * .84;
            if (pointSegDist2(ox, oy, prevX, prevY, s.x, s.y) < rr * rr) {
              this.killSnake(s, 'body', owner);
              dead = true;
              break;
            }
          }
          if (dead) break;
        }
      }
    }

    /* ---------------- Death & effects ---------------- */
    killSnake(snake, cause, killer) {
      if (!snake.alive || snake.invuln > 0) return false;
      if (snake.isPlayer && this.time < snake.powerInvincibleUntil) return false;
      const R = CFG.worldRadius;

      // Escudo
      if (snake.shieldCharges > 0) {
        snake.shieldCharges--;
        const p = this.findSpawnPoint(500, snake);
        const angle = Math.atan2(-p.y, -p.x) + rand(-.4, .4);
        const oldX = snake.x, oldY = snake.y;
        snake.teleport(p.x, p.y, angle);
        snake.mass = Math.max(CFG.startMass, snake.mass * .9);
        snake.peakMass = Math.max(snake.mass, snake.peakMass * .9);
        snake.computeDerived();
        snake.updateBody();
        this.particles.emitBurst(oldX, oldY, '#ffd76a', 30, 280, 5, .9);
        this.particles.ring(oldX, oldY, '#ffd76a', snake.radius * 3, .7);
        this.particles.emitBurst(p.x, p.y, '#22f5e2', 26, 220, 4, .7);
        this.camera.shake(10);
        if (snake.isPlayer) {
          window.gameAudio.play('shield');
          this.ui.toast('ESCUDO ACTIVADO', 'Has sobrevivido al impacto. Quedan ' + snake.shieldCharges + ' cargas.', 'gold', 'i-shield');
        }
        return true;
      }

      snake.alive = false;
      snake.boosting = false;
      this.foods.spawnDeath(snake);
      this.particles.emitBurst(snake.x, snake.y, snake.skin.colors.glow, 46, 320, 5.5, 1.1);
      this.particles.emitBurst(snake.x, snake.y, snake.skin.colors.light, 24, 180, 3.2, .8);
      this.particles.ring(snake.x, snake.y, snake.skin.colors.glow, snake.radius * 2.4, .55);
      this.camera.shake(snake.isPlayer ? 20 : 3.2);

      if (snake.isPlayer) {
        this.playerMassAtDeath = snake.mass;
        this.deathResults = this.buildResults(cause, killer, snake);
        this.state = 'dead';
        this.deadTimer = 1.6;
        this.flash = .8;
        this.camera.zoom = Math.max(.5, this.camera.zoom * .94);
        window.gameAudio.setBoost(false);
        window.gameAudio.play('death');
        this.wasBoosting = false;
        this.snakes = this.snakes.filter((s) => s !== snake);
        this.ui.addFeed(snake.name, killer ? killer.name : null, cause, true);
        this.ui.hideHud();
        this.updateLeaderboard();
      } else {
        const idx = this.snakes.indexOf(snake);
        if (idx >= 0) this.snakes.splice(idx, 1);
        if (killer && killer !== snake && killer.alive) {
          killer.kills++;
          if (killer.isPlayer) {
            this.onPlayerKill(snake);
          }
        }
        if (!this.menuMode) this.ui.addFeed(snake.name, killer ? killer.name : null, cause, false);
        const near = this.player && hypot(snake.x - this.player.x, snake.y - this.player.y) < 1300;
        if (near && !this.menuMode) window.gameAudio.play('kill');
        this.updateLeaderboard();
      }
      return true;
    }

    onPlayerKill(victim) {
      const now = this.time;
      if (now - this.lastKillTime < 8) this.killStreak++;
      else this.killStreak = 1;
      this.lastKillTime = now;
      this.particles.text(victim.x, victim.y - 20, '¡BAJA!', '#ffd76a', 18, 1.4);
      this.camera.shake(5);
      const names = { 2: 'DOBLE BAJA', 3: 'TRIPLE BAJA', 4: 'MASACRE', 5: 'IMPARABLE' };
      if (this.killStreak >= 2) {
        this.ui.toast(names[this.killStreak] || 'CAOS TOTAL', victim.name + ' ha caído ante ti.', 'pink', 'i-crown');
      } else {
        this.ui.toast('BAJA CONFIRMADA', victim.name + ' chocó contra tu cuerpo.', 'lime', 'i-crown');
      }
      window.gameAudio.play('kill');
    }

    buildResults(cause, killer, player) {
      const event = this.variant === 'halloween';
      const score = Math.floor(player.mass + player.kills * 45 + player.orbs * 1.4 + player.timeAlive * 1.1);
      const coins = event ? 0 : Math.max(4, Math.floor(score * .35 + player.kills * 14 + player.timeAlive * .35));
      const candies = event
        ? Math.max(8, Math.floor(score * .24 + player.kills * 7 + player.timeAlive * .2 + player.orbs * .12))
        : 0;
      const oldBest = this.save.best;
      const newBest = score > oldBest;
      const rank = player.rank || 99;
      this.save.best = Math.max(oldBest, score);
      if (event) {
        this.save.candy = Math.min(9999999, this.save.candy + candies);
        this.save.stats.candyEarned += candies;
        this.save.stats.halloweenRuns++;
        this.save.stats.halloweenKills += player.kills;
      } else {
        this.save.coins = Math.min(9999999, this.save.coins + coins);
      }
      this.save.stats.runs++;
      this.save.stats.kills += player.kills;
      this.save.stats.time += player.timeAlive;
      this.save.stats.orbs += player.orbs;
      this.save.stats.bestCombo = Math.max(this.save.stats.bestCombo, player.comboBest);
      this.save.stats.powerups += player.powerupsUsed || 0;
      this.save.stats.bestMass = Math.max(this.save.stats.bestMass, Math.floor(player.mass));
      if (rank === 1) this.save.stats.wins++;
      this.captureBotArena();
      const unlocked = this.checkAchievements(false);
      Save.write();
      let causeText;
      if (cause === 'wall') causeText = 'Te estrellaste contra el muro de contención.';
      else if (cause === 'head') causeText = killer ? 'Choque frontal contra ' + killer.name + '.' : 'Choque frontal contra otra serpiente.';
      else causeText = killer ? 'Chocaste contra el cuerpo de ' + killer.name + '.' : 'Chocaste contra el cuerpo de otra serpiente.';
      return {
        score, coins, candies, kills: player.kills, orbs: player.orbs,
        time: player.timeAlive, mass: Math.floor(player.mass), rank,
        best: this.save.best, newBest, oldBest, cause, causeText,
        killerName: killer ? killer.name : null,
        totalCoins: this.save.coins, totalCandy: this.save.candy,
        currency: event ? 'candy' : 'coins', reward: event ? candies : coins,
        totalCurrency: event ? this.save.candy : this.save.coins,
        variant: event ? 'halloween' : 'classic',
        comboBest: player.comboBest, unlocked: unlocked.length
      };
    }

    collectPowerup(pickup, snake) {
      const def = pickup.def;
      snake.powerupsUsed++;
      if (def.id === 'invincible') {
        snake.powerInvincibleUntil = this.time + def.duration;
      } else if (def.id === 'magnet') {
        snake.powerMagnetUntil = this.time + def.duration;
      } else if (def.id === 'zoom') {
        snake.powerZoomUntil = this.time + def.duration;
      } else if (def.id === 'jackpot') {
        snake.mass = Math.min(5000, snake.mass + 175);
        snake.peakMass = Math.max(snake.peakMass, snake.mass);
        snake.computeDerived();
        snake.updateBody();
        this.particles.text(snake.x, snake.y - 18, '+175 MASA', '#c6ff3d', 19, 1.5);
      }
      this.particles.emitBurst(pickup.x, pickup.y, def.color, 30, 260, 5, .95);
      this.particles.ring(pickup.x, pickup.y, def.color, 36, .65);
      this.camera.shake(def.id === 'jackpot' ? 3.6 : 2);
      window.gameAudio.play('powerup', { type: def.id });
      if (this.save.settings.powerAlerts !== false) {
        const accent = def.id === 'magnet' ? 'pink' : def.id === 'jackpot' ? 'lime' : def.id === 'zoom' ? 'cyan' : 'gold';
        const name = this.variant === 'halloween' ? def.candyName : def.name;
        this.ui.toast(name, def.desc, accent, def.icon);
      }
      this.ui.updatePowerHud?.(this.player);
    }

    achievementRewardText(a) {
      const reward = a.reward || {};
      const bits = [];
      if (reward.coins) bits.push('+' + reward.coins + ' monedas');
      if (reward.candy) bits.push('+' + reward.candy + ' dulces');
      if (reward.skin && SKIN_MAP[reward.skin]) bits.push('Piel: ' + SKIN_MAP[reward.skin].name);
      if (reward.outfit && OUTFIT_MAP[reward.outfit]) bits.push('Ropa: ' + OUTFIT_MAP[reward.outfit].name);
      if (reward.accessory && ACCESSORY_MAP[reward.accessory]) bits.push('Accesorio: ' + ACCESSORY_MAP[reward.accessory].name);
      return bits.join(' · ');
    }

    checkAchievements(silent) {
      const unlocked = [];
      const save = this.save;
      for (const a of ACHIEVEMENTS) {
        if (save.achievements.includes(a.id)) continue;
        if ((save.stats[a.stat] || 0) < a.goal) continue;
        save.achievements.push(a.id);
        const reward = a.reward || {};
        if (reward.coins) save.coins = Math.min(9999999, save.coins + reward.coins);
        if (reward.candy) save.candy = Math.min(9999999, save.candy + reward.candy);
        const granted = [];
        if (reward.skin && Save.grant('skin', reward.skin)) granted.push('skin');
        if (reward.outfit && Save.grant('outfit', reward.outfit)) granted.push('outfit');
        if (reward.accessory && Save.grant('accessory', reward.accessory)) granted.push('accessory');
        const text = this.achievementRewardText(a);
        unlocked.push({ achievement: a, text, granted });
      }
      if (unlocked.length) {
        Save.write();
        if (this.ui) {
          this.ui.updateMenu();
          if (this.ui.renderAchievements) this.ui.renderAchievements();
          if (this.ui.renderSkins) this.ui.renderSkins();
          if (this.ui.renderEventShop) this.ui.renderEventShop();
          for (let i = 0; i < unlocked.length; i++) {
            const item = unlocked[i];
            if (silent) continue;
            setTimeout(() => {
              if (!this.ui) return;
              this.ui.toast('LOGRO DESBLOQUEADO', item.achievement.name + (item.text ? ' · ' + item.text : ''), 'gold', item.achievement.icon);
              window.gameAudio.play('achievement');
            }, i * 750);
          }
        }
      }
      return unlocked;
    }


    finishGameOver() {
      this.state = 'gameover';
      this.ui.hideHud();
      this.ui.showGameOver(this.deathResults);
      window.gameAudio.setMode('menu');
      window.gameAudio.setBoost(false);
      this.wasBoosting = false;
    }

    onFoodEaten(snake, food) {
      const isPlayer = snake.isPlayer;
      if (food.kind === 'rare' || food.kind === 'chase') {
        this.particles.emitBurst(food.x, food.y, food.color, 16, 180, 4, .7);
        this.particles.ring(food.x, food.y, food.color, 14, .45);
        if (isPlayer && !this.menuMode) {
          window.gameAudio.play(food.candy ? 'candyRare' : 'rare');
          this.camera.shake(1.8);
          this.particles.text(food.x, food.y - 10, '+' + Math.round(food.value), '#ffd76a', 15, 1);
        }
      } else {
        this.particles.emitBurst(food.x, food.y, food.color, food.kind === 'drop' ? 4 : 3, 100, 2.2, .4);
        if (isPlayer && !this.menuMode) {
          window.gameAudio.play(food.candy ? 'candy' : 'eat', { pitch: snake.combo });
        }
      }
      if (isPlayer && this.state === 'playing' && snake.combo >= 5 && snake.combo % 5 === 0) {
        const combo = NS.$('#combo');
        if (combo) {
          combo.classList.remove('pop');
          void combo.offsetWidth;
          combo.classList.add('pop');
        }
      }
    }

    onBoostDrop(snake) {
      if (snake.isPlayer && this.particlesEnabled && Math.random() < .45) {
        this.particles.emitTrail(
          snake.x - Math.cos(snake.angle) * snake.radius * 1.2 + rand(-4, 4),
          snake.y - Math.sin(snake.angle) * snake.radius * 1.2 + rand(-4, 4),
          snake.skin.colors.glow, 1.3
        );
      }
    }

    updateLeaderboard() {
      const alive = [];
      for (const s of this.snakes) if (s.alive) alive.push(s);
      alive.sort((a, b) => b.mass - a.mass);
      for (let i = 0; i < alive.length; i++) {
        alive[i].rank = i + 1;
        alive[i].isLeader = i === 0;
      }
      this.topList = alive.slice(0, 8);
      if (this.player && this.player.alive && this.state === 'playing') {
        const rank = this.player.rank;
        const soloRoom = this.mode === 'online' && alive.length <= 1;
        if (rank < this.lastRank) {
          if (!soloRoom && rank === 1 && this.lastRank !== 1) {
            this.ui.toast('LIDERATO ABSOLUTO', 'Eres la serpiente más grande de la arena.', 'gold', 'i-crown');
            window.gameAudio.play('rankup');
            this.lastRankToast = this.time;
          } else if (!soloRoom && this.lastRank > 10 && rank <= 10) {
            this.ui.toast('TOP 10', 'Rango #' + rank + ' en la arena. Sigue creciendo.', 'gold', 'i-trophy');
            window.gameAudio.play('rankup');
            this.lastRankToast = this.time;
          }
          this.lastRank = rank;
        } else if (rank > this.lastRank) {
          this.lastRank = rank;
        }
      }
    }

    /* ---------------- Menu helpers ---------------- */
    buyUpgrade(id) {
      const u = NS.UPGRADE_MAP[id];
      if (!u) return false;
      const level = this.upgradeLevel(id);
      if (level >= u.max) return false;
      const cost = u.costs[level];
      if (this.save.coins < cost) {
        window.gameAudio.play('error');
        return false;
      }
      this.save.coins -= cost;
      this.save.stats.coinsSpent += cost;
      this.save.upgrades[id] = level + 1;
      Save.write();
      window.gameAudio.play('buy');
      this.checkAchievements(false);
      this.ui.updateMenu();
      return true;
    }

    equipCosmetic(type, id) {
      const c = COSMETIC_TYPES[type];
      if (!c || !c.map[id] || !Save.owns(type, id)) return false;
      this.save[type] = id;
      Save.write();
      window.gameAudio.play('equip');
      this.ui.updateMenu();
      this.ui.drawPreviews(this.realTime);
      return true;
    }

    buyCosmetic(type, id) {
      const c = COSMETIC_TYPES[type];
      if (!c) return false;
      const item = c.map[id];
      if (!item) return false;
      if (Save.owns(type, id)) {
        return this.equipCosmetic(type, id);
      }
      const currency = item.currency === 'candy' ? 'candy' : 'coins';
      const price = Math.max(0, item.price || 0);
      const balance = currency === 'candy' ? this.save.candy : this.save.coins;
      if (balance < price) {
        window.gameAudio.play('error');
        return false;
      }
      if (currency === 'candy') {
        this.save.candy -= price;
        this.save.stats.candySpent += price;
      } else {
        this.save.coins -= price;
        this.save.stats.coinsSpent += price;
      }
      Save.grant(type, id);
      this.save[type] = id;
      Save.write();
      window.gameAudio.play('buy');
      this.checkAchievements(false);
      this.ui.updateMenu();
      this.ui.renderSkins();
      this.ui.renderEventShop();
      return true;
    }

    buySkin(id) {
      return this.buyCosmetic('skin', id);
    }

    resetProgress() {
      Save.reset();
      this.save = Save.data;
      this.botSessions = { classic: null, halloween: null };
      this.variant = 'classic';
      this.menuMode = true;
      this.state = 'menu';
      this.applySettings();
      this.ui.updateMenu();
      this.ui.renderUpgrades();
      this.ui.renderSkins();
      this.ui.renderAchievements();
      this.ui.renderEventShop();
      this.resetWorld(true);
    }
  }

  function pointSegDist2(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return dist2(px, py, ax, ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = clamp(t, 0, 1);
    return dist2(px, py, ax + dx * t, ay + dy * t);
  }

  NS.Input = Input;
  NS.Game = Game;

  window.addEventListener('resize', () => {
    if (window.NEON_GAME) window.NEON_GAME.renderer.resize();
  });

  document.addEventListener('DOMContentLoaded', () => {
    const game = new NS.Game();
    window.NEON_GAME = game;
    setTimeout(() => game.ui.finishBoot(), 700);
  }, { once: true });
})();

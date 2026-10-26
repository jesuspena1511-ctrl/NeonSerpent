/* ============================================================
   NEON SERPENT — Cliente online
   Navegador de servidores por región + WebSocket + predicción.
   ============================================================ */
(function () {
  'use strict';
  try {
    const remoteApi = new URLSearchParams(location.search).get('online');
    if (remoteApi && !window.NEON_ONLINE_API && /^https?:\/\//i.test(remoteApi)) {
      window.NEON_ONLINE_API = remoteApi.replace(/\/+$/, '');
    }
  } catch (e) { /* URLSearchParams no disponible */ }
  const NS = window.NS;
  const {
    TAU, clamp, hypot, dist2, approachAngle, rand,
    CFG, SKINS, SKIN_MAP, OUTFIT_MAP, ACCESSORY_MAP, POWERUP_MAP, formatNum
  } = NS;

  const TRAIL_STEP = CFG.trailStep;
  const BASE_SPEED = CFG.baseSpeed;
  const BOOST_SPEED = CFG.boostSpeed;
  const TURN_RATE = CFG.turnRate;
  const BOOST_DRAIN = CFG.boostDrain;
  const BOOST_MIN_MASS = CFG.boostMinMass;

  function fmtPing(ms) {
    if (!Number.isFinite(ms)) return '— ms';
    return Math.round(ms) + ' ms';
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function cleanEndpoint(value) {
    if (!value) return '';
    let out = String(value).trim();
    if (!out) return '';
    if (out.startsWith('/')) out = location.origin + out;
    return out.replace(/\/+$/, '');
  }

  function wsUrlFor(endpoint) {
    let base = cleanEndpoint(endpoint);
    if (!base) base = location.origin;
    if (!/^https?:\/\//i.test(base)) base = 'https://' + base.replace(/^\/+/, '');
    return base.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:') + '/ws';
  }

  function originFallback() {
    if (window.NEON_ONLINE_API) return cleanEndpoint(window.NEON_ONLINE_API);
    if (location.protocol === 'http:' || location.protocol === 'https:') return location.origin;
    return 'http://localhost:3000';
  }

  async function getJSON(url, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 6000);
    try {
      const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  class NetSnake {
    constructor(game, wire, isPlayer) {
      this.game = game;
      this.isPlayer = !!isPlayer;
      this.id = wire.i;
      this.name = wire.n || 'Jugador#1';
      this.skinId = SKIN_MAP[wire.sk] ? wire.sk : 'ion';
      this.skin = SKIN_MAP[this.skinId] || SKINS[0];
      this.outfit = OUTFIT_MAP[wire.o] ? wire.o : 'none';
      this.accessory = ACCESSORY_MAP[wire.ac] ? wire.ac : 'none';
      this.x = wire.x;
      this.y = wire.y;
      this.angle = wire.a;
      this.mass = wire.m;
      this.peakMass = wire.pk || wire.m;
      this.alive = !!wire.al;
      this.boosting = !!wire.b;
      this.kills = wire.k || 0;
      this.orbs = wire.ob || 0;
      this.rank = wire.r || 99;
      this.isLeader = false;
      this.invuln = wire.inv || 0;
      this.shieldCharges = wire.sh || 0;
      this.powerInvincibleUntil = wire.pi || -1;
      this.powerMagnetUntil = wire.pm || -1;
      this.powerZoomUntil = wire.pz || -1;
      this.powerupsUsed = wire.pu || 0;
      this.timeAlive = wire.ta || 0;
      this.combo = wire.cm || 0;
      this.comboBest = wire.cb || this.combo;
      this.lastEatTime = game.time;
      this.spawnFlash = 0;
      this.trail = [];
      this.trailAnchor = { x: this.x, y: this.y };
      this.bodyPoints = [];
      this.serverX = this.x;
      this.serverY = this.y;
      this.serverAngle = this.angle;
      this.initialized = false;
      this.computeDerived();
      this.initTrail();
      this.updateBody();
      this.initialized = true;
    }

    get boostRatio() {
      const denom = Math.max(12, this.peakMass - BOOST_MIN_MASS);
      return clamp((this.mass - BOOST_MIN_MASS) / denom, 0, 1);
    }

    computeDerived() {
      this.radius = 9.4 + Math.log1p(this.mass / 46) * 2.35;
      this.segmentCount = Math.min(CFG.maxBodySegments, 20 + Math.floor(this.mass * .52));
      this.segmentSpacing = Math.max(4.2, this.radius * .47);
    }

    initTrail() {
      this.trail.length = 0;
      const needed = this.segmentCount * this.segmentSpacing + 48;
      const cos = Math.cos(this.angle);
      const sin = Math.sin(this.angle);
      for (let d = needed; d > 0; d -= TRAIL_STEP) {
        this.trail.push({ x: this.x - cos * d, y: this.y - sin * d });
      }
      this.trail.push({ x: this.x, y: this.y });
      this.trailAnchor.x = this.x;
      this.trailAnchor.y = this.y;
    }

    addTrail() {
      let dx = this.x - this.trailAnchor.x;
      let dy = this.y - this.trailAnchor.y;
      let d = hypot(dx, dy);
      let guard = 0;
      while (d >= TRAIL_STEP && guard++ < 40) {
        const t = TRAIL_STEP / d;
        const px = this.trailAnchor.x + dx * t;
        const py = this.trailAnchor.y + dy * t;
        this.trail.push({ x: px, y: py });
        this.trailAnchor.x = px;
        this.trailAnchor.y = py;
        dx = this.x - px;
        dy = this.y - py;
        d = hypot(dx, dy);
      }
      const needed = this.segmentCount * this.segmentSpacing + 50;
      const maxPts = Math.ceil(needed / TRAIL_STEP) + 14;
      if (this.trail.length > maxPts + 30) {
        this.trail.splice(0, this.trail.length - maxPts);
      }
    }

    updateBody() {
      const pts = [];
      const segs = this.segmentCount;
      const spacing = this.segmentSpacing;
      const len = this.trail.length;
      const startOffset = this.radius * .45;
      for (let i = 0; i < segs; i++) {
        const d = startOffset + i * spacing;
        const fi = len - 1 - d / TRAIL_STEP;
        if (fi <= 0) break;
        const i0 = Math.floor(fi);
        const i1 = Math.min(len - 1, i0 + 1);
        const f = fi - i0;
        const a = this.trail[i0];
        const b = this.trail[i1];
        pts.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
      }
      this.bodyPoints = pts;
    }

    snapTo(x, y, angle) {
      this.x = x;
      this.y = y;
      this.angle = angle;
      this.serverX = x;
      this.serverY = y;
      this.serverAngle = angle;
      this.computeDerived();
      this.initTrail();
      this.updateBody();
    }

    applyWire(wire, force) {
      this.name = wire.n || this.name;
      this.skinId = wire.sk || this.skinId;
      this.skin = SKIN_MAP[this.skinId] || this.skin || SKINS[0];
      this.outfit = OUTFIT_MAP[wire.o] ? wire.o : 'none';
      this.accessory = ACCESSORY_MAP[wire.ac] ? wire.ac : 'none';
      this.serverX = wire.x;
      this.serverY = wire.y;
      this.serverAngle = wire.a;
      this.mass = wire.m;
      this.peakMass = wire.pk || wire.m;
      this.alive = !!wire.al;
      this.boosting = !!wire.b;
      this.kills = wire.k || 0;
      this.orbs = wire.ob || 0;
      this.rank = wire.r || 99;
      this.invuln = wire.inv || 0;
      this.shieldCharges = wire.sh || 0;
      this.powerInvincibleUntil = wire.pi || -1;
      this.powerMagnetUntil = wire.pm || -1;
      this.powerZoomUntil = wire.pz || -1;
      this.timeAlive = wire.ta || 0;
      this.combo = wire.cm || 0;
      this.powerupsUsed = wire.pu || 0;
      this.comboBest = wire.cb || 0;
      if (this.combo > 0) this.lastEatTime = this.game.time;
      this.computeDerived();
      if (force || !this.initialized) {
        this.snapTo(wire.x, wire.y, wire.a);
      } else {
        const d2 = dist2(this.x, this.y, wire.x, wire.y);
        if (d2 > 520 * 520) this.snapTo(wire.x, wire.y, wire.a);
      }
    }

    predict(dt, aim, boost) {
      if (!this.alive) return;
      const sizePenalty = 1 - clamp((this.radius - 10) / 44, 0, .34);
      this.angle = approachAngle(this.angle, aim, TURN_RATE * 1.02 * sizePenalty * dt);
      const invincible = this.game.time < this.powerInvincibleUntil;
      this.boosting = invincible || (!!boost && this.mass > BOOST_MIN_MASS + .5);
      let speed = BASE_SPEED;
      if (this.boosting) {
        if (!invincible) {
          const turbo = this.isPlayer ? (this.game.upgradeLevel('turbo') || 0) : 0;
          this.mass = Math.max(BOOST_MIN_MASS, this.mass - BOOST_DRAIN * (1 - turbo * .09) * dt);
          if (this.mass <= BOOST_MIN_MASS + .5) this.boosting = false;
        }
        speed = BOOST_SPEED * (invincible ? 1.05 : 1);
      } else if (this.peakMass > this.mass) {
        this.peakMass = Math.max(this.mass, this.peakMass - dt * .2);
      }
      const cos = Math.cos(this.angle);
      const sin = Math.sin(this.angle);
      this.x += cos * speed * dt;
      this.y += sin * speed * dt;
      if (invincible) {
        const dc = hypot(this.x, this.y);
        const maxR = CFG.worldRadius - this.radius - 8;
        if (dc > maxR) {
          this.x *= maxR / dc;
          this.y *= maxR / dc;
        }
      }
      this.addTrail();
      this.computeDerived();
      this.updateBody();

      const dx = this.serverX - this.x;
      const dy = this.serverY - this.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 340 * 340) {
        this.snapTo(this.serverX, this.serverY, this.serverAngle);
      } else if (d2 > 72 * 72) {
        const k = 1 - Math.exp(-5.5 * dt);
        this.x += dx * k;
        this.y += dy * k;
        this.addTrail();
        this.updateBody();
      }
    }

    follow(dt) {
      if (!this.alive) return;
      const dx = this.serverX - this.x;
      const dy = this.serverY - this.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 560 * 560) {
        this.snapTo(this.serverX, this.serverY, this.serverAngle);
        return;
      }
      const k = 1 - Math.exp(-16 * dt);
      this.x += dx * k;
      this.y += dy * k;
      this.angle = approachAngle(this.angle, this.serverAngle, 14 * dt);
      this.addTrail();
      this.computeDerived();
      this.updateBody();
    }
  }

  class OnlineSession {
    constructor(game, ws, joined, room) {
      this.game = game;
      this.ws = ws;
      this.playerId = joined.id;
      this.room = joined.room || room || {};
      this.endpoint = (room && room.endpoint) || '';
      this.regionLabel = '';
      this.serverTime = joined.st || 0;
      this.snakes = new Map();
      this.foodMap = new Map();
      this.foodDirty = true;
      this.powerList = [];
      this.active = true;
      this.intentional = false;
      this.deathShown = false;
      this.lastSnapshotAt = performance.now();
      this.lastAim = 0;
      this.lastBoost = false;
      this.latency = null;
      this.inputTimer = null;
      this.pingTimer = null;
      this.hudTimer = 0;
      this.wasBoosting = false;
      this.tickCount = 0;
      this.lastFoodSound = 0;
      this.joined = joined;
    }

    start() {
      this.bind();
      const manager = NS.Online;
      this.regionLabel = manager.regionLabel(this.room.regionId);
      this.applyInitial(this.joined);
      window.gameAudio.setMode('game');
      window.gameAudio.setBoost(false);
      this.inputTimer = setInterval(() => this.sendInput(), 50);
      this.pingTimer = setInterval(() => this.sendPing(), 5000);
      this.sendPing();
      manager.session = this;
    }

    bind() {
      this.ws.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch (e) { return; }
        this.onMessage(msg);
      };
      this.ws.onerror = () => { /* onclose gestiona */ };
      this.ws.onclose = () => {
        if (!this.active || this.intentional) return;
        this.active = false;
        this.clearTimers();
        if (NS.Online.session === this) NS.Online.session = null;
        this.game.onlineDisconnected('Se perdió la conexión con el servidor.');
      };
    }

    clearTimers() {
      if (this.inputTimer) clearInterval(this.inputTimer);
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.inputTimer = null;
      this.pingTimer = null;
    }

    applyInitial(joined) {
      this.serverTime = joined.st || 0;
      this.game.time = this.serverTime;
      this.foodMap.clear();
      for (const f of joined.foods || []) this.addFood(f);
      this.foodDirty = true;
      this.powerList = (joined.powerups || []).map((p) => this.makePower(p));
      this.applyPowerups();
      this.snakes.clear();
      for (const wire of joined.snakes || []) {
        const snake = new NetSnake(this.game, wire, wire.i === this.playerId);
        this.snakes.set(wire.i, snake);
      }
      this.publishSnakes();
    }

    addFood(f) {
      this.foodMap.set(f.i, {
        id: f.i,
        x: f.x,
        y: f.y,
        kind: f.k || 'normal',
        color: f.c || '#22f5e2',
        value: f.v || 3,
        r: f.r || 1,
        phase: f.p || 0,
        candy: !!f.ca,
        candyShape: f.cs || 0,
        age: f.age || 0,
        life: f.life || 99999
      });
      this.foodDirty = true;
    }

    makePower(p) {
      const def = POWERUP_MAP[p.t] || POWERUP_MAP.jackpot;
      return {
        id: p.i,
        def,
        x: p.x,
        y: p.y,
        phase: p.p || 0,
        r: p.r || 15
      };
    }

    applyPowerups() {
      this.game.powerups.list = this.powerList;
    }

    refreshFoodList() {
      if (!this.foodDirty) return;
      this.game.foods.list = [...this.foodMap.values()];
      this.foodDirty = false;
    }

    publishSnakes() {
      const all = [...this.snakes.values()];
      const local = this.snakes.get(this.playerId);
      this.game.player = local || null;
      this.game.snakes = all;
      const alive = all.filter((s) => s.alive).sort((a, b) => a.rank - b.rank || b.mass - a.mass);
      for (let i = 0; i < alive.length; i++) {
        alive[i].rank = i + 1;
        alive[i].isLeader = i === 0;
      }
      this.game.topList = alive.slice(0, 8);
      if (local) {
        this.game.camera.x = local.x;
        this.game.camera.y = local.y;
        this.game.camera.targetX = local.x;
        this.game.camera.targetY = local.y;
      }
    }

    onMessage(msg) {
      if (msg.t === 's') this.applySnapshot(msg);
      else if (msg.t === 'you-died') this.onDeath(msg.res);
      else if (msg.t === 'respawned') this.onRespawned(msg);
      else if (msg.t === 'kill') this.onKill(msg);
      else if (msg.t === 'pong') {
        if (Number.isFinite(msg.ts)) {
          const sample = performance.now() - msg.ts;
          this.latency = this.latency == null ? sample : this.latency * .7 + sample * .3;
        }
      } else if (msg.t === 'error') {
        this.game.ui.toast('SERVIDOR', msg.message || 'No se pudo completar la acción.', 'pink', 'i-users');
      }
    }

    applySnapshot(msg) {
      this.lastSnapshotAt = performance.now();
      if (Number.isFinite(msg.st)) {
        const drift = msg.st - this.serverTime;
        if (Math.abs(drift) > 1.4) this.serverTime = msg.st;
        else this.serverTime += drift * .16;
      }
      this.tickCount++;
      const seen = new Set();
      for (const wire of msg.snakes || []) {
        seen.add(wire.i);
        let snake = this.snakes.get(wire.i);
        if (!snake) {
          snake = new NetSnake(this.game, wire, wire.i === this.playerId);
          this.snakes.set(wire.i, snake);
        } else {
          snake.applyWire(wire, false);
        }
      }
      for (const [id, snake] of this.snakes) {
        if (seen.has(id)) continue;
        if (id === this.playerId) {
          snake.alive = false;
        } else {
          this.snakes.delete(id);
        }
      }
      for (const f of msg.fa || []) this.addFood(f);
      for (const id of msg.fd || []) {
        if (this.foodMap.delete(id)) this.foodDirty = true;
      }
      for (const moved of msg.fu || []) {
        const food = this.foodMap.get(moved.i);
        if (!food) continue;
        food.x = moved.x;
        food.y = moved.y;
        this.foodDirty = true;
      }
      this.refreshFoodList();
      if (msg.powerups) {
        this.powerList = msg.powerups.map((p) => this.makePower(p));
        this.applyPowerups();
      }
      for (const ev of msg.ev || []) this.applyEvent(ev);
      this.publishSnakes();
    }

    applyEvent(ev) {
      if (!ev || !ev.k) return;
      const game = this.game;
      if (ev.k === 'death') {
        const isMe = ev.pid === this.playerId;
        game.ui.addFeed(ev.v, ev.kn, ev.c, isMe);
        if (ev.kp === this.playerId && ev.pid !== this.playerId) {
          game.ui.toast('BAJA ONLINE', (ev.v || 'Rival') + ' cayó en la arena.', 'gold', 'i-crown');
          window.gameAudio.play('kill');
          game.camera.shake(4);
        }
      } else if (ev.k === 'eat') {
        if (ev.pid !== this.playerId) return;
        const now = performance.now();
        if (now - this.lastFoodSound < 42) return;
        this.lastFoodSound = now;
        window.gameAudio.play(ev.candy ? (ev.rare ? 'candyRare' : 'candy') : ev.rare ? 'rare' : 'eat');
        if (ev.rare) {
          game.camera.shake(1.6);
          game.particles.emitBurst(ev.x || game.player.x, ev.y || game.player.y, '#ffd76a', 14, 170, 4, .6);
        }
      } else if (ev.k === 'power') {
        if (ev.pid !== this.playerId) return;
        const def = POWERUP_MAP[ev.p];
        if (!def) return;
        window.gameAudio.play('powerup', { type: ev.p });
        if (game.save.settings.powerAlerts !== false) {
          const accent = ev.p === 'magnet' ? 'pink' : ev.p === 'jackpot' ? 'lime' : ev.p === 'zoom' ? 'cyan' : 'gold';
          game.ui.toast(game.variant === 'halloween' ? def.candyName : def.name, def.desc, accent, def.icon);
        }
      } else if (ev.k === 'shield') {
        if (ev.pid !== this.playerId) return;
        const x = ev.x || game.player?.x || 0;
        const y = ev.y || game.player?.y || 0;
        window.gameAudio.play('shield');
        game.camera.shake(8);
        game.particles.emitBurst(x, y, '#ffd76a', 30, 280, 5, .9);
        game.particles.ring(x, y, '#ffd76a', (game.player?.radius || 12) * 3, .7);
        game.ui.toast(
          'ESCUDO ACTIVADO',
          ev.sh > 0 ? 'Sobrevives al impacto. Te quedan ' + ev.sh + ' cargas.' : 'Era tu última carga. ¡Escapa y recupera masa!',
          'gold',
          'i-shield'
        );
      } else if (ev.k === 'join') {
        if (ev.pid !== this.playerId) {
          this.room.players = Math.min(this.room.capacity || 16, (this.room.players || 1) + 1);
          if (game.state === 'playing') {
            game.ui.toast('JUGADOR CONECTADO', (ev.n || 'Alguien') + ' entró a la sala.', 'cyan', 'i-users');
          }
        }
      } else if (ev.k === 'leave') {
        if (ev.pid !== this.playerId) {
          this.room.players = Math.max(1, (this.room.players || 1) - 1);
          if (game.state === 'playing') {
            game.ui.addFeed(ev.n || 'Jugador', null, 'leave', false);
          }
        }
      }
    }

    onDeath(res) {
      if (this.deathShown) return;
      this.deathShown = true;
      const local = this.snakes.get(this.playerId);
      if (local) local.alive = false;
      this.game.onlineDeath(res, this);
    }

    onKill(msg) {
      this.game.ui.toast('BAJA ONLINE', (msg.name || 'Rival') + ' chocó contigo. Total: ' + (msg.total || 0) + '.', 'gold', 'i-crown');
      window.gameAudio.play('kill');
      this.game.camera.shake(4);
    }

    onRespawned(msg) {
      this.deathShown = false;
      let snake = this.snakes.get(this.playerId);
      if (!snake) {
        snake = new NetSnake(this.game, msg.snake, true);
        this.snakes.set(this.playerId, snake);
      } else {
        snake.alive = true;
        snake.applyWire(msg.snake, true);
      }
      if (Array.isArray(msg.snakes)) {
        const seen = new Set([this.playerId]);
        for (const wire of msg.snakes) {
          if (wire.i === this.playerId) continue;
          seen.add(wire.i);
          const other = this.snakes.get(wire.i);
          if (other) other.applyWire(wire, false);
          else this.snakes.set(wire.i, new NetSnake(this.game, wire, false));
        }
        for (const [id] of this.snakes) if (!seen.has(id)) this.snakes.delete(id);
      }
      this.game.player = snake;
      this.game.camera.x = snake.x;
      this.game.camera.y = snake.y;
      this.game.camera.targetX = snake.x;
      this.game.camera.targetY = snake.y;
      this.publishSnakes();
      this.game.onlineRespawned(msg, this);
    }

    sendInput() {
      if (!this.active || this.ws.readyState !== 1) return;
      if (this.game.state !== 'playing') return;
      const player = this.game.player;
      if (!player || !player.alive) return;
      let angle = this.lastAim;
      let boost = false;
      try {
        angle = this.game.getAimAngle(player);
        boost = this.game.input.boosting;
      } catch (e) { /* conserva último input */ }
      if (!Number.isFinite(angle)) angle = player.angle;
      this.lastAim = angle;
      this.lastBoost = boost;
      if (this.ws.bufferedAmount > 2048) return;
      this.ws.send(JSON.stringify({ t: 'i', a: +angle.toFixed(3), b: !!boost }));
    }

    sendPing() {
      if (!this.active || this.ws.readyState !== 1) return;
      this.ws.send(JSON.stringify({ t: 'ping', ts: performance.now() }));
    }

    update(dt) {
      if (!this.active) return;
      this.serverTime += dt;
      this.game.time = this.serverTime;
      const player = this.game.player;
      const playing = this.game.state === 'playing';
      let aim = this.lastAim;
      let boost = false;
      if (playing && player && player.alive) {
        try {
          aim = this.game.getAimAngle(player);
          boost = this.game.input.boosting;
          this.lastAim = aim;
          this.lastBoost = boost;
        } catch (e) { /* usa último */ }
      }
      for (const snake of this.snakes.values()) {
        if (!snake.alive) continue;
        if (snake.isPlayer && playing) snake.predict(dt, aim, boost);
        else if (!snake.isPlayer) snake.follow(dt);
        else snake.follow(dt);
      }
      this.game.camera.update(dt, 'game');
      this.game.particles.update(dt);
      this.game.flash = Math.max(0, this.game.flash - dt * 2.6);
      this.hudTimer -= dt;
      if (this.hudTimer <= 0) {
        this.hudTimer = .1;
        this.game.ui.updateHUD(this.game, false);
      }
      if (player) {
        if (player.boosting && !this.wasBoosting) {
          window.gameAudio.play('booststart');
          this.game.camera.shake(1.2);
        }
        if (player.boosting !== this.wasBoosting) {
          window.gameAudio.setBoost(player.boosting);
          this.wasBoosting = player.boosting;
        }
        if (player.boosting && Math.random() < .45) {
          this.game.particles.emitDirectional(
            player.x - Math.cos(player.angle) * player.radius * 1.3,
            player.y - Math.sin(player.angle) * player.radius * 1.3,
            player.angle + Math.PI, player.skin.colors.glow, 1, 90, player.radius * .25, .4
          );
        }
      }
    }

    respawn() {
      if (!this.active || this.ws.readyState !== 1) {
        this.game.ui.toast('SIN CONEXIÓN', 'No se puede reingresar al servidor.', 'pink', 'i-users');
        return;
      }
      this.deathShown = false;
      this.ws.send(JSON.stringify({ t: 'respawn' }));
      this.game.ui.toast('REAPARECIENDO', 'Buscando un punto seguro en la arena...', 'lime', 'i-retry');
    }

    leave() {
      this.intentional = true;
      this.active = false;
      this.clearTimers();
      try {
        if (this.ws.readyState === 1) this.ws.send(JSON.stringify({ t: 'leave' }));
      } catch (e) { /* ignore */ }
      try { this.ws.close(1000, 'Salida'); } catch (e) { /* ignore */ }
      if (NS.Online.session === this) NS.Online.session = null;
    }
  }

  class OnlineManager {
    constructor() {
      this.game = null;
      this.session = null;
      this.servers = null;
      this.regions = [];
      this.nodes = [];
      this.totalPlayers = 0;
      this.recommended = null;
      this.recommendedDetected = false;
      this.selectedKey = null;
      this.loading = false;
      this.loadedAt = 0;
      this.ping = null;
      this.error = '';
      this.joining = false;
      this.pendingSocket = null;
      this.el = null;
      this.pollTimer = null;
      this.loadPromise = null;
    }

    init(game) {
      this.game = game;
      this.bind();
      setTimeout(() => this.loadServers(false), 1600);
      this.pollTimer = setInterval(() => {
        if (this.session || document.hidden) return;
        if (game.state !== 'menu') return;
        const now = Date.now();
        if (now - this.loadedAt < 15000) return;
        this.loadServers(false);
      }, 20000);
    }

    bind() {
      const $ = (id) => document.getElementById(id);
      this.el = {
        overlay: $('serverBrowser'),
        close: $('serverBrowserClose'),
        refresh: $('serverRefresh'),
        quick: $('serverQuickJoin'),
        regions: $('serverRegions'),
        rooms: $('serverRooms'),
        roomTitle: $('serverRoomTitle'),
        status: $('serverStatus'),
        recommended: $('serverRecommended'),
        total: $('serverTotal'),
        node: $('serverNode'),
        ping: $('serverPing')
      };
      if (!this.el.overlay) return;
      this.el.close?.addEventListener('click', () => this.closeBrowser());
      this.el.refresh?.addEventListener('click', () => {
        window.gameAudio.play('click');
        this.loadServers(true);
      });
      this.el.quick?.addEventListener('click', () => this.quickJoin());
      this.el.overlay.addEventListener('click', (e) => {
        if (e.target === this.el.overlay) this.closeBrowser();
      });
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isBrowserOpen() && !this.session) {
          e.preventDefault();
          this.closeBrowser();
        }
      });
    }

    isBrowserOpen() {
      return !!(this.el && this.el.overlay && !this.el.overlay.classList.contains('hidden'));
    }

    defaultOrigin() {
      return originFallback();
    }

    async loadServers(force) {
      if (this.loading) return this.loadPromise;
      if (!force && this.servers && Date.now() - this.loadedAt < 9000) {
        this.render();
        return this.servers;
      }
      this.loading = true;
      this.error = '';
      if (this.isBrowserOpen()) this.setStatus('Buscando servidores disponibles...');
      this.loadPromise = (async () => {
        const tz = (() => {
          try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; }
        })();
        let nodes = [];
        try {
          const directory = await getJSON(this.defaultOrigin() + '/servers.json?ts=' + Date.now(), 4500);
          if (directory && Array.isArray(directory.nodes) && directory.nodes.length) {
            nodes = directory.nodes.map((n) => ({
              id: n.id || n.label || 'nodo',
              label: n.label || n.id || 'Nodo',
              endpoint: cleanEndpoint(n.endpoint || n.url || '')
            }));
          }
        } catch (e) { /* Sin directorio: se usa el nodo actual. */ }
        if (!nodes.length) {
          nodes = [{ id: 'local', label: 'Nodo actual', endpoint: this.defaultOrigin() }];
        }

        const results = await Promise.allSettled(nodes.map(async (node) => {
          const endpoint = cleanEndpoint(node.endpoint) || this.defaultOrigin();
          const t0 = performance.now();
          const data = await getJSON(endpoint + '/api/servers?tz=' + encodeURIComponent(tz) + '&ts=' + Date.now(), 5000);
          const ping = performance.now() - t0;
          return { node, endpoint, data, ping };
        }));

        const regions = [];
        let recommended = null;
        let recommendedKey = null;
        let recommendedDetected = false;
        let totalPlayers = 0;
        let firstNode = null;
        let bestPing = Infinity;
        for (const result of results) {
          if (result.status !== 'fulfilled') continue;
          const { node, endpoint, data, ping } = result.value;
          if (!firstNode) firstNode = data.node || node;
          if (ping < bestPing) bestPing = ping;
          for (const region of data.regions || []) {
            const endpointForRegion = cleanEndpoint(region.endpoint) || endpoint;
            const key = (node.id || data.node?.id || 'nodo') + '|' + region.id;
            const item = Object.assign({}, region, {
              key,
              endpoint: endpointForRegion,
              nodeId: data.node?.id || node.id,
              nodeLabel: data.node?.label || node.label,
              ping
            });
            item.rooms = (region.rooms || []).map((room) => Object.assign({}, room, {
              endpoint: endpointForRegion,
              regionId: region.id,
              regionName: region.label || region.name,
              nodeId: item.nodeId,
              key: key + '|' + room.id
            }));
            regions.push(item);
            totalPlayers += item.players || 0;
            if (!recommended && (region.recommended || data.recommended === region.id)) {
              recommended = item;
              recommendedKey = key;
              recommendedDetected = true;
            }
          }
        }
        regions.sort((a, b) => {
          if (a.key === recommendedKey) return -1;
          if (b.key === recommendedKey) return 1;
          return (a.name || '').localeCompare(b.name || '', 'es');
        });
        recommended = recommended || regions[0] || null;
        recommendedKey = recommended ? recommended.key : null;
        this.servers = firstNode ? { node: firstNode } : null;
        this.nodes = nodes;
        this.regions = regions;
        this.totalPlayers = totalPlayers;
        this.recommended = recommended;
        this.recommendedDetected = recommendedDetected;
        this.loadedAt = Date.now();
        this.ping = Number.isFinite(bestPing) ? bestPing : null;
        if (!regions.length) {
          this.error = 'No se encontraron servidores. Verifica que el servidor Node esté encendido.';
        }
        if (!this.selectedKey || !regions.some((r) => r.key === this.selectedKey)) {
          this.selectedKey = recommendedKey || (regions[0] && regions[0].key) || null;
        }
        this.menuRefresh();
        this.render();
        return this.servers;
      })().catch((err) => {
        this.error = 'No se pudo conectar con la red de servidores.';
        this.servers = null;
        this.regions = [];
        this.totalPlayers = 0;
        this.menuRefresh();
        this.render();
        return null;
      }).finally(() => {
        this.loading = false;
        this.loadPromise = null;
        // render() se ejecuta antes del finally; actualizamos el estado final aquí
        // para que no quede "Buscando servidores..." tras una carga correcta.
        if (this.isBrowserOpen()) {
          if (this.error) this.setStatus(this.error);
          else if (this.regions.length) {
            const playerWord = this.totalPlayers === 1 ? ' jugador' : ' jugadores';
            this.setStatus(this.regions.length + ' servidores visibles · ' + this.totalPlayers + playerWord + ' en línea');
          }
        }
      });
      return this.loadPromise;
    }

    menuRefresh() {
      if (this.game && this.game.ui && this.game.state === 'menu') {
        this.game.ui.applyModeUI();
      }
    }

    regionLabel(regionId) {
      const region = this.regions.find((r) => r.id === regionId);
      if (region) return region.label || region.name;
      if (regionId === 'mexico') return 'México';
      if (regionId === 'sudamerica') return 'Sudamérica';
      if (regionId === 'brasil') return 'Brasil';
      if (regionId === 'usa') return 'Estados Unidos';
      if (regionId === 'europa') return 'Europa';
      if (regionId === 'asia') return 'Asia';
      return 'Online';
    }

    menuInfo() {
      if (this.session) {
        const count = this.session.room?.players || 1;
        return {
          online: true,
          players: String(count),
          label: count === 1 ? 'JUGADOR' : 'JUGADORES',
          note: 'Conectado a ' + this.session.room.name + ' · ' + (this.session.regionLabel || 'Online') + '.',
          action: 'VER SERVIDORES'
        };
      }
      if (this.regions.length) {
        const rec = this.recommended;
        return {
          online: true,
          players: String(this.totalPlayers),
          label: this.totalPlayers === 1 ? 'JUGADOR' : 'JUGADORES',
          note: (rec
            ? (this.recommendedDetected ? 'Tu región: ' : 'Sugerida: ') + (rec.label || rec.name)
            : 'Red de servidores') +
            ' · ' + this.totalPlayers + ' en línea. Elige tu servidor.',
          action: 'ELEGIR SERVIDOR'
        };
      }
      return {
        online: true,
        players: '—',
        label: 'JUGADORES',
        note: this.loading ? 'Conectando con la red de servidores...' : 'Abre el juego desde el servidor para jugar en línea.',
        action: 'VER SERVIDORES'
      };
    }

    setStatus(text) {
      if (this.el?.status) this.el.status.textContent = text;
    }

    openBrowser(preferredVariant) {
      if (!this.el?.overlay) return;
      if (preferredVariant) this.preferredVariant = preferredVariant === 'halloween' ? 'halloween' : 'classic';
      if (this.session) {
        this.game.ui.toast('EN PARTIDA', 'Ya estás dentro de ' + this.session.room.name + '.', 'cyan', 'i-users');
        return;
      }
      this.el.overlay.classList.remove('hidden');
      document.body.classList.add('server-open');
      window.gameAudio.init();
      window.gameAudio.play('open');
      this.render();
      if (!this.regions.length || Date.now() - this.loadedAt > 9000) {
        this.loadServers(true);
      } else {
        this.setStatus('Servidores actualizados. Elige una región y entra.');
      }
    }

    closeBrowser() {
      if (!this.el?.overlay) return;
      if (this.session) return;
      this.el.overlay.classList.add('hidden');
      document.body.classList.remove('server-open');
      window.gameAudio.play('close');
    }

    render() {
      if (!this.el?.overlay) return;
      if (!this.isBrowserOpen() && this.game?.state === 'menu') return;
      if (this.el.total) this.el.total.textContent = formatNum(this.totalPlayers) + (this.totalPlayers === 1 ? ' jugador' : ' jugadores');
      if (this.el.node) {
        const node = this.nodes.length > 1
          ? this.nodes.length + ' nodos'
          : (this.nodes[0]?.label || 'Nodo principal');
        this.el.node.textContent = node;
      }
      if (this.el.ping) this.el.ping.textContent = fmtPing(this.ping);
      if (this.el.recommended) {
        this.el.recommended.textContent = this.recommended
          ? (this.recommendedDetected ? 'TU REGIÓN · ' : 'SUGERIDA · ') +
            (this.recommended.label || this.recommended.name)
          : 'SIN REGIÓN DETECTADA';
      }
      if (this.error) this.setStatus(this.error);
      else if (!this.loading && this.regions.length) {
        const playerWord = this.totalPlayers === 1 ? ' jugador' : ' jugadores';
        this.setStatus(this.regions.length + ' servidores visibles · ' + this.totalPlayers + playerWord + ' en línea');
      }

      if (!this.el.regions) return;
      this.el.regions.textContent = '';
      if (!this.regions.length) {
        const empty = el('div', 'server-empty');
        empty.appendChild(el('b', null, this.loading ? 'BUSCANDO SERVIDORES' : 'RED NO DISPONIBLE'));
        empty.appendChild(el('p', null, this.loading
          ? 'Consultando regiones y salas activas...'
          : 'Inicia el servidor con npm start y abre el juego desde esa dirección.'));
        this.el.regions.appendChild(empty);
        if (this.el.rooms) this.el.rooms.textContent = '';
        return;
      }
      for (const region of this.regions) {
        const btn = el('button', 'server-region');
        btn.type = 'button';
        btn.dataset.key = region.key;
        btn.classList.toggle('active', region.key === this.selectedKey);
        btn.classList.toggle('recommended', !!region.recommended);
        btn.setAttribute('aria-pressed', region.key === this.selectedKey ? 'true' : 'false');
        const flag = el('span', 'sr-flag', region.flag || '🌐');
        const copy = el('span', 'sr-copy');
        const title = el('b', null, region.label || region.name || 'Servidor');
        const sub = el('small', null, (region.city || region.scope || 'Online') + (this.nodes.length > 1 ? ' · ' + (region.nodeLabel || 'Nodo') : ''));
        copy.appendChild(title);
        copy.appendChild(sub);
        const live = el('span', 'sr-live');
        const dot = el('i', 'live-dot');
        live.appendChild(dot);
        live.appendChild(document.createTextNode(String(region.players || 0)));
        const ping = el('span', 'sr-ping', fmtPing(region.ping));
        btn.appendChild(flag);
        btn.appendChild(copy);
        btn.appendChild(live);
        btn.appendChild(ping);
        if (region.recommended) {
          const badge = el('em', 'sr-badge', 'TU REGIÓN');
          btn.appendChild(badge);
        }
        btn.addEventListener('click', () => {
          this.selectedKey = region.key;
          window.gameAudio.play('click');
          this.render();
        });
        this.el.regions.appendChild(btn);
      }
      this.renderRooms();
    }

    renderRooms() {
      if (!this.el.rooms) return;
      const region = this.regions.find((r) => r.key === this.selectedKey) || this.regions[0];
      if (!region) {
        this.el.rooms.textContent = '';
        return;
      }
      if (this.el.roomTitle) this.el.roomTitle.textContent = region.label || region.name;
      this.el.rooms.textContent = '';
      const rooms = (region.rooms || []).slice().sort((a, b) => {
        if (a.variant !== b.variant) return a.variant === 'classic' ? -1 : 1;
        return (a.name || '').localeCompare(b.name || '', 'es');
      });
      for (const room of rooms) {
        const card = el('article', 'server-room' + (room.variant === 'halloween' ? ' event' : ''));
        const head = el('div', 'room-head');
        const titleWrap = el('div', 'room-title');
        const title = el('b', null, room.name || 'Arena principal');
        const meta = el('small', null,
          (room.variant === 'halloween' ? 'Halloween · dulces' : 'Clásico · monedas') +
          ' · ' + (room.players || 0) + '/' + (room.capacity || 16) + ' conectados');
        titleWrap.appendChild(title);
        titleWrap.appendChild(meta);
        head.appendChild(titleWrap);
        const badge = el('span', 'room-badge', room.variant === 'halloween' ? 'EVENTO' : 'NORMAL');
        head.appendChild(badge);
        const foot = el('div', 'room-foot');
        const state = el('span', 'room-state');
        const dot = el('i', 'live-dot');
        state.appendChild(dot);
        state.appendChild(document.createTextNode(
          room.full ? 'SALA LLENA' : (room.players ? (room.players === 1 ? '1 jugador' : room.players + ' jugadores') : 'SALA LIBRE')
        ));
        const join = el('button', 'btn btn-primary btn-room', 'ENTRAR');
        join.type = 'button';
        join.disabled = !!room.full || this.joining;
        join.addEventListener('click', () => {
          window.gameAudio.play('click');
          this.joinRoom(region, room);
        });
        foot.appendChild(state);
        foot.appendChild(join);
        card.appendChild(head);
        card.appendChild(foot);
        this.el.rooms.appendChild(card);
      }
    }

    quickJoin() {
      if (this.joining) return;
      const region = this.recommended || this.regions[0];
      if (!region) {
        this.loadServers(true);
        return;
      }
      const wanted = this.preferredVariant === 'halloween' ? 'halloween' : 'classic';
      const room = (region.rooms || []).find((r) => r.variant === wanted && !r.full) ||
        (region.rooms || []).find((r) => r.variant === 'classic' && !r.full) ||
        (region.rooms || []).find((r) => !r.full);
      if (!room) {
        this.setStatus('Todas las salas de esa región están llenas.');
        return;
      }
      this.selectedKey = region.key;
      this.render();
      this.joinRoom(region, room);
    }

    joinRoom(region, room) {
      if (this.joining || this.session) return;
      const endpoint = cleanEndpoint(room.endpoint || region.endpoint) || this.defaultOrigin();
      const wsUrl = wsUrlFor(endpoint);
      this.joining = true;
      this.renderRooms();
      this.setStatus('Conectando con ' + (region.label || region.name) + ' · ' + (room.name || 'Arena') + '...');
      let settled = false;
      const ws = new WebSocket(wsUrl);
      this.pendingSocket = ws;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.failConnect('El servidor tardó demasiado en responder.', ws);
      }, 10000);

      ws.onopen = () => {
        const save = this.game.save;
        ws.send(JSON.stringify({
          t: 'join',
          name: save.name || 'Jugador#1',
          skinId: save.skin || 'ion',
          outfit: save.outfit || 'none',
          accessory: save.accessory || 'none',
          upgrades: save.upgrades || {},
          roomId: room.id,
          regionId: room.regionId || region.id,
          variant: room.variant || 'classic',
          tz: (() => {
            try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; }
          })()
        }));
      };

      ws.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch (e) { return; }
        if (msg.t === 'hello') return;
        if (msg.t === 'joined') {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          ws.onmessage = null;
          ws.onerror = null;
          ws.onclose = null;
          this.joining = false;
          this.pendingSocket = null;
          this.el.overlay.classList.add('hidden');
          document.body.classList.remove('server-open');
          this.selectedKey = region.key;
          const session = new OnlineSession(this.game, ws, msg, room);
          this.session = session;
          this.game.save.online = this.game.save.online || {};
          this.game.save.online.region = region.id;
          this.game.save.online.room = room.id;
          this.game.save.online.lastJoin = Date.now();
          if (NS.Save) NS.Save.write();
          this.game.beginOnlineSession(session);
        } else if (msg.t === 'error') {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          this.failConnect(msg.message || 'No se pudo entrar a la sala.', ws);
        }
      };
      ws.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.failConnect('No se pudo abrir el WebSocket. Revisa la URL y el puerto.', ws);
      };
      ws.onclose = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.failConnect('El servidor cerró la conexión antes de entrar.', ws);
      };
    }

    failConnect(message, ws) {
      this.joining = false;
      this.pendingSocket = null;
      this.setStatus(message);
      this.renderRooms();
      this.game.ui.toast('SERVIDOR NO DISPONIBLE', message, 'pink', 'i-users');
      try { ws.close(); } catch (e) { /* ignore */ }
    }

    leaveCurrent() {
      if (!this.session) return;
      const s = this.session;
      this.session = null;
      s.leave();
    }
  }

  NS.Online = new OnlineManager();
  NS.Online.NetSnake = NetSnake;
  NS.Online.OnlineSession = OnlineSession;
})();

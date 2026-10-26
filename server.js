/* ============================================================
   NEON SERPENT — Servidor online autoritativo
   HTTP + WebSocket. Sin dependencias de UI.
   ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

let PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const VERSION = '2.0.0';
const TICK_MS = 33;
const SNAPSHOT_MS = 80;
const ROOM_CAP = 16;
const WORLD_RADIUS = 3200;
const TRAIL_STEP = 4;
const BASE_SPEED = 212;
const BOOST_SPEED = 386;
const TURN_RATE = 4.65;
const BOOST_DRAIN = 13.5;
const BOOST_MIN_MASS = 20;
const START_MASS = 26;
const MAX_MASS = 5000;
const MAX_BODY_SEGMENTS = 360;
const COMBO_WINDOW = 2.1;
const POWERUP_RESPAWN = 26;

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
const angleDiff = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
const approachAngle = (current, target, maxStep) => current + clamp(angleDiff(current, target), -maxStep, maxStep);

const FOOD_COLORS = ['#22f5e2', '#ff2fb3', '#c6ff3d', '#ffc94a', '#9d6bff', '#56a8ff', '#ff7a5c'];
const HALLOWEEN_COLORS = ['#ff8a3d', '#ffd76a', '#c6ff3d', '#ff5c8a', '#9d6bff', '#56a8ff', '#ff7a5c'];
const POWERUP_DEFS = {
  invincible: { duration: 15, color: '#ffd76a' },
  magnet: { duration: 30, color: '#ff2fb3' },
  jackpot: { duration: 0, color: '#c6ff3d' },
  zoom: { duration: 20, color: '#56a8ff' }
};
const POWERUP_IDS = Object.keys(POWERUP_DEFS);

/* ============================================================
   REGIONES Y SERVIDORES
   Cada nodo puede hospedar una o varias regiones con HOSTED_REGIONS.
   ============================================================ */
const ALL_REGIONS = [
  {
    id: 'mexico', name: 'México', label: 'México · Centro', flag: '🇲🇽',
    city: 'Ciudad de México', scope: 'México, Centroamérica y Caribe',
    tz: ['America/Mexico', 'America/Guatemala', 'America/Belize', 'America/El_Salvador',
      'America/Tegucigalpa', 'America/Managua', 'America/Costa_Rica', 'America/Panama',
      'America/Havana', 'America/Santo_Domingo', 'America/Puerto_Rico']
  },
  {
    id: 'sudamerica', name: 'Sudamérica', label: 'Sudamérica · Sur', flag: '🇦🇷',
    city: 'Buenos Aires', scope: 'Argentina, Chile, Perú, Colombia y vecinos',
    tz: ['America/Argentina', 'America/Santiago', 'America/Lima', 'America/Bogota',
      'America/Caracas', 'America/La_Paz', 'America/Asuncion', 'America/Montevideo',
      'America/Guayaquil', 'America/Cayenne']
  },
  {
    id: 'brasil', name: 'Brasil', label: 'Brasil · Atlántico', flag: '🇧🇷',
    city: 'São Paulo', scope: 'Brasil',
    tz: ['America/Sao_Paulo', 'America/Bahia', 'America/Fortaleza', 'America/Recife',
      'America/Belem', 'America/Cuiaba', 'America/Manaus', 'America/Rio_Branco']
  },
  {
    id: 'usa', name: 'Estados Unidos', label: 'EE. UU. · Este', flag: '🇺🇸',
    city: 'Virginia', scope: 'Estados Unidos y Canadá',
    tz: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
      'America/Toronto', 'America/Vancouver', 'America/Anchorage', 'Pacific/Honolulu']
  },
  {
    id: 'europa', name: 'Europa', label: 'Europa · Central', flag: '🇪🇺',
    city: 'Fráncfort', scope: 'España, Europa y Reino Unido',
    tz: ['Europe/Madrid', 'Europe/Lisbon', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome',
      'Europe/London', 'Europe/Amsterdam', 'Europe/Brussels', 'Europe/Vienna',
      'Europe/Zurich', 'Europe/Stockholm', 'Europe/Oslo', 'Europe/Copenhagen',
      'Europe/Warsaw', 'Europe/Prague', 'Europe/Budapest', 'Europe/Athens',
      'Europe/Bucharest', 'Europe/Kiev', 'Europe/Istanbul', 'Europe/Moscow']
  },
  {
    id: 'asia', name: 'Asia', label: 'Asia · Pacífico', flag: '🌏',
    city: 'Singapur', scope: 'Asia y Oceanía',
    tz: ['Asia/', 'Australia/', 'Pacific/Auckland', 'Pacific/Port_Moresby']
  }
];

const HOSTED = (process.env.HOSTED_REGIONS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const REGIONS = HOSTED.length
  ? ALL_REGIONS.filter((r) => HOSTED.includes(r.id))
  : ALL_REGIONS;
const REGION_MAP = new Map(REGIONS.map((r) => [r.id, r]));
const NODE_ID = (process.env.NODE_ID || os.hostname() || 'nodo-local').slice(0, 40);
const NODE_LABEL = (process.env.NODE_LABEL || 'Nodo principal').slice(0, 50);

function regionForTimezone(tz) {
  if (!tz) return null;
  for (const region of ALL_REGIONS) {
    for (const prefix of region.tz) {
      if (tz === prefix || tz.startsWith(prefix)) return region.id;
    }
  }
  return null;
}

/* ============================================================
   SALAS Y MUNDO
   ============================================================ */
const rooms = new Map();
let snakeSeq = 1;
let foodSeq = 1;
let powerSeq = 1;
let playerSeq = 1;

function roomKey(regionId, variant) {
  return regionId + (variant === 'halloween' ? '-event' : '-main');
}

function ensureRoom(regionId, variant) {
  const region = REGION_MAP.get(regionId);
  if (!region) return null;
  const id = roomKey(regionId, variant);
  let room = rooms.get(id);
  if (!room) {
    room = new Room(region, variant === 'halloween' ? 'halloween' : 'classic', id, variant === 'halloween' ? 'Noche de Halloween' : 'Arena principal');
    rooms.set(id, room);
  }
  return room;
}

class Room {
  constructor(region, variant, id, name) {
    this.region = region;
    this.variant = variant;
    this.id = id;
    this.name = name;
    this.capacity = ROOM_CAP;
    this.players = new Map();
    this.snakes = new Map();
    this.foods = new Map();
    this.powerups = new Map();
    this.powerRespawns = [];
    this.events = [];
    this.pendingFoodAdd = [];
    this.pendingFoodDel = [];
    this.time = 0;
    this.tick = 0;
    this.lastTickAt = 0;
    this.lastSnapshotAt = 0;
    this.seq = 1;
    this.initialized = false;
    this.initializeWorld();
  }

  initializeWorld() {
    if (this.initialized) return;
    this.initialized = true;
    const normal = this.variant === 'halloween' ? 430 : 470;
    for (let i = 0; i < normal; i++) this.spawnFood('normal', true);
    for (let i = 0; i < 14; i++) this.spawnFood('rare', true);
    for (const id of POWERUP_IDS) this.spawnPowerup(id, true);
  }

  info() {
    let alive = 0;
    for (const p of this.players.values()) if (p.alive) alive++;
    return {
      id: this.id,
      name: this.name,
      regionId: this.region.id,
      variant: this.variant,
      players: this.players.size,
      alive,
      capacity: this.capacity,
      full: this.players.size >= this.capacity
    };
  }

  randomPoint(margin) {
    const m = margin || 120;
    const a = rand(0, TAU);
    const r = Math.sqrt(Math.random()) * Math.max(120, WORLD_RADIUS - m);
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  }

  findSpawnPoint(clearance) {
    let best = this.randomPoint(320);
    let bestScore = -1;
    for (let tries = 0; tries < 34; tries++) {
      const p = this.randomPoint(360);
      let minD = 1e12;
      for (const s of this.snakes.values()) {
        if (!s.alive) continue;
        let d = dist2(p.x, p.y, s.x, s.y);
        if (d < minD) minD = d;
        const pts = s.bodyPoints;
        for (let i = 0; i < pts.length; i += 9) {
          d = dist2(p.x, p.y, pts[i].x, pts[i].y);
          if (d < minD) minD = d;
        }
      }
      if (minD > bestScore) {
        bestScore = minD;
        best = p;
      }
      if (minD > clearance * clearance) return p;
    }
    return best;
  }

  spawnFood(kind, initial) {
    const rare = kind === 'rare';
    const spice = this.variant === 'halloween';
    const p = this.randomPoint(220);
    const id = 'f' + (foodSeq++);
    const color = pick(spice ? HALLOWEEN_COLORS : FOOD_COLORS);
    const food = {
      i: id,
      x: +p.x.toFixed(2),
      y: +p.y.toFixed(2),
      k: rare ? 'rare' : 'normal',
      c: color,
      v: rare ? +rand(13, 21).toFixed(2) : +rand(2.3, 4.5).toFixed(2),
      r: rare ? +rand(1.35, 1.8).toFixed(2) : +rand(.8, 1.3).toFixed(2),
      p: +rand(0, TAU).toFixed(2),
      ca: spice,
      cs: spice ? randInt(0, 3) : 0,
      age: 0,
      life: 99999
    };
    if (spice) {
      food.v = rare ? +rand(15, 24).toFixed(2) : +rand(3, 5.5).toFixed(2);
    }
    this.foods.set(id, food);
    if (!initial) this.pendingFoodAdd.push(food);
    return food;
  }

  spawnDrop(x, y, value, color) {
    const id = 'f' + (foodSeq++);
    const a = rand(0, TAU);
    const d = rand(12, 54);
    const food = {
      i: id,
      x: +(x + Math.cos(a) * d).toFixed(2),
      y: +(y + Math.sin(a) * d).toFixed(2),
      k: 'normal',
      c: color || pick(FOOD_COLORS),
      v: +Math.max(.4, value).toFixed(2),
      r: +rand(.55, .95).toFixed(2),
      p: +rand(0, TAU).toFixed(2),
      ca: this.variant === 'halloween',
      cs: randInt(0, 3),
      age: 0,
      life: 30
    };
    this.foods.set(id, food);
    this.pendingFoodAdd.push(food);
    return food;
  }

  spawnPowerup(type, initial) {
    const p = this.randomPoint(360);
    const id = 'p' + (powerSeq++);
    const def = POWERUP_DEFS[type];
    const item = {
      i: id,
      t: type,
      x: +p.x.toFixed(2),
      y: +p.y.toFixed(2),
      p: +rand(0, TAU).toFixed(2),
      r: 15,
      c: def.color
    };
    this.powerups.set(id, item);
    return item;
  }

  addPlayer(ws, hello) {
    if (this.players.size >= this.capacity) return { error: 'La sala está llena. Prueba otra región o sala.' };
    const id = 'u' + (playerSeq++).toString(36) + crypto.randomBytes(3).toString('hex');
    const name = sanitizeName(hello.name, id);
    const player = {
      id,
      ws,
      name,
      skinId: sanitizeId(hello.skinId, 'neon-prime'),
      outfit: sanitizeId(hello.outfit, 'none'),
      accessory: sanitizeId(hello.accessory, 'none'),
      input: { a: 0, b: false },
      alive: false,
      kills: 0,
      deaths: 0,
      joinedAt: Date.now(),
      lastInputAt: 0,
      lastPing: 0
    };
    this.players.set(id, player);
    ws.playerId = id;
    ws.room = this;
    const snake = this.spawnSnake(player);
    player.alive = true;
    const state = {
      t: 'joined',
      id,
      room: Object.assign(this.info(), { node: NODE_ID, nodeLabel: NODE_LABEL }),
      st: +this.time.toFixed(3),
      worldRadius: WORLD_RADIUS,
      tickRate: 1000 / TICK_MS,
      snapshotRate: 1000 / SNAPSHOT_MS,
      snakes: [...this.snakes.values()].map((s) => s.wire()),
      foods: [...this.foods.values()],
      powerups: [...this.powerups.values()].map(powerWire)
    };
    send(ws, state);
    this.pushEvent({ k: 'join', pid: id, n: name });
    return { player, snake };
  }

  spawnSnake(player) {
    const p = this.findSpawnPoint(420);
    const snake = new ServerSnake(this, player, p.x, p.y);
    this.snakes.set(player.id, snake);
    player.alive = true;
    return snake;
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (!player) return;
    this.players.delete(id);
    this.snakes.delete(id);
    if (player.ws) {
      player.ws.playerId = null;
      player.ws.room = null;
    }
    this.pushEvent({ k: 'leave', pid: id, n: player.name });
  }

  setInput(playerId, angle, boost) {
    const player = this.players.get(playerId);
    if (!player) return;
    if (Number.isFinite(angle)) {
      player.input.a = Math.atan2(Math.sin(angle), Math.cos(angle));
    }
    player.input.b = !!boost;
    player.lastInputAt = Date.now();
  }

  update(dt) {
    if (!this.players.size) return;
    this.time += dt;
    this.tick++;

    // Reapariciones programadas de potenciadores.
    for (let i = this.powerRespawns.length - 1; i >= 0; i--) {
      const item = this.powerRespawns[i];
      item.at -= dt;
      if (item.at <= 0) {
        this.powerRespawns.splice(i, 1);
        this.spawnPowerup(item.type, false);
      }
    }

    const live = [...this.snakes.values()].filter((s) => s.alive);
    for (const snake of live) {
      snake.update(dt, snake.player.input);
      this.handleMagnet(snake, dt);
    }

    // Comida
    for (const snake of live) {
      if (!snake.alive) continue;
      const eatR = snake.radius + 7;
      for (const food of [...this.foods.values()]) {
        if (!snake.alive) break;
        const rr = eatR + food.r * 4.2;
        if (dist2(snake.x, snake.y, food.x, food.y) <= rr * rr) {
          this.foods.delete(food.i);
          this.pendingFoodDel.push(food.i);
          snake.eat(food);
          this.pushEvent({
            k: 'eat',
            pid: snake.id,
            rare: food.k === 'rare',
            candy: !!food.ca,
            x: +food.x.toFixed(1),
            y: +food.y.toFixed(1)
          });
          if (this.foods.size < (this.variant === 'halloween' ? 430 : 470)) this.spawnFood('normal', false);
        }
      }
    }

    // Potenciadores
    for (const snake of live) {
      if (!snake.alive) continue;
      for (const item of [...this.powerups.values()]) {
        const rr = snake.radius + 22;
        if (dist2(snake.x, snake.y, item.x, item.y) <= rr * rr) {
          this.powerups.delete(item.i);
          this.collectPowerup(snake, item);
        }
      }
    }

    // Rango antes de resolver choques.
    this.updateRanks();

    // Choques
    this.handleCollisions();

    // Reponer comida especial con el tiempo.
    let rare = 0;
    for (const f of this.foods.values()) if (f.k === 'rare') rare++;
    if (rare < 14 && Math.random() < .08) this.spawnFood('rare', false);

    // Envejecimiento de restos (solo drops con vida corta).
    for (const food of [...this.foods.values()]) {
      if (food.life > 1000) continue;
      food.age += dt;
      if (food.age >= food.life) {
        this.foods.delete(food.i);
        this.pendingFoodDel.push(food.i);
      }
    }

    this.updateRanks();

    if (this.time - this.lastSnapshotAt >= SNAPSHOT_MS / 1000) {
      this.lastSnapshotAt = this.time;
      this.broadcastSnapshot();
    }
  }

  handleMagnet(snake, dt) {
    if (this.time >= snake.powerMagnetUntil) return;
    const range = 360 + snake.radius * 2;
    const range2 = range * range;
    for (const food of this.foods.values()) {
      const d2 = dist2(snake.x, snake.y, food.x, food.y);
      if (d2 > range2 || d2 < 1) continue;
      const d = Math.sqrt(d2);
      const pull = Math.min(d, (120 + 480 / Math.max(1, d / 40)) * dt);
      food.x += (snake.x - food.x) / d * pull;
      food.y += (snake.y - food.y) / d * pull;
    }
  }

  collectPowerup(snake, item) {
    const def = POWERUP_DEFS[item.t];
    if (!def) return;
    if (item.t === 'invincible') snake.powerInvincibleUntil = this.time + def.duration;
    else if (item.t === 'magnet') snake.powerMagnetUntil = this.time + def.duration;
    else if (item.t === 'zoom') snake.powerZoomUntil = this.time + def.duration;
    else if (item.t === 'jackpot') {
      snake.mass = Math.min(MAX_MASS, snake.mass + 175);
      snake.peakMass = Math.max(snake.peakMass, snake.mass);
      snake.computeDerived();
      snake.updateBody();
    }
    snake.powerupsUsed++;
    this.powerRespawns.push({ type: item.t, at: POWERUP_RESPAWN });
    this.pushEvent({ k: 'power', pid: snake.id, p: item.t, x: item.x, y: item.y });
  }

  buildBodyGrid() {
    const cell = 128;
    const grid = new Map();
    for (const snake of this.snakes.values()) {
      if (!snake.alive) continue;
      const pts = snake.bodyPoints;
      for (let i = 4; i < pts.length; i += 2) {
        const p = pts[i];
        const key = (Math.floor(p.x / cell) + 64) * 512 + (Math.floor(p.y / cell) + 64);
        let arr = grid.get(key);
        if (!arr) {
          arr = [];
          grid.set(key, arr);
        }
        arr.push(p.x, p.y, snake);
      }
    }
    return grid;
  }

  handleCollisions() {
    const snakes = [...this.snakes.values()].filter((s) => s.alive);
    if (snakes.length === 0) return;

    for (const snake of snakes) {
      if (!snake.alive) continue;
      if (Math.hypot(snake.x, snake.y) > WORLD_RADIUS - 3) {
        this.killSnake(snake, 'wall', null);
      }
    }

    const grid = this.buildBodyGrid();
    const cell = 128;

    // Choques frontales.
    for (let i = 0; i < snakes.length; i++) {
      const a = snakes[i];
      if (!a.alive || a.invuln > 0 || this.time < a.powerInvincibleUntil) continue;
      for (let j = i + 1; j < snakes.length; j++) {
        const b = snakes[j];
        if (!b.alive || b.invuln > 0 || this.time < b.powerInvincibleUntil) continue;
        const rr = (a.radius + b.radius) * .74;
        if (dist2(a.x, a.y, b.x, b.y) < rr * rr) {
          this.killSnake(a, 'head', b);
          if (b.alive) this.killSnake(b, 'head', a);
        }
      }
    }

    // Cabeza contra cuerpo ajeno.
    for (const snake of snakes) {
      if (!snake.alive || snake.invuln > 0 || this.time < snake.powerInvincibleUntil) continue;
      const prevX = Number.isFinite(snake.prevX) ? snake.prevX : snake.x;
      const prevY = Number.isFinite(snake.prevY) ? snake.prevY : snake.y;
      const checkCells = new Set();
      const addCells = (x, y) => {
        const cx = Math.floor(x / cell) + 64;
        const cy = Math.floor(y / cell) + 64;
        for (let ox = -1; ox <= 1; ox++) {
          for (let oy = -1; oy <= 1; oy++) checkCells.add((cx + ox) * 512 + (cy + oy));
        }
      };
      addCells(snake.x, snake.y);
      addCells(prevX, prevY);
      let dead = false;
      for (const key of checkCells) {
        const arr = grid.get(key);
        if (!arr) continue;
        for (let k = 0; k < arr.length; k += 3) {
          const ox = arr[k], oy = arr[k + 1], owner = arr[k + 2];
          if (!owner.alive || owner === snake) continue;
          const rr = snake.radius * .8 + owner.radius * .84;
          if (pointSegDist2(ox, oy, prevX, prevY, snake.x, snake.y) < rr * rr) {
            this.killSnake(snake, 'body', owner);
            dead = true;
            break;
          }
        }
        if (dead) break;
      }
    }
  }

  killSnake(snake, cause, killer) {
    if (!snake.alive) return false;
    if (snake.invuln > 0 || this.time < snake.powerInvincibleUntil) return false;
    const player = snake.player;
    const rank = snake.rank || 99;
    snake.alive = false;
    this.snakes.delete(snake.id);
    player.alive = false;
    player.deaths++;

    const drops = cause === 'wall' ? 10 : 12;
    for (let i = 0; i < drops; i++) {
      this.spawnDrop(snake.x, snake.y, snake.mass * .035, snake.skinColor || pick(FOOD_COLORS));
    }

    if (killer && killer.alive) {
      killer.kills++;
      if (killer.player && killer.player.ws && killer.player.ws.readyState === WebSocket.OPEN) {
        send(killer.player.ws, {
          t: 'kill',
          name: player.name,
          total: killer.kills,
          by: cause
        });
      }
    }

    this.pushEvent({
      k: 'death',
      pid: player.id,
      v: player.name,
      kn: killer ? killer.player.name : null,
      kp: killer ? killer.player.id : null,
      c: cause
    });

    const event = this.deathResults(snake, cause, killer, rank);
    if (player.ws && player.ws.readyState === WebSocket.OPEN) {
      send(player.ws, { t: 'you-died', res: event });
    }
    return true;
  }

  deathResults(snake, cause, killer, rank) {
    const event = this.variant === 'halloween';
    const score = Math.floor(snake.mass + snake.kills * 45 + snake.orbs * 1.4 + snake.timeAlive * 1.1);
    const coins = event ? 0 : Math.max(4, Math.floor(score * .35 + snake.kills * 14 + snake.timeAlive * .35));
    const candies = event ? Math.max(8, Math.floor(score * .24 + snake.kills * 7 + snake.timeAlive * .2 + snake.orbs * .12)) : 0;
    let causeText;
    if (cause === 'wall') causeText = 'Te estrellaste contra el muro de contención.';
    else if (cause === 'head') causeText = killer ? 'Choque frontal contra ' + killer.player.name + '.' : 'Choque frontal contra otra serpiente.';
    else causeText = killer ? 'Chocaste contra el cuerpo de ' + killer.player.name + '.' : 'Chocaste contra el cuerpo de otra serpiente.';
    return {
      id: 'd' + crypto.randomBytes(5).toString('hex'),
      score,
      coins,
      candies,
      kills: snake.kills,
      orbs: snake.orbs,
      time: snake.timeAlive,
      mass: Math.floor(snake.mass),
      rank,
      cause,
      causeText,
      killerName: killer ? killer.player.name : null,
      currency: event ? 'candy' : 'coins',
      reward: event ? candies : coins,
      variant: this.variant,
      room: this.id,
      region: this.region.id,
      serverTime: this.time
    };
  }

  updateRanks() {
    const alive = [...this.snakes.values()].filter((s) => s.alive);
    alive.sort((a, b) => b.mass - a.mass);
    for (let i = 0; i < alive.length; i++) {
      alive[i].rank = i + 1;
      alive[i].isLeader = i === 0;
    }
  }

  pushEvent(event) {
    this.events.push(event);
    if (this.events.length > 48) this.events.splice(0, this.events.length - 48);
  }

  broadcastSnapshot() {
    if (!this.players.size) return;
    const alive = [...this.snakes.values()].filter((s) => s.alive);
    alive.sort((a, b) => b.mass - a.mass);
    const msg = {
      t: 's',
      st: +this.time.toFixed(3),
      tick: this.tick,
      snakes: alive.map((s) => s.wire()),
      powerups: [...this.powerups.values()].map(powerWire),
      fa: this.pendingFoodAdd,
      fd: this.pendingFoodDel,
      ev: this.events
    };
    this.pendingFoodAdd = [];
    this.pendingFoodDel = [];
    this.events = [];
    const text = JSON.stringify(msg);
    for (const player of this.players.values()) {
      const ws = player.ws;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(text); } catch (e) { /* ignore */ }
      }
    }
  }
}

/* ============================================================
   SERPIENTE DEL SERVIDOR
   ============================================================ */
class ServerSnake {
  constructor(room, player, x, y) {
    this.room = room;
    this.player = player;
    this.id = player.id;
    this.name = player.name;
    this.skinId = player.skinId;
    this.outfit = player.outfit;
    this.accessory = player.accessory;
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.angle = Math.atan2(-y, -x) + rand(-.4, .4);
    this.targetAngle = this.angle;
    this.mass = START_MASS;
    this.peakMass = this.mass;
    this.alive = true;
    this.boosting = false;
    this.invuln = 3.4;
    this.kills = 0;
    this.orbs = 0;
    this.combo = 0;
    this.comboBest = 0;
    this.lastEatTime = -99;
    this.powerInvincibleUntil = -1;
    this.powerMagnetUntil = -1;
    this.powerZoomUntil = -1;
    this.powerupsUsed = 0;
    this.shieldCharges = 0;
    this.timeAlive = 0;
    this.rank = 99;
    this.isLeader = false;
    this.boostDrop = 0;
    this.skinColor = colorForSkin(player.skinId);
    this.trail = [];
    this.trailAnchor = { x, y };
    this.bodyPoints = [];
    this.computeDerived();
    this.initTrail();
    this.updateBody();
  }

  computeDerived() {
    this.radius = 9.4 + Math.log1p(this.mass / 46) * 2.35;
    this.segmentCount = Math.min(MAX_BODY_SEGMENTS, 20 + Math.floor(this.mass * .52));
    this.segmentSpacing = Math.max(4.2, this.radius * .47);
  }

  initTrail() {
    this.trail.length = 0;
    const needed = this.segmentCount * this.segmentSpacing + 58;
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
    let d = Math.hypot(dx, dy);
    let guard = 0;
    while (d >= TRAIL_STEP && guard++ < 36) {
      const t = TRAIL_STEP / d;
      const px = this.trailAnchor.x + dx * t;
      const py = this.trailAnchor.y + dy * t;
      this.trail.push({ x: px, y: py });
      this.trailAnchor.x = px;
      this.trailAnchor.y = py;
      dx = this.x - px;
      dy = this.y - py;
      d = Math.hypot(dx, dy);
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

  update(dt, input) {
    if (!this.alive) return;
    this.timeAlive += dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.combo > 0 && this.room.time - this.lastEatTime > COMBO_WINDOW) this.combo = 0;

    const target = input && Number.isFinite(input.a) ? input.a : this.angle;
    const turnScale = 1.02;
    const turnRate = TURN_RATE * turnScale * (1 - clamp((this.radius - 10) / 44, 0, .34));
    this.angle = approachAngle(this.angle, target, turnRate * dt);

    const invincible = this.room.time < this.powerInvincibleUntil;
    const wantBoost = !!(input && input.b);
    this.boosting = invincible || (wantBoost && this.mass > BOOST_MIN_MASS + .5);
    let speed = BASE_SPEED;
    if (this.boosting) {
      if (!invincible) {
        const drain = BOOST_DRAIN * .94 * dt;
        this.mass = Math.max(BOOST_MIN_MASS, this.mass - drain);
        if (this.mass <= BOOST_MIN_MASS + .5) this.boosting = false;
        this.boostDrop += drain * .68;
        if (this.boostDrop >= 1.35) {
          const value = this.boostDrop;
          this.boostDrop = 0;
          this.room.spawnDrop(
            this.x - Math.cos(this.angle) * this.radius * 1.25,
            this.y - Math.sin(this.angle) * this.radius * 1.25,
            value,
            this.skinColor
          );
        }
      } else {
        this.boostDrop = 0;
      }
      speed = BOOST_SPEED * (invincible ? 1.05 : 1);
    } else {
      this.boostDrop = 0;
      if (this.peakMass > this.mass) this.peakMass = Math.max(this.mass, this.peakMass - dt * .2);
    }

    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    this.prevX = this.x;
    this.prevY = this.y;
    this.x += cos * speed * dt;
    this.y += sin * speed * dt;
    if (invincible) {
      const dc = Math.hypot(this.x, this.y);
      const maxR = WORLD_RADIUS - this.radius - 8;
      if (dc > maxR) {
        this.x *= maxR / dc;
        this.y *= maxR / dc;
      }
    }
    this.addTrail();
    this.computeDerived();
    this.updateBody();
  }

  eat(food) {
    let gain = food.v;
    if (this.room.time - this.lastEatTime <= COMBO_WINDOW) this.combo = Math.min(30, this.combo + 1);
    else this.combo = 1;
    gain *= 1 + Math.min(this.combo, 30) * .01;
    this.mass = Math.min(MAX_MASS, this.mass + gain);
    this.peakMass = Math.max(this.peakMass, this.mass);
    this.orbs++;
    this.lastEatTime = this.room.time;
    if (this.combo > this.comboBest) this.comboBest = this.combo;
    this.computeDerived();
  }

  wire() {
    return {
      i: this.id,
      n: this.name,
      sk: this.skinId,
      o: this.outfit,
      ac: this.accessory,
      x: +this.x.toFixed(2),
      y: +this.y.toFixed(2),
      a: +this.angle.toFixed(3),
      m: +this.mass.toFixed(2),
      b: this.boosting ? 1 : 0,
      al: 1,
      k: this.kills,
      r: this.rank,
      pi: +this.powerInvincibleUntil.toFixed(2),
      pm: +this.powerMagnetUntil.toFixed(2),
      pz: +this.powerZoomUntil.toFixed(2),
      sh: this.shieldCharges,
      inv: +Math.max(0, this.invuln).toFixed(2),
      ta: +this.timeAlive.toFixed(1),
      pk: +this.peakMass.toFixed(2),
      cm: this.combo
    };
  }
}

function powerWire(item) {
  return {
    i: item.i,
    t: item.t,
    x: +item.x.toFixed(2),
    y: +item.y.toFixed(2),
    p: item.p,
    r: item.r,
    c: item.c
  };
}

function pointSegDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist2(px, py, ax, ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = clamp(t, 0, 1);
  return dist2(px, py, ax + dx * t, ay + dy * t);
}

function sanitizeName(name, fallback) {
  let value = String(name || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (!value) value = 'Jugador#1';
  value = value.slice(0, 14);
  if (!value) value = fallback || 'Jugador#1';
  return value;
}

function sanitizeId(value, fallback) {
  const text = String(value || '').toLowerCase();
  return /^[a-z0-9_-]{1,42}$/.test(text) ? text : fallback;
}

function colorForSkin(skinId) {
  let hash = 0;
  for (let i = 0; i < skinId.length; i++) hash = (hash * 31 + skinId.charCodeAt(i)) | 0;
  return FOOD_COLORS[Math.abs(hash) % FOOD_COLORS.length];
}

/* ============================================================
   LISTADO DE SERVIDORES
   ============================================================ */
function regionSummaries(tz, origin) {
  const recommendedId = regionForTimezone(tz);
  return REGIONS.map((region) => {
    const main = ensureRoom(region.id, 'classic');
    const event = ensureRoom(region.id, 'halloween');
    const rooms = [main.info(), event.info()];
    let players = 0;
    for (const room of rooms) players += room.players;
    return {
      id: region.id,
      name: region.name,
      label: region.label,
      flag: region.flag,
      city: region.city,
      scope: region.scope,
      players,
      rooms,
      endpoint: origin,
      node: NODE_ID,
      nodeLabel: NODE_LABEL,
      recommended: region.id === recommendedId
    };
  });
}

/* ============================================================
   HTTP + ESTÁTICOS
   ============================================================ */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav'
};

const ALLOWED_FILES = new Set([
  'index.html',
  'NeonSerpent.Navegador.html',
  'styles.css',
  'audio.js',
  'core.js',
  'entities.js',
  'renderer.js',
  'ui.js',
  'online.js',
  'game.js',
  'servers.json',
  'favicon.ico'
]);

function originFromRequest(req) {
  const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() ||
    (req.socket.encrypted ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host || ('localhost:' + PORT);
  return proto + '://' + host;
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  try { rel = decodeURIComponent(rel); } catch (e) { res.writeHead(400); res.end('Bad request'); return; }
  rel = rel.replace(/\\/g, '/');
  if (rel.includes('..') || rel.startsWith('.')) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  const base = rel.split('/')[0];
  const isAsset = rel.startsWith('assets/');
  if (!isAsset && !ALLOWED_FILES.has(rel)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 · No encontrado');
    return;
  }
  if (isAsset && !/^assets\/[a-zA-Z0-9._/-]+$/.test(rel)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(path.resolve(ROOT))) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 · No encontrado');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const headers = {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff'
    };
    if (ext === '.json') headers['Access-Control-Allow-Origin'] = '*';
    if (req.method === 'HEAD') {
      res.writeHead(200, headers);
      res.end();
      return;
    }
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const started = Date.now();
  let url;
  try {
    url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  } catch (e) {
    res.writeHead(400); res.end('Bad request'); return;
  }
  const origin = originFromRequest(req);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }
  if (url.pathname === '/api/servers') {
    const tz = url.searchParams.get('tz') || '';
    const regions = regionSummaries(tz, origin);
    json(res, 200, {
      ok: true,
      version: VERSION,
      node: { id: NODE_ID, label: NODE_LABEL, endpoint: origin },
      hosted: REGIONS.map((r) => r.id),
      recommended: regionForTimezone(tz),
      totalPlayers: regions.reduce((sum, r) => sum + r.players, 0),
      regions,
      time: Date.now()
    });
    return;
  }
  if (url.pathname === '/api/ping') {
    json(res, 200, {
      ok: true,
      pong: Date.now(),
      node: NODE_ID,
      region: url.searchParams.get('region') || null,
      players: [...rooms.values()].reduce((n, r) => n + r.players.size, 0)
    });
    return;
  }
  if (url.pathname === '/health') {
    json(res, 200, { ok: true, uptime: process.uptime(), rooms: rooms.size, version: VERSION });
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    json(res, 404, { ok: false, error: 'API desconocida' });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405); res.end('Method not allowed'); return;
  }
  serveStatic(req, res, url.pathname);
  if (Date.now() - started > 40) { /* no-op; punto de depuración */ }
});

/* ============================================================
   WEBSOCKET
   ============================================================ */
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

function send(ws, obj) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try { ws.send(JSON.stringify(obj)); } catch (e) { /* ignore */ }
}

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.playerId = null;
  ws.room = null;
  ws.joinedAt = Date.now();
  ws.messageCount = 0;
  ws.windowStart = Date.now();

  send(ws, { t: 'hello', v: VERSION, node: NODE_ID, regions: REGIONS.map((r) => r.id) });

  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('error', () => { /* close handler limpia */ });
  ws.on('message', (raw) => {
    if (raw.length > 4096) return;
    let msg;
    try { msg = JSON.parse(String(raw)); } catch (e) { return; }
    if (!msg || typeof msg.t !== 'string') return;
    ws.messageCount++;
    if (Date.now() - ws.windowStart > 1000) {
      ws.windowStart = Date.now();
      ws.messageCount = 1;
    }
    if (ws.messageCount > 90) return; // límite anti-spam

    if (msg.t === 'join') {
      if (ws.room) return;
      const wanted = sanitizeId(msg.roomId, '');
      let room = wanted ? rooms.get(wanted) : null;
      if (!room) {
        const regionId = REGION_MAP.has(msg.regionId)
          ? msg.regionId
          : (regionForTimezone(msg.tz) || (REGIONS[0] && REGIONS[0].id));
        room = ensureRoom(regionId, msg.variant === 'halloween' ? 'halloween' : 'classic');
      }
      if (!room) {
        send(ws, { t: 'error', message: 'La región o sala no está disponible en este servidor.' });
        return;
      }
      const result = room.addPlayer(ws, msg);
      if (result.error) {
        send(ws, { t: 'error', message: result.error });
        return;
      }
      return;
    }

    const room = ws.room;
    if (!room || !ws.playerId) return;

    if (msg.t === 'i') {
      room.setInput(ws.playerId, Number(msg.a), !!msg.b);
    } else if (msg.t === 'respawn') {
      const player = room.players.get(ws.playerId);
      if (!player || player.alive) return;
      const snake = room.spawnSnake(player);
      send(ws, {
        t: 'respawned',
        id: player.id,
        snake: snake.wire(),
        st: +room.time.toFixed(3),
        snakes: [...room.snakes.values()].filter((s) => s.alive).map((s) => s.wire()),
        foodCount: room.foods.size
      });
      room.pushEvent({ k: 'respawn', pid: player.id, n: player.name });
    } else if (msg.t === 'ping') {
      send(ws, { t: 'pong', ts: msg.ts, st: room.time, node: NODE_ID });
    } else if (msg.t === 'leave') {
      room.removePlayer(ws.playerId);
    }
  });

  ws.on('close', () => {
    if (ws.room && ws.playerId) ws.room.removePlayer(ws.playerId);
    ws.room = null;
    ws.playerId = null;
  });
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      try { ws.terminate(); } catch (e) { /* ignore */ }
      continue;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) { /* ignore */ }
  }
}, 30000);
heartbeat.unref?.();

/* ============================================================
   LOOP DE SALAS
   ============================================================ */
let lastTick = Date.now();
const gameLoop = setInterval(() => {
  const now = Date.now();
  const dt = clamp((now - lastTick) / 1000, 0, .1);
  lastTick = now;
  for (const room of rooms.values()) {
    if (room.players.size === 0) continue;
    room.update(dt);
  }
}, TICK_MS);

function serverLabel(host, port) {
  const shown = host === '0.0.0.0' ? 'localhost' : host;
  const addresses = [];
  if (host === '0.0.0.0') {
    const nets = os.networkInterfaces();
    for (const list of Object.values(nets)) {
      for (const net of list || []) {
        if (net && net.family === 'IPv4' && !net.internal) addresses.push(net.address);
      }
    }
  }
  console.log('============================================================');
  console.log('  NEON SERPENT · SERVIDOR ONLINE');
  console.log('  http://' + shown + ':' + port);
  if (addresses.length) console.log('  LAN: http://' + addresses[0] + ':' + port);
  console.log('  WebSocket: ws://' + shown + ':' + port + '/ws');
  console.log('  Nodo: ' + NODE_ID + ' · ' + NODE_LABEL);
  console.log('  Regiones: ' + REGIONS.map((r) => r.name).join(' · '));
  console.log('  Salas activas/' + rooms.size + ' · Capacidad ' + ROOM_CAP + ' jugadores');
  console.log('============================================================');
}

function startServer(options) {
  const opts = options || {};
  const desiredPort = Number.isFinite(opts.port) ? opts.port : PORT;
  const desiredHost = opts.host || HOST;
  if (server.listening) {
    const address = server.address();
    return Promise.resolve({
      server,
      wss,
      port: address && typeof address === 'object' ? address.port : desiredPort,
      host: desiredHost,
      reused: true
    });
  }
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      const address = server.address();
      if (address && typeof address === 'object') PORT = address.port;
      serverLabel(desiredHost, PORT);
      resolve({ server, wss, port: PORT, host: desiredHost, reused: false });
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(desiredPort, desiredHost);
  });
}

function stopServer() {
  clearInterval(gameLoop);
  clearInterval(heartbeat);
  for (const ws of wss.clients) {
    try { ws.close(1001, 'Servidor cerrado'); } catch (e) { /* ignore */ }
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    if (!server.listening) {
      try { wss.close(() => finish()); } catch (e) { finish(); }
      setTimeout(finish, 800).unref();
      return;
    }
    try {
      wss.close(() => server.close(() => finish()));
    } catch (e) {
      try { server.close(() => finish()); } catch (err) { finish(); }
    }
    setTimeout(finish, 2500).unref();
  });
}

function shutdown(signal) {
  console.log('\n[' + signal + '] Cerrando servidor...');
  stopServer().finally(() => process.exit(0));
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('No se pudo iniciar el servidor:', err.message);
    process.exit(1);
  });
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = { server, wss, startServer, stopServer };

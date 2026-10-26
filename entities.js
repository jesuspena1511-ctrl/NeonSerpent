/* ============================================================
   NEON SERPENT — Entities: serpientes, comida, cámara, IA, FX
   ============================================================ */
(function () {
  'use strict';
  const NS = window.NS;
  const {
    TAU, clamp, lerp, rand, randInt, pick, dist2, hypot, approachAngle, smoothTo,
    CFG, FOOD_COLORS, GOLD, rgba
  } = NS;

  /* ============================================================
     SNAKE
     ============================================================ */
  class Snake {
    constructor(game, opts) {
      this.game = game;
      this.isPlayer = !!opts.isPlayer;
      this.name = opts.name || 'SERPIENTE';
      this.skin = opts.skin || NS.SKINS[0];
      this.skinId = this.skin.id;
      this.outfit = opts.outfit || 'none';
      this.accessory = opts.accessory || 'none';
      this.x = opts.x;
      this.y = opts.y;
      this.angle = opts.angle || 0;
      this.targetAngle = this.angle;
      this.mass = opts.mass || CFG.startMass;
      this.peakMass = this.mass;
      this.speedMod = opts.speedMod || 1;
      this.alive = true;
      this.boosting = false;
      this.boostDrop = 0;
      this.invuln = opts.invuln || 0;
      this.kills = 0;
      this.orbs = 0;
      this.combo = 0;
      this.comboBest = 0;
      this.lastEatTime = -99;
      this.shieldCharges = opts.shieldCharges || 0;
      this.shieldFlash = 0;
      this.timeAlive = 0;
      this.rank = 99;
      this.isLeader = false;
      this.powerInvincibleUntil = -1;
      this.powerMagnetUntil = -1;
      this.powerZoomUntil = -1;
      this.powerupsUsed = 0;
      this.trail = [];
      this.trailAnchor = { x: this.x, y: this.y };
      this.bodyPoints = [];
      this.brain = this.isPlayer ? null : new BotBrain(this, game);
      this.deathTimer = 0;
      this.spawnFlash = 1;
      this.computeDerived();
      this.initTrail();
      this.updateBody();
    }

    computeDerived() {
      this.radius = 9.4 + Math.log1p(this.mass / 46) * 2.35;
      this.segmentCount = Math.min(CFG.maxBodySegments, 20 + Math.floor(this.mass * 0.52));
      this.segmentSpacing = Math.max(4.2, this.radius * 0.47);
    }

    initTrail() {
      this.trail.length = 0;
      const needed = this.segmentCount * this.segmentSpacing + 40;
      const step = CFG.trailStep;
      const cos = Math.cos(this.angle);
      const sin = Math.sin(this.angle);
      for (let d = needed; d > 0; d -= step) {
        this.trail.push({ x: this.x - cos * d, y: this.y - sin * d });
      }
      this.trail.push({ x: this.x, y: this.y });
      this.trailAnchor.x = this.x;
      this.trailAnchor.y = this.y;
    }

    addTrail() {
      const step = CFG.trailStep;
      let dx = this.x - this.trailAnchor.x;
      let dy = this.y - this.trailAnchor.y;
      let d = hypot(dx, dy);
      let guard = 0;
      while (d >= step && guard++ < 40) {
        const t = step / d;
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
      const maxPts = Math.ceil(needed / step) + 14;
      if (this.trail.length > maxPts + 30) {
        this.trail.splice(0, this.trail.length - maxPts);
      }
    }

    updateBody() {
      const pts = [];
      const segs = this.segmentCount;
      const spacing = this.segmentSpacing;
      const step = CFG.trailStep;
      const len = this.trail.length;
      const startOffset = this.radius * 0.45;
      for (let i = 0; i < segs; i++) {
        const d = startOffset + i * spacing;
        const fi = len - 1 - d / step;
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

    update(dt, control) {
      if (!this.alive) return;
      this.timeAlive += dt;
      if (this.invuln > 0) this.invuln -= dt;
      if (this.shieldFlash > 0) this.shieldFlash -= dt;
      if (this.spawnFlash > 0) this.spawnFlash -= dt * .8;
      if (this.combo > 0 && this.game.time - this.lastEatTime > CFG.comboWindow) this.combo = 0;

      const target = control && Number.isFinite(control.targetAngle) ? control.targetAngle : this.angle;
      const sizePenalty = 1 - clamp((this.radius - 10) / 44, 0, .34);
      const turnScale = control && Number.isFinite(control.turnScale) ? control.turnScale : 1;
      const turnRate = CFG.turnRate * (this.isPlayer ? 1.02 : .92) * (this.isPlayer ? turnScale : this.speedMod) * sizePenalty;
      this.angle = approachAngle(this.angle, target, turnRate * dt);

      const wantBoost = !!(control && control.boost);
      const powerBoost = this.game.time < this.powerInvincibleUntil;
      const minMass = CFG.boostMinMass + (this.isPlayer ? 0 : 6);
      this.boosting = powerBoost || (wantBoost && this.mass > minMass + .5);
      let speed = CFG.baseSpeed * this.speedMod;
      if (this.boosting) {
        if (!powerBoost) {
          const save = this.isPlayer ? 1 - this.game.upgradeLevel('turbo') * .09 : .94;
          const drain = CFG.boostDrain * save * dt;
          this.mass = Math.max(minMass, this.mass - drain);
          if (this.mass <= minMass + .5) this.boosting = false;
          this.boostDrop += drain * .68;
          if (this.boostDrop >= 1.35) {
            const val = this.boostDrop;
            this.boostDrop = 0;
            const bx = this.x - Math.cos(this.angle) * this.radius * 1.25 + rand(-5, 5);
            const by = this.y - Math.sin(this.angle) * this.radius * 1.25 + rand(-5, 5);
            this.game.foods.spawnDrop(bx, by, this.skin.colors.glow, val);
          }
          this.game.onBoostDrop(this);
        } else {
          this.boostDrop = 0;
        }
        speed = CFG.boostSpeed * this.speedMod * (powerBoost ? 1.05 : 1);
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
      if (this.isPlayer && this.game.time < this.powerInvincibleUntil) {
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
    }

    eat(food) {
      let gain = food.value;
      if (this.isPlayer) gain *= 1 + this.game.upgradeLevel('harvest') * .07;
      if (this.isPlayer) gain *= 1 + Math.min(this.combo, 30) * .01;
      this.mass = Math.min(5000, this.mass + gain);
      this.peakMass = Math.max(this.peakMass, this.mass);
      this.orbs++;
      if (this.game.time - this.lastEatTime <= CFG.comboWindow) {
        this.combo = Math.min(30, this.combo + 1);
      } else {
        this.combo = 1;
      }
      this.lastEatTime = this.game.time;
      if (this.combo > this.comboBest) this.comboBest = this.combo;
      this.computeDerived();
    }

    teleport(x, y, angle) {
      this.x = x;
      this.y = y;
      this.angle = angle;
      this.targetAngle = angle;
      this.initTrail();
      this.updateBody();
      this.invuln = Math.max(this.invuln, 2.2);
      this.shieldFlash = 1;
    }

    get boostRatio() {
      const min = CFG.boostMinMass;
      const denom = Math.max(12, this.peakMass - min);
      return clamp((this.mass - min) / denom, 0, 1);
    }
  }

  /* ============================================================
     BOT BRAIN
     ============================================================ */
  class BotBrain {
    constructor(snake, game) {
      this.snake = snake;
      this.game = game;
      this.skill = rand(.42, 1);
      this.aggression = rand(.08, .85);
      this.greed = rand(.55, 1.25);
      this.think = rand(.05, .4);
      this.targetAngle = snake.angle;
      this.boost = false;
      this.boostTimer = 0;
      this.wanderAngle = rand(0, TAU);
      this.wanderTimer = rand(1, 4);
      this.huntCooldown = rand(2, 6);
      this.seed = rand(0, 100);
      this.retarget = rand(.4, 1.2);
      this.target = null;
    }

    update(dt) {
      const s = this.snake;
      if (!s.alive) return;
      this.think -= dt;
      this.retarget -= dt;
      this.wanderTimer -= dt;
      this.huntCooldown -= dt;
      this.boostTimer -= dt;

      if (this.think <= 0) {
        this.decide();
        this.think = rand(.12, .26) + (1 - this.skill) * .12;
      }

      if (this.wanderTimer <= 0) {
        this.wanderAngle = rand(0, TAU);
        this.wanderTimer = rand(1.4, 4.5);
      }

      let boost = this.boost;
      if (this.boostTimer <= 0) boost = false;
      s.targetAngle = this.targetAngle + Math.sin(this.game.time * 1.7 + this.seed) * .05;
      s.update(dt, { targetAngle: s.targetAngle, boost });
    }

    decide() {
      const s = this.snake;
      const g = this.game;
      const R = CFG.worldRadius;
      const distC = hypot(s.x, s.y);

      // 1. Muro: prioridad absoluta
      const aheadX = s.x + Math.cos(s.angle) * 330;
      const aheadY = s.y + Math.sin(s.angle) * 330;
      if (distC > R - 620 || hypot(aheadX, aheadY) > R - 130) {
        const toCenter = Math.atan2(-s.y, -s.x);
        this.targetAngle = toCenter + rand(-.12, .12);
        this.boost = false;
        return;
      }

      // 2. Evasión de cuerpos y cabezas
      let avoidX = 0, avoidY = 0, threat = 0;
      const look = 280;
      const snakes = g.snakes;
      for (let si = 0; si < snakes.length; si++) {
        const o = snakes[si];
        if (o === s || !o.alive) continue;
        const hd2 = dist2(s.x, s.y, o.x, o.y);
        if (hd2 > (look + 160) * (look + 160)) continue;
        const hd = Math.sqrt(hd2);
        if (hd < 175) {
          const w = (175 - hd) / 175;
          const dx = (s.x - o.x) / (hd || 1);
          const dy = (s.y - o.y) / (hd || 1);
          avoidX += dx * w * 2.2;
          avoidY += dy * w * 2.2;
          threat += w * 1.7;
        }
        const pts = o.bodyPoints;
        for (let i = 3; i < pts.length; i += 3) {
          const p = pts[i];
          const d2 = dist2(s.x, s.y, p.x, p.y);
          if (d2 < look * look) {
            const d = Math.sqrt(d2) || 1;
            const w = (look - d) / look;
            if (w > .08) {
              avoidX += (s.x - p.x) / d * w;
              avoidY += (s.y - p.y) / d * w;
              threat += w;
            }
          }
        }
      }

      // Empuje extra del borde
      if (distC > R - 900) {
        const w = (distC - (R - 900)) / 900;
        avoidX += (-s.x / distC) * w * 2.4;
        avoidY += (-s.y / distC) * w * 2.4;
        threat += w * 2;
      }

      const avoidMag = hypot(avoidX, avoidY);

      // 3. Comida
      let food = null, bestScore = -1;
      const foods = g.foods.list;
      for (let i = 0; i < foods.length; i++) {
        const f = foods[i];
        if (f.dead || f.kind === 'chase') continue;
        const d2 = dist2(s.x, s.y, f.x, f.y);
        if (d2 > 950 * 950) continue;
        const d = Math.sqrt(d2);
        let score = (f.value + 1) * this.greed * 90 / (d + 120);
        if (f.kind === 'drop') score *= 1.28;
        if (f.kind === 'rare') score *= 1.5;
        score += rand(0, .12);
        if (score > bestScore) { bestScore = score; food = f; }
      }

      // 4. Caza oportunista
      let hunt = null;
      let huntDist = 1e9;
      this.huntCooldown -= .15;
      if (this.huntCooldown <= 0 && this.aggression > .32) {
        for (let i = 0; i < snakes.length; i++) {
          const o = snakes[i];
          if (o === s || !o.alive) continue;
          const d = hypot(o.x - s.x, o.y - s.y);
          if (d > 1050) continue;
          if (s.mass > o.mass * 1.18 && d < huntDist && Math.random() < this.aggression * .55) {
            hunt = o;
            huntDist = d;
          }
        }
        this.huntCooldown = rand(2.2, 5.5);
      }
      if (g.player && g.player.alive && s.mass > g.player.mass * 1.4 && hypot(g.player.x - s.x, g.player.y - s.y) < 900) {
        if (Math.random() < this.aggression * .5) hunt = g.player;
      }

      // 5. Decidir dirección
      let desired;
      if (threat > 1.35 && avoidMag > .15) {
        desired = Math.atan2(avoidY, avoidX);
        if (Math.random() < .18 + this.skill * .2) this.startBoost(.35 + rand(0, .4), s.mass > 150);
      } else if (hunt && hunt.alive) {
        const lead = clamp(huntDist * .45, 70, 280);
        const tx = hunt.x + Math.cos(hunt.angle) * lead;
        const ty = hunt.y + Math.sin(hunt.angle) * lead;
        desired = Math.atan2(ty - s.y, tx - s.x);
        if (huntDist < 520 && s.mass > 110 && Math.random() < .3) this.startBoost(rand(.4, .9), true);
      } else if (food && avoidMag < .85) {
        desired = Math.atan2(food.y - s.y, food.x - s.x);
        if (s.mass > 160 && bestScore > .24 && Math.random() < .045) this.startBoost(rand(.2, .5), true);
      } else if (food) {
        desired = Math.atan2(food.y - s.y, food.x - s.x);
        desired = desired * .55 + Math.atan2(avoidY, avoidX) * .45;
      } else {
        desired = this.wanderAngle;
      }

      // Mezcla suave con evasión
      if (avoidMag > .5 && threat > .4) {
        const avoidAngle = Math.atan2(avoidY, avoidX);
        const diff = NS.angleDiff(desired, avoidAngle);
        desired += clamp(diff, -1.2, 1.2) * clamp(threat * .25, 0, .75);
      }

      // Impulso de emergencia
      if (threat > 2.4 && s.mass > 70 && Math.random() < .2) this.startBoost(.4, true);

      this.targetAngle = desired;
    }

    startBoost(duration, conserve) {
      const s = this.snake;
      if (s.mass < (conserve ? 105 : 55)) return;
      this.boost = true;
      this.boostTimer = duration;
      this.think = Math.min(this.think, .1);
    }
  }

  /* ============================================================
     FOOD MANAGER
     ============================================================ */
  class FoodManager {
    constructor(game) {
      this.game = game;
      this.list = [];
      this.targetNormal = CFG.normalFood;
      this.targetRare = CFG.rareFood;
      this.chaseTimer = 4;
      this.spawnBudget = 0;
    }

    reset(menuMode) {
      this.list.length = 0;
      const save = this.game.save;
      const diff = (NS.DIFFICULTIES && NS.DIFFICULTIES[save.difficulty]) || { food: 1 };
      const online = this.game.mode === 'online' && !menuMode;
      this.targetNormal = Math.floor(CFG.normalFood * (menuMode ? .62 : diff.food * (online ? .66 : 1)));
      this.targetRare = Math.floor(CFG.rareFood * (menuMode ? .6 : online ? .8 : 1));
      this.chaseTimer = 3;
      let guard = 0;
      while (this.countKind('normal') < this.targetNormal && guard++ < 800) {
        this.spawnCluster(randInt(2, 6));
      }
      for (let i = 0; i < this.targetRare; i++) this.spawn('rare');
      for (let i = 0; i < CFG.chaseOrbs; i++) this.spawn('chase');
    }

    countKind(kind) {
      let n = 0;
      for (const f of this.list) if (!f.dead && f.kind === kind) n++;
      return n;
    }

    randomPoint(margin, avoidRadius) {
      const R = CFG.worldRadius;
      const m = (margin || 120) + 60;
      let x = 0, y = 0;
      for (let tries = 0; tries < 24; tries++) {
        const a = rand(0, TAU);
        const rr = Math.sqrt(Math.random()) * (R - m);
        x = Math.cos(a) * rr;
        y = Math.sin(a) * rr;
        let ok = true;
        if (avoidRadius) {
          for (const s of this.game.snakes) {
            if (!s.alive) continue;
            if (dist2(x, y, s.x, s.y) < avoidRadius * avoidRadius) { ok = false; break; }
          }
        }
        if (ok) break;
      }
      return { x, y };
    }

    createFood(kind, x, y, opts) {
      const o = opts || {};
      let value = 1.15 + Math.random() * .45;
      let radius = 3.1 + Math.random() * .7;
      const themeFoods = NS.getTheme && NS.getTheme().canvas.foods;
      let color = pick(themeFoods || FOOD_COLORS);
      if (kind === 'rare') { value = 6.5; radius = 6.2; color = GOLD; }
      else if (kind === 'chase') { value = 17; radius = 8; color = GOLD; }
      else if (kind === 'drop') { value = o.value || 1.8; radius = clamp(3.2 + value * .32, 3.2, 7); color = o.color || GOLD; }
      const f = {
        kind, x, y, value, r: radius, color,
        vx: 0, vy: 0, phase: rand(0, TAU), age: 0,
        life: kind === 'drop' ? 30 : Infinity,
        dead: false, pull: 0, seed: rand(0, 100),
        floatAmp: rand(2, 7), floatSpeed: rand(.4, 1.2),
        candy: this.game.variant === 'halloween',
        candyShape: kind === 'chase' ? 3 : (kind === 'rare' ? 1 : Math.floor(rand(0, 3)))
      };
      this.list.push(f);
      return f;
    }

    spawnCluster(count) {
      const c = this.randomPoint(140, 190);
      const n = count || randInt(2, 5);
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU);
        const d = rand(0, 80);
        let x = c.x + Math.cos(a) * d;
        let y = c.y + Math.sin(a) * d;
        const rr = hypot(x, y);
        if (rr > CFG.worldRadius - 80) {
          x *= (CFG.worldRadius - 100) / rr;
          y *= (CFG.worldRadius - 100) / rr;
        }
        this.createFood('normal', x, y);
      }
      if (Math.random() < .08) this.spawn('rare');
    }

    spawn(kind) {
      if (kind === 'drop') return null;
      const p = this.randomPoint(kind === 'chase' ? 260 : 130, kind === 'chase' ? 620 : 160);
      if (kind === 'rare') {
        const f = this.createFood('rare', p.x, p.y);
        f.life = Infinity;
        return f;
      }
      if (kind === 'chase') {
        const f = this.createFood('chase', p.x, p.y);
        f.angle = rand(0, TAU);
        f.vx = Math.cos(f.angle) * 40;
        f.vy = Math.sin(f.angle) * 40;
        f.life = Infinity;
        return f;
      }
      return this.createFood('normal', p.x, p.y);
    }

    spawnDrop(x, y, color, value) {
      if (this.list.length > CFG.maxFoods) {
        const idx = this.list.findIndex((f) => f.kind === 'drop');
        if (idx >= 0) this.list.splice(idx, 1);
      }
      const f = this.createFood('drop', x, y, { color, value });
      return f;
    }

    spawnDeath(snake) {
      const pts = snake.bodyPoints;
      if (!pts.length) return;
      const maxPellets = clamp(Math.floor(snake.mass * .16), 10, 88);
      const count = Math.min(maxPellets, Math.floor(pts.length / 2));
      const total = snake.mass * .72;
      const per = Math.max(1.1, total / count);
      for (let i = 0; i < count; i++) {
        const idx = Math.min(pts.length - 1, Math.floor((i / count) * pts.length));
        const p = pts[idx];
        const angle = rand(0, TAU);
        const d = rand(0, 22);
        const f = this.createFood('drop', p.x + Math.cos(angle) * d, p.y + Math.sin(angle) * d, {
          color: snake.skin.colors.glow,
          value: per * rand(.82, 1.16)
        });
        f.life = rand(26, 38);
      }
      this.trim();
    }

    trim() {
      if (this.list.length <= CFG.maxFoods) return;
      let remove = this.list.length - CFG.maxFoods;
      for (let i = 0; i < this.list.length && remove > 0; i++) {
        if (this.list[i].kind === 'drop') {
          this.list.splice(i, 1);
          i--; remove--;
        }
      }
    }

    update(dt) {
      const chaseCount = this.countKind('chase');
      this.chaseTimer -= dt;
      if (chaseCount < CFG.chaseOrbs && this.chaseTimer <= 0) {
        this.spawn('chase');
        this.chaseTimer = rand(4, 9);
      }

      for (let i = this.list.length - 1; i >= 0; i--) {
        const f = this.list[i];
        if (f.dead) continue;
        f.phase += dt * (f.kind === 'rare' ? 2.2 : 1.7);
        f.age += dt;
        if (f.life !== Infinity && f.age > f.life) { this.list.splice(i, 1); continue; }

        if (f.kind === 'chase') {
          this.updateChase(f, dt);
        } else if (f.kind === 'rare') {
          f.y += Math.sin(f.phase * .7) * dt * 8;
          f.x += Math.cos(f.phase * .5) * dt * 6;
        }
      }
    }

    updateChase(f, dt) {
      const g = this.game;
      const R = CFG.worldRadius;
      let near = null, nearD = 400 * 400;
      for (const s of g.snakes) {
        if (!s.alive) continue;
        const d2 = dist2(f.x, f.y, s.x, s.y);
        if (d2 < nearD) { nearD = d2; near = s; }
      }
      let desiredX = Math.cos(f.phase * .55 + f.seed) * 35;
      let desiredY = Math.sin(f.phase * .73 + f.seed) * 35;
      if (near) {
        const d = Math.sqrt(nearD) || 1;
        const w = clamp((360 - d) / 360, 0, 1);
        desiredX = (f.x - near.x) / d * 150 * w + desiredX * .5;
        desiredY = (f.y - near.y) / d * 150 * w + desiredY * .5;
      }
      const distC = hypot(f.x, f.y);
      if (distC > R - 260) {
        desiredX -= f.x / distC * 120;
        desiredY -= f.y / distC * 120;
      }
      f.vx = lerp(f.vx, desiredX, 1 - Math.exp(-3 * dt));
      f.vy = lerp(f.vy, desiredY, 1 - Math.exp(-3 * dt));
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      const rr = hypot(f.x, f.y);
      if (rr > R - 60) {
        f.x *= (R - 70) / rr;
        f.y *= (R - 70) / rr;
      }
      f.phase += dt * 3;
      if (Math.random() < dt * 13 && g.particles) {
        g.particles.emitTrail(f.x + rand(-5, 5), f.y + rand(-5, 5), GOLD, .7);
      }
    }

    handleSnakes(snakes, dt) {
      const g = this.game;
      const magnetBonus = g.upgradeLevel('magnet') * 22;
      for (let si = 0; si < snakes.length; si++) {
        const s = snakes[si];
        if (!s.alive) continue;
        const powerMagnet = s.isPlayer && g.time < s.powerMagnetUntil;
        const baseMagnet = 44 + s.radius * 2.3 + (s.isPlayer ? magnetBonus : 0) + (powerMagnet ? CFG.magnetPower : 0);
        const pickupBase = s.radius * .95 + 9 + (powerMagnet ? 12 : 0);
        const magnet2 = baseMagnet * baseMagnet;
        for (let i = 0; i < this.list.length; i++) {
          const f = this.list[i];
          if (f.dead) continue;
          const dx = s.x - f.x, dy = s.y - f.y;
          const d2 = dx * dx + dy * dy;
          const pick = pickupBase + f.r;
          if (d2 < pick * pick) {
            f.dead = true;
            s.eat(f);
            g.onFoodEaten(s, f);
            continue;
          }
          if (f.kind !== 'chase' && d2 < magnet2) {
            const d = Math.sqrt(d2) || 1;
            const strength = 1 - d / baseMagnet;
            const pull = (130 + 280 * strength) * dt;
            f.x += (dx / d) * pull;
            f.y += (dy / d) * pull;
            f.pull = 1;
          }
        }
      }

      let removed = false;
      for (let i = this.list.length - 1; i >= 0; i--) {
        if (this.list[i].dead) { this.list.splice(i, 1); removed = true; }
      }
      if (removed) this.replenish();
      this.update(dt);
    }

    replenish() {
      let guard = 0;
      let normals = this.countKind('normal');
      while (normals < this.targetNormal && guard++ < 18) {
        this.spawn('normal');
        normals++;
      }
      let rares = this.countKind('rare');
      guard = 0;
      while (rares < this.targetRare && guard++ < 4) {
        this.spawn('rare');
        rares++;
      }
    }
  }

  /* ============================================================
     POWERUPS
     ============================================================ */
  class PowerupManager {
    constructor(game) {
      this.game = game;
      this.list = [];
      this.respawns = [];
    }

    reset(menuMode) {
      this.list.length = 0;
      this.respawns.length = 0;
      if (menuMode) return;
      for (const p of NS.POWERUPS) this.spawn(p.id);
    }

    hasType(id) {
      for (const p of this.list) if (p.id === id && !p.dead) return true;
      return false;
    }

    spawn(id) {
      const def = NS.POWERUP_MAP[id];
      if (!def || this.list.length >= CFG.maxPowerups || this.hasType(id)) return null;
      const point = this.game.foods.randomPoint(460, 300);
      const p = {
        id, def, x: point.x, y: point.y, r: 17.5,
        phase: rand(0, TAU), age: 0, born: .5, dead: false
      };
      this.list.push(p);
      return p;
    }

    update(dt) {
      for (let i = this.respawns.length - 1; i >= 0; i--) {
        const r = this.respawns[i];
        r.t -= dt;
        if (r.t <= 0) {
          this.respawns.splice(i, 1);
          this.spawn(r.id);
        }
      }
      for (let i = this.list.length - 1; i >= 0; i--) {
        const p = this.list[i];
        if (p.dead) { this.list.splice(i, 1); continue; }
        p.phase += dt * 1.8;
        p.age += dt;
        if (p.born > 0) p.born = Math.max(0, p.born - dt);
      }
    }

    handle(snake) {
      if (!snake || !snake.alive || !snake.isPlayer) return;
      for (let i = this.list.length - 1; i >= 0; i--) {
        const p = this.list[i];
        if (p.dead) continue;
        const pick = p.r + snake.radius + 15;
        if (dist2(snake.x, snake.y, p.x, p.y) > pick * pick) continue;
        p.dead = true;
        this.list.splice(i, 1);
        this.game.collectPowerup(p, snake);
        this.respawns.push({ id: p.id, t: CFG.powerupRespawn + rand(-3, 5) });
      }
    }
  }

  /* ============================================================
     PARTICLES & FLOATING TEXT
     ============================================================ */
  class ParticleSystem {
    constructor(game) {
      this.game = game;
      this.particles = [];
      this.texts = [];
    }

    reset() {
      this.particles.length = 0;
      this.texts.length = 0;
    }

    get limit() {
      const q = this.game.quality;
      if (q === 'low') return Math.floor(CFG.maxParticles * .4);
      if (q === 'medium') return Math.floor(CFG.maxParticles * .72);
      return CFG.maxParticles;
    }

    motionScale() {
      const motion = this.game.save.settings.motion;
      if (motion === 'reduced') return 0;
      return motion === 'soft' ? .72 : 1;
    }

    emitBurst(x, y, color, count, speed, size, life, kind) {
      if (!this.game.particlesEnabled) return;
      const scale = this.motionScale();
      if (!scale) return;
      const n = Math.min(Math.max(1, Math.round(count * scale)), this.limit - this.particles.length);
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU);
        const sp = rand(speed * .25, speed);
        this.particles.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: rand(life * .55, life), maxLife: life,
          size: rand(size * .4, size), color,
          kind: kind || 'spark', drag: rand(1.4, 3.4), rot: rand(0, TAU)
        });
      }
    }

    emitDirectional(x, y, angle, color, count, speed, size, life) {
      if (!this.game.particlesEnabled) return;
      const scale = this.motionScale();
      if (!scale) return;
      const n = Math.min(Math.max(1, Math.round(count * scale)), this.limit - this.particles.length);
      for (let i = 0; i < n; i++) {
        const a = angle + rand(-.65, .65);
        const sp = rand(speed * .35, speed);
        this.particles.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: rand(life * .5, life), maxLife: life,
          size: rand(size * .4, size), color,
          kind: 'spark', drag: rand(1.2, 2.4), rot: rand(0, TAU)
        });
      }
    }

    emitTrail(x, y, color, scale) {
      if (!this.game.particlesEnabled || !this.motionScale()) return;
      if (this.particles.length >= this.limit) return;
      this.particles.push({
        x, y, vx: rand(-6, 6), vy: rand(-6, 6),
        life: rand(.3, .7), maxLife: .7,
        size: rand(1.2, 2.6) * (scale || 1), color,
        kind: 'glow', drag: .8, rot: 0
      });
    }

    ring(x, y, color, radius, life) {
      if (!this.game.particlesEnabled || !this.motionScale()) return;
      this.particles.push({
        x, y, vx: 0, vy: 0, life, maxLife: life,
        size: radius, color, kind: 'ring', drag: 0, rot: 0
      });
    }

    text(x, y, text, color, size, life) {
      if (this.texts.length > 24) this.texts.shift();
      this.texts.push({ x, y, text, color, size: size || 13, life: life || 1.1, maxLife: life || 1.1, vy: -26 });
    }

    update(dt) {
      const ps = this.particles;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life -= dt;
        if (p.life <= 0) { ps.splice(i, 1); continue; }
        if (p.kind === 'ring') {
          p.size += dt * p.size * 2.2;
        } else {
          const drag = Math.exp(-p.drag * dt);
          p.vx *= drag; p.vy *= drag;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.kind === 'spark') p.rot += dt * 4;
        }
      }
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const t = this.texts[i];
        t.life -= dt;
        if (t.life <= 0) { this.texts.splice(i, 1); continue; }
        t.y += t.vy * dt;
        t.vy *= Math.exp(-1.4 * dt);
      }
    }
  }

  /* ============================================================
     CAMERA
     ============================================================ */
  class Camera {
    constructor(game) {
      this.game = game;
      this.x = 0;
      this.y = 0;
      this.zoom = .9;
      this.targetX = 0;
      this.targetY = 0;
      this.targetZoom = .9;
      this.shakeValue = 0;
      this.shakeX = 0;
      this.shakeY = 0;
      this.menuAngle = 0;
      this.spectate = null;
      this.spectateTimer = 0;
    }

    shake(amount) {
      const settings = this.game.save.settings;
      if (!settings.shake || settings.motion === 'reduced') return;
      const scale = settings.motion === 'soft' ? .55 : 1;
      this.shakeValue = Math.min(26, this.shakeValue + amount * scale);
    }

    followPlayer(dt) {
      const p = this.game.player;
      if (!p) return;
      const motion = this.game.save.settings.motion;
      const lead = (motion === 'reduced' ? 16 : 50) + p.radius * (motion === 'reduced' ? .5 : 1.4);
      this.targetX = p.x + Math.cos(p.angle) * lead;
      this.targetY = p.y + Math.sin(p.angle) * lead;
      const desiredZoom = clamp(1.05 * Math.pow(10.4 / p.radius, .48), .56, 1.08);
      const cameraScale = clamp((this.game.save.settings.cameraScale || 100) / 100, .85, 1.15);
      const powerZoom = this.game.time < p.powerZoomUntil ? .74 : 1;
      this.targetZoom = desiredZoom * (p.boosting ? .975 : 1) * (1 / cameraScale) * powerZoom;
    }

    updateMenu(dt) {
      const g = this.game;
      this.spectateTimer -= dt;
      if (this.spectateTimer <= 0 || !this.spectate || !this.spectate.alive) {
        const alive = g.snakes.filter((s) => s.alive);
        if (alive.length) {
          alive.sort((a, b) => b.mass - a.mass);
          this.spectate = pick(alive.slice(0, Math.min(7, alive.length)));
        }
        this.spectateTimer = rand(6, 11);
      }
      const s = this.spectate;
      if (s && s.alive) {
        this.targetX = s.x + Math.cos(s.angle) * 80;
        this.targetY = s.y + Math.sin(s.angle) * 80;
        this.targetZoom = .74;
      } else {
        this.targetX = 0; this.targetY = 0; this.targetZoom = .62;
      }
    }

    update(dt, mode) {
      if (mode === 'menu') this.updateMenu(dt);
      else this.followPlayer(dt);
      const motion = this.game.save.settings.motion;
      const posRate = motion === 'soft' ? 2.55 : motion === 'reduced' ? 4.4 : 3.2;
      const zoomRate = motion === 'soft' ? 1.95 : motion === 'reduced' ? 3.2 : 2.4;
      this.x = smoothTo(this.x, this.targetX, posRate, dt);
      this.y = smoothTo(this.y, this.targetY, posRate, dt);
      this.zoom = smoothTo(this.zoom, this.targetZoom, zoomRate, dt);
      this.shakeValue *= Math.exp(-5.2 * dt);
      if (this.shakeValue < .1) this.shakeValue = 0;
      this.shakeX = rand(-1, 1) * this.shakeValue;
      this.shakeY = rand(-1, 1) * this.shakeValue;
    }

    apply(ctx, w, h) {
      ctx.translate(w / 2 + this.shakeX, h / 2 + this.shakeY);
      ctx.scale(this.zoom, this.zoom);
      ctx.translate(-this.x, -this.y);
    }

    worldToScreen(x, y, w, h) {
      return {
        x: (x - this.x) * this.zoom + w / 2 + this.shakeX,
        y: (y - this.y) * this.zoom + h / 2 + this.shakeY
      };
    }
  }

  NS.Snake = Snake;
  NS.BotBrain = BotBrain;
  NS.FoodManager = FoodManager;
  NS.PowerupManager = PowerupManager;
  NS.ParticleSystem = ParticleSystem;
  NS.Camera = Camera;
})();

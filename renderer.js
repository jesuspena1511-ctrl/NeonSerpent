/* ============================================================
   NEON SERPENT — Renderer
   ============================================================ */
(function () {
  'use strict';
  const NS = window.NS;
  const { TAU, clamp, rand, dist2, hypot, rgba, CFG } = NS;

  const CB_PALETTES = {
    deuter: ['#0072b2', '#e69f00', '#009e73', '#cc79a7', '#56b4e9', '#d55e00', '#f0e442'],
    prot: ['#0057b8', '#e69f00', '#00a878', '#d55e00', '#7a5195', '#ffd166', '#00c2d1'],
    trit: ['#1f77b4', '#d62728', '#2ca02c', '#9467bd', '#ff7f0e', '#17becf', '#bcbd22']
  };

  function hashName(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function mixHex(hex, target, amount) {
    const parse = (h) => {
      let v = (h || '#ffffff').replace('#', '');
      if (v.length === 3) v = v.split('').map((c) => c + c).join('');
      return [parseInt(v.slice(0, 2), 16) || 0, parseInt(v.slice(2, 4), 16) || 0, parseInt(v.slice(4, 6), 16) || 0];
    };
    const a = parse(hex), b = parse(target);
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * amount));
    return '#' + c.map((v) => clamp(v, 0, 255).toString(16).padStart(2, '0')).join('');
  }

  class Renderer {
    constructor(game) {
      this.game = game;
      this.canvas = NS.$('#game');
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      this.minimap = NS.$('#minimap');
      this.mmCtx = this.minimap ? this.minimap.getContext('2d') : null;
      this.w = window.innerWidth;
      this.h = window.innerHeight;
      this.dpr = 1;
      this.stars = [];
      this.theme = NS.getTheme();
      this.themeId = this.theme.id;
      this.screenGrad = null;
      this.buildAssets();
      this.resize();
    }

    setTheme(id) {
      const theme = NS.THEMES[id] || NS.THEMES.aurora;
      if (this.themeId === theme.id && this.nebula) {
        this.theme = theme;
        return;
      }
      this.theme = theme;
      this.themeId = theme.id;
      this.gridPattern = null;
      this.screenGrad = null;
      this.buildAssets();
      this.resize();
    }

    buildAssets() {
      const rng = NS.mulberry32(20261023);
      const R = CFG.worldRadius;
      const theme = NS.getTheme();
      const C = theme.canvas;
      this.theme = theme;
      this.themeId = theme.id;

      // Estrellas del espacio exterior
      this.stars = [];
      for (let i = 0; i < 260; i++) {
        this.stars.push({
          x: (rng() * 2 - 1) * (R + 3600),
          y: (rng() * 2 - 1) * (R + 3600),
          r: .5 + rng() * 1.7,
          a: .18 + rng() * .55,
          p: rng() * TAU,
          s: .4 + rng() * 1.2,
          c: rng() < .16 ? C.starAlt : rng() < .32 ? C.starBlue : C.star
        });
      }

      // Nebulosa pre-renderizada
      const neb = document.createElement('canvas');
      neb.width = neb.height = 1024;
      const nc = neb.getContext('2d');
      nc.clearRect(0, 0, 1024, 1024);
      nc.globalCompositeOperation = 'lighter';
      const hues = C.nebula;
      for (let i = 0; i < 28; i++) {
        const x = rng() * 1024;
        const y = rng() * 1024;
        const rr = 90 + rng() * 300;
        const col = hues[(rng() * hues.length) | 0];
        const grad = nc.createRadialGradient(x, y, 0, x, y, rr);
        grad.addColorStop(0, 'rgba(' + col + ',' + (.045 + rng() * .055) + ')');
        grad.addColorStop(.55, 'rgba(' + col + ',' + (.018 + rng() * .02) + ')');
        grad.addColorStop(1, 'rgba(' + col + ',0)');
        nc.fillStyle = grad;
        nc.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      }
      nc.globalCompositeOperation = 'source-over';
      if (theme.id === 'neon') {
        // Trazas de circuito tenues
        for (let i = 0; i < 22; i++) {
          let x = rng() * 1024;
          let y = rng() * 1024;
          nc.strokeStyle = 'rgba(' + C.nebula[0] + ',' + (.025 + rng() * .035) + ')';
          nc.lineWidth = .8 + rng() * 1.2;
          nc.beginPath();
          nc.moveTo(x, y);
          for (let j = 0; j < 5; j++) {
            if (rng() < .5) x += (rng() * 2 - 1) * 160; else y += (rng() * 2 - 1) * 160;
            nc.lineTo(x, y);
          }
          nc.stroke();
          nc.fillStyle = NS.rgba(C.star, .14);
          nc.beginPath(); nc.arc(x, y, 2 + rng() * 2, 0, TAU); nc.fill();
        }
      } else {
        // Cintas suaves de aurora / corrientes marinas
        nc.globalCompositeOperation = 'lighter';
        for (let i = 0; i < (theme.id === 'ocean' ? 9 : 11); i++) {
          const y0 = rng() * 1024;
          const amp = 60 + rng() * 180;
          const col = hues[(rng() * hues.length) | 0];
          nc.beginPath();
          nc.moveTo(-80, y0);
          nc.bezierCurveTo(260, y0 + amp, 520, y0 - amp, 1104, y0 + amp * .25);
          nc.strokeStyle = 'rgba(' + col + ',' + (.025 + rng() * .035) + ')';
          nc.lineWidth = 16 + rng() * 42;
          nc.lineCap = 'round';
          nc.stroke();
        }
        for (let i = 0; i < 26; i++) {
          const x = rng() * 1024, y = rng() * 1024, rr = 8 + rng() * 40;
          const col = hues[(rng() * hues.length) | 0];
          const g2 = nc.createRadialGradient(x, y, 0, x, y, rr);
          g2.addColorStop(0, 'rgba(' + col + ',' + (.04 + rng() * .05) + ')');
          g2.addColorStop(1, 'rgba(' + col + ',0)');
          nc.fillStyle = g2;
          nc.fillRect(x - rr, y - rr, rr * 2, rr * 2);
        }
        nc.globalCompositeOperation = 'source-over';
      }
      // Polvo estelar interior
      for (let i = 0; i < 380; i++) {
        nc.fillStyle = NS.rgba(C.star, .02 + rng() * .05);
        nc.fillRect(rng() * 1024, rng() * 1024, 1 + rng(), 1 + rng());
      }
      this.nebula = neb;

      // Patrón de rejilla técnica
      const tile = document.createElement('canvas');
      tile.width = tile.height = 1024;
      const tc = tile.getContext('2d');
      const step = 128;
      tc.strokeStyle = C.grid;
      tc.lineWidth = 2;
      for (let i = 0; i <= 1024; i += step) {
        tc.beginPath(); tc.moveTo(i, 0); tc.lineTo(i, 1024); tc.stroke();
        tc.beginPath(); tc.moveTo(0, i); tc.lineTo(1024, i); tc.stroke();
      }
      tc.strokeStyle = C.grid2;
      tc.lineWidth = 1.4;
      for (let i = -1024; i <= 2048; i += 256) {
        tc.beginPath(); tc.moveTo(i, 0); tc.lineTo(i + 1024, 1024); tc.stroke();
        tc.beginPath(); tc.moveTo(i + 1024, 0); tc.lineTo(i, 1024); tc.stroke();
      }
      tc.fillStyle = NS.rgba(C.accent, .1);
      for (let y = 0; y <= 1024; y += 256) {
        for (let x = 0; x <= 1024; x += 256) {
          tc.beginPath(); tc.arc(x, y, 2.3, 0, TAU); tc.fill();
        }
      }
      tc.strokeStyle = C.magenta;
      tc.lineWidth = 2;
      for (let y = 128; y < 1024; y += 256) {
        for (let x = 128; x < 1024; x += 256) {
          tc.strokeRect(x - 3, y - 3, 6, 6);
        }
      }
      this.gridTile = tile;
      if (!this.gridPattern) {
        this.gridPattern = this.ctx.createPattern(tile, 'repeat');
        if (this.gridPattern && this.gridPattern.setTransform && window.DOMMatrix) {
          const s = 640 / 1024;
          this.gridPattern.setTransform(new DOMMatrix([s, 0, 0, s, 0, 0]));
        }
      }

      // Gradiente base de la arena
      this.arenaGrad = this.ctx.createRadialGradient(0, 0, 50, 0, 0, R);
      this.arenaGrad.addColorStop(0, C.arena[0]);
      this.arenaGrad.addColorStop(.35, C.arena[1]);
      this.arenaGrad.addColorStop(.68, C.arena[2]);
      this.arenaGrad.addColorStop(.9, C.arena[3]);
      this.arenaGrad.addColorStop(1, C.arena[4]);

      // Aguja del radar
      this.radar = 0;
    }

    resize() {
      const q = this.game.quality;
      const cap = q === 'low' ? 1 : q === 'medium' ? 1.5 : 2;
      this.dpr = Math.min(window.devicePixelRatio || 1, cap);
      this.w = window.innerWidth;
      this.h = window.innerHeight;
      this.canvas.width = Math.round(this.w * this.dpr);
      this.canvas.height = Math.round(this.h * this.dpr);
      this.canvas.style.width = this.w + 'px';
      this.canvas.style.height = this.h + 'px';
      this.screenGrad = null;
    }

    viewBounds(pad) {
      const cam = this.game.camera;
      const p = pad || 120;
      const hw = this.w / (2 * cam.zoom);
      const hh = this.h / (2 * cam.zoom);
      return { l: cam.x - hw - p, r: cam.x + hw + p, t: cam.y - hh - p, b: cam.y + hh + p };
    }

    render(time) {
      const g = this.game;
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;
      const C = this.theme.canvas;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = C.bg0;
      ctx.fillRect(0, 0, w, h);
      if (!this.screenGrad) {
        this.screenGrad = ctx.createLinearGradient(0, 0, w, h);
        this.screenGrad.addColorStop(0, C.bg1);
        this.screenGrad.addColorStop(.5, C.bg0);
        this.screenGrad.addColorStop(1, C.bg2);
      }
      ctx.fillStyle = this.screenGrad;
      ctx.fillRect(0, 0, w, h);

      // Estrellas del fondo
      const cam = g.camera;
      const starStride = g.quality === 'low' ? 2 : 1;
      ctx.save();
      ctx.translate(w / 2 + cam.shakeX, h / 2 + cam.shakeY);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);
      const vb = this.viewBounds(200);
      for (let i = 0; i < this.stars.length; i += starStride) {
        const s = this.stars[i];
        if (s.x < vb.l || s.x > vb.r || s.y < vb.t || s.y > vb.b) continue;
        const tw = .55 + .45 * Math.sin(time * s.s + s.p);
        ctx.globalAlpha = s.a * tw;
        ctx.fillStyle = s.c;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, TAU);
        ctx.fill();
        if (s.r > 1.8) {
          ctx.globalAlpha = s.a * tw * .25;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 3.4, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // Mundo
      ctx.save();
      cam.apply(ctx, w, h);
      this.drawArena(time, vb);
      this.drawFood(time, vb);
      this.drawPowerups(time, vb);
      this.drawSnakes(time, vb);
      this.drawParticles(time);
      ctx.restore();

      this.drawScreenFx(time);
      if (g.state === 'playing') this.drawReticle(time);
    }

    drawArena(time, vb) {
      const ctx = this.ctx;
      const R = CFG.worldRadius;
      const cam = this.game.camera;
      const p = this.game.player;
      const C = this.theme.canvas;

      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, TAU);
      ctx.clip();

      ctx.fillStyle = this.arenaGrad;
      ctx.fillRect(-R - 20, -R - 20, R * 2 + 40, R * 2 + 40);

      // Nebulosa
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = .9;
      ctx.drawImage(this.nebula, -R * 1.06, -R * 1.06, R * 2.12, R * 2.12);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // Rejilla
      if (this.gridPattern) {
        ctx.fillStyle = this.gridPattern;
        ctx.fillRect(vb.l, vb.t, vb.r - vb.l, vb.b - vb.t);
      }

      // Anillos concéntricos
      ctx.strokeStyle = C.ring;
      ctx.lineWidth = 1.2;
      for (let rr = 400; rr < R; rr += 400) {
        ctx.beginPath();
        ctx.arc(0, 0, rr, 0, TAU);
        ctx.stroke();
      }

      // Radios sutiles
      ctx.strokeStyle = C.grid2;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + time * .002;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 300, Math.sin(a) * 300);
        ctx.lineTo(Math.cos(a) * (R - 80), Math.sin(a) * (R - 80));
        ctx.stroke();
      }

      this.drawThemeDecals(time, vb);
      this.drawEmblem(time);

      // Polvo de datos flotante
      ctx.fillStyle = NS.rgba(C.accent, .13);
      for (let i = 0; i < 36; i++) {
        const a = (i * 2.399 + time * .02) % TAU;
        const rr = 300 + (i * 977) % (R - 500) + Math.sin(time * .3 + i) * 20;
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (x < vb.l || x > vb.r || y < vb.t || y > vb.b) continue;
        ctx.globalAlpha = .15 + .2 * (.5 + .5 * Math.sin(time * 1.1 + i * 2));
        ctx.fillRect(x, y, 1.6, 1.6);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // Borde de contención
      this.drawBorder(time, p);
    }

    drawThemeDecals(time, vb) {
      const ctx = this.ctx;
      const theme = this.theme.id;
      if (theme !== 'halloween' && theme !== 'fiesta') return;
      const R = CFG.worldRadius;
      ctx.save();
      if (theme === 'halloween') {
        for (let i = 0; i < 18; i++) {
          const a = i * 2.399;
          const rr = 560 + (i * 977) % (R - 900);
          const x = Math.cos(a) * rr;
          const y = Math.sin(a) * rr;
          if (x < vb.l - 80 || x > vb.r + 80 || y < vb.t - 80 || y > vb.b + 80) continue;
          const s = .8 + (i % 4) * .22;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(a * .7);
          ctx.globalAlpha = .22;
          ctx.fillStyle = '#ff8a1f';
          ctx.shadowColor = 'rgba(255,138,31,.55)';
          ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.ellipse(0, 0, 22 * s, 17 * s, 0, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = .45;
          ctx.strokeStyle = '#3a1405';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-14 * s, -5 * s); ctx.quadraticCurveTo(0, 7 * s, 14 * s, -5 * s);
          ctx.stroke();
          ctx.fillStyle = '#5c2a08';
          ctx.fillRect(-2.5 * s, -20 * s, 5 * s, 8 * s);
          ctx.restore();
        }
        for (let i = 0; i < 12; i++) {
          const a = i * 1.73 + time * .025;
          const rr = 800 + (i * 613) % (R - 1200);
          const x = Math.cos(a) * rr;
          const y = Math.sin(a) * rr;
          if (x < vb.l - 50 || x > vb.r + 50 || y < vb.t - 50 || y > vb.b + 50) continue;
          const flap = Math.sin(time * 6 + i) * .6;
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(.75, .75);
          ctx.fillStyle = 'rgba(30,10,40,.55)';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(-18, -12 - flap * 8, -34, -4);
          ctx.quadraticCurveTo(-20, 4, -15, 12);
          ctx.quadraticCurveTo(-8, 5, 0, 4);
          ctx.quadraticCurveTo(8, 5, 15, 12);
          ctx.quadraticCurveTo(20, 4, 34, -4);
          ctx.quadraticCurveTo(18, -12 + flap * 8, 0, 0);
          ctx.fill();
          ctx.restore();
        }
      } else {
        const cols = this.theme.canvas.foods;
        for (let i = 0; i < 46; i++) {
          const a = i * 2.399 + time * .03;
          const rr = 420 + (i * 859) % (R - 700);
          const x = Math.cos(a) * rr;
          const y = Math.sin(a) * rr;
          if (x < vb.l - 20 || x > vb.r + 20 || y < vb.t - 20 || y > vb.b + 20) continue;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(time * .4 + i);
          ctx.globalAlpha = .2 + .2 * (.5 + .5 * Math.sin(time * 1.4 + i));
          ctx.fillStyle = cols[i % cols.length];
          ctx.fillRect(-4, -1.2, 8, 2.4);
          ctx.restore();
        }
      }
      ctx.restore();
    }

    drawEmblem(time) {
      const ctx = this.ctx;
      const cam = this.game.camera;
      const C = this.theme.canvas;
      const visR = Math.max(this.w, this.h) / (2 * cam.zoom);
      if (hypot(cam.x, cam.y) - visR > 700) return;
      ctx.save();
      ctx.translate(0, 0);
      ctx.strokeStyle = NS.rgba(C.accent, .08);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 290, 0, TAU); ctx.stroke();
      ctx.strokeStyle = NS.rgba(C.magenta, .07);
      ctx.beginPath(); ctx.arc(0, 0, 225, 0, TAU); ctx.stroke();
      ctx.strokeStyle = C.ring;
      ctx.lineWidth = 3;
      ctx.setLineDash([18, 24]);
      ctx.lineDashOffset = -time * 12;
      ctx.beginPath(); ctx.arc(0, 0, 175, 0, TAU); ctx.stroke();
      ctx.setLineDash([4, 10]);
      ctx.lineDashOffset = time * 18;
      ctx.beginPath(); ctx.arc(0, 0, 115, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = NS.rgba(C.accent, .09);
      ctx.font = '900 42px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const sector = this.theme.id === 'halloween' ? 'NOCHE 31' : this.theme.id === 'fiesta' ? 'FIESTA 07' : 'SECTOR 07';
      ctx.fillText(sector, 0, -14);
      ctx.font = '600 18px Rajdhani, sans-serif';
      ctx.fillStyle = NS.rgba(C.accent, .055);
      ctx.fillText(this.theme.name + '   A R E N A', 0, 20);
      ctx.restore();
    }

    drawBorder(time, p) {
      const ctx = this.ctx;
      const R = CFG.worldRadius;
      const edge = p && p.alive ? hypot(p.x, p.y) : 0;
      const danger = p && p.alive ? clamp((edge - (R - 460)) / 350, 0, 1) : 0;
      const C = this.theme.canvas;
      ctx.save();
      // Halo exterior
      ctx.strokeStyle = NS.rgba(C.accent, .05);
      ctx.lineWidth = 64;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
      ctx.strokeStyle = danger > 0 ? 'rgba(255,77,109,' + (.16 + danger * .35) + ')' : NS.rgba(C.accent, .18);
      ctx.lineWidth = 16;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
      // Línea principal
      ctx.strokeStyle = danger > 0 ? 'rgba(255,140,160,' + (.6 + danger * .3) + ')' : C.borderSoft;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
      // Guiones giratorios
      ctx.strokeStyle = NS.rgba(C.magenta, .32);
      ctx.lineWidth = 9;
      ctx.setLineDash([34, 30]);
      ctx.lineDashOffset = -time * 26;
      ctx.beginPath(); ctx.arc(0, 0, R + 12, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      // Marcas cardinales
      ctx.strokeStyle = NS.rgba(C.accent, .28);
      ctx.lineWidth = 2;
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * TAU;
        const len = i % 6 === 0 ? 26 : 10;
        const r0 = R - 20;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a) * (r0 - len), Math.sin(a) * (r0 - len));
        ctx.stroke();
      }
      ctx.restore();
    }

    drawFood(time, vb) {
      const ctx = this.ctx;
      const foods = this.game.foods.list;
      ctx.save();
      for (let i = 0; i < foods.length; i++) {
        const f = foods[i];
        if (f.x < vb.l || f.x > vb.r || f.y < vb.t || f.y > vb.b) continue;
        const pulse = 1 + Math.sin(f.phase + time * 1.7) * (f.kind === 'normal' ? .14 : .1);
        const size = f.r * (f.kind === 'chase' ? 8 : f.kind === 'rare' ? 7.2 : 6.1) * pulse * (f.candy ? 1.56 : 1);
        ctx.globalAlpha = f.kind === 'drop' ? clamp(f.life - f.age > 5 ? .95 : (f.life - f.age) / 5 * .95, 0, .95) : .96;
        const sprite = f.candy ? NS.candySprite(f.color, f.candyShape) : NS.orbSprite(f.color);
        if (f.candy) {
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(sprite, f.x - size / 2, f.y - size / 2, size, size);
          ctx.globalCompositeOperation = 'lighter';
        } else {
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(sprite, f.x - size / 2, f.y - size / 2, size, size);
        }
        if (f.kind === 'rare' || f.kind === 'chase') {
          ctx.globalAlpha = .42;
          ctx.strokeStyle = f.color;
          ctx.lineWidth = 1.4;
          ctx.setLineDash(f.kind === 'chase' ? [4, 5] : [2, 5]);
          ctx.lineDashOffset = time * (f.kind === 'chase' ? -18 : 8);
          const ring = f.r * (f.kind === 'chase' ? 2.4 : 2);
          ctx.beginPath();
          ctx.arc(f.x, f.y, ring + Math.sin(f.phase * 1.4) * 1.2, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      ctx.restore();
    }

    drawPowerups(time, vb) {
      const ctx = this.ctx;
      const list = this.game.powerups ? this.game.powerups.list : [];
      if (!list.length) return;
      const candy = this.game.variant === 'halloween';
      for (const p of list) {
        if (p.x < vb.l || p.x > vb.r || p.y < vb.t || p.y > vb.b) continue;
        const def = p.def;
        const bob = Math.sin(time * 2.2 + p.phase) * 3;
        const pulse = 1 + Math.sin(time * 3.4 + p.phase) * .07;
        const r = p.r * pulse;
        ctx.save();
        ctx.translate(p.x, p.y + bob);
        ctx.globalCompositeOperation = 'lighter';
        const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.8);
        halo.addColorStop(0, NS.rgba(def.color, .3));
        halo.addColorStop(.5, NS.rgba(def.color, .1));
        halo.addColorStop(1, NS.rgba(def.color, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(0, 0, r * 2.8, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = NS.rgba(def.color, .55);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 7]);
        ctx.lineDashOffset = -time * 18;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.55, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalCompositeOperation = 'source-over';
        if (candy) {
          ctx.fillStyle = 'rgba(255,255,255,.16)';
          for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(side * r * .72, -r * .34);
            ctx.lineTo(side * r * 1.85, -r * .95);
            ctx.lineTo(side * r * 1.58, 0);
            ctx.lineTo(side * r * 1.9, r * .95);
            ctx.lineTo(side * r * .72, r * .34);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = NS.rgba(def.color, .65);
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
        const body = ctx.createRadialGradient(-r * .35, -r * .4, r * .1, 0, 0, r);
        body.addColorStop(0, '#ffffff');
        body.addColorStop(.25, NS.rgba(def.color, .98));
        body.addColorStop(1, NS.shade(def.color, -.4));
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * (candy ? 1.05 : 1), r * (candy ? .88 : 1), 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.45)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.94)';
        ctx.strokeStyle = 'rgba(23,12,30,.9)';
        ctx.lineWidth = Math.max(1.2, r * .09);
        ctx.lineCap = 'round';
        if (def.glyph === 'shield') {
          ctx.beginPath();
          ctx.moveTo(0, -r * .55);
          ctx.lineTo(r * .42, -r * .32);
          ctx.lineTo(r * .34, r * .18);
          ctx.quadraticCurveTo(0, r * .62, -r * .34, r * .18);
          ctx.lineTo(-r * .42, -r * .32);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (def.glyph === 'magnet') {
          ctx.beginPath();
          ctx.arc(0, 0, r * .42, Math.PI, 0, true);
          ctx.lineTo(r * .42, r * .2);
          ctx.moveTo(-r * .42, -r * .0);
          ctx.lineTo(-r * .42, r * .2);
          ctx.strokeStyle = 'rgba(255,255,255,.95)';
          ctx.lineWidth = Math.max(2, r * .19);
          ctx.stroke();
          ctx.fillStyle = def.color;
          ctx.fillRect(-r * .53, r * .13, r * .22, r * .3);
          ctx.fillRect(r * .31, r * .13, r * .22, r * .3);
        } else if (def.glyph === 'plus') {
          ctx.font = '900 ' + Math.round(r * .72) + 'px Orbitron, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#23310b';
          ctx.fillText('+175', 0, 1);
        } else if (def.glyph === 'eye') {
          ctx.beginPath();
          ctx.ellipse(0, 0, r * .52, r * .3, 0, 0, TAU);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = def.color;
          ctx.beginPath();
          ctx.arc(0, 0, r * .15, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#1a0e21';
          ctx.beginPath();
          ctx.arc(0, 0, r * .07, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    drawSnakes(time, vb) {
      const g = this.game;
      const snakes = g.snakes;
      const list = [];
      for (let i = 0; i < snakes.length; i++) {
        const s = snakes[i];
        if (!s.alive) continue;
        list.push(s);
      }
      list.sort((a, b) => a.mass - b.mass);
      for (let i = 0; i < list.length; i++) {
        if (list[i] === g.player) continue;
        this.drawSnake(list[i], time, vb);
      }
      if (g.player && g.player.alive) this.drawSnake(g.player, time, vb);
    }

    skinFor(snake) {
      const mode = this.game.save.settings.colorblind;
      if (!mode || mode === 'none') return snake.skin;
      if (snake._cbMode === mode && snake._cbSkin) return snake._cbSkin;
      const palette = CB_PALETTES[mode] || CB_PALETTES.deuter;
      const base = palette[hashName(snake.name) % palette.length];
      snake._cbMode = mode;
      snake._cbSkin = Object.assign({}, snake.skin, {
        colors: Object.assign({}, snake.skin.colors, {
          base,
          light: mixHex(base, '#ffffff', .58),
          glow: mixHex(base, '#ffffff', .3),
          dark: mixHex(base, '#07100f', .45)
        })
      });
      return snake._cbSkin;
    }

    isVisible(snake, vb) {
      if (snake.x > vb.l - 120 && snake.x < vb.r + 120 && snake.y > vb.t - 120 && snake.y < vb.b + 120) return true;
      const pts = snake.bodyPoints;
      for (let i = 0; i < pts.length; i += 5) {
        const p = pts[i];
        if (p.x > vb.l && p.x < vb.r && p.y > vb.t && p.y < vb.b) return true;
      }
      return false;
    }

    drawSnake(snake, time, vb) {
      if (!this.isVisible(snake, vb)) return;
      const ctx = this.ctx;
      const cam = this.game.camera;
      const z = cam.zoom;
      const radius = snake.radius;
      const pts = snake.bodyPoints;
      if (pts.length < 2) return;
      const skin = this.skinFor(snake);
      const C = this.theme.canvas;
      const powerInvincible = this.game.time < snake.powerInvincibleUntil;
      const powerMagnet = this.game.time < snake.powerMagnetUntil;

      const blink = snake.invuln > 0 && Math.sin(time * 24) < 0;
      ctx.save();
      if (blink) ctx.globalAlpha = .45;

      NS.drawSnakeBody(ctx, pts, radius, skin, time, this.game.quality, { step: 2 });

      // Aura de turbo
      if (snake.boosting) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const grad = ctx.createRadialGradient(snake.x, snake.y, 0, snake.x, snake.y, radius * 3.4);
        grad.addColorStop(0, rgba(skin.colors.glow, .22));
        grad.addColorStop(1, rgba(skin.colors.glow, 0));
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(snake.x, snake.y, radius * 3.4, 0, TAU); ctx.fill();
        ctx.strokeStyle = rgba(skin.colors.light, .55);
        ctx.lineWidth = 1.6;
        ctx.setLineDash([5, 9]);
        ctx.lineDashOffset = -time * 40;
        ctx.beginPath(); ctx.arc(snake.x, snake.y, radius * 2.2, 0, TAU); ctx.stroke();
        ctx.restore();
      }

      // Aura dorada de invencibilidad
      if (powerInvincible) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const ir = radius * 3.1 + Math.sin(time * 5) * 3;
        const ig = ctx.createRadialGradient(snake.x, snake.y, radius * .8, snake.x, snake.y, ir);
        ig.addColorStop(0, 'rgba(255,224,150,.26)');
        ig.addColorStop(.55, 'rgba(255,197,80,.11)');
        ig.addColorStop(1, 'rgba(255,180,40,0)');
        ctx.fillStyle = ig;
        ctx.beginPath(); ctx.arc(snake.x, snake.y, ir, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,232,164,.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 8]);
        ctx.lineDashOffset = time * 32;
        ctx.beginPath(); ctx.arc(snake.x, snake.y, radius * 2.5, 0, TAU); ctx.stroke();
        ctx.restore();
      }

      // Campo magnético
      if (powerMagnet) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,47,179,.18)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([2, 13]);
        ctx.lineDashOffset = -time * 24;
        ctx.beginPath(); ctx.arc(snake.x, snake.y, radius * 2.8, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // Estela al acelerar
      if (snake.boosting && this.game.quality !== 'low') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 1; i <= 3; i++) {
          const frac = i / 4;
          const idx = Math.floor(frac * Math.min(pts.length - 1, 26));
          const p = pts[idx];
          ctx.fillStyle = rgba(skin.colors.glow, .05 * (1 - frac));
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius * (1.2 + frac), 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }

      NS.drawSnakeHead(ctx, snake.x, snake.y, snake.angle, radius, skin, time, {
        outfit: snake.outfit,
        accessory: snake.accessory
      });

      if (snake.isLeader) NS.drawCrown(ctx, snake.x, snake.y, radius, time);

      // Escudo
      if (snake.shieldCharges > 0 || snake.invuln > 0) {
        const sr = radius * 2.35 + Math.sin(time * 3) * 2;
        ctx.save();
        ctx.strokeStyle = snake.invuln > 0 ? NS.rgba(C.accent, .65) : 'rgba(255,207,92,.48)';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([6, 6]);
        ctx.lineDashOffset = time * 24;
        ctx.beginPath(); ctx.arc(snake.x, snake.y, sr, 0, TAU); ctx.stroke();
        ctx.fillStyle = snake.invuln > 0 ? NS.rgba(C.accent, .06) : 'rgba(255,207,92,.045)';
        ctx.beginPath(); ctx.arc(snake.x, snake.y, sr, 0, TAU); ctx.fill();
        ctx.restore();
      }

      // Nombre
      if (this.game.state !== 'menu' && this.game.save.settings.nameTags !== false) {
        this.drawName(snake, time, z);
      }
      ctx.restore();
    }

    drawName(snake, time, zoom) {
      const ctx = this.ctx;
      const fs = 11 / zoom;
      const padX = 6 / zoom;
      const padY = 4 / zoom;
      ctx.save();
      ctx.font = '700 ' + fs + 'px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = snake.isPlayer ? snake.name + ' · TÚ' : snake.name;
      const tw = ctx.measureText(label).width;
      const bw = tw + padX * 2;
      const bh = fs + padY * 2;
      const y = snake.y - snake.radius * 2.7 - 12 / zoom;
      const C = this.theme.canvas;
      ctx.globalAlpha = .8;
      ctx.fillStyle = 'rgba(3,8,16,.58)';
      ctx.beginPath();
      const x0 = snake.x - bw / 2;
      const r = 4 / zoom;
      ctx.roundRect ? ctx.roundRect(x0, y - bh / 2, bw, bh, r) : ctx.rect(x0, y - bh / 2, bw, bh);
      ctx.fill();
      ctx.strokeStyle = snake.isPlayer ? NS.rgba(C.accent, .36) : 'rgba(150,220,255,.12)';
      ctx.lineWidth = .8 / zoom;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = snake.isPlayer ? C.accent : 'rgba(200,235,245,.72)';
      ctx.fillText(label, snake.x, y + .5 / zoom);
      ctx.restore();
    }

    drawParticles() {
      const ctx = this.ctx;
      const ps = this.game.particles.particles;
      if (!ps.length) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        const a = clamp(p.life / p.maxLife, 0, 1);
        if (p.kind === 'ring') {
          ctx.globalAlpha = a * .55;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2.5 * a + .4;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.stroke();
        } else if (p.kind === 'spark') {
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * a, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = a * .35;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(.5, p.size * a * .5);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * .035, p.y - p.vy * .035);
          ctx.stroke();
        } else {
          const sprite = NS.orbSprite(p.color);
          const s = p.size * 5 * (0.5 + a * .7);
          ctx.globalAlpha = a * .55;
          ctx.drawImage(sprite, p.x - s / 2, p.y - s / 2, s, s);
        }
      }
      ctx.restore();

      // Textos flotantes
      const texts = this.game.particles.texts;
      if (texts.length) {
        const zoom = this.game.camera.zoom;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < texts.length; i++) {
          const t = texts[i];
          const a = clamp(t.life / t.maxLife, 0, 1);
          const size = t.size / zoom;
          ctx.globalAlpha = a;
          ctx.font = '700 ' + size + 'px Rajdhani, sans-serif';
          ctx.fillStyle = t.color;
          ctx.shadowColor = t.color;
          ctx.shadowBlur = 8 / zoom;
          ctx.fillText(t.text, t.x, t.y);
        }
        ctx.restore();
      }
    }

    drawScreenFx(time) {
      const g = this.game;
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;
      const flashes = g.save.settings.flashes !== false;

      if (g.flash > 0 && flashes) {
        ctx.save();
        ctx.globalAlpha = g.flash;
        const grad = ctx.createRadialGradient(w / 2, h / 2, h * .15, w / 2, h / 2, h * .9);
        grad.addColorStop(0, 'rgba(255,20,70,0)');
        grad.addColorStop(1, 'rgba(255,20,70,.8)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      const p = g.player;
      if (p && p.alive && g.state === 'playing') {
        const edge = hypot(p.x, p.y);
        const danger = clamp((edge - (CFG.worldRadius - 520)) / 380, 0, 1);
        if (danger > 0.01 && flashes) {
          ctx.save();
          const grad = ctx.createRadialGradient(w / 2, h / 2, h * .26, w / 2, h / 2, h * .82);
          grad.addColorStop(0, 'rgba(255,40,80,0)');
          grad.addColorStop(1, 'rgba(255,40,80,' + (.28 * danger) + ')');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
          ctx.restore();
        }
        if (p.boosting) {
          const C = this.theme.canvas;
          ctx.save();
          ctx.strokeStyle = NS.rgba(C.accent, .055);
          ctx.lineWidth = 1.4;
          const cx = w / 2, cy = h / 2;
          for (let i = 0; i < 26; i++) {
            const a = (i / 26) * TAU + Math.sin(i * 12.9898) * .1;
            const r0 = Math.max(w, h) * (.36 + .08 * ((i * 7) % 5) / 5);
            const r1 = Math.max(w, h) * .7;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
            ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    }

    drawReticle(time) {
      const g = this.game;
      const input = g.input;
      if (!input || !input.hasPointer || g.isCoarse || !input.pointerSteering()) return;
      const ctx = this.ctx;
      const p = g.player;
      if (!p || !p.alive) return;
      const C = this.theme.canvas;
      const mouse = input.mouse;
      const r = 9;
      ctx.save();
      ctx.translate(mouse.x, mouse.y);
      ctx.rotate(time * .7);
      ctx.strokeStyle = C.reticle;
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, r, i * Math.PI / 2 + .2, i * Math.PI / 2 + .95);
        ctx.stroke();
      }
      ctx.rotate(-time * .7);
      ctx.fillStyle = NS.rgba(C.accent, .9);
      ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = NS.rgba(C.accent, .22);
      ctx.beginPath(); ctx.arc(0, 0, r + 5, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    drawMinimap(time) {
      if (!this.mmCtx) return;
      if (this.game.save.settings.minimap === false) return;
      const ctx = this.mmCtx;
      const size = this.minimap.width;
      const c = size / 2;
      const R = c - 7;
      const worldR = CFG.worldRadius;
      const s = R / worldR;
      const g = this.game;
      const p = g.player;
      const C = this.theme.canvas;
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath(); ctx.arc(c, c, R, 0, TAU); ctx.clip();
      ctx.fillStyle = C.bg0;
      ctx.globalAlpha = .82;
      ctx.fillRect(0, 0, size, size);
      ctx.globalAlpha = 1;

      // Anillos
      ctx.strokeStyle = NS.rgba(C.accent, .13);
      ctx.lineWidth = 1;
      for (let i = 1; i <= 2; i++) {
        ctx.beginPath(); ctx.arc(c, c, R * i / 3, 0, TAU); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(c, c - R); ctx.lineTo(c, c + R); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(c - R, c); ctx.lineTo(c + R, c); ctx.stroke();

      // Barrido radar
      if (this.radar === undefined) this.radar = 0;
      this.radar += .016;
      const sweep = this.radar % TAU;
      const grad = ctx.createConicGradient ? ctx.createConicGradient(sweep, c, c) : null;
      if (grad) {
        grad.addColorStop(0, NS.rgba(C.accent, 0));
        grad.addColorStop(.86, NS.rgba(C.accent, 0));
        grad.addColorStop(1, NS.rgba(C.accent, .14));
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(c, c, R, 0, TAU); ctx.fill();
      }

      // Comida especial
      for (const f of g.foods.list) {
        if (f.kind !== 'chase' && f.kind !== 'rare') continue;
        ctx.fillStyle = NS.rgba(NS.GOLD, .55);
        ctx.beginPath();
        ctx.arc(c + f.x * s, c + f.y * s, f.kind === 'chase' ? 2.6 : 1.3, 0, TAU);
        ctx.fill();
      }

      // Potenciadores
      if (g.powerups) {
        for (const pw of g.powerups.list) {
          ctx.fillStyle = NS.rgba(pw.def.color, .95);
          ctx.beginPath();
          ctx.arc(c + pw.x * s, c + pw.y * s, 1.9, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = NS.rgba(pw.def.color, .4);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(c + pw.x * s, c + pw.y * s, 3.7, 0, TAU);
          ctx.stroke();
        }
      }

      // Serpientes
      const snakes = g.snakes;
      for (let i = 0; i < snakes.length; i++) {
        const sn = snakes[i];
        if (!sn.alive) continue;
        const x = c + sn.x * s;
        const y = c + sn.y * s;
        if (sn.isPlayer) continue;
        ctx.fillStyle = NS.rgba(this.skinFor(sn).colors.base, sn.isLeader ? .95 : .68);
        ctx.beginPath();
        ctx.arc(x, y, sn.radius > 15 ? 2.6 : 1.8, 0, TAU);
        ctx.fill();
        if (sn.isLeader) {
          ctx.strokeStyle = 'rgba(255,207,92,.85)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, 4.4, 0, TAU); ctx.stroke();
        }
      }

      if (p && p.alive) {
        const x = c + p.x * s;
        const y = c + p.y * s;
        ctx.fillStyle = NS.rgba(C.accent, .18);
        ctx.beginPath(); ctx.arc(x, y, 12, 0, TAU); ctx.fill();
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.angle);
        ctx.fillStyle = C.accent;
        ctx.beginPath();
        ctx.moveTo(6.5, 0); ctx.lineTo(-4, -4.2); ctx.lineTo(-2, 0); ctx.lineTo(-4, 4.2);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      // Borde
      ctx.strokeStyle = p && p.alive && hypot(p.x, p.y) > worldR - 500 ? 'rgba(255,77,109,.5)' : NS.rgba(C.accent, .24);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(c, c, R, 0, TAU); ctx.stroke();
    }
  }

  NS.Renderer = Renderer;
})();

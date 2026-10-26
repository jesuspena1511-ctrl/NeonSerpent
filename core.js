/* ============================================================
   NEON SERPENT — Core: config, data, save, drawing helpers
   ============================================================ */
(function () {
  'use strict';
  const NS = (window.NS = window.NS || {});

  /* ---------------- Utilities ---------------- */
  const TAU = Math.PI * 2;
  const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (min, max) => min + Math.random() * (max - min);
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  const hypot = Math.hypot;
  const angleDiff = (a, b) => {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  };
  const approachAngle = (current, target, maxStep) => current + clamp(angleDiff(current, target), -maxStep, maxStep);
  const smoothTo = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (str) => String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const formatTime = (sec) => {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  };
  const formatDuration = (sec) => {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm';
    return sec + 's';
  };
  const formatNum = (n) => Math.floor(n).toLocaleString('es-MX');
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- Config ---------------- */
  const CFG = {
    worldRadius: 3200,
    trailStep: 4,
    baseSpeed: 212,
    boostSpeed: 386,
    turnRate: 4.65,
    boostDrain: 13.5,
    boostMinMass: 20,
    startMass: 26,
    normalFood: 470,
    rareFood: 14,
    chaseOrbs: 3,
    maxBots: 15,
    maxBodySegments: 360,
    comboWindow: 2.1,
    gridCell: 128,
    maxParticles: 700,
    maxFoods: 1150,
    maxPowerups: 4,
    powerupRespawn: 26,
    magnetPower: 360
  };

  /* ---------------- Themes & difficulty ---------------- */
  const THEMES = {
    aurora: {
      id: 'aurora', name: 'AURORA', tag: 'CALMA',
      desc: 'Menta, durazno y brisa nocturna.',
      audio: { bpm: 64, style: 'calm', gain: .7 },
      canvas: {
        bg0: '#071210', bg1: '#0a1b19', bg2: '#06100f',
        arena: ['#0f2c26', '#0a201d', '#071613', '#050f0e', '#040b0a'],
        star: '#d8fff2', starAlt: '#ffd6c7', starBlue: '#c9c2ff',
        nebula: ['126,240,205', '186,174,255', '255,180,158', '146,210,230'],
        grid: 'rgba(140,245,215,.045)', grid2: 'rgba(160,255,232,.022)',
        ring: 'rgba(160,235,215,.07)', border: '#a5f7e2',
        borderSoft: 'rgba(165,247,226,.5)', magenta: '#ffb39d',
        accent: '#a5f7e2', text: 'rgba(190,245,230,.06)',
        foods: ['#8ef0d0', '#ffb39d', '#d9c6ff', '#ffe0a8', '#9fd6ff', '#c8f0a6', '#ffc4d9'],
        minimap: 'rgba(165,247,226,.2)', reticle: 'rgba(198,255,240,.8)'
      }
    },
    neon: {
      id: 'neon', name: 'NEÓN', tag: 'ARCADE',
      desc: 'Cian eléctrico y magenta de arcade.',
      audio: { bpm: 88, style: 'synth', gain: 1 },
      canvas: {
        bg0: '#02050b', bg1: '#040911', bg2: '#050712',
        arena: ['#0a1a2d', '#071322', '#040d18', '#030a13', '#02070e'],
        star: '#d8f8ff', starAlt: '#ff9ddd', starBlue: '#9fdcff',
        nebula: ['34,245,226', '255,47,179', '86,168,255', '157,107,255', '198,255,61'],
        grid: 'rgba(90,215,250,.05)', grid2: 'rgba(34,245,226,.026)',
        ring: 'rgba(90,215,250,.045)', border: '#96fff6',
        borderSoft: 'rgba(150,255,246,.68)', magenta: '#ff2fb3',
        accent: '#22f5e2', text: 'rgba(160,240,255,.09)',
        foods: ['#22f5e2', '#ff2fb3', '#c6ff3d', '#ffc94a', '#9d6bff', '#56a8ff', '#ff7a5c'],
        minimap: 'rgba(34,245,226,.18)', reticle: 'rgba(170,255,248,.7)'
      }
    },
    ocean: {
      id: 'ocean', name: 'OCÉANO', tag: 'PROFUNDO',
      desc: 'Azules profundos y coral suave.',
      audio: { bpm: 72, style: 'deep', gain: .82 },
      canvas: {
        bg0: '#04101a', bg1: '#071a28', bg2: '#050f19',
        arena: ['#0b2b3d', '#082333', '#061a27', '#04121d', '#030d16'],
        star: '#d6f7ff', starAlt: '#ffb9a3', starBlue: '#9edfff',
        nebula: ['72,196,232', '120,160,255', '255,150,132', '120,230,220'],
        grid: 'rgba(110,210,245,.05)', grid2: 'rgba(110,230,235,.024)',
        ring: 'rgba(120,215,245,.05)', border: '#9de7ff',
        borderSoft: 'rgba(157,231,255,.6)', magenta: '#ff9f8d',
        accent: '#9de7ff', text: 'rgba(180,230,250,.08)',
        foods: ['#7fe3ff', '#ffa58f', '#b8d4ff', '#9ff0d8', '#ffd7a1', '#d6c2ff', '#8ce8d2'],
        minimap: 'rgba(120,220,250,.2)', reticle: 'rgba(184,245,255,.78)'
      }
    },
    halloween: {
      id: 'halloween', name: 'HALLOWEEN', tag: 'TERROR',
      desc: 'Calabazas, brujería y dulces de medianoche.',
      audio: { bpm: 58, style: 'deep', gain: .78 },
      canvas: {
        bg0: '#08040b', bg1: '#130714', bg2: '#050207',
        arena: ['#2a1020', '#1d0a18', '#120611', '#0a040a', '#060206'],
        star: '#ffd0a0', starAlt: '#d8b4ff', starBlue: '#ffb36b',
        nebula: ['255,138,58', '178,74,255', '255,90,120', '255,205,120'],
        grid: 'rgba(255,140,60,.045)', grid2: 'rgba(190,100,255,.03)',
        ring: 'rgba(255,160,80,.07)', border: '#ffb35c',
        borderSoft: 'rgba(255,179,92,.58)', magenta: '#b44cff',
        accent: '#ff9e40', text: 'rgba(255,209,160,.08)',
        foods: ['#ff9e40', '#ff5a7a', '#c78bff', '#ffe28a', '#76f0c8', '#ffa8d8', '#d9ff70'],
        minimap: 'rgba(255,158,64,.24)', reticle: 'rgba(255,225,190,.85)'
      }
    },
    fiesta: {
      id: 'fiesta', name: 'FIESTA', tag: 'ANIMADO',
      desc: 'Confeti, rosa eléctrico y luces de neón.',
      audio: { bpm: 102, style: 'synth', gain: 1 },
      canvas: {
        bg0: '#0a0414', bg1: '#160a24', bg2: '#07020f',
        arena: ['#2a0f3c', '#1e0a2f', '#140720', '#0c0314', '#07020d'],
        star: '#fff3a8', starAlt: '#ff8ad8', starBlue: '#8af4ff',
        nebula: ['255,80,190', '86,240,255', '255,220,80', '150,100,255'],
        grid: 'rgba(255,180,90,.05)', grid2: 'rgba(120,240,255,.03)',
        ring: 'rgba(255,110,200,.06)', border: '#8af4ff',
        borderSoft: 'rgba(138,244,255,.65)', magenta: '#ff4fc8',
        accent: '#8af4ff', text: 'rgba(255,230,170,.08)',
        foods: ['#ff4fc8', '#8af4ff', '#ffe45c', '#a6ff6b', '#c08bff', '#ff9a5c', '#ffffff'],
        minimap: 'rgba(138,244,255,.22)', reticle: 'rgba(255,245,190,.9)'
      }
    }
  };
  let activeTheme = 'aurora';
  function setTheme(id) {
    const key = THEMES[id] ? id : 'aurora';
    activeTheme = key;
    if (document.documentElement) document.documentElement.dataset.theme = key;
    return THEMES[key];
  }
  function getTheme() { return THEMES[activeTheme]; }

  const DIFFICULTIES = {
    easy: {
      id: 'easy', name: 'FÁCIL', desc: 'Rivales tranquilos y más comida.',
      bots: 8, speed: .88, skill: [.22, .52], aggression: [.02, .3], greed: [.5, .95], food: 1.18
    },
    normal: {
      id: 'normal', name: 'NORMAL', desc: 'La arena clásica, equilibrada.',
      bots: 15, speed: 1, skill: [.42, 1], aggression: [.08, .85], greed: [.55, 1.25], food: 1
    },
    hard: {
      id: 'hard', name: 'DIFÍCIL', desc: 'IA agresiva, rápida y con menos margen.',
      bots: 22, speed: 1.045, skill: [.68, 1], aggression: [.38, 1], greed: [.9, 1.5], food: .86
    }
  };

  /* ---------------- Skins ---------------- */
  const SKINS = [
    {
      id: 'ion', name: 'IÓN PRIME', tag: 'CYAN', price: 0, pattern: 'stripes',
      colors: { base: '#12d8c8', dark: '#043b40', light: '#d6fffb', glow: '#22f5e2', accent: '#ff2fb3' }
    },
    {
      id: 'magma', name: 'MAGMA', tag: 'NARANJA', price: 0, pattern: 'bands',
      colors: { base: '#ff6a2a', dark: '#431103', light: '#ffe2a6', glow: '#ff8a3d', accent: '#ffd23f' }
    },
    {
      id: 'venom', name: 'VENENO', tag: 'LIMA', price: 180, pattern: 'dots',
      colors: { base: '#9fe825', dark: '#213d06', light: '#f1ffc0', glow: '#c6ff3d', accent: '#22f5e2' }
    },
    {
      id: 'nova', name: 'NOVA', tag: 'MAGENTA', price: 300, pattern: 'stripes',
      colors: { base: '#ff3cae', dark: '#43082b', light: '#ffd5ec', glow: '#ff2fb3', accent: '#56a8ff' }
    },
    {
      id: 'glacier', name: 'GLACIAR', tag: 'HIELO', price: 450, pattern: 'bands',
      colors: { base: '#5fd4ff', dark: '#082943', light: '#e9feff', glow: '#8ee8ff', accent: '#9d6bff' }
    },
    {
      id: 'aurum', name: 'AURUM', tag: 'ORO', price: 700, pattern: 'dots',
      colors: { base: '#ffc94a', dark: '#463002', light: '#fff7d9', glow: '#ffcf5c', accent: '#ffffff' }
    },
    {
      id: 'phantom', name: 'FANTASMA', tag: 'VIOLETA', price: 900, pattern: 'stripes',
      colors: { base: '#9d6bff', dark: '#241046', light: '#e7dbff', glow: '#b78bff', accent: '#22f5e2' }
    },
    {
      id: 'sakura', name: 'SAKURA', tag: 'ROSA', price: 1200, pattern: 'dots',
      colors: { base: '#ff8bc8', dark: '#45102f', light: '#ffe4f2', glow: '#ff6cd0', accent: '#ffffff' }
    },
    {
      id: 'void', name: 'VACÍO', tag: 'ROJO', price: 1600, pattern: 'bands',
      colors: { base: '#ff3355', dark: '#28030a', light: '#ffb3c0', glow: '#ff4d6d', accent: '#ffcf5c' }
    },
    {
      id: 'prism', name: 'PRISMA', tag: 'PRISMÁTICO', price: 2400, pattern: 'prism',
      colors: { base: '#ff2fb3', dark: '#141024', light: '#ffffff', glow: '#ffffff', accent: '#22f5e2' }
    },
    {
      id: 'pumpkin', name: 'CALABAZA', tag: 'TERROR', price: 180, currency: 'candy', event: true, pattern: 'bands',
      colors: { base: '#ff8a1f', dark: '#2a0a02', light: '#ffd9a3', glow: '#ff9e40', accent: '#4b1d0b' }
    },
    {
      id: 'ghost', name: 'ESPECTRO', tag: 'FANTASMA', price: 300, currency: 'candy', event: true, pattern: 'stripes',
      colors: { base: '#bfe8ff', dark: '#162a42', light: '#ffffff', glow: '#a6dcff', accent: '#b44cff' }
    },
    {
      id: 'witch', name: 'AQUELARRE', tag: 'MALEFICIO', price: 480, currency: 'candy', event: true, pattern: 'dots',
      colors: { base: '#a44cff', dark: '#22083f', light: '#eddcff', glow: '#b44cff', accent: '#ff9e40' }
    }
  ];
  const SKIN_MAP = Object.fromEntries(SKINS.map((s) => [s.id, s]));

  /* ---------------- Ropa y accesorios ---------------- */
  const OUTFITS = [
    {
      id: 'none', name: 'SIN ROPA', tag: 'BASE', price: 0, currency: 'coins', style: 'none',
      desc: 'La piel de tu serpiente, sin capas encima.'
    },
    {
      id: 'scarf', name: 'BUFANDA', tag: 'ROJA', price: 220, currency: 'coins', style: 'scarf',
      desc: 'Una bufanda tejida que ondea al avanzar.'
    },
    {
      id: 'armor', name: 'CORAZA', tag: 'TITANIO', price: 520, currency: 'coins', style: 'armor',
      desc: 'Placas metálicas ligeras con remaches luminosos.'
    },
    {
      id: 'tux', name: 'ESMOQUIN', tag: 'ELEGANTE', price: 780, currency: 'coins', style: 'tux',
      desc: 'Corbata de moño y cuello blanco para arrasar con estilo.'
    },
    {
      id: 'holo', name: 'HOLOGRAMA', tag: 'PRISMA', price: 1050, currency: 'coins', style: 'holo',
      desc: 'Aros de luz que cambian de color sin parar.'
    },
    {
      id: 'pumpkin', name: 'DISFRAZ DE CALABAZA', tag: 'TERROR', price: 150, currency: 'candy', event: true, style: 'pumpkin',
      desc: 'Máscara de calabaza con tallo y costuras de medianoche.'
    },
    {
      id: 'spirit', name: 'SÁBANA DE ESPÍRITU', tag: 'FANTASMA', price: 270, currency: 'candy', event: true, style: 'spirit',
      desc: 'Una sábana flotante con pliegues que brillan en la oscuridad.'
    },
    {
      id: 'vampire', name: 'CAPA DE VAMPIRO', tag: 'NOCTURNO', price: 430, currency: 'candy', event: true, style: 'vampire',
      desc: 'Capa de terciopelo, cuello alto y colmillos de escenario.'
    }
  ];
  const OUTFIT_MAP = Object.fromEntries(OUTFITS.map((c) => [c.id, c]));

  const ACCESSORIES = [
    {
      id: 'none', name: 'SIN ACCESORIO', tag: 'BASE', price: 0, currency: 'coins', style: 'none',
      desc: 'Nada extra. Solo tú y la arena.'
    },
    {
      id: 'shades', name: 'GAFAS OSCURAS', tag: 'COOL', price: 260, currency: 'coins', style: 'shades',
      desc: 'Lentes ahumados que ocultan una mirada peligrosa.'
    },
    {
      id: 'headphones', name: 'AURICULARES', tag: 'RITMO', price: 380, currency: 'coins', style: 'headphones',
      desc: 'Auriculares con luz de neón para entrar en modo concentración.'
    },
    {
      id: 'tophat', name: 'SOMBRERO DE COPAS', tag: 'GALA', price: 560, currency: 'coins', style: 'tophat',
      desc: 'Un sombrero alto con cinta magenta y aplomo de leyenda.'
    },
    {
      id: 'halo', name: 'AUREOLA', tag: 'MITO', price: 880, currency: 'coins', style: 'halo',
      desc: 'Un aro dorado que flota sobre tu cabeza. Muy poco discreto.'
    },
    {
      id: 'crown', name: 'CORONA DE CAMPEÓN', tag: 'ÉLITE', price: 1200, currency: 'coins', style: 'crown',
      desc: 'Para quien ya no necesita presentarse en la arena.'
    },
    {
      id: 'bat', name: 'MURCIÉLAGO', tag: 'TERROR', price: 110, currency: 'candy', event: true, style: 'bat',
      desc: 'Un pequeño murciélago te acompaña aleteando.'
    },
    {
      id: 'witchhat', name: 'SOMBRERO DE BRUJA', tag: 'AQUELARRE', price: 240, currency: 'candy', event: true, style: 'witchhat',
      desc: 'Sombrero de bruja con hebilla encantada.'
    },
    {
      id: 'bones', name: 'HUESOS BRILLANTES', tag: 'CRIPTA', price: 360, currency: 'candy', event: true, style: 'bones',
      desc: 'Un adorno óseo que brilla con luz espectral.'
    }
  ];
  const ACCESSORY_MAP = Object.fromEntries(ACCESSORIES.map((c) => [c.id, c]));

  const COSMETIC_TYPES = {
    skin: { list: SKINS, map: SKIN_MAP, owned: 'owned', label: 'Piel', plural: 'Pieles' },
    outfit: { list: OUTFITS, map: OUTFIT_MAP, owned: 'ownedOutfits', label: 'Ropa', plural: 'Ropa' },
    accessory: { list: ACCESSORIES, map: ACCESSORY_MAP, owned: 'ownedAccessories', label: 'Accesorio', plural: 'Accesorios' }
  };

  /* ---------------- Potenciadores ---------------- */
  const POWERUPS = [
    {
      id: 'invincible', name: 'INVENCIBLE', candyName: 'CARAMELO BRILLANTE', tag: '15 S',
      desc: 'Invulnerable y con turbo infinito durante 15 segundos.',
      duration: 15, color: '#ffd76a', icon: 'i-shield', glyph: 'shield'
    },
    {
      id: 'magnet', name: 'IMÁN', candyName: 'DULCE MAGNÉTICO', tag: '30 S',
      desc: 'Atrae orbes y dulces desde mucha más distancia durante 30 segundos.',
      duration: 30, color: '#ff2fb3', icon: 'i-magnet', glyph: 'magnet'
    },
    {
      id: 'jackpot', name: 'BONO', candyName: 'PIRULETA DE MASA', tag: '+175',
      desc: 'Suma 175 de masa al instante.',
      duration: 0, color: '#c6ff3d', icon: 'i-gem', glyph: 'plus'
    },
    {
      id: 'zoom', name: 'VISIÓN', candyName: 'CARAMELO DE VISIÓN', tag: '20 S',
      desc: 'Aleja la cámara para ver más lejos durante 20 segundos.',
      duration: 20, color: '#56a8ff', icon: 'i-eye', glyph: 'eye'
    }
  ];
  const POWERUP_MAP = Object.fromEntries(POWERUPS.map((p) => [p.id, p]));

  /* ---------------- Upgrades ---------------- */
  const UPGRADES = [
    {
      id: 'turbo', name: 'TURBO CUÁNTICO', icon: 'i-bolt', accent: 'cyan', max: 5,
      desc: 'Reduce el gasto de masa al acelerar un 9% por nivel.',
      costs: [90, 200, 380, 620, 950]
    },
    {
      id: 'magnet', name: 'CAMPO MAGNÉTICO', icon: 'i-magnet', accent: 'magenta', max: 5,
      desc: 'Atrae orbes desde 22 px más lejos por nivel.',
      costs: [120, 260, 460, 720, 1100]
    },
    {
      id: 'seed', name: 'NÚCLEO SEMILLA', icon: 'i-seed', accent: 'lime', max: 5,
      desc: 'Empiezas cada partida con +8 de masa por nivel.',
      costs: [100, 220, 420, 680, 1000]
    },
    {
      id: 'harvest', name: 'COSECHA CUÁNTICA', icon: 'i-gem', accent: 'amber', max: 5,
      desc: 'Cada orbe concede un 7% más de masa por nivel.',
      costs: [160, 340, 600, 900, 1400]
    },
    {
      id: 'shield', name: 'ESCUDO DE EMERGENCIA', icon: 'i-shield', accent: 'violet', max: 5,
      desc: 'Sobrevives a un choque letal. Ganas +1 carga en los niveles 3 y 5.',
      costs: [400, 900, 1500, 2300, 3400]
    }
  ];
  const UPGRADE_MAP = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

  /* ---------------- Logros ---------------- */
  const ACHIEVEMENTS = [
    {
      id: 'first_bite', name: 'PRIMER BOCADO', icon: 'i-gem', stat: 'orbs', goal: 1,
      desc: 'Recoge tu primer orbe o dulce.', reward: { coins: 40 }
    },
    {
      id: 'orbs_100', name: 'RECOLECTOR', icon: 'i-gem', stat: 'orbs', goal: 100,
      desc: 'Recoge 100 orbes o dulces en total.', reward: { coins: 120 }
    },
    {
      id: 'orbs_1000', name: 'ENJAMBRE', icon: 'i-gem', stat: 'orbs', goal: 1000,
      desc: 'Recoge 1,000 orbes o dulces en total.', reward: { coins: 350 }
    },
    {
      id: 'orbs_5000', name: 'GLOTÓN', icon: 'i-gem', stat: 'orbs', goal: 5000,
      desc: 'Recoge 5,000 orbes o dulces en total.', reward: { outfit: 'scarf', coins: 500 }
    },
    {
      id: 'first_blood', name: 'PRIMERA BAJA', icon: 'i-bolt', stat: 'kills', goal: 1,
      desc: 'Elimina a tu primera serpiente.', reward: { coins: 60 }
    },
    {
      id: 'hunter', name: 'CAZADOR', icon: 'i-bolt', stat: 'kills', goal: 10,
      desc: 'Elimina a 10 serpientes en total.', reward: { coins: 180 }
    },
    {
      id: 'predator', name: 'DEPREDADOR', icon: 'i-bolt', stat: 'kills', goal: 50,
      desc: 'Elimina a 50 serpientes en total.', reward: { accessory: 'shades', coins: 240 }
    },
    {
      id: 'legend', name: 'LEYENDA', icon: 'i-bolt', stat: 'kills', goal: 200,
      desc: 'Elimina a 200 serpientes en total.', reward: { skin: 'void', coins: 800 }
    },
    {
      id: 'veteran', name: 'VETERANO', icon: 'i-play', stat: 'runs', goal: 25,
      desc: 'Completa 25 partidas.', reward: { coins: 300 }
    },
    {
      id: 'centurion', name: 'CENTURIÓN', icon: 'i-play', stat: 'runs', goal: 100,
      desc: 'Completa 100 partidas.', reward: { skin: 'aurum', coins: 700 }
    },
    {
      id: 'survivor', name: 'SUPERVIVIENTE', icon: 'i-clock', stat: 'time', goal: 600,
      desc: 'Acumula 10 minutos de supervivencia.', reward: { coins: 200 }
    },
    {
      id: 'endurance', name: 'RESISTENCIA', icon: 'i-clock', stat: 'time', goal: 3600,
      desc: 'Acumula una hora de supervivencia.', reward: { outfit: 'armor', coins: 600 }
    },
    {
      id: 'combo_10', name: 'CADENA x10', icon: 'i-turbo', stat: 'bestCombo', goal: 10,
      desc: 'Alcanza un combo de x10 en una partida.', reward: { coins: 120 }
    },
    {
      id: 'combo_20', name: 'CADENA x20', icon: 'i-turbo', stat: 'bestCombo', goal: 20,
      desc: 'Alcanza un combo de x20 en una partida.', reward: { outfit: 'tux', coins: 350 }
    },
    {
      id: 'arena_king', name: 'REY DE LA ARENA', icon: 'i-coin', stat: 'wins', goal: 1,
      desc: 'Termina una partida en primer lugar.', reward: { coins: 250 }
    },
    {
      id: 'dynasty', name: 'DINASTÍA', icon: 'i-coin', stat: 'wins', goal: 10,
      desc: 'Termina 10 partidas en primer lugar.', reward: { skin: 'sakura', coins: 900 }
    },
    {
      id: 'power_first', name: 'BENDICIÓN', icon: 'i-shield', stat: 'powerups', goal: 1,
      desc: 'Recoge tu primer potenciador.', reward: { coins: 50 }
    },
    {
      id: 'power_master', name: 'MAESTRO DE POTENCIADORES', icon: 'i-shield', stat: 'powerups', goal: 25,
      desc: 'Recoge 25 potenciadores en total.', reward: { coins: 500, accessory: 'halo' }
    },
    {
      id: 'giant', name: 'GIGANTE', icon: 'i-seed', stat: 'bestMass', goal: 500,
      desc: 'Alcanza 500 de masa en una partida.', reward: { coins: 300 }
    },
    {
      id: 'colossus', name: 'COLOSO', icon: 'i-seed', stat: 'bestMass', goal: 1500,
      desc: 'Alcanza 1,500 de masa en una partida.', reward: { coins: 1000 }
    },
    {
      id: 'shopper', name: 'COMPRADOR', icon: 'i-coin', stat: 'coinsSpent', goal: 500,
      desc: 'Gasta 500 monedas en cosméticos o mejoras.', reward: { coins: 200 }
    },
    {
      id: 'halloween_first', name: 'NOCHE DE DULCES', icon: 'i-candy', stat: 'halloweenRuns', goal: 1,
      desc: 'Juega tu primera partida del evento de Halloween.', reward: { candy: 80, accessory: 'bat' }
    },
    {
      id: 'halloween_hunter', name: 'TERROR NOCTURNO', icon: 'i-bolt', stat: 'halloweenKills', goal: 10,
      desc: 'Elimina a 10 serpientes durante Halloween.', reward: { candy: 120 }
    },
    {
      id: 'sugar_rush', name: 'FIEBRE DE AZÚCAR', icon: 'i-candy', stat: 'candyEarned', goal: 500,
      desc: 'Gana 500 dulces durante el evento.', reward: { skin: 'pumpkin', candy: 80 }
    },
    {
      id: 'trick_master', name: 'TRUCO O TRATO', icon: 'i-candy', stat: 'halloweenRuns', goal: 20,
      desc: 'Juega 20 partidas del evento de Halloween.', reward: { candy: 500, skin: 'witch' }
    },
    {
      id: 'candy_spender', name: 'DULCE CAPRICHO', icon: 'i-candy', stat: 'candySpent', goal: 300,
      desc: 'Gasta 300 dulces en la tienda de Halloween.', reward: { candy: 100 }
    }
  ];
  const ACHIEVEMENT_MAP = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

  /* ---------------- Bots & ranks ---------------- */
  const BOT_NAMES = [
    'ALE', 'BRUNO', 'CAMILA', 'DIEGO', 'ELENA', 'FÉLIX', 'GALA', 'HUGO', 'IRIS', 'JADE',
    'KIRA', 'LEO', 'LUNA', 'MATEO', 'NORA', 'OLIVER', 'PABLO', 'RAÚL', 'SOFÍA', 'TOBÍAS',
    'VALERIA', 'XIMENA', 'YAGO', 'ZOE', 'NOVA', 'ECLIPSE', 'ZAFIRO', 'VEGA', 'ÁGATA', 'DARÍO',
    'MÍA', 'NICO', 'RITA', 'SILAS', 'TEODORA', 'ULISES', 'VERA', 'WALTER', 'YARA', 'ZENÓN'
  ];
  const PLAYER_NAMES = [
    'ALE', 'BRUNO', 'CAMILA', 'DIEGO', 'ELENA', 'FÉLIX', 'GALA', 'HUGO', 'IRIS', 'JADE',
    'KIRA', 'LEO', 'LUNA', 'MATEO', 'NORA', 'OLIVER', 'PABLO', 'RAÚL', 'SOFÍA', 'TOBÍAS',
    'VALERIA', 'XIMENA', 'YAGO', 'ZOE', 'NOVA', 'ZAFIRO', 'VEGA'
  ];
  const HALLOWEEN_BOT_NAMES = [
    'CALABAZA', 'BRUJA', 'MURCIÉLAGO', 'ESPECTRO', 'VAMPIRO', 'AULLIDO', 'CRIPTA', 'LUNA LLENA',
    'TELARAÑA', 'SOMBRA', 'GHOUL', 'NOCHE', 'HECHIZO', 'ZOMBI', 'CANDELABRO'
  ];

  const RANKS = [
    { min: 0, name: 'NOVATO' },
    { min: 350, name: 'CAZADOR' },
    { min: 900, name: 'ÉLITE' },
    { min: 1800, name: 'DEPREDADOR' },
    { min: 3500, name: 'LEYENDA' },
    { min: 6000, name: 'MITO' }
  ];
  const rankFor = (score) => {
    let out = RANKS[0];
    for (const r of RANKS) if (score >= r.min) out = r;
    return out;
  };

  /* ---------------- Save ---------------- */
  const SAVE_KEY = 'neon-serpent-save-v1';
  function defaultSave() {
    return {
      version: 3,
      coins: 150,
      candy: 0,
      best: 0,
      name: 'Jugador#1',
      skin: 'ion',
      outfit: 'none',
      accessory: 'none',
      mode: 'bots',
      difficulty: 'normal',
      owned: ['ion', 'magma'],
      ownedOutfits: ['none'],
      ownedAccessories: ['none'],
      achievements: [],
      upgrades: { turbo: 0, magnet: 0, seed: 0, harvest: 0, shield: 0 },
      stats: {
        runs: 0, kills: 0, time: 0, orbs: 0, bestCombo: 0,
        wins: 0, powerups: 0, bestMass: 0, coinsSpent: 0,
        candyEarned: 0, candySpent: 0, halloweenRuns: 0, halloweenKills: 0
      },
      settings: {
        music: 46, sfx: 68, muted: false,
        theme: 'aurora', motion: 'soft', quality: 'auto', autoQuality: true,
        shake: true, particles: true, captions: true, haptics: true,
        controls: 'auto', sensitivity: 100, highContrast: false, largeUI: false,
        colorblind: 'none', pauseOnBlur: true, fpsMeter: false, showHints: true,
        minimap: true, nameTags: true, flashes: true, powerAlerts: true, cameraScale: 100
      }
    };
  }
  const CONTROL_MODES = ['auto', 'mouse', 'touch', 'keys', 'joystick', 'dpad', 'gamepad', 'hybrid'];
  const MOTION_MODES = ['soft', 'full', 'reduced'];
  const COLORBLIND_MODES = ['none', 'deuter', 'prot', 'trit'];
  const modal = (v, arr, fallback) => (arr.includes(v) ? v : fallback);
  const boolSetting = (v, fallback) => (v === undefined || v === null ? fallback : !!v);
  const statNum = (v, float) => Math.max(0, float ? Number(v) || 0 : Math.floor(Number(v) || 0));
  const Save = {
    data: defaultSave(),
    load() {
      const base = defaultSave();
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) { this.data = base; return this.data; }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') { this.data = base; return this.data; }
        const d = base;
        d.coins = clamp(Math.floor(Number(parsed.coins) || 0), 0, 9999999);
        d.candy = clamp(Math.floor(Number(parsed.candy) || 0), 0, 9999999);
        d.best = clamp(Math.floor(Number(parsed.best) || 0), 0, 99999999);
        const oldName = String(parsed.name || '').replace(/\s+/g, ' ').trim().slice(0, 14);
        d.name = (!oldName || oldName === 'PITÓN' || oldName === 'SERPIENTE') ? d.name : oldName;
        d.skin = SKIN_MAP[parsed.skin] ? parsed.skin : 'ion';
        d.mode = parsed.mode === 'online' ? 'online' : 'bots';
        d.difficulty = DIFFICULTIES[parsed.difficulty] ? parsed.difficulty : 'normal';

        const owned = new Set(Array.isArray(parsed.owned) ? parsed.owned.filter((id) => SKIN_MAP[id]) : []);
        for (const s of SKINS) if (s.price === 0 && !s.event) owned.add(s.id);
        owned.add(d.skin);
        d.owned = Array.from(owned);

        const outfits = new Set(Array.isArray(parsed.ownedOutfits) ? parsed.ownedOutfits.filter((id) => OUTFIT_MAP[id]) : []);
        for (const c of OUTFITS) if (c.price === 0 && !c.event) outfits.add(c.id);
        d.ownedOutfits = Array.from(outfits);
        d.outfit = OUTFIT_MAP[parsed.outfit] && outfits.has(parsed.outfit) ? parsed.outfit : 'none';
        if (!outfits.has(d.outfit)) d.outfit = 'none';

        const accessories = new Set(Array.isArray(parsed.ownedAccessories) ? parsed.ownedAccessories.filter((id) => ACCESSORY_MAP[id]) : []);
        for (const c of ACCESSORIES) if (c.price === 0 && !c.event) accessories.add(c.id);
        d.ownedAccessories = Array.from(accessories);
        d.accessory = ACCESSORY_MAP[parsed.accessory] && accessories.has(parsed.accessory) ? parsed.accessory : 'none';
        if (!accessories.has(d.accessory)) d.accessory = 'none';

        d.achievements = Array.isArray(parsed.achievements)
          ? Array.from(new Set(parsed.achievements.filter((id) => ACHIEVEMENT_MAP[id])))
          : [];

        if (parsed.upgrades && typeof parsed.upgrades === 'object') {
          for (const u of UPGRADES) d.upgrades[u.id] = clamp(Math.floor(Number(parsed.upgrades[u.id]) || 0), 0, u.max);
        }
        if (parsed.stats && typeof parsed.stats === 'object') {
          for (const key of Object.keys(d.stats)) {
            d.stats[key] = statNum(parsed.stats[key], key === 'time');
          }
        }
        if (parsed.settings && typeof parsed.settings === 'object') {
          const s = parsed.settings;
          d.settings.music = clamp(Math.floor(Number(s.music)), 0, 100);
          if (Number.isNaN(d.settings.music)) d.settings.music = 46;
          d.settings.sfx = clamp(Math.floor(Number(s.sfx)), 0, 100);
          if (Number.isNaN(d.settings.sfx)) d.settings.sfx = 68;
          d.settings.theme = THEMES[s.theme] ? s.theme : 'aurora';
          d.settings.motion = modal(s.motion, MOTION_MODES, 'soft');
          d.settings.quality = ['auto', 'low', 'medium', 'high'].includes(s.quality) ? s.quality : 'auto';
          d.settings.controls = modal(s.controls, CONTROL_MODES, 'auto');
          d.settings.colorblind = modal(s.colorblind, COLORBLIND_MODES, 'none');
          d.settings.sensitivity = clamp(Math.floor(Number(s.sensitivity)), 50, 150);
          if (Number.isNaN(d.settings.sensitivity)) d.settings.sensitivity = 100;
          d.settings.cameraScale = clamp(Math.floor(Number(s.cameraScale)) || 100, 85, 115);
          d.settings.shake = s.shake !== false;
          d.settings.particles = s.particles !== false;
          d.settings.captions = boolSetting(s.captions, true);
          d.settings.haptics = boolSetting(s.haptics, true);
          d.settings.highContrast = !!s.highContrast;
          d.settings.largeUI = !!s.largeUI;
          d.settings.pauseOnBlur = boolSetting(s.pauseOnBlur, true);
          d.settings.fpsMeter = !!s.fpsMeter;
          d.settings.autoQuality = boolSetting(s.autoQuality, true);
          d.settings.showHints = boolSetting(s.showHints, true);
          d.settings.minimap = boolSetting(s.minimap, true);
          d.settings.nameTags = boolSetting(s.nameTags, true);
          d.settings.flashes = boolSetting(s.flashes, true);
          d.settings.powerAlerts = boolSetting(s.powerAlerts, true);
          d.settings.muted = !!s.muted;
        }
        d.version = 3;
        this.data = d;
      } catch (e) {
        this.data = base;
      }
      return this.data;
    },
    write() {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* almacenamiento lleno o bloqueado */ }
    },
    owns(type, id) {
      const c = COSMETIC_TYPES[type];
      return !!(c && this.data[c.owned] && this.data[c.owned].includes(id));
    },
    grant(type, id) {
      const c = COSMETIC_TYPES[type];
      if (!c || !c.map[id]) return false;
      if (!this.data[c.owned]) this.data[c.owned] = [];
      if (this.data[c.owned].includes(id)) return false;
      this.data[c.owned].push(id);
      return true;
    },
    reset() {
      this.data = defaultSave();
      this.write();
    }
  };

  /* ---------------- Colors & sprites ---------------- */
  const colorCache = new Map();
  function hexToRgb(hex) {
    if (colorCache.has(hex)) return colorCache.get(hex);
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    const out = Number.isNaN(n) ? { r: 34, g: 245, b: 226 } : { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    colorCache.set(hex, out);
    return out;
  }
  function rgba(hex, a) {
    const c = hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  }
  function shade(hex, amt) {
    const c = hexToRgb(hex);
    const f = (v) => clamp(Math.round(v + 255 * amt), 0, 255);
    return 'rgb(' + f(c.r) + ',' + f(c.g) + ',' + f(c.b) + ')';
  }

  const orbSprites = new Map();
  function orbSprite(color) {
    if (orbSprites.has(color)) return orbSprites.get(color);
    const size = 72;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    const c = size / 2;
    const grad = g.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.12, rgba(color, 0.98));
    grad.addColorStop(0.3, rgba(color, 0.58));
    grad.addColorStop(0.62, rgba(color, 0.14));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    // destello de cuatro puntas
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(c, c - 15); g.lineTo(c, c - 7);
    g.moveTo(c, c + 7); g.lineTo(c, c + 15);
    g.moveTo(c - 15, c); g.lineTo(c - 7, c);
    g.moveTo(c + 7, c); g.lineTo(c + 15, c);
    g.stroke();
    orbSprites.set(color, cv);
    return cv;
  }

  const candySprites = new Map();
  function candySprite(color, shape) {
    const key = color + '|' + shape;
    if (candySprites.has(key)) return candySprites.get(key);
    const size = 96;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    const c = size / 2;
    const light = shape === 2 ? '#fff4c8' : shade(color, .38);
    const dark = shade(color, -.34);
    const glow = g.createRadialGradient(c, c, 0, c, c, c);
    glow.addColorStop(0, rgba(color, .2));
    glow.addColorStop(.5, rgba(color, .08));
    glow.addColorStop(1, rgba(color, 0));
    g.fillStyle = glow;
    g.fillRect(0, 0, size, size);

    g.save();
    g.translate(c, c);
    if (shape === 1) {
      // piruleta
      g.strokeStyle = '#fff4df';
      g.lineWidth = 4;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(1, 10);
      g.lineTo(5, 31);
      g.stroke();
      const body = g.createRadialGradient(-5, -7, 2, 0, 0, 20);
      body.addColorStop(0, light);
      body.addColorStop(.55, color);
      body.addColorStop(1, dark);
      g.fillStyle = body;
      g.beginPath();
      g.arc(0, -2, 18, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,.72)';
      g.lineWidth = 2.2;
      g.beginPath();
      for (let a = 0; a < TAU * 1.8; a += .16) {
        const rr = 2 + a * 1.05;
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr - 2;
        if (a === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.stroke();
    } else if (shape === 2) {
      // maíz dulce
      g.rotate(-.08);
      const bands = [
        { y: 17, w: 18, col: '#fff4c8' },
        { y: 5, w: 12, col: color },
        { y: -7, w: 7, col: shade(color, -.14) }
      ];
      for (const b of bands) {
        g.fillStyle = b.col;
        g.beginPath();
        g.moveTo(-b.w, b.y + 8);
        g.quadraticCurveTo(-b.w * .74, b.y - 8, 0, b.y - 10);
        g.quadraticCurveTo(b.w * .74, b.y - 8, b.w, b.y + 8);
        g.closePath();
        g.fill();
      }
      g.strokeStyle = 'rgba(255,255,255,.25)';
      g.lineWidth = 1.4;
      g.stroke();
    } else if (shape === 3) {
      // caramelo fantasma
      g.fillStyle = 'rgba(225,244,255,.94)';
      g.beginPath();
      g.moveTo(-18, 16);
      g.quadraticCurveTo(-22, -12, 0, -21);
      g.quadraticCurveTo(22, -12, 18, 16);
      for (let i = 0; i < 4; i++) {
        const x = 18 - i * 12;
        g.quadraticCurveTo(x - 3, 23, x - 6, 15);
      }
      g.closePath();
      g.fill();
      g.fillStyle = '#40235c';
      g.beginPath();
      g.arc(-6, -4, 2.6, 0, TAU);
      g.arc(6, -4, 2.6, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,.5)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(0, -2, 11, .3, 2.2);
      g.stroke();
    } else {
      // caramelo envuelto
      g.fillStyle = rgba(color, .78);
      for (const side of [-1, 1]) {
        g.beginPath();
        g.moveTo(side * 16, -7);
        g.lineTo(side * 37, -18);
        g.lineTo(side * 31, 0);
        g.lineTo(side * 38, 18);
        g.lineTo(side * 16, 7);
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,.4)';
        g.lineWidth = 1.2;
        g.stroke();
      }
      const body = g.createLinearGradient(-18, -18, 18, 18);
      body.addColorStop(0, light);
      body.addColorStop(.45, color);
      body.addColorStop(1, dark);
      g.fillStyle = body;
      g.beginPath();
      g.ellipse(0, 0, 19, 16, 0, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,.56)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(-1, 0, 9, -.9, 1.3);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,.78)';
      g.beginPath();
      g.ellipse(-7, -7, 4.2, 2.5, -.5, 0, TAU);
      g.fill();
    }
    g.restore();
    candySprites.set(key, cv);
    return cv;
  }

  const FOOD_COLORS = ['#22f5e2', '#ff2fb3', '#c6ff3d', '#ffc94a', '#9d6bff', '#56a8ff', '#ff7a5c'];
  const GOLD = '#ffd76a';

  function isPrism(skin) { return skin.pattern === 'prism'; }
  function bodyPalette(skin, t) {
    if (!isPrism(skin)) return skin.colors;
    const hue = (t * 38) % 360;
    return {
      base: 'hsl(' + hue + ',100%,58%)',
      dark: 'hsl(' + ((hue + 190) % 360) + ',80%,12%)',
      light: 'hsl(' + ((hue + 20) % 360) + ',100%,88%)',
      glow: 'hsl(' + ((hue + 40) % 360) + ',100%,62%)',
      accent: 'hsl(' + ((hue + 180) % 360) + ',100%,65%)'
    };
  }

  /* ---------------- Snake drawing helpers ---------------- */
  function buildPath(points, step) {
    const path = new Path2D();
    if (!points.length) return path;
    path.moveTo(points[0].x, points[0].y);
    const s = step || 1;
    for (let i = s; i < points.length; i += s) path.lineTo(points[i].x, points[i].y);
    const last = points[points.length - 1];
    path.lineTo(last.x, last.y);
    return path;
  }

  function drawSnakeBody(ctx, points, radius, skin, time, quality, options) {
    if (!points || points.length < 2) return;
    const opts = options || {};
    const pal = bodyPalette(skin, time);
    const head = points[0];
    const tail = points[points.length - 1];
    const diameter = radius * 2;
    const path = buildPath(points, opts.step || 2);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (quality !== 'low') {
      ctx.strokeStyle = rgba(pal.glow, .1);
      ctx.lineWidth = diameter + 20;
      ctx.stroke(path);
      ctx.strokeStyle = rgba(pal.glow, .06);
      ctx.lineWidth = diameter + 34;
      ctx.stroke(path);
    }

    ctx.strokeStyle = pal.dark;
    ctx.lineWidth = diameter + 4;
    ctx.stroke(path);

    let bodyStyle;
    if (isPrism(skin)) {
      const grad = ctx.createLinearGradient(head.x, head.y, tail.x, tail.y);
      for (let i = 0; i <= 6; i++) {
        const hue = (time * 38 + i * 58) % 360;
        grad.addColorStop(i / 6, 'hsl(' + hue + ',100%,' + (i === 0 ? 68 : 56) + '%)');
      }
      bodyStyle = grad;
    } else {
      const grad = ctx.createLinearGradient(head.x, head.y, tail.x, tail.y);
      grad.addColorStop(0, pal.light);
      grad.addColorStop(.18, pal.base);
      grad.addColorStop(.75, pal.base);
      grad.addColorStop(1, shade(pal.dark, .05));
      bodyStyle = grad;
    }
    ctx.strokeStyle = bodyStyle;
    ctx.lineWidth = diameter;
    ctx.stroke(path);

    // Patrón de piel
    if (skin.pattern === 'stripes') {
      ctx.save();
      ctx.strokeStyle = rgba(pal.accent, .3);
      ctx.lineWidth = diameter * .72;
      ctx.setLineDash([Math.max(4, radius * 1.05), Math.max(6, radius * 1.55)]);
      ctx.lineDashOffset = -time * radius * 2.2;
      ctx.stroke(path);
      ctx.restore();
    } else if (skin.pattern === 'bands') {
      ctx.save();
      ctx.strokeStyle = rgba(pal.accent, .34);
      ctx.lineWidth = Math.max(1.5, radius * .14);
      const n = points.length;
      for (let i = 2; i < n - 1; i += 5) {
        const p = points[i];
        const a = points[i - 1];
        const b = points[i + 1];
        const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
        const len = radius * .82;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(ang) * len, p.y + Math.sin(ang) * len);
        ctx.lineTo(p.x - Math.cos(ang) * len, p.y - Math.sin(ang) * len);
        ctx.stroke();
      }
      ctx.restore();
    } else if (skin.pattern === 'dots') {
      ctx.save();
      ctx.fillStyle = rgba(pal.accent, .6);
      for (let i = 3; i < points.length - 2; i += 6) {
        const p = points[i];
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.2, radius * .17), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    // Brillo central
    ctx.strokeStyle = rgba(pal.light, .2);
    ctx.lineWidth = diameter * .3;
    ctx.stroke(path);

    // Pulsos de energía
    if (quality === 'high' && !opts.preview && points.length > 12) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        const frac = ((time * 0.32 + k / 3) % 1);
        const idx = Math.floor(frac * (points.length - 1));
        const p = points[idx];
        if (!p) continue;
        const a = Math.sin(frac * Math.PI);
        ctx.fillStyle = rgba(pal.light, .1 + a * .25);
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * (.25 + a * .18), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawOutfit(ctx, style, r, time, layer) {
    if (!style || style === 'none') return;
    ctx.save();
    if (style === 'scarf') {
      if (layer === 'back') {
        ctx.translate(-r * 1.15, 0);
        ctx.rotate(-0.15 + Math.sin(time * 4.2) * 0.11);
        ctx.fillStyle = '#e83352';
        ctx.beginPath();
        ctx.moveTo(0, -r * .32);
        ctx.quadraticCurveTo(-r * .7, -r * .52, -r * 1.25, -r * .12);
        ctx.lineTo(-r * 1.12, r * .18);
        ctx.quadraticCurveTo(-r * .55, r * .04, 0, r * .3);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,168,184,.45)';
        ctx.fillRect(-r * 1.05, -r * .12, r * .9, r * .08);
      } else {
        ctx.fillStyle = '#d72b4c';
        ctx.beginPath();
        ctx.ellipse(-r * .43, 0, r * .27, r * .88, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ff5b76';
        ctx.beginPath();
        ctx.ellipse(-r * .47, -r * .48, r * .2, r * .18, -.4, 0, TAU);
        ctx.fill();
      }
    } else if (style === 'armor') {
      if (layer === 'front') {
        ctx.strokeStyle = 'rgba(221,244,255,.88)';
        ctx.lineWidth = Math.max(1.5, r * .12);
        ctx.beginPath();
        ctx.arc(0, 0, r * .88, -1.08, 1.08);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(86,168,255,.7)';
        ctx.lineWidth = Math.max(1, r * .05);
        ctx.beginPath();
        ctx.arc(0, 0, r * .7, -1.02, 1.02);
        ctx.stroke();
        ctx.fillStyle = '#ffcf5c';
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(-r * .32, side * r * .68, r * .08, 0, TAU);
          ctx.fill();
        }
      }
    } else if (style === 'tux') {
      if (layer === 'front') {
        ctx.fillStyle = '#f3f8ff';
        ctx.beginPath();
        ctx.moveTo(-r * .58, -r * .08);
        ctx.lineTo(-r * .35, -r * .52);
        ctx.lineTo(-r * .16, -r * .08);
        ctx.lineTo(-r * .35, r * .12);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-r * .58, r * .08);
        ctx.lineTo(-r * .35, r * .52);
        ctx.lineTo(-r * .16, r * .08);
        ctx.lineTo(-r * .35, -r * .12);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#14141f';
        ctx.beginPath();
        ctx.arc(-r * .47, 0, r * .2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-r * .47, 0, r * .08, 0, TAU);
        ctx.fill();
      }
    } else if (style === 'holo') {
      if (layer === 'front') {
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
          const hue = (time * 70 + i * 120) % 360;
          ctx.strokeStyle = 'hsla(' + hue + ',100%,68%,' + (.1 + i * .06) + ')';
          ctx.lineWidth = Math.max(1, r * .06);
          ctx.beginPath();
          ctx.ellipse(0, 0, r * (1.18 + i * .1), r * (.92 + i * .07), Math.sin(time * .8 + i) * .1, 0, TAU);
          ctx.stroke();
        }
      }
    } else if (style === 'pumpkin') {
      if (layer === 'back') {
        ctx.strokeStyle = '#6d3a10';
        ctx.lineWidth = Math.max(2, r * .16);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-r * .14, -r * .8);
        ctx.quadraticCurveTo(-r * .2, -r * 1.15, r * .02, -r * 1.3);
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(255,138,31,.8)';
        ctx.lineWidth = Math.max(2, r * .17);
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.16, r * .99, 0, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,214,150,.45)';
        ctx.lineWidth = Math.max(1, r * .06);
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(0, side * r * .62, r * .76, side > 0 ? 1.9 : 4.35, side > 0 ? 4.35 : 6.8);
          ctx.stroke();
        }
        ctx.fillStyle = '#72d14a';
        ctx.beginPath();
        ctx.ellipse(-r * .55, -r * 1.02, r * .28, r * .12, -.5, 0, TAU);
        ctx.fill();
      }
    } else if (style === 'spirit') {
      if (layer === 'back') {
        ctx.fillStyle = 'rgba(225,244,255,.24)';
        ctx.beginPath();
        ctx.ellipse(-r * .18, 0, r * 1.38, r * 1.18, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.42)';
        ctx.lineWidth = Math.max(1, r * .05);
        ctx.beginPath();
        ctx.ellipse(-r * .18, 0, r * 1.38, r * 1.18, 0, 0, TAU);
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(183,230,255,.48)';
        ctx.lineWidth = Math.max(1, r * .05);
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.arc(0, i * r * .42, r * 1.0, 2.3, 3.95);
          ctx.stroke();
        }
      }
    } else if (style === 'vampire') {
      if (layer === 'back') {
        ctx.fillStyle = 'rgba(52,9,74,.9)';
        ctx.beginPath();
        ctx.moveTo(-r * .2, -r * .82);
        ctx.quadraticCurveTo(-r * 1.65, -r * 1.15, -r * 1.75, 0);
        ctx.quadraticCurveTo(-r * 1.65, r * 1.15, -r * .2, r * .82);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,80,132,.55)';
        ctx.lineWidth = Math.max(1, r * .06);
        ctx.beginPath();
        ctx.moveTo(-r * .55, -r * .78);
        ctx.quadraticCurveTo(-r * 1.2, -r * .6, -r * 1.4, 0);
        ctx.quadraticCurveTo(-r * 1.2, r * .6, -r * .55, r * .78);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#3b0b55';
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(-r * .62, side * r * .2);
          ctx.lineTo(-r * .25, side * r * .66);
          ctx.lineTo(-r * .08, side * r * .26);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = '#fff8f0';
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(r * .78, side * r * .38);
          ctx.lineTo(r * 1.0, side * r * .38);
          ctx.lineTo(r * .88, side * r * .6);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  function drawAccessory(ctx, style, r, time) {
    if (!style || style === 'none') return;
    ctx.save();
    if (style === 'shades') {
      ctx.fillStyle = 'rgba(6,8,14,.92)';
      ctx.strokeStyle = 'rgba(255,98,211,.55)';
      ctx.lineWidth = Math.max(1, r * .05);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(r * .04, side * r * .44 - r * .22, r * .62, r * .44, r * .12) : ctx.rect(r * .04, side * r * .44 - r * .22, r * .62, r * .44);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(126,241,255,.6)';
        ctx.beginPath();
        ctx.moveTo(r * .1, side * r * .44 - r * .15);
        ctx.lineTo(r * .35, side * r * .44 - r * .15);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,98,211,.55)';
      }
      ctx.strokeStyle = 'rgba(180,197,220,.8)';
      ctx.lineWidth = Math.max(1, r * .05);
      ctx.beginPath();
      ctx.moveTo(r * .06, -r * .2);
      ctx.lineTo(r * .06, r * .2);
      ctx.stroke();
    } else if (style === 'headphones') {
      ctx.strokeStyle = '#1b2a3d';
      ctx.lineWidth = Math.max(2, r * .16);
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.06, -2.2, 2.2);
      ctx.stroke();
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#18263a';
        ctx.beginPath();
        ctx.ellipse(0, side * r * .9, r * .2, r * .29, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = side < 0 ? '#22f5e2' : '#ff2fb3';
        ctx.beginPath();
        ctx.arc(-r * .02, side * r * .9, r * .08, 0, TAU);
        ctx.fill();
      }
    } else if (style === 'tophat') {
      const bob = Math.sin(time * 2.1) * r * .02;
      ctx.translate(0, -r * .78 + bob);
      ctx.fillStyle = '#12121e';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * .76, r * .2, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#1b1b2c';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-r * .42, -r * .95, r * .84, r * .95, r * .12) : ctx.rect(-r * .42, -r * .95, r * .84, r * .95);
      ctx.fill();
      ctx.fillStyle = '#ff2fb3';
      ctx.fillRect(-r * .42, -r * .27, r * .84, r * .16);
    } else if (style === 'halo') {
      const bob = Math.sin(time * 2.4) * r * .04;
      ctx.translate(0, -r * 1.26 + bob);
      ctx.strokeStyle = 'rgba(255,215,106,.95)';
      ctx.lineWidth = Math.max(1.5, r * .09);
      ctx.shadowColor = 'rgba(255,215,106,.8)';
      ctx.shadowBlur = r * .5;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * .58, r * .17, 0, 0, TAU);
      ctx.stroke();
    } else if (style === 'crown') {
      const bob = Math.sin(time * 2.2) * r * .04;
      ctx.translate(0, -r * 1.04 + bob);
      ctx.fillStyle = '#ffd76a';
      ctx.shadowColor = 'rgba(255,207,92,.8)';
      ctx.shadowBlur = r * .6;
      const w = r * 1.12, h = r * .62;
      ctx.beginPath();
      ctx.moveTo(-w / 2, h / 2);
      ctx.lineTo(-w / 2, -h / 3);
      ctx.lineTo(-w / 5, 0);
      ctx.lineTo(0, -h / 2);
      ctx.lineTo(w / 5, 0);
      ctx.lineTo(w / 2, -h / 3);
      ctx.lineTo(w / 2, h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff2fb3';
      ctx.beginPath();
      ctx.arc(0, 0, r * .09, 0, TAU);
      ctx.fill();
    } else if (style === 'bat') {
      const bob = Math.sin(time * 3.2) * r * .12;
      const flap = Math.sin(time * 9) * .35;
      ctx.translate(-r * .42, -r * 1.45 + bob);
      ctx.fillStyle = '#1a0c24';
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.scale(1, side);
        ctx.rotate(flap);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(-r * .52, -r * .34, -r * .88, -r * .02);
        ctx.quadraticCurveTo(-r * .55, r * .1, -r * .42, r * .34);
        ctx.quadraticCurveTo(-r * .25, r * .12, 0, r * .1);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#2b123a';
      ctx.beginPath();
      ctx.arc(0, 0, r * .18, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ff5b76';
      ctx.beginPath();
      ctx.arc(r * .04, -r * .04, r * .035, 0, TAU);
      ctx.arc(r * .04, r * .04, r * .035, 0, TAU);
      ctx.fill();
    } else if (style === 'witchhat') {
      ctx.translate(0, -r * .82);
      ctx.rotate(-.12);
      ctx.fillStyle = '#241035';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * .95, r * .21, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#351349';
      ctx.beginPath();
      ctx.moveTo(-r * .55, -r * .04);
      ctx.quadraticCurveTo(-r * .38, -r * 1.15, r * .22, -r * 1.58);
      ctx.quadraticCurveTo(r * .05, -r * .72, r * .54, -r * .04);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff9e40';
      ctx.fillRect(-r * .45, -r * .3, r * .9, r * .14);
      ctx.fillStyle = '#ffd76a';
      ctx.beginPath();
      ctx.arc(0, -r * .23, r * .1, 0, TAU);
      ctx.fill();
    } else if (style === 'bones') {
      ctx.strokeStyle = 'rgba(226,244,238,.86)';
      ctx.lineWidth = Math.max(1.4, r * .1);
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-r * .84, side * r * .62);
        ctx.lineTo(-r * .34, side * r * 1.02);
        ctx.stroke();
        ctx.fillStyle = 'rgba(226,244,238,.86)';
        ctx.beginPath();
        ctx.arc(-r * .88, side * r * .6, r * .1, 0, TAU);
        ctx.arc(-r * .3, side * r * 1.03, r * .1, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(226,244,238,.92)';
      ctx.beginPath();
      ctx.arc(-r * .6, 0, r * .22, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#241035';
      ctx.beginPath();
      ctx.arc(-r * .68, -r * .06, r * .055, 0, TAU);
      ctx.arc(-r * .52, -r * .06, r * .055, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSnakeHead(ctx, x, y, angle, radius, skin, time, options) {
    const opts = options || {};
    const pal = bodyPalette(skin, time);
    const outfit = typeof opts.outfit === 'string' ? OUTFIT_MAP[opts.outfit] : opts.outfit;
    const accessory = typeof opts.accessory === 'string' ? ACCESSORY_MAP[opts.accessory] : opts.accessory;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    if (opts.glow !== false) {
      const gl = ctx.createRadialGradient(0, 0, radius * .3, 0, 0, radius * 1.9);
      gl.addColorStop(0, rgba(pal.glow, .25));
      gl.addColorStop(1, rgba(pal.glow, 0));
      ctx.fillStyle = gl;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.9, 0, TAU);
      ctx.fill();
    }

    if (outfit) drawOutfit(ctx, outfit.style, radius, time, 'back');

    // Cabeza
    ctx.fillStyle = pal.dark;
    ctx.beginPath();
    ctx.ellipse(radius * .06, 0, radius * 1.17, radius * .98, 0, 0, TAU);
    ctx.fill();

    const headGrad = ctx.createLinearGradient(-radius, -radius, radius, radius);
    headGrad.addColorStop(0, pal.light);
    headGrad.addColorStop(.45, pal.base);
    headGrad.addColorStop(1, shade(pal.dark, .06));
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.08, radius * .88, 0, 0, TAU);
    ctx.fill();

    // Patrón en la frente
    ctx.strokeStyle = rgba(pal.accent, .5);
    ctx.lineWidth = Math.max(1.2, radius * .1);
    ctx.beginPath();
    ctx.arc(0, 0, radius * .55, -0.85, 0.85);
    ctx.stroke();

    // Ojos
    const eyeX = radius * .35;
    const eyeY = radius * .44;
    const eyeR = radius * .31;
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#f5ffff';
      ctx.beginPath();
      ctx.ellipse(eyeX, side * eyeY, eyeR * .85, eyeR, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = pal.dark;
      ctx.beginPath();
      ctx.arc(eyeX + eyeR * .3, side * eyeY, eyeR * .52, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath();
      ctx.arc(eyeX + eyeR * .18, side * eyeY - eyeR * .22, eyeR * .16, 0, TAU);
      ctx.fill();
    }

    // Cejas agresivas
    ctx.strokeStyle = pal.dark;
    ctx.lineWidth = Math.max(1.5, radius * .13);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(radius * .12, -radius * .68);
    ctx.lineTo(radius * .58, -radius * .48);
    ctx.moveTo(radius * .12, radius * .68);
    ctx.lineTo(radius * .58, radius * .48);
    ctx.stroke();

    // Lengua ocasional
    if (opts.tongue !== false && Math.sin(time * 2.4) > 0.93) {
      ctx.strokeStyle = '#ff4d8d';
      ctx.lineWidth = Math.max(1.4, radius * .1);
      ctx.beginPath();
      ctx.moveTo(radius * 1.05, 0);
      ctx.lineTo(radius * 1.55, 0);
      ctx.lineTo(radius * 1.8, -radius * .18);
      ctx.moveTo(radius * 1.55, 0);
      ctx.lineTo(radius * 1.8, radius * .18);
      ctx.stroke();
    }

    if (outfit) drawOutfit(ctx, outfit.style, radius, time, 'front');
    if (accessory) drawAccessory(ctx, accessory.style, radius, time);

    ctx.restore();
  }


  function drawCrown(ctx, x, y, radius, time) {
    const w = radius * 1.2;
    const h = radius * .7;
    const bob = Math.sin(time * 2.2) * 2;
    ctx.save();
    ctx.translate(x, y - radius * 2.1 + bob);
    ctx.fillStyle = '#ffd76a';
    ctx.shadowColor = 'rgba(255,207,92,.8)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(-w / 2, h / 2);
    ctx.lineTo(-w / 2, -h / 3);
    ctx.lineTo(-w / 5, 0);
    ctx.lineTo(0, -h / 2);
    ctx.lineTo(w / 5, 0);
    ctx.lineTo(w / 2, -h / 3);
    ctx.lineTo(w / 2, h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawSnakePreview(canvas, skin, time, mode, options) {
    const opts = options || {};
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || canvas.width;
    const cssH = canvas.clientHeight || canvas.height;
    const targetW = Math.round(cssW * dpr);
    const targetH = Math.round(cssH * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Fondo
    const bg = ctx.createRadialGradient(w * .55, h * .5, 0, w * .55, h * .5, w * .7);
    bg.addColorStop(0, rgba(skin.colors.glow, .14));
    bg.addColorStop(.5, 'rgba(6,14,26,.7)');
    bg.addColorStop(1, 'rgba(3,8,15,1)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Rejilla y estrellas
    ctx.save();
    ctx.strokeStyle = rgba(skin.colors.glow, .07);
    ctx.lineWidth = 1;
    const gap = Math.max(22, w / 16);
    for (let x = 0; x < w; x += gap) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += gap) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    for (let i = 0; i < 18; i++) {
      const sx = (i * 173.3 + 40) % w;
      const sy = (i * 97.7 + 23) % h;
      const a = .15 + .3 * (.5 + .5 * Math.sin(time * 2 + i));
      ctx.globalAlpha = a;
      ctx.fillRect(sx, sy, dpr, dpr);
    }
    ctx.restore();

    const headOpts = {
      tongue: false,
      outfit: opts.outfit || 'none',
      accessory: opts.accessory || 'none'
    };

    if (mode === 'head') {
      const r = Math.min(w * .23, h * .28);
      drawSnakeHead(ctx, w * .56, h * .61, -.35, r, skin, time, headOpts);
      return;
    }

    // Cuerpo en S
    const pts = [];
    const count = 56;
    const baseY = h * .52;
    const amp = h * .17;
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const x = w * .12 + t * w * .67;
      const y = baseY - Math.sin(t * Math.PI * 2.05 + .35) * amp - (t - .5) * h * .06;
      pts.push({ x, y });
      if (i === 0) continue;
    }
    pts.reverse();
    const last = pts[0];
    const prev = pts[1];
    const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
    const radius = Math.max(14, Math.min(w, h) * .105);
    drawSnakeBody(ctx, pts, radius, skin, time, 'high', { preview: true, step: 2 });
    drawSnakeHead(ctx, last.x, last.y, angle, radius * 1.02, skin, time, headOpts);

    // Chispas
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 12; i++) {
      const sx = (i * 211 + time * 14 * (i % 2 ? 1 : -1)) % w;
      const sy = (i * 53 + h * .5) % h;
      ctx.fillStyle = rgba(i % 3 ? skin.colors.light : skin.colors.accent, .25);
      ctx.beginPath();
      ctx.arc(sx < 0 ? sx + w : sx, sy, (i % 3) * .8 + 1, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  NS.TAU = TAU;
  NS.clamp = clamp;
  NS.lerp = lerp;
  NS.rand = rand;
  NS.randInt = randInt;
  NS.pick = pick;
  NS.dist2 = dist2;
  NS.hypot = hypot;
  NS.angleDiff = angleDiff;
  NS.approachAngle = approachAngle;
  NS.smoothTo = smoothTo;
  NS.$ = $;
  NS.$$ = $$;
  NS.esc = esc;
  NS.formatTime = formatTime;
  NS.formatDuration = formatDuration;
  NS.formatNum = formatNum;
  NS.mulberry32 = mulberry32;
  NS.CFG = CFG;
  NS.THEMES = THEMES;
  NS.setTheme = setTheme;
  NS.getTheme = getTheme;
  NS.DIFFICULTIES = DIFFICULTIES;
  NS.defaultSave = defaultSave;
  NS.CONTROL_MODES = CONTROL_MODES;
  NS.MOTION_MODES = MOTION_MODES;
  NS.SKINS = SKINS;
  NS.SKIN_MAP = SKIN_MAP;
  NS.OUTFITS = OUTFITS;
  NS.OUTFIT_MAP = OUTFIT_MAP;
  NS.ACCESSORIES = ACCESSORIES;
  NS.ACCESSORY_MAP = ACCESSORY_MAP;
  NS.COSMETIC_TYPES = COSMETIC_TYPES;
  NS.POWERUPS = POWERUPS;
  NS.POWERUP_MAP = POWERUP_MAP;
  NS.ACHIEVEMENTS = ACHIEVEMENTS;
  NS.ACHIEVEMENT_MAP = ACHIEVEMENT_MAP;
  NS.UPGRADES = UPGRADES;
  NS.UPGRADE_MAP = UPGRADE_MAP;
  NS.BOT_NAMES = BOT_NAMES;
  NS.HALLOWEEN_BOT_NAMES = HALLOWEEN_BOT_NAMES;
  NS.PLAYER_NAMES = PLAYER_NAMES;
  NS.RANKS = RANKS;
  NS.rankFor = rankFor;
  NS.Save = Save;
  NS.hexToRgb = hexToRgb;
  NS.rgba = rgba;
  NS.shade = shade;
  NS.orbSprite = orbSprite;
  NS.candySprite = candySprite;
  NS.FOOD_COLORS = FOOD_COLORS;
  NS.GOLD = GOLD;
  NS.bodyPalette = bodyPalette;
  NS.drawSnakeBody = drawSnakeBody;
  NS.drawSnakeHead = drawSnakeHead;
  NS.drawOutfit = drawOutfit;
  NS.drawAccessory = drawAccessory;
  NS.drawCrown = drawCrown;
  NS.drawSnakePreview = drawSnakePreview;
})();

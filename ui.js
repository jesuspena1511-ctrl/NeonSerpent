/* ============================================================
   NEON SERPENT — UI: menús, HUD, tienda, ajustes y overlays
   ============================================================ */
(function () {
  'use strict';
  const NS = window.NS;
  const {
    $, $$, clamp, formatTime, formatDuration, formatNum, rankFor,
    CFG, SKINS, SKIN_MAP, OUTFITS, OUTFIT_MAP, ACCESSORIES, ACCESSORY_MAP,
    COSMETIC_TYPES, ACHIEVEMENTS, POWERUPS, POWERUP_MAP, UPGRADES,
    PLAYER_NAMES, THEMES, pick, Save
  } = NS;

  const TIPS = [
    'Consejo: rodea a una serpiente más pequeña y espera a que choque contigo.',
    'Consejo: no cruces en línea recta un rastro de comida; divide el banquete y crea una trampa.',
    'Consejo: el turbo consume masa, pero deja orbes detrás. Úsalo para cortar el paso, no para huir.',
    'Consejo: los orbes dorados huyen de ti. Acorralarlos contra el muro es muy rentable.',
    'Consejo: al crecer, tu radio de giro aumenta. Planea las curvas con antelación.',
    'Consejo: el borde de la arena es un arma de doble filo. Acorrala sin acercarte demasiado.',
    'Consejo: una estela de orbes junto a un rival puede convertirse en el cebo perfecto.',
    'Consejo: si tu masa está baja, busca grupos de orbes y evita el centro de la arena.'
  ];

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function makeIcon(id) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#' + id);
    svg.appendChild(use);
    return svg;
  }

  function setTextNode(button, text) {
    if (!button) return;
    for (const node of button.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        node.textContent = ' ' + text;
        return;
      }
    }
  }

  class UI {
    constructor(game) {
      this.game = game;
      this.el = {};
      this.currentPanel = null;
      this.currentTab = 'upgrades';
      this.lastResults = null;
      this.booted = false;
      this.runToken = 0;
      this.countdownTimers = [];
      this.previewAt = 0;
      this.lbAt = 0;
      this.liveAt = 0;
      this.lastAlive = -1;
      this.tipIndex = 0;
      this.tipTimer = null;
      this.resetTimer = null;
      this.resetArmed = false;
      this.resetSettingsArmed = false;
      this.resetSettingsTimer = null;
      this.captionTimer = null;
      this.copyTimer = null;
      this.countToken = 0;
      this.saveTimer = null;
      this.skinPreviews = [];
      this.eventPreviews = [];
      this.cosmeticType = 'skin';
      this.eventMode = 'bots';
      this.lbSignature = '';
      this.powerSignature = '';
    }

    /* ============================================================
       ARRANQUE
       ============================================================ */
    init() {
      this.cacheElements();
      this.moveToastLayer();
      this.bindEvents();
      this.setTab('upgrades');
      this.syncSettings();
      this.updateMuteUI();
      this.updateFullscreenLabel();
      this.updateMenu();
      this.renderUpgrades();
      this.renderSkins();
      this.renderAchievements();
      this.renderEventShop();
      this.el.boostHint.textContent = this.game.isCoarse ? 'MANTÉN EL BOTÓN' : 'MANTÉN CLIC / ESPACIO';
      if (this.el.pauseHint) {
        this.el.pauseHint.innerHTML = this.game.isCoarse
          ? '<span class="keycap">TOCA</span> CONTINUAR PARA VOLVER'
          : '<span class="keycap">ESC</span> para continuar';
      }
      this.startTipRotation();

      // Pequeña animación de precarga; game.finishBoot() la completa.
      setTimeout(() => { if (this.el.bootBar) this.el.bootBar.style.width = '38%'; }, 40);
      setTimeout(() => { if (this.el.bootBar) this.el.bootBar.style.width = '72%'; }, 180);
      setTimeout(() => { if (this.el.bootBar) this.el.bootBar.style.width = '88%'; }, 380);
    }

    finishBoot() {
      if (this.booted) return;
      this.booted = true;
      if (this.el.bootBar) this.el.bootBar.style.width = '100%';
      setTimeout(() => {
        this.showMenu();
        this.el.boot.classList.add('done');
        setTimeout(() => this.el.boot.classList.add('hidden'), 720);
      }, 280);
    }

    cacheElements() {
      const el = this.el;
      el.app = $('#app');
      el.boot = $('#boot');
      el.bootBar = $('#bootBar');
      el.menu = $('#menu');
      el.menuCoins = $('#menuCoins');
      el.menuCandy = $('#menuCandy');
      el.menuBest = $('#menuBest');
      el.menuAlive = $('#menuAlive');
      el.menuRuns = $('#menuRuns');
      el.menuKills = $('#menuKills');
      el.menuTime = $('#menuTime');
      el.menuRank = $('#menuRank');
      el.menuTip = $('#menuTip');
      el.playerName = $('#playerName');
      el.btnRandomName = $('#btnRandomName');
      el.btnPlay = $('#btnPlay');
      el.btnHangar = $('#btnHangar');
      el.btnSkins = $('#btnSkins');
      el.btnHalloween = $('#btnHalloween');
      el.btnMuteMenu = $('#btnMuteMenu');
      el.btnFullscreen = $('#btnFullscreen');
      el.opRank = $('#opRank');
      el.menuSkin = $('#menuSkin');
      el.opName = $('#opName');
      el.opSkinName = $('#opSkinName');
      el.opBest = $('#opBest');
      el.opKills = $('#opKills');
      el.opCoins = $('#opCoins');

      el.hud = $('#hud');
      el.hudSkin = $('#hudSkin');
      el.hudScore = $('#hudScore');
      el.hudRank = $('#hudRank');
      el.hudName = $('#hudName');
      el.hudTime = $('#hudTime');
      el.combo = $('#combo');
      el.comboVal = $('#comboVal');
      el.comboBar = $('#comboBar');
      el.killfeed = $('#killfeed');
      el.boostWrap = $('.boost-wrap');
      el.boostFill = $('#boostFill');
      el.boostState = $('#boostState');
      el.boostHint = $('#boostHint');
      el.pauseHint = $('#pauseHint');
      el.massLabel = $('#massLabel');
      el.leaderboard = $('#leaderboard');
      el.lbCount = $('#lbCount');
      el.btnMuteHud = $('#btnMuteHud');
      el.btnPause = $('#btnPause');
      el.edgeWarning = $('#edgeWarning');
      el.toastLayer = $('#toastLayer');
      el.countdown = $('#countdown');
      el.countdownText = $('#countdownText');
      el.powerHud = $('#powerHud');

      el.panelLayer = $('#panelLayer');
      el.panelHangar = $('#panel-hangar');
      el.panelSettings = $('#panel-settings');
      el.panelHelp = $('#panel-help');
      el.panelAchievements = $('#panel-achievements');
      el.hangarCoins = $('#hangarCoins');
      el.hangarCandy = $('#hangarCandy');
      el.upgradesList = $('#upgradesList');
      el.skinsList = $('#skinsList');
      el.cosmeticTabs = $('#cosmeticTabs');
      el.achievementCount = $('#achievementCount');
      el.achievementTotal = $('#achievementTotal');
      el.achievementBar = $('#achievementBar');
      el.achievementsList = $('#achievementsList');
      el.setMusic = $('#setMusic');
      el.setMusicVal = $('#setMusicVal');
      el.setSfx = $('#setSfx');
      el.setSfxVal = $('#setSfxVal');
      el.qualitySeg = $('#qualitySeg');
      el.setShake = $('#setShake');
      el.setParticles = $('#setParticles');
      el.saveInfo = $('#saveInfo');
      el.btnReset = $('#btnReset');
      el.btnFullscreen2 = $('#btnFullscreen2');
      el.btnResetSettings = $('#btnResetSettings');
      el.themeChoices = $('#themeChoices');
      el.motionSeg = $('#motionSeg');
      el.controlModes = $('#controlModes');
      el.setSensitivity = $('#setSensitivity');
      el.setSensitivityVal = $('#setSensitivityVal');
      el.setCaptions = $('#setCaptions');
      el.setHaptics = $('#setHaptics');
      el.setHighContrast = $('#setHighContrast');
      el.setLargeUI = $('#setLargeUI');
      el.setColorblind = $('#setColorblind');
      el.setPauseBlur = $('#setPauseBlur');
      el.setHints = $('#setHints');
      el.setAutoQuality = $('#setAutoQuality');
      el.setFps = $('#setFps');
      el.setMinimap = $('#setMinimap');
      el.setNameTags = $('#setNameTags');
      el.setFlashes = $('#setFlashes');
      el.setPowerAlerts = $('#setPowerAlerts');
      el.setCameraScale = $('#setCameraScale');
      el.setCameraScaleVal = $('#setCameraScaleVal');
      el.hudMode = $('#hudMode');
      el.boostHint = $('#boostHint');
      el.hudHint = $('.hud-hint');
      el.menuModeLabel = $('#menuModeLabel');
      el.menuAliveLabel = $('#menuAliveLabel');
      el.difficultyRow = $('#difficultyRow');
      el.onlineNote = $('#onlineNote');
      el.onlineNoteText = $('#onlineNoteText');
      el.btnServers = $('#btnServers');
      el.modeChoices = $$('.mode-choice');
      el.diffButtons = $$('[data-difficulty]');
      el.captionLayer = $('#captionLayer');
      el.captionText = $('#captionText');

      el.pauseOverlay = $('#pauseOverlay');
      el.pauseScore = $('#pauseScore');
      el.pauseRank = $('#pauseRank');
      el.pauseTime = $('#pauseTime');
      el.btnResume = $('#btnResume');
      el.btnPauseSettings = $('#btnPauseSettings');
      el.btnPauseQuit = $('#btnPauseQuit');

      el.gameOver = $('#gameOver');
      el.goCause = $('#goCause');
      el.goScore = $('#goScore');
      el.goNewBest = $('#goNewBest');
      el.goBest = $('#goBest');
      el.goLength = $('#goLength');
      el.goKills = $('#goKills');
      el.goRank = $('#goRank');
      el.goOrbs = $('#goOrbs');
      el.goTime = $('#goTime');
      el.goCombo = $('#goCombo');
      el.goCoins = $('#goCoins');
      el.goTotal = $('#goTotal');
      el.goRewardLabel = $('#goRewardLabel');
      el.goTotalCoins = $('#goTotalCoins');
      el.goTotalLabel = $('#goTotalLabel');
      el.goTotalIconUse = $('#goTotalIconUse');
      el.btnRetry = $('#btnRetry');
      el.btnGoHangar = $('#btnGoHangar');
      el.btnGoMenu = $('#btnGoMenu');
      el.btnCopyScore = $('#btnCopyScore');

      el.eventOverlay = $('#eventOverlay');
      el.eventCandy = $('#eventCandy');
      el.eventModeBots = $('#eventModeBots');
      el.eventModeOnline = $('#eventModeOnline');
      el.eventModeNote = $('#eventModeNote');
      el.eventStart = $('#eventStart');
      el.eventShopOpen = $('#eventShopOpen');
      el.eventClose = $('#eventClose');
      el.eventShop = $('#eventShop');
      el.eventShopList = $('#eventShopList');
      el.eventShopCandy = $('#eventShopCandy');
      el.eventShopClose = $('#eventShopClose');
      el.eventShopBack = $('#eventShopBack');
    }

    moveToastLayer() {
      if (!this.el.toastLayer || !this.el.app) return;
      this.el.app.appendChild(this.el.toastLayer);
      this.el.toastLayer.style.zIndex = '70';
    }

    /* ============================================================
       EVENTOS
       ============================================================ */
    bindEvents() {
      const game = this.game;
      const el = this.el;

      el.btnPlay.addEventListener('click', () => {
        if (game.save.mode === 'online' && !game.online) {
          if (window.NS && NS.Online) NS.Online.openBrowser();
          return;
        }
        game.startRun();
      });
      if (el.btnServers) {
        el.btnServers.addEventListener('click', () => {
          if (NS.Online) NS.Online.openBrowser();
        });
      }
      el.btnHangar.addEventListener('click', () => this.openPanel('hangar'));
      el.btnSkins.addEventListener('click', () => this.openPanel('skins'));
      if (el.btnHalloween) el.btnHalloween.addEventListener('click', () => this.openEvent());
      el.btnMuteMenu.addEventListener('click', () => this.toggleMute());
      el.btnMuteHud.addEventListener('click', () => this.toggleMute());

      el.playerName.addEventListener('input', () => this.onNameInput());
      el.playerName.addEventListener('blur', () => this.commitName());
      el.btnRandomName.addEventListener('click', () => {
        let name = pick(PLAYER_NAMES);
        if (name === game.save.name) name = pick(PLAYER_NAMES);
        game.save.name = name;
        Save.write();
        el.playerName.value = name;
        this.updateMenu();
        window.gameAudio.play('click');
      });

      $$('.nav-link[data-panel]').forEach((btn) => {
        btn.addEventListener('click', () => this.openPanel(btn.dataset.panel));
      });

      el.btnFullscreen.addEventListener('click', () => this.toggleFullscreen());
      el.btnFullscreen2.addEventListener('click', () => this.toggleFullscreen());
      document.addEventListener('fullscreenchange', () => this.updateFullscreenLabel());
      document.addEventListener('webkitfullscreenchange', () => this.updateFullscreenLabel());

      // Paneles: cerrar, saltar de panel y cambiar pestañas.
      el.panelLayer.addEventListener('click', (e) => {
        const closer = e.target.closest('[data-close]');
        if (closer) {
          e.preventDefault();
          this.closePanels();
          return;
        }
        const jump = e.target.closest('[data-panel-jump]');
        if (jump) {
          e.preventDefault();
          this.openPanel(jump.dataset.panelJump);
        }
      });

      $$('.tab[data-tab]').forEach((tab) => {
        tab.addEventListener('click', () => this.setTab(tab.dataset.tab));
      });
      if (el.cosmeticTabs) {
        $$('[data-cosmetic-type]', el.cosmeticTabs).forEach((btn) => {
          btn.addEventListener('click', () => {
            this.cosmeticType = btn.dataset.cosmeticType;
            this.renderSkins();
            window.gameAudio.play('click');
          });
        });
      }

      el.setMusic.addEventListener('input', () => {
        const v = clamp(parseInt(el.setMusic.value, 10) || 0, 0, 100);
        game.save.settings.music = v;
        el.setMusicVal.textContent = v;
        window.gameAudio.setVolumes(game.save.settings.music, game.save.settings.sfx);
        Save.write();
      });
      el.setSfx.addEventListener('input', () => {
        const v = clamp(parseInt(el.setSfx.value, 10) || 0, 0, 100);
        game.save.settings.sfx = v;
        el.setSfxVal.textContent = v;
        window.gameAudio.setVolumes(game.save.settings.music, game.save.settings.sfx);
        Save.write();
      });
      $$('button[data-quality]', el.qualitySeg).forEach((btn) => {
        btn.addEventListener('click', () => {
          if (game.save.settings.quality === btn.dataset.quality) return;
          game.save.settings.quality = btn.dataset.quality;
          Save.write();
          game.applySettings();
          this.syncSettings();
          window.gameAudio.play('click');
        });
      });
      el.setShake.addEventListener('click', () => {
        game.save.settings.shake = !game.save.settings.shake;
        Save.write();
        this.setSwitch(el.setShake, game.save.settings.shake);
        window.gameAudio.play('click');
      });
      el.setParticles.addEventListener('click', () => {
        game.save.settings.particles = !game.save.settings.particles;
        game.particlesEnabled = game.save.settings.particles;
        Save.write();
        this.setSwitch(el.setParticles, game.save.settings.particles);
        window.gameAudio.play('click');
      });

      el.modeChoices.forEach((btn) => {
        btn.addEventListener('click', () => {
          const mode = btn.dataset.mode;
          if (game.save.mode === mode) {
            if (mode === 'online' && NS.Online && !game.online) NS.Online.openBrowser();
            return;
          }
          game.save.mode = mode;
          game.mode = mode;
          Save.write();
          this.applyModeUI();
          this.updateMenu();
          window.gameAudio.play('click');
          if (mode === 'online' && NS.Online) {
            NS.Online.openBrowser();
          } else if (NS.Online) {
            NS.Online.closeBrowser();
          }
        });
      });
      el.diffButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const diff = btn.dataset.difficulty;
          if (game.save.difficulty === diff) return;
          game.save.difficulty = diff;
          game.difficulty = diff;
          Save.write();
          this.applyModeUI();
          this.updateMenu();
          window.gameAudio.play('click');
        });
      });

      if (el.themeChoices) {
        $$('[data-theme-choice]', el.themeChoices).forEach((btn) => {
          btn.addEventListener('click', () => {
            if (game.save.settings.theme === btn.dataset.themeChoice) return;
            game.save.settings.theme = btn.dataset.themeChoice;
            Save.write();
            game.applySettings();
            this.syncSettings();
            this.updateMenu();
            window.gameAudio.play('click');
          });
        });
      }
      if (el.motionSeg) {
        $$('[data-motion-choice]', el.motionSeg).forEach((btn) => {
          btn.addEventListener('click', () => {
            game.save.settings.motion = btn.dataset.motionChoice;
            Save.write();
            game.applySettings();
            this.syncSettings();
            window.gameAudio.play('click');
          });
        });
      }
      if (el.controlModes) {
        $$('[data-control-mode]', el.controlModes).forEach((btn) => {
          btn.addEventListener('click', () => {
            game.save.settings.controls = btn.dataset.controlMode;
            Save.write();
            game.applySettings();
            this.syncSettings();
            window.gameAudio.play('click');
          });
        });
      }
      el.setSensitivity.addEventListener('input', () => {
        const v = clamp(parseInt(el.setSensitivity.value, 10) || 100, 50, 150);
        game.save.settings.sensitivity = v;
        el.setSensitivityVal.textContent = v;
        Save.write();
      });
      if (el.setCameraScale) {
        el.setCameraScale.addEventListener('input', () => {
          const v = clamp(parseInt(el.setCameraScale.value, 10) || 100, 88, 112);
          game.save.settings.cameraScale = v;
          el.setCameraScaleVal.textContent = v;
          Save.write();
        });
      }
      el.setColorblind.addEventListener('change', () => {
        game.save.settings.colorblind = el.setColorblind.value;
        Save.write();
        game.applySettings();
        window.gameAudio.play('click');
      });

      const toggle = (button, key, after) => {
        if (!button) return;
        button.addEventListener('click', () => {
          game.save.settings[key] = !game.save.settings[key];
          Save.write();
          this.setSwitch(button, game.save.settings[key]);
          if (after) after(game.save.settings[key]);
          window.gameAudio.play('click');
        });
      };
      toggle(el.setCaptions, 'captions', () => game.applySettings());
      toggle(el.setHaptics, 'haptics');
      toggle(el.setHighContrast, 'highContrast', () => game.applySettings());
      toggle(el.setLargeUI, 'largeUI', () => game.applySettings());
      toggle(el.setPauseBlur, 'pauseOnBlur');
      toggle(el.setHints, 'showHints', () => {
        document.body.classList.toggle('hints-off', !game.save.settings.showHints);
      });
      toggle(el.setAutoQuality, 'autoQuality', () => {
        game.autoQualityStep = 0;
        game.applySettings();
      });
      toggle(el.setFps, 'fpsMeter', () => game.applySettings());
      toggle(el.setMinimap, 'minimap', () => game.applySettings());
      toggle(el.setNameTags, 'nameTags', () => game.applySettings());
      toggle(el.setFlashes, 'flashes', () => game.applySettings());
      toggle(el.setPowerAlerts, 'powerAlerts', () => game.applySettings());

      // Evento de Halloween y tienda de dulces.
      if (el.eventOverlay) {
        el.eventModeBots.addEventListener('click', () => this.setEventMode('bots'));
        el.eventModeOnline.addEventListener('click', () => this.setEventMode('online'));
        el.eventStart.addEventListener('click', () => this.startEvent());
        el.eventShopOpen.addEventListener('click', () => this.openEventShop());
        el.eventClose.addEventListener('click', () => this.closeEvent());
        el.eventOverlay.addEventListener('click', (e) => {
          if (e.target === el.eventOverlay) this.closeEvent();
        });
      }
      if (el.eventShop) {
        el.eventShopClose.addEventListener('click', () => this.closeEventShop());
        el.eventShopBack.addEventListener('click', () => this.closeEventShop());
        el.eventShop.addEventListener('click', (e) => {
          if (e.target === el.eventShop) this.closeEventShop();
        });
      }

      el.btnReset.addEventListener('click', () => this.handleReset());
      if (el.btnResetSettings) el.btnResetSettings.addEventListener('click', () => this.handleResetSettings());
      window.addEventListener('ns-sound', (e) => this.onSoundEvent(e.detail && e.detail.name));

      // Pausa
      el.btnPause.addEventListener('click', () => {
        window.gameAudio.play('click');
        game.togglePause();
      });
      el.btnResume.addEventListener('click', () => {
        window.gameAudio.play('click');
        game.resume();
      });
      el.btnPauseSettings.addEventListener('click', () => this.openPanel('settings'));
      el.btnPauseQuit.addEventListener('click', () => {
        window.gameAudio.play('click');
        game.quitToMenu();
      });

      // Fin de partida
      el.btnRetry.addEventListener('click', () => {
        if (game.online) game.online.respawn();
        else game.startRun();
      });
      el.btnGoHangar.addEventListener('click', () => game.backToMenu('hangar'));
      el.btnGoMenu.addEventListener('click', () => game.backToMenu());
      el.btnCopyScore.addEventListener('click', () => this.copyResult());

      window.addEventListener('beforeunload', () => {
        this.commitName();
        Save.write();
      });
    }

    /* ============================================================
       NOMBRE
       ============================================================ */
    onNameInput() {
      const input = this.el.playerName;
      let value = input.value.replace(/[\r\n\t]/g, ' ').slice(0, 14);
      if (value !== input.value) input.value = value;
      const name = value.replace(/\s+/g, ' ').trim() || 'Jugador#1';
      if (this.game.save.name !== name) {
        this.game.save.name = name;
        Save.write();
      }
      this.el.opName.textContent = name;
    }

    commitName() {
      const input = this.el.playerName;
      const name = input.value.replace(/\s+/g, ' ').trim().slice(0, 14) || 'Jugador#1';
      input.value = name;
      this.game.save.name = name;
      Save.write();
      this.updateMenu();
    }

    /* ============================================================
       MENÚ PRINCIPAL
       ============================================================ */
    updateMenu() {
      const game = this.game;
      const save = game.save;
      const el = this.el;
      const skin = SKIN_MAP[save.skin] || SKINS[0];
      const rank = rankFor(save.best).name;

      if (document.activeElement !== el.playerName) el.playerName.value = save.name;
      el.opName.textContent = save.name;
      el.opSkinName.textContent = skin.name;

      el.menuCoins.textContent = formatNum(save.coins);
      if (el.menuCandy) el.menuCandy.textContent = formatNum(save.candy);
      el.menuBest.textContent = formatNum(save.best);
      el.hangarCoins.textContent = formatNum(save.coins);
      if (el.hangarCandy) el.hangarCandy.textContent = formatNum(save.candy);
      el.opBest.textContent = formatNum(save.best);
      el.opKills.textContent = formatNum(save.stats.kills);
      el.opCoins.textContent = formatNum(save.coins);
      el.menuRuns.textContent = formatNum(save.stats.runs);
      el.menuKills.textContent = formatNum(save.stats.kills);
      el.menuTime.textContent = formatDuration(save.stats.time);
      el.menuRank.textContent = rank;
      el.opRank.textContent = rank;

      const unlocked = save.achievements ? save.achievements.length : 0;
      if (el.achievementCount) el.achievementCount.textContent = unlocked;
      if (el.achievementTotal) el.achievementTotal.textContent = ACHIEVEMENTS.length;
      if (el.achievementBar) el.achievementBar.style.width = ((unlocked / ACHIEVEMENTS.length) * 100).toFixed(1) + '%';
      if (el.eventCandy) el.eventCandy.textContent = formatNum(save.candy);
      if (el.eventShopCandy) el.eventShopCandy.textContent = formatNum(save.candy);

      this.applyModeUI();
      this.updateSaveInfo();
      this.updateMuteUI();
    }

    aliveCount() {
      let n = 0;
      for (const s of this.game.snakes) if (s.alive) n++;
      return n;
    }

    startTipRotation() {
      this.tipIndex = Math.floor(Math.random() * TIPS.length);
      if (this.el.menuTip) this.el.menuTip.textContent = TIPS[this.tipIndex];
      this.tipTimer = setInterval(() => {
        if (this.el.menu.classList.contains('hidden')) return;
        this.tipIndex = (this.tipIndex + 1) % TIPS.length;
        if (this.el.menuTip) this.el.menuTip.textContent = TIPS[this.tipIndex];
      }, 11000);
    }

    tickMenuLive() {
      // La cabecera muestra el tamaño de la sala elegida, no la demo del fondo.
      const now = performance.now();
      if (now - this.liveAt < 1200) return;
      this.liveAt = now;
      if (this.el.menu && !this.el.menu.classList.contains('hidden')) this.applyModeUI();
    }

    showMenu(openPanel) {
      this.el.menu.classList.remove('hidden');
      this.el.menu.classList.remove('enter');
      void this.el.menu.offsetWidth;
      this.el.menu.classList.add('enter');
      this.updateMenu();
      if (openPanel) {
        setTimeout(() => {
          if (this.game.state === 'menu') this.openPanel(openPanel);
        }, 320);
      }
    }

    hideMenu() {
      this.el.menu.classList.add('hidden');
      this.el.menu.classList.remove('enter');
    }

    /* ============================================================
       PANELES
       ============================================================ */
    openPanel(name) {
      if (!name || !this.el.panelLayer) return;
      let target = name;
      let tab = this.currentTab;
      if (name === 'skins') {
        target = 'hangar';
        tab = 'skins';
      } else if (name === 'hangar') {
        target = 'hangar';
        tab = this.currentPanel === 'hangar' ? this.currentTab : 'upgrades';
      }
      const panel = $('#panel-' + target);
      if (!panel) return;

      const wasOpen = !this.el.panelLayer.classList.contains('hidden');
      this.currentPanel = target;
      this.el.panelLayer.classList.remove('hidden');
      $$('.panel', this.el.panelLayer).forEach((p) => p.classList.add('hidden'));
      panel.classList.remove('hidden');
      const scroll = panel.querySelector('.panel-scroll');
      if (scroll) scroll.scrollTop = 0;

      if (target === 'hangar') this.setTab(tab === 'skins' ? 'skins' : 'upgrades');
      if (target === 'settings') this.syncSettings();
      if (target === 'achievements') this.renderAchievements();
      this.updateMenu();
      if (target === 'hangar') {
        this.renderUpgrades();
        this.renderSkins();
      }

      window.gameAudio.init();
      window.gameAudio.play(wasOpen ? 'click' : 'open');
    }

    closePanels() {
      if (!this.el.panelLayer || this.el.panelLayer.classList.contains('hidden')) return;
      this.el.panelLayer.classList.add('hidden');
      $$('.panel', this.el.panelLayer).forEach((p) => p.classList.add('hidden'));
      this.currentPanel = null;
      this.disarmReset();
      window.gameAudio.play('close');
    }

    setTab(tab) {
      this.currentTab = tab === 'skins' ? 'skins' : 'upgrades';
      $$('.tab[data-tab]').forEach((btn) => {
        const active = btn.dataset.tab === this.currentTab;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      if (this.el.upgradesList) this.el.upgradesList.classList.toggle('hidden', this.currentTab !== 'upgrades');
      if (this.el.skinsList) this.el.skinsList.classList.toggle('hidden', this.currentTab !== 'skins');
      if (this.el.cosmeticTabs) this.el.cosmeticTabs.classList.toggle('hidden', this.currentTab !== 'skins');
      if (this.currentTab === 'skins') this.renderSkins();
      else this.renderUpgrades();
    }

    /* ============================================================
       HANGAR — MEJORAS
       ============================================================ */
    renderUpgrades() {
      const list = this.el.upgradesList;
      if (!list) return;
      list.textContent = '';

      for (const upgrade of UPGRADES) {
        const level = this.game.upgradeLevel(upgrade.id);
        const maxed = level >= upgrade.max;
        const cost = maxed ? 0 : upgrade.costs[level];

        const card = document.createElement('article');
        card.className = 'up-card' + (maxed ? ' maxed' : '');
        card.dataset.accent = upgrade.accent;

        const iconWrap = document.createElement('div');
        iconWrap.className = 'up-icon';
        iconWrap.appendChild(makeIcon(upgrade.icon));

        const info = document.createElement('div');
        info.className = 'up-info';
        const title = document.createElement('h3');
        title.textContent = upgrade.name;
        const desc = document.createElement('p');
        desc.textContent = upgrade.desc;
        const levels = document.createElement('div');
        levels.className = 'up-levels';
        for (let i = 0; i < upgrade.max; i++) {
          const pip = document.createElement('i');
          if (i < level) pip.classList.add('on');
          levels.appendChild(pip);
        }
        const levelText = document.createElement('span');
        levelText.textContent = 'NV. ' + level + '/' + upgrade.max;
        levels.appendChild(levelText);
        info.appendChild(title);
        info.appendChild(desc);
        info.appendChild(levels);

        const buy = document.createElement('button');
        buy.type = 'button';
        buy.className = 'up-buy' + (maxed ? ' max' : '');
        const amount = document.createElement('b');
        const caption = document.createElement('span');
        if (maxed) {
          amount.textContent = 'MÁXIMO';
          caption.textContent = 'COMPLETO';
          buy.disabled = true;
        } else {
          amount.appendChild(makeIcon('i-coin'));
          amount.appendChild(document.createTextNode(formatNum(cost)));
          caption.textContent = 'MEJORAR';
        }
        buy.appendChild(amount);
        buy.appendChild(caption);
        if (!maxed) {
          buy.addEventListener('click', () => {
            const ok = this.game.buyUpgrade(upgrade.id);
            if (ok) {
              this.renderUpgrades();
              this.renderSkins();
              this.updateMenu();
              this.toast('MEJORA INSTALADA', upgrade.name + ' · NIVEL ' + (level + 1), 'lime', upgrade.icon);
            } else {
              buy.classList.remove('poor');
              void buy.offsetWidth;
              buy.classList.add('poor');
              setTimeout(() => buy.classList.remove('poor'), 360);
              this.toast('MONEDAS INSUFICIENTES', 'Necesitas ' + formatNum(cost) + ' monedas para esta mejora.', 'danger', 'i-coin');
            }
          });
        }

        card.appendChild(iconWrap);
        card.appendChild(info);
        card.appendChild(buy);
        list.appendChild(card);
      }
    }

    /* ============================================================
       HANGAR — ASPECTOS
       ============================================================ */
    renderSkins() {
      const list = this.el.skinsList;
      if (!list) return;
      list.textContent = '';
      this.skinPreviews.length = 0;

      const type = COSMETIC_TYPES[this.cosmeticType] ? this.cosmeticType : 'skin';
      const conf = COSMETIC_TYPES[type];
      const save = this.game.save;
      if (this.el.cosmeticTabs) {
        $$('[data-cosmetic-type]', this.el.cosmeticTabs).forEach((btn) => {
          const active = btn.dataset.cosmeticType === type;
          btn.classList.toggle('active', active);
          btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
      }

      const selectedId = type === 'skin' ? save.skin : type === 'outfit' ? save.outfit : save.accessory;
      const items = conf.list.filter((item) => !item.event);
      for (const item of items) {
        const owned = Save.owns(type, item.id);
        const selected = selectedId === item.id;
        const currency = item.currency === 'candy' ? 'candy' : 'coins';
        const currencyLabel = currency === 'candy' ? 'dulces' : 'monedas';

        const card = document.createElement('div');
        card.className = 'skin-card' + (selected ? ' selected' : '') + (owned ? '' : ' locked') + ' cosmetic-' + type;
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', item.name + (owned ? (selected ? ', equipado' : ', disponible') : ', bloqueado, ' + item.price + ' ' + currencyLabel));

        const canvas = document.createElement('canvas');
        canvas.width = 420;
        canvas.height = 240;
        canvas.setAttribute('aria-hidden', 'true');
        const previewSkin = type === 'skin' ? item : (SKIN_MAP[save.skin] || SKINS[0]);
        const outfit = type === 'outfit' ? item.id : (save.outfit || 'none');
        const accessory = type === 'accessory' ? item.id : (save.accessory || 'none');
        this.skinPreviews.push({ canvas, skin: previewSkin, outfit, accessory });

        const info = document.createElement('div');
        info.className = 'skin-info';
        const text = document.createElement('div');
        const name = document.createElement('h3');
        name.textContent = item.name;
        const tagline = document.createElement('span');
        tagline.textContent = item.tag;
        text.appendChild(name);
        text.appendChild(tagline);
        if (type !== 'skin' && item.desc) {
          const desc = document.createElement('p');
          desc.className = 'cosmetic-desc';
          desc.textContent = item.desc;
          text.appendChild(desc);
        }

        const tag = document.createElement('span');
        tag.className = 'skin-tag ';
        if (selected) {
          tag.classList.add('equipped');
          tag.appendChild(makeIcon('i-check'));
          tag.appendChild(document.createTextNode('EQUIPADO'));
        } else if (owned) {
          tag.classList.add('free');
          tag.appendChild(makeIcon('i-check'));
          tag.appendChild(document.createTextNode('USAR'));
        } else {
          tag.classList.add('buy');
          tag.appendChild(makeIcon(currency === 'candy' ? 'i-candy' : 'i-coin'));
          tag.appendChild(document.createTextNode(formatNum(item.price)));
        }
        info.appendChild(text);
        info.appendChild(tag);
        card.appendChild(canvas);
        card.appendChild(info);

        const activate = () => this.selectCosmetic(type, item, card);
        card.addEventListener('click', activate);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activate();
          }
        });

        list.appendChild(card);
      }
    }

    selectCosmetic(type, item, card) {
      const conf = COSMETIC_TYPES[type];
      if (!conf || !item) return;
      const owned = Save.owns(type, item.id);
      const selectedId = type === 'skin' ? this.game.save.skin : type === 'outfit' ? this.game.save.outfit : this.game.save.accessory;
      if (owned && selectedId === item.id) {
        window.gameAudio.play('click');
        return;
      }
      const ok = this.game.buyCosmetic(type, item.id);
      if (ok) {
        this.renderSkins();
        this.updateMenu();
        this.toast(
          owned ? 'ASPECTO EQUIPADO' : conf.label.toUpperCase() + ' DESBLOQUEADA',
          item.name,
          owned ? 'lime' : 'gold',
          owned ? 'i-check' : (type === 'skin' ? 'i-skin' : type === 'outfit' ? 'i-outfit' : 'i-accessory')
        );
      } else {
        const currency = item.currency === 'candy' ? 'dulces' : 'monedas';
        this.shakeElement(card);
        this.toast('SALDO INSUFICIENTE', 'Necesitas ' + formatNum(item.price) + ' ' + currency + ' para desbloquear ' + item.name + '.', 'danger', item.currency === 'candy' ? 'i-candy' : 'i-coin');
      }
    }

    /* ============================================================
       LOGROS
       ============================================================ */
    renderAchievements() {
      const list = this.el.achievementsList;
      if (!list) return;
      const save = this.game.save;
      const unlocked = new Set(save.achievements || []);
      list.textContent = '';

      const frag = document.createDocumentFragment();
      for (const a of ACHIEVEMENTS) {
        const done = unlocked.has(a.id);
        const value = Math.max(0, save.stats[a.stat] || 0);
        const pct = clamp(value / a.goal, 0, 1) * 100;
        const event = /candy|halloween/.test(a.stat);
        const fmt = (v) => a.stat === 'time' ? formatDuration(v) : formatNum(v);

        const card = document.createElement('article');
        card.className = 'ach-card' + (done ? ' unlocked' : '') + (event ? ' event' : '');
        card.setAttribute('aria-label', a.name + ', ' + (done ? 'desbloqueado' : fmt(value) + ' de ' + fmt(a.goal)));

        const icon = document.createElement('span');
        icon.className = 'ach-icon';
        icon.appendChild(makeIcon(a.icon));

        const body = document.createElement('div');
        body.className = 'ach-body';
        const top = document.createElement('div');
        top.className = 'ach-top';
        const title = document.createElement('h3');
        title.textContent = a.name;
        const badge = document.createElement('span');
        badge.className = 'ach-badge';
        badge.append(makeIcon(done ? 'i-check' : 'i-achievement'));
        badge.append(document.createTextNode(done ? 'DESBLOQUEADO' : 'EN CURSO'));
        top.appendChild(title);
        top.appendChild(badge);

        const desc = document.createElement('p');
        desc.textContent = a.desc;

        const track = document.createElement('div');
        track.className = 'ach-track';
        const fill = document.createElement('i');
        fill.style.width = pct.toFixed(1) + '%';
        track.appendChild(fill);

        const foot = document.createElement('div');
        foot.className = 'ach-foot';
        const progress = document.createElement('span');
        progress.className = 'ach-progress';
        progress.textContent = fmt(Math.min(value, a.goal)) + ' / ' + fmt(a.goal);
        const reward = document.createElement('span');
        reward.className = 'ach-reward';
        reward.appendChild(makeIcon(event ? 'i-candy' : 'i-coin'));
        reward.appendChild(document.createTextNode(this.game.achievementRewardText(a) || 'Recompensa secreta'));
        foot.appendChild(progress);
        foot.appendChild(reward);

        body.appendChild(top);
        body.appendChild(desc);
        body.appendChild(track);
        body.appendChild(foot);
        card.appendChild(icon);
        card.appendChild(body);
        frag.appendChild(card);
      }
      list.appendChild(frag);

      const count = unlocked.size;
      if (this.el.achievementCount) this.el.achievementCount.textContent = count;
      if (this.el.achievementTotal) this.el.achievementTotal.textContent = ACHIEVEMENTS.length;
      if (this.el.achievementBar) this.el.achievementBar.style.width = (count / ACHIEVEMENTS.length * 100).toFixed(1) + '%';
    }

    /* ============================================================
       EVENTO HALLOWEEN
       ============================================================ */
    openEvent() {
      if (!this.el.eventOverlay) return;
      this.closePanels();
      this.eventMode = this.game.save.mode === 'online' ? 'online' : 'bots';
      this.updateEventUI();
      this.el.eventOverlay.classList.remove('hidden');
      if (this.el.eventShop) this.el.eventShop.classList.add('hidden');
      document.body.classList.add('event-open');
      window.gameAudio.init();
      window.gameAudio.play('event');
    }

    closeEvent() {
      if (!this.el.eventOverlay) return;
      this.el.eventOverlay.classList.add('hidden');
      if (this.el.eventShop) this.el.eventShop.classList.add('hidden');
      document.body.classList.remove('event-open', 'event-shop-open');
      window.gameAudio.play('close');
    }

    setEventMode(mode) {
      this.eventMode = mode === 'online' ? 'online' : 'bots';
      this.updateEventUI();
      window.gameAudio.play('click');
    }

    updateEventUI() {
      const online = this.eventMode === 'online';
      if (this.el.eventModeBots) {
        this.el.eventModeBots.classList.toggle('active', !online);
        this.el.eventModeBots.setAttribute('aria-pressed', !online ? 'true' : 'false');
      }
      if (this.el.eventModeOnline) {
        this.el.eventModeOnline.classList.toggle('active', online);
        this.el.eventModeOnline.setAttribute('aria-pressed', online ? 'true' : 'false');
      }
      if (this.el.eventModeNote) {
        this.el.eventModeNote.textContent = online
          ? 'Se abrirá el navegador de servidores en la sala de Halloween. Elige tu región y comparte la sala con otros jugadores.'
          : 'Se usará la dificultad guardada. Las mejoras permanentes se aplican y tu arena de Halloween conserva su progreso mientras esta página siga abierta.';
      }
      if (this.el.eventStart) {
        setTextNode(this.el.eventStart, online ? 'ELEGIR SERVIDOR · EVENTO' : 'ENTRAR AL EVENTO');
      }
      if (this.el.eventCandy) this.el.eventCandy.textContent = formatNum(this.game.save.candy);
      if (this.el.eventShopCandy) this.el.eventShopCandy.textContent = formatNum(this.game.save.candy);
    }

    startEvent() {
      const mode = this.eventMode;
      this.closeEvent();
      this.game.startRun({ variant: 'halloween', mode });
    }

    openEventShop() {
      if (!this.el.eventShop || !this.el.eventShopList) return;
      this.renderEventShop();
      if (this.el.eventOverlay) this.el.eventOverlay.classList.add('hidden');
      this.el.eventShop.classList.remove('hidden');
      document.body.classList.add('event-open', 'event-shop-open');
      window.gameAudio.init();
      window.gameAudio.play('open');
    }

    closeEventShop() {
      if (!this.el.eventShop) return;
      this.el.eventShop.classList.add('hidden');
      document.body.classList.remove('event-shop-open');
      if (this.el.eventOverlay && !this.el.menu.classList.contains('hidden')) {
        this.el.eventOverlay.classList.remove('hidden');
        this.updateEventUI();
        document.body.classList.add('event-open');
      } else {
        document.body.classList.remove('event-open');
      }
      window.gameAudio.play('close');
    }

    renderEventShop() {
      const list = this.el.eventShopList;
      if (!list) return;
      list.textContent = '';
      this.eventPreviews.length = 0;
      const save = this.game.save;
      const typeOrder = ['skin', 'outfit', 'accessory'];
      const typeIcons = { skin: 'i-skin', outfit: 'i-outfit', accessory: 'i-accessory' };

      for (const type of typeOrder) {
        const conf = COSMETIC_TYPES[type];
        const items = conf.list.filter((item) => item.event);
        if (!items.length) continue;

        const section = document.createElement('section');
        section.className = 'event-shop-section';
        const head = document.createElement('header');
        head.className = 'event-shop-section-head';
        const h3 = document.createElement('h3');
        h3.appendChild(makeIcon(typeIcons[type]));
        h3.appendChild(document.createTextNode(conf.plural.toUpperCase()));
        const note = document.createElement('span');
        note.textContent = items.length + ' piezas de edición limitada';
        head.appendChild(h3);
        head.appendChild(note);

        const grid = document.createElement('div');
        grid.className = 'event-shop-grid';
        for (const item of items) {
          const owned = Save.owns(type, item.id);
          const selected = type === 'skin' ? save.skin === item.id : type === 'outfit' ? save.outfit === item.id : save.accessory === item.id;
          const card = document.createElement('article');
          card.className = 'shop-card' + (owned ? ' owned' : '') + (selected ? ' selected' : '');
          card.setAttribute('role', 'button');
          card.setAttribute('tabindex', '0');
          card.setAttribute('aria-label', item.name + (owned ? (selected ? ', equipado' : ', disponible') : ', ' + item.price + ' dulces'));

          const canvas = document.createElement('canvas');
          canvas.width = 380;
          canvas.height = 210;
          canvas.setAttribute('aria-hidden', 'true');
          const previewSkin = type === 'skin' ? item : (SKIN_MAP[save.skin] || SKINS[0]);
          const outfit = type === 'outfit' ? item.id : (save.outfit || 'none');
          const accessory = type === 'accessory' ? item.id : (save.accessory || 'none');
          this.eventPreviews.push({ canvas, skin: previewSkin, outfit, accessory });

          const body = document.createElement('div');
          body.className = 'shop-card-body';
          const kicker = document.createElement('span');
          kicker.className = 'shop-kicker';
          kicker.textContent = conf.label.toUpperCase() + ' · EVENTO';
          const name = document.createElement('h4');
          name.textContent = item.name;
          const desc = document.createElement('p');
          desc.textContent = item.desc || item.tag;
          const foot = document.createElement('div');
          foot.className = 'shop-card-foot';
          const tag = document.createElement('span');
          tag.className = 'shop-tag';
          tag.textContent = item.tag;
          const action = document.createElement('span');
          action.className = 'shop-action' + (owned ? ' equipped' : '');
          if (selected) {
            action.appendChild(makeIcon('i-check'));
            action.appendChild(document.createTextNode('EQUIPADO'));
          } else if (owned) {
            action.appendChild(makeIcon('i-check'));
            action.appendChild(document.createTextNode('EQUIPAR'));
          } else {
            action.appendChild(makeIcon('i-candy'));
            action.appendChild(document.createTextNode(formatNum(item.price)));
          }
          foot.appendChild(tag);
          foot.appendChild(action);
          body.appendChild(kicker);
          body.appendChild(name);
          body.appendChild(desc);
          body.appendChild(foot);
          card.appendChild(canvas);
          card.appendChild(body);

          const activate = () => this.buyEventCosmetic(type, item, card);
          card.addEventListener('click', activate);
          card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              activate();
            }
          });
          grid.appendChild(card);
        }
        section.appendChild(head);
        section.appendChild(grid);
        list.appendChild(section);
      }

      if (!list.children.length) {
        const empty = document.createElement('p');
        empty.className = 'event-shop-empty';
        empty.textContent = 'La tienda se está preparando. Vuelve a abrirla en unos segundos.';
        list.appendChild(empty);
      }
      if (this.el.eventShopCandy) this.el.eventShopCandy.textContent = formatNum(save.candy);
    }

    buyEventCosmetic(type, item, card) {
      const owned = Save.owns(type, item.id);
      const selected = type === 'skin' ? this.game.save.skin === item.id : type === 'outfit' ? this.game.save.outfit === item.id : this.game.save.accessory === item.id;
      if (owned && selected) {
        window.gameAudio.play('click');
        return;
      }
      const ok = this.game.buyCosmetic(type, item.id);
      if (ok) {
        this.renderEventShop();
        this.updateMenu();
        this.toast(
          owned ? 'ASPECTO EQUIPADO' : 'RELÍQUIA DE HALLOWEEN',
          item.name + (owned ? '' : ' · -' + formatNum(item.price) + ' dulces'),
          owned ? 'lime' : 'pink',
          owned ? 'i-check' : 'i-pumpkin'
        );
      } else {
        this.shakeElement(card);
        this.toast('DULCES INSUFICIENTES', 'Necesitas ' + formatNum(item.price) + ' dulces para desbloquear ' + item.name + '.', 'danger', 'i-candy');
      }
    }

    shakeElement(node) {
      if (!node || typeof node.animate !== 'function') return;
      node.animate(
        [
          { transform: 'translateX(0)' },
          { transform: 'translateX(-5px)' },
          { transform: 'translateX(5px)' },
          { transform: 'translateX(-3px)' },
          { transform: 'translateX(3px)' },
          { transform: 'translateX(0)' }
        ],
        { duration: 320, easing: 'ease-in-out' }
      );
    }

    /* ============================================================
       AJUSTES
       ============================================================ */
    syncSettings() {
      const settings = this.game.save.settings;
      this.el.setMusic.value = settings.music;
      this.el.setMusicVal.textContent = settings.music;
      this.el.setSfx.value = settings.sfx;
      this.el.setSfxVal.textContent = settings.sfx;
      $$('button[data-quality]', this.el.qualitySeg).forEach((btn) => {
        const active = btn.dataset.quality === settings.quality;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      if (this.el.themeChoices) {
        $$('[data-theme-choice]', this.el.themeChoices).forEach((btn) => {
          const active = btn.dataset.themeChoice === settings.theme;
          btn.classList.toggle('active', active);
          btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
      }
      if (this.el.motionSeg) {
        $$('[data-motion-choice]', this.el.motionSeg).forEach((btn) => {
          const active = btn.dataset.motionChoice === settings.motion;
          btn.classList.toggle('active', active);
          btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
      }
      if (this.el.controlModes) {
        $$('[data-control-mode]', this.el.controlModes).forEach((btn) => {
          const active = btn.dataset.controlMode === settings.controls;
          btn.classList.toggle('active', active);
          btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
      }
      if (this.el.setSensitivity) {
        this.el.setSensitivity.value = settings.sensitivity;
        this.el.setSensitivityVal.textContent = settings.sensitivity;
      }
      if (this.el.setCameraScale) {
        const cam = clamp(Math.round(settings.cameraScale || 100), 88, 112);
        this.el.setCameraScale.value = cam;
        this.el.setCameraScaleVal.textContent = cam;
      }
      if (this.el.setColorblind) this.el.setColorblind.value = settings.colorblind;
      this.setSwitch(this.el.setShake, settings.shake);
      this.setSwitch(this.el.setParticles, settings.particles);
      this.setSwitch(this.el.setCaptions, settings.captions);
      this.setSwitch(this.el.setHaptics, settings.haptics);
      this.setSwitch(this.el.setHighContrast, settings.highContrast);
      this.setSwitch(this.el.setLargeUI, settings.largeUI);
      this.setSwitch(this.el.setPauseBlur, settings.pauseOnBlur);
      this.setSwitch(this.el.setHints, settings.showHints);
      this.setSwitch(this.el.setAutoQuality, settings.autoQuality);
      this.setSwitch(this.el.setFps, settings.fpsMeter);
      this.setSwitch(this.el.setMinimap, settings.minimap);
      this.setSwitch(this.el.setNameTags, settings.nameTags);
      this.setSwitch(this.el.setFlashes, settings.flashes);
      this.setSwitch(this.el.setPowerAlerts, settings.powerAlerts);
      document.body.classList.toggle('hints-off', !settings.showHints);
      this.applyModeUI();
      this.updateSaveInfo();
      this.updateFullscreenLabel();
    }

    applyModeUI() {
      const save = this.game.save;
      const online = save.mode === 'online';
      const diff = NS.DIFFICULTIES[save.difficulty] || NS.DIFFICULTIES.normal;
      if (this.el.modeChoices) {
        this.el.modeChoices.forEach((btn) => {
          const active = btn.dataset.mode === save.mode;
          btn.classList.toggle('active', active);
          btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
      }
      if (this.el.diffButtons) {
        this.el.diffButtons.forEach((btn) => {
          const active = btn.dataset.difficulty === save.difficulty;
          btn.classList.toggle('active', active);
          btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
      }
      const onlineInfo = online && NS.Online ? NS.Online.menuInfo() : null;
      if (this.el.difficultyRow) this.el.difficultyRow.classList.toggle('hidden', online);
      if (this.el.onlineNote) this.el.onlineNote.classList.toggle('hidden', !online);
      if (this.el.onlineNoteText && onlineInfo) this.el.onlineNoteText.textContent = onlineInfo.note;
      if (this.el.btnServers) {
        this.el.btnServers.classList.toggle('hidden', !online);
        this.el.btnServers.setAttribute('aria-label', onlineInfo ? onlineInfo.action : 'Ver servidores');
      }
      if (this.el.menuModeLabel) {
        this.el.menuModeLabel.textContent = online
          ? (this.game.online ? 'SERVIDOR ONLINE' : 'RED MULTIJUGADOR')
          : 'ARENA DE BOTS';
      }
      if (this.el.menuAlive) this.el.menuAlive.textContent = online ? (onlineInfo ? onlineInfo.players : '—') : String(diff.bots);
      if (this.el.menuAliveLabel) this.el.menuAliveLabel.textContent = online ? (onlineInfo ? onlineInfo.label : 'JUGADORES') : 'RIVALES';
      if (this.el.btnPlay) {
        const label = this.el.btnPlay.querySelector('.btn-text');
        if (label) label.textContent = online
          ? (this.game.online ? 'VOLVER A LA ARENA' : 'BUSCAR SERVIDOR')
          : 'ENTRAR A LA ARENA';
        this.el.btnPlay.classList.toggle('mode-online', online);
      }
      if (this.el.hudMode) this.el.hudMode.textContent = this.game.modeLabel();
      if (this.el.boostHint) {
        const controls = save.settings.controls;
        let hint = 'MANTÉN CLIC / ESPACIO';
        if (controls === 'touch') hint = 'ARRASTRA EL DEDO';
        else if (controls === 'joystick') hint = 'MUEVE EL JOYSTICK';
        else if (controls === 'dpad') hint = 'USA LA CRUCETA';
        else if (controls === 'gamepad') hint = 'STICK + A / RT';
        else if (controls === 'keys') hint = 'ESPACIO / SHIFT';
        else if (this.game.isCoarse) hint = 'MANTÉN EL BOTÓN';
        this.el.boostHint.textContent = hint;
      }
    }

    onSoundEvent(name) {
      if (!name || !this.game.save.settings.captions) return;
      const labels = {
        booststart: 'TURBO ACTIVADO',
        rare: 'ORBE ESPECIAL',
        kill: 'BAJA CONFIRMADA',
        death: 'HAS CAÍDO',
        shield: 'ESCUDO ACTIVADO',
        rankup: 'NUEVO RANGO',
        buy: 'COMPRA REALIZADA',
        error: 'ACCIÓN NO DISPONIBLE',
        count: 'LA ARENA SE PREPARA',
        go: '¡ADELANTE!',
        coin: 'MONEDAS RECIBIDAS',
        powerup: 'POTENCIADOR RECOGIDO',
        achievement: 'LOGRO DESBLOQUEADO',
        candy: 'DULCE RECOGIDO',
        candyRare: 'DULCE ESPECIAL',
        open: 'PANEL ABIERTO',
        close: 'PANEL CERRADO'
      };
      const text = labels[name];
      const haptics = {
        booststart: 12, rare: 28, kill: [25, 40, 30], death: [45, 60, 80],
        shield: [18, 30, 18], rankup: [18, 40, 18, 40], buy: 22, coin: 16,
        powerup: [20, 34, 20], achievement: [16, 28, 16, 28], candy: 14,
        candyRare: [18, 24, 18]
      };
      if (this.game.save.settings.haptics && haptics[name] && navigator.vibrate) {
        try { navigator.vibrate(haptics[name]); } catch (e) { /* ignore */ }
      }
      if (!text || !this.el.captionLayer || !this.el.captionText) return;
      const layer = this.el.captionLayer;
      this.el.captionText.textContent = text;
      layer.classList.remove('hidden', 'out');
      layer.style.animation = 'none';
      void layer.offsetWidth;
      layer.style.animation = '';
      clearTimeout(this.captionTimer);
      this.captionTimer = setTimeout(() => {
        layer.classList.add('out');
        this.captionTimer = setTimeout(() => layer.classList.add('hidden'), 260);
      }, 1450);
    }

    setSwitch(button, on) {
      if (!button) return;
      button.classList.toggle('on', !!on);
      button.setAttribute('aria-checked', on ? 'true' : 'false');
    }

    updateSaveInfo() {
      if (!this.el.saveInfo) return;
      const save = this.game.save;
      this.el.saveInfo.textContent =
        formatNum(save.coins) + ' monedas · ' +
        formatNum(save.candy) + ' dulces · ' +
        formatNum(save.stats.runs) + ' partidas · ' +
        formatDuration(save.stats.time) + ' en arena';
    }

    disarmReset() {
      this.resetArmed = false;
      if (this.resetTimer) {
        clearTimeout(this.resetTimer);
        this.resetTimer = null;
      }
      if (this.el.btnReset) this.el.btnReset.textContent = 'BORRAR PROGRESO';
    }

    handleReset() {
      if (!this.resetArmed) {
        this.resetArmed = true;
        this.el.btnReset.textContent = '¿SEGURO? CONFIRMAR';
        window.gameAudio.play('error');
        this.resetTimer = setTimeout(() => this.disarmReset(), 3600);
        return;
      }
      this.disarmReset();
      this.game.resetProgress();
      this.syncSettings();
      this.updateMuteUI();
      this.toast('PROGRESO BORRADO', 'La arena te recuerda. Empieza de cero.', 'danger', 'i-retry');
    }

    handleResetSettings() {
      if (!this.el.btnResetSettings) return;
      if (!this.resetSettingsArmed) {
        this.resetSettingsArmed = true;
        this.el.btnResetSettings.textContent = '¿SEGURO? CONFIRMAR';
        window.gameAudio.play('error');
        this.resetSettingsTimer = setTimeout(() => {
          this.resetSettingsArmed = false;
          if (this.el.btnResetSettings) this.el.btnResetSettings.textContent = 'RESTABLECER';
        }, 3600);
        return;
      }
      this.resetSettingsArmed = false;
      if (this.resetSettingsTimer) clearTimeout(this.resetSettingsTimer);
      this.el.btnResetSettings.textContent = 'RESTABLECER';
      const base = NS.defaultSave();
      this.game.save.settings = base.settings;
      this.game.autoQualityStep = 0;
      Save.write();
      this.game.applySettings();
      this.syncSettings();
      this.updateMuteUI();
      this.toast('AJUSTES RESTABLECIDOS', 'La temática Aurora y los controles automáticos vuelven a estar activos.', 'lime', 'i-settings');
    }

    /* ============================================================
       AUDIO / PANTALLA COMPLETA
       ============================================================ */
    toggleMute() {
      const settings = this.game.save.settings;
      settings.muted = !settings.muted;
      Save.write();
      window.gameAudio.init();
      window.gameAudio.setMuted(settings.muted);
      document.body.classList.toggle('muted', settings.muted);
      this.updateMuteUI();
      this.toast(
        settings.muted ? 'SONIDO SILENCIADO' : 'SONIDO ACTIVADO',
        settings.muted ? 'Pulsa M para volver a activarlo.' : 'Música y efectos restaurados.',
        'gold',
        settings.muted ? 'i-muted' : 'i-sound'
      );
    }

    updateMuteUI() {
      const muted = !!this.game.save.settings.muted;
      document.body.classList.toggle('muted', muted);
      for (const btn of [this.el.btnMuteMenu, this.el.btnMuteHud]) {
        if (!btn) continue;
        btn.setAttribute('aria-label', muted ? 'Activar sonido' : 'Silenciar sonido');
        btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
        btn.title = muted ? 'Activar sonido (M)' : 'Silenciar sonido (M)';
      }
    }

    async toggleFullscreen() {
      const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
      try {
        if (active) {
          const exit = document.exitFullscreen || document.webkitExitFullscreen;
          if (exit) await exit.call(document);
        } else {
          const target = document.documentElement;
          const request = target.requestFullscreen || target.webkitRequestFullscreen;
          if (!request) throw new Error('unsupported');
          await request.call(target, { navigationUI: 'hide' });
        }
      } catch (err) {
        this.toast('PANTALLA COMPLETA', 'Tu navegador ha bloqueado la solicitud.', 'danger', 'i-fullscreen');
      }
      this.updateFullscreenLabel();
    }

    updateFullscreenLabel() {
      const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if (this.el.btnFullscreen) {
        this.el.btnFullscreen.title = active ? 'Salir de pantalla completa' : 'Pantalla completa';
        this.el.btnFullscreen.setAttribute('aria-label', active ? 'Salir de pantalla completa' : 'Pantalla completa');
      }
      setTextNode(this.el.btnFullscreen2, active ? 'SALIR' : 'ACTIVAR');
      if (this.el.btnFullscreen2) {
        this.el.btnFullscreen2.setAttribute('aria-label', active ? 'Salir de pantalla completa' : 'Activar pantalla completa');
      }
    }

    /* ============================================================
       HUD
       ============================================================ */
    updatePowerHud(player) {
      const hud = this.el.powerHud;
      if (!hud) return;
      const game = this.game;
      if (!player || !player.alive || (game.state !== 'playing' && game.state !== 'paused')) {
        if (!hud.classList.contains('hidden')) {
          hud.classList.add('hidden');
          hud.textContent = '';
        }
        this.powerSignature = '';
        return;
      }

      const active = [];
      const now = game.time;
      const fields = [
        ['invincible', 'powerInvincibleUntil'],
        ['magnet', 'powerMagnetUntil'],
        ['zoom', 'powerZoomUntil']
      ];
      for (const [id, field] of fields) {
        const def = POWERUP_MAP[id];
        const remaining = (player[field] || -1) - now;
        if (def && remaining > 0) active.push({ def, remaining });
      }
      const shields = clamp(Math.floor(player.shieldCharges || 0), 0, 3);
      const signature = active.map((a) => a.def.id + ':' + Math.ceil(a.remaining * 10)).join('|') + '|shield:' + shields;
      if (signature === this.powerSignature) return;
      this.powerSignature = signature;

      hud.textContent = '';
      if (!active.length && !shields) {
        hud.classList.add('hidden');
        return;
      }
      hud.classList.remove('hidden');
      for (const entry of active) {
        const def = entry.def;
        const chip = document.createElement('div');
        chip.className = 'power-chip power-' + def.id;
        chip.style.setProperty('--power-color', def.color);
        chip.title = def.desc;

        const ico = document.createElement('span');
        ico.className = 'power-chip-ico';
        ico.appendChild(makeIcon(def.icon));
        const copy = document.createElement('span');
        copy.className = 'power-chip-copy';
        const name = document.createElement('b');
        name.textContent = def.name;
        const time = document.createElement('small');
        time.textContent = Math.ceil(entry.remaining) + ' S';
        const bar = document.createElement('i');
        bar.className = 'power-chip-bar';
        const fill = document.createElement('span');
        fill.style.width = clamp(entry.remaining / def.duration, 0, 1) * 100 + '%';
        bar.appendChild(fill);
        copy.appendChild(name);
        copy.appendChild(time);
        copy.appendChild(bar);
        chip.appendChild(ico);
        chip.appendChild(copy);
        hud.appendChild(chip);
      }

      if (shields > 0) {
        const chip = document.createElement('div');
        chip.className = 'power-chip power-shield';
        chip.title = 'Escudo de emergencia: sobrevives a un impacto y teletransportas.';
        const ico = document.createElement('span');
        ico.className = 'power-chip-ico';
        ico.appendChild(makeIcon('i-shield'));
        const copy = document.createElement('span');
        copy.className = 'power-chip-copy';
        const name = document.createElement('b');
        name.textContent = 'ESCUDO';
        const count = document.createElement('small');
        count.textContent = 'x' + shields + (shields === 1 ? ' CARGA' : ' CARGAS');
        const pips = document.createElement('span');
        pips.className = 'shield-pips';
        for (let i = 0; i < 3; i++) {
          const pip = document.createElement('i');
          if (i < shields) pip.className = 'on';
          pips.appendChild(pip);
        }
        copy.appendChild(name);
        copy.appendChild(count);
        copy.appendChild(pips);
        chip.appendChild(ico);
        chip.appendChild(copy);
        hud.appendChild(chip);
      }
    }

    updateHUD(game, force) {
      const p = game.player;
      if (!p) return;
      const el = this.el;

      el.hudScore.textContent = formatNum(p.mass);
      el.hudRank.textContent = p.rank ? '#' + p.rank : '#—';
      el.hudName.textContent = p.name;
      if (el.hudMode) el.hudMode.textContent = game.modeLabel();
      el.hudTime.textContent = formatTime(p.timeAlive);
      el.massLabel.textContent = 'MASA ' + formatNum(p.mass);

      const ratio = clamp(p.boostRatio, 0, 1);
      el.boostFill.style.width = (ratio * 100).toFixed(1) + '%';
      el.boostFill.classList.toggle('low', ratio < .18);
      el.boostWrap.classList.toggle('boosting', p.boosting);
      el.boostState.textContent = p.boosting
        ? 'TURBO ACTIVO'
        : p.mass <= CFG.boostMinMass + 4
          ? 'MASA CRÍTICA'
          : ratio < .24
            ? 'RESERVA BAJA'
            : 'LISTO';

      if (p.combo >= 2 && game.state === 'playing') {
        el.combo.classList.remove('hidden');
        el.comboVal.textContent = 'x' + p.combo;
        const left = clamp(1 - (game.time - p.lastEatTime) / CFG.comboWindow, 0, 1);
        el.comboBar.style.width = (left * 100).toFixed(0) + '%';
      } else {
        el.combo.classList.add('hidden');
      }

      const nearEdge = game.state === 'playing' && Math.hypot(p.x, p.y) > CFG.worldRadius - 480;
      el.edgeWarning.classList.toggle('show', nearEdge);

      this.updatePowerHud(p);

      const now = performance.now();
      if (force || now - this.lbAt > 240) {
        this.lbAt = now;
        this.renderLeaderboard(game, p, force);
      }
    }

    renderLeaderboard(game, player, force) {
      const alive = this.aliveCount();
      this.el.lbCount.textContent = alive;
      const rows = game.topList.slice(0, 8);
      const extra = player && player.alive && player.rank && !rows.includes(player) ? player : null;
      const signature = rows.map((s) => s.name + '|' + Math.floor(s.mass) + '|' + s.rank).join(',') + '|' + alive + '|' + (extra ? 'x' + extra.rank : '');
      if (!force && signature === this.lbSignature) return;
      this.lbSignature = signature;

      const list = this.el.leaderboard;
      list.textContent = '';
      const frag = document.createDocumentFragment();
      rows.forEach((snake) => frag.appendChild(this.makeLeaderRow(snake, snake === player)));
      if (extra) frag.appendChild(this.makeLeaderRow(extra, true));
      if (!rows.length) {
        const empty = document.createElement('li');
        empty.className = 'lb-empty';
        empty.textContent = 'SIN RIVALES';
        frag.appendChild(empty);
      }
      list.appendChild(frag);
    }

    makeLeaderRow(snake, isPlayer) {
      const row = document.createElement('li');
      row.className = 'lb-row' + (snake.rank <= 3 ? ' top' + snake.rank : '') + (isPlayer ? ' me' : '');
      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.textContent = snake.rank;
      const name = document.createElement('span');
      name.className = 'nm';
      name.textContent = snake.name;
      const score = document.createElement('span');
      score.className = 'sc';
      score.textContent = formatNum(snake.mass);
      row.appendChild(rank);
      row.appendChild(name);
      row.appendChild(score);
      return row;
    }

    /* ============================================================
       PAUSA / FIN DE PARTIDA
       ============================================================ */
    showPause() {
      const p = this.game.player;
      this.el.pauseScore.textContent = p ? formatNum(p.mass) : '0';
      this.el.pauseRank.textContent = p && p.rank ? '#' + p.rank : '#—';
      this.el.pauseTime.textContent = p ? formatTime(p.timeAlive) : '0:00';
      this.el.pauseOverlay.classList.remove('hidden');
      window.gameAudio.setBoost(false);
    }

    hidePause() {
      this.el.pauseOverlay.classList.add('hidden');
    }

    showGameOver(results) {
      const r = results || {};
      const candy = r.currency === 'candy';
      const reward = Number.isFinite(r.reward) ? r.reward : (candy ? (r.candies || 0) : (r.coins || 0));
      const total = Number.isFinite(r.totalCurrency) ? r.totalCurrency : (candy ? (r.totalCandy || 0) : (r.totalCoins || 0));
      this.lastResults = r;
      document.body.classList.remove('in-run');
      document.body.classList.toggle('event-result', candy);
      this.hidePause();
      this.el.gameOver.classList.remove('hidden');

      this.el.goCause.textContent = r.causeText || 'Tu señal se ha perdido en la arena.';
      this.el.goBest.textContent = formatNum(r.best || 0);
      this.el.goLength.textContent = formatNum(r.mass || 0);
      this.el.goKills.textContent = formatNum(r.kills || 0);
      this.el.goRank.textContent = r.rank && r.rank < 99 ? '#' + r.rank : '#—';
      this.el.goOrbs.textContent = formatNum(r.orbs || 0);
      this.el.goTime.textContent = formatTime(r.time || 0);
      this.el.goCombo.textContent = 'x' + formatNum(r.comboBest || 0);
      this.el.goRewardLabel.textContent = candy ? 'DULCES GANADOS' : 'MONEDAS GANADAS';
      this.el.goTotalLabel.textContent = candy ? 'EN CALABAZA' : 'EN BÓVEDA';
      this.el.goTotalCoins.textContent = formatNum(total);
      this.el.goTotalIconUse.setAttribute('href', candy ? '#i-candy' : '#i-coin');
      if (this.el.goTotal) this.el.goTotal.classList.toggle('candy', candy);
      this.el.goNewBest.classList.toggle('hidden', !r.newBest);
      setTextNode(this.el.btnCopyScore, 'COPIAR RESULTADO');

      const token = ++this.countToken;
      this.animateCount(this.el.goScore, r.score || 0, '', token);
      this.animateCount(this.el.goCoins, reward, '+', token);
      this.updateMenu();
    }

    hideGameOver() {
      this.countToken++;
      this.el.gameOver.classList.add('hidden');
      document.body.classList.remove('event-result');
      this.lastResults = null;
      if (this.copyTimer) {
        clearTimeout(this.copyTimer);
        this.copyTimer = null;
      }
    }

    animateCount(element, target, prefix, token) {
      if (!element) return;
      const start = performance.now();
      const duration = 720;
      const step = (now) => {
        if (token !== this.countToken) return;
        const t = clamp((now - start) / duration, 0, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        element.textContent = prefix + formatNum(target * ease);
        if (t < 1) requestAnimationFrame(step);
        else element.textContent = prefix + formatNum(target);
      };
      requestAnimationFrame(step);
    }

    /* ============================================================
       PARTIDA EN CURSO
       ============================================================ */
    onRunStart() {
      const el = this.el;
      document.body.classList.add('in-run');
      document.body.classList.toggle('event-run', this.game.variant === 'halloween');
      this.clearCountdown();
      this.clearToasts();
      this.clearFeed();
      el.hud.classList.remove('hidden');
      el.combo.classList.add('hidden');
      el.edgeWarning.classList.remove('show');
      el.hudName.textContent = this.game.save.name;
      el.countdown.classList.remove('hidden');
      el.countdownText.classList.remove('go');
      el.boostWrap.classList.remove('boosting');
      if (el.powerHud) {
        el.powerHud.textContent = '';
        el.powerHud.classList.add('hidden');
      }
      this.powerSignature = '';

      const p = this.game.player;
      if (p) {
        el.hudScore.textContent = formatNum(p.mass);
        el.hudRank.textContent = p.rank ? '#' + p.rank : '#—';
        el.hudTime.textContent = '0:00';
      }
      this.updateHUD(this.game, true);
      this.startCountdown();
    }

    startCountdown() {
      const token = ++this.runToken;
      this.setCountdownText('3', false);
      window.gameAudio.play('count');
      const goText = this.game.variant === 'halloween' ? '¡A DULCEAR!' : '¡A CAZAR!';
      const steps = [
        { at: 760, text: '2', go: false, sound: 'count' },
        { at: 1520, text: '1', go: false, sound: 'count' },
        { at: 2280, text: goText, go: true, sound: 'go' },
        { at: 3260, hide: true }
      ];
      for (const step of steps) {
        const id = setTimeout(() => {
          if (token !== this.runToken) return;
          if (step.hide) {
            this.el.countdown.classList.add('hidden');
            return;
          }
          this.setCountdownText(step.text, step.go);
          window.gameAudio.play(step.sound);
        }, step.at);
        this.countdownTimers.push(id);
      }
    }

    setCountdownText(text, go) {
      const node = this.el.countdownText;
      node.style.animation = 'none';
      node.textContent = text;
      node.classList.toggle('go', !!go);
      void node.offsetWidth;
      node.style.animation = '';
    }

    clearCountdown() {
      this.runToken++;
      for (const id of this.countdownTimers) clearTimeout(id);
      this.countdownTimers.length = 0;
      if (this.el.countdown) this.el.countdown.classList.add('hidden');
    }

    hideHud() {
      document.body.classList.remove('in-run', 'event-run');
      this.el.hud.classList.add('hidden');
      this.clearCountdown();
      this.el.combo.classList.add('hidden');
      this.el.edgeWarning.classList.remove('show');
      if (this.el.powerHud) {
        this.el.powerHud.classList.add('hidden');
        this.el.powerHud.textContent = '';
      }
      this.powerSignature = '';
    }

    /* ============================================================
       FEED / TOASTS
       ============================================================ */
    addFeed(name, killerName, cause, isPlayer) {
      const layer = this.el.killfeed;
      if (!layer) return;
      const victim = String(name || 'SERPIENTE').slice(0, 24);
      const killer = killerName ? String(killerName).slice(0, 24) : null;
      const me = this.game.player;
      const involvesPlayer = !!isPlayer || (me && ((killer && killer === me.name) || victim === me.name));

      const item = document.createElement('div');
      item.className = 'feed-item' + (involvesPlayer ? ' player' : '');

      if (cause === 'wall') {
        const victimEl = document.createElement('b');
        victimEl.textContent = victim;
        const text = document.createElement('i');
        text.textContent = 'se estrelló contra el muro';
        item.appendChild(victimEl);
        item.appendChild(text);
      } else if (!killer) {
        const victimEl = document.createElement('b');
        victimEl.textContent = victim;
        const text = document.createElement('i');
        text.textContent = 'colisión contra un cuerpo';
        item.appendChild(victimEl);
        item.appendChild(text);
      } else {
        const killerEl = document.createElement('b');
        killerEl.textContent = killer;
        const dot = document.createElement('span');
        dot.className = 'kill-dot';
        const victimEl = document.createElement('b');
        victimEl.textContent = victim;
        const text = document.createElement('i');
        text.textContent = cause === 'head' ? 'choque frontal' : 'devorada';
        item.appendChild(killerEl);
        item.appendChild(dot);
        item.appendChild(victimEl);
        item.appendChild(text);
      }

      layer.appendChild(item);
      while (layer.children.length > 4) {
        layer.removeChild(layer.firstElementChild);
      }
      setTimeout(() => {
        if (!item.isConnected) return;
        item.classList.add('out');
        setTimeout(() => item.remove(), 360);
      }, 4800);
    }

    clearFeed() {
      if (this.el.killfeed) this.el.killfeed.textContent = '';
    }

    toast(title, sub, type, icon) {
      const layer = this.el.toastLayer;
      if (!layer) return;
      const allowed = ['gold', 'pink', 'lime', 'danger', 'cyan', 'violet'];
      const tone = allowed.includes(type) ? type : '';
      const item = document.createElement('div');
      item.className = 'toast' + (tone ? ' ' + tone : '');

      const iconWrap = document.createElement('div');
      iconWrap.className = 't-ico';
      const iconId = icon && document.getElementById(icon) ? icon : 'i-bolt';
      iconWrap.appendChild(makeIcon(iconId));

      const text = document.createElement('div');
      text.className = 't-text';
      const strong = document.createElement('b');
      strong.textContent = title || '';
      const span = document.createElement('span');
      span.textContent = sub || '';
      text.appendChild(strong);
      text.appendChild(span);

      item.appendChild(iconWrap);
      item.appendChild(text);
      layer.appendChild(item);
      while (layer.children.length > 3) layer.removeChild(layer.firstElementChild);

      setTimeout(() => {
        if (!item.isConnected) return;
        item.classList.add('out');
        setTimeout(() => item.remove(), 320);
      }, 3400);
    }

    clearToasts() {
      if (this.el.toastLayer) this.el.toastLayer.textContent = '';
    }

    /* ============================================================
       COPIAR RESULTADO
       ============================================================ */
    copyResult() {
      const r = this.lastResults;
      if (!r) return;
      const name = this.game.save.name;
      const candy = r.currency === 'candy';
      const reward = Number.isFinite(r.reward) ? r.reward : (candy ? (r.candies || 0) : (r.coins || 0));
      const lines = [
        'NEON SERPENT — RESULTADO DE PARTIDA',
        'Operador: ' + name,
        'Modo: ' + (candy ? 'Halloween · Noche de dulces' : 'Arena clásica'),
        'Puntaje: ' + formatNum(r.score || 0),
        'Bajas: ' + formatNum(r.kills || 0),
        'Masa final: ' + formatNum(r.mass || 0),
        'Orbes: ' + formatNum(r.orbs || 0),
        'Rango final: #' + (r.rank || '—'),
        'Tiempo: ' + formatTime(r.time || 0),
        'Mejor combo: x' + formatNum(r.comboBest || 0),
        (candy ? 'Dulces ganados: +' : 'Monedas ganadas: +') + formatNum(reward),
        'Causa: ' + (r.causeText || 'Señal perdida')
      ];
      const text = lines.join('\n');
      const finish = (ok) => {
        if (!ok) {
          this.toast('NO SE PUDO COPIAR', 'Tu navegador bloqueó el portapapeles.', 'danger', 'i-copy');
          return;
        }
        setTextNode(this.el.btnCopyScore, '¡COPIADO!');
        if (this.copyTimer) clearTimeout(this.copyTimer);
        this.copyTimer = setTimeout(() => setTextNode(this.el.btnCopyScore, 'COPIAR RESULTADO'), 1800);
        this.toast('RESULTADO COPIADO', 'Pégalo donde quieras presumir.', 'lime', 'i-copy');
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => finish(true), () => finish(this.fallbackCopy(text)));
      } else {
        finish(this.fallbackCopy(text));
      }
    }

    fallbackCopy(text) {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      area.style.top = '0';
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      area.remove();
      return ok;
    }

    /* ============================================================
       PREVISUALIZACIONES
       ============================================================ */
    drawPreviews(time) {
      if (time - this.previewAt < 1 / 30) return;
      this.previewAt = time;
      const game = this.game;
      const skin = SKIN_MAP[game.save.skin] || SKINS[0];
      const outfit = game.save.outfit || 'none';
      const accessory = game.save.accessory || 'none';

      if (!this.el.menu.classList.contains('hidden') && this.el.menuSkin && this.el.menuSkin.clientWidth > 0) {
        NS.drawSnakePreview(this.el.menuSkin, skin, time, 'body', { outfit, accessory });
      }
      if (!this.el.hud.classList.contains('hidden') && this.el.hudSkin && this.el.hudSkin.clientWidth > 0) {
        NS.drawSnakePreview(this.el.hudSkin, skin, time, 'head', { outfit, accessory });
      }
      if (
        this.currentPanel === 'hangar' &&
        this.currentTab === 'skins' &&
        this.el.panelLayer &&
        !this.el.panelLayer.classList.contains('hidden')
      ) {
        for (let i = 0; i < this.skinPreviews.length; i++) {
          const item = this.skinPreviews[i];
          if (!item.canvas.isConnected || item.canvas.clientWidth <= 0) continue;
          NS.drawSnakePreview(item.canvas, item.skin, time + i * .7, 'body', { outfit: item.outfit, accessory: item.accessory });
        }
      }
      if (this.el.eventShop && !this.el.eventShop.classList.contains('hidden')) {
        for (let i = 0; i < this.eventPreviews.length; i++) {
          const item = this.eventPreviews[i];
          if (!item.canvas.isConnected || item.canvas.clientWidth <= 0) continue;
          NS.drawSnakePreview(item.canvas, item.skin, time + i * .8, 'body', { outfit: item.outfit, accessory: item.accessory });
        }
      }
    }
  }

  NS.UI = UI;
})();

/* ============================================================================
 *  Platformer Engine
 *  A polished, dependency-free, browser-based platformer engine.
 *
 *  Features
 *  --------
 *  - Fixed-timestep physics (frame-rate independent, reproducible)
 *  - Smooth AABB tile + moving-platform collision (no frame-hack loops)
 *  - Coyote-time + jump-buffering for tight, responsive controls
 *  - Variable jump height (hold to jump higher)
 *  - Water / low-gravity zones
 *  - Springs, spikes, coins, hearts, stars, checkpoints, goal flag
 *  - Stompable patrolling enemies and moving platforms
 *  - Gamepad support (polled from the Web Gamepad API)
 *  - Particle system, world-space score popups, hit rings, ambient effects
 *  - Tween helper, camera shake, smooth follow, reduced-motion support
 *  - Web Audio SFX + optional chiptune music with independent volumes
 *  - Settings with persisted preferences (sound, music, reduced motion)
 *  - Static tile layer pre-rendered to an offscreen canvas (performance)
 *  - In-game HUD, menu / win / pause / game-over screens, toasts
 *
 *  Author: Arena.ai Agent Mode - refactored and production-hardened.
 * ============================================================================ */

(function (global) {
    'use strict';

    /* ==========================================================================
     *  Small math / util helpers
     * ======================================================================== */

    var TAU = Math.PI * 2;

    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function rand(a, b) { return a + Math.random() * (b - a); }
    function approach(cur, target, step) {
        if (cur < target) return Math.min(cur + step, target);
        if (cur > target) return Math.max(cur - step, target);
        return target;
    }

    /* Easing curves used by tweens. */
    function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
    function easeInOutQuad(t) {
        return (t < 0.5) ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }

    /* Deterministic pseudo-random for background features so they never flicker. */
    function hash2(x, y) {
        var h = (x * 374761393 + y * 668265263) | 0;
        h = (h ^ (h >> 13)) * 1274126177;
        return ((h ^ (h >> 16)) >>> 0) / 4294967295;
    }

    function formatTime(t) {
        var m = Math.floor(t / 60);
        var s = Math.floor(t % 60);
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function loadStorage(key, fallback) {
        try {
            var v = global.localStorage && global.localStorage.getItem(key);
            return v === null || v === undefined ? fallback : v;
        } catch (e) {
            return fallback;
        }
    }

    function saveStorage(key, value) {
        try {
            if (global.localStorage) global.localStorage.setItem(key, String(value));
        } catch (e) { /* storage may be unavailable (private mode, sandbox) */ }
    }

    /* ============================================================================
     *  Audio (Web Audio, synthesised - zero asset files)
     * ============================================================================ */

    function AudioFX() {
        this.ctx = null;
        this.master = null;
        this.sfxGain = null;
        this.musicGain = null;
        this.sfxEnabled = true;
        this.musicEnabled = true;
        this.sfxVolume = 0.8;
        this.musicVolume = 0.6;
        this.musicOn = false;
        this._musicTimer = null;
        this._nextNoteTime = 0;
        this._noteIndex = 0;
        this._beatIndex = 0;
        this._melody = [523, 587, 659, 784, 659, 587, 523, 784];
        this._bass = [131, 196, 165, 196];
    }

    AudioFX.prototype.ensure = function () {
        if (!this.ctx) {
            var AC = global.AudioContext || global.webkitAudioContext;
            if (!AC) return false;
            this.ctx = new AC();
            this.master = this.ctx.createGain();
            this.master.gain.value = 1;
            this.master.connect(this.ctx.destination);

            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.value = this.sfxEnabled ? this.sfxVolume : 0;
            this.sfxGain.connect(this.master);

            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.value = this.musicEnabled ? this.musicVolume * 0.9 : 0;
            this.musicGain.connect(this.master);
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return true;
    };

    AudioFX.prototype.refreshGains = function () {
        if (!this.ctx) return;
        if (this.sfxGain) this.sfxGain.gain.value = this.sfxEnabled ? this.sfxVolume : 0;
        if (this.musicGain) this.musicGain.gain.value = this.musicEnabled ? this.musicVolume * 0.9 : 0;
    };

    AudioFX.prototype.setMuted = function (m) {
        this.sfxEnabled = !m;
        this.musicEnabled = !m;
        if (m) this.stopMusic();
        this.refreshGains();
    };

    AudioFX.prototype.isMuted = function () { return !this.sfxEnabled && !this.musicEnabled; };

    AudioFX.prototype.setSfxEnabled = function (enabled) {
        this.sfxEnabled = !!enabled;
        this.refreshGains();
    };
    AudioFX.prototype.setMusicEnabled = function (enabled) {
        this.musicEnabled = !!enabled;
        if (!enabled) this.stopMusic();
        this.refreshGains();
    };
    AudioFX.prototype.setSfxVolume = function (v) {
        this.sfxVolume = clamp(v || 0, 0, 1);
        this.refreshGains();
    };
    AudioFX.prototype.setMusicVolume = function (v) {
        this.musicVolume = clamp(v || 0, 0, 1);
        this.refreshGains();
    };
    AudioFX.prototype.getSfxEnabled = function () { return this.sfxEnabled; };
    AudioFX.prototype.getMusicEnabled = function () { return this.musicEnabled; };
    AudioFX.prototype.getSfxVolume = function () { return this.sfxVolume; };
    AudioFX.prototype.getMusicVolume = function () { return this.musicVolume; };

    /* Play a single synthesised tone through the SFX bus. */
    AudioFX.prototype.tone = function (freq, dur, type, vol, slideTo) {
        if (!this.sfxEnabled || !this.ensure()) return;
        var t = this.ctx.currentTime;
        var o = this.ctx.createOscillator();
        var g = this.ctx.createGain();
        o.type = type || 'square';
        o.frequency.setValueAtTime(freq, t);
        if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g);
        g.connect(this.sfxGain);
        o.start(t);
        o.stop(t + dur + 0.02);
    };

    /* Noise burst for explosions / dust / splashes. */
    AudioFX.prototype.noise = function (dur, vol, filterFreq) {
        if (!this.sfxEnabled || !this.ensure()) return;
        var t = this.ctx.currentTime;
        var rate = this.ctx.sampleRate;
        var len = Math.max(1, (dur * rate) | 0);
        var buf = this.ctx.createBuffer(1, len, rate);
        var data = buf.getChannelData(0);
        for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        var src = this.ctx.createBufferSource();
        src.buffer = buf;
        var filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = filterFreq || 1200;
        var g = this.ctx.createGain();
        g.gain.setValueAtTime(vol || 0.3, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(filter);
        filter.connect(g);
        g.connect(this.sfxGain);
        src.start(t);
    };

    /* Schedule an SFX callback only when audio is actually available.
       Using this avoids scheduling work while muted or before first gesture. */
    AudioFX.prototype.after = function (delay, fn) {
        if (!this.sfxEnabled || !this.ctx) return;
        var self = this;
        setTimeout(function () {
            if (self.sfxEnabled && self.ctx && fn) fn();
        }, (delay || 0) * 1000);
    };

    /* Named sound effects. Each checks enabled/muted to avoid wasted work. */
    AudioFX.prototype.jump = function () {
        var self = this;
        this.after(0, function () { self.tone(360, 0.12, 'square', 0.18, 480); });
        this.after(0.05, function () { self.tone(560, 0.14, 'square', 0.12, 560); });
    };

    AudioFX.prototype.coin = function () {
        var self = this;
        this.after(0, function () { self.tone(988, 0.09, 'square', 0.16); });
        this.after(0.06, function () { self.tone(1319, 0.09, 'square', 0.16); });
    };

    AudioFX.prototype.heart = function () {
        var self = this;
        [[0, 523], [0.08, 784], [0.16, 1047]].forEach(function (p) {
            self.after(p[0], function () { self.tone(p[1], 0.12, 'triangle', 0.2); });
        });
    };

    AudioFX.prototype.star = function () {
        var self = this;
        [[0, 660], [0.08, 880], [0.16, 1108], [0.24, 1318], [0.34, 1760]].forEach(function (p) {
            self.after(p[0], function () { self.tone(p[1], 0.12, 'square', 0.16); });
        });
        this.after(0.34, function () { self.tone(1760, 0.18, 'triangle', 0.14); });
    };

    AudioFX.prototype.stomp = function () {
        var self = this;
        this.after(0, function () { self.tone(200, 0.14, 'square', 0.22, 80); });
        this.after(0, function () { self.noise(0.15, 0.2, 700); });
    };

    AudioFX.prototype.spring = function () {
        var self = this;
        this.after(0, function () { self.tone(240, 0.2, 'sawtooth', 0.2, 700); });
        this.after(0, function () { self.noise(0.08, 0.08, 2400); });
    };

    AudioFX.prototype.hit = function () {
        var self = this;
        this.after(0, function () { self.tone(160, 0.2, 'sawtooth', 0.25, 60); });
        this.after(0, function () { self.noise(0.2, 0.3, 500); });
    };

    AudioFX.prototype.splish = function () {
        var self = this;
        this.after(0, function () { self.noise(0.25, 0.22, 1600); });
        this.after(0.03, function () { self.tone(520, 0.1, 'sine', 0.1, 320); });
    };

    AudioFX.prototype.death = function () {
        var self = this;
        [[0, 420, 290], [0.13, 320, 220], [0.26, 240, 170], [0.39, 150, 90]].forEach(function (p) {
            self.after(p[0], function () { self.tone(p[1], 0.18, 'square', 0.2, p[2]); });
        });
        this.after(0, function () { self.noise(0.35, 0.25, 400); });
    };

    AudioFX.prototype.win = function () {
        var self = this;
        [[0, 523], [0.11, 659], [0.22, 784], [0.33, 1047], [0.44, 1319], [0.55, 1568]].forEach(function (p) {
            self.after(p[0], function () { self.tone(p[1], 0.2, 'square', 0.18); });
        });
        this.after(0.55, function () { self.tone(1568, 0.35, 'triangle', 0.16); });
    };

    AudioFX.prototype.checkpoint = function () {
        var self = this;
        this.after(0, function () { self.tone(659, 0.12, 'triangle', 0.2); });
        this.after(0.09, function () { self.tone(880, 0.12, 'triangle', 0.2); });
    };

    AudioFX.prototype.unlock = function () {
        var self = this;
        [[0, 523], [0.08, 698], [0.16, 880], [0.24, 1047]].forEach(function (p) {
            self.after(p[0], function () { self.tone(p[1], 0.14, 'triangle', 0.2); });
        });
    };

    AudioFX.prototype.tick = function () {
        var self = this;
        this.after(0, function () { self.tone(880, 0.05, 'square', 0.1); });
    };

    AudioFX.prototype.ui = function () {
        var self = this;
        this.after(0, function () { self.tone(600, 0.05, 'sine', 0.12, 720); });
    };

    AudioFX.prototype.startMusic = function () {
        if (!this.musicEnabled) return;
        if (!this.ensure()) return;
        if (this.musicOn) return;
        this.musicOn = true;
        this._nextNoteTime = this.ctx.currentTime + 0.1;
        this._noteIndex = 0;
        this._beatIndex = 0;
        var self = this;
        if (this._musicTimer) clearInterval(this._musicTimer);
        this._musicTimer = setInterval(function () { self._scheduleMusic(); }, 180);
    };

    AudioFX.prototype.stopMusic = function () {
        this.musicOn = false;
        if (this._musicTimer) {
            clearInterval(this._musicTimer);
            this._musicTimer = null;
        }
    };

    AudioFX.prototype._scheduleMusic = function () {
        if (!this.ctx || !this.musicOn || !this.musicEnabled) return;
        var spb = 0.55;
        while (this._nextNoteTime < this.ctx.currentTime + 0.25) {
            var note = this._melody[this._noteIndex % this._melody.length];
            var bass = this._bass[this._beatIndex % this._bass.length];
            var t = this._nextNoteTime;
            this._playTrack('triangle', note, spb * 0.9, 0.09, t);
            if (this._noteIndex % 4 === 0) this._playTrack('sine', bass * 2, spb * 3.4, 0.12, t);
            this._nextNoteTime += spb;
            this._noteIndex++;
            if (this._noteIndex % 4 === 0) this._beatIndex++;
        }
    };

    AudioFX.prototype._playTrack = function (type, freq, dur, vol, when) {
        if (!this.musicEnabled || !this.ctx || !this.musicGain) return;
        var o = this.ctx.createOscillator();
        var g = this.ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, when);
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(vol, when + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        o.connect(g);
        g.connect(this.musicGain);
        o.start(when);
        o.stop(when + dur + 0.02);
    };

    /* ==========================================================================
     *  Particles
     * ======================================================================== */

    function Particles() {
        this.list = [];
        this.max = 1400;
    }

    Particles.prototype.spawn = function (x, y, opts) {
        var o = opts || {};
        var n = o.count || 6;
        if (this.list.length + n > this.max) n = Math.max(0, this.max - this.list.length);
        for (var i = 0; i < n; i++) {
            var a = (o.angle !== undefined)
                ? o.angle + rand(-(o.spread || 0.4), (o.spread || 0.4))
                : rand(0, TAU);
            var speed = rand(o.speedMin || 0.5, o.speedMax || 3);
            this.list.push({
                x: x, y: y,
                vx: Math.cos(a) * speed,
                vy: Math.sin(a) * speed,
                life: o.life || 0.6,
                maxLife: o.life || 0.6,
                size: rand(o.sizeMin || 2, o.sizeMax || 5),
                colour: o.colour || '#ffffff',
                gravity: o.gravity !== undefined ? o.gravity : 0.12,
                shape: o.shape || 'circle'
            });
        }
    };

    Particles.prototype.update = function (dt) {
        var step = dt || 1 / 60;
        for (var i = this.list.length - 1; i >= 0; i--) {
            var p = this.list[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity;
            p.vx *= 0.98;
            p.life -= step;
            if (p.life <= 0) this.list.splice(i, 1);
        }
    };

    Particles.prototype.draw = function (context) {
        for (var i = 0; i < this.list.length; i++) {
            var p = this.list[i];
            var lifeRatio = clamp(p.life / p.maxLife, 0, 1);
            context.globalAlpha = lifeRatio;
            context.fillStyle = p.colour;
            if (p.shape === 'rect') {
                context.save();
                context.translate(p.x, p.y);
                context.rotate(p.life * 5);
                context.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
                context.restore();
            } else {
                context.beginPath();
                context.arc(p.x, p.y, p.size * lifeRatio, 0, TAU);
                context.fill();
            }
        }
        context.globalAlpha = 1;
    };

    /* ==========================================================================
     *  Engine
     * ======================================================================== */

    function Engine(canvas) {
        this.canvas = canvas;
        if (canvas) this.ctx = canvas.getContext('2d');

        this.alert_errors = false;
        this.log_info = false;
        this.tile_size = 16;
        this.limit_viewport = true;

        this.audio = new AudioFX();

        this.state = 'menu';
        this.input = { left: false, right: false, jump: false };

        this.viewport = { x: 0, y: 0 };
        this.camera = { x: 0, y: 0 };
        this.cameraTarget = { x: 0, y: 0 };
        this.lookAhead = 0;
        this.shake = { t: 0, dur: 0, mag: 0 };

        this.player = {
            x: 0, y: 0, w: 11, h: 14,
            vx: 0, vy: 0,
            dir: 1,
            onFloor: false,
            canJump: true,
            coyote: 0,
            jumpBuffer: 0,
            squash: 1,
            invuln: 0,
            alive: true,
            colour: '#3D5AFE',
            groundPlatform: null,
            _wasInWater: false,
            _runDustTimer: 0
        };

        this.map = null;
        this.grid = null;
        this.coins = [];
        this.hearts = [];
        this.stars = [];
        this.enemies = [];
        this.checkpoints = [];
        this.platforms = [];
        this.goal = null;
        this.respawn = { x: 0, y: 0 };
        this._startSpot = null;

        this.score = 0;
        this.coinsCollected = 0;
        this.coinsTotal = 0;
        this.heartsCollected = 0;
        this.heartsTotal = 0;
        this.starsCollected = 0;
        this.starsTotal = 0;
        this.lives = 3;
        this.maxLives = 5;
        this.timePlayed = 0;
        this.maxScore = parseInt(loadStorage('platformer_maxScore', '0'), 10) || 0;

        this.particles = new Particles();
        this.floaters = [];
        this.vfxs = [];
        this.tweens = [];

        this.bg = null;
        this.staticLayer = null;
        this._skyGradient = null;
        this._skyGradientHeight = -1;
        this._gamepadIndex = null;

        this.lastTime = 0;
        this.accumulator = 0;
        this.rafId = null;
        this.running = false;
        this.dt = 1 / 60;
        this._respawnTimer = 0;
        this._toastTimer = 0;

        this.reducedMotion = loadStorage('platformer_reducedMotion', '0') === '1';
        this.uiModal = false;

        this.settings = {
            sfx: loadStorage('platformer_sfx', '1') === '1',
            music: loadStorage('platformer_music', '1') === '1',
            sfxVolume: clamp(parseFloat(loadStorage('platformer_sfxVolume', '0.8')) || 0.8, 0, 1),
            musicVolume: clamp(parseFloat(loadStorage('platformer_musicVolume', '0.6')) || 0.6, 0, 1),
            reducedMotion: this.reducedMotion,
            showControls: loadStorage('platformer_showControls', '1') === '1'
        };

        this.audio.setSfxEnabled(this.settings.sfx);
        this.audio.setMusicEnabled(this.settings.music);
        this.audio.setSfxVolume(this.settings.sfxVolume);
        this.audio.setMusicVolume(this.settings.musicVolume);

        this._bindResize();
        this._bindInput();
        this._bindVisibility();
    }

    /* ==========================================================================
     *  Settings
     * ======================================================================== */

    Engine.prototype.getSettings = function () {
        return {
            sfx: this.settings.sfx,
            music: this.settings.music,
            sfxVolume: this.settings.sfxVolume,
            musicVolume: this.settings.musicVolume,
            reducedMotion: this.settings.reducedMotion,
            showControls: this.settings.showControls
        };
    };

    Engine.prototype.applySettings = function (next) {
        var s = next || {};
        if (typeof s.sfx === 'boolean') this.settings.sfx = s.sfx;
        if (typeof s.music === 'boolean') this.settings.music = s.music;
        if (typeof s.sfxVolume === 'number') this.settings.sfxVolume = clamp(s.sfxVolume, 0, 1);
        if (typeof s.musicVolume === 'number') this.settings.musicVolume = clamp(s.musicVolume, 0, 1);
        if (typeof s.reducedMotion === 'boolean') this.settings.reducedMotion = s.reducedMotion;
        if (typeof s.showControls === 'boolean') this.settings.showControls = s.showControls;

        this.reducedMotion = this.settings.reducedMotion;
        this.audio.setSfxEnabled(this.settings.sfx);
        this.audio.setMusicEnabled(this.settings.music);
        this.audio.setSfxVolume(this.settings.sfxVolume);
        this.audio.setMusicVolume(this.settings.musicVolume);

        saveStorage('platformer_sfx', this.settings.sfx ? '1' : '0');
        saveStorage('platformer_music', this.settings.music ? '1' : '0');
        saveStorage('platformer_sfxVolume', String(this.settings.sfxVolume));
        saveStorage('platformer_musicVolume', String(this.settings.musicVolume));
        saveStorage('platformer_reducedMotion', this.settings.reducedMotion ? '1' : '0');
        saveStorage('platformer_showControls', this.settings.showControls ? '1' : '0');
    };

    Engine.prototype.resetSettings = function () {
        this.applySettings({
            sfx: true,
            music: true,
            sfxVolume: 0.8,
            musicVolume: 0.6,
            reducedMotion: false,
            showControls: true
        });
    };

    /* ==========================================================================
     *  Input
     * ======================================================================== */

    Engine.prototype._bindResize = function () {
        var self = this;
        this._onResize = function () { self.resize(); };
        global.addEventListener('resize', this._onResize);
    };

    Engine.prototype.resize = function () {
        if (!this.canvas) return;
        var w = global.innerWidth || this.canvas.clientWidth || this.canvas.width;
        var h = global.innerHeight || this.canvas.clientHeight || this.canvas.height;
        this.canvas.width = w;
        this.canvas.height = h;
        this.viewport.x = w;
        this.viewport.y = h;
        /* Recenter the camera so the player stays visible on resize orientation changes. */
        this._centerCameraOnPlayer(true);
    };

    Engine.prototype._bindInput = function () {
        var self = this;
        this._onKeyDown = function (e) { self.keydown(e); };
        this._onKeyUp = function (e) { self.keyup(e); };
        global.addEventListener('keydown', this._onKeyDown);
        global.addEventListener('keyup', this._onKeyUp);
    };

    Engine.prototype._bindVisibility = function () {
        var self = this;
        if (typeof document === 'undefined' || !document.addEventListener) return;
        this._onVisibility = function () {
            if (document.hidden && self.state === 'play') self.togglePause();
        };
        document.addEventListener('visibilitychange', this._onVisibility);
    };

    var KEYMAP = {
        32: 'jump', 38: 'jump', 87: 'jump',
        37: 'left', 65: 'left',
        39: 'right', 68: 'right',
        40: 'down', 83: 'down'
    };

    Engine.prototype.keydown = function (e) {
        if (this.uiModal) return;
        var action = KEYMAP[e.keyCode] || KEYMAP[e.which];
        if (!action) return;
        if (e.cancelable !== false && e.preventDefault) e.preventDefault();
        this._setInput(action, true);
        if (this.state === 'menu') this.begin();
        if (e.keyCode === 27 && (this.state === 'play' || this.state === 'paused')) this.togglePause();
    };

    Engine.prototype.keyup = function (e) {
        var action = KEYMAP[e.keyCode] || KEYMAP[e.which];
        if (!action) return;
        if (e.cancelable !== false && e.preventDefault) e.preventDefault();
        this._setInput(action, false);
    };

    Engine.prototype._setInput = function (action, pressed) {
        if (action === 'jump') {
            if (pressed && !this.input.jump) this.player.jumpBuffer = 0.12;
            this.input.jump = pressed;
        } else if (action === 'left') {
            this.input.left = pressed;
        } else if (action === 'right') {
            this.input.right = pressed;
        }
    };

    /* Public API for DOM buttons / on-screen controls. */
    Engine.prototype.setMove = function (dir, pressed) {
        this._setInput(dir, pressed);
    };

    Engine.prototype._updateGamepad = function () {
        var nav = global.navigator;
        if (!nav || typeof nav.getGamepads !== 'function') return;
        var pads = nav.getGamepads();
        if (!pads || !pads.length) return;
        var pad = pads[0] || pads[1] || null;
        if (!pad || !pad.connected) return;

        var left = false, right = false, jump = false;
        var ax = pad.axes && pad.axes.length ? pad.axes[0] : 0;
        if (ax < -0.5 || (pad.buttons[14] && pad.buttons[14].pressed)) left = true;
        if (ax > 0.5 || (pad.buttons[15] && pad.buttons[15].pressed)) right = true;
        if ((pad.buttons[0] && pad.buttons[0].pressed) ||
            (pad.buttons[1] && pad.buttons[1].pressed) ||
            (pad.buttons[3] && pad.buttons[3].pressed)) {
            jump = true;
        }
        if (left !== this.input.left) this.input.left = left;
        if (right !== this.input.right) this.input.right = right;
        if (jump && !this.input.jump) this.player.jumpBuffer = 0.12;
        this.input.jump = jump;

        if (pad.buttons[9] && pad.buttons[9].pressed && this._gamepadIndex !== 99) {
            this._gamepadIndex = 99;
            this.togglePause();
        } else if (!(pad.buttons[9] && pad.buttons[9].pressed)) {
            this._gamepadIndex = null;
        }
    };

    /* ==========================================================================
     *  Level loading
     * ======================================================================== */

    Engine.prototype.load_map = function (map) {
        if (!map || !map.data || !map.keys) {
            this._log('Error: Invalid map data!');
            return false;
        }

        this.map = map;
        this.tile_size = map.tile_size || 16;

        var keyById = {};
        map.keys.forEach(function (k) { keyById[k.id] = k; });

        var self = this;
        this.grid = map.data.map(function (row, y) {
            return row.map(function (cell, x) {
                var id = (typeof cell === 'object') ? cell.id : cell;
                return keyById[id] || { id: id, type: 'empty' };
            });
        });

        this.mapWidth = this.grid.length ? this.grid[0].length * this.tile_size : 0;
        this.mapHeight = this.grid.length * this.tile_size;

        /* Physical constants with per-field fallbacks. */
        var grav = map.gravity || {};
        this.gravity = { x: typeof grav.x === 'number' ? grav.x : 0, y: typeof grav.y === 'number' ? grav.y : 0.25 };
        var vl = map.vel_limit || {};
        this.velLimit = { x: typeof vl.x === 'number' ? vl.x : 3, y: typeof vl.y === 'number' ? vl.y : 13 };
        var mp = map.movement_speed || {};
        this.moveSpeed = {
            jump: typeof mp.jump === 'number' ? mp.jump : 6.5,
            left: typeof mp.left === 'number' ? mp.left : 0.4,
            right: typeof mp.right === 'number' ? mp.right : 0.4,
            air: typeof mp.air === 'number' ? mp.air : 0.35
        };

        this.coins = [];
        this.hearts = [];
        this.stars = [];
        this.enemies = [];
        this.checkpoints = [];
        this.platforms = [];
        this.goal = null;
        this._startSpot = null;

        this.score = 0;
        this.coinsCollected = 0;
        this.coinsTotal = 0;
        this.heartsCollected = 0;
        this.heartsTotal = 0;
        this.starsCollected = 0;
        this.starsTotal = 0;
        this.lives = map.lives || 3;
        this.maxLives = map.max_lives || 5;
        this.timePlayed = 0;

        this._scanEntities();
        this._buildBackground();
        this._buildStaticLayer();

        var sx, sy;
        map.player = map.player || {};
        sx = (typeof map.player.x === 'number') ? map.player.x : (this._startSpot ? this._startSpot.x : 2);
        sy = (typeof map.player.y === 'number') ? map.player.y : (this._startSpot ? this._startSpot.y : 2);
        this.player.colour = map.player.colour || '#3D5AFE';
        this.player.w = this.tile_size * 0.7;
        this.player.h = this.tile_size * 0.9;
        this.spawnPlayer(sx * this.tile_size, sy * this.tile_size);
        this.respawn = { x: this.player.x, y: this.player.y };

        this._pushHud();
        this._refreshBestHud();
        this._log('Successfully loaded map "' + (map.name || 'unnamed') + '".');
        return true;
    };

    Engine.prototype._scanEntities = function () {
        var tl = this.tile_size;
        for (var y = 0; y < this.grid.length; y++) {
            for (var x = 0; x < this.grid[y].length; x++) {
                var tile = this.grid[y][x];
                var px = x * tl, py = y * tl;
                switch (tile.type) {
                    case 'start':
                        this._startSpot = { x: x, y: y };
                        this.grid[y][x] = { id: tile.id, type: 'empty' };
                        break;
                    case 'coin':
                        this.coins.push({ x: px, y: py, collected: false, spin: Math.random() * TAU });
                        this.coinsTotal++;
                        this.grid[y][x] = { id: tile.id, type: 'empty' };
                        break;
                    case 'heart':
                        this.hearts.push({ x: px, y: py, collected: false, spin: Math.random() * TAU });
                        this.heartsTotal++;
                        this.grid[y][x] = { id: tile.id, type: 'empty' };
                        break;
                    case 'star':
                        this.stars.push({ x: px, y: py, collected: false, spin: Math.random() * TAU });
                        this.starsTotal++;
                        this.grid[y][x] = { id: tile.id, type: 'empty' };
                        break;
                    case 'checkpoint':
                        this.checkpoints.push({ x: px, y: py, active: false, topY: py });
                        this.grid[y][x] = { id: tile.id, type: 'empty' };
                        break;
                    case 'goal':
                        this.goal = { x: px, y: py };
                        this.grid[y][x] = { id: tile.id, type: 'empty' };
                        break;
                    case 'enemy':
                        this.enemies.push({
                            x: px, y: py, w: tl, h: tl,
                            dir: (tile.dir || 1),
                            range: (tile.range || 3) * tl,
                            speed: (tile.speed || 28),
                            startX: px,
                            dead: false,
                            squash: 1,
                            type: tile.enemyType || 'walker'
                        });
                        this.grid[y][x] = { id: tile.id, type: 'empty' };
                        break;
                    case 'moving':
                        this.platforms.push({
                            x: px, y: py,
                            w: (tile.width || 1) * tl,
                            h: tl,
                            baseX: px,
                            baseY: py,
                            axis: tile.axis === 'y' ? 'y' : 'x',
                            range: (tile.range || 3) * tl,
                            speed: (tile.speed || 40),
                            dir: (tile.dir < 0 ? -1 : 1),
                            dx: 0, dy: 0,
                            prevX: px, prevY: py,
                            moving: true,
                            colour: tile.fill || '#8c9eff'
                        });
                        this.grid[y][x] = { id: tile.id, type: 'empty' };
                        break;
                }
            }
        }
    };

    Engine.prototype._buildBackground = function () {
        var rng = function (i) { return hash2(i, 7); };
        this.bg = { clouds: [], hills: [], bushes: [] };
        for (var i = 0; i < 14; i++) {
            this.bg.clouds.push({
                x: i * 90 + rng(i) * 60,
                y: 40 + rng(i + 40) * 80,
                s: 0.7 + rng(i + 90) * 0.8
            });
        }
        for (var j = 0; j < 8; j++) {
            this.bg.hills.push({
                x: j * 130 + rng(j + 20) * 40,
                r: 60 + rng(j + 60) * 120
            });
        }
        for (var k = 0; k < 20; k++) {
            this.bg.bushes.push({
                x: k * 60 + rng(k + 120) * 30,
                y: 0, s: 0.6 + rng(k + 160) * 0.7
            });
        }
    };

    Engine.prototype._buildStaticLayer = function () {
        this.staticLayer = null;
        if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
        try {
            var cnv = document.createElement('canvas');
            if (!cnv || typeof cnv.getContext !== 'function') return;
            var w = this.mapWidth || 1, h = this.mapHeight || 1;
            cnv.width = Math.min(w, 4096);
            cnv.height = Math.min(h, 4096);
            var c = cnv.getContext('2d');
            var tl = this.tile_size;

            for (var y = 0; y < this.grid.length; y++) {
                for (var x = 0; x < this.grid[y].length; x++) {
                    var tile = this.grid[y][x];
                    if (!tile || !tile.type || tile.type === 'empty') continue;
                    this._drawStaticTile(c, x * tl, y * tl, tile, tl);
                }
            }
            if (w > 4096 || h > 4096) {
                this.staticLayer = cnv;
            } else {
                this.staticLayer = cnv;
            }
        } catch (e) {
            this.staticLayer = null;
        }
    };

    Engine.prototype.spawnPlayer = function (x, y) {
        var p = this.player;
        p.x = x;
        p.y = y;
        p.vx = 0;
        p.vy = 0;
        p.alive = true;
        p.invuln = 0;
        p.canJump = true;
        p.coyote = 0;
        p.jumpBuffer = 0;
        p.squash = 1;
        p.dir = 1;
        p.onFloor = false;
        p.groundPlatform = null;
        p._wasInWater = false;
        p._runDustTimer = 0;
        /* Center the camera on the player using the viewport in WORLD pixels
           (the browser window size divided by the world scale). */
        this._centerCameraOnPlayer(true);
    };

    /* ==========================================================================
     *  Tile queries
     * ======================================================================== */

    Engine.prototype.tileAt = function (tx, ty) {
        if (ty < 0 || ty >= this.grid.length || tx < 0 || tx >= this.grid[0].length) {
            return (ty >= this.grid.length)
                ? { type: 'solid', solid: true, id: -1 }
                : { id: -1, type: 'empty' };
        }
        return this.grid[ty][tx];
    };

    Engine.prototype.tileAtPx = function (px, py) {
        return this.tileAt(Math.floor(px / this.tile_size), Math.floor(py / this.tile_size));
    };

    Engine.prototype.isSolid = function (tile) {
        return tile && (tile.solid === 1 || tile.solid === true || tile.type === 'solid' || tile.type === 'spring');
    };

    Engine.prototype._tileSolid = function (tx, ty) { return this.isSolid(this.tileAt(tx, ty)); };

    /* ==========================================================================
     *  Game state helpers
     * ======================================================================== */

    Engine.prototype.begin = function () {
        if (this.state !== 'menu') return;
        if (!this.map) {
            this._toast('Loading level...');
            return;
        }
        this.load_map(this.map);
        this.state = 'play';
        this.audio.ensure();
        this.audio.startMusic();
        this._hide('start-screen');
        this._popHud('score');
        this._toast('Go!');
    };

    Engine.prototype.togglePause = function () {
        if (this.state === 'play') {
            this.state = 'paused';
            this._show('pause-screen');
            this.audio.stopMusic();
        } else if (this.state === 'paused') {
            this.resumeGame();
        }
    };

    Engine.prototype.resumeGame = function () {
        if (this.state === 'paused') {
            this.state = 'play';
            this._hide('pause-screen');
            this.audio.startMusic();
        }
    };

    Engine.prototype.restart = function () {
        this.state = 'play';
        this._hideAllOverlays();
        this.load_map(this.map);
        this.audio.ensure();
        this.audio.startMusic();
    };

    Engine.prototype.resetToCheckpoint = function () {
        this.spawnPlayer(this.respawn.x, this.respawn.y);
        this.player.invuln = 1.2;
        this.state = 'play';
        this.audio.startMusic();
    };

    Engine.prototype.goToMenu = function () {
        this.state = 'menu';
        this._hideAllOverlays();
        this._show('start-screen');
        this.audio.stopMusic();
    };

    /* ==========================================================================
     *  Level events
     * ======================================================================== */

    Engine.prototype._die = function (cause) {
        if (this.state !== 'play') return;
        this.state = 'lost';
        this.player.alive = false;
        this.audio.death();
        this._shake(0.5, 9);
        this._burst(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, {
            count: 28, colour: '#ff5a5a', speedMin: 2, speedMax: 6, life: 0.7, gravity: 0.1
        });
        this.lives--;
        this._pushHud();
        this._respawnTimer = 1.1;
    };

    Engine.prototype._win = function () {
        if (this.state !== 'play') return;
        this.state = 'won';
        this.score += 500;
        this.audio.win();
        this._confetti();
        this._float(this.player.x + this.player.w / 2, this.player.y - 20, '+500 BONUS', '#ffd54a');
        if (this.score > this.maxScore) {
            this.maxScore = this.score;
            saveStorage('platformer_maxScore', String(this.maxScore));
            this._toast('New best score!');
        }
        this._refreshBestHud();
        this._show('win-screen');
        this._countUp('win-score', Math.max(0, this.score - 500), this.score);
        this._fill('win-coins', this.coinsCollected + ' / ' + this.coinsTotal);
        this._fill('win-time', formatTime(this.timePlayed));
        this._fill('win-best', String(this.maxScore));
        this._pushHud();
        this.audio.stopMusic();
    };

    Engine.prototype._collectCoin = function (coin) {
        coin.collected = true;
        this.coinsCollected++;
        this.score += 100;
        this.audio.coin();
        this._burst(coin.x + this.tile_size / 2, coin.y + this.tile_size / 2, {
            count: 10, colour: '#ffd54a', speedMin: 1, speedMax: 3, life: 0.5, gravity: 0.05
        });
        this._float(coin.x + this.tile_size / 2, coin.y - 4, '+100', '#ffd54a');
        this._popHud('coins');
        this._popHud('score');
    };

    Engine.prototype._collectHeart = function (heart) {
        heart.collected = true;
        this.heartsCollected++;
        if (this.lives < this.maxLives) {
            this.lives++;
            this._float(heart.x + this.tile_size / 2, heart.y - 4, '+1 LIFE', '#ff6b8a');
        } else {
            this.score += 250;
            this._float(heart.x + this.tile_size / 2, heart.y - 4, '+250', '#ff6b8a');
        }
        this.audio.heart();
        this._burst(heart.x + this.tile_size / 2, heart.y + this.tile_size / 2, {
            count: 12, colour: '#ff6b8a', speedMin: 1, speedMax: 3.5, life: 0.6, gravity: 0.02
        });
        this._popHud('lives');
        this._popHud('score');
    };

    Engine.prototype._collectStar = function (star) {
        star.collected = true;
        this.starsCollected++;
        this.score += 500;
        this.audio.star();
        this._burst(star.x + this.tile_size / 2, star.y + this.tile_size / 2, {
            count: 20, colour: '#fff59d', speedMin: 2, speedMax: 5, life: 0.8, gravity: 0.03
        });
        this._float(star.x + this.tile_size / 2, star.y - 4, '+500', '#fff176');
        this._popHud('score');
    };

    Engine.prototype._activateCheckpoint = function (cp) {
        cp.active = true;
        this.respawn.x = cp.x;
        this.respawn.y = cp.y;
        this.audio.checkpoint();
        this._toast('Checkpoint!');
        this._burst(cp.x + this.tile_size / 2, cp.y, {
            count: 12, colour: '#4bdc8a', speedMin: 1, speedMax: 3, life: 0.5, gravity: -0.05
        });
    };

    Engine.prototype._stompEnemy = function (enemy) {
        var idx = this.enemies.indexOf(enemy);
        if (idx !== -1) this.enemies.splice(idx, 1);
        this.player.vy = -this.moveSpeed.jump * 0.55;
        this.score += 250;
        this.audio.stomp();
        this._burst(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, {
            count: 16, colour: '#9b6bff', speedMin: 1.5, speedMax: 4, life: 0.6, gravity: 0.12
        });
        this._float(enemy.x + enemy.w / 2, enemy.y - 4, '+250', '#c39bff');
        this._popHud('score');
    };

    /* ==========================================================================
     *  Toast / screen helpers
     * ======================================================================== */

    Engine.prototype._toast = function (msg) {
        var el = this._q('#toast');
        if (!el) return;
        el.textContent = msg;
        el.classList.remove('show');
        void el.offsetWidth;
        el.classList.add('show');
        this._toastTimer = 1.6;
    };

    Engine.prototype._q = function (sel) {
        return typeof document !== 'undefined' ? document.querySelector(sel) : null;
    };

    Engine.prototype._show = function (id) {
        if (typeof document === 'undefined') return;
        var el = document.getElementById(id);
        if (el) { el.classList.remove('hidden'); el.classList.add('visible'); }
    };

    Engine.prototype._hide = function (id) {
        if (typeof document === 'undefined') return;
        var el = document.getElementById(id);
        if (el) { el.classList.remove('visible'); el.classList.add('hidden'); }
    };

    Engine.prototype._fill = function (id, text) {
        if (typeof document === 'undefined') return;
        var el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    Engine.prototype._hideAllOverlays = function () {
        ['start-screen', 'pause-screen', 'win-screen', 'gameover-screen', 'settings-screen'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) { el.classList.remove('visible'); el.classList.add('hidden'); }
        });
    };

    Engine.prototype._popHud = function (which) {
        var sel = which === 'score' ? '#score' : which === 'coins' ? '#coins' : which === 'lives' ? '#lives' : null;
        if (!sel) return;
        var el = this._q(sel);
        if (!el) return;
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
    };

    Engine.prototype._pushHud = function () {
        this._fill('score', String(this.score));
        this._fill('coins', this.coinsCollected + ' / ' + this.coinsTotal);
        this._fill('lives', String(this.lives));
        this._fill('stars', this.starsCollected + ' / ' + this.starsTotal);
    };

    Engine.prototype._refreshBestHud = function () {
        this._fill('best', String(this.maxScore));
        var el = document.getElementById('best-chip');
        if (el) el.style.display = this.maxScore > 0 ? 'flex' : 'none';
    };

    /* World-space floating score popups. */
    Engine.prototype._float = function (x, y, text, colour) {
        if (!text) return;
        this.floaters.push({
            x: x, y: y,
            text: text,
            life: 1,
            maxLife: 1,
            colour: colour || '#ffffff'
        });
    };

    Engine.prototype._updateFloaters = function (dt) {
        for (var i = this.floaters.length - 1; i >= 0; i--) {
            var f = this.floaters[i];
            f.y -= 32 * (dt || 1 / 60);
            f.x += Math.sin((1 - f.life) * 8) * 0.2;
            f.life -= (dt || 1 / 60) * 0.9;
            if (f.life <= 0) this.floaters.splice(i, 1);
        }
    };

    Engine.prototype._drawFloaters = function (ctx) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (var i = 0; i < this.floaters.length; i++) {
            var f = this.floaters[i];
            var lr = clamp(f.life / f.maxLife, 0, 1);
            ctx.globalAlpha = lr;
            ctx.font = 'bold ' + Math.round(this.tile_size * 0.9) + 'px sans-serif';
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(0,0,0,0.55)';
            ctx.strokeText(f.text, f.x, f.y);
            ctx.fillStyle = f.colour;
            ctx.fillText(f.text, f.x, f.y);
        }
        ctx.globalAlpha = 1;
    };

    /* ==========================================================================
     *  Physics
     * ======================================================================== */

    Engine.prototype.update = function (dt) {
        var step = dt || 1 / 60;
        this.dt = step;

        if (this.shake.t > 0) this.shake.t -= step;
        if (this._toastTimer > 0) {
            this._toastTimer -= step;
            if (this._toastTimer <= 0) {
                var toast = this._q('#toast');
                if (toast) toast.classList.remove('show');
            }
        }

        this._updateTweens(step);
        this.particles.update(step);
        this._updateFloaters(step);
        this._updateGamepad();

        if (this.state === 'play') {
            this.timePlayed += step;
            if (this.player.jumpBuffer > 0) this.player.jumpBuffer -= step;
            if (this.player.coyote > 0) this.player.coyote -= step;
            if (this.player.invuln > 0) this.player.invuln -= step;

            this._updateWater();
            this._updatePlatforms();
            this._carryPlayerOnPlatform();
            this._updatePlayer();
            this._updateEnemies();
            this._updateCollisions();
            this._updateCamera();
            this._updateTimerHud();
        } else if (this.state === 'lost') {
            this._respawnTimer -= step;
            if (this._respawnTimer <= 0) {
                if (this.lives <= 0) {
                    this.state = 'gameover';
                    this.audio.stopMusic();
                    this._show('gameover-screen');
                    this._countUp('final-score', 0, this.score);
                    this._fill('final-coins', this.coinsCollected + ' / ' + this.coinsTotal);
                } else {
                    this.resetToCheckpoint();
                }
            }
        }
    };

    Engine.prototype._updateWater = function () {
        var feet = this.player.y + this.player.h;
        var t = this.tileAtPx(this.player.x + this.player.w / 2, feet + 1);
        this.player.inWater = t && t.type === 'water';
        if (this.player.inWater && !this.player._wasInWater) {
            this.audio.splish();
            this._burst(this.player.x + this.player.w / 2, feet, {
                count: 14, colour: '#7adcf2', speedMin: 1, speedMax: 4, life: 0.5, gravity: 0.02
            });
        }
        this.player._wasInWater = this.player.inWater;
    };

    Engine.prototype._updatePlatforms = function () {
        for (var i = 0; i < this.platforms.length; i++) {
            var pl = this.platforms[i];
            pl.prevX = pl.x;
            pl.prevY = pl.y;
            var d = pl.speed * this.dt;
            if (pl.axis === 'y') {
                pl.y += pl.dir * d;
                if (pl.y > pl.baseY + pl.range) { pl.dir = -1; pl.y = pl.baseY + pl.range; }
                if (pl.y < pl.baseY - pl.range) { pl.dir = 1; pl.y = pl.baseY - pl.range; }
            } else {
                pl.x += pl.dir * d;
                if (pl.x > pl.baseX + pl.range) { pl.dir = -1; pl.x = pl.baseX + pl.range; }
                if (pl.x < pl.baseX - pl.range) { pl.dir = 1; pl.x = pl.baseX - pl.range; }
            }
            pl.dx = pl.x - pl.prevX;
            pl.dy = pl.y - pl.prevY;
        }
    };

    Engine.prototype._carryPlayerOnPlatform = function () {
        var p = this.player;
        if (p.onFloor && p.groundPlatform) {
            p.x += p.groundPlatform.dx || 0;
            p.y += p.groundPlatform.dy || 0;
        }
    };

    Engine.prototype._updatePlayer = function () {
        var p = this.player;
        var mp = this.moveSpeed;
        var vl = this.velLimit;
        var input = this.input;

        var ax = 0;
        if (input.left) { ax -= mp.left; p.dir = -1; }
        if (input.right) { ax += mp.right; p.dir = 1; }

        if (ax !== 0) {
            if (p.onFloor) p.vx += ax;
            else p.vx += ax * (mp.air || 0.35);
            p.vx = clamp(p.vx, -vl.x, vl.x);
        } else {
            var fric = p.onFloor ? 0.82 : 0.95;
            p.vx *= fric;
            if (Math.abs(p.vx) < 0.05) p.vx = 0;
        }

        var grounded = (p.onFloor && p.vy >= 0) || p.coyote > 0;
        if (p.jumpBuffer > 0 && grounded && p.vy >= -0.01) {
            p.vy = -mp.jump;
            p.coyote = 0;
            p.jumpBuffer = 0;
            p.groundPlatform = null;
            p.squash = 1.3;
            this.audio.jump();
            this._burst(p.x + p.w / 2, p.y + p.h, {
                count: 8, colour: 'rgba(255,255,255,0.7)', speedMin: 0.5, speedMax: 2, life: 0.3, gravity: -0.01
            });
        }

        var g = this.gravity.y;
        if (p.inWater) g *= 0.4;
        else if (input.jump && p.vy < 0) g *= 0.5;
        p.vy += g;
        p.vy = clamp(p.vy, -vl.y, vl.y);

        var wasGrounded = p.onFloor;
        p.onFloor = false;
        p._runDustTimer -= this.dt;

        this._moveX();
        var landed = this._moveY(wasGrounded);

        /* Run dust while moving quickly along the ground. */
        if (p.onFloor && Math.abs(p.vx) > 1 && p._runDustTimer <= 0 && !this.reducedMotion) {
            p._runDustTimer = 0.18;
            this._burst(p.x + p.w / 2 - p.dir * 4, p.y + p.h, {
                count: 2, colour: 'rgba(230,245,255,0.45)', speedMin: 0.2, speedMax: 0.8,
                life: 0.25, gravity: -0.02, angle: Math.PI / 2 + (p.dir < 0 ? 0.4 : -0.4), spread: 0.3
            });
        }

        if (landed && p.squash <= 1) {
            p.squash = 0.7;
            this._burst(p.x + p.w / 2, p.y + p.h, {
                count: 6, colour: 'rgba(255,255,255,0.6)', speedMin: 0.5, speedMax: 2, life: 0.3, gravity: -0.02
            });
        }

        p.x = clamp(p.x, 0, Math.max(0, this.mapWidth - p.w));
        p.y = clamp(p.y, -this.tile_size, Math.max(0, this.mapHeight - p.h));
    };

    Engine.prototype._moveX = function () {
        var p = this.player, tl = this.tile_size;
        p.x += p.vx;
        var minY = Math.floor(p.y / tl), maxY = Math.floor((p.y + p.h - 0.001) / tl);

        if (p.vx > 0) {
            var tx = Math.floor((p.x + p.w) / tl);
            for (var ty = minY; ty <= maxY; ty++) {
                if (this._tileSolid(tx, ty)) {
                    p.x = tx * tl - p.w;
                    p.vx = 0;
                    break;
                }
            }
        } else if (p.vx < 0) {
            var tx2 = Math.floor(p.x / tl);
            for (var ty2 = minY; ty2 <= maxY; ty2++) {
                if (this._tileSolid(tx2, ty2)) {
                    p.x = (tx2 + 1) * tl;
                    p.vx = 0;
                    break;
                }
            }
        }

        /* Moving platforms: only collide when the player is not already riding them. */
        if (p.vx !== 0) {
            for (var i = 0; i < this.platforms.length; i++) {
                var pl = this.platforms[i];
                if (p.onFloor && p.groundPlatform === pl) continue;
                if (!this._overlap(p.x, p.y, p.w, p.h, pl.x, pl.y, pl.w, pl.h)) continue;
                if (p.vx > 0) {
                    p.x = pl.x - p.w;
                } else if (p.vx < 0) {
                    p.x = pl.x + pl.w;
                }
                p.vx = 0;
                break;
            }
        }
    };

    Engine.prototype._moveY = function (wasGrounded) {
        var p = this.player, tl = this.tile_size;
        var oldBottom = p.y + p.h;
        var oldTop = p.y;
        var landed = false;
        p.groundPlatform = null;
        p.y += p.vy;
        var minX = Math.floor(p.x / tl), maxX = Math.floor((p.x + p.w - 0.001) / tl);

        if (p.vy >= 0) {
            var ty = Math.floor((p.y + p.h) / tl);
            for (var tx = minX; tx <= maxX; tx++) {
                var tile = this.tileAt(tx, ty);
                if (this.isSolid(tile)) {
                    p.y = ty * tl - p.h;
                    if (!wasGrounded) landed = true;
                    p.onFloor = true;
                    p.canJump = true;
                    if (tile.type === 'spring') {
                        p.vy = -(tile.bounce || this.moveSpeed.jump * 1.4);
                        p.onFloor = false;
                        p.groundPlatform = null;
                        p.coyote = 0;
                        p.squash = 1.35;
                        this.audio.spring();
                        this._burst(p.x + p.w / 2, p.y + p.h, {
                            count: 12, colour: '#d18cff', speedMin: 1, speedMax: 4, life: 0.4, gravity: 0.02
                        });
                        return false;
                    }
                    p.vy = 0;
                    p.groundPlatform = null;
                    p.coyote = 0.1;
                    return landed;
                }
            }

            for (var i = 0; i < this.platforms.length; i++) {
                var pl = this.platforms[i];
                var overlapX = (p.x + p.w > pl.x) && (p.x < pl.x + pl.w);
                if (!overlapX) continue;
                if (oldBottom <= pl.y + 1 && p.y + p.h >= pl.y) {
                    p.y = pl.y - p.h;
                    p.vy = 0;
                    p.onFloor = true;
                    p.canJump = true;
                    p.groundPlatform = pl;
                    if (!wasGrounded) landed = true;
                    p.coyote = 0.1;
                    return landed;
                }
            }
        } else {
            var ty2 = Math.floor(p.y / tl);
            for (var tx2 = minX; tx2 <= maxX; tx2++) {
                if (this._tileSolid(tx2, ty2)) {
                    p.y = (ty2 + 1) * tl;
                    p.vy = 0;
                    break;
                }
            }

            if (p.vy < 0) {
                for (var j = 0; j < this.platforms.length; j++) {
                    var pl2 = this.platforms[j];
                    var overlapX2 = (p.x + p.w > pl2.x) && (p.x < pl2.x + pl2.w);
                    if (!overlapX2) continue;
                    if (oldTop >= pl2.y + pl2.h && p.y <= pl2.y + pl2.h) {
                        p.y = pl2.y + pl2.h;
                        p.vy = 0;
                        break;
                    }
                }
            }
        }

        if (p.onFloor) p.coyote = 0.1;
        return landed;
    };

    Engine.prototype._updateEnemies = function () {
        for (var i = 0; i < this.enemies.length; i++) {
            var e = this.enemies[i];
            e.x += e.dir * e.speed * this.dt;
            if (e.x > e.startX + e.range) { e.dir = -1; e.x = e.startX + e.range; }
            if (e.x < e.startX - e.range) { e.dir = 1; e.x = e.startX - e.range; }
            e.squash = lerp(e.squash, 1, 0.2);
        }
    };

    Engine.prototype._updateCollisions = function () {
        if (!this.player.alive) return;
        this._handleEnemyInteractions();
        this._handlePickups();
        this._handleHazards();
        this._handleGoalCheckpoint();
    };

    Engine.prototype._handleEnemyInteractions = function () {
        var p = this.player;
        for (var i = this.enemies.length - 1; i >= 0; i--) {
            var e = this.enemies[i];
            if (!this._overlap(p.x, p.y, p.w, p.h, e.x, e.y, e.w, e.h)) continue;
            if (p.vy > 0.4 && (p.y + p.h) < e.y + e.h * 0.6) {
                this._stompEnemy(e);
            } else if (p.invuln <= 0) {
                this._die('enemy');
            }
        }
    };

    Engine.prototype._handlePickups = function () {
        var p = this.player, tl = this.tile_size;
        var i;

        for (i = 0; i < this.hearts.length; i++) {
            var h = this.hearts[i];
            if (!h.collected && this._overlap(p.x, p.y, p.w, p.h, h.x, h.y, tl, tl)) this._collectHeart(h);
        }
        for (i = 0; i < this.stars.length; i++) {
            var st = this.stars[i];
            if (!st.collected && this._overlap(p.x, p.y, p.w, p.h, st.x, st.y, tl, tl)) this._collectStar(st);
        }
        for (i = 0; i < this.coins.length; i++) {
            var c = this.coins[i];
            if (!c.collected && this._overlap(p.x, p.y, p.w, p.h, c.x, c.y, tl, tl)) this._collectCoin(c);
        }
    };

    Engine.prototype._handleHazards = function () {
        var p = this.player, tl = this.tile_size;
        var minX = Math.floor((p.x + 2) / tl), maxX = Math.floor((p.x + p.w - 2) / tl);
        var minY = Math.floor((p.y + 2) / tl), maxY = Math.floor((p.y + p.h - 2) / tl);
        for (var ty = minY; ty <= maxY; ty++) {
            for (var tx = minX; tx <= maxX; tx++) {
                var tile = this.tileAt(tx, ty);
                if (tile.type === 'hazard' && p.invuln <= 0) {
                    this._die('hazard');
                    return;
                }
            }
        }
    };

    Engine.prototype._handleGoalCheckpoint = function () {
        var p = this.player, tl = this.tile_size;
        if (this.goal &&
            this._overlap(p.x, p.y, p.w, p.h,
                this.goal.x + tl / 2 - 3, this.goal.y - 2 * tl, 6, 3 * tl)) {
            this._win();
            return;
        }
        for (var i = 0; i < this.checkpoints.length; i++) {
            var cp = this.checkpoints[i];
            if (!cp.active &&
                this._overlap(p.x, p.y, p.w, p.h,
                    cp.x + tl / 2 - 3, cp.y - 2 * tl, 6, 3 * tl)) {
                this._activateCheckpoint(cp);
            }
        }
    };

    Engine.prototype._overlap = function (ax, ay, aw, ah, bx, by, bw, bh) {
        return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    };

    /* ==========================================================================
     *  Camera
     * ======================================================================== */

    /* Return the camera viewport dimensions in WORLD pixels. The canvas is
       scaled by `_worldScale()`, so the browser window must be divided by that
       scale before it can be used for world-space camera math. */
    Engine.prototype._cameraView = function () {
        var scale = this._worldScale();
        return {
            scale: scale,
            width: this.viewport.x / scale,
            height: this.viewport.y / scale
        };
    };

    /* Compute the world-space camera target that keeps the player centered.
       `snap` teleports the camera immediately (used on spawn/resize); otherwise
       the camera smoothly follows the target. */
    Engine.prototype._centerCameraOnPlayer = function (snap) {
        var p = this.player;
        var view = this._cameraView();
        var look = clamp(p.vx * 8, -40, 40);
        this.lookAhead = snap ? look : lerp(this.lookAhead, look, 0.1);

        var cx = p.x + p.w / 2 - view.width / 2 + this.lookAhead;
        var cy = p.y + p.h / 2 - view.height / 2;

        this.cameraTarget.x = cx;
        this.cameraTarget.y = cy;
        this._clampCamera();

        if (snap) {
            this.camera.x = this.cameraTarget.x;
            this.camera.y = this.cameraTarget.y;
        }
    };

    Engine.prototype._updateCamera = function () {
        this._centerCameraOnPlayer(false);
        this.camera.x = lerp(this.camera.x, this.cameraTarget.x, 0.12);
        this.camera.y = lerp(this.camera.y, this.cameraTarget.y, 0.12);
        this._clampCamera();
    };

    Engine.prototype._clampCamera = function () {
        if (!this.limit_viewport) return;
        if (this.mapWidth === undefined || this.mapHeight === undefined) return;
        var view = this._cameraView();
        var maxX = Math.max(0, this.mapWidth - view.width);
        var maxY = Math.max(0, this.mapHeight - view.height);
        this.cameraTarget.x = clamp(this.cameraTarget.x, 0, maxX);
        this.cameraTarget.y = clamp(this.cameraTarget.y, 0, maxY);
        this.camera.x = clamp(this.camera.x, 0, maxX);
        this.camera.y = clamp(this.camera.y, 0, maxY);
    };

    Engine.prototype._shake = function (dur, mag) {
        if (this.reducedMotion) return;
        this.shake = { t: dur, dur: dur, mag: mag };
    };

    Engine.prototype._worldScale = function () {
        if (!this.canvas || !this.canvas.height) return 1;
        var visibleTilesY = 20;
        var s = this.canvas.height / (visibleTilesY * this.tile_size);
        return clamp(s, 0.6, 5);
    };

    /* ==========================================================================
     *  Tweens
     * ======================================================================== */

    Engine.prototype.tween = function (opts) {
        this.tweens.push({
            obj: opts.obj,
            from: opts.from || {},
            to: opts.to || {},
            dur: opts.duration || 0.3,
            t: 0,
            ease: opts.ease || easeOutCubic,
            onUpdate: opts.onUpdate || null,
            onComplete: opts.onComplete || null
        });
    };

    Engine.prototype._updateTweens = function (step) {
        for (var i = this.tweens.length - 1; i >= 0; i--) {
            var tw = this.tweens[i];
            tw.t += step;
            var p = clamp(tw.t / tw.dur, 0, 1);
            var eased = tw.ease(p);
            if (tw.obj) {
                for (var k in tw.to) {
                    if (k in tw.obj) tw.obj[k] = lerp(tw.from[k], tw.to[k], eased);
                }
            }
            if (tw.onUpdate) tw.onUpdate(tw.obj, eased, p);
            if (p >= 1) {
                this.tweens.splice(i, 1);
                if (tw.onComplete) tw.onComplete();
            }
        }
    };

    Engine.prototype._countUp = function (elId, from, to) {
        if (typeof document === 'undefined') return;
        var el = document.getElementById(elId);
        if (!el) return;
        var holder = { v: from };
        this.tween({
            obj: holder,
            from: { v: from },
            to: { v: to },
            duration: 0.7,
            ease: easeOutCubic,
            onUpdate: function () { el.textContent = String(Math.round(holder.v)); }
        });
    };

    /* ==========================================================================
     *  Rendering
     * ======================================================================== */

    Engine.prototype._getSkyGradient = function (ctx) {
        if (this._skyGradient && this._skyGradientHeight === this.viewport.y) return this._skyGradient;
        var grad = ctx.createLinearGradient(0, 0, 0, this.viewport.y);
        grad.addColorStop(0, '#8fd1ff');
        grad.addColorStop(0.55, '#bfe9ff');
        grad.addColorStop(1, '#e3f6ff');
        this._skyGradient = grad;
        this._skyGradientHeight = this.viewport.y;
        return grad;
    };

    Engine.prototype.draw = function () {
        var ctx = this.ctx;
        if (!ctx) return;
        ctx.clearRect(0, 0, this.viewport.x, this.viewport.y);

        /* Screen-space sky background. */
        ctx.fillStyle = this._getSkyGradient(ctx);
        ctx.fillRect(0, 0, this.viewport.x, this.viewport.y);

        var scale = this._worldScale();
        var sx = this.shake.t > 0 ? (Math.random() * 2 - 1) * (this.shake.mag * this.shake.t / this.shake.dur) : 0;
        var sy = this.shake.t > 0 ? (Math.random() * 2 - 1) * (this.shake.mag * this.shake.t / this.shake.dur) : 0;

        ctx.save();
        ctx.scale(scale, scale);
        ctx.translate(-this.camera.x + sx, -this.camera.y + sy);

        this._drawParallax(ctx);
        this._drawTiles(ctx);
        this._drawWaterAnimation(ctx);
        this._drawMovingPlatforms(ctx);
        this._drawCoins(ctx);
        this._drawHearts(ctx);
        this._drawStars(ctx);
        this._drawCheckpoints(ctx);
        this._drawGoal(ctx);
        this._drawEnemies(ctx);
        if (this.player.alive && this.state !== 'menu') this._drawPlayer(ctx);
        if (this.player.inWater && this.player.alive) this._drawWaterHighlight(ctx);
        this.particles.draw(ctx);
        this._drawFloaters(ctx);

        ctx.restore();
    };

    Engine.prototype._drawParallax = function (ctx) {
        var scale = this._worldScale();
        var tl = this.tile_size;

        if (!this.bg) return;

        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (var i = 0; i < this.bg.clouds.length; i++) {
            var c = this.bg.clouds[i];
            var cx = c.x + this.camera.x * 0.85;
            var cy = c.y + this.camera.y * 0.85;
            if (cx < this.camera.x - 60 || cx > this.camera.x + this.viewport.x / scale + 60) continue;
            ctx.beginPath();
            ctx.ellipse(cx, cy, 26 * c.s, 12 * c.s, 0, 0, TAU);
            ctx.ellipse(cx + 20 * c.s, cy + 4 * c.s, 18 * c.s, 10 * c.s, 0, 0, TAU);
            ctx.fill();
        }

        for (var j = 0; j < this.bg.hills.length; j++) {
            var h = this.bg.hills[j];
            var hx = h.x + this.camera.x * 0.6;
            var hy = this.mapHeight - 40;
            if (hx + h.r < this.camera.x || hx - h.r > this.camera.x + this.viewport.x / scale) continue;
            ctx.fillStyle = 'rgba(120,200,120,0.30)';
            ctx.beginPath();
            ctx.arc(hx, hy, h.r, Math.PI, 0);
            ctx.fill();
        }

        ctx.fillStyle = 'rgba(70,150,70,0.35)';
        for (var k = 0; k < this.bg.bushes.length; k++) {
            var b = this.bg.bushes[k];
            var bx = b.x + this.camera.x * 0.25;
            var by = this.mapHeight - 20;
            if (bx < this.camera.x - 40 || bx > this.camera.x + this.viewport.x / scale + 40) continue;
            ctx.beginPath();
            ctx.arc(bx, by, 10 * b.s, Math.PI, 0);
            ctx.fill();
        }
    };

    Engine.prototype._drawTiles = function (ctx) {
        var tl = this.tile_size;
        var scale = this._worldScale();
        var startX = Math.floor(this.camera.x / tl) - 1;
        var startY = Math.floor(this.camera.y / tl) - 1;
        var endX = Math.ceil((this.camera.x + this.viewport.x / scale) / tl) + 1;
        var endY = Math.ceil((this.camera.y + this.viewport.y / scale) / tl) + 1;

        if (this.staticLayer) {
            var sx = clamp(startX * tl, 0, this.staticLayer.width);
            var sy = clamp(startY * tl, 0, this.staticLayer.height);
            var ex = clamp(endX * tl, 0, this.staticLayer.width);
            var ey = clamp(endY * tl, 0, this.staticLayer.height);
            if (ex > sx && ey > sy) {
                ctx.drawImage(this.staticLayer, sx, sy, ex - sx, ey - sy, sx, sy, ex - sx, ey - sy);
            }
        } else {
            for (var y = startY; y <= endY; y++) {
                for (var x = startX; x <= endX; x++) {
                    var tile = this.tileAt(x, y);
                    if (!tile || !tile.type || tile.type === 'empty') continue;
                    this._drawLiveTile(ctx, x * tl, y * tl, tile);
                }
            }
        }
    };

    Engine.prototype._drawStaticTile = function (ctx, px, py, tile, tl) {
        switch (tile.type) {
            case 'solid':
                ctx.fillStyle = tile.fill || '#9a9aa3';
                ctx.fillRect(px, py, tl, tl);
                ctx.fillStyle = tile.top || 'rgba(255,255,255,0.25)';
                ctx.fillRect(px, py, tl, 3);
                ctx.fillStyle = 'rgba(0,0,0,0.12)';
                ctx.fillRect(px, py + tl - 2, tl, 2);
                break;
            case 'spring':
                ctx.fillStyle = '#3b2a52';
                ctx.fillRect(px, py + 8, tl, tl - 8);
                ctx.fillStyle = '#d18cff';
                ctx.fillRect(px, py + 4, tl, 5);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(px, py + 3, tl, 2);
                break;
            case 'water':
                ctx.fillStyle = 'rgba(90,180,230,0.45)';
                ctx.fillRect(px, py, tl, tl);
                ctx.fillStyle = 'rgba(255,255,255,0.25)';
                ctx.fillRect(px, py + 2, tl, 2);
                break;
            case 'hazard':
                ctx.fillStyle = '#c95057';
                for (var spike = 0; spike < 4; spike++) {
                    var sx = px + spike * (tl / 4);
                    ctx.beginPath();
                    ctx.moveTo(sx, py + tl);
                    ctx.lineTo(sx + tl / 8, py + 2);
                    ctx.lineTo(sx + tl / 4, py + tl);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.fillRect(px, py + tl - 3, tl, 1);
                break;
            case 'deco':
                ctx.fillStyle = tile.fill || '#6bbf4b';
                ctx.beginPath();
                ctx.arc(px + tl / 2, py + tl * 0.65, tl * 0.3, 0, TAU);
                ctx.fill();
                break;
        }
    };

    Engine.prototype._drawLiveTile = function (ctx, px, py, tile) {
        this._drawStaticTile(ctx, px, py, tile, this.tile_size);
    };

    Engine.prototype._drawWaterAnimation = function (ctx) {
        var tl = this.tile_size;
        var scale = this._worldScale();
        var startX = Math.floor(this.camera.x / tl), startY = Math.floor(this.camera.y / tl);
        var endX = Math.ceil((this.camera.x + this.viewport.x / scale) / tl);
        var endY = Math.ceil((this.camera.y + this.viewport.y / scale) / tl);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        for (var y = startY; y <= endY; y++) {
            for (var x = startX; x <= endX; x++) {
                var tile = this.tileAt(x, y);
                if (tile.type !== 'water') continue;
                var h = hash2(x, y);
                var px = x * tl, py = y * tl;
                var wave = Math.sin(this.timePlayed * 3 + h * 8) * 2;
                ctx.fillRect(px + 2 + wave, py + 4, tl - 6, 1);
                if (h > 0.5) ctx.fillRect(px + 4 - wave, py + 9, tl - 8, 1);
            }
        }
    };

    Engine.prototype._drawMovingPlatforms = function (ctx) {
        var tl = this.tile_size;
        for (var i = 0; i < this.platforms.length; i++) {
            var pl = this.platforms[i];
            ctx.fillStyle = pl.colour || '#8c9eff';
            ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fillRect(pl.x, pl.y, pl.w, 4);
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.fillRect(pl.x, pl.y + pl.h - 2, pl.w, 2);
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillRect(pl.x + pl.w / 2 - 1, pl.y + pl.h / 2 - 3, 2, 6);
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(pl.x, pl.y + pl.h, Math.min(2, pl.w), tl);
            ctx.fillRect(pl.x + pl.w - 2, pl.y + pl.h, Math.min(2, pl.w), tl);
        }
    };

    Engine.prototype._drawCoins = function (ctx) {
        var tl = this.tile_size;
        for (var i = 0; i < this.coins.length; i++) {
            var c = this.coins[i];
            if (c.collected) continue;
            var cx = c.x + tl / 2, cy = c.y + tl / 2;
            var wobble = Math.sin(this.timePlayed * 4 + c.spin) * 0.2;
            var sw = Math.max(0.2, Math.abs(Math.cos(this.timePlayed * 3 + c.spin)));
            ctx.save();
            ctx.translate(cx, cy + wobble);
            ctx.scale(sw, 1);
            ctx.fillStyle = '#ffd54a';
            ctx.beginPath();
            ctx.arc(0, 0, tl * 0.36, 0, TAU);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.beginPath();
            ctx.arc(-tl * 0.1, -tl * 0.1, tl * 0.13, 0, TAU);
            ctx.fill();
            ctx.restore();
        }
    };

    Engine.prototype._drawHearts = function (ctx) {
        var tl = this.tile_size;
        var pulse = 1 + Math.sin(this.timePlayed * 5) * 0.08;
        for (var i = 0; i < this.hearts.length; i++) {
            var h = this.hearts[i];
            if (h.collected) continue;
            var cx = h.x + tl / 2, cy = h.y + tl / 2;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(pulse, pulse);
            ctx.fillStyle = '#ff6b8a';
            ctx.beginPath();
            ctx.moveTo(0, tl * 0.3);
            ctx.bezierCurveTo(-tl * 0.4, -tl * 0.1, -tl * 0.25, -tl * 0.38, 0, -tl * 0.12);
            ctx.bezierCurveTo(tl * 0.25, -tl * 0.38, tl * 0.4, -tl * 0.1, 0, tl * 0.3);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.beginPath();
            ctx.arc(-tl * 0.12, -tl * 0.1, tl * 0.07, 0, TAU);
            ctx.fill();
            ctx.restore();
        }
    };

    Engine.prototype._drawStars = function (ctx) {
        var tl = this.tile_size;
        for (var i = 0; i < this.stars.length; i++) {
            var st = this.stars[i];
            if (st.collected) continue;
            var cx = st.x + tl / 2, cy = st.y + tl / 2 + Math.sin(this.timePlayed * 4 + st.spin) * 2;
            var rot = this.timePlayed * 1.5 + st.spin;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(rot);
            ctx.fillStyle = '#ffd54a';
            ctx.beginPath();
            for (var j = 0; j < 5; j++) {
                var a = -Math.PI / 2 + j * TAU / 5;
                ctx.lineTo(Math.cos(a) * tl * 0.42, Math.sin(a) * tl * 0.42);
                a += TAU / 10;
                ctx.lineTo(Math.cos(a) * tl * 0.18, Math.sin(a) * tl * 0.18);
            }
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.beginPath();
            ctx.arc(0, 0, tl * 0.08, 0, TAU);
            ctx.fill();
            ctx.restore();
        }
    };

    Engine.prototype._drawCheckpoints = function (ctx) {
        var tl = this.tile_size;
        for (var i = 0; i < this.checkpoints.length; i++) {
            var cp = this.checkpoints[i];
            var px = cp.x, py = cp.y;
            ctx.fillStyle = '#6a6a6a';
            ctx.fillRect(px + tl / 2 - 1, py, 2, tl);
            ctx.fillStyle = cp.active ? '#4bdc8a' : '#9aa0a6';
            ctx.beginPath();
            ctx.moveTo(px + tl / 2 + 1, py + 2);
            ctx.lineTo(px + tl, py + 8);
            ctx.lineTo(px + tl / 2 + 1, py + 14);
            ctx.closePath();
            ctx.fill();
        }
    };

    Engine.prototype._drawGoal = function (ctx) {
        if (!this.goal) return;
        var tl = this.tile_size;
        var px = this.goal.x, py = this.goal.y;
        var wave = Math.sin(this.timePlayed * 3) * 2;
        ctx.fillStyle = '#6a6a6a';
        ctx.fillRect(px + tl / 2 - 1, py - tl * 1.5, 2, tl * 2.5);
        ctx.fillStyle = '#ff7043';
        ctx.beginPath();
        ctx.moveTo(px + tl / 2 + 1, py - tl * 1.4);
        ctx.lineTo(px + tl + wave, py - tl * 1.05);
        ctx.lineTo(px + tl / 2 + 1, py - tl * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,112,67,0.25)';
        ctx.beginPath();
        ctx.arc(px + tl / 2, py - tl * 0.8, tl * 0.8 + wave, 0, TAU);
        ctx.fill();
    };

    Engine.prototype._drawEnemies = function (ctx) {
        var tl = this.tile_size;
        for (var i = 0; i < this.enemies.length; i++) {
            var e = this.enemies[i];
            ctx.save();
            ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
            ctx.scale(e.dir * e.squash, e.squash);
            ctx.fillStyle = '#9b6bff';
            ctx.beginPath();
            ctx.ellipse(0, 0, e.w * 0.42, e.h * 0.42, 0, 0, TAU);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath();
            ctx.arc(e.w * 0.15, -e.h * 0.08, e.w * 0.12, 0, TAU);
            ctx.fill();
            ctx.fillStyle = '#222';
            ctx.beginPath();
            ctx.arc(e.w * 0.17, -e.h * 0.08, e.w * 0.05, 0, TAU);
            ctx.fill();
            ctx.fillStyle = '#7a52cc';
            var step = Math.sin(this.timePlayed * 10 + i) * 2;
            ctx.fillRect(-e.w * 0.28, e.h * 0.28, e.w * 0.2, 3 + step);
            ctx.fillRect(e.w * 0.08, e.h * 0.28, e.w * 0.2, 3 - step);
            ctx.restore();
        }
    };

    Engine.prototype._drawPlayer = function (ctx) {
        var p = this.player;
        var tl = this.tile_size;
        if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) return;
        var cx = p.x + p.w / 2;
        var cy = p.y + p.h / 2;
        var stretch = p.squash;
        var sx = 1 / stretch, sy = stretch;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(sx, sy);
        ctx.fillStyle = p.colour;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.w * 0.42, p.h * 0.42, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.ellipse(-p.w * 0.12, -p.h * 0.12, p.w * 0.2, p.h * 0.18, 0, 0, TAU);
        ctx.fill();
        var eo = p.dir * 2.5;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(eo - 2, -1.5, 3, 0, TAU);
        ctx.arc(eo + 2, -1.5, 3, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.arc(eo - 2 + p.dir, -1.5, 1.4, 0, TAU);
        ctx.arc(eo + 2 + p.dir, -1.5, 1.4, 0, TAU);
        ctx.fill();
        ctx.restore();

        p.squash = approach(p.squash, 1, 0.12);
    };

    Engine.prototype._drawWaterHighlight = function (ctx) {
        var p = this.player;
        ctx.fillStyle = 'rgba(90,180,230,0.25)';
        ctx.fillRect(p.x - 2, p.y, p.w + 4, p.h);
    };

    Engine.prototype._updateTimerHud = function () {
        var el = document.getElementById('timer');
        if (el) el.textContent = formatTime(this.timePlayed);
    };

    /* Effects */
    Engine.prototype._burst = function (x, y, opts) {
        if (this.reducedMotion && opts && opts.count > 6) {
            var reduced = {};
            for (var k in opts) reduced[k] = opts[k];
            reduced.count = Math.max(3, Math.floor(opts.count / 3));
            opts = reduced;
        }
        this.particles.spawn(x, y, opts);
    };

    Engine.prototype._confetti = function () {
        if (this.reducedMotion) return;
        var view = this._cameraView();
        for (var i = 0; i < 6; i++) {
            this.particles.spawn(this.camera.x + view.width / 2, this.camera.y + 30, {
                count: 14,
                colour: ['#ff7043', '#ffd54a', '#4bdc8a', '#73c6fa', '#e373fa'][i % 5],
                speedMin: 2, speedMax: 6, life: 1.2, gravity: 0.05, shape: 'rect'
            });
        }
    };

    /* ==========================================================================
     *  Main loop
     * ======================================================================== */

    Engine.prototype.start = function () {
        if (this.running) return;
        this.running = true;
        this.lastTime = performance.now();
        var self = this;
        var LOOP = function (now) {
            var dt = (now - self.lastTime) / 1000;
            self.lastTime = now;
            if (dt > 0.1) dt = 0.1;
            self.accumulator += dt;
            var STEP = 1 / 60;
            while (self.accumulator >= STEP) {
                self.update(STEP);
                self.accumulator -= STEP;
            }
            self.draw();
            self.rafId = global.requestAnimationFrame(LOOP);
        };
        this.rafId = global.requestAnimationFrame(LOOP);
    };

    Engine.prototype.stop = function () {
        this.running = false;
        if (this.rafId && global.cancelAnimationFrame) global.cancelAnimationFrame(this.rafId);
    };

    Engine.prototype._log = function (msg) { if (this.log_info) console.log(msg); };

    /* Legacy compatibility wrappers. */
    Engine.prototype.set_viewport = function (x, y) {
        this.viewport.x = x;
        this.viewport.y = y;
    };

    Engine.prototype.error = function (msg) {
        if (this.alert_errors) alert(msg);
        if (this.log_info) console.log(msg);
    };

    global.Engine = Engine;
})(typeof window !== 'undefined' ? window : this);

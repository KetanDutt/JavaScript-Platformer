/* ============================================================================
 *  Platformer Engine  -  Green Hills
 *  A polished, dependency-free, browser-based platformer engine.
 *
 *  Features
 *  --------
 *  - Fixed-timestep physics (frame-rate independent, reproducible)
 *  - Smooth AABB tile + moving-platform collision (no frame-hack loops)
 *  - Coyote-time + jump-buffering for tight, responsive controls
 *  - Variable jump height (hold to jump higher)
 *  - Water / low-gravity zones with splash and ripple VFX
 *  - Springs, spikes, coins, hearts, stars, checkpoints, goal flag
 *  - Stompable patrolling enemies and moving platforms
 *  - Pit-out death (falling out of the world)
 *  - Gamepad support (polled from the Web Gamepad API) with debounce
 *  - Particle system, world-space score popups, hit rings, ambient effects
 *  - Tween helper, camera shake, smooth follow, reduced-motion support
 *  - Web Audio SFX + optional chiptune music with independent volumes
 *  - Settings with persisted preferences (sound, music, reduced motion,
 *    color-blind mode, on-screen controls, palette, palette size, particle
 *    density)
 *  - Static tile layer pre-rendered to an offscreen canvas (performance)
 *  - In-game HUD, menu / win / pause / game-over screens, toasts, level
 *    intro card, level select, achievements
 *  - Player idle / run / jump / fall animations, blinking eyes, and a soft
 *    trail of dust
 *  - Sun + parallax sky, time-of-day gradient that shifts with score
 *  - Camera with smoothed shake that decays exponentially
 *
 *  Author: Arena.ai Agent Mode - heavily refactored and production-hardened.
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
    function easeOutBack(t) {
        var c1 = 1.70158, c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
    function easeOutElastic(t) {
        if (t === 0 || t === 1) return t;
        var p = 0.3, a = 1;
        return a * Math.pow(2, -10 * t) * Math.sin((t - p / 4) * TAU / p) + 1;
    }

    /* Deterministic pseudo-random for background features so they never flicker. */
    function hash2(x, y) {
        var h = (x * 374761393 + y * 668265263) | 0;
        h = (h ^ (h >> 13)) * 1274126177;
        return ((h ^ (h >> 16)) >>> 0) / 4294967295;
    }
    function hash1(x) { return hash2(x | 0, (x * 2654435761) | 0); }

    function formatTime(t) {
        t = Math.max(0, t | 0);
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

    /* Detect a touch-capable device for input method heuristics. */
    function isTouchDevice() {
        return (('ontouchstart' in global) || (global.navigator && global.navigator.maxTouchPoints > 0));
    }

    /* ============================================================================
     *  Audio (Web Audio, synthesised - zero asset files)
     * ============================================================================ */

    function AudioFX() {
        this.ctx = null;
        this.master = null;
        this.sfxGain = null;
        this.musicGain = null;
        this.duckGain = null;
        this.sfxEnabled = true;
        this.musicEnabled = true;
        this.sfxVolume = 0.8;
        this.musicVolume = 0.6;
        this.musicOn = false;
        this._duckTimer = 0;
        this._musicTimer = null;
        this._nextNoteTime = 0;
        this._noteIndex = 0;
        this._beatIndex = 0;
        this._barIndex = 0;
        this._melody = [659, 784, 880, 784, 659, 587, 523, 587,
                        659, 784, 880, 988, 1047, 988, 880, 784];
        this._bass = [131, 165, 196, 165, 131, 165, 196, 165,
                      196, 165, 131, 165, 196, 165, 131, 165];
        /* A small percussion layer for chiptune groove. */
        this._percPattern = [0, 1, 0, 0, 1, 0, 0, 1];
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

            /* Compressor on the master bus keeps SFX from clipping. */
            try {
                this.duckGain = this.ctx.createGain();
                this.duckGain.gain.value = 1;
                this.duckGain.connect(this.master);
                this.sfxGain.disconnect();
                this.musicGain.disconnect();
                this.sfxGain.connect(this.duckGain);
                this.musicGain.connect(this.duckGain);
            } catch (e) { /* ducking is optional */ }
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return true;
    };

    AudioFX.prototype.refreshGains = function () {
        if (!this.ctx) return;
        if (this.sfxGain) this.sfxGain.gain.value = this.sfxEnabled ? this.sfxVolume : 0;
        if (this.musicGain) this.musicGain.gain.value = this.musicEnabled ? this.musicVolume * 0.9 : 0;
    };

    AudioFX.prototype.duck = function (dur) {
        /* Briefly lower the music so SFX are more audible. */
        if (!this.ctx || !this.musicGain) return;
        var t = this.ctx.currentTime;
        this.musicGain.gain.cancelScheduledValues(t);
        var base = this.musicEnabled ? this.musicVolume * 0.9 : 0;
        this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, t);
        this.musicGain.gain.linearRampToValueAtTime(base * 0.35, t + 0.05);
        this.musicGain.gain.linearRampToValueAtTime(base, t + 0.05 + dur);
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
        this.after(0, function () { self.tone(360, 0.12, 'square', 0.18, 540); });
        this.after(0.05, function () { self.tone(600, 0.10, 'square', 0.10, 600); });
        this.duck(0.18);
    };

    AudioFX.prototype.doubleJump = function () {
        var self = this;
        this.after(0, function () { self.tone(720, 0.08, 'triangle', 0.18, 1200); });
        this.after(0.06, function () { self.tone(1200, 0.12, 'triangle', 0.12, 1400); });
        this.duck(0.16);
    };

    AudioFX.prototype.coin = function () {
        var self = this;
        this.after(0, function () { self.tone(988, 0.08, 'square', 0.18); });
        this.after(0.07, function () { self.tone(1319, 0.10, 'square', 0.18); });
    };

    AudioFX.prototype.heart = function () {
        var self = this;
        [[0, 523], [0.08, 784], [0.16, 1047]].forEach(function (p) {
            self.after(p[0], function () { self.tone(p[1], 0.14, 'triangle', 0.22); });
        });
        this.duck(0.3);
    };

    AudioFX.prototype.star = function () {
        var self = this;
        [[0, 660], [0.07, 880], [0.14, 1108], [0.21, 1318], [0.30, 1760], [0.40, 2093]].forEach(function (p) {
            self.after(p[0], function () { self.tone(p[1], 0.12, 'square', 0.16); });
        });
        this.after(0.4, function () { self.tone(2093, 0.25, 'triangle', 0.14); });
        this.duck(0.5);
    };

    AudioFX.prototype.stomp = function () {
        var self = this;
        this.after(0, function () { self.tone(220, 0.12, 'square', 0.24, 80); });
        this.after(0, function () { self.noise(0.14, 0.22, 700); });
        this.duck(0.15);
    };

    AudioFX.prototype.spring = function () {
        var self = this;
        this.after(0, function () { self.tone(260, 0.18, 'sawtooth', 0.22, 800); });
        this.after(0, function () { self.noise(0.08, 0.08, 2400); });
        this.duck(0.18);
    };

    AudioFX.prototype.hit = function () {
        var self = this;
        this.after(0, function () { self.tone(160, 0.22, 'sawtooth', 0.25, 60); });
        this.after(0, function () { self.noise(0.22, 0.3, 500); });
        this.duck(0.25);
    };

    AudioFX.prototype.splish = function () {
        var self = this;
        this.after(0, function () { self.noise(0.22, 0.18, 1600); });
        this.after(0.03, function () { self.tone(520, 0.10, 'sine', 0.10, 320); });
    };

    AudioFX.prototype.death = function () {
        var self = this;
        [[0, 420, 290], [0.13, 320, 220], [0.26, 240, 170], [0.39, 150, 90]].forEach(function (p) {
            self.after(p[0], function () { self.tone(p[1], 0.20, 'square', 0.22, p[2]); });
        });
        this.after(0, function () { self.noise(0.4, 0.28, 400); });
        this.duck(0.6);
    };

    AudioFX.prototype.win = function () {
        var self = this;
        [[0, 523], [0.10, 659], [0.20, 784], [0.30, 1047], [0.40, 1319], [0.50, 1568], [0.60, 2093]].forEach(function (p) {
            self.after(p[0], function () { self.tone(p[1], 0.18, 'square', 0.20); });
        });
        this.after(0.60, function () { self.tone(2093, 0.45, 'triangle', 0.18); });
        this.duck(1.2);
    };

    AudioFX.prototype.checkpoint = function () {
        var self = this;
        this.after(0, function () { self.tone(659, 0.12, 'triangle', 0.22); });
        this.after(0.09, function () { self.tone(880, 0.12, 'triangle', 0.22); });
        this.after(0.18, function () { self.tone(1319, 0.18, 'triangle', 0.18); });
        this.duck(0.25);
    };

    AudioFX.prototype.unlock = function () {
        var self = this;
        [[0, 523], [0.08, 698], [0.16, 880], [0.24, 1047], [0.32, 1319]].forEach(function (p) {
            self.after(p[0], function () { self.tone(p[1], 0.14, 'triangle', 0.20); });
        });
        this.duck(0.4);
    };

    AudioFX.prototype.tick = function () {
        var self = this;
        this.after(0, function () { self.tone(880, 0.04, 'square', 0.08); });
    };

    AudioFX.prototype.ui = function () {
        var self = this;
        this.after(0, function () { self.tone(600, 0.05, 'sine', 0.12, 720); });
    };

    AudioFX.prototype.whoosh = function () {
        var self = this;
        if (!this.ctx) return;
        var t = this.ctx.currentTime;
        var o = this.ctx.createOscillator();
        var g = this.ctx.createGain();
        var f = this.ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.setValueAtTime(200, t);
        f.frequency.exponentialRampToValueAtTime(2000, t + 0.18);
        f.Q.value = 6;
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.10, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.20);
        o.connect(f); f.connect(g); g.connect(this.sfxGain);
        o.start(t); o.stop(t + 0.22);
    };

    AudioFX.prototype.combo = function () {
        var self = this;
        this.after(0, function () { self.tone(1320, 0.06, 'sine', 0.16); });
        this.after(0.04, function () { self.tone(1760, 0.06, 'sine', 0.16); });
    };

    AudioFX.prototype.startMusic = function () {
        if (!this.musicEnabled) return;
        if (!this.ensure()) return;
        if (this.musicOn) return;
        this.musicOn = true;
        this._nextNoteTime = this.ctx.currentTime + 0.1;
        this._noteIndex = 0;
        this._beatIndex = 0;
        this._barIndex = 0;
        var self = this;
        if (this._musicTimer) clearInterval(this._musicTimer);
        this._musicTimer = setInterval(function () { self._scheduleMusic(); }, 200);
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
        var spb = 0.5;   /* seconds per beat */
        while (this._nextNoteTime < this.ctx.currentTime + 0.3) {
            var note = this._melody[this._noteIndex % this._melody.length];
            var bass = this._bass[this._beatIndex % this._bass.length];
            var isBeat = (this._noteIndex % 2 === 0);
            var t = this._nextNoteTime;
            var dur = spb * 0.9;
            this._playTrack('triangle', note, dur, isBeat ? 0.11 : 0.08, t);
            if (isBeat) this._playTrack('sine', bass * 2, spb * 1.6, 0.12, t);
            if (this._percPattern[this._beatIndex % this._percPattern.length]) {
                this._playTrack('square', note / 2, spb * 0.4, 0.05, t);
            }
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
        this.density = 1;     /* user-controllable particle density (0..1) */
    }

    Particles.prototype.spawn = function (x, y, opts) {
        var o = opts || {};
        var n = Math.max(0, Math.round((o.count || 6) * this.density));
        if (n <= 0) return;
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
                shape: o.shape || 'circle',
                rot: rand(0, TAU),
                rotV: rand(-5, 5),
                fade: o.fade !== undefined ? o.fade : 1
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
            p.rot += (p.rotV || 0) * step;
            p.life -= step;
            if (p.life <= 0) this.list.splice(i, 1);
        }
    };

    Particles.prototype.draw = function (ctx) {
        for (var i = 0; i < this.list.length; i++) {
            var p = this.list[i];
            var lifeRatio = clamp(p.life / p.maxLife, 0, 1);
            ctx.globalAlpha = lifeRatio * (p.fade || 1);
            ctx.fillStyle = p.colour;
            if (p.shape === 'rect') {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
                ctx.restore();
            } else if (p.shape === 'star') {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.beginPath();
                for (var j = 0; j < 5; j++) {
                    var a = -Math.PI / 2 + j * TAU / 5;
                    ctx.lineTo(Math.cos(a) * p.size, Math.sin(a) * p.size);
                    a += TAU / 10;
                    ctx.lineTo(Math.cos(a) * p.size * 0.45, Math.sin(a) * p.size * 0.45);
                }
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            } else {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * lifeRatio, 0, TAU);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
    };

    /* ==========================================================================
     *  Trail (a rolling ring buffer of past positions for player motion blur)
     * ======================================================================== */

    function Trail(max) {
        this.list = [];
        this.max = max || 8;
    }
    Trail.prototype.push = function (x, y, life) {
        this.list.push({ x: x, y: y, life: life || 0.4, max: life || 0.4 });
        if (this.list.length > this.max) this.list.shift();
    };
    Trail.prototype.update = function (dt) {
        for (var i = this.list.length - 1; i >= 0; i--) {
            this.list[i].life -= dt;
            if (this.list[i].life <= 0) this.list.splice(i, 1);
        }
    };
    Trail.prototype.draw = function (ctx, draw) {
        for (var i = 0; i < this.list.length; i++) {
            draw(ctx, this.list[i], i / this.list.length);
        }
    };
    Trail.prototype.clear = function () { this.list.length = 0; };

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
        this.input = { left: false, right: false, jump: false, down: false };

        this.viewport = { x: 0, y: 0 };
        this.camera = { x: 0, y: 0 };
        this.cameraTarget = { x: 0, y: 0 };
        this.lookAhead = 0;
        this.shake = { t: 0, dur: 0, mag: 0, ox: 0, oy: 0 };
        this._screenFlash = { t: 0, dur: 0, colour: '#ffffff' };

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
            _runDustTimer: 0,
            _blinkTimer: 0,
            _blinkPhase: 0,
            _animState: 'idle',
            _animTime: 0,
            trail: new Trail(10),
            _airTime: 0,
            _lastGroundedY: 0
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
        this.rings = [];

        /* Ring buffer of "ring" VFX for pickups and checkpoints. */
        this.rings = [];

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
        this.combo = 0;
        this.comboTimer = 0;
        this.bestTime = parseInt(loadStorage('platformer_bestTime', '0'), 10) || 0;
        this.maxScore = parseInt(loadStorage('platformer_maxScore', '0'), 10) || 0;
        this.attempts = 0;

        this.particles = new Particles();
        this.floaters = [];
        this.vfxs = [];
        this.tweens = [];
        this.achievements = [];
        this._unlockedAchievements = loadStorage('platformer_achievements', '[]');

        this.bg = null;
        this.staticLayer = null;
        this._skyGradient = null;
        this._skyGradientHeight = -1;
        this._gamepadIndex = null;
        this._gamepadPauseLatched = false;
        this._gamepadJumpLatched = false;
        this._wasGroundedPrev = false;
        this._lastCheckpointTime = 0;

        this.lastTime = 0;
        this.accumulator = 0;
        this.rafId = null;
        this.running = false;
        this.dt = 1 / 60;
        this._respawnTimer = 0;
        this._toastTimer = 0;
        this._levelIntro = 0;        /* 0..1, 1 = done */
        this._levelIntroDur = 1.4;
        this._winSlowmo = 0;
        this._levelPar = 0;
        this._levelParTime = 0;

        this.reducedMotion = loadStorage('platformer_reducedMotion', '0') === '1';
        this.uiModal = false;
        this._palette = loadStorage('platformer_palette', 'default');
        this._colorBlindMode = loadStorage('platformer_colorBlind', '0') === '1';

        this.settings = {
            sfx: loadStorage('platformer_sfx', '1') === '1',
            music: loadStorage('platformer_music', '1') === '1',
            sfxVolume: clamp(parseFloat(loadStorage('platformer_sfxVolume', '0.8')) || 0.8, 0, 1),
            musicVolume: clamp(parseFloat(loadStorage('platformer_musicVolume', '0.6')) || 0.6, 0, 1),
            reducedMotion: this.reducedMotion,
            showControls: loadStorage('platformer_showControls', '1') === '1',
            colorBlind: this._colorBlindMode,
            particles: clamp(parseFloat(loadStorage('platformer_particles', '1')) || 1, 0, 1)
        };

        this.particles.density = this.settings.particles;

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
            showControls: this.settings.showControls,
            colorBlind: this.settings.colorBlind,
            particles: this.settings.particles
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
        if (typeof s.colorBlind === 'boolean') this.settings.colorBlind = s.colorBlind;
        if (typeof s.particles === 'number') this.settings.particles = clamp(s.particles, 0, 1);

        this.reducedMotion = this.settings.reducedMotion;
        this._colorBlindMode = this.settings.colorBlind;
        this.particles.density = this.settings.particles;

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
        saveStorage('platformer_colorBlind', this.settings.colorBlind ? '1' : '0');
        saveStorage('platformer_particles', String(this.settings.particles));
    };

    Engine.prototype.resetSettings = function () {
        this.applySettings({
            sfx: true,
            music: true,
            sfxVolume: 0.8,
            musicVolume: 0.6,
            reducedMotion: false,
            showControls: true,
            colorBlind: false,
            particles: 1
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
        this._skyGradient = null;
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
        if (e.keyCode === 27) {
            if (this.state === 'play' || this.state === 'paused') this.togglePause();
        } else if (e.keyCode === 77) {
            /* M: quick mute */
            var s = this.getSettings();
            this.applySettings({ sfx: !s.sfx, music: !s.music });
        } else if (e.keyCode === 70) {
            /* F: fullscreen */
            if (document.documentElement && document.documentElement.requestFullscreen) {
                if (document.fullscreenElement) document.exitFullscreen();
                else document.documentElement.requestFullscreen();
            }
        }
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
        } else if (action === 'down') {
            this.input.down = pressed;
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
        if (jump && !this._gamepadJumpLatched) {
            this.player.jumpBuffer = 0.12;
            this._gamepadJumpLatched = true;
        } else if (!jump) {
            this._gamepadJumpLatched = false;
        }
        this.input.jump = jump;

        /* Debounced Start-to-pause. */
        if (pad.buttons[9] && pad.buttons[9].pressed) {
            if (!this._gamepadPauseLatched) {
                this._gamepadPauseLatched = true;
                if (this.state === 'play' || this.state === 'paused') this.togglePause();
            }
        } else {
            this._gamepadPauseLatched = false;
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
        this.rings = [];
        this.floaters.length = 0;
        this.particles.list.length = 0;
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
        this.combo = 0;
        this.comboTimer = 0;
        this.attempts = (this.attempts || 0) + 1;
        this._levelPar = map.par_time || 0;
        this._levelParTime = 0;

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
        this._levelIntro = 0;
        this._winSlowmo = 0;
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
                        this.coins.push({ x: px, y: py, collected: false, spin: Math.random() * TAU, yBob: Math.random() * TAU });
                        this.coinsTotal++;
                        this.grid[y][x] = { id: tile.id, type: 'empty' };
                        break;
                    case 'heart':
                        this.hearts.push({ x: px, y: py, collected: false, spin: Math.random() * TAU });
                        this.heartsTotal++;
                        this.grid[y][x] = { id: tile.id, type: 'empty' };
                        break;
                    case 'star':
                        this.stars.push({ x: px, y: py, collected: false, spin: Math.random() * TAU, scale: 1, dir: 1 });
                        this.starsTotal++;
                        this.grid[y][x] = { id: tile.id, type: 'empty' };
                        break;
                    case 'checkpoint':
                        this.checkpoints.push({ x: px, y: py, active: false, topY: py, t: 0 });
                        this.grid[y][x] = { id: tile.id, type: 'empty' };
                        break;
                    case 'goal':
                        this.goal = { x: px, y: py, t: 0 };
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
                            type: tile.enemyType || 'walker',
                            stepPhase: Math.random() * TAU
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
        this.bg = { clouds: [], hills: [], bushes: [], stars: [] };
        for (var i = 0; i < 18; i++) {
            this.bg.clouds.push({
                x: i * 90 + rng(i) * 60,
                y: 40 + rng(i + 40) * 80,
                s: 0.7 + rng(i + 90) * 0.8,
                speed: 0.08 + rng(i + 130) * 0.10
            });
        }
        for (var j = 0; j < 10; j++) {
            this.bg.hills.push({
                x: j * 130 + rng(j + 20) * 40,
                r: 60 + rng(j + 60) * 120,
                shade: 0.18 + rng(j + 80) * 0.18
            });
        }
        for (var k = 0; k < 24; k++) {
            this.bg.bushes.push({
                x: k * 60 + rng(k + 120) * 30,
                y: 0, s: 0.6 + rng(k + 160) * 0.7
            });
        }
        /* A subtle night-sky of stars that appear in twilight. */
        for (var n = 0; n < 30; n++) {
            this.bg.stars.push({
                x: rng(n) * 800,
                y: rng(n + 1) * 80,
                s: 0.5 + rng(n + 2) * 0.8
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
            cnv.width = Math.min(w, 8192);
            cnv.height = Math.min(h, 8192);
            var c = cnv.getContext('2d');
            var tl = this.tile_size;

            for (var y = 0; y < this.grid.length; y++) {
                for (var x = 0; x < this.grid[y].length; x++) {
                    var tile = this.grid[y][x];
                    if (!tile || !tile.type || tile.type === 'empty') continue;
                    this._drawStaticTile(c, x * tl, y * tl, tile, tl);
                }
            }
            this.staticLayer = cnv;
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
        p._animState = 'idle';
        p._animTime = 0;
        p._airTime = 0;
        p._lastGroundedY = y;
        p.trail.clear();
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
        this._doScreenFlash(0.18, '#ffffff');
    };

    Engine.prototype.togglePause = function () {
        if (this.state === 'play') {
            this.state = 'paused';
            this._show('pause-screen');
            this.audio.stopMusic();
            this.audio.ui();
        } else if (this.state === 'paused') {
            this.resumeGame();
        }
    };

    Engine.prototype.resumeGame = function () {
        if (this.state === 'paused') {
            this.state = 'play';
            this._hide('pause-screen');
            this.audio.startMusic();
            this.audio.ui();
        }
    };

    Engine.prototype.restart = function () {
        this.state = 'play';
        this._hideAllOverlays();
        this.load_map(this.map);
        this.audio.ensure();
        this.audio.startMusic();
        this._popHud('score');
    };

    Engine.prototype.resetToCheckpoint = function () {
        this.spawnPlayer(this.respawn.x, this.respawn.y);
        this.player.invuln = 1.2;
        this.state = 'play';
        this.audio.startMusic();
        this._centerCameraOnPlayer(true);
        this._popHud('lives');
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
        this._doScreenFlash(0.18, '#ff5a5a');
        this._burst(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, {
            count: 32, colour: '#ff5a5a', speedMin: 2, speedMax: 6, life: 0.7, gravity: 0.1, shape: 'rect'
        });
        this.lives--;
        this._pushHud();
        this._popHud('lives');
        this._respawnTimer = 1.1;
    };

    Engine.prototype._win = function () {
        if (this.state !== 'play') return;
        this.state = 'won';
        this.score += 500;
        var isNewBest = false;
        if (this.score > this.maxScore) {
            this.maxScore = this.score;
            isNewBest = true;
            saveStorage('platformer_maxScore', String(this.maxScore));
        }
        if (this._levelParTime && (this.bestTime === 0 || this._levelParTime < this.bestTime)) {
            this.bestTime = this._levelParTime;
            saveStorage('platformer_bestTime', String(this.bestTime));
        }
        this.audio.win();
        this._confetti();
        this._float(this.player.x + this.player.w / 2, this.player.y - 20, '+500 BONUS', '#ffd54a');
        this.rings.push({ x: this.player.x + this.player.w / 2, y: this.player.y + this.player.h / 2, life: 0.8, max: 0.8, colour: '#ffb03a', size: 0 });
        if (isNewBest) this._toast('New best score!');
        this._refreshBestHud();
        this._refreshBestTime();
        this._show('win-screen');
        this._countUp('win-score', Math.max(0, this.score - 500), this.score);
        this._fill('win-coins', this.coinsCollected + ' / ' + this.coinsTotal);
        this._fill('win-time', formatTime(this.timePlayed));
        this._fill('win-best', String(this.maxScore));
        this._fill('win-stars', this.starsCollected + ' / ' + this.starsTotal);
        this._fill('win-par', this._levelPar ? formatTime(this._levelPar) : '—');
        this._pushHud();
        this.audio.stopMusic();
        this._winSlowmo = 0.5;
        /* Achievement: beat the level. */
        this._grantAchievement('first_win');
        if (this.coinsCollected === this.coinsTotal) this._grantAchievement('all_coins');
        if (this.starsCollected === this.starsTotal) this._grantAchievement('all_stars');
        if (this.timePlayed < 60) this._grantAchievement('speedrunner');
    };

    Engine.prototype._collectCoin = function (coin) {
        coin.collected = true;
        this.coinsCollected++;
        var points = 100 + (this.combo * 10);
        this.score += points;
        this.audio.coin();
        if (this.combo > 0) this.audio.combo();
        this._burst(coin.x + this.tile_size / 2, coin.y + this.tile_size / 2, {
            count: 12, colour: '#ffd54a', speedMin: 1, speedMax: 3, life: 0.5, gravity: 0.05, shape: 'star'
        });
        this._float(coin.x + this.tile_size / 2, coin.y - 4, '+' + points, '#ffd54a');
        this.rings.push({ x: coin.x + this.tile_size / 2, y: coin.y + this.tile_size / 2, life: 0.4, max: 0.4, colour: '#ffd54a', size: 0 });
        this._popHud('coins');
        this._popHud('score');
        this._bumpCombo();
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
            count: 14, colour: '#ff6b8a', speedMin: 1, speedMax: 3.5, life: 0.6, gravity: 0.02, shape: 'star'
        });
        this.rings.push({ x: heart.x + this.tile_size / 2, y: heart.y + this.tile_size / 2, life: 0.7, max: 0.7, colour: '#ff6b8a', size: 0 });
        this._popHud('lives');
        this._popHud('score');
        this._bumpCombo();
    };

    Engine.prototype._collectStar = function (star) {
        star.collected = true;
        this.starsCollected++;
        var points = 500 + (this.combo * 25);
        this.score += points;
        this.audio.star();
        this._burst(star.x + this.tile_size / 2, star.y + this.tile_size / 2, {
            count: 22, colour: '#fff59d', speedMin: 2, speedMax: 5, life: 0.8, gravity: 0.03, shape: 'star'
        });
        this._float(star.x + this.tile_size / 2, star.y - 4, '+' + points, '#fff176');
        this.rings.push({ x: star.x + this.tile_size / 2, y: star.y + this.tile_size / 2, life: 0.9, max: 0.9, colour: '#fff176', size: 0 });
        this._popHud('score');
        this._bumpCombo();
        this._grantAchievement('first_star');
    };

    Engine.prototype._activateCheckpoint = function (cp) {
        if (cp.active) return;
        cp.active = true;
        this.respawn.x = cp.x;
        this.respawn.y = cp.y;
        this.audio.checkpoint();
        this._toast('Checkpoint!');
        this._burst(cp.x + this.tile_size / 2, cp.y, {
            count: 14, colour: '#4bdc8a', speedMin: 1, speedMax: 3, life: 0.5, gravity: -0.05
        });
        this.rings.push({ x: cp.x + this.tile_size / 2, y: cp.y - this.tile_size, life: 0.7, max: 0.7, colour: '#4bdc8a', size: 0 });
        this._doScreenFlash(0.18, '#4bdc8a');
    };

    Engine.prototype._stompEnemy = function (enemy) {
        var idx = this.enemies.indexOf(enemy);
        if (idx !== -1) this.enemies.splice(idx, 1);
        this.player.vy = -this.moveSpeed.jump * 0.55;
        this.player.squash = 1.3;
        var points = 250;
        this.score += points;
        this.audio.stomp();
        this._burst(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, {
            count: 18, colour: '#9b6bff', speedMin: 1.5, speedMax: 4, life: 0.6, gravity: 0.12
        });
        this._float(enemy.x + enemy.w / 2, enemy.y - 4, '+' + points, '#c39bff');
        this.rings.push({ x: enemy.x + enemy.w / 2, y: enemy.y + enemy.h / 2, life: 0.5, max: 0.5, colour: '#c39bff', size: 0 });
        this._popHud('score');
    };

    Engine.prototype._bumpCombo = function () {
        this.combo++;
        this.comboTimer = 2.5;
    };

    /* ==========================================================================
     *  Achievements
     * ======================================================================== */

    Engine.prototype._grantAchievement = function (id) {
        try {
            var list = JSON.parse(this._unlockedAchievements || '[]');
            if (list.indexOf(id) !== -1) return;
            list.push(id);
            this._unlockedAchievements = JSON.stringify(list);
            saveStorage('platformer_achievements', this._unlockedAchievements);
            var def = ACHIEVEMENTS[id];
            if (def) this._toast('🏆 ' + def.name);
            this.audio.unlock();
        } catch (e) { /* ignore */ }
    };

    var ACHIEVEMENTS = {
        first_win:    { name: 'First Victory' },
        first_star:   { name: 'Star Power' },
        all_coins:    { name: 'Tight Purse' },
        all_stars:    { name: 'Star Collector' },
        speedrunner:  { name: 'Speedrunner' }
    };
    Engine.ACHIEVEMENTS = ACHIEVEMENTS;

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
        var sel = which === 'score' ? '#score' : which === 'coins' ? '#coins' : which === 'lives' ? '#lives' : which === 'stars' ? '#stars' : null;
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
        var pct = this.mapWidth > 0 ? clamp((this.player.x / this.mapWidth) * 100, 0, 100) : 0;
        var prog = this._q('#progress-fill');
        if (prog) prog.style.width = pct + '%';
        /* Combo HUD. */
        var comboEl = document.getElementById('combo');
        var comboChip = document.getElementById('combo-chip');
        if (comboEl) comboEl.textContent = 'x' + Math.max(1, this.combo);
        if (comboChip) comboChip.style.display = (this.combo > 1) ? 'flex' : 'none';
    };

    Engine.prototype._refreshBestHud = function () {
        this._fill('best', String(this.maxScore));
        var el = document.getElementById('best-chip');
        if (el) el.style.display = this.maxScore > 0 ? 'flex' : 'none';
    };

    Engine.prototype._refreshBestTime = function () {
        this._fill('best-time', formatTime(this.bestTime));
        var el = document.getElementById('best-time-chip');
        if (el) el.style.display = this.bestTime > 0 ? 'flex' : 'none';
    };

    /* World-space floating score popups. */
    Engine.prototype._float = function (x, y, text, colour) {
        if (!text) return;
        this.floaters.push({
            x: x, y: y,
            text: text,
            life: 1,
            maxLife: 1,
            colour: colour || '#ffffff',
            scale: 0.6
        });
    };

    Engine.prototype._updateFloaters = function (dt) {
        for (var i = this.floaters.length - 1; i >= 0; i--) {
            var f = this.floaters[i];
            f.y -= 36 * (dt || 1 / 60);
            f.x += Math.sin((1 - f.life) * 8) * 0.2;
            f.life -= (dt || 1 / 60) * 0.9;
            f.scale = Math.min(1, f.scale + 0.18);
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
            var s = (f.scale || 1);
            ctx.font = 'bold ' + Math.round(this.tile_size * 0.95 * s) + 'px sans-serif';
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(0,0,0,0.65)';
            ctx.strokeText(f.text, f.x, f.y);
            ctx.fillStyle = f.colour;
            ctx.fillText(f.text, f.x, f.y);
        }
        ctx.globalAlpha = 1;
    };

    /* Ring VFX (expanding circles for pickups). */
    Engine.prototype._updateRings = function (dt) {
        for (var i = this.rings.length - 1; i >= 0; i--) {
            var r = this.rings[i];
            r.life -= dt;
            r.size += 90 * dt;
            if (r.life <= 0) this.rings.splice(i, 1);
        }
    };

    Engine.prototype._drawRings = function (ctx) {
        for (var i = 0; i < this.rings.length; i++) {
            var r = this.rings[i];
            var lr = clamp(r.life / r.max, 0, 1);
            ctx.globalAlpha = lr;
            ctx.strokeStyle = r.colour;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(r.x, r.y, r.size, 0, TAU);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    };

    /* ==========================================================================
     *  Physics
     * ======================================================================== */

    Engine.prototype.update = function (dt) {
        var step = dt || 1 / 60;
        this.dt = step;

        if (this._winSlowmo > 0) {
            this._winSlowmo -= step;
            step = step * 0.4;
        }
        if (this.shake.t > 0) {
            this.shake.t -= step;
            this.shake.ox = (Math.random() * 2 - 1) * this.shake.mag * (this.shake.t / this.shake.dur);
            this.shake.oy = (Math.random() * 2 - 1) * this.shake.mag * (this.shake.t / this.shake.dur);
        } else {
            this.shake.ox = 0; this.shake.oy = 0;
        }
        if (this._screenFlash.t > 0) this._screenFlash.t -= step;
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
        this._updateRings(step);
        this._updateGamepad();
        this.player.trail.update(step);

        if (this.state === 'play') {
            this.timePlayed += step;
            this._levelParTime = this.timePlayed;
            if (this.player.jumpBuffer > 0) this.player.jumpBuffer -= step;
            if (this.player.coyote > 0) this.player.coyote -= step;
            if (this.player.invuln > 0) this.player.invuln -= step;
            if (this.comboTimer > 0) {
                this.comboTimer -= step;
                if (this.comboTimer <= 0) this.combo = 0;
            }
            if (this._levelIntro < 1) this._levelIntro = Math.min(1, this._levelIntro + step / this._levelIntroDur);

            this._updateWater();
            this._updatePlatforms();
            this._carryPlayerOnPlatform();
            this._updatePlayer();
            this._updateEnemies();
            this._updateCollisions();
            this._checkPit();
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
                    this._fill('final-stars', this.starsCollected + ' / ' + this.starsTotal);
                    this._fill('final-time', formatTime(this.timePlayed));
                } else {
                    this.resetToCheckpoint();
                }
            }
        } else if (this.state === 'won' || this.state === 'gameover') {
            /* Still animate particles/floaters/rings on win/lose screens. */
        }

        this._updateAnimation();
    };

    Engine.prototype._checkPit = function () {
        /* If the player falls well below the level, kill them. */
        var p = this.player;
        if (p.y > this.mapHeight + this.tile_size * 4) {
            this._die('pit');
        }
    };

    Engine.prototype._updateWater = function () {
        var feet = this.player.y + this.player.h;
        var t = this.tileAtPx(this.player.x + this.player.w / 2, feet + 1);
        this.player.inWater = t && t.type === 'water';
        if (this.player.inWater && !this.player._wasInWater) {
            this.audio.splish();
            this._burst(this.player.x + this.player.w / 2, feet, {
                count: 16, colour: '#7adcf2', speedMin: 1, speedMax: 4, life: 0.5, gravity: 0.02
            });
            this.rings.push({ x: this.player.x + this.player.w / 2, y: feet, life: 0.6, max: 0.6, colour: '#7adcf2', size: 0 });
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
            p._runDustTimer = 0.16;
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

        /* Push trail while moving fast in the air for a sense of motion. */
        if (!p.onFloor && Math.abs(p.vx) > 1.4) {
            p.trail.push(p.x + p.w / 2, p.y + p.h / 2, 0.35);
        }

        p.x = clamp(p.x, 0, Math.max(0, this.mapWidth - p.w));
        /* Note: Y is intentionally NOT clamped to mapHeight so a fall-out-of-world
           is detected by _checkPit() (which then kills the player). */

        if (p.onFloor) p._lastGroundedY = p.y;
        if (!p.onFloor) p._airTime += this.dt;
        else p._airTime = 0;

        this._wasGroundedPrev = wasGrounded;
    };

    Engine.prototype._updateAnimation = function () {
        var p = this.player;
        p._animTime += this.dt;
        p._blinkTimer -= this.dt;
        if (p._blinkTimer <= 0) {
            p._blinkPhase = 0.15;
            p._blinkTimer = 2 + Math.random() * 4;
        } else if (p._blinkPhase > 0) {
            p._blinkPhase -= this.dt;
        }
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
                            count: 14, colour: '#d18cff', speedMin: 1, speedMax: 4, life: 0.4, gravity: 0.02
                        });
                        this.rings.push({ x: p.x + p.w / 2, y: p.y + p.h, life: 0.5, max: 0.5, colour: '#d18cff', size: 0 });
                        return landed;
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
            e.stepPhase += this.dt * 6;
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
        this.shake = { t: dur, dur: dur, mag: mag, ox: 0, oy: 0 };
    };

    Engine.prototype._doScreenFlash = function (dur, colour) {
        this._screenFlash = { t: dur, dur: dur, colour: colour || '#ffffff' };
    };

    Engine.prototype._worldScale = function () {
        if (!this.canvas || !this.canvas.height) return 1;
        var visibleTilesY = 18;
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
        grad.addColorStop(0, '#7ec8ff');
        grad.addColorStop(0.45, '#aedfff');
        grad.addColorStop(0.85, '#e3f6ff');
        grad.addColorStop(1, '#cdebff');
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
        var sx = this.shake.ox;
        var sy = this.shake.oy;

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
        if (this.state === 'play' || this.state === 'won' || this.state === 'lost') {
            this._drawPlayerTrail(ctx);
            if (this.player.alive) this._drawPlayer(ctx);
        }
        if (this.player.inWater && this.player.alive) this._drawWaterHighlight(ctx);
        this._drawRings(ctx);
        this.particles.draw(ctx);
        this._drawFloaters(ctx);

        ctx.restore();

        /* Level intro overlay (drawn in screen space). */
        if (this._levelIntro < 1 && (this.state === 'play' || this.state === 'menu') && this.map) {
            this._drawLevelIntro(ctx);
        }

        /* Subtle vignette for cinematic feel. */
        if (!this.reducedMotion) this._drawVignette(ctx);

        /* Screen flash overlay. */
        if (this._screenFlash.t > 0) {
            var t = clamp(this._screenFlash.t / this._screenFlash.dur, 0, 1);
            ctx.fillStyle = this._screenFlash.colour;
            ctx.globalAlpha = t * 0.35;
            ctx.fillRect(0, 0, this.viewport.x, this.viewport.y);
            ctx.globalAlpha = 1;
        }
    };

    Engine.prototype._drawLevelIntro = function (ctx) {
        var t = this._levelIntro;
        var name = (this.map && this.map.name) || 'Level 1';
        /* Slide in from the top, fade out near the end. */
        var alpha = t < 0.7 ? 1 : (1 - (t - 0.7) / 0.3);
        var yOff = (1 - easeOutCubic(Math.min(1, t / 0.6))) * -40;
        ctx.save();
        ctx.translate(this.viewport.x / 2, this.viewport.y / 2 + yOff);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(8, 14, 30, 0.7)';
        ctx.fillRect(-260, -36, 520, 72);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-260, -36, 520, 72);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name.toUpperCase(), 0, 0);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '12px -apple-system, sans-serif';
        ctx.fillText(this.coinsTotal + ' coins  •  ' + this.starsTotal + ' stars', 0, 22);
        ctx.restore();
    };

    Engine.prototype._drawVignette = function (ctx) {
        var grad = ctx.createRadialGradient(
            this.viewport.x / 2, this.viewport.y / 2, Math.min(this.viewport.x, this.viewport.y) * 0.4,
            this.viewport.x / 2, this.viewport.y / 2, Math.max(this.viewport.x, this.viewport.y) * 0.7
        );
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.viewport.x, this.viewport.y);
    };

    Engine.prototype._drawParallax = function (ctx) {
        var scale = this._worldScale();
        var tl = this.tile_size;

        if (!this.bg) return;

        /* A few sparse stars at the top. */
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        for (var n = 0; n < this.bg.stars.length; n++) {
            var st = this.bg.stars[n];
            var sx2 = st.x + this.camera.x * 0.95;
            var sy2 = st.y + this.camera.y * 0.95;
            if (sx2 < this.camera.x - 20 || sx2 > this.camera.x + this.viewport.x / scale + 20) continue;
            ctx.globalAlpha = 0.4 + 0.3 * Math.sin(this.timePlayed * 2 + n);
            ctx.beginPath();
            ctx.arc(sx2, sy2, st.s, 0, TAU);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        /* Clouds drift slowly. */
        for (var i = 0; i < this.bg.clouds.length; i++) {
            var c = this.bg.clouds[i];
            var cx = (c.x + this.timePlayed * 4 * c.speed) + this.camera.x * 0.85;
            cx = ((cx % 1200) + 1200) % 1200;
            var cy = c.y + this.camera.y * 0.85;
            if (cx < this.camera.x - 60 || cx > this.camera.x + this.viewport.x / scale + 60) continue;
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
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
            ctx.fillStyle = 'rgba(120,200,120,' + h.shade + ')';
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
            case 'solid': {
                var fill = tile.fill || '#9a9aa3';
                var top = tile.top || 'rgba(255,255,255,0.25)';
                ctx.fillStyle = fill;
                ctx.fillRect(px, py, tl, tl);
                /* Slight inner shadow on the sides. */
                ctx.fillStyle = 'rgba(0,0,0,0.15)';
                ctx.fillRect(px, py, 1, tl);
                ctx.fillRect(px + tl - 1, py, 1, tl);
                ctx.fillStyle = top;
                ctx.fillRect(px, py, tl, 3);
                /* A subtle noise dot pattern for texture. */
                ctx.fillStyle = 'rgba(0,0,0,0.08)';
                for (var d = 0; d < 3; d++) {
                    ctx.fillRect(px + 2 + d * 5, py + tl - 4, 1, 1);
                    ctx.fillRect(px + 4 + d * 4, py + 6, 1, 1);
                }
                ctx.fillStyle = 'rgba(0,0,0,0.12)';
                ctx.fillRect(px, py + tl - 2, tl, 2);
                break;
            }
            case 'spring': {
                ctx.fillStyle = '#3b2a52';
                ctx.fillRect(px, py + 8, tl, tl - 8);
                /* Coils. */
                ctx.fillStyle = '#d18cff';
                ctx.fillRect(px, py + 4, tl, 5);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(px, py + 3, tl, 2);
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.fillRect(px, py + 6, tl, 1);
                break;
            }
            case 'water': {
                ctx.fillStyle = 'rgba(90,180,230,0.45)';
                ctx.fillRect(px, py, tl, tl);
                ctx.fillStyle = 'rgba(255,255,255,0.25)';
                ctx.fillRect(px, py + 2, tl, 2);
                break;
            }
            case 'hazard': {
                ctx.fillStyle = '#c95057';
                for (var spike = 0; spike < 4; spike++) {
                    var sxx = px + spike * (tl / 4);
                    ctx.beginPath();
                    ctx.moveTo(sxx, py + tl);
                    ctx.lineTo(sxx + tl / 8, py + 2);
                    ctx.lineTo(sxx + tl / 4, py + tl);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.fillRect(px, py + tl - 3, tl, 1);
                break;
            }
            case 'deco': {
                /* A little grass tuft or flower. */
                ctx.fillStyle = tile.fill || '#6bbf4b';
                ctx.beginPath();
                ctx.arc(px + tl / 2, py + tl * 0.7, tl * 0.28, 0, TAU);
                ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.beginPath();
                ctx.arc(px + tl / 2 - 2, py + tl * 0.65, 1.5, 0, TAU);
                ctx.fill();
                break;
            }
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
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
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
            var cx = c.x + tl / 2, cy = c.y + tl / 2 + Math.sin(this.timePlayed * 2 + c.yBob) * 1.5;
            var wobble = Math.sin(this.timePlayed * 4 + c.spin) * 0.2;
            var sw = Math.max(0.18, Math.abs(Math.cos(this.timePlayed * 3 + c.spin)));
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(sw, 1);
            ctx.fillStyle = '#ffd54a';
            ctx.beginPath();
            ctx.arc(0, 0, tl * 0.36, 0, TAU);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.beginPath();
            ctx.arc(-tl * 0.1, -tl * 0.1, tl * 0.13, 0, TAU);
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(0, 0, tl * 0.36, 0, TAU);
            ctx.stroke();
            ctx.restore();
        }
    };

    Engine.prototype._drawHearts = function (ctx) {
        var tl = this.tile_size;
        var pulse = 1 + Math.sin(this.timePlayed * 5) * 0.08;
        for (var i = 0; i < this.hearts.length; i++) {
            var h = this.hearts[i];
            if (h.collected) continue;
            var cx = h.x + tl / 2, cy = h.y + tl / 2 + Math.sin(this.timePlayed * 2 + i) * 1.2;
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
            var wave = cp.active ? 0 : Math.sin(this.timePlayed * 3 + i) * 1.5;
            ctx.fillStyle = '#6a6a6a';
            ctx.fillRect(px + tl / 2 - 1, py, 2, tl);
            ctx.fillStyle = cp.active ? '#4bdc8a' : '#9aa0a6';
            ctx.beginPath();
            ctx.moveTo(px + tl / 2 + 1, py + 2);
            ctx.lineTo(px + tl + wave, py + 8);
            ctx.lineTo(px + tl / 2 + 1, py + 14);
            ctx.closePath();
            ctx.fill();
            /* Soft glow when active. */
            if (cp.active) {
                ctx.fillStyle = 'rgba(75,220,138,0.18)';
                ctx.beginPath();
                ctx.arc(px + tl / 2, py + 8, tl * 0.9, 0, TAU);
                ctx.fill();
            }
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
        /* Pulsing glow. */
        var glow = 0.4 + 0.2 * Math.sin(this.timePlayed * 4);
        ctx.fillStyle = 'rgba(255,112,67,' + (0.18 + 0.1 * Math.sin(this.timePlayed * 5)) + ')';
        ctx.beginPath();
        ctx.arc(px + tl / 2, py - tl * 0.8, tl * 0.8 + wave, 0, TAU);
        ctx.fill();
        /* Inner sparkle ring. */
        ctx.strokeStyle = 'rgba(255,255,255,' + glow + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px + tl / 2, py - tl * 0.8, tl * 0.4 + Math.sin(this.timePlayed * 6) * 3, 0, TAU);
        ctx.stroke();
    };

    Engine.prototype._drawEnemies = function (ctx) {
        var tl = this.tile_size;
        for (var i = 0; i < this.enemies.length; i++) {
            var e = this.enemies[i];
            var step = Math.sin(e.stepPhase) * 2;
            ctx.save();
            ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
            ctx.scale(e.dir * e.squash, e.squash);
            /* Body. */
            ctx.fillStyle = '#9b6bff';
            ctx.beginPath();
            ctx.ellipse(0, 0, e.w * 0.42, e.h * 0.42, 0, 0, TAU);
            ctx.fill();
            /* Highlight. */
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.beginPath();
            ctx.ellipse(-e.w * 0.12, -e.h * 0.14, e.w * 0.18, e.h * 0.18, 0, 0, TAU);
            ctx.fill();
            /* Eyes. */
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath();
            ctx.arc(e.w * 0.15, -e.h * 0.08, e.w * 0.12, 0, TAU);
            ctx.fill();
            ctx.fillStyle = '#222';
            ctx.beginPath();
            ctx.arc(e.w * 0.17, -e.h * 0.08, e.w * 0.05, 0, TAU);
            ctx.fill();
            /* Angry eyebrow. */
            ctx.strokeStyle = '#3a1f7a';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(e.w * 0.05, -e.h * 0.2);
            ctx.lineTo(e.w * 0.25, -e.h * 0.1);
            ctx.stroke();
            /* Legs. */
            ctx.fillStyle = '#7a52cc';
            ctx.fillRect(-e.w * 0.28, e.h * 0.28, e.w * 0.2, 3 + step);
            ctx.fillRect(e.w * 0.08, e.h * 0.28, e.w * 0.2, 3 - step);
            ctx.restore();
        }
    };

    Engine.prototype._drawPlayerTrail = function (ctx) {
        var list = this.player.trail.list;
        for (var i = 0; i < list.length; i++) {
            var t = list[i];
            var life = clamp(t.life / t.max, 0, 1);
            ctx.globalAlpha = life * 0.35;
            ctx.fillStyle = this.player.colour;
            ctx.beginPath();
            ctx.arc(t.x, t.y, (this.player.w * 0.3) * life, 0, TAU);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
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
        /* Body. */
        ctx.fillStyle = p.colour;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.w * 0.42, p.h * 0.42, 0, 0, TAU);
        ctx.fill();
        /* Highlight. */
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.ellipse(-p.w * 0.12, -p.h * 0.12, p.w * 0.2, p.h * 0.18, 0, 0, TAU);
        ctx.fill();
        /* Eyes. */
        var eo = p.dir * 2.5;
        var eyeOpen = 1 - clamp(p._blinkPhase / 0.15, 0, 1);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(eo - 2, -1.5, 3, 3 * eyeOpen, 0, 0, TAU);
        ctx.ellipse(eo + 2, -1.5, 3, 3 * eyeOpen, 0, 0, TAU);
        ctx.fill();
        if (eyeOpen > 0.1) {
            ctx.fillStyle = '#222';
            ctx.beginPath();
            ctx.arc(eo - 2 + p.dir, -1.5, 1.4, 0, TAU);
            ctx.arc(eo + 2 + p.dir, -1.5, 1.4, 0, TAU);
            ctx.fill();
        } else {
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(eo - 4, -1.5);
            ctx.lineTo(eo, -1.5);
            ctx.moveTo(eo + 1, -1.5);
            ctx.lineTo(eo + 5, -1.5);
            ctx.stroke();
        }
        /* Cheek blush. */
        ctx.fillStyle = 'rgba(255, 100, 130, 0.35)';
        ctx.beginPath();
        ctx.arc(eo + 4, 2.5, 1.4, 0, TAU);
        ctx.arc(eo - 4, 2.5, 1.4, 0, TAU);
        ctx.fill();
        /* Mouth: a small smile or "O" depending on speed. */
        ctx.strokeStyle = '#1a1a2a';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        if (Math.abs(p.vx) > 2) {
            ctx.arc(eo, 3, 2, 0, Math.PI, false);
        } else if (p.inWater) {
            ctx.arc(eo, 2.5, 1.4, 0, TAU);
        } else {
            ctx.arc(eo, 2, 1.6, 0, Math.PI, false);
        }
        ctx.stroke();
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
        for (var i = 0; i < 8; i++) {
            this.particles.spawn(this.camera.x + view.width / 2, this.camera.y + 30, {
                count: 16,
                colour: ['#ff7043', '#ffd54a', '#4bdc8a', '#73c6fa', '#e373fa', '#9b6bff'][i % 6],
                speedMin: 2, speedMax: 6, life: 1.4, gravity: 0.05, shape: 'rect'
            });
        }
    };

    /* ==========================================================================
     *  Main loop
     * ======================================================================== */

    Engine.prototype.start = function () {
        if (this.running) return;
        this.running = true;
        this.lastTime = (global.performance && performance.now) ? performance.now() : Date.now();
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

    /* Public helpers for the bootstrap script. */
    Engine.prototype._formatTime = formatTime;
    Engine.prototype.setCombo = function (n) { this.combo = n; this._bumpCombo(); };

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

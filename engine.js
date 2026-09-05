/* ============================================================================
 *  Platformer Engine
 *  A polished, dependency-free, browser-based platformer engine.
 *
 *  Features
 *  --------
 *  - Fixed-timestep physics (frame-rate independent, reproducible)
 *  - Smooth AABB tile collision (no frame-hack `while` loops)
 *  - Coyote-time + jump-buffering for tight, responsive controls
 *  - Variable jump height (hold to jump higher)
 *  - Water / low-gravity zones
 *  - Bouncy spring pads, spike hazards, coin pickups, checkpoints, goal flag
 *  - Stompable patrolling enemies
 *  - Particle system, tween helper, camera shake & smooth follow
 *  - Web Audio SFX + optional chiptune music (no asset files needed)
 *  - In-game HUD, menu / win / pause / game-over screens, toasts
 *  - Keyboard + touch / on-screen controls with input-method detection
 *  - PWA ready (index.html + manifest + icons)
 *
 *  Author: Arena.ai Agent Mode — refactored from a tutorial Codepen engine.
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

    /* Easing curve for tweens */
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

    /* Deterministic pseudo-random for the parallax background so it
       doesn't flicker between frames. */
    function hash2(x, y) {
        var h = (x * 374761393 + y * 668265263) | 0;
        h = (h ^ (h >> 13)) * 1274126177;
        return ((h ^ (h >> 16)) >>> 0) / 4294967295;
    }

    /* ==========================================================================
     *  Audio (Web Audio, synthesised — zero asset files)
     * ======================================================================== */

    function AudioFX() {
        this.ctx = null;
        this.master = null;
        this.sfxEnabled = true;
        this.musicEnabled = true;
        this.musicOn = false;
        this._musicTimer = null;
        this._nextNoteTime = 0;
        this._noteIndex = 0;
        this._beatIndex = 0;
    }

    AudioFX.prototype.ensure = function () {
        if (!this.ctx) {
            var AC = global.AudioContext || global.webkitAudioContext;
            if (!AC) return false;
            this.ctx = new AC();
            this.master = this.ctx.createGain();
            this.master.gain.value = 0.6;
            this.master.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return true;
    };

    AudioFX.prototype.setMuted = function (m) {
        this.sfxEnabled = !m;
        this.musicEnabled = !m;
        if (this.master) this.master.gain.value = m ? 0 : 0.6;
        if (m) this.stopMusic();
    };

    AudioFX.prototype.isMuted = function () { return !this.sfxEnabled; };

    /* Play a single synthesised tone. */
    AudioFX.prototype.tone = function (freq, dur, type, vol, slideTo) {
        if (!this.sfxEnabled) return;
        if (!this.ensure()) return;
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
        g.connect(this.master);
        o.start(t);
        o.stop(t + dur + 0.02);
    };

    /* Noise burst for explosions / dust. */
    AudioFX.prototype.noise = function (dur, vol, filterFreq) {
        if (!this.sfxEnabled) return;
        if (!this.ensure()) return;
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
        g.connect(this.master);
        src.start(t);
    };

    /* Named sound effects. */
    AudioFX.prototype.jump = function () {
        if (!this.ctx) return;
        var self = this;
        (function (f, d, delay) {
            setTimeout(function () { self.tone(f, d, 'square', 0.18, f * 1.4); }, delay * 1000);
        })(360, 0.12, 0);
        (function (f, d, delay) {
            setTimeout(function () { self.tone(f, d, 'square', 0.12, f); }, delay * 1000);
        })(560, 0.14, 0.05);
    };

    AudioFX.prototype.coin = function () {
        var self = this;
        var notes = [988, 1319];
        notes.forEach(function (f, i) {
            setTimeout(function () { self.tone(f, 0.09, 'square', 0.16); }, i * 60);
        });
    };

    AudioFX.prototype.stomp = function () {
        var self = this;
        setTimeout(function () { self.tone(200, 0.14, 'square', 0.22, 80); }, 0);
        self.noise(0.15, 0.2, 700);
    };

    AudioFX.prototype.spring = function () {
        var self = this;
        setTimeout(function () { self.tone(240, 0.2, 'sawtooth', 0.2, 700); }, 0);
    };

    AudioFX.prototype.hit = function () {
        var self = this;
        setTimeout(function () { self.tone(160, 0.2, 'sawtooth', 0.25, 60); }, 0);
        self.noise(0.2, 0.3, 500);
    };

    AudioFX.prototype.death = function () {
        var self = this;
        var notes = [420, 320, 240, 150];
        notes.forEach(function (f, i) {
            setTimeout(function () { self.tone(f, 0.18, 'square', 0.2, f * 0.7); }, i * 130);
        });
        self.noise(0.35, 0.25, 400);
    };

    AudioFX.prototype.win = function () {
        var self = this;
        var notes = [523, 659, 784, 1047, 1319, 1568];
        notes.forEach(function (f, i) {
            setTimeout(function () { self.tone(f, 0.2, 'square', 0.18); }, i * 110);
        });
    };

    AudioFX.prototype.checkpoint = function () {
        var self = this;
        var notes = [659, 880];
        notes.forEach(function (f, i) {
            setTimeout(function () { self.tone(f, 0.12, 'triangle', 0.2); }, i * 90);
        });
    };

    AudioFX.prototype.unlock = function () {
        var self = this;
        var notes = [523, 698, 880, 1047];
        notes.forEach(function (f, i) {
            setTimeout(function () { self.tone(f, 0.14, 'triangle', 0.2); }, i * 80);
        });
    };

    AudioFX.prototype.tick = function () {
        var self = this;
        setTimeout(function () { self.tone(880, 0.05, 'square', 0.1); }, 0);
    };

    /* A gentle looping melody + bass using a look-ahead scheduler. */
    AudioFX.prototype.startMusic = function () {
        if (!this.musicEnabled) return;
        if (!this.ensure()) return;
        if (this.musicOn) return;
        this.musicOn = true;
        this._nextNoteTime = this.ctx.currentTime + 0.1;
        this._noteIndex = 0;
        this._beatIndex = 0;
        var self = this;
        /* Melody (pentatonic-ish) */
        self._melody = [523, 587, 659, 784, 659, 587, 523, 784];
        /* Bass roots */
        self._bass = [131, 196, 165, 196];
        if (this._musicTimer) clearInterval(this._musicTimer);
        this._musicTimer = setInterval(function () { self._scheduleMusic(); }, 180);
    };

    AudioFX.prototype.stopMusic = function () {
        this.musicOn = false;
        if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
    };

    AudioFX.prototype._scheduleMusic = function () {
        if (!this.ctx || !this.musicOn) return;
        var spb = 0.55; /* seconds per beat */
        while (this._nextNoteTime < this.ctx.currentTime + 0.25) {
            var note = this._melody[this._noteIndex % this._melody.length];
            var bass = this._bass[this._beatIndex % this._bass.length];
            var t = this._nextNoteTime;
            this._playTrack('triangle', note, spb * 0.9, 0.09, t);
            if (this._noteIndex % 4 === 0) this._playTrack('sine', bass * 2, spb * 3.4, 0.12, t);
            this._nextNoteTime += spb;
            this._noteIndex++;
            this._beatIndex = (this._noteIndex % 4 === 0) ? this._beatIndex + 1 : this._beatIndex;
        }
    };

    AudioFX.prototype._playTrack = function (type, freq, dur, vol, when) {
        if (!this.musicEnabled || !this.ctx) return;
        var o = this.ctx.createOscillator();
        var g = this.ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, when);
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(vol, when + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        o.connect(g);
        g.connect(this.master);
        o.start(when);
        o.stop(when + dur + 0.02);
    };

    /* ==========================================================================
     *  Particles
     * ======================================================================== */

    function Particles() {
        this.list = [];
    }

    Particles.prototype.spawn = function (x, y, opts) {
        var o = opts || {};
        var n = o.count || 6;
        for (var i = 0; i < n; i++) {
            var a = (o.angle !== undefined) ? o.angle + rand(-(o.spread || 0.4), (o.spread || 0.4)) : rand(0, TAU);
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

    Particles.prototype.update = function () {
        for (var i = this.list.length - 1; i >= 0; i--) {
            var p = this.list[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity;
            p.vx *= 0.98;
            p.life -= 1 / 60;
            if (p.life <= 0) this.list.splice(i, 1);
        }
    };

    Particles.prototype.draw = function (context) {
        for (var i = 0; i < this.list.length; i++) {
            var p = this.list[i];
            var lifeRatio = p.life / p.maxLife;
            context.globalAlpha = clamp(lifeRatio, 0, 1);
            context.fillStyle = p.colour;
            if (p.shape === 'rect') {
                context.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
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
        this.log_info = false;          /* keep console clean in production */
        this.tile_size = 16;
        this.limit_viewport = true;

        this.audio = new AudioFX();

        this.state = 'menu';            /* menu | play | paused | won | lost | gameover */

        /* Input */
        this.input = { left: false, right: false, jump: false };

        /* Viewport (screen pixels) */
        this.viewport = { x: 0, y: 0 };

        /* Camera (world pixels) */
        this.camera = { x: 0, y: 0 };
        this.cameraTarget = { x: 0, y: 0 };
        this.lookAhead = 0;
        this.shake = { t: 0, dur: 0, mag: 0 };

        /* Player */
        this.player = {
            x: 0, y: 0,           /* top-left of hitbox (world px) */
            w: 11, h: 14,
            vx: 0, vy: 0,
            dir: 1,
            onFloor: false,
            canJump: true,
            coyote: 0,
            jumpBuffer: 0,
            squash: 1,             /* 1 = normal; <1 squashed when landing; >1 stretched when jumping */
            invuln: 0,
            alive: true,
            colour: '#3D5AFE'
        };

        /* Level data */
        this.map = null;
        this.grid = null;           /* grid[y][x] -> tile object */
        this.coins = [];            /* {x,y,collected} */
        this.enemies = [];          /* {x,y,w,h,dir,range,speed,type,vx,,dead} */
        this.checkpoints = [];      /* {x,y,active} */
        this.goal = null;           /* {x,y} */
        this.respawn = { x: 0, y: 0 };

        /* Game progress */
        this.score = 0;
        this.coinsCollected = 0;
        this.coinsTotal = 0;
        this.lives = 3;
        this.timePlayed = 0;
        this.maxScore = localStorage.getItem('platformer_maxScore');
        this.maxScore = this.maxScore ? parseInt(this.maxScore, 10) : 0;

        this.particles = new Particles();
        this.tweens = [];

        /* Background layer data (generated once per level) */
        this.bg = null;

        /* Runtime */
        this.lastTime = 0;
        this.accumulator = 0;
        this.rafId = null;
        this.running = false;
        this.dt = 1 / 60;
        this._respawnTimer = 0;
        this._toastTimer = 0;

        this._bindResize();
        this._bindInput();
    }

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
        this.canvas.width = global.innerWidth;
        this.canvas.height = global.innerHeight;
        this.viewport.x = this.canvas.width;
        this.viewport.y = this.canvas.height;
        this._clampCamera();
    };

    Engine.prototype._bindInput = function () {
        var self = this;
        this._onKeyDown = function (e) { self.keydown(e); };
        this._onKeyUp = function (e) { self.keyup(e); };
        global.addEventListener('keydown', this._onKeyDown);
        global.addEventListener('keyup', this._onKeyUp);
    };

    /* Maps key codes -> engine inputs. Supports arrows, WASD, space. */
    var KEYMAP = {
        32: 'jump', 38: 'jump', 87: 'jump',   /* space, up, W */
        37: 'left', 65: 'left',               /* left, A */
        39: 'right', 68: 'right',             /* right, D */
        40: 'down', 83: 'down'
    };

    Engine.prototype.keydown = function (e) {
        var action = KEYMAP[e.keyCode] || KEYMAP[e.which];
        if (!action) return;
        e.preventDefault && e.preventDefault();
        this._setInput(action, true);
        if (this.state === 'menu') this.begin();
        if (e.keyCode === 27 && (this.state === 'play' || this.state === 'paused')) this.togglePause();
    };

    Engine.prototype.keyup = function (e) {
        var action = KEYMAP[e.keyCode] || KEYMAP[e.which];
        if (!action) return;
        e.preventDefault && e.preventDefault();
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

    /* Public API for DOM buttons / touch controls. */
    Engine.prototype.setMove = function (dir, pressed) {
        this._setInput(dir, pressed);
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

        /* Tile object lookup by id */
        var keyById = {};
        map.keys.forEach(function (k) { keyById[k.id] = k; });

        var self = this;
        this.grid = map.data.map(function (row, y) {
            return row.map(function (cell, x) {
                var id = (typeof cell === 'object') ? cell.id : cell;
                var tile = keyById[id] || { id: id, type: 'empty' };
                return tile;
            });
        });

        /* Derive world size in pixels */
        this.mapWidth = this.grid[0].length * this.tile_size;
        this.mapHeight = this.grid.length * this.tile_size;

        /* Physical constants with sane defaults */
        this.gravity = map.gravity || { x: 0, y: 0.25 };
        this.velLimit = map.vel_limit || { x: 3, y: 13 };
        this.moveSpeed = map.movement_speed || { jump: 6.5, left: 0.4, right: 0.4, air: 0.35 };

        /* Reset state */
        this.coins = [];
        this.enemies = [];
        this.checkpoints = [];
        this.goal = null;
        this.score = 0;
        this.coinsCollected = 0;
        this.coinsTotal = 0;
        this.lives = map.lives || 3;
        this.timePlayed = 0;

        this._scanEntities();
        this._buildBackground();

        /* Player start */
        var sx, sy;
        map.player = map.player || {};
        sx = (typeof map.player.x === 'number') ? map.player.x : (this._startSpot ? this._startSpot.x : 2);
        sy = (typeof map.player.y === 'number') ? map.player.y : (this._startSpot ? this._startSpot.y : 2);
        this.player.colour = map.player.colour || '#3D5AFE';
        this.player.w = this.tile_size * 0.7;
        this.player.h = this.tile_size * 0.9;
        this.spawnPlayer(sx * this.tile_size, sy * this.tile_size);
        this.respawn = { x: this.player.x, y: this.player.y };

        /* Broadcast fresh state */
        this._pushHud();
        this._log('Successfully loaded map "' + (map.name || 'unnamed') + '".');
        return true;
    };

    /* Turn tile cells carrying special id's into entities. */
    Engine.prototype._scanEntities = function () {
        var self = this;
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
                            speed: (tile.speed || 28), /* pixels per second */
                            startX: px,
                            dead: false,
                            squash: 1,
                            type: tile.enemyType || 'walker'
                        });
                        this.grid[y][x] = { id: tile.id, type: 'empty' };
                        break;
                }
            }
        }
    };

    Engine.prototype._buildBackground = function () {
        /* Deterministic decorative layer (clouds, hills, bushes) so the
           parallax backdrop is stable across frames. */
        var self = this;
        this.bg = { clouds: [], hills: [], bushes: [] };
        var rng = function (i) { return hash2(i, 7); };
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

    Engine.prototype.spawnPlayer = function (x, y) {
        this.player.x = x;
        this.player.y = y;
        this.player.vx = 0;
        this.player.vy = 0;
        this.player.alive = true;
        this.player.invuln = 0;
        this.player.canJump = true;
        this.player.coyote = 0;
        this.player.jumpBuffer = 0;
        this.player.squash = 1;
        this.player.dir = 1;
        this.player._wasInWater = false;
        this.camera.x = x - this.viewport.x / 2 + this.player.w / 2;
        this.camera.y = y - this.viewport.y / 2 + this.player.h / 2;
        this.cameraTarget.x = this.camera.x;
        this.cameraTarget.y = this.camera.y;
        this._clampCamera();
    };

    /* ==========================================================================
     *  Tile queries
     * ======================================================================== */

    Engine.prototype.tileAt = function (tx, ty) {
        if (ty < 0 || ty >= this.grid.length || tx < 0 || tx >= this.grid[0].length) {
            /* Treat out-of-bounds below the map as solid floor to avoid falling
               forever; elsewhere empty. */
            return (ty >= this.grid.length) ? { type: 'solid', solid: true, id: -1 } : { id: -1, type: 'empty' };
        }
        return this.grid[ty][tx];
    };

    Engine.prototype.isSolid = function (tile) {
        return tile && (tile.solid === 1 || tile.solid === true || tile.type === 'solid' || tile.type === 'spring');
    };

    Engine.prototype.tileAtPx = function (px, py) {
        return this.tileAt(Math.floor(px / this.tile_size), Math.floor(py / this.tile_size));
    };

    /* ==========================================================================
     *  Game state helpers
     * ======================================================================== */

    Engine.prototype.begin = function () {
        if (this.state === 'menu') {
            this.state = 'play';
            this.audio.ensure();
            this.audio.startMusic();
            this._hide('start-screen');
            this._popHud('score');
        }
    };

    Engine.prototype.togglePause = function () {
        if (this.state === 'play') {
            this.state = 'paused';
            this._show('pause-screen');
        } else if (this.state === 'paused') {
            this.resumeGame();
        }
    };

    Engine.prototype.resumeGame = function () {
        if (this.state === 'paused') {
            this.state = 'play';
            this._hide('pause-screen');
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
        this.audio.win();
        this._confetti();
        if (this.score > this.maxScore) {
            this.maxScore = this.score;
            localStorage.setItem('platformer_maxScore', String(this.maxScore));
        }
        this._show('win-screen');
        this._countUp('win-score', Math.max(0, this.score - 500), this.score);
        this._fill('win-coins', this.coinsCollected + ' / ' + this.coinsTotal);
        this._fill('win-time', this._formatTime(this.timePlayed));
        this._fill('win-best', String(this.maxScore));
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
        this._popHud('coins');
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
        enemy.dead = true;
        this.enemies.splice(this.enemies.indexOf(enemy), 1);
        this.player.vy = -this.moveSpeed.jump * 0.55;
        this.score += 250;
        this.audio.stomp();
        this._burst(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, {
            count: 16, colour: '#9b6bff', speedMin: 1.5, speedMax: 4, life: 0.6, gravity: 0.12
        });
        this._popHud('score');
    };

    /* ==========================================================================
     *  Toast / screen helpers
     * ======================================================================== */

    Engine.prototype._toast = function (msg) {
        var el = this._q('#toast');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('show');
        this._toastTimer = 1.6;
    };

    Engine.prototype._q = function (sel) { return document.querySelector(sel); };
    Engine.prototype._show = function (id) {
        var el = typeof id === 'string' ? document.getElementById(id) : id;
        if (el) { el.classList.add('visible'); el.classList.remove('hidden'); }
    };
    Engine.prototype._hide = function (id) {
        var el = typeof id === 'string' ? document.getElementById(id) : id;
        if (el) { el.classList.remove('visible'); el.classList.add('hidden'); }
    };
    Engine.prototype._fill = function (id, text) {
        var el = document.getElementById(id);
        if (el) el.textContent = text;
    };
    Engine.prototype._hideAllOverlays = function () {
        ['start-screen', 'pause-screen', 'win-screen', 'gameover-screen'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) { el.classList.remove('visible'); el.classList.add('hidden'); }
        });
    };
    Engine.prototype._popHud = function (which) {
        var sel = which === 'score' ? '#score' : which === 'coins' ? '#coins' : null;
        if (!sel) return;
        var el = this._q(sel);
        if (!el) return;
        el.classList.remove('pop');
        void el.offsetWidth; /* force reflow to retrigger animation */
        el.classList.add('pop');
    };
    Engine.prototype._pushHud = function () {
        this._fill('score', String(this.score));
        this._fill('coins', this.coinsCollected + ' / ' + this.coinsTotal);
        this._fill('lives', String(this.lives));
    };

    /* ==========================================================================
     *  Physics
     * ======================================================================== */

    Engine.prototype.update = function (dt) {
        var step = dt || 1 / 60;
        this.dt = step;

        /* Global timers that always run */
        if (this.shake.t > 0) this.shake.t -= step;
        if (this._toastTimer > 0) {
            this._toastTimer -= step;
            if (this._toastTimer <= 0) {
                var toast = this._q('#toast');
                if (toast) toast.classList.remove('show');
            }
        }

        this._updateTweens(step);
        this.particles.update();

        /* Pause / menu freeze gameplay */
        if (this.state === 'play') {
            this.timePlayed += step;
            /* jump buffer / coyote timers */
            if (this.player.jumpBuffer > 0) this.player.jumpBuffer -= step;
            if (this.player.coyote > 0) this.player.coyote -= step;
            if (this.player.invuln > 0) this.player.invuln -= step;

            this._updateWater();
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
                    this._show('gameover-screen');
                    this._countUp('final-score', Math.max(0, this.score - 500), this.score);
                    this._fill('final-coins', this.coinsCollected + ' / ' + this.coinsTotal);
                } else {
                    this.resetToCheckpoint();
                }
            }
        }
    };

    Engine.prototype._updateWater = function () {
        /* Measure fresh / submerge state below player */
        var feet = this.player.y + this.player.h;
        var t = this.tileAtPx(this.player.x + this.player.w / 2, feet + 1);
        this.player.inWater = t && t.type === 'water';
        if (this.player.inWater && !this.player._wasInWater) {
            this.audio.hit();
            this._burst(this.player.x + this.player.w / 2, feet, {
                count: 14, colour: '#7adcf2', speedMin: 1, speedMax: 4, life: 0.5, gravity: 0.02
            });
        }
        this.player._wasInWater = this.player.inWater;
    };

    Engine.prototype._updatePlayer = function () {
        var p = this.player;
        var mp = this.moveSpeed;
        var vl = this.velLimit;
        var input = this.input;

        /* --- Horizontal movement --- */
        var ax = 0;
        if (input.left) { ax -= mp.left; p.dir = -1; }
        if (input.right) { ax += mp.right; p.dir = 1; }

        if (ax !== 0) {
            if (p.onFloor) p.vx += ax;
            else p.vx += ax * (mp.air || 0.35);
            p.vx = clamp(p.vx, -vl.x, vl.x);
        } else {
            /* Friction */
            var fric = p.onFloor ? 0.82 : 0.95;
            p.vx *= fric;
            if (Math.abs(p.vx) < 0.05) p.vx = 0;
        }

        /* --- Jumping --- */
        /* A buffered jump (press shortly before landing) always fires; the key
           doesn't have to still be held, but holding it gives a higher arc. */
        var grounded = p.onFloor || (p.coyote > 0);
        if (p.jumpBuffer > 0 && grounded) {
            p.vy = -mp.jump;
            p.coyote = 0;
            p.jumpBuffer = 0;
            p.squash = 1.3;
            this.audio.jump();
            this._burst(p.x + p.w / 2, p.y + p.h, {
                count: 8, colour: 'rgba(255,255,255,0.7)', speedMin: 0.5, speedMax: 2, life: 0.3, gravity: -0.01
            });
        }

        /* --- Gravity (variable jump height) --- */
        var g = this.gravity.y;
        if (p.inWater) g *= 0.4;
        else if (input.jump && p.vy < 0) g *= 0.5; /* hold jump for higher arc */
        p.vy += g;
        p.vy = clamp(p.vy, -vl.y, vl.y);

        /* --- Integrate + collide --- */
        /* Reset the grounded flag; _moveY re-detects it from tile contact. This
           correctly handles running off a ledge (coyote time covers the gap). */
        var wasGrounded = p.onFloor;
        p.onFloor = false;
        this._moveX();
        var landed = this._moveY(wasGrounded);

        /* Landing feedback (squash + dust) fires only on an airborne->grounded
           transition, not every frame the player stays on the floor. */
        if (landed) {
            p.squash = 0.7;
            this._burst(p.x + p.w / 2, p.y + p.h, {
                count: 6, colour: 'rgba(255,255,255,0.6)', speedMin: 0.5, speedMax: 2, life: 0.3, gravity: -0.02
            });
        }

        /* Keep the player inside the level bounds (safety net so they can never
           wander beyond the world into the void). */
        p.x = clamp(p.x, 0, Math.max(0, this.mapWidth - p.w));
        p.y = clamp(p.y, -this.tile_size, Math.max(0, this.mapHeight - p.h));
    };

    Engine.prototype._collideSolid = function (tx, ty) { return this.isSolid(this.tileAt(tx, ty)); };

    Engine.prototype._moveX = function () {
        var p = this.player, tl = this.tile_size;
        p.x += p.vx;
        var minY = Math.floor(p.y / tl), maxY = Math.floor((p.y + p.h - 0.001) / tl);
        if (p.vx > 0) {
            var tx = Math.floor((p.x + p.w) / tl);
            for (var ty = minY; ty <= maxY; ty++) {
                if (this._collideSolid(tx, ty)) {
                    p.x = tx * tl - p.w;
                    p.vx = 0;
                    break;
                }
            }
        } else if (p.vx < 0) {
            var tx2 = Math.floor(p.x / tl);
            for (var ty2 = minY; ty2 <= maxY; ty2++) {
                if (this._collideSolid(tx2, ty2)) {
                    p.x = (tx2 + 1) * tl;
                    p.vx = 0;
                    break;
                }
            }
        }
    };

    Engine.prototype._moveY = function (wasGrounded) {
        var p = this.player, tl = this.tile_size;
        var landed = false;
        p.y += p.vy;
        var minX = Math.floor(p.x / tl), maxX = Math.floor((p.x + p.w - 0.001) / tl);

        if (p.vy >= 0) {
            /* Moving down (or resting) — land on solid / spring tiles */
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
                        p.squash = 1.4;
                        this.audio.spring();
                        this._burst(p.x + p.w / 2, p.y + p.h, {
                            count: 12, colour: '#d18cff', speedMin: 1, speedMax: 4, life: 0.4, gravity: 0.02
                        });
                    } else {
                        p.vy = 0;
                    }
                    break;
                }
            }
        } else {
            /* Moving up — hit ceiling */
            var ty2 = Math.floor(p.y / tl);
            for (var tx2 = minX; tx2 <= maxX; tx2++) {
                if (this._collideSolid(tx2, ty2)) {
                    p.y = (ty2 + 1) * tl;
                    p.vy = 0;
                    break;
                }
            }
        }

        /* Refresh coyote time whenever we're on the floor. */
        if (p.onFloor) p.coyote = 0.1;

        return landed;
    };

    Engine.prototype._updateEnemies = function () {
        var p = this.player;
        for (var i = 0; i < this.enemies.length; i++) {
            var e = this.enemies[i];
            /* patrol (speed in pixels per second) */
            e.x += e.dir * e.speed * this.dt;
            if (e.x > e.startX + e.range) { e.dir = -1; e.x = e.startX + e.range; }
            if (e.x < e.startX - e.range) { e.dir = 1; e.x = e.startX - e.range; }
            /* squash anim */
            e.squash = lerp(e.squash, 1, 0.2);
        }
    };

    Engine.prototype._updateCollisions = function () {
        var p = this.player;

        if (!p.alive) return;

        /* Deterministic enemy collision handled here. */
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
            /* stomp if falling and player bottom is above enemy's mid */
            if (p.vy > 0.4 && (p.y + p.h) < e.y + e.h * 0.6) {
                this._stompEnemy(e);
            } else if (p.invuln <= 0) {
                this._die('enemy');
            }
        }
    };

    Engine.prototype._handlePickups = function () {
        var p = this.player;
        for (var i = 0; i < this.coins.length; i++) {
            var c = this.coins[i];
            if (c.collected) continue;
            if (this._overlap(p.x, p.y, p.w, p.h, c.x, c.y, this.tile_size, this.tile_size)) {
                this._collectCoin(c);
            }
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
        /* The goal / checkpoint flags are tall: use a vertical trigger zone that
           reaches a couple of tiles above the tile so walking in triggers it. */
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

    Engine.prototype._updateCamera = function () {
        var p = this.player;
        var cx = p.x + p.w / 2 - this.viewport.x / 2;
        var cy = p.y + p.h / 2 - this.viewport.y / 2;

        /* Look ahead in direction of travel */
        var look = clamp(p.vx * 8, -40, 40);
        this.lookAhead = lerp(this.lookAhead, look, 0.1);
        cx += this.lookAhead;

        this.cameraTarget.x = cx;
        this.cameraTarget.y = cy;

        /* Smooth follow (lerp) for buttery-smooth tween feel */
        this.camera.x = lerp(this.camera.x, cx, 0.12);
        this.camera.y = lerp(this.camera.y, cy, 0.12);

        this._clampCamera();
    };

    Engine.prototype._clampCamera = function () {
        if (!this.limit_viewport) return;
        if (this.mapWidth === undefined || this.mapHeight === undefined) return;
        var scale = this._worldScale();
        var vwWorld = this.viewport.x / scale;
        var vhWorld = this.viewport.y / scale;
        this.camera.x = clamp(this.camera.x, 0, Math.max(0, this.mapWidth - vwWorld));
        this.camera.y = clamp(this.camera.y, 0, Math.max(0, this.mapHeight - vhWorld));
        this.cameraTarget.x = clamp(this.cameraTarget.x, 0, Math.max(0, this.mapWidth - vwWorld));
        this.cameraTarget.y = clamp(this.cameraTarget.y, 0, Math.max(0, this.mapHeight - vhWorld));
    };

    Engine.prototype._shake = function (dur, mag) {
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
            for (var k in tw.to) {
                if (tw.obj && k in tw.obj) tw.obj[k] = lerp(tw.from[k], tw.to[k], eased);
            }
            if (tw.onUpdate) tw.onUpdate(tw.obj, eased, p);
            if (p >= 1) {
                this.tweens.splice(i, 1);
                if (tw.onComplete) tw.onComplete();
            }
        }
    };

    /* Animate a DOM number counting up from `from` to `to` (score reveal). */
    Engine.prototype._countUp = function (elId, from, to) {
        var self = this;
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

    Engine.prototype.draw = function () {
        var ctx = this.ctx;
        if (!ctx) return;
        ctx.clearRect(0, 0, this.viewport.x, this.viewport.y);

        var scale = this._worldScale();
        var sx = this.shake.t > 0 ? (Math.random() * 2 - 1) * (this.shake.mag * this.shake.t / this.shake.dur) : 0;
        var sy = this.shake.t > 0 ? (Math.random() * 2 - 1) * (this.shake.mag * this.shake.t / this.shake.dur) : 0;

        ctx.save();
        ctx.scale(scale, scale);
        ctx.translate(-this.camera.x + sx, -this.camera.y + sy);

        this._drawBackground(ctx);
        this._drawTiles(ctx);
        this._drawCoins(ctx);
        this._drawCheckpoints(ctx);
        this._drawGoal(ctx);
        this._drawEnemies(ctx);
        if (this.player.alive && this.state !== 'menu') this._drawPlayer(ctx);
        if (this.player.inWater && this.player.alive) this._drawWaterHighlight(ctx);
        this.particles.draw(ctx);

        ctx.restore();
    };

    Engine.prototype._drawBackground = function (ctx) {
        var tl = this.tile_size;
        var scale = this._worldScale();

        /* Screen-fixed sky gradient (the gradient tracks the camera so it never
           visibly scrolls with the world). */
        var topY = this.camera.y - tl;
        var botY = topY + this.viewport.y / scale + tl * 2;
        var grad = ctx.createLinearGradient(0, topY, 0, botY);
        grad.addColorStop(0, '#8fd1ff');
        grad.addColorStop(0.55, '#bfe9ff');
        grad.addColorStop(1, '#e3f6ff');
        ctx.fillStyle = grad;
        ctx.fillRect(this.camera.x - tl, topY, this.viewport.x / scale + tl * 2, this.viewport.y / scale + tl * 2);

        if (!this.bg) return;

        /* Far clouds (slow parallax, factor 0.15). We draw them in world space
           *after* the -camera translate, so we add `camera*(1-factor)` to keep
           their apparent motion slower than the world. */
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

        /* Rolling hills (medium parallax, factor 0.4). */
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

        /* Foreground bushes (near parallax, factor 0.75). */
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

        for (var y = startY; y <= endY; y++) {
            for (var x = startX; x <= endX; x++) {
                var tile = this.tileAt(x, y);
                if (!tile || !tile.type || tile.type === 'empty') continue;
                this._drawTile(ctx, x * tl, y * tl, tile);
            }
        }
    };

    Engine.prototype._drawTile = function (ctx, px, py, tile) {
        var tl = this.tile_size;
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
            case 'deco':
                /* small flower / bush, drawn subtle */
                ctx.fillStyle = tile.fill || '#6bbf4b';
                ctx.beginPath();
                ctx.arc(px + tl / 2, py + tl * 0.65, tl * 0.3, 0, TAU);
                ctx.fill();
                break;
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
        /* glow */
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
            ctx.scale(e.dir, 1);
            /* body */
            ctx.fillStyle = '#9b6bff';
            ctx.beginPath();
            ctx.ellipse(0, 0, e.w * 0.42, e.h * 0.42, 0, 0, TAU);
            ctx.fill();
            /* eye */
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath();
            ctx.arc(e.w * 0.15, -e.h * 0.08, e.w * 0.12, 0, TAU);
            ctx.fill();
            ctx.fillStyle = '#222';
            ctx.beginPath();
            ctx.arc(e.w * 0.17, -e.h * 0.08, e.w * 0.05, 0, TAU);
            ctx.fill();
            /* feet */
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
        if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) return; /* blink when invulnerable */
        var cx = p.x + p.w / 2;
        var cy = p.y + p.h / 2;
        var stretch = p.squash;
        var sx = 1 / stretch;
        var sy = stretch;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(sx, sy);
        /* body */
        ctx.fillStyle = p.colour;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.w * 0.42, p.h * 0.42, 0, 0, TAU);
        ctx.fill();
        /* highlight */
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.ellipse(-p.w * 0.12, -p.h * 0.12, p.w * 0.2, p.h * 0.18, 0, 0, TAU);
        ctx.fill();
        /* eyes */
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

        /* squash recovers to 1 */
        p.squash = approach(p.squash, 1, 0.12);
    };

    Engine.prototype._drawWaterHighlight = function (ctx) {
        var p = this.player, tl = this.tile_size;
        ctx.fillStyle = 'rgba(90,180,230,0.25)';
        ctx.fillRect(p.x - 2, p.y, p.w + 4, p.h);
    };

    Engine.prototype._updateTimerHud = function () {
        var el = document.getElementById('timer');
        if (el) el.textContent = this._formatTime(this.timePlayed);
    };

    Engine.prototype._formatTime = function (t) {
        var m = Math.floor(t / 60);
        var s = Math.floor(t % 60);
        return m + ':' + (s < 10 ? '0' : '') + s;
    };

    /* Effects */
    Engine.prototype._burst = function (x, y, opts) { this.particles.spawn(x, y, opts); };
    Engine.prototype._confetti = function () {
        for (var i = 0; i < 5; i++) {
            this.particles.spawn(this.camera.x + this.viewport.x / 2, this.camera.y + 30, {
                count: 14, colour: ['#ff7043', '#ffd54a', '#4bdc8a', '#73c6fa', '#e373fa'][i % 5],
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
            if (dt > 0.1) dt = 0.1; /* clamp huge pauses (tab switch) */
            self.accumulator += dt;
            /* Fixed timestep + interpolation-ready accumulator */
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
        if (this.rafId) global.cancelAnimationFrame(this.rafId);
    };

    Engine.prototype._log = function (msg) { if (this.log_info) console.log(msg); };

    /* Legacy compatibility wrappers (kept so older integrations still work). */
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

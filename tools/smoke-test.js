#!/usr/bin/env node
/* ============================================================================
 *  Headless smoke test for the Platformer engine.
 *
 *  This stubs the browser globals (window, document, canvas, localStorage,
 *  requestAnimationFrame, performance) and then loads level1.json, simulates
 *  playing the level with a simple scripted controller, and checks that the
 *  engine never throws, physics stay finite, and the player makes progress.
 *
 *  Usage:
 *    node tools/smoke-test.js
 * ============================================================================ */

'use strict';

var fs = require('fs');
var path = require('path');

/* ---------------------------------------------------------------------- *
 *  Stub DOM / browser environment
 * ---------------------------------------------------------------------- */

function makeClassList() {
    var set = {};
    return {
        add: function (c) { set[c] = true; },
        remove: function (c) { delete set[c]; },
        contains: function (c) { return !!set[c]; },
        _set: set
    };
}

function makeElement() {
    var el = {
        classList: makeClassList(),
        textContent: '',
        offsetWidth: 0,
        style: {},
        addEventListener: function () {},
        removeEventListener: function () {}
    };
    return el;
}

/* A canvas 2d context proxy that no-ops every method and stores props. */
function makeCtx() {
    var target = { canvas: null };
    return new Proxy(target, {
        get: function (obj, prop) {
            if (prop === 'canvas') return obj.canvas;
            if (prop in obj) return obj[prop];
            if (typeof prop === 'string') {
                /* gradient objects */
                if (prop === 'createLinearGradient') {
                    return function () {
                        return { addColorStop: function () {} };
                    };
                }
                /* everything else is a method -> no-op function, but also allow
                   property reads that should be numbers/strings */
                return function () {};
            }
            return undefined;
        },
        set: function (obj, prop, val) { obj[prop] = val; return true; }
    });
}

function makeCanvas() {
    var ctx = makeCtx();
    var canvas = {
        width: 800,
        height: 600,
        getContext: function () { return ctx; },
        addEventListener: function () {},
        style: {}
    };
    ctx.canvas = canvas;
    return canvas;
}

/* Build the element registry used by the engine (`document.getElementById`,
   `document.querySelector`). */
var elements = {};
function ensureEl(id) {
    if (!elements[id]) elements[id] = makeElement();
    return elements[id];
}

var rafQueue = [];
var localStorage = {
    _store: {},
    getItem: function (k) { return this._store[k] || null; },
    setItem: function (k, v) { this._store[k] = String(v); }
};

var documentStub = {
    getElementById: function (id) { return ensureEl(id); },
    querySelector: function (sel) { return ensureEl(sel.replace(/^#/, '')); },
    querySelectorAll: function () { return []; },
    createElement: function () { return makeElement(); },
    addEventListener: function () {},
    documentElement: makeElement(),
    body: makeElement()
};

global.document = documentStub;
global.localStorage = localStorage;
global.window = global;
global.innerWidth = 800;
global.innerHeight = 600;
global.addEventListener = function () {};
global.removeEventListener = function () {};
global.requestAnimationFrame = function (cb) { rafQueue.push(cb); return rafQueue.length; };
global.cancelAnimationFrame = function () {};
global.performance = { now: function () { return nowMs; } };
global.alert = function (msg) { throw new Error('alert() should never be called: ' + msg); };

/* ---------------------------------------------------------------------- *
 *  Load engine
 * ---------------------------------------------------------------------- */
var engineSrc = fs.readFileSync(path.join(__dirname, '..', 'engine.js'), 'utf8');
var levelPath = process.argv[2] || path.join(__dirname, '..', 'level1.json');
var level = JSON.parse(fs.readFileSync(levelPath, 'utf8'));

eval(engineSrc);
var Engine = global.Engine;
if (!Engine) { console.error('ENGINE NOT DEFINED'); process.exit(1); }

/* ---------------------------------------------------------------------- *
 *  Run the engine
 * ---------------------------------------------------------------------- */
var nowMs = 0;
var canvas = makeCanvas();
var game = new Engine(canvas);
game.set_viewport(800, 600);
game.load_map(level);
game.state = 'play'; /* bypass menu */
console.log('Loaded "' + level.name + '"  tiles=' + game.mapWidth + 'x' + game.mapHeight +
    '  coins=' + game.coinsTotal + '  enemies=' + game.enemies.length);

var failures = [];
function assert(cond, msg) {
    if (!cond) { failures.push(msg); console.error('FAIL: ' + msg); }
}

/* Drive the fixed-timestep update manually, stepping a real rAF loop. */
function step(dt) {
    nowMs += dt * 1000;
    game.update(dt);
    game.draw();
}

/* --- Helper: run N frames pressing keys --- */
function hold(key, frames) {
    game._setInput(key, true);
    for (var i = 0; i < frames; i++) step(1 / 60);
    game._setInput(key, false);
}

/* Boot a few frames */
for (var b = 0; b < 10; b++) step(1 / 60);
assert(isFinite(game.player.x) && isFinite(game.player.y), 'player pos should be finite');
assert(isFinite(game.player.vx) && isFinite(game.player.vy), 'player vel should be finite');

/* Simple controller: run right and jump occasionally; also test a full rAF
   loop to make sure the render path executes. */
var simFrames = 60 * 15;
var playerStartX = game.player.x;
var maxX = playerStartX;
var scoreBefore = game.score;
try {
    for (var f = 0; f < simFrames; f++) {
        game._setInput('right', true);
        if (f % 45 === 0 && game.player.onFloor) game._setInput('jump', true);
        step(1 / 60);
        if (f % 45 === 0) game._setInput('jump', false);
        if (game.player.x > maxX) maxX = game.player.x;
        if (!isFinite(game.player.x) || !isFinite(game.player.y)) break;
        /* If we reached the goal, stop early */
        if (game.state === 'won') break;
    }
} catch (e) {
    console.error('CRASH during simulation:', e && e.stack || e);
    process.exit(1);
}

console.log('After sim: state=' + game.state + '  playerX=' + game.player.x.toFixed(1) +
    '  maxX=' + maxX.toFixed(1) + '  score=' + game.score +
    '  coins=' + game.coinsCollected + '/' + game.coinsTotal + '  lives=' + game.lives);
assert(game.state === 'play' || game.state === 'won', 'should not be stuck/undefined state');
assert(maxX > playerStartX + 20, 'player should move right (' + maxX.toFixed(1) + ')');
assert(isFinite(game.player.x) && isFinite(game.player.y), 'player stayed finite');

/* Exercise a full rAF loop end-to-end (render + update) */
try {
    var loopFn = rafQueue.shift();
    for (var r = 0; r < 5; r++) {
        nowMs += 16;
        var cb = rafQueue.shift();
        if (cb) cb(nowMs);
    }
} catch (e) {
    console.error('CRASH in rAF loop:', e && e.stack || e);
    process.exit(1);
}

/* Exercise death & respawn */
game._die('test');
for (var d = 0; d < 120; d++) step(1 / 60);
assert(game.lives < 3 || game.state !== 'play', 'death handling ran');

/* Win path: force reach goal */
game.spawnPlayer(game.goal.x, game.goal.y - 4);
game.state = 'play';
for (var w = 0; w < 20; w++) step(1 / 60);
assert(game.state === 'won', 'goal should trigger win, got ' + game.state);

/* State transitions & API: restart, pause/resume, menu, mute, begin */
try {
    game.restart();
    assert(game.state === 'play', 'restart should enter play');
    game.togglePause();
    assert(game.state === 'paused', 'pause should enter paused');
    game.resumeGame();
    assert(game.state === 'play', 'resume should return to play');
    game.goToMenu();
    assert(game.state === 'menu', 'goToMenu should enter menu');
    game.begin();
    assert(game.state === 'play', 'begin should enter play');
    game.audio.setMuted(true);
    assert(game.audio.isMuted(), 'mute should be reflected');
    game.audio.setMuted(false);
    assert(!game.audio.isMuted(), 'unmute should be reflected');

    /* Make sure the rAF loop keeps running cleanly after all that */
    for (var f2 = 0; f2 < 30; f2++) step(1 / 60);
} catch (e) {
    console.error('CRASH in state transitions:', e && e.stack || e);
    process.exit(1);
}

if (failures.length === 0) {
    console.log('\nSMOKE TEST PASSED ?');
    process.exit(0);
} else {
    console.error('\nSMOKE TEST FAILED — ' + failures.length + ' issue(s)');
    process.exit(1);
}

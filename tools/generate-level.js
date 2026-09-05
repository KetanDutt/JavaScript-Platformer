#!/usr/bin/env node
/* ============================================================================
 *  Builds level1.json for the Platformer engine.
 *
 *  Usage:
 *    node tools/generate-level.js > level1.json
 *
 *  This authoring tool lets you design levels with comfortable helper
 *  functions (fill, rect, platform) instead of hand-writing huge JSON arrays.
 *  The output is a standard level JSON consumed by engine.js.
 *
 *  Tile ids (see engine.js / docs/level-authoring.md):
 *    0  empty            1  grass (solid)     2  dirt (solid)
 *    3  stone (solid)    4  coin              5  spike (hazard)
 *    6  spring (bounce)  7  checkpoint        8  goal flag
 *    9  water            10 deco flower       11 start marker
 *    12 crate (solid)    13 enemy (patrol)
 * ============================================================================ */

'use strict';

var WIDTH = 96;
var HEIGHT = 26;
var TILE = 16;

/* --- Build an empty grid --- */
var grid = [];
for (var y = 0; y < HEIGHT; y++) {
    grid.push(new Array(WIDTH).fill(0));
}

/* Helper setters (x, y are tile coordinates, y grows downward) */
function set(x, y, id) {
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) grid[y][x] = id;
}
function rect(x1, y1, x2, y2, id) {
    for (var yy = y1; yy <= y2; yy++)
        for (var xx = x1; xx <= x2; xx++) set(xx, yy, id);
}
function platform(x, y, w, id) { rect(x, y, x + w - 1, y, id); }

/* ========================================================================
 *  Terrain — base ground across the level with a surface grass layer.
 * ======================================================================== */
rect(0, HEIGHT - 3, WIDTH - 1, HEIGHT - 3, 2);      /* top dirt row */
rect(0, HEIGHT - 2, WIDTH - 1, HEIGHT - 1, 2);      /* deeper dirt */
for (var x = 0; x < WIDTH; x++) set(x, HEIGHT - 3, 1); /* grass surface */

/* ========================================================================
 *  Raised grassy mounds (a bit of gentle terrain)
 * ======================================================================== */
function mound(cx, w, h, topId) {
    for (var yy = HEIGHT - 4; yy >= HEIGHT - 4 - h; yy--) {
        platform(cx - w, yy, w * 2, 2);
    }
    platform(cx - w, HEIGHT - 4 - h, w * 2, topId || 1);
}
mound(8, 3, 1);        /* near start */
mound(46, 4, 2);
mound(78, 3, 1);

/* ========================================================================
 *  Floating platforms to collect coins
 * ======================================================================== */
platform(16, 17, 4, 3);
platform(16, 13, 3, 3);
platform(24, 15, 5, 3);
platform(34, 12, 4, 3);
platform(52, 16, 5, 3);
platform(62, 14, 4, 3);
platform(70, 17, 4, 3);

/* ========================================================================
 *  Coins
 * ======================================================================== */
function coinRow(x1, y1, x2, y2) {
    for (var yy = y1; yy <= y2; yy++)
        for (var xx = x1; xx <= x2; xx++) set(xx, yy, 4);
}
coinRow(17, 14, 19, 14);
coinRow(18, 11, 20, 11);
coinRow(9, 18, 11, 18);
coinRow(26, 12, 30, 12);
coinRow(35, 10, 38, 10);
coinRow(41, 19, 44, 19);
coinRow(53, 13, 57, 13);
coinRow(63, 12, 66, 12);
coinRow(83, 19, 86, 19);
coinRow(30, 20, 34, 20);

/* ========================================================================
 *  Spike pit (must jump across)
 * ======================================================================== */
set(28, HEIGHT - 3, 5); set(29, HEIGHT - 3, 5); set(30, HEIGHT - 3, 5);
set(31, HEIGHT - 3, 5);
/* floating escape platform above the spikes */
platform(27, 20, 3, 3);

/* ========================================================================
 *  Spring up to a bonus ledge
 * ======================================================================== */
set(40, HEIGHT - 3, 6);                      /* spring on ground */
platform(39, 18, 4, 3);                      /* landing ledge */

/* ========================================================================
 *  Shallow water section (low gravity)
 * ======================================================================== */
for (var wx = 58; wx <= 61; wx++) {
    set(wx, HEIGHT - 3, 9);                  /* water sits in the channel */
    set(wx, HEIGHT - 2, 9);
}
platform(56, HEIGHT - 3, 2, 2);              /* entry lip */
platform(63, HEIGHT - 3, 2, 2);              /* exit lip */

/* ========================================================================
 *  Stairs / crate blocks near the end for a little climb
 * ======================================================================== */
platform(88, HEIGHT - 4, 3, 2);
platform(90, HEIGHT - 5, 3, 2);
platform(92, HEIGHT - 6, 3, 2);

/* ========================================================================
 *  Decorations (flowers / bushes on surfaces)
 * ======================================================================== */
set(6, HEIGHT - 4, 10);
set(39, HEIGHT - 4, 10);
set(50, HEIGHT - 4, 10);
set(72, HEIGHT - 4, 10);
set(85, HEIGHT - 4, 10);

/* ========================================================================
 *  Start marker & goal flag
 * ======================================================================== */
set(2, HEIGHT - 4, 11);                      /* start marker */
set(95, HEIGHT - 3, 8);                      /* goal flag at far right */

/* ========================================================================
 *  Checkpoints (id 7) — mid-level respawn flags
 * ======================================================================== */
set(36, HEIGHT - 3, 7);                      /* after the spike pit */
set(63, HEIGHT - 3, 7);                      /* after the water section */
set(86, HEIGHT - 3, 7);                      /* before the final stairs */

/* ========================================================================
 *  Enemy spawns (id 13). range in tiles, speed in px/s.
 * ======================================================================== */
set(44, HEIGHT - 3, 13);                     /* patrol on the main path */
set(72, HEIGHT - 3, 13);

/* ========================================================================
 *  Tile keys
 * ======================================================================== */
var keys = [
    { "id": 0, "type": "empty" },
    { "id": 1, "type": "solid", "fill": "#6bbf4b", "top": "#8fd96a" },
    { "id": 2, "type": "solid", "fill": "#8b5a2b", "top": "#a9744a" },
    { "id": 3, "type": "solid", "fill": "#7d7d86", "top": "#9a9aa3" },
    { "id": 4, "type": "coin" },
    { "id": 5, "type": "hazard" },
    { "id": 6, "type": "spring", "bounce": 9 },
    { "id": 7, "type": "checkpoint" },
    { "id": 8, "type": "goal" },
    { "id": 9, "type": "water" },
    { "id": 10, "type": "deco", "fill": "#f4a3c0" },
    { "id": 11, "type": "start" },
    { "id": 12, "type": "solid", "fill": "#c89b5a", "top": "#dcb67a" },
    { "id": 13, "type": "enemy", "dir": 1, "range": 3, "speed": 28, "enemyType": "walker" }
];

/* Player start position in tile coordinates. */
var startX = 2, startY = HEIGHT - 4;

/* ========================================================================
 *  Assemble level object
 * ======================================================================== */
var level = {
    "name": "Green Hills",
    "tile_size": TILE,
    "keys": keys,
    "data": grid,
    "gravity": { "x": 0, "y": 0.25 },
    "vel_limit": { "x": 3.0, "y": 13 },
    "movement_speed": { "jump": 6.5, "left": 0.4, "right": 0.4, "air": 0.35 },
    "lives": 3,
    "player": {
        "x": startX + 0.5,
        "y": startY,
        "colour": "#3D5AFE"
    },
    "startId": 11
};

process.stdout.write(JSON.stringify(level, null, 0) + '\n');

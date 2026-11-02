# Audio

Green Hills synthesizes **all sound in code** — there are no audio files.
Everything is generated with the Web Audio API: oscillators for tones, noise
buffers for impacts and splashes, and a look-ahead scheduler for the looping
chiptune soundtrack.

## Architecture

`AudioFX` (in `engine.js`) owns a single `AudioContext` created lazily on the
first user gesture, which satisfies browser autoplay policies. Audio runs
through three gain buses:

| Bus   | Purpose                              |
|-------|--------------------------------------|
| `sfx` | Jump, coin, stomp, hit, splash, etc. |
| `music`| Looping chiptune melody / bass / percussion |
| `duck`| Briefly dips `music` when a big SFX plays |

The SFX and music buses feed into the duck bus, which feeds the master gain
and destination. A simple compressor-lke gain staging keeps loud moments from
clipping.

## Named SFX

Each method checks `sfxEnabled` and `this.ctx` before doing any work, so
muted or uninitialized states are cheap no-ops:

- `jump()`, `doubleJump()` — two rising square/triangle tones
- `coin()`, `heart()`, `star()` — ascending arpeggios
- `stomp()` — low square tone + noise burst
- `spring()` — sawtooth with upward slide + noise
- `hit()`, `death()` — sawtooth + noise
- `splish()` — water entry (noise + short sine)
- `win()` — ascending arpeggio + long high triangle note
- `checkpoint()`, `unlock()` — ascending triad arpeggios
- `tick()`, `ui()`, `combo()` — short UI pings
- `whoosh()` — bandpass-filtered sawtooth swoop (available to call, not yet
  wired to a gameplay action)

Each SFX also calls `duck()` to momentarily lower the music so the effect
punches through the mix.

## Music

`startMusic()` begins a `setInterval`-driven scheduler (`_scheduleMusic`) that
looks ahead ~300 ms and plays melody, bass (at 2x frequency), and occasional
percussion notes from fixed scale arrays. `stopMusic()` clears the scheduler.
Music pauses automatically when the game is paused or the tab is hidden
(`visibilitychange` → `togglePause` → `stopMusic`).

## Settings & persistence

- `sfx` / `music` — master toggles (keyboard `M` quick-mutes both)
- `sfxVolume` / `musicVolume` — independent 0–1 levels
- All persisted to `localStorage` and applied through `applySettings()` /
  `refreshGains()`.

## Reduced motion

Under `prefers-reduced-motion` or the Settings reduced-motion toggle, screen
shake, rumble, and heavy particle bursts are disabled. Audio itself is not
disabled — it's a separate SFX/music setting.

## Zero-file constraint

Because every sound is synthesized, the game works fully offline and the
service worker never needs to cache audio assets. If you want to add recorded
SFX later, add them to `AudioFX` as new methods and load them through
`decodeAudioData` — the existing bus/ducking structure will carry them
without other changes.

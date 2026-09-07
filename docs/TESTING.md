# Testing

Green Hills ships with a zero-dependency, headless smoke test that can run in
CI or locally without a browser.

## Run the tests

```bash
npm test           # headless smoke test
npm run check      # syntax checks + smoke test
npm run validate   # rebuild level + full check
```

## What the smoke test checks

`tools/smoke-test.js` stubs `window`, `document`, `canvas`, `localStorage`,
`performance`, and `requestAnimationFrame`, then loads the engine and simulates
play. It asserts:

- The level loads and exposes the expected entities.
- Moving platforms animate over time.
- Hearts restore a life and stars award a bonus.
- Physics stay finite under a scripted controller.
- The player makes progress through the level.
- Death and respawn transitions work.
- The goal triggers a win and awards the `+500` level-complete bonus.
- Restart, pause/resume, menu, mute, and the settings API work.
- The full `requestAnimationFrame` render loop runs without throwing.
- The offscreen static-layer path works in the stubbed environment.

## The test harness

The test's stubbed canvas `getContext` returns a `Proxy` that treats all
properties as no-op methods (except `createLinearGradient` and data props), so
the render path can be exercised without a real browser.

## Manual QA checklist

- Start the game and verify the menu, HUD, and controls.
- Jump, run, and use coyote time / jump buffering.
- Collect coins, hearts, and stars.
- Stomp an enemy and confirm the +250 popup.
- Ride a moving platform and confirm the player is carried.
- Trigger a checkpoint and confirm the respawn point moves.
- Die and confirm invulnerability blink and respawn.
- Reach the goal and confirm the +500 bonus, confetti, and win screen.
- Restart, go to menu, pause/resume, mute/unmute, and fullscreen.
- Toggle settings and confirm they persist after reload.
- Play with a gamepad if available.
- Test on mobile with touch controls.

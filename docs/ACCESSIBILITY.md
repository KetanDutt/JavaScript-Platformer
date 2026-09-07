# Accessibility

Green Hills is built so that more people can enjoy it with minimal disruption
to the game's feel.

## Reduced motion

- The CSS `@media (prefers-reduced-motion: reduce)` rule disables UI animations
  and transitions.
- The engine has a `reducedMotion` setting that:
  - disables screen shake,
  - skips the win confetti,
  - reduces the size of large particle bursts.

You can enable it in the in-game **Settings** panel. It is persisted in
`localStorage`.

## Settings

The Settings panel provides:

- SFX and music **toggles**,
- SFX and music **volume sliders** (independent),
- **Reduced motion** toggle,
- **Show on-screen controls** toggle.

Toggles use `aria-pressed` and the settings grid uses real labels/inputs, so
the menu is keyboard-friendly and screen-reader-friendly.

## Keyboard support

All game actions are reachable from the keyboard:

- `←` / `→` or `A` / `D` to move
- `↑` / `W` / `Space` to jump
- `Esc` to pause
- HUD buttons trigger focusable actions.

## Touch

On-screen controls use pointer events where available, so modern mobile
browsers (and touch-capable laptops) get multi-touch input. Buttons have
`aria-label`.

## Contrast & readability

- HUD chips use a dark translucent background with light text for readability
  over any level.
- Menus have strong text/background contrast.
- The canvas uses bright, high-contrast pickups (coins, hearts, stars) that are
  distinguishable by shape in addition to color.

## Gamepad

Gamepad input is supported via the Web Gamepad API and requires no
configuration:

- D-pad / left stick → move
- A / B / X / Y → jump
- Start → pause

## Future ideas

- Configurable key bindings.
- A color-blind-safe palette mode.
- On-screen text size controls.
- Motion-lock tutorial options for first-time players.

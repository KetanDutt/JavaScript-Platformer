# Accessibility

Green Hills is built so that more people can enjoy it with minimal disruption
to the game's feel.

## Reduced motion

- The CSS `@media (prefers-reduced-motion: reduce)` rule disables UI animations
  and transitions.
- The engine has a `reducedMotion` setting that:
  - disables screen shake,
  - skips the win confetti,
  - reduces the size of large particle bursts,
  - skips the win slow-motion effect.

You can enable it in the in-game **Settings** panel. It is persisted in
`localStorage`.

## Settings

The Settings panel provides:

- SFX and music **toggles**,
- SFX and music **volume sliders** (independent),
- **Particle density** slider (helps on low-end hardware and for users who
  prefer fewer effects),
- **Reduced motion** toggle,
- **Show on-screen controls** toggle,
- **Color-blind friendly mode** toggle (a placeholder for shape-based pickup
  indicators; the engine already uses distinct shapes for coins / hearts /
  stars / flags).

Toggles use `aria-pressed` and the settings grid uses real labels/inputs, so
the menu is keyboard-friendly and screen-reader-friendly.

## Keyboard support

All game actions are reachable from the keyboard:

- `←` / `→` or `A` / `D` to move
- `↑` / `W` / `Space` to jump
- `Esc` to pause
- `M` to mute / unmute
- `F` to toggle fullscreen

HUD buttons trigger focusable actions with visible focus outlines.

## Touch

On-screen controls use pointer events where available, so modern mobile
browsers (and touch-capable laptops) get multi-touch input. Buttons have
`aria-label` and large hit targets.

## Contrast & readability

- HUD chips use a dark translucent background with light text for readability
  over any level.
- Menus have strong text/background contrast.
- The canvas uses bright, high-contrast pickups (coins, hearts, stars) that
  are distinguishable by shape in addition to color.
- The `:focus-visible` outline and `prefers-contrast: more` media query add an
  extra-thick border on focusable elements when the user requests higher
  contrast.

## Gamepad

Gamepad input is supported via the Web Gamepad API and requires no
configuration:

- D-pad / left stick → move
- A / B / X / Y → jump
- Start → pause

## Pause is auto-paused

The engine installs a `visibilitychange` listener. When the tab is hidden, the
game auto-pauses (if the game was in `play`). The player won't lose a life
while the tab is in the background.

## Future ideas

- Configurable key bindings.
- Color-blind-safe palette mode (a stronger version of the current toggle).
- On-screen text size controls.
- Motion-lock tutorial options for first-time players.

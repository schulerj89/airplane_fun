## Enemy AI options

Current behavior in `src/game.ts` `updateEnemies()` always steers each enemy toward a point about 6 units behind the player, plus a small lateral offset. That keeps them glued to the player's tail and makes it hard to fly around them or line up a counter-attack.

### Option 1: Distance-aware pursuit targets

- When far away, steer toward a point ahead of the player instead of behind them.
- When close, switch to a looser pass/crossing target so enemies overshoot instead of perfectly mirroring the player.
- Keep the existing spawn, fire, and despawn systems.

Why it fits this code:
- Only needs local changes in `updateEnemies()` and spawn-time setup.
- Preserves the current `EnemyPlane` model and combat loop.
- Low risk compared with a full behavior tree/state machine.

### Option 2: Reduce steering authority and add turn inertia

- Lower heading/pitch correction rates so enemies cannot instantly stick to the player's movement.
- Optionally add a max turn rate per frame or a temporary banked-turn delay.

Why it fits this code:
- Very small code change.
- Might be enough if the main problem is over-correction.

Risk:
- Enemies may still choose the same behind-the-player anchor, just more slowly.
- This can make them feel sluggish without actually becoming easier to hunt.

### Option 3: Explicit attack-run state machine

- Add states such as `intercept`, `attack-run`, `break-away`, and `re-engage`.
- Enemies would dive in, fire, overshoot, then loop back around.

Why it fits this code:
- Best long-term dogfight behavior.
- Gives clear hooks for difficulty scaling.

Risk:
- Highest implementation cost.
- More moving parts to test and balance.

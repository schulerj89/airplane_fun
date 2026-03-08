## Chosen route

Use Option 1: distance-aware pursuit targets.

Why:
- The current bug comes from the target point being too tightly bound to a single spot behind the player.
- A distance-aware target keeps the current architecture intact while making enemies overshoot and reopen space for the player to chase.
- It is the smallest change that directly addresses the complaint without turning combat into a much larger AI rewrite.

Implementation direction:
- Give each enemy a persistent side bias and preferred engagement distance when spawned.
- In `updateEnemies()`, choose a target ahead of, beside, or slightly behind the player based on current range and relative position.
- Reduce steering tightness slightly so enemies arc through turns instead of snapping onto the player.
- Add a small e2e/debug telemetry hook so tests can validate that enemies are no longer permanently glued to the player's tail.

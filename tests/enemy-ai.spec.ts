import { describe, expect, it } from "vitest";
import { buildEnemyPursuitPlan } from "../src/enemy-ai";

describe("buildEnemyPursuitPlan", () => {
  it("uses an intercept point when the enemy is far behind the player", () => {
    const plan = buildEnemyPursuitPlan({
      distance: 28,
      forwardDistance: 22,
      lateralDistance: 0,
      preferredRange: 16,
      preferredSide: 1,
      behaviorSeed: 0.5,
      behaviorTime: 0
    });

    expect(plan.forwardOffset).toBeGreaterThan(12);
    expect(plan.lateralTarget).toBeGreaterThan(10);
    expect(plan.breakaway).toBe(false);
  });

  it("keeps the target shallow when the enemy is already ahead of the player", () => {
    const plan = buildEnemyPursuitPlan({
      distance: 12,
      forwardDistance: -8,
      lateralDistance: 0,
      preferredRange: 16,
      preferredSide: 1,
      behaviorSeed: 0.5,
      behaviorTime: 0
    });

    expect(plan.forwardOffset).toBeLessThan(4);
    expect(plan.closePass).toBe(true);
  });

  it("adds deterministic wander over time for the same enemy", () => {
    const earlyPlan = buildEnemyPursuitPlan({
      distance: 18,
      forwardDistance: 6,
      lateralDistance: 1,
      preferredRange: 15,
      preferredSide: -1,
      behaviorSeed: 0.23,
      behaviorTime: 0
    });
    const latePlan = buildEnemyPursuitPlan({
      distance: 18,
      forwardDistance: 6,
      lateralDistance: 1,
      preferredRange: 15,
      preferredSide: -1,
      behaviorSeed: 0.23,
      behaviorTime: 6
    });

    expect(Math.abs(latePlan.lateralTarget - earlyPlan.lateralTarget)).toBeGreaterThan(2);
    expect(Math.abs(latePlan.forwardOffset - earlyPlan.forwardOffset)).toBeGreaterThan(0.5);
  });

  it("occasionally creates breakaway passes instead of constant correction", () => {
    const plans = Array.from({ length: 24 }, (_, index) =>
      buildEnemyPursuitPlan({
        distance: 13,
        forwardDistance: 5,
        lateralDistance: 2,
        preferredRange: 14,
        preferredSide: 1,
        behaviorSeed: 0.31,
        behaviorTime: index * 0.5
      })
    );

    const breakawayPlan = plans.find((plan) => plan.breakaway);
    const stablePlan = plans.find((plan) => !plan.breakaway);

    expect(breakawayPlan).toBeDefined();
    expect(stablePlan).toBeDefined();
    expect(Math.abs(breakawayPlan!.lateralTarget)).toBeGreaterThan(Math.abs(stablePlan!.lateralTarget));
    expect(breakawayPlan!.turnResponsiveness).toBeLessThan(stablePlan!.turnResponsiveness);
    expect(breakawayPlan!.speedBias).toBeGreaterThan(stablePlan!.speedBias);
  });
});

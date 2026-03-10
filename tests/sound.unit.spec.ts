import { describe, expect, test } from "vitest";
import { resolveEnemyShotProfile, resolvePlayerShotProfile } from "../src/sound";

describe("shot sound profiles", () => {
  test("player profiles vary by plane and cycle detune offsets", () => {
    const falcon = resolvePlayerShotProfile("falcon", 0);
    const titan = resolvePlayerShotProfile("titan", 1);
    const wraith = resolvePlayerShotProfile("wraith", 2);
    const falconLoop = resolvePlayerShotProfile("falcon", 3);

    expect(falcon.startFrequency).toBeGreaterThan(titan.startFrequency);
    expect(wraith.duration).toBeLessThan(titan.duration);
    expect(falcon.detuneCents).toBe(-26);
    expect(titan.detuneCents).toBe(0);
    expect(wraith.detuneCents).toBe(18);
    expect(falconLoop.detuneCents).toBe(-26);
  });

  test("enemy profile uses a lower shifted variation pattern", () => {
    expect(resolveEnemyShotProfile(0).detuneCents).toBe(-38);
    expect(resolveEnemyShotProfile(1).detuneCents).toBe(-12);
    expect(resolveEnemyShotProfile(2).detuneCents).toBe(6);
  });
});

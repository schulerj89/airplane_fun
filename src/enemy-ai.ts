export interface EnemyPursuitPlan {
  forwardOffset: number;
  lateralTarget: number;
  closePass: boolean;
  breakaway: boolean;
  turnResponsiveness: number;
  speedBias: number;
}

export interface EnemyPursuitInput {
  distance: number;
  forwardDistance: number;
  lateralDistance: number;
  preferredRange?: number;
  preferredSide?: number;
  behaviorSeed?: number;
  behaviorTime?: number;
}

const TWO_PI = Math.PI * 2;

function normalizeSeed(seed: number): number {
  const normalized = seed % 1;
  return normalized < 0 ? normalized + 1 : normalized;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function buildEnemyPursuitPlan({
  distance,
  forwardDistance,
  lateralDistance,
  preferredRange = 16,
  preferredSide = 1,
  behaviorSeed = 0.5,
  behaviorTime = 0
}: EnemyPursuitInput): EnemyPursuitPlan {
  const seed = normalizeSeed(behaviorSeed);
  const closePass = distance < preferredRange * 0.8;
  const lateralScale = 2.2 + Math.min(2.2, preferredRange * 0.12);
  const lateralWander =
    Math.sin(behaviorTime * (0.6 + seed * 0.35) + seed * TWO_PI) * lateralScale +
    Math.sin(behaviorTime * (1.25 + seed * 0.45) + seed * TWO_PI * 2) * lateralScale * 0.45;
  const forwardWander =
    Math.sin(behaviorTime * (0.42 + seed * 0.28) + seed * TWO_PI) * (1.2 + preferredRange * 0.08);
  const breakawayPulse = Math.sin(behaviorTime * (0.34 + seed * 0.18) + seed * TWO_PI);
  const breakaway =
    distance < preferredRange * 1.2 &&
    Math.abs(forwardDistance) < preferredRange * 0.9 &&
    Math.abs(lateralDistance) < preferredRange * 0.85 &&
    breakawayPulse > 0.72;

  let forwardOffset = 2;
  if (distance > preferredRange + 10 || forwardDistance > preferredRange * 0.75) {
    forwardOffset = 10 + preferredRange * 0.45;
  } else if (distance < preferredRange * 0.65) {
    forwardOffset = 8 + preferredRange * 0.4;
  } else if (forwardDistance < -6) {
    forwardOffset = 1.5;
  }

  forwardOffset += forwardWander;
  if (breakaway) {
    forwardOffset -= 2.5;
  }

  let lateralTarget = preferredSide * (6 + Math.min(8, distance * 0.18));
  lateralTarget += lateralWander;
  if (breakaway) {
    lateralTarget += preferredSide * (4.5 + Math.min(3.5, distance * 0.12));
  }

  return {
    forwardOffset: clamp(forwardOffset, -4, 24),
    lateralTarget: clamp(lateralTarget, -18, 18),
    closePass,
    breakaway,
    turnResponsiveness: breakaway ? 0.72 : closePass ? 0.88 : 1.05,
    speedBias: breakaway ? 1.8 : closePass ? 0.8 : 0.15
  };
}

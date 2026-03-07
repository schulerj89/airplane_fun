export type PlaneId = "falcon" | "titan" | "wraith";

export interface PlaneDefinition {
  id: PlaneId;
  name: string;
  tagline: string;
  role: string;
  abilityName: string;
  abilityDescription: string;
  speed: number;
  maxHealth: number;
  fireCooldown: number;
  damage: number;
  color: number;
  accent: number;
}

export const PLANE_DEFINITIONS: PlaneDefinition[] = [
  {
    id: "falcon",
    name: "Falcon",
    tagline: "Fast interceptor with balanced firepower.",
    role: "Interceptor",
    abilityName: "Afterburner Climb",
    abilityDescription: "Fastest takeoff and strong all-round handling once airborne.",
    speed: 26,
    maxHealth: 90,
    fireCooldown: 0.2,
    damage: 12,
    color: 0x7fd1ff,
    accent: 0xf7c548
  },
  {
    id: "titan",
    name: "Titan",
    tagline: "Heavy bruiser with high hull integrity.",
    role: "Assault",
    abilityName: "Siege Frame",
    abilityDescription: "Highest hull and heavy shots, trading speed for staying power.",
    speed: 18,
    maxHealth: 140,
    fireCooldown: 0.34,
    damage: 22,
    color: 0xcfd6de,
    accent: 0xf15b5b
  },
  {
    id: "wraith",
    name: "Wraith",
    tagline: "High-tempo skirmisher with relentless fire.",
    role: "Skirmisher",
    abilityName: "Rapid Burst",
    abilityDescription: "Shortest cooldown, built to keep pressure on enemy formations.",
    speed: 22,
    maxHealth: 80,
    fireCooldown: 0.13,
    damage: 9,
    color: 0x8cffb7,
    accent: 0x6e80ff
  }
];

export const WORLD_BOUNDS = {
  x: 30,
  y: 16
};

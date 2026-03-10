export type PlaneId = "falcon" | "titan" | "wraith";
export type GameModeId = "standard" | "debug";

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

export interface GameModeDefinition {
  id: GameModeId;
  name: string;
  tagline: string;
  description: string;
}

export const PLANE_DEFINITIONS: PlaneDefinition[] = [
  {
    id: "falcon",
    name: "Falcon",
    tagline: "Fast scout built to sweep low across voxel canyons.",
    role: "Interceptor",
    abilityName: "Chunk Runner",
    abilityDescription: "Fastest frame for covering terrain and hunting drones between ridgelines.",
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
    tagline: "Heavy hauler that shrugs off return fire over rough ground.",
    role: "Assault",
    abilityName: "Siege Frame",
    abilityDescription: "Highest hull and heavy shots, ideal for clearing clustered drones.",
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
    tagline: "Agile skirmisher tuned for tight turns through block forests.",
    role: "Skirmisher",
    abilityName: "Rapid Burst",
    abilityDescription: "Shortest cooldown, built to keep pressure on roaming swarms.",
    speed: 22,
    maxHealth: 80,
    fireCooldown: 0.13,
    damage: 9,
    color: 0x8cffb7,
    accent: 0x6e80ff
  }
];

export const GAME_MODE_DEFINITIONS: GameModeDefinition[] = [
  {
    id: "standard",
    name: "Standard Mission",
    tagline: "Enemy waves build pressure while you launch and fight across the streamed sky.",
    description: "Full combat loop with hostile spawns, return fire, and threat escalation."
  },
  {
    id: "debug",
    name: "Debug Sandbox",
    tagline: "No enemy waves and manual spawns stay parked so you can inspect hitboxes and performance.",
    description: "Use this mode for static combat targets, memory checks, and general mechanic testing."
  }
];

export const WORLD_BOUNDS = {
  x: 30,
  y: 20,
  z: 30
};

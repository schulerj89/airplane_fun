import * as THREE from "three";
import { EnemyPlane, PlayerPlane, Projectile } from "./entities";
import { buildEnemyPursuitPlan, type EnemyPursuitPlan } from "./enemy-ai";
import {
  AUDIO_MIX_OPTIONS,
  CAMERA_ZOOM_OPTIONS,
  DEBUG_VIEW_OPTIONS,
  DEFAULT_GAME_SETTINGS,
  GameSettings,
  GameModeId,
  GAME_MODE_DEFINITIONS,
  PlaneId,
  PLANE_DEFINITIONS
} from "./config";
import { InputController } from "./input";
import { createEnemyPlaneModel, createPlayerPlaneModel } from "./models";
import { SoundController } from "./sound";
import { UIController } from "./ui";

type Phase = "title" | "playing" | "paused" | "game-over";

interface GameSnapshot {
  phase: Phase;
  score: number;
  wave: number;
  health: number;
  selectedPlaneId: PlaneId;
  selectedModeId: GameModeId;
  settings: GameSettings;
  chunkCount: number;
  speed: number;
  altitude: number;
  airborne: boolean;
  enemyCount: number;
}

interface EnemyTelemetry {
  distance: number;
  forwardDistance: number;
  lateralDistance: number;
  speed: number;
}

interface VoxelChunk {
  key: string;
  coordX: number;
  coordZ: number;
  group: THREE.Group;
}

interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number;
  };
}

declare global {
  interface Window {
    __airplaneFun?: {
      getSnapshot: () => GameSnapshot;
      getEnemyTelemetry: () => EnemyTelemetry[];
      sampleTerrainHeight: (x: number, z: number) => number;
      previewEnemyPursuit: (
        distance: number,
        forwardDistance: number,
        lateralDistance: number,
        preferredRange?: number,
        preferredSide?: number
      ) => EnemyPursuitPlan;
      destroyPlayer: () => void;
      spawnEnemyAhead: (distance?: number, lateralOffset?: number, altitudeOffset?: number, speedOverride?: number) => void;
    };
  }
}

const CHUNK_SIZE = 12;
const PLAYER_CHUNK_RENDER_RADIUS = 1;
const ENEMY_CHUNK_RENDER_RADIUS = 1;
const WORLD_FLOOR = -8;
const PLAYER_GROUND_CLEARANCE = 0.72;
const ENEMY_GROUND_CLEARANCE = 0.7;
const PLAYER_PROJECTILE_RANGE = 90;
const ENEMY_PROJECTILE_RANGE = 64;
const RUNWAY_HEIGHT = 1;
const RUNWAY_HALF_WIDTH = 3;
const RUNWAY_SHOULDER = 5;
const RUNWAY_Z_START = -42;
const RUNWAY_Z_END = 78;
const PLAYER_MAX_ALTITUDE = 42;
const PLAYER_MIN_ALTITUDE = RUNWAY_HEIGHT + PLAYER_GROUND_CLEARANCE;
const TAKEOFF_SPEED = 18;
const MAX_ACTIVE_ENEMIES = 3;
const ENEMY_DESPAWN_DISTANCE = 90;
const ENEMY_BEHIND_DESPAWN_DISTANCE = 28;
const ENEMY_BEHIND_DESPAWN_RADIUS = 48;
const PROJECTILE_DESPAWN_DISTANCE = 110;
const CAMERA_PROFILES = {
  close: { distance: 14, groundHeight: 4.7, airborneHeight: 6.6 },
  standard: { distance: 18, groundHeight: 5.5, airborneHeight: 7.5 },
  wide: { distance: 24, groundHeight: 6.9, airborneHeight: 8.8 }
} satisfies Record<GameSettings["cameraZoom"], { distance: number; groundHeight: number; airborneHeight: number }>;

const terrainMaterial = {
  grass: new THREE.MeshStandardMaterial({ color: 0x6bac47, flatShading: true }),
  dirt: new THREE.MeshStandardMaterial({ color: 0x8b6237, flatShading: true }),
  stone: new THREE.MeshStandardMaterial({ color: 0x79828d, flatShading: true }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x6d4624, flatShading: true }),
  leaves: new THREE.MeshStandardMaterial({ color: 0x2f7b39, flatShading: true }),
  runway: new THREE.MeshStandardMaterial({ color: 0x39424a, flatShading: true }),
  runwayStripe: new THREE.MeshStandardMaterial({
    color: 0xf6f2d3,
    emissive: 0xf6f2d3,
    emissiveIntensity: 0.08
  })
};

const boxGeometryCache = new Map<string, THREE.BoxGeometry>();

function getBoxGeometry(width: number, height: number, depth: number): THREE.BoxGeometry {
  const key = `${width}:${height}:${depth}`;
  const cached = boxGeometryCache.get(key);
  if (cached) {
    return cached;
  }

  const geometry = new THREE.BoxGeometry(width, height, depth);
  boxGeometryCache.set(key, geometry);
  return geometry;
}

export class GameApp {
  private readonly ui: UIController;
  private readonly input: InputController;
  private readonly sound: SoundController;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly worldRoot = new THREE.Group();
  private readonly entityRoot = new THREE.Group();
  private readonly clock = new THREE.Clock();
  private readonly projectiles: Projectile[] = [];
  private readonly enemies: EnemyPlane[] = [];
  private readonly chunks = new Map<string, VoxelChunk>();
  private readonly e2eMode: boolean;
  private readonly playerForward = new THREE.Vector3(0, 0, 1);
  private readonly cameraTarget = new THREE.Vector3();
  private readonly tempVectorA = new THREE.Vector3();
  private readonly tempVectorB = new THREE.Vector3();
  private readonly tempVectorC = new THREE.Vector3();
  private player: PlayerPlane | null = null;
  private phase: Phase = "title";
  private selectedPlaneId: PlaneId = "falcon";
  private selectedModeId: GameModeId = "standard";
  private settings: GameSettings = { ...DEFAULT_GAME_SETTINGS };
  private score = 0;
  private wave = 1;
  private spawnTimer = 0;
  private chunkPulse = 0;
  private animationFrame = 0;
  private hudStatus = "Idle";
  private isPlayerAirborne = false;
  private frameAccumulator = 0;
  private frameCounter = 0;
  private fps = 0;
  private frameTimeMs = 0;

  constructor(container: HTMLElement) {
    this.e2eMode = new URL(window.location.href).searchParams.get("e2e") === "1";
    this.ui = new UIController(
      container,
      PLANE_DEFINITIONS,
      GAME_MODE_DEFINITIONS,
      this.selectedPlaneId,
      this.selectedModeId,
      this.settings,
      (planeId, modeId) => {
        void this.startGame(planeId, modeId);
      },
      () => {
        void this.startGame(this.selectedPlaneId, this.selectedModeId);
      },
      () => this.togglePause(),
      () => {
        void this.startGame(this.selectedPlaneId, this.selectedModeId);
      },
      (settingId) => this.cycleSetting(settingId)
    );
    this.input = new InputController();
    this.sound = new SoundController();
    this.sound.setAudioMix(this.settings.audioMix);
    for (const button of this.ui.controlButtons) {
      this.input.bindButton(button, button.dataset.action ?? "");
    }

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.ui.canvas,
      antialias: true,
      alpha: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x86d6ff);
    this.scene.fog = new THREE.Fog(0x86d6ff, 18, 120);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 240);
    this.camera.position.set(0, 8, -22);

    this.scene.add(this.worldRoot);
    this.scene.add(this.entityRoot);

    this.configureScene();
    window.addEventListener("resize", this.handleResize);
    window.addEventListener("keydown", this.handleHotkeys);
    this.ui.showTitle();
    this.ui.updateDebug(this.getDebugState());
    this.loop();

    window.__airplaneFun = {
      getSnapshot: () => this.getSnapshot(),
      getEnemyTelemetry: () => this.getEnemyTelemetry(),
      sampleTerrainHeight: (x, z) => this.getTerrainHeightAt(x, z),
      previewEnemyPursuit: (distance, forwardDistance, lateralDistance, preferredRange, preferredSide) =>
        this.previewEnemyPursuit(distance, forwardDistance, lateralDistance, preferredRange, preferredSide),
      destroyPlayer: () => {
        if (this.player) {
          this.player.damage(this.player.health);
        }
      },
      spawnEnemyAhead: (distance, lateralOffset, altitudeOffset, speedOverride) =>
        this.spawnEnemyAhead(
          distance ?? (this.e2eMode ? 18 : 34),
          lateralOffset ?? 0,
          altitudeOffset ?? (this.e2eMode ? 0 : 4),
          speedOverride
        )
    };
  }

  private configureScene(): void {
    this.worldRoot.clear();

    const hemi = new THREE.HemisphereLight(0xd9f2ff, 0x5c7a48, 1.8);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff0bf, 1.5);
    sun.position.set(18, 24, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(2048);
    this.scene.add(sun);

    const skyBox = new THREE.Mesh(
      new THREE.BoxGeometry(240, 150, 240),
      new THREE.MeshBasicMaterial({ color: 0x86d6ff, side: THREE.BackSide })
    );
    this.worldRoot.add(skyBox);

    const clouds = new THREE.Group();
    for (let index = 0; index < 18; index += 1) {
      const cloud = new THREE.Mesh(
        new THREE.BoxGeometry(6 + (index % 3) * 2, 1.2, 3 + (index % 2)),
        new THREE.MeshStandardMaterial({ color: 0xf6fbff, flatShading: true })
      );
      cloud.position.set(-55 + (index % 6) * 20, 20 + (index % 4) * 2, -50 + Math.floor(index / 6) * 32);
      clouds.add(cloud);
    }
    this.worldRoot.add(clouds);
  }

  private async startGame(planeId: PlaneId, modeId = this.selectedModeId): Promise<void> {
    this.selectedPlaneId = planeId;
    this.selectedModeId = modeId;
    await this.sound.unlock();
    this.phase = "playing";
    this.score = 0;
    this.wave = 1;
    this.spawnTimer = this.isSandboxMode() ? Number.POSITIVE_INFINITY : 2.6;
    this.chunkPulse = 0;
    this.hudStatus = this.selectedModeId === "debug" ? "Debug Taxi" : "Taxi";
    this.isPlayerAirborne = false;
    this.input.reset();
    this.ui.updatePauseState(false);
    this.clearEntities();
    this.clearChunks();

    const definition = PLANE_DEFINITIONS.find((plane) => plane.id === planeId);
    if (!definition) {
      throw new Error(`Unknown plane ${planeId}`);
    }

    this.player = new PlayerPlane(definition, createPlayerPlaneModel(definition.color, definition.accent));
    this.player.position.set(0, RUNWAY_HEIGHT + PLAYER_GROUND_CLEARANCE, RUNWAY_Z_START + 8);
    this.player.flight.heading = 0;
    this.player.flight.pitch = 0;
    this.player.flight.roll = 0;
    this.player.flight.speed = 0;
    this.player.group.rotation.order = "YXZ";
    this.player.group.rotation.set(0, 0, 0);
    this.entityRoot.add(this.player.group);

    this.ensureWorldAroundPlayer();
    if (this.isDebugMode()) {
      this.spawnDebugTargets();
      this.ensureWorldAroundPlayer();
    }

    this.ui.showGameplay();
    this.updateHud();
  }

  private loop = (): void => {
    this.animationFrame = window.requestAnimationFrame(this.loop);
    const deltaSeconds = Math.min(this.clock.getDelta(), 0.033);
    this.frameTimeMs = deltaSeconds * 1000;
    this.frameAccumulator += deltaSeconds;
    this.frameCounter += 1;
    if (this.frameAccumulator >= 0.5) {
      this.fps = Math.round(this.frameCounter / this.frameAccumulator);
      this.frameAccumulator = 0;
      this.frameCounter = 0;
    }

    if (this.phase === "playing" && this.player) {
      this.updatePlayer(deltaSeconds);
      this.streamWorld(deltaSeconds);
      this.updateCombat(deltaSeconds);
      this.updateEnemies(deltaSeconds);
      this.updateProjectiles(deltaSeconds);
      this.cleanupEntities();
      this.updateCamera(deltaSeconds);
      this.updateHud();
      if (!this.player.isAlive) {
        this.handleGameOver();
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.ui.updateDebug(this.getDebugState());
  };

  private updatePlayer(deltaSeconds: number): void {
    if (!this.player) {
      return;
    }

    const yawInput = Number(this.input.isPressed("right")) - Number(this.input.isPressed("left"));
    const pitchInput = Number(this.input.isPressed("up")) - Number(this.input.isPressed("down"));
    const throttleInput = Number(this.input.isPressed("throttle-up")) - Number(this.input.isPressed("throttle-down"));
    const terrainHeight = this.getTerrainHeightAt(this.player.position.x, this.player.position.z) + PLAYER_GROUND_CLEARANCE;
    const onGround = this.player.position.y <= terrainHeight + 0.05;
    const speedRatio = THREE.MathUtils.clamp(this.player.flight.speed / Math.max(1, this.player.definition.speed + 14), 0, 1);

    const acceleration = throttleInput > 0 ? 22 : throttleInput < 0 ? -26 : 0;
    const passiveDrag = onGround ? 4.2 : 1.6;
    const maxSpeed = this.player.definition.speed + 18;
    this.player.flight.speed = THREE.MathUtils.clamp(
      this.player.flight.speed + acceleration * deltaSeconds - passiveDrag * deltaSeconds,
      0,
      maxSpeed
    );

    const yawRate = onGround ? 0.8 : 1.5;
    this.player.flight.heading += yawInput * yawRate * (0.3 + speedRatio * 0.7) * deltaSeconds;

    const pitchRate = onGround ? 0.95 : 1.4;
    this.player.flight.pitch = THREE.MathUtils.clamp(
      this.player.flight.pitch + pitchInput * pitchRate * deltaSeconds,
      -0.28,
      0.52
    );
    this.player.flight.pitch = THREE.MathUtils.damp(this.player.flight.pitch, onGround ? 0.06 : 0, 4, deltaSeconds);

    const forward = this.getForwardVector(this.player.flight.heading, this.player.flight.pitch);
    const candidatePosition = this.player.position.clone().addScaledVector(forward, this.player.flight.speed * deltaSeconds);
    if (!onGround) {
      const sinkRate = Math.max(0, 4.6 - this.player.flight.speed * 0.16 - Math.max(0, this.player.flight.pitch) * 7.5);
      candidatePosition.y -= sinkRate * deltaSeconds;
    }

    const candidateGround = this.getTerrainHeightAt(candidatePosition.x, candidatePosition.z) + PLAYER_GROUND_CLEARANCE;
    const canLiftOff = this.player.flight.speed >= TAKEOFF_SPEED && this.player.flight.pitch > 0.08;
    if (candidatePosition.y <= candidateGround || (onGround && !canLiftOff)) {
      candidatePosition.y = candidateGround;
      this.isPlayerAirborne = false;
      if (this.player.flight.speed < TAKEOFF_SPEED) {
        this.player.flight.pitch = Math.min(this.player.flight.pitch, 0.16);
      }
    } else {
      candidatePosition.y = THREE.MathUtils.clamp(candidatePosition.y, PLAYER_MIN_ALTITUDE, PLAYER_MAX_ALTITUDE);
      this.isPlayerAirborne = true;
    }

    this.player.position.copy(candidatePosition);
    this.playerForward.copy(this.getForwardVector(this.player.flight.heading, this.player.flight.pitch));
    this.player.flight.roll = THREE.MathUtils.damp(
      this.player.flight.roll,
      -yawInput * 0.38 - pitchInput * 0.08,
      5,
      deltaSeconds
    );
    this.player.group.rotation.set(-this.player.flight.pitch, this.player.flight.heading, this.player.flight.roll);

    this.hudStatus = this.getPlayerStatusLabel();

    this.player.updateFireTimer(deltaSeconds);
    if (this.input.isPressed("fire") && this.player.canFire()) {
      this.firePlayerProjectile();
      this.player.resetFireCooldown();
    }
  }

  private streamWorld(deltaSeconds: number): void {
    this.chunkPulse -= deltaSeconds;
    if (this.chunkPulse > 0) {
      return;
    }
    this.chunkPulse = 0.2;
    this.ensureWorldAroundPlayer();
    this.pruneDistantChunks();
  }

  private ensureWorldAroundPlayer(): void {
    if (!this.player) {
      return;
    }
    const centerChunkX = Math.floor(this.player.position.x / CHUNK_SIZE);
    const centerChunkZ = Math.floor(this.player.position.z / CHUNK_SIZE);
    this.ensureChunksAround(centerChunkX, centerChunkZ, PLAYER_CHUNK_RENDER_RADIUS);

    for (const enemy of this.enemies) {
      if (!enemy.isAlive) {
        continue;
      }

      const enemyChunkX = Math.floor(enemy.position.x / CHUNK_SIZE);
      const enemyChunkZ = Math.floor(enemy.position.z / CHUNK_SIZE);
      this.ensureChunksAround(enemyChunkX, enemyChunkZ, ENEMY_CHUNK_RENDER_RADIUS);
    }
  }

  private ensureChunksAround(centerChunkX: number, centerChunkZ: number, radius: number): void {
    for (let chunkX = centerChunkX - radius; chunkX <= centerChunkX + radius; chunkX += 1) {
      for (let chunkZ = centerChunkZ - radius; chunkZ <= centerChunkZ + radius; chunkZ += 1) {
        const key = `${chunkX}:${chunkZ}`;
        if (!this.chunks.has(key)) {
          const chunk = this.createChunk(chunkX, chunkZ);
          this.chunks.set(key, chunk);
          this.worldRoot.add(chunk.group);
        }
      }
    }
  }

  private createChunk(chunkX: number, chunkZ: number): VoxelChunk {
    const group = new THREE.Group();

    for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
      for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
        const worldX = chunkX * CHUNK_SIZE + localX;
        const worldZ = chunkZ * CHUNK_SIZE + localZ;
        const onRunway = this.isRunway(worldX + 0.5, worldZ + 0.5);
        const top = this.getTerrainHeightAt(worldX, worldZ);
        const depth = top - WORLD_FLOOR;
        const columnMaterial = onRunway ? terrainMaterial.runway : top <= -2 ? terrainMaterial.stone : terrainMaterial.dirt;
        const column = new THREE.Mesh(getBoxGeometry(1, depth, 1), columnMaterial);
        column.position.set(worldX + 0.5, WORLD_FLOOR + depth * 0.5, worldZ + 0.5);
        column.castShadow = true;
        column.receiveShadow = true;
        group.add(column);

        if (onRunway) {
          const lane = new THREE.Mesh(getBoxGeometry(1, 0.12, 1), terrainMaterial.runway);
          lane.position.set(worldX + 0.5, top + 0.06, worldZ + 0.5);
          lane.receiveShadow = true;
          group.add(lane);

          const stripeSeed = Math.round(worldZ) % 6 === 0 && Math.abs(worldX) < 1;
          if (stripeSeed) {
            const stripe = new THREE.Mesh(getBoxGeometry(0.35, 0.14, 0.82), terrainMaterial.runwayStripe);
            stripe.position.set(worldX + 0.5, top + 0.16, worldZ + 0.5);
            group.add(stripe);
          }
          continue;
        }

        const grass = new THREE.Mesh(getBoxGeometry(1, 0.9, 1), terrainMaterial.grass);
        grass.position.set(worldX + 0.5, top + 0.45, worldZ + 0.5);
        grass.castShadow = true;
        grass.receiveShadow = true;
        group.add(grass);

        const treeSeed = this.hash(worldX * 19 + worldZ * 31);
        if (!this.isDebugMode() && !this.isRunwayShoulder(worldX + 0.5, worldZ + 0.5) && treeSeed > 0.82 && top > -1 && top < 6) {
          const trunkHeight = 2 + Math.floor(this.hash(worldX * 11 - worldZ * 7) * 2);
          const trunk = new THREE.Mesh(getBoxGeometry(1, trunkHeight, 1), terrainMaterial.trunk);
          trunk.position.set(worldX + 0.5, top + trunkHeight * 0.5 + 0.4, worldZ + 0.5);
          trunk.castShadow = true;
          trunk.receiveShadow = true;
          group.add(trunk);

          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
              const leaves = new THREE.Mesh(getBoxGeometry(1, 1, 1), terrainMaterial.leaves);
              leaves.position.set(worldX + 0.5 + offsetX, top + trunkHeight + 1.2, worldZ + 0.5 + offsetZ);
              leaves.castShadow = true;
              leaves.receiveShadow = true;
              group.add(leaves);
            }
          }
        }
      }
    }

    return {
      key: `${chunkX}:${chunkZ}`,
      coordX: chunkX,
      coordZ: chunkZ,
      group
    };
  }

  private pruneDistantChunks(): void {
    if (!this.player) {
      return;
    }

    const requiredChunks = new Set<string>();
    this.collectRequiredChunkKeys(
      Math.floor(this.player.position.x / CHUNK_SIZE),
      Math.floor(this.player.position.z / CHUNK_SIZE),
      PLAYER_CHUNK_RENDER_RADIUS,
      requiredChunks
    );

    for (const enemy of this.enemies) {
      if (!enemy.isAlive) {
        continue;
      }

      this.collectRequiredChunkKeys(
        Math.floor(enemy.position.x / CHUNK_SIZE),
        Math.floor(enemy.position.z / CHUNK_SIZE),
        ENEMY_CHUNK_RENDER_RADIUS,
        requiredChunks
      );
    }

    for (const [key, chunk] of this.chunks) {
      if (!requiredChunks.has(key)) {
        this.worldRoot.remove(chunk.group);
        this.chunks.delete(key);
      }
    }
  }

  private collectRequiredChunkKeys(centerChunkX: number, centerChunkZ: number, radius: number, target: Set<string>): void {
    for (let chunkX = centerChunkX - radius; chunkX <= centerChunkX + radius; chunkX += 1) {
      for (let chunkZ = centerChunkZ - radius; chunkZ <= centerChunkZ + radius; chunkZ += 1) {
        target.add(`${chunkX}:${chunkZ}`);
      }
    }
  }

  private updateCombat(deltaSeconds: number): void {
    if (!this.player || this.isSandboxMode()) {
      return;
    }

    this.spawnTimer -= deltaSeconds;
    if (this.spawnTimer > 0) {
      return;
    }

    const availableSlots = Math.max(0, this.getMaxActiveEnemies() - this.enemies.length);
    if (availableSlots === 0) {
      this.spawnTimer = 0.6;
      return;
    }

    const pressure = Math.min(1 + Math.floor(this.wave / 2), 4);
    const spawnCount = Math.min(pressure, availableSlots);
    for (let index = 0; index < spawnCount; index += 1) {
      const distance = 28 + index * 6;
      const angle = this.hash(this.wave * 13 + index * 17) * Math.PI * 2;
      const altitude = 6 + this.hash(index * 37 + this.wave * 11) * 10;
      this.spawnEnemyAt(
        this.player.position.x + Math.cos(angle) * distance,
        this.player.position.z + Math.sin(angle) * distance,
        altitude,
        8 + this.wave * 0.4,
        24 + this.wave * 8,
        60 + this.wave * 14
      );
    }
    this.wave += 1;
    this.spawnTimer = Math.max(3 - this.wave * 0.08, 1.4);
  }

  private spawnEnemyAhead(distance: number, lateralOffset: number, altitudeOffset: number, speedOverride?: number): void {
    if (!this.player || this.enemies.length >= this.getMaxActiveEnemies()) {
      return;
    }
    const targetX = this.player.position.x + this.playerForward.x * distance + lateralOffset;
    const targetZ = this.player.position.z + this.playerForward.z * distance;
    const targetGround = this.getTerrainHeightAt(targetX, targetZ);
    const laneAltitude = this.e2eMode
      ? Math.max(1.5, this.player.position.y + this.playerForward.y * distance + altitudeOffset - targetGround)
      : Math.max(altitudeOffset, this.player.position.y - targetGround);
    const enemySpeed = this.isDebugMode() ? 0 : speedOverride ?? (this.e2eMode ? 3 : 8);
    this.spawnEnemyAt(targetX, targetZ, laneAltitude, enemySpeed, this.e2eMode ? 8 : 24, 100);
  }

  private spawnEnemyAt(
    x: number,
    z: number,
    altitudeOffset: number,
    speed: number,
    health: number,
    scoreValue: number
  ): void {
    const enemy = new EnemyPlane(createEnemyPlaneModel(), speed, health, scoreValue);
    const ground = this.getTerrainHeightAt(x, z);
    const sideSeed = this.hash(x * 0.071 + z * 0.053 + this.wave * 0.17);
    const rangeSeed = this.hash(x * 0.043 - z * 0.021 + scoreValue * 0.01);
    const altitudeSeed = this.hash(z * 0.037 + x * 0.019 + health * 0.03);
    enemy.position.set(x, ground + altitudeOffset, z);
    enemy.flight.heading = this.e2eMode
      ? (this.player?.flight.heading ?? 0)
      : Math.atan2(this.player?.position.x ?? 0 - x, this.player?.position.z ?? 0 - z);
    enemy.flight.pitch = this.e2eMode ? (this.player?.flight.pitch ?? 0) : 0;
    enemy.flight.roll = 0;
    enemy.flight.speed = this.e2eMode ? 0 : speed;
    enemy.preferredSide = sideSeed >= 0.5 ? 1 : -1;
    enemy.preferredRange = 12 + rangeSeed * 8;
    enemy.verticalBias = 1.5 + altitudeSeed * 3.5;
    enemy.behaviorSeed = this.hash(x * 0.067 + z * 0.041 + scoreValue * 0.013 + this.wave * 0.19);
    enemy.behaviorTime = enemy.behaviorSeed * Math.PI * 4;
    enemy.group.rotation.order = "YXZ";
    this.enemies.push(enemy);
    this.entityRoot.add(enemy.group);
  }

  private updateEnemies(deltaSeconds: number): void {
    if (!this.player) {
      return;
    }

    for (let index = 0; index < this.enemies.length; index += 1) {
      const enemy = this.enemies[index];
      if (this.isDebugMode()) {
        enemy.flight.speed = 0;
        enemy.flight.pitch = 0;
        enemy.flight.roll = 0;
        enemy.group.rotation.set(0, enemy.flight.heading, 0);
        enemy.update(deltaSeconds);
        continue;
      }

      if (this.e2eMode) {
        const forward = this.getForwardVector(enemy.flight.heading, enemy.flight.pitch);
        enemy.position.addScaledVector(forward, enemy.flight.speed * deltaSeconds);
        const ground = this.getTerrainHeightAt(enemy.position.x, enemy.position.z) + ENEMY_GROUND_CLEARANCE;
        if (enemy.position.y < ground) {
          enemy.position.y = ground;
        }
        enemy.position.y = Math.min(enemy.position.y, PLAYER_MAX_ALTITUDE - 2);
        enemy.group.rotation.set(-enemy.flight.pitch, enemy.flight.heading, enemy.flight.roll);
        enemy.update(deltaSeconds);
        continue;
      }

      const toPlayer = this.tempVectorA.copy(this.player.position).sub(enemy.position);
      const distance = toPlayer.length();
      const forwardDistance = toPlayer.dot(this.playerForward);
      const playerRightX = this.playerForward.z;
      const playerRightZ = -this.playerForward.x;
      const lateralDistance = toPlayer.x * playerRightX + toPlayer.z * playerRightZ;
      enemy.behaviorTime += deltaSeconds;
      const pursuitPlan = this.previewEnemyPursuit(
        distance,
        forwardDistance,
        lateralDistance,
        enemy.preferredRange,
        enemy.preferredSide,
        enemy.behaviorSeed,
        enemy.behaviorTime
      );
      const target = this.tempVectorB
        .copy(this.player.position)
        .addScaledVector(this.playerForward, pursuitPlan.forwardOffset);
      const lateralCorrection = pursuitPlan.breakaway ? 0.38 : pursuitPlan.closePass ? 0.5 : 0.62;
      target.x += playerRightX * (pursuitPlan.lateralTarget - lateralDistance) * lateralCorrection;
      target.z += playerRightZ * (pursuitPlan.lateralTarget - lateralDistance) * lateralCorrection;
      target.y += enemy.verticalBias + (this.isPlayerAirborne ? 0.5 : 3.5);

      if (pursuitPlan.closePass || pursuitPlan.breakaway) {
        const passWidth = pursuitPlan.breakaway ? 7.5 : 5;
        target.x += playerRightX * enemy.preferredSide * passWidth;
        target.z += playerRightZ * enemy.preferredSide * passWidth;
      }

      const toTarget = this.tempVectorC.copy(target).sub(enemy.position);
      const horizontalDistance = Math.max(0.01, Math.hypot(toTarget.x, toTarget.z));
      const desiredHeading = Math.atan2(toTarget.x, toTarget.z);
      const desiredPitch = THREE.MathUtils.clamp(Math.atan2(toTarget.y, horizontalDistance), -0.4, 0.35);
      const headingDelta = this.angleDelta(enemy.flight.heading, desiredHeading);
      enemy.flight.heading += headingDelta * Math.min(1, pursuitPlan.turnResponsiveness * deltaSeconds);
      enemy.flight.pitch +=
        (desiredPitch - enemy.flight.pitch) * Math.min(1, (pursuitPlan.turnResponsiveness + 0.3) * deltaSeconds);
      const desiredSpeedBase =
        distance > enemy.preferredRange
          ? enemy.speed + Math.min(5, (distance - enemy.preferredRange) * 0.18)
          : Math.max(enemy.speed * 0.78, enemy.speed - Math.min(2.8, (enemy.preferredRange - distance) * 0.3));
      const desiredSpeed = Math.max(enemy.speed * 0.72, desiredSpeedBase + pursuitPlan.speedBias);
      enemy.flight.speed = THREE.MathUtils.damp(enemy.flight.speed, desiredSpeed, 2.2, deltaSeconds);

      const forward = this.getForwardVector(enemy.flight.heading, enemy.flight.pitch);
      enemy.position.addScaledVector(forward, enemy.flight.speed * deltaSeconds);
      const ground = this.getTerrainHeightAt(enemy.position.x, enemy.position.z) + ENEMY_GROUND_CLEARANCE;
      if (enemy.position.y < ground) {
        enemy.position.y = ground;
      }
      enemy.position.y = Math.min(enemy.position.y, PLAYER_MAX_ALTITUDE - 2);
      enemy.flight.roll = THREE.MathUtils.damp(enemy.flight.roll, -headingDelta * 0.75, 4, deltaSeconds);
      enemy.group.rotation.set(-enemy.flight.pitch, enemy.flight.heading, enemy.flight.roll);

      const aimDirection = this.tempVectorA.copy(this.player.position).sub(enemy.position).normalize();
      const alignment = aimDirection.dot(forward);
      if (enemy.canFire() && distance < 34 && alignment > 0.84) {
        const projectile = new Projectile(0xff7057, "enemy", 8 + this.wave);
        projectile.position.copy(enemy.position).addScaledVector(forward, 1.6);
        projectile.spawnPosition.copy(projectile.position);
        projectile.velocity.copy(aimDirection.multiplyScalar(18));
        this.tempVectorB.copy(projectile.position).add(projectile.velocity);
        projectile.group.lookAt(this.tempVectorB);
        this.projectiles.push(projectile);
        this.entityRoot.add(projectile.group);
        this.sound.playEnemyShot();
        enemy.resetFireCooldown();
      }

      if (enemy.intersects(this.player)) {
        enemy.isAlive = false;
        this.player.damage(16);
        this.sound.playExplosion();
      }

      enemy.update(deltaSeconds);
    }
  }

  private updateProjectiles(deltaSeconds: number): void {
    if (!this.player) {
      return;
    }

    for (const projectile of this.projectiles) {
      projectile.update(deltaSeconds);
      if (!projectile.isAlive) {
        continue;
      }

      const maxRange = projectile.owner === "player" ? PLAYER_PROJECTILE_RANGE : ENEMY_PROJECTILE_RANGE;
      if (projectile.position.distanceTo(projectile.spawnPosition) > maxRange) {
        projectile.isAlive = false;
        continue;
      }

      if (projectile.owner === "player") {
        for (const enemy of this.enemies) {
          if (enemy.isAlive && projectile.intersects(enemy)) {
            projectile.isAlive = false;
            const destroyed = enemy.damage(projectile.damageAmount);
            this.sound.playHit();
            if (destroyed) {
              this.score += enemy.scoreValue;
              this.sound.playExplosion();
            }
            break;
          }
        }
      } else if (projectile.intersects(this.player)) {
        projectile.isAlive = false;
        this.player.damage(projectile.damageAmount);
        this.sound.playHit();
      }
    }
  }

  private firePlayerProjectile(): void {
    if (!this.player) {
      return;
    }
    const projectile = new Projectile(this.player.definition.accent, "player", this.player.definition.damage);
    projectile.position.copy(this.player.position).addScaledVector(this.playerForward, 2.4);
    projectile.spawnPosition.copy(projectile.position);
    projectile.velocity.copy(this.playerForward).multiplyScalar(32);
    this.tempVectorA.copy(projectile.position).add(projectile.velocity);
    projectile.group.lookAt(this.tempVectorA);
    this.projectiles.push(projectile);
    this.entityRoot.add(projectile.group);
    this.sound.playPlayerShot(this.player.definition.id);
  }

  private updateCamera(deltaSeconds: number): void {
    if (!this.player) {
      return;
    }
    this.cameraTarget
      .copy(this.player.position)
      .addScaledVector(this.playerForward, -CAMERA_PROFILES[this.settings.cameraZoom].distance);
    this.cameraTarget.y += this.isPlayerAirborne
      ? CAMERA_PROFILES[this.settings.cameraZoom].airborneHeight
      : CAMERA_PROFILES[this.settings.cameraZoom].groundHeight;
    this.camera.position.lerp(this.cameraTarget, 1 - Math.pow(0.003, deltaSeconds));
    const lookTarget = this.tempVectorA.copy(this.player.position).addScaledVector(this.playerForward, 14);
    lookTarget.y += 1.2;
    this.camera.lookAt(lookTarget);
  }

  private cleanupEntities(): void {
    this.despawnDistantEntities();
    this.removeDead(this.projectiles);
    this.removeDead(this.enemies);
  }

  private despawnDistantEntities(): void {
    if (!this.player) {
      return;
    }

    for (const enemy of this.enemies) {
      if (!enemy.isAlive) {
        continue;
      }

      const offset = this.tempVectorA.copy(enemy.position).sub(this.player.position);
      const distance = offset.length();
      const forwardDistance = offset.dot(this.playerForward);
      const isFarBehind = forwardDistance < -ENEMY_BEHIND_DESPAWN_DISTANCE && distance > ENEMY_BEHIND_DESPAWN_RADIUS;
      if (distance > ENEMY_DESPAWN_DISTANCE || isFarBehind) {
        enemy.isAlive = false;
      }
    }

    for (const projectile of this.projectiles) {
      if (!projectile.isAlive) {
        continue;
      }

      if (projectile.position.distanceToSquared(this.player.position) > PROJECTILE_DESPAWN_DISTANCE ** 2) {
        projectile.isAlive = false;
      }
    }
  }

  private removeDead<T extends Projectile | EnemyPlane>(entities: T[]): void {
    for (let index = entities.length - 1; index >= 0; index -= 1) {
      if (!entities[index].isAlive) {
        this.entityRoot.remove(entities[index].group);
        entities.splice(index, 1);
      }
    }
  }

  private updateHud(): void {
    if (!this.player) {
      return;
    }
    this.ui.updateHud({
      health: this.player.health,
      maxHealth: this.player.definition.maxHealth,
      score: this.score,
      wave: this.isDebugMode() ? 0 : Math.max(1, this.wave - (this.e2eMode ? 0 : 1)),
      planeName: this.player.definition.name,
      status: this.hudStatus,
      speed: Math.round(this.player.flight.speed),
      altitude: Math.max(0, Math.round(this.player.position.y - this.getTerrainHeightAt(this.player.position.x, this.player.position.z))),
    });
  }

  private handleGameOver(): void {
    this.phase = "game-over";
    this.input.reset();
    this.ui.updatePauseState(false);
    this.ui.showGameOver(this.score, Math.max(1, this.wave - 1));
  }

  private togglePause(): void {
    if (this.phase === "playing") {
      this.phase = "paused";
      this.input.reset();
      this.ui.updatePauseState(true);
      return;
    }

    if (this.phase === "paused") {
      this.phase = "playing";
      this.clock.getDelta();
      this.ui.updatePauseState(false);
    }
  }

  private clearEntities(): void {
    if (this.player) {
      this.entityRoot.remove(this.player.group);
      this.player = null;
    }
    for (const projectile of this.projectiles) {
      this.entityRoot.remove(projectile.group);
    }
    for (const enemy of this.enemies) {
      this.entityRoot.remove(enemy.group);
    }
    this.projectiles.length = 0;
    this.enemies.length = 0;
  }

  private clearChunks(): void {
    for (const chunk of this.chunks.values()) {
      this.worldRoot.remove(chunk.group);
    }
    this.chunks.clear();
  }

  private getTerrainHeightAt(x: number, z: number): number {
    if (this.isDebugMode()) {
      return RUNWAY_HEIGHT;
    }
    if (this.isRunwayShoulder(x, z)) {
      return RUNWAY_HEIGHT;
    }
    const ridge = Math.sin(x * 0.18) * 1.7 + Math.cos(z * 0.14) * 1.5 + Math.sin((x + z) * 0.07) * 2.1;
    const dunes = Math.sin(z * 0.04) * 2.6 + Math.cos(x * 0.05) * 1.8;
    const noise = this.hash(Math.floor(x) * 9283 + Math.floor(z) * 6899) * 2.2;
    return Math.floor(ridge + dunes + noise);
  }

  private isRunway(x: number, z: number): boolean {
    return Math.abs(x) <= RUNWAY_HALF_WIDTH && z >= RUNWAY_Z_START && z <= RUNWAY_Z_END;
  }

  private isRunwayShoulder(x: number, z: number): boolean {
    return Math.abs(x) <= RUNWAY_SHOULDER && z >= RUNWAY_Z_START - 2 && z <= RUNWAY_Z_END + 2;
  }

  private getForwardVector(heading: number, pitch: number): THREE.Vector3 {
    const cosPitch = Math.cos(pitch);
    return new THREE.Vector3(Math.sin(heading) * cosPitch, Math.sin(pitch), Math.cos(heading) * cosPitch).normalize();
  }

  private angleDelta(current: number, target: number): number {
    return Math.atan2(Math.sin(target - current), Math.cos(target - current));
  }

  private hash(seed: number): number {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return value - Math.floor(value);
  }

  private handleResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private handleHotkeys = (event: KeyboardEvent): void => {
    if (event.repeat) {
      return;
    }

    if ((event.code === "KeyP" || event.code === "Escape") && (this.phase === "playing" || this.phase === "paused")) {
      event.preventDefault();
      this.togglePause();
      return;
    }

    if (event.code === "KeyR" && (this.phase === "playing" || this.phase === "paused")) {
      event.preventDefault();
      void this.startGame(this.selectedPlaneId);
    }
  };

  private getSnapshot(): GameSnapshot {
    return {
      phase: this.phase,
      score: this.score,
      wave: this.isDebugMode()
        ? 0
        : this.phase === "playing" || this.phase === "paused"
          ? Math.max(1, this.wave - 1)
          : this.wave,
      health: this.player?.health ?? 0,
      selectedPlaneId: this.selectedPlaneId,
      selectedModeId: this.selectedModeId,
      settings: { ...this.settings },
      chunkCount: this.chunks.size,
      speed: Math.round(this.player?.flight.speed ?? 0),
      altitude: this.player ? Math.max(0, Math.round(this.player.position.y - this.getTerrainHeightAt(this.player.position.x, this.player.position.z))) : 0,
      airborne: this.isPlayerAirborne,
      enemyCount: this.enemies.length
    };
  }

  private getEnemyTelemetry(): EnemyTelemetry[] {
    if (!this.player) {
      return [];
    }

    const player = this.player;
    const playerRightX = this.playerForward.z;
    const playerRightZ = -this.playerForward.x;
    return this.enemies
      .filter((enemy) => enemy.isAlive)
      .map((enemy) => {
        const offset = this.tempVectorA.copy(player.position).sub(enemy.position);
        return {
          distance: offset.length(),
          forwardDistance: offset.dot(this.playerForward),
          lateralDistance: offset.x * playerRightX + offset.z * playerRightZ,
          speed: enemy.flight.speed
        };
      });
  }

  private previewEnemyPursuit(
    distance: number,
    forwardDistance: number,
    lateralDistance: number,
    preferredRange = 16,
    preferredSide = 1,
    behaviorSeed = 0.5,
    behaviorTime = 0
  ): EnemyPursuitPlan {
    return buildEnemyPursuitPlan({
      distance,
      forwardDistance,
      lateralDistance,
      preferredRange,
      preferredSide,
      behaviorSeed,
      behaviorTime
    });
  }

  private getDebugState(): {
    fps: number;
    frameTimeMs: number;
    memoryUsageMb: number | null;
    drawCalls: number;
    triangles: number;
    chunkCount: number;
    enemyCount: number;
    projectileCount: number;
  } {
    const performanceWithMemory = window.performance as PerformanceWithMemory;
    return {
      fps: this.fps,
      frameTimeMs: this.frameTimeMs,
      memoryUsageMb: performanceWithMemory.memory
        ? performanceWithMemory.memory.usedJSHeapSize / (1024 * 1024)
        : null,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      chunkCount: this.chunks.size,
      enemyCount: this.enemies.length,
      projectileCount: this.projectiles.length
    };
  }

  dispose(): void {
    window.cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("keydown", this.handleHotkeys);
    this.input.dispose();
    this.clearEntities();
    this.clearChunks();
    this.renderer.dispose();
  }

  private cycleSetting(settingId: keyof GameSettings): void {
    switch (settingId) {
      case "audioMix":
        this.settings.audioMix = this.getNextOptionId(AUDIO_MIX_OPTIONS, this.settings.audioMix);
        break;
      case "cameraZoom":
        this.settings.cameraZoom = this.getNextOptionId(CAMERA_ZOOM_OPTIONS, this.settings.cameraZoom);
        break;
      case "debugView":
        this.settings.debugView = this.getNextOptionId(DEBUG_VIEW_OPTIONS, this.settings.debugView);
        break;
    }

    this.sound.setAudioMix(this.settings.audioMix);
    this.ui.updateSettings(this.settings);
  }

  private getPlayerStatusLabel(): string {
    const prefix = this.selectedModeId === "debug" ? "Debug " : "";
    if (this.isPlayerAirborne) {
      if (this.player && this.player.flight.pitch > 0.12) {
        return `${prefix}Climbing`;
      }
      if (this.player && this.player.flight.pitch < -0.08) {
        return `${prefix}Diving`;
      }
      return `${prefix}Airborne`;
    }

    if (this.player && this.player.flight.speed > 3) {
      return this.selectedModeId === "debug" ? "Debug Roll" : "Takeoff Roll";
    }

    return `${prefix}Taxi`;
  }

  private isDebugMode(): boolean {
    return this.selectedModeId === "debug";
  }

  private isSandboxMode(): boolean {
    return this.e2eMode || this.isDebugMode();
  }

  private spawnDebugTargets(): void {
    this.spawnEnemyAhead(18, -7, 0, 0);
    this.spawnEnemyAhead(26, 7, 0, 0);
  }

  private getMaxActiveEnemies(): number {
    return this.isDebugMode() ? 2 : MAX_ACTIVE_ENEMIES;
  }

  private getNextOptionId<T extends string>(options: { id: T }[], current: T): T {
    const currentIndex = options.findIndex((option) => option.id === current);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % options.length : 0;
    return options[nextIndex].id;
  }
}

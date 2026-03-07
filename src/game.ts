import * as THREE from "three";
import { EnemyPlane, PlayerPlane, Projectile } from "./entities";
import { PlaneId, PLANE_DEFINITIONS } from "./config";
import { InputController } from "./input";
import { createEnemyPlaneModel, createPlayerPlaneModel } from "./models";
import { SoundController } from "./sound";
import { UIController } from "./ui";

type Phase = "title" | "playing" | "game-over";

interface GameSnapshot {
  phase: Phase;
  score: number;
  wave: number;
  health: number;
  selectedPlaneId: PlaneId;
  chunkCount: number;
  speed: number;
  altitude: number;
  airborne: boolean;
  enemyCount: number;
}

interface VoxelChunk {
  key: string;
  coordX: number;
  coordZ: number;
  group: THREE.Group;
}

declare global {
  interface Window {
    __airplaneFun?: {
      getSnapshot: () => GameSnapshot;
      destroyPlayer: () => void;
      spawnEnemyAhead: () => void;
    };
  }
}

const CHUNK_SIZE = 12;
const CHUNK_RENDER_RADIUS = 2;
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
  private player: PlayerPlane | null = null;
  private phase: Phase = "title";
  private selectedPlaneId: PlaneId = "falcon";
  private score = 0;
  private wave = 1;
  private spawnTimer = 0;
  private chunkPulse = 0;
  private animationFrame = 0;
  private hudStatus = "Idle";
  private isPlayerAirborne = false;

  constructor(container: HTMLElement) {
    this.e2eMode = new URL(window.location.href).searchParams.get("e2e") === "1";
    this.ui = new UIController(
      container,
      PLANE_DEFINITIONS,
      this.selectedPlaneId,
      (planeId) => {
        void this.startGame(planeId);
      },
      () => {
        void this.startGame(this.selectedPlaneId);
      }
    );
    this.input = new InputController();
    this.sound = new SoundController();
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
    this.ui.showTitle();
    this.loop();

    window.__airplaneFun = {
      getSnapshot: () => this.getSnapshot(),
      destroyPlayer: () => {
        if (this.player) {
          this.player.damage(this.player.health);
        }
      },
      spawnEnemyAhead: () => this.spawnEnemyAhead(this.e2eMode ? 18 : 34, 0, this.e2eMode ? 0 : 4)
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

  private async startGame(planeId: PlaneId): Promise<void> {
    this.selectedPlaneId = planeId;
    await this.sound.unlock();
    this.phase = "playing";
    this.score = 0;
    this.wave = 1;
    this.spawnTimer = this.e2eMode ? 99 : 2.6;
    this.chunkPulse = 0;
    this.hudStatus = "Taxi";
    this.isPlayerAirborne = false;
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

    if (this.e2eMode) {
      this.spawnEnemyAhead(18, 0, 0);
    }

    this.ui.showGameplay();
    this.updateHud();
  }

  private loop = (): void => {
    this.animationFrame = window.requestAnimationFrame(this.loop);
    const deltaSeconds = Math.min(this.clock.getDelta(), 0.033);

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

    this.hudStatus = this.isPlayerAirborne
      ? this.player.flight.pitch > 0.12
        ? "Climbing"
        : this.player.flight.pitch < -0.08
          ? "Diving"
          : "Airborne"
      : this.player.flight.speed > 3
        ? "Takeoff Roll"
        : "Taxi";

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
    for (let chunkX = centerChunkX - CHUNK_RENDER_RADIUS; chunkX <= centerChunkX + CHUNK_RENDER_RADIUS; chunkX += 1) {
      for (let chunkZ = centerChunkZ - CHUNK_RENDER_RADIUS; chunkZ <= centerChunkZ + CHUNK_RENDER_RADIUS; chunkZ += 1) {
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
    const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x6bac47, flatShading: true });
    const dirtMaterial = new THREE.MeshStandardMaterial({ color: 0x8b6237, flatShading: true });
    const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x79828d, flatShading: true });
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6d4624, flatShading: true });
    const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x2f7b39, flatShading: true });
    const runwayMaterial = new THREE.MeshStandardMaterial({ color: 0x39424a, flatShading: true });
    const runwayStripeMaterial = new THREE.MeshStandardMaterial({ color: 0xf6f2d3, emissive: 0xf6f2d3, emissiveIntensity: 0.08 });

    for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
      for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
        const worldX = chunkX * CHUNK_SIZE + localX;
        const worldZ = chunkZ * CHUNK_SIZE + localZ;
        const onRunway = this.isRunway(worldX + 0.5, worldZ + 0.5);
        const top = this.getTerrainHeightAt(worldX, worldZ);
        const depth = top - WORLD_FLOOR;
        const columnMaterial = onRunway ? runwayMaterial : top <= -2 ? stoneMaterial : dirtMaterial;
        const column = new THREE.Mesh(new THREE.BoxGeometry(1, depth, 1), columnMaterial);
        column.position.set(worldX + 0.5, WORLD_FLOOR + depth * 0.5, worldZ + 0.5);
        column.castShadow = true;
        column.receiveShadow = true;
        group.add(column);

        if (onRunway) {
          const lane = new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 1), runwayMaterial);
          lane.position.set(worldX + 0.5, top + 0.06, worldZ + 0.5);
          lane.receiveShadow = true;
          group.add(lane);

          const stripeSeed = Math.round(worldZ) % 6 === 0 && Math.abs(worldX) < 1;
          if (stripeSeed) {
            const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.82), runwayStripeMaterial);
            stripe.position.set(worldX + 0.5, top + 0.16, worldZ + 0.5);
            group.add(stripe);
          }
          continue;
        }

        const grass = new THREE.Mesh(new THREE.BoxGeometry(1, 0.9, 1), grassMaterial);
        grass.position.set(worldX + 0.5, top + 0.45, worldZ + 0.5);
        grass.castShadow = true;
        grass.receiveShadow = true;
        group.add(grass);

        const treeSeed = this.hash(worldX * 19 + worldZ * 31);
        if (!this.isRunwayShoulder(worldX + 0.5, worldZ + 0.5) && treeSeed > 0.82 && top > -1 && top < 6) {
          const trunkHeight = 2 + Math.floor(this.hash(worldX * 11 - worldZ * 7) * 2);
          const trunk = new THREE.Mesh(new THREE.BoxGeometry(1, trunkHeight, 1), trunkMaterial);
          trunk.position.set(worldX + 0.5, top + trunkHeight * 0.5 + 0.4, worldZ + 0.5);
          trunk.castShadow = true;
          trunk.receiveShadow = true;
          group.add(trunk);

          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
              const leaves = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), leafMaterial);
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
    const centerChunkX = Math.floor(this.player.position.x / CHUNK_SIZE);
    const centerChunkZ = Math.floor(this.player.position.z / CHUNK_SIZE);
    for (const [key, chunk] of this.chunks) {
      const farX = Math.abs(chunk.coordX - centerChunkX) > CHUNK_RENDER_RADIUS + 1;
      const farZ = Math.abs(chunk.coordZ - centerChunkZ) > CHUNK_RENDER_RADIUS + 1;
      if (farX || farZ) {
        this.worldRoot.remove(chunk.group);
        this.chunks.delete(key);
      }
    }
  }

  private updateCombat(deltaSeconds: number): void {
    if (!this.player || this.e2eMode) {
      return;
    }

    this.spawnTimer -= deltaSeconds;
    if (this.spawnTimer > 0) {
      return;
    }

    const pressure = Math.min(1 + Math.floor(this.wave / 2), 4);
    for (let index = 0; index < pressure; index += 1) {
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

  private spawnEnemyAhead(distance: number, lateralOffset: number, altitudeOffset: number): void {
    if (!this.player) {
      return;
    }
    const targetX = this.player.position.x + this.playerForward.x * distance + lateralOffset;
    const targetZ = this.player.position.z + this.playerForward.z * distance;
    const targetGround = this.getTerrainHeightAt(targetX, targetZ);
    const laneAltitude = Math.max(altitudeOffset, this.player.position.y - targetGround);
    this.spawnEnemyAt(targetX, targetZ, laneAltitude, this.e2eMode ? 3 : 8, this.e2eMode ? 8 : 24, 100);
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
    enemy.position.set(x, ground + altitudeOffset, z);
    enemy.flight.heading = Math.atan2(this.player?.position.x ?? 0 - x, this.player?.position.z ?? 0 - z);
    enemy.flight.pitch = 0;
    enemy.flight.roll = 0;
    enemy.flight.speed = speed;
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
      const orbitOffset = (index % 2 === 0 ? 1 : -1) * (5 + (index % 3) * 2);
      const target = this.player.position
        .clone()
        .add(this.playerForward.clone().multiplyScalar(-6))
        .add(new THREE.Vector3(orbitOffset, this.isPlayerAirborne ? 2 : 6, 0));
      const toTarget = target.sub(enemy.position);
      const distance = toTarget.length();
      const horizontalDistance = Math.max(0.01, Math.hypot(toTarget.x, toTarget.z));
      const desiredHeading = Math.atan2(toTarget.x, toTarget.z);
      const desiredPitch = THREE.MathUtils.clamp(Math.atan2(toTarget.y, horizontalDistance), -0.4, 0.35);
      enemy.flight.heading += this.angleDelta(enemy.flight.heading, desiredHeading) * Math.min(1, 1.6 * deltaSeconds);
      enemy.flight.pitch += (desiredPitch - enemy.flight.pitch) * Math.min(1, 1.9 * deltaSeconds);
      enemy.flight.speed = THREE.MathUtils.damp(enemy.flight.speed, enemy.speed + Math.min(5, distance * 0.05), 3, deltaSeconds);

      const forward = this.getForwardVector(enemy.flight.heading, enemy.flight.pitch);
      enemy.position.addScaledVector(forward, enemy.flight.speed * deltaSeconds);
      const ground = this.getTerrainHeightAt(enemy.position.x, enemy.position.z) + ENEMY_GROUND_CLEARANCE;
      if (enemy.position.y < ground) {
        enemy.position.y = ground;
      }
      enemy.position.y = Math.min(enemy.position.y, PLAYER_MAX_ALTITUDE - 2);
      enemy.flight.roll = THREE.MathUtils.damp(enemy.flight.roll, -this.angleDelta(enemy.flight.heading, desiredHeading) * 0.8, 4, deltaSeconds);
      enemy.group.rotation.set(-enemy.flight.pitch, enemy.flight.heading, enemy.flight.roll);

      const aimDirection = this.player.position.clone().sub(enemy.position).normalize();
      const alignment = aimDirection.dot(forward);
      if (enemy.canFire() && distance < 34 && alignment > 0.84) {
        const projectile = new Projectile(0xff7057, "enemy", 8 + this.wave);
        projectile.position.copy(enemy.position).add(forward.clone().multiplyScalar(1.6));
        projectile.spawnPosition.copy(projectile.position);
        projectile.velocity.copy(aimDirection.multiplyScalar(18));
        projectile.group.lookAt(projectile.position.clone().add(projectile.velocity));
        this.projectiles.push(projectile);
        this.entityRoot.add(projectile.group);
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
    projectile.position.copy(this.player.position).add(this.playerForward.clone().multiplyScalar(2.4));
    projectile.spawnPosition.copy(projectile.position);
    projectile.velocity.copy(this.playerForward).multiplyScalar(32);
    projectile.group.lookAt(projectile.position.clone().add(projectile.velocity));
    this.projectiles.push(projectile);
    this.entityRoot.add(projectile.group);
    this.sound.playLaser();
  }

  private updateCamera(deltaSeconds: number): void {
    if (!this.player) {
      return;
    }
    this.cameraTarget
      .copy(this.player.position)
      .add(this.playerForward.clone().multiplyScalar(-18))
      .add(new THREE.Vector3(0, this.isPlayerAirborne ? 7.5 : 5.5, 0));
    this.camera.position.lerp(this.cameraTarget, 1 - Math.pow(0.003, deltaSeconds));
    const lookTarget = this.player.position.clone().add(this.playerForward.clone().multiplyScalar(14)).add(new THREE.Vector3(0, 1.2, 0));
    this.camera.lookAt(lookTarget);
  }

  private cleanupEntities(): void {
    this.removeDead(this.projectiles);
    this.removeDead(this.enemies);
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
      wave: Math.max(1, this.wave - (this.e2eMode ? 0 : 1)),
      planeName: this.player.definition.name,
      status: this.hudStatus,
      speed: Math.round(this.player.flight.speed),
      altitude: Math.max(0, Math.round(this.player.position.y - this.getTerrainHeightAt(this.player.position.x, this.player.position.z))),
    });
  }

  private handleGameOver(): void {
    this.phase = "game-over";
    this.ui.showGameOver(this.score, Math.max(1, this.wave - 1));
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

  private getSnapshot(): GameSnapshot {
    return {
      phase: this.phase,
      score: this.score,
      wave: this.phase === "playing" ? Math.max(1, this.wave - 1) : this.wave,
      health: this.player?.health ?? 0,
      selectedPlaneId: this.selectedPlaneId,
      chunkCount: this.chunks.size,
      speed: Math.round(this.player?.flight.speed ?? 0),
      altitude: this.player ? Math.max(0, Math.round(this.player.position.y - this.getTerrainHeightAt(this.player.position.x, this.player.position.z))) : 0,
      airborne: this.isPlayerAirborne,
      enemyCount: this.enemies.length
    };
  }

  dispose(): void {
    window.cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("resize", this.handleResize);
    this.input.dispose();
    this.clearEntities();
    this.clearChunks();
    this.renderer.dispose();
  }
}

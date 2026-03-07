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
const PLAYER_HOVER_HEIGHT = 6;
const PLAYER_PROJECTILE_RANGE = 72;
const ENEMY_PROJECTILE_RANGE = 52;

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
    this.scene.fog = new THREE.Fog(0x86d6ff, 18, 92);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 220);
    this.camera.position.set(0, 10, -16);

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
      spawnEnemyAhead: () => this.spawnEnemyAhead(18, 1)
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
      new THREE.BoxGeometry(220, 140, 220),
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
    this.spawnTimer = this.e2eMode ? 0.2 : 1.8;
    this.chunkPulse = 0;
    this.playerForward.set(0, 0, 1);
    this.clearEntities();
    this.clearChunks();

    const definition = PLANE_DEFINITIONS.find((plane) => plane.id === planeId);
    if (!definition) {
      throw new Error(`Unknown plane ${planeId}`);
    }

    this.player = new PlayerPlane(definition, createPlayerPlaneModel(definition.color, definition.accent));
    this.player.position.set(0, 10, 0);
    this.entityRoot.add(this.player.group);

    this.ensureWorldAroundPlayer();
    this.snapPlayerToHoverHeight();

    if (this.e2eMode) {
      this.spawnEnemyAhead(16, 0);
    }

    this.ui.showGameplay();
    this.updateHud("Exploring");
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
      this.updateHud("Exploring");
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

    const xAxis = Number(this.input.isPressed("right")) - Number(this.input.isPressed("left"));
    const zAxis = Number(this.input.isPressed("up")) - Number(this.input.isPressed("down"));
    const move = new THREE.Vector3(xAxis, 0, zAxis);
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(this.player.definition.speed * deltaSeconds);
      this.player.position.add(move);
      this.playerForward.lerp(move.clone().normalize(), 0.18);
      this.playerForward.normalize();
    }

    const targetY = this.getTerrainHeightAt(this.player.position.x, this.player.position.z) + PLAYER_HOVER_HEIGHT;
    this.player.position.y = THREE.MathUtils.lerp(this.player.position.y, targetY, 0.1);
    this.player.group.rotation.y = Math.atan2(this.playerForward.x, this.playerForward.z);
    this.player.group.rotation.z = -xAxis * 0.28;
    this.player.group.rotation.x = zAxis * 0.12;

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

    for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
      for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
        const worldX = chunkX * CHUNK_SIZE + localX;
        const worldZ = chunkZ * CHUNK_SIZE + localZ;
        const top = this.getTerrainHeightAt(worldX, worldZ);
        const depth = top - WORLD_FLOOR;
        const columnMaterial = top <= -2 ? stoneMaterial : dirtMaterial;
        const column = new THREE.Mesh(new THREE.BoxGeometry(1, depth, 1), columnMaterial);
        column.position.set(worldX + 0.5, WORLD_FLOOR + depth * 0.5, worldZ + 0.5);
        column.castShadow = true;
        column.receiveShadow = true;
        group.add(column);

        const grass = new THREE.Mesh(new THREE.BoxGeometry(1, 0.9, 1), grassMaterial);
        grass.position.set(worldX + 0.5, top + 0.45, worldZ + 0.5);
        grass.castShadow = true;
        grass.receiveShadow = true;
        group.add(grass);

        const treeSeed = this.hash(worldX * 19 + worldZ * 31);
        if (treeSeed > 0.82 && top > -1 && top < 6) {
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
    if (!this.player) {
      return;
    }

    this.spawnTimer -= deltaSeconds;
    if (this.spawnTimer > 0) {
      return;
    }

    const pressure = Math.min(1 + Math.floor(this.wave / 2), 4);
    for (let index = 0; index < pressure; index += 1) {
      const distance = 20 + index * 4;
      const angle = this.hash(this.wave * 13 + index * 17) * Math.PI * 2;
      this.spawnEnemyAt(
        this.player.position.x + Math.cos(angle) * distance,
        this.player.position.z + Math.sin(angle) * distance,
        6.5 + this.wave * 0.35,
        24 + this.wave * 7,
        50 + this.wave * 12
      );
    }
    this.wave += 1;
    this.spawnTimer = this.e2eMode ? 2.2 : Math.max(2.8 - this.wave * 0.08, 1.2);
  }

  private spawnEnemyAhead(distance: number, lateralOffset: number): void {
    if (!this.player) {
      return;
    }
    const targetX = this.player.position.x + this.playerForward.x * distance + lateralOffset;
    const targetZ = this.player.position.z + this.playerForward.z * distance;
    this.spawnEnemyAt(targetX, targetZ, 5.5, 20, 100);
  }

  private spawnEnemyAt(x: number, z: number, speed: number, health: number, scoreValue: number): void {
    const enemy = new EnemyPlane(createEnemyPlaneModel(), speed, health, scoreValue);
    enemy.position.set(x, this.getTerrainHeightAt(x, z) + 4.5, z);
    this.enemies.push(enemy);
    this.entityRoot.add(enemy.group);
  }

  private updateEnemies(deltaSeconds: number): void {
    if (!this.player) {
      return;
    }

    for (const enemy of this.enemies) {
      const toPlayer = this.player.position.clone().sub(enemy.position);
      const distance = toPlayer.length();
      const direction = toPlayer.normalize();
      const lateral = new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar(Math.sin(enemy.position.z * 0.2) * 1.3);
      enemy.velocity.copy(direction.multiplyScalar(enemy.speed)).add(lateral);
      enemy.update(deltaSeconds);

      const hoverY = this.getTerrainHeightAt(enemy.position.x, enemy.position.z) + 4.3;
      enemy.position.y = THREE.MathUtils.lerp(enemy.position.y, hoverY, 0.12);
      enemy.group.rotation.y = Math.atan2(enemy.velocity.x, enemy.velocity.z);
      enemy.group.rotation.z = Math.sin(performance.now() * 0.004 + enemy.position.x) * 0.12;
      enemy.group.rotation.x = 0.1;

      if (enemy.canFire() && distance < 22) {
        const projectile = new Projectile(0xff7057, "enemy", 9 + this.wave);
        const shotDirection = this.player.position.clone().sub(enemy.position).normalize();
        projectile.position.copy(enemy.position).add(shotDirection.clone().multiplyScalar(1.8));
        projectile.velocity.copy(shotDirection.multiplyScalar(15));
        this.projectiles.push(projectile);
        this.entityRoot.add(projectile.group);
        enemy.resetFireCooldown();
      }

      if (enemy.intersects(this.player)) {
        enemy.isAlive = false;
        this.player.damage(16);
        this.sound.playExplosion();
      }
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
      if (projectile.position.distanceTo(this.player.position) > maxRange) {
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
    projectile.position.copy(this.player.position).add(this.playerForward.clone().multiplyScalar(2.2));
    projectile.velocity.copy(this.playerForward).multiplyScalar(28);
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
      .add(this.playerForward.clone().multiplyScalar(-13))
      .add(new THREE.Vector3(0, 6.5, 0));
    this.camera.position.lerp(this.cameraTarget, 1 - Math.pow(0.002, deltaSeconds));
    const lookTarget = this.player.position.clone().add(this.playerForward.clone().multiplyScalar(8)).add(new THREE.Vector3(0, 1.2, 0));
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

  private updateHud(status: string): void {
    if (!this.player) {
      return;
    }
    this.ui.updateHud({
      health: this.player.health,
      maxHealth: this.player.definition.maxHealth,
      score: this.score,
      wave: Math.max(1, this.wave - 1),
      planeName: this.player.definition.name,
      status
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

  private snapPlayerToHoverHeight(): void {
    if (!this.player) {
      return;
    }
    this.player.position.y = this.getTerrainHeightAt(this.player.position.x, this.player.position.z) + PLAYER_HOVER_HEIGHT;
  }

  private getTerrainHeightAt(x: number, z: number): number {
    const ridge = Math.sin(x * 0.18) * 1.7 + Math.cos(z * 0.14) * 1.5 + Math.sin((x + z) * 0.07) * 2.1;
    const dunes = Math.sin(z * 0.04) * 2.6 + Math.cos(x * 0.05) * 1.8;
    const noise = this.hash(Math.floor(x) * 9283 + Math.floor(z) * 6899) * 2.2;
    return Math.floor(ridge + dunes + noise);
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
      chunkCount: this.chunks.size
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

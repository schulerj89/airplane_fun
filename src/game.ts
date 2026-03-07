import * as THREE from "three";
import { EnemyPlane, PlayerPlane, Projectile } from "./entities";
import { PlaneId, PLANE_DEFINITIONS, WORLD_BOUNDS } from "./config";
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
}

declare global {
  interface Window {
    __airplaneFun?: {
      getSnapshot: () => GameSnapshot;
      destroyPlayer: () => void;
    };
  }
}

export class GameApp {
  private readonly ui: UIController;
  private readonly input: InputController;
  private readonly sound: SoundController;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();
  private readonly projectiles: Projectile[] = [];
  private readonly enemies: EnemyPlane[] = [];
  private player: PlayerPlane | null = null;
  private phase: Phase = "title";
  private selectedPlaneId: PlaneId = "falcon";
  private score = 0;
  private wave = 1;
  private spawnTimer = 0;
  private animationFrame = 0;
  private readonly e2eMode: boolean;

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
    this.scene.fog = new THREE.FogExp2(0x05131f, 0.028);
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 8, -14);
    this.camera.lookAt(0, 2, 10);

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
      }
    };
  }

  private configureScene(): void {
    this.scene.clear();

    const hemi = new THREE.HemisphereLight(0xcde8ff, 0x132433, 1.8);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2c9, 1.5);
    sun.position.set(8, 15, -6);
    sun.castShadow = true;
    this.scene.add(sun);

    const sky = new THREE.Mesh(
      new THREE.BoxGeometry(100, 50, 100),
      new THREE.MeshBasicMaterial({
        color: 0x6eb7ff,
        side: THREE.BackSide
      })
    );
    this.scene.add(sky);

    const clouds = new THREE.Group();
    for (let index = 0; index < 20; index += 1) {
      const cloud = new THREE.Mesh(
        new THREE.BoxGeometry(3 + (index % 3), 1.2, 2.2),
        new THREE.MeshStandardMaterial({ color: 0xf4f7fb, flatShading: true })
      );
      cloud.position.set(-18 + (index % 5) * 9, 8 + (index % 4), index * 6 - 10);
      clouds.add(cloud);
    }
    this.scene.add(clouds);

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(80, 1, 120),
      new THREE.MeshStandardMaterial({ color: 0x396b4d, flatShading: true })
    );
    floor.position.set(0, -8, 30);
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  private async startGame(planeId: PlaneId): Promise<void> {
    this.selectedPlaneId = planeId;
    await this.sound.unlock();
    this.phase = "playing";
    this.score = 0;
    this.wave = 1;
    this.spawnTimer = 0;
    this.clearEntities();

    const definition = PLANE_DEFINITIONS.find((plane) => plane.id === planeId);
    if (!definition) {
      throw new Error(`Unknown plane ${planeId}`);
    }

    this.player = new PlayerPlane(definition, createPlayerPlaneModel(definition.color, definition.accent));
    this.player.position.set(0, 0, 0);
    this.scene.add(this.player.group);
    this.ui.showGameplay();
    this.ui.updateHud({
      health: this.player.health,
      maxHealth: definition.maxHealth,
      score: this.score,
      wave: this.wave,
      planeName: definition.name
    });

    if (this.e2eMode) {
      this.spawnEnemy(0, 0, 12, 0, 9, 100);
    }
  }

  private loop = (): void => {
    this.animationFrame = window.requestAnimationFrame(this.loop);
    const deltaSeconds = Math.min(this.clock.getDelta(), 0.033);

    if (this.phase === "playing" && this.player) {
      this.updatePlayer(deltaSeconds);
      this.updateCombat(deltaSeconds);
      this.updateEnemies(deltaSeconds);
      this.updateProjectiles(deltaSeconds);
      this.cleanupEntities();
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

    const xAxis = Number(this.input.isPressed("right")) - Number(this.input.isPressed("left"));
    const yAxis = Number(this.input.isPressed("up")) - Number(this.input.isPressed("down"));
    const moveVector = new THREE.Vector3(xAxis, yAxis, 0);
    if (moveVector.lengthSq() > 0) {
      moveVector.normalize().multiplyScalar(this.player.definition.speed * deltaSeconds);
      this.player.position.add(moveVector);
    }

    this.player.position.x = THREE.MathUtils.clamp(this.player.position.x, -WORLD_BOUNDS.x, WORLD_BOUNDS.x);
    this.player.position.y = THREE.MathUtils.clamp(this.player.position.y, -WORLD_BOUNDS.y, WORLD_BOUNDS.y);
    this.player.group.rotation.z = -xAxis * 0.35;
    this.player.group.rotation.x = yAxis * 0.15;

    this.player.updateFireTimer(deltaSeconds);
    if (this.input.isPressed("fire") && this.player.canFire()) {
      this.firePlayerProjectile();
      this.player.resetFireCooldown();
    }
  }

  private updateCombat(deltaSeconds: number): void {
    this.spawnTimer -= deltaSeconds;
    if (this.spawnTimer <= 0) {
      this.spawnWave();
      this.spawnTimer = Math.max(1.5 - this.wave * 0.08, 0.6);
    }
  }

  private spawnWave(): void {
    const enemyCount = Math.min(2 + Math.floor(this.wave / 2), 6);
    for (let index = 0; index < enemyCount; index += 1) {
      const x = -14 + index * (28 / Math.max(enemyCount - 1, 1));
      const y = -3 + (index % 3) * 3;
      const z = 28 + index * 2;
      const speed = 5.5 + this.wave * 0.35;
      this.spawnEnemy(x, y, z, speed);
    }
    this.wave += 1;
  }

  private spawnEnemy(
    x: number,
    y: number,
    z: number,
    speed: number,
    health = 25 + this.wave * 6,
    scoreValue = 50
  ): void {
    const enemy = new EnemyPlane(createEnemyPlaneModel(), speed, health, scoreValue);
    enemy.position.set(x, y, z);
    this.enemies.push(enemy);
    this.scene.add(enemy.group);
  }

  private updateEnemies(deltaSeconds: number): void {
    if (!this.player) {
      return;
    }

    for (const enemy of this.enemies) {
      enemy.update(deltaSeconds);
      enemy.group.rotation.z = Math.sin(enemy.position.z * 0.1) * 0.2;

      if (enemy.canFire() && enemy.position.z < 20) {
        const projectile = new Projectile(0xff5c5c, "enemy", 10 + this.wave);
        projectile.position.copy(enemy.position).add(new THREE.Vector3(0, 0, -2.5));
        projectile.velocity.set(0, 0, -18);
        this.projectiles.push(projectile);
        this.scene.add(projectile.group);
        enemy.resetFireCooldown();
      }

      if (enemy.intersects(this.player)) {
        enemy.isAlive = false;
        this.player.damage(18);
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
    projectile.position.copy(this.player.position).add(new THREE.Vector3(0, 0, 2.8));
    projectile.velocity.set(0, 0, 24);
    this.projectiles.push(projectile);
    this.scene.add(projectile.group);
    this.sound.playLaser();
  }

  private cleanupEntities(): void {
    this.removeDead(this.projectiles);
    this.removeDead(this.enemies);
  }

  private removeDead<T extends Projectile | EnemyPlane>(entities: T[]): void {
    for (let index = entities.length - 1; index >= 0; index -= 1) {
      if (!entities[index].isAlive) {
        this.scene.remove(entities[index].group);
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
      wave: Math.max(1, this.wave - 1),
      planeName: this.player.definition.name
    });
  }

  private handleGameOver(): void {
    this.phase = "game-over";
    this.ui.showGameOver(this.score, Math.max(1, this.wave - 1));
  }

  private clearEntities(): void {
    if (this.player) {
      this.scene.remove(this.player.group);
      this.player = null;
    }
    for (const projectile of this.projectiles) {
      this.scene.remove(projectile.group);
    }
    for (const enemy of this.enemies) {
      this.scene.remove(enemy.group);
    }
    this.projectiles.length = 0;
    this.enemies.length = 0;
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
      wave: Math.max(1, this.wave - (this.phase === "playing" ? 1 : 0)),
      health: this.player?.health ?? 0,
      selectedPlaneId: this.selectedPlaneId
    };
  }

  dispose(): void {
    window.cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("resize", this.handleResize);
    this.input.dispose();
    this.clearEntities();
    this.renderer.dispose();
  }
}

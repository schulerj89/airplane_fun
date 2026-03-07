import * as THREE from "three";
import { EnemyPlane, PlayerPlane, Projectile } from "./entities";
import { PlaneId, PLANE_DEFINITIONS, WORLD_BOUNDS } from "./config";
import { InputController } from "./input";
import { createEnemyPlaneModel, createPlayerPlaneModel } from "./models";
import { SoundController } from "./sound";
import { UIController } from "./ui";

type Phase = "title" | "playing" | "game-over";
type FlightState = "takeoff" | "combat";

interface GameSnapshot {
  phase: Phase;
  flightState: FlightState | "none";
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
  private runwayGroup = new THREE.Group();
  private player: PlayerPlane | null = null;
  private phase: Phase = "title";
  private flightState: FlightState = "takeoff";
  private selectedPlaneId: PlaneId = "falcon";
  private score = 0;
  private wave = 1;
  private spawnTimer = 0;
  private takeoffTimer = 0;
  private takeoffDuration = 3.5;
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
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 160);
    this.camera.position.set(0, 10, -18);
    this.camera.lookAt(0, 1, 18);

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
    this.runwayGroup = new THREE.Group();

    const hemi = new THREE.HemisphereLight(0xcde8ff, 0x132433, 1.8);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2c9, 1.5);
    sun.position.set(8, 15, -6);
    sun.castShadow = true;
    this.scene.add(sun);

    const sky = new THREE.Mesh(
      new THREE.BoxGeometry(180, 70, 220),
      new THREE.MeshBasicMaterial({
        color: 0x6eb7ff,
        side: THREE.BackSide
      })
    );
    this.scene.add(sky);

    const clouds = new THREE.Group();
    for (let index = 0; index < 28; index += 1) {
      const cloud = new THREE.Mesh(
        new THREE.BoxGeometry(3 + (index % 3), 1.2, 2.2),
        new THREE.MeshStandardMaterial({ color: 0xf4f7fb, flatShading: true })
      );
      cloud.position.set(-36 + (index % 7) * 12, 8 + (index % 5), index * 8 - 30);
      clouds.add(cloud);
    }
    this.scene.add(clouds);

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(150, 1, 220),
      new THREE.MeshStandardMaterial({ color: 0x396b4d, flatShading: true })
    );
    floor.position.set(0, -8, 45);
    floor.receiveShadow = true;
    this.scene.add(floor);

    const runway = new THREE.Mesh(
      new THREE.BoxGeometry(16, 0.4, 90),
      new THREE.MeshStandardMaterial({ color: 0x34383d, flatShading: true })
    );
    runway.position.set(0, -7.45, -2);
    runway.receiveShadow = true;
    this.runwayGroup.add(runway);

    const centerLineMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f0da, flatShading: true });
    for (let index = 0; index < 11; index += 1) {
      const marker = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 4.5), centerLineMaterial);
      marker.position.set(0, -7.2, -36 + index * 8);
      this.runwayGroup.add(marker);
    }

    const edgeLightMaterial = new THREE.MeshStandardMaterial({
      color: 0x7fd1ff,
      emissive: 0x7fd1ff,
      emissiveIntensity: 0.35,
      flatShading: true
    });
    for (let index = 0; index < 18; index += 1) {
      for (const side of [-1, 1]) {
        const light = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.25, 0.45), edgeLightMaterial);
        light.position.set(side * 7.5, -7.15, -40 + index * 5);
        this.runwayGroup.add(light);
      }
    }
    this.scene.add(this.runwayGroup);
  }

  private async startGame(planeId: PlaneId): Promise<void> {
    this.selectedPlaneId = planeId;
    await this.sound.unlock();
    this.phase = "playing";
    this.flightState = "takeoff";
    this.score = 0;
    this.wave = 1;
    this.spawnTimer = 0.9;
    this.takeoffTimer = 0;
    this.takeoffDuration = this.e2eMode ? 0.8 : 3.5;
    this.clearEntities();

    const definition = PLANE_DEFINITIONS.find((plane) => plane.id === planeId);
    if (!definition) {
      throw new Error(`Unknown plane ${planeId}`);
    }

    this.player = new PlayerPlane(definition, createPlayerPlaneModel(definition.color, definition.accent));
    this.player.position.set(0, -6.2, -24);
    this.player.group.rotation.x = -0.02;
    this.scene.add(this.player.group);
    this.ui.showGameplay();
    this.ui.updateHud({
      health: this.player.health,
      maxHealth: definition.maxHealth,
      score: this.score,
      wave: 0,
      planeName: definition.name,
      status: "Takeoff"
    });
  }

  private loop = (): void => {
    this.animationFrame = window.requestAnimationFrame(this.loop);
    const deltaSeconds = Math.min(this.clock.getDelta(), 0.033);

    if (this.phase === "playing" && this.player) {
      this.updatePlayer(deltaSeconds);
      this.updateFlightState(deltaSeconds);
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
    const maxVerticalInput = this.flightState === "takeoff" ? Math.max(0, yAxis) : yAxis;
    const moveVector = new THREE.Vector3(xAxis, maxVerticalInput, 0);
    if (moveVector.lengthSq() > 0) {
      const speedScalar = this.flightState === "takeoff" ? this.player.definition.speed * 0.55 : this.player.definition.speed;
      moveVector.normalize().multiplyScalar(speedScalar * deltaSeconds);
      this.player.position.add(moveVector);
    }

    this.player.position.x = THREE.MathUtils.clamp(this.player.position.x, -WORLD_BOUNDS.x, WORLD_BOUNDS.x);
    const minAltitude = this.flightState === "takeoff" ? -6.2 : -WORLD_BOUNDS.y;
    this.player.position.y = THREE.MathUtils.clamp(this.player.position.y, minAltitude, WORLD_BOUNDS.y);
    this.player.group.rotation.z = -xAxis * 0.35;
    if (this.flightState === "combat") {
      this.player.group.rotation.x = maxVerticalInput * 0.15;
    }

    this.player.updateFireTimer(deltaSeconds);
    if (this.flightState === "combat" && this.input.isPressed("fire") && this.player.canFire()) {
      this.firePlayerProjectile();
      this.player.resetFireCooldown();
    }
  }

  private updateFlightState(deltaSeconds: number): void {
    if (!this.player || this.flightState !== "takeoff") {
      return;
    }

    this.takeoffTimer += deltaSeconds;
    const progress = Math.min(this.takeoffTimer / this.takeoffDuration, 1);
    const definition = this.player.definition;

    this.player.position.z = THREE.MathUtils.lerp(-24, -4, progress);
    this.player.position.y = THREE.MathUtils.lerp(-6.2, 0, progress);
    this.player.group.rotation.x = THREE.MathUtils.lerp(-0.02, -0.28, progress);

    if (progress >= 1) {
      this.flightState = "combat";
      this.player.position.z = 0;
      this.player.group.rotation.x = 0;
      this.spawnTimer = 0.3;
      if (this.e2eMode) {
        this.spawnEnemy(0, 0, 18, 0, 9, 100);
      }
      this.ui.updateHud({
        health: this.player.health,
        maxHealth: definition.maxHealth,
        score: this.score,
        wave: Math.max(1, this.wave),
        planeName: definition.name,
        status: "Airborne"
      });
    }
  }

  private updateCombat(deltaSeconds: number): void {
    if (this.flightState !== "combat") {
      return;
    }

    this.spawnTimer -= deltaSeconds;
    if (this.spawnTimer <= 0) {
      this.spawnWave();
      this.spawnTimer = Math.max(1.5 - this.wave * 0.08, 0.6);
    }
  }

  private spawnWave(): void {
    const enemyCount = Math.min(2 + Math.floor(this.wave / 2), 6);
    for (let index = 0; index < enemyCount; index += 1) {
      const x = -22 + index * (44 / Math.max(enemyCount - 1, 1));
      const y = -5 + (index % 4) * 3;
      const z = 34 + index * 3;
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
      enemy.group.rotation.x = 0.08;

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
      wave: this.flightState === "takeoff" ? 0 : Math.max(1, this.wave - 1),
      planeName: this.player.definition.name,
      status: this.flightState === "takeoff" ? "Takeoff" : "Airborne"
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
      flightState: this.phase === "playing" ? this.flightState : "none",
      score: this.score,
      wave:
        this.phase === "playing" && this.flightState === "takeoff"
          ? 0
          : Math.max(1, this.wave - (this.phase === "playing" ? 1 : 0)),
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

import * as THREE from "three";
import { PlaneDefinition, WORLD_BOUNDS } from "./config";

export abstract class Entity {
  public readonly group: THREE.Group;
  public readonly velocity = new THREE.Vector3();
  public readonly size: THREE.Vector3;
  public isAlive = true;
  public health = 1;

  protected constructor(group: THREE.Group, size: THREE.Vector3) {
    this.group = group;
    this.size = size;
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  update(deltaSeconds: number): void {
    this.position.addScaledVector(this.velocity, deltaSeconds);
  }

  intersects(other: Entity): boolean {
    return (
      Math.abs(this.position.x - other.position.x) < (this.size.x + other.size.x) * 0.5 &&
      Math.abs(this.position.y - other.position.y) < (this.size.y + other.size.y) * 0.5 &&
      Math.abs(this.position.z - other.position.z) < (this.size.z + other.size.z) * 0.5
    );
  }

  damage(amount: number): boolean {
    this.health = Math.max(0, this.health - amount);
    this.isAlive = this.health > 0;
    return !this.isAlive;
  }
}

export class Projectile extends Entity {
  public readonly damageAmount: number;
  public readonly owner: "player" | "enemy";

  constructor(color: number, owner: "player" | "enemy", damageAmount: number) {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.5
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 1.2), material);
    group.add(mesh);
    super(group, new THREE.Vector3(0.3, 0.3, 1.2));
    this.owner = owner;
    this.damageAmount = damageAmount;
    this.health = 1;
  }

  override update(deltaSeconds: number): void {
    super.update(deltaSeconds);
    if (Math.abs(this.position.x) > WORLD_BOUNDS.x + 2 || Math.abs(this.position.y) > WORLD_BOUNDS.y + 2) {
      this.isAlive = false;
    }
    if (this.position.z > 40 || this.position.z < -20) {
      this.isAlive = false;
    }
  }
}

export class PlayerPlane extends Entity {
  public readonly definition: PlaneDefinition;
  private fireTimer = 0;

  constructor(definition: PlaneDefinition, model: THREE.Group) {
    super(model, new THREE.Vector3(3.6, 2.0, 4.8));
    this.definition = definition;
    this.health = definition.maxHealth;
  }

  canFire(): boolean {
    return this.fireTimer <= 0;
  }

  updateFireTimer(deltaSeconds: number): void {
    this.fireTimer -= deltaSeconds;
  }

  resetFireCooldown(): void {
    this.fireTimer = this.definition.fireCooldown;
  }
}

export class EnemyPlane extends Entity {
  private fireTimer = 1;
  public readonly speed: number;
  public readonly scoreValue: number;

  constructor(model: THREE.Group, speed: number, health: number, scoreValue: number) {
    super(model, new THREE.Vector3(3.2, 1.8, 4.0));
    this.health = health;
    this.speed = speed;
    this.scoreValue = scoreValue;
  }

  canFire(): boolean {
    return this.fireTimer <= 0;
  }

  resetFireCooldown(): void {
    this.fireTimer = 1.25;
  }

  override update(deltaSeconds: number): void {
    this.fireTimer -= deltaSeconds;
    this.position.z -= this.speed * deltaSeconds;
    this.position.x += Math.sin(this.position.z * 0.2) * deltaSeconds * 1.5;
    if (this.position.z < -6) {
      this.isAlive = false;
    }
  }
}

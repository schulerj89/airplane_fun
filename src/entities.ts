import * as THREE from "three";
import { PlaneDefinition } from "./config";

export interface Hitbox {
  offset: THREE.Vector3;
  size: THREE.Vector3;
}

export abstract class Entity {
  public readonly group: THREE.Group;
  public readonly velocity = new THREE.Vector3();
  public readonly hitboxes: Hitbox[];
  public isAlive = true;
  public health = 1;

  protected constructor(group: THREE.Group, hitboxes: Hitbox[]) {
    this.group = group;
    this.hitboxes = hitboxes;
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  update(deltaSeconds: number): void {
    this.position.addScaledVector(this.velocity, deltaSeconds);
  }

  intersects(other: Entity): boolean {
    for (const hitbox of this.hitboxes) {
      const center = this.position.clone().add(hitbox.offset);
      for (const otherHitbox of other.hitboxes) {
        const otherCenter = other.position.clone().add(otherHitbox.offset);
        const overlaps =
          Math.abs(center.x - otherCenter.x) < (hitbox.size.x + otherHitbox.size.x) * 0.5 &&
          Math.abs(center.y - otherCenter.y) < (hitbox.size.y + otherHitbox.size.y) * 0.5 &&
          Math.abs(center.z - otherCenter.z) < (hitbox.size.z + otherHitbox.size.z) * 0.5;
        if (overlaps) {
          return true;
        }
      }
    }
    return false;
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
    super(group, [{ offset: new THREE.Vector3(), size: new THREE.Vector3(0.22, 0.22, 1) }]);
    this.owner = owner;
    this.damageAmount = damageAmount;
    this.health = 1;
  }

  override update(deltaSeconds: number): void {
    super.update(deltaSeconds);
    if (this.position.y < -16 || this.position.y > 40) {
      this.isAlive = false;
    }
  }
}

export class PlayerPlane extends Entity {
  public readonly definition: PlaneDefinition;
  private fireTimer = 0;

  constructor(definition: PlaneDefinition, model: THREE.Group) {
    super(model, [
      { offset: new THREE.Vector3(0, 0.1, 0.15), size: new THREE.Vector3(1.1, 0.9, 3.8) },
      { offset: new THREE.Vector3(0, -0.05, -0.3), size: new THREE.Vector3(3.4, 0.35, 1.2) },
      { offset: new THREE.Vector3(0, 0.45, -1.2), size: new THREE.Vector3(0.5, 0.9, 0.7) }
    ]);
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
    super(model, [
      { offset: new THREE.Vector3(0, 0.1, 0.25), size: new THREE.Vector3(1, 0.95, 1.8) },
      { offset: new THREE.Vector3(0, 0, -0.25), size: new THREE.Vector3(2.8, 0.3, 1) },
      { offset: new THREE.Vector3(0, 0.45, -1.05), size: new THREE.Vector3(0.38, 0.68, 0.38) }
    ]);
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
    this.position.addScaledVector(this.velocity, deltaSeconds);
    if (this.position.y < -12 || this.position.y > 48) {
      this.isAlive = false;
    }
  }
}

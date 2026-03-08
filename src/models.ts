import * as THREE from "three";

const boxGeometryCache = new Map<string, THREE.BoxGeometry>();
const materialCache = new Map<string, THREE.MeshStandardMaterial>();
const playerTemplateCache = new Map<string, THREE.Group>();
let enemyTemplate: THREE.Group | null = null;
const projectileTemplateCache = new Map<number, THREE.Group>();

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

function getMaterial(
  color: number,
  emissive = 0x000000,
  emissiveIntensity = emissive === 0 ? 0 : 0.35,
  flatShading = true
): THREE.MeshStandardMaterial {
  const key = `${color}:${emissive}:${emissiveIntensity}:${flatShading ? 1 : 0}`;
  const cached = materialCache.get(key);
  if (cached) {
    return cached;
  }

  const material = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity, flatShading });
  materialCache.set(key, material);
  return material;
}

function cube(
  color: number,
  size: [number, number, number],
  position: [number, number, number],
  emissive = 0x000000
): THREE.Mesh {
  const mesh = new THREE.Mesh(getBoxGeometry(size[0], size[1], size[2]), getMaterial(color, emissive));
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createPlayerPlaneModel(baseColor: number, accentColor: number): THREE.Group {
  const key = `${baseColor}:${accentColor}`;
  const cached = playerTemplateCache.get(key);
  if (cached) {
    return cached.clone(true);
  }

  const group = new THREE.Group();
  group.add(cube(baseColor, [1.1, 0.9, 3.8], [0, 0.05, 0]));
  group.add(cube(baseColor, [3.4, 0.2, 1.2], [0, -0.05, -0.3]));
  group.add(cube(baseColor, [1, 0.45, 1.1], [0, 0.45, -0.55]));
  group.add(cube(accentColor, [0.6, 0.25, 0.8], [0, 0.2, 1.75], accentColor));
  group.add(cube(accentColor, [0.35, 0.8, 0.35], [0, 0.58, -1.25]));
  group.add(cube(baseColor, [0.4, 0.35, 1.45], [-1.55, -0.1, -0.05]));
  group.add(cube(baseColor, [0.4, 0.35, 1.45], [1.55, -0.1, -0.05]));
  group.add(cube(0x101b26, [0.65, 0.2, 0.55], [0, 0.22, 1.1]));
  playerTemplateCache.set(key, group);
  return group.clone(true);
}

export function createEnemyPlaneModel(): THREE.Group {
  if (!enemyTemplate) {
    const group = new THREE.Group();
    const body = 0xff8b47;
    const accent = 0x1d2530;
    group.add(cube(body, [1.0, 0.95, 1.85], [0, 0.1, 0.25]));
    group.add(cube(body, [2.9, 0.25, 1.0], [0, 0, -0.25]));
    group.add(cube(accent, [0.75, 0.25, 0.65], [0, 0.25, 1.05]));
    group.add(cube(accent, [0.38, 0.7, 0.38], [0, 0.45, -1.05]));
    group.add(cube(0xffd86b, [0.4, 0.16, 0.35], [-0.35, 0.1, 1.1], 0xffd86b));
    group.add(cube(0xffd86b, [0.4, 0.16, 0.35], [0.35, 0.1, 1.1], 0xffd86b));
    enemyTemplate = group;
  }

  return enemyTemplate.clone(true);
}

export function createProjectileModel(color: number): THREE.Group {
  const cached = projectileTemplateCache.get(color);
  if (cached) {
    return cached.clone(true);
  }

  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    getBoxGeometry(0.3, 0.3, 1.2),
    getMaterial(color, color, 0.5, false)
  );
  group.add(mesh);
  projectileTemplateCache.set(color, group);
  return group.clone(true);
}

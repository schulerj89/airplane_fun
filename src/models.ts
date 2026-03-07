import * as THREE from "three";

function cube(color: number, size: [number, number, number], position: [number, number, number]): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    new THREE.MeshStandardMaterial({ color, flatShading: true })
  );
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createPlayerPlaneModel(baseColor: number, accentColor: number): THREE.Group {
  const group = new THREE.Group();
  group.add(cube(baseColor, [1.2, 0.8, 3.8], [0, 0, 0]));
  group.add(cube(baseColor, [3.2, 0.2, 1.2], [0, 0, -0.2]));
  group.add(cube(baseColor, [1.1, 0.4, 1.2], [0, 0.5, -0.5]));
  group.add(cube(accentColor, [0.6, 0.3, 1.0], [0, 0.25, 1.8]));
  group.add(cube(accentColor, [0.35, 0.8, 0.35], [0, 0.6, -1.4]));
  group.add(cube(baseColor, [0.4, 0.3, 1.4], [-1.5, -0.15, -0.1]));
  group.add(cube(baseColor, [0.4, 0.3, 1.4], [1.5, -0.15, -0.1]));
  return group;
}

export function createEnemyPlaneModel(): THREE.Group {
  const group = new THREE.Group();
  const body = 0xff7a4d;
  const accent = 0x231f20;
  group.add(cube(body, [1.0, 0.7, 3.0], [0, 0, 0]));
  group.add(cube(body, [2.8, 0.2, 1.0], [0, 0, 0.1]));
  group.add(cube(accent, [0.6, 0.2, 0.8], [0, 0.25, 1.4]));
  group.add(cube(accent, [0.35, 0.6, 0.35], [0, 0.5, -1.0]));
  return group;
}

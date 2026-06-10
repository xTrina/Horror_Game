import * as THREE from 'three';
import { CFG } from './config.js';

const T = CFG.TILE;

function makeItemMesh(type) {
  let geo, mat;
  switch (type) {
    case 'keycard':
      geo = new THREE.BoxGeometry(0.3, 0.5, 0.05);
      mat = new THREE.MeshStandardMaterial({
        color: 0x00ff88, emissive: 0x00ff44, emissiveIntensity: 1.2,
        metalness: 0.8, roughness: 0.2
      });
      break;
    case 'slat':
      geo = new THREE.BoxGeometry(1.2, 0.08, 0.1);
      mat = new THREE.MeshLambertMaterial({ color: 0x8B5E3C });
      break;
    case 'nail':
      geo = new THREE.CylinderGeometry(0.02, 0.02, 0.25, 6);
      mat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9, roughness: 0.2 });
      break;
    case 'medicine':
      geo = new THREE.BoxGeometry(0.3, 0.25, 0.15);
      mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      break;
    case 'noise_trap':
      geo = new THREE.BoxGeometry(0.25, 0.12, 0.25);
      mat = new THREE.MeshLambertMaterial({ color: 0xff6600 });
      break;
    default:
      geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
      mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;

  // Red cross decal on medicine
  if (type === 'medicine') {
    const cGeo = new THREE.PlaneGeometry(0.2, 0.05);
    const cMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const h  = new THREE.Mesh(cGeo, cMat);
    const v  = new THREE.Mesh(cGeo.clone(), cMat);
    v.rotation.z = Math.PI / 2;
    h.position.z = 0.08; v.position.z = 0.08;
    mesh.add(h, v);
  }

  return mesh;
}

export function buildItems(scene, mapData) {
  const items = [];

  for (const raw of mapData.items) {
    const worldX = (raw.tileX + 0.5) * T + (Math.random() - 0.5) * 0.8;
    const worldZ = (raw.tileY + 0.5) * T + (Math.random() - 0.5) * 0.8;

    const mesh = makeItemMesh(raw.type);
    const baseY = raw.type === 'keycard' ? 0.8 : 0.12;
    mesh.position.set(worldX, baseY, worldZ);
    scene.add(mesh);

    // Point light for keycard glow
    let glow = null;
    if (raw.type === 'keycard') {
      glow = new THREE.PointLight(0x00ff88, 0.6, 2.5);
      glow.position.copy(mesh.position);
      scene.add(glow);
    }

    items.push({ type: raw.type, id: raw.id, worldX, worldZ, mesh, glow, _t: Math.random() * Math.PI * 2 });
  }

  return items;
}

export function animateItems(items, dt) {
  for (const item of items) {
    item._t += dt;
    if (item.type === 'keycard') {
      item.mesh.position.y = 0.75 + Math.sin(item._t * 2) * 0.08;
      item.mesh.rotation.y = item._t * 1.2;
      if (item.glow) {
        item.glow.position.copy(item.mesh.position);
        item.glow.intensity = 0.5 + 0.2 * Math.sin(item._t * 3);
      }
    }
  }
}

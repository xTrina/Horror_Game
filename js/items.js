import * as THREE from 'three';
import { CFG } from './config.js';

const T = CFG.TILE;

// ── Sprite-label helper ────────────────────────────────────
function makeLabel(text, color = '#ffffff') {
  const cv  = document.createElement('canvas');
  cv.width  = 256; cv.height = 48;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, 256, 48);
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.beginPath();
  ctx.roundRect(0, 4, 256, 40, 8);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 24);
  const tex = new THREE.CanvasTexture(cv);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  spr.scale.set(1.1, 0.22, 1);
  return spr;
}

// ── Per-type mesh + label ─────────────────────────────────
const ITEMS_DEF = {
  keycard: {
    label: '🗝 Keycard',   labelColor: '#00ff88',
    baseY: 0.85,
    make() {
      const g = new THREE.Group();
      // Card body
      const card = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.34, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x00cc66, emissive: 0x006633, emissiveIntensity: 1.5, metalness: 0.6, roughness: 0.3 })
      );
      // Chip
      const chip = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.12, 0.06),
        new THREE.MeshStandardMaterial({ color: 0xddaa00, metalness: 0.9, roughness: 0.1 })
      );
      chip.position.set(-0.1, 0.04, 0);
      // Stripe
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.06, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 })
      );
      stripe.position.set(0, -0.1, 0);
      g.add(card, chip, stripe);
      return g;
    }
  },

  slat: {
    label: '🪵 Holzlatte',  labelColor: '#d4a94a',
    baseY: 0.07,
    make() {
      const g = new THREE.Group();
      const wood = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.07, 0.12),
        new THREE.MeshLambertMaterial({ color: 0x8B5E3C })
      );
      // Wood grain lines
      for (let i = 0; i < 5; i++) {
        const grain = new THREE.Mesh(
          new THREE.BoxGeometry(1.48, 0.005, 0.005),
          new THREE.MeshLambertMaterial({ color: 0x6b4020 })
        );
        grain.position.set(0, 0.038, -0.04 + i * 0.02);
        g.add(grain);
      }
      g.add(wood);
      return g;
    }
  },

  nail: {
    label: '📌 Nägel',      labelColor: '#aaaaaa',
    baseY: 0.06,
    make() {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.95, roughness: 0.1 });
      for (let i = 0; i < 5; i++) {
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.008, 0.28, 6), mat);
        const head  = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 8), mat);
        const px = (i - 2) * 0.08, pz = (i % 2) * 0.06 - 0.03;
        shaft.position.set(px, 0.14, pz);
        head.position.set(px, 0.275, pz);
        g.add(shaft, head);
      }
      return g;
    }
  },

  medicine: {
    label: '💊 Medizin',    labelColor: '#ff6666',
    baseY: 0.12,
    make() {
      const g = new THREE.Group();
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.22, 0.18),
        new THREE.MeshLambertMaterial({ color: 0xffffff })
      );
      // Red cross on front
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.005), new THREE.MeshLambertMaterial({ color: 0xee0000 }));
      const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.005), new THREE.MeshLambertMaterial({ color: 0xee0000 }));
      crossH.position.z = 0.095; crossV.position.z = 0.095;
      // Green lid
      const lid = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.05, 0.20),
        new THREE.MeshLambertMaterial({ color: 0x006622 })
      );
      lid.position.y = 0.135;
      g.add(box, crossH, crossV, lid);
      return g;
    }
  },

  noise_trap: {
    label: '📢 Lärm-Falle', labelColor: '#ff9900',
    baseY: 0.08,
    make() {
      const g = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.1, 0.28),
        new THREE.MeshLambertMaterial({ color: 0xff6600 })
      );
      const speaker = new THREE.Mesh(
        new THREE.ConeGeometry(0.1, 0.15, 8),
        new THREE.MeshLambertMaterial({ color: 0x222222 })
      );
      speaker.rotation.z = -Math.PI / 2;
      speaker.position.set(0.18, 0.04, 0);
      const btn = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.04, 8),
        new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x880000, emissiveIntensity: 1 })
      );
      btn.position.y = 0.07;
      g.add(base, speaker, btn);
      return g;
    }
  }
};

export function buildItems(scene, mapData) {
  const items = [];
  for (const raw of mapData.items) {
    const def = ITEMS_DEF[raw.type] || ITEMS_DEF['noise_trap'];

    // Random offset inside storage tile
    const ox = (Math.random() - 0.5) * 0.7;
    const oz = (Math.random() - 0.5) * 0.7;
    const wx = (raw.tileX + 0.5) * T + ox;
    const wz = (raw.tileY + 0.5) * T + oz;

    const mesh = def.make();
    mesh.position.set(wx, def.baseY, wz);
    mesh.castShadow = true;
    // Slight random rotation
    mesh.rotation.y = Math.random() * Math.PI * 2;
    scene.add(mesh);

    // Label sprite above item
    const label = makeLabel(def.label, def.labelColor);
    label.position.set(wx, def.baseY + 0.55, wz);
    scene.add(label);

    // Point-light glow for keycard
    let glow = null;
    if (raw.type === 'keycard') {
      glow = new THREE.PointLight(0x00ff88, 0.8, 3);
      glow.position.set(wx, def.baseY + 0.1, wz);
      scene.add(glow);
    }

    items.push({ type: raw.type, id: raw.id, worldX: wx, worldZ: wz, mesh, label, glow, _t: Math.random() * Math.PI * 2 });
  }
  return items;
}

export function animateItems(items, dt) {
  for (const it of items) {
    it._t += dt;
    if (it.type === 'keycard') {
      it.mesh.position.y = 0.75 + Math.sin(it._t * 2.2) * 0.1;
      it.mesh.rotation.y = it._t * 1.3;
      it.label.position.y = it.mesh.position.y + 0.55;
      if (it.glow) {
        it.glow.position.y = it.mesh.position.y;
        it.glow.intensity  = 0.6 + 0.3 * Math.sin(it._t * 3);
      }
    } else {
      // Gentle label bob
      it.label.position.y = ITEMS_DEF[it.type]?.baseY + 0.55 + Math.sin(it._t * 1.5) * 0.03;
    }
  }
}

import * as THREE from 'three';
import { CFG, MON } from './config.js';
import { MapData, rng32 } from './mapdata.js';
import { buildScene, animateDoors } from './scene.js';
import { Player } from './player.js';
import { buildItems, animateItems } from './items.js';
import { spawnMonsters } from './monsters.js';
import { Audio3D } from './audio.js';

const T = CFG.TILE;

// ── Three.js setup ────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;

const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 200);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener('resize', resize);

// ── State ─────────────────────────────────────────────────
const STATES = { MENU: 0, PLAY: 1, DEAD: 2, ESCAPED: 3 };
let state = STATES.MENU;

let scene3d, mapData, player, monsters, items, traps;
let flashlight, ambientLight, corridorLights = [];
let audio = new Audio3D();
let jumpScareAlpha = 0, jumpScareTimer = 0;
let proximityAlpha = 0;
let killedMonster = false;
let deathMonsterType = null;
let _lastTime = 0;
let doorShakeTime = 0;

// ── HUD elements ──────────────────────────────────────────
const hud          = document.getElementById('hud');
const hudKeys      = document.getElementById('hud-keys');
const hudInv       = document.getElementById('hud-inv');
const hudPrompt    = document.getElementById('hud-prompt');
const hudNotif     = document.getElementById('hud-notif');
const hudSafe      = document.getElementById('hud-safe');
const hudDoor      = document.getElementById('hud-door');
const overlay      = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayBody  = document.getElementById('overlay-body');
const crosshair    = document.getElementById('crosshair');
const clickPrompt  = document.getElementById('click-prompt');
let notifTimeout   = null;

function notify(text, color = '#ffcc00', dur = 3000) {
  hudNotif.textContent = text;
  hudNotif.style.color = color;
  hudNotif.style.opacity = '1';
  clearTimeout(notifTimeout);
  notifTimeout = setTimeout(() => { hudNotif.style.opacity = '0'; }, dur);
}

function updateHUD() {
  if (!player) return;

  // Keycards
  let kc = '';
  for (let i = 0; i < CFG.KEYCARD_PIECES; i++) {
    const have = i < player.keycardCount;
    kc += `<span class="kcard ${have ? 'have' : ''}">⬛</span>`;
  }
  hudKeys.innerHTML = '🗝 ' + kc;

  // Inventory
  const inv = [];
  if (player.hasWeapon) inv.push('⚒ Club');
  else if (player.hasSlat) inv.push('🪵 Slat');
  if (player.nails)     inv.push(`📌×${player.nails}`);
  if (player.medicines) inv.push(`💊×${player.medicines}`);
  if (player.traps)     inv.push(`🔊×${player.traps}`);
  hudInv.textContent = inv.join('  ') || '(nothing)';

  // HP
  document.getElementById('hud-hp').textContent = '❤️'.repeat(player.hp) + '🖤'.repeat(3 - player.hp);

  // Safe zone
  hudSafe.style.opacity = player.inStorage ? '1' : '0';

  // Door status near player
  const nd = nearDoor();
  if (nd) {
    if (player.inStorage && !nd.open) {
      hudDoor.textContent = nd.locked ? '[E] Unlock door' : '[E] Lock door — hide inside!';
      hudDoor.style.opacity = '1';
    } else if (!nd.locked) {
      hudDoor.textContent = nd.open ? '[E] Close door' : '[E] Open door';
      hudDoor.style.opacity = '1';
    } else {
      hudDoor.textContent = '🔒 Locked from inside';
      hudDoor.style.opacity = '1';
    }
  } else {
    hudDoor.style.opacity = '0';
  }

  // Interaction prompt (items nearby)
  const ni = nearItem();
  if (ni) {
    hudPrompt.textContent = `[E] Pick up ${ni.type}`;
    hudPrompt.style.opacity = '1';
  } else {
    hudPrompt.style.opacity = '0';
  }

  // Craft prompt
  const craft = document.getElementById('hud-craft');
  if (player.hasSlat && player.nails >= 2 && !player.hasWeapon) {
    craft.textContent = '[C] Craft Spiked Club!';
    craft.style.opacity = '1';
  } else { craft.style.opacity = '0'; }
}

function nearItem() {
  if (!items) return null;
  return items.find(it =>
    Math.hypot(it.worldX - player.pos.x, it.worldZ - player.pos.z) < CFG.INTERACT_R
  ) || null;
}

function nearDoor() {
  if (!mapData) return null;
  return mapData.doors.find(d => {
    const dx = (d.col + 0.5) * T, dz = d.dir === 'S' ? (d.row + 1) * T : d.row * T;
    return Math.hypot(dx - player.pos.x, dz - player.pos.z) < CFG.INTERACT_R;
  }) || null;
}

// ── Init game ─────────────────────────────────────────────
function initGame() {
  const seed = Date.now();
  const rng  = rng32(seed);

  // Scene
  if (scene3d) {
    // Dispose previous scene objects
    while (scene3d.children.length) scene3d.remove(scene3d.children[0]);
  }
  scene3d = new THREE.Scene();
  scene3d.fog = new THREE.FogExp2(0x000000, 0.09);

  // Lights
  ambientLight = new THREE.AmbientLight(0x111122, 0.4);
  scene3d.add(ambientLight);

  flashlight = new THREE.SpotLight(0xffeedd, 3.5, CFG.FL_DIST, CFG.FL_ANGLE, 0.3, 1.5);
  flashlight.castShadow = true;
  flashlight.shadow.mapSize.set(512, 512);
  flashlight.shadow.camera.far = CFG.FL_DIST;
  const flTarget = new THREE.Object3D();
  scene3d.add(flTarget);
  flashlight.target = flTarget;
  scene3d.add(flashlight);

  // Map
  mapData = new MapData(seed);
  buildScene(scene3d, mapData);

  // Corridor point lights
  corridorLights = [];
  const junctions = mapData.corridorCentres().filter((_, i) => i % 12 === 0);
  for (const j of junctions) {
    const pl = new THREE.PointLight(0xffeeaa, 0.15, T * 3);
    pl.position.set(j.x, CFG.WALL_H - 0.3, j.z);
    scene3d.add(pl);
    corridorLights.push(pl);
  }

  // Player
  const startPos = mapData.randomCorridorPos(rng);
  player = new Player(camera, renderer, mapData);
  player.setPosition(startPos.x, startPos.z);
  if (player.controls) scene3d.add(player.controls.getObject?.() ?? camera);

  // Items
  items = buildItems(scene3d, mapData);

  // Monsters
  monsters = spawnMonsters(mapData, startPos.x, startPos.z, rng);
  for (const m of monsters) scene3d.add(m.mesh);

  // State
  traps          = [];
  killedMonster  = false;
  deathMonsterType = null;
  jumpScareAlpha = 0;
  jumpScareTimer = 0;

  state = STATES.PLAY;
  overlay.style.display = 'none';
  hud.style.display     = 'block';
  crosshair.style.display = 'block';
}

// ── Input ─────────────────────────────────────────────────
window.addEventListener('keydown', e => {
  if (state === STATES.MENU) { initGame(); audio.resume(); return; }
  if ((state === STATES.DEAD || state === STATES.ESCAPED) && e.code === 'KeyR') { initGame(); return; }
  if (state !== STATES.PLAY) return;

  if (e.code === 'KeyE') {
    const result = player.tryInteract(audio, items, monsters);
    if (result) {
      if (result.action === 'pickup') {
        if (result.item.type === 'keycard') {
          notify(`🗝 Keycard ${player.keycardCount}/${CFG.KEYCARD_PIECES} gefunden!`, '#00ff88');
          if (player.canEscape) notify('🗝 ALLE KEYCARDS! Finde den EXIT!', '#ffff00', 5000);
        } else {
          notify(`📦 ${result.item.type} aufgehoben`, '#aaccff', 2000);
        }
      } else if (result.action === 'locked') notify('🔒 Tür abgeschlossen – du bist sicher!', '#00ff88');
      else if (result.action === 'unlocked') notify('🔓 Tür entsperrt', '#aaa', 1500);
      else if (result.action === 'locked_hint') notify('🔒 Von innen abgesperrt', '#ff4444', 1500);
    }
  }

  if (e.code === 'KeyC') {
    if (player.tryCraft(audio)) notify('⚒ Gezackter Knüppel gebaut!', '#ffcc00');
  }
  if (e.code === 'KeyH') {
    if (player.tryHeal(audio)) notify('💊 Geheilt!', '#00ff88');
  }
  if (e.code === 'KeyF' || e.code === 'Space') {
    if (player.tryAttack(monsters, audio)) triggerShake(10);
  }
  if (e.code === 'KeyT') {
    const trap = player.placeTrap(audio);
    if (trap) { traps.push(trap); notify('🔊 Lärm-Falle platziert', '#ff9900', 1500); }
  }
  if (e.code === 'KeyM') {
    const m = audio.toggleMute();
    notify(m ? '🔇 Ton aus' : '🔊 Ton an', '#aaa', 1200);
  }
});

document.getElementById('gameCanvas').addEventListener('click', () => {
  if (state === STATES.MENU) { initGame(); audio.resume(); return; }
  if (state === STATES.PLAY) { player.controls.lock(); audio.resume(); }
});

// Screen shake
let shakeX = 0, shakeY = 0, shakeFrames = 0;
function triggerShake(f) { shakeFrames = f; }

// ── Main loop ─────────────────────────────────────────────
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min((ts - _lastTime) / 1000, 0.05);
  _lastTime = ts;

  if (state === STATES.MENU) {
    renderMenu();
    return;
  }

  if (state !== STATES.PLAY) {
    renderer.render(scene3d, camera);
    drawOverlayCanvas();
    return;
  }

  // ── Gameplay tick ──────────────────────────────────────
  player.update(dt, audio);
  animateItems(items, dt);
  animateDoors(mapData, dt);

  // Flashlight follows camera
  const flDir = new THREE.Vector3();
  camera.getWorldDirection(flDir);
  flashlight.position.copy(camera.position);
  flashlight.target.position.copy(camera.position).addScaledVector(flDir, 5);
  flashlight.target.updateMatrixWorld();

  // Monsters
  for (const m of monsters) {
    m.update(dt, player, mapData, audio, traps);

    // Jump scare proximity
    const d = Math.hypot(m.pos.x - player.pos.x, m.pos.z - player.pos.z);
    if (d < T * 1.8 && !player.inStorage && jumpScareTimer <= 0) {
      jumpScareTimer = 90;
      jumpScareAlpha = 1;
      audio.playJumpScare();
      triggerShake(25);
    }
  }

  // Traps decay
  for (let i = traps.length - 1; i >= 0; i--) {
    traps[i].life -= dt * 60;
    if (traps[i].life <= 0) traps.splice(i, 1);
  }

  // Corridor light flicker
  if (Math.random() < 0.008) {
    const pl = corridorLights[Math.floor(Math.random() * corridorLights.length)];
    if (pl) pl.intensity = Math.random() < 0.3 ? 0 : 0.1 + Math.random() * 0.1;
  }

  // Proximity heartbeat / vignette
  const closestDist = monsters.reduce((mn, m) => Math.min(mn, Math.hypot(m.pos.x - player.pos.x, m.pos.z - player.pos.z)), Infinity);
  const tgtAlpha = closestDist < CFG.HEARTBEAT_DIST ? (1 - closestDist / CFG.HEARTBEAT_DIST) : 0;
  proximityAlpha += (tgtAlpha - proximityAlpha) * Math.min(1, dt * 3);
  audio.setHeartbeat(closestDist < CFG.HEARTBEAT_DIST && !player.inStorage);

  // Jump scare decay
  if (jumpScareTimer > 0) jumpScareTimer -= dt * 60;
  jumpScareAlpha = Math.max(0, jumpScareAlpha - dt * 1.5);

  // Screen shake
  if (shakeFrames > 0) {
    shakeFrames--;
    shakeX = (Math.random() - 0.5) * shakeFrames * 0.03;
    shakeY = (Math.random() - 0.5) * shakeFrames * 0.03;
    camera.position.x += shakeX;
    camera.position.y += shakeY;
  }

  // Exit check
  if (player.canEscape && mapData.exitTile) {
    const et = mapData.exitTile;
    const ed = Math.hypot(player.pos.x - (et.x+0.5)*T, player.pos.z - (et.y+0.5)*T);
    if (ed < T * 0.8) {
      player.escaped = true;
      state = STATES.ESCAPED;
      audio.setHeartbeat(false);
      audio.playEscape();
      player.controls.unlock();
      showEndScreen(false);
    }
  }

  if (player.dead) {
    state = STATES.DEAD;
    audio.setHeartbeat(false);
    player.controls.unlock();
    deathMonsterType = monsters.reduce((b, m) => {
      const d = Math.hypot(m.pos.x - player.pos.x, m.pos.z - player.pos.z);
      return d < b.d ? { d, type: m.type } : b;
    }, { d: Infinity, type: MON.BLIND }).type;
    showEndScreen(true);
  }

  updateHUD();
  renderer.render(scene3d, camera);
  drawOverlayCanvas();
}

function renderMenu() {
  if (!scene3d) {
    // Draw menu on a plain canvas
  }
  renderer.setClearColor(0x000000);
  renderer.clear();
  drawMenuCanvas();
}

// ── 2D overlay canvas ────────────────────────────────────
const cvs2 = document.getElementById('canvas2d');
const ctx2  = cvs2.getContext('2d');

function resize2d() { cvs2.width = window.innerWidth; cvs2.height = window.innerHeight; }
resize2d();
window.addEventListener('resize', resize2d);

function drawOverlayCanvas() {
  const w = cvs2.width, h = cvs2.height;
  ctx2.clearRect(0, 0, w, h);

  // Vignette always
  const vig = ctx2.createRadialGradient(w/2, h/2, h*0.25, w/2, h/2, h*0.8);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx2.fillStyle = vig;
  ctx2.fillRect(0, 0, w, h);

  // Proximity red pulse
  if (proximityAlpha > 0.02) {
    const rv = ctx2.createRadialGradient(w/2, h/2, 0, w/2, h/2, Math.max(w,h));
    rv.addColorStop(0, 'rgba(0,0,0,0)');
    rv.addColorStop(0.6, `rgba(120,0,0,${proximityAlpha * 0.15})`);
    rv.addColorStop(1,   `rgba(180,0,0,${proximityAlpha * 0.45})`);
    ctx2.fillStyle = rv;
    ctx2.fillRect(0, 0, w, h);
  }

  // Jump scare flash
  if (jumpScareAlpha > 0) {
    ctx2.fillStyle = `rgba(180,0,0,${jumpScareAlpha * 0.7})`;
    ctx2.fillRect(0, 0, w, h);
  }

  // Safe zone blue tint
  if (player?.inStorage) {
    const pulse = 0.08 + 0.04 * Math.sin(Date.now() / 400);
    ctx2.fillStyle = `rgba(0,80,180,${pulse})`;
    ctx2.fillRect(0, 0, w, h);
    ctx2.strokeStyle = `rgba(0,150,255,${pulse * 4})`;
    ctx2.lineWidth = 4;
    ctx2.strokeRect(2, 2, w-4, h-4);
  }

  // Exit glow on HUD when near
  if (player?.canEscape && mapData) {
    const et = mapData.exitTile;
    if (et) {
      const ed = Math.hypot(player.pos.x - (et.x+0.5)*T, player.pos.z - (et.y+0.5)*T);
      if (ed < T * 3) {
        const pulse = 0.4 + 0.3 * Math.sin(Date.now() / 200);
        ctx2.fillStyle = `rgba(0,255,80,${pulse * 0.15})`;
        ctx2.fillRect(0, 0, w, h);
        ctx2.fillStyle = `rgba(0,255,80,${pulse})`;
        ctx2.font = 'bold 18px monospace';
        ctx2.textAlign = 'center';
        ctx2.fillText('▼ EXIT ▼', w/2, h/2 + 40);
      }
    }
  }
}

function drawMenuCanvas() {
  const w = cvs2.width, h = cvs2.height;
  ctx2.fillStyle = '#000';
  ctx2.fillRect(0, 0, w, h);

  const t = Date.now() / 1000;
  const flicker = 0.8 + 0.2 * Math.sin(t * 14 + Math.random() * 0.3);
  ctx2.shadowColor = '#ff0000';
  ctx2.shadowBlur  = 30;
  ctx2.fillStyle   = `rgba(200,0,0,${flicker})`;
  ctx2.font        = 'bold 56px monospace';
  ctx2.textAlign   = 'center';
  ctx2.fillText('STORAGE', w/2, h/2 - 60);
  ctx2.fillText('NIGHTMARE', w/2, h/2 + 10);
  ctx2.shadowBlur = 0;

  ctx2.fillStyle = '#555';
  ctx2.font = '14px monospace';
  ctx2.fillText('First-Person Horror', w/2, h/2 + 50);
  ctx2.fillText('Sammle 4 Schlüsselkarten • Finde den Exit • Versteck dich', w/2, h/2 + 74);

  const pulse = 0.6 + 0.4 * Math.sin(t * 2);
  ctx2.fillStyle = `rgba(180,180,100,${pulse})`;
  ctx2.font = 'bold 17px monospace';
  ctx2.fillText('[ KLICKEN ODER TASTE DRÜCKEN ]', w/2, h/2 + 130);

  ctx2.fillStyle = '#333';
  ctx2.font = '11px monospace';
  ctx2.fillText('⚠ Enthält Jump Scares', w/2, h - 22);

  // Controls
  ctx2.fillStyle = '#3a3a3a';
  ctx2.fillRect(w/2 - 220, h/2 + 155, 440, 105);
  ctx2.fillStyle = '#666';
  ctx2.font = '11px monospace';
  const lines = ['WASD = Bewegen  |  Maus = Umsehen  |  Shift = Sprinten',
    'E = Aufheben / Tür  |  F / Leertaste = Angreifen',
    'C = Knüppel craften  |  H = Heilen  |  T = Falle  |  M = Ton'];
  lines.forEach((l, i) => ctx2.fillText(l, w/2, h/2 + 175 + i*18));
}

function showEndScreen(dead) {
  overlay.style.display = 'flex';
  hud.style.display     = 'none';
  crosshair.style.display = 'none';

  if (dead) {
    const msgs = {
      [MON.BLIND]:   'Es hat deine Schritte gehört.',
      [MON.DEAF]:    'Es hat dich gesehen. Du konntest nicht entkommen.',
      [MON.STALKER]: 'Es stand schon hinter dir.',
    };
    overlayTitle.textContent = 'DU BIST GESTORBEN';
    overlayTitle.style.color = '#cc0000';
    overlayBody.innerHTML = `<p>${msgs[deathMonsterType] || 'Die Dunkelheit hat dich verschluckt.'}</p><p class="restart">[R] Nochmal versuchen</p>`;
  } else {
    overlayTitle.textContent = killedMonster ? '★ MONSTER-JÄGER ★' : '◆ ENTKOMMEN ◆';
    overlayTitle.style.color = '#00ff88';
    overlayBody.innerHTML = `<p>${killedMonster ? 'Du hast zurückgekämpft und bist entkommen.' : 'Du bist lautlos in die Nacht verschwunden.'}</p><p style="color:#ff6600">🏆 Kosmetik freigeschaltet: Storage Überlebender</p><p class="restart">[R] Nochmal spielen</p>`;
  }
}

// ── Boot ──────────────────────────────────────────────────
requestAnimationFrame(loop);

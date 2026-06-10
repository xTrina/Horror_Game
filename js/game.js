import * as THREE from 'three';
import { CFG, MON } from './config.js';
import { MapData, rng32 } from './mapdata.js';
import { buildScene, animateDoors, addCorridorLights } from './scene.js';
import { Player } from './player.js';
import { buildItems, animateItems } from './items.js';
import { spawnMonsters } from './monsters.js';
import { Audio3D } from './audio.js';

const T = CFG.TILE;

// ── Renderer ──────────────────────────────────────────────
const canvas3d = document.getElementById('gameCanvas');
const renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;

const camera = new THREE.PerspectiveCamera(80, 1, 0.05, 200);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener('resize', resize);

// ── State ─────────────────────────────────────────────────
const ST = { MENU: 0, PLAY: 1, DEAD: 2, ESCAPED: 3 };
let state = ST.MENU;
let scene3d, mapData, player, monsters, items, traps, corridorLights;
let flashlight, flTarget;
let jumpScareTimer = 0, jumpScareAlpha = 0;
let proximityAlpha = 0;
let deathType = null;
let killedMonster = false;
let _last = 0;

const audio = new Audio3D();

// ── 2D overlay ────────────────────────────────────────────
const cvs2 = document.getElementById('canvas2d');
const ctx2  = cvs2.getContext('2d');
function resize2d() { cvs2.width = window.innerWidth; cvs2.height = window.innerHeight; }
resize2d(); window.addEventListener('resize', resize2d);

// ── HUD elements ──────────────────────────────────────────
const el = id => document.getElementById(id);
const hud        = el('hud');
const hudKeys    = el('hud-keys');
const hudHp      = el('hud-hp');
const hudInv     = el('hud-inv');
const hudCraft   = el('hud-craft');
const hudPrompt  = el('hud-prompt');
const hudDoor    = el('hud-door');
const hudSafe    = el('hud-safe');
const hudNotif   = el('hud-notif');
const crosshair  = el('crosshair');
const overlay    = el('overlay');
const ovTitle    = el('overlay-title');
const ovBody     = el('overlay-body');
let notifTimer   = null;

function notify(text, color = '#ffcc00', ms = 3000) {
  hudNotif.textContent = text;
  hudNotif.style.color = color;
  hudNotif.style.opacity = '1';
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => { hudNotif.style.opacity = '0'; }, ms);
}

function updateHUD() {
  if (!player) return;
  // Keycards
  let kc = '';
  for (let i = 0; i < CFG.KEYCARD_PIECES; i++)
    kc += `<span class="kcard ${i < player.keycardCount ? 'have' : ''}">▪</span>`;
  hudKeys.innerHTML = '🗝 ' + kc + ` ${player.keycardCount}/${CFG.KEYCARD_PIECES}`;

  // HP
  hudHp.textContent = '❤️'.repeat(player.hp) + '🖤'.repeat(3 - player.hp);

  // Inventory
  const inv = [];
  if (player.hasWeapon)  inv.push('⚒ Knüppel');
  else if (player.hasSlat) inv.push('🪵 Latte');
  if (player.nails)     inv.push(`📌×${player.nails}`);
  if (player.medicines) inv.push(`💊×${player.medicines}`);
  if (player.traps)     inv.push(`📢×${player.traps}`);
  hudInv.textContent = inv.join('  ') || '(leer)';

  // Safe zone
  hudSafe.style.opacity = player.inStorage ? '1' : '0';

  // Nearest item prompt
  const ni = player.getNearestItem(items || []);
  if (ni) {
    hudPrompt.textContent = `[E] Aufheben: ${ni.type}`;
    hudPrompt.style.opacity = '1';
  } else { hudPrompt.style.opacity = '0'; }

  // Door prompt
  const nd = player.getNearestDoor();
  if (nd) {
    if (player.inStorage && !nd.open) {
      hudDoor.textContent = nd.locked ? '[E] Tür aufschließen' : '[E] Abschließen – verstecken!';
    } else if (!nd.locked) {
      hudDoor.textContent = nd.open ? '[E] Tür schließen' : '[E] Tür öffnen';
    } else {
      hudDoor.textContent = '🔒 Von innen verriegelt';
    }
    hudDoor.style.opacity = '1';
  } else { hudDoor.style.opacity = '0'; }

  // Craft prompt
  if (player.hasSlat && player.nails >= 2 && !player.hasWeapon) {
    hudCraft.style.opacity = '1';
  } else { hudCraft.style.opacity = '0'; }
}

// ── Start game ────────────────────────────────────────────
function startGame() {
  const seed = Date.now();
  const rng  = rng32(seed);

  // Clear
  scene3d = new THREE.Scene();
  scene3d.fog = new THREE.FogExp2(0x000000, 0.055);   // lighter fog = more visibility

  // Ambient: slightly brighter so you can see outlines
  scene3d.add(new THREE.AmbientLight(0x223344, 0.9));

  // Flashlight — wider cone, longer range, warmer colour
  flashlight = new THREE.SpotLight(0xfff5e0, 5, 28, 0.52, 0.35, 1.2);
  flashlight.castShadow = true;
  flashlight.shadow.mapSize.set(512, 512);
  flashlight.shadow.camera.far = 28;
  flTarget = new THREE.Object3D();
  scene3d.add(flTarget);
  flashlight.target = flTarget;
  scene3d.add(flashlight);

  // Map + scene geometry
  mapData = new MapData(seed);
  buildScene(scene3d, mapData);
  corridorLights = addCorridorLights(scene3d, mapData);

  // Player
  const sp = mapData.randomCorridorPos(rng);
  player = new Player(camera, canvas3d, mapData);
  player.addToScene(scene3d);
  player.setPosition(sp.x, sp.z);

  // Pointer lock on canvas click
  canvas3d.addEventListener('click', () => {
    if (state === ST.PLAY) { player.controls.lock(); audio.resume(); }
  }, { once: false });

  // Items
  items = buildItems(scene3d, mapData);

  // Monsters
  monsters = spawnMonsters(mapData, sp.x, sp.z, rng);
  for (const m of monsters) scene3d.add(m.mesh);

  traps         = [];
  killedMonster = false;
  deathType     = null;
  jumpScareTimer = jumpScareAlpha = proximityAlpha = 0;

  state = ST.PLAY;
  overlay.style.display    = 'none';
  hud.style.display        = 'block';
  crosshair.style.display  = 'block';
  el('click-prompt').style.display = 'block';
}

// ── Input ─────────────────────────────────────────────────
window.addEventListener('keydown', e => {
  if (state === ST.MENU) { startGame(); audio.resume(); return; }
  if (state !== ST.PLAY) {
    if (e.code === 'KeyR') startGame();
    return;
  }

  if (e.code === 'KeyE') {
    const r = player.tryInteract(audio, items);
    if (r) {
      if (r.action === 'pickup') {
        if (r.item.type === 'keycard') {
          notify(`🗝 Keycard ${player.keycardCount}/${CFG.KEYCARD_PIECES} gefunden!`, '#00ff88');
          if (player.canEscape) notify('🗝 ALLE KEYCARDS – FINDE DEN EXIT!', '#ffff00', 6000);
        } else { notify(`📦 ${r.item.type} aufgehoben`, '#aaccff', 2000); }
      }
      else if (r.action === 'locked')      notify('🔒 Tür verriegelt – du bist sicher!', '#00ff88');
      else if (r.action === 'unlocked')    notify('🔓 Entriegelt', '#aaa', 1500);
      else if (r.action === 'locked_hint') notify('🔒 Von innen verriegelt', '#ff4444', 1500);
    }
  }
  if (e.code === 'KeyC') { if (player.tryCraft(audio)) notify('⚒ Gezackter Knüppel gebaut!', '#ffcc00'); }
  if (e.code === 'KeyH') { if (player.tryHeal(audio)) notify('💊 Geheilt!', '#00ff88'); }
  if (e.code === 'KeyF' || e.code === 'Space') {
    if (player.tryAttack(monsters, audio)) shakeFrames = 12;
  }
  if (e.code === 'KeyT') {
    const t = player.placeTrap(audio);
    if (t) { traps.push(t); notify('📢 Lärm-Falle platziert', '#ff9900', 1500); }
  }
  if (e.code === 'KeyM') {
    notify(audio.toggleMute() ? '🔇 Ton aus' : '🔊 Ton an', '#aaa', 1200);
  }
});

// Click canvas to start from menu
canvas3d.addEventListener('click', () => {
  if (state === ST.MENU) { startGame(); audio.resume(); }
});

// ── Screen shake ──────────────────────────────────────────
let shakeFrames = 0;

// ── Main loop ─────────────────────────────────────────────
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min((ts - _last) / 1000, 0.05);
  _last = ts;

  if (state === ST.MENU) { drawMenu(); return; }

  if (state !== ST.PLAY) {
    renderer.render(scene3d, camera);
    drawPlay2D();
    return;
  }

  // ── Tick ──────────────────────────────────────────────
  player.update(dt, audio);
  animateItems(items, dt);
  animateDoors(mapData, dt);

  // Flashlight follows camera
  const fl = flashlight;
  fl.position.copy(player.pos);
  fl.position.y = player.pos.y;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  flTarget.position.copy(player.pos).addScaledVector(dir, 6);
  flTarget.updateMatrixWorld();

  // Monsters
  for (const m of monsters) {
    m.update(dt, player, mapData, audio, traps);
    const d = Math.hypot(m.pos.x - player.pos.x, m.pos.z - player.pos.z);
    if (d < T * 1.8 && !player.inStorage && jumpScareTimer <= 0) {
      jumpScareTimer = 90;
      jumpScareAlpha = 1;
      audio.playJumpScare();
      shakeFrames = 25;
    }
  }

  // Traps
  for (let i = traps.length - 1; i >= 0; i--) {
    traps[i].life -= dt * 60;
    if (traps[i].life <= 0) traps.splice(i, 1);
  }

  // Corridor flicker
  if (Math.random() < 0.006 && corridorLights.length) {
    const pl = corridorLights[Math.floor(Math.random() * corridorLights.length)];
    pl.intensity = Math.random() < 0.25 ? 0 : 0.12 + Math.random() * 0.12;
  }

  // Proximity
  const closest = monsters.reduce((mn, m) =>
    Math.min(mn, Math.hypot(m.pos.x - player.pos.x, m.pos.z - player.pos.z)), Infinity);
  const tgt = closest < CFG.HEARTBEAT_DIST ? (1 - closest / CFG.HEARTBEAT_DIST) : 0;
  proximityAlpha += (tgt - proximityAlpha) * Math.min(1, dt * 3);
  audio.setHeartbeat(closest < CFG.HEARTBEAT_DIST && !player.inStorage);

  if (jumpScareTimer > 0) jumpScareTimer -= dt * 60;
  jumpScareAlpha = Math.max(0, jumpScareAlpha - dt * 1.8);

  // Screen shake
  if (shakeFrames > 0) {
    shakeFrames--;
    const s = shakeFrames * 0.018;
    player._yaw.position.x += (Math.random() - 0.5) * s;
    player._yaw.position.y += (Math.random() - 0.5) * s;
    // Restore Z immediately so pos.x/z aren't wrong for collision
  }

  // Exit check
  if (player.canEscape && mapData.exitTile) {
    const et = mapData.exitTile;
    if (Math.hypot(player.pos.x - (et.x+0.5)*T, player.pos.z - (et.y+0.5)*T) < T * 0.85) {
      player.escaped = true;
    }
  }

  if (player.dead || player.escaped) {
    state = player.dead ? ST.DEAD : ST.ESCAPED;
    audio.setHeartbeat(false);
    player.controls.unlock();
    deathType = monsters.reduce((b, m) => {
      const d = Math.hypot(m.pos.x - player.pos.x, m.pos.z - player.pos.z);
      return d < b.d ? { d, type: m.type } : b;
    }, { d: Infinity, type: MON.BLIND }).type;
    showEnd(player.dead);
  }

  updateHUD();
  renderer.render(scene3d, camera);
  drawPlay2D();
}

// ── 2D overlays ───────────────────────────────────────────
function drawPlay2D() {
  const w = cvs2.width, h = cvs2.height;
  ctx2.clearRect(0, 0, w, h);

  // Static vignette
  const vig = ctx2.createRadialGradient(w/2, h/2, h*0.22, w/2, h/2, h*0.85);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.62)');
  ctx2.fillStyle = vig;
  ctx2.fillRect(0, 0, w, h);

  // Proximity red pulse
  if (proximityAlpha > 0.03) {
    const rv = ctx2.createRadialGradient(w/2,h/2,0, w/2,h/2,Math.max(w,h));
    rv.addColorStop(0,   'rgba(0,0,0,0)');
    rv.addColorStop(0.55,`rgba(120,0,0,${proximityAlpha*0.14})`);
    rv.addColorStop(1,   `rgba(200,0,0,${proximityAlpha*0.5})`);
    ctx2.fillStyle = rv;
    ctx2.fillRect(0, 0, w, h);
  }

  // Jump scare
  if (jumpScareAlpha > 0) {
    ctx2.fillStyle = `rgba(160,0,0,${jumpScareAlpha * 0.72})`;
    ctx2.fillRect(0, 0, w, h);
  }

  // Safe zone glow
  if (player?.inStorage) {
    const pulse = 0.07 + 0.04 * Math.sin(Date.now()/380);
    ctx2.fillStyle = `rgba(0,80,200,${pulse})`;
    ctx2.fillRect(0, 0, w, h);
    ctx2.strokeStyle = `rgba(60,160,255,${pulse * 5})`;
    ctx2.lineWidth = 4;
    ctx2.strokeRect(2, 2, w-4, h-4);
  }

  // Exit proximity glow
  if (player?.canEscape && mapData) {
    const et = mapData.exitTile;
    const d  = Math.hypot(player.pos.x-(et.x+0.5)*T, player.pos.z-(et.y+0.5)*T);
    if (d < T * 3) {
      const a = (1 - d/(T*3)) * (0.5 + 0.3 * Math.sin(Date.now()/180));
      ctx2.fillStyle = `rgba(0,255,60,${a * 0.15})`;
      ctx2.fillRect(0, 0, w, h);
      ctx2.fillStyle = `rgba(0,255,60,${a * 0.9})`;
      ctx2.font = 'bold 20px monospace';
      ctx2.textAlign = 'center';
      ctx2.shadowColor = '#00ff44';
      ctx2.shadowBlur = 12;
      ctx2.fillText('▼  EXIT  ▼', w/2, h/2 + 60);
      ctx2.shadowBlur = 0;
    }
  }

  // Weapon swing flash
  if (player?.swingFrame > 0) {
    ctx2.fillStyle = `rgba(255,255,255,${(player.swingFrame/20) * 0.08})`;
    ctx2.fillRect(0, 0, w, h);
  }
}

function drawMenu() {
  const w = cvs2.width, h = cvs2.height;
  ctx2.fillStyle = '#000';
  ctx2.fillRect(0, 0, w, h);

  const t = Date.now() / 1000;
  const fl = 0.82 + 0.18 * Math.sin(t * 16 + Math.random() * 0.2);
  ctx2.shadowColor = '#cc0000';
  ctx2.shadowBlur  = 35;
  ctx2.fillStyle   = `rgba(210,10,10,${fl})`;
  ctx2.font        = 'bold 60px monospace';
  ctx2.textAlign   = 'center';
  ctx2.fillText('STORAGE', w/2, h/2 - 55);
  ctx2.fillText('NIGHTMARE', w/2, h/2 + 20);
  ctx2.shadowBlur = 0;

  ctx2.fillStyle = '#4a4a55';
  ctx2.font = '14px monospace';
  ctx2.fillText('First-Person Horror  |  Sammle 4 Schlüsselkarten  |  Finde den Exit', w/2, h/2 + 62);

  const p = 0.6 + 0.4 * Math.sin(t * 2.2);
  ctx2.fillStyle = `rgba(190,185,110,${p})`;
  ctx2.font = 'bold 18px monospace';
  ctx2.fillText('[ KLICKEN ODER TASTE DRÜCKEN ]', w/2, h/2 + 118);

  ctx2.fillStyle = '#2e2e38';
  ctx2.fillRect(w/2-240, h/2+140, 480, 120);
  ctx2.strokeStyle = '#3a3a48';
  ctx2.lineWidth = 1;
  ctx2.strokeRect(w/2-240, h/2+140, 480, 120);
  ctx2.fillStyle = '#555';
  ctx2.font = '12px monospace';
  const lines = [
    'WASD / Pfeiltasten  →  Bewegen',
    'Maus (Klick zum Sperren)  →  Umsehen  |  Shift  →  Sprinten',
    'E  →  Aufheben / Tür öffnen-schließen-abschließen',
    'F / Leertaste  →  Angreifen  |  C  →  Waffe craften  |  H  →  Heilen  |  M  →  Ton',
  ];
  lines.forEach((l, i) => ctx2.fillText(l, w/2, h/2 + 162 + i * 22));

  ctx2.fillStyle = '#2a2a2a';
  ctx2.font = '11px monospace';
  ctx2.fillText('⚠ Enthält Jump Scares', w/2, h - 16);
}

function showEnd(dead) {
  overlay.style.display = 'flex';
  hud.style.display     = 'none';
  crosshair.style.display = 'none';

  if (dead) {
    const msgs = {
      [MON.BLIND]:   'Es hat deine Schritte gehört.',
      [MON.DEAF]:    'Es hat dich gesehen. Kein Entkommen.',
      [MON.STALKER]: 'Es stand bereits hinter dir.',
    };
    ovTitle.textContent = 'DU BIST GESTORBEN';
    ovTitle.style.color = '#cc0000';
    ovBody.innerHTML = `<p>${msgs[deathType] || 'Die Dunkelheit verschluckte dich.'}</p><p class="restart">[R] Nochmal versuchen</p>`;
  } else {
    ovTitle.textContent = '◆ ENTKOMMEN ◆';
    ovTitle.style.color = '#00ff88';
    ovBody.innerHTML = `<p>Du bist lautlos in die Nacht verschwunden.</p><p style="color:#ff6600;margin-top:12px">🏆 Freischaltung: Storage-Überlebender</p><p class="restart">[R] Nochmal spielen</p>`;
  }
}

requestAnimationFrame(loop);

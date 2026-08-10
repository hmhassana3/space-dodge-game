'use strict';

/* =========================================================================
   SPACE DODGE 🚀  —  game.js
   70-level, 10-world arcade campaign. Vanilla JS + Canvas. No dependencies.
========================================================================= */

/* ------------------------- Utility ------------------------- */
function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function dist2(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; }
function circlesHit(a, b) { const r = a.r + b.r; return dist2(a.x, a.y, b.x, b.y) <= r * r; }
function padScore(n) { return String(Math.floor(Math.max(0, n))).padStart(6, '0'); }
function padCoins(n) { return String(Math.floor(Math.max(0, n))).padStart(3, '0'); }
function formatTime(sec) {
  sec = Math.floor(sec);
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
function formatClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/* ------------------------- Storage ------------------------- */
const STORAGE_KEY = 'spaceDodge_save_v2';
const LEGACY_KEY = 'spaceDodge_save_v1';

function defaultSave() {
  return {
    settings: { sound: 'on', music: 'on', graphics: 'medium', controls: 'auto' },
    selectedShip: 'explorer',
    unlockedShips: ['explorer'],
    levels: {}, // levelNum -> { completed, bestScore, bestTimeSec, bestAccuracy, coinsCollected, objectives }
    highestUnlockedLevel: 1,
    bestScoreGlobal: 0,
    totalCoinsGlobal: 0,
    bestLevelReachedGlobal: 1,
    bestSurvivalTimeGlobal: 0,
    bossesDefeated: [],
    tutorialSeen: false,
    campaignCompleted: false
  };
}
function loadSave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      const merged = Object.assign(defaultSave(), data);
      merged.settings = Object.assign(defaultSave().settings, data.settings || {});
      merged.levels = data.levels || {};
      return merged;
    }
    // Light migration from the old endless-mode save, if present
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      const fresh = defaultSave();
      fresh.bestScoreGlobal = legacy.bestScore || 0;
      fresh.totalCoinsGlobal = legacy.totalCoins || 0;
      fresh.bestSurvivalTimeGlobal = legacy.bestTimeSec || 0;
      if (legacy.settings) fresh.settings = Object.assign(fresh.settings, legacy.settings);
      return fresh;
    }
    return defaultSave();
  } catch (e) {
    return defaultSave();
  }
}
function writeSave(save) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(save)); } catch (e) { /* ignore quota errors */ }
}
let SAVE = loadSave();
function getLevelSave(num) {
  if (!SAVE.levels[num]) {
    SAVE.levels[num] = { completed: false, bestScore: 0, bestTimeSec: 0, bestAccuracy: 0, coinsCollected: 0, objectives: 0 };
  }
  return SAVE.levels[num];
}

/* ------------------------- Audio Engine (WebAudio, generated) ------------------------- */
const AudioEngine = (() => {
  let ctx = null;
  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function enabled() { return SAVE.settings.sound !== 'off'; }

  function tone(freq, duration, type = 'sine', gainVal = 0.18, startDelay = 0, freqEnd = null) {
    if (!enabled()) return;
    const c = ensureCtx();
    if (!c) return;
    const t0 = c.currentTime + startDelay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + duration);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(gainVal, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }
  function noiseBurst(duration = 0.25, gainVal = 0.2, startDelay = 0) {
    if (!enabled()) return;
    const c = ensureCtx();
    if (!c) return;
    const t0 = c.currentTime + startDelay;
    const bufferSize = Math.floor(c.sampleRate * duration);
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = c.createBufferSource();
    src.buffer = buffer;
    const gain = c.createGain();
    gain.gain.setValueAtTime(gainVal, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    src.connect(filter).connect(gain).connect(c.destination);
    src.start(t0);
  }

  return {
    click: () => tone(520, 0.08, 'square', 0.12),
    coin: () => { tone(880, 0.09, 'square', 0.14); tone(1320, 0.09, 'square', 0.1, 0.06); },
    powerup: () => { tone(440, 0.12, 'sawtooth', 0.14); tone(660, 0.12, 'sawtooth', 0.12, 0.08); tone(880, 0.16, 'sawtooth', 0.1, 0.16); },
    hit: () => { noiseBurst(0.3, 0.3); tone(120, 0.25, 'sawtooth', 0.2, 0, 40); },
    gameover: () => { tone(300, 0.3, 'sawtooth', 0.18, 0, 80); tone(200, 0.4, 'sawtooth', 0.16, 0.25, 50); },
    levelup: () => { tone(523, 0.1, 'square', 0.12); tone(659, 0.1, 'square', 0.12, 0.1); tone(784, 0.16, 'square', 0.13, 0.2); },
    shieldbreak: () => { noiseBurst(0.2, 0.22); tone(200, 0.2, 'triangle', 0.15, 0, 60); },
    shoot: () => tone(880, 0.05, 'square', 0.06, 0, 1200),
    laserHit: () => { noiseBurst(0.12, 0.16); tone(600, 0.08, 'square', 0.1, 0, 200); },
    bossHit: () => tone(180, 0.12, 'sawtooth', 0.16, 0, 90),
    bossWarn: () => { tone(220, 0.4, 'sawtooth', 0.2, 0, 110); tone(220, 0.4, 'sawtooth', 0.2, 0.45, 110); },
    victory: () => { tone(523, 0.15, 'square', 0.14); tone(659, 0.15, 'square', 0.14, 0.15); tone(784, 0.15, 'square', 0.14, 0.3); tone(1046, 0.3, 'square', 0.16, 0.45); },
    combo: () => tone(1200, 0.07, 'square', 0.1, 0, 1600),
    ensureCtx
  };
})();

/* ------------------------- Screen Manager ------------------------- */
const Screens = {
  els: {},
  init() { document.querySelectorAll('.screen').forEach(el => { this.els[el.id] = el; }); },
  show(id) {
    Object.values(this.els).forEach(el => el.classList.remove('active'));
    if (this.els[id]) this.els[id].classList.add('active');
  }
};

/* ------------------------- Canvas Setup ------------------------- */
const canvas = document.getElementById('gameCanvas');
const ctx2d = canvas.getContext('2d');
let DPR = Math.min(window.devicePixelRatio || 1, 2);
let W = 0, H = 0;
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  W = rect.width; H = rect.height;
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  ctx2d.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 200));

/* ------------------------- WORLDS ------------------------- */
const WORLDS = [
  { id: 1, key: 'deepspace',   name: 'DEEP SPACE',          enemyPalette: ['asteroid'],                          hazards: [],              bossName: 'ROCK TITAN',      bossShape: 'fortress', color: '#00e5ff' },
  { id: 2, key: 'meteorbelt',  name: 'METEOR BELT',         enemyPalette: ['asteroid', 'meteor'],                hazards: [],              bossName: 'METEOR WYRM',     bossShape: 'serpent',   color: '#ff8a3d' },
  { id: 3, key: 'lasersector', name: 'LASER SECTOR',        enemyPalette: ['asteroid', 'drone'],                 hazards: ['laser'],       bossName: 'LASER SENTINEL',  bossShape: 'crystal',   color: '#ff3c3c' },
  { id: 4, key: 'alienfront',  name: 'ALIEN FRONTIER',      enemyPalette: ['drone', 'hunter'],                   hazards: ['laser'],       bossName: 'HIVE QUEEN',      bossShape: 'hive',      color: '#a63bff' },
  { id: 5, key: 'dreadnought', name: 'DREADNOUGHT WARZONE', enemyPalette: ['drone', 'bomber', 'hunter'],         hazards: ['laser'],       bossName: 'DREADNOUGHT',     bossShape: 'carrier',   color: '#ff2f6b' },
  { id: 6, key: 'gravity',     name: 'GRAVITY SECTOR',      enemyPalette: ['asteroid', 'meteor', 'drone'],       hazards: ['gravity'],     bossName: 'GRAVITY WRAITH',  bossShape: 'wraith',    color: '#8a5cff' },
  { id: 7, key: 'minefield',   name: 'MINEFIELD',           enemyPalette: ['mine', 'drone'],                     hazards: ['mine'],        bossName: 'MINE LORD',       bossShape: 'spider',    color: '#ffd23f' },
  { id: 8, key: 'galacticwar', name: 'GALACTIC WAR',        enemyPalette: ['hunter', 'bomber', 'drone'],         hazards: ['laser'],       bossName: 'WAR TITAN',       bossShape: 'cruiser',   color: '#ff6a3d' },
  { id: 9, key: 'voidsector',  name: 'VOID SECTOR',         enemyPalette: ['hunter', 'meteor', 'mine'],          hazards: ['laser', 'gravity'], bossName: 'VOID REAPER', bossShape: 'phantom',   color: '#4a4dff' },
  { id: 10, key: 'finalfront', name: 'FINAL FRONTIER',      enemyPalette: ['hunter', 'bomber', 'drone', 'mine'], hazards: ['laser', 'gravity', 'mine'], bossName: 'VOID TITAN', bossShape: 'titan', color: '#ff2fd0' }
];
function worldOf(levelNum) { return WORLDS[Math.floor((levelNum - 1) / 7)]; }
function indexInWorld(levelNum) { return ((levelNum - 1) % 7) + 1; } // 1..7

/* ------------------------- LEVEL GENERATOR (70 levels) ------------------------- */
const MISSION_ROTATION = ['survival', 'combat', 'collection', 'dodge', 'survival', 'mixed'];
function buildLevels() {
  const levels = [];
  for (let num = 1; num <= 70; num++) {
    const world = worldOf(num);
    const idx = indexInWorld(num); // 1..7
    const isBoss = idx === 7;
    const duration = clamp(95 + num * 1.1, 95, 210); // hard cap: no level exceeds 3.5 minutes
    const difficultyMul = 1 + (num - 1) * 0.045;
    const spawnRateMul = 1 + (num - 1) * 0.035;
    const missionType = isBoss ? 'boss' : MISSION_ROTATION[idx - 1];
    let objective = null;
    if (missionType === 'combat') objective = { type: 'combat', target: 8 + idx * 3 + Math.floor(num / 8) };
    else if (missionType === 'collection') objective = { type: 'collection', target: 8 + idx * 2 + Math.floor(num / 10) };
    else if (missionType === 'mixed') objective = { type: 'mixed', killTarget: 6 + idx * 2, coinTarget: 6 + idx };
    else if (missionType === 'survival' || missionType === 'dodge') objective = { type: missionType, target: Math.round(duration) };
    else if (missionType === 'boss') objective = { type: 'boss' };

    levels.push({
      num, world: world.id, worldName: world.name, indexInWorld: idx,
      name: isBoss ? `${world.name} — BOSS` : `${world.name} ${idx}`,
      isBoss,
      duration: Math.round(duration),
      difficultyMul, spawnRateMul,
      missionType, objective,
      enemyTypes: world.enemyPalette,
      hazards: world.hazards,
      coinsReward: 15 + Math.floor(num * 1.5)
    });
  }
  return levels;
}
const LEVELS = buildLevels();
function getLevel(num) { return LEVELS[clamp(num, 1, 70) - 1]; }

function isLevelUnlocked(num) { return num <= SAVE.highestUnlockedLevel; }
function isLevelCompleted(num) { return !!(SAVE.levels[num] && SAVE.levels[num].completed); }

/* ------------------------- SHIPS ------------------------- */
const SHIPS = [
  { id: 'explorer',   name: 'EXPLORER',   desc: 'Balanced all-rounder. A reliable starting vessel.', speed: 260, fireRate: 0.45, shieldBonus: 1.0, armor: 1.0, color: '#00e5ff', accent: '#8a5cff', unlockAt: 0 },
  { id: 'interceptor',name: 'INTERCEPTOR',desc: 'Stripped-down frame built purely for velocity.',     speed: 340, fireRate: 0.5,  shieldBonus: 0.85, armor: 0.9, color: '#37ffb0', accent: '#00e5ff', unlockAt: 10 },
  { id: 'striker',    name: 'STRIKER',    desc: 'Overclocked weapon systems, faster fire rate.',       speed: 250, fireRate: 0.26, shieldBonus: 1.0, armor: 0.95, color: '#ffd23f', accent: '#ff8a3d', unlockAt: 25 },
  { id: 'guardian',   name: 'GUARDIAN',   desc: 'Reinforced plating and extended shield uptime.',      speed: 230, fireRate: 0.5,  shieldBonus: 1.6, armor: 1.3, color: '#ff2fd0', accent: '#a63bff', unlockAt: 40 },
  { id: 'phantom',    name: 'PHANTOM',    desc: 'Advanced prototype — strong across every system.',    speed: 300, fireRate: 0.34, shieldBonus: 1.3, armor: 1.15, color: '#ff2f6b', accent: '#00e5ff', unlockAt: 60 }
];
function getShip(id) { return SHIPS.find(s => s.id === id) || SHIPS[0]; }
function completedLevelCount() { return Object.values(SAVE.levels).filter(l => l.completed).length; }
function refreshShipUnlocks() {
  SHIPS.forEach(s => {
    if (s.unlockAt <= completedLevelCount() && !SAVE.unlockedShips.includes(s.id)) {
      SAVE.unlockedShips.push(s.id);
    }
  });
}

/* ------------------------- Input Handling ------------------------- */
const Input = {
  keys: {}, dirX: 0, dirY: 0, boostHeld: false,
  isTouchDevice: ('ontouchstart' in window) || navigator.maxTouchPoints > 0,
};
window.addEventListener('keydown', (e) => {
  Input.keys[e.code] = true;
  if (e.code === 'Space') Input.boostHeld = true;
  if (e.code === 'KeyP') Game.togglePause();
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  Input.keys[e.code] = false;
  if (e.code === 'Space') Input.boostHeld = false;
});
function updateKeyboardDir() {
  let x = 0, y = 0;
  if (Input.keys['ArrowLeft'] || Input.keys['KeyA']) x -= 1;
  if (Input.keys['ArrowRight'] || Input.keys['KeyD']) x += 1;
  if (Input.keys['ArrowUp'] || Input.keys['KeyW']) y -= 1;
  if (Input.keys['ArrowDown'] || Input.keys['KeyS']) y += 1;
  // Don't overwrite joystick input when no keys are pressed
  if (x !== 0 || y !== 0) {
    const len = Math.hypot(x, y) || 1;
    Input.dirX = x / len; Input.dirY = y / len;
  } else if (!joystickActive) {
    Input.dirX = 0; Input.dirY = 0;
  }
}

const joystickZone = document.getElementById('joystickZone');
const joystickStick = document.getElementById('joystickStick');
let joystickActive = false, joystickTouchId = null, joystickCenter = { x: 0, y: 0 };
const JOY_RADIUS = 55;
function joystickStart(clientX, clientY, id) {
  joystickActive = true; joystickTouchId = id;
  const rect = joystickZone.getBoundingClientRect();
  joystickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  joystickMove(clientX, clientY);
}
function joystickMove(clientX, clientY) {
  if (!joystickActive) return;
  let dx = clientX - joystickCenter.x, dy = clientY - joystickCenter.y;
  const d = Math.hypot(dx, dy);
  if (d > JOY_RADIUS) { dx = (dx / d) * JOY_RADIUS; dy = (dy / d) * JOY_RADIUS; }
  joystickStick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  Input.dirX = clamp(dx / JOY_RADIUS, -1, 1); Input.dirY = clamp(dy / JOY_RADIUS, -1, 1);
}
function joystickEnd() {
  joystickActive = false; joystickTouchId = null;
  joystickStick.style.transform = 'translate(-50%, -50%)';
  Input.dirX = 0; Input.dirY = 0;
}
joystickZone.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; joystickStart(t.clientX, t.clientY, t.identifier); }, { passive: false });
// touchmove on window so stick still tracks if finger slides outside the zone
window.addEventListener('touchmove', (e) => {
  if (!joystickActive) return;
  e.preventDefault();
  for (const t of e.changedTouches) if (t.identifier === joystickTouchId) joystickMove(t.clientX, t.clientY);
}, { passive: false });
window.addEventListener('touchend', (e) => { for (const t of e.changedTouches) if (t.identifier === joystickTouchId) joystickEnd(); });
window.addEventListener('touchcancel', () => joystickEnd());
joystickZone.addEventListener('mousedown', (e) => joystickStart(e.clientX, e.clientY, 'mouse'));
window.addEventListener('mousemove', (e) => { if (joystickActive && joystickTouchId === 'mouse') joystickMove(e.clientX, e.clientY); });
window.addEventListener('mouseup', () => { if (joystickTouchId === 'mouse') joystickEnd(); });

const btnShieldBoost = document.getElementById('btnShieldBoost');
function bindHold(el, onStart, onEnd) {
  el.addEventListener('touchstart', (e) => { e.preventDefault(); onStart(); }, { passive: false });
  el.addEventListener('touchend', (e) => { e.preventDefault(); onEnd(); }, { passive: false });
  el.addEventListener('mousedown', onStart);
  el.addEventListener('mouseup', onEnd);
  el.addEventListener('mouseleave', onEnd);
}
bindHold(btnShieldBoost, () => { Input.boostHeld = true; }, () => { Input.boostHeld = false; });

/* ------------------------- Particles ------------------------- */
class Particle {
  constructor(x, y, vx, vy, life, color, size, gravity = 0) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life; this.color = color; this.size = size; this.gravity = gravity;
  }
  update(dt) { this.x += this.vx * dt; this.y += this.vy * dt; this.vy += this.gravity * dt; this.life -= dt; }
  draw(ctx) {
    const a = clamp(this.life / this.maxLife, 0, 1);
    ctx.globalAlpha = a; ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.size * a, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
}
let particles = [];
function spawnParticles(x, y, count, color, opts = {}) {
  const { speed = 100, life = 0.6, size = 3, spread = Math.PI * 2, angle = 0, gravity = 0 } = opts;
  const qualityScale = SAVE.settings.graphics === 'low' ? 0.4 : SAVE.settings.graphics === 'high' ? 1 : 0.7;
  const n = Math.max(1, Math.round(count * qualityScale));
  for (let i = 0; i < n; i++) {
    const a = angle + rand(-spread / 2, spread / 2);
    const s = rand(speed * 0.3, speed);
    particles.push(new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(life * 0.6, life), color, rand(size * 0.6, size), gravity));
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) { particles[i].update(dt); if (particles[i].life <= 0) particles.splice(i, 1); }
  const cap = SAVE.settings.graphics === 'low' ? 100 : SAVE.settings.graphics === 'high' ? 380 : 220;
  if (particles.length > cap) particles.splice(0, particles.length - cap);
}
function drawParticles() { for (const p of particles) p.draw(ctx2d); }
function explode(x, y, color = '#ffb347', big = false) {
  spawnParticles(x, y, big ? 26 : 14, color, { speed: big ? 220 : 140, life: 0.7, size: big ? 5 : 3.5 });
  spawnParticles(x, y, big ? 10 : 6, '#ffffff', { speed: big ? 260 : 160, life: 0.4, size: 2 });
}

/* ------------------------- Background Starfield + World Themes ------------------------- */
let bgStars = [];
let bgDecor = []; // planets / structures / gravity wells, regenerated per level
function initBgStars() {
  const count = SAVE.settings.graphics === 'low' ? 40 : SAVE.settings.graphics === 'high' ? 130 : 80;
  bgStars = [];
  for (let i = 0; i < count; i++) {
    bgStars.push({ x: rand(0, W || window.innerWidth), y: rand(0, H || window.innerHeight), r: rand(0.5, 2.2), speed: rand(20, 90), hue: Math.random() < 0.15 ? 'cyan' : Math.random() < 0.1 ? 'pink' : 'white', tw: rand(0, Math.PI * 2) });
  }
}
function initLevelDecor(world) {
  bgDecor = [];
  const n = SAVE.settings.graphics === 'low' ? 2 : SAVE.settings.graphics === 'high' ? 6 : 4;
  for (let i = 0; i < n; i++) {
    bgDecor.push({
      x: rand(0, W || 400), y: rand(0, H || 700), r: rand(30, 90),
      speed: rand(6, 18), kind: world.key, hue: world.color, seed: Math.random()
    });
  }
}
function drawBgStars(dt) {
  for (const s of bgStars) {
    s.y += s.speed * dt; s.tw += dt * 3;
    if (s.y > H + 4) { s.y = -4; s.x = rand(0, W); }
    const alpha = 0.5 + Math.sin(s.tw) * 0.4;
    let color = '255,255,255';
    if (s.hue === 'cyan') color = '0,229,255'; if (s.hue === 'pink') color = '255,47,208';
    ctx2d.fillStyle = `rgba(${color},${clamp(alpha, 0.15, 1)})`;
    ctx2d.beginPath(); ctx2d.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx2d.fill();
  }
}
function drawWorldTheme(world, dt) {
  ctx2d.save();
  for (const d of bgDecor) {
    d.y += d.speed * dt;
    if (d.y - d.r > H + 40) { d.y = -d.r - 20; d.x = rand(0, W); }
    ctx2d.globalAlpha = 0.16;
    if (world.key === 'gravity' || world.key === 'voidsector') {
      // swirling gravity well rings
      ctx2d.strokeStyle = d.hue; ctx2d.lineWidth = 2;
      for (let ring = 0; ring < 3; ring++) {
        ctx2d.globalAlpha = 0.08 - ring * 0.02;
        ctx2d.beginPath(); ctx2d.arc(d.x, d.y, d.r + ring * 14 + Math.sin(Date.now() / 500 + d.seed * 10) * 4, 0, Math.PI * 2); ctx2d.stroke();
      }
    } else if (world.key === 'minefield' || world.key === 'galacticwar') {
      // distant structures / battles (decorative rects + faint flashes)
      ctx2d.fillStyle = d.hue;
      ctx2d.fillRect(d.x - d.r * 0.5, d.y - d.r * 0.15, d.r, d.r * 0.3);
      if (Math.random() < 0.004) spawnParticles(d.x, d.y, 4, '#ff8844', { speed: 40, life: 0.5, size: 3 });
    } else if (world.key === 'lasersector' || world.key === 'alienfront' || world.key === 'dreadnought') {
      ctx2d.strokeStyle = d.hue; ctx2d.lineWidth = 1.5;
      ctx2d.strokeRect(d.x - d.r * 0.4, d.y - d.r * 0.4, d.r * 0.8, d.r * 0.8);
    } else if (world.key === 'finalfront') {
      ctx2d.fillStyle = d.hue;
      ctx2d.beginPath(); ctx2d.arc(d.x, d.y, d.r * 0.5, 0, Math.PI * 2); ctx2d.fill();
    } else {
      // deep space / meteor belt: soft planet silhouettes
      const grad = ctx2d.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.3, 2, d.x, d.y, d.r);
      grad.addColorStop(0, d.hue); grad.addColorStop(1, 'transparent');
      ctx2d.fillStyle = grad;
      ctx2d.beginPath(); ctx2d.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx2d.fill();
    }
  }
  ctx2d.restore();
}

/* ------------------------- Player ------------------------- */
class Player {
  constructor(ship) { this.ship = ship; this.reset(); }
  reset() {
    this.x = W / 2; this.y = H * 0.75; this.r = 16;
    this.baseSpeed = this.ship.speed;
    this.vx = 0; this.vy = 0;
    this.invincible = 0; this.shieldTimer = 0; this.speedBoostTimer = 0; this.magnetTimer = 0;
    this.hitFlash = 0; this.tilt = 0; this.fireTimer = 0;
    this.engineGlow = 0;
  }
  get speed() { let s = this.baseSpeed; if (this.speedBoostTimer > 0) s *= 1.7; return s; }
  update(dt) {
    updateKeyboardDir();
    let dx = Input.dirX, dy = Input.dirY;
    const moving = Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05;
    const targetVx = dx * this.speed, targetVy = dy * this.speed;
    this.vx += (targetVx - this.vx) * clamp(dt * 10, 0, 1);
    this.vy += (targetVy - this.vy) * clamp(dt * 10, 0, 1);

    // gravity well influence (applied externally via Game.applyGravity)
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.x = clamp(this.x, this.r + 4, W - this.r - 4);
    this.y = clamp(this.y, this.r + 4, H - this.r - 4);
    this.tilt = clamp(this.vx / this.speed, -1, 1) * 0.35;
    this.engineGlow += ((moving ? 1 : 0.4) - this.engineGlow) * clamp(dt * 6, 0, 1);

    if (this.invincible > 0) this.invincible -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.shieldTimer > 0) this.shieldTimer -= dt;
    if (this.speedBoostTimer > 0) this.speedBoostTimer -= dt;
    if (this.magnetTimer > 0) this.magnetTimer -= dt;

    if (Math.random() < (SAVE.settings.graphics === 'low' ? 0.35 : 0.75) * this.engineGlow) {
      spawnParticles(this.x + rand(-4, 4), this.y + this.r * 0.9, 1, Math.random() < 0.5 ? this.ship.color : this.ship.accent, { speed: 60, life: 0.35, size: 3, angle: Math.PI / 2, spread: 0.7 });
    }

    // auto-fire
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) { this.fireTimer = this.ship.fireRate; fireBullet(this); }
  }
  activateShieldBoost() {
    if (this.shieldTimer <= 0) { this.shieldTimer = 2.5 * this.ship.shieldBonus; AudioEngine.powerup(); }
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.tilt);

    // engine flame (behind ship)
    const flameLen = 10 + this.engineGlow * 16 + (this.speedBoostTimer > 0 ? 8 : 0);
    const flameGrad = ctx.createLinearGradient(0, this.r * 0.5, 0, this.r * 0.5 + flameLen);
    flameGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
    flameGrad.addColorStop(0.4, this.ship.color);
    flameGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = flameGrad;
    ctx.beginPath();
    ctx.moveTo(-5, this.r * 0.5);
    ctx.lineTo(0, this.r * 0.5 + flameLen);
    ctx.lineTo(5, this.r * 0.5);
    ctx.closePath(); ctx.fill();

    if (this.shieldTimer > 0) {
      const flashing = this.shieldTimer < 0.8;
      const alpha = flashing ? (0.4 + 0.4 * Math.sin(Date.now() / 60)) : 0.55;
      ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = '#37c9ff'; ctx.lineWidth = 3;
      ctx.shadowColor = '#37c9ff'; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(0, 0, this.r + 12, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    if (this.invincible > 0 && Math.floor(this.invincible * 12) % 2 === 0) ctx.globalAlpha = 0.4;

    // hull — sleek arrow-delta silhouette with panel lines and weapon mounts
    ctx.shadowColor = this.ship.color;
    ctx.shadowBlur = this.hitFlash > 0 ? 0 : 12;
    const bodyGrad = ctx.createLinearGradient(0, -this.r * 1.3, 0, this.r);
    bodyGrad.addColorStop(0, this.hitFlash > 0 ? '#ff5566' : '#eef4fb');
    bodyGrad.addColorStop(0.5, this.hitFlash > 0 ? '#c22' : '#9fb3c8');
    bodyGrad.addColorStop(1, this.hitFlash > 0 ? '#600' : '#3b4a5c');
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = this.ship.accent;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -this.r * 1.35);
    ctx.lineTo(this.r * 0.32, -this.r * 0.3);
    ctx.lineTo(this.r * 0.85, this.r * 0.85);
    ctx.lineTo(this.r * 0.28, this.r * 0.55);
    ctx.lineTo(0, this.r * 0.75);
    ctx.lineTo(-this.r * 0.28, this.r * 0.55);
    ctx.lineTo(-this.r * 0.85, this.r * 0.85);
    ctx.lineTo(-this.r * 0.32, -this.r * 0.3);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // wings / fins
    ctx.fillStyle = this.ship.accent;
    ctx.beginPath();
    ctx.moveTo(-this.r * 0.75, this.r * 0.2);
    ctx.lineTo(-this.r * 1.5, this.r * 0.95);
    ctx.lineTo(-this.r * 0.55, this.r * 0.65);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(this.r * 0.75, this.r * 0.2);
    ctx.lineTo(this.r * 1.5, this.r * 0.95);
    ctx.lineTo(this.r * 0.55, this.r * 0.65);
    ctx.closePath(); ctx.fill();

    // weapon mounts (small)
    ctx.fillStyle = '#222';
    ctx.fillRect(-this.r * 0.45, this.r * 0.1, 3, 8);
    ctx.fillRect(this.r * 0.45 - 3, this.r * 0.1, 3, 8);

    // cockpit
    const cockGrad = ctx.createRadialGradient(0, -this.r * 0.25, 1, 0, -this.r * 0.15, this.r * 0.32);
    cockGrad.addColorStop(0, '#eafcff'); cockGrad.addColorStop(1, this.ship.color);
    ctx.fillStyle = cockGrad;
    ctx.beginPath(); ctx.ellipse(0, -this.r * 0.15, this.r * 0.22, this.r * 0.32, 0, 0, Math.PI * 2); ctx.fill();

    // panel line details
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(0, -this.r * 0.3); ctx.lineTo(0, this.r * 0.6); ctx.stroke();

    // engine nozzle glow dots
    ctx.fillStyle = this.ship.color;
    ctx.beginPath(); ctx.arc(-this.r * 0.18, this.r * 0.55, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(this.r * 0.18, this.r * 0.55, 2.4, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }
}

/* ------------------------- Player Bullets ------------------------- */
let playerBullets = [];
function fireBullet(player) {
  playerBullets.push({ x: player.x, y: player.y - player.r, vx: 0, vy: -520, r: 3.5, color: player.ship.color });
  Game.shotsFired++;
  AudioEngine.shoot();
}
function updatePlayerBullets(dt) {
  for (let i = playerBullets.length - 1; i >= 0; i--) {
    const b = playerBullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y < -20) { playerBullets.splice(i, 1); continue; }
    let consumed = false;
    for (let j = obstacles.length - 1; j >= 0; j--) {
      const o = obstacles[j];
      if (!o.destructible) continue;
      if (circlesHit(b, o)) {
        o.hp -= 1;
        Game.shotsHit++;
        consumed = true;
        spawnParticles(b.x, b.y, 4, '#fff', { speed: 90, life: 0.25, size: 2 });
        if (o.hp <= 0) {
          explode(o.x, o.y, o.color || '#ffb347');
          obstacles.splice(j, 1);
          Game.registerKill();
        }
        break;
      }
    }
    if (!consumed && Game.boss && circlesHit(b, Game.boss)) {
      Game.boss.hp -= 1;
      Game.shotsHit++;
      consumed = true;
      AudioEngine.bossHit();
      spawnParticles(b.x, b.y, 5, '#fff', { speed: 110, life: 0.25, size: 2.5 });
    }
    if (consumed) playerBullets.splice(i, 1);
  }
}

/* ------------------------- Obstacles / Enemies ------------------------- */
let obstacles = [];
let enemyBullets = [];
let lasers = [];
let mines = [];

function spawnEnemyOfType(type, mul) {
  if (type === 'asteroid') return spawnAsteroid(mul);
  if (type === 'meteor') return spawnMeteor(mul);
  if (type === 'drone') return spawnDrone(mul);
  if (type === 'hunter') return spawnHunter(mul);
  if (type === 'bomber') return spawnBomber(mul);
  if (type === 'mine') return spawnMine(mul);
}
function spawnAsteroid(mul) {
  const r = rand(16, 34);
  obstacles.push({ type: 'asteroid', x: rand(r, W - r), y: -r - 10, r, vy: rand(70, 130) * mul, vx: rand(-20, 20), rot: rand(0, Math.PI * 2), rotSpeed: rand(-1.5, 1.5), hp: 2, destructible: true, color: '#8b7d6b', seed: Math.random() });
}
function spawnMeteor(mul) {
  const r = rand(8, 16);
  obstacles.push({ type: 'meteor', x: rand(r, W - r), y: -r - 10, r, vy: rand(180, 260) * mul, vx: rand(-40, 40), rot: rand(0, Math.PI * 2), rotSpeed: rand(-4, 4), hp: 1, destructible: true, color: '#ff8a3d' });
}
function spawnDrone(mul) {
  const r = 14;
  obstacles.push({ type: 'drone', x: rand(r, W - r), y: -r - 10, r, vy: rand(50, 80) * mul, vx: rand(-30, 30), hp: 2, destructible: true, color: '#a63bff', fireTimer: rand(1.2, 2) });
}
function spawnHunter(mul) {
  const r = 15;
  const fromLeft = Math.random() < 0.5;
  obstacles.push({ type: 'hunter', x: fromLeft ? -r - 10 : W + r + 10, y: rand(H * 0.08, H * 0.4), r, vy: rand(20, 40) * mul, vx: (fromLeft ? 1 : -1) * rand(70, 110) * mul, hp: 2, destructible: true, color: '#ff2f6b', wobble: rand(0, Math.PI * 2) });
}
function spawnBomber(mul) {
  const r = 18;
  obstacles.push({ type: 'bomber', x: rand(r, W - r), y: -r - 10, r, vy: rand(35, 55) * mul, vx: rand(-15, 15), hp: 3, destructible: true, color: '#ff6a3d', fireTimer: rand(1.5, 2.5) });
}
function spawnMine(mul) {
  const r = 16;
  mines.push({ type: 'mine', x: rand(r, W - r), y: -r - 10, r, vy: rand(25, 40) * mul, blink: 0, armed: false, armTimer: rand(0.8, 1.3), destructible: true, hp: 1, color: '#ffd23f' });
}

function fireEnemyBullet(enemy, arc = false) {
  const dx = Game.player.x - enemy.x, dy = Game.player.y - enemy.y;
  const d = Math.hypot(dx, dy) || 1;
  enemyBullets.push({ x: enemy.x, y: enemy.y, r: 5, vx: (dx / d) * (arc ? 160 : 220), vy: (dy / d) * (arc ? 160 : 220) + (arc ? 60 : 40), arc });
}

function spawnLaser(mul) {
  const horizontal = Math.random() < 0.5;
  if (horizontal) lasers.push({ type: 'laserH', y: rand(H * 0.15, H * 0.6), h: 6, life: 1.4, warn: 0.65 / clamp(mul, 1, 2.2) });
  else lasers.push({ type: 'laserV', x: rand(W * 0.15, W * 0.85), w: 6, life: 1.4, warn: 0.65 / clamp(mul, 1, 2.2) });
}

function spawnCoin() { collectibles.push({ type: Math.random() < 0.8 ? 'coin' : 'star', x: rand(24, W - 24), y: -20, r: 10, vy: rand(90, 140), spin: 0 }); }
const POWERUP_TYPES = ['shield', 'speed', 'magnet', 'life'];
function spawnPowerup() { powerupsOnField.push({ type: POWERUP_TYPES[randInt(0, POWERUP_TYPES.length - 1)], x: rand(28, W - 28), y: -24, r: 15, vy: 110, bob: rand(0, Math.PI * 2) }); }

let collectibles = [];
let powerupsOnField = [];

/* ------------------------- Spawning Director ------------------------- */
function updateSpawning(dt) {
  const level = Game.level; if (!level) return;
  const t = Game.spawnTimers;
  const mul = level.spawnRateMul, speedMul = level.difficultyMul;

  t.enemy -= dt; t.hazard -= dt; t.coin -= dt; t.powerup -= dt;

  const enemyInterval = clamp(1.3 / mul, 0.28, 1.3);
  if (t.enemy <= 0 && !Game.boss) {
    const type = level.enemyTypes[randInt(0, level.enemyTypes.length - 1)];
    spawnEnemyOfType(type, speedMul);
    t.enemy = enemyInterval + rand(-0.15, 0.15);
  }
  if (level.hazards.includes('laser') && t.hazard <= 0 && !Game.boss) {
    spawnLaser(speedMul);
    t.hazard = clamp(3.4 / mul, 1.4, 3.4) + rand(-0.4, 0.4);
  }
  if (t.coin <= 0) { spawnCoin(); t.coin = rand(0.6, 1.1); }
  if (t.powerup <= 0) { spawnPowerup(); t.powerup = rand(9, 15); }
}

/* ------------------------- Update: Obstacles / Hazards ------------------------- */
function updateObstacles(dt) {
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    if (o.type === 'asteroid' || o.type === 'meteor') {
      o.x += o.vx * dt; o.y += o.vy * dt; o.rot += o.rotSpeed * dt;
      if (o.x < o.r) { o.x = o.r; o.vx *= -1; } if (o.x > W - o.r) { o.x = W - o.r; o.vx *= -1; }
    } else if (o.type === 'drone') {
      o.x += o.vx * dt; o.y += o.vy * dt;
      if (o.x < o.r || o.x > W - o.r) o.vx *= -1;
      o.fireTimer -= dt;
      if (o.fireTimer <= 0 && o.y > 0 && o.y < H * 0.75) { o.fireTimer = rand(1.4, 2.2); fireEnemyBullet(o, false); }
    } else if (o.type === 'hunter') {
      o.wobble += dt * 2; o.x += o.vx * dt; o.y += (o.vy + Math.sin(o.wobble) * 22) * dt;
    } else if (o.type === 'bomber') {
      o.x += o.vx * dt; o.y += o.vy * dt;
      if (o.x < o.r || o.x > W - o.r) o.vx *= -1;
      o.fireTimer -= dt;
      if (o.fireTimer <= 0 && o.y > 0 && o.y < H * 0.7) { o.fireTimer = rand(1.8, 2.6); fireEnemyBullet(o, true); }
    }
    if (o.y - o.r > H + 40 || o.x < -100 || o.x > W + 100) { obstacles.splice(i, 1); continue; }
    if (Game.player.invincible <= 0 && circlesHit(Game.player, o)) { explode(o.x, o.y, o.color); obstacles.splice(i, 1); registerHit(); }
  }
}
function updateMines(dt) {
  for (let i = mines.length - 1; i >= 0; i--) {
    const m = mines[i];
    m.y += m.vy * dt; m.blink += dt * 6;
    m.armTimer -= dt; if (m.armTimer <= 0) m.armed = true;
    if (m.y - m.r > H + 40) { mines.splice(i, 1); continue; }
    if (m.armed && Game.player.invincible <= 0 && circlesHit(Game.player, m)) {
      explode(m.x, m.y, '#ffd23f', true);
      // chain reaction: nearby mines also detonate
      for (let j = mines.length - 1; j >= 0; j--) {
        if (j === i) continue;
        const other = mines[j];
        if (dist2(m.x, m.y, other.x, other.y) < 130 * 130) { explode(other.x, other.y, '#ffd23f'); mines.splice(j, 1); }
      }
      mines.splice(mines.indexOf(m), 1);
      registerHit();
    }
  }
}
function updateEnemyBullets(dt) {
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.arc) b.vy += 90 * dt;
    if (b.y > H + 30 || b.y < -30 || b.x < -30 || b.x > W + 30) { enemyBullets.splice(i, 1); continue; }
    if (Game.player.invincible <= 0 && circlesHit(Game.player, b)) { enemyBullets.splice(i, 1); registerHit(); }
  }
}
function updateLasers(dt) {
  for (let i = lasers.length - 1; i >= 0; i--) {
    const l = lasers[i];
    l.warn -= dt; if (l.warn <= 0) l.active = true;
    l.life -= dt; if (l.life <= 0) { lasers.splice(i, 1); continue; }
    if (l.active && Game.player.invincible <= 0) {
      if (l.type === 'laserH') { if (Game.player.y + Game.player.r > l.y - l.h && Game.player.y - Game.player.r < l.y + l.h) registerHit(); }
      else { if (Game.player.x + Game.player.r > l.x - l.w && Game.player.x - Game.player.r < l.x + l.w) registerHit(); }
    }
  }
}
function handleBossCollision() {
  const b = Game.boss; if (!b) return;
  if (Game.player.invincible <= 0 && circlesHit(Game.player, b)) registerHit();
}
function registerHit() {
  if (Game.player.shieldTimer > 0) { Game.player.shieldTimer = 0; Game.player.invincible = 0.6; AudioEngine.shieldbreak(); Game.shakeTime = 0.15; Game.shakeMag = 5; Game.combo = 0; return; }
  Game.loseLife();
}
function updateCollectibles(dt) {
  const magnetActive = Game.player.magnetTimer > 0;
  for (let i = collectibles.length - 1; i >= 0; i--) {
    const c = collectibles[i]; c.spin += dt * 4;
    if (magnetActive) {
      const dx = Game.player.x - c.x, dy = Game.player.y - c.y; const d = Math.hypot(dx, dy) || 1;
      if (d < 220) { c.x += (dx / d) * 340 * dt; c.y += (dy / d) * 340 * dt; } else c.y += c.vy * dt;
    } else c.y += c.vy * dt;
    if (c.y - c.r > H + 30) { collectibles.splice(i, 1); continue; }
    if (circlesHit(Game.player, c)) {
      const val = c.type === 'star' ? 25 : 10;
      Game.addScore(val * Game.comboMultiplier());
      if (c.type === 'coin') { Game.coins++; Game.coinsThisLevel++; }
      AudioEngine.coin();
      spawnParticles(c.x, c.y, 8, c.type === 'star' ? '#ffd23f' : '#ffe27a', { speed: 100, life: 0.4, size: 2.5 });
      collectibles.splice(i, 1);
      Game.bumpCombo();
    }
  }
}
function updatePowerups(dt) {
  for (let i = powerupsOnField.length - 1; i >= 0; i--) {
    const p = powerupsOnField[i]; p.bob += dt * 3; p.y += p.vy * dt;
    if (p.y - p.r > H + 30) { powerupsOnField.splice(i, 1); continue; }
    if (circlesHit(Game.player, p)) { applyPowerup(p.type); powerupsOnField.splice(i, 1); }
  }
}
function applyPowerup(type) {
  AudioEngine.powerup();
  spawnParticles(Game.player.x, Game.player.y, 16, '#37ffb0', { speed: 160, life: 0.5, size: 3 });
  const ship = Game.player.ship;
  switch (type) {
    case 'shield': Game.player.shieldTimer = Math.max(Game.player.shieldTimer, 5 * ship.shieldBonus); break;
    case 'speed': Game.player.speedBoostTimer = Math.max(Game.player.speedBoostTimer, 6); break;
    case 'magnet': Game.player.magnetTimer = Math.max(Game.player.magnetTimer, 7); break;
    case 'life': Game.lives = Math.min(Game.maxLives, Game.lives + 1); break;
  }
}

/* ------------------------- Gravity Zones ------------------------- */
function applyGravity(dt) {
  if (!Game.level || !Game.level.hazards.includes('gravity')) return;
  for (const d of bgDecor) {
    const dx = d.x - Game.player.x, dy = d.y - Game.player.y;
    const dd = Math.hypot(dx, dy);
    if (dd < d.r * 2.2 && dd > 1) {
      const pull = clamp((d.r * 2.2 - dd) / (d.r * 2.2), 0, 1) * 90;
      Game.player.x += (dx / dd) * pull * dt;
      Game.player.y += (dy / dd) * pull * dt * 0.6;
    }
  }
}

/* ------------------------- Boss System ------------------------- */
const BOSS_HP_BASE = 90;
function spawnBoss(level) {
  const world = worldOf(level.num);
  const b = {
    name: world.bossName, shape: world.bossShape, color: world.color,
    x: W / 2, y: -120, targetY: H * 0.22, r: 55,
    hp: Math.round(BOSS_HP_BASE * (1 + (level.num / 70) * 1.6)),
    maxHp: 0, phase: 1, attackTimer: 1.4, entrance: true, rot: 0, wobble: 0
  };
  b.maxHp = b.hp;
  Game.boss = b;
}
function bossPhaseForHp(pct) {
  if (pct > 0.7) return 1;
  if (pct > 0.4) return 2;
  if (pct > 0.15) return 3;
  return 4;
}
const BOSS_ATTACK_SETS = { 1: ['aimed'], 2: ['aimed', 'radial'], 3: ['aimed', 'radial', 'homing'], 4: ['aimed', 'radial', 'homing', 'sweep'] };
function updateBoss(dt) {
  const b = Game.boss; if (!b) return;
  if (b.entrance) {
    b.y += (b.targetY - b.y) * clamp(dt * 1.6, 0, 1);
    if (Math.abs(b.y - b.targetY) < 3) b.entrance = false;
    return;
  }
  b.wobble += dt;
  b.x = W / 2 + Math.sin(b.wobble * 0.6) * (W * 0.28);
  const pct = b.hp / b.maxHp;
  const newPhase = bossPhaseForHp(pct);
  if (newPhase !== b.phase) { b.phase = newPhase; Game.showWarning(`PHASE ${b.phase}`, 1.2); AudioEngine.levelup(); }

  b.attackTimer -= dt;
  if (b.attackTimer <= 0) {
    const set = BOSS_ATTACK_SETS[b.phase];
    const atk = set[randInt(0, set.length - 1)];
    bossAttack(b, atk);
    b.attackTimer = clamp(1.5 - b.phase * 0.22, 0.45, 1.5);
  }

  if (b.hp <= 0) { defeatBoss(); }
}
function bossAttack(b, kind) {
  if (kind === 'aimed') { fireEnemyBullet(b, false); fireEnemyBullet(b, false); }
  else if (kind === 'radial') {
    const count = 10;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      enemyBullets.push({ x: b.x, y: b.y, r: 5, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160 + 40 });
    }
  } else if (kind === 'homing') {
    spawnHunter(1 + b.phase * 0.3);
  } else if (kind === 'sweep') {
    spawnLaser(1 + b.phase * 0.4);
  }
}
function defeatBoss() {
  explode(Game.boss.x, Game.boss.y, Game.boss.color, true);
  explode(Game.boss.x, Game.boss.y, '#fff', true);
  AudioEngine.victory();
  if (!SAVE.bossesDefeated.includes(Game.level.num)) SAVE.bossesDefeated.push(Game.level.num);
  Game.boss = null;
  Game.objectiveMet = true;
  Game.completeLevel();
}
function drawBoss() {
  const b = Game.boss; if (!b) return;
  ctx2d.save();
  ctx2d.translate(b.x, b.y);
  ctx2d.shadowColor = b.color; ctx2d.shadowBlur = 22;
  ctx2d.fillStyle = '#1a1030'; ctx2d.strokeStyle = b.color; ctx2d.lineWidth = 3;
  const r = b.r;
  switch (b.shape) {
    case 'fortress':
      ctx2d.beginPath(); ctx2d.moveTo(-r, -r * 0.4); ctx2d.lineTo(-r * 0.4, -r); ctx2d.lineTo(r * 0.4, -r); ctx2d.lineTo(r, -r * 0.4); ctx2d.lineTo(r, r * 0.7); ctx2d.lineTo(-r, r * 0.7); ctx2d.closePath(); ctx2d.fill(); ctx2d.stroke();
      break;
    case 'serpent':
      ctx2d.beginPath(); ctx2d.ellipse(0, 0, r * 1.1, r * 0.5, 0, 0, Math.PI * 2); ctx2d.fill(); ctx2d.stroke();
      ctx2d.beginPath(); ctx2d.ellipse(-r * 1.3, r * 0.1, r * 0.4, r * 0.25, 0, 0, Math.PI * 2); ctx2d.fill();
      ctx2d.beginPath(); ctx2d.ellipse(r * 1.3, r * 0.1, r * 0.4, r * 0.25, 0, 0, Math.PI * 2); ctx2d.fill();
      break;
    case 'crystal':
      ctx2d.beginPath(); ctx2d.moveTo(0, -r); ctx2d.lineTo(r * 0.7, 0); ctx2d.lineTo(0, r); ctx2d.lineTo(-r * 0.7, 0); ctx2d.closePath(); ctx2d.fill(); ctx2d.stroke();
      break;
    case 'hive':
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ctx2d.beginPath(); ctx2d.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.35, 0, Math.PI * 2); ctx2d.fill(); }
      ctx2d.beginPath(); ctx2d.arc(0, 0, r * 0.4, 0, Math.PI * 2); ctx2d.fill(); ctx2d.stroke();
      break;
    case 'carrier':
      ctx2d.beginPath(); ctx2d.moveTo(-r * 1.2, 0); ctx2d.lineTo(-r * 0.4, -r * 0.6); ctx2d.lineTo(r * 0.4, -r * 0.6); ctx2d.lineTo(r * 1.2, 0); ctx2d.lineTo(r * 0.4, r * 0.6); ctx2d.lineTo(-r * 0.4, r * 0.6); ctx2d.closePath(); ctx2d.fill(); ctx2d.stroke();
      break;
    case 'wraith':
      ctx2d.globalAlpha = 0.85;
      ctx2d.beginPath(); ctx2d.moveTo(0, -r); ctx2d.quadraticCurveTo(r, 0, r * 0.6, r); ctx2d.quadraticCurveTo(0, r * 0.6, -r * 0.6, r); ctx2d.quadraticCurveTo(-r, 0, 0, -r); ctx2d.closePath(); ctx2d.fill(); ctx2d.stroke();
      ctx2d.globalAlpha = 1;
      break;
    case 'spider':
      ctx2d.beginPath(); ctx2d.arc(0, 0, r * 0.5, 0, Math.PI * 2); ctx2d.fill(); ctx2d.stroke();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ctx2d.beginPath(); ctx2d.moveTo(0, 0); ctx2d.lineTo(Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3); ctx2d.stroke(); }
      break;
    case 'cruiser':
      ctx2d.beginPath(); ctx2d.moveTo(0, -r * 1.3); ctx2d.lineTo(r * 0.5, -r * 0.1); ctx2d.lineTo(r * 1.35, r * 0.15); ctx2d.lineTo(r * 0.5, r * 0.55); ctx2d.lineTo(0, r * 0.9); ctx2d.lineTo(-r * 0.5, r * 0.55); ctx2d.lineTo(-r * 1.35, r * 0.15); ctx2d.lineTo(-r * 0.5, -r * 0.1); ctx2d.closePath(); ctx2d.fill(); ctx2d.stroke();
      ctx2d.fillStyle = b.color; ctx2d.beginPath(); ctx2d.arc(0, 0, r * 0.18, 0, Math.PI * 2); ctx2d.fill();
      break;
    case 'phantom':
      ctx2d.globalAlpha = 0.8;
      ctx2d.beginPath(); ctx2d.moveTo(0, -r * 1.1); ctx2d.quadraticCurveTo(r * 1.2, -r * 0.2, r * 0.5, r * 0.9); ctx2d.quadraticCurveTo(0, r * 0.4, -r * 0.5, r * 0.9); ctx2d.quadraticCurveTo(-r * 1.2, -r * 0.2, 0, -r * 1.1); ctx2d.closePath(); ctx2d.fill(); ctx2d.stroke();
      ctx2d.globalAlpha = 1;
      ctx2d.fillStyle = b.color; ctx2d.beginPath(); ctx2d.arc(0, -r * 0.1, r * 0.15, 0, Math.PI * 2); ctx2d.fill();
      break;
    case 'titan':
    default:
      ctx2d.beginPath(); ctx2d.moveTo(0, -r * 1.2); ctx2d.lineTo(r, -r * 0.2); ctx2d.lineTo(r * 0.6, r); ctx2d.lineTo(-r * 0.6, r); ctx2d.lineTo(-r, -r * 0.2); ctx2d.closePath(); ctx2d.fill(); ctx2d.stroke();
      ctx2d.beginPath(); ctx2d.arc(0, -r * 0.1, r * 0.3, 0, Math.PI * 2); ctx2d.fillStyle = b.color; ctx2d.fill();
      break;
  }
  ctx2d.restore();
}

/* ------------------------- Drawing: obstacles/hazards/collectibles ------------------------- */
function drawObstacles() {
  for (const o of obstacles) {
    ctx2d.save(); ctx2d.translate(o.x, o.y);
    if (o.type === 'asteroid') {
      ctx2d.rotate(o.rot); ctx2d.fillStyle = o.color; ctx2d.strokeStyle = '#4a4034'; ctx2d.lineWidth = 2;
      ctx2d.beginPath();
      const pts = 8;
      for (let i = 0; i <= pts; i++) { const a = (i / pts) * Math.PI * 2; const jag = 0.75 + 0.25 * Math.sin(a * 3 + o.seed * 10); const rr = o.r * jag; const px = Math.cos(a) * rr, py = Math.sin(a) * rr; if (i === 0) ctx2d.moveTo(px, py); else ctx2d.lineTo(px, py); }
      ctx2d.closePath(); ctx2d.fill(); ctx2d.stroke();
      ctx2d.strokeStyle = 'rgba(0,229,255,0.5)'; ctx2d.lineWidth = 1;
      ctx2d.beginPath(); ctx2d.moveTo(-o.r * 0.3, -o.r * 0.2); ctx2d.lineTo(o.r * 0.2, o.r * 0.3); ctx2d.stroke();
    } else if (o.type === 'meteor') {
      ctx2d.rotate(o.rot);
      const grad = ctx2d.createRadialGradient(0, 0, 0, 0, 0, o.r);
      grad.addColorStop(0, '#fff2c2'); grad.addColorStop(0.5, o.color); grad.addColorStop(1, '#c23c1c');
      ctx2d.fillStyle = grad; ctx2d.shadowColor = o.color; ctx2d.shadowBlur = 10;
      ctx2d.beginPath(); ctx2d.arc(0, 0, o.r, 0, Math.PI * 2); ctx2d.fill();
    } else if (o.type === 'drone') {
      ctx2d.shadowColor = o.color; ctx2d.shadowBlur = 8; ctx2d.fillStyle = '#241035'; ctx2d.strokeStyle = o.color; ctx2d.lineWidth = 2;
      ctx2d.beginPath(); ctx2d.rect(-o.r * 0.8, -o.r * 0.5, o.r * 1.6, o.r); ctx2d.fill(); ctx2d.stroke();
      ctx2d.fillStyle = o.color; ctx2d.beginPath(); ctx2d.arc(0, 0, o.r * 0.25, 0, Math.PI * 2); ctx2d.fill();
    } else if (o.type === 'hunter') {
      ctx2d.rotate(Math.PI); ctx2d.shadowColor = o.color; ctx2d.shadowBlur = 10; ctx2d.fillStyle = '#3a1030'; ctx2d.strokeStyle = o.color; ctx2d.lineWidth = 2;
      ctx2d.beginPath(); ctx2d.moveTo(0, -o.r * 1.2); ctx2d.lineTo(o.r, o.r * 0.8); ctx2d.lineTo(-o.r, o.r * 0.8); ctx2d.closePath(); ctx2d.fill(); ctx2d.stroke();
      ctx2d.fillStyle = o.color; ctx2d.beginPath(); ctx2d.arc(0, 0, o.r * 0.25, 0, Math.PI * 2); ctx2d.fill();
    } else if (o.type === 'bomber') {
      ctx2d.shadowColor = o.color; ctx2d.shadowBlur = 8; ctx2d.fillStyle = '#331a10'; ctx2d.strokeStyle = o.color; ctx2d.lineWidth = 2;
      ctx2d.beginPath(); ctx2d.ellipse(0, 0, o.r, o.r * 0.7, 0, 0, Math.PI * 2); ctx2d.fill(); ctx2d.stroke();
      ctx2d.fillStyle = o.color; ctx2d.beginPath(); ctx2d.arc(0, o.r * 0.2, o.r * 0.25, 0, Math.PI * 2); ctx2d.fill();
    }
    ctx2d.restore();
  }
  for (const m of mines) {
    ctx2d.save(); ctx2d.translate(m.x, m.y);
    ctx2d.shadowColor = m.color; ctx2d.shadowBlur = 10;
    ctx2d.strokeStyle = m.color; ctx2d.lineWidth = 2; ctx2d.fillStyle = '#332800';
    ctx2d.beginPath(); ctx2d.arc(0, 0, m.r, 0, Math.PI * 2); ctx2d.fill(); ctx2d.stroke();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ctx2d.beginPath(); ctx2d.moveTo(Math.cos(a) * m.r, Math.sin(a) * m.r); ctx2d.lineTo(Math.cos(a) * m.r * 1.3, Math.sin(a) * m.r * 1.3); ctx2d.stroke(); }
    const blinkAlpha = m.armed ? (0.5 + 0.5 * Math.sin(m.blink * 4)) : 0.3;
    ctx2d.globalAlpha = blinkAlpha; ctx2d.fillStyle = m.armed ? '#ff3c3c' : '#ffd23f';
    ctx2d.beginPath(); ctx2d.arc(0, 0, m.r * 0.3, 0, Math.PI * 2); ctx2d.fill();
    ctx2d.restore();
  }
  ctx2d.save(); ctx2d.fillStyle = '#ff2f6b'; ctx2d.shadowColor = '#ff2f6b'; ctx2d.shadowBlur = 8;
  for (const b of enemyBullets) { ctx2d.beginPath(); ctx2d.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx2d.fill(); }
  ctx2d.restore();
  ctx2d.save(); ctx2d.fillStyle = '#fff'; ctx2d.shadowColor = '#00e5ff'; ctx2d.shadowBlur = 8;
  for (const b of playerBullets) { ctx2d.beginPath(); ctx2d.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx2d.fill(); }
  ctx2d.restore();
}
function drawLasers() {
  for (const l of lasers) {
    ctx2d.save();
    if (l.type === 'laserH') {
      if (!l.active) { ctx2d.strokeStyle = 'rgba(255,60,60,0.5)'; ctx2d.lineWidth = 2; ctx2d.setLineDash([8, 6]); ctx2d.beginPath(); ctx2d.moveTo(0, l.y); ctx2d.lineTo(W, l.y); ctx2d.stroke(); }
      else { const grad = ctx2d.createLinearGradient(0, l.y - l.h, 0, l.y + l.h); grad.addColorStop(0, 'rgba(255,60,60,0)'); grad.addColorStop(0.5, '#ff3c3c'); grad.addColorStop(1, 'rgba(255,60,60,0)'); ctx2d.fillStyle = grad; ctx2d.shadowColor = '#ff3c3c'; ctx2d.shadowBlur = 16; ctx2d.fillRect(0, l.y - l.h, W, l.h * 2); }
    } else {
      if (!l.active) { ctx2d.strokeStyle = 'rgba(255,60,60,0.5)'; ctx2d.lineWidth = 2; ctx2d.setLineDash([8, 6]); ctx2d.beginPath(); ctx2d.moveTo(l.x, 0); ctx2d.lineTo(l.x, H); ctx2d.stroke(); }
      else { const grad = ctx2d.createLinearGradient(l.x - l.w, 0, l.x + l.w, 0); grad.addColorStop(0, 'rgba(255,60,60,0)'); grad.addColorStop(0.5, '#ff3c3c'); grad.addColorStop(1, 'rgba(255,60,60,0)'); ctx2d.fillStyle = grad; ctx2d.shadowColor = '#ff3c3c'; ctx2d.shadowBlur = 16; ctx2d.fillRect(l.x - l.w, 0, l.w * 2, H); }
    }
    ctx2d.restore();
  }
}
function drawStarShape(ctx, cx, cy, spikes, outerR, innerR) {
  let rot = Math.PI / 2 * 3, x = cx, y = cy;
  const step = Math.PI / spikes;
  ctx.beginPath(); ctx.moveTo(cx, cy - outerR);
  for (let i = 0; i < spikes; i++) { x = cx + Math.cos(rot) * outerR; y = cy + Math.sin(rot) * outerR; ctx.lineTo(x, y); rot += step; x = cx + Math.cos(rot) * innerR; y = cy + Math.sin(rot) * innerR; ctx.lineTo(x, y); rot += step; }
  ctx.lineTo(cx, cy - outerR); ctx.closePath(); ctx.fill();
}
function drawCollectibles() {
  for (const c of collectibles) {
    ctx2d.save(); ctx2d.translate(c.x, c.y);
    if (c.type === 'coin') {
      const squash = Math.abs(Math.cos(c.spin)); ctx2d.scale(clamp(squash, 0.2, 1), 1);
      ctx2d.fillStyle = '#ffd23f'; ctx2d.shadowColor = '#ffd23f'; ctx2d.shadowBlur = 10;
      ctx2d.beginPath(); ctx2d.arc(0, 0, c.r, 0, Math.PI * 2); ctx2d.fill();
      ctx2d.fillStyle = '#a8790a'; ctx2d.font = 'bold 11px sans-serif'; ctx2d.textAlign = 'center'; ctx2d.textBaseline = 'middle'; ctx2d.fillText('$', 0, 1);
    } else {
      ctx2d.rotate(c.spin); ctx2d.fillStyle = '#7cf7ff'; ctx2d.shadowColor = '#7cf7ff'; ctx2d.shadowBlur = 12;
      drawStarShape(ctx2d, 0, 0, 5, c.r, c.r * 0.45);
    }
    ctx2d.restore();
  }
}
const POWERUP_ICON = { shield: '🛡', speed: '⚡', magnet: '🧲', life: '❤️' };
const POWERUP_COLOR = { shield: '#37c9ff', speed: '#ffd23f', magnet: '#ff2fd0', life: '#ff4d6d' };
function drawPowerups() {
  for (const p of powerupsOnField) {
    ctx2d.save(); const bobY = Math.sin(p.bob) * 4; ctx2d.translate(p.x, p.y + bobY);
    ctx2d.beginPath(); ctx2d.arc(0, 0, p.r + 6, 0, Math.PI * 2);
    ctx2d.strokeStyle = POWERUP_COLOR[p.type]; ctx2d.shadowColor = POWERUP_COLOR[p.type]; ctx2d.shadowBlur = 14; ctx2d.lineWidth = 2; ctx2d.stroke();
    ctx2d.font = '16px sans-serif'; ctx2d.textAlign = 'center'; ctx2d.textBaseline = 'middle'; ctx2d.fillText(POWERUP_ICON[p.type], 0, 1);
    ctx2d.restore();
  }
}

/* ------------------------- Game State ------------------------- */
const Game = {
  state: 'menu',
  player: null, level: null, boss: null,
  score: 0, coins: 0, lives: 3, maxLives: 5,
  levelTime: 0, survivalTimeTotal: 0,
  combo: 0, comboTimer: 0, comboBest: 0,
  shotsFired: 0, shotsHit: 0, enemiesDestroyed: 0, coinsThisLevel: 0,
  objectiveMet: false,
  spawnTimers: { enemy: 0, hazard: 0, coin: 1, powerup: 6 },
  lastTime: 0, raf: null, shakeTime: 0, shakeMag: 0,
  adBreakActive: false,
  gameStartWallTime: 0,

  init() { this.player = new Player(getShip(SAVE.selectedShip)); },

  comboMultiplier() { return 1 + Math.floor(this.combo / 5) * 0.5; },
  bumpCombo() {
    this.combo++; this.comboTimer = 3;
    this.comboBest = Math.max(this.comboBest, this.combo);
    if (this.combo > 0 && this.combo % 5 === 0) {
      AudioEngine.combo();
      const el = document.getElementById('comboPopup');
      el.textContent = `COMBO x${this.combo}`;
      el.classList.add('show');
      clearTimeout(this._comboHideT);
      this._comboHideT = setTimeout(() => el.classList.remove('show'), 700);
    }
  },
  registerKill() {
    this.enemiesDestroyed++;
    this.addScore(20 * this.comboMultiplier());
    this.bumpCombo();
  },
  addScore(v) { this.score += v; },

  showWarning(text, duration) {
    const el = document.getElementById('warningBanner');
    el.textContent = text; el.classList.add('show');
    clearTimeout(this._warnHideT);
    this._warnHideT = setTimeout(() => el.classList.remove('show'), duration * 1000);
  },

  startLevel(num) {
    this.level = getLevel(num);
    // Show the game screen BEFORE measuring/sizing the canvas — measuring
    // while the screen is still display:none returns a 0x0 rect, which was
    // causing the black-screen-until-resize bug.
    Screens.show('screen-game');
    resizeCanvas();
    initBgStars(); initLevelDecor(worldOf(num) && WORLDS[worldOf(num).id - 1]);
    this.player = new Player(getShip(SAVE.selectedShip));
    this.player.reset();
    this.score = 0; this.coins = 0; this.lives = 3;
    this.levelTime = 0; this.combo = 0; this.comboTimer = 0; this.comboBest = 0;
    this.shotsFired = 0; this.shotsHit = 0; this.enemiesDestroyed = 0; this.coinsThisLevel = 0;
    this.objectiveMet = false;
    this.spawnTimers = { enemy: 0.3, hazard: 1.5, coin: 1, powerup: 8 };
    obstacles = []; enemyBullets = []; lasers = []; mines = []; collectibles = []; powerupsOnField = []; particles = []; playerBullets = [];
    this.boss = null;
    this.gameStartWallTime = performance.now();
    this.state = 'playing';
    this.lastTime = performance.now();
    updateHUD();
    setTouchControlsVisible();
    if (!this.raf) this.raf = requestAnimationFrame(loop);
  },

  togglePause() {
    if (this.state === 'playing') { this.state = 'paused'; Screens.show('screen-pause'); }
    else if (this.state === 'paused') { this.state = 'playing'; Screens.show('screen-game'); this.lastTime = performance.now(); }
  },

  loseLife() {
    if (this.player.invincible > 0) return;
    this.lives--; this.player.invincible = 2; this.player.hitFlash = 0.35; this.combo = 0;
    AudioEngine.hit(); this.shakeTime = 0.3; this.shakeMag = 10;
    explode(this.player.x, this.player.y, '#ff5566', true);
    updateHUD();
    if (this.lives <= 0) this.failLevel();
  },

  checkObjective() {
    const lvl = this.level; if (!lvl || lvl.isBoss) return;
    const obj = lvl.objective;
    if (obj.type === 'survival' || obj.type === 'dodge') {
      if (this.levelTime >= obj.target) this.objectiveMet = true;
    } else if (obj.type === 'combat') {
      if (this.enemiesDestroyed >= obj.target) this.objectiveMet = true;
      else if (this.levelTime >= lvl.duration) { this.failLevel('timeup'); return; }
    } else if (obj.type === 'collection') {
      if (this.coinsThisLevel >= obj.target) this.objectiveMet = true;
      else if (this.levelTime >= lvl.duration) { this.failLevel('timeup'); return; }
    } else if (obj.type === 'mixed') {
      if (this.enemiesDestroyed >= obj.killTarget && this.coinsThisLevel >= obj.coinTarget) this.objectiveMet = true;
      else if (this.levelTime >= lvl.duration) { this.failLevel('timeup'); return; }
    }
    if (this.objectiveMet && lvl.missionType !== 'boss') this.completeLevel();
  },

  /* H5 Games Ads / Ad Placement API — interstitial ONLY at a natural break
     (immediately after a level has just been completed). beforeAd pauses;
     afterAd/adBreakDone resume via callback, guaranteeing the game never
     hangs waiting on an ad that never shows. */
  triggerLevelAdBreak(onDone) {
    if (this.adBreakActive) { onDone(); return; }
    this.adBreakActive = true;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      this.adBreakActive = false;
      clearTimeout(safetyTimer);
      onDone();
    };
    // Hard safety net: if the real Ad Placement API script never loads/processes
    // the queued call (blocked, offline, account not H5-approved), adsbygoogle.push()
    // just queues silently and afterAd/adBreakDone would never fire. This timeout
    // guarantees the game always continues within a bounded, brief wait.
    const safetyTimer = setTimeout(finish, 2500);
    try {
      if (typeof adBreak === 'function') {
        adBreak({ type: 'next', name: 'level_complete_' + this.level.num, beforeAd: () => {}, afterAd: () => finish(), adBreakDone: () => finish() });
      } else finish();
    } catch (e) { finish(); }
  },

  completeLevel() {
    if (this.state !== 'playing') return;
    this.state = 'levelcomplete-pending';
    const lvl = this.level;
    const timeSec = (performance.now() - this.gameStartWallTime) / 1000;
    const accuracy = this.shotsFired > 0 ? Math.round((this.shotsHit / this.shotsFired) * 100) : 100;
    const ls = getLevelSave(lvl.num);
    const wasCompletedBefore = ls.completed;
    ls.completed = true;
    ls.bestScore = Math.max(ls.bestScore, Math.floor(this.score));
    ls.bestTimeSec = ls.bestTimeSec === 0 ? Math.round(timeSec) : Math.min(ls.bestTimeSec, Math.round(timeSec));
    ls.bestAccuracy = Math.max(ls.bestAccuracy, accuracy);
    ls.coinsCollected = Math.max(ls.coinsCollected, this.coinsThisLevel);
    this.coins += lvl.coinsReward;
    SAVE.totalCoinsGlobal += this.coins;
    SAVE.bestScoreGlobal = Math.max(SAVE.bestScoreGlobal, Math.floor(this.score));
    SAVE.bestLevelReachedGlobal = Math.max(SAVE.bestLevelReachedGlobal, lvl.num);
    SAVE.bestSurvivalTimeGlobal = Math.max(SAVE.bestSurvivalTimeGlobal, Math.round(timeSec));
    SAVE.highestUnlockedLevel = Math.max(SAVE.highestUnlockedLevel, Math.min(70, lvl.num + 1));
    refreshShipUnlocks();
    const isFinal = lvl.num === 70;
    if (isFinal) SAVE.campaignCompleted = true;
    writeSave(SAVE);

    this.triggerLevelAdBreak(() => {
      if (isFinal) { showCampaignComplete(timeSec); return; }
      showLevelComplete(lvl, timeSec, accuracy, !wasCompletedBefore);
    });
  },

  failLevel(reason) {
    this.state = 'gameover';
    AudioEngine.gameover();
    const timeSec = (performance.now() - this.gameStartWallTime) / 1000;
    SAVE.totalCoinsGlobal += this.coins;
    const isNewHigh = this.score > SAVE.bestScoreGlobal;
    SAVE.bestScoreGlobal = Math.max(SAVE.bestScoreGlobal, Math.floor(this.score));
    SAVE.bestSurvivalTimeGlobal = Math.max(SAVE.bestSurvivalTimeGlobal, Math.round(timeSec));
    writeSave(SAVE);
    showGameOver(timeSec, isNewHigh, reason);
  }
};

function setTouchControlsVisible() {
  const controlsPref = SAVE.settings.controls;
  const shouldShow = controlsPref === 'touch' || (controlsPref === 'auto' && Input.isTouchDevice);
  document.getElementById('touchControls').classList.toggle('visible', shouldShow);
}

/* ------------------------- HUD ------------------------- */
function updateHUD() {
  document.getElementById('hudScore').textContent = padScore(Game.score);
  document.getElementById('hudCoins').textContent = padCoins(Game.coins);
  document.getElementById('hudLives').textContent = '❤️'.repeat(Math.max(0, Game.lives));
  if (Game.level) document.getElementById('hudLevelName').textContent = `SECTOR ${String(Math.ceil(Game.level.num / 7)).padStart(2, '0')} · ${Game.level.name}`;

  const bossWrap = document.getElementById('bossHealthWrap');
  const progTrack = document.querySelector('.progress-track');
  if (Game.boss) {
    bossWrap.classList.add('visible');
    progTrack.style.display = 'none';
    document.getElementById('bossName').textContent = Game.boss.name;
    document.getElementById('bossHealthFill').style.width = clamp((Game.boss.hp / Game.boss.maxHp) * 100, 0, 100) + '%';
  } else {
    bossWrap.classList.remove('visible');
    progTrack.style.display = 'block';
    if (Game.level && !Game.level.isBoss) {
      let pct = 0;
      const obj = Game.level.objective;
      if (obj.type === 'survival' || obj.type === 'dodge') pct = Game.levelTime / obj.target;
      else if (obj.type === 'combat') pct = Game.enemiesDestroyed / obj.target;
      else if (obj.type === 'collection') pct = Game.coinsThisLevel / obj.target;
      else if (obj.type === 'mixed') pct = ((Game.enemiesDestroyed / obj.killTarget) + (Game.coinsThisLevel / obj.coinTarget)) / 2;
      document.getElementById('hudProgressFill').style.width = clamp(pct * 100, 0, 100) + '%';
    }
  }

  const chipsWrap = document.getElementById('activePowerups'); chipsWrap.innerHTML = '';
  const p = Game.player;
  if (p.shieldTimer > 0) chipsWrap.appendChild(makeChip('🛡', Math.ceil(p.shieldTimer)));
  if (p.speedBoostTimer > 0) chipsWrap.appendChild(makeChip('⚡', Math.ceil(p.speedBoostTimer)));
  if (p.magnetTimer > 0) chipsWrap.appendChild(makeChip('🧲', Math.ceil(p.magnetTimer)));
}
function makeChip(icon, secs) { const d = document.createElement('div'); d.className = 'powerup-chip'; d.textContent = `${icon} ${secs}s`; return d; }

/* ------------------------- Main Loop ------------------------- */
function loop(now) {
  Game.raf = requestAnimationFrame(loop);
  let dt = (now - Game.lastTime) / 1000;
  Game.lastTime = now;
  dt = Math.min(dt, 0.05);
  if (Game.state !== 'playing') return;
  update(dt);
  render();
}
function update(dt) {
  Game.levelTime += dt; Game.survivalTimeTotal += dt;
  Game.addScore(dt * 8);
  if (Game.comboTimer > 0) { Game.comboTimer -= dt; if (Game.comboTimer <= 0) Game.combo = 0; }

  updateSpawning(dt);
  applyGravity(dt);
  Game.player.update(dt);
  updatePlayerBullets(dt);
  updateObstacles(dt);
  updateMines(dt);
  updateEnemyBullets(dt);
  updateLasers(dt);
  updateCollectibles(dt);
  updatePowerups(dt);
  updateParticles(dt);

  if (Game.level && Game.level.isBoss) {
    if (!Game.boss && !Game.player.__bossWarned) {
      Game.player.__bossWarned = true;
      Game.showWarning('⚠ WARNING ⚠\nBOSS APPROACHING', 2);
      AudioEngine.bossWarn();
      setTimeout(() => { if (Game.state === 'playing') spawnBoss(Game.level); }, 1800);
    }
    if (Game.boss) { updateBoss(dt); handleBossCollision(); }
  } else {
    Game.checkObjective();
  }

  if (Input.boostHeld) Game.player.activateShieldBoost();
  if (Game.shakeTime > 0) Game.shakeTime -= dt;
  updateHUD();
}
function render() {
  ctx2d.clearRect(0, 0, W, H);
  const grad = ctx2d.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#05060f'); grad.addColorStop(1, '#0a0e24');
  ctx2d.fillStyle = grad; ctx2d.fillRect(0, 0, W, H);
  drawBgStars(1 / 60);
  if (Game.level) drawWorldTheme(WORLDS[Math.ceil(Game.level.num / 7) - 1], 1 / 60);

  ctx2d.save();
  if (Game.shakeTime > 0) { const mag = Game.shakeMag * (Game.shakeTime / 0.3); ctx2d.translate(rand(-mag, mag), rand(-mag, mag)); }
  drawCollectibles(); drawPowerups(); drawObstacles(); drawLasers(); drawBoss(); drawParticles();
  Game.player.draw(ctx2d);
  ctx2d.restore();
}

/* ------------------------- Screen Population: Level Intro / Complete / Game Over / Campaign Complete ------------------------- */
let pendingLevelNum = 1;
function openLevelIntro(num) {
  pendingLevelNum = num;
  const lvl = getLevel(num);
  document.getElementById('liSector').textContent = `SECTOR ${String(Math.ceil(num / 7)).padStart(2, '0')} · LEVEL ${num}`;
  document.getElementById('liName').textContent = lvl.name;
  let threat = 'NEW THREAT DETECTED: ' + lvl.enemyTypes.join(', ').toUpperCase();
  if (lvl.isBoss) threat = `⚠ BOSS ENCOUNTER: ${worldOf(num).bossName}`;
  document.getElementById('liThreat').textContent = threat;
  let obj = '';
  if (lvl.isBoss) obj = 'Objective: Defeat the boss';
  else if (lvl.objective.type === 'survival') obj = `Objective: Survive ${formatClock(lvl.objective.target)}`;
  else if (lvl.objective.type === 'dodge') obj = `Objective: Survive the hazard field (${formatClock(lvl.objective.target)})`;
  else if (lvl.objective.type === 'combat') obj = `Objective: Destroy ${lvl.objective.target} enemies — Time Limit: ${formatClock(lvl.duration)}`;
  else if (lvl.objective.type === 'collection') obj = `Objective: Collect ${lvl.objective.target} coins — Time Limit: ${formatClock(lvl.duration)}`;
  else if (lvl.objective.type === 'mixed') obj = `Objective: Destroy ${lvl.objective.killTarget} enemies & collect ${lvl.objective.coinTarget} coins — Time Limit: ${formatClock(lvl.duration)}`;
  document.getElementById('liObjective').textContent = obj;
  Screens.show('screen-levelintro');
}
function showLevelComplete(lvl, timeSec, accuracy, firstTime) {
  document.getElementById('lcObjectiveCheck').style.display = lvl.missionType === 'survival' ? 'none' : 'block';
  const stats = document.getElementById('lcStats');
  stats.innerHTML = '';
  const rows = [
    ['SCORE', padScore(Game.score)],
    ['COINS', padCoins(Game.coinsThisLevel) + ' (+' + lvl.coinsReward + ' bonus)'],
    ['TIME', formatClock(timeSec)],
    ['ENEMIES DESTROYED', String(Game.enemiesDestroyed)]
  ];
  if (Game.shotsFired > 0) rows.push(['ACCURACY', accuracy + '%']);
  rows.forEach(([label, val]) => { const div = document.createElement('div'); div.className = 'go-stat'; div.textContent = `${label}: ${val}`; stats.appendChild(div); });
  const unlockEl = document.getElementById('lcUnlock');
  const nextNum = lvl.num + 1;
  refreshShipUnlocks(); writeSave(SAVE);
  let unlockMsg = '';
  if (nextNum <= 70 && firstTime) unlockMsg = `🔓 LEVEL ${nextNum} UNLOCKED`;
  const newlyUnlockedShip = SHIPS.find(s => s.unlockAt === completedLevelCount());
  if (newlyUnlockedShip) unlockMsg += (unlockMsg ? '  ·  ' : '') + `🚀 ${newlyUnlockedShip.name} UNLOCKED`;
  unlockEl.textContent = unlockMsg;
  document.getElementById('btnNextLevel').style.display = nextNum <= 70 ? 'block' : 'none';
  Screens.show('screen-levelcomplete');
}
function showGameOver(timeSec, isNewHigh, reason) {
  const stats = document.getElementById('goStats'); stats.innerHTML = '';
  const rows = [
    ['LEVEL REACHED', Game.level ? String(Game.level.num) : '1'],
    ['SCORE', padScore(Game.score)],
    ['BEST SCORE', padScore(SAVE.bestScoreGlobal)],
    ['COINS', padCoins(Game.coins)],
    ['SURVIVAL TIME', formatClock(timeSec)],
    ['ENEMIES DESTROYED', String(Game.enemiesDestroyed)]
  ];
  rows.forEach(([label, val]) => { const div = document.createElement('div'); div.className = 'go-stat'; div.textContent = `${label}: ${val}`; stats.appendChild(div); });
  document.getElementById('newHighScoreBanner').classList.toggle('show', isNewHigh);
  const titleEl = document.querySelector('#screen-gameover .go-title');
  if (titleEl) titleEl.textContent = reason === 'timeup' ? "⏱ TIME'S UP!" : '💥 GAME OVER';
  Screens.show('screen-gameover');
}
function showCampaignComplete(timeSec) {
  const stats = document.getElementById('ccStats'); stats.innerHTML = '';
  const rows = [
    ['FINAL SCORE', padScore(Game.score)],
    ['TOTAL COINS', padCoins(SAVE.totalCoinsGlobal)],
    ['BOSSES DEFEATED', `${SAVE.bossesDefeated.length} / 10`],
    ['CAMPAIGN TIME', formatClock(timeSec)]
  ];
  rows.forEach(([label, val]) => { const div = document.createElement('div'); div.className = 'go-stat'; div.textContent = `${label}: ${val}`; stats.appendChild(div); });
  AudioEngine.victory();
  Screens.show('screen-campaigncomplete');
}

/* ------------------------- World / Level / Ship Select Rendering ------------------------- */
let selectedWorldId = 1;
function renderWorldSelect() {
  const grid = document.getElementById('worldGrid'); grid.innerHTML = '';
  WORLDS.forEach(w => {
    const startLvl = (w.id - 1) * 7 + 1, endLvl = w.id * 7;
    const completedCount = LEVELS.slice(startLvl - 1, endLvl).filter(l => isLevelCompleted(l.num)).length;
    const unlocked = isLevelUnlocked(startLvl);
    const card = document.createElement('div');
    card.className = 'world-card ' + (unlocked ? (completedCount === 7 ? 'complete' : 'unlocked') : 'locked');
    card.innerHTML = `<div class="world-card-num">WORLD ${w.id}</div><div class="world-card-name">${w.name}</div><div class="world-card-progress ${completedCount === 7 ? 'done' : ''}">${unlocked ? `${completedCount}/7 COMPLETE${completedCount === 7 ? ' ✓' : ''}` : 'LOCKED'}</div>`;
    if (unlocked) card.addEventListener('click', () => { playClick(); selectedWorldId = w.id; renderLevelSelect(w.id); Screens.show('screen-levelselect'); });
    grid.appendChild(card);
  });
}
function renderLevelSelect(worldId) {
  const world = WORLDS[worldId - 1];
  document.getElementById('levelSelectTitle').textContent = `🌌 ${world.name}`;
  const map = document.getElementById('levelMap'); map.innerHTML = '';
  const startLvl = (worldId - 1) * 7 + 1;
  document.getElementById('levelDetail').innerHTML = '<div class="level-detail-empty">Select a level to see details</div>';
  for (let i = 0; i < 7; i++) {
    const num = startLvl + i;
    const isBoss = i === 6;
    if (i > 0) { const conn = document.createElement('div'); conn.className = 'level-connector'; map.appendChild(conn); }
    const wrap = document.createElement('div'); wrap.className = 'level-node-wrap';
    const node = document.createElement('div');
    const unlocked = isLevelUnlocked(num), completed = isLevelCompleted(num);
    node.className = 'level-node ' + (isBoss ? 'boss ' : '') + (completed ? 'completed' : unlocked ? 'unlocked' : 'locked');
    node.textContent = isBoss ? '👑' : (completed ? '✓' : String(num));
    node.addEventListener('click', () => { if (unlocked) showLevelDetail(num); });
    wrap.appendChild(node);
    map.appendChild(wrap);
  }
}
function showLevelDetail(num) {
  document.querySelectorAll('.level-node').forEach(n => n.classList.remove('selected'));
  const lvl = getLevel(num);
  const ls = getLevelSave(num);
  const detail = document.getElementById('levelDetail');
  detail.innerHTML = `
    <div class="level-detail-name">LEVEL ${num} — ${lvl.name}</div>
    <div class="level-detail-row">${ls.completed ? '✓ COMPLETED' : '🔓 UNLOCKED'}</div>
    <div class="level-detail-row">BEST SCORE: ${ls.bestScore ? padScore(ls.bestScore) : '—'}</div>
    <div class="level-detail-row">BEST TIME: ${ls.bestTimeSec ? formatClock(ls.bestTimeSec) : '—'}</div>
    ${ls.bestAccuracy ? `<div class="level-detail-row">BEST ACCURACY: ${ls.bestAccuracy}%</div>` : ''}
    <button class="btn btn-primary" id="btnPlaySelectedLevel">▶ PLAY LEVEL</button>
  `;
  document.getElementById('btnPlaySelectedLevel').addEventListener('click', () => { playClick(); openLevelIntro(num); });
}
function renderShipSelect() {
  const grid = document.getElementById('shipGrid'); grid.innerHTML = '';
  refreshShipUnlocks(); writeSave(SAVE);
  SHIPS.forEach(s => {
    const unlocked = SAVE.unlockedShips.includes(s.id);
    const card = document.createElement('div');
    card.className = 'ship-card ' + (unlocked ? '' : 'locked') + (SAVE.selectedShip === s.id ? ' selected' : '');
    card.innerHTML = `
      <div class="ship-card-name">${s.name}</div>
      <div class="ship-card-desc">${s.desc}</div>
      ${statRow('SPEED', s.speed, 400)}
      ${statRow('WEAPON', 1 / s.fireRate, 4)}
      ${statRow('ARMOR', s.armor, 1.6)}
      ${statRow('SHIELD', s.shieldBonus, 1.8)}
      ${unlocked ? (SAVE.selectedShip === s.id ? '<div class="ship-card-select-badge">✓ SELECTED</div>' : '') : `<div class="ship-card-lock">🔒 Complete ${s.unlockAt} levels to unlock</div>`}
    `;
    if (unlocked) card.addEventListener('click', () => { playClick(); SAVE.selectedShip = s.id; writeSave(SAVE); renderShipSelect(); });
    grid.appendChild(card);
  });
}
function statRow(label, val, max) {
  const pct = clamp((val / max) * 100, 4, 100);
  return `<div class="ship-stat-row"><div class="ship-stat-label">${label}</div><div class="ship-stat-bar"><div class="ship-stat-fill" style="width:${pct}%"></div></div></div>`;
}

/* ------------------------- Continue Logic ------------------------- */
function getContinueLevel() {
  if (SAVE.campaignCompleted) return 70;
  for (let n = 1; n <= 70; n++) if (!isLevelCompleted(n)) return Math.min(n, SAVE.highestUnlockedLevel);
  return 70;
}

/* ------------------------- Menu Ship Preview ------------------------- */
let menuShipCtx = null, menuShipCanvas = null, menuPreviewPlayer = null, menuPreviewRaf = null;
function initMenuShipPreview() {
  menuShipCanvas = document.getElementById('menuShipCanvas');
  menuShipCtx = menuShipCanvas.getContext('2d');
  let lastW = -1, lastH = -1;
  function resizeIfNeeded(rect) {
    // Re-measure every visible frame rather than once at boot: at boot time
    // the menu screen is still display:none (loading screen active), which
    // returns a 0x0 rect and left this canvas blank until a window resize
    // forced a recalculation. Checking each frame fixes that permanently.
    if (rect.width === lastW && rect.height === lastH) return;
    lastW = rect.width; lastH = rect.height;
    menuShipCanvas.width = Math.floor(rect.width * DPR); menuShipCanvas.height = Math.floor(rect.height * DPR);
    menuShipCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  let t = 0;
  function frame() {
    menuPreviewRaf = requestAnimationFrame(frame);
    if (!Screens.els['screen-menu'] || !Screens.els['screen-menu'].classList.contains('active')) return;
    const rect = menuShipCanvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return; // not laid out yet, skip this frame only
    resizeIfNeeded(rect);
    menuShipCtx.clearRect(0, 0, rect.width, rect.height);
    t += 0.016;
    const ship = getShip(SAVE.selectedShip);
    const p = { x: rect.width / 2, y: rect.height * 0.24 + Math.sin(t) * 6, r: 20, tilt: Math.sin(t * 0.7) * 0.15, engineGlow: 0.8, shieldTimer: 0, hitFlash: 0, invincible: 0, speedBoostTimer: 0, ship };
    Player.prototype.draw.call(p, menuShipCtx);
  }
  frame();
}

/* ------------------------- UI Wiring ------------------------- */
function playClick() { AudioEngine.click(); }
function wireButton(id, fn) { const el = document.getElementById(id); if (!el) return; el.addEventListener('click', () => { playClick(); fn(); }); }

function applySettingsToUI() {
  document.querySelectorAll('#setSound .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.val === SAVE.settings.sound));
  document.querySelectorAll('#setMusic .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.val === SAVE.settings.music));
  document.querySelectorAll('#setGraphics .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.val === SAVE.settings.graphics));
  document.querySelectorAll('#setControls .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.val === SAVE.settings.controls));
  document.getElementById('soundToggleMenu').textContent = SAVE.settings.sound === 'off' ? '🔇' : '🔊';
  setTouchControlsVisible();
}
function updateScoresScreen() {
  document.getElementById('statBestScore').textContent = padScore(SAVE.bestScoreGlobal);
  document.getElementById('statBestLevel').textContent = SAVE.bestLevelReachedGlobal;
  document.getElementById('statTotalCoins').textContent = padCoins(SAVE.totalCoinsGlobal);
  document.getElementById('statBestTime').textContent = formatTime(SAVE.bestSurvivalTimeGlobal);
}

function goToMenu() { Game.state = 'menu'; Screens.show('screen-menu'); }

function startPlayFlow(levelNum) {
  if (!SAVE.tutorialSeen) { pendingLevelNum = levelNum; Screens.show('screen-tutorial'); return; }
  openLevelIntro(levelNum);
}

function initUI() {
  Screens.init();

  wireButton('btnContinue', () => startPlayFlow(getContinueLevel()));
  wireButton('btnLevelSelect', () => { renderWorldSelect(); Screens.show('screen-worldselect'); });
  wireButton('btnShipSelect', () => { renderShipSelect(); Screens.show('screen-shipselect'); });
  wireButton('btnHowTo', () => Screens.show('screen-howto'));
  wireButton('btnHowToBack', () => Screens.show('screen-menu'));
  wireButton('btnHighScores', () => { updateScoresScreen(); Screens.show('screen-scores'); });
  wireButton('btnScoresBack', () => Screens.show('screen-menu'));
  wireButton('btnSettings', () => { applySettingsToUI(); Screens.show('screen-settings'); });
  wireButton('btnSettingsBack', () => Screens.show('screen-menu'));

  wireButton('btnWorldSelectBack', () => Screens.show('screen-menu'));
  wireButton('btnLevelSelectBack', () => { renderWorldSelect(); Screens.show('screen-worldselect'); });
  wireButton('btnShipSelectBack', () => Screens.show('screen-menu'));

  wireButton('btnTutorialStart', () => { SAVE.tutorialSeen = true; writeSave(SAVE); openLevelIntro(pendingLevelNum); });
  wireButton('btnTutorialSkip', () => { SAVE.tutorialSeen = true; writeSave(SAVE); openLevelIntro(pendingLevelNum); });

  wireButton('btnStartLevel', () => Game.startLevel(pendingLevelNum));

  wireButton('btnPause', () => Game.togglePause());
  wireButton('btnResume', () => Game.togglePause());
  wireButton('btnRestart', () => Game.startLevel(Game.level.num));
  wireButton('btnPauseSettings', () => { applySettingsToUI(); Screens.show('screen-settings'); });
  wireButton('btnPauseMenu', () => goToMenu());

  wireButton('btnNextLevel', () => Game.startLevel(Game.level.num + 1));
  wireButton('btnLevelCompleteLevels', () => { renderWorldSelect(); Screens.show('screen-worldselect'); });
  wireButton('btnLevelCompleteMenu', () => goToMenu());

  wireButton('btnPlayAgain', () => Game.startLevel(Game.level ? Game.level.num : 1));
  wireButton('btnGameOverLevels', () => { renderWorldSelect(); Screens.show('screen-worldselect'); });
  wireButton('btnGameOverMenu', () => goToMenu());

  wireButton('btnCcPlayAgain', () => Game.startLevel(1));
  wireButton('btnCcLevels', () => { renderWorldSelect(); Screens.show('screen-worldselect'); });
  wireButton('btnCcShips', () => { renderShipSelect(); Screens.show('screen-shipselect'); });
  wireButton('btnCcMenu', () => goToMenu());

  document.getElementById('soundToggleMenu').addEventListener('click', () => {
    SAVE.settings.sound = SAVE.settings.sound === 'off' ? 'on' : 'off';
    writeSave(SAVE); applySettingsToUI(); playClick();
  });

  function wireSegment(groupId, key) {
    const group = document.getElementById(groupId);
    group.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        SAVE.settings[key] = btn.dataset.val;
        writeSave(SAVE); applySettingsToUI(); playClick();
        if (key === 'graphics') initBgStars();
      });
    });
  }
  wireSegment('setSound', 'sound'); wireSegment('setMusic', 'music'); wireSegment('setGraphics', 'graphics'); wireSegment('setControls', 'controls');

  const modal = document.getElementById('modal-reset');
  wireButton('btnResetData', () => modal.classList.add('active'));
  wireButton('btnResetCancel', () => modal.classList.remove('active'));
  wireButton('btnResetConfirm', () => {
    SAVE = defaultSave(); writeSave(SAVE); applySettingsToUI(); updateScoresScreen(); modal.classList.remove('active');
  });

  document.addEventListener('touchmove', (e) => {
    if (Game.state !== 'menu' || e.target.closest('.panel-wrap, .world-grid, .ship-grid, .level-map')) return;
    e.preventDefault();
  }, { passive: false });

  applySettingsToUI();
}

/* ------------------------- Boot Sequence ------------------------- */
const loadingTips = ['Calibrating thrusters…', 'Charging shields…', 'Mapping star charts…', 'Tuning weapon systems…', 'Scanning 10 sectors…', 'Waking up the engines…'];
function boot() {
  initUI();
  resizeCanvas();
  initBgStars();
  Game.init();
  initMenuShipPreview();

  const fill = document.getElementById('loadingFill');
  const tip = document.getElementById('loadingTip');
  let progress = 0;
  tip.textContent = loadingTips[randInt(0, loadingTips.length - 1)];
  const interval = setInterval(() => {
    progress += rand(8, 18);
    if (progress >= 100) {
      progress = 100; fill.style.width = '100%'; clearInterval(interval);
      setTimeout(() => Screens.show('screen-menu'), 250);
      return;
    }
    fill.style.width = progress + '%';
  }, 160);

  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch (e) { /* AdSense not available - ignore */ }

  if (!Game.raf) Game.raf = requestAnimationFrame(loop);
}

document.addEventListener('DOMContentLoaded', boot);
window.addEventListener('pointerdown', () => AudioEngine.ensureCtx(), { once: true });

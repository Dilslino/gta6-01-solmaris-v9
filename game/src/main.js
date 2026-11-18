// Solmaris — boot, the fixed-step loop, screens (title / play / paused /
// wasted), the chase camera, wanted logic, WASTED + Continue, and the
// window.__solmaris test hooks (including aimOverride for the shoot chain).
//
// ?seed=N fixes the ambient random stream. ?shot=start|play|chase|mission
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.

import * as THREE from 'three';
import { STEP, WORLD, MISSIONS, SAVE_KEY } from './config.js';
import { createWorld } from './world.js';
import { createPlayer, createCars, createPolice, createHeli, createGuards, createShooter } from './entities.js';
import { createMissions } from './missions.js';
import { createAudio } from './audio.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_MUTE, ACTION_STEAL, ACTION_SHOOT } from './input.js';
import { createHud } from './hud.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
void seed;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2000);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const world = createWorld(scene);
const player = createPlayer(scene);
const cars = createCars(scene, world);
const police = createPolice(scene, world);
const heli = createHeli(scene, world);
const guards = createGuards(scene);
const shooter = createShooter(scene);
const missions = createMissions(scene);
const audio = createAudio();
const input = createInput(canvas);
const hud = createHud();

const game = {
  screen: 'title',
  cash: 250,
  health: 100,
  wanted: 0,
  time: 0,
  currentCar: null,
  lastCrimeAt: -999,
  snapshotTimer: 0,
  saveTimer: 0,
  heliStepArmed: false,
  deathPenalty: 0,
  saveData: null,
};

try {
  const raw = window.localStorage.getItem(SAVE_KEY);
  if (raw) game.saveData = JSON.parse(raw);
} catch {
  game.saveData = null;
}

function announce(message) {
  status.textContent = message;
}

function playerPos() {
  if (game.currentCar) return { x: game.currentCar.x, z: game.currentCar.z };
  return { x: player.pos.x, z: player.pos.z };
}

function addWanted(n) {
  game.wanted = Math.min(3, game.wanted + n);
  game.lastCrimeAt = game.time;
  if (game.wanted >= 3 && !heli.state.active) heli.spawn(playerPos());
}

function takeSnapshot() {
  const pos = playerPos();
  missions.takeSnapshot({
    cash: game.cash,
    playerX: pos.x,
    playerZ: pos.z,
    heading: game.currentCar ? game.currentCar.heading : player.heading,
    wanted: game.wanted,
  });
}

function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: game.cash,
      missionIndex: missions.missionIndex,
      stepIndex: missions.stepIndex,
      collected: 0,
      guardsDown: missions.guardsDown,
    }));
  } catch {
    // Storage can be off: the save then lasts this visit only.
  }
}

function armStepSideEffects() {
  const step = missions.currentStep();
  if (!step) return;
  if (step.kind === 'shoot') guards.spawnAll();
  if (step.kind === 'heli' && !game.heliStepArmed) {
    game.heliStepArmed = true;
    game.wanted = 3;
    game.lastCrimeAt = game.time;
    if (!heli.state.active) heli.spawn(playerPos());
  }
}

function handleMissionResult(result) {
  if (!result || !result.missionComplete) return;
  game.cash += result.reward;
  audio.missionDone();
  const reward = result.reward;
  const finished = missions.completeMission();
  void finished;
  hud.toast(`Mission complete! +$${reward}`);
  announce(`Mission complete. Cash $${game.cash}.`);
  saveGame();
  takeSnapshot();
  game.heliStepArmed = false;
  armStepSideEffects();
}

function damage(amount) {
  if (game.screen !== 'play') return;
  game.health -= amount;
  if (game.health <= 0) {
    game.health = 0;
    wasted();
  }
}

function wasted() {
  game.screen = 'wasted';
  game.deathPenalty = Math.min(100, game.cash);
  game.cash -= game.deathPenalty;
  audio.wasted();
  audio.setSiren(false);
  audio.setEngine(0, false);
  hud.showOverlay(
    'WASTED',
    `You lost $${game.deathPenalty}. The city keeps your cash — unless you take it back.`,
    'Press Enter to Continue — cash, position, wanted level and mission restored.',
  );
  announce(`Wasted. Lost $${game.deathPenalty}. Press Enter to continue.`);
}

function continueGame() {
  const snap = missions.getSnapshot();
  if (!snap) {
    startGame(false);
    return;
  }
  missions.restoreSnapshot(snap);
  game.cash = snap.cash;
  game.wanted = snap.wanted;
  game.health = 100;
  game.screen = 'play';
  if (game.currentCar) {
    game.currentCar.occupied = false;
    game.currentCar = null;
  }
  player.group.visible = true;
  player.place(snap.x, snap.z, snap.heading);
  police.clear();
  heli.state.active = false;
  heli.state.spotted = 0;
  heli.state.leaving = false;
  heli.group.visible = false;
  // Guards: restore the exact count that was already down.
  const step = missions.currentStep();
  if (step && step.kind === 'shoot') {
    guards.spawnAll();
    const list = guards.list;
    for (let i = 0; i < snap.guardsDown && i < list.length; i++) {
      list[i].alive = false;
      list[i].hp = 0;
      list[i].group.rotation.x = Math.PI / 2;
      list[i].group.position.y = 0.4;
    }
  }
  game.heliStepArmed = step && step.kind === 'heli';
  hud.hideOverlay();
  hud.toast('Continued — restored to just before you died.');
  announce('Continued.');
}

function startGame(useSave) {
  const save = useSave ? game.saveData : null;
  game.cash = 250;
  game.health = 100;
  game.wanted = 0;
  game.screen = 'play';
  game.currentCar = null;
  game.time = 0;
  game.lastCrimeAt = -999;
  game.heliStepArmed = false;
  player.group.visible = true;
  player.place(WORLD.spawn.x, WORLD.spawn.z, Math.PI);
  police.clear();
  heli.state.active = false;
  heli.state.spotted = 0;
  heli.state.leaving = false;
  heli.group.visible = false;
  guards.clear();
  if (save && Number.isInteger(save.missionIndex)) {
    game.cash = save.cash ?? 250;
    missions.startMission(Math.min(save.missionIndex, MISSIONS.length - 1));
    // Fast-forward inside the mission is not possible honestly; start the
    // saved mission from its first step with the saved cash.
    hud.toast(`Save loaded — ${missions.currentMission().name}, $${game.cash}.`);
  } else {
    missions.startMission(0);
  }
  armStepSideEffects();
  takeSnapshot();
  hud.hideOverlay();
  audio.unlock();
  announce(`Playing. Mission 1: ${missions.currentMission().name}. Cash $${game.cash}.`);
}

function showTitle() {
  game.screen = 'title';
  const hasSave = !!game.saveData;
  hud.showOverlay(
    'SOLMARIS',
    'A coastal sunset open-world crime game. Six missions, the police, and one very persistent helicopter.',
    hasSave
      ? 'Press Enter to continue your save, or N for a new game.'
      : 'Press Enter to start. WASD move/drive · E steal car · Click/F shoot · M mute · P pause.',
  );
  announce('Solmaris. Press Enter to start.');
}

// --- shooting ------------------------------------------------------------------
function shootingTargets() {
  const targets = [];
  for (const g of guards.list) {
    if (g.alive) targets.push({ x: g.x, y: 1.2, z: g.z, r: 1.0, ref: { kind: 'guard', guard: g } });
  }
  if (heli.state.active && !heli.state.leaving) {
    targets.push({ x: heli.state.x, y: HELI_HEIGHT, z: heli.state.z, r: 5, ref: { kind: 'heli' } });
  }
  for (const u of police.units) {
    targets.push({ x: u.x, y: 1.0, z: u.z, r: 2.8, ref: { kind: 'police', unit: u } });
  }
  return targets;
}
const HELI_HEIGHT = 55;

function mouseNdc() {
  const m = input.mouse();
  return {
    x: (m.x / window.innerWidth) * 2 - 1,
    y: -(m.y / window.innerHeight) * 2 + 1,
  };
}

function tryShoot() {
  const ndc = mouseNdc();
  const result = shooter.shoot(camera, ndc, shootingTargets(), (a, b) => world.losBlocked(a, b));
  if (!result || !result.hit) return;
  audio.gunshot();
  const ref = result.target.ref;
  if (ref.kind === 'guard') {
    const g = ref.guard;
    g.hp -= 25;
    audio.hit();
    if (g.hp <= 0 && g.alive) {
      g.alive = false;
      g.group.rotation.x = Math.PI / 2;
      g.group.position.y = 0.4;
      addWanted(1);
      const r = missions.onGuardDown();
      hud.toast(`Guard down (${missions.guardsDown}/3)`);
      handleMissionResult(r);
    }
  } else if (ref.kind === 'heli') {
    heli.state.hp -= 25;
    audio.hit();
    if (heli.state.hp <= 0) {
      heli.state.active = false;
      heli.group.visible = false;
      game.wanted = 1;
      const r = missions.onHeliDown();
      hud.toast('Helicopter down!');
      handleMissionResult(r);
      saveGame();
    }
  } else if (ref.kind === 'police') {
    const u = ref.unit;
    u.hp = (u.hp ?? 50) - 25;
    u.speed = 0;
    audio.hit();
    if (u.hp <= 0) {
      u.speed = 0;
      u.disabled = true;
    }
  }
}

// --- camera ----------------------------------------------------------------------
let camYaw = Math.PI;
let camDist = 10;

function updateCamera(dt) {
  const pos = playerPos();
  const heading = game.currentCar ? game.currentCar.heading : player.heading;
  let dh = heading - camYaw;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  camYaw += dh * Math.min(1, dt * 3.5);
  const targetDist = game.currentCar ? 12 : 9.5;
  camDist += (targetDist - camDist) * Math.min(1, dt * 4);
  const backX = Math.sin(camYaw);
  const backZ = Math.cos(camYaw);
  const height = game.currentCar ? 6 : 5;
  camera.position.set(
    pos.x - backX * camDist,
    height,
    pos.z - backZ * camDist,
  );
  camera.lookAt(pos.x + backX * 4, 1.6, pos.z + backZ * 4);
}

// --- one fixed step -----------------------------------------------------------------
function step(dt) {
  game.time += dt;
  world.update(dt, game.time);
  missions.animate(dt, game.time);
  shooter.update(dt);

  if (game.screen === 'title') {
    // Slow orbit over the city behind the title.
    const t = game.time * 0.05;
    camera.position.set(Math.sin(t) * 180, 70, Math.cos(t) * 180);
    camera.lookAt(0, 10, 0);
    return;
  }
  if (game.screen !== 'play') return;

  const move = input.move();
  const actions = input.takeActions();
  if (actions & ACTION_PAUSE) {
    game.screen = 'paused';
    hud.showOverlay('PAUSED', 'Solmaris is waiting.', 'Press P or Enter to resume.');
    announce('Paused.');
    return;
  }
  if (actions & ACTION_MUTE) {
    const muted = audio.toggleMute();
    hud.toast(muted ? 'Sound muted.' : 'Sound on.');
  }

  // Steal / enter / exit a car.
  if (actions & ACTION_STEAL) {
    if (game.currentCar) {
      const car = game.currentCar;
      car.occupied = false;
      game.currentCar = null;
      player.group.visible = true;
      player.place(car.x + Math.cos(car.heading) * 2.5, car.z - Math.sin(car.heading) * 2.5, car.heading);
      audio.setEngine(0, false);
    } else {
      const car = cars.nearestCar(player.pos.x, player.pos.z, 4.5);
      if (car) {
        game.currentCar = car;
        car.occupied = true;
        player.group.visible = false;
        if (!car.stolen) {
          car.stolen = true;
          addWanted(1);
          hud.toast('Car stolen! Wanted level up.');
          announce('Car stolen. Wanted level up.');
        }
        audio.unlock();
      }
    }
  }

  // Move.
  let speed = 0;
  if (game.currentCar) {
    const car = game.currentCar;
    speed = cars.updateCar(dt, car, move, (p, r) => world.collideCircle(p, r), world.traffic || []);
    if (car.crashed) {
      car.crashed = false;
      audio.crash();
      damage(4);
    }
    audio.setEngine(Math.abs(speed) / 14, true);
  } else {
    speed = player.update(dt, move, (p, r) => world.collideCircle(p, r));
    audio.setEngine(0, false);
  }

  // Shoot (held mouse button or F).
  if (input.mouse().down || (actions & ACTION_SHOOT)) tryShoot();

  // Police + helicopter.
  police.update(dt, playerPos(), game.wanted, game.time, (dmg) => damage(dmg));
  const step = missions.currentStep();
  if (game.wanted >= 3 && !heli.state.active) heli.spawn(playerPos());
  if (game.wanted < 3 && heli.state.active && !heli.state.leaving) heli.leave();
  heli.update(dt, playerPos(), game.time);
  audio.setSiren(game.wanted > 0);

  // Guards shoot back.
  guards.update(dt, playerPos(), (a, b) => world.losBlocked(a, b), (dmg) => damage(dmg));

  // Missions.
  const result = missions.update(playerPos());
  handleMissionResult(result);

  // Wanted decay: lay low, break line of sight, and the heat cools off —
  // but never while the helicopter mission is live.
  const heliStep = step && step.kind === 'heli';
  if (!heliStep && game.wanted > 0 && game.time - game.lastCrimeAt > 20 &&
      heli.state.spotted < 0.5) {
    let nearPolice = false;
    for (const u of police.units) {
      if (Math.hypot(u.x - playerPos().x, u.z - playerPos().z) < 40) { nearPolice = true; break; }
    }
    if (!nearPolice) {
      game.wanted -= 1;
      game.lastCrimeAt = game.time;
      hud.toast(game.wanted > 0 ? `Wanted level down to ${game.wanted}.` : 'You lost the heat.');
    }
  }

  // Snapshot the last safe moment, for Continue.
  game.snapshotTimer += dt;
  if (game.snapshotTimer > 8 && game.health > 50 && game.wanted < 3) {
    game.snapshotTimer = 0;
    takeSnapshot();
  }
  game.saveTimer += dt;
  if (game.saveTimer > 30) {
    game.saveTimer = 0;
    saveGame();
  }

  updateCamera(dt);

  // HUD state.
  const pos = playerPos();
  const mStep = missions.currentStep();
  hud.update({
    cash: game.cash,
    health: game.health,
    wanted: game.wanted,
    spotted: heli.state.spotted,
    heli: heli.state.active ? { x: heli.state.x, z: heli.state.z } : null,
    missionIndex: missions.missionIndex,
    missionName: missions.currentMission() ? missions.currentMission().name : null,
    missionText: missions.stepLabel(),
    missionDist: mStep ? Math.hypot(pos.x - mStep.x, pos.z - mStep.z) : null,
    marker: mStep ? { x: mStep.x, z: mStep.z } : null,
    police: police.units.map((u) => ({ x: u.x, z: u.z })),
    playerX: pos.x,
    playerZ: pos.z,
    heading: game.currentCar ? game.currentCar.heading : player.heading,
    inCar: !!game.currentCar,
    speed,
    screen: game.screen,
  }, dt);
}

// --- main loop -----------------------------------------------------------------------
function runGame() {
  let accumulator = 0;
  let last = performance.now();

  function handleActions() {
    // Only the menu screens consume one-shot presses here; during play the
    // fixed step reads them, so a press is never swallowed between the two.
    if (game.screen !== 'title' && game.screen !== 'wasted' && game.screen !== 'paused') return;
    const actions = input.takeActions();
    if (game.screen === 'title' && (actions & ACTION_CONFIRM)) {
      startGame(true);
    } else if (game.screen === 'wasted' && (actions & ACTION_CONFIRM)) {
      continueGame();
    } else if (game.screen === 'paused' && (actions & (ACTION_PAUSE | ACTION_CONFIRM))) {
      game.screen = 'play';
      hud.hideOverlay();
      announce('Playing.');
    }
  }

  // N starts a fresh game from the title screen.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyN' && game.screen === 'title') startGame(false);
  });

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (game.screen === 'title' || game.screen === 'play') {
      while (accumulator >= STEP && (game.screen === 'title' || game.screen === 'play')) {
        step(STEP);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    if (game.screen !== 'title') updateCamera(1 / 60);
    renderer.render(scene, camera);
  }

  showTitle();
  requestAnimationFrame(frame);
}

// --- test hooks -------------------------------------------------------------------------
// window.__solmaris is the debug surface the play-test drives: state reads,
// teleports, wanted control and the aimOverride hook (aimAt/clearAim).
window.__solmaris = {
  get state() {
    const pos = playerPos();
    const mStep = missions.currentStep();
    return {
      screen: game.screen,
      cash: game.cash,
      health: game.health,
      wanted: game.wanted,
      spotted: heli.state.spotted,
      missionIndex: missions.missionIndex,
      stepIndex: missions.stepIndex,
      missionName: missions.currentMission() ? missions.currentMission().name : null,
      missionText: missions.stepLabel(),
      missionDist: mStep ? Math.hypot(pos.x - mStep.x, pos.z - mStep.z) : null,
      playerX: pos.x,
      playerZ: pos.z,
      heading: game.currentCar ? game.currentCar.heading : player.heading,
      inCar: !!game.currentCar,
      speed: game.currentCar ? game.currentCar.speed : 0,
      heliActive: heli.state.active,
      heliHp: heli.state.hp,
      heliX: heli.state.x,
      heliZ: heli.state.z,
      guardsAlive: guards.list.filter((g) => g.alive).length,
      guardsDown: missions.guardsDown,
      muted: audio.muted,
      audioRunning: audio.running,
      audioStarted: audio.started,
      allDone: missions.allDone,
    };
  },
  start(useSave = false) { if (game.screen === 'title') startGame(useSave); },
  teleport(x, z) {
    if (game.currentCar) {
      game.currentCar.x = x;
      game.currentCar.z = z;
    } else {
      player.place(x, z, player.heading);
    }
    updateCamera(1);
  },
  setWanted(n) {
    game.wanted = Math.max(0, Math.min(3, n));
    game.lastCrimeAt = game.time;
    if (game.wanted >= 3 && !heli.state.active) heli.spawn(playerPos());
    if (game.wanted < 3 && heli.state.active && !heli.state.leaving) heli.leave();
  },
  setCash(n) { game.cash = n; },
  damage(n) { damage(n); },
  heal() { game.health = 100; },
  aimAt(x, y, z) { shooter.aimAt(x, y, z); },
  clearAim() { shooter.clearAim(); },
  get aimOverride() { return shooter.aimOverride; },
  shoot() { tryShoot(); },
  startMission(i) { missions.startMission(i); armStepSideEffects(); takeSnapshot(); },
  forceSnapshot() { takeSnapshot(); return missions.getSnapshot(); },
  getSnapshot() { return missions.getSnapshot(); },
  continueGame() { if (game.screen === 'wasted') continueGame(); },
  guardPos(i) {
    const g = guards.list[i];
    return g ? { x: g.x, y: 1.2, z: g.z, alive: g.alive, hp: g.hp } : null;
  },
  heliPos() { return { x: heli.state.x, y: 55, z: heli.state.z }; },
  nearestCar() {
    const car = cars.nearestCar(player.pos.x, player.pos.z, 100);
    return car ? { x: car.x, z: car.z } : null;
  },
  garage: { x: 175, z: -105 },
  dropoff: { x: 0, z: -210 },
};

if (shot) {
  stageShot(game, shot, {
    startGame, showTitle, player, cars, missions, heli, police, guards,
    setWanted: (n) => window.__solmaris.setWanted(n),
    teleport: (x, z) => window.__solmaris.teleport(x, z),
    renderer, scene, camera, hud, updateCamera,
  });
} else {
  runGame();
}

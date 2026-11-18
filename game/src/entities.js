// Solmaris entities: the player on foot, drivable cars, police cars, the
// police helicopter with its interactive searchlight, and the dock guards.
// Shooting uses a torso-height aim ray with up to ~77 degrees of elevation so
// the helicopter can be hit, plus an aimOverride hook for fine aim control.

import * as THREE from 'three';
import { PLAYER, CAR, POLICE, HELI, WEAPON, PALETTE } from './config.js';

const V3 = THREE.Vector3;

// ---------------------------------------------------------------------------
// Player on foot
// ---------------------------------------------------------------------------
export function createPlayer(scene) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: PALETTE.player });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.45), bodyMat);
  body.position.y = 0.95;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xd9a066 }));
  head.position.y = 1.65;
  group.add(head);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2c3242 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.65, 0.28), legMat);
  legL.position.set(-0.2, 0.32, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.2;
  group.add(legR);
  // A simple held weapon so shooting reads on screen.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.7),
    new THREE.MeshLambertMaterial({ color: 0x181818 }));
  gun.position.set(0.45, 1.05, 0.3);
  group.add(gun);
  scene.add(group);

  const pos = { x: 0, z: 30 };
  let heading = Math.PI; // facing north (-Z)
  let walkPhase = 0;
  let moving = false;

  return {
    group,
    pos,
    get heading() { return heading; },
    set heading(v) { heading = v; },
    get moving() { return moving; },
    place(x, z, h) {
      pos.x = x;
      pos.z = z;
      if (h !== undefined) heading = h;
      group.position.set(x, 0, z);
      group.rotation.y = heading;
    },
    update(dt, move, collideCircle) {
      const speed = move.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      const turn = move.strafe * PLAYER.turnSpeed * dt;
      heading += turn;
      let vx = 0;
      let vz = 0;
      if (move.forward !== 0) {
        vx = Math.sin(heading) * move.forward * speed;
        vz = Math.cos(heading) * move.forward * speed;
      }
      moving = move.forward !== 0 || move.strafe !== 0;
      if (moving) {
        walkPhase += dt * speed * 1.6;
        pos.x += vx * dt;
        pos.z += vz * dt;
        collideCircle(pos, PLAYER.radius);
        const swing = Math.sin(walkPhase) * 0.5;
        legL.rotation.x = swing;
        legR.rotation.x = -swing;
      } else {
        legL.rotation.x = 0;
        legR.rotation.x = 0;
      }
      group.position.set(pos.x, 0, pos.z);
      group.rotation.y = heading;
      return speed;
    },
  };
}

// ---------------------------------------------------------------------------
// Drivable cars
// ---------------------------------------------------------------------------
const PARKED_SPOTS = [
  { x: 8, z: 45, heading: Math.PI, color: 0xc0392b },
  { x: -8, z: -40, heading: 0, color: 0x2980b9 },
  { x: 68, z: 100, heading: Math.PI / 2, color: 0xf39c12 },
  { x: -68, z: 150, heading: -Math.PI / 2, color: 0x27ae60 },
  { x: 128, z: -40, heading: Math.PI, color: 0x8e44ad },
  { x: -128, z: 180, heading: 0, color: 0xecf0f1 },
  { x: 182, z: -20, heading: Math.PI / 2, color: 0x1abc9c },
  { x: -20, z: -20, heading: Math.PI / 2, color: 0xe67e22 },
];

export function createCars(scene, world) {
  const cars = PARKED_SPOTS.map((spot) => {
    const group = world.makeCarMesh(spot.color, false);
    group.position.set(spot.x, 0, spot.z);
    group.rotation.y = spot.heading;
    scene.add(group);
    return {
      group, x: spot.x, z: spot.z, heading: spot.heading,
      speed: 0, color: spot.color, stolen: false, occupied: false,
    };
  });

  function nearestCar(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of cars) {
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function updateCar(dt, car, move, collideCircle, traffic) {
    // Arcade driving: steering rate stays high at full speed (U-turns work).
    const steer = move.strafe;
    if (move.forward > 0) car.speed += CAR.accel * dt;
    else if (move.forward < 0) {
      if (car.speed > 0.5) car.speed -= CAR.brake * dt;
      else car.speed -= CAR.accel * 0.6 * dt;
    } else {
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
    }
    car.speed = Math.max(-CAR.reverseSpeed, Math.min(CAR.maxSpeed, car.speed));
    const speedFactor = CAR.minTurnFactor +
      (1 - CAR.minTurnFactor) * Math.min(1, Math.abs(car.speed) / 8);
    const dirSign = car.speed >= 0 ? 1 : -1;
    car.heading += steer * CAR.turnRate * speedFactor * dirSign * dt;
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    const probe = { x: nx, z: nz };
    const hitWall = collideCircle(probe, 1.7);
    if (hitWall) {
      if (Math.abs(car.speed) > 5) car.crashed = true;
      car.speed *= 0.35;
      // Keep the pre-collision position when the wall push is large.
      car.x = probe.x;
      car.z = probe.z;
    } else {
      car.x = nx;
      car.z = nz;
    }
    // Nudge away from traffic cars.
    for (const t of traffic) {
      const dx = car.x - t.x;
      const dz = car.z - t.z;
      const d = Math.hypot(dx, dz);
      if (d < 3.4 && d > 0.01) {
        car.x += (dx / d) * (3.4 - d);
        car.z += (dz / d) * (3.4 - d);
        car.speed *= 0.7;
      }
    }
    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = car.heading;
    return car.speed;
  }

  return { cars, nearestCar, updateCar };
}

// ---------------------------------------------------------------------------
// Police cars: chase and ram
// ---------------------------------------------------------------------------
export function createPolice(scene, world) {
  const units = [];
  let spawnCooldown = 0;

  function spawn(x, z) {
    const group = world.makeCarMesh(0, true);
    group.position.set(x, 0, z);
    scene.add(group);
    const unit = {
      group, x, z, heading: 0, speed: 0, ramTimer: 0, sirenPhase: Math.random() * 6,
    };
    units.push(unit);
    return unit;
  }

  function update(dt, target, wanted, time, onRam) {
    spawnCooldown -= dt;
    if (wanted >= 1 && units.length < POLICE.maxCars && spawnCooldown <= 0) {
      // Spawn on a nearby road, 45 m from the player.
      const angle = Math.random() * Math.PI * 2;
      const sx = target.x + Math.cos(angle) * 45;
      const sz = target.z + Math.sin(angle) * 45;
      spawn(Math.max(-270, Math.min(270, sx)), Math.max(-270, Math.min(270, sz)));
      spawnCooldown = 6;
    }
    for (let i = units.length - 1; i >= 0; i--) {
      const u = units[i];
      if (wanted === 0) {
        // Drive off and despawn once far away.
        const away = Math.atan2(u.x - target.x, u.z - target.z);
        u.heading = away;
        u.speed = Math.min(POLICE.chaseSpeed, u.speed + 8 * dt);
        u.x += Math.sin(u.heading) * u.speed * dt;
        u.z += Math.cos(u.heading) * u.speed * dt;
        if (Math.hypot(u.x - target.x, u.z - target.z) > 120) {
          scene.remove(u.group);
          units.splice(i, 1);
        }
        continue;
      }
      const dx = target.x - u.x;
      const dz = target.z - u.z;
      const dist = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - u.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      u.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, dh));
      u.speed = Math.min(POLICE.chaseSpeed, u.speed + 9 * dt);
      const probe = { x: u.x + Math.sin(u.heading) * u.speed * dt, z: u.z + Math.cos(u.heading) * u.speed * dt };
      world.collideCircle(probe, 1.7);
      u.x = probe.x;
      u.z = probe.z;
      u.group.position.set(u.x, 0, u.z);
      u.group.rotation.y = u.heading;
      u.ramTimer -= dt;
      if (dist < 3.6 && u.ramTimer <= 0) {
        u.ramTimer = POLICE.ramCooldown;
        onRam(POLICE.ramDamage);
      }
      // Flashing light bar.
      const bar = u.group.children.find((c) => c.geometry && c.geometry.type === 'BoxGeometry' && c.position.y > 1.5);
      if (bar) bar.material.color.setHex(Math.sin(time * 10 + u.sirenPhase) > 0 ? 0xff2222 : 0x2244ff);
    }
  }

  function clear() {
    for (const u of units) scene.remove(u.group);
    units.length = 0;
  }

  return { units, update, clear };
}

// ---------------------------------------------------------------------------
// Police helicopter with an interactive searchlight
// ---------------------------------------------------------------------------
export function createHeli(scene, world) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 5.2),
    new THREE.MeshLambertMaterial({ color: 0x222a35 }));
  group.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 4.5),
    new THREE.MeshLambertMaterial({ color: 0x222a35 }));
  tail.position.set(0, 0.3, -4.2);
  group.add(tail);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 1.6),
    new THREE.MeshLambertMaterial({ color: 0x9fd8ff }));
  glass.position.set(0, 0.35, 2.0);
  group.add(glass);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 0.6),
    new THREE.MeshLambertMaterial({ color: 0x111111 }));
  rotor.position.y = 1.15;
  group.add(rotor);
  const rotor2 = rotor.clone();
  rotor2.rotation.y = Math.PI / 2;
  group.add(rotor2);
  const skidMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  for (const sx of [-1.2, 1.2]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 4.4), skidMat);
    skid.position.set(sx, -1.05, 0);
    group.add(skid);
  }
  group.visible = false;
  scene.add(group);

  // The searchlight: a real spotlight plus a visible cone.
  const spot = new THREE.SpotLight(0xfff2b0, 0, HELI.searchRange * 1.6, 0.32, 0.45, 1.2);
  spot.position.set(0, 0, 0);
  group.add(spot);
  spot.target.position.set(0, -HELI.height, 0);
  group.add(spot.target);
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xfff2b0, transparent: true, opacity: 0.14,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(16, HELI.height, 20, 1, true), coneMat);
  cone.position.y = -HELI.height / 2;
  cone.rotation.x = Math.PI;
  group.add(cone);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(14, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.22, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = -HELI.height + 0.1;
  group.add(pool);

  const state = {
    active: false, hp: HELI.hp, spotted: 0, x: 0, z: 0, leaving: false,
  };
  let orbit = 0;

  function update(dt, target, time) {
    if (!state.active) return;
    orbit += dt * 0.25;
    const ox = Math.cos(orbit) * 16;
    const oz = Math.sin(orbit) * 16;
    const tx = state.leaving ? target.x + 400 : target.x + ox;
    const tz = state.leaving ? target.z + 400 : target.z + oz;
    state.x += (tx - state.x) * Math.min(1, dt * 0.8);
    state.z += (tz - state.z) * Math.min(1, dt * 0.8);
    group.position.set(state.x, HELI.height, state.z);
    rotor.rotation.y += dt * 22;
    rotor2.rotation.y += dt * 22;
    // The light tracks the player; SPOTTED only rises while the player is
    // actually visible (line of sight clear and inside range). Hiding under
    // the garage roof blocks the sight line, so SPOTTED drains to zero.
    const playerPos = { x: target.x, y: 1.2, z: target.z };
    const heliPos = { x: state.x, y: HELI.height, z: state.z };
    const dist = Math.hypot(target.x - state.x, target.z - state.z);
    const visible = !state.leaving && dist < 90 && !world.losBlocked(heliPos, playerPos);
    if (visible) state.spotted = Math.min(1, state.spotted + HELI.spottedRise * dt);
    else state.spotted = Math.max(0, state.spotted - HELI.spottedFall * dt);
    spot.intensity = state.leaving ? 0 : 260;
    cone.visible = !state.leaving;
    pool.visible = !state.leaving;
    spot.target.position.set(target.x - state.x, -HELI.height + 1.2, target.z - state.z);
    cone.lookAt(target.x, 0, target.z);
    // Re-aim the cone: it hangs from the heli down to the player.
    const dy = HELI.height - 1.2;
    const dx = target.x - state.x;
    const dz = target.z - state.z;
    const len = Math.hypot(dx, dy, dz);
    cone.scale.set(1, len / HELI.height, 1);
    cone.position.set(dx / 2, -dy / 2, dz / 2);
    cone.lookAt(target.x - state.x, -HELI.height, target.z - state.z);
    cone.rotateX(Math.PI / 2);
    pool.position.set(dx, -HELI.height + 0.15, dz);
    if (state.leaving && Math.hypot(state.x - target.x, state.z - target.z) > 300) {
      state.active = false;
      group.visible = false;
    }
  }

  function spawn(target) {
    state.active = true;
    state.leaving = false;
    state.hp = HELI.hp;
    state.spotted = 0;
    state.x = target.x + 60;
    state.z = target.z - 60;
    group.visible = true;
    group.position.set(state.x, HELI.height, state.z);
  }

  function leave() {
    state.leaving = true;
  }

  return { group, state, update, spawn, leave };
}

// ---------------------------------------------------------------------------
// Dock guards (Mission 5 targets)
// ---------------------------------------------------------------------------
const GUARD_SPOTS = [
  { x: -196, z: 112 },
  { x: -204, z: 124 },
  { x: -198, z: 132 },
];

export function createGuards(scene) {
  let guards = [];

  function spawnAll() {
    clear();
    for (const spot of GUARD_SPOTS) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.05, 0.5),
        new THREE.MeshLambertMaterial({ color: 0x8a2f2f }));
      body.position.y = 0.95;
      group.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8),
        new THREE.MeshLambertMaterial({ color: 0xc98a5a }));
      head.position.y = 1.65;
      group.add(head);
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.8),
        new THREE.MeshLambertMaterial({ color: 0x181818 }));
      gun.position.set(0.45, 1.05, 0.3);
      group.add(gun);
      group.position.set(spot.x, 0, spot.z);
      scene.add(group);
      guards.push({ group, x: spot.x, z: spot.z, hp: 75, alive: true, shootTimer: 1 + Math.random() });
    }
  }

  function clear() {
    for (const g of guards) scene.remove(g.group);
    guards = [];
  }

  // Guards shoot back when the player is close and visible.
  function update(dt, playerPos, losBlocked, onHit) {
    for (const g of guards) {
      if (!g.alive) continue;
      const dx = playerPos.x - g.x;
      const dz = playerPos.z - g.z;
      const dist = Math.hypot(dx, dz);
      g.group.rotation.y = Math.atan2(dx, dz);
      g.shootTimer -= dt;
      if (dist < 42 && g.shootTimer <= 0) {
        const a = { x: g.x, y: 1.4, z: g.z };
        const b = { x: playerPos.x, y: 1.2, z: playerPos.z };
        if (!losBlocked(a, b)) {
          onHit(4);
          g.shootTimer = 1.4 + Math.random() * 0.8;
        } else {
          g.shootTimer = 0.6;
        }
      }
    }
  }

  return {
    get list() { return guards; },
    spawnAll,
    clear,
    update,
  };
}

// ---------------------------------------------------------------------------
// Shooting: torso-height aim ray, elevation up to ~77 deg, aimOverride hook
// ---------------------------------------------------------------------------
export function createShooter(scene) {
  // aimOverride: when set to {x, y, z}, shots fly from the camera straight
  // at that world point instead of through the mouse cursor.
  let aimOverride = null;
  let cooldown = 0;
  const raycaster = new THREE.Raycaster();
  raycaster.far = WEAPON.range;

  function raySphere(origin, dir, center, radius) {
    const ox = center.x - origin.x;
    const oy = center.y - origin.y;
    const oz = center.z - origin.z;
    const tca = ox * dir.x + oy * dir.y + oz * dir.z;
    if (tca < 0) return -1;
    const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
    if (d2 > radius * radius) return -1;
    return tca - Math.sqrt(radius * radius - d2);
  }

  // Find the nearest hittable target along a ray. Targets: {x, y, z, r, ref}.
  function pickTarget(origin, dir, targets) {
    let best = null;
    let bestT = WEAPON.range;
    for (const t of targets) {
      const hit = raySphere(origin, dir, t, t.r);
      if (hit > 0 && hit < bestT) {
        bestT = hit;
        best = t;
      }
    }
    return best ? { target: best, dist: bestT } : null;
  }

  function shoot(camera, mouseNdc, targets, losBlocked) {
    if (cooldown > 0) return null;
    cooldown = WEAPON.fireCooldown;
    const origin = camera.position.clone();
    let dir;
    if (aimOverride) {
      dir = new V3(aimOverride.x - origin.x, aimOverride.y - origin.y, aimOverride.z - origin.z).normalize();
    } else {
      raycaster.setFromCamera(mouseNdc, camera);
      dir = raycaster.ray.direction.clone();
      // Clamp elevation so the ray never points below the horizon or above
      // the ~77 degree ceiling the helicopter needs.
      const horiz = Math.hypot(dir.x, dir.z);
      const pitch = Math.atan2(dir.y, horiz);
      const maxPitch = (WEAPON.maxPitchDeg * Math.PI) / 180;
      if (pitch > maxPitch) {
        const c = Math.cos(maxPitch);
        const s = Math.sin(maxPitch);
        const len = Math.max(1e-6, horiz);
        dir.set((dir.x / len) * c, s, (dir.z / len) * c);
      } else if (pitch < -0.05) {
        dir.y = -0.05 * Math.max(1, horiz);
        dir.normalize();
      }
    }
    // Aim from torso height: start the ray at the shooter's chest, not the
    // ground, so shots travel level instead of digging into the street.
    const start = new V3(origin.x, Math.max(origin.y, 1.4), origin.z);
    const hit = pickTarget(start, dir, targets);
    if (!hit) return { hit: false };
    const hitPoint = {
      x: start.x + dir.x * hit.dist,
      y: start.y + dir.y * hit.dist,
      z: start.z + dir.z * hit.dist,
    };
    if (losBlocked({ x: start.x, y: start.y, z: start.z }, hitPoint)) return { hit: false, blocked: true };
    return { hit: true, target: hit.target, point: hitPoint };
  }

  return {
    get aimOverride() { return aimOverride; },
    set aimOverride(v) { aimOverride = v; },
    aimAt(x, y, z) { aimOverride = { x, y, z }; },
    clearAim() { aimOverride = null; },
    update(dt) { cooldown = Math.max(0, cooldown - dt); },
    shoot,
  };
}

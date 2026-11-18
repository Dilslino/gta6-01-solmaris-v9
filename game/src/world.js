// Solmaris city: a coastal island grid at sunset. Builds the ground, ocean,
// roads, buildings (with collision boxes), palm trees, streetlights, the
// Parking Garage and the West Docks, plus ambient traffic and pedestrians.
// Also owns the two geometry queries the gameplay needs: circle-vs-building
// collision and segment-vs-box line of sight (the searchlight's hiding rule).

import * as THREE from 'three';
import { WORLD, PALETTE } from './config.js';

function mulberry32(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Facade texture: dark wall with a grid of windows, some lit for sunset.
function facadeTexture(baseColor, litRatio, random) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = baseColor;
  g.fillRect(0, 0, 128, 256);
  for (let y = 12; y < 244; y += 22) {
    for (let x = 10; x < 118; x += 20) {
      g.fillStyle = random() < litRatio ? '#ffd27a' : '#2c3242';
      g.fillRect(x, y, 12, 14);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWorld(scene) {
  const random = mulberry32(20261118);
  const colliders = []; // {x0,z0,x1,z1} 2D building footprints
  const losBoxes = []; // {x0,y0,z0,x1,y1,z1} 3D boxes that block sight
  const disposables = [];

  function track(thing) {
    disposables.push(thing);
    return thing;
  }

  function box(w, h, d, color, opts = {}) {
    const mat = new THREE.MeshLambertMaterial({ color, ...opts });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.y = h / 2;
    return mesh;
  }

  // --- sky, sun, fog -------------------------------------------------------
  scene.background = new THREE.Color(PALETTE.skyHorizon);
  scene.fog = new THREE.Fog(PALETTE.fog, 180, 900);
  const hemi = new THREE.HemisphereLight(0xffb37a, 0x3a2a55, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 1.6);
  sun.position.set(-260, 90, 180);
  scene.add(sun);
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(34, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false }),
  );
  sunDisc.position.set(-420, 70, 420);
  sunDisc.lookAt(0, 30, 0);
  scene.add(sunDisc);

  // --- ground, beach, ocean -------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.half * 2, WORLD.half * 2),
    new THREE.MeshLambertMaterial({ color: PALETTE.ground }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(2600, 2600),
    new THREE.MeshLambertMaterial({ color: PALETTE.water }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -0.6;
  scene.add(ocean);

  const sandMat = new THREE.MeshLambertMaterial({ color: PALETTE.sand });
  const beachN = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.half * 2 + 80, 40), sandMat);
  beachN.rotation.x = -Math.PI / 2;
  beachN.position.set(0, 0.02, -WORLD.half - 20);
  scene.add(beachN);
  const beachS = beachN.clone();
  beachS.position.set(0, 0.02, WORLD.half + 20);
  scene.add(beachS);
  const beachW = new THREE.Mesh(new THREE.PlaneGeometry(40, WORLD.half * 2 + 80), sandMat);
  beachW.rotation.x = -Math.PI / 2;
  beachW.position.set(-WORLD.half - 20, 0.02, 0);
  scene.add(beachW);
  const beachE = beachW.clone();
  beachE.position.set(WORLD.half + 20, 0.02, 0);
  scene.add(beachE);

  // --- roads -----------------------------------------------------------------
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
  const lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.roadLine });
  for (const x of WORLD.roadsX) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.roadWidth, WORLD.half * 2), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(x, 0.03, 0);
    scene.add(road);
    for (let z = -WORLD.half + 15; z < WORLD.half; z += 30) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 8), lineMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.05, z);
      scene.add(dash);
    }
  }
  for (const z of WORLD.roadsZ) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.half * 2, WORLD.roadWidth), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.03, z);
    scene.add(road);
    for (let x = -WORLD.half + 15; x < WORLD.half; x += 30) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(8, 0.5), lineMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.05, z);
      scene.add(dash);
    }
  }

  // --- clear zones: mission points, spawn and the garage stay building-free --
  const clearZones = [
    { x: 0, z: 30, r: 18 }, // spawn
    { x: 60, z: 180, r: 14 }, // M1 pickup (Marina)
    { x: 0, z: -210, r: 14 }, // North Drop-off
    { x: -120, z: 60, r: 14 }, // M2 pickup
    { x: 180, z: 120, r: 14 }, // M2 drop
    { x: -180, z: -60, r: 12 },
    { x: 120, z: -180, r: 12 },
    { x: 60, z: 120, r: 12 },
    { x: -30, z: -30, r: 14 }, // M4 pickup (plaza)
    { x: 40, z: -60, r: 14 }, // M4 drop
    { x: -200, z: 120, r: 22 }, // West Docks
    { x: -210, z: 140, r: 14 },
    { x: 175, z: -105, r: 40 }, // Parking Garage
  ];
  const plazaMat = new THREE.MeshLambertMaterial({ color: 0x7a6a52 });
  for (const zone of clearZones) {
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(zone.r, 24), plazaMat);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(zone.x, 0.04, zone.z);
    scene.add(plaza);
  }

  // --- buildings --------------------------------------------------------------
  const facadeMats = PALETTE.building.map((color) => {
    const hex = `#${color.toString(16).padStart(6, '0')}`;
    const tex = track(facadeTexture(hex, 0.45, random));
    return new THREE.MeshLambertMaterial({ map: tex });
  });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x2a2438 });

  const roadSetX = new Set(WORLD.roadsX);
  const roadSetZ = new Set(WORLD.roadsZ);
  function isClear(cx, cz) {
    for (const zone of clearZones) {
      const dx = cx - zone.x;
      const dz = cz - zone.z;
      if (dx * dx + dz * dz < (zone.r + 12) * (zone.r + 12)) return true;
    }
    return false;
  }

  for (let ix = 0; ix < WORLD.roadsX.length - 1; ix++) {
    for (let iz = 0; iz < WORLD.roadsZ.length - 1; iz++) {
      const x0 = WORLD.roadsX[ix] + 9;
      const x1 = WORLD.roadsX[ix + 1] - 9;
      const z0 = WORLD.roadsZ[iz] + 9;
      const z1 = WORLD.roadsZ[iz + 1] - 9;
      const w = x1 - x0;
      const d = z1 - z0;
      const count = w > 42 && d > 42 ? 2 : 1;
      for (let b = 0; b < count; b++) {
        let bx0;
        let bz0;
        let bw;
        let bd;
        if (count === 2) {
          if (w >= d) {
            bw = w / 2 - 4;
            bd = d - 6;
            bx0 = x0 + 3 + b * (w / 2);
            bz0 = z0 + 3;
          } else {
            bw = w - 6;
            bd = d / 2 - 4;
            bx0 = x0 + 3;
            bz0 = z0 + 3 + b * (d / 2);
          }
        } else {
          bw = w - 6;
          bd = d - 6;
          bx0 = x0 + 3;
          bz0 = z0 + 3;
        }
        const cx = bx0 + bw / 2;
        const cz = bz0 + bd / 2;
        if (isClear(cx, cz)) continue;
        const h = 8 + random() * 30;
        const mat = facadeMats[Math.floor(random() * facadeMats.length)];
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, h, bd), mat);
        mesh.position.set(cx, h / 2, cz);
        scene.add(mesh);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.4, 0.6, bd + 0.4), roofMat);
        roof.position.set(cx, h + 0.3, cz);
        scene.add(roof);
        colliders.push({ x0: bx0, z0: bz0, x1: bx0 + bw, z1: bz0 + bd });
        losBoxes.push({ x0: bx0, y0: 0, z0: bz0, x1: bx0 + bw, y1: h, z1: bz0 + bd });
      }
    }
  }
  void roadSetX;
  void roadSetZ;

  // --- Parking Garage at (175,-105): roofed, open on the west side ------------
  // The roof is a real 3D box: from above, a helicopter's sight line to a player
  // standing under it is blocked, so SPOTTED drains. That is the hiding rule.
  const garage = new THREE.Group();
  const garageMat = new THREE.MeshLambertMaterial({ color: 0x5a5a68 });
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x8a8a96 });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(52, 1.2, 52), garageMat);
  roof.position.set(175, 8.2, -105);
  garage.add(roof);
  const wallN = new THREE.Mesh(new THREE.BoxGeometry(52, 8, 1.2), wallMat);
  wallN.position.set(175, 4, -131);
  garage.add(wallN);
  const wallS = new THREE.Mesh(new THREE.BoxGeometry(52, 8, 1.2), wallMat);
  wallS.position.set(175, 4, -79);
  garage.add(wallS);
  const wallE = new THREE.Mesh(new THREE.BoxGeometry(1.2, 8, 52), wallMat);
  wallE.position.set(201, 4, -105);
  garage.add(wallE);
  const pillarMat = new THREE.MeshLambertMaterial({ color: 0x3a3a44 });
  for (const [px, pz] of [[152, -128], [152, -82], [198, -128], [198, -82], [175, -128], [175, -82]]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 8, 1.6), pillarMat);
    pillar.position.set(px, 4, pz);
    garage.add(pillar);
  }
  const garageSign = new THREE.Mesh(
    new THREE.BoxGeometry(14, 3, 0.6),
    new THREE.MeshBasicMaterial({ color: 0xffe14d }),
  );
  garageSign.position.set(175, 9.6, -79.4);
  garage.add(garageSign);
  scene.add(garage);
  // Walls collide; the roof only blocks sight (walking under it is the point).
  colliders.push({ x0: 149, z0: -131.6, x1: 201, z1: -130.4 });
  colliders.push({ x0: 149, z0: -79.6, x1: 201, z1: -78.4 });
  colliders.push({ x0: 200.4, z0: -131, x1: 201.6, z1: -79 });
  losBoxes.push({ x0: 149, y0: 0, z0: -131.6, x1: 201, y1: 8, z1: -130.4 });
  losBoxes.push({ x0: 149, y0: 0, z0: -79.6, x1: 201, y1: 8, z1: -78.4 });
  losBoxes.push({ x0: 200.4, y0: 0, z0: -131, x1: 201.6, y1: 8, z1: -79 });
  losBoxes.push({ x0: 149, y0: 7.6, z0: -131, x1: 201, y1: 8.8, z1: -79 });

  // --- West Docks: pier planks over the water ----------------------------------
  const dockMat = new THREE.MeshLambertMaterial({ color: 0x6b4f35 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(30, 1, 60), dockMat);
  pier.position.set(-262, 0.2, 130);
  scene.add(pier);
  const crateMat = new THREE.MeshLambertMaterial({ color: 0x9a7a3a });
  for (let i = 0; i < 8; i++) {
    const crate = box(2.4, 2.4, 2.4, 0x9a7a3a);
    crate.position.set(-252 + random() * 8 - 4, 1.2, 105 + random() * 50);
    crate.rotation.y = random() * Math.PI;
    scene.add(crate);
    colliders.push({
      x0: crate.position.x - 1.4, z0: crate.position.z - 1.4,
      x1: crate.position.x + 1.4, z1: crate.position.z + 1.4,
    });
  }
  void crateMat;

  // --- palm trees ---------------------------------------------------------------
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x2e7a4f });
  const palmSpots = [];
  for (let i = 0; i < 46; i++) {
    const side = i % 4;
    let x;
    let z;
    if (side === 0) { x = -WORLD.half - 8 + random() * 12; z = -260 + random() * 520; }
    else if (side === 1) { x = WORLD.half + 2 + random() * 12; z = -260 + random() * 520; }
    else if (side === 2) { x = -260 + random() * 520; z = -WORLD.half - 8 + random() * 12; }
    else { x = -260 + random() * 520; z = WORLD.half + 2 + random() * 12; }
    palmSpots.push({ x, z });
  }
  for (const spot of palmSpots) {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 7, 6), trunkMat);
    trunk.position.y = 3.5;
    trunk.rotation.z = (random() - 0.5) * 0.15;
    palm.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(3.2, 3.4, 7), frondMat);
    crown.position.y = 8.2;
    palm.add(crown);
    palm.position.set(spot.x, 0, spot.z);
    scene.add(palm);
  }

  // --- streetlights ---------------------------------------------------------------
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2c34 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const x of WORLD.roadsX) {
    for (const z of [-240, -120, 0, 120, 240]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 7, 6), poleMat);
      pole.position.set(x + 7, 3.5, z);
      scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), lampMat);
      lamp.position.set(x + 7, 7.2, z);
      scene.add(lamp);
    }
  }

  // --- North Drop-off pad -----------------------------------------------------------
  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(5, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.55 }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(WORLD.northDropoff.x, 0.06, WORLD.northDropoff.z);
  scene.add(pad);
  const padPost = box(0.6, 4.5, 0.6, 0xffe14d);
  padPost.position.set(4.5, 2.25, -212);
  scene.add(padPost);

  // --- ambient traffic: cars looping rectangular road circuits -----------------------
  const traffic = [];
  const trafficColors = PALETTE.carColors;
  const circuits = [
    [[-60, -60], [60, -60], [60, 60], [-60, 60]],
    [[-180, -180], [120, -180], [120, 120], [-180, 120]],
    [[-120, 180], [180, 180], [180, -120], [-120, -120]],
    [[0, -240], [0, 240]],
  ];
  circuits.forEach((points, ci) => {
    const color = trafficColors[(ci + 2) % trafficColors.length];
    const group = makeCarMesh(color, false);
    scene.add(group);
    traffic.push({
      group, points, seg: 0, t: 0, speed: 7 + random() * 3, x: points[0][0], z: points[0][1],
    });
  });

  // --- pedestrians: simple walkers on the sidewalks ----------------------------------
  const pedestrians = [];
  const pedColors = [0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6, 0x1abc9c, 0xecf0f1];
  for (let i = 0; i < 14; i++) {
    const color = pedColors[i % pedColors.length];
    const ped = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.4),
      new THREE.MeshLambertMaterial({ color }));
    body.position.y = 0.85;
    ped.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0xd9a066 }));
    head.position.y = 1.65;
    ped.add(head);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x2c3242 });
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.6, 0.25), legMat);
    legL.position.set(-0.18, 0.3, 0);
    ped.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.18;
    ped.add(legR);
    const road = WORLD.roadsX[i % WORLD.roadsX.length];
    const startZ = -240 + random() * 480;
    ped.position.set(road + (random() < 0.5 ? 8.5 : -8.5), 0, startZ);
    scene.add(ped);
    pedestrians.push({
      group: ped, x: ped.position.x, z: startZ,
      dir: random() < 0.5 ? 1 : -1, speed: 1 + random() * 0.8, phase: random() * Math.PI * 2,
    });
  }

  function makeCarMesh(color, police) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: police ? PALETTE.policeCar : color });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.75, 4.4), bodyMat);
    body.position.y = 0.55;
    group.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 2.2),
      new THREE.MeshLambertMaterial({ color: police ? 0x2c3e50 : 0x222831 }));
    cabin.position.set(0, 1.2, -0.2);
    group.add(cabin);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(wx, 0.38, wz);
      group.add(wheel);
    }
    if (police) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.5),
        new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      bar.position.set(0, 1.62, -0.2);
      group.add(bar);
    } else {
      const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
      for (const hx of [-0.6, 0.6]) {
        const light = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), lightMat);
        light.position.set(hx, 0.6, 2.21);
        group.add(light);
      }
    }
    return group;
  }

  // --- geometry queries ---------------------------------------------------------------
  function collideCircle(pos, radius) {
    // Push a circle out of every building footprint it overlaps. Returns true on hit.
    let hit = false;
    for (const c of colliders) {
      const nx = Math.max(c.x0, Math.min(pos.x, c.x1));
      const nz = Math.max(c.z0, Math.min(pos.z, c.z1));
      const dx = pos.x - nx;
      const dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        hit = true;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          pos.x = nx + (dx / d) * radius;
          pos.z = nz + (dz / d) * radius;
        } else {
          // Centre inside the box: push out along the smallest penetration axis.
          const pl = pos.x - c.x0 + radius;
          const pr = c.x1 - pos.x + radius;
          const pt = pos.z - c.z0 + radius;
          const pb = c.z1 - pos.z + radius;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) pos.x = c.x0 - radius;
          else if (m === pr) pos.x = c.x1 + radius;
          else if (m === pt) pos.z = c.z0 - radius;
          else pos.z = c.z1 + radius;
        }
      }
    }
    // World edge: the island ends at the beach.
    const lim = WORLD.half - 2;
    if (pos.x < -lim) { pos.x = -lim; hit = true; }
    if (pos.x > lim) { pos.x = lim; hit = true; }
    if (pos.z < -lim) { pos.z = -lim; hit = true; }
    if (pos.z > lim) { pos.z = lim; hit = true; }
    return hit;
  }

  // Slab test: does the segment a->b cross any sight-blocking box?
  function segmentHitsBox(a, b, box3) {
    let tmin = 0;
    let tmax = 1;
    const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const axes = [
      [a.x, d.x, box3.x0, box3.x1],
      [a.y, d.y, box3.y0, box3.y1],
      [a.z, d.z, box3.z0, box3.z1],
    ];
    for (const [origin, dir, lo, hi] of axes) {
      if (Math.abs(dir) < 1e-9) {
        if (origin < lo || origin > hi) return false;
      } else {
        let t1 = (lo - origin) / dir;
        let t2 = (hi - origin) / dir;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return false;
      }
    }
    return true;
  }

  function losBlocked(a, b) {
    for (const box3 of losBoxes) {
      if (segmentHitsBox(a, b, box3)) return true;
    }
    return false;
  }

  function update(dt, time) {
    for (const car of traffic) {
      const pts = car.points;
      const a = pts[car.seg];
      const b = pts[(car.seg + 1) % pts.length];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      car.t += (car.speed * dt) / len;
      if (car.t >= 1) {
        car.t = 0;
        car.seg = (car.seg + 1) % pts.length;
      }
      const na = pts[car.seg];
      const nb = pts[(car.seg + 1) % pts.length];
      car.x = na[0] + (nb[0] - na[0]) * car.t;
      car.z = na[1] + (nb[1] - na[1]) * car.t;
      car.group.position.set(car.x, 0, car.z);
      car.group.rotation.y = Math.atan2(nb[0] - na[0], nb[1] - na[1]);
    }
    for (const ped of pedestrians) {
      ped.z += ped.dir * ped.speed * dt;
      if (ped.z > 270) ped.dir = -1;
      if (ped.z < -270) ped.dir = 1;
      ped.group.position.z = ped.z;
      ped.group.rotation.y = ped.dir > 0 ? 0 : Math.PI;
      const swing = Math.sin(time * 6 + ped.phase) * 0.35;
      ped.group.children[2].rotation.x = swing;
      ped.group.children[3].rotation.x = -swing;
    }
  }

  return {
    colliders,
    losBoxes,
    collideCircle,
    losBlocked,
    update,
    makeCarMesh,
    traffic,
    pedestrians,
    garageRect: { x0: 149, z0: -131, x1: 201, z1: -79 },
    dock: { x: -200, z: 120 },
  };
}

// Missions: six sequential jobs with a glowing marker pillar, HUD distance
// and cash rewards. The tracker also owns the "last safe moment" snapshot
// that Continue restores after WASTED.

import * as THREE from 'three';
import { MISSIONS } from './config.js';

export function createMissions(scene) {
  // Marker: a light pillar + a floating diamond + a ground ring.
  const marker = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 60, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffe14d, transparent: true, opacity: 0.28,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  pillar.position.y = 30;
  marker.add(pillar);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.6),
    new THREE.MeshBasicMaterial({ color: 0xffe14d }),
  );
  diamond.position.y = 9;
  marker.add(diamond);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3.0, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  marker.add(ring);
  marker.visible = false;
  scene.add(marker);

  let missionIndex = 0;
  let stepIndex = 0;
  let collected = 0; // for multi-collect steps
  let guardsDown = 0;
  let done = false;
  let allDone = false;
  let lastSnapshot = null;

  function currentMission() {
    return MISSIONS[missionIndex] ?? null;
  }

  function currentStep() {
    const m = currentMission();
    return m ? m.steps[stepIndex] ?? null : null;
  }

  function stepLabel() {
    const step = currentStep();
    if (!step) return allDone ? 'All missions complete — free roam!' : '';
    if (step.kind === 'shoot') return `Eliminate the dock guards (${guardsDown}/3)`;
    if (step.kind === 'collect') {
      const total = currentMission().steps.length;
      return `${step.label} — ${collected} of ${total} collected`;
    }
    return step.label;
  }

  function placeMarker() {
    const step = currentStep();
    if (!step || done) {
      marker.visible = false;
      return;
    }
    marker.visible = true;
    marker.position.set(step.x, 0, step.z);
  }

  function startMission(index) {
    missionIndex = index;
    stepIndex = 0;
    collected = 0;
    guardsDown = 0;
    done = false;
    placeMarker();
  }

  function advanceStep() {
    const m = currentMission();
    stepIndex += 1;
    if (stepIndex >= m.steps.length) {
      done = true;
      return { missionComplete: true, reward: m.reward };
    }
    placeMarker();
    return { missionComplete: false };
  }

  // Called every frame with the player's position; returns events.
  function update(playerPos) {
    if (allDone || done) return {};
    const step = currentStep();
    if (!step) return {};
    if (step.kind === 'goto' || step.kind === 'collect') {
      const d = Math.hypot(playerPos.x - step.x, playerPos.z - step.z);
      if (d <= step.radius) {
        if (step.kind === 'collect') collected += 1;
        return advanceStep();
      }
    }
    return {};
  }

  function onGuardDown() {
    guardsDown += 1;
    const step = currentStep();
    if (step && step.kind === 'shoot' && guardsDown >= (step.guards ?? 3)) {
      return advanceStep();
    }
    return {};
  }

  function onHeliDown() {
    const step = currentStep();
    if (step && step.kind === 'heli') return advanceStep();
    return {};
  }

  function completeMission() {
    const m = currentMission();
    const reward = m ? m.reward : 0;
    if (missionIndex + 1 >= MISSIONS.length) {
      allDone = true;
      marker.visible = false;
    } else {
      startMission(missionIndex + 1);
    }
    return reward;
  }

  // --- snapshots: the exact state Continue restores ---------------------------
  function takeSnapshot(state) {
    lastSnapshot = {
      cash: state.cash,
      x: state.playerX,
      z: state.playerZ,
      heading: state.heading,
      wanted: state.wanted,
      missionIndex,
      stepIndex,
      collected,
      guardsDown,
      done,
      allDone,
      health: 100,
    };
    return lastSnapshot;
  }

  function getSnapshot() {
    return lastSnapshot;
  }

  function restoreSnapshot(snap) {
    missionIndex = snap.missionIndex;
    stepIndex = snap.stepIndex;
    collected = snap.collected;
    guardsDown = snap.guardsDown;
    done = snap.done;
    allDone = snap.allDone;
    placeMarker();
    return snap;
  }

  function animate(dt, time) {
    diamond.rotation.y += dt * 2;
    diamond.position.y = 9 + Math.sin(time * 2) * 0.8;
    pillar.material.opacity = 0.22 + Math.sin(time * 3) * 0.08;
  }

  return {
    get missionIndex() { return missionIndex; },
    get stepIndex() { return stepIndex; },
    get done() { return done; },
    get allDone() { return allDone; },
    get guardsDown() { return guardsDown; },
    currentMission,
    currentStep,
    stepLabel,
    startMission,
    update,
    onGuardDown,
    onHeliDown,
    completeMission,
    takeSnapshot,
    getSnapshot,
    restoreSnapshot,
    animate,
    marker,
  };
}

// HUD: cash, health, wanted stars, mission text, speed, minimap, crosshair,
// title / pause / WASTED overlays. All DOM — the 3D canvas stays clean.

export function createHud() {
  const root = document.getElementById('hud');
  root.innerHTML = `
    <div id="hud-top-left">
      <div id="hud-cash">$250</div>
      <div id="hud-health"><div id="hud-health-fill"></div></div>
      <div id="hud-hint">WASD move &middot; E steal car &middot; Click/F shoot &middot; M mute &middot; P pause</div>
    </div>
    <div id="hud-top-right"><div id="hud-wanted"></div><div id="hud-spotted-wrap"><span>SPOTTED</span><div id="hud-spotted"><div id="hud-spotted-fill"></div></div></div></div>
    <div id="hud-mission"><div id="hud-mission-title"></div><div id="hud-mission-text"></div></div>
    <div id="hud-speed"></div>
    <canvas id="hud-minimap" width="180" height="180"></canvas>
    <div id="hud-crosshair">+</div>
    <div id="hud-toast"></div>
    <div id="hud-overlay"><div id="hud-overlay-title">SOLMARIS</div><div id="hud-overlay-sub"></div><div id="hud-overlay-hint"></div></div>
  `;
  const cashEl = document.getElementById('hud-cash');
  const healthFill = document.getElementById('hud-health-fill');
  const wantedEl = document.getElementById('hud-wanted');
  const spottedWrap = document.getElementById('hud-spotted-wrap');
  const spottedFill = document.getElementById('hud-spotted-fill');
  const missionTitle = document.getElementById('hud-mission-title');
  const missionText = document.getElementById('hud-mission-text');
  const speedEl = document.getElementById('hud-speed');
  const minimap = document.getElementById('hud-minimap');
  const mm = minimap.getContext('2d');
  const toastEl = document.getElementById('hud-toast');
  const overlay = document.getElementById('hud-overlay');
  const overlayTitle = document.getElementById('hud-overlay-title');
  const overlaySub = document.getElementById('hud-overlay-sub');
  const overlayHint = document.getElementById('hud-overlay-hint');
  const crosshair = document.getElementById('hud-crosshair');

  let toastTimer = 0;

  function toast(message, ms = 2600) {
    toastEl.textContent = message;
    toastEl.style.opacity = '1';
    toastTimer = ms;
  }

  function showOverlay(title, sub, hint) {
    overlay.style.display = 'flex';
    overlayTitle.textContent = title;
    overlaySub.textContent = sub;
    overlayHint.textContent = hint;
  }

  function hideOverlay() {
    overlay.style.display = 'none';
  }

  function drawMinimap(state) {
    const S = 180;
    const half = 280;
    const toMap = (x, z) => [((x + half) / (half * 2)) * S, ((z + half) / (half * 2)) * S];
    mm.clearRect(0, 0, S, S);
    mm.fillStyle = '#20242e';
    mm.fillRect(0, 0, S, S);
    // Water rim.
    mm.fillStyle = '#1d4e6b';
    mm.fillRect(0, 0, S, 6);
    mm.fillRect(0, S - 6, S, 6);
    mm.fillRect(0, 0, 6, S);
    mm.fillRect(S - 6, 0, 6, S);
    // Roads.
    mm.strokeStyle = '#55555f';
    mm.lineWidth = 3;
    for (const x of [-180, -120, -60, 0, 60, 120, 180]) {
      const [mx] = toMap(x, 0);
      mm.beginPath();
      mm.moveTo(mx, 0);
      mm.lineTo(mx, S);
      mm.stroke();
    }
    for (const z of [-240, -180, -120, -60, 0, 60, 120, 180, 240]) {
      const [, mz] = toMap(0, z);
      mm.beginPath();
      mm.moveTo(0, mz);
      mm.lineTo(S, mz);
      mm.stroke();
    }
    // Garage.
    const [gx, gz] = toMap(175, -105);
    mm.fillStyle = '#ffe14d';
    mm.fillRect(gx - 4, gz - 4, 8, 8);
    // Mission marker.
    if (state.marker) {
      const [mx, mz] = toMap(state.marker.x, state.marker.z);
      mm.fillStyle = '#ffe14d';
      mm.beginPath();
      mm.arc(mx, mz, 5, 0, Math.PI * 2);
      mm.fill();
      mm.strokeStyle = '#000';
      mm.lineWidth = 1;
      mm.stroke();
    }
    // Police.
    mm.fillStyle = '#ff4444';
    for (const p of state.police) {
      const [px, pz] = toMap(p.x, p.z);
      mm.beginPath();
      mm.arc(px, pz, 3.5, 0, Math.PI * 2);
      mm.fill();
    }
    if (state.heli) {
      const [hx, hz] = toMap(state.heli.x, state.heli.z);
      mm.fillStyle = '#ff8844';
      mm.beginPath();
      mm.arc(hx, hz, 4.5, 0, Math.PI * 2);
      mm.fill();
    }
    // Player arrow.
    const [px, pz] = toMap(state.playerX, state.playerZ);
    mm.save();
    mm.translate(px, pz);
    mm.rotate(Math.atan2(Math.sin(state.heading), Math.cos(state.heading)) + Math.PI);
    mm.fillStyle = '#35d0ff';
    mm.beginPath();
    mm.moveTo(0, -7);
    mm.lineTo(5, 6);
    mm.lineTo(-5, 6);
    mm.closePath();
    mm.fill();
    mm.restore();
  }

  function update(state, dt) {
    cashEl.textContent = `$${state.cash}`;
    healthFill.style.width = `${Math.max(0, state.health)}%`;
    healthFill.style.background = state.health > 50 ? '#4caf50' : state.health > 25 ? '#ff9800' : '#f44336';
    wantedEl.textContent = state.wanted > 0 ? '★'.repeat(state.wanted) + '☆'.repeat(Math.max(0, 3 - state.wanted)) : '';
    wantedEl.style.color = state.wanted >= 3 ? '#ff4444' : '#ffd54f';
    spottedWrap.style.display = state.heli ? 'block' : 'none';
    spottedFill.style.width = `${Math.round((state.spotted ?? 0) * 100)}%`;
    if (state.missionName) {
      missionTitle.textContent = `MISSION ${state.missionIndex + 1}: ${state.missionName}`;
      missionText.textContent = state.missionText + (state.missionDist != null ? `  •  ${Math.round(state.missionDist)}m` : '');
    } else {
      missionTitle.textContent = 'ALL MISSIONS COMPLETE';
      missionText.textContent = 'Free roam — Solmaris is yours.';
    }
    speedEl.textContent = state.inCar ? `${Math.round(Math.abs(state.speed) * 3.6)} km/h` : '';
    crosshair.style.display = state.screen === 'play' ? 'block' : 'none';
    if (toastTimer > 0) {
      toastTimer -= dt * 1000;
      if (toastTimer <= 0) toastEl.style.opacity = '0';
    }
    drawMinimap(state);
  }

  return { update, toast, showOverlay, hideOverlay };
}

// Screenshot staging: ?shot=start|play|chase|mission stages a real scene of
// the running game (no fake renders), paints it twice and sets
// window.__shotReady. Each shot shows a different system at its best.

export function stageShot(game, name, api) {
  const { startGame, player, missions, heli, police, guards, setWanted, teleport } = api;

  function ready() {
    let painted = 0;
    function paint() {
      api.renderer.render(api.scene, api.camera);
      painted += 1;
      if (painted < 2) requestAnimationFrame(paint);
      else window.__shotReady = true;
    }
    requestAnimationFrame(paint);
  }

  function paintHud(screen = 'play') {
    // In shot mode the game loop never runs, so paint the HUD once by hand.
    const pos = game.currentCar
      ? { x: game.currentCar.x, z: game.currentCar.z }
      : { x: player.pos.x, z: player.pos.z };
    const mStep = missions.currentStep();
    api.hud.update({
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
      speed: game.currentCar ? game.currentCar.speed : 0,
      screen,
    }, 0.016);
  }

  function playThen(fn) {
    // Boot the loop without the title screen, then stage the scene.
    startGame(false);
    game.screen = 'play';
    fn();
    paintHud();
    // Let the world settle one frame, then paint.
    requestAnimationFrame(() => requestAnimationFrame(ready));
  }

  if (name === 'start') {
    // Title screen over a slow city orbit: reuse the normal title path.
    api.showTitle();
    paintHud('title');
    let painted = 0;
    function paint() {
      api.renderer.render(api.scene, api.camera);
      painted += 1;
      if (painted < 2) requestAnimationFrame(paint);
      else window.__shotReady = true;
    }
    // Park the camera on a postcard view of the sunset skyline.
    api.camera.position.set(-140, 55, 190);
    api.camera.lookAt(0, 12, -40);
    requestAnimationFrame(paint);
    return;
  }

  if (name === 'play') {
    playThen(() => {
      // Driving north up the avenue in a stolen car, mission 1 live.
      const car = api.cars.nearestCar(8, 45, 30);
      teleport(8, 45);
      if (car) {
        game.currentCar = car;
        car.occupied = true;
        car.stolen = true;
        player.group.visible = false;
        car.speed = 12;
        car.heading = Math.PI;
      }
      api.updateCamera(1);
    });
    return;
  }

  if (name === 'chase') {
    playThen(() => {
      // Wanted 3 at the garage mouth: the player, the garage, police closing
      // in, and the helicopter with its searchlight overhead, all in frame.
      teleport(146, -105);
      player.heading = Math.PI / 2;
      setWanted(3);
      heli.state.spotted = 0.45;
      // Park the helicopter close overhead for the shot (it spawns far out).
      heli.state.x = 152;
      heli.state.z = -122;
      heli.group.position.set(152, 55, -122);
      const pos = { x: 146, z: -105 };
      police.update(0.5, pos, 3, 1, () => {});
      api.updateCamera(1);
      // Wide shot: player at the garage mouth, heli and light cone in the sky.
      api.camera.position.set(114, 8, -140);
      api.camera.lookAt(158, 20, -106);
    });
    return;
  }

  if (name === 'mission') {
    playThen(() => {
      // On foot north of the Marina pickup, facing south at the mission
      // marker pillar with the sunset avenue ahead.
      teleport(60, 156);
      player.heading = 0;
      missions.startMission(0);
      api.updateCamera(1);
    });
    return;
  }

  // Unknown shot name: fall back to the title.
  api.showTitle();
  ready();
}

// Entry point: builds the pieces and runs the fixed-timestep loop.
(function () {
  'use strict';

  const canvas = document.getElementById('board');
  const cfg = window.CONFIG;
  const camera = Camera.create(canvas);
  const renderer = Renderer.create(canvas);

  let ui = null;
  const game = Game.create({
    cfg, camera,
    onState: (s, g) => ui && ui.onState(s, g),
    onSign: (sign, zone) => ui && ui.onSign(sign, zone),
    onResult: r => ui && ui.onResult(r),
  });
  renderer.resize();
  ui = UI.create(game);
  camera.snap();
  camera.enableManualControls();

  const STEP = 1000 / 60;
  let last = performance.now();
  let acc = 0;

  function frame(now) {
    let dt = now - last;
    last = now;
    if (dt > 250) dt = 250; // tab was hidden; don't try to catch up forever
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      Matter.Engine.update(game.engine, STEP);
      game.afterStep(STEP / 1000);
      acc -= STEP;
      steps++;
    }
    if (steps === 5) acc = 0;

    game.updateCamera();
    camera.update(dt / 1000);

    renderer.draw({
      layout: game.layout, cfg, camera,
      zones: game.zones, labels: game.labels, sign: game.sign,
      ball: game.previewBall(), trail: game.trail,
      winningBin: game.winningBin, activeZone: game.activeZone,
      time: game.time,
    });
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', () => renderer.resize());
  requestAnimationFrame(frame);

  // Handy for poking at things from the console.
  window.plinko = { game, camera, cfg, ui };
})();

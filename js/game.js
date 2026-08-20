// Run state machine: ready -> dropping -> falling -> landed.
// Each run draws the bin order, the zone signs and the launch point from a
// seeded RNG, so every (option, sign) pair is equally likely by symmetry.
(function (global) {
  'use strict';
  const { Engine, Events, Body } = Matter;

  function create({ cfg, camera, onSign, onResult, onState }) {
    const engine = Engine.create({ gravity: { x: 0, y: cfg.gravity } });
    engine.positionIterations = 8;
    engine.velocityIterations = 6;

    const game = {
      state: 'idle',
      options: [],
      layout: null,
      board: null,
      rng: null,
      seed: null,
      labels: [],
      zones: [],
      launch: null,
      sign: null,
      activeZone: null,
      winningBin: null,
      result: null,
      trail: [],
      time: 0,
      dropTimer: 0,
      restCount: 0,
      stuckCount: 0,
      binTime: 0,
    };

    function setState(s) {
      game.state = s;
      onState && onState(s, game);
    }

    function setOptions(options) {
      game.options = options.slice();
      game.layout = Layout.build(game.options.length, cfg);
    }

    // Build a fresh board for `seed` and show it without a ball.
    function prepare(seed) {
      if (game.board) game.board.destroy();
      game.seed = seed;
      game.rng = RNG.createRng(seed);
      game.labels = game.rng.shuffle(game.options);
      game.zones = game.layout.makeZones(game.rng);
      game.launch = game.layout.launchPoint(game.rng);
      game.board = Board.create(engine, game.layout, cfg, game.zones);
      game.sign = null;
      game.activeZone = null;
      game.winningBin = null;
      game.result = null;
      game.trail = [];
      game.restCount = 0;
      game.stuckCount = 0;
      game.binTime = 0;
      camera.manual = false;
      camera.fitRect(0, 0, game.layout.width, game.layout.height, 60);
      setState('ready');
    }

    function followZoom() {
      const { sw } = camera.screenSize();
      // Show roughly 14 bins across the screen, clamped to something sensible.
      return Math.min(1.3, Math.max(0.55, sw / (14 * cfg.binWidth)));
    }

    function drop() {
      if (game.state !== 'ready') return;
      camera.manual = false;
      camera.posRate = 2.2; camera.zoomRate = 2.2;
      camera.followPoint(game.launch.x, game.launch.y, followZoom(), game.layout);
      game.dropTimer = 1.4;
      setState('dropping');
    }

    function spawn() {
      const { x, y, vx } = game.launch;
      game.board.spawnBall(x, y, vx);
      camera.posRate = 6; camera.zoomRate = 3;
      setState('falling');
    }

    Events.on(engine, 'collisionStart', ev => {
      if (game.state !== 'falling' || game.sign) return;
      const ball = game.board.ball;
      for (const pair of ev.pairs) {
        const other = pair.bodyA === ball ? pair.bodyB : pair.bodyB === ball ? pair.bodyA : null;
        if (other && other.label === 'zone') {
          captureSign(game.layout.zoneAt(game.zones, ball.position.x));
          break;
        }
      }
    });

    function captureSign(zone) {
      game.sign = zone.sign;
      game.activeZone = zone;
      onSign && onSign(zone.sign, zone);
    }

    // Called once per fixed physics step, after Engine.update.
    function afterStep(dt) {
      game.time += dt;
      if (game.state === 'dropping') {
        game.dropTimer -= dt;
        if (game.dropTimer <= 0) spawn();
        return;
      }
      if (game.state !== 'falling') return;

      const ball = game.board.ball;
      const p = ball.position;
      const layout = game.layout;

      game.board.updatePegWindow(p.x);
      game.trail.push({ x: p.x, y: p.y });
      if (game.trail.length > 14) game.trail.shift();

      // Belt and braces: if we somehow passed the zone row without a contact event.
      if (!game.sign && p.y > layout.zoneBottom + cfg.ballRadius) {
        captureSign(layout.zoneAt(game.zones, p.x));
      }

      const speed = ball.speed;
      // Once the ball is this deep it can no longer hop a divider, so the bin is decided.
      const inBin = p.y > layout.binTop + cfg.ballRadius * 3;
      if (inBin) {
        game.binTime += dt;
        game.restCount = speed < cfg.restSpeed ? game.restCount + 1 : 0;
        if (game.restCount >= cfg.restFrames || game.binTime >= cfg.maxBinSeconds) land();
      } else {
        // Nudge a ball that has balanced on a peg or divider top.
        game.stuckCount = speed < cfg.stuckSpeed ? game.stuckCount + 1 : 0;
        if (game.stuckCount >= cfg.stuckFrames) {
          game.stuckCount = 0;
          const dir = game.rng.bool() ? 1 : -1;
          Body.setVelocity(ball, { x: dir * 1.5, y: -1 });
        }
      }
    }

    function land() {
      const ball = game.board.ball;
      const bin = game.layout.binIndexAt(ball.position.x);
      game.winningBin = bin;
      const option = game.labels[bin];
      game.result = {
        seed: game.seed,
        sign: game.sign,
        option,
        bin,
        text: (game.sign === '+' ? '+' : '−') + option,
      };
      const b = game.layout.binRect(bin);
      camera.manual = false;
      camera.posRate = 3; camera.zoomRate = 2;
      camera.fitRect(b.x - 3 * b.w, b.y - 260, 7 * b.w, b.h + 320, 40);
      setState('landed');
      onResult && onResult(game.result);
    }

    function updateCamera() {
      if (camera.manual) return;
      if (game.state === 'falling' && game.board.ball) {
        const p = game.board.ball.position;
        camera.followPoint(p.x, p.y, followZoom(), game.layout);
      }
    }

    function showOverview() {
      camera.manual = false;
      camera.posRate = 3; camera.zoomRate = 2.5;
      camera.fitRect(0, 0, game.layout.width, game.layout.height, 60);
    }

    return Object.assign(game, {
      engine, setOptions, prepare, drop, afterStep, updateCamera, showOverview,
      previewBall() {
        // A fake body-like object so the renderer can show the ball before launch.
        if (game.state === 'ready' || game.state === 'dropping') {
          return { position: { x: game.launch.x, y: game.launch.y } };
        }
        return game.board && game.board.ball;
      },
    });
  }

  global.Game = { create };
})(window);

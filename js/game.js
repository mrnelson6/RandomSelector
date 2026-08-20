// Run state machine: ready -> aiming -> falling -> landed.
// Each run draws the bin order, category order, zone signs and cannon shots
// from a seeded RNG. Each ball gets its own sign from the zone it falls through.
(function (global) {
  'use strict';
  const { Engine, Events, Body } = Matter;

  const MINUS = '−';

  // Split an outcome into displayable parts. sign is '+', '-' or null (unknown yet).
  //   { head: '' | '+' | '−',  name: label,  tail: '' | '+0.04' | '−0.04' | '±0.04',  text }
  function formatParts(option, sign, hasZones) {
    const s = sign === '-' ? MINUS : sign === '+' ? '+' : null;
    let head = '', tail = '';
    if (option.value != null && option.value !== '') {
      tail = (hasZones ? (s || '±') : '+') + option.value;
    } else if (hasZones && s) {
      head = s;
    }
    const text = head + option.label + (tail ? ' ' + tail : '');
    return { head, name: option.label, tail, text };
  }
  function formatResult(option, sign, hasZones) {
    return formatParts(option, sign, hasZones).text;
  }

  function create({ cfg, camera, onSign, onResult, onState }) {
    const engine = Engine.create({ gravity: { x: 0, y: cfg.gravity } });
    engine.positionIterations = 8;
    engine.velocityIterations = 6;

    const game = {
      state: 'idle',
      settings: { ...global.DEFAULT_SETTINGS },
      options: [],
      layout: null,
      board: null,
      arrangement: null,
      rng: null,
      seed: null,
      zones: [],
      launch: null,
      shots: [],
      balls: [],
      results: [],
      cannon: { x: 0, angle: 0, targetAngle: 0, flash: 0, fromX: 0 },
      aimTimer: 0,
      shotTimer: 0,
      time: 0,
    };

    function setState(s) {
      game.state = s;
      onState && onState(s, game);
    }

    function setOptions(options) {
      game.options = options.map(o => ({
        label: String(o.label || '').trim(),
        value: o.value != null && o.value !== '' ? String(o.value) : null,
        category: o.category ? String(o.category).trim() : null,
      })).filter(o => o.label);
    }
    function hasCategoryData() { return game.options.some(o => o.category); }
    function setSettings(s) {
      game.settings = { ...game.settings, ...s };
      game.settings.balls = Math.min(10, Math.max(1, game.settings.balls | 0 || 1));
      game.settings.rows = Math.min(200, Math.max(12, game.settings.rows | 0 || 90));
    }

    // Build a fresh board for `seed` and show it with the cannon parked.
    function prepare(seed) {
      if (game.board) game.board.destroy();
      game.seed = seed;
      game.rng = RNG.createRng(seed);
      const settings = { ...game.settings, categories: game.settings.categories && hasCategoryData() };
      game.arrangement = Layout.arrange(game.options, game.rng, settings);
      game.layout = Layout.build(game.arrangement.n, cfg, settings, game.arrangement.wallCols);
      game.zones = game.layout.makeZones(game.rng);
      game.launch = game.layout.launchPoint(game.rng);
      game.shots = Array.from({ length: game.settings.balls }, () => game.layout.launchShot(game.rng));
      game.board = Board.create(engine, game.layout, cfg, game.zones);
      game.balls = [];
      game.results = [];
      game.cannon.x = game.cannon.fromX = game.layout.width / 2;
      game.cannon.angle = game.cannon.targetAngle = 0;
      game.cannon.flash = 0;
      camera.manual = false;
      camera.fitRect(0, 0, game.layout.width, game.layout.height, 60);
      setState('ready');
    }

    function followZoom() {
      const { sw } = camera.screenSize();
      return Math.min(1.3, Math.max(0.55, sw / (14 * cfg.binWidth)));
    }

    function drop() {
      if (game.state !== 'ready') return;
      camera.manual = false;
      camera.posRate = 2.4; camera.zoomRate = 2.4;
      camera.followPoint(game.launch.x, game.launch.y + 120, followZoom(), game.layout);
      game.cannon.fromX = game.cannon.x;
      game.cannon.targetAngle = game.shots[0].angle;
      game.aimTimer = 0;
      setState('aiming');
    }

    function fire() {
      const shot = game.shots[game.balls.length];
      const m = game.layout.muzzle(game.launch.x, shot.angle);
      const body = game.board.spawnBall(m.x, m.y,
        Math.sin(shot.angle) * shot.speed, -Math.cos(shot.angle) * shot.speed);
      game.balls.push({
        body, index: game.balls.length, shot,
        sign: null, zone: null, landed: false, result: null,
        trail: [], restCount: 0, binTime: 0, stuckCount: 0,
      });
      game.cannon.flash = 0.25;
      if (game.balls.length < game.shots.length) {
        game.cannon.targetAngle = game.shots[game.balls.length].angle;
        game.shotTimer = cfg.shotInterval;
      }
      if (game.state !== 'falling') {
        camera.posRate = 6; camera.zoomRate = 3;
        setState('falling');
      }
    }

    Events.on(engine, 'collisionStart', ev => {
      if (game.state !== 'falling') return;
      for (const pair of ev.pairs) {
        let ballBody = null, other = null;
        if (pair.bodyA.label === 'ball') { ballBody = pair.bodyA; other = pair.bodyB; }
        else if (pair.bodyB.label === 'ball') { ballBody = pair.bodyB; other = pair.bodyA; }
        if (!ballBody || other.label !== 'zone') continue;
        const ball = game.balls.find(b => b.body === ballBody);
        if (ball && !ball.sign) captureSign(ball, game.layout.zoneAt(game.zones, ballBody.position.x));
      }
    });

    function captureSign(ball, zone) {
      ball.sign = zone.sign;
      ball.zone = zone;
      onSign && onSign(zone.sign, zone, ball);
    }

    function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

    // Called once per fixed physics step, after Engine.update.
    function afterStep(dt) {
      game.time += dt;
      const c = game.cannon;
      c.flash = Math.max(0, c.flash - dt);

      if (game.state === 'aiming') {
        game.aimTimer += dt;
        const t = Math.min(1, game.aimTimer / cfg.aimSeconds);
        c.x = c.fromX + (game.launch.x - c.fromX) * ease(t);
        const at = Math.max(0, (t - 0.55) / 0.45);
        c.angle = c.targetAngle * ease(at);
        if (t >= 1) fire();
        return;
      }
      if (game.state !== 'falling') return;

      // Swing towards the next shot and fire on schedule.
      c.angle += (c.targetAngle - c.angle) * Math.min(1, dt * 6);
      if (game.balls.length < game.shots.length) {
        game.shotTimer -= dt;
        if (game.shotTimer <= 0) fire();
      }

      const layout = game.layout;
      const active = game.balls.filter(b => !b.landed);
      game.board.updatePegWindow(active.map(b => b.body.position.x));

      for (const ball of active) {
        const body = ball.body;
        const p = body.position;
        ball.trail.push({ x: p.x, y: p.y });
        if (ball.trail.length > 14) ball.trail.shift();

        // Belt and braces: if we somehow passed the zone row without a contact event.
        if (layout.hasZones && !ball.sign && p.y > layout.zoneBottom + cfg.ballRadius) {
          captureSign(ball, layout.zoneAt(game.zones, p.x));
        }

        const speed = body.speed;
        // Once the ball is this deep it can no longer hop a divider, so the bin is decided.
        const inBin = p.y > layout.binTop + cfg.ballRadius * 3;
        if (inBin) {
          ball.binTime += dt;
          ball.restCount = speed < cfg.restSpeed ? ball.restCount + 1 : 0;
          if (ball.restCount >= cfg.restFrames || ball.binTime >= cfg.maxBinSeconds) land(ball);
        } else {
          // Nudge a ball that has balanced on a peg or a wall top.
          ball.stuckCount = speed < cfg.stuckSpeed ? ball.stuckCount + 1 : 0;
          if (ball.stuckCount >= cfg.stuckFrames) {
            ball.stuckCount = 0;
            const dir = game.rng.bool() ? 1 : -1;
            Body.setVelocity(body, { x: dir * 1.5, y: -1 });
          }
        }
      }
    }

    function optionAtBin(i) { return game.options[game.arrangement.bins[i]]; }

    function land(ball) {
      const bin = game.layout.binIndexAt(ball.body.position.x);
      const option = optionAtBin(bin);
      ball.landed = true;
      ball.bin = bin;
      ball.result = {
        ballIndex: ball.index, seed: game.seed, sign: ball.sign, option, bin,
        category: game.layout.categoryAt(game.arrangement.categories, bin),
        text: formatResult(option, ball.sign, game.layout.hasZones),
      };
      game.results.push(ball.result);
      if (game.balls.length === game.shots.length && game.balls.every(b => b.landed)) {
        const b = game.layout.binRect(bin);
        camera.manual = false;
        camera.posRate = 3; camera.zoomRate = 2;
        if (game.balls.length === 1) {
          camera.fitRect(b.x - 3 * b.w, b.y - 260, 7 * b.w, b.h + 320, 40);
        } else {
          const xs = game.balls.map(bb => bb.bin * b.w);
          const x0 = Math.min(...xs) - 2 * b.w, x1 = Math.max(...xs) + 3 * b.w;
          camera.fitRect(x0, b.y - 260, x1 - x0, b.h + 320, 40);
        }
        setState('landed');
        onResult && onResult(game.results);
      }
    }

    // The ball the PIP and bin labels refer to: the lowest one still falling,
    // or the most recently landed one.
    function focusBall() {
      const active = game.balls.filter(b => !b.landed);
      if (active.length) return active.reduce((a, b) => (b.body.position.y > a.body.position.y ? b : a));
      return game.balls[game.balls.length - 1] || null;
    }

    // Label shown inside bin i. With a single ball the sign is applied once known.
    function labelFor(i) {
      const option = optionAtBin(i);
      const sign = game.balls.length === 1 ? game.balls[0].sign : null;
      return formatParts(option, sign, game.layout.hasZones);
    }

    // The `count` bins centred under the focus ball, for the PIP panel.
    function binsUnder(count) {
      const ball = focusBall();
      if (!ball) return null;
      const centre = game.layout.binIndexAt(ball.body.position.x);
      const half = Math.floor(count / 2);
      const rows = [];
      for (let i = centre - half; i <= centre + half; i++) {
        if (i < 0 || i >= game.layout.n) { rows.push(null); continue; }
        const option = optionAtBin(i);
        rows.push({
          index: i, option, centre: i === centre,
          text: formatResult(option, ball.sign, game.layout.hasZones),
          category: game.layout.categoryAt(game.arrangement.categories, i),
        });
      }
      return { ball, rows };
    }

    function updateCamera() {
      if (camera.manual) return;
      if (game.state === 'falling') {
        const active = game.balls.filter(b => !b.landed);
        const pts = active.map(b => b.body.position);
        if (pts.length) camera.followPoints(pts, followZoom(), 0.3, game.layout);
      }
    }

    function showOverview() {
      camera.manual = false;
      camera.posRate = 3; camera.zoomRate = 2.5;
      camera.fitRect(0, 0, game.layout.width, game.layout.height, 60);
    }

    return Object.assign(game, {
      engine, setOptions, setSettings, hasCategoryData, prepare, drop, afterStep, updateCamera,
      showOverview, focusBall, labelFor, binsUnder, optionAtBin,
    });
  }

  global.Game = { create, formatResult, formatParts };
})(window);

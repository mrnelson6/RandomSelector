// Builds Matter.js bodies from the layout. Walls, floor, dividers,
// bumpers, category walls and zone sensors always exist; pegs are only given
// physics bodies in a window of columns around the balls (the renderer draws
// pegs from the layout instead).
(function (global) {
  'use strict';
  const { Bodies, Composite, Body } = Matter;

  function create(engine, layout, cfg, zones) {
    const world = engine.world;
    const statics = Composite.create({ label: 'statics' });
    const pegs = Composite.create({ label: 'pegs' });
    const ballsComp = Composite.create({ label: 'balls' });
    Composite.add(world, [statics, pegs, ballsComp]);

    const t = cfg.wallThickness;
    const staticOpts = { isStatic: true, friction: 0.05, restitution: 0.3 };

    // Side walls (extended far above the board so a cannon shot can fly up
    // without escaping sideways — there is deliberately no ceiling) and floor.
    const sky = 30000;
    Composite.add(statics, [
      Bodies.rectangle(-t / 2, (layout.height - sky) / 2, t, layout.height + sky, { ...staticOpts, label: 'wall' }),
      Bodies.rectangle(layout.width + t / 2, (layout.height - sky) / 2, t, layout.height + sky, { ...staticOpts, label: 'wall' }),
      Bodies.rectangle(layout.width / 2, layout.binBottom + t / 2, layout.width + 2 * t, t, { ...staticOpts, label: 'floor' }),
    ]);

    // Bin dividers (the two outermost coincide with the walls)
    const dividers = [];
    for (let i = 1; i < layout.n; i++) {
      dividers.push(Bodies.rectangle(
        i * cfg.binWidth, layout.binTop + cfg.binDepth / 2,
        cfg.dividerWidth, cfg.binDepth,
        { ...staticOpts, label: 'divider', chamfer: { radius: cfg.dividerWidth / 2 } }
      ));
    }
    Composite.add(statics, dividers);

    // Category walls: from the category band down to the bin floor, in solid
    // segments with openings between them.
    if (layout.hasCategories) {
      const catWalls = [];
      for (const col of layout.walls) {
        for (const seg of layout.wallSegments(col)) {
          catWalls.push(Bodies.rectangle(
            col * cfg.binWidth, (seg.y0 + seg.y1) / 2,
            cfg.categoryWallWidth, seg.y1 - seg.y0,
            { ...staticOpts, label: 'catwall', chamfer: { radius: cfg.categoryWallWidth / 2 } }
          ));
        }
      }
      Composite.add(statics, catWalls);
    }

    // Pinball bumpers in the launch area
    Composite.add(statics, layout.bumpers.map(b => Bodies.circle(b.x, b.y, b.r, {
      isStatic: true, label: 'bumper', restitution: cfg.bumperRestitution, friction: 0,
    })));

    // Zone sensors
    const zoneBodies = zones.map(z => {
      const b = Bodies.rectangle(
        (z.x0 + z.x1) / 2, layout.zoneY, z.x1 - z.x0, cfg.zoneHeight,
        { isStatic: true, isSensor: true, label: 'zone' }
      );
      b.plugin.zone = z;
      return b;
    });
    Composite.add(statics, zoneBodies);

    // ---- Peg windowing -------------------------------------------------
    const loadedCols = new Map(); // col -> [bodies]

    const spinners = new Set();

    function makePegBody(peg) {
      switch (peg.kind) {
        case 'bouncy':
          return Bodies.circle(peg.x, peg.y, peg.r, { ...staticOpts, label: 'bouncy', restitution: cfg.specials.bouncy.restitution, friction: 0 });
        case 'spinner': {
          const sp = cfg.specials.spinner;
          const a = Bodies.rectangle(peg.x, peg.y, sp.arm * 2, sp.thickness);
          const b = Bodies.rectangle(peg.x, peg.y, sp.thickness, sp.arm * 2);
          const body = Body.create({ parts: [a, b], isStatic: true, label: 'spinner', friction: 0.05, restitution: 0.5 });
          body.plugin.spin = { phase: peg.phase, dir: peg.dir };
          return body;
        }
        case 'bump':
          return Bodies.circle(peg.x, peg.y, peg.r, { ...staticOpts, label: 'bump', restitution: 0.8, friction: 0 });
        default:
          return Bodies.circle(peg.x, peg.y, peg.r, { ...staticOpts, label: peg.kind, restitution: 0.4 });
      }
    }

    function pegBodiesForCol(k) {
      const out = [];
      for (let r = 0; r < layout.rows; r++) {
        const count = layout.pegCountInRow(r);
        const cols = [k];
        if (k === layout.n - 1 && count === layout.n + 1) cols.push(layout.n); // right-edge peg
        for (const c of cols) {
          const peg = layout.pegAt(r, c);
          if (!peg) continue;
          const body = makePegBody(peg);
          if (body.plugin.spin) spinners.add(body);
          out.push(body);
        }
      }
      return out;
    }

    // Rotate the spinner crosses; the renderer uses the same formula.
    function updateSpinners(time) {
      const speed = cfg.specials.spinner.speed;
      for (const body of spinners) {
        const sp = body.plugin.spin;
        Body.setAngle(body, sp.phase + sp.dir * speed * time);
      }
    }

    let lastKey = '';
    function updatePegWindow(xs) {
      const centers = xs.map(x => layout.binIndexAt(x));
      const key = centers.join(',');
      if (key === lastKey) return;
      lastKey = key;
      const wanted = new Set();
      for (const c of centers) {
        for (let k = Math.max(0, c - cfg.pegWindowCols); k <= Math.min(layout.n - 1, c + cfg.pegWindowCols); k++) wanted.add(k);
      }
      for (const [k, bodies] of loadedCols) {
        if (!wanted.has(k)) {
          for (const b of bodies) spinners.delete(b);
          Composite.remove(pegs, bodies);
          loadedCols.delete(k);
        }
      }
      for (const k of wanted) {
        if (!loadedCols.has(k)) {
          const bodies = pegBodiesForCol(k);
          Composite.add(pegs, bodies);
          loadedCols.set(k, bodies);
        }
      }
    }

    // ---- Balls ---------------------------------------------------------
    const balls = [];
    function spawnBall(x, y, vx, vy) {
      const ball = Bodies.circle(x, y, cfg.ballRadius, {
        label: 'ball',
        restitution: cfg.ballRestitution,
        friction: cfg.ballFriction,
        frictionAir: cfg.ballFrictionAir,
        density: 0.002,
      });
      Body.setVelocity(ball, { x: vx, y: vy });
      balls.push(ball);
      updatePegWindow(balls.map(b => b.position.x));
      Composite.add(ballsComp, ball);
      return ball;
    }

    function destroy() {
      Composite.remove(world, [statics, pegs, ballsComp]);
      Composite.clear(statics, false, true);
      Composite.clear(pegs, false, true);
      Composite.clear(ballsComp, false, true);
      loadedCols.clear();
      spinners.clear();
      balls.length = 0;
    }

    return {
      balls, zoneBodies, spawnBall, updatePegWindow, updateSpinners, destroy,
      loadedPegCount: () => Composite.allBodies(pegs).length,
    };
  }

  global.Board = { create };
})(window);

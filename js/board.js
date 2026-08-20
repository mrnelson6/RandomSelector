// Builds Matter.js bodies from the layout. Walls, dividers, floor and zone
// sensors always exist; pegs are only given physics bodies in a window of
// columns around the ball (the renderer draws pegs from the layout instead).
(function (global) {
  'use strict';
  const { Bodies, Composite, Body } = Matter;

  function create(engine, layout, cfg, zones) {
    const world = engine.world;
    const statics = Composite.create({ label: 'statics' });
    const pegs = Composite.create({ label: 'pegs' });
    Composite.add(world, [statics, pegs]);

    const t = cfg.wallThickness;
    const staticOpts = { isStatic: true, friction: 0.05, restitution: 0.3 };

    // Walls and floor
    Composite.add(statics, [
      Bodies.rectangle(-t / 2, layout.height / 2 - 1000, t, layout.height + 4000, { ...staticOpts, label: 'wall' }),
      Bodies.rectangle(layout.width + t / 2, layout.height / 2 - 1000, t, layout.height + 4000, { ...staticOpts, label: 'wall' }),
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

    function pegBodiesForCol(k) {
      const out = [];
      for (let r = 0; r < cfg.pegRows; r++) {
        if (!layout.rowHasPegs(r)) continue;
        const count = layout.pegCountInRow(r);
        const cols = [k];
        if (k === layout.n - 1 && count === layout.n + 1) cols.push(layout.n); // right-edge peg
        for (const c of cols) {
          if (c < 0 || c >= count) continue;
          out.push(Bodies.circle(layout.pegX(r, c), layout.rowY(r), cfg.pegRadius, {
            ...staticOpts, label: 'peg', restitution: 0.4,
          }));
        }
      }
      return out;
    }

    function setPegWindow(centerCol) {
      const lo = Math.max(0, centerCol - cfg.pegWindowCols);
      const hi = Math.min(layout.n - 1, centerCol + cfg.pegWindowCols);
      for (const [k, bodies] of loadedCols) {
        if (k < lo || k > hi) {
          Composite.remove(pegs, bodies);
          loadedCols.delete(k);
        }
      }
      for (let k = lo; k <= hi; k++) {
        if (!loadedCols.has(k)) {
          const bodies = pegBodiesForCol(k);
          Composite.add(pegs, bodies);
          loadedCols.set(k, bodies);
        }
      }
    }

    let lastCenterCol = null;
    function updatePegWindow(x) {
      const col = layout.binIndexAt(x);
      if (col !== lastCenterCol) {
        lastCenterCol = col;
        setPegWindow(col);
      }
    }

    // ---- Ball ----------------------------------------------------------
    let ball = null;
    function spawnBall(x, y, vx) {
      removeBall();
      ball = Bodies.circle(x, y, cfg.ballRadius, {
        label: 'ball',
        restitution: cfg.ballRestitution,
        friction: cfg.ballFriction,
        frictionAir: cfg.ballFrictionAir,
        density: 0.002,
      });
      Body.setVelocity(ball, { x: vx, y: 0 });
      updatePegWindow(x);
      Composite.add(world, ball);
      return ball;
    }
    function removeBall() {
      if (ball) { Composite.remove(world, ball); ball = null; }
    }

    function destroy() {
      removeBall();
      Composite.remove(world, [statics, pegs]);
      Composite.clear(statics, false, true);
      Composite.clear(pegs, false, true);
      loadedCols.clear();
    }

    return {
      get ball() { return ball; },
      zoneBodies, spawnBall, removeBall, updatePegWindow, destroy,
      loadedPegCount: () => Composite.allBodies(pegs).length,
    };
  }

  global.Board = { create };
})(window);

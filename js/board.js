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
    ]);
    // Main floor in segments, leaving the pooled bins open at the bottom
    Composite.add(statics, layout.floorSegments().map(seg => {
      // extend the outer segments under the side walls, but never into an opening
      const left = seg.x0 === 0 ? -t : seg.x0;
      const right = seg.x1 === layout.width ? layout.width + t : seg.x1;
      return Bodies.rectangle((left + right) / 2, layout.binBottom + t / 2, right - left, t, { ...staticOpts, label: 'floor' });
    }));

    // Mini boards under pooled bins: chute, ceiling, side walls, pegs, dividers, floor
    for (const sub of layout.subBoards) {
      const bodies = [];
      const cw = cfg.dividerWidth;
      const chuteH = sub.top - layout.binBottom;
      bodies.push(Bodies.rectangle(sub.cx - cfg.binWidth / 2, layout.binBottom + chuteH / 2, cw, chuteH, { ...staticOpts, label: 'divider' }));
      bodies.push(Bodies.rectangle(sub.cx + cfg.binWidth / 2, layout.binBottom + chuteH / 2, cw, chuteH, { ...staticOpts, label: 'divider' }));
      const lw = sub.cx - cfg.binWidth / 2 - sub.x0, rw = sub.x1 - (sub.cx + cfg.binWidth / 2);
      if (lw > 0) bodies.push(Bodies.rectangle(sub.x0 + lw / 2, sub.top, lw, cw, { ...staticOpts, label: 'wall' }));
      if (rw > 0) bodies.push(Bodies.rectangle(sub.x1 - rw / 2, sub.top, rw, cw, { ...staticOpts, label: 'wall' }));
      const wallH = sub.binBottom - sub.top;
      bodies.push(Bodies.rectangle(sub.x0, sub.top + wallH / 2, cw, wallH, { ...staticOpts, label: 'wall' }));
      bodies.push(Bodies.rectangle(sub.x1, sub.top + wallH / 2, cw, wallH, { ...staticOpts, label: 'wall' }));
      bodies.push(Bodies.rectangle(sub.cx, sub.binBottom + t / 2, sub.x1 - sub.x0 + 2 * cw, t, { ...staticOpts, label: 'floor' }));
      for (let j = 1; j < sub.k; j++) {
        bodies.push(Bodies.rectangle(sub.x0 + j * cfg.binWidth, sub.binTop + cfg.subBinDepth / 2, cw, cfg.subBinDepth,
          { ...staticOpts, label: 'divider', chamfer: { radius: cw / 2 } }));
      }
      for (let r = 0; r < sub.rows; r++) {
        for (let c = 0; c < sub.pegCountInRow(r); c++) {
          const peg = sub.pegAt(r, c);
          if (peg) bodies.push(makePegBody(peg));
        }
      }
      Composite.add(statics, bodies);
    }

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
    // Bodies exist only for peg cells (row, col) near a ball. Keyed per cell so
    // the loaded set is a few hundred bodies even with 40 balls scattered
    // across the board (the broadphase chokes on thousands of same-x pegs).
    const loaded = new Map(); // cellKey -> body
    const spinners = new Set();
    const cellKey = (r, c) => r * (layout.n + 2) + c;

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
        case 'flip':
          return Bodies.circle(peg.x, peg.y, peg.r, { ...staticOpts, label: 'flip', restitution: 0.5 });
        case 'teleport': {
          // A sensor: the ball passes into the portal and is moved to the partner.
          const body = Bodies.circle(peg.x, peg.y, peg.r, { isStatic: true, isSensor: true, label: 'teleport' });
          body.plugin.tp = { pair: peg.pair, partner: peg.partner, color: peg.color };
          return body;
        }
        default:
          return Bodies.circle(peg.x, peg.y, peg.r, { ...staticOpts, label: peg.kind, restitution: 0.4 });
      }
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
    function updatePegWindow(positions) {
      const cells = positions.map(p => ({
        c: layout.binIndexAt(p.x),
        r: Math.floor((p.y - cfg.topPadding) / cfg.rowHeight),
      }));
      const key = cells.map(k => k.r + ':' + k.c).join(',');
      if (key === lastKey) return;
      lastKey = key;

      const wanted = new Set();
      const wc = cfg.pegWindowCols, wr = cfg.pegWindowRows;
      for (const { c, r } of cells) {
        const r0 = Math.max(0, r - wr), r1 = Math.min(layout.rows - 1, r + wr);
        for (let rr = r0; rr <= r1; rr++) {
          const count = layout.pegCountInRow(rr);
          // bin col k is flanked by aligned pegs k and k+1, hence the +1
          const c0 = Math.max(0, c - wc), c1 = Math.min(count - 1, c + wc + 1);
          for (let cc = c0; cc <= c1; cc++) wanted.add(cellKey(rr, cc));
        }
      }
      const toRemove = [];
      for (const [k, body] of loaded) {
        if (!wanted.has(k)) { if (body) { toRemove.push(body); spinners.delete(body); } loaded.delete(k); }
      }
      if (toRemove.length) Composite.remove(pegs, toRemove);
      const toAdd = [];
      for (const k of wanted) {
        if (loaded.has(k)) continue;
        const r = Math.floor(k / (layout.n + 2)), c = k % (layout.n + 2);
        const peg = layout.pegAt(r, c);
        if (!peg) { loaded.set(k, null); continue; } // remember empty cells too
        const body = makePegBody(peg);
        if (body.plugin.spin) spinners.add(body);
        loaded.set(k, body);
        toAdd.push(body);
      }
      if (toAdd.length) Composite.add(pegs, toAdd);
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
      updatePegWindow(balls.map(b => b.position));
      Composite.add(ballsComp, ball);
      return ball;
    }

    function destroy() {
      Composite.remove(world, [statics, pegs, ballsComp]);
      Composite.clear(statics, false, true);
      Composite.clear(pegs, false, true);
      Composite.clear(ballsComp, false, true);
      loaded.clear();
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

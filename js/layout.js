// Pure geometry and per-run arrangement for the board. Nothing here touches
// Matter.js or the canvas, so the renderer, the physics layer and the headless
// test harness can all share it.
(function (global) {
  'use strict';

  const TELEPORT_COLORS = [
    '#ff3864', '#2de2e6', '#f9c80e', '#ff6c11', '#7b61ff', '#3ddc84',
    '#ff85e0', '#00b3ff', '#c3f73a', '#ff9f1c', '#b388ff', '#00e5a8',
  ];
  const TELEPORT_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

  const CATEGORY_COLORS = [
    '#4f8cff', '#ff7a59', '#3ddc84', '#c77dff', '#ffd166',
    '#06d6a0', '#ef476f', '#48cae4', '#f4a261', '#b5e48c',
  ];

  // Decide which option goes in which bin for this run.
  // With categories on, options are grouped into contiguous blocks (random
  // block order, random order inside each block). Otherwise one flat shuffle.
  function arrange(options, rng, settings) {
    const n = options.length;
    const useCats = settings.categories && options.some(o => o.category);
    if (!useCats) {
      const bins = rng.shuffle(options.map((_, i) => i));
      return { n, bins, categories: [], wallCols: new Set() };
    }
    const groups = new Map();
    options.forEach((o, i) => {
      const key = o.category || 'Other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    });
    const names = rng.shuffle([...groups.keys()]);
    // Colours are assigned by the data's own category order so they stay stable run to run.
    const colorIndex = new Map([...groups.keys()].map((k, i) => [k, i]));
    const bins = [];
    const categories = [];
    const wallCols = new Set();
    for (const name of names) {
      const members = rng.shuffle(groups.get(name));
      const start = bins.length;
      bins.push(...members);
      categories.push({
        name, start, end: bins.length, count: members.length,
        color: CATEGORY_COLORS[colorIndex.get(name) % CATEGORY_COLORS.length],
      });
      if (bins.length < n) wallCols.add(bins.length);
    }
    return { n, bins, categories, wallCols };
  }

  function build(optionCount, cfg, settings, wallCols) {
    const n = Math.max(1, optionCount);
    const w = cfg.binWidth;
    const rows = Math.max(12, settings.rows | 0);
    const width = n * w;
    const lastRowY = cfg.topPadding + (rows - 1) * cfg.rowHeight;
    const binTop = lastRowY + cfg.rowHeight * 0.5;
    const binBottom = binTop + cfg.binDepth;
    const height = binBottom;
    const walls = wallCols || new Set();

    const hasZones = !!settings.signs;
    const hasCategories = walls.size > 0;
    const zoneRow = hasZones ? Math.round(rows * cfg.zoneRowFrac) : -1;
    let categoryRow = hasCategories ? Math.round(rows * cfg.categoryRowFrac) : -1;
    if (categoryRow === zoneRow) categoryRow++;
    const zoneY = cfg.topPadding + zoneRow * cfg.rowHeight;
    const categoryY = cfg.topPadding + categoryRow * cfg.rowHeight;
    const categoryBandH = cfg.rowHeight * 0.95;
    const categoryTop = categoryY - categoryBandH / 2;

    // Rows alternate offsets; the last row is aligned with the dividers so the
    // final pegs sit directly above each divider and funnel the ball into a bin.
    function rowOffset(r) {
      return ((rows - 1 - r) % 2 === 0) ? 0 : w * 0.5;
    }
    function rowY(r) { return cfg.topPadding + r * cfg.rowHeight; }
    function rowHasPegs(r) { return r !== zoneRow && r !== categoryRow; }
    function pegCountInRow(r) { return rowOffset(r) === 0 ? n + 1 : n; }
    function pegX(r, c) { return rowOffset(r) + c * w; }
    function belowCategoryBand(r) { return hasCategories && r > categoryRow; }
    function nearWall(c) { return walls.has(c) || walls.has(c + 1) || walls.has(c - 1); }

    // ---- Per-run randomness: special pegs, wall openings, wall bumper kinds ----
    const specials = new Map();   // key(r, c) -> { kind, phase, dir, pair? }
    const wallGaps = new Map();   // wall col -> Set of rows where the wall is open
    const wallBouncy = new Set(); // key(r, col) of wall bumps that are super-bouncy
    const teleporters = [];       // [{ color, letter, ends: [{r, c, x, y}, {r, c, x, y}] }]
    const key = (r, c) => r * (n + 2) + c;
    // First row where a ball is guaranteed to have its sign
    const belowBandRow = hasZones ? zoneRow + 2 : 2;

    function crowded(r, c) {
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++)
          if ((dr || dc) && specials.has(key(r + dr, c + dc))) return true;
      return false;
    }

    function assignTeleporters(rng) {
      teleporters.length = 0;
      const cands = [];
      for (let r = belowBandRow; r < rows - 3; r++) {
        if (!rowHasPegs(r) || Math.abs(r - categoryRow) <= 1) continue;
        const count = pegCountInRow(r);
        for (let c = 2; c < count - 2; c++) {
          if (hasCategories && nearWall(c)) continue;
          cands.push({ r, c });
        }
      }
      const pool = rng.shuffle(cands);
      const minApart = cfg.teleportMinBinsApart;
      let totalPegs = 0;
      for (let r = 0; r < rows; r++) if (rowHasPegs(r)) totalPegs += pegCountInRow(r);
      const pairsWanted = Math.min(cfg.teleportMaxPairs, Math.max(cfg.teleportMinPairs,
        Math.round(totalPegs / 1000 * cfg.teleportPairsPer1000Pegs)));
      let pi = 0;
      for (let pair = 0; pair < pairsWanted && pi < pool.length; pair++) {
        let a = null, b = null;
        while (pi < pool.length && !a) { const p = pool[pi++]; if (!specials.has(key(p.r, p.c)) && !crowded(p.r, p.c)) a = p; }
        if (!a) break;
        specials.set(key(a.r, a.c), { kind: 'teleport', pair });
        for (let j = pi; j < pool.length && !b; j++) {
          const p = pool[j];
          if (Math.abs(p.c - a.c) < minApart || specials.has(key(p.r, p.c)) || crowded(p.r, p.c)) continue;
          b = p;
        }
        if (!b) { specials.delete(key(a.r, a.c)); break; }
        specials.set(key(b.r, b.c), { kind: 'teleport', pair });
        const mk = p => ({ r: p.r, c: p.c, x: rowOffset(p.r) + p.c * w, y: rowY(p.r) });
        teleporters.push({
          pair, color: TELEPORT_COLORS[pair % TELEPORT_COLORS.length],
          letter: TELEPORT_LETTERS[pair % TELEPORT_LETTERS.length],
          ends: [mk(a), mk(b)],
        });
      }
    }

    function randomize(rng) {
      assignSpecials(rng);
      assignTeleporters(rng);
      wallGaps.clear();
      wallBouncy.clear();
      if (!hasCategories) return;
      for (const col of walls) {
        const gaps = new Set();
        let r = categoryRow + 3;
        while (true) {
          r += rng.int(cfg.wallGapEvery[0], cfg.wallGapEvery[1]);
          if (r + cfg.wallGapRows > rows - 4) break;
          for (let g = 0; g < cfg.wallGapRows; g++) gaps.add(r + g);
        }
        wallGaps.set(col, gaps);
        for (let rr = categoryRow + 1; rr < rows; rr++) {
          if (rowOffset(rr) === 0 && !gaps.has(rr) && rng.next() < cfg.wallBouncyFraction) wallBouncy.add(key(rr, col));
        }
      }
    }
    function wallOpenAt(col, r) {
      const g = wallGaps.get(col);
      return !!(g && g.has(r));
    }
    // Solid pieces of the wall at `col`, as [{ y0, y1 }] from the band down to the floor.
    function wallSegments(col) {
      const segs = [];
      const gaps = wallGaps.get(col);
      let y0 = categoryTop;
      if (gaps) {
        const sorted = [...gaps].sort((a, b) => a - b);
        let i = 0;
        while (i < sorted.length) {
          let j = i;
          while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
          const gy0 = rowY(sorted[i]) - cfg.rowHeight / 2;
          const gy1 = rowY(sorted[j]) + cfg.rowHeight / 2;
          if (gy0 > y0) segs.push({ y0, y1: gy0 });
          y0 = gy1;
          i = j + 1;
        }
      }
      if (binBottom > y0) segs.push({ y0, y1: binBottom });
      return segs;
    }

    function assignSpecials(rng) {
      specials.clear();
      const kinds = Object.entries(cfg.specials);
      const totalW = kinds.reduce((a, [, k]) => a + k.weight, 0);
      const pick = () => {
        let x = rng.next() * totalW;
        for (const [name, k] of kinds) { x -= k.weight; if (x <= 0) return name; }
        return kinds[kinds.length - 1][0];
      };
      for (let r = 2; r < rows - 2; r++) {
        if (!rowHasPegs(r)) continue;
        if (Math.abs(r - zoneRow) <= 1 || Math.abs(r - categoryRow) <= 1) continue;
        const count = pegCountInRow(r);
        for (let c = 1; c < count - 1; c++) {
          if (rng.next() >= cfg.specialPegFraction) continue;
          if (hasCategories && nearWall(c)) continue;
          // Keep specials apart so their larger radii can't form a trap together.
          if (crowded(r, c)) continue;
          let kind = pick();
          if (kind === 'flip' && r < belowBandRow) kind = 'bouncy'; // flips only where the ball already has a sign
          specials.set(key(r, c), { kind, phase: rng.range(0, Math.PI * 2), dir: rng.bool() ? 1 : -1 });
        }
      }
      return specials.size;
    }

    // The peg (if any) at row r, column c:
    //   { x, y, r: radius, kind: 'peg' | 'bump' | 'bouncy' | 'big' | 'spinner', phase?, dir? }
    function pegAt(r, c) {
      if (!rowHasPegs(r) || c < 0 || c >= pegCountInRow(r)) return null;
      const y = rowY(r);
      const off = rowOffset(r);
      let x = off + c * w;
      if (off === 0) {
        // Aligned row on a wall line: a big round bump (or a super-bouncy wall
        // bumper) on the wall; in an opening the wall is absent, so a plain peg.
        if (belowCategoryBand(r) && walls.has(c)) {
          if (wallOpenAt(c, r)) return { x, y, r: cfg.pegRadius, kind: 'peg' };
          if (wallBouncy.has(key(r, c))) return { x, y, r: cfg.wallBouncyRadius, kind: 'bouncy' };
          return { x, y, r: cfg.wallBumpRadius, kind: 'bump' };
        }
      } else if (belowCategoryBand(r)) {
        // Offset row: pegs next to a wall move outwards so a ball can't wedge
        // between wall and peg, and can't fall straight down beside the wall.
        const wallRight = walls.has(c + 1), wallLeft = walls.has(c);
        if (wallLeft && !wallRight) x = c * w + cfg.wallPegShift;
        else if (wallRight && !wallLeft) x = (c + 1) * w - cfg.wallPegShift;
      }
      const sp = specials.get(key(r, c));
      if (sp) {
        if (sp.kind === 'teleport') {
          const tp = teleporters[sp.pair];
          const partner = tp.ends[0].r === r && tp.ends[0].c === c ? tp.ends[1] : tp.ends[0];
          return { x, y, r: cfg.teleportRadius, kind: 'teleport', pair: sp.pair, color: tp.color, letter: tp.letter, partner };
        }
        const def = cfg.specials[sp.kind];
        return { x, y, r: def.radius || def.arm, kind: sp.kind, phase: sp.phase, dir: sp.dir };
      }
      return { x, y, r: cfg.pegRadius, kind: 'peg' };
    }
    function pegExists(r, c) { return pegAt(r, c) !== null; }

    // Columns of row r whose pegs fall inside [x0, x1].
    function pegColRange(r, x0, x1) {
      const off = rowOffset(r);
      const c0 = Math.max(0, Math.floor((x0 - off) / w));
      const c1 = Math.min(pegCountInRow(r) - 1, Math.ceil((x1 - off) / w));
      return [c0, c1];
    }
    function rowRange(y0, y1) {
      const r0 = Math.max(0, Math.floor((y0 - cfg.topPadding) / cfg.rowHeight));
      const r1 = Math.min(rows - 1, Math.ceil((y1 - cfg.topPadding) / cfg.rowHeight));
      return [r0, r1];
    }

    function binIndexAt(x) {
      return Math.min(n - 1, Math.max(0, Math.floor(x / w)));
    }
    function binRect(i) {
      return { x: i * w, y: binTop, w: w, h: cfg.binDepth, cx: i * w + w / 2 };
    }

    // Pinball bumpers in the launch area: staggered rows across the full width.
    const bumpers = [];
    cfg.bumperRows.forEach((y, i) => {
      const step = cfg.bumperSpacingBins * w;
      const offset = (i % 2) * step / 2 + step / 2;
      for (let x = offset; x < width; x += step) bumpers.push({ x, y, r: cfg.bumperRadius });
    });
    function bumpersIn(x0, x1, y0, y1) {
      return bumpers.filter(b => b.x + b.r >= x0 && b.x - b.r <= x1 && b.y + b.r >= y0 && b.y - b.r <= y1);
    }

    // Split the full width into contiguous segments, each randomly + or -.
    // Every column is covered, so a ball always passes through exactly one.
    function makeZones(rng) {
      if (!hasZones) return [];
      const zones = [];
      let start = 0;
      while (start < n) {
        const span = Math.min(rng.int(cfg.zoneMinBins, cfg.zoneMaxBins), n - start);
        const end = start + span;
        zones.push({ start, end, x0: start * w, x1: end * w, sign: rng.bool() ? '+' : '-' });
        start = end;
      }
      // Avoid a lonely sliver at the right edge when there are neighbours.
      if (zones.length > 1 && zones[zones.length - 1].end - zones[zones.length - 1].start < cfg.zoneMinBins) {
        const last = zones.pop();
        zones[zones.length - 1].end = last.end;
        zones[zones.length - 1].x1 = last.x1;
      }
      return zones;
    }

    function zoneAt(zones, x) {
      for (const z of zones) if (x >= z.x0 && x < z.x1) return z;
      return zones[zones.length - 1];
    }

    function categoryAt(categories, binIndex) {
      for (const c of categories) if (binIndex >= c.start && binIndex < c.end) return c;
      return null;
    }

    // Where the cannon parks for this run (shared by all balls in the run).
    function launchPoint(rng) {
      const margin = w * 1.5;
      return { x: rng.range(margin, width - margin), y: cfg.railY };
    }
    // Angle (radians from straight up, +ve = to the right) and speed for one shot.
    function launchShot(rng) {
      const maxA = cfg.cannonMaxAngle * Math.PI / 180;
      return { angle: rng.range(-maxA, maxA), speed: rng.range(cfg.cannonMinSpeed, cfg.cannonMaxSpeed) };
    }
    function muzzle(x, angle) {
      return { x: x + Math.sin(angle) * cfg.barrelLength, y: cfg.railY - Math.cos(angle) * cfg.barrelLength };
    }

    return {
      n, rows, width, height, binTop, binBottom, lastRowY,
      hasZones, hasCategories, walls,
      zoneRow, zoneY, zoneTop: zoneY - cfg.zoneHeight / 2, zoneBottom: zoneY + cfg.zoneHeight / 2,
      categoryRow, categoryY, categoryTop, categoryBandH, categoryBottom: categoryTop + categoryBandH,
      bumpers, bumpersIn,
      rowOffset, rowY, rowHasPegs, pegExists, pegAt, randomize, assignSpecials, specials, teleporters, wallSegments, wallOpenAt, pegCountInRow, pegX, pegColRange, rowRange,
      binIndexAt, binRect, makeZones, zoneAt, categoryAt, launchPoint, launchShot, muzzle,
    };
  }

  global.Layout = { build, arrange, CATEGORY_COLORS, TELEPORT_COLORS };
})(window);

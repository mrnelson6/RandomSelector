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
  // `bins` is a list of slots: either an option index (a normal bin) or
  // { group, members } (a pooled bin with a mini board underneath).
  // With categories on, slots are grouped into contiguous blocks (random
  // block order, random order inside each block). Otherwise one flat shuffle.
  function arrange(options, rng, settings) {
    const useCats = settings.categories && options.some(o => o.category);
    const usePool = settings.pool && options.some(o => o.group);

    // Turn a set of option indices into shuffled slots, pooling groups if enabled.
    function slotsFor(indices) {
      if (!usePool) return rng.shuffle(indices);
      const byGroup = new Map();
      const singles = [];
      for (const i of indices) {
        const g = options[i].group;
        if (g) { if (!byGroup.has(g)) byGroup.set(g, []); byGroup.get(g).push(i); }
        else singles.push(i);
      }
      const slots = rng.shuffle(singles);
      for (const [group, members] of byGroup) {
        if (members.length < 2) { slots.splice(rng.int(0, slots.length), 0, ...members); continue; }
        slots.splice(rng.int(0, slots.length), 0, { group, members: rng.shuffle(members) });
      }
      return slots;
    }

    const blocks = []; // [{ name, indices }]
    if (useCats) {
      const byCat = new Map();
      options.forEach((o, i) => {
        const key = o.category || 'Other';
        if (!byCat.has(key)) byCat.set(key, []);
        byCat.get(key).push(i);
      });
      const colorIndex = new Map([...byCat.keys()].map((k, i) => [k, i]));
      for (const name of rng.shuffle([...byCat.keys()])) {
        blocks.push({ name, indices: byCat.get(name), color: CATEGORY_COLORS[colorIndex.get(name) % CATEGORY_COLORS.length] });
      }
    } else {
      blocks.push({ name: null, indices: options.map((_, i) => i) });
    }

    const bins = [];
    const categories = [];
    const wallCols = new Set();
    for (const b of blocks) {
      const start = bins.length;
      bins.push(...slotsFor(b.indices));
      if (b.name) categories.push({ name: b.name, start, end: bins.length, count: b.indices.length, color: b.color });
    }
    const n = bins.length;
    if (useCats) for (const c of categories) if (c.end < n) wallCols.add(c.end);

    // Pooled slots must keep their mini boards (k bins wide, centred) inside
    // the board and clear of each other. Swap offenders with a plain slot in
    // the same block until it works (or give up after a while).
    if (usePool) {
      const blockOf = i => categories.find(c => i >= c.start && i < c.end) || { start: 0, end: n };
      const half = s => (typeof s === 'object' ? s.members.length / 2 : 0);
      const bad = i => {
        const s = bins[i];
        if (typeof s !== 'object') return false;
        const h = half(s);
        if (i + 0.5 - h < 0 || i + 0.5 + h > n) return true;
        for (let j = 0; j < n; j++) {
          if (j === i || typeof bins[j] !== 'object') continue;
          if (Math.abs(j - i) < h + half(bins[j]) + 1) return true;
        }
        return false;
      };
      for (let tries = 0; tries < 400; tries++) {
        const i = bins.findIndex((_, idx) => bad(idx));
        if (i < 0) break;
        const blk = blockOf(i);
        const j = rng.int(blk.start, blk.end - 1);
        if (typeof bins[j] === 'object') continue;
        [bins[i], bins[j]] = [bins[j], bins[i]];
      }
    }
    return { n, bins, categories, wallCols, pooled: usePool };
  }

  function build(arrangement, cfg, settings) {
    const n = Math.max(1, arrangement.n);
    const w = cfg.binWidth;
    const rows = Math.max(12, settings.rows | 0);
    const width = n * w;
    const lastRowY = cfg.topPadding + (rows - 1) * cfg.rowHeight;
    const binTop = lastRowY + cfg.rowHeight * 0.5;
    const binBottom = binTop + cfg.binDepth;
    const walls = arrangement.wallCols || new Set();
    const slots = arrangement.bins;
    const slotAt = i => slots[i];
    const isPooled = i => typeof slots[i] === 'object';

    // ---- Mini boards under pooled bins ----
    // A pooled bin has no floor: the ball drops through a short chute into a
    // small Plinko board k bins wide (k = group size) with k-1 peg rows, so
    // every sub-bin is reachable, and lands in one of the group's sub-bins.
    const subBoards = [];
    slots.forEach((slot, i) => {
      if (typeof slot !== 'object') return;
      const k = slot.members.length;
      const cx = i * w + w / 2;
      const x0 = cx - k * w / 2, x1 = cx + k * w / 2;
      const top = binBottom + cfg.subChuteH;
      const subRows = Math.max(1, k - 1);
      const rowYs = r => top + cfg.subFirstRowGap + r * cfg.rowHeight;
      const rowOff = r => (((subRows - 1 - r) % 2) === 0) ? 0 : w / 2; // last row aligned with dividers
      const countInRow = r => rowOff(r) === 0 ? k + 1 : k;
      const sBinTop = rowYs(subRows - 1) + cfg.rowHeight * 0.5;
      const sBinBottom = sBinTop + cfg.subBinDepth;
      function subPegAt(r, c) {
        if (r < 0 || r >= subRows || c < 0 || c >= countInRow(r)) return null;
        const off = rowOff(r);
        const y = rowYs(r);
        let x = x0 + off + c * w;
        if (off === 0) {
          if (c === 0 || c === k) return { x, y, r: cfg.wallBumpRadius, kind: 'bump' };
        } else if (c === 0) x = x0 + cfg.wallPegShift;
        else if (c === k - 1) x = x1 - cfg.wallPegShift;
        return { x, y, r: cfg.pegRadius, kind: 'peg' };
      }
      subBoards.push({
        slot: i, group: slot.group, members: slot.members, k, cx, x0, x1, top,
        rows: subRows, rowY: rowYs, rowOffset: rowOff, pegCountInRow: countInRow, pegAt: subPegAt,
        binTop: sBinTop, binBottom: sBinBottom,
        binIndexAt: x => Math.min(k - 1, Math.max(0, Math.floor((x - x0) / w))),
        binRect: j => ({ x: x0 + j * w, y: sBinTop, w, h: cfg.subBinDepth, cx: x0 + j * w + w / 2 }),
      });
    });
    const subBoardBySlot = new Map(subBoards.map(s => [s.slot, s]));
    function subBoardAt(x, y) {
      if (y <= binBottom) return null;
      for (const s of subBoards) if (x >= s.x0 - 8 && x <= s.x1 + 8) return s;
      return null;
    }
    // The main floor, minus the openings under pooled bins.
    function floorSegments() {
      const segs = [];
      let x = 0;
      for (const s of subBoards.slice().sort((a, b) => a.slot - b.slot)) {
        const ox0 = s.slot * w, ox1 = ox0 + w;
        if (ox0 > x) segs.push({ x0: x, x1: ox0 });
        x = ox1;
      }
      if (width > x) segs.push({ x0: x, x1: width });
      return segs;
    }
    const height = subBoards.length ? Math.max(...subBoards.map(s => s.binBottom)) : binBottom;

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
      slots, slotAt, isPooled, subBoards, subBoardBySlot, subBoardAt, floorSegments,
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

// Pure geometry and per-run arrangement for the board. Nothing here touches
// Matter.js or the canvas, so the renderer, the physics layer and the headless
// test harness can all share it.
(function (global) {
  'use strict';

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
    // Aligned pegs that would sit inside a category wall are omitted.
    function pegExists(r, c) {
      if (!rowHasPegs(r)) return false;
      if (hasCategories && r > categoryRow && rowOffset(r) === 0 && walls.has(c)) return false;
      return true;
    }

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
      rowOffset, rowY, rowHasPegs, pegExists, pegCountInRow, pegX, pegColRange, rowRange,
      binIndexAt, binRect, makeZones, zoneAt, categoryAt, launchPoint, launchShot, muzzle,
    };
  }

  global.Layout = { build, arrange, CATEGORY_COLORS };
})(window);

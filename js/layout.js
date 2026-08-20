// Pure geometry for the board. Nothing here touches Matter.js or the canvas,
// so the renderer, the physics layer and any tests can all share it.
(function (global) {
  'use strict';

  function build(optionCount, cfg) {
    const n = Math.max(1, optionCount);
    const w = cfg.binWidth;
    const width = n * w;
    const lastRowY = cfg.topPadding + (cfg.pegRows - 1) * cfg.rowHeight;
    const binTop = lastRowY + cfg.rowHeight * 0.5;
    const binBottom = binTop + cfg.binDepth;
    const height = binBottom;
    const zoneRow = Math.min(cfg.zoneRow, cfg.pegRows - 2);
    const zoneY = cfg.topPadding + zoneRow * cfg.rowHeight;

    // Rows alternate offsets; the last row is aligned with the dividers so the
    // final pegs sit directly above each divider and funnel the ball into a bin.
    function rowOffset(r) {
      return ((cfg.pegRows - 1 - r) % 2 === 0) ? 0 : w * 0.5;
    }
    function rowY(r) { return cfg.topPadding + r * cfg.rowHeight; }
    function rowHasPegs(r) { return r !== zoneRow; }
    function pegCountInRow(r) { return rowOffset(r) === 0 ? n + 1 : n; }
    function pegX(r, c) { return rowOffset(r) + c * w; }

    // Columns of row r whose pegs fall inside [x0, x1].
    function pegColRange(r, x0, x1) {
      const off = rowOffset(r);
      const c0 = Math.max(0, Math.floor((x0 - off) / w));
      const c1 = Math.min(pegCountInRow(r) - 1, Math.ceil((x1 - off) / w));
      return [c0, c1];
    }
    function rowRange(y0, y1) {
      const r0 = Math.max(0, Math.floor((y0 - cfg.topPadding) / cfg.rowHeight));
      const r1 = Math.min(cfg.pegRows - 1, Math.ceil((y1 - cfg.topPadding) / cfg.rowHeight));
      return [r0, r1];
    }

    function binIndexAt(x) {
      return Math.min(n - 1, Math.max(0, Math.floor(x / w)));
    }
    function binRect(i) {
      return { x: i * w, y: binTop, w: w, h: cfg.binDepth, cx: i * w + w / 2 };
    }

    // Split the full width into contiguous segments, each randomly + or -.
    // Every column is covered, so the ball always passes through exactly one.
    function makeZones(rng) {
      const zones = [];
      let start = 0;
      while (start < n) {
        const span = Math.min(rng.int(cfg.zoneMinBins, cfg.zoneMaxBins), n - start);
        const end = start + span;
        zones.push({
          start, end,
          x0: start * w, x1: end * w,
          sign: rng.bool() ? '+' : '-',
        });
        start = end;
      }
      // Avoid a lonely 1-bin sliver at the right edge when there are neighbours.
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

    function launchPoint(rng) {
      const margin = w * 0.75;
      return {
        x: rng.range(margin, width - margin),
        y: cfg.topPadding * 0.35,
        vx: rng.range(-cfg.launchSpeedX, cfg.launchSpeedX),
      };
    }

    return {
      n, width, height, binTop, binBottom, lastRowY,
      zoneRow, zoneY, zoneTop: zoneY - cfg.zoneHeight / 2, zoneBottom: zoneY + cfg.zoneHeight / 2,
      rowOffset, rowY, rowHasPegs, pegCountInRow, pegX, pegColRange, rowRange,
      binIndexAt, binRect, makeZones, zoneAt, launchPoint,
    };
  }

  global.Layout = { build };
})(window);

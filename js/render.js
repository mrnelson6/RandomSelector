// Canvas renderer. Draws everything from the layout math + current run state,
// culled to the camera's viewport. Physics bodies are never read for pegs.
(function (global) {
  'use strict';

  const COLORS = {
    bg: '#0f1117',
    board: '#161a24',
    boardEdge: '#2c3040',
    peg: '#8a92ad',
    pegLit: '#c9d0e6',
    divider: '#3a4058',
    binFloor: '#262b3b',
    label: '#dfe3ee',
    labelDim: '#7c849c',
    plus: '#3ddc84',
    minus: '#ff5470',
    ball: '#ffb300',
    ballCore: '#fff3c4',
    win: 'rgba(255, 179, 0, 0.28)',
  };

  function create(canvas) {
    const ctx = canvas.getContext('2d');
    let dpr = 1;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
    }

    function truncate(text, maxWidth) {
      if (ctx.measureText(text).width <= maxWidth) return text;
      let lo = 0, hi = text.length;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (ctx.measureText(text.slice(0, mid) + '…').width <= maxWidth) lo = mid; else hi = mid - 1;
      }
      return text.slice(0, lo) + '…';
    }

    function draw(state) {
      const { layout, cfg, camera, zones, labels, sign, ball, trail, winningBin, activeZone, time } = state;
      resize();

      // Screen-space clear
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      camera.apply(ctx, dpr);
      const view = camera.worldRect();
      const zoom = camera.zoom;

      // Board backdrop
      ctx.fillStyle = COLORS.board;
      ctx.fillRect(0, 0, layout.width, layout.height);
      ctx.lineWidth = 4 / zoom;
      ctx.strokeStyle = COLORS.boardEdge;
      ctx.strokeRect(0, 0, layout.width, layout.height);

      drawZones(state, view);
      drawPegs(state, view);
      drawBins(state, view);
      if (ball) drawBall(state);
    }

    function drawPegs({ layout, cfg, camera }, view) {
      const zoom = camera.zoom;
      const [r0, r1] = layout.rowRange(view.y0, view.y1);
      if (r1 < r0) return;
      // At very low zoom individual pegs are sub-pixel; draw a faint field instead.
      const radius = Math.max(cfg.pegRadius, 0.8 / zoom);
      const rowSkip = zoom < 0.08 ? 2 : 1;
      ctx.fillStyle = COLORS.peg;
      ctx.beginPath();
      for (let r = r0; r <= r1; r += rowSkip) {
        if (!layout.rowHasPegs(r)) continue;
        const y = layout.rowY(r);
        const [c0, c1] = layout.pegColRange(r, view.x0, view.x1);
        for (let c = c0; c <= c1; c++) {
          const x = layout.pegX(r, c);
          ctx.moveTo(x + radius, y);
          ctx.arc(x, y, radius, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    }

    function drawZones({ layout, cfg, camera, zones, activeZone, time }, view) {
      const zoom = camera.zoom;
      const top = layout.zoneTop, h = cfg.zoneHeight;
      const fontSize = h * 0.8;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const z of zones) {
        if (z.x1 < view.x0 || z.x0 > view.x1) continue;
        const isPlus = z.sign === '+';
        const color = isPlus ? COLORS.plus : COLORS.minus;
        const active = z === activeZone;
        const pulse = active ? 0.55 + 0.25 * Math.sin(time * 8) : 0.22;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = color;
        ctx.fillRect(z.x0, top, z.x1 - z.x0, h);
        ctx.globalAlpha = 1;
        ctx.lineWidth = (active ? 4 : 2) / Math.max(zoom, 0.2);
        ctx.strokeStyle = color;
        ctx.strokeRect(z.x0, top, z.x1 - z.x0, h);

        // Repeat the glyph across wide segments so it's visible wherever you look
        if (zoom > 0.05) {
          ctx.fillStyle = active ? '#ffffff' : color;
          ctx.font = `800 ${fontSize}px system-ui, sans-serif`;
          const glyph = isPlus ? '+' : '−';
          const step = cfg.binWidth * 3;
          const count = Math.max(1, Math.floor((z.x1 - z.x0) / step));
          const gap = (z.x1 - z.x0) / count;
          for (let i = 0; i < count; i++) {
            const gx = z.x0 + gap * (i + 0.5);
            if (gx < view.x0 - gap || gx > view.x1 + gap) continue;
            ctx.fillText(glyph, gx, layout.zoneY + h * 0.04);
          }
        }
      }
    }

    function drawBins({ layout, cfg, camera, labels, sign, winningBin }, view) {
      const zoom = camera.zoom;
      if (layout.binBottom < view.y0 || layout.binTop > view.y1) return;
      const i0 = Math.max(0, Math.floor(view.x0 / cfg.binWidth));
      const i1 = Math.min(layout.n - 1, Math.ceil(view.x1 / cfg.binWidth));

      // Floors
      ctx.fillStyle = COLORS.binFloor;
      ctx.fillRect(i0 * cfg.binWidth, layout.binBottom - 8, (i1 - i0 + 1) * cfg.binWidth, 8);

      // Winning bin highlight
      if (winningBin != null && winningBin >= i0 && winningBin <= i1) {
        const b = layout.binRect(winningBin);
        ctx.fillStyle = COLORS.win;
        ctx.fillRect(b.x, b.y, b.w, b.h);
      }

      // Dividers
      ctx.fillStyle = COLORS.divider;
      const dw = Math.max(cfg.dividerWidth, 1 / zoom);
      for (let i = Math.max(1, i0); i <= Math.min(layout.n - 1, i1 + 1); i++) {
        ctx.fillRect(i * cfg.binWidth - dw / 2, layout.binTop, dw, cfg.binDepth);
      }

      // Labels (rotated to run down the bin). Skip when unreadable.
      const fontSize = 17;
      if (fontSize * zoom < 4.5) return;
      ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const maxLen = cfg.binDepth - 28;
      for (let i = i0; i <= i1; i++) {
        const b = layout.binRect(i);
        const name = labels[i] || '';
        ctx.save();
        ctx.translate(b.cx, b.y + 14);
        ctx.rotate(Math.PI / 2);
        if (sign) {
          ctx.fillStyle = sign === '+' ? COLORS.plus : COLORS.minus;
          ctx.font = `800 ${fontSize + 2}px system-ui, sans-serif`;
          ctx.fillText(sign === '+' ? '+' : '−', 0, 0);
          ctx.translate(fontSize + 1, 0);
          ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
          ctx.fillStyle = i === winningBin ? COLORS.ball : COLORS.label;
          ctx.fillText(truncate(name, maxLen - fontSize - 2), 0, 0);
        } else {
          ctx.fillStyle = i === winningBin ? COLORS.ball : COLORS.label;
          ctx.fillText(truncate(name, maxLen), 0, 0);
        }
        ctx.restore();
      }
    }

    function drawBall({ cfg, ball, trail }) {
      const r = cfg.ballRadius;
      if (trail && trail.length > 1) {
        for (let i = 0; i < trail.length; i++) {
          const p = trail[i];
          const a = (i + 1) / trail.length;
          ctx.globalAlpha = a * 0.35;
          ctx.fillStyle = COLORS.ball;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * (0.4 + 0.5 * a), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      const { x, y } = ball.position;
      ctx.fillStyle = COLORS.ball;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.ballCore;
      ctx.beginPath();
      ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }

    return { draw, resize, COLORS };
  }

  global.Renderer = { create };
})(window);

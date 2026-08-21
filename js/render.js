// Canvas renderer. Draws everything from the layout math + current run state,
// culled to the camera's viewport. Physics bodies are only read for the balls.
(function (global) {
  'use strict';

  const COLORS = {
    bg: '#0f1117',
    board: '#161a24',
    boardEdge: '#2c3040',
    launchArea: '#131621',
    rail: '#3a4058',
    cannon: '#9aa3c0',
    cannonDark: '#5c6482',
    bumper: '#2e3550',
    bumperRing: '#6f7aa6',
    peg: '#8a92ad',
    divider: '#3a4058',
    catWall: '#aab2cc',
    binFloor: '#262b3b',
    label: '#dfe3ee',
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

    function draw(game) {
      const { layout, camera } = game;
      resize();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (!layout) return;

      camera.apply(ctx, dpr);
      const view = camera.worldRect();

      // Board backdrop
      ctx.fillStyle = COLORS.board;
      ctx.fillRect(0, 0, layout.width, layout.height);
      ctx.fillStyle = COLORS.launchArea;
      ctx.fillRect(0, 0, layout.width, game.cfg.topPadding - game.cfg.rowHeight / 2);
      ctx.lineWidth = 4 / camera.zoom;
      ctx.strokeStyle = COLORS.boardEdge;
      ctx.strokeRect(0, 0, layout.width, layout.height);

      drawCategories(game, view);
      drawZones(game, view);
      drawPegs(game, view);
      drawBins(game, view);
      drawLauncher(game, view);
      drawBalls(game);
    }

    const PEG_STYLE = {
      flip:   { fill: '#ffffff', ring: null },
      bouncy: { fill: '#ff4fd8', ring: 'rgba(255, 79, 216, 0.35)' },
      big:    { fill: '#5d6684', ring: '#8a92ad' },
      bump:   { fill: '#aab2cc', ring: null },
      spinner:{ fill: '#4ddfff', ring: null },
    };

    function drawPegs({ layout, cfg, camera, time, pegFlashes }, view) {
      const zoom = camera.zoom;
      const [r0, r1] = layout.rowRange(view.y0, view.y1);
      if (r1 < r0) return;
      // At low zoom individual pegs are sub-pixel; thin them out.
      const minR = 0.8 / zoom;
      const rowSkip = zoom < 0.1 ? 3 : zoom < 0.25 ? 2 : 1;
      const specials = [];
      ctx.fillStyle = COLORS.peg;
      ctx.beginPath();
      for (let r = r0; r <= r1; r += rowSkip) {
        if (!layout.rowHasPegs(r)) continue;
        const [c0, c1] = layout.pegColRange(r, view.x0 - cfg.binWidth, view.x1 + cfg.binWidth);
        for (let c = c0; c <= c1; c++) {
          const peg = layout.pegAt(r, c);
          if (!peg) continue;
          if (peg.kind !== 'peg') { specials.push(peg); continue; }
          const radius = Math.max(peg.r, minR);
          ctx.moveTo(peg.x + radius, peg.y);
          ctx.arc(peg.x, peg.y, radius, 0, Math.PI * 2);
        }
      }
      ctx.fill();

      const spin = cfg.specials.spinner;
      for (const peg of specials) {
        const style = PEG_STYLE[peg.kind] || PEG_STYLE.big;
        const hitAgo = pegFlashes ? time - (pegFlashes.get(peg.x + ',' + peg.y) ?? -1e9) : 1e9;
        if (peg.kind === 'flip') {
          // half green / half red with a ± glyph
          const radius = Math.max(peg.r, minR);
          const hit = hitAgo < 0.4 ? 1 + (1 - hitAgo / 0.4) * 0.6 : 1;
          ctx.fillStyle = COLORS.plus;
          ctx.beginPath(); ctx.arc(peg.x, peg.y, radius * hit, Math.PI / 2, Math.PI * 1.5); ctx.fill();
          ctx.fillStyle = COLORS.minus;
          ctx.beginPath(); ctx.arc(peg.x, peg.y, radius * hit, -Math.PI / 2, Math.PI / 2); ctx.fill();
          if (zoom > 0.3) {
            ctx.fillStyle = '#0f1117';
            ctx.font = `900 ${radius * 1.5}px system-ui, sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('±', peg.x, peg.y + 1);
          }
          continue;
        }
        if (peg.kind === 'teleport') {
          const radius = Math.max(peg.r, minR);
          const active = hitAgo < 0.6;
          // swirling dashed ring in the pair colour
          ctx.save();
          ctx.translate(peg.x, peg.y);
          ctx.rotate(time * (active ? 9 : 1.5) * (peg.pair % 2 ? -1 : 1));
          ctx.strokeStyle = peg.color;
          ctx.lineWidth = active ? 6 : 4;
          ctx.setLineDash([radius * 0.9, radius * 0.5]);
          ctx.beginPath(); ctx.arc(0, 0, radius + 4 + (active ? (1 - hitAgo / 0.6) * 10 : 0), 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
          ctx.fillStyle = '#0b0d14';
          ctx.beginPath(); ctx.arc(peg.x, peg.y, radius, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = peg.color;
          ctx.globalAlpha = 0.35 + 0.25 * Math.sin(time * 4 + peg.pair);
          ctx.beginPath(); ctx.arc(peg.x, peg.y, radius * 0.8, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          if (zoom > 0.3) {
            ctx.fillStyle = '#ffffff';
            ctx.font = `900 ${radius * 1.3}px system-ui, sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(peg.letter, peg.x, peg.y + 1);
          }
          continue;
        }
        if (peg.kind === 'spinner') {
          ctx.save();
          ctx.translate(peg.x, peg.y);
          ctx.rotate(peg.phase + peg.dir * spin.speed * time);
          ctx.fillStyle = style.fill;
          ctx.fillRect(-spin.arm, -spin.thickness / 2, spin.arm * 2, spin.thickness);
          ctx.fillRect(-spin.thickness / 2, -spin.arm, spin.thickness, spin.arm * 2);
          ctx.beginPath(); ctx.arc(0, 0, spin.thickness, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          continue;
        }
        let radius = Math.max(peg.r, minR);
        if (peg.kind === 'bouncy' && zoom > 0.2) {
          // pulsing halo, blown up briefly when the peg fires
          const burst = hitAgo < 0.4 ? (1 - hitAgo / 0.4) * 4 : 0;
          ctx.fillStyle = burst ? 'rgba(255, 220, 250, ' + (0.7 * (1 - hitAgo / 0.4)).toFixed(2) + ')' : style.ring;
          ctx.beginPath(); ctx.arc(peg.x, peg.y, radius * (1.6 + 0.3 * Math.sin(time * 6 + peg.x) + burst), 0, Math.PI * 2); ctx.fill();
          if (hitAgo < 0.25) radius *= 1.5 - hitAgo * 2;
        }
        ctx.fillStyle = style.fill;
        ctx.beginPath(); ctx.arc(peg.x, peg.y, radius, 0, Math.PI * 2); ctx.fill();
        if (peg.kind === 'big' && zoom > 0.2) {
          ctx.lineWidth = 3; ctx.strokeStyle = style.ring; ctx.stroke();
        }
      }
    }

    function drawZones({ layout, cfg, camera, zones, balls, time }, view) {
      if (!layout.hasZones) return;
      const zoom = camera.zoom;
      const top = layout.zoneTop, h = cfg.zoneHeight;
      const fontSize = h * 0.8;
      const activeZones = new Set(balls.map(b => b.zone || b.lastZone).filter(Boolean));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const z of zones) {
        if (z.x1 < view.x0 || z.x0 > view.x1) continue;
        const isPlus = z.sign === '+';
        const color = isPlus ? COLORS.plus : COLORS.minus;
        const active = activeZones.has(z);
        ctx.globalAlpha = active ? 0.55 + 0.25 * Math.sin(time * 8) : 0.22;
        ctx.fillStyle = color;
        ctx.fillRect(z.x0, top, z.x1 - z.x0, h);
        ctx.globalAlpha = 1;
        ctx.lineWidth = (active ? 4 : 2) / Math.max(zoom, 0.2);
        ctx.strokeStyle = color;
        ctx.strokeRect(z.x0, top, z.x1 - z.x0, h);

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

    function drawCategories({ layout, cfg, camera, arrangement }, view) {
      if (!layout.hasCategories) return;
      const zoom = camera.zoom;
      const w = cfg.binWidth;
      const top = layout.categoryTop, h = layout.categoryBandH;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const c of arrangement.categories) {
        const x0 = c.start * w, x1 = c.end * w;
        if (x1 < view.x0 || x0 > view.x1) continue;
        // Tint the whole lane below the band
        ctx.globalAlpha = 0.07;
        ctx.fillStyle = c.color;
        ctx.fillRect(x0, top, x1 - x0, layout.binBottom - top);
        // Band
        ctx.globalAlpha = 0.3;
        ctx.fillRect(x0, top, x1 - x0, h);
        ctx.globalAlpha = 1;
        ctx.lineWidth = 2 / Math.max(zoom, 0.2);
        ctx.strokeStyle = c.color;
        ctx.strokeRect(x0, top, x1 - x0, h);
        if (zoom > 0.04) {
          const fontSize = Math.min(h * 0.55, 40);
          ctx.font = `800 ${fontSize}px system-ui, sans-serif`;
          ctx.fillStyle = '#ffffff';
          const label = truncate(`${c.name}  ·  ${c.count}`, x1 - x0 - 24);
          // Repeat the label across very wide lanes
          const step = w * 16;
          const count = Math.max(1, Math.floor((x1 - x0) / step));
          const gap = (x1 - x0) / count;
          for (let i = 0; i < count; i++) {
            const gx = x0 + gap * (i + 0.5);
            if (gx < view.x0 - gap || gx > view.x1 + gap) continue;
            ctx.fillText(label, gx, layout.categoryY + 2);
          }
        }
      }
      // Walls (solid segments; the openings between them let balls change lane)
      ctx.fillStyle = COLORS.catWall;
      const ww = Math.max(cfg.categoryWallWidth, 1.5 / zoom);
      for (const col of layout.walls) {
        const x = col * w;
        if (x < view.x0 - ww || x > view.x1 + ww) continue;
        for (const seg of layout.wallSegments(col)) {
          if (seg.y1 < view.y0 || seg.y0 > view.y1) continue;
          ctx.fillRect(x - ww / 2, seg.y0, ww, seg.y1 - seg.y0);
        }
      }
    }

    function drawBins(game, view) {
      const { layout, cfg, camera, balls } = game;
      const zoom = camera.zoom;
      if (layout.binBottom < view.y0 || layout.binTop > view.y1) return;
      const i0 = Math.max(0, Math.floor(view.x0 / cfg.binWidth));
      const i1 = Math.min(layout.n - 1, Math.ceil(view.x1 / cfg.binWidth));
      const winning = new Set(balls.filter(b => b.landed).map(b => b.bin));

      ctx.fillStyle = COLORS.binFloor;
      ctx.fillRect(i0 * cfg.binWidth, layout.binBottom - 8, (i1 - i0 + 1) * cfg.binWidth, 8);

      for (const bin of winning) {
        if (bin < i0 || bin > i1) continue;
        const b = layout.binRect(bin);
        ctx.fillStyle = COLORS.win;
        ctx.fillRect(b.x, b.y, b.w, b.h);
      }

      ctx.fillStyle = COLORS.divider;
      const dw = Math.max(cfg.dividerWidth, 1 / zoom);
      for (let i = Math.max(1, i0); i <= Math.min(layout.n - 1, i1 + 1); i++) {
        ctx.fillRect(i * cfg.binWidth - dw / 2, layout.binTop, dw, cfg.binDepth);
      }

      const fontSize = 18;
      if (fontSize * zoom < 4.5) return;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const maxLen = cfg.binDepth - 28;
      const signColor = part => part.startsWith('+') ? COLORS.plus : part.startsWith('−') ? COLORS.minus : '#9aa0b4';
      for (let i = i0; i <= i1; i++) {
        const b = layout.binRect(i);
        const { head, name, tail } = game.labelFor(i);
        const nameColor = winning.has(i) ? COLORS.ball : COLORS.label;
        ctx.save();
        ctx.translate(b.cx, b.y + 14);
        ctx.rotate(Math.PI / 2);
        let x = 0;
        if (head) {
          ctx.font = `800 ${fontSize + 2}px system-ui, sans-serif`;
          ctx.fillStyle = signColor(head);
          ctx.fillText(head, x, 0);
          x += ctx.measureText(head).width + 2;
        }
        ctx.font = `800 ${fontSize}px system-ui, sans-serif`;
        const tailW = tail ? ctx.measureText(' ' + tail).width : 0;
        ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
        ctx.fillStyle = nameColor;
        const shown = truncate(name, maxLen - x - tailW);
        ctx.fillText(shown, x, 0);
        x += ctx.measureText(shown).width;
        if (tail) {
          ctx.font = `800 ${fontSize}px system-ui, sans-serif`;
          ctx.fillStyle = signColor(tail);
          ctx.fillText(' ' + tail, x, 0);
        }
        ctx.restore();
      }
    }

    function drawLauncher({ layout, cfg, camera, cannon, state, balls, shots }, view) {
      const zoom = camera.zoom;
      if (cfg.topPadding < view.y0) return;
      // Rail
      ctx.fillStyle = COLORS.rail;
      ctx.fillRect(Math.max(0, view.x0), cfg.railY - 4, Math.min(layout.width, view.x1) - Math.max(0, view.x0), 8);

      // Bumpers
      for (const b of layout.bumpersIn(view.x0, view.x1, view.y0, view.y1)) {
        ctx.fillStyle = COLORS.bumper;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = COLORS.bumperRing;
        ctx.stroke();
        ctx.fillStyle = COLORS.bumperRing;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.3, 0, Math.PI * 2); ctx.fill();
      }

      // Cannon: carriage on the rail + rotating barrel
      if (cannon.x + 200 < view.x0 || cannon.x - 200 > view.x1) return;
      ctx.save();
      ctx.translate(cannon.x, cfg.railY);
      ctx.fillStyle = COLORS.cannonDark;
      ctx.fillRect(-34, -10, 68, 28);
      ctx.fillStyle = COLORS.cannon;
      ctx.beginPath(); ctx.arc(-22, 20, 9, 0, Math.PI * 2); ctx.arc(22, 20, 9, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(cannon.angle);
      ctx.fillStyle = COLORS.cannon;
      ctx.fillRect(-12, -cfg.barrelLength, 24, cfg.barrelLength);
      ctx.fillStyle = COLORS.cannonDark;
      ctx.fillRect(-14, -cfg.barrelLength, 28, 10);
      ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
      // Loaded ball peeking out while waiting to fire
      const loaded = (state === 'ready' || state === 'aiming') || (state === 'falling' && balls.length < shots.length);
      if (loaded) {
        ctx.fillStyle = COLORS.ball;
        ctx.beginPath(); ctx.arc(0, -cfg.barrelLength + 14, cfg.ballRadius * 0.85, 0, Math.PI * 2); ctx.fill();
      }
      if (cannon.flash > 0) {
        ctx.globalAlpha = cannon.flash / 0.25;
        ctx.fillStyle = '#fff3c4';
        ctx.beginPath(); ctx.arc(0, -cfg.barrelLength - 10, 26 * (1.4 - cannon.flash), 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    // The ball takes the colour of its sign once it has one.
    function ballColor(ball) {
      return ball.sign === '+' ? COLORS.plus : ball.sign === '-' ? COLORS.minus : COLORS.ball;
    }

    function drawBalls({ cfg, balls, time }) {
      const r = cfg.ballRadius;
      for (const ball of balls) {
        const color = ballColor(ball);
        const trail = ball.landed ? [] : ball.trail;
        for (let i = 0; i < trail.length; i++) {
          const p = trail[i];
          const a = (i + 1) / trail.length;
          ctx.globalAlpha = a * 0.35;
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.arc(p.x, p.y, r * (0.4 + 0.5 * a), 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        const { x, y } = ball.body.position;
        // A ring flashes out when the sign was just set
        const since = ball.signAt != null ? time - ball.signAt : 1e9;
        if (since < 0.6) {
          ctx.globalAlpha = 1 - since / 0.6;
          ctx.lineWidth = 4;
          ctx.strokeStyle = color;
          ctx.beginPath(); ctx.arc(x, y, r + since * 90, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = COLORS.ballCore;
        ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.fill();
        if (ball.sign && !ball.landed) {
          ctx.fillStyle = '#0f1117';
          ctx.font = `900 ${r * 1.6}px system-ui, sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(ball.sign === '+' ? '+' : '−', x, y + 1);
        } else if (balls.length > 1) {
          ctx.fillStyle = '#1a1200';
          ctx.font = `800 ${r * 1.3}px system-ui, sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(ball.index + 1), x, y + 1);
        }
      }
    }

    return { draw, resize, COLORS };
  }

  global.Renderer = { create };
})(window);

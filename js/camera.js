// Smooth 2D camera: world centre (x, y) + zoom. Targets are lerped each frame.
(function (global) {
  'use strict';

  function create(canvas) {
    const cam = {
      x: 0, y: 0, zoom: 1,
      tx: 0, ty: 0, tzoom: 1,
      posRate: 5,    // higher = snappier
      zoomRate: 3,
      manual: false, // true while the user is panning/zooming by hand
    };

    function screenSize() {
      return { sw: canvas.clientWidth, sh: canvas.clientHeight };
    }

    function setTarget(x, y, zoom) {
      cam.tx = x; cam.ty = y;
      if (zoom != null) cam.tzoom = zoom;
    }
    function snap() { cam.x = cam.tx; cam.y = cam.ty; cam.zoom = cam.tzoom; }

    // Target a view that contains the given world rect with some padding.
    function fitRect(x, y, w, h, padding = 40) {
      const { sw, sh } = screenSize();
      const zoom = Math.min((sw - padding * 2) / w, (sh - padding * 2) / h);
      setTarget(x + w / 2, y + h / 2, Math.max(0.02, zoom));
    }

    // Follow a point, keeping it a third of the way down the screen.
    function followPoint(px, py, zoom, bounds) {
      const { sw, sh } = screenSize();
      let cx = px;
      let cy = py + sh / (6 * zoom);
      if (bounds) {
        const halfW = sw / (2 * zoom);
        if (bounds.width > 2 * halfW) cx = Math.min(Math.max(cx, halfW), bounds.width - halfW);
        else cx = bounds.width / 2;
        const halfH = sh / (2 * zoom);
        cy = Math.min(cy, bounds.height - halfH + 80);
      }
      setTarget(cx, cy, zoom);
    }

    // Frame several points at once: zoom out just enough to contain them all
    // (between minZoom and maxZoom), keeping the group a third of the way down.
    function followPoints(points, maxZoom, minZoom, bounds) {
      if (points.length === 1) return followPoint(points[0].x, points[0].y, maxZoom, bounds);
      const { sw, sh } = screenSize();
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of points) {
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      }
      const pad = 260;
      const zoom = Math.min(maxZoom, Math.max(minZoom,
        Math.min(sw / (x1 - x0 + pad * 2), sh / (y1 - y0 + pad * 2))));
      followPoint((x0 + x1) / 2, (y0 + y1) / 2, zoom, bounds);
    }

    function update(dt) {
      const a = 1 - Math.exp(-cam.posRate * dt);
      const b = 1 - Math.exp(-cam.zoomRate * dt);
      cam.x += (cam.tx - cam.x) * a;
      cam.y += (cam.ty - cam.y) * a;
      cam.zoom = Math.exp(Math.log(cam.zoom) + (Math.log(cam.tzoom) - Math.log(cam.zoom)) * b);
    }

    function apply(ctx, dpr) {
      const { sw, sh } = screenSize();
      ctx.setTransform(
        cam.zoom * dpr, 0, 0, cam.zoom * dpr,
        (sw / 2 - cam.x * cam.zoom) * dpr,
        (sh / 2 - cam.y * cam.zoom) * dpr
      );
    }

    function worldRect() {
      const { sw, sh } = screenSize();
      const hw = sw / (2 * cam.zoom), hh = sh / (2 * cam.zoom);
      return { x0: cam.x - hw, y0: cam.y - hh, x1: cam.x + hw, y1: cam.y + hh };
    }

    function screenToWorld(sx, sy) {
      const { sw, sh } = screenSize();
      return { x: (sx - sw / 2) / cam.zoom + cam.x, y: (sy - sh / 2) / cam.zoom + cam.y };
    }

    // Manual controls (drag to pan, wheel to zoom). Switching to manual mode
    // stops automatic following until the game re-takes control.
    // Drag to pan, wheel or pinch to zoom, double-tap/double-click to go back
    // to automatic following.
    function enableManualControls(onManual, onDoubleTap) {
      const pointers = new Map(); // pointerId -> {x, y}
      let moved = 0, pinchDist = 0, lastTap = 0, lastTapX = 0, lastTapY = 0;

      function zoomAt(sx, sy, factor) {
        const before = screenToWorld(sx, sy);
        cam.zoom = cam.tzoom = Math.min(4, Math.max(0.02, cam.zoom * factor));
        const after = screenToWorld(sx, sy);
        cam.x = cam.tx = cam.x + (before.x - after.x);
        cam.y = cam.ty = cam.y + (before.y - after.y);
      }

      canvas.addEventListener('pointerdown', e => {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        canvas.setPointerCapture(e.pointerId);
        if (pointers.size === 1) moved = 0;
        if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        }
      });
      canvas.addEventListener('pointermove', e => {
        const p = pointers.get(e.pointerId);
        if (!p) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY;
        moved += Math.abs(dx) + Math.abs(dy);
        if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          cam.manual = true; onManual && onManual();
          if (pinchDist > 0) zoomAt(mx, my, dist / pinchDist);
          pinchDist = dist;
          // pan by half of this pointer's movement (the other pointer contributes its half)
          cam.tx = cam.x = cam.x - dx / cam.zoom / 2;
          cam.ty = cam.y = cam.y - dy / cam.zoom / 2;
        } else if (pointers.size === 1 && moved > 4) {
          cam.manual = true; onManual && onManual();
          cam.tx = cam.x = cam.x - dx / cam.zoom;
          cam.ty = cam.y = cam.y - dy / cam.zoom;
        }
      });
      const end = e => {
        const wasSingle = pointers.size === 1;
        pointers.delete(e.pointerId);
        pinchDist = 0;
        if (wasSingle && moved <= 6 && e.type === 'pointerup') {
          const now = performance.now();
          if (now - lastTap < 350 && Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 40) {
            lastTap = 0;
            cam.manual = false;
            onDoubleTap && onDoubleTap();
          } else {
            lastTap = now; lastTapX = e.clientX; lastTapY = e.clientY;
          }
        }
      };
      canvas.addEventListener('pointerup', end);
      canvas.addEventListener('pointercancel', end);
      canvas.addEventListener('pointerleave', e => { pointers.delete(e.pointerId); pinchDist = 0; });
      canvas.addEventListener('wheel', e => {
        e.preventDefault();
        cam.manual = true; onManual && onManual();
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
      }, { passive: false });
    }

    return Object.assign(cam, {
      setTarget, snap, fitRect, followPoint, followPoints, update, apply, worldRect, screenToWorld, screenSize,
      enableManualControls,
    });
  }

  global.Camera = { create };
})(window);

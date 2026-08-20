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
    function enableManualControls(onManual) {
      let dragging = false, lastX = 0, lastY = 0, moved = 0;
      canvas.addEventListener('pointerdown', e => {
        dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
      });
      canvas.addEventListener('pointermove', e => {
        if (!dragging) return;
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        moved += Math.abs(dx) + Math.abs(dy);
        if (moved > 4) {
          cam.manual = true; onManual && onManual();
          cam.tx = cam.x = cam.x - dx / cam.zoom;
          cam.ty = cam.y = cam.y - dy / cam.zoom;
        }
      });
      const end = e => { dragging = false; };
      canvas.addEventListener('pointerup', end);
      canvas.addEventListener('pointercancel', end);
      canvas.addEventListener('wheel', e => {
        e.preventDefault();
        cam.manual = true; onManual && onManual();
        const before = screenToWorld(e.clientX, e.clientY);
        const factor = Math.exp(-e.deltaY * 0.0015);
        cam.zoom = cam.tzoom = Math.min(4, Math.max(0.02, cam.zoom * factor));
        const after = screenToWorld(e.clientX, e.clientY);
        cam.x = cam.tx = cam.x + (before.x - after.x);
        cam.y = cam.ty = cam.y + (before.y - after.y);
      }, { passive: false });
    }

    return Object.assign(cam, {
      setTarget, snap, fitRect, followPoint, update, apply, worldRect, screenToWorld, screenSize,
      enableManualControls,
    });
  }

  global.Camera = { create };
})(window);

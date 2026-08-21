// Synthesised sound effects (Web Audio, no asset files). Everything is built
// from oscillators and a noise buffer so the site stays a single static folder.
(function (global) {
  'use strict';

  const STORAGE_KEY = 'plinko.sound';

  function create() {
    let ctx = null, master = null, noiseBuf = null;
    let enabled = true;
    try { enabled = localStorage.getItem(STORAGE_KEY) !== 'off'; } catch (e) { /* ignore */ }
    const lastAt = new Map(); // rate limiting per sound name

    function ensure() {
      if (ctx) return ctx;
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 1;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return ctx;
    }

    // Browsers only start audio after a user gesture; call this from click handlers.
    function unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume();
    }

    function tone({ type = 'sine', freq = 440, to = null, dur = 0.1, gain = 0.3, attack = 0.002, at = 0, curve = 'exp' }) {
      const c = ctx;
      const t0 = c.currentTime + at;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(gain, t0 + attack);
      if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      else g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(master);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    }

    function noise({ dur = 0.2, gain = 0.3, filter = 'lowpass', freq = 1000, to = null, at = 0 }) {
      const c = ctx;
      const t0 = c.currentTime + at;
      const src = c.createBufferSource();
      src.buffer = noiseBuf;
      const f = c.createBiquadFilter();
      f.type = filter;
      f.frequency.setValueAtTime(freq, t0);
      if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f).connect(g).connect(master);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    }

    const N = { C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, E6: 1318.5, G6: 1568, A5: 880, F5: 698.46 };

    const SOUNDS = {
      // cannon shot: thump + noise burst
      fire: () => {
        tone({ type: 'sine', freq: 140, to: 40, dur: 0.35, gain: 0.9 });
        noise({ dur: 0.3, gain: 0.7, filter: 'lowpass', freq: 3000, to: 200 });
      },
      // ordinary peg: short click, pitch varies a little with impact speed
      peg: ({ speed = 5 } = {}) => {
        const f = 900 + Math.min(speed, 25) * 30 + Math.random() * 120;
        tone({ type: 'triangle', freq: f, to: f * 0.6, dur: 0.045, gain: 0.25 });
      },
      // super-bouncy peg: cartoon boing
      bouncy: () => {
        tone({ type: 'sine', freq: 220, to: 1100, dur: 0.28, gain: 0.6 });
        tone({ type: 'square', freq: 330, to: 1650, dur: 0.22, gain: 0.12 });
      },
      big: () => tone({ type: 'sine', freq: 150, to: 70, dur: 0.18, gain: 0.6 }),
      spinner: () => {
        tone({ type: 'square', freq: 620, dur: 0.07, gain: 0.15 });
        tone({ type: 'square', freq: 930, dur: 0.09, gain: 0.12, at: 0.02 });
      },
      // pinball bumper: bright ding
      bumper: () => {
        tone({ type: 'sine', freq: 1240, dur: 0.16, gain: 0.45 });
        tone({ type: 'sine', freq: 2480, dur: 0.1, gain: 0.15 });
      },
      wall: () => tone({ type: 'triangle', freq: 210, to: 120, dur: 0.07, gain: 0.35 }),
      divider: () => tone({ type: 'triangle', freq: 520, to: 300, dur: 0.03, gain: 0.15 }),
      // sign captured: rising arpeggio for +, falling for -
      zone: ({ sign = '+' } = {}) => {
        const seq = sign === '+' ? [N.C5, N.E5, N.G5, N.C6] : [N.C6, N.G5, N.E5, N.C5];
        seq.forEach((f, i) => tone({ type: sign === '+' ? 'triangle' : 'sawtooth', freq: f, dur: 0.22, gain: 0.3, at: i * 0.07 }));
      },
      // entering a category lane: whoosh
      category: () => noise({ dur: 0.45, gain: 0.35, filter: 'bandpass', freq: 400, to: 2400 }),
      // ball settles in a bin
      land: () => {
        tone({ type: 'sine', freq: N.E6, dur: 0.25, gain: 0.35 });
        tone({ type: 'sine', freq: N.C6, dur: 0.4, gain: 0.3, at: 0.12 });
      },
      // all balls down: little fanfare
      done: () => {
        [N.C5, N.E5, N.G5, N.C6, N.E6].forEach((f, i) =>
          tone({ type: 'triangle', freq: f, dur: i === 4 ? 0.6 : 0.18, gain: 0.35, at: 0.25 + i * 0.1 }));
      },
      // sign flipped by a ± peg: quick two-note wobble, direction by new sign
      flip: ({ sign = '+' } = {}) => {
        const [a, b] = sign === '+' ? [N.E5, N.C6] : [N.C6, N.E5];
        tone({ type: 'square', freq: a, to: b, dur: 0.18, gain: 0.2 });
        tone({ type: 'triangle', freq: b, dur: 0.2, gain: 0.25, at: 0.12 });
      },
      // teleport: sci-fi down-then-up sweep
      teleport: () => {
        tone({ type: 'sawtooth', freq: 900, to: 120, dur: 0.22, gain: 0.18 });
        tone({ type: 'sine', freq: 200, to: 1600, dur: 0.3, gain: 0.3, at: 0.12 });
        noise({ dur: 0.3, gain: 0.2, filter: 'bandpass', freq: 600, to: 4000, at: 0.1 });
      },
      click: () => tone({ type: 'square', freq: 700, dur: 0.03, gain: 0.08 }),
    };

    // Minimum gap between repeats of the same sound, seconds
    const MIN_GAP = { peg: 0.035, divider: 0.05, wall: 0.06, bumper: 0.08, spinner: 0.08, big: 0.1 };

    function play(name, data) {
      if (!enabled || !SOUNDS[name]) return;
      const c = ensure();
      if (!c || c.state !== 'running') return;
      const now = c.currentTime;
      const gap = MIN_GAP[name] || 0;
      if (gap && now - (lastAt.get(name) || -1) < gap) return;
      lastAt.set(name, now);
      try { SOUNDS[name](data || {}); } catch (e) { /* never let audio break the game */ }
    }

    function setEnabled(on) {
      enabled = !!on;
      try { localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off'); } catch (e) { /* ignore */ }
      if (enabled) unlock();
    }

    return { play, unlock, setEnabled, get enabled() { return enabled; } };
  }

  global.Sfx = { create };
})(window);

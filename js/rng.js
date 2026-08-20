// Seeded pseudo-random number generator (sfc32) plus helpers.
// Everything that decides the outcome (bin order, zone signs, launch point)
// is drawn from one of these so a run can be reproduced from its seed.
(function (global) {
  'use strict';

  // Hash a string into four 32-bit words (cyrb128).
  function hashSeed(str) {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0; i < str.length; i++) {
      const k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
  }

  function sfc32(a, b, c, d) {
    return function () {
      a |= 0; b |= 0; c |= 0; d |= 0;
      const t = (((a + b) | 0) + d) | 0;
      d = (d + 1) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }

  function createRng(seed) {
    const [a, b, c, d] = hashSeed(String(seed));
    const next = sfc32(a, b, c, d);
    for (let i = 0; i < 16; i++) next(); // warm up
    return {
      seed: String(seed),
      next,                                   // [0, 1)
      range(min, max) { return min + next() * (max - min); },
      int(min, max) { return min + Math.floor(next() * (max - min + 1)); }, // inclusive
      bool() { return next() < 0.5; },
      pick(arr) { return arr[Math.floor(next() * arr.length)]; },
      shuffle(arr) {                          // Fisher-Yates, returns a copy
        const out = arr.slice();
        for (let i = out.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
      },
    };
  }

  // A fresh, unpredictable seed for a new run: short, URL-safe, human-readable.
  function randomSeed() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(8);
    if (global.crypto && global.crypto.getRandomValues) {
      global.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += alphabet[bytes[i] % alphabet.length];
    return s;
  }

  global.RNG = { createRng, randomSeed, hashSeed };
})(window);

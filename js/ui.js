// DOM wiring: buttons, HUD, result banner, settings panel, seed links.
(function (global) {
  'use strict';

  const STORAGE_KEY = 'plinko.customOptions';

  function parseOptions(text) {
    const seen = new Set();
    const out = [];
    for (const raw of text.split(/\r?\n/)) {
      const s = raw.trim();
      if (!s) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
    return out;
  }

  function loadOptions() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = parseOptions(saved);
        if (parsed.length >= 2) return { options: parsed, custom: true };
      }
    } catch (e) { /* storage unavailable */ }
    return { options: parseOptions((global.DEFAULT_OPTIONS || []).join('\n')), custom: false };
  }

  function create(game) {
    const byId = id => document.getElementById(id);
    const els = {
      drop: byId('drop-btn'), settings: byId('settings-btn'), overview: byId('overview-btn'),
      sign: byId('sign-indicator'), statOptions: byId('stat-options'), statOutcomes: byId('stat-outcomes'),
      seed: byId('seed-display'), copy: byId('copy-link-btn'),
      result: byId('result'), resultText: byId('result-text'), resultSeed: byId('result-seed'),
      again: byId('again-btn'), closeResult: byId('close-result-btn'),
      panel: byId('settings'), input: byId('options-input'), count: byId('options-count'),
      save: byId('save-options-btn'), reset: byId('reset-options-btn'), closeSettings: byId('close-settings-btn'),
    };

    function seedFromUrl() {
      const s = new URLSearchParams(location.search).get('seed');
      return s && s.trim() ? s.trim() : null;
    }
    function setUrlSeed(seed) {
      try {
        const url = new URL(location.href);
        url.searchParams.set('seed', seed);
        history.replaceState(null, '', url);
      } catch (e) { /* file:// in some browsers */ }
    }
    function shareLink(seed) {
      const url = new URL(location.href);
      url.searchParams.set('seed', seed);
      return url.toString();
    }

    function applyOptions(options) {
      game.setOptions(options);
      els.statOptions.textContent = options.length;
      els.statOutcomes.textContent = options.length * 2;
    }

    function newRun(seed) {
      seed = seed || RNG.randomSeed();
      game.prepare(seed);
      setUrlSeed(seed);
      els.seed.textContent = seed;
      els.sign.dataset.sign = '';
      els.sign.textContent = '?';
      els.result.classList.add('hidden');
    }

    function dropAgain() {
      newRun();
      setTimeout(() => game.drop(), 150);
    }

    function onState(state) {
      els.drop.disabled = state !== 'ready';
      els.drop.textContent =
        state === 'ready' ? 'Drop ball' :
        state === 'dropping' ? 'Get ready…' :
        state === 'falling' ? 'Falling…' : 'Landed';
      els.settings.disabled = state === 'dropping' || state === 'falling';
    }

    function onSign(sign) {
      els.sign.dataset.sign = sign;
      els.sign.textContent = sign === '+' ? '+' : '−';
    }

    function onResult(result) {
      setTimeout(() => {
        els.resultText.textContent = result.text;
        els.resultText.className = 'result-text ' + (result.sign === '+' ? 'plus' : 'minus');
        els.resultSeed.textContent = result.seed;
        els.result.classList.remove('hidden');
      }, 900);
    }

    // --- Buttons ---
    els.drop.addEventListener('click', () => game.drop());
    els.again.addEventListener('click', dropAgain);
    els.closeResult.addEventListener('click', () => els.result.classList.add('hidden'));
    els.overview.addEventListener('click', () => game.showOverview());
    els.copy.addEventListener('click', async () => {
      const link = shareLink(game.seed);
      try {
        await navigator.clipboard.writeText(link);
        els.copy.textContent = 'copied!';
        setTimeout(() => { els.copy.textContent = 'copy link'; }, 1500);
      } catch (e) {
        window.prompt('Copy this link:', link);
      }
    });

    document.addEventListener('keydown', e => {
      const typing = document.activeElement && document.activeElement.tagName === 'TEXTAREA';
      if (e.code === 'Space' && !typing) {
        e.preventDefault();
        if (game.state === 'ready') game.drop();
        else if (game.state === 'landed') dropAgain();
      }
      if (e.key === 'Escape') {
        els.panel.classList.add('hidden');
        els.result.classList.add('hidden');
      }
    });

    // --- Settings panel ---
    function updateCount() {
      const n = parseOptions(els.input.value).length;
      els.count.textContent = n + ' option' + (n === 1 ? '' : 's') + ' → ' + (n * 2) + ' outcomes';
    }
    els.input.addEventListener('input', updateCount);
    els.settings.addEventListener('click', () => {
      els.input.value = game.options.join('\n');
      updateCount();
      els.panel.classList.remove('hidden');
      els.input.focus();
    });
    els.closeSettings.addEventListener('click', () => els.panel.classList.add('hidden'));
    els.save.addEventListener('click', () => {
      const options = parseOptions(els.input.value);
      if (options.length < 2) {
        els.count.textContent = 'Please enter at least two options.';
        return;
      }
      try { localStorage.setItem(STORAGE_KEY, options.join('\n')); } catch (e) { /* ignore */ }
      applyOptions(options);
      newRun();
      els.panel.classList.add('hidden');
    });
    els.reset.addEventListener('click', () => {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
      const { options } = loadOptions();
      els.input.value = options.join('\n');
      updateCount();
      applyOptions(options);
      newRun();
    });

    // --- Boot ---
    const { options } = loadOptions();
    applyOptions(options);
    newRun(seedFromUrl());
    // ?autodrop=1 starts the drop as soon as the page loads (nice for shared links).
    if (new URLSearchParams(location.search).get('autodrop')) {
      setTimeout(() => game.drop(), 600);
    }

    return { onState, onSign, onResult, newRun };
  }

  global.UI = { create, parseOptions, loadOptions };
})(window);

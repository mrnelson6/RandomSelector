// DOM wiring: buttons, HUD, PIP panel, result banner, settings panel, seed links.
(function (global) {
  'use strict';

  const OPTIONS_KEY = 'plinko.customOptions';
  const SETTINGS_KEY = 'plinko.settings';
  const PIP_ROWS = 7;
  const MINUS = '−';

  // One option per line: "Name +0.5 | Category". Value and category are optional.
  function parseOptions(text) {
    const seen = new Set();
    const out = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const [mainRaw, ...rest] = line.split('|');
      const category = rest.join('|').trim() || null;
      const m = mainRaw.trim().match(/^(.*?)(?:\s+[+−-]?(\d*\.?\d+))?$/);
      const label = (m ? m[1] : mainRaw).replace(/^"|"$/g, '').trim();
      if (!label) continue;
      const value = m && m[2] ? m[2] : null;
      const key = (label + '|' + (value || '')).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ label, value, category });
    }
    return out;
  }
  function serializeOptions(options) {
    return options.map(o => o.label + (o.value ? ' +' + o.value : '') + (o.category ? ' | ' + o.category : '')).join('\n');
  }

  function loadOptions() {
    try {
      const saved = localStorage.getItem(OPTIONS_KEY);
      if (saved) {
        const parsed = parseOptions(saved);
        if (parsed.length >= 2) return { options: parsed, custom: true };
      }
    } catch (e) { /* storage unavailable */ }
    const defaults = (global.DEFAULT_OPTIONS || []).map(o =>
      typeof o === 'string' ? { label: o, value: null, category: null } : o);
    return { options: defaults, custom: false };
  }

  function loadSettings() {
    let s = { ...global.DEFAULT_SETTINGS };
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      if (saved && typeof saved === 'object') s = { ...s, ...saved };
    } catch (e) { /* ignore */ }
    // URL overrides (so share links reproduce the board)
    const q = new URLSearchParams(location.search);
    if (q.has('balls')) s.balls = parseInt(q.get('balls'), 10) || s.balls;
    if (q.has('rows')) s.rows = parseInt(q.get('rows'), 10) || s.rows;
    if (q.has('signs')) s.signs = q.get('signs') !== '0';
    if (q.has('cats')) s.categories = q.get('cats') !== '0';
    return s;
  }

  function create(game) {
    const byId = id => document.getElementById(id);
    const els = {
      drop: byId('drop-btn'), settings: byId('settings-btn'), overview: byId('overview-btn'), sound: byId('sound-btn'),
      statOptions: byId('stat-options'), statSigns: byId('stat-signs'), statOutcomes: byId('stat-outcomes'),
      seed: byId('seed-display'), copy: byId('copy-link-btn'),
      pip: byId('pip'), pipList: byId('pip-list'), pipSign: byId('pip-sign'), pipCategory: byId('pip-category'),
      result: byId('result'), resultLabel: byId('result-label'), resultText: byId('result-text'),
      resultList: byId('result-list'), resultSeed: byId('result-seed'),
      again: byId('again-btn'), closeResult: byId('close-result-btn'),
      panel: byId('settings'), input: byId('options-input'), count: byId('options-count'),
      save: byId('save-options-btn'), reset: byId('reset-options-btn'), closeSettings: byId('close-settings-btn'),
      setBalls: byId('set-balls'), setRows: byId('set-rows'), setSigns: byId('set-signs'),
      setCats: byId('set-cats'), setCatsNote: byId('set-cats-note'),
    };

    // ---- URL / seed helpers ----
    function seedFromUrl() {
      const s = new URLSearchParams(location.search).get('seed');
      return s && s.trim() ? s.trim() : null;
    }
    function buildUrl(seed) {
      const url = new URL(location.href);
      const p = url.searchParams;
      p.set('seed', seed);
      const s = game.settings, d = global.DEFAULT_SETTINGS;
      const setOrDelete = (k, v, dv) => (v === dv ? p.delete(k) : p.set(k, v));
      setOrDelete('balls', String(s.balls), String(d.balls));
      setOrDelete('rows', String(s.rows), String(d.rows));
      setOrDelete('signs', s.signs ? '1' : '0', d.signs ? '1' : '0');
      setOrDelete('cats', s.categories ? '1' : '0', d.categories ? '1' : '0');
      p.delete('autodrop');
      return url;
    }
    function syncUrl(seed) {
      try { history.replaceState(null, '', buildUrl(seed)); } catch (e) { /* file:// */ }
    }

    // ---- HUD ----
    function updateStats() {
      const n = game.options.length;
      const signs = game.settings.signs;
      els.statOptions.textContent = n;
      els.statSigns.textContent = signs ? '× 2 signs' : '';
      els.statOutcomes.textContent = signs ? n * 2 : n;
    }

    function applyOptions(options) {
      game.setOptions(options);
      updateStats();
    }

    function newRun(seed) {
      seed = seed || RNG.randomSeed();
      game.prepare(seed);
      syncUrl(seed);
      els.seed.textContent = seed;
      els.result.classList.add('hidden');
      els.pip.classList.add('hidden');
    }
    function dropAgain() {
      newRun();
      setTimeout(() => game.drop(), 150);
    }

    function onState(state) {
      const balls = game.settings.balls;
      els.drop.disabled = state !== 'ready';
      els.drop.textContent =
        state === 'ready' ? (balls > 1 ? `Drop ${balls} balls` : 'Drop ball') :
        state === 'aiming' ? 'Aiming…' :
        state === 'falling' ? 'Falling…' : 'Landed';
      els.settings.disabled = state === 'aiming' || state === 'falling';
      els.pip.classList.toggle('hidden', state !== 'falling' && state !== 'landed');
    }

    function onSign() { /* the ball itself changes colour; nothing to do in the DOM */ }

    // ---- PIP ----
    const pipItems = [];
    for (let i = 0; i < PIP_ROWS; i++) {
      const li = document.createElement('li');
      li.innerHTML = '<span class="dot"></span><span class="name"></span><span class="tail"></span>';
      els.pipList.appendChild(li);
      pipItems.push(li);
    }
    function updatePip() {
      if (els.pip.classList.contains('hidden')) return;
      const data = game.binsUnder(PIP_ROWS);
      if (!data) return;
      const { ball, rows } = data;
      const s = ball.sign;
      els.pipSign.textContent = s ? (s === '+' ? '+' : MINUS) : (game.layout.hasZones ? '±' : '');
      els.pipSign.className = 'pip-sign ' + (s === '+' ? 'plus' : s === '-' ? 'minus' : '');
      const centre = rows.find(r => r && r.centre);
      const cat = centre && centre.category;
      els.pipCategory.textContent = cat ? cat.name : (game.balls.length > 1 ? `Ball ${ball.index + 1}` : '');
      els.pipCategory.style.color = cat ? cat.color : 'var(--muted)';
      rows.forEach((row, i) => {
        const li = pipItems[i];
        if (!row) { li.className = 'empty'; li.children[1].textContent = '—'; li.children[2].textContent = ''; li.children[0].style.background = ''; return; }
        const parts = Game.formatParts(row.option, ball.sign, game.layout.hasZones);
        li.className = row.centre ? 'centre' : '';
        li.children[0].style.background = row.category ? row.category.color : '';
        li.children[1].textContent = parts.head + parts.name;
        li.children[2].textContent = parts.tail;
        li.children[2].className = 'tail ' + (parts.tail.startsWith('+') ? 'plus' : parts.tail.startsWith(MINUS) ? 'minus' : '');
      });
    }

    // ---- Results ----
    function signClass(r) { return r.sign === '+' ? 'plus' : r.sign === '-' ? 'minus' : ''; }
    function onResult(results) {
      setTimeout(() => {
        els.resultSeed.textContent = game.seed;
        els.resultList.innerHTML = '';
        const old = els.result.querySelector('.result-category');
        if (old) old.remove();
        if (results.length === 1) {
          const r = results[0];
          els.resultLabel.textContent = 'The ball landed on';
          els.resultText.textContent = r.text;
          els.resultText.className = 'result-text ' + signClass(r);
          els.resultText.classList.remove('hidden');
          els.resultList.classList.add('hidden');
          if (r.category) {
            const c = document.createElement('div');
            c.className = 'result-category';
            c.textContent = r.category.name;
            c.style.color = r.category.color;
            els.resultText.after(c);
          }
        } else {
          els.resultLabel.textContent = `${results.length} balls landed on`;
          els.resultText.classList.add('hidden');
          els.resultList.classList.remove('hidden');
          for (const r of [...results].sort((a, b) => a.ballIndex - b.ballIndex)) {
            const li = document.createElement('li');
            li.innerHTML = `<span class="n">#${r.ballIndex + 1}</span><span class="${signClass(r)}"></span><span class="cat"></span>`;
            li.children[1].textContent = r.text;
            if (r.category) { li.children[2].textContent = r.category.name; li.children[2].style.color = r.category.color; }
            els.resultList.appendChild(li);
          }
        }
        els.result.classList.remove('hidden');
      }, 900);
    }

    // ---- Buttons ----
    const audio = () => game.audio;
    function refreshSoundButton() {
      const on = audio() && audio().enabled;
      els.sound.innerHTML = (on ? '&#128266;' : '&#128263;') + ' Sound';
      els.sound.classList.toggle('muted', !on);
    }
    els.sound.addEventListener('click', () => {
      audio().setEnabled(!audio().enabled);
      refreshSoundButton();
      if (audio().enabled) audio().play('click');
    });
    els.drop.addEventListener('click', () => { audio() && audio().unlock(); game.drop(); });
    els.again.addEventListener('click', () => { audio() && audio().unlock(); dropAgain(); });
    els.closeResult.addEventListener('click', () => els.result.classList.add('hidden'));
    els.overview.addEventListener('click', () => game.showOverview());
    els.copy.addEventListener('click', async () => {
      const link = buildUrl(game.seed).toString();
      try {
        await navigator.clipboard.writeText(link);
        els.copy.textContent = 'copied!';
        setTimeout(() => { els.copy.textContent = 'copy link'; }, 1500);
      } catch (e) {
        window.prompt('Copy this link:', link);
      }
    });

    document.addEventListener('keydown', e => {
      const tag = document.activeElement && document.activeElement.tagName;
      const typing = tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT';
      if (e.code === 'Space' && !typing) {
        e.preventDefault();
        audio() && audio().unlock();
        if (game.state === 'ready') game.drop();
        else if (game.state === 'landed') dropAgain();
      }
      if (e.key === 'Escape') {
        els.panel.classList.add('hidden');
        els.result.classList.add('hidden');
      }
    });

    // ---- Settings panel ----
    function updateCount() {
      const parsed = parseOptions(els.input.value);
      const n = parsed.length;
      const cats = new Set(parsed.map(o => o.category).filter(Boolean));
      els.count.textContent = `${n} option${n === 1 ? '' : 's'}` + (cats.size ? `, ${cats.size} categories` : '');
      els.setCats.disabled = cats.size < 2;
      els.setCatsNote.textContent = cats.size < 2 ? '(needs categories in the list)' : `(${cats.size} in the list)`;
    }
    function fillSettingsForm() {
      const s = game.settings;
      els.setBalls.value = s.balls;
      if (![...els.setRows.options].some(o => o.value === String(s.rows))) {
        const opt = document.createElement('option');
        opt.value = s.rows; opt.textContent = `Custom · ${s.rows} rows`;
        els.setRows.appendChild(opt);
      }
      els.setRows.value = String(s.rows);
      els.setSigns.checked = !!s.signs;
      els.setCats.checked = !!s.categories;
    }
    function readSettingsForm() {
      return {
        balls: parseInt(els.setBalls.value, 10) || 1,
        rows: parseInt(els.setRows.value, 10) || global.DEFAULT_SETTINGS.rows,
        signs: els.setSigns.checked,
        categories: els.setCats.checked,
      };
    }
    els.input.addEventListener('input', updateCount);
    els.settings.addEventListener('click', () => {
      els.input.value = serializeOptions(game.options);
      fillSettingsForm();
      updateCount();
      els.panel.classList.remove('hidden');
    });
    els.closeSettings.addEventListener('click', () => els.panel.classList.add('hidden'));
    els.save.addEventListener('click', () => {
      const options = parseOptions(els.input.value);
      if (options.length < 2) {
        els.count.textContent = 'Please enter at least two options.';
        return;
      }
      const settings = readSettingsForm();
      try {
        localStorage.setItem(OPTIONS_KEY, serializeOptions(options));
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch (e) { /* ignore */ }
      game.setSettings(settings);
      applyOptions(options);
      newRun();
      els.panel.classList.add('hidden');
    });
    els.reset.addEventListener('click', () => {
      try { localStorage.removeItem(OPTIONS_KEY); localStorage.removeItem(SETTINGS_KEY); } catch (e) { /* ignore */ }
      const { options } = loadOptions();
      game.setSettings({ ...global.DEFAULT_SETTINGS });
      els.input.value = serializeOptions(options);
      fillSettingsForm();
      updateCount();
      applyOptions(options);
      newRun();
    });

    // ---- Boot ----
    const { options } = loadOptions();
    // ?autodrop=1 starts the drop as soon as the page loads (nice for shared links).
    const autodrop = !!new URLSearchParams(location.search).get('autodrop');
    game.setSettings(loadSettings());
    applyOptions(options);
    newRun(seedFromUrl());
    if (autodrop) setTimeout(() => game.drop(), 600);
    refreshSoundButton();

    return { onState, onSign, onResult, newRun, updatePip };
  }

  global.UI = { create, parseOptions, serializeOptions, loadOptions, loadSettings };
})(window);

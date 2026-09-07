(function () {
  'use strict';

  const STORAGE_KEY = 'native-language-data-v2';
  const SETTINGS_KEY = 'native-language-settings-v1';
  const routes = ['today', 'words', 'dic', 'base', 'profile'];

  function $(selector, root = document) { return root.querySelector(selector); }
  function $$(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }

  const icons = {
    play: '<svg class="icon" aria-hidden="true"><use href="icons.svg#icon-play"></use></svg>',
    check: '<svg class="icon icon-small" aria-hidden="true"><use href="icons.svg#icon-check"></use></svg>',
    x: '<svg class="icon" aria-hidden="true"><use href="icons.svg#icon-x"></use></svg>',
    clipboard: '<svg class="icon" aria-hidden="true"><use href="icons.svg#icon-clipboard"></use></svg>',
    textbox: '<svg class="icon" aria-hidden="true"><use href="icons.svg#icon-textbox"></use></svg>',
    hourglass: '<svg class="icon icon-small" aria-hidden="true"><use href="icons.svg#icon-hourglass"></use></svg>'
  };

  let voiceList = [];
  let preferredVoice = null;

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return defaultSettings();
      const s = JSON.parse(raw);
      return Object.assign(defaultSettings(), s);
    } catch (e) {
      return defaultSettings();
    }
  }

  function defaultSettings() {
    return { rate: 0.9, pitch: 1.0 };
  }

  function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }

  function refreshVoices() {
    if (!window.speechSynthesis) return;
    voiceList = window.speechSynthesis.getVoices() || [];
    preferredVoice = pickSamantha(voiceList);
    if ($('#route-profile').classList.contains('active')) {
      renderProfile();
    }
  }

  function pickSamantha(voices) {
    if (!voices.length) return null;
    const samantha = voices.find(v => /samantha/i.test(v.name));
    if (samantha) return samantha;
    const enhanced = voices.find(v => /en[-_]us/i.test(v.lang) && /premium|enhanced|neural/i.test(v.name + ' ' + v.voiceURI));
    if (enhanced) return enhanced;
    return voices.find(v => /en[-_]us/i.test(v.lang)) || null;
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function formatDate(dateStr) {
    const [y, m, d] = dateStr.split('-');
    return `${d}.${m}.${y}`;
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { days: [] };
      const parsed = JSON.parse(raw);
      return { days: Array.isArray(parsed.days) ? parsed.days : [] };
    } catch (e) {
      return { days: [] };
    }
  }

  function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function getOrCreateToday(data) {
    const key = todayKey();
    let day = data.days.find(d => d.date === key);
    if (!day) {
      day = { date: key, words: [], createdAt: Date.now() };
      data.days.unshift(day);
    }
    return { data, day, key };
  }

  function ensureWords(day, terms) {
    terms.forEach(term => {
      term = term.trim().toLowerCase();
      if (!term) return;
      if (!day.words.find(w => w.term === term)) {
        day.words.push({ term, sentences: [], used: false });
      }
    });
    const map = new Map(day.words.map(w => [w.term, w]));
    const ordered = [];
    terms.forEach(term => {
      const t = term.trim().toLowerCase();
      if (t && map.has(t)) {
        ordered.push(map.get(t));
        map.delete(t);
      }
    });
    day.words = ordered.concat(Array.from(map.values()));
  }

  function speak(text) {
    if (!text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-US';
    const s = loadSettings();
    utter.rate = Number(s.rate) || 0.9;
    utter.pitch = Number(s.pitch) || 1.0;
    if (!preferredVoice) refreshVoices();
    if (preferredVoice) utter.voice = preferredVoice;
    window.speechSynthesis.speak(utter);
  }

  async function pasteToInput(name) {
    const input = document.querySelector(`[name="${name}"]`);
    if (!input) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        input.value = text.trim().split(/\s+/)[0];
        input.focus();
      }
    } catch (err) {
      input.focus();
    }
  }


  const AUTH_TOKEN_KEY = 'native-language-auth-v1';
  const AVATAR_KEY = 'native-language-avatar-v1';

  function base64UrlDecode(str) {
    str += new Array((4 - str.length % 4) % 4 + 1).join('=');
    return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  }

  function parseJwt(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      return JSON.parse(base64UrlDecode(parts[1]));
    } catch (e) {
      return null;
    }
  }

  function isTokenValid() {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return false;
    const payload = parseJwt(token);
    return !!payload && payload.exp * 1000 > Date.now();
  }

  function getAuthHeaders() {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    return token ? { 'Authorization': 'Bearer ' + token } : {};
  }

  function getAuthEmail() {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return '';
    const payload = parseJwt(token);
    return payload?.sub || '';
  }

  function showApp() {
    $('#loginOverlay').classList.add('hidden');
    $('#app').classList.remove('hidden');
    initRoute();
  }

  function showLogin(error = '') {
    $('#loginOverlay').classList.remove('hidden');
    $('#app').classList.add('hidden');
    $('#loginError').textContent = error;
  }

  async function login(email, password) {
    try {
      const res = await fetch('login.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const json = await res.json();
      if (!res.ok || !json.token) {
        showLogin(json.error || 'Sign in failed');
        return false;
      }
      localStorage.setItem(AUTH_TOKEN_KEY, json.token);
      showApp();
      return true;
    } catch (e) {
      showLogin('Network error');
      return false;
    }
  }

  async function generateSentences(term) {
    try {
      const res = await fetch('api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ word: term, count: 3 })
      });
      const json = await res.json();
      if (json.sentences && json.sentences.length) return json.sentences;
    } catch (e) {
      console.error('Generate failed', e);
    }
    return [
      `I often use the word "${term}" in my speech.`,
      `Can you say "${term}" again, please?`,
      `Today I learned the word "${term}".`
    ];
  }

  function navigate(route) {
    if (!routes.includes(route)) route = 'today';

    $$('.route').forEach(el => el.classList.remove('active'));
    $$('.nav-link').forEach(el => el.classList.remove('active'));

    const target = document.getElementById('route-' + route);
    if (target) target.classList.add('active');

    const navBtn = $(`.nav-link[data-route="${route}"]`);
    if (navBtn) navBtn.classList.add('active');

    history.replaceState({ route }, '', '#' + route);
    renderRoute(route);
  }

  function renderRoute(route) {
    switch (route) {
      case 'today': renderToday(); break;
      case 'words': renderWords(); break;
      case 'dic': renderDic(); break;
      case 'base': renderBase(); break;
      case 'profile': renderProfile(); break;
    }
  }

  function renderToday() {
    const data = loadData();
    const { day, key } = getOrCreateToday(data);
    $('#todayDate').textContent = formatDate(key);

    const empty = $('#todayEmpty');
    const wordsBlock = $('#todayWords');
    const list = $('#todayWordList');

    if (day.words.length === 0) {
      empty.classList.remove('hidden');
      wordsBlock.classList.add('hidden');
      return;
    }

    empty.classList.add('hidden');
    wordsBlock.classList.remove('hidden');

    list.innerHTML = day.words.map((w) => `
      <div class="word-card">
        <div class="word-card-head">
          <h3 class="word-title">${escapeHtml(w.term)}</h3>
          <button class="btn btn-icon btn-secondary" data-speak="${escapeHtml(w.term)}" type="button" aria-label="Speak">${icons.play}</button>
        </div>
        <div class="word-meta">
          <span class="word-status ${w.used ? 'used' : 'not-used'}">${w.used ? icons.check + ' Used today' : icons.hourglass + ' Not used yet'}</span>
          <span class="word-status not-used">${w.sentences.length} sentence${w.sentences.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    `).join('');
  }

  function renderWords() {
    const data = loadData();
    const { day } = getOrCreateToday(data);
    const container = $('#wordsList');

    if (day.words.length === 0) {
      container.innerHTML = `
        <div class="today-empty">
          <p class="empty-title">Add 3 words on the Today screen first.</p>
          <button class="cta" data-route="today" type="button">Add words</button>
        </div>`;
      return;
    }

    container.innerHTML = day.words.map((w, i) => `
      <div class="word-card" data-word-index="${i}">
        <div class="word-card-head">
          <h3 class="word-title">${escapeHtml(w.term)}</h3>
          <button class="btn btn-icon btn-secondary" data-speak="${escapeHtml(w.term)}" type="button" aria-label="Speak">${icons.play}</button>
        </div>

        <div class="sentences-block">
          <div class="sentences-list" id="sentences-${i}">
            ${w.sentences.length ? w.sentences.map((s, si) => sentenceHtml(s, i, si)).join('') : '<p style="margin:0;color:var(--slate-500);font-size:14px;">No sentences yet.</p>'}
          </div>
          <form class="add-sentence-form" data-action="sentence" data-index="${i}">
            <div class="input-with-clear">
              <input type="text" placeholder="Type your own sentence" required autocomplete="off" autocapitalize="sentences">
              <button type="button" class="input-clear" data-clear-sentence aria-label="Clear">${icons.x}</button>
            </div>
            <button type="submit" class="btn btn-primary btn-small">+ Add</button>
          </form>
        </div>

        <div class="word-controls">
          <button type="button" class="btn btn-secondary btn-small generate-btn" data-action="generate" data-index="${i}">
            ${icons.textbox} Generate examples
          </button>

          <label class="used-toggle">
            <input type="checkbox" data-action="used" data-index="${i}" ${w.used ? 'checked' : ''}>
            <span>I have used</span>
          </label>
        </div>
      </div>
    `).join('');
  }

  function sentenceHtml(text, wordIndex, sentenceIndex) {
    return `
      <div class="sentence-item">
        <span class="sentence-text">${escapeHtml(text)}</span>
        <div class="sentence-actions">
          <button class="btn btn-icon btn-secondary" data-speak="${escapeHtml(text)}" type="button" aria-label="Speak">${icons.play}</button>
          <button class="btn btn-icon btn-danger" data-action="delete-sentence" data-word="${wordIndex}" data-sentence="${sentenceIndex}" type="button" aria-label="Delete">${icons.x}</button>
        </div>
      </div>`;
  }

  function renderPractice() {
    const data = loadData();
    const { day } = getOrCreateToday(data);
    const container = $('#practiceCards');

    if (day.words.length === 0) {
      container.innerHTML = `
        <div class="today-empty">
          <p class="empty-title">Add today's words first.</p>
          <button class="cta" data-route="today" type="button">Add words</button>
        </div>`;
      return;
    }

    container.innerHTML = day.words.map((w, i) => `
      <div class="practice-card" data-practice-index="${i}">
        <p class="practice-word">${escapeHtml(w.term)}</p>
        <p class="practice-hint">Make a sentence with this word and say it aloud.</p>
        <div class="practice-actions">
          <button class="btn btn-secondary btn-small" data-speak="${escapeHtml(w.term)}" type="button">${icons.play} Listen</button>
          <button class="btn btn-primary btn-small" data-action="mark-used" data-index="${i}" type="button">${icons.check} I said it</button>
        </div>
      </div>
    `).join('');
  }

  function renderBase() {
    const data = loadData();
    const totalWords = data.days.reduce((sum, d) => sum + d.words.length, 0);
    const totalSentences = data.days.reduce((sum, d) => sum + d.words.reduce((s, w) => s + w.sentences.length, 0), 0);
    const totalUsed = data.days.reduce((sum, d) => sum + d.words.filter(w => w.used).length, 0);

    $('#baseStats').innerHTML = `
      <div class="stat-card"><div class="stat-value">${data.days.length}</div><div class="stat-label">Days studied</div></div>
      <div class="stat-card"><div class="stat-value">${totalWords}</div><div class="stat-label">Total words</div></div>
      <div class="stat-card"><div class="stat-value">${totalSentences}</div><div class="stat-label">Total sentences</div></div>
      <div class="stat-card"><div class="stat-value">${totalUsed}</div><div class="stat-label">Words used</div></div>
    `;

    const list = $('#baseList');
    if (data.days.length === 0) {
      list.innerHTML = '<div class="base-empty">No records yet. Start from Today.</div>';
      return;
    }

    list.innerHTML = data.days.map(day => {
      const used = day.words.filter(w => w.used).length;
      return `
        <article class="base-day">
          <div class="base-day-head">
            <h3 class="base-day-date">${formatDate(day.date)}</h3>
            <span class="base-day-count">${day.words.length} words · ${used} used · ${day.words.reduce((s, w) => s + w.sentences.length, 0)} sentences</span>
          </div>
          <div class="base-words">
            ${day.words.map(w => `
              <div class="base-word">
                <div class="base-word-head">
                  <span class="base-word-term">${escapeHtml(w.term)}</span>
                  <span class="base-word-status ${w.used ? '' : 'inactive'}">${w.used ? icons.check + ' used' : icons.hourglass + ' not used'}</span>
                </div>
                ${w.sentences.length ? `<ul class="base-sentences">${w.sentences.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : '<p style="margin:4px 0 0;font-size:14px;color:var(--slate-500);">No sentences yet.</p>'}
              </div>
            `).join('')}
          </div>
        </article>`;
    }).join('');
  }

  function renderDic() {
    const data = loadData();
    const allWords = [];
    data.days.forEach(day => {
      day.words.forEach(w => {
        allWords.push({ ...w, date: day.date });
      });
    });
    allWords.sort((a, b) => a.term.toLowerCase().localeCompare(b.term.toLowerCase()));

    const q = ($('#dicSearch')?.value || '').trim().toLowerCase();
    const filtered = q ? allWords.filter(w => w.term.toLowerCase().includes(q)) : allWords;

    const list = $('#dicList');
    if (!filtered.length) {
      list.innerHTML = `<div class="empty-state">
        <p class="empty-title">${allWords.length ? 'No words match your search.' : 'Your dictionary is empty.'}</p>
      </div>`;
      return;
    }

    list.innerHTML = filtered.map((w, i) => {
      const sentencesHtml = w.sentences.length
        ? w.sentences.map((s, si) => `
            <li class="dic-sentence">
              <button class="btn btn-icon btn-ghost dic-speak" data-speak="${escapeHtml(s)}" type="button" aria-label="Speak">${icons.play}</button>
              <span>${escapeHtml(s)}</span>
            </li>
          `).join('')
        : '<li class="dic-empty-sentences">No sentences yet.</li>';

      return `
        <article class="dic-item" data-dic-index="${i}">
          <button class="dic-header" type="button" aria-expanded="false">
            <span class="dic-word">${escapeHtml(w.term)}</span>
            <svg class="icon dic-chevron" aria-hidden="true"><use href="icons.svg#icon-chevron-down"></use></svg>
          </button>
          <div class="dic-body hidden">
            <div class="dic-toolbar">
              <button class="btn btn-secondary btn-small" data-speak="${escapeHtml(w.term)}" type="button">${icons.play} Listen</button>
              <span class="dic-date">Added ${formatDate(w.date)}</span>
            </div>
            <ul class="dic-sentences">${sentencesHtml}</ul>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderProfile() {
    const s = loadSettings();
    const email = getAuthEmail();

    const avatar = localStorage.getItem(AVATAR_KEY) || '';
    const avatarImg = $('#avatarImg');
    const avatarPlaceholder = $('#avatarPlaceholder');
    const profileEmail = $('#profileEmail');
    if (avatarImg) {
      avatarImg.src = avatar;
      avatarImg.classList.toggle('hidden', !avatar);
    }
    if (avatarPlaceholder) {
      avatarPlaceholder.classList.toggle('hidden', !!avatar);
    }
    if (profileEmail) {
      profileEmail.textContent = email;
    }

    $('#changePasswordError').textContent = '';
    $('#changePasswordSuccess').textContent = '';

    $('#ttsSettings').innerHTML = `
      <div class="settings-card">
        <h3 class="settings-title">Voice settings</h3>
        <p class="settings-subtitle">Samantha voice is used for the best iPhone experience.</p>

        <label class="setting-row">
          <span class="setting-label-text">Speed: <strong id="rateValue">${s.rate}</strong></span>
          <input type="range" id="ttsRate" min="0.5" max="1.5" step="0.05" value="${s.rate}">
        </label>

        <label class="setting-row">
          <span class="setting-label-text">Pitch: <strong id="pitchValue">${s.pitch}</strong></span>
          <input type="range" id="ttsPitch" min="0.5" max="1.5" step="0.05" value="${s.pitch}">
        </label>

        <button type="button" class="btn btn-secondary" id="testVoice">
          ${icons.play} Test voice
        </button>
        <p class="settings-hint" id="currentVoiceHint">Voice: ${preferredVoice ? preferredVoice.name : 'loading…'}</p>
      </div>
    `;
  }

  function calculateStreak(days) {
    if (!days.length) return 0;
    const sorted = days.map(d => d.date).sort();
    const today = todayKey();
    let streak = 0;
    let cursor = new Date();
    let attempts = 0;
    while (attempts < 365) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      if (sorted.includes(key)) {
        streak++;
      } else if (key !== today) {
        break;
      }
      cursor.setDate(cursor.getDate() - 1);
      attempts++;
    }
    return streak;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/\u003c/g, '&lt;')
      .replace(/\u003e/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function bindEvents() {
    document.body.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-route]');
      if (trigger) {
        e.preventDefault();
        navigate(trigger.dataset.route);
      }

      const clearBtn = e.target.closest('[data-clear]');
      if (clearBtn) {
        e.preventDefault();
        const input = document.querySelector(`[name="${clearBtn.dataset.clear}"]`);
        if (input) {
          input.value = '';
          input.focus();
        }
      }

      const clearSentenceBtn = e.target.closest('[data-clear-sentence]');
      if (clearSentenceBtn) {
        e.preventDefault();
        const input = clearSentenceBtn.closest('.input-with-clear')?.querySelector('input');
        if (input) {
          input.value = '';
          input.focus();
        }
      }

      const pasteBtn = e.target.closest('[data-paste]');
      if (pasteBtn) {
        e.preventDefault();
        pasteToInput(pasteBtn.dataset.paste);
      }

      const speakBtn = e.target.closest('[data-speak]');
      if (speakBtn) {
        e.preventDefault();
        speak(speakBtn.dataset.speak);
      }

      const markUsedBtn = e.target.closest('[data-action="mark-used"]');
      if (markUsedBtn) {
        e.preventDefault();
        const data = loadData();
        const { day } = getOrCreateToday(data);
        const idx = Number(markUsedBtn.dataset.index);
        if (day.words[idx]) {
          day.words[idx].used = true;
          saveData(data);
          renderToday();
        }
      }

      const dicHeader = e.target.closest('.dic-header');
      if (dicHeader) {
        e.preventDefault();
        const body = dicHeader.nextElementSibling;
        const isOpen = !body.classList.contains('hidden');
        body.classList.toggle('hidden', isOpen);
        dicHeader.setAttribute('aria-expanded', String(!isOpen));
        const chevron = dicHeader.querySelector('.dic-chevron');
        if (chevron) chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
      }

      const dicClear = e.target.closest('#dicSearchClear');
      if (dicClear) {
        e.preventDefault();
        const input = $('#dicSearch');
        if (input) {
          input.value = '';
          input.focus();
          renderDic();
        }
      }

      const genBtn = e.target.closest('[data-action="generate"]');
      if (genBtn) {
        e.preventDefault();
        const idx = Number(genBtn.dataset.index);
        const data = loadData();
        const { day } = getOrCreateToday(data);
        const word = day.words[idx];
        if (!word) return;

        genBtn.disabled = true;
        genBtn.innerHTML = icons.textbox + ' Generating…';

        generateSentences(word.term).then(sentences => {
          sentences.forEach(s => {
            if (!word.sentences.includes(s)) word.sentences.push(s);
          });
          saveData(data);
          renderWords();
        }).finally(() => {
          genBtn.disabled = false;
          genBtn.innerHTML = icons.textbox + ' Generate examples';
        });
      }
    });

    document.body.addEventListener('submit', (e) => {
      const form = e.target.closest('form');
      if (!form) return;

      if (form.id === 'todayForm') {
        e.preventDefault();
        const fd = new FormData(form);
        const terms = [fd.get('word1'), fd.get('word2'), fd.get('word3')];
        if (terms.filter(Boolean).length === 0) return;
        const data = loadData();
        const { day } = getOrCreateToday(data);
        ensureWords(day, terms);
        saveData(data);
        form.reset();
        navigate('words');
        return;
      }

      const action = form.dataset.action;
      const idx = Number(form.dataset.index);
      if (action === 'sentence') {
        e.preventDefault();
        const input = form.querySelector('.input-with-clear input');
        const text = input.value.trim();
        if (!text) return;
        const data = loadData();
        const { day } = getOrCreateToday(data);
        if (day.words[idx]) {
          day.words[idx].sentences.push(text);
          saveData(data);
          renderWords();
        }
      }
    });

    document.body.addEventListener('change', (e) => {
      const cb = e.target.closest('[data-action="used"]');
      if (cb) {
        const data = loadData();
        const { day } = getOrCreateToday(data);
        const idx = Number(cb.dataset.index);
        if (day.words[idx]) {
          day.words[idx].used = cb.checked;
          saveData(data);
          renderWords();
          renderRoute('today');
        }
      }
    });

    document.body.addEventListener('click', (e) => {
      const del = e.target.closest('[data-action="delete-sentence"]');
      if (del) {
        e.preventDefault();
        const data = loadData();
        const { day } = getOrCreateToday(data);
        const wIdx = Number(del.dataset.word);
        const sIdx = Number(del.dataset.sentence);
        if (day.words[wIdx]) {
          day.words[wIdx].sentences.splice(sIdx, 1);
          saveData(data);
          renderWords();
        }
      }
    });

    $('#exportData').addEventListener('click', () => {
      const data = loadData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `native-language-backup-${todayKey()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });

    $('#importData').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = JSON.parse(reader.result);
          if (!Array.isArray(imported.days)) throw new Error('bad format');
          if (!confirm(`Import ${imported.days.length} days? This will replace current data.`)) return;
          saveData(imported);
          alert('Data imported.');
          renderRoute(routes.find(r => $(`#route-${r}`).classList.contains('active')) || 'today');
        } catch (err) {
          alert('Could not import file.');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    $('#clearData').addEventListener('click', () => {
      if (!confirm('Delete ALL data? This cannot be undone.')) return;
      localStorage.removeItem(STORAGE_KEY);
      renderRoute(routes.find(r => $(`#route-${r}`).classList.contains('active')) || 'today');
    });

    // Dic search
    const dicSearch = $('#dicSearch');
    if (dicSearch) {
      let debounceTimer;
      dicSearch.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => renderDic(), 120);
      });
    }

    // TTS settings
    document.body.addEventListener('input', (e) => {
      const target = e.target;
      if (target.id === 'ttsRate' || target.id === 'ttsPitch') {
        const s = loadSettings();
        if (target.id === 'ttsRate') {
          s.rate = target.value;
          $('#rateValue').textContent = s.rate;
        }
        if (target.id === 'ttsPitch') {
          s.pitch = target.value;
          $('#pitchValue').textContent = s.pitch;
        }
        saveSettings(s);
      }
    });

    document.body.addEventListener('click', (e) => {
      if (e.target.closest('#testVoice')) {
        e.preventDefault();
        speak('Hello, this is your chosen voice on iPhone.');
      }
    });

    // Avatar upload
    const avatarInput = $('#avatarInput');
    if (avatarInput) {
      avatarInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          localStorage.setItem(AVATAR_KEY, reader.result);
          renderProfile();
        };
        reader.readAsDataURL(file);
      });
    }

    // Change password
    const changePasswordForm = $('#changePasswordForm');
    if (changePasswordForm) {
      changePasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        $('#changePasswordError').textContent = '';
        $('#changePasswordSuccess').textContent = '';
        const current = $('#currentPassword').value;
        const newPass = $('#newPassword').value;
        try {
          const res = await fetch('change-password.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ currentPassword: current, newPassword: newPass })
          });
          const json = await res.json();
          if (!res.ok) {
            $('#changePasswordError').textContent = json.error || 'Failed to update password';
            return;
          }
          $('#changePasswordSuccess').textContent = 'Password updated. Please sign in again.';
          changePasswordForm.reset();
        } catch (err) {
          $('#changePasswordError').textContent = 'Network error';
        }
      });
    }

    // Sign out
    const signOutBtn = $('#signOutBtn');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', () => {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        showLogin();
      });
    }
  }

  function initRoute() {
    const hash = window.location.hash.replace('#', '');
    navigate(hash || 'today');
  }

  if ('speechSynthesis' in window) {
    refreshVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = refreshVoices;
    }
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then(reg => console.log('SW registered:', reg.scope))
        .catch(err => console.error('SW failed:', err));
    });
  }

  window.addEventListener('popstate', initRoute);

  bindEvents();

  function init() {
    if (isTokenValid()) {
      showApp();
    } else {
      showLogin();
    }

    $('#loginForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const email = $('#loginEmail').value.trim();
      const password = $('#loginPassword').value;
      login(email, password);
    });
  }

  init();
})();

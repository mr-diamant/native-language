(function () {
  'use strict';

  const STORAGE_KEY = 'native-language-data-v2';
  const routes = ['today', 'words', 'practice', 'base', 'profile'];

  function $(selector, root = document) { return root.querySelector(selector); }
  function $$(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }

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
    utter.rate = 0.9;
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
      // Fallback: allow native paste if clipboard permission denied
      input.focus();
    }
  }

  async function generateSentences(term) {
    try {
      const res = await fetch('api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: term, count: 3 })
      });
      const json = await res.json();
      if (json.sentences && json.sentences.length) return json.sentences;
    } catch (e) {
      console.error('Generate failed', e);
    }
    // Fallback templates
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
      case 'practice': renderPractice(); break;
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
          <button class="btn btn-icon btn-secondary" data-speak="${escapeHtml(w.term)}" type="button" aria-label="Speak">🔊</button>
        </div>
        <div class="word-meta">
          <span class="word-status ${w.used ? 'used' : 'not-used'}">${w.used ? '✅ Used today' : '⏳ Not used yet'}</span>
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
          <button class="btn btn-icon btn-secondary" data-speak="${escapeHtml(w.term)}" type="button" aria-label="Speak">🔊</button>
        </div>

        <div class="sentences-block">
          <p class="sentences-title">My sentences</p>
          <div class="sentences-list" id="sentences-${i}">
            ${w.sentences.length ? w.sentences.map((s, si) => sentenceHtml(s, i, si)).join('') : '<p style="margin:0;color:var(--slate-500);font-size:14px;">No sentences yet.</p>'}
          </div>
          <form class="add-sentence-form" data-action="sentence" data-index="${i}">
            <div class="input-with-clear">
              <input type="text" placeholder="Type your own sentence" required autocomplete="off" autocapitalize="sentences">
              <button type="button" class="input-clear" data-clear-sentence aria-label="Clear">×</button>
            </div>
            <button type="submit" class="btn btn-primary btn-small">+ Add</button>
          </form>
        </div>

        <div class="generate-block">
          <button type="button" class="btn btn-secondary btn-small generate-btn" data-action="generate" data-index="${i}">
            ✨ Generate examples
          </button>
          <p class="generate-hint">Creates 3 simple English sentences with this word.</p>
        </div>

        <label class="used-toggle">
          <input type="checkbox" data-action="used" data-index="${i}" ${w.used ? 'checked' : ''}>
          <span>I have used this word today</span>
        </label>
      </div>
    `).join('');
  }

  function sentenceHtml(text, wordIndex, sentenceIndex) {
    return `
      <div class="sentence-item">
        <span class="sentence-text">${escapeHtml(text)}</span>
        <div class="sentence-actions">
          <button class="btn btn-icon btn-secondary" data-speak="${escapeHtml(text)}" type="button" aria-label="Speak">🔊</button>
          <button class="btn btn-icon btn-danger" data-action="delete-sentence" data-word="${wordIndex}" data-sentence="${sentenceIndex}" type="button" aria-label="Delete">×</button>
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
          <button class="btn btn-secondary btn-small" data-speak="${escapeHtml(w.term)}" type="button">🔊 Listen</button>
          <button class="btn btn-primary btn-small" data-action="mark-used" data-index="${i}" type="button">✅ I said it</button>
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
                  <span class="base-word-status ${w.used ? '' : 'inactive'}">${w.used ? '✅ used' : '⏳ not used'}</span>
                </div>
                ${w.sentences.length ? `<ul class="base-sentences">${w.sentences.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : '<p style="margin:4px 0 0;font-size:14px;color:var(--slate-500);">No sentences yet.</p>'}
              </div>
            `).join('')}
          </div>
        </article>`;
    }).join('');
  }

  function renderProfile() {
    const data = loadData();
    const totalWords = data.days.reduce((sum, d) => sum + d.words.length, 0);
    const totalSentences = data.days.reduce((sum, d) => sum + d.words.reduce((s, w) => s + w.sentences.length, 0), 0);
    const totalUsed = data.days.reduce((sum, d) => sum + d.words.filter(w => w.used).length, 0);
    const today = data.days.find(d => d.date === todayKey());
    const todayTotal = today ? today.words.length : 0;
    const todayUsed = today ? today.words.filter(w => w.used).length : 0;
    const streak = calculateStreak(data.days);

    $('#profileGrid').innerHTML = `
      <div class="stat-card"><div class="stat-value">${streak}</div><div class="stat-label">Streak days</div></div>
      <div class="stat-card"><div class="stat-value">${totalWords}</div><div class="stat-label">Total words</div></div>
      <div class="stat-card"><div class="stat-value">${totalSentences}</div><div class="stat-label">Total sentences</div></div>
      <div class="stat-card"><div class="stat-value">${totalUsed}</div><div class="stat-label">Words used</div></div>
      <div class="stat-card"><div class="stat-value">${todayUsed}/${todayTotal}</div><div class="stat-label">Used today</div></div>
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
          renderPractice();
          renderRoute('today');
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
        genBtn.textContent = '⏳ Generating…';

        generateSentences(word.term).then(sentences => {
          sentences.forEach(s => {
            if (!word.sentences.includes(s)) word.sentences.push(s);
          });
          saveData(data);
          renderWords();
        }).finally(() => {
          genBtn.disabled = false;
          genBtn.textContent = '✨ Generate examples';
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
  }

  function initRoute() {
    const hash = window.location.hash.replace('#', '');
    navigate(hash || 'today');
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
  initRoute();
})();

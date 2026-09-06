(function () {
  'use strict';

  const STORAGE_KEY = 'native-language-data-v1';
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
        day.words.push({ term, translate: '', sentences: [], used: false });
      }
    });
    // reorder to match input, keep extras
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

    const usedCount = day.words.filter(w => w.used).length;
    list.innerHTML = day.words.map((w, i) => `
      <div class="word-card">
        <div class="word-card-head">
          <h3 class="word-title">${escapeHtml(w.term)}</h3>
          <button class="btn btn-icon btn-secondary" data-speak="${escapeHtml(w.term)}" type="button" aria-label="Озвучить">🔊</button>
        </div>
        ${w.translate ? `<div class="translate-display"><span class="translate-label">Перевод</span> · ${escapeHtml(w.translate)}</div>` : '<div class="translate-display" style="background:transparent;padding:0;"><span class="translate-label">Перевод не добавлен</span></div>'}
        <div class="word-meta">
          <span class="word-status ${w.used ? 'used' : 'not-used'}">${w.used ? '✅ Использовал сегодня' : '⏳ Пока не использовал'}</span>
          <span class="word-status not-used">${w.sentences.length} предл.</span>
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
          <p class="empty-title">Сначала добавь 3 слова на главной «Сегодня».</p>
          <button class="cta" data-route="today" type="button">Добавить слова</button>
        </div>`;
      return;
    }

    container.innerHTML = day.words.map((w, i) => `
      <div class="word-card" data-word-index="${i}">
        <div class="word-card-head">
          <h3 class="word-title">${escapeHtml(w.term)}</h3>
          <button class="btn btn-icon btn-secondary" data-speak="${escapeHtml(w.term)}" type="button" aria-label="Озвучить">🔊</button>
        </div>

        <form class="translate-form" data-action="translate" data-index="${i}">
          <input type="text" class="translate-input" value="${escapeHtml(w.translate)}" placeholder="Перевод слова" required autocomplete="off">
          <button type="submit" class="btn btn-primary btn-small">Сохранить</button>
        </form>

        <div class="sentences-block">
          <p class="sentences-title">Мои предложения</p>
          <div class="sentences-list" id="sentences-${i}">
            ${w.sentences.length ? w.sentences.map((s, si) => sentenceHtml(s, i, si)).join('') : '<p style="margin:0;color:var(--slate-500);font-size:14px;">Пока нет предложений.</p>'}
          </div>
          <form class="add-sentence-form" data-action="sentence" data-index="${i}">
            <input type="text" placeholder="Составь предложение с этим словом" required autocomplete="off" autocapitalize="sentences">
            <button type="submit" class="btn btn-primary btn-small">+ Добавить</button>
          </form>
        </div>

        <label class="used-toggle">
          <input type="checkbox" data-action="used" data-index="${i}" ${w.used ? 'checked' : ''}>
          <span>Я уже использовал это слово сегодня</span>
        </label>
      </div>
    `).join('');
  }

  function sentenceHtml(text, wordIndex, sentenceIndex) {
    return `
      <div class="sentence-item">
        <span class="sentence-text">${escapeHtml(text)}</span>
        <div class="sentence-actions">
          <button class="btn btn-icon btn-secondary" data-speak="${escapeHtml(text)}" type="button" aria-label="Озвучить">🔊</button>
          <button class="btn btn-icon btn-danger" data-action="delete-sentence" data-word="${wordIndex}" data-sentence="${sentenceIndex}" type="button" aria-label="Удалить">×</button>
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
          <p class="empty-title">Сначала добавь сегодняшние слова.</p>
          <button class="cta" data-route="today" type="button">Добавить слова</button>
        </div>`;
      return;
    }

    container.innerHTML = day.words.map((w, i) => `
      <div class="practice-card" data-practice-index="${i}">
        <p class="practice-word">${escapeHtml(w.term)}</p>
        <p class="practice-translate hidden" id="practice-translate-${i}">${escapeHtml(w.translate || 'Перевод не добавлен')}</p>
        <div class="practice-actions">
          <button class="btn btn-secondary btn-small" data-action="show-translate" data-index="${i}" type="button">Показать перевод</button>
          <button class="btn btn-secondary btn-small" data-speak="${escapeHtml(w.term)}" type="button">🔊 Слушать</button>
          <button class="btn btn-primary btn-small" data-action="mark-used" data-index="${i}" type="button">✅ Я вспомнил / сказал</button>
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
      <div class="stat-card"><div class="stat-value">${data.days.length}</div><div class="stat-label">Дней учёбы</div></div>
      <div class="stat-card"><div class="stat-value">${totalWords}</div><div class="stat-label">Всего слов</div></div>
      <div class="stat-card"><div class="stat-value">${totalSentences}</div><div class="stat-label">Всего предложений</div></div>
      <div class="stat-card"><div class="stat-value">${totalUsed}</div><div class="stat-label">Использовано</div></div>
    `;

    const list = $('#baseList');
    if (data.days.length === 0) {
      list.innerHTML = '<div class="base-empty">Пока нет записей. Начни с главной «Сегодня».</div>';
      return;
    }

    list.innerHTML = data.days.map(day => {
      const used = day.words.filter(w => w.used).length;
      return `
        <article class="base-day">
          <div class="base-day-head">
            <h3 class="base-day-date">${formatDate(day.date)}</h3>
            <span class="base-day-count">${day.words.length} слов · ${used} использовано · ${day.words.reduce((s, w) => s + w.sentences.length, 0)} предл.</span>
          </div>
          <div class="base-words">
            ${day.words.map(w => `
              <div class="base-word">
                <div class="base-word-term">${escapeHtml(w.term)} ${w.used ? '✅' : ''}</div>
                ${w.translate ? `<div class="base-word-translate">${escapeHtml(w.translate)}</div>` : ''}
                ${w.sentences.length ? `<ul class="base-sentences">${w.sentences.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : ''}
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
      <div class="stat-card"><div class="stat-value">${streak}</div><div class="stat-label">Дней подряд</div></div>
      <div class="stat-card"><div class="stat-value">${totalWords}</div><div class="stat-label">Всего слов</div></div>
      <div class="stat-card"><div class="stat-value">${totalSentences}</div><div class="stat-label">Всего предложений</div></div>
      <div class="stat-card"><div class="stat-value">${totalUsed}</div><div class="stat-label">Использовано слов</div></div>
      <div class="stat-card"><div class="stat-value">${todayUsed}/${todayTotal}</div><div class="stat-label">Сегодня использовано</div></div>
    `;
  }

  function calculateStreak(days) {
    if (!days.length) return 0;
    const sorted = days.map(d => d.date).sort();
    const today = todayKey();
    let streak = 0;
    let cursor = new Date();
    const check = (date, key) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}` === key;
    };
    // allow streak if today is missing but yesterday existed (current day not over)
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

      const speakBtn = e.target.closest('[data-speak]');
      if (speakBtn) {
        e.preventDefault();
        speak(speakBtn.dataset.speak);
      }

      const showBtn = e.target.closest('[data-action="show-translate"]');
      if (showBtn) {
        e.preventDefault();
        const el = document.getElementById('practice-translate-' + showBtn.dataset.index);
        if (el) el.classList.remove('hidden');
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
        navigate('words');
        return;
      }

      const action = form.dataset.action;
      const idx = Number(form.dataset.index);
      if (action === 'translate') {
        e.preventDefault();
        const input = form.querySelector('.translate-input');
        const data = loadData();
        const { day } = getOrCreateToday(data);
        if (day.words[idx]) {
          day.words[idx].translate = input.value.trim();
          saveData(data);
          renderWords();
        }
      } else if (action === 'sentence') {
        e.preventDefault();
        const input = form.querySelector('input');
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
          if (!confirm(`Импортировать ${imported.days.length} дней? Это заменит текущие данные.`)) return;
          saveData(imported);
          alert('Данные импортированы.');
          renderRoute(routes.find(r => $(`#route-${r}`).classList.contains('active')) || 'today');
        } catch (err) {
          alert('Не удалось импортировать файл.');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    $('#clearData').addEventListener('click', () => {
      if (!confirm('Удалить ВСЕ данные? Это необратимо.')) return;
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

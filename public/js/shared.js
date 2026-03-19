// ============================================================
// Budget Peace — Shared Utilities
// Loaded before all page scripts.
// ============================================================

// Owner identity — fetched from server once on boot
let _ownerId = null;
let _demoMode = false;

function isDemoMode() {
  return _demoMode === true;
}

async function initIdentity() {
  const res = await fetch('/api/me');
  if (!res.ok) throw new Error('Failed to fetch owner identity');
  const data = await res.json();
  _ownerId = data.userId;
  return _ownerId;
}

function userId() {
  return _ownerId;
}

function localToday() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

// Active scenario — persisted on bp_users, loaded on boot
let _activeScenario = 'main';

function activeScenario() {
  return _activeScenario;
}

async function setScenario(scenarioId) {
  _activeScenario = scenarioId;
  // Persist to server (skip in demo mode)
  if (!isDemoMode()) {
    await fetch(`/api/users/${userId()}/active-scenario`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId }),
    });
  }
  // Invalidate scenario-scoped data
  Store.invalidate('periods');
  Store.invalidate('expenses');
  Store.invalidate('scenario');
  // Re-render current page
  const { page, params } = Router.parseHash(location.hash);
  Router.render(page, params);
  updateScenarioSelector();
}

// Time Travel — global viewDate override
let _serverToday = null;   // fetched from /api/runtime on boot
let _viewDate = null;      // null = real today (time travel off)

function effectiveToday() {
  return _viewDate || _serverToday || localToday();
}

function setViewDate(dateStr) {
  _viewDate = dateStr;
  const { page, params } = Router.parseHash(location.hash);
  Router.render(page, params);
  updateTimeTravelStrip();
}

function clearViewDate() {
  _viewDate = null;
  const { page, params } = Router.parseHash(location.hash);
  Router.render(page, params);
  updateTimeTravelStrip();
}

function isTimeTraveling() {
  return _viewDate !== null && _viewDate !== _serverToday;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtRange(p) {
  const fmt = s => new Date(s + 'T00:00:00Z')
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return `${fmt(p.startDate)} – ${fmt(p.endDate)}`;
}

// ============================================================
// Store — lightweight shared data cache
// Keys: user, periods, expenses, cards, goals, scenarios, scenario
// ============================================================

const Store = (() => {
  const _cache = {};      // key → data
  const _inflight = {};   // key → Promise (dedup concurrent fetches)

  const endpoints = {
    user:      () => `/api/users/${userId()}`,
    periods:   () => `/api/budgets/${userId()}?scenario=${_activeScenario}`,
    expenses:  () => `/api/expenses/${userId()}?scenario=${_activeScenario}`,
    cards:     () => `/api/cards/${userId()}`,
    goals:     () => `/api/goals/${userId()}`,
    scenarios: () => `/api/scenarios/${userId()}`,
    scenario:  () => `/api/scenarios/${userId()}/${_activeScenario}`,
  };

  async function _fetch(key) {
    const res = await fetch(endpoints[key]());
    if (!res.ok) throw new Error(`Store: failed to fetch ${key}`);
    return res.json();
  }

  async function get(key) {
    if (key in _cache) return _cache[key];
    if (!_inflight[key]) {
      _inflight[key] = _fetch(key).then(data => {
        _cache[key] = data;
        delete _inflight[key];
        return data;
      }).catch(err => {
        delete _inflight[key];
        throw err;
      });
    }
    return _inflight[key];
  }

  function set(key, data) {
    _cache[key] = data;
    delete _inflight[key];
  }

  function invalidate(key) {
    delete _cache[key];
    delete _inflight[key];
  }

  function invalidateAll() {
    for (const k of Object.keys(_cache)) delete _cache[k];
    for (const k of Object.keys(_inflight)) delete _inflight[k];
  }

  return { get, set, invalidate, invalidateAll };
})();

// Infer cadence from a period's date span.
function inferCadence(period) {
  const days = Math.round(
    (new Date(period.endDate + 'T00:00:00Z') - new Date(period.startDate + 'T00:00:00Z')) / 86400000
  ) + 1;
  return days <= 16 ? 'biweekly' : 'monthly';
}

// Stable integer multiplier for expense frequency within a period cadence.
function expMultiplier(expenseFreq, periodCadence) {
  if (periodCadence === 'biweekly') {
    return expenseFreq === 'weekly' ? 2 : 1;
  }
  if (expenseFreq === 'weekly') return 4;
  if (expenseFreq === 'biweekly') return 2;
  return 1;
}

// Returns true if a monthly expense's dueDay falls within a period's date range.
// Handles periods that span two calendar months (common with biweekly cadence).
// ---- Notes Widget ------------------------------------------

function notesCardHtml(prefix) {
  return `
    <div class="card notes-card" style="padding:var(--space-3) var(--space-4);">
      <div class="notes-header" id="${prefix}-notes-toggle">
        <span class="card-header" style="margin:0;">Notes</span>
        <span class="notes-count" id="${prefix}-notes-count"></span>
        <span class="notes-header__chevron" id="${prefix}-notes-chevron">&#9656;</span>
      </div>
      <div class="notes-body is-hidden" id="${prefix}-notes-body">
        <div class="notes-list" id="${prefix}-notes-list"></div>
        <div class="notes-add" id="${prefix}-notes-add">
          <input class="form-input" type="text" id="${prefix}-notes-input" placeholder="Add a note…" maxlength="200" />
          <button class="btn btn--primary" id="${prefix}-notes-add-btn" style="white-space:nowrap;">Add</button>
        </div>
      </div>
    </div>`;
}

function mountNotesWidget(prefix, scenarioId, initialNotes) {
  let notes = (initialNotes || []).slice();

  function render() {
    const countEl = document.getElementById(`${prefix}-notes-count`);
    const listEl = document.getElementById(`${prefix}-notes-list`);
    const addRow = document.getElementById(`${prefix}-notes-add`);
    if (!countEl || !listEl) return;

    countEl.textContent = notes.length ? notes.length : '';
    if (notes.length >= 10) countEl.textContent = '10/10';

    if (!notes.length) {
      listEl.innerHTML = '<div class="text-muted text-sm" style="padding:var(--space-1) 0;">No notes yet.</div>';
    } else {
      listEl.innerHTML = notes.map(n => `
        <div class="notes-item" data-note-id="${esc(n.id)}">
          <span class="notes-item__text">${esc(n.text)}</span>
          <button class="notes-item__edit" aria-label="Edit note">&#9998;</button>
          <button class="notes-item__del" aria-label="Delete note">&#128465;</button>
        </div>`).join('');

      listEl.querySelectorAll('.notes-item').forEach(item => {
        const noteId = item.dataset.noteId;
        item.querySelector('.notes-item__edit').addEventListener('click', (e) => {
          e.stopPropagation();
          startEdit(noteId, item);
        });
        item.querySelector('.notes-item__del').addEventListener('click', (e) => {
          e.stopPropagation();
          deleteNote(noteId);
        });
      });
    }

    if (addRow) addRow.style.display = notes.length >= 10 ? 'none' : '';
  }

  async function addNote() {
    const input = document.getElementById(`${prefix}-notes-input`);
    const text = (input.value || '').trim();
    if (!text) return;
    if (text.length > 200) { alert('Note must be 200 characters or less.'); return; }
    input.value = '';

    try {
      const res = await fetch(`/api/scenarios/${encodeURIComponent(userId())}/${encodeURIComponent(scenarioId)}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error('Add note failed');
      const data = await res.json();
      notes.push(data.note);
      Store.invalidate('scenario');
      render();
    } catch (err) {
      console.error(err);
      alert('Failed to add note.');
    }
  }

  async function deleteNote(noteId) {
    const removed = notes.find(n => n.id === noteId);
    notes = notes.filter(n => n.id !== noteId);
    render();

    try {
      const res = await fetch(`/api/scenarios/${encodeURIComponent(userId())}/${encodeURIComponent(scenarioId)}/notes/${encodeURIComponent(noteId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Delete note failed');
      Store.invalidate('scenario');
    } catch (err) {
      console.error(err);
      if (removed) notes.push(removed);
      render();
      alert('Failed to delete note.');
    }
  }

  function startEdit(noteId, item) {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    const textEl = item.querySelector('.notes-item__text');
    const editBtn = item.querySelector('.notes-item__edit');
    const delBtn = item.querySelector('.notes-item__del');
    const original = note.text;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'notes-item__input';
    input.value = original;
    input.maxLength = 200;
    textEl.replaceWith(input);
    if (editBtn) editBtn.style.display = 'none';
    if (delBtn) delBtn.style.display = 'none';
    input.focus();

    let saved = false;
    const save = () => {
      if (saved) return;
      saved = true;
      const newText = input.value.trim();
      if (!newText || newText === original) {
        render();
        return;
      }
      if (newText.length > 200) { alert('Note must be 200 characters or less.'); render(); return; }
      note.text = newText;
      render();
      editNote(noteId, newText, original);
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') { e.preventDefault(); render(); }
    });
    input.addEventListener('blur', save);
  }

  async function editNote(noteId, newText, oldText) {
    try {
      const res = await fetch(`/api/scenarios/${encodeURIComponent(userId())}/${encodeURIComponent(scenarioId)}/notes/${encodeURIComponent(noteId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newText }),
      });
      if (!res.ok) throw new Error('Edit note failed');
      Store.invalidate('scenario');
    } catch (err) {
      console.error(err);
      const note = notes.find(n => n.id === noteId);
      if (note) note.text = oldText;
      render();
      alert('Failed to update note.');
    }
  }

  // Toggle collapse
  document.getElementById(`${prefix}-notes-toggle`).addEventListener('click', () => {
    const body = document.getElementById(`${prefix}-notes-body`);
    const chevron = document.getElementById(`${prefix}-notes-chevron`);
    body.classList.toggle('is-hidden');
    chevron.innerHTML = body.classList.contains('is-hidden') ? '&#9656;' : '&#9662;';
  });

  // Add note handlers
  document.getElementById(`${prefix}-notes-add-btn`).addEventListener('click', addNote);
  document.getElementById(`${prefix}-notes-input`).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addNote(); }
  });

  render();
}

function dueDayInPeriod(dueDay, period) {
  const start = new Date(period.startDate + 'T00:00:00Z');
  const end   = new Date(period.endDate + 'T00:00:00Z');
  // Check each calendar month the period might touch (at most 2 for biweekly)
  let m = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  for (let i = 0; i < 2; i++) {
    const lastDay   = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)).getUTCDate();
    const actualDay = Math.min(dueDay, lastDay);
    const candidate = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), actualDay))
      .toISOString().split('T')[0];
    if (candidate >= period.startDate && candidate <= period.endDate) return true;
    m.setUTCMonth(m.getUTCMonth() + 1);
  }
  return false;
}

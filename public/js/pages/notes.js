// ============================================================
// Notes — Dedicated scenario-scoped notes page
// ============================================================

let _notesScenario = null;
let _notesList = [];

Router.register('notes', async () => {
  document.getElementById('page-title').textContent = 'Notes';
  setActivePage('notes');
  showBottomNav(true);
  showFab(false);

  // Plan gate: notes are Pro-only — show locked teaser for Basic
  if (!Plans.canUse('scenarioNotes')) {
    document.getElementById('main-content').innerHTML = `
      <div class="page" style="padding-top:var(--space-4);">
        <div class="card" style="text-align:center;padding:var(--space-5) var(--space-4);">
          <div style="font-size:32px;margin-bottom:var(--space-2);">&#9998;</div>
          <div style="font-size:var(--font-size-md);font-weight:var(--font-weight-bold);margin-bottom:var(--space-1);">Scenario Notes</div>
          <p class="text-muted text-sm" style="margin-bottom:var(--space-4);line-height:1.5;">
            Annotate your scenarios with context, reminders, and decisions.<br>
            Notes are available on Budget Peace Pro.
          </p>
          <button class="btn btn--primary" id="notes-upgrade">Upgrade to Pro</button>
        </div>
        <div class="card" style="padding:var(--space-3) var(--space-4);margin-top:var(--space-3);opacity:0.6;">
          <div class="notes-header" id="notes-locked-preview-toggle" style="cursor:pointer;">
            <span class="card-header" style="margin:0;">Notes</span>
            <span class="notes-count"></span>
            <span class="notes-header__chevron">&#9656;</span>
          </div>
          <div class="notes-body is-hidden" id="notes-locked-preview-body">
            <div class="text-muted text-sm" style="padding:var(--space-1) 0;">No notes yet.</div>
            <div class="notes-add">
              <input class="form-input" type="text" placeholder="Add a note…" maxlength="200" disabled style="opacity:0.5;" />
              <button class="btn btn--primary" id="notes-locked-add" style="white-space:nowrap;">Add</button>
            </div>
          </div>
        </div>
      </div>`;
    document.getElementById('notes-upgrade').addEventListener('click', () => Plans.showUpgradeModal(Plans.UPGRADE_CONTEXT.notes));
    document.getElementById('notes-locked-preview-toggle').addEventListener('click', () => {
      const body = document.getElementById('notes-locked-preview-body');
      const chevron = document.querySelector('#notes-locked-preview-toggle .notes-header__chevron');
      body.classList.toggle('is-hidden');
      chevron.innerHTML = body.classList.contains('is-hidden') ? '&#9656;' : '&#9662;';
    });
    document.getElementById('notes-locked-add')?.addEventListener('click', () => Plans.showUpgradeModal(Plans.UPGRADE_CONTEXT.notes));
    return;
  }

  document.getElementById('main-content').innerHTML = `
    <div class="page">
      <div class="text-muted text-sm text-center" style="padding:64px 0;">Loading…</div>
    </div>`;

  try {
    _notesScenario = await Store.get('scenario');
    _notesList = (_notesScenario.notes || []).slice();
    renderNotesPage();
  } catch (err) {
    console.error(err);
    document.getElementById('main-content').innerHTML = `
      <div class="page text-center" style="padding-top:64px;">
        <p class="text-muted text-sm">Failed to load notes.</p>
        <button class="btn btn--ghost" style="margin-top:var(--space-3);" onclick="Router.navigate('notes')">Try Again</button>
      </div>`;
  }
});

function renderNotesPage() {
  const count = _notesList.length;
  const atLimit = count >= 10;

  const listHtml = count
    ? _notesList.map(n => `
        <div class="notes-page-item" data-note-id="${esc(n.id)}">
          <span class="notes-page-item__text">${esc(n.text)}</span>
          <div class="notes-page-item__actions">
            <button class="notes-item__edit" aria-label="Edit note">&#9998;</button>
            <button class="notes-item__del" aria-label="Delete note">&#128465;</button>
          </div>
        </div>`).join('')
    : '<div class="text-muted text-sm" style="padding:var(--space-4) 0;">No notes yet. Add one below.</div>';

  document.getElementById('main-content').innerHTML = `
    <div class="page">
      <div class="text-muted text-sm" style="margin-bottom:var(--space-3);">
        ${count} note${count !== 1 ? 's' : ''}${atLimit ? ' (10/10)' : ''}
      </div>
      <div class="notes-page-list">${listHtml}</div>
      ${!atLimit ? `
      <div class="notes-add" style="margin-top:var(--space-4);">
        <input class="form-input" type="text" id="np-input" placeholder="Add a note…" maxlength="200" />
        <button class="btn btn--primary" id="np-add-btn" style="white-space:nowrap;">Add</button>
      </div>` : ''}
    </div>`;

  // Wire add
  document.getElementById('np-add-btn')?.addEventListener('click', npAddNote);
  document.getElementById('np-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); npAddNote(); }
  });

  // Wire edit + delete
  document.querySelectorAll('.notes-page-item').forEach(item => {
    const noteId = item.dataset.noteId;
    item.querySelector('.notes-item__edit').addEventListener('click', () => npStartEdit(noteId, item));
    item.querySelector('.notes-item__del').addEventListener('click', () => npDeleteNote(noteId));
  });
}

async function npAddNote() {
  // Plan gate: scenario notes are Pro-only
  if (!Plans.canUse('scenarioNotes')) {
    Plans.showUpgradeModal(Plans.UPGRADE_CONTEXT.notes);
    return;
  }

  const input = document.getElementById('np-input');
  const text = (input.value || '').trim();
  if (!text) return;
  if (text.length > 200) { alert('Note must be 200 characters or less.'); return; }
  input.value = '';

  try {
    const res = await authFetch(`/api/scenarios/${encodeURIComponent(userId())}/${encodeURIComponent(_notesScenario.scenarioId)}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error('Add note failed');
    const data = await res.json();
    _notesList.push(data.note);
    Store.invalidate('scenario');
    renderNotesPage();
  } catch (err) {
    console.error(err);
    alert('Failed to add note.');
  }
}

async function npDeleteNote(noteId) {
  const removed = _notesList.find(n => n.id === noteId);
  _notesList = _notesList.filter(n => n.id !== noteId);
  renderNotesPage();

  try {
    const res = await authFetch(`/api/scenarios/${encodeURIComponent(userId())}/${encodeURIComponent(_notesScenario.scenarioId)}/notes/${encodeURIComponent(noteId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Delete note failed');
    Store.invalidate('scenario');
  } catch (err) {
    console.error(err);
    if (removed) _notesList.push(removed);
    renderNotesPage();
    alert('Failed to delete note.');
  }
}

function npStartEdit(noteId, item) {
  const note = _notesList.find(n => n.id === noteId);
  if (!note) return;
  const textEl = item.querySelector('.notes-page-item__text');
  const actionsEl = item.querySelector('.notes-page-item__actions');
  const original = note.text;

  const textarea = document.createElement('textarea');
  textarea.className = 'form-input notes-page-item__textarea';
  textarea.value = original;
  textarea.maxLength = 200;
  textarea.rows = 2;
  textEl.replaceWith(textarea);
  actionsEl.style.display = 'none';
  textarea.focus();

  let saved = false;
  const save = () => {
    if (saved) return;
    saved = true;
    const newText = textarea.value.trim();
    if (!newText || newText === original) { renderNotesPage(); return; }
    if (newText.length > 200) { alert('Note must be 200 characters or less.'); renderNotesPage(); return; }
    note.text = newText;
    renderNotesPage();
    npEditNote(noteId, newText, original);
  };

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); renderNotesPage(); }
  });
  textarea.addEventListener('blur', save);
}

async function npEditNote(noteId, newText, oldText) {
  try {
    const res = await authFetch(`/api/scenarios/${encodeURIComponent(userId())}/${encodeURIComponent(_notesScenario.scenarioId)}/notes/${encodeURIComponent(noteId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: newText }),
    });
    if (!res.ok) throw new Error('Edit note failed');
    Store.invalidate('scenario');
  } catch (err) {
    console.error(err);
    const note = _notesList.find(n => n.id === noteId);
    if (note) note.text = oldText;
    renderNotesPage();
    alert('Failed to update note.');
  }
}

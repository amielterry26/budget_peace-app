// ============================================================
// Notes & Purchases page
// ============================================================

let _notesScenario  = null;
let _notesList      = [];
let _purchasesList  = [];
let _expandedPurchaseId = null;

Router.register('notes', async () => {
  document.getElementById('page-title').textContent = 'Notes & Purchases';
  setActivePage('notes');
  showBottomNav(true);
  showFab(false);

  document.getElementById('main-content').innerHTML = `
    <div class="page" style="padding-top:var(--space-4);">
      <div class="text-muted text-sm text-center" style="padding:64px 0;">Loading…</div>
    </div>`;

  try {
    // Always load purchases (not plan-gated)
    _purchasesList = await Store.get('purchases');

    // Notes are Pro-only — load if allowed
    if (Plans.canUse('scenarioNotes')) {
      _notesScenario = await Store.get('scenario');
      _notesList = (_notesScenario.notes || []).slice();
    } else {
      _notesScenario = null;
      _notesList = [];
    }

    renderPage();
  } catch (err) {
    console.error(err);
    document.getElementById('main-content').innerHTML = `
      <div class="page text-center" style="padding-top:64px;">
        <p class="text-muted text-sm">Failed to load.</p>
        <button class="btn btn--ghost" style="margin-top:var(--space-3);" onclick="Router.navigate('notes')">Try Again</button>
      </div>`;
  }
});

// ============================================================
// Render
// ============================================================

function renderPage() {
  document.getElementById('main-content').innerHTML = `
    <div class="page">
      ${renderNotesSection()}
      ${renderPurchasesSection()}
    </div>`;

  wireNotesEvents();
  wirePurchasesEvents();
}

// ---- Notes section -----------------------------------------

function renderNotesSection() {
  if (!Plans.canUse('scenarioNotes')) {
    return `
      <div class="card" style="margin-bottom:var(--space-4);">
        <div class="section-title" style="margin-bottom:var(--space-2);">Notes</div>
        <p class="text-muted text-sm" style="margin-bottom:var(--space-3);line-height:1.5;">
          Annotate your scenarios with context, reminders, and decisions.<br>
          Notes are available on Budget Peace Pro.
        </p>
        <button class="btn btn--primary btn--full" id="notes-upgrade">Upgrade to Pro</button>
      </div>`;
  }

  const count   = _notesList.length;
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
    : '<div class="text-muted text-sm" style="padding:var(--space-3) 0;">No notes yet. Add one below.</div>';

  return `
    <div style="margin-bottom:var(--space-5);">
      <div class="section-title" style="margin-bottom:var(--space-2);">
        Notes <span class="text-muted" style="font-weight:normal;font-size:var(--font-size-sm);">${count}${atLimit ? '/10' : ''}</span>
      </div>
      <div class="notes-page-list">${listHtml}</div>
      ${!atLimit ? `
      <div class="notes-add" style="margin-top:var(--space-3);">
        <input class="form-input" type="text" id="np-input" placeholder="Add a note…" maxlength="200" />
        <button class="btn btn--primary" id="np-add-btn" style="white-space:nowrap;">Add</button>
      </div>` : ''}
    </div>`;
}

function wireNotesEvents() {
  document.getElementById('notes-upgrade')?.addEventListener('click', () => Plans.showUpgradeModal(Plans.UPGRADE_CONTEXT.notes));
  document.getElementById('np-add-btn')?.addEventListener('click', npAddNote);
  document.getElementById('np-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); npAddNote(); }
  });
  document.querySelectorAll('.notes-page-item').forEach(item => {
    const noteId = item.dataset.noteId;
    item.querySelector('.notes-item__edit').addEventListener('click', () => npStartEdit(noteId, item));
    item.querySelector('.notes-item__del').addEventListener('click', () => npDeleteNote(noteId));
  });
}

// ---- Purchases section -------------------------------------

function renderPurchasesSection() {
  const list = _purchasesList;

  const rowsHtml = list.length
    ? list.map(p => renderPurchaseRow(p)).join('')
    : '<div class="text-muted text-sm" style="padding:var(--space-3) 0;">No purchases yet.</div>';

  return `
    <div>
      <div class="section-title" style="margin-bottom:var(--space-2);">One-Time Purchases</div>
      <div class="purchases-list" id="purchases-list">${rowsHtml}</div>
      <button class="btn btn--ghost" id="purchase-add-btn" style="margin-top:var(--space-3);width:100%;">+ Add Purchase</button>
    </div>`;
}

function renderPurchaseRow(p) {
  const isExpanded = _expandedPurchaseId === p.purchaseId;
  const priceStr   = p.price != null ? `~$${Number(p.price).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : '';
  const dateStr    = p.targetDate ? fmtPurchaseDate(p.targetDate) : '';

  const collapsedHtml = `
    <div class="purchase-row__collapsed">
      <div class="purchase-row__left">
        <span class="purchase-row__name">${esc(p.name)}</span>
        ${dateStr ? `<span class="purchase-row__date text-muted text-xs">${esc(dateStr)}</span>` : ''}
      </div>
      <div class="purchase-row__right">
        ${priceStr ? `<span class="purchase-row__price">${esc(priceStr)}</span>` : ''}
        <span class="purchase-row__chevron">${isExpanded ? '&#9662;' : '&#9656;'}</span>
      </div>
    </div>`;

  const expandedHtml = isExpanded ? `
    <div class="purchase-row__expanded">
      ${p.note  ? `<p class="purchase-row__note text-sm">${esc(p.note)}</p>` : ''}
      ${p.link  ? `<a class="purchase-row__link text-sm" href="${esc(p.link)}" target="_blank" rel="noopener noreferrer">View link ↗</a>` : ''}
      <div class="purchase-row__actions">
        <button class="btn btn--ghost purchase-edit-btn" data-id="${esc(p.purchaseId)}">Edit</button>
        <button class="btn btn--ghost purchase-archive-btn" data-id="${esc(p.purchaseId)}" style="color:var(--color-text-secondary);">Archive</button>
      </div>
    </div>` : '';

  return `
    <div class="purchase-row ${isExpanded ? 'is-expanded' : ''}" data-id="${esc(p.purchaseId)}">
      ${collapsedHtml}
      ${expandedHtml}
    </div>`;
}

function fmtPurchaseDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function wirePurchasesEvents() {
  document.getElementById('purchase-add-btn')?.addEventListener('click', () => openPurchaseSheet(null));

  document.querySelectorAll('.purchase-row').forEach(row => {
    const id = row.dataset.id;

    // Expand/collapse on row tap (but not on button taps)
    row.querySelector('.purchase-row__collapsed').addEventListener('click', () => {
      _expandedPurchaseId = _expandedPurchaseId === id ? null : id;
      rerenderPurchasesList();
    });

    row.querySelector('.purchase-edit-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = _purchasesList.find(x => x.purchaseId === id);
      if (p) openPurchaseSheet(p);
    });

    row.querySelector('.purchase-archive-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmArchivePurchase(id);
    });
  });
}

function rerenderPurchasesList() {
  const container = document.getElementById('purchases-list');
  if (!container) return;
  container.innerHTML = _purchasesList.map(p => renderPurchaseRow(p)).join('') ||
    '<div class="text-muted text-sm" style="padding:var(--space-3) 0;">No purchases yet.</div>';
  // Re-wire only the purchases list events
  document.querySelectorAll('.purchase-row').forEach(row => {
    const id = row.dataset.id;
    row.querySelector('.purchase-row__collapsed').addEventListener('click', () => {
      _expandedPurchaseId = _expandedPurchaseId === id ? null : id;
      rerenderPurchasesList();
    });
    row.querySelector('.purchase-edit-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = _purchasesList.find(x => x.purchaseId === id);
      if (p) openPurchaseSheet(p);
    });
    row.querySelector('.purchase-archive-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmArchivePurchase(id);
    });
  });
}

// ============================================================
// Archive confirmation (lightweight inline confirm)
// ============================================================

function confirmArchivePurchase(purchaseId) {
  const row = document.querySelector(`.purchase-row[data-id="${CSS.escape(purchaseId)}"]`);
  if (!row) return;

  // Replace the actions area with an inline confirm prompt
  const actionsEl = row.querySelector('.purchase-row__actions');
  if (!actionsEl) return;

  actionsEl.innerHTML = `
    <span class="text-sm text-muted" style="margin-right:var(--space-2);">Archive this?</span>
    <button class="btn btn--ghost archive-confirm-yes" style="color:var(--color-danger);">Yes, archive</button>
    <button class="btn btn--ghost archive-confirm-no">Cancel</button>`;

  actionsEl.querySelector('.archive-confirm-yes').addEventListener('click', (e) => {
    e.stopPropagation();
    doArchivePurchase(purchaseId);
  });
  actionsEl.querySelector('.archive-confirm-no').addEventListener('click', (e) => {
    e.stopPropagation();
    rerenderPurchasesList();
  });
}

async function doArchivePurchase(purchaseId) {
  try {
    const res = await authFetch(`/api/purchases/${encodeURIComponent(userId())}/${encodeURIComponent(purchaseId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archivedAt: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error('Archive failed');
    Store.invalidate('purchases');
    _purchasesList = _purchasesList.filter(p => p.purchaseId !== purchaseId);
    _expandedPurchaseId = null;
    rerenderPurchasesList();
  } catch (err) {
    console.error(err);
    rerenderPurchasesList();
    alert('Failed to archive purchase.');
  }
}

// ============================================================
// Add / Edit sheet
// ============================================================

function openPurchaseSheet(purchase) {
  const isEdit = !!purchase;
  const p = purchase || {};

  document.body.insertAdjacentHTML('beforeend', `
    <div id="purchase-sheet-overlay" class="sheet-overlay"></div>
    <div id="purchase-sheet" class="sheet">
      <div class="sheet__handle"></div>
      <div class="sheet__title">${isEdit ? 'Edit Purchase' : 'Add Purchase'}</div>
      <div class="form-group">
        <label class="form-label" for="ps-name">Name <span style="color:var(--color-danger);">*</span></label>
        <input class="form-input" type="text" id="ps-name" placeholder="e.g. Mini Fridge" maxlength="100" value="${esc(p.name || '')}" />
      </div>
      <div class="form-group">
        <label class="form-label" for="ps-price">Estimated Price</label>
        <input class="form-input" type="number" id="ps-price" placeholder="e.g. 180" min="0" step="0.01" value="${p.price != null ? p.price : ''}" />
      </div>
      <div class="form-group">
        <label class="form-label" for="ps-target-date">Target Date (optional)</label>
        <input class="form-input" type="date" id="ps-target-date" value="${esc(p.targetDate || '')}" />
      </div>
      <div class="form-group">
        <label class="form-label" for="ps-link">Link (optional)</label>
        <input class="form-input" type="url" id="ps-link" placeholder="https://..." value="${esc(p.link || '')}" />
      </div>
      <div class="form-group">
        <label class="form-label" for="ps-note">Note (optional)</label>
        <textarea class="form-input" id="ps-note" rows="2" maxlength="300" placeholder="Any context…">${esc(p.note || '')}</textarea>
      </div>
      <div style="display:flex;gap:var(--space-2);margin-top:var(--space-4);">
        <button class="btn btn--ghost" id="ps-cancel" style="flex:1;">Cancel</button>
        <button class="btn btn--primary" id="ps-save" style="flex:2;">${isEdit ? 'Save Changes' : 'Add Purchase'}</button>
      </div>
    </div>`);

  requestAnimationFrame(() => {
    document.getElementById('purchase-sheet-overlay').classList.add('is-open');
    document.getElementById('purchase-sheet').classList.add('is-open');
    document.getElementById('ps-name').focus();
  });

  const closeSheet = () => {
    document.getElementById('purchase-sheet-overlay').classList.remove('is-open');
    const s = document.getElementById('purchase-sheet');
    s.classList.remove('is-open');
    s.addEventListener('transitionend', () => {
      document.getElementById('purchase-sheet-overlay')?.remove();
      document.getElementById('purchase-sheet')?.remove();
    }, { once: true });
  };

  document.getElementById('ps-cancel').addEventListener('click', closeSheet);
  document.getElementById('purchase-sheet-overlay').addEventListener('click', closeSheet);

  document.getElementById('ps-save').addEventListener('click', async () => {
    const name = document.getElementById('ps-name').value.trim();
    if (!name) { document.getElementById('ps-name').focus(); return; }

    const priceRaw = document.getElementById('ps-price').value.trim();
    const payload  = {
      name,
      price:      priceRaw !== '' ? Number(priceRaw) : null,
      targetDate: document.getElementById('ps-target-date').value || '',
      link:       document.getElementById('ps-link').value.trim(),
      note:       document.getElementById('ps-note').value.trim(),
    };

    const btn = document.getElementById('ps-save');
    btn.disabled = true;
    btn.textContent = isEdit ? 'Saving…' : 'Adding…';

    try {
      if (isEdit) {
        const res = await authFetch(`/api/purchases/${encodeURIComponent(userId())}/${encodeURIComponent(p.purchaseId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Save failed');
        const updated = await res.json();
        const idx = _purchasesList.findIndex(x => x.purchaseId === p.purchaseId);
        if (idx !== -1) _purchasesList[idx] = updated;
      } else {
        const res = await authFetch('/api/purchases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: userId(), scenarioId: activeScenario(), ...payload }),
        });
        if (!res.ok) throw new Error('Create failed');
        const created = await res.json();
        _purchasesList.push(created);
      }
      Store.invalidate('purchases');
      closeSheet();
      rerenderPurchasesList();
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      btn.textContent = isEdit ? 'Save Changes' : 'Add Purchase';
      alert('Failed to save purchase.');
    }
  });
}

// ============================================================
// Notes functions (unchanged from original)
// ============================================================

async function npAddNote() {
  if (!Plans.canUse('scenarioNotes')) {
    Plans.showUpgradeModal(Plans.UPGRADE_CONTEXT.notes);
    return;
  }
  const input = document.getElementById('np-input');
  const text  = (input.value || '').trim();
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
    renderPage();
  } catch (err) {
    console.error(err);
    alert('Failed to add note.');
  }
}

async function npDeleteNote(noteId) {
  const removed = _notesList.find(n => n.id === noteId);
  _notesList = _notesList.filter(n => n.id !== noteId);
  renderPage();

  try {
    const res = await authFetch(`/api/scenarios/${encodeURIComponent(userId())}/${encodeURIComponent(_notesScenario.scenarioId)}/notes/${encodeURIComponent(noteId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Delete note failed');
    Store.invalidate('scenario');
  } catch (err) {
    console.error(err);
    if (removed) _notesList.push(removed);
    renderPage();
    alert('Failed to delete note.');
  }
}

function npStartEdit(noteId, item) {
  const note = _notesList.find(n => n.id === noteId);
  if (!note) return;
  const textEl    = item.querySelector('.notes-page-item__text');
  const actionsEl = item.querySelector('.notes-page-item__actions');
  const original  = note.text;

  const textarea    = document.createElement('textarea');
  textarea.className = 'form-input notes-page-item__textarea';
  textarea.value    = original;
  textarea.maxLength = 200;
  textarea.rows     = 2;
  textEl.replaceWith(textarea);
  actionsEl.style.display = 'none';
  textarea.focus();

  let saved = false;
  const save = () => {
    if (saved) return;
    saved = true;
    const newText = textarea.value.trim();
    if (!newText || newText === original) { renderPage(); return; }
    if (newText.length > 200) { alert('Note must be 200 characters or less.'); renderPage(); return; }
    note.text = newText;
    renderPage();
    npEditNote(noteId, newText, original);
  };

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); renderPage(); }
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
    renderPage();
    alert('Failed to update note.');
  }
}

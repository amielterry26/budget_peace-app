// ============================================================
// Cards page
// ============================================================

let _cards         = [];
let _cardExpenses  = [];
let _selectedCard  = null;
let _banks         = [];
let _selectedBank  = null; // null = All Banks

const CARD_PALETTES = [
  'linear-gradient(135deg, #1C1C2E 0%, #2D3561 100%)',
  'linear-gradient(135deg, #0F4C75 0%, #1B262C 100%)',
  'linear-gradient(135deg, #375C42 0%, #1E3A24 100%)',
  'linear-gradient(135deg, #6B3FA0 0%, #3D1B6E 100%)',
  'linear-gradient(135deg, #B5451B 0%, #7A1A0E 100%)',
  'linear-gradient(135deg, #1B4B82 0%, #0A2647 100%)',
  'linear-gradient(135deg, #111111 0%, #2C2C2C 100%)',  // Black
  'linear-gradient(135deg, #C0C0C0 0%, #8A9BA8 100%)',  // Silver
];

const BANK_COLORS = [
  { label: 'Blue',   value: '#3B82F6' },
  { label: 'Green',  value: '#22C55E' },
  { label: 'Purple', value: '#8B5CF6' },
  { label: 'Orange', value: '#F97316' },
  { label: 'Red',    value: '#EF4444' },
  { label: 'Gray',   value: '#6B7280' },
];
const BANK_COLOR_DEFAULT = '#6B7280';

Router.register('cards', async () => {
  document.getElementById('page-title').textContent = 'Cards';
  setActivePage('cards');
  showBottomNav(true);
  showFab(true);

  document.getElementById('main-content').innerHTML = `
    <div class="page">
      <div class="text-muted text-sm text-center" style="padding:64px 0;">Loading…</div>
    </div>`;

  try {
    await loadCards();
    renderCardsPage();
    document.getElementById('fab').onclick = () => openCardSheet(null);
  } catch (err) {
    console.error(err);
    document.getElementById('main-content').innerHTML = `
      <div class="page text-center" style="padding-top:64px;">
        <p class="text-muted text-sm">Failed to load cards.</p>
        <button class="btn btn--ghost" style="margin-top:var(--space-3);" onclick="Router.navigate('cards')">Try Again</button>
      </div>`;
  }
});

// ---- Data --------------------------------------------------

async function loadCards() {
  [_cards, _cardExpenses, _banks] = await Promise.all([
    Store.get('cards'),
    Store.get('expenses'),
    Store.get('banks'),
  ]);
  if (_cards.length && !_selectedCard) _selectedCard = _cards[0].cardId;
}

// ---- Render ------------------------------------------------

function renderCardsPage() {
  const content = document.getElementById('main-content');

  // Filter by selected bank
  const visibleCards = _selectedBank
    ? _cards.filter(c => c.bankId === _selectedBank)
    : _cards;

  // Keep selected card in sync with visible set
  if (!_selectedCard && visibleCards.length) {
    _selectedCard = visibleCards[0].cardId;
  } else if (_selectedCard && !visibleCards.find(c => c.cardId === _selectedCard)) {
    _selectedCard = visibleCards.length ? visibleCards[0].cardId : null;
  }

  // Bank filter chips
  const bankChipsHtml = `
    <div class="bank-tabs">
      <div class="bank-tabs__chips">
        <button class="cmp-chip ${!_selectedBank ? 'is-selected' : ''}" data-bankid="">All Banks</button>
        ${_banks.map(b => `<button class="cmp-chip ${_selectedBank === b.bankId ? 'is-selected' : ''}" data-bankid="${esc(b.bankId)}">${esc(b.name)}</button>`).join('')}
      </div>
      <button class="btn btn--ghost" id="manage-banks-btn" style="font-size:12px;padding:5px 12px;flex-shrink:0;white-space:nowrap;">+ Add Bank</button>
    </div>`;

  const walletItems = visibleCards.map((c) => `
    <div class="wallet-card ${_selectedCard === c.cardId ? 'is-selected' : ''}"
      id="wcard-${c.cardId}"
      style="background:${CARD_PALETTES[c.colorIndex % CARD_PALETTES.length]}">
      <div class="wallet-card__type">${c.type}</div>
      <div>
        <div class="wallet-card__number">•••• •••• •••• ${esc(c.lastFour)}</div>
        <div class="wallet-card__name">${esc(c.name)}</div>
      </div>
    </div>`).join('');

  const emptySlot = `
    <div class="wallet-empty" id="add-card-tile">
      <div class="wallet-empty__icon">＋</div>
      <div class="wallet-empty__label">Add a card</div>
    </div>`;

  content.innerHTML = `
    <div class="page">
      ${bankChipsHtml}
      <div class="wallet-row">${walletItems}${emptySlot}</div>
      <div id="card-detail-area"></div>
    </div>`;

  // Wire bank chips
  document.querySelectorAll('.bank-tabs__chips .cmp-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      _selectedBank = chip.dataset.bankid || null;
      renderCardsPage();
      document.getElementById('fab').onclick = () => openCardSheet(null);
    });
  });

  document.getElementById('manage-banks-btn').addEventListener('click', () => openBankSheet());

  visibleCards.forEach(c => {
    document.getElementById(`wcard-${c.cardId}`)?.addEventListener('click', () => {
      _selectedCard = c.cardId;
      renderCardsPage();
    });
  });

  document.getElementById('add-card-tile').addEventListener('click', () => openCardSheet(null));

  if (_selectedCard) renderCardDetail(_selectedCard);
}

function renderCardDetail(cardId) {
  const card     = _cards.find(c => c.cardId === cardId);
  const expenses = _cardExpenses.filter(e => e.cardId === cardId);
  const total    = expenses.reduce((s, e) => s + e.amount, 0);
  const area     = document.getElementById('card-detail-area');
  if (!card || !area) return;

  const rows = expenses.length
    ? expenses.map(e => `
        <div class="pill-item">
          <span class="pill-item__label">${esc(e.name)}</span>
          <span class="text-xs text-muted">${e.recurrence === 'recurring' ? 'recurring' : 'one time'}</span>
          <span class="pill-item__amount">${money(e.amount)}</span>
        </div>`).join('')
    : `<div class="text-muted text-sm text-center" style="padding:24px 0;">No expenses on this card.</div>`;

  area.innerHTML = `
    <div class="text-muted text-xs" style="padding:var(--space-3) var(--space-4) 0;letter-spacing:0.02em;">Viewing: <strong style="color:var(--color-text);">${esc(card.name)} •••• ${esc(card.lastFour)}</strong></div>
    <div class="card-detail">
      <div class="card-detail__header">
        <div>
          <div class="section-title" style="margin:0 0 2px;">Total on card</div>
          <div style="font-size:22px;font-weight:700;letter-spacing:-0.03em;">${money(total)}</div>
        </div>
        <div class="card-detail__actions">
          <button class="btn btn--ghost" id="edit-card-btn" style="font-size:13px;padding:8px 14px;">Edit</button>
          <button class="btn btn--danger" id="del-card-btn"  style="font-size:13px;padding:8px 14px;">Delete</button>
        </div>
      </div>
      <div class="stack--2" style="padding:var(--space-4) var(--space-4);">${rows}</div>
    </div>`;

  document.getElementById('edit-card-btn').addEventListener('click', () => openCardSheet(card));
  document.getElementById('del-card-btn').addEventListener('click', () => confirmDeleteCard(card));
}

// ---- Sheet (Add / Edit Card) --------------------------------

function openCardSheet(card) {
  const editing = !!card;

  const bankOptions = `
    <option value="">— No bank —</option>
    ${_banks.map(b => `<option value="${b.bankId}" ${editing && card.bankId === b.bankId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}`;

  document.body.insertAdjacentHTML('beforeend', `
    <div id="card-sheet-overlay" class="sheet-overlay"></div>
    <div id="card-sheet" class="sheet">
      <div class="sheet__handle"></div>
      <div class="sheet__title">${editing ? 'Edit Card' : 'New Card'}</div>
      <div class="stack--4">
        <div class="form-group">
          <label class="form-label" for="cs-name">Card name</label>
          <input class="form-input" id="cs-name" type="text" placeholder="e.g. Chase Sapphire"
            value="${editing ? esc(card.name) : ''}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="cs-lastfour">Last 4 digits</label>
          <input class="form-input" id="cs-lastfour" type="text" inputmode="numeric"
            maxlength="4" placeholder="0000"
            value="${editing ? esc(card.lastFour) : ''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Type</label>
          <div class="option-grid option-grid--2">
            <div class="option-card ${!editing || card.type === 'Debit' ? 'is-selected' : ''}" data-val="Debit">
              <div class="option-card__title">Debit</div>
            </div>
            <div class="option-card ${editing && card.type === 'Credit' ? 'is-selected' : ''}" data-val="Credit">
              <div class="option-card__title">Credit</div>
            </div>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Color</label>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            ${CARD_PALETTES.map((bg, i) => `
              <div class="color-swatch ${(!editing && i === 0) || (editing && card.colorIndex === i) ? 'is-selected' : ''}"
                data-idx="${i}"
                style="width:36px;height:36px;border-radius:10px;background:${bg};cursor:pointer;
                       border:2px solid ${((!editing && i === 0) || (editing && card.colorIndex === i)) ? '#fff' : 'transparent'};
                       box-shadow:${((!editing && i === 0) || (editing && card.colorIndex === i)) ? '0 0 0 2px var(--color-accent)' : 'none'};
                       transition:all 150ms ease;">
              </div>`).join('')}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="cs-bank">Bank (optional)</label>
          <select class="form-input" id="cs-bank">${bankOptions}</select>
        </div>
        ${editing ? `
        <div class="form-group">
          <label class="form-label">Attach Expenses</label>
          <div class="text-muted text-xs" style="margin-bottom:var(--space-2);">Select one or more expenses to assign to this card</div>
          <div id="cs-expense-list" style="max-height:200px;overflow-y:auto;border:1px solid var(--color-border);border-radius:var(--radius-sm);">
            ${_cardExpenses.length ? _cardExpenses.map(e => {
              const checked = e.cardId === card.cardId;
              return `<label data-eid="${e.expenseId}" class="cs-exp-row" style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-2) var(--space-3);cursor:pointer;border-bottom:1px solid var(--color-border);transition:background 150ms;${checked ? 'background:var(--color-accent-light);' : ''}">
                <input type="checkbox" value="${e.expenseId}" ${checked ? 'checked' : ''} style="accent-color:var(--color-accent);flex-shrink:0;" />
                <span style="flex:1;font-size:var(--font-size-sm);">${esc(e.name)}</span>
                <span style="font-size:var(--font-size-sm);font-weight:600;white-space:nowrap;">${money(e.amount)}</span>
              </label>`;
            }).join('') : '<div class="text-muted text-sm" style="padding:var(--space-3);text-align:center;">No expenses yet.</div>'}
          </div>
        </div>` : ''}
        <div style="display:flex;gap:12px;padding-top:8px;">
          <button class="btn btn--ghost btn--full" id="cs-cancel">Cancel</button>
          <button class="btn btn--primary btn--full" id="cs-save">${editing ? 'Save Changes' : 'Add Card'}</button>
        </div>
      </div>
    </div>`);

  requestAnimationFrame(() => {
    document.getElementById('card-sheet-overlay').classList.add('is-open');
    document.getElementById('card-sheet').classList.add('is-open');
  });

  // Wire expense row click → toggle checkbox + highlight
  if (editing) {
    document.querySelectorAll('#card-sheet .cs-exp-row').forEach(row => {
      row.addEventListener('click', (e) => {
        const cb = row.querySelector('input[type="checkbox"]');
        if (e.target !== cb) cb.checked = !cb.checked;
        row.style.background = cb.checked ? 'var(--color-accent-light)' : '';
      });
    });
  }

  let selectedType       = editing ? card.type : 'Debit';
  let selectedColorIndex = editing ? (card.colorIndex ?? 0) : 0;

  document.querySelectorAll('#card-sheet .option-card').forEach(c => {
    c.addEventListener('click', () => {
      document.querySelectorAll('#card-sheet .option-card').forEach(x => x.classList.remove('is-selected'));
      c.classList.add('is-selected');
      selectedType = c.dataset.val;
    });
  });

  document.querySelectorAll('#card-sheet .color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      document.querySelectorAll('#card-sheet .color-swatch').forEach(x => {
        x.style.border = '2px solid transparent';
        x.style.boxShadow = 'none';
      });
      sw.style.border = '2px solid #fff';
      sw.style.boxShadow = '0 0 0 2px var(--color-accent)';
      selectedColorIndex = Number(sw.dataset.idx);
    });
  });

  const closeSheet = () => {
    document.getElementById('card-sheet-overlay').classList.remove('is-open');
    const s = document.getElementById('card-sheet');
    s.classList.remove('is-open');
    s.addEventListener('transitionend', () => {
      document.getElementById('card-sheet-overlay')?.remove();
      document.getElementById('card-sheet')?.remove();
    }, { once: true });
  };

  document.getElementById('card-sheet-overlay').addEventListener('click', closeSheet);
  document.getElementById('cs-cancel').addEventListener('click', closeSheet);

  document.getElementById('cs-save').addEventListener('click', async () => {
    const name     = document.getElementById('cs-name').value.trim();
    const lastFour = document.getElementById('cs-lastfour').value.trim();

    if (!name)                           { alert('Enter a card name.'); return; }
    if (!/^\d{4}$/.test(lastFour))       { alert('Enter exactly 4 digits.'); return; }

    const btn    = document.getElementById('cs-save');
    const bankId = document.getElementById('cs-bank').value || null;
    btn.textContent = 'Saving…';
    btn.disabled = true;

    const payload = { userId: userId(), scenarioId: activeScenario(), name, type: selectedType, lastFour, colorIndex: selectedColorIndex, bankId };

    try {
      if (editing) {
        const res = await authFetch(`/api/cards/${userId()}/${card.cardId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Save failed');

        // Bulk-assign selected expenses to this card
        const selectedExpenseIds = Array.from(
          document.querySelectorAll('#cs-expense-list input[type="checkbox"]:checked')
        ).map(cb => cb.value);

        const expRes = await authFetch(`/api/cards/${userId()}/${card.cardId}/expenses`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expenseIds: selectedExpenseIds }),
        });
        if (!expRes.ok) throw new Error('Failed to update expenses');
      } else {
        const res = await authFetch('/api/cards', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Save failed');
        const saved = await res.json();
        _selectedCard = saved.cardId;
      }
      Store.invalidate('cards');
      Store.invalidate('expenses');
      [_cards, _cardExpenses] = await Promise.all([
        Store.get('cards'),
        Store.get('expenses'),
      ]);
      closeSheet();
      renderCardsPage();
      document.getElementById('fab').onclick = () => openCardSheet(null);
    } catch (err) {
      console.error(err);
      btn.textContent = 'Try Again';
      btn.disabled = false;
    }
  });
}

// ---- Sheet (Bank Management) --------------------------------

function openBankSheet() {
  const bankListHtml = _banks.length
    ? _banks.map(b => `
        <div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-2) 0;border-bottom:1px solid var(--color-border);">
          <span style="width:10px;height:10px;border-radius:50%;background:${b.color || BANK_COLOR_DEFAULT};flex-shrink:0;display:inline-block;"></span>
          <div style="flex:1;">
            <div style="font-size:var(--font-size-sm);font-weight:var(--font-weight-semi);">${esc(b.name)}</div>
            ${b.note ? `<div class="text-muted text-xs">${esc(b.note)}</div>` : ''}
          </div>
          <button class="btn btn--danger bs-del-btn" data-bankid="${b.bankId}" style="font-size:12px;padding:4px 10px;">Delete</button>
        </div>`).join('')
    : `<div class="text-muted text-sm" style="padding:var(--space-2) 0;">No banks yet.</div>`;

  const colorSwatchesHtml = BANK_COLORS.map((c, i) => `
    <div class="bs-color-swatch ${i === 0 ? 'is-selected' : ''}"
      data-color="${c.value}"
      style="width:26px;height:26px;border-radius:50%;background:${c.value};cursor:pointer;
             border:2px solid ${i === 0 ? '#fff' : 'transparent'};
             box-shadow:${i === 0 ? '0 0 0 2px var(--color-accent)' : 'none'};
             transition:all 150ms ease;">
    </div>`).join('');

  document.body.insertAdjacentHTML('beforeend', `
    <div id="bank-sheet-overlay" class="sheet-overlay"></div>
    <div id="bank-sheet" class="sheet">
      <div class="sheet__handle"></div>
      <div class="sheet__title">Banks</div>
      <div class="stack--4">
        <div id="bs-bank-list">${bankListHtml}</div>
        <div style="border-top:1px solid var(--color-border);padding-top:var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="bs-name">Bank name</label>
            <input class="form-input" id="bs-name" type="text" placeholder="e.g. SoFi" />
          </div>
          <div class="form-group">
            <label class="form-label" for="bs-note">Note (optional)</label>
            <input class="form-input" id="bs-note" type="text" placeholder="e.g. checking + savings" />
          </div>
          <div class="form-group">
            <label class="form-label">Color</label>
            <div style="display:flex;gap:8px;align-items:center;">${colorSwatchesHtml}</div>
          </div>
          <button class="btn btn--primary btn--full" id="bs-add">Add Bank</button>
        </div>
        <button class="btn btn--ghost btn--full" id="bs-cancel">Close</button>
      </div>
    </div>`);

  requestAnimationFrame(() => {
    document.getElementById('bank-sheet-overlay').classList.add('is-open');
    document.getElementById('bank-sheet').classList.add('is-open');
  });

  const closeSheet = () => {
    document.getElementById('bank-sheet-overlay').classList.remove('is-open');
    const s = document.getElementById('bank-sheet');
    s.classList.remove('is-open');
    s.addEventListener('transitionend', () => {
      document.getElementById('bank-sheet-overlay')?.remove();
      document.getElementById('bank-sheet')?.remove();
    }, { once: true });
  };

  document.getElementById('bank-sheet-overlay').addEventListener('click', closeSheet);
  document.getElementById('bs-cancel').addEventListener('click', closeSheet);

  // Color swatch selection
  let selectedBankColor = BANK_COLORS[0].value;
  document.querySelectorAll('#bank-sheet .bs-color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      document.querySelectorAll('#bank-sheet .bs-color-swatch').forEach(x => {
        x.style.border = '2px solid transparent';
        x.style.boxShadow = 'none';
      });
      sw.style.border = '2px solid #fff';
      sw.style.boxShadow = '0 0 0 2px var(--color-accent)';
      selectedBankColor = sw.dataset.color;
    });
  });

  document.querySelectorAll('#bank-sheet .bs-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const bankId = btn.dataset.bankid;
      if (!confirm('Delete this bank? Cards assigned to it will become unassigned.')) return;
      try {
        const res = await authFetch(`/api/banks/${userId()}/${bankId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Delete failed');
        Store.invalidate('banks');
        Store.invalidate('cards');
        [_banks, _cards] = await Promise.all([Store.get('banks'), Store.get('cards')]);
        if (_selectedBank === bankId) _selectedBank = null;
        closeSheet();
        renderCardsPage();
        document.getElementById('fab').onclick = () => openCardSheet(null);
      } catch (err) {
        console.error(err);
        alert('Delete failed. Try again.');
      }
    });
  });

  document.getElementById('bs-add').addEventListener('click', async () => {
    const name = document.getElementById('bs-name').value.trim();
    const note = document.getElementById('bs-note').value.trim();
    if (!name) { alert('Enter a bank name.'); return; }

    const btn = document.getElementById('bs-add');
    btn.textContent = 'Adding…';
    btn.disabled = true;

    try {
      const res = await authFetch('/api/banks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId(), scenarioId: activeScenario(), name, note, color: selectedBankColor }),
      });
      if (!res.ok) throw new Error('Add failed');
      Store.invalidate('banks');
      _banks = await Store.get('banks');
      closeSheet();
      renderCardsPage();
      document.getElementById('fab').onclick = () => openCardSheet(null);
    } catch (err) {
      console.error(err);
      btn.textContent = 'Try Again';
      btn.disabled = false;
    }
  });
}

// ---- Delete Card -------------------------------------------

async function confirmDeleteCard(card) {
  if (!confirm(`Delete "${card.name}"? Expenses assigned to it won't be deleted.`)) return;
  try {
    const res = await authFetch(`/api/cards/${userId()}/${card.cardId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    Store.invalidate('cards');
    _cards = await Store.get('cards');
    _selectedCard = _cards.length ? _cards[0].cardId : null;
    renderCardsPage();
    document.getElementById('fab').onclick = () => openCardSheet(null);
  } catch (err) {
    console.error(err);
    alert('Delete failed. Try again.');
  }
}

// ---- Helpers -----------------------------------------------
// esc(), userId() provided by shared.js

function money(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

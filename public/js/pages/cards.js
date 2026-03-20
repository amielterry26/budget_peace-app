// ============================================================
// Cards page
// ============================================================

let _cards         = [];
let _cardExpenses  = [];
let _selectedCard  = null;

const CARD_PALETTES = [
  'linear-gradient(135deg, #1C1C2E 0%, #2D3561 100%)',
  'linear-gradient(135deg, #0F4C75 0%, #1B262C 100%)',
  'linear-gradient(135deg, #375C42 0%, #1E3A24 100%)',
  'linear-gradient(135deg, #6B3FA0 0%, #3D1B6E 100%)',
  'linear-gradient(135deg, #B5451B 0%, #7A1A0E 100%)',
  'linear-gradient(135deg, #1B4B82 0%, #0A2647 100%)',
];

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
  [_cards, _cardExpenses] = await Promise.all([
    Store.get('cards'),
    Store.get('expenses'),
  ]);
  if (_cards.length && !_selectedCard) _selectedCard = _cards[0].cardId;
}

// ---- Render ------------------------------------------------

function renderCardsPage() {
  const content = document.getElementById('main-content');

  const walletItems = _cards.map((c, i) => `
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
      <div class="wallet-row">${walletItems}${emptySlot}</div>
      <div id="card-detail-area"></div>
    </div>`;

  _cards.forEach(c => {
    document.getElementById(`wcard-${c.cardId}`).addEventListener('click', () => {
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

// ---- Sheet (Add / Edit) ------------------------------------

function openCardSheet(card) {
  const editing = !!card;

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

    const btn = document.getElementById('cs-save');
    btn.textContent = 'Saving…';
    btn.disabled = true;

    const payload = { userId: userId(), name, type: selectedType, lastFour, colorIndex: selectedColorIndex };

    try {
      if (editing) {
        const res = await authFetch(`/api/cards/${userId()}/${card.cardId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Save failed');
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
      _cards = await Store.get('cards');
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

// ---- Delete ------------------------------------------------

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

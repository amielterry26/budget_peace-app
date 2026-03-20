// ============================================================
// Budget Peace — App Shell
// ============================================================

function setActivePage(page) {
  document.querySelectorAll('.bottom-nav__item, .top-bar__nav-item').forEach(el => {
    el.classList.toggle('is-active', el.dataset.page === page);
  });
  document.querySelectorAll('.side-nav__link').forEach(el => {
    el.classList.toggle('is-active', el.dataset.page === page);
  });
}

function showFab(show) {
  document.getElementById('fab').classList.toggle('is-hidden', !show);
}

function showBottomNav(show) {
  document.getElementById('bottom-nav').classList.toggle('is-hidden', !show);
}

function closeNav() {
  document.getElementById('side-nav').classList.remove('is-open');
  document.getElementById('nav-overlay').classList.remove('is-open');
}

function openNav() {
  document.getElementById('side-nav').classList.add('is-open');
  document.getElementById('nav-overlay').classList.add('is-open');
}

// --- Route change hook (called by router before each render) -

let _currentPage = null;

window.onRouteChange = (page) => {
  _currentPage = page;

  // Reset FAB
  const fab = document.getElementById('fab');
  if (fab) { fab.textContent = '+'; fab.onclick = null; }

  // Track current page on body for CSS scoping
  document.body.dataset.page = page;

  // Remove any orphaned sheets/overlays from previous page
  document.querySelectorAll('.sheet-overlay, .sheet').forEach(el => el.remove());
};

// --- Event listeners ----------------------------------------

document.getElementById('hamburger').addEventListener('click', openNav);
document.getElementById('nav-overlay').addEventListener('click', closeNav);

document.querySelectorAll('.side-nav__link').forEach(el => {
  el.addEventListener('click', () => { closeNav(); Router.navigate(el.dataset.page); });
});

document.querySelectorAll('.bottom-nav__item, .top-bar__nav-item').forEach(el => {
  el.addEventListener('click', () => Router.navigate(el.dataset.page));
});

// --- Time Travel Strip --------------------------------------

function openDesktopPicker() {
  const picker = document.getElementById('tt-picker');
  picker.value = effectiveToday();
  picker.showPicker ? picker.showPicker() : picker.click();
}

function toggleMobilePanel() {
  const panel = document.getElementById('tt-mobile-panel');
  const isOpen = !panel.classList.contains('is-hidden');
  if (isOpen) {
    panel.classList.add('is-hidden');
  } else {
    document.getElementById('tt-mobile-input').value = effectiveToday();
    panel.classList.remove('is-hidden');
  }
}

function initTimeTravelStrip() {
  // Mobile top-bar button → toggle mobile panel
  document.getElementById('tt-open')?.addEventListener('click', toggleMobilePanel);

  // Mobile panel: date selected → apply and close
  document.getElementById('tt-mobile-input')?.addEventListener('change', (e) => {
    if (e.target.value) {
      setViewDate(e.target.value);
      document.getElementById('tt-mobile-panel').classList.add('is-hidden');
    }
  });

  // Mobile panel: cancel
  document.getElementById('tt-mobile-cancel')?.addEventListener('click', () => {
    document.getElementById('tt-mobile-panel').classList.add('is-hidden');
  });

  // Desktop inline button → open native picker
  document.getElementById('tt-inline-btn')?.addEventListener('click', openDesktopPicker);

  // Desktop hidden date picker
  document.getElementById('tt-picker')?.addEventListener('change', (e) => {
    if (e.target.value) setViewDate(e.target.value);
  });

  // Strip buttons
  document.getElementById('tt-reset')?.addEventListener('click', clearViewDate);
  document.getElementById('tt-change')?.addEventListener('click', () => {
    if (window.innerWidth >= 768) {
      openDesktopPicker();
    } else {
      toggleMobilePanel();
    }
  });
}

function updateTimeTravelStrip() {
  const strip   = document.getElementById('time-travel-strip');
  const dateEl  = document.getElementById('tt-date');
  const inlineLabel = document.getElementById('tt-inline-label');

  // Always close mobile panel on any time travel state change
  document.getElementById('tt-mobile-panel')?.classList.add('is-hidden');

  if (isTimeTraveling()) {
    const fmt = new Date(_viewDate + 'T00:00:00Z')
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    if (dateEl) dateEl.textContent = fmt;
    if (strip)  strip.classList.remove('is-hidden');
    if (inlineLabel) inlineLabel.textContent = fmt;
  } else {
    if (strip) strip.classList.add('is-hidden');
    if (inlineLabel) inlineLabel.textContent = 'Today';
  }
}

// --- Scenario Selector --------------------------------------

async function updateScenarioSelector() {
  const el = document.getElementById('scenario-selector');
  if (!el) return;
  try {
    const scenarios = await Store.get('scenarios');
    if (scenarios.length <= 1) {
      el.classList.add('is-hidden');
      return;
    }
    el.classList.remove('is-hidden');
    el.innerHTML = scenarios.map(s =>
      `<button class="scenario-pill${s.scenarioId === _activeScenario ? ' is-active' : ''}" data-sid="${esc(s.scenarioId)}">${esc(s.name)}</button>`
    ).join('');
    el.querySelectorAll('.scenario-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.sid !== _activeScenario) setScenario(btn.dataset.sid);
      });
    });
  } catch (err) {
    console.error('updateScenarioSelector error:', err);
  }
}

// --- Boot ---------------------------------------------------
// New auth-aware boot sequence:
//   1. Demo check (unchanged, runs before any auth)
//   2. Initialize Supabase client
//   3. Show loading state while checking session
//   4. Auth gate: no session → show auth screen
//   5. Set _ownerId from verified Supabase session
//   6. Sync profile (create/update bp_users row)
//   7. Fetch runtime, restore state, init app
(async () => {
  try {
    // ---- Step 1: Demo mode check (first, before any auth) ----
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('demo') === 'true') {
      initDemoGuided();
      return;
    }

    // ---- Step 2: Initialize Supabase client -------------------
    // Show loading state while we check auth
    document.querySelector('.top-bar').style.display = 'none';
    document.getElementById('bottom-nav').classList.add('is-hidden');
    document.getElementById('fab').classList.add('is-hidden');
    document.getElementById('main-content').innerHTML = `
      <div class="auth-loading">
        <div class="auth-loading__text">Loading...</div>
      </div>`;

    await BPSupabase.init();

    // ---- Step 3: Check for existing session -------------------
    const session = await Auth.getSession();

    // ---- Step 4: Auth gate — one clean check ------------------
    if (!session) {
      renderAuthScreen();
      // Listen for auth state changes (e.g., returning from
      // Google redirect or magic link)
      Auth.onAuthChange((event, newSession) => {
        if (event === 'SIGNED_IN' && newSession) {
          // Session restored from redirect — reload to boot fully
          window.location.reload();
        }
      });
      return;
    }

    // ---- Step 5: Set real user identity -----------------------
    // _ownerId is now the Supabase auth UUID, not OWNER_USER_ID
    _ownerId = session.user.id;

    // ---- Step 6: Sync profile (create/update bp_users row) ----
    await Auth.syncProfile(session);

    // ---- Step 7: Normal app boot (same as before, minus initIdentity) ----
    const runtime = await fetch('/api/runtime').then(r => r.json());
    _serverToday = runtime.serverToday;
    restoreViewDate();

    // Load user record to get persisted active scenario
    const user = await Store.get('user');
    _activeScenario = user.activeScenarioId || 'main';

    // Show app chrome
    document.querySelector('.top-bar').style.display = '';
    document.getElementById('bottom-nav').classList.remove('is-hidden');

    // Show logout button (hidden in demo mode)
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.style.display = '';
      logoutBtn.addEventListener('click', () => Auth.signOut());
    }

    initTimeTravelStrip();
    updateScenarioSelector();
    Router.init();

    // ---- Step 8: Listen for auth state changes ----------------
    Auth.onAuthChange((event) => {
      if (event === 'SIGNED_OUT') {
        // Session ended — reload to show auth screen
        window.location.reload();
      }
      // TOKEN_REFRESHED is handled automatically by Supabase
    });

  } catch (err) {
    console.error('Boot failed:', err);
    document.querySelector('.top-bar').style.display = '';
    document.getElementById('main-content').innerHTML = `
      <div class="page text-center" style="padding-top:64px;">
        <p class="text-muted text-sm">Failed to connect. Please try again.</p>
        <button class="btn btn--ghost" style="margin-top:var(--space-3);" onclick="location.reload()">Reload</button>
      </div>`;
  }
})();

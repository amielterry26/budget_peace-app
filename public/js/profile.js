// ============================================================
// Budget Peace — Profile Panel
//
// Slide-out panel from the right side. Shows editable profile
// fields (display name, photo, bio, job, goals) and a read-only
// account summary section.
//
// Public API:
//   Profile.open()  — opens the panel
//   Profile.close() — closes the panel
//   Profile.init()  — sets up the avatar button click handler
// ============================================================

const Profile = (() => {
  let _open = false;

  // ---- Avatar helpers ----------------------------------------

  function getInitials(profile) {
    const name = profile?.displayName || profile?.email || '';
    return name.trim().slice(0, 2).toUpperCase() || '?';
  }

  function getAvatarHtml(profile, size = 32) {
    const photo = profile?.photoUrl;
    if (photo) {
      return `<img src="${photo}?t=${Date.now()}" alt="Avatar" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;display:block;">`;
    }
    const initials = getInitials(profile);
    return `<span style="font-size:${Math.round(size * 0.38)}px;font-weight:var(--font-weight-semi);line-height:1;letter-spacing:0.02em;">${initials}</span>`;
  }

  // ---- Update the avatar button in the top bar ---------------

  function refreshAvatarBtn() {
    const btn = document.getElementById('profile-avatar-btn');
    if (!btn) return;
    const profile = Auth.getUser();
    btn.innerHTML = getAvatarHtml(profile, 32);
  }

  // ---- Account summary helpers -------------------------------

  function formatMemberSince(isoDate) {
    if (!isoDate) return '—';
    return new Date(isoDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function planLabel(profile) {
    const name = profile?.planName || 'none';
    const map = {
      'budget-monthly':   'Basic (Monthly)',
      'budget-lifetime':  'Basic (Lifetime)',
      'pro-monthly':      'Pro (Monthly)',
      'pro-lifetime':     'Pro (Lifetime)',
    };
    return map[name] || (Plans.getTier() === 'pro' ? 'Pro' : 'Basic');
  }

  async function getAccountSummary() {
    const [expenses, banks, goals, scenarios] = await Promise.all([
      Store.get('expenses'),
      Store.get('banks'),
      Store.get('goals'),
      Store.get('scenarios'),
    ]);
    return {
      expenses:  (expenses  || []).length,
      banks:     (banks     || []).length,
      goals:     (goals     || []).length,
      scenarios: (scenarios || []).length,
    };
  }

  // ---- Build panel HTML --------------------------------------

  function buildPanel(profile, summary) {
    const name   = profile?.displayName   || '';
    const bio    = profile?.bio           || '';
    const job    = profile?.jobTitle      || '';
    const goals  = profile?.personalGoals || '';
    const photo  = profile?.photoUrl      || '';

    const statPill = (val, label) => `
      <div class="profile-stat">
        <span class="profile-stat__val">${val}</span>
        <span class="profile-stat__label">${label}</span>
      </div>`;

    return `
      <div id="profile-panel-overlay" class="profile-overlay"></div>
      <div id="profile-panel" class="profile-panel">
        <div class="profile-panel__inner">

          <!-- Header -->
          <div class="profile-panel__head">
            <span class="profile-panel__title">Profile</span>
            <button id="profile-panel-close" class="profile-panel__close" aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="3" y1="3" x2="15" y2="15"/><line x1="15" y1="3" x2="3" y2="15"/>
              </svg>
            </button>
          </div>

          <!-- Identity card: photo left, info right -->
          <div class="profile-identity">
            <div class="profile-identity__avatar-wrap">
              <div id="profile-avatar-lg" class="profile-avatar-lg">
                ${photo
                  ? `<img src="${photo}?t=${Date.now()}" alt="Avatar" style="width:64px;height:64px;border-radius:50%;object-fit:cover;">`
                  : `<span class="profile-avatar-lg__initials">${getInitials(profile)}</span>`}
              </div>
              <label class="profile-avatar-upload-btn" for="profile-photo-input">
                Change
                <input type="file" id="profile-photo-input" accept="image/jpeg,image/png,image/webp,image/gif" style="display:none;">
              </label>
              <div id="profile-photo-status" class="profile-photo-status"></div>
            </div>
            <div class="profile-identity__info">
              <div class="profile-identity__name">${name || 'Your name'}</div>
              <div class="profile-identity__meta">${planLabel(profile)} · ${formatMemberSince(profile?.createdAt)}</div>
              <div class="profile-stat-row">
                ${statPill(summary.expenses,  'Expenses')}
                ${statPill(summary.banks,     'Banks')}
                ${statPill(summary.goals,     'Goals')}
                ${statPill(summary.scenarios, 'Scenarios')}
              </div>
            </div>
          </div>

          <!-- Editable fields -->
          <div class="profile-fields">
            <div class="profile-field">
              <label class="profile-field__label" for="pf-name">Display name</label>
              <input id="pf-name" class="profile-field__input" type="text" value="${name}" placeholder="Your name" maxlength="60">
            </div>
            <div class="profile-field">
              <label class="profile-field__label" for="pf-job">Job / work</label>
              <input id="pf-job" class="profile-field__input" type="text" value="${job}" placeholder="What do you do?" maxlength="80">
            </div>
            <div class="profile-field">
              <label class="profile-field__label" for="pf-bio">Bio</label>
              <textarea id="pf-bio" class="profile-field__input profile-field__textarea" placeholder="A little about you…" maxlength="200" rows="2">${bio}</textarea>
            </div>
            <div class="profile-field">
              <label class="profile-field__label" for="pf-goals">Your goals / hopes</label>
              <textarea id="pf-goals" class="profile-field__input profile-field__textarea" placeholder="What are you working toward?" maxlength="300" rows="3">${goals}</textarea>
            </div>
          </div>

          <!-- Actions: save + settings in one row -->
          <div class="profile-actions">
            <button id="profile-save-btn" class="btn btn--primary" style="flex:1;">Save profile</button>
            <button class="btn btn--ghost profile-quick-link" id="profile-goto-settings">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.5"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M12.95 3.05l-1.06 1.06M4.11 11.89l-1.06 1.06"/></svg>
              Settings
            </button>
          </div>
          <div id="profile-save-status" class="profile-save-status"></div>

        </div>
      </div>
    `;
  }

  // ---- Open / close ------------------------------------------

  async function open() {
    if (_open) return;
    _open = true;

    const profile  = Auth.getUser() || {};
    const summary  = await getAccountSummary();

    document.body.insertAdjacentHTML('beforeend', buildPanel(profile, summary));

    requestAnimationFrame(() => {
      document.getElementById('profile-panel-overlay').classList.add('is-open');
      document.getElementById('profile-panel').classList.add('is-open');
    });

    bindEvents(profile);
  }

  function close() {
    if (!_open) return;
    _open = false;
    const overlay = document.getElementById('profile-panel-overlay');
    const panel   = document.getElementById('profile-panel');
    if (overlay) overlay.classList.remove('is-open');
    if (panel) {
      panel.classList.remove('is-open');
      panel.addEventListener('transitionend', () => {
        document.getElementById('profile-panel-overlay')?.remove();
        document.getElementById('profile-panel')?.remove();
      }, { once: true });
    }
  }

  // ---- Event bindings ----------------------------------------

  function bindEvents(profile) {
    document.getElementById('profile-panel-close').addEventListener('click', close);
    document.getElementById('profile-panel-overlay').addEventListener('click', close);

    // Photo upload
    const fileInput = document.getElementById('profile-photo-input');
    fileInput.addEventListener('change', () => handlePhotoUpload(fileInput, profile));

    // Save
    document.getElementById('profile-save-btn').addEventListener('click', () => saveProfile());

    // Settings shortcut
    document.getElementById('profile-goto-settings').addEventListener('click', () => {
      close();
      Router.navigate('settings');
    });
  }

  async function handlePhotoUpload(fileInput, profile) {
    const file = fileInput.files[0];
    if (!file) return;

    const status = document.getElementById('profile-photo-status');
    status.textContent = 'Uploading…';

    try {
      const userId = Auth.getUser()?.userId;

      // 1. Get presigned URL
      const urlRes = await authFetch(`/api/users/${userId}/avatar-url`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error('Failed to get upload URL');
      const { uploadUrl, photoUrl } = await urlRes.json();

      // 2. PUT file directly to S3
      const s3Res = await fetch(uploadUrl, {
        method:  'PUT',
        headers: { 'Content-Type': file.type },
        body:    file,
      });
      if (!s3Res.ok) throw new Error('S3 upload failed');

      // 3. Save photoUrl to profile
      const saveRes = await authFetch(`/api/users/${userId}/profile`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...buildCurrentFields(), photoUrl }),
      });
      if (!saveRes.ok) throw new Error('Failed to save photo URL');

      // 4. Update UI
      status.textContent = 'Photo updated!';
      const lg = document.getElementById('profile-avatar-lg');
      if (lg) lg.innerHTML = `<img src="${photoUrl}?t=${Date.now()}" alt="Avatar" style="width:64px;height:64px;border-radius:50%;object-fit:cover;">`;

      // Refresh cached profile and top bar avatar
      await Auth.refreshProfile();
      refreshAvatarBtn();

      setTimeout(() => { status.textContent = ''; }, 3000);
    } catch (err) {
      console.error('[Profile] Photo upload error:', err);
      status.textContent = 'Upload failed. Try again.';
      status.style.color = 'var(--color-error)';
    }
  }

  function buildCurrentFields() {
    return {
      displayName:   document.getElementById('pf-name')?.value  || '',
      bio:           document.getElementById('pf-bio')?.value   || '',
      jobTitle:      document.getElementById('pf-job')?.value   || '',
      personalGoals: document.getElementById('pf-goals')?.value || '',
    };
  }

  async function saveProfile() {
    const btn    = document.getElementById('profile-save-btn');
    const status = document.getElementById('profile-save-status');
    const userId = Auth.getUser()?.userId;

    btn.disabled    = true;
    btn.textContent = 'Saving…';
    status.textContent = '';

    try {
      const fields = buildCurrentFields();
      const photoUrl = Auth.getUser()?.photoUrl || '';

      const res = await authFetch(`/api/users/${userId}/profile`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...fields, photoUrl }),
      });
      if (!res.ok) throw new Error('Save failed');

      await Auth.refreshProfile();
      refreshAvatarBtn();

      status.textContent = 'Saved!';
      status.style.color = 'var(--color-success, #22c55e)';
      setTimeout(() => { status.textContent = ''; }, 2500);
    } catch (err) {
      console.error('[Profile] Save error:', err);
      status.textContent = 'Failed to save. Try again.';
      status.style.color = 'var(--color-error)';
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Save profile';
    }
  }

  // ---- Init (called once on app boot) ------------------------

  function init() {
    const btn = document.getElementById('profile-avatar-btn');
    if (btn) {
      btn.addEventListener('click', () => open());
      refreshAvatarBtn();
    }

    // Re-render avatar after any auth change
    Auth.onAuthChange(() => refreshAvatarBtn());
  }

  return { open, close, init };
})();

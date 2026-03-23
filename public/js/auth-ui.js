// ============================================================
// Budget Peace — Auth UI
//
// Renders the authentication screen when the user is not
// signed in. Inserted into #main-content by the app.js
// boot sequence when no valid session is found.
//
// Depends on: Auth (auth.js), esc() from shared.js
// ============================================================

// Renders the auth screen into #main-content.
// Hides app chrome (top-bar, bottom-nav, fab, side-nav).
function renderAuthScreen() {
  // Hide app chrome — auth screen is a full-page experience
  document.querySelector('.top-bar').style.display = 'none';
  document.getElementById('bottom-nav').classList.add('is-hidden');
  document.getElementById('fab').classList.add('is-hidden');
  document.getElementById('side-nav').classList.remove('is-open');

  document.getElementById('main-content').innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">

        <div class="auth-card__logo">Budget <span>Peace</span></div>
        <p class="auth-card__tagline">
          Take control of your money.<br>
          See where every dollar goes.
        </p>

        <!-- Google sign-in -->
        <button class="auth-btn auth-btn--google" id="auth-google-btn" type="button">
          <span class="auth-btn__icon">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          </span>
          Continue with Google
        </button>

        <!-- Divider -->
        <div class="auth-divider">
          <span>or use email</span>
        </div>

        <!-- Email magic link -->
        <div class="auth-email-group">
          <input class="auth-input" id="auth-email-input" type="email"
            placeholder="you@email.com" autocomplete="email" />
          <button class="auth-btn auth-btn--magic" id="auth-magic-btn" type="button">
            Send Magic Link
          </button>
        </div>

        <!-- Status messages -->
        <div class="auth-message auth-message--success" id="auth-success" style="display:none;">
          Check your email for your sign-in link.
        </div>
        <div class="auth-message auth-message--error" id="auth-error" style="display:none;">
          Something went wrong. Please try again.
        </div>

        <!-- Demo link -->
        <div class="auth-demo-link">
          Want to try first?
          <a href="/?demo=true">Try the demo</a>
        </div>

      </div>
    </div>`;

  // ---- Wire event handlers -----------------------------------

  const googleBtn = document.getElementById('auth-google-btn');
  const magicBtn  = document.getElementById('auth-magic-btn');
  const emailInput = document.getElementById('auth-email-input');
  const successEl = document.getElementById('auth-success');
  const errorEl   = document.getElementById('auth-error');

  // Helper: set loading state
  function setLoading(loading) {
    googleBtn.disabled = loading;
    magicBtn.disabled  = loading;
    emailInput.disabled = loading;
    if (loading) {
      magicBtn.textContent = 'Sending...';
    } else {
      magicBtn.textContent = 'Send Magic Link';
    }
  }

  // Helper: show message (only one at a time, or none)
  function showMessage(type) {
    successEl.style.display = type === 'success' ? '' : 'none';
    errorEl.style.display   = type === 'error'   ? '' : 'none';
  }

  // Google sign-in
  googleBtn.addEventListener('click', async () => {
    showMessage(null);
    setLoading(true);
    try {
      await Auth.signInWithGoogle();
      // Browser redirects — no further code runs
    } catch (err) {
      console.error('Google sign-in error:', err);
      setLoading(false);
      showMessage('error');
    }
  });

  // Magic link
  magicBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    if (!email) {
      emailInput.focus();
      return;
    }

    showMessage(null);
    setLoading(true);

    try {
      const { error } = await Auth.sendMagicLink(email);
      setLoading(false);
      if (error) {
        console.error('Magic link error:', error);
        showMessage('error');
      } else {
        showMessage('success');
      }
    } catch (err) {
      console.error('Magic link error:', err);
      setLoading(false);
      showMessage('error');
    }
  });

  // Enter key on email input triggers magic link
  emailInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      magicBtn.click();
    }
  });
}

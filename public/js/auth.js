// ============================================================
// Budget Peace — Auth Service
//
// Centralized authentication logic. All auth operations go
// through this module — no auth checks scattered in page scripts.
//
// Depends on: BPSupabase (supabase-client.js must be loaded first)
//
// Functions:
//   Auth.getSession()            — current session or null
//   Auth.signInWithGoogle()      — triggers Google OAuth redirect
//   Auth.sendMagicLink(email)    — sends email magic link
//   Auth.signOut()               — signs out and reloads
//   Auth.onAuthChange(cb)        — listens for auth state changes
//   Auth.syncProfile(session)    — creates/updates bp_users row
//   Auth.getAccessToken()        — current JWT access token
//   Auth.canAccess()             — can user access the real app?
//   Auth.getAccessLevel()        — user's access level string
//   Auth.getPlan()               — user's plan name
//   Auth.getEntitlementStatus()  — user's entitlement status
// ============================================================

const Auth = (() => {
  // ---- Session -----------------------------------------------

  // Returns the current Supabase session, or null if not signed in.
  // This checks Supabase's local storage for a persisted session
  // and refreshes the token if needed.
  async function getSession() {
    const client = BPSupabase.client();
    if (!client) return null;

    const { data, error } = await client.auth.getSession();
    if (error) {
      console.error('Auth.getSession error:', error);
      return null;
    }
    return data.session;
  }

  // Returns the current access token string, or null.
  // Used by authFetch() to attach Authorization headers.
  async function getAccessToken() {
    const session = await getSession();
    return session?.access_token || null;
  }

  // ---- Sign-In Methods ---------------------------------------

  // Triggers Google OAuth redirect.
  // After Google auth, the user is redirected back to the app
  // and Supabase restores the session automatically.
  async function signInWithGoogle() {
    const client = BPSupabase.client();
    if (!client) throw new Error('Supabase not initialized');

    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) throw error;
    // Browser will redirect to Google — no further code runs here
  }

  // Sends a magic link email. Returns { error } on failure.
  // On success, the user clicks the link in their email,
  // which redirects back to the app with a valid session.
  async function sendMagicLink(email) {
    const client = BPSupabase.client();
    if (!client) throw new Error('Supabase not initialized');

    const { error } = await client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    return { error: error || null };
  }

  // ---- Sign-Out ----------------------------------------------

  // Signs out, clears session, reloads page.
  // After reload, the boot sequence will detect no session
  // and show the auth screen.
  async function signOut() {
    const client = BPSupabase.client();
    if (client) {
      await client.auth.signOut();
    }
    window.location.reload();
  }

  // ---- Auth State Listener -----------------------------------

  // Registers a callback for auth state changes.
  // Events: SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.
  function onAuthChange(callback) {
    const client = BPSupabase.client();
    if (!client) return;

    client.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
  }

  // ---- Profile Sync ------------------------------------------

  // Creates or updates the user's bp_users row in DynamoDB.
  // Called after successful authentication during boot.
  //
  // The server endpoint trusts the VERIFIED JWT for userId
  // and email. The body only provides optional hints (fullName).
  async function syncProfile(session) {
    if (!session) return;

    const token = session.access_token;
    const user = session.user;

    // Optional: extract display name from Google metadata
    const fullName = user.user_metadata?.full_name
      || user.user_metadata?.name
      || null;

    try {
      const res = await fetch('/api/auth/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        // Only send optional hints — server uses verified JWT for identity
        body: JSON.stringify({ fullName }),
      });

      if (!res.ok) {
        console.error('Profile sync failed:', await res.text());
      }
    } catch (err) {
      console.error('Profile sync error:', err);
    }
  }

  // ---- Access / Entitlement Helpers ---------------------------
  //
  // Centralized access checks. Currently, every authenticated
  // user gets full access. Future Stripe integration will read
  // these from the user's profile/membership record.
  //
  // IMPORTANT: Do not hardcode access booleans elsewhere in the
  // app. Always go through these helpers.

  // Can this user access the real app?
  // Current: any authenticated user = yes
  // Future: check entitlementStatus !== 'inactive'/'canceled'
  function canAccess() {
    return true;
  }

  // What access level does this user have?
  // Current: always 'full'
  // Future: 'tester' | 'core' | 'pro' | 'inactive' etc.
  function getAccessLevel() {
    return 'full';
  }

  // What plan is this user on?
  // Current: always 'pro'
  // Future: 'free' | 'core' | 'pro' | 'trial' etc.
  function getPlan() {
    return 'pro';
  }

  // What is this user's entitlement status?
  // Current: always 'active'
  // Future: 'active' | 'canceled' | 'past_due' | 'trial' etc.
  function getEntitlementStatus() {
    return 'active';
  }

  return {
    getSession,
    getAccessToken,
    signInWithGoogle,
    sendMagicLink,
    signOut,
    onAuthChange,
    syncProfile,
    canAccess,
    getAccessLevel,
    getPlan,
    getEntitlementStatus,
  };
})();

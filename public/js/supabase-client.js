// ============================================================
// Budget Peace — Supabase Client (Frontend)
//
// Single source of truth for the Supabase connection.
// Uses the PUBLIC anon key only — safe to include in frontend.
//
// Initialization is async (fetches config from /api/config)
// but only called once during app boot in app.js.
//
// Usage:
//   await BPSupabase.init();           // call once on boot
//   const client = BPSupabase.client(); // use anywhere after
// ============================================================

const BPSupabase = (() => {
  let _client = null;

  // Called once during app boot.
  // Fetches public config from the server, then creates the
  // Supabase client. This avoids hardcoding config in the
  // frontend and prevents async race conditions — nothing
  // uses the client until init() resolves.
  async function init() {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error('Failed to fetch app config');
    const cfg = await res.json();

    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
      throw new Error('Supabase config missing from server');
    }

    // supabase-js is loaded via CDN <script> tag in index.html
    // window.supabase is the global namespace from the CDN build
    _client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    return _client;
  }

  // Returns the initialized Supabase client.
  // Will be null if init() hasn't been called yet.
  function client() {
    return _client;
  }

  return { init, client };
})();

// ============================================================
// Demo Shim — Stubs for running real page renderers without
// the full app stack (no Supabase, no auth, no router, no plans).
//
// Loaded BEFORE shared.js and page scripts in demo.html.
// ============================================================

// === Auth stub ===
const Auth = {
  getAccessToken: async () => 'demo-token',
  getAccessLevel: () => 'pro',
  signOut: () => {},
  getSession: async () => ({ data: { session: null } }),
};

// === Supabase stub ===
const BPSupabase = {};

// === Router stub ===
// Page scripts call Router.register() at load time — accept and ignore.
// Render functions bind Router.navigate() to click handlers — no-op.
const Router = {
  register: () => {},
  navigate: () => {},
  parseHash: () => ({}),
  render: () => {},
  init: () => {},
};

// === Plans stub ===
// Show full Pro experience in demo.
const Plans = {
  getTier: () => 'pro',
  canUse: () => true,
  getLimit: () => Infinity,
  getPlanLimits: () => ({}),
  showUpgradeModal: () => {},
  hideUpgradeModal: () => {},
  getProFeatures: () => [],
  getComingSoon: () => [],
  UPGRADE_CONTEXT: {
    scenarios: {}, expenses: {}, duration: {},
    comparison: {}, notes: {}, financialHealth: {},
  },
};

// === App chrome stubs ===
function setActivePage() {}
function showBottomNav() {}
function showFab() {}
function openNav() {}
function closeNav() {}
function updateTimeTravelStrip() {}
function updateScenarioSelector() {}
let _currentPage = 'home';

// === Demo gate stubs ===
// Old demo.js defines these; expenses.js openSheet checks isDemoMode().
function showDemoPaywall() {}
function demoGate() { return false; }

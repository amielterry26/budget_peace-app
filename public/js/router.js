// Minimal hash router with param serialization
// Hash format: #pageName;key=value;key2=value2
const Router = (() => {
  const routes = {};

  function register(name, fn) {
    routes[name] = fn;
  }

  function parseHash(hash) {
    const raw = hash.replace('#', '');
    if (!raw) return { page: 'home', params: {} };
    const parts = raw.split(';');
    const page = parts[0];
    const params = {};
    for (let i = 1; i < parts.length; i++) {
      const eq = parts[i].indexOf('=');
      if (eq > 0) {
        params[parts[i].slice(0, eq)] = decodeURIComponent(parts[i].slice(eq + 1));
      }
    }
    return { page, params };
  }

  function buildHash(page, params) {
    let hash = page;
    const keys = Object.keys(params || {});
    for (const k of keys) {
      if (params[k] != null) hash += ';' + k + '=' + encodeURIComponent(params[k]);
    }
    return hash;
  }

  function navigate(page, params = {}) {
    window.location.hash = buildHash(page, params);
    // hashchange listener handles rendering — no direct render() call
  }

  function render(page, params) {
    if (typeof window.onRouteChange === 'function') window.onRouteChange(page);
    const fn = routes[page];
    if (!fn) { console.warn(`No route registered for: ${page}`); return; }
    fn(params);
  }

  function init() {
    window.addEventListener('hashchange', () => {
      const { page, params } = parseHash(window.location.hash);
      render(page, params);
    });
    const { page, params } = parseHash(window.location.hash);
    render(page, params);
  }

  return { register, navigate, init, render, parseHash };
})();

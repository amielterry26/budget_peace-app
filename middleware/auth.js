// ============================================================
// Budget Peace — Auth Middleware
// Verifies Supabase JWT on protected API routes.
// Sets req.userId, req.userEmail, req.userProvider from the
// verified token. NEVER trust frontend-submitted identity —
// the JWT is the sole source of truth for who the caller is.
// ============================================================

const { createClient } = require('@supabase/supabase-js');

// ---- Server-side Supabase admin client ----------------------
// Uses the SERVICE ROLE key — never exposed to the frontend.
// This key bypasses Row Level Security and can verify any JWT.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL  || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// ---- requireAuth middleware ---------------------------------
// Extracts and verifies the Bearer token from the Authorization
// header. On success, sets:
//   req.userId       — Supabase auth user UUID
//   req.userEmail    — verified email from token
//   req.userProvider — auth provider (google, email, etc.)
//
// On failure, responds with 401.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = header.slice(7);

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Set verified identity on request object
    req.userId       = data.user.id;
    req.userEmail    = data.user.email;
    req.userProvider  = data.user.app_metadata?.provider || 'email';

    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

// ---- verifyOwner middleware ---------------------------------
// For routes with :userId param — ensures the authenticated
// user can only access their own data.
// Must be used AFTER requireAuth.
function verifyOwner(req, res, next) {
  if (req.params.userId && req.params.userId !== req.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

module.exports = { requireAuth, verifyOwner, supabaseAdmin };

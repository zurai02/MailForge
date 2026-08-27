const bcrypt = require('bcryptjs');

// Password is hashed once at boot from the plaintext .env value so the
// plaintext never sits in memory longer than necessary and never touches disk.
let passwordHash = null;

function initAdmin() {
  const plain = process.env.ADMIN_PASSWORD || 'change-me-now';
  passwordHash = bcrypt.hashSync(plain, 10);
}

function checkCredentials(email, password) {
  if (!passwordHash) initAdmin();
  const emailOk = (email || '').trim().toLowerCase() ===
    (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const passOk = bcrypt.compareSync(password || '', passwordHash);
  return emailOk && passOk;
}

function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

module.exports = { initAdmin, checkCredentials, requireAuth };

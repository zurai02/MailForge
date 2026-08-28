const crypto = require('crypto');

const sessions = new Map(); // token -> { email, expires }
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(check, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

let adminHash = null;
function initAdmin() {
  adminHash = hashPassword(process.env.ADMIN_PASSWORD || 'change-me-now');
}

function checkCredentials(email, password) {
  if (!adminHash) initAdmin();
  const emailOk = (email || '').trim().toLowerCase() === (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  let passOk = false;
  try { passOk = verifyPassword(password || '', adminHash); } catch { passOk = false; }
  return emailOk && passOk;
}

function createSession(email) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { email, expires: Date.now() + SESSION_TTL_MS });
  return token;
}

function getSession(token) {
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expires) { sessions.delete(token); return null; }
  return s;
}

function destroySession(token) { sessions.delete(token); }

module.exports = { initAdmin, checkCredentials, createSession, getSession, destroySession };

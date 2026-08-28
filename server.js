require('./utils/env').loadEnv();
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const store = require('./store');
const { initAdmin, checkCredentials, createSession, getSession, destroySession } = require('./utils/auth');
const { generateVerificationToken, txtRecordName, expectedTxtValue, checkTxtRecord } = require('./utils/verify');

initAdmin();

const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

function getAuth(req) {
  const token = parseCookies(req).mf_session;
  if (!token) return null;
  const session = getSession(token);
  return session ? { token, session } : null;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) req.destroy();
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function serveStatic(res, pathname) {
  const safePath = path.normalize(pathname === '/' ? '/index.html' : pathname);
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Content-Length': data.length });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsed.pathname;

  if (!pathname.startsWith('/api/')) return serveStatic(res, pathname);

  try {
    const auth = getAuth(req);
    const isLoggedIn = !!auth;

    if (pathname === '/api/session' && req.method === 'GET') {
      return sendJson(res, 200, { loggedIn: isLoggedIn, email: isLoggedIn ? auth.session.email : null });
    }

    if (pathname === '/api/login' && req.method === 'POST') {
      const { email, password } = await readJsonBody(req);
      if (checkCredentials(email, password)) {
        const token = createSession(email);
        res.setHeader('Set-Cookie', `mf_session=${token}; HttpOnly; Path=/; Max-Age=43200; SameSite=Lax`);
        return sendJson(res, 200, { ok: true });
      }
      return sendJson(res, 401, { error: 'Invalid email or password' });
    }

    if (pathname === '/api/logout' && req.method === 'POST') {
      if (auth) destroySession(auth.token);
      res.setHeader('Set-Cookie', 'mf_session=; HttpOnly; Path=/; Max-Age=0');
      return sendJson(res, 200, { ok: true });
    }

    if (!isLoggedIn) return sendJson(res, 401, { error: 'Not authenticated' });

    // ---------- Domains ----------
    if (pathname === '/api/domains' && req.method === 'GET') {
      const domains = store.getDomains().map((d) => ({
        ...d,
        txt_record_name: txtRecordName(),
        txt_record_value: expectedTxtValue(d.verification_token),
      }));
      return sendJson(res, 200, domains);
    }

    if (pathname === '/api/domains' && req.method === 'POST') {
      const { name } = await readJsonBody(req);
      const clean = (name || '').trim().toLowerCase();
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(clean)) {
        return sendJson(res, 400, { error: 'Enter a valid domain, e.g. example.com' });
      }
      if (store.getDomainByName(clean)) return sendJson(res, 409, { error: 'That domain is already added' });
      const token = generateVerificationToken();
      const domain = store.addDomain(clean, token);
      return sendJson(res, 200, { ...domain, txt_record_name: txtRecordName(), txt_record_value: expectedTxtValue(token) });
    }

    let m = pathname.match(/^\/api\/domains\/(\d+)\/verify$/);
    if (m && req.method === 'POST') {
      const domain = store.getDomain(m[1]);
      if (!domain) return sendJson(res, 404, { error: 'Domain not found' });
      const found = await checkTxtRecord(domain.name, domain.verification_token);
      if (found) {
        const updated = store.verifyDomain(domain.id);
        return sendJson(res, 200, { verified: true, verified_at: updated.verified_at });
      }
      return sendJson(res, 200, {
        verified: false,
        message: `TXT record not found yet. Add "${expectedTxtValue(domain.verification_token)}" at the root of ${domain.name} and try again - DNS changes can take a few minutes to a few hours.`,
      });
    }

    m = pathname.match(/^\/api\/domains\/(\d+)$/);
    if (m && req.method === 'DELETE') {
      store.deleteDomain(m[1]);
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { error: 'Server error' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[web] dashboard on http://localhost:${PORT}`));

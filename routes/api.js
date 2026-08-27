const express = require('express');
const router = express.Router();
const db = require('../db');
const { checkCredentials, requireAuth } = require('../utils/auth');
const { generateVerificationToken, txtRecordName, expectedTxtValue, checkTxtRecord } = require('../utils/verify');

// ---------- Auth ----------
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (checkCredentials(email, password)) {
    req.session.loggedIn = true;
    req.session.email = email;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'Invalid email or password' });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/session', (req, res) => {
  res.json({ loggedIn: !!(req.session && req.session.loggedIn), email: req.session?.email || null });
});

// Everything below requires a logged-in session
router.use(requireAuth);

// ---------- Domains ----------
router.get('/domains', (req, res) => {
  const domains = db.prepare('SELECT * FROM domains ORDER BY created_at DESC').all();
  res.json(domains.map(d => ({
    ...d,
    verified: !!d.verified,
    txt_record_name: txtRecordName(),
    txt_record_value: expectedTxtValue(d.verification_token),
  })));
});

router.post('/domains', (req, res) => {
  const name = (req.body?.name || '').trim().toLowerCase();
  if (!name || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(name)) {
    return res.status(400).json({ error: 'Enter a valid domain, e.g. example.com' });
  }
  const token = generateVerificationToken();
  try {
    const info = db.prepare(
      'INSERT INTO domains (name, verification_token) VALUES (?, ?)'
    ).run(name, token);
    const domain = db.prepare('SELECT * FROM domains WHERE id = ?').get(info.lastInsertRowid);
    res.json({
      ...domain,
      verified: false,
      txt_record_name: txtRecordName(),
      txt_record_value: expectedTxtValue(token),
    });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'That domain is already added' });
    }
    res.status(500).json({ error: 'Could not add domain' });
  }
});

router.post('/domains/:id/verify', async (req, res) => {
  const domain = db.prepare('SELECT * FROM domains WHERE id = ?').get(req.params.id);
  if (!domain) return res.status(404).json({ error: 'Domain not found' });

  const found = await checkTxtRecord(domain.name, domain.verification_token);
  if (found) {
    db.prepare(`UPDATE domains SET verified = 1, verified_at = datetime('now') WHERE id = ?`)
      .run(domain.id);
    return res.json({ verified: true });
  }
  return res.json({
    verified: false,
    message: `TXT record not found yet. Add "${expectedTxtValue(domain.verification_token)}" at the root of ${domain.name} and try again - DNS changes can take a few minutes to a few hours to propagate.`,
  });
});

router.delete('/domains/:id', (req, res) => {
  db.prepare('DELETE FROM domains WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Forwarding rules ----------
router.get('/domains/:id/forwards', (req, res) => {
  const rows = db.prepare('SELECT * FROM forwards WHERE domain_id = ? ORDER BY alias').all(req.params.id);
  res.json(rows.map(r => ({ ...r, enabled: !!r.enabled })));
});

router.post('/domains/:id/forwards', (req, res) => {
  const domain = db.prepare('SELECT * FROM domains WHERE id = ?').get(req.params.id);
  if (!domain) return res.status(404).json({ error: 'Domain not found' });
  if (!domain.verified) return res.status(400).json({ error: 'Verify the domain before adding forwarding rules' });

  let alias = (req.body?.alias || '').trim().toLowerCase();
  const destination = (req.body?.destination || '').trim().toLowerCase();
  if (alias.includes('@')) alias = alias.split('@')[0];
  if (!alias) return res.status(400).json({ error: 'Alias is required (use * for catch-all)' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination)) {
    return res.status(400).json({ error: 'Destination must be a valid email address' });
  }

  try {
    const info = db.prepare(
      'INSERT INTO forwards (domain_id, alias, destination) VALUES (?, ?, ?)'
    ).run(domain.id, alias, destination);
    res.json(db.prepare('SELECT * FROM forwards WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: `${alias}@${domain.name} already forwards somewhere` });
    }
    res.status(500).json({ error: 'Could not add forwarding rule' });
  }
});

router.patch('/forwards/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM forwards WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const enabled = req.body?.enabled ? 1 : 0;
  db.prepare('UPDATE forwards SET enabled = ? WHERE id = ?').run(enabled, row.id);
  res.json({ ok: true });
});

router.delete('/forwards/:id', (req, res) => {
  db.prepare('DELETE FROM forwards WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Mail log ----------
router.get('/log', (req, res) => {
  const rows = db.prepare('SELECT * FROM mail_log ORDER BY created_at DESC LIMIT 100').all();
  res.json(rows);
});

module.exports = router;

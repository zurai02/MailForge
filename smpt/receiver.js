const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const db = require('../db');

function buildTransport() {
  return nodemailer.createTransport({
    host: process.env.RELAY_HOST,
    port: Number(process.env.RELAY_PORT || 587),
    secure: Number(process.env.RELAY_PORT) === 465,
    auth: { user: process.env.RELAY_USER, pass: process.env.RELAY_PASS },
  });
}

function logMail({ domainId, alias, from, to, subject, status, detail }) {
  db.prepare(`
    INSERT INTO mail_log (domain_id, alias, from_addr, to_addr, subject, status, detail)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(domainId || null, alias || null, from || null, to || null, subject || null, status, detail || null);
}

function findForward(domainName, alias) {
  const domain = db.prepare('SELECT * FROM domains WHERE name = ? AND verified = 1').get(domainName);
  if (!domain) return { domain: null, forward: null };

  let forward = db.prepare(
    'SELECT * FROM forwards WHERE domain_id = ? AND alias = ? AND enabled = 1'
  ).get(domain.id, alias);

  if (!forward) {
    // fall back to catch-all
    forward = db.prepare(
      'SELECT * FROM forwards WHERE domain_id = ? AND alias = ? AND enabled = 1'
    ).get(domain.id, '*');
  }
  return { domain, forward };
}

function startSmtpReceiver() {
  const transport = buildTransport();

  const server = new SMTPServer({
    banner: process.env.SMTP_BANNER_HOST || 'mailforge',
    authOptional: true,
    disabledCommands: ['AUTH'],

    // Only accept mail addressed to a domain + alias we actually forward
    onRcptTo(address, session, callback) {
      const to = address.address.toLowerCase();
      const [alias, domainName] = to.split('@');
      const { domain, forward } = findForward(domainName, alias);
      if (!domain) return callback(new Error('550 No such domain here'));
      if (!forward) return callback(new Error('550 No such mailbox'));
      callback();
    },

    onData(stream, session, callback) {
      simpleParser(stream, {}, async (err, mail) => {
        if (err) return callback(err);

        const to = (session.envelope.rcptTo[0]?.address || '').toLowerCase();
        const [alias, domainName] = to.split('@');
        const { domain, forward } = findForward(domainName, alias);

        if (!domain || !forward) {
          logMail({ alias, to, from: mail.from?.text, subject: mail.subject, status: 'rejected', detail: 'no matching rule at delivery time' });
          return callback();
        }

        try {
          await transport.sendMail({
            from: process.env.RELAY_FROM,
            to: forward.destination,
            replyTo: mail.from?.text,
            subject: mail.subject || '(no subject)',
            text: mail.text,
            html: mail.html || undefined,
            attachments: mail.attachments,
            headers: { 'X-Forwarded-For': to },
          });
          logMail({
            domainId: domain.id, alias, from: mail.from?.text, to: forward.destination,
            subject: mail.subject, status: 'forwarded',
          });
        } catch (relayErr) {
          logMail({
            domainId: domain.id, alias, from: mail.from?.text, to: forward.destination,
            subject: mail.subject, status: 'error', detail: relayErr.message,
          });
        }
        callback();
      });
    },
  });

  const port = Number(process.env.SMTP_PORT || 25);
  server.listen(port, () => {
    console.log(`[smtp] inbound receiver listening on port ${port}`);
  });

  server.on('error', (err) => {
    console.error('[smtp] server error:', err.message);
  });

  return server;
}

module.exports = { startSmtpReceiver };

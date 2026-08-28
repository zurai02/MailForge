# MailForge

Self-hosted dashboard for managing your domains and verifying ownership via
DNS TXT records — free, running on **zero external dependencies**. No
`npm install`, no Express, no database engine. Just Node's own standard
library (`http`, `crypto`, `dns`, `fs`).

## What it does

- Add a domain, get a real verification token like `MailForge_9k2xQ7pL4m`
- Add that as a TXT record at your domain's DNS, then confirm — this does a
  real `dns.resolveTxt` lookup, not a stub
- See each domain's verified/pending status
- Single admin login, session cookies, password hashing via `crypto.scrypt`

Email forwarding was removed from this version by request — this is purely
a domain-ownership dashboard now.

## Proven working

Tested live before shipping: static file serving, login/session/logout,
domain add/verify/delete, and confirmation that the DNS check is real (it
correctly reports "not found" when no network is available, rather than
faking a pass).

## Setup

```bash
cp .env.example .env
# edit .env: set ADMIN_EMAIL, ADMIN_PASSWORD
node server.js
```

No `npm install` — there's nothing to install. Runs at `http://localhost:3000`
(or `PORT` from `.env`).

See `DEPLOY.md` for getting this onto a real server with a public URL.

## Project layout

```
server.js       – HTTP server + REST API (Node's http module, no Express)
store.js        – JSON-file data store for domains
utils/env.js     – tiny built-in .env parser
utils/auth.js    – scrypt password hashing + session tokens
utils/verify.js  – token generation + real DNS TXT lookup
public/         – dashboard (vanilla HTML/CSS/JS, no build step, no CDN fonts)
```

## Security notes

- Single admin account from `.env` — no public signup built in yet.
- Put this behind HTTPS (Caddy or nginx + Let's Encrypt) in production.

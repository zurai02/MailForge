# MailForge

A self-hosted dashboard for managing your domains and forwarding email through
them for free — no paid SaaS, no vendor lock-in. You run it on your own
server; it costs whatever your hosting costs (which can be $0 on a free-tier VM).

## What it actually does

- **Dashboard** (HTML/CSS/JS) — add domains, see status, manage forwarding rules, view mail activity.
- **Domain ownership verification** — generates a token like `MailForge_9k2xQ7pL4m` and confirms
  ownership by checking a TXT record you add to your DNS.
- **Email forwarding** — a small SMTP server (`smtp/receiver.js`) accepts mail sent to your
  domain and relays it to a real mailbox you specify (Gmail, Outlook, your registrar's email, etc).
- **Activity log** — every inbound message and where it was forwarded.

## Important honesty note on "free"

The dashboard, database, and code are 100% free and open — there's no license fee anywhere.
But **actually receiving email requires a real server with a public IP and port 25 open**,
because that's how the internet's mail system (SMTP) works — there's no way around it with
client-side code alone. Most consumer ISPs and some free hosting tiers block port 25 outbound
*and* some block inbound too. Options that tend to work at $0:
- A free-tier VM from a cloud provider that doesn't block inbound 25 (check their current terms — this changes often, so verify before relying on it).
- A cheap VPS (a few dollars/month) if your free option blocks port 25.

The dashboard itself can run anywhere for free (Render, Fly.io free tier, a Raspberry Pi, etc.) — 
it's only the SMTP receiver piece that needs the public-IP-with-port-25 requirement.

## Setup

```bash
npm install
cp .env.example .env
# edit .env: set APP_NAME, ADMIN_EMAIL, ADMIN_PASSWORD, SESSION_SECRET,
# and RELAY_HOST/RELAY_USER/RELAY_PASS (any SMTP account you can send through)
npm start
```

The dashboard runs on `http://localhost:3000` (or `PORT` from `.env`).
Log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

To also receive mail, set `ENABLE_SMTP=true` in `.env` and run the process with
permission to bind port 25 (root, or `setcap cap_net_bind_service=+ep $(which node)` on Linux),
or set `SMTP_PORT` to something like 2525 and use a reverse proxy / port-forward from 25.

## DNS records you'll add per domain

1. **Verification (TXT, at `@`)** — shown in the dashboard after you add a domain:
   ```
   mailforge-site-verification=MailForge_9k2xQ7pL4m
   ```
   Click "check now" in the dashboard once it's live.

2. **Mail routing (MX, at `@`)** — once verified, point mail at your server so it actually
   reaches the receiver:
   ```
   MX  @  10  yourserver.example.com
   ```
   (Replace with your server's hostname/IP setup — an MX record must point to a hostname, not a bare IP.)

3. Optional but recommended for deliverability of the *outbound* relay leg: make sure the
   mailbox/account in `RELAY_*` has its own SPF/DKIM set up correctly (that's on the relay
   provider's side, not MailForge's).

## Project layout

```
server.js            – boots the web dashboard + optionally the SMTP receiver
db.js                – SQLite schema (domains, forwards, mail_log)
utils/verify.js       – token generation + DNS TXT lookup
utils/auth.js         – single-admin login
routes/api.js         – REST API the dashboard calls
smtp/receiver.js      – inbound SMTP server + relay-forwarding logic
public/               – the dashboard itself (vanilla HTML/CSS/JS, no build step)
```

## Security notes

- This ships with a single admin account (from `.env`) — there's no public signup.
- Sessions are server-side cookies (`express-session`); set a long random `SESSION_SECRET`.
- Put this behind HTTPS (e.g. Caddy or nginx with Let's Encrypt) in production — the app itself
  serves plain HTTP so you can front it with whatever TLS setup you already use.

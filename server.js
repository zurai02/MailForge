require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const { initAdmin } = require('./utils/auth');
const apiRoutes = require('./routes/api');

initAdmin();

const app = express();
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 12 },
}));

app.use('/api', apiRoutes);
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[web] dashboard on http://localhost:${PORT}`);
});

// The inbound mail receiver is a separate service (needs port 25 / root).
// Only start it if explicitly enabled, so `npm start` works fine for anyone
// just trying out the dashboard without root access.
if (process.env.ENABLE_SMTP === 'true') {
  const { startSmtpReceiver } = require('./smtp/receiver');
  startSmtpReceiver();
} else {
  console.log('[smtp] receiver not started (set ENABLE_SMTP=true and run with the needed privileges for port 25)');
    }

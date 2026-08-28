require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const { initAdmin } = require('./utils/auth');
const apiRoutes = require('./routes/api');
const { startSmtpReceiver } = require('./smtp/receiver');

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

// Always start SMTP receiver
startSmtpReceiver();

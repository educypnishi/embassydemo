const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const slotRouter = require('./api/slotRoutes');
const embassyRouter = require('./api/embassyRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Random delay + anti-bot simulation middleware
app.use((req, res, next) => {
  if (req.path.startsWith('/static') || req.path.match(/\.(css|js|png|jpg|ico)$/)) {
    return next();
  }

  const baseDelay = 300 + Math.floor(Math.random() * 1200);
  const r = Math.random();

  if (r < 0.02) {
    return setTimeout(() => {
      res.status(429).json({ error: 'Too Many Requests', code: 429 });
    }, baseDelay);
  } else if (r < 0.04) {
    return setTimeout(() => {
      res.status(503).json({ error: 'Service Unavailable', code: 503 });
    }, baseDelay);
  }

  setTimeout(next, baseDelay);
});

// API routers
app.use('/api', slotRouter);
app.use('/api/embassy', embassyRouter);

// Fallback routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/select-time', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'select-time.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`Visa portal demo server running on http://localhost:${PORT}`);
});

const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const DATA_PATH = path.join(__dirname, '..', 'data', 'slots.json');

// In-memory session store (in production, use Redis or similar)
const sessions = new Map();

function readData() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return {
      settings: { heavyLoad: false },
      slots: {}
    };
  }
}

function generateSessionToken() {
  return 'ust_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function isValidSession(token) {
  if (!token || !sessions.has(token)) return false;
  const session = sessions.get(token);
  const now = Date.now();
  
  // 7 minute session (420000ms)
  const SESSION_DURATION = 7 * 60 * 1000;
  
  if (now - session.createdAt > SESSION_DURATION) {
    sessions.delete(token);
    return false;
  }
  
  // Random 3-5% early timeout
  const earlyTimeout = Math.random() < 0.04; // ~4% average
  if (earlyTimeout) {
    sessions.delete(token);
    return false;
  }
  
  return true;
}

// Login endpoint
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  
  // Simulate embassy login delay
  const delay = 800 + Math.random() * 1200;
  
  setTimeout(() => {
    // Accept any credentials for demo (embassy doesn't validate well anyway)
    if (username && password) {
      const token = generateSessionToken();
      sessions.set(token, {
        username,
        createdAt: Date.now()
      });
      
      res.json({
        success: true,
        sessionToken: token,
        expiresIn: 420 // 7 minutes in seconds
      });
    } else {
      res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }
  }, delay);
});

// Session validation endpoint
router.get('/validate-session', (req, res) => {
  const token = req.headers['x-session-token'] || req.query.token;
  
  if (isValidSession(token)) {
    const session = sessions.get(token);
    const timeRemaining = 420000 - (Date.now() - session.createdAt);
    
    res.json({
      valid: true,
      timeRemaining: Math.floor(timeRemaining / 1000)
    });
  } else {
    res.json({
      valid: false,
      error: 'Session expired or invalid'
    });
  }
});

// Embassy calendar endpoint with AJAX delays
router.get('/calendar', (req, res) => {
  const token = req.headers['x-session-token'];
  
  if (!isValidSession(token)) {
    return res.status(401).json({ error: 'Session expired', code: 401 });
  }
  
  const monthKey = req.query.month;
  const center = req.query.center || 'DXB';
  const type = req.query.type || 'Tourist';
  
  if (!monthKey) {
    return res.status(400).json({ error: 'month query param (YYYY-MM) required' });
  }
  
  // Embassy-style delays: 1-2 sec base + 10-20% chance of extra delay
  let delay = 1000 + Math.random() * 1000; // 1-2 seconds
  
  if (Math.random() < 0.15) { // 15% chance of delayed response
    delay += 2000 + Math.random() * 3000; // Extra 2-5 seconds
  }
  
  setTimeout(() => {
    const data = readData();
    
    // Ensure structure exists
    if (!data.slots) data.slots = {};
    if (!data.slots[monthKey]) data.slots[monthKey] = {};
    if (!data.slots[monthKey][center]) data.slots[monthKey][center] = {};
    if (!data.slots[monthKey][center][type]) {
      data.slots[monthKey][center][type] = { days: {} };
    }
    
    const days = data.slots[monthKey][center][type].days || {};
    
    // Real-embassy behavior: 15-25% chance of NO availability in entire month
    const noAvailabilityChance = 0.15 + Math.random() * 0.10; // 15-25%
    const forceNoAvailability = Math.random() < noAvailabilityChance;
    
    let daysArray;
    if (forceNoAvailability) {
      // Return all days as unavailable
      daysArray = Object.keys(days).map((dateStr) => ({
        date: dateStr,
        status: 'na',
        dayStatus: 'na',
        isOpen: false,
        className: 'closed-date'
      }));
    } else {
      // Normal response with actual availability
      daysArray = Object.keys(days).map((dateStr) => ({
        date: dateStr,
        status: days[dateStr].status || 'na',
        dayStatus: days[dateStr].status || 'na',
        isOpen: days[dateStr].status === 'available',
        className: days[dateStr].status === 'available' ? 'open-date' : 'closed-date'
      }));
    }
    
    res.json({
      month: monthKey,
      center,
      type,
      days: daysArray,
      loadTime: new Date().toISOString(),
      noAvailability: forceNoAvailability // Debug flag
    });
  }, delay);
});

// Time slots endpoint
router.get('/time-slots', (req, res) => {
  const token = req.headers['x-session-token'];
  
  if (!isValidSession(token)) {
    return res.status(401).json({ error: 'Session expired', code: 401 });
  }
  
  const dateStr = req.query.date;
  const center = req.query.center || 'DXB';
  const type = req.query.type || 'Tourist';
  
  if (!dateStr) {
    return res.status(400).json({ error: 'date query param required' });
  }
  
  const delay = 600 + Math.random() * 800;
  
  setTimeout(() => {
    const data = readData();
    const monthKey = dateStr.slice(0, 7);
    
    if (!data.slots?.[monthKey]?.[center]?.[type]?.days?.[dateStr]) {
      return res.json({
        date: dateStr,
        slots: [],
        available: false,
        noAvailability: false
      });
    }
    
    const dayData = data.slots[monthKey][center][type].days[dateStr];
    const slotsObj = dayData.slots || {};
    
    // Real-embassy behavior: 10% chance of NO time slots even if day is available
    const forceNoSlots = Math.random() < 0.10;
    
    let slotsArray;
    if (forceNoSlots) {
      // Return empty slots (embassy says "no appointments available")
      slotsArray = [];
    } else {
      // Convert to embassy-style array format
      slotsArray = Object.keys(slotsObj)
        .sort()
        .map((time) => ({
          time,
          status: slotsObj[time],
          available: slotsObj[time] === 'available',
          action: 'select-time'
        }));
    }
    
    res.json({
      date: dateStr,
      status: forceNoSlots ? 'na' : dayData.status,
      slots: slotsArray,
      totalSlots: slotsArray.length,
      availableSlots: slotsArray.filter(s => s.available).length,
      noAvailability: forceNoSlots // Debug flag
    });
  }, delay);
});

// JSON Calendar endpoint (for BLS/Schengen mode)
router.get('/json-calendar', (req, res) => {
  const token = req.headers['x-session-token'];
  
  if (!isValidSession(token)) {
    return res.status(401).json({ error: 'Session expired', code: 401 });
  }
  
  const monthKey = req.query.month;
  const center = req.query.center || 'DXB';
  const type = req.query.type || 'Tourist';
  
  if (!monthKey) {
    return res.status(400).json({ error: 'month query param (YYYY-MM) required' });
  }
  
  const delay = 800 + Math.random() * 1200;
  
  setTimeout(() => {
    const data = readData();
    
    // Ensure structure exists
    if (!data.slots) data.slots = {};
    if (!data.slots[monthKey]) data.slots[monthKey] = {};
    if (!data.slots[monthKey][center]) data.slots[monthKey][center] = {};
    if (!data.slots[monthKey][center][type]) {
      data.slots[monthKey][center][type] = { days: {} };
    }
    
    const days = data.slots[monthKey][center][type].days || {};
    
    // Return only available dates as JSON array (BLS style)
    const availableDates = Object.keys(days)
      .filter(dateStr => days[dateStr].status === 'available')
      .map(dateStr => ({
        date: dateStr,
        dayOfWeek: new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' }),
        slotsAvailable: Object.values(days[dateStr].slots || {}).filter(s => s === 'available').length
      }));
    
    res.json({
      month: monthKey,
      center,
      type,
      mode: 'json',
      availableDates: availableDates,
      totalAvailable: availableDates.length,
      message: availableDates.length === 0 ? 'No appointments available' : 'Appointments found'
    });
  }, delay);
});

// Logout endpoint
router.post('/logout', (req, res) => {
  const token = req.headers['x-session-token'];
  
  if (token && sessions.has(token)) {
    sessions.delete(token);
  }
  
  res.json({ success: true });
});

module.exports = router;

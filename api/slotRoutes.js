const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const DATA_PATH = path.join(__dirname, '..', 'data', 'slots.json');

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

function writeData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function ensureStructure(data, monthKey, center, type) {
  if (!data.slots) data.slots = {};
  if (!data.slots[monthKey]) data.slots[monthKey] = {};
  if (!data.slots[monthKey][center]) data.slots[monthKey][center] = {};
  if (!data.slots[monthKey][center][type]) data.slots[monthKey][center][type] = { days: {} };
  return data;
}

function getMonthKeyFromDate(dateStr) {
  return dateStr.slice(0, 7);
}

function applyHeavyLoadAndErrors(data, req, res, proceed) {
  const heavy = data.settings && data.settings.heavyLoad;
  const baseDelay = heavy ? 2000 + Math.floor(Math.random() * 1000) : 0;
  const errorChance = heavy ? 0.25 : 0.08;

  const rand = Math.random();

  if (rand < errorChance / 2) {
    return setTimeout(() => {
      res.status(429).json({ error: 'Too Many Requests', code: 429, heavyLoad: !!heavy });
    }, baseDelay);
  } else if (rand < errorChance) {
    return setTimeout(() => {
      res.status(503).json({ error: 'Service Unavailable', code: 503, heavyLoad: !!heavy });
    }, baseDelay);
  }

  setTimeout(proceed, baseDelay);
}

function generateDefaultSlotsForDay() {
  const slots = {};
  for (let h = 8; h <= 17; h++) {
    for (let m of [0, 15, 30, 45]) {
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      slots[`${hh}:${mm}`] = 'available';
    }
  }
  return slots;
}

router.get('/slots', (req, res) => {
  const data = readData();
  applyHeavyLoadAndErrors(data, req, res, () => {
    const center = req.query.center || 'DXB';
    const type = req.query.type || 'Tourist';
    const monthKey = req.query.month;

    if (!monthKey) {
      return res.status(400).json({ error: 'month query param (YYYY-MM) required' });
    }

    ensureStructure(data, monthKey, center, type);
    const days = data.slots[monthKey][center][type].days || {};

    const result = Object.keys(days).map((dateStr) => ({
      date: dateStr,
      status: days[dateStr].status || 'na'
    }));

    res.json({
      month: monthKey,
      center,
      type,
      days: result
    });
  });
});

router.get('/slots/day', (req, res) => {
  const data = readData();
  applyHeavyLoadAndErrors(data, req, res, () => {
    const dateStr = req.query.date;
    if (!dateStr) {
      return res.status(400).json({ error: 'date query param (YYYY-MM-DD) required' });
    }
    const center = req.query.center || 'DXB';
    const type = req.query.type || 'Tourist';
    const monthKey = getMonthKeyFromDate(dateStr);

    ensureStructure(data, monthKey, center, type);
    const days = data.slots[monthKey][center][type].days;

    if (!days[dateStr]) {
      days[dateStr] = {
        status: 'na',
        slots: generateDefaultSlotsForDay()
      };
      writeData(data);
    }

    res.json({
      date: dateStr,
      center,
      type,
      status: days[dateStr].status,
      slots: days[dateStr].slots
    });
  });
});

router.post('/admin/updateDateStatus', (req, res) => {
  const data = readData();
  const { date, center = 'DXB', type = 'Tourist', status } = req.body || {};

  if (!date || !status) {
    return res.status(400).json({ error: 'date and status required' });
  }
  if (!['available', 'na', 'full', 'holiday'].includes(status)) {
    return res.status(400).json({ error: 'invalid status' });
  }

  const monthKey = getMonthKeyFromDate(date);
  ensureStructure(data, monthKey, center, type);
  const days = data.slots[monthKey][center][type].days;

  if (!days[date]) {
    days[date] = { status: status, slots: generateDefaultSlotsForDay() };
  } else {
    days[date].status = status;
    if (!days[date].slots) {
      days[date].slots = generateDefaultSlotsForDay();
    }
  }

  writeData(data);
  res.json({ success: true, date, center, type, status, updated: days[date] });
});

router.post('/admin/updateSlotStatus', (req, res) => {
  const data = readData();
  const { date, center = 'DXB', type = 'Tourist', slot, status } = req.body || {};

  if (!date || !slot || !status) {
    return res.status(400).json({ error: 'date, slot, status required' });
  }
  if (!['available', 'booked'].includes(status)) {
    return res.status(400).json({ error: 'invalid slot status' });
  }

  const monthKey = getMonthKeyFromDate(date);
  ensureStructure(data, monthKey, center, type);
  const days = data.slots[monthKey][center][type].days;

  if (!days[date]) {
    days[date] = { status: 'available', slots: generateDefaultSlotsForDay() };
  }
  if (!days[date].slots) {
    days[date].slots = generateDefaultSlotsForDay();
  }

  days[date].slots[slot] = status;

  writeData(data);
  res.json({ success: true, date, center, type, slot, status });
});

router.post('/admin/simulateDrop', (req, res) => {
  const data = readData();
  const { month, center = 'DXB', type = 'Tourist' } = req.body || {};

  if (!month) {
    return res.status(400).json({ error: 'month required' });
  }

  ensureStructure(data, month, center, type);
  const days = data.slots[month][center][type].days;

  const naDays = Object.keys(days).filter((d) => days[d].status === 'na');
  if (naDays.length === 0) {
    return res.status(400).json({ error: 'No NA days to drop slots for' });
  }

  const chosenDay = naDays[Math.floor(Math.random() * naDays.length)];
  days[chosenDay].status = 'available';
  if (!days[chosenDay].slots) {
    days[chosenDay].slots = generateDefaultSlotsForDay();
  } else {
    Object.keys(days[chosenDay].slots).forEach((s) => {
      if (Math.random() < 0.6) {
        days[chosenDay].slots[s] = 'available';
      }
    });
  }

  writeData(data);
  res.json({
    success: true,
    droppedDate: chosenDay,
    month,
    center,
    type,
    dayData: days[chosenDay]
  });
});

router.post('/admin/toggleHeavyLoad', (req, res) => {
  const data = readData();
  const { enabled } = req.body || {};

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled boolean required' });
  }

  if (!data.settings) data.settings = {};
  data.settings.heavyLoad = enabled;
  writeData(data);

  res.json({ success: true, heavyLoad: enabled });
});

router.get('/admin/jsonPreview', (req, res) => {
  const data = readData();
  const center = req.query.center || 'DXB';
  const type = req.query.type || 'Tourist';
  const monthKey = req.query.month;

  if (!monthKey) {
    return res.status(400).json({ error: 'month query param required' });
  }

  ensureStructure(data, monthKey, center, type);
  res.json({
    month: monthKey,
    center,
    type,
    raw: data.slots[monthKey][center][type]
  });
});

module.exports = router;

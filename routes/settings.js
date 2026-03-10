const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const dataFile = path.join(__dirname, '..', 'data', 'settings.json');

function readSettings() {
  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  if (!data.rooms) data.rooms = [];
  return data;
}

function writeSettings(settings) {
  fs.writeFileSync(dataFile, JSON.stringify(settings, null, 2), 'utf8');
}

// Settings page
router.get('/', (req, res) => {
  const settings = readSettings();
  res.render('settings/index', { page: 'settings', settings, success: null, error: null });
});

// Save settings
router.post('/', (req, res) => {
  const { centreName, phone, email, address, currency } = req.body;

  if (!centreName) {
    const settings = readSettings();
    return res.render('settings/index', {
      page: 'settings', settings,
      success: null, error: 'Centre name is required.'
    });
  }

  const currentSettings = readSettings();
  const settings = {
    centreName: centreName.trim(),
    phone: (phone || '').trim(),
    email: (email || '').trim(),
    address: (address || '').trim(),
    currency: (currency || 'USD').trim(),
    rooms: currentSettings.rooms || []
  };
  writeSettings(settings);

  res.render('settings/index', {
    page: 'settings', settings,
    success: 'Settings saved successfully.', error: null
  });
});

// Add room
router.post('/rooms/add', (req, res) => {
  const { roomName } = req.body;
  if (!roomName || !roomName.trim()) {
    return res.redirect('/settings');
  }

  const settings = readSettings();
  if (!settings.rooms) settings.rooms = [];
  settings.rooms.push(roomName.trim());
  writeSettings(settings);

  res.redirect('/settings');
});

// Delete room
router.post('/rooms/delete', (req, res) => {
  const { roomIndex } = req.body;
  const settings = readSettings();
  if (!settings.rooms) settings.rooms = [];

  const idx = parseInt(roomIndex);
  if (!isNaN(idx) && idx >= 0 && idx < settings.rooms.length) {
    settings.rooms.splice(idx, 1);
    writeSettings(settings);
  }

  res.redirect('/settings');
});

module.exports = router;

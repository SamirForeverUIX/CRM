const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const dataFile = path.join(__dirname, '..', 'data', 'settings.json');

function readSettings() {
  return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
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

  const settings = {
    centreName: centreName.trim(),
    phone: (phone || '').trim(),
    email: (email || '').trim(),
    address: (address || '').trim(),
    currency: (currency || 'USD').trim()
  };
  writeSettings(settings);

  res.render('settings/index', {
    page: 'settings', settings,
    success: 'Settings saved successfully.', error: null
  });
});

module.exports = router;

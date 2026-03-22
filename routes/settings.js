const express = require('express');
const router = express.Router();
const settingsRepo = require('../db/settingsRepo');

router.get('/', async (req, res, next) => {
  try {
    const settings = await settingsRepo.get();
    res.render('settings/index', { page: 'settings', settings, success: null, error: null });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { centreName, phone, email, address, currency } = req.body;
    if (!centreName) {
      const settings = await settingsRepo.get();
      return res.render('settings/index', { page: 'settings', settings, success: null, error: 'Centre name is required.' });
    }

    const currentSettings = await settingsRepo.get();
    const settings = {
      centreName: centreName.trim(),
      phone: (phone || '').trim(),
      email: (email || '').trim(),
      address: (address || '').trim(),
      currency: (currency || 'USD').trim(),
      rooms: currentSettings.rooms || []
    };
    await settingsRepo.save(settings);

    res.render('settings/index', { page: 'settings', settings, success: 'Settings saved successfully.', error: null });
  } catch (err) { next(err); }
});

router.post('/rooms/add', async (req, res, next) => {
  try {
    const { roomName } = req.body;
    if (!roomName || !roomName.trim()) return res.redirect('/settings');

    const settings = await settingsRepo.get();
    if (!settings.rooms) settings.rooms = [];
    settings.rooms.push(roomName.trim());
    await settingsRepo.save(settings);

    res.redirect('/settings');
  } catch (err) { next(err); }
});

router.post('/rooms/delete', async (req, res, next) => {
  try {
    const { roomIndex } = req.body;
    const settings = await settingsRepo.get();
    if (!settings.rooms) settings.rooms = [];

    const idx = parseInt(roomIndex);
    if (!isNaN(idx) && idx >= 0 && idx < settings.rooms.length) {
      settings.rooms.splice(idx, 1);
      await settingsRepo.save(settings);
    }

    res.redirect('/settings');
  } catch (err) { next(err); }
});

module.exports = router;

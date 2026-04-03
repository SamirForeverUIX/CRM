const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const settingsRepo = require('../db/settingsRepo');
const roomsRepo = require('../db/roomsRepo');
const { isValidEmail, parsePositiveInt } = require('../utils/validation');

router.get('/', async (req, res, next) => {
  try {
    const [settings, rooms] = await Promise.all([
      settingsRepo.get(),
      roomsRepo.findAll()
    ]);
    res.render('settings/index', { page: 'settings', settings, rooms, success: null, error: null });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { centreName, phone, email, address, currency } = req.body;
    if (!centreName) {
      const [settings, rooms] = await Promise.all([settingsRepo.get(), roomsRepo.findAll()]);
      return res.render('settings/index', { page: 'settings', settings, rooms, success: null, error: 'Centre name is required.' });
    }
    if (email && !isValidEmail(email)) {
      const [settings, rooms] = await Promise.all([settingsRepo.get(), roomsRepo.findAll()]);
      return res.render('settings/index', { page: 'settings', settings, rooms, success: null, error: 'Invalid email format.' });
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

    const rooms = await roomsRepo.findAll();
    res.render('settings/index', { page: 'settings', settings, rooms, success: 'Settings saved successfully.', error: null });
  } catch (err) { next(err); }
});

router.post('/rooms/add', async (req, res, next) => {
  try {
    const { name, capacity } = req.body;
    if (!name || !name.trim()) return res.redirect('/settings#rooms');

    const parsedCapacity = capacity ? parsePositiveInt(capacity) : 0;
    if (parsedCapacity === null) return res.redirect('/settings#rooms');

    await roomsRepo.create({
      id: uuidv4(),
      name: name.trim(),
      capacity: parsedCapacity
    });

    // Also keep settings.rooms in sync for backward compat with groups
    const settings = await settingsRepo.get();
    if (!settings.rooms) settings.rooms = [];
    if (!settings.rooms.includes(name.trim())) {
      settings.rooms.push(name.trim());
      await settingsRepo.save(settings);
    }

    res.redirect('/settings#rooms');
  } catch (err) { next(err); }
});

router.post('/rooms/edit/:id', async (req, res, next) => {
  try {
    const { name, capacity } = req.body;
    if (!name || !name.trim()) return res.redirect('/settings#rooms');

    const oldRoom = await roomsRepo.findById(req.params.id);
    const parsedCapacity = capacity ? parsePositiveInt(capacity) : 0;
    if (parsedCapacity === null) return res.redirect('/settings#rooms');

    await roomsRepo.update(req.params.id, {
      name: name.trim(),
      capacity: parsedCapacity
    });

    // Update settings.rooms for backward compat
    if (oldRoom) {
      const settings = await settingsRepo.get();
      if (settings.rooms) {
        const idx = settings.rooms.indexOf(oldRoom.name);
        if (idx !== -1) {
          settings.rooms[idx] = name.trim();
          await settingsRepo.save(settings);
        }
      }
    }

    res.redirect('/settings#rooms');
  } catch (err) { next(err); }
});

router.post('/rooms/delete', async (req, res, next) => {
  try {
    const { roomId } = req.body;
    if (!roomId) return res.redirect('/settings#rooms');

    const room = await roomsRepo.findById(roomId);
    if (room) {
      const groupsRepo = require('../db/groupsRepo');
      const groups = await groupsRepo.findAll();
      const dependentGroups = groups.filter(g => g.room === room.name);
      if (dependentGroups.length > 0) {
        const [settings, rooms] = await Promise.all([settingsRepo.get(), roomsRepo.findAll()]);
        return res.render('settings/index', { page: 'settings', settings, rooms, success: null, error: 'Cannot delete room: used by ' + dependentGroups.length + ' group(s).' });
      }
    }

    await roomsRepo.delete(roomId);

    // Remove from settings.rooms for backward compat
    if (room) {
      const settings = await settingsRepo.get();
      if (settings.rooms) {
        const idx = settings.rooms.indexOf(room.name);
        if (idx !== -1) {
          settings.rooms.splice(idx, 1);
          await settingsRepo.save(settings);
        }
      }
    }

    res.redirect('/settings#rooms');
  } catch (err) { next(err); }
});

module.exports = router;

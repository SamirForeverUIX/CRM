const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const coursesRepo = require('../db/coursesRepo');
const groupsRepo = require('../db/groupsRepo');
const studentsRepo = require('../db/studentsRepo');
const settingsRepo = require('../db/settingsRepo');
const { hasMinLength, parsePositiveNumber, parsePositiveInt } = require('../utils/validation');

router.get('/', async (req, res, next) => {
  try {
    const courses = await coursesRepo.findAll();
    const search = (req.query.search || '').trim().toLowerCase();

    let filtered = courses;
    if (search) {
      filtered = courses.filter(c =>
        c.name.toLowerCase().includes(search) ||
        (c.code || '').toLowerCase().includes(search)
      );
    }

    const settings = await settingsRepo.get();
    res.render('courses/index', { page: 'courses', courses: filtered, search, currency: settings.currency || 'UZS' });
  } catch (err) { next(err); }
});

router.get('/view/:id', async (req, res, next) => {
  try {
    const course = await coursesRepo.findById(req.params.id);
    if (!course) return res.redirect('/courses');

    const [groups, students, allCourses] = await Promise.all([
      groupsRepo.findAll(),
      studentsRepo.findAllEnriched(),
      coursesRepo.findAll()
    ]);
    const courseGroups = groups.filter(g => g.courseId === course.id).map(g => ({
      ...g,
      studentCount: students.filter(s => (s.groupIds || []).includes(g.id)).length
    }));
    const colorIndex = allCourses.findIndex(c => c.id === course.id);

    res.render('courses/view', { page: 'courses', course, courseGroups, colorIndex });
  } catch (err) { next(err); }
});

router.get('/add', (req, res) => {
  res.render('courses/add', { page: 'courses', error: null });
});

router.post('/add', async (req, res, next) => {
  try {
    const { name, code, lessonsPerMonth, durationMinutes, durationMonths, price, description } = req.body;
    if (!hasMinLength(name, 3)) {
      return res.render('courses/add', { page: 'courses', error: 'Course name is required.' });
    }

    const parsedPrice = parsePositiveNumber(price);
    if (price !== undefined && price !== '' && parsedPrice === null) {
      return res.render('courses/add', { page: 'courses', error: 'Price must be a positive number.' });
    }

    const pLessons = lessonsPerMonth ? parsePositiveInt(lessonsPerMonth) : 0;
    const pDuration = durationMinutes ? parsePositiveInt(durationMinutes) : 0;
    const pMonths = durationMonths ? parsePositiveInt(durationMonths) : 0;
    if (pLessons === null || pDuration === null || pMonths === null) {
      return res.render('courses/add', { page: 'courses', error: 'Numeric fields must be valid positive numbers.' });
    }

    await coursesRepo.create({
      id: uuidv4(), name: name.trim(), code: (code || '').trim(),
      lessonsPerMonth: pLessons,
      durationMinutes: pDuration,
      durationMonths: pMonths,
      price: parsedPrice === null ? 0 : parsedPrice,
      description: (description || '').trim(),
      createdAt: new Date().toISOString()
    });
    res.redirect('/courses');
  } catch (err) { next(err); }
});

router.get('/edit/:id', async (req, res, next) => {
  try {
    const course = await coursesRepo.findById(req.params.id);
    if (!course) return res.redirect('/courses');
    res.render('courses/edit', { page: 'courses', course, error: null });
  } catch (err) { next(err); }
});

router.post('/edit/:id', async (req, res, next) => {
  try {
    const { name, code, lessonsPerMonth, durationMinutes, durationMonths, price, description } = req.body;
    const course = await coursesRepo.findById(req.params.id);
    if (!course) return res.redirect('/courses');
    if (!hasMinLength(name, 3)) {
      return res.render('courses/edit', { page: 'courses', course, error: 'Course name is required.' });
    }

    const parsedPrice = parsePositiveNumber(price);
    if (price !== undefined && price !== '' && parsedPrice === null) {
      return res.render('courses/edit', { page: 'courses', course, error: 'Price must be a positive number.' });
    }

    const pLessons = lessonsPerMonth ? parsePositiveInt(lessonsPerMonth) : 0;
    const pDuration = durationMinutes ? parsePositiveInt(durationMinutes) : 0;
    const pMonths = durationMonths ? parsePositiveInt(durationMonths) : 0;
    if (pLessons === null || pDuration === null || pMonths === null) {
      return res.render('courses/edit', { page: 'courses', course, error: 'Numeric fields must be valid positive numbers.' });
    }

    await coursesRepo.update(req.params.id, {
      name: name.trim(), code: (code || '').trim(),
      lessonsPerMonth: pLessons,
      durationMinutes: pDuration,
      durationMonths: pMonths,
      price: parsedPrice === null ? 0 : parsedPrice,
      description: (description || '').trim()
    });
    res.redirect('/courses');
  } catch (err) { next(err); }
});

router.post('/delete/:id', async (req, res, next) => {
  try {
    const groups = await groupsRepo.findAll();
    const dependentGroups = groups.filter(g => g.courseId === req.params.id);
    if (dependentGroups.length > 0) {
      return res.status(400).send('Cannot delete course: used by ' + dependentGroups.length + ' group(s). Reassign them first.');
    }
    await coursesRepo.delete(req.params.id);
    res.redirect('/courses');
  } catch (err) { next(err); }
});

module.exports = router;

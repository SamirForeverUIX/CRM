const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const coursesRepo = require('../db/coursesRepo');
const groupsRepo = require('../db/groupsRepo');
const studentsRepo = require('../db/studentsRepo');

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

    res.render('courses/index', { page: 'courses', courses: filtered, search });
  } catch (err) { next(err); }
});

router.get('/view/:id', async (req, res, next) => {
  try {
    const courses = await coursesRepo.findAll();
    const course = courses.find(c => c.id === req.params.id);
    if (!course) return res.redirect('/courses');

    const [groups, students] = await Promise.all([
      groupsRepo.findAll(),
      studentsRepo.findAllEnriched()
    ]);
    const courseGroups = groups.filter(g => g.courseId === course.id).map(g => ({
      ...g,
      studentCount: students.filter(s => (s.groupIds || []).includes(g.id)).length
    }));
    const colorIndex = courses.indexOf(course);

    res.render('courses/view', { page: 'courses', course, courseGroups, colorIndex });
  } catch (err) { next(err); }
});

router.get('/add', (req, res) => {
  res.render('courses/add', { page: 'courses', error: null });
});

router.post('/add', async (req, res, next) => {
  try {
    const { name, code, lessonsPerMonth, durationMinutes, durationMonths, price, description } = req.body;
    if (!name) {
      return res.render('courses/add', { page: 'courses', error: 'Course name is required.' });
    }
    await coursesRepo.create({
      id: uuidv4(), name: name.trim(), code: (code || '').trim(),
      lessonsPerMonth: lessonsPerMonth ? parseInt(lessonsPerMonth) : 0,
      durationMinutes: durationMinutes ? parseInt(durationMinutes) : 0,
      durationMonths: durationMonths ? parseInt(durationMonths) : 0,
      price: price ? parseFloat(price) : 0,
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
    if (!name) {
      return res.render('courses/edit', { page: 'courses', course, error: 'Course name is required.' });
    }
    await coursesRepo.update(req.params.id, {
      name: name.trim(), code: (code || '').trim(),
      lessonsPerMonth: lessonsPerMonth ? parseInt(lessonsPerMonth) : 0,
      durationMinutes: durationMinutes ? parseInt(durationMinutes) : 0,
      durationMonths: durationMonths ? parseInt(durationMonths) : 0,
      price: price ? parseFloat(price) : 0,
      description: (description || '').trim()
    });
    res.redirect('/courses');
  } catch (err) { next(err); }
});

router.post('/delete/:id', async (req, res, next) => {
  try {
    await coursesRepo.delete(req.params.id);
    res.redirect('/courses');
  } catch (err) { next(err); }
});

module.exports = router;

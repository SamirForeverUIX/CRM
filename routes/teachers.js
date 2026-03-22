const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const teachersRepo = require('../db/teachersRepo');
const groupsRepo = require('../db/groupsRepo');
const coursesRepo = require('../db/coursesRepo');
const studentsRepo = require('../db/studentsRepo');

router.get('/', async (req, res, next) => {
  try {
    const [teachers, groups] = await Promise.all([
      teachersRepo.findAll(),
      groupsRepo.findAll()
    ]);
    const search = (req.query.search || '').trim().toLowerCase();

    let filtered = teachers;
    if (search) {
      filtered = teachers.filter(t =>
        t.firstName.toLowerCase().includes(search) ||
        t.lastName.toLowerCase().includes(search) ||
        t.phone.includes(search)
      );
    }

    const enriched = filtered.map(t => ({
      ...t,
      groupCount: groups.filter(g => g.teacherId === t.id).length
    }));

    res.render('teachers/index', { page: 'teachers', teachers: enriched, search });
  } catch (err) { next(err); }
});

router.get('/view/:id', async (req, res, next) => {
  try {
    const teacher = await teachersRepo.findById(req.params.id);
    if (!teacher) return res.redirect('/teachers');

    const [groups, courses, allStudents] = await Promise.all([
      groupsRepo.findAll(),
      coursesRepo.findAll(),
      studentsRepo.findAllEnriched()
    ]);

    const teacherGroups = groups
      .filter(g => g.teacherId === teacher.id)
      .map(g => {
        const course = courses.find(c => c.id === g.courseId);
        const groupStudents = allStudents.filter(s => s.groupIds && s.groupIds.includes(g.id));
        return { ...g, course, students: groupStudents, studentCount: groupStudents.length };
      });

    res.render('teachers/view', { page: 'teachers', teacher, teacherGroups });
  } catch (err) { next(err); }
});

router.get('/add', (req, res) => {
  res.render('teachers/add', { page: 'teachers', error: null });
});

router.post('/add', async (req, res, next) => {
  try {
    const { firstName, lastName, phone } = req.body;
    if (!firstName || !lastName || !phone) {
      return res.render('teachers/add', { page: 'teachers', error: 'All fields are required.' });
    }
    await teachersRepo.create({
      id: uuidv4(), firstName: firstName.trim(), lastName: lastName.trim(),
      phone: phone.trim(), createdAt: new Date().toISOString()
    });
    res.redirect('/teachers');
  } catch (err) { next(err); }
});

router.get('/edit/:id', async (req, res, next) => {
  try {
    const teacher = await teachersRepo.findById(req.params.id);
    if (!teacher) return res.redirect('/teachers');
    res.render('teachers/edit', { page: 'teachers', teacher, error: null });
  } catch (err) { next(err); }
});

router.post('/edit/:id', async (req, res, next) => {
  try {
    const { firstName, lastName, phone } = req.body;
    const teacher = await teachersRepo.findById(req.params.id);
    if (!teacher) return res.redirect('/teachers');
    if (!firstName || !lastName || !phone) {
      return res.render('teachers/edit', { page: 'teachers', teacher, error: 'All fields are required.' });
    }
    await teachersRepo.update(req.params.id, { firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim() });
    res.redirect('/teachers/view/' + req.params.id);
  } catch (err) { next(err); }
});

router.post('/delete/:id', async (req, res, next) => {
  try {
    await teachersRepo.delete(req.params.id);
    res.redirect('/teachers');
  } catch (err) { next(err); }
});

module.exports = router;

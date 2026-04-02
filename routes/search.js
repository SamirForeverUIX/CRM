const express = require('express');
const router = express.Router();
const teachersRepo = require('../db/teachersRepo');
const groupsRepo = require('../db/groupsRepo');
const studentsRepo = require('../db/studentsRepo');
const coursesRepo = require('../db/coursesRepo');

router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim().toLowerCase();

    if (!q) {
      return res.render('search', { page: '', query: '', results: { teachers: [], groups: [], students: [], courses: [] } });
    }

    const [allTeachers, allGroups, allStudents, allCourses] = await Promise.all([
      teachersRepo.findAll(),
      groupsRepo.findAll(),
      studentsRepo.findAllEnriched(),
      coursesRepo.findAll()
    ]);

    const teachers = allTeachers.filter(t =>
      t.firstName.toLowerCase().includes(q) ||
      t.lastName.toLowerCase().includes(q) ||
      (t.phone || '').includes(q)
    );

    const groups = allGroups.filter(g =>
      g.name.toLowerCase().includes(q)
    );

    const students = allStudents.filter(s =>
      s.firstName.toLowerCase().includes(q) ||
      s.lastName.toLowerCase().includes(q) ||
      (s.phone || '').includes(q)
    );

    const courses = allCourses.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.code || '').toLowerCase().includes(q)
    );

    res.render('search', {
      page: '', query: q,
      results: { teachers, groups, students, courses }
    });
  } catch (err) { next(err); }
});

module.exports = router;

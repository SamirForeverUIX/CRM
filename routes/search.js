const express = require('express');
const router = express.Router();
const teachersRepo = require('../db/teachersRepo');
const groupsRepo = require('../db/groupsRepo');
const studentsRepo = require('../db/studentsRepo');
const coursesRepo = require('../db/coursesRepo');

router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();

    if (!q) {
      return res.render('search', { page: '', query: '', results: { teachers: [], groups: [], students: [], courses: [] } });
    }

    const [teachers, groups, students, courses] = await Promise.all([
      teachersRepo.search(q),
      groupsRepo.search(q),
      studentsRepo.search(q),
      coursesRepo.search(q)
    ]);

    res.render('search', {
      page: '', query: q,
      results: { teachers, groups, students, courses }
    });
  } catch (err) { next(err); }
});

module.exports = router;

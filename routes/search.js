const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');

function readJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
}

router.get('/', (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();

  if (!q) {
    return res.render('search', { page: '', query: '', results: { teachers: [], groups: [], students: [], courses: [] } });
  }

  const teachers = readJSON('teachers.json').filter(t =>
    t.firstName.toLowerCase().includes(q) ||
    t.lastName.toLowerCase().includes(q) ||
    t.phone.includes(q)
  );

  const groups = readJSON('groups.json').filter(g =>
    g.name.toLowerCase().includes(q)
  );

  const students = readJSON('students.json').filter(s =>
    s.firstName.toLowerCase().includes(q) ||
    s.lastName.toLowerCase().includes(q) ||
    s.phone.includes(q)
  );

  const courses = readJSON('courses.json').filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.level.toLowerCase().includes(q)
  );

  res.render('search', {
    page: '', query: q,
    results: { teachers, groups, students, courses }
  });
});

module.exports = router;

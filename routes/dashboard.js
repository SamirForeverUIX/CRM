const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');

router.get('/', (req, res) => {
  const teachers = JSON.parse(fs.readFileSync(path.join(dataDir, 'teachers.json'), 'utf8'));
  const groups = JSON.parse(fs.readFileSync(path.join(dataDir, 'groups.json'), 'utf8'));
  const students = JSON.parse(fs.readFileSync(path.join(dataDir, 'students.json'), 'utf8'));

  res.render('dashboard', {
    page: 'dashboard',
    teacherCount: teachers.length,
    groupCount: groups.length,
    studentCount: students.length
  });
});

module.exports = router;

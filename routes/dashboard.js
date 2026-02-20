const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');

function readJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
}

router.get('/', (req, res) => {
  const teachers = readJSON('teachers.json');
  const groups = readJSON('groups.json');
  const students = readJSON('students.json');
  const courses = readJSON('courses.json');

  // Calculate total income from payments
  let totalIncome = 0;
  students.forEach(s => {
    (s.payments || []).forEach(p => {
      if (p.status === 'paid' || p.status === 'partial') {
        totalIncome += p.amount || 0;
      }
    });
  });

  res.render('dashboard', {
    page: 'dashboard',
    teacherCount: teachers.length,
    groupCount: groups.length,
    studentCount: students.length,
    courseCount: courses.length,
    totalIncome
  });
});

module.exports = router;

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const dataFile = path.join(__dirname, '..', 'data', 'teachers.json');

function readTeachers() {
  return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

function writeTeachers(teachers) {
  fs.writeFileSync(dataFile, JSON.stringify(teachers, null, 2), 'utf8');
}

// List all teachers
router.get('/', (req, res) => {
  const teachers = readTeachers();
  const search = (req.query.search || '').trim().toLowerCase();

  let filtered = teachers;
  if (search) {
    filtered = teachers.filter(t =>
      t.firstName.toLowerCase().includes(search) ||
      t.lastName.toLowerCase().includes(search) ||
      t.phone.includes(search)
    );
  }

  res.render('teachers/index', { page: 'teachers', teachers: filtered, search });
});

// Add teacher form
router.get('/add', (req, res) => {
  res.render('teachers/add', { page: 'teachers', error: null });
});

// Create teacher
router.post('/add', (req, res) => {
  const { firstName, lastName, phone } = req.body;

  if (!firstName || !lastName || !phone) {
    return res.render('teachers/add', {
      page: 'teachers',
      error: 'All fields are required.'
    });
  }

  const teachers = readTeachers();
  teachers.push({
    id: uuidv4(),
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    phone: phone.trim(),
    createdAt: new Date().toISOString()
  });
  writeTeachers(teachers);

  res.redirect('/teachers');
});

// Edit teacher form
router.get('/edit/:id', (req, res) => {
  const teachers = readTeachers();
  const teacher = teachers.find(t => t.id === req.params.id);

  if (!teacher) {
    return res.redirect('/teachers');
  }

  res.render('teachers/edit', { page: 'teachers', teacher, error: null });
});

// Update teacher
router.post('/edit/:id', (req, res) => {
  const { firstName, lastName, phone } = req.body;
  const teachers = readTeachers();
  const index = teachers.findIndex(t => t.id === req.params.id);

  if (index === -1) {
    return res.redirect('/teachers');
  }

  if (!firstName || !lastName || !phone) {
    return res.render('teachers/edit', {
      page: 'teachers',
      teacher: teachers[index],
      error: 'All fields are required.'
    });
  }

  teachers[index].firstName = firstName.trim();
  teachers[index].lastName = lastName.trim();
  teachers[index].phone = phone.trim();
  writeTeachers(teachers);

  res.redirect('/teachers');
});

// Delete teacher
router.post('/delete/:id', (req, res) => {
  let teachers = readTeachers();
  teachers = teachers.filter(t => t.id !== req.params.id);
  writeTeachers(teachers);

  res.redirect('/teachers');
});

module.exports = router;

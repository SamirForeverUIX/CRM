const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const dataDir = path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDir, 'teachers.json');

function readJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
}
function readTeachers() { return JSON.parse(fs.readFileSync(dataFile, 'utf8')); }
function writeTeachers(teachers) { fs.writeFileSync(dataFile, JSON.stringify(teachers, null, 2), 'utf8'); }

router.get('/', (req, res) => {
  const teachers = readTeachers();
  const groups = readJSON('groups.json');
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
});

// Teacher view page
router.get('/view/:id', (req, res) => {
  const teachers = readTeachers();
  const teacher = teachers.find(t => t.id === req.params.id);
  if (!teacher) return res.redirect('/teachers');

  const groups = readJSON('groups.json');
  const courses = readJSON('courses.json');
  const allStudents = readJSON('students.json');

  const teacherGroups = groups
    .filter(g => g.teacherId === teacher.id)
    .map(g => {
      const course = courses.find(c => c.id === g.courseId);
      const groupStudents = allStudents.filter(s => s.groupIds && s.groupIds.includes(g.id));
      return {
        ...g,
        course,
        students: groupStudents,
        studentCount: groupStudents.length
      };
    });

  res.render('teachers/view', {
    page: 'teachers', teacher, teacherGroups
  });
});

router.get('/add', (req, res) => {
  res.render('teachers/add', { page: 'teachers', error: null });
});

router.post('/add', (req, res) => {
  const { firstName, lastName, phone } = req.body;
  if (!firstName || !lastName || !phone) {
    return res.render('teachers/add', { page: 'teachers', error: 'All fields are required.' });
  }
  const teachers = readTeachers();
  teachers.push({ id: uuidv4(), firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim(), createdAt: new Date().toISOString() });
  writeTeachers(teachers);
  res.redirect('/teachers');
});

router.get('/edit/:id', (req, res) => {
  const teachers = readTeachers();
  const teacher = teachers.find(t => t.id === req.params.id);
  if (!teacher) return res.redirect('/teachers');
  res.render('teachers/edit', { page: 'teachers', teacher, error: null });
});

router.post('/edit/:id', (req, res) => {
  const { firstName, lastName, phone } = req.body;
  const teachers = readTeachers();
  const index = teachers.findIndex(t => t.id === req.params.id);
  if (index === -1) return res.redirect('/teachers');
  if (!firstName || !lastName || !phone) {
    return res.render('teachers/edit', { page: 'teachers', teacher: teachers[index], error: 'All fields are required.' });
  }
  teachers[index].firstName = firstName.trim();
  teachers[index].lastName = lastName.trim();
  teachers[index].phone = phone.trim();
  writeTeachers(teachers);
  res.redirect('/teachers/view/' + req.params.id);
});

router.post('/delete/:id', (req, res) => {
  let teachers = readTeachers();
  teachers = teachers.filter(t => t.id !== req.params.id);
  writeTeachers(teachers);
  res.redirect('/teachers');
});

module.exports = router;

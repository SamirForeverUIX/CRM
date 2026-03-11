const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const dataDir = path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDir, 'courses.json');

function readJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
}

function readCourses() {
  return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

function writeCourses(courses) {
  fs.writeFileSync(dataFile, JSON.stringify(courses, null, 2), 'utf8');
}

// List all courses
router.get('/', (req, res) => {
  const courses = readCourses();
  const search = (req.query.search || '').trim().toLowerCase();

  let filtered = courses;
  if (search) {
    filtered = courses.filter(c =>
      c.name.toLowerCase().includes(search) ||
      (c.code || '').toLowerCase().includes(search)
    );
  }

  res.render('courses/index', { page: 'courses', courses: filtered, search });
});

// View course
router.get('/view/:id', (req, res) => {
  const courses = readCourses();
  const course = courses.find(c => c.id === req.params.id);
  if (!course) return res.redirect('/courses');

  const groups = readJSON('groups.json');
  const students = readJSON('students.json');
  const courseGroups = groups.filter(g => g.courseId === course.id).map(g => ({
    ...g,
    studentCount: students.filter(s => (s.groupIds || []).includes(g.id)).length
  }));
  const colorIndex = courses.indexOf(course);

  res.render('courses/view', { page: 'courses', course, courseGroups, colorIndex });
});

// Add course form
router.get('/add', (req, res) => {
  res.render('courses/add', { page: 'courses', error: null });
});

// Create course
router.post('/add', (req, res) => {
  const { name, code, lessonsPerMonth, durationMinutes, durationMonths, price, description } = req.body;

  if (!name) {
    return res.render('courses/add', {
      page: 'courses',
      error: 'Course name is required.'
    });
  }

  const courses = readCourses();
  courses.push({
    id: uuidv4(),
    name: name.trim(),
    code: (code || '').trim(),
    lessonsPerMonth: lessonsPerMonth ? parseInt(lessonsPerMonth) : 0,
    durationMinutes: durationMinutes ? parseInt(durationMinutes) : 0,
    durationMonths: durationMonths ? parseInt(durationMonths) : 0,
    price: price ? parseFloat(price) : 0,
    description: (description || '').trim(),
    createdAt: new Date().toISOString()
  });
  writeCourses(courses);

  res.redirect('/courses');
});

// Edit course form
router.get('/edit/:id', (req, res) => {
  const courses = readCourses();
  const course = courses.find(c => c.id === req.params.id);

  if (!course) return res.redirect('/courses');

  res.render('courses/edit', { page: 'courses', course, error: null });
});

// Update course
router.post('/edit/:id', (req, res) => {
  const { name, code, lessonsPerMonth, durationMinutes, durationMonths, price, description } = req.body;
  const courses = readCourses();
  const index = courses.findIndex(c => c.id === req.params.id);

  if (index === -1) return res.redirect('/courses');

  if (!name) {
    return res.render('courses/edit', {
      page: 'courses',
      course: courses[index],
      error: 'Course name is required.'
    });
  }

  courses[index].name = name.trim();
  courses[index].code = (code || '').trim();
  courses[index].lessonsPerMonth = lessonsPerMonth ? parseInt(lessonsPerMonth) : 0;
  courses[index].durationMinutes = durationMinutes ? parseInt(durationMinutes) : 0;
  courses[index].durationMonths = durationMonths ? parseInt(durationMonths) : 0;
  courses[index].price = price ? parseFloat(price) : 0;
  courses[index].description = (description || '').trim();
  writeCourses(courses);

  res.redirect('/courses');
});

// Delete course
router.post('/delete/:id', (req, res) => {
  let courses = readCourses();
  courses = courses.filter(c => c.id !== req.params.id);
  writeCourses(courses);

  res.redirect('/courses');
});

module.exports = router;

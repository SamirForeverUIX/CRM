const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const dataDir = path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDir, 'groups.json');

function readJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
}

function readGroups() {
  return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

function writeGroups(groups) {
  fs.writeFileSync(dataFile, JSON.stringify(groups, null, 2), 'utf8');
}

// List all groups
router.get('/', (req, res) => {
  const groups = readGroups();
  const teachers = readJSON('teachers.json');
  const courses = readJSON('courses.json');
  const students = readJSON('students.json');
  const search = (req.query.search || '').trim().toLowerCase();

  let filtered = groups;
  if (search) {
    filtered = groups.filter(g => {
      const course = courses.find(c => c.id === g.courseId);
      const teacher = teachers.find(t => t.id === g.teacherId);
      return (
        g.name.toLowerCase().includes(search) ||
        (course && course.name.toLowerCase().includes(search)) ||
        (teacher && (teacher.firstName + ' ' + teacher.lastName).toLowerCase().includes(search))
      );
    });
  }

  // Enrich groups with teacher/course/student info
  const enriched = filtered.map(g => ({
    ...g,
    teacher: teachers.find(t => t.id === g.teacherId),
    course: courses.find(c => c.id === g.courseId),
    studentCount: students.filter(s => s.groupIds && s.groupIds.includes(g.id)).length
  }));

  res.render('groups/index', { page: 'groups', groups: enriched, search });
});

// Add group form
router.get('/add', (req, res) => {
  const teachers = readJSON('teachers.json');
  const courses = readJSON('courses.json');
  res.render('groups/add', { page: 'groups', teachers, courses, error: null });
});

// Create group
router.post('/add', (req, res) => {
  const { name, courseId, teacherId, startDate, schedule, duration, price } = req.body;

  if (!name) {
    const teachers = readJSON('teachers.json');
    const courses = readJSON('courses.json');
    return res.render('groups/add', {
      page: 'groups', teachers, courses,
      error: 'Group name is required.'
    });
  }

  const groups = readGroups();
  groups.push({
    id: uuidv4(),
    name: name.trim(),
    courseId: courseId || null,
    teacherId: teacherId || null,
    startDate: startDate || '',
    schedule: (schedule || '').trim(),
    duration: (duration || '').trim(),
    price: price ? parseFloat(price) : 0,
    notes: '',
    createdAt: new Date().toISOString()
  });
  writeGroups(groups);

  res.redirect('/groups');
});

// View group details
router.get('/view/:id', (req, res) => {
  const groups = readGroups();
  const group = groups.find(g => g.id === req.params.id);
  if (!group) return res.redirect('/groups');

  const teachers = readJSON('teachers.json');
  const courses = readJSON('courses.json');
  const allStudents = readJSON('students.json');

  const teacher = teachers.find(t => t.id === group.teacherId);
  const course = courses.find(c => c.id === group.courseId);
  const groupStudents = allStudents.filter(s => s.groupIds && s.groupIds.includes(group.id));

  res.render('groups/view', {
    page: 'groups', group, teacher, course, students: groupStudents
  });
});

// Edit group form
router.get('/edit/:id', (req, res) => {
  const groups = readGroups();
  const group = groups.find(g => g.id === req.params.id);
  if (!group) return res.redirect('/groups');

  const teachers = readJSON('teachers.json');
  const courses = readJSON('courses.json');

  res.render('groups/edit', { page: 'groups', group, teachers, courses, error: null });
});

// Update group
router.post('/edit/:id', (req, res) => {
  const { name, courseId, teacherId, startDate, schedule, duration, price, notes } = req.body;
  const groups = readGroups();
  const index = groups.findIndex(g => g.id === req.params.id);

  if (index === -1) return res.redirect('/groups');

  if (!name) {
    const teachers = readJSON('teachers.json');
    const courses = readJSON('courses.json');
    return res.render('groups/edit', {
      page: 'groups', group: groups[index], teachers, courses,
      error: 'Group name is required.'
    });
  }

  groups[index].name = name.trim();
  groups[index].courseId = courseId || null;
  groups[index].teacherId = teacherId || null;
  groups[index].startDate = startDate || '';
  groups[index].schedule = (schedule || '').trim();
  groups[index].duration = (duration || '').trim();
  groups[index].price = price ? parseFloat(price) : 0;
  groups[index].notes = (notes || '').trim();
  writeGroups(groups);

  res.redirect('/groups');
});

// Delete group
router.post('/delete/:id', (req, res) => {
  let groups = readGroups();
  groups = groups.filter(g => g.id !== req.params.id);
  writeGroups(groups);

  res.redirect('/groups');
});

module.exports = router;

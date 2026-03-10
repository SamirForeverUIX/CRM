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

function readSettings() {
  const data = JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8'));
  if (!data.rooms) data.rooms = [];
  return data;
}

// Generate time slots from 06:00 to 00:00 in 30-min increments
function getTimeSlots() {
  const slots = [];
  for (let h = 6; h < 24; h++) {
    slots.push(String(h).padStart(2, '0') + ':00');
    slots.push(String(h).padStart(2, '0') + ':30');
  }
  slots.push('00:00');
  return slots;
}

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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
  const settings = readSettings();
  res.render('groups/add', {
    page: 'groups', teachers, courses,
    rooms: settings.rooms, timeSlots: getTimeSlots(), daysOfWeek: DAYS_OF_WEEK,
    error: null
  });
});

// Create group
router.post('/add', (req, res) => {
  let { name, courseId, teacherId, startDate, days, roomId, startTime } = req.body;

  if (!name) {
    const teachers = readJSON('teachers.json');
    const courses = readJSON('courses.json');
    const settings = readSettings();
    return res.render('groups/add', {
      page: 'groups', teachers, courses,
      rooms: settings.rooms, timeSlots: getTimeSlots(), daysOfWeek: DAYS_OF_WEEK,
      error: 'Group name is required.'
    });
  }

  if (!days) days = [];
  else if (!Array.isArray(days)) days = [days];

  const groups = readGroups();
  groups.push({
    id: uuidv4(),
    name: name.trim(),
    courseId: courseId || null,
    teacherId: teacherId || null,
    days: days,
    room: (roomId || '').trim(),
    startTime: (startTime || '').trim(),
    startDate: startDate || '',
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
  const settings = readSettings();

  res.render('groups/edit', {
    page: 'groups', group, teachers, courses,
    rooms: settings.rooms, timeSlots: getTimeSlots(), daysOfWeek: DAYS_OF_WEEK,
    error: null
  });
});

// Update group
router.post('/edit/:id', (req, res) => {
  let { name, courseId, teacherId, startDate, days, roomId, startTime } = req.body;
  const groups = readGroups();
  const index = groups.findIndex(g => g.id === req.params.id);

  if (index === -1) return res.redirect('/groups');

  if (!name) {
    const teachers = readJSON('teachers.json');
    const courses = readJSON('courses.json');
    const settings = readSettings();
    return res.render('groups/edit', {
      page: 'groups', group: groups[index], teachers, courses,
      rooms: settings.rooms, timeSlots: getTimeSlots(), daysOfWeek: DAYS_OF_WEEK,
      error: 'Group name is required.'
    });
  }

  if (!days) days = [];
  else if (!Array.isArray(days)) days = [days];

  groups[index].name = name.trim();
  groups[index].courseId = courseId || null;
  groups[index].teacherId = teacherId || null;
  groups[index].days = days;
  groups[index].room = (roomId || '').trim();
  groups[index].startTime = (startTime || '').trim();
  groups[index].startDate = startDate || '';
  writeGroups(groups);

  res.redirect('/groups');
});

// Save attendance
router.post('/:id/attendance', (req, res) => {
  const groupId = req.params.id;
  const { date } = req.body;
  let { present } = req.body;

  if (!present) present = [];
  else if (!Array.isArray(present)) present = [present];

  const groups = readGroups();
  const group = groups.find(g => g.id === groupId);
  if (!group) return res.redirect('/groups');

  if (!group.attendance) group.attendance = [];

  // Remove existing record for same date
  group.attendance = group.attendance.filter(a => a.date !== date);
  group.attendance.push({
    date: date || new Date().toISOString().split('T')[0],
    present
  });

  const index = groups.findIndex(g => g.id === groupId);
  groups[index] = group;
  writeGroups(groups);

  res.redirect('/groups/view/' + groupId);
});

// Delete group
router.post('/delete/:id', (req, res) => {
  let groups = readGroups();
  groups = groups.filter(g => g.id !== req.params.id);
  writeGroups(groups);

  res.redirect('/groups');
});

module.exports = router;

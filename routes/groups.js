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

// Map day abbreviations to JS getDay() values (0=Sun, 1=Mon, ..., 6=Sat)
const DAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Calculate exact lesson dates from startDate + days + totalLessons
function calculateLessonDates(startDate, days, totalLessons) {
  if (!startDate || !days || days.length === 0 || !totalLessons || totalLessons <= 0) {
    return [];
  }

  const dayNumbers = days.map(d => DAY_MAP[d]).filter(n => n !== undefined);
  if (dayNumbers.length === 0) return [];

  const dates = [];
  const current = new Date(startDate + 'T00:00:00');

  // Safety: max 365 days ahead
  const maxDate = new Date(current);
  maxDate.setFullYear(maxDate.getFullYear() + 1);

  while (dates.length < totalLessons && current <= maxDate) {
    if (dayNumbers.includes(current.getDay())) {
      dates.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }

  return dates;
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
    attendance: [],
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

  // Calculate lesson dates from course.lessonsPerMonth and group schedule
  const totalLessons = course ? (course.lessonsPerMonth || 0) : 0;
  const lessonDates = calculateLessonDates(group.startDate, group.days, totalLessons);

  // Build attendance map: { 'YYYY-MM-DD': [studentId, ...] }
  const attendanceMap = {};
  if (group.attendance) {
    group.attendance.forEach(a => {
      attendanceMap[a.date] = a.present || [];
    });
  }

  res.render('groups/view', {
    page: 'groups', group, teacher, course, students: groupStudents,
    lessonDates, attendanceMap
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

// Save attendance for a specific date
router.post('/:id/attendance', (req, res) => {
  const groupId = req.params.id;
  const { date } = req.body;
  let { present } = req.body;

  if (!present) present = [];
  else if (!Array.isArray(present)) present = [present];
  // Filter out the empty marker
  present = present.filter(p => p !== '__none__');

  const groups = readGroups();
  const group = groups.find(g => g.id === groupId);
  if (!group) return res.redirect('/groups');

  if (!group.attendance) group.attendance = [];

  // Remove existing record for same date, then add new
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

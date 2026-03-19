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

function readStudents() {
  return JSON.parse(fs.readFileSync(path.join(dataDir, 'students.json'), 'utf8'));
}

function writeStudents(students) {
  fs.writeFileSync(path.join(dataDir, 'students.json'), JSON.stringify(students, null, 2), 'utf8');
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

// Calculate ALL lesson dates from startDate + days of week + total lessons count
// totalLessons = lessonsPerMonth * durationMonths (full course duration)
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

// Get lessons for a specific month from all lesson dates
function getLessonsByMonth(lessonDates, year, month) {
  return lessonDates.filter(d => d.getFullYear() === year && d.getMonth() === month);
}

// Format date as YYYY-MM-DD
function dateToStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
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

  const now = new Date();
  const enriched = filtered.map(g => {
    const teacher = teachers.find(t => t.id === g.teacherId);
    const course = courses.find(c => c.id === g.courseId);
    const studentCount = students.filter(s => s.groupIds && s.groupIds.includes(g.id)).length;

    // Calculate training end date
    let endDate = '';
    if (g.startDate && course && course.durationMonths) {
      const ed = new Date(g.startDate);
      ed.setMonth(ed.getMonth() + course.durationMonths);
      endDate = ed.toISOString().split('T')[0];
    }

    // Calculate week of study (months and weeks since start)
    let weekOfStudy = { months: 0, weeks: 0 };
    if (g.startDate) {
      const start = new Date(g.startDate);
      const diffMs = now - start;
      if (diffMs > 0) {
        const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        weekOfStudy.months = Math.floor(totalDays / 30);
        weekOfStudy.weeks = Math.floor((totalDays % 30) / 7);
      }
    }

    return { ...g, teacher, course, studentCount, endDate, weekOfStudy };
  });

  res.render('groups/index', {
    page: 'groups', groups: enriched, search,
    teachers, courses, rooms: readSettings().rooms,
    timeSlots: getTimeSlots(), daysOfWeek: DAYS_OF_WEEK
  });
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
  const groupStudents = allStudents.filter(s => s.groupIds && s.groupIds.includes(group.id)).map(s => {
    // Calculate balance for dot color
    const payments = s.payments || [];
    let totalPaid = 0;
    payments.forEach(p => {
      if (p.status === 'paid' || p.status === 'partial') totalPaid += p.amount || 0;
    });
    let totalOwed = 0;
    (s.groupIds || []).forEach(gid => {
      const g2 = groups.find(gr => gr.id === gid);
      if (g2 && g2.courseId) {
        const c2 = courses.find(cr => cr.id === g2.courseId);
        if (c2 && c2.price) totalOwed += c2.price;
      }
    });
    // Get join date for this group
    const joinDates = s.groupJoinDates || {};
    const joinedAt = joinDates[group.id] || s.createdAt || '';
    return { ...s, balance: totalPaid - totalOwed, joinedAt };
  });
  const settings = readSettings();

  // Calculate end date
  let endDate = '';
  if (group.startDate && course && course.durationMonths) {
    const sd = new Date(group.startDate);
    sd.setMonth(sd.getMonth() + course.durationMonths);
    endDate = sd.toISOString().split('T')[0];
  }
  if (group.endDate) endDate = group.endDate;

  // Calculate ALL lesson dates for the entire course duration
  const lessonsPerMonth = course ? (course.lessonsPerMonth || 0) : 0;
  const durationMonths = course ? (course.durationMonths || 1) : 1;
  const totalLessons = lessonsPerMonth * durationMonths;
  const allLessonDates = calculateLessonDates(group.startDate, group.days, totalLessons);

  // Month navigation: determine which month to show
  const monthParam = req.query.month; // format: YYYY-MM
  let viewYear, viewMonth;
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    viewYear = parseInt(monthParam.split('-')[0]);
    viewMonth = parseInt(monthParam.split('-')[1]) - 1; // 0-indexed
  } else {
    // Default to current month, or first lesson month if no lessons this month
    const now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
    // If no lessons this month, show the first month that has lessons
    const thisMonthLessons = getLessonsByMonth(allLessonDates, viewYear, viewMonth);
    if (thisMonthLessons.length === 0 && allLessonDates.length > 0) {
      viewYear = allLessonDates[0].getFullYear();
      viewMonth = allLessonDates[0].getMonth();
    }
  }

  // Get lessons for the current view month
  const lessonDates = getLessonsByMonth(allLessonDates, viewYear, viewMonth);

  // Compute available months for navigation (all months that have lessons)
  const monthSet = new Set();
  allLessonDates.forEach(d => {
    monthSet.add(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  });
  const availableMonths = Array.from(monthSet).sort();

  // Current month key for navigation
  const currentMonthKey = viewYear + '-' + String(viewMonth + 1).padStart(2, '0');
  const currentMonthIdx = availableMonths.indexOf(currentMonthKey);
  const prevMonth = currentMonthIdx > 0 ? availableMonths[currentMonthIdx - 1] : null;
  const nextMonth = currentMonthIdx < availableMonths.length - 1 ? availableMonths[currentMonthIdx + 1] : null;

  // Month display name
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const viewMonthName = monthNames[viewMonth] + ' ' + viewYear;

  // Build attendance map: { 'YYYY-MM-DD': { studentId: 'was'|'not' } }
  const attendanceMap = {};
  if (group.attendance) {
    group.attendance.forEach(a => {
      if (a.statuses) {
        attendanceMap[a.date] = a.statuses;
      } else if (a.present) {
        // Migrate old format on read
        const statuses = {};
        a.present.forEach(id => { statuses[id] = 'was'; });
        attendanceMap[a.date] = statuses;
      }
    });
  }

  res.render('groups/view', {
    page: 'groups', group, teacher, course, students: groupStudents,
    lessonDates, allLessonDates, attendanceMap, endDate,
    viewMonthName, currentMonthKey, prevMonth, nextMonth, availableMonths,
    teachers, courses, rooms: settings.rooms,
    timeSlots: getTimeSlots(), daysOfWeek: DAYS_OF_WEEK
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
  if (req.body.endDate !== undefined) {
    groups[index].endDate = req.body.endDate || '';
  }
  writeGroups(groups);

  res.redirect('/groups/view/' + req.params.id);
});

// Save attendance for a specific student+date (supports AJAX)
router.post('/:id/attendance', (req, res) => {
  const groupId = req.params.id;
  const { date, studentId, status } = req.body;

  const groups = readGroups();
  const group = groups.find(g => g.id === groupId);
  if (!group) {
    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
      return res.json({ success: false, error: 'Group not found' });
    }
    return res.redirect('/groups');
  }

  if (!group.attendance) group.attendance = [];

  // Find or create record for this date
  let record = group.attendance.find(a => a.date === date);
  if (!record) {
    record = { date: date || new Date().toISOString().split('T')[0], statuses: {} };
    group.attendance.push(record);
  }

  // Migrate old format (present array) to new format (statuses object)
  if (record.present && !record.statuses) {
    record.statuses = {};
    record.present.forEach(id => { record.statuses[id] = 'was'; });
    delete record.present;
  }
  if (!record.statuses) record.statuses = {};

  // Set the individual student's status, or clear it
  if (studentId && status) {
    if (status === 'clear') {
      delete record.statuses[studentId];
    } else {
      record.statuses[studentId] = status; // 'was' or 'not'
    }
  }

  const index = groups.findIndex(g => g.id === groupId);
  groups[index] = group;
  writeGroups(groups);

  // Support AJAX response
  if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
    return res.json({ success: true, status: status === 'clear' ? '' : status });
  }

  res.redirect('/groups/view/' + groupId);
});

// Bulk mark attendance for a column (entire lesson date) or row (entire student)
router.post('/:id/attendance/bulk', (req, res) => {
  const groupId = req.params.id;
  const { date, studentId, status, studentIds, dates } = req.body;

  const groups = readGroups();
  const group = groups.find(g => g.id === groupId);
  if (!group) return res.json({ success: false, error: 'Group not found' });

  if (!group.attendance) group.attendance = [];

  // Bulk mark a column (all students for one date)
  if (date && studentIds) {
    const ids = Array.isArray(studentIds) ? studentIds : JSON.parse(studentIds);
    let record = group.attendance.find(a => a.date === date);
    if (!record) {
      record = { date, statuses: {} };
      group.attendance.push(record);
    }
    if (!record.statuses) record.statuses = {};
    ids.forEach(sid => { record.statuses[sid] = status || 'was'; });
  }

  // Bulk mark a row (all dates for one student)
  if (studentId && dates) {
    const dateList = Array.isArray(dates) ? dates : JSON.parse(dates);
    dateList.forEach(d => {
      let record = group.attendance.find(a => a.date === d);
      if (!record) {
        record = { date: d, statuses: {} };
        group.attendance.push(record);
      }
      if (!record.statuses) record.statuses = {};
      record.statuses[studentId] = status || 'was';
    });
  }

  const index = groups.findIndex(g => g.id === groupId);
  groups[index] = group;
  writeGroups(groups);

  res.json({ success: true });
});

// Delete group
router.post('/delete/:id', (req, res) => {
  let groups = readGroups();
  groups = groups.filter(g => g.id !== req.params.id);
  writeGroups(groups);

  res.redirect('/groups');
});

module.exports = router;

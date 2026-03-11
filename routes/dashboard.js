const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');

function readJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
}

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return diffMins + 'm ago';
  if (diffHours < 24) return diffHours + 'h ago';
  if (diffDays < 7) return diffDays + 'd ago';
  return date.toLocaleDateString();
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

router.get('/', (req, res) => {
  const teachers = readJSON('teachers.json');
  const groups = readJSON('groups.json');
  const students = readJSON('students.json');
  const courses = readJSON('courses.json');
  const settings = readJSON('settings.json');

  let totalIncome = 0;
  let paidCount = 0;
  let debtorCount = 0;

  students.forEach(s => {
    const payments = s.payments || [];
    let hasPaid = false;
    let hasDebt = false;
    payments.forEach(p => {
      if (p.status === 'paid' || p.status === 'partial') {
        totalIncome += p.amount || 0;
        hasPaid = true;
      }
      if (p.status === 'unpaid' || p.status === 'partial') hasDebt = true;
    });
    if (payments.length === 0) hasDebt = true;
    if (hasPaid) paidCount++;
    if (hasDebt) debtorCount++;
  });

  const today = new Date();
  const todayDay = DAY_NAMES[today.getDay()];

  const todayGroups = groups
    .filter(g => g.days && g.days.includes(todayDay) && g.startTime)
    .map(g => {
      const teacher = teachers.find(t => t.id === g.teacherId);
      const course = courses.find(c => c.id === g.courseId);
      return {
        id: g.id, name: g.name,
        room: g.room || '',
        startTime: g.startTime,
        teacherName: teacher ? teacher.firstName + ' ' + teacher.lastName : '--',
        courseCode: course ? (course.code || course.name) : '--',
        daysStr: (g.days || []).join(', '),
        dateRange: g.startDate || '',
        studentCount: students.filter(s => s.groupIds && s.groupIds.includes(g.id)).length
      };
    });

  const rooms = settings.rooms || [];
  const scheduleRooms = rooms.length > 0 ? rooms : [...new Set(todayGroups.map(g => g.room).filter(Boolean))];

  const timeSet = new Set();
  todayGroups.forEach(g => timeSet.add(g.startTime));
  for (let h = 9; h <= 17; h++) {
    timeSet.add(String(h).padStart(2, '0') + ':00');
    if (h < 17) timeSet.add(String(h).padStart(2, '0') + ':30');
  }
  const scheduleTimeSlots = Array.from(timeSet).sort();

  const activities = [];
  students.forEach(s => {
    activities.push({ type: 'student', text: s.firstName + ' ' + s.lastName + ' was added', time: s.createdAt, timeAgo: timeAgo(s.createdAt) });
    (s.payments || []).forEach(p => {
      activities.push({ type: 'payment', text: (p.amount || 0).toLocaleString() + ' UZS from ' + s.firstName, time: p.date || s.createdAt, timeAgo: timeAgo(p.date || s.createdAt) });
    });
  });
  teachers.forEach(t => { activities.push({ type: 'teacher', text: t.firstName + ' ' + t.lastName + ' joined', time: t.createdAt, timeAgo: timeAgo(t.createdAt) }); });
  groups.forEach(g => { activities.push({ type: 'group', text: 'Group "' + g.name + '" created', time: g.createdAt, timeAgo: timeAgo(g.createdAt) }); });

  activities.sort((a, b) => new Date(b.time) - new Date(a.time));
  const recentActivities = activities.slice(0, 8);

  const recentStudents = [...students]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5)
    .map(s => ({ ...s, groupNames: (s.groupIds || []).map(gid => { const g = groups.find(gr => gr.id === gid); return g ? g.name : 'Unknown'; }) }));

  res.render('dashboard', {
    page: 'dashboard', teacherCount: teachers.length, groupCount: groups.length,
    studentCount: students.length, courseCount: courses.length,
    totalIncome, debtorCount, paidCount,
    todayGroups, scheduleRooms, scheduleTimeSlots,
    recentActivities, recentStudents
  });
});

module.exports = router;

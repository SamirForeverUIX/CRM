const express = require('express');
const router = express.Router();
const teachersRepo = require('../db/teachersRepo');
const groupsRepo = require('../db/groupsRepo');
const studentsRepo = require('../db/studentsRepo');
const coursesRepo = require('../db/coursesRepo');
const settingsRepo = require('../db/settingsRepo');

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

router.get('/', async (req, res, next) => {
  try {
    const [teachers, groups, students, courses, settings] = await Promise.all([
      teachersRepo.findAll(),
      groupsRepo.findAll(),
      studentsRepo.findAllEnriched(),
      coursesRepo.findAll(),
      settingsRepo.get()
    ]);

    let totalIncome = 0;
    let paidCount = 0;
    let debtorCount = 0;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const currentMonthKey = currentYear + '-' + String(currentMonth + 1).padStart(2, '0');

    students.forEach(s => {
      const payments = s.payments || [];
      const charges = s.charges || [];
      const totalCharges = charges.reduce((sum, c) => sum + c.amount, 0);
      const totalPayments = payments.reduce((sum, p) =>
        (p.status === 'paid' || p.status === 'partial') ? sum + (p.amount || 0) : sum, 0);
      const balance = totalPayments - totalCharges;

      let hasPaidThisMonth = false;
      payments.forEach(p => {
        const isThisMonth = p.date && (() => {
          const pd = new Date(p.date);
          return pd.getFullYear() === currentYear && pd.getMonth() === currentMonth;
        })();
        if (isThisMonth && (p.status === 'paid' || p.status === 'partial')) {
          totalIncome += p.amount || 0;
          hasPaidThisMonth = true;
        }
      });
      if (hasPaidThisMonth) paidCount++;
      if (balance < 0) debtorCount++;
    });

    const today = now;
    const todayDay = req.query.day || DAY_NAMES[today.getDay()];

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

    // Build time slots from 09:00 to 17:00 in 30-minute intervals
    const timeSet = new Set();
    todayGroups.forEach(g => timeSet.add(g.startTime));
    for (let h = 9; h <= 17; h++) {
      timeSet.add(String(h).padStart(2, '0') + ':00');
      if (h < 17) timeSet.add(String(h).padStart(2, '0') + ':30');
    }
    const scheduleTimeSlots = Array.from(timeSet).sort();

    // Compute "new X days" badge: days since group was created
    todayGroups.forEach(g => {
      const grp = groups.find(gr => gr.id === g.id);
      if (grp && grp.createdAt) {
        const created = new Date(grp.createdAt);
        const diffDays = Math.floor((now - created) / 86400000);
        if (diffDays <= 30) g.newDays = diffDays;
      }
      // Add max student capacity from course if available
      const course = courses.find(c => c.id === (grp && grp.courseId));
      g.maxStudents = (course && course.maxStudents) || 0;
    });

    // Build schedule data for all days (for client-side day switching)
    const allDaysGroups = {};
    DAY_NAMES.forEach(day => {
      allDaysGroups[day] = groups
        .filter(g => g.days && g.days.includes(day) && g.startTime)
        .map(g => {
          const teacher = teachers.find(t => t.id === g.teacherId);
          const course = courses.find(c => c.id === g.courseId);
          const studentCount = students.filter(s => s.groupIds && s.groupIds.includes(g.id)).length;
          const created = g.createdAt ? new Date(g.createdAt) : null;
          const diffDays = created ? Math.floor((now - created) / 86400000) : 999;
          return {
            id: g.id, name: g.name,
            room: g.room || '',
            startTime: g.startTime,
            teacherName: teacher ? teacher.firstName + ' ' + teacher.lastName : '--',
            courseCode: course ? (course.code || course.name) : '--',
            daysStr: (g.days || []).join(', '),
            dateRange: (g.startDate || '') + (g.endDate ? '—' + g.endDate : ''),
            studentCount: studentCount,
            maxStudents: (course && course.maxStudents) || 0,
            newDays: diffDays <= 30 ? diffDays : null
          };
        });
    });

    // Determine active leads count (placeholder — 0 for now)
    const activeLeadsCount = 0;
    // Trial lesson / left active group / left after trial are placeholders
    const trialLessonCount = 0;
    const leftActiveGroupCount = 0;
    const leftAfterTrialCount = 0;

    res.render('dashboard', {
      page: 'dashboard', teacherCount: teachers.length, groupCount: groups.length,
      studentCount: students.length, courseCount: courses.length,
      totalIncome, debtorCount, paidCount,
      todayGroups, scheduleRooms, scheduleTimeSlots,
      allDaysGroups: JSON.stringify(allDaysGroups),
      todayDay,
      activeLeadsCount, trialLessonCount, leftActiveGroupCount, leftAfterTrialCount,
      currency: settings.currency || 'USD',
      rooms: scheduleRooms
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

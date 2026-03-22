const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const groupsRepo = require('../db/groupsRepo');
const teachersRepo = require('../db/teachersRepo');
const coursesRepo = require('../db/coursesRepo');
const studentsRepo = require('../db/studentsRepo');
const settingsRepo = require('../db/settingsRepo');

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
const DAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function calculateLessonDates(startDate, days, totalLessons) {
  if (!startDate || !days || days.length === 0 || !totalLessons || totalLessons <= 0) return [];

  const dayNumbers = days.map(d => DAY_MAP[d]).filter(n => n !== undefined);
  if (dayNumbers.length === 0) return [];

  const dates = [];
  const current = new Date(startDate + 'T00:00:00');
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

function getLessonsByMonth(lessonDates, year, month) {
  return lessonDates.filter(d => d.getFullYear() === year && d.getMonth() === month);
}

function dateToStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

router.get('/', async (req, res, next) => {
  try {
    const [groups, teachers, courses, students, settings] = await Promise.all([
      groupsRepo.findAll(),
      teachersRepo.findAll(),
      coursesRepo.findAll(),
      studentsRepo.findAllEnriched(),
      settingsRepo.get()
    ]);
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

      let endDate = '';
      if (g.startDate && course && course.durationMonths) {
        const ed = new Date(g.startDate);
        ed.setMonth(ed.getMonth() + course.durationMonths);
        endDate = ed.toISOString().split('T')[0];
      }

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
      teachers, courses, rooms: settings.rooms,
      timeSlots: getTimeSlots(), daysOfWeek: DAYS_OF_WEEK
    });
  } catch (err) { next(err); }
});

router.get('/add', async (req, res, next) => {
  try {
    const [teachers, courses, settings] = await Promise.all([
      teachersRepo.findAll(),
      coursesRepo.findAll(),
      settingsRepo.get()
    ]);
    res.render('groups/add', {
      page: 'groups', teachers, courses,
      rooms: settings.rooms, timeSlots: getTimeSlots(), daysOfWeek: DAYS_OF_WEEK,
      error: null
    });
  } catch (err) { next(err); }
});

router.post('/add', async (req, res, next) => {
  try {
    let { name, courseId, teacherId, startDate, days, roomId, startTime } = req.body;

    if (!name) {
      const [teachers, courses, settings] = await Promise.all([
        teachersRepo.findAll(), coursesRepo.findAll(), settingsRepo.get()
      ]);
      return res.render('groups/add', {
        page: 'groups', teachers, courses,
        rooms: settings.rooms, timeSlots: getTimeSlots(), daysOfWeek: DAYS_OF_WEEK,
        error: 'Group name is required.'
      });
    }

    if (!days) days = [];
    else if (!Array.isArray(days)) days = [days];

    await groupsRepo.create({
      id: uuidv4(), name: name.trim(), courseId: courseId || null,
      teacherId: teacherId || null, days, room: (roomId || '').trim(),
      startTime: (startTime || '').trim(), startDate: startDate || '',
      createdAt: new Date().toISOString()
    });

    res.redirect('/groups');
  } catch (err) { next(err); }
});

router.get('/view/:id', async (req, res, next) => {
  try {
    const group = await groupsRepo.findById(req.params.id);
    if (!group) return res.redirect('/groups');

    const [teachers, courses, allStudents, attendanceRows, settings, allGroups] = await Promise.all([
      teachersRepo.findAll(),
      coursesRepo.findAll(),
      studentsRepo.findByGroupId(req.params.id),
      groupsRepo.getAttendance(req.params.id),
      settingsRepo.get(),
      groupsRepo.findAll()
    ]);

    const teacher = teachers.find(t => t.id === group.teacherId);
    const course = courses.find(c => c.id === group.courseId);

    const groupStudents = allStudents.map(s => {
      const payments = s.payments || [];
      let totalPaid = 0;
      payments.forEach(p => {
        if (p.status === 'paid' || p.status === 'partial') totalPaid += p.amount || 0;
      });
      let totalOwed = 0;
      (s.groupIds || []).forEach(gid => {
        const g2 = allGroups.find(gr => gr.id === gid);
        if (g2 && g2.courseId) {
          const c2 = courses.find(cr => cr.id === g2.courseId);
          if (c2 && c2.price) totalOwed += c2.price;
        }
      });
      const joinDates = s.groupJoinDates || {};
      const joinedAt = joinDates[group.id] || s.createdAt || '';
      return { ...s, balance: totalPaid - totalOwed, joinedAt };
    });

    let endDate = '';
    if (group.startDate && course && course.durationMonths) {
      const sd = new Date(group.startDate);
      sd.setMonth(sd.getMonth() + course.durationMonths);
      endDate = sd.toISOString().split('T')[0];
    }
    if (group.endDate) endDate = group.endDate;

    const lessonsPerMonth = course ? (course.lessonsPerMonth || 0) : 0;
    const durationMonths = course ? (course.durationMonths || 1) : 1;
    const totalLessons = lessonsPerMonth * durationMonths;
    const allLessonDates = calculateLessonDates(group.startDate, group.days, totalLessons);

    const monthParam = req.query.month;
    let viewYear, viewMonth;
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      viewYear = parseInt(monthParam.split('-')[0]);
      viewMonth = parseInt(monthParam.split('-')[1]) - 1;
    } else {
      const now = new Date();
      viewYear = now.getFullYear();
      viewMonth = now.getMonth();
      const thisMonthLessons = getLessonsByMonth(allLessonDates, viewYear, viewMonth);
      if (thisMonthLessons.length === 0 && allLessonDates.length > 0) {
        viewYear = allLessonDates[0].getFullYear();
        viewMonth = allLessonDates[0].getMonth();
      }
    }

    const lessonDates = getLessonsByMonth(allLessonDates, viewYear, viewMonth);

    const monthSet = new Set();
    allLessonDates.forEach(d => {
      monthSet.add(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    });
    const availableMonths = Array.from(monthSet).sort();

    const currentMonthKey = viewYear + '-' + String(viewMonth + 1).padStart(2, '0');
    const currentMonthIdx = availableMonths.indexOf(currentMonthKey);
    const prevMonth = currentMonthIdx > 0 ? availableMonths[currentMonthIdx - 1] : null;
    const nextMonth = currentMonthIdx < availableMonths.length - 1 ? availableMonths[currentMonthIdx + 1] : null;

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const viewMonthName = monthNames[viewMonth] + ' ' + viewYear;

    const attendanceMap = {};
    attendanceRows.forEach(a => {
      if (a.statuses) {
        attendanceMap[a.date] = a.statuses;
      }
    });

    res.render('groups/view', {
      page: 'groups', group, teacher, course, students: groupStudents,
      lessonDates, allLessonDates, attendanceMap, endDate,
      viewMonthName, currentMonthKey, prevMonth, nextMonth, availableMonths,
      teachers, courses, rooms: settings.rooms,
      timeSlots: getTimeSlots(), daysOfWeek: DAYS_OF_WEEK
    });
  } catch (err) { next(err); }
});

router.get('/edit/:id', async (req, res, next) => {
  try {
    const group = await groupsRepo.findById(req.params.id);
    if (!group) return res.redirect('/groups');

    const [teachers, courses, settings] = await Promise.all([
      teachersRepo.findAll(), coursesRepo.findAll(), settingsRepo.get()
    ]);

    res.render('groups/edit', {
      page: 'groups', group, teachers, courses,
      rooms: settings.rooms, timeSlots: getTimeSlots(), daysOfWeek: DAYS_OF_WEEK,
      error: null
    });
  } catch (err) { next(err); }
});

router.post('/edit/:id', async (req, res, next) => {
  try {
    let { name, courseId, teacherId, startDate, days, roomId, startTime } = req.body;
    const group = await groupsRepo.findById(req.params.id);
    if (!group) return res.redirect('/groups');

    if (!name) {
      const [teachers, courses, settings] = await Promise.all([
        teachersRepo.findAll(), coursesRepo.findAll(), settingsRepo.get()
      ]);
      return res.render('groups/edit', {
        page: 'groups', group, teachers, courses,
        rooms: settings.rooms, timeSlots: getTimeSlots(), daysOfWeek: DAYS_OF_WEEK,
        error: 'Group name is required.'
      });
    }

    if (!days) days = [];
    else if (!Array.isArray(days)) days = [days];

    await groupsRepo.update(req.params.id, {
      name: name.trim(), courseId: courseId || null, teacherId: teacherId || null,
      days, room: (roomId || '').trim(), startTime: (startTime || '').trim(),
      startDate: startDate || '', endDate: req.body.endDate || ''
    });

    res.redirect('/groups/view/' + req.params.id);
  } catch (err) { next(err); }
});

router.post('/:id/attendance', async (req, res, next) => {
  try {
    const groupId = req.params.id;
    const { date, studentId, status } = req.body;

    const group = await groupsRepo.findById(groupId);
    if (!group) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.json({ success: false, error: 'Group not found' });
      }
      return res.redirect('/groups');
    }

    const statuses = await groupsRepo.getAttendanceForDate(groupId, date || new Date().toISOString().split('T')[0]);

    if (studentId && status) {
      if (status === 'clear') {
        delete statuses[studentId];
      } else {
        statuses[studentId] = status;
      }
    }

    await groupsRepo.saveAttendance(groupId, date || new Date().toISOString().split('T')[0], statuses);

    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
      return res.json({ success: true, status: status === 'clear' ? '' : status });
    }

    res.redirect('/groups/view/' + groupId);
  } catch (err) { next(err); }
});

router.post('/:id/attendance/bulk', async (req, res, next) => {
  try {
    const groupId = req.params.id;
    const { date, studentId, status, studentIds, dates } = req.body;

    const group = await groupsRepo.findById(groupId);
    if (!group) return res.json({ success: false, error: 'Group not found' });

    if (date && studentIds) {
      const ids = Array.isArray(studentIds) ? studentIds : JSON.parse(studentIds);
      const statuses = await groupsRepo.getAttendanceForDate(groupId, date);
      ids.forEach(sid => { statuses[sid] = status || 'was'; });
      await groupsRepo.saveAttendance(groupId, date, statuses);
    }

    if (studentId && dates) {
      const dateList = Array.isArray(dates) ? dates : JSON.parse(dates);
      for (const d of dateList) {
        const statuses = await groupsRepo.getAttendanceForDate(groupId, d);
        statuses[studentId] = status || 'was';
        await groupsRepo.saveAttendance(groupId, d, statuses);
      }
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/delete/:id', async (req, res, next) => {
  try {
    await groupsRepo.delete(req.params.id);
    res.redirect('/groups');
  } catch (err) { next(err); }
});

module.exports = router;

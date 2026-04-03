const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const groupsRepo = require('../db/groupsRepo');
const teachersRepo = require('../db/teachersRepo');
const coursesRepo = require('../db/coursesRepo');
const studentsRepo = require('../db/studentsRepo');
const settingsRepo = require('../db/settingsRepo');
const { hasMinLength, ensureEnum, isIsoDate, isValidDayOfWeek, isValidTimeSlot, safeJsonParse } = require('../utils/validation');
const { GROUP_STATUS_VALUES, GROUP_STATUS } = require('../utils/domainConstants');
const { createStudentLifecycleService } = require('../services/studentLifecycleService');
const { buildModuleAttendanceView } = require('../utils/attendanceModules');

const lifecycle = createStudentLifecycleService(studentsRepo, groupsRepo);

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
    const statusFilter = (req.query.status || '').trim();

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
    if (statusFilter) {
      filtered = filtered.filter(g => g.status === statusFilter);
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
    let { name, courseId, teacherId, startDate, days, roomId, startTime, status } = req.body;

    if (!hasMinLength(name, 3)) {
      const [teachers, courses, settings] = await Promise.all([
        teachersRepo.findAll(), coursesRepo.findAll(), settingsRepo.get()
      ]);
      return res.render('groups/add', {
        page: 'groups', teachers, courses,
        rooms: settings.rooms, timeSlots: getTimeSlots(), daysOfWeek: DAYS_OF_WEEK,
        error: 'Group name is required (min 3 characters).'
      });
    }
    if (startDate && !isIsoDate(startDate)) {
      return res.status(400).send('Invalid start date.');
    }

    if (!days) days = [];
    else if (!Array.isArray(days)) days = [days];
    if (days.length && !days.every(isValidDayOfWeek)) {
      return res.status(400).send('Invalid day of week selected.');
    }
    if (startTime && !isValidTimeSlot(startTime)) {
      return res.status(400).send('Invalid time format.');
    }

    await groupsRepo.create({
      id: uuidv4(), name: name.trim(), courseId: courseId || null,
      teacherId: teacherId || null, days, room: (roomId || '').trim(),
      startTime: (startTime || '').trim(), startDate: startDate || '',
      status: ensureEnum(status, GROUP_STATUS_VALUES, GROUP_STATUS.ACTIVE),
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
      const totalCharges = (s.charges || []).reduce((sum, c) => sum + c.amount, 0);
      const totalPayments = (s.payments || []).reduce((sum, p) =>
        (p.status === 'paid' || p.status === 'partial') ? sum + (p.amount || 0) : sum, 0);
      const joinDates = s.groupJoinDates || {};
      const joinedAt = joinDates[group.id] || s.createdAt || '';
      return { ...s, balance: totalPayments - totalCharges, joinedAt };
    });

    // Split active vs archived for the group view
    const activeStudents = groupStudents.filter(s => s.status !== 'archived');
    const archivedStudents = groupStudents.filter(s => s.status === 'archived');

    let endDate = '';
    if (group.startDate && course && course.durationMonths) {
      const sd = new Date(group.startDate);
      sd.setMonth(sd.getMonth() + course.durationMonths);
      endDate = sd.toISOString().split('T')[0];
    }
    if (group.endDate) endDate = group.endDate;

    const lessonsPerModule = course ? (course.lessonsPerMonth || 12) : 12;
    const durationMonths = course ? (course.durationMonths || 1) : 1;
    const moduleView = buildModuleAttendanceView({
      startDate: group.startDate,
      days: group.days,
      lessonsPerModule,
      moduleCount: durationMonths,
      requestedModule: req.query.module
    });

    const attendanceMap = {};
    attendanceRows.forEach(a => {
      if (a.statuses) {
        attendanceMap[a.date] = a.statuses;
      }
    });

    res.render('groups/view', {
      page: 'groups', group, teacher, course, students: activeStudents, archivedStudents,
      lessonDates: moduleView.lessonDates,
      allLessonDates: moduleView.allLessonDates,
      attendanceMap, endDate,
      currentModule: moduleView.currentModule,
      totalModules: moduleView.totalModules,
      prevModule: moduleView.prevModule,
      nextModule: moduleView.nextModule,
      moduleLabel: moduleView.moduleLabel,
      teachers, courses, rooms: settings.rooms,
      timeSlots: getTimeSlots(), daysOfWeek: DAYS_OF_WEEK,
      currency: settings.currency || 'USD'
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
    let { name, courseId, teacherId, startDate, days, roomId, startTime, status } = req.body;
    const group = await groupsRepo.findById(req.params.id);
    if (!group) return res.redirect('/groups');

    if (!hasMinLength(name, 3)) {
      const [teachers, courses, settings] = await Promise.all([
        teachersRepo.findAll(), coursesRepo.findAll(), settingsRepo.get()
      ]);
      return res.render('groups/edit', {
        page: 'groups', group, teachers, courses,
        rooms: settings.rooms, timeSlots: getTimeSlots(), daysOfWeek: DAYS_OF_WEEK,
        error: 'Group name is required (min 3 characters).'
      });
    }
    if (startDate && !isIsoDate(startDate)) {
      return res.status(400).send('Invalid start date.');
    }

    if (!days) days = [];
    else if (!Array.isArray(days)) days = [days];
    if (days.length && !days.every(isValidDayOfWeek)) {
      return res.status(400).send('Invalid day of week selected.');
    }
    if (startTime && !isValidTimeSlot(startTime)) {
      return res.status(400).send('Invalid time format.');
    }

    await groupsRepo.update(req.params.id, {
      name: name.trim(), courseId: courseId || null, teacherId: teacherId || null,
      days, room: (roomId || '').trim(), startTime: (startTime || '').trim(),
      startDate: startDate || '', endDate: req.body.endDate || '',
      status: ensureEnum(status, GROUP_STATUS_VALUES, GROUP_STATUS.ACTIVE)
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
      let ids;
      if (Array.isArray(studentIds)) { ids = studentIds; }
      else { const parsed = safeJsonParse(studentIds); if (parsed.error) return res.status(400).json({ success: false, error: 'Invalid studentIds format' }); ids = parsed.data; }
      const statuses = await groupsRepo.getAttendanceForDate(groupId, date);
      ids.forEach(sid => { statuses[sid] = status || 'was'; });
      await groupsRepo.saveAttendance(groupId, date, statuses);
    }

    if (studentId && dates) {
      let dateList;
      if (Array.isArray(dates)) { dateList = dates; }
      else { const parsed = safeJsonParse(dates); if (parsed.error) return res.status(400).json({ success: false, error: 'Invalid dates format' }); dateList = parsed.data; }
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
    const students = await studentsRepo.findByGroupId(req.params.id);
    if (students.length > 0) {
      return res.status(400).send('Cannot delete group: has ' + students.length + ' student(s) enrolled. Remove them first.');
    }
    await groupsRepo.delete(req.params.id);
    res.redirect('/groups');
  } catch (err) { next(err); }
});

// Remove student from this group + archive the student
router.post('/:groupId/remove-student/:studentId', async (req, res, next) => {
  try {
    const { groupId, studentId } = req.params;
    const student = await studentsRepo.findById(studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    await lifecycle.removeFromGroupAndArchive(studentId, groupId);
    return res.json({ success: true });
  } catch (err) { next(err); }
});

// Restore student from archived back to active (used from group detail page)
router.post('/:groupId/restore-student/:studentId', async (req, res, next) => {
  try {
    const { groupId, studentId } = req.params;
    const student = await studentsRepo.findById(studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    await lifecycle.restoreToGroup(studentId, groupId, new Date().toISOString());
    return res.json({ success: true });
  } catch (err) {
    if (err && err.message === 'group_not_found') {
      return res.status(400).json({ error: 'Group not found' });
    }
    next(err);
  }
});

// Freeze student (inactive) from group detail page
router.post('/:groupId/freeze-student/:studentId', async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const student = await studentsRepo.findById(studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    await lifecycle.freezeStudent(studentId);
    return res.json({ success: true });
  } catch (err) { next(err); }
});

// Unfreeze student from group detail page
router.post('/:groupId/unfreeze-student/:studentId', async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const student = await studentsRepo.findById(studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    await lifecycle.unfreezeStudent(studentId);
    return res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;

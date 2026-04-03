const express = require('express');
const router = express.Router();
const studentsRepo = require('../db/studentsRepo');
const groupsRepo = require('../db/groupsRepo');
const teachersRepo = require('../db/teachersRepo');
const coursesRepo = require('../db/coursesRepo');
const settingsRepo = require('../db/settingsRepo');

// GET /api/students/:id/info
// Returns student base fields, group list, status, notes
router.get('/:id/info', async (req, res, next) => {
  try {
    const [student, groups, courses, teachers] = await Promise.all([
      studentsRepo.findByIdEnriched(req.params.id),
      groupsRepo.findAll(),
      coursesRepo.findAll(),
      teachersRepo.findAll()
    ]);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const studentGroups = (student.groupIds || [])
      .map(gid => groups.find(g => g.id === gid))
      .filter(Boolean)
      .map(g => {
        const course = g.courseId ? courses.find(c => c.id === g.courseId) : null;
        const teacher = g.teacherId ? teachers.find(t => t.id === g.teacherId) : null;
        let endDate = '';
        if (g.startDate && course && course.durationMonths) {
          const sd = new Date(g.startDate);
          sd.setMonth(sd.getMonth() + course.durationMonths);
          endDate = sd.toISOString().split('T')[0];
        }
        return {
          id: g.id,
          name: g.name,
          courseName: course ? course.name : '',
          courseCode: course ? (course.code || '') : '',
          teacherName: teacher ? (teacher.firstName + ' ' + teacher.lastName).toUpperCase() : '',
          startDate: g.startDate || '',
          endDate,
          schedule: (g.days || []).join(', '),
          scheduleTime: g.startTime || ''
        };
      });

    res.json({
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      phone: student.phone,
      birthday: student.birthday || '',
      gender: student.gender || '',
      status: student.status || 'active',
      notes: student.notes || '',
      groups: studentGroups
    });
  } catch (err) { next(err); }
});

// GET /api/students/:id/finance
// Returns charges, payments, transactions, totals
router.get('/:id/finance', async (req, res, next) => {
  try {
    const [student, settings] = await Promise.all([
      studentsRepo.findByIdEnriched(req.params.id),
      settingsRepo.get()
    ]);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const charges = student.charges || [];
    const payments = student.payments || [];
    const transactions = student.transactions || [];
    const totalOwed = charges.reduce((sum, c) => sum + c.amount, 0);
    const totalPaid = payments.reduce((sum, p) =>
      (p.status === 'paid' || p.status === 'partial') ? sum + (p.amount || 0) : sum, 0);
    const balance = totalPaid - totalOwed;

    res.json({
      currency: settings.currency || 'USD',
      balance,
      totalPaid,
      totalOwed,
      charges,
      payments,
      transactions
    });
  } catch (err) { next(err); }
});

// GET /api/students/:id/attendance
// Returns a summary: per-group lesson count, present count, absent count
router.get('/:id/attendance', async (req, res, next) => {
  try {
    const student = await studentsRepo.findByIdEnriched(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const groupIds = student.groupIds || [];
    if (groupIds.length === 0) return res.json({ groups: [] });

    const [groups, courses, allAttendance] = await Promise.all([
      groupsRepo.findAll(),
      coursesRepo.findAll(),
      Promise.all(groupIds.map(gid => groupsRepo.getAttendance(gid).then(rows => ({ gid, rows }))))
    ]);

    const result = allAttendance.map(({ gid, rows }) => {
      const group = groups.find(g => g.id === gid);
      if (!group) return null;
      const course = group.courseId ? courses.find(c => c.id === group.courseId) : null;
      const lessonsPerModule = course ? (course.lessonsPerMonth || 12) : 12;
      const durationMonths = course ? (course.durationMonths || 1) : 1;
      const totalLessons = lessonsPerModule * durationMonths;

      let present = 0, absent = 0;
      rows.forEach(row => {
        const s = (row.statuses || {})[student.id];
        if (s === 'was') present++;
        else if (s === 'not') absent++;
      });

      return {
        groupId: gid,
        groupName: group.name,
        totalLessons,
        present,
        absent,
        unmarked: Math.max(0, rows.length - present - absent)
      };
    }).filter(Boolean);

    res.json({ groups: result });
  } catch (err) { next(err); }
});

module.exports = router;

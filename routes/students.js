const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const studentsRepo = require('../db/studentsRepo');
const groupsRepo = require('../db/groupsRepo');
const teachersRepo = require('../db/teachersRepo');
const coursesRepo = require('../db/coursesRepo');
const settingsRepo = require('../db/settingsRepo');
const { hasMinLength, parsePositiveNumber, ensureEnum, isIsoMonth, isIsoDate, isValidPhone } = require('../utils/validation');
const { STUDENT_STATUS_VALUES, STUDENT_STATUS } = require('../utils/domainConstants');
const { createStudentLifecycleService } = require('../services/studentLifecycleService');

const lifecycle = createStudentLifecycleService(studentsRepo, groupsRepo);

function calculateBalance(student) {
  const charges = student.charges || [];
  const payments = student.payments || [];
  const totalCharges = charges.reduce((sum, c) => sum + c.amount, 0);
  const totalPayments = payments.reduce((sum, p) => (p.status === 'paid' || p.status === 'partial') ? sum + p.amount : sum, 0);
  return totalPayments - totalCharges;
}

router.get('/', async (req, res, next) => {
  try {
    const showArchived = req.query.archived === '1';
    const [students, groups, teachers, courses] = await Promise.all([
      studentsRepo.findAllEnriched({ includeArchived: showArchived }),
      groupsRepo.findAll(),
      teachersRepo.findAll(),
      coursesRepo.findAll()
    ]);
    const search = (req.query.search || '').trim().toLowerCase();
    const filterGroup = req.query.group || '';
    const filterDebt = req.query.debt || '';

    let filtered = students;
    if (search) {
      filtered = filtered.filter(s =>
        s.firstName.toLowerCase().includes(search) ||
        s.lastName.toLowerCase().includes(search) ||
        (s.phone || '').toLowerCase().includes(search)
      );
    }
    if (filterGroup) {
      filtered = filtered.filter(s => s.groupIds && s.groupIds.includes(filterGroup));
    }
    if (filterDebt === 'unpaid') {
      filtered = filtered.filter(s => calculateBalance(s) < 0);
    } else if (filterDebt === 'paid') {
      filtered = filtered.filter(s => calculateBalance(s) >= 0);
    }

    const enriched = filtered.map(s => {
      const studentGroups = (s.groupIds || []).map(gid => groups.find(gr => gr.id === gid)).filter(Boolean);
      const firstGroup = studentGroups[0];
      const teacher = firstGroup ? teachers.find(t => t.id === firstGroup.teacherId) : null;
      const firstCourse = firstGroup && firstGroup.courseId ? courses.find(c => c.id === firstGroup.courseId) : null;

      let endDate = '';
      if (firstGroup && firstGroup.startDate && firstCourse && firstCourse.durationMonths) {
        const sd = new Date(firstGroup.startDate);
        sd.setMonth(sd.getMonth() + firstCourse.durationMonths);
        endDate = sd.toISOString().split('T')[0];
      }

      return {
        ...s,
        groupNames: studentGroups.map(g => g.name),
        groupInfo: studentGroups.map(g => {
          const c = g.courseId ? courses.find(cr => cr.id === g.courseId) : null;
          return { name: g.name, courseCode: c ? (c.code || '') : '', startTime: g.startTime || '' };
        }),
        teacherName: teacher ? (teacher.firstName + ' ' + teacher.lastName).toUpperCase() : '',
        trainingStart: firstGroup && firstGroup.startDate ? firstGroup.startDate : '',
        trainingEnd: endDate,
        balance: calculateBalance(s)
      };
    });

    res.render('students/index', { page: 'students', students: enriched, groups, courses, search, filterGroup, filterDebt, showArchived });
  } catch (err) { next(err); }
});

router.get('/add', async (req, res, next) => {
  try {
    const groups = await groupsRepo.findAll();
    res.render('students/add', { page: 'students', groups, error: null });
  } catch (err) { next(err); }
});

router.post('/add', async (req, res, next) => {
  try {
    const { firstName, lastName, phone, birthday, notes, status } = req.body;
    const groupId = req.body.groupId || req.body.groupIds || '';

    if (!hasMinLength(firstName, 2) || !hasMinLength(lastName, 2)) {
      const groups = await groupsRepo.findAll();
      return res.render('students/add', { page: 'students', groups, error: 'First name and last name are required (min 2 characters).' });
    }
    if (phone && !isValidPhone(phone)) {
      const groups = await groupsRepo.findAll();
      return res.render('students/add', { page: 'students', groups, error: 'Invalid phone number format.' });
    }
    if (birthday && !isIsoDate(birthday)) {
      const groups = await groupsRepo.findAll();
      return res.render('students/add', { page: 'students', groups, error: 'Invalid birthday format (YYYY-MM-DD).' });
    }

    const now = new Date().toISOString();
    const studentId = uuidv4();

    await studentsRepo.create({
      id: studentId, firstName: firstName.trim(), lastName: lastName.trim(),
      phone: phone.trim(), birthday: birthday || '', gender: '',
      groupId: groupId || null,
      notes: (notes || '').trim(),
      status: ensureEnum(status, STUDENT_STATUS_VALUES, STUDENT_STATUS.ACTIVE),
      createdAt: now
    });

    if (groupId) {
      await studentsRepo.addToGroup(studentId, groupId, now);
    }

    res.redirect('/students');
  } catch (err) { next(err); }
});

router.get('/view/:id', async (req, res, next) => {
  try {
    const student = await studentsRepo.findByIdEnriched(req.params.id);
    if (!student) return res.redirect('/students');

    const [groups, courses, teachers, settings] = await Promise.all([
      groupsRepo.findAll(),
      coursesRepo.findAll(),
      teachersRepo.findAll(),
      settingsRepo.get()
    ]);

    const currency = settings.currency || 'USD';
    const studentGroups = (student.groupIds || []).map(gid => groups.find(g => g.id === gid)).filter(Boolean);
    const balance = calculateBalance(student);

    const totalPaid = (student.payments || []).reduce((sum, p) =>
      (p.status === 'paid' || p.status === 'partial') ? sum + (p.amount || 0) : sum, 0);
    const totalOwed = (student.charges || []).reduce((sum, c) => sum + c.amount, 0);

    const enrichedGroups = studentGroups.map(g => {
      const course = g.courseId ? courses.find(c => c.id === g.courseId) : null;
      const teacher = g.teacherId ? teachers.find(t => t.id === g.teacherId) : null;
      let endDate = '';
      if (g.startDate && course && course.durationMonths) {
        const sd = new Date(g.startDate);
        sd.setMonth(sd.getMonth() + course.durationMonths);
        endDate = sd.toISOString().split('T')[0];
      }
      return {
        ...g,
        courseName: course ? course.name : '',
        courseCode: course ? (course.code || '') : '',
        coursePrice: course ? (course.price || 0) : 0,
        courseLessons: course ? (course.lessonsPerMonth || 0) : 0,
        teacherName: teacher ? (teacher.firstName + ' ' + teacher.lastName).toUpperCase() : '',
        endDate,
        schedule: (g.days || []).join(', '),
        scheduleTime: g.startTime || ''
      };
    });

    res.render('students/view', {
      page: 'students', student, studentGroups: enrichedGroups, allGroups: groups,
      balance, totalPaid, totalOwed, courses, teachers, currency,
      charges: student.charges || [],
      transactions: student.transactions || []
    });
  } catch (err) { next(err); }
});

router.get('/edit/:id', async (req, res, next) => {
  try {
    const student = await studentsRepo.findByIdEnriched(req.params.id);
    if (!student) return res.redirect('/students');
    const groups = await groupsRepo.findAll();
    res.render('students/edit', { page: 'students', student, groups, error: null });
  } catch (err) { next(err); }
});

router.post('/edit/:id', async (req, res, next) => {
  try {
    const { name, phone, birthday, gender, notes, status } = req.body;
    const groupId = req.body.groupId || '';

    const student = await studentsRepo.findById(req.params.id);
    if (!student) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.status(404).json({ error: 'Student not found' });
      }
      return res.redirect('/students');
    }

    const updateData = {};
    if (name) {
      const parts = name.trim().split(/\s+/);
      updateData.firstName = parts[0] || '';
      updateData.lastName = parts.slice(1).join(' ') || '';
    } else if (req.body.firstName && req.body.lastName) {
      updateData.firstName = req.body.firstName.trim();
      updateData.lastName = req.body.lastName.trim();
    }
    if (phone) updateData.phone = phone.trim();
    if (birthday !== undefined) updateData.birthday = birthday;
    if (gender !== undefined) updateData.gender = gender;
    if (notes !== undefined) updateData.notes = String(notes).trim();
    if (status !== undefined) updateData.status = ensureEnum(status, STUDENT_STATUS_VALUES, STUDENT_STATUS.ACTIVE);

    if (phone !== undefined && phone !== '' && !isValidPhone(phone)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }
    if (birthday !== undefined && birthday !== '' && !isIsoDate(birthday)) {
      return res.status(400).json({ error: 'Invalid birthday format (YYYY-MM-DD)' });
    }

    await studentsRepo.update(req.params.id, updateData);

    if (groupId !== '') {
      if (groupId) {
        await studentsRepo.setGroups(req.params.id, [groupId]);
      } else {
        await studentsRepo.setGroups(req.params.id, []);
      }
    }

    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
      return res.json({ success: true });
    }
    res.redirect('/students/view/' + req.params.id);
  } catch (err) { next(err); }
});

router.post('/add-to-group/:id', async (req, res, next) => {
  try {
    const { groupId, dateFrom } = req.body;
    const student = await studentsRepo.findById(req.params.id);
    if (!student) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.status(404).json({ error: 'Student not found' });
      }
      return res.redirect('/students');
    }

    if (!groupId) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.status(400).json({ error: 'Group is required' });
      }
      return res.redirect('/students/view/' + req.params.id);
    }

    const group = await groupsRepo.findById(groupId);
    if (!group) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.status(400).json({ error: 'Invalid group selected' });
      }
      return res.redirect('/students/view/' + req.params.id);
    }

    await studentsRepo.addToGroup(req.params.id, groupId, dateFrom || new Date().toISOString());

    res.redirect('/students/view/' + req.params.id);
  } catch (err) { next(err); }
});

router.post('/remove-from-group/:id', async (req, res, next) => {
  try {
    const { groupId } = req.body;
    const student = await studentsRepo.findById(req.params.id);
    if (!student) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') return res.status(404).json({ error: 'Student not found' });
      return res.redirect('/students');
    }

    if (groupId) {
      await lifecycle.removeFromGroupAndArchive(req.params.id, groupId);
    }

    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ success: true, archived: true });
    res.redirect('/students/view/' + req.params.id);
  } catch (err) { next(err); }
});

// Charge management
router.post('/charge/:id', async (req, res, next) => {
  try {
    const { month, amount, groupId, description } = req.body;
    const student = await studentsRepo.findById(req.params.id);
    if (!student) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') return res.status(404).json({ error: 'Student not found' });
      return res.redirect('/students');
    }

    const parsedAmount = parsePositiveNumber(amount);
    if (!isIsoMonth(month || '') || parsedAmount === null) {
      return res.status(400).json({ error: 'Invalid month or amount' });
    }

    await studentsRepo.addCharge({
      id: uuidv4(),
      studentId: req.params.id,
      groupId: groupId || null,
      month: month || new Date().toISOString().slice(0, 7),
      amount: parsedAmount,
      description: description || ''
    });

    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ success: true });
    res.redirect('/students/view/' + req.params.id);
  } catch (err) { next(err); }
});

router.post('/charge/:studentId/delete/:chargeId', async (req, res, next) => {
  try {
    const charges = await studentsRepo.getCharges(req.params.studentId);
    if (!charges.find(c => c.id === req.params.chargeId)) {
      return res.status(404).json({ error: 'Charge not found for this student' });
    }
    await studentsRepo.deleteCharge(req.params.chargeId);
    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ success: true });
    res.redirect('/students/view/' + req.params.studentId);
  } catch (err) { next(err); }
});

router.post('/skip-month/:id', async (req, res, next) => {
  try {
    const { month } = req.body;
    if (!isIsoMonth(month || '')) {
      return res.status(400).json({ error: 'Invalid month format' });
    }
    await studentsRepo.skipMonth(req.params.id, month);
    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ success: true });
    res.redirect('/students/view/' + req.params.id);
  } catch (err) { next(err); }
});

router.post('/payment/:id', async (req, res, next) => {
  try {
    const { amount, date, status, description } = req.body;
    const student = await studentsRepo.findById(req.params.id);
    if (!student) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') return res.status(404).json({ error: 'Student not found' });
      return res.redirect('/students');
    }

    const parsedAmount = parsePositiveNumber(amount);
    if (parsedAmount === null || (date && !isIsoDate(date))) {
      return res.status(400).json({ error: 'Invalid payment data' });
    }

    const paymentId = uuidv4();
    const savedDate = date || new Date().toISOString().split('T')[0];
    const savedStatus = status || 'paid';
    const savedDescription = (description || '').trim();

    await studentsRepo.addPayment({
      id: paymentId,
      studentId: req.params.id,
      amount: parsedAmount,
      date: savedDate,
      status: savedStatus,
      description: savedDescription
    });

    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
      return res.json({
        success: true,
        payment: {
          id: paymentId,
          amount: parsedAmount,
          date: savedDate,
          status: savedStatus,
          description: savedDescription
        },
        transaction: {
          id: paymentId,
          type: 'payment',
          amount: parsedAmount,
          date: savedDate,
          label: savedDescription || (savedStatus === 'partial' ? 'Partial payment' : 'Payment'),
          status: savedStatus
        }
      });
    }
    res.redirect('/students/view/' + req.params.id);
  } catch (err) { next(err); }
});

router.post('/payment/:studentId/delete/:paymentId', async (req, res, next) => {
  try {
    const payments = await studentsRepo.getPayments(req.params.studentId);
    if (!payments.find(p => p.id === req.params.paymentId)) {
      return res.status(404).json({ error: 'Payment not found for this student' });
    }
    await studentsRepo.deletePayment(req.params.paymentId);
    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ success: true });
    res.redirect('/students/view/' + req.params.studentId);
  } catch (err) { next(err); }
});

router.post('/delete/:id', async (req, res, next) => {
  try {
    // Soft delete: archive instead of hard delete
    await lifecycle.archiveStudent(req.params.id);
    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ success: true, redirect: '/students' });
    res.redirect('/students');
  } catch (err) { next(err); }
});

router.post('/hard-delete/:id', async (req, res, next) => {
  try {
    await studentsRepo.delete(req.params.id);
    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ success: true, redirect: '/students' });
    res.redirect('/students');
  } catch (err) { next(err); }
});

router.post('/restore/:id', async (req, res, next) => {
  try {
    await lifecycle.restoreStudent(req.params.id);
    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ success: true });
    res.redirect('/students?archived=1');
  } catch (err) { next(err); }
});

router.post('/freeze/:id', async (req, res, next) => {
  try {
    await lifecycle.freezeStudent(req.params.id);
    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ success: true });
    res.redirect('/students/view/' + req.params.id);
  } catch (err) { next(err); }
});

router.post('/unfreeze/:id', async (req, res, next) => {
  try {
    await lifecycle.unfreezeStudent(req.params.id);
    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ success: true });
    res.redirect('/students/view/' + req.params.id);
  } catch (err) { next(err); }
});

module.exports = router;

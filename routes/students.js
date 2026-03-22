const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const studentsRepo = require('../db/studentsRepo');
const groupsRepo = require('../db/groupsRepo');
const teachersRepo = require('../db/teachersRepo');
const coursesRepo = require('../db/coursesRepo');

function calculateBalance(student, groups, courses) {
  const payments = student.payments || [];
  let totalPaid = 0;
  payments.forEach(p => {
    if (p.status === 'paid') totalPaid += p.amount || 0;
    else if (p.status === 'partial') totalPaid += p.amount || 0;
  });

  let totalOwed = 0;
  (student.groupIds || []).forEach(gid => {
    const g = groups.find(gr => gr.id === gid);
    if (g && g.courseId) {
      const c = courses.find(cr => cr.id === g.courseId);
      if (c && c.price) totalOwed += c.price;
    }
  });

  return totalPaid - totalOwed;
}

router.get('/', async (req, res, next) => {
  try {
    const [students, groups, teachers, courses] = await Promise.all([
      studentsRepo.findAllEnriched(),
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
        s.phone.includes(search)
      );
    }
    if (filterGroup) {
      filtered = filtered.filter(s => s.groupIds && s.groupIds.includes(filterGroup));
    }
    if (filterDebt === 'unpaid') {
      filtered = filtered.filter(s => calculateBalance(s, groups, courses) < 0);
    } else if (filterDebt === 'paid') {
      filtered = filtered.filter(s => calculateBalance(s, groups, courses) >= 0);
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
        balance: calculateBalance(s, groups, courses)
      };
    });

    res.render('students/index', { page: 'students', students: enriched, groups, search, filterGroup, filterDebt });
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
    const { firstName, lastName, phone } = req.body;
    let { groupIds } = req.body;

    if (!firstName || !lastName || !phone) {
      const groups = await groupsRepo.findAll();
      return res.render('students/add', { page: 'students', groups, error: 'First name, last name, and phone are required.' });
    }

    if (!groupIds) groupIds = [];
    else if (!Array.isArray(groupIds)) groupIds = [groupIds];

    const now = new Date().toISOString();
    const studentId = uuidv4();

    await studentsRepo.create({
      id: studentId, firstName: firstName.trim(), lastName: lastName.trim(),
      phone: phone.trim(), birthday: '', gender: '', createdAt: now
    });

    for (const gid of groupIds) {
      await studentsRepo.addToGroup(studentId, gid, now);
    }

    res.redirect('/students');
  } catch (err) { next(err); }
});

router.get('/view/:id', async (req, res, next) => {
  try {
    const student = await studentsRepo.findByIdEnriched(req.params.id);
    if (!student) return res.redirect('/students');

    const [groups, courses, teachers] = await Promise.all([
      groupsRepo.findAll(),
      coursesRepo.findAll(),
      teachersRepo.findAll()
    ]);

    const studentGroups = (student.groupIds || []).map(gid => groups.find(g => g.id === gid)).filter(Boolean);
    const balance = calculateBalance(student, groups, courses);

    let totalPaid = 0;
    (student.payments || []).forEach(p => {
      if (p.status === 'paid' || p.status === 'partial') totalPaid += p.amount || 0;
    });
    let totalOwed = 0;
    (student.groupIds || []).forEach(gid => {
      const g = groups.find(gr => gr.id === gid);
      if (g && g.courseId) {
        const c = courses.find(cr => cr.id === g.courseId);
        if (c && c.price) totalOwed += c.price;
      }
    });

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
      balance, totalPaid, totalOwed, courses, teachers
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
    const { name, phone, birthday, gender } = req.body;
    let { groupIds } = req.body;

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

    await studentsRepo.update(req.params.id, updateData);

    if (groupIds) {
      if (!Array.isArray(groupIds)) groupIds = [groupIds];
      await studentsRepo.setGroups(req.params.id, groupIds);
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
    if (!student) return res.redirect('/students');

    if (groupId) {
      await studentsRepo.addToGroup(req.params.id, groupId, dateFrom || new Date().toISOString());
    }

    res.redirect('/students/view/' + req.params.id);
  } catch (err) { next(err); }
});

router.post('/payment/:id', async (req, res, next) => {
  try {
    const { amount, date, status } = req.body;
    const student = await studentsRepo.findById(req.params.id);
    if (!student) return res.redirect('/students');

    await studentsRepo.addPayment({
      id: uuidv4(),
      studentId: req.params.id,
      amount: parseFloat(amount) || 0,
      date: date || new Date().toISOString().split('T')[0],
      status: status || 'paid'
    });

    res.redirect('/students/view/' + req.params.id);
  } catch (err) { next(err); }
});

router.post('/payment/:studentId/delete/:paymentId', async (req, res, next) => {
  try {
    await studentsRepo.deletePayment(req.params.paymentId);
    res.redirect('/students/view/' + req.params.studentId);
  } catch (err) { next(err); }
});

router.post('/delete/:id', async (req, res, next) => {
  try {
    await studentsRepo.delete(req.params.id);
    res.redirect('/students');
  } catch (err) { next(err); }
});

module.exports = router;

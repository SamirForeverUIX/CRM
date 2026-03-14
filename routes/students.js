const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const dataDir = path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDir, 'students.json');

function readJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
}

function readStudents() {
  return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

function writeStudents(students) {
  fs.writeFileSync(dataFile, JSON.stringify(students, null, 2), 'utf8');
}

// Calculate student balance: total paid - total course fees owed
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

// List all students
router.get('/', (req, res) => {
  const students = readStudents();
  const groups = readJSON('groups.json');
  const teachers = readJSON('teachers.json');
  const courses = readJSON('courses.json');
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
    filtered = filtered.filter(s => {
      const balance = calculateBalance(s, groups, courses);
      return balance < 0;
    });
  } else if (filterDebt === 'paid') {
    filtered = filtered.filter(s => {
      const balance = calculateBalance(s, groups, courses);
      return balance >= 0;
    });
  }

  const enriched = filtered.map(s => {
    const studentGroups = (s.groupIds || []).map(gid => groups.find(gr => gr.id === gid)).filter(Boolean);
    const firstGroup = studentGroups[0];
    const teacher = firstGroup ? teachers.find(t => t.id === firstGroup.teacherId) : null;
    const firstCourse = firstGroup && firstGroup.courseId ? courses.find(c => c.id === firstGroup.courseId) : null;

    // Calculate end date from start + durationMonths
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
        return {
          name: g.name,
          courseCode: c ? (c.code || '') : '',
          startTime: g.startTime || ''
        };
      }),
      teacherName: teacher ? (teacher.firstName + ' ' + teacher.lastName).toUpperCase() : '',
      trainingStart: firstGroup && firstGroup.startDate ? firstGroup.startDate : '',
      trainingEnd: endDate,
      balance: calculateBalance(s, groups, courses)
    };
  });

  res.render('students/index', {
    page: 'students', students: enriched, groups, search, filterGroup, filterDebt
  });
});

// Add student form
router.get('/add', (req, res) => {
  const groups = readJSON('groups.json');
  res.render('students/add', { page: 'students', groups, error: null });
});

// Create student
router.post('/add', (req, res) => {
  const { firstName, lastName, phone } = req.body;
  let { groupIds } = req.body;

  if (!firstName || !lastName || !phone) {
    const groups = readJSON('groups.json');
    return res.render('students/add', {
      page: 'students', groups,
      error: 'First name, last name, and phone are required.'
    });
  }

  if (!groupIds) groupIds = [];
  else if (!Array.isArray(groupIds)) groupIds = [groupIds];

  const students = readStudents();
  students.push({
    id: uuidv4(),
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    phone: phone.trim(),
    birthday: '',
    gender: '',
    groupIds,
    payments: [],
    createdAt: new Date().toISOString()
  });
  writeStudents(students);

  res.redirect('/students');
});

// View student details (with payments)
router.get('/view/:id', (req, res) => {
  const students = readStudents();
  const student = students.find(s => s.id === req.params.id);
  if (!student) return res.redirect('/students');

  const groups = readJSON('groups.json');
  const courses = readJSON('courses.json');
  const teachers = readJSON('teachers.json');
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

  // Enrich student groups with course and teacher info
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
});

// Edit student form
router.get('/edit/:id', (req, res) => {
  const students = readStudents();
  const student = students.find(s => s.id === req.params.id);
  if (!student) return res.redirect('/students');

  const groups = readJSON('groups.json');
  res.render('students/edit', { page: 'students', student, groups, error: null });
});

// Update student (AJAX from modal)
router.post('/edit/:id', (req, res) => {
  const { name, phone, birthday, gender } = req.body;
  let { groupIds } = req.body;
  const students = readStudents();
  const index = students.findIndex(s => s.id === req.params.id);

  if (index === -1) {
    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
      return res.status(404).json({ error: 'Student not found' });
    }
    return res.redirect('/students');
  }

  // Support both old (firstName/lastName) and new (name) format
  if (name) {
    const parts = name.trim().split(/\s+/);
    students[index].firstName = parts[0] || '';
    students[index].lastName = parts.slice(1).join(' ') || '';
  } else if (req.body.firstName && req.body.lastName) {
    students[index].firstName = req.body.firstName.trim();
    students[index].lastName = req.body.lastName.trim();
  }

  if (phone) students[index].phone = phone.trim();
  if (birthday !== undefined) students[index].birthday = birthday;
  if (gender !== undefined) students[index].gender = gender;

  if (groupIds) {
    if (!Array.isArray(groupIds)) groupIds = [groupIds];
    students[index].groupIds = groupIds;
  }

  writeStudents(students);

  if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
    return res.json({ success: true });
  }
  res.redirect('/students/view/' + req.params.id);
});

// Add student to group (from modal)
router.post('/add-to-group/:id', (req, res) => {
  const { groupId, dateFrom } = req.body;
  const students = readStudents();
  const index = students.findIndex(s => s.id === req.params.id);

  if (index === -1) return res.redirect('/students');

  if (!students[index].groupIds) students[index].groupIds = [];
  if (groupId && !students[index].groupIds.includes(groupId)) {
    students[index].groupIds.push(groupId);
  }
  writeStudents(students);

  res.redirect('/students/view/' + req.params.id);
});

// Add payment
router.post('/payment/:id', (req, res) => {
  const { amount, date, status } = req.body;
  const students = readStudents();
  const index = students.findIndex(s => s.id === req.params.id);

  if (index === -1) return res.redirect('/students');

  if (!students[index].payments) students[index].payments = [];
  students[index].payments.push({
    id: uuidv4(),
    amount: parseFloat(amount) || 0,
    date: date || new Date().toISOString().split('T')[0],
    status: status || 'paid'
  });
  writeStudents(students);

  res.redirect('/students/view/' + req.params.id);
});

// Delete payment
router.post('/payment/:studentId/delete/:paymentId', (req, res) => {
  const students = readStudents();
  const index = students.findIndex(s => s.id === req.params.studentId);

  if (index === -1) return res.redirect('/students');

  students[index].payments = (students[index].payments || []).filter(p => p.id !== req.params.paymentId);
  writeStudents(students);

  res.redirect('/students/view/' + req.params.studentId);
});

// Delete student
router.post('/delete/:id', (req, res) => {
  let students = readStudents();
  students = students.filter(s => s.id !== req.params.id);
  writeStudents(students);

  res.redirect('/students');
});

module.exports = router;

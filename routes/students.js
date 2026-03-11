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

    return {
      ...s,
      groupNames: studentGroups.map(g => g.name),
      teacherName: teacher ? teacher.firstName + ' ' + teacher.lastName : '',
      trainingDates: firstGroup && firstGroup.startDate ? firstGroup.startDate : '',
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
  const studentGroups = (student.groupIds || []).map(gid => groups.find(g => g.id === gid)).filter(Boolean);

  res.render('students/view', {
    page: 'students', student, studentGroups, allGroups: groups
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

// Update student
router.post('/edit/:id', (req, res) => {
  const { firstName, lastName, phone } = req.body;
  let { groupIds } = req.body;
  const students = readStudents();
  const index = students.findIndex(s => s.id === req.params.id);

  if (index === -1) return res.redirect('/students');

  if (!firstName || !lastName || !phone) {
    const groups = readJSON('groups.json');
    return res.render('students/edit', {
      page: 'students', student: students[index], groups,
      error: 'First name, last name, and phone are required.'
    });
  }

  if (!groupIds) groupIds = [];
  else if (!Array.isArray(groupIds)) groupIds = [groupIds];

  students[index].firstName = firstName.trim();
  students[index].lastName = lastName.trim();
  students[index].phone = phone.trim();
  students[index].groupIds = groupIds;
  writeStudents(students);

  res.redirect('/students');
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

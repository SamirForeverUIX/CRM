const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Compute sidebar badge data for all routes
const fs = require('fs');
app.use((req, res, next) => {
  try {
    const students = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'students.json'), 'utf8'));
    let debtorCount = 0;
    students.forEach(s => {
      const payments = s.payments || [];
      let hasDebt = false;
      payments.forEach(p => { if (p.status === 'unpaid' || p.status === 'partial') hasDebt = true; });
      if (payments.length === 0) hasDebt = true;
      if (hasDebt) debtorCount++;
    });
    res.locals.debtorCount = debtorCount;
  } catch (e) {
    res.locals.debtorCount = 0;
  }
  next();
});

// Routes
app.use('/', require('./routes/dashboard'));
app.use('/teachers', require('./routes/teachers'));
app.use('/groups', require('./routes/groups'));
app.use('/students', require('./routes/students'));
app.use('/courses', require('./routes/courses'));
app.use('/settings', require('./routes/settings'));
app.use('/schedule', require('./routes/schedule'));
app.use('/search', require('./routes/search'));

app.listen(PORT, () => {
  console.log(`CRM running on http://localhost:${PORT}`);
});

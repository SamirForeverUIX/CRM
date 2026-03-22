require('dotenv').config();
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

// Compute sidebar badge data for all routes (async, no file I/O)
const studentsRepo = require('./db/studentsRepo');
app.use(async (req, res, next) => {
  try {
    res.locals.debtorCount = await studentsRepo.getDebtorCount();
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

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).send('Internal Server Error');
});

app.listen(PORT, () => {
  console.log(`CRM running on http://localhost:${PORT}`);
});

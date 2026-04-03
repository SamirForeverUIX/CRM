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

// Compute sidebar badge data — skip for static assets
const studentsRepo = require('./db/studentsRepo');
const settingsRepo = require('./db/settingsRepo');
app.use(async (req, res, next) => {
  // Skip DB calls for static asset requests
  if (req.path.startsWith('/css/') || req.path.startsWith('/js/') || req.path.startsWith('/images/') || req.path.startsWith('/fonts/')) {
    res.locals.debtorCount = 0;
    res.locals.settings = { centreName: '', currency: 'USD' };
    return next();
  }
  try {
    const [debtorCount, settings] = await Promise.all([
      studentsRepo.getDebtorCount(),
      settingsRepo.get()
    ]);
    res.locals.debtorCount = debtorCount;
    res.locals.settings = settings;
  } catch (e) {
    res.locals.debtorCount = 0;
    res.locals.settings = { centreName: '', currency: 'USD' };
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
app.use('/leads', require('./routes/leads'));
app.use('/reminders', require('./routes/reminders'));
app.use('/rating', require('./routes/rating'));
app.use('/api', require('./routes/api.groups'));
app.use('/api/students', require('./routes/api.students'));

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).send('Internal Server Error');
});

app.listen(PORT, () => {
  console.log(`CRM running on http://localhost:${PORT}`);
});

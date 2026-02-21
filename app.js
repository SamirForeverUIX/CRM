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

// Routes
app.use('/', require('./routes/dashboard'));
app.use('/teachers', require('./routes/teachers'));
app.use('/groups', require('./routes/groups'));
app.use('/students', require('./routes/students'));
app.use('/courses', require('./routes/courses'));
app.use('/settings', require('./routes/settings'));
app.use('/search', require('./routes/search'));

app.listen(PORT, () => {
  console.log(`CRM running on http://localhost:${PORT}`);
});

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');

function readJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

router.get('/', (req, res) => {
  const groups = readJSON('groups.json');
  const teachers = readJSON('teachers.json');
  const courses = readJSON('courses.json');

  // Build timetable: { timeSlot: { day: [group, ...] } }
  const timeSlots = new Set();
  const timetable = {};

  groups.forEach(g => {
    if (!g.startTime || !g.days || g.days.length === 0) return;
    const time = g.startTime;
    timeSlots.add(time);

    if (!timetable[time]) timetable[time] = {};
    g.days.forEach(day => {
      if (!timetable[time][day]) timetable[time][day] = [];
      timetable[time][day].push({
        ...g,
        teacher: teachers.find(t => t.id === g.teacherId),
        course: courses.find(c => c.id === g.courseId)
      });
    });
  });

  const sortedTimes = Array.from(timeSlots).sort();

  res.render('schedule/index', {
    page: 'schedule', days: DAYS, timeSlots: sortedTimes, timetable
  });
});

module.exports = router;

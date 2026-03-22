const express = require('express');
const router = express.Router();
const groupsRepo = require('../db/groupsRepo');
const teachersRepo = require('../db/teachersRepo');
const coursesRepo = require('../db/coursesRepo');

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

router.get('/', async (req, res, next) => {
  try {
    const [groups, teachers, courses] = await Promise.all([
      groupsRepo.findAll(),
      teachersRepo.findAll(),
      coursesRepo.findAll()
    ]);

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
  } catch (err) { next(err); }
});

module.exports = router;

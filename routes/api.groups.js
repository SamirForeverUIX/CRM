const express = require('express');
const router = express.Router();
const groupsRepo = require('../db/groupsRepo');
const coursesRepo = require('../db/coursesRepo');

const DAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function calculateLessonDates(startDate, days, totalLessons) {
  if (!startDate || !Array.isArray(days) || days.length === 0 || !totalLessons || totalLessons <= 0) {
    return [];
  }

  const dayNumbers = days.map(d => DAY_MAP[d]).filter(n => n !== undefined);
  if (dayNumbers.length === 0) return [];

  const dates = [];
  const current = new Date(startDate + 'T00:00:00');
  const maxDate = new Date(current);
  maxDate.setFullYear(maxDate.getFullYear() + 2);

  while (dates.length < totalLessons && current <= maxDate) {
    if (dayNumbers.includes(current.getDay())) {
      dates.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

router.get('/groups/:id/lessons', async (req, res, next) => {
  try {
    const group = await groupsRepo.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const course = group.courseId ? await coursesRepo.findById(group.courseId) : null;
    const lessonsPerMonth = course ? (course.lessonsPerMonth || 0) : 0;
    const durationMonths = course ? (course.durationMonths || 0) : 0;
    const totalLessons = lessonsPerMonth * durationMonths;

    const lessonDates = calculateLessonDates(group.startDate, group.daysOfWeek || group.days || [], totalLessons)
      .map(d => d.toISOString().split('T')[0]);

    res.json({
      groupId: group.id,
      lessons: lessonDates
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');

function readJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
}

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return diffMins + 'm ago';
  if (diffHours < 24) return diffHours + 'h ago';
  if (diffDays < 7) return diffDays + 'd ago';
  return date.toLocaleDateString();
}

router.get('/', (req, res) => {
  const teachers = readJSON('teachers.json');
  const groups = readJSON('groups.json');
  const students = readJSON('students.json');
  const courses = readJSON('courses.json');

  // Calculate total income from payments
  let totalIncome = 0;
  students.forEach(s => {
    (s.payments || []).forEach(p => {
      if (p.status === 'paid' || p.status === 'partial') {
        totalIncome += p.amount || 0;
      }
    });
  });

  // Build recent activity feed
  const activities = [];

  students.forEach(s => {
    activities.push({
      type: 'student',
      text: s.firstName + ' ' + s.lastName + ' was added',
      time: s.createdAt,
      timeAgo: timeAgo(s.createdAt)
    });
    (s.payments || []).forEach(p => {
      activities.push({
        type: 'payment',
        text: '$' + (p.amount || 0).toFixed(2) + ' payment from ' + s.firstName + ' ' + s.lastName,
        time: p.date || s.createdAt,
        timeAgo: timeAgo(p.date || s.createdAt)
      });
    });
  });

  teachers.forEach(t => {
    activities.push({
      type: 'teacher',
      text: t.firstName + ' ' + t.lastName + ' joined as teacher',
      time: t.createdAt,
      timeAgo: timeAgo(t.createdAt)
    });
  });

  groups.forEach(g => {
    activities.push({
      type: 'group',
      text: 'Group "' + g.name + '" was created',
      time: g.createdAt,
      timeAgo: timeAgo(g.createdAt)
    });
  });

  // Sort by time descending, take top 8
  activities.sort((a, b) => new Date(b.time) - new Date(a.time));
  const recentActivities = activities.slice(0, 8);

  // Recent students (last 5)
  const recentStudents = [...students]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5)
    .map(s => ({
      ...s,
      groupNames: (s.groupIds || []).map(gid => {
        const g = groups.find(gr => gr.id === gid);
        return g ? g.name : 'Unknown';
      })
    }));

  res.render('dashboard', {
    page: 'dashboard',
    teacherCount: teachers.length,
    groupCount: groups.length,
    studentCount: students.length,
    courseCount: courses.length,
    totalIncome,
    recentActivities,
    recentStudents
  });
});

module.exports = router;

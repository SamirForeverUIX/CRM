const test = require('node:test');
const assert = require('node:assert/strict');

const { buildModuleAttendanceView } = require('../utils/attendanceModules');

test('buildModuleAttendanceView returns 12 lessons for first module with 3-day schedule', () => {
  const view = buildModuleAttendanceView({
    startDate: '2026-05-15',
    days: ['Mon', 'Wed', 'Fri'],
    lessonsPerModule: 12,
    moduleCount: 3,
    requestedModule: 1
  });

  assert.equal(view.totalModules, 3);
  assert.equal(view.lessonDates.length, 12);
  assert.equal(view.currentModule, 1);
  assert.equal(view.prevModule, null);
  assert.equal(view.nextModule, 2);
  assert.match(view.moduleLabel, /Module 1/);
});

test('buildModuleAttendanceView clamps module bounds', () => {
  const low = buildModuleAttendanceView({
    startDate: '2026-05-15',
    days: ['Tue', 'Thu', 'Sat'],
    lessonsPerModule: 12,
    moduleCount: 2,
    requestedModule: -5
  });
  assert.equal(low.currentModule, 1);

  const high = buildModuleAttendanceView({
    startDate: '2026-05-15',
    days: ['Tue', 'Thu', 'Sat'],
    lessonsPerModule: 12,
    moduleCount: 2,
    requestedModule: 99
  });
  assert.equal(high.currentModule, 2);
});

const DAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function calculateLessonDates(startDate, days, totalLessons) {
  if (!startDate || !days || days.length === 0 || !totalLessons || totalLessons <= 0) return [];

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

function dateToStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function clampInt(value, min, max) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function buildModuleAttendanceView({ startDate, days, lessonsPerModule, moduleCount, requestedModule }) {
  const safeLessonsPerModule = lessonsPerModule > 0 ? lessonsPerModule : 12;
  const safeModuleCount = moduleCount > 0 ? moduleCount : 1;
  const totalLessons = safeLessonsPerModule * safeModuleCount;
  const allLessonDates = calculateLessonDates(startDate, days, totalLessons);

  const totalModules = Math.ceil(totalLessons / safeLessonsPerModule) || 1;
  const currentModule = clampInt(requestedModule || 1, 1, totalModules);
  const sliceStart = (currentModule - 1) * safeLessonsPerModule;
  const lessonDates = allLessonDates.slice(sliceStart, sliceStart + safeLessonsPerModule);

  const moduleStartDate = lessonDates.length > 0 ? dateToStr(lessonDates[0]) : '';
  const moduleEndDate = lessonDates.length > 0 ? dateToStr(lessonDates[lessonDates.length - 1]) : '';

  return {
    totalLessons,
    allLessonDates,
    totalModules,
    currentModule,
    lessonDates,
    prevModule: currentModule > 1 ? currentModule - 1 : null,
    nextModule: currentModule < totalModules ? currentModule + 1 : null,
    moduleLabel: 'Module ' + currentModule + ' · Lessons ' + (sliceStart + 1) + '–' + (sliceStart + lessonDates.length)
      + (moduleStartDate ? ' · ' + moduleStartDate + ' — ' + moduleEndDate : '')
  };
}

module.exports = {
  calculateLessonDates,
  buildModuleAttendanceView,
  dateToStr
};

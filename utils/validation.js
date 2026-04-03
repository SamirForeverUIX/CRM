function hasMinLength(value, min) {
  return typeof value === 'string' && value.trim().length >= min;
}

function parsePositiveNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parsePositiveInt(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function ensureEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function isIsoMonth(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value);
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidPhone(value) {
  if (typeof value !== 'string') return false;
  const cleaned = value.replace(/[\s\-().]/g, '');
  return /^\+?\d{5,15}$/.test(cleaned);
}

function isValidEmail(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

const VALID_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function isValidDayOfWeek(value) {
  return VALID_DAYS.includes(value);
}

function isValidTimeSlot(value) {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
}

function safeJsonParse(value) {
  try {
    return { data: JSON.parse(value), error: null };
  } catch (e) {
    return { data: null, error: 'Invalid JSON format' };
  }
}

module.exports = {
  hasMinLength,
  parsePositiveNumber,
  parsePositiveInt,
  ensureEnum,
  isIsoMonth,
  isIsoDate,
  isValidPhone,
  isValidEmail,
  isValidDayOfWeek,
  isValidTimeSlot,
  safeJsonParse,
  VALID_DAYS
};
function hasMinLength(value, min) {
  return typeof value === 'string' && value.trim().length >= min;
}

function parsePositiveNumber(value) {
  const n = Number(value);
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

module.exports = {
  hasMinLength,
  parsePositiveNumber,
  ensureEnum,
  isIsoMonth,
  isIsoDate
};
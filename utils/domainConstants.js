const STUDENT_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ARCHIVED: 'archived'
});

const GROUP_STATUS = Object.freeze({
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ARCHIVED: 'archived'
});

const STUDENT_STATUS_VALUES = Object.freeze(Object.values(STUDENT_STATUS));
const GROUP_STATUS_VALUES = Object.freeze(Object.values(GROUP_STATUS));

module.exports = {
  STUDENT_STATUS,
  GROUP_STATUS,
  STUDENT_STATUS_VALUES,
  GROUP_STATUS_VALUES
};

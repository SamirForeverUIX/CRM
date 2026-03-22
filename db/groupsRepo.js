const db = require('./index');

function toObj(row) {
  return {
    id: row.id,
    name: row.name,
    courseId: row.course_id,
    teacherId: row.teacher_id,
    days: row.days || [],
    room: row.room,
    startTime: row.start_time,
    startDate: row.start_date,
    endDate: row.end_date || '',
    createdAt: row.created_at
  };
}

module.exports = {
  async findAll() {
    const { rows } = await db.query('SELECT * FROM groups ORDER BY created_at');
    return rows.map(toObj);
  },

  async findById(id) {
    const { rows } = await db.query('SELECT * FROM groups WHERE id = $1', [id]);
    return rows.length ? toObj(rows[0]) : null;
  },

  async create(group) {
    await db.query(
      `INSERT INTO groups (id, name, course_id, teacher_id, days, room, start_time, start_date, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [group.id, group.name, group.courseId, group.teacherId, group.days, group.room, group.startTime, group.startDate, group.createdAt]
    );
  },

  async update(id, data) {
    await db.query(
      `UPDATE groups SET name=$1, course_id=$2, teacher_id=$3, days=$4, room=$5, start_time=$6, start_date=$7, end_date=$8 WHERE id=$9`,
      [data.name, data.courseId, data.teacherId, data.days, data.room, data.startTime, data.startDate, data.endDate || '', id]
    );
  },

  async delete(id) {
    await db.query('DELETE FROM groups WHERE id = $1', [id]);
  },

  // Attendance
  async getAttendance(groupId) {
    const { rows } = await db.query(
      'SELECT date, statuses FROM attendance WHERE group_id = $1 ORDER BY date',
      [groupId]
    );
    return rows.map(r => ({ date: r.date, statuses: r.statuses || {} }));
  },

  async saveAttendance(groupId, date, statuses) {
    await db.query(
      `INSERT INTO attendance (group_id, date, statuses)
       VALUES ($1, $2, $3)
       ON CONFLICT (group_id, date) DO UPDATE SET statuses = EXCLUDED.statuses`,
      [groupId, date, JSON.stringify(statuses)]
    );
  },

  async getAttendanceForDate(groupId, date) {
    const { rows } = await db.query(
      'SELECT statuses FROM attendance WHERE group_id = $1 AND date = $2',
      [groupId, date]
    );
    return rows.length ? (rows[0].statuses || {}) : {};
  }
};

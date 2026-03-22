const db = require('./index');

function toObj(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    birthday: row.birthday || '',
    gender: row.gender || '',
    createdAt: row.created_at
  };
}

module.exports = {
  async findAll() {
    const { rows } = await db.query('SELECT * FROM students ORDER BY created_at');
    return rows.map(toObj);
  },

  async findById(id) {
    const { rows } = await db.query('SELECT * FROM students WHERE id = $1', [id]);
    return rows.length ? toObj(rows[0]) : null;
  },

  async create(student) {
    await db.query(
      'INSERT INTO students (id, first_name, last_name, phone, birthday, gender, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [student.id, student.firstName, student.lastName, student.phone, student.birthday || '', student.gender || '', student.createdAt]
    );
  },

  async update(id, data) {
    const sets = [];
    const vals = [];
    let n = 1;
    if (data.firstName !== undefined) { sets.push(`first_name = $${n++}`); vals.push(data.firstName); }
    if (data.lastName !== undefined) { sets.push(`last_name = $${n++}`); vals.push(data.lastName); }
    if (data.phone !== undefined) { sets.push(`phone = $${n++}`); vals.push(data.phone); }
    if (data.birthday !== undefined) { sets.push(`birthday = $${n++}`); vals.push(data.birthday); }
    if (data.gender !== undefined) { sets.push(`gender = $${n++}`); vals.push(data.gender); }
    if (sets.length === 0) return;
    vals.push(id);
    await db.query(`UPDATE students SET ${sets.join(', ')} WHERE id = $${n}`, vals);
  },

  async delete(id) {
    await db.query('DELETE FROM students WHERE id = $1', [id]);
  },

  // Group associations
  async getGroupIds(studentId) {
    const { rows } = await db.query(
      'SELECT group_id, joined_at FROM student_groups WHERE student_id = $1',
      [studentId]
    );
    return rows;
  },

  async addToGroup(studentId, groupId, joinedAt) {
    await db.query(
      'INSERT INTO student_groups (student_id, group_id, joined_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [studentId, groupId, joinedAt || new Date().toISOString()]
    );
  },

  async setGroups(studentId, groupIds) {
    await db.query('DELETE FROM student_groups WHERE student_id = $1', [studentId]);
    for (const gid of groupIds) {
      await db.query(
        'INSERT INTO student_groups (student_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [studentId, gid]
      );
    }
  },

  async removeFromGroup(studentId, groupId) {
    await db.query(
      'DELETE FROM student_groups WHERE student_id = $1 AND group_id = $2',
      [studentId, groupId]
    );
  },

  // Payments
  async getPayments(studentId) {
    const { rows } = await db.query(
      'SELECT * FROM payments WHERE student_id = $1 ORDER BY date',
      [studentId]
    );
    return rows.map(r => ({
      id: r.id,
      amount: parseFloat(r.amount) || 0,
      date: r.date,
      status: r.status
    }));
  },

  async addPayment(payment) {
    await db.query(
      'INSERT INTO payments (id, student_id, amount, date, status) VALUES ($1, $2, $3, $4, $5)',
      [payment.id, payment.studentId, payment.amount, payment.date, payment.status]
    );
  },

  async deletePayment(paymentId) {
    await db.query('DELETE FROM payments WHERE id = $1', [paymentId]);
  },

  // Get all students with their groups and payments (enriched)
  async findAllEnriched() {
    const students = await this.findAll();
    for (const s of students) {
      const groupRows = await this.getGroupIds(s.id);
      s.groupIds = groupRows.map(r => r.group_id);
      s.groupJoinDates = {};
      groupRows.forEach(r => { s.groupJoinDates[r.group_id] = r.joined_at; });
      s.payments = await this.getPayments(s.id);
    }
    return students;
  },

  // Get single student enriched
  async findByIdEnriched(id) {
    const s = await this.findById(id);
    if (!s) return null;
    const groupRows = await this.getGroupIds(s.id);
    s.groupIds = groupRows.map(r => r.group_id);
    s.groupJoinDates = {};
    groupRows.forEach(r => { s.groupJoinDates[r.group_id] = r.joined_at; });
    s.payments = await this.getPayments(s.id);
    return s;
  },

  // Get students by group
  async findByGroupId(groupId) {
    const { rows } = await db.query(
      `SELECT s.* FROM students s
       JOIN student_groups sg ON s.id = sg.student_id
       WHERE sg.group_id = $1
       ORDER BY s.created_at`,
      [groupId]
    );
    const students = rows.map(toObj);
    for (const s of students) {
      const groupRows = await this.getGroupIds(s.id);
      s.groupIds = groupRows.map(r => r.group_id);
      s.groupJoinDates = {};
      groupRows.forEach(r => { s.groupJoinDates[r.group_id] = r.joined_at; });
      s.payments = await this.getPayments(s.id);
    }
    return students;
  },

  // Get debtor count
  async getDebtorCount() {
    const students = await this.findAllEnriched();
    let count = 0;
    for (const s of students) {
      const payments = s.payments || [];
      let hasDebt = false;
      payments.forEach(p => { if (p.status === 'unpaid' || p.status === 'partial') hasDebt = true; });
      if (payments.length === 0) hasDebt = true;
      if (hasDebt) count++;
    }
    return count;
  }
};

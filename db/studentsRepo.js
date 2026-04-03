const db = require('./index');

function toObj(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    birthday: row.birthday || '',
    gender: row.gender || '',
    groupId: row.group_id || null,
    notes: row.notes || '',
    status: row.status || 'active',
    createdAt: row.created_at
  };
}

module.exports = {
  async findAll({ includeArchived = false } = {}) {
    const { rows } = includeArchived
      ? await db.query('SELECT * FROM students ORDER BY created_at')
      : await db.query("SELECT * FROM students WHERE status != 'archived' ORDER BY created_at");
    return rows.map(toObj);
  },

  async findById(id) {
    const { rows } = await db.query('SELECT * FROM students WHERE id = $1', [id]);
    return rows.length ? toObj(rows[0]) : null;
  },

  async create(student) {
    await db.query(
      'INSERT INTO students (id, first_name, last_name, phone, birthday, gender, group_id, notes, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [
        student.id,
        student.firstName,
        student.lastName,
        student.phone,
        student.birthday || '',
        student.gender || '',
        student.groupId || null,
        student.notes || '',
        student.status || 'active',
        student.createdAt
      ]
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
    if (data.groupId !== undefined) { sets.push(`group_id = $${n++}`); vals.push(data.groupId); }
    if (data.notes !== undefined) { sets.push(`notes = $${n++}`); vals.push(data.notes); }
    if (data.status !== undefined) { sets.push(`status = $${n++}`); vals.push(data.status); }
    if (sets.length === 0) return;
    vals.push(id);
    await db.query(`UPDATE students SET ${sets.join(', ')} WHERE id = $${n}`, vals);
  },

  async setPrimaryGroup(studentId, groupId) {
    try {
      await db.query('UPDATE students SET group_id = $1 WHERE id = $2', [groupId || null, studentId]);
    } catch (err) {
      // Backward compatibility: older databases may not have students.group_id yet.
      if (err && err.code === '42703') return;
      throw err;
    }
  },

  async delete(id) {
    await db.query('DELETE FROM students WHERE id = $1', [id]);
  },

  async archive(id) {
    await db.query("UPDATE students SET status = 'archived' WHERE id = $1", [id]);
  },

  async restore(id) {
    await db.query("UPDATE students SET status = 'active' WHERE id = $1", [id]);
  },

  async freeze(id) {
    await db.query("UPDATE students SET status = 'inactive' WHERE id = $1", [id]);
  },

  async unfreeze(id) {
    await db.query("UPDATE students SET status = 'active' WHERE id = $1", [id]);
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
      'INSERT INTO student_groups (student_id, group_id, joined_at) VALUES ($1, $2, $3) ON CONFLICT (student_id, group_id) DO NOTHING',
      [studentId, groupId, joinedAt || new Date().toISOString()]
    );
    await this.setPrimaryGroup(studentId, groupId);
  },

  async setGroups(studentId, groupIds) {
    await db.transaction(async (client) => {
      await client.query('DELETE FROM student_groups WHERE student_id = $1', [studentId]);
      for (const gid of groupIds) {
        await client.query(
          'INSERT INTO student_groups (student_id, group_id) VALUES ($1, $2) ON CONFLICT (student_id, group_id) DO NOTHING',
          [studentId, gid]
        );
      }
      const primaryGroupId = groupIds[0] || null;
      await client.query('UPDATE students SET group_id = $1 WHERE id = $2', [primaryGroupId, studentId]);
    });
  },

  async removeFromGroup(studentId, groupId) {
    await db.transaction(async (client) => {
      await client.query(
        'DELETE FROM student_groups WHERE student_id = $1 AND group_id = $2',
        [studentId, groupId]
      );
      const { rows } = await client.query(
        'SELECT group_id FROM student_groups WHERE student_id = $1 ORDER BY joined_at DESC LIMIT 1',
        [studentId]
      );
      await client.query('UPDATE students SET group_id = $1 WHERE id = $2', [rows.length ? rows[0].group_id : null, studentId]);
    });
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
      status: r.status,
      description: r.description || ''
    }));
  },

  async addPayment(payment) {
    await db.query(
      'INSERT INTO payments (id, student_id, amount, date, status, description) VALUES ($1, $2, $3, $4, $5, $6)',
      [payment.id, payment.studentId, payment.amount, payment.date, payment.status, payment.description || '']
    );
  },

  async deletePayment(paymentId) {
    await db.query('DELETE FROM payments WHERE id = $1', [paymentId]);
  },

  // Charges
  async getCharges(studentId) {
    const { rows } = await db.query(
      'SELECT * FROM charges WHERE student_id = $1 ORDER BY month',
      [studentId]
    );
    return rows.map(r => ({
      id: r.id,
      groupId: r.group_id,
      month: r.month,
      amount: parseFloat(r.amount) || 0,
      description: r.description || ''
    }));
  },

  async addCharge(charge) {
    await db.query(
      'INSERT INTO charges (id, student_id, group_id, month, amount, description) VALUES ($1, $2, $3, $4, $5, $6)',
      [charge.id, charge.studentId, charge.groupId || null, charge.month, charge.amount, charge.description || '']
    );
  },

  async deleteCharge(chargeId) {
    await db.query('DELETE FROM charges WHERE id = $1', [chargeId]);
  },

  async skipMonth(studentId, month) {
    await db.query('DELETE FROM charges WHERE student_id = $1 AND month = $2', [studentId, month]);
  },

  async getTransactions(studentId) {
    const [charges, payments] = await Promise.all([
      this.getCharges(studentId),
      this.getPayments(studentId)
    ]);

    const chargeTx = charges.map(c => ({
      id: c.id,
      type: 'charge',
      amount: c.amount,
      date: c.month ? `${c.month}-01` : '',
      label: c.description || 'Monthly charge',
      groupId: c.groupId || null
    }));

    const paymentTx = payments.map(p => ({
      id: p.id,
      type: 'payment',
      amount: p.amount,
      date: p.date || '',
      label: p.description || (p.status === 'partial' ? 'Partial payment' : 'Payment'),
      status: p.status
    }));

    return [...chargeTx, ...paymentTx].sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });
  },

  // Get all students with their groups and payments (enriched) - batch queries
  async findAllEnriched({ includeArchived = false } = {}) {
    const students = await this.findAll({ includeArchived });
    if (students.length === 0) return students;

    const studentIds = students.map(s => s.id);

    // Batch fetch all group associations
    const { rows: groupRows } = await db.query(
      'SELECT student_id, group_id, joined_at FROM student_groups WHERE student_id = ANY($1)',
      [studentIds]
    );

    // Batch fetch all payments
    const { rows: paymentRows } = await db.query(
      'SELECT * FROM payments WHERE student_id = ANY($1) ORDER BY date',
      [studentIds]
    );

    // Batch fetch all charges
    const { rows: chargeRows } = await db.query(
      'SELECT * FROM charges WHERE student_id = ANY($1) ORDER BY month',
      [studentIds]
    );

    // Index by student_id
    const groupsByStudent = {};
    const paymentsByStudent = {};
    const chargesByStudent = {};
    for (const r of groupRows) {
      if (!groupsByStudent[r.student_id]) groupsByStudent[r.student_id] = [];
      groupsByStudent[r.student_id].push(r);
    }
    for (const r of paymentRows) {
      if (!paymentsByStudent[r.student_id]) paymentsByStudent[r.student_id] = [];
      paymentsByStudent[r.student_id].push({
        id: r.id, amount: parseFloat(r.amount) || 0, date: r.date, status: r.status
      });
    }
    for (const r of chargeRows) {
      if (!chargesByStudent[r.student_id]) chargesByStudent[r.student_id] = [];
      chargesByStudent[r.student_id].push({
        id: r.id, groupId: r.group_id, month: r.month, amount: parseFloat(r.amount) || 0, description: r.description || ''
      });
    }

    for (const s of students) {
      const sGroups = groupsByStudent[s.id] || [];
      s.groupIds = sGroups.map(r => r.group_id);
      if (s.groupId && !s.groupIds.includes(s.groupId)) {
        s.groupIds.unshift(s.groupId);
      }
      s.groupJoinDates = {};
      sGroups.forEach(r => { s.groupJoinDates[r.group_id] = r.joined_at; });
      s.payments = paymentsByStudent[s.id] || [];
      s.charges = chargesByStudent[s.id] || [];
    }
    return students;
  },

  // Get single student enriched
  async findByIdEnriched(id) {
    const s = await this.findById(id);
    if (!s) return null;
    const groupRows = await this.getGroupIds(s.id);
    s.groupIds = groupRows.map(r => r.group_id);
    if (s.groupId && !s.groupIds.includes(s.groupId)) {
      s.groupIds.unshift(s.groupId);
    }
    s.groupJoinDates = {};
    groupRows.forEach(r => { s.groupJoinDates[r.group_id] = r.joined_at; });
    s.payments = await this.getPayments(s.id);
    s.charges = await this.getCharges(s.id);
    s.transactions = await this.getTransactions(s.id);
    return s;
  },

  // Get students by group - batch queries
  async findByGroupId(groupId) {
    const { rows } = await db.query(
      `SELECT s.* FROM students s
       JOIN student_groups sg ON s.id = sg.student_id
       WHERE sg.group_id = $1
       ORDER BY s.created_at`,
      [groupId]
    );
    const students = rows.map(toObj);
    if (students.length === 0) return students;

    const studentIds = students.map(s => s.id);

    const { rows: groupRows } = await db.query(
      'SELECT student_id, group_id, joined_at FROM student_groups WHERE student_id = ANY($1)',
      [studentIds]
    );
    const { rows: paymentRows } = await db.query(
      'SELECT * FROM payments WHERE student_id = ANY($1) ORDER BY date',
      [studentIds]
    );
    const { rows: chargeRows2 } = await db.query(
      'SELECT * FROM charges WHERE student_id = ANY($1) ORDER BY month',
      [studentIds]
    );

    const groupsByStudent = {};
    const paymentsByStudent = {};
    const chargesByStudent2 = {};
    for (const r of groupRows) {
      if (!groupsByStudent[r.student_id]) groupsByStudent[r.student_id] = [];
      groupsByStudent[r.student_id].push(r);
    }
    for (const r of paymentRows) {
      if (!paymentsByStudent[r.student_id]) paymentsByStudent[r.student_id] = [];
      paymentsByStudent[r.student_id].push({
        id: r.id, amount: parseFloat(r.amount) || 0, date: r.date, status: r.status
      });
    }
    for (const r of chargeRows2) {
      if (!chargesByStudent2[r.student_id]) chargesByStudent2[r.student_id] = [];
      chargesByStudent2[r.student_id].push({
        id: r.id, groupId: r.group_id, month: r.month, amount: parseFloat(r.amount) || 0, description: r.description || ''
      });
    }

    for (const s of students) {
      const sGroups = groupsByStudent[s.id] || [];
      s.groupIds = sGroups.map(r => r.group_id);
      if (s.groupId && !s.groupIds.includes(s.groupId)) {
        s.groupIds.unshift(s.groupId);
      }
      s.groupJoinDates = {};
      sGroups.forEach(r => { s.groupJoinDates[r.group_id] = r.joined_at; });
      s.payments = paymentsByStudent[s.id] || [];
      s.charges = chargesByStudent2[s.id] || [];
    }
    return students;
  },

  // Get debtor count - matches dashboard balance logic (payments - charges < 0)
  async getDebtorCount() {
    const { rows } = await db.query(
      `SELECT COUNT(*) as count FROM (
        SELECT s.id,
          COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.student_id = s.id AND p.status IN ('paid', 'partial')), 0)
          - COALESCE((SELECT SUM(c.amount) FROM charges c WHERE c.student_id = s.id), 0) AS balance
        FROM students s WHERE s.status != 'archived'
      ) sub WHERE sub.balance < 0`
    );
    return parseInt(rows[0].count) || 0;
  },

  async search(q) {
    const pattern = '%' + q + '%';
    const { rows } = await db.query(
      `SELECT * FROM students WHERE status != 'archived' AND (first_name ILIKE $1 OR last_name ILIKE $1 OR phone ILIKE $1) ORDER BY created_at`,
      [pattern]
    );
    return rows.map(toObj);
  }
};

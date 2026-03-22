const db = require('./index');

function toObj(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    createdAt: row.created_at
  };
}

module.exports = {
  async findAll() {
    const { rows } = await db.query('SELECT * FROM teachers ORDER BY created_at');
    return rows.map(toObj);
  },

  async findById(id) {
    const { rows } = await db.query('SELECT * FROM teachers WHERE id = $1', [id]);
    return rows.length ? toObj(rows[0]) : null;
  },

  async create(teacher) {
    await db.query(
      'INSERT INTO teachers (id, first_name, last_name, phone, created_at) VALUES ($1, $2, $3, $4, $5)',
      [teacher.id, teacher.firstName, teacher.lastName, teacher.phone, teacher.createdAt]
    );
  },

  async update(id, data) {
    await db.query(
      'UPDATE teachers SET first_name = $1, last_name = $2, phone = $3 WHERE id = $4',
      [data.firstName, data.lastName, data.phone, id]
    );
  },

  async delete(id) {
    await db.query('DELETE FROM teachers WHERE id = $1', [id]);
  }
};

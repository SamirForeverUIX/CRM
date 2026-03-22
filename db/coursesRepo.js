const db = require('./index');

function toObj(row) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    lessonsPerMonth: row.lessons_per_month,
    durationMinutes: row.duration_minutes,
    durationMonths: row.duration_months,
    price: parseFloat(row.price) || 0,
    description: row.description || '',
    createdAt: row.created_at
  };
}

module.exports = {
  async findAll() {
    const { rows } = await db.query('SELECT * FROM courses ORDER BY created_at');
    return rows.map(toObj);
  },

  async findById(id) {
    const { rows } = await db.query('SELECT * FROM courses WHERE id = $1', [id]);
    return rows.length ? toObj(rows[0]) : null;
  },

  async create(course) {
    await db.query(
      `INSERT INTO courses (id, name, code, lessons_per_month, duration_minutes, duration_months, price, description, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [course.id, course.name, course.code, course.lessonsPerMonth, course.durationMinutes, course.durationMonths, course.price, course.description || '', course.createdAt]
    );
  },

  async update(id, data) {
    await db.query(
      `UPDATE courses SET name=$1, code=$2, lessons_per_month=$3, duration_minutes=$4, duration_months=$5, price=$6, description=$7 WHERE id=$8`,
      [data.name, data.code, data.lessonsPerMonth, data.durationMinutes, data.durationMonths, data.price, data.description || '', id]
    );
  },

  async delete(id) {
    await db.query('DELETE FROM courses WHERE id = $1', [id]);
  }
};

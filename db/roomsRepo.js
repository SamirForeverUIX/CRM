const db = require('./index');

module.exports = {
  async findAll() {
    const { rows } = await db.query('SELECT * FROM rooms ORDER BY name ASC');
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      capacity: r.capacity || 0,
      createdAt: r.created_at
    }));
  },

  async findById(id) {
    const { rows } = await db.query('SELECT * FROM rooms WHERE id = $1', [id]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, name: r.name, capacity: r.capacity || 0, createdAt: r.created_at };
  },

  async create(room) {
    await db.query(
      'INSERT INTO rooms (id, name, capacity) VALUES ($1, $2, $3)',
      [room.id, room.name, room.capacity || 0]
    );
  },

  async update(id, data) {
    await db.query(
      'UPDATE rooms SET name = $1, capacity = $2 WHERE id = $3',
      [data.name, data.capacity || 0, id]
    );
  },

  async delete(id) {
    await db.query('DELETE FROM rooms WHERE id = $1', [id]);
  }
};

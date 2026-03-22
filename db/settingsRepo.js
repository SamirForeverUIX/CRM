const db = require('./index');

module.exports = {
  async get() {
    const { rows } = await db.query('SELECT * FROM settings WHERE id = 1');
    if (rows.length === 0) {
      return { centreName: '', phone: '', email: '', address: '', currency: 'USD', rooms: [] };
    }
    const r = rows[0];
    return {
      centreName: r.centre_name,
      phone: r.phone,
      email: r.email,
      address: r.address,
      currency: r.currency,
      rooms: r.rooms || []
    };
  },

  async save(settings) {
    await db.query(
      `INSERT INTO settings (id, centre_name, phone, email, address, currency, rooms)
       VALUES (1, $1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         centre_name = EXCLUDED.centre_name,
         phone = EXCLUDED.phone,
         email = EXCLUDED.email,
         address = EXCLUDED.address,
         currency = EXCLUDED.currency,
         rooms = EXCLUDED.rooms`,
      [settings.centreName, settings.phone, settings.email, settings.address, settings.currency, settings.rooms || []]
    );
  }
};

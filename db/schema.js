require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('./index');

async function migrate() {
  console.log('Running database migration...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS teachers (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT DEFAULT '',
      lessons_per_month INT DEFAULT 0,
      duration_minutes INT DEFAULT 0,
      duration_months INT DEFAULT 0,
      price NUMERIC(12,2) DEFAULT 0,
      description TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
      days TEXT[] DEFAULT '{}',
      room TEXT DEFAULT '',
      start_time TEXT DEFAULT '',
      start_date TEXT DEFAULT '',
      end_date TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      birthday TEXT DEFAULT '',
      gender TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS student_groups (
      student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
      group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (student_id, group_id)
    );

    CREATE TABLE IF NOT EXISTS charges (
      id TEXT PRIMARY KEY,
      student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
      group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
      month TEXT NOT NULL,
      amount NUMERIC(12,2) DEFAULT 0,
      description TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
      amount NUMERIC(12,2) DEFAULT 0,
      date TEXT DEFAULT '',
      status TEXT DEFAULT 'paid',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY,
      group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      statuses JSONB DEFAULT '{}',
      UNIQUE(group_id, date)
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INT PRIMARY KEY DEFAULT 1,
      centre_name TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      currency TEXT DEFAULT 'USD',
      rooms TEXT[] DEFAULT '{}'
    );
  `);

  console.log('Migration complete.');
  await db.pool.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('./index');

async function migrate() {
  console.log('Running LEGACY SQL migration fallback... Prefer Prisma migrations via "npm run db:prepare".');

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
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      birthday TEXT DEFAULT '',
      gender TEXT DEFAULT '',
      group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
      notes TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
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
      description TEXT DEFAULT '',
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

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      capacity INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE groups ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
    ALTER TABLE students ADD COLUMN IF NOT EXISTS group_id TEXT REFERENCES groups(id) ON DELETE SET NULL;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
    ALTER TABLE students ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'groups_status_check'
      ) THEN
        ALTER TABLE groups
        ADD CONSTRAINT groups_status_check CHECK (status IN ('active', 'completed', 'archived'));
      END IF;
    END $$;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'students_status_check'
      ) THEN
        ALTER TABLE students
        ADD CONSTRAINT students_status_check CHECK (status IN ('active', 'inactive', 'archived'));
      END IF;
    END $$;

    -- Performance indexes
    CREATE INDEX IF NOT EXISTS idx_groups_course_id ON groups(course_id);
    CREATE INDEX IF NOT EXISTS idx_groups_teacher_id ON groups(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_groups_status ON groups(status);
    CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
    CREATE INDEX IF NOT EXISTS idx_students_group_id ON students(group_id);
    CREATE INDEX IF NOT EXISTS idx_student_groups_group_id ON student_groups(group_id);
    CREATE INDEX IF NOT EXISTS idx_student_groups_student_id ON student_groups(student_id);
    CREATE INDEX IF NOT EXISTS idx_charges_student_id ON charges(student_id);
    CREATE INDEX IF NOT EXISTS idx_charges_group_id ON charges(group_id);
    CREATE INDEX IF NOT EXISTS idx_payments_student_id ON payments(student_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_group_id ON attendance(group_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
    CREATE INDEX IF NOT EXISTS idx_students_name ON students(first_name, last_name);
    CREATE INDEX IF NOT EXISTS idx_teachers_name ON teachers(first_name, last_name);
  `);

  console.log('Migration complete.');
  await db.pool.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

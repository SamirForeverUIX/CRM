require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const db = require('./index');

const dataDir = path.join(__dirname, '..', 'data');

function readJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
}

async function seed() {
  console.log('Seeding database from JSON files...');

  const teachers = readJSON('teachers.json');
  const courses = readJSON('courses.json');
  const groups = readJSON('groups.json');
  const students = readJSON('students.json');
  const settings = readJSON('settings.json');

  // Teachers
  for (const t of teachers) {
    await db.query(
      `INSERT INTO teachers (id, first_name, last_name, phone, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [t.id, t.firstName, t.lastName, t.phone, t.createdAt]
    );
  }
  console.log(`  Seeded ${teachers.length} teachers`);

  // Courses
  for (const c of courses) {
    await db.query(
      `INSERT INTO courses (id, name, code, lessons_per_month, duration_minutes, duration_months, price, description, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [c.id, c.name, c.code || '', c.lessonsPerMonth || 0, c.durationMinutes || 0, c.durationMonths || 0, c.price || 0, c.description || '', c.createdAt]
    );
  }
  console.log(`  Seeded ${courses.length} courses`);

  // Groups
  for (const g of groups) {
    await db.query(
      `INSERT INTO groups (id, name, course_id, teacher_id, days, room, start_time, start_date, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO NOTHING`,
      [g.id, g.name, g.courseId || null, g.teacherId || null, g.days || [], g.room || '', g.startTime || '', g.startDate || '', g.status || 'active', g.createdAt]
    );

    // Attendance
    if (g.attendance && g.attendance.length > 0) {
      for (const a of g.attendance) {
        const statuses = a.statuses || {};
        await db.query(
          `INSERT INTO attendance (group_id, date, statuses)
           VALUES ($1, $2, $3)
           ON CONFLICT (group_id, date) DO NOTHING`,
          [g.id, a.date, JSON.stringify(statuses)]
        );
      }
    }
  }
  console.log(`  Seeded ${groups.length} groups`);

  // Students
  for (const s of students) {
    const primaryGroupId = (s.groupId || (s.groupIds || [])[0] || null);
    await db.query(
      `INSERT INTO students (id, first_name, last_name, phone, birthday, gender, group_id, notes, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO NOTHING`,
      [s.id, s.firstName, s.lastName, s.phone, s.birthday || '', s.gender || '', primaryGroupId, s.notes || '', s.status || 'active', s.createdAt]
    );

    // Student-Group associations
    for (const gid of (s.groupIds || [])) {
      const joinDate = (s.groupJoinDates && s.groupJoinDates[gid]) || s.createdAt;
      await db.query(
        `INSERT INTO student_groups (student_id, group_id, joined_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (student_id, group_id) DO NOTHING`,
        [s.id, gid, joinDate]
      );
    }

    // Payments
    for (const p of (s.payments || [])) {
      await db.query(
        `INSERT INTO payments (id, student_id, amount, date, status, description)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [p.id, s.id, p.amount || 0, p.date || '', p.status || 'paid', p.description || '']
      );
    }
  }
  console.log(`  Seeded ${students.length} students`);

  // Settings
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
    [settings.centreName, settings.phone || '', settings.email || '', settings.address || '', settings.currency || 'UZS', settings.rooms || []]
  );
  console.log('  Seeded settings');

  // Rooms (from settings.rooms array)
  const { v4: uuidv4 } = require('uuid');
  const roomNames = settings.rooms || [];
  for (const roomName of roomNames) {
    await db.query(
      `INSERT INTO rooms (id, name, capacity) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [uuidv4(), roomName, 0]
    );
  }
  console.log(`  Seeded ${roomNames.length} rooms`);

  console.log('Seed complete.');
  await db.pool.end();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});

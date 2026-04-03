const { STUDENT_STATUS } = require('../utils/domainConstants');
const db = require('../db/index');

function createStudentLifecycleService(studentsRepo, groupsRepo) {
  return {
    async archiveStudent(studentId) {
      await studentsRepo.archive(studentId);
      return { studentId, status: STUDENT_STATUS.ARCHIVED };
    },

    async restoreStudent(studentId) {
      await studentsRepo.restore(studentId);
      return { studentId, status: STUDENT_STATUS.ACTIVE };
    },

    async freezeStudent(studentId) {
      await studentsRepo.freeze(studentId);
      return { studentId, status: STUDENT_STATUS.INACTIVE };
    },

    async unfreezeStudent(studentId) {
      await studentsRepo.unfreeze(studentId);
      return { studentId, status: STUDENT_STATUS.ACTIVE };
    },

    async removeFromGroupAndArchive(studentId, groupId) {
      if (!groupId) throw new Error('groupId_required');
      await db.transaction(async (client) => {
        await client.query('DELETE FROM student_groups WHERE student_id = $1 AND group_id = $2', [studentId, groupId]);
        const { rows } = await client.query(
          'SELECT group_id FROM student_groups WHERE student_id = $1 ORDER BY joined_at DESC LIMIT 1', [studentId]
        );
        await client.query('UPDATE students SET group_id = $1, status = $2 WHERE id = $3',
          [rows.length ? rows[0].group_id : null, STUDENT_STATUS.ARCHIVED, studentId]);
      });
      return { studentId, groupId, archived: true };
    },

    async restoreToGroup(studentId, groupId, joinedAt) {
      if (!groupId) throw new Error('groupId_required');
      const group = await groupsRepo.findById(groupId);
      if (!group) throw new Error('group_not_found');
      await db.transaction(async (client) => {
        await client.query("UPDATE students SET status = 'active', group_id = $1 WHERE id = $2", [groupId, studentId]);
        await client.query(
          'INSERT INTO student_groups (student_id, group_id, joined_at) VALUES ($1, $2, $3) ON CONFLICT (student_id, group_id) DO NOTHING',
          [studentId, groupId, joinedAt || new Date().toISOString()]
        );
      });
      return { studentId, groupId, status: STUDENT_STATUS.ACTIVE };
    }
  };
}

module.exports = {
  createStudentLifecycleService
};

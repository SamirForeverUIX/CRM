const { STUDENT_STATUS } = require('../utils/domainConstants');

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
      await studentsRepo.removeFromGroup(studentId, groupId);
      await studentsRepo.archive(studentId);
      return { studentId, groupId, archived: true };
    },

    async restoreToGroup(studentId, groupId, joinedAt) {
      if (!groupId) throw new Error('groupId_required');
      const group = await groupsRepo.findById(groupId);
      if (!group) throw new Error('group_not_found');
      await studentsRepo.restore(studentId);
      await studentsRepo.addToGroup(studentId, groupId, joinedAt || new Date().toISOString());
      return { studentId, groupId, status: STUDENT_STATUS.ACTIVE };
    }
  };
}

module.exports = {
  createStudentLifecycleService
};

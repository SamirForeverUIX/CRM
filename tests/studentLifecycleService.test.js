const test = require('node:test');
const assert = require('node:assert/strict');

const { createStudentLifecycleService } = require('../services/studentLifecycleService');

function makeRepos() {
  const calls = [];
  const studentsRepo = {
    archive: async (id) => calls.push(['archive', id]),
    restore: async (id) => calls.push(['restore', id]),
    freeze: async (id) => calls.push(['freeze', id]),
    unfreeze: async (id) => calls.push(['unfreeze', id]),
    removeFromGroup: async (sid, gid) => calls.push(['removeFromGroup', sid, gid]),
    addToGroup: async (sid, gid, joinedAt) => calls.push(['addToGroup', sid, gid, joinedAt])
  };
  const groupsRepo = {
    findById: async (id) => id === 'group-1' ? { id: 'group-1' } : null
  };
  return { studentsRepo, groupsRepo, calls };
}

test('removeFromGroupAndArchive performs remove then archive', async () => {
  const { studentsRepo, groupsRepo, calls } = makeRepos();
  const service = createStudentLifecycleService(studentsRepo, groupsRepo);

  await service.removeFromGroupAndArchive('student-1', 'group-1');

  assert.deepEqual(calls[0], ['removeFromGroup', 'student-1', 'group-1']);
  assert.deepEqual(calls[1], ['archive', 'student-1']);
});

test('restoreToGroup validates group and restores + reassigns', async () => {
  const { studentsRepo, groupsRepo, calls } = makeRepos();
  const service = createStudentLifecycleService(studentsRepo, groupsRepo);

  await service.restoreToGroup('student-1', 'group-1', '2026-05-15T00:00:00.000Z');

  assert.deepEqual(calls[0], ['restore', 'student-1']);
  assert.deepEqual(calls[1], ['addToGroup', 'student-1', 'group-1', '2026-05-15T00:00:00.000Z']);
});

test('restoreToGroup throws for missing group', async () => {
  const { studentsRepo, groupsRepo } = makeRepos();
  const service = createStudentLifecycleService(studentsRepo, groupsRepo);

  await assert.rejects(
    () => service.restoreToGroup('student-1', 'group-x'),
    /group_not_found/
  );
});

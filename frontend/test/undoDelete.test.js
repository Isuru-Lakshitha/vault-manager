import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scheduleUndoable, isPendingDelete, flushPendingDeletes } from '../src/utils/undoDelete.js';

// Manual fake timers so the tests are deterministic.
function fakeTimers() {
  const queue = new Map(); let next = 1;
  return {
    setTimeout: (fn) => { const id = next++; queue.set(id, fn); return id; },
    clearTimeout: (id) => { queue.delete(id); },
    async fireAll() { const fns = [...queue.values()]; queue.clear(); for (const fn of fns) await fn(); },
    get size() { return queue.size; },
  };
}

test('commit runs only after the window ends', async () => {
  const timers = fakeTimers(); let committed = 0;
  scheduleUndoable({ key: 'a', commit: async () => { committed++; }, timers });
  assert.equal(committed, 0);
  assert.equal(isPendingDelete('a'), true);
  await timers.fireAll();
  assert.equal(committed, 1);
  assert.equal(isPendingDelete('a'), false);
});

test('undo cancels the delete and calls onUndo once', async () => {
  const timers = fakeTimers(); let committed = 0; let undone = 0;
  const entry = scheduleUndoable({ key: 'b', commit: async () => { committed++; }, onUndo: () => { undone++; }, timers });
  assert.equal(entry.undo(), true);
  assert.equal(entry.undo(), false); // second undo is a no-op
  await timers.fireAll();
  assert.equal(committed, 0);
  assert.equal(undone, 1);
  assert.equal(isPendingDelete('b'), false);
});

test('undo after commit does nothing', async () => {
  const timers = fakeTimers(); let undone = 0;
  const entry = scheduleUndoable({ key: 'c', commit: async () => {}, onUndo: () => { undone++; }, timers });
  await timers.fireAll();
  assert.equal(entry.undo(), false);
  assert.equal(undone, 0);
});

test('commit failure reports the error', async () => {
  const timers = fakeTimers(); let error = null;
  scheduleUndoable({ key: 'd', commit: async () => { throw new Error('offline'); }, onError: (e) => { error = e; }, timers });
  await timers.fireAll();
  assert.equal(error?.message, 'offline');
});

test('flush runs pending deletes immediately (e.g. page closing)', async () => {
  const timers = fakeTimers(); let committed = 0;
  scheduleUndoable({ key: 'e1', commit: async () => { committed++; }, timers });
  scheduleUndoable({ key: 'e2', commit: async () => { committed++; }, timers });
  await flushPendingDeletes();
  assert.equal(committed, 2);
  await timers.fireAll(); // timers were cleared; nothing runs twice
  assert.equal(committed, 2);
});

test('re-deleting the same key replaces the first schedule (never commits twice)', async () => {
  const timers = fakeTimers(); let committed = 0;
  scheduleUndoable({ key: 'f', commit: async () => { committed++; }, timers });
  scheduleUndoable({ key: 'f', commit: async () => { committed++; }, timers });
  await timers.fireAll();
  assert.equal(committed, 1);
});

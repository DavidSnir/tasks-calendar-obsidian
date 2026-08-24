import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  applyOptimisticEdits,
  buildCells,
  parseFileTasks,
  type CalendarTask,
  type OptimisticEdit,
  type TaskStatus,
} from './taskQuery.ts';

describe('parseFileTasks rawLine', () => {
  test('keeps the untouched original line for later relocation', () => {
    const content = '    - [/] Nested 📅 2026-08-30 ✅ 2026-08-01';
    const tasks = parseFileTasks('a.md', 'a', content);
    assert.equal(tasks[0].rawLine, content);
  });
});

describe('applyOptimisticEdits', () => {
  const t = (
    id: string,
    description: string,
    date: string | null,
    status: TaskStatus,
  ): CalendarTask => ({
    id: `${id}:0`,
    filePath: `${id}.md`,
    fileName: id,
    lineNumber: 0,
    description,
    status,
    date,
    rawLine: `- [ ] ${description}`,
  });

  test('applies a status override by task id', () => {
    const edits = new Map<string, OptimisticEdit>([['f:0', { status: 'completed' }]]);
    const out = applyOptimisticEdits([t('f', 'Open', '2026-08-24', 'incomplete')], edits);
    assert.equal(out[0].status, 'completed');
    assert.equal(out[0].date, '2026-08-24');
  });

  test('applies a date override for rescheduled tasks', () => {
    const edits = new Map<string, OptimisticEdit>([['f:0', { date: '2026-09-01' }]]);
    const out = applyOptimisticEdits([t('f', 'Open', '2026-08-24', 'incomplete')], edits);
    assert.equal(out[0].date, '2026-09-01');
    assert.equal(out[0].status, 'incomplete');
  });

  test('clears a date override back to null with an explicit null edit', () => {
    const edits = new Map<string, OptimisticEdit>([['f:0', { date: null }]]);
    const out = applyOptimisticEdits([t('f', 'Open', '2026-08-24', 'incomplete')], edits);
    assert.equal(out[0].date, null);
  });

  test('leaves unedited tasks and the input array untouched', () => {
    const original = [t('f', 'Open', '2026-08-24', 'incomplete')];
    const edits = new Map<string, OptimisticEdit>([['other:0', { status: 'completed' }]]);
    const out = applyOptimisticEdits(original, edits);
    assert.notEqual(out, original);
    assert.equal(original[0].status, 'incomplete');
    assert.equal(out[0], original[0]);
  });
});

describe('buildCells', () => {
  const t = (
    id: string,
    description: string,
    date: string | null,
    status: TaskStatus,
  ): CalendarTask => ({
    id: `${id}:0`,
    filePath: `${id}.md`,
    fileName: id,
    lineNumber: 0,
    description,
    status,
    date,
    rawLine: '',
  });

  test('groups file tasks under one header per day', () => {
    const cells = buildCells([
      t('alpha', 'First', '2026-08-24', 'incomplete'),
      t('alpha', 'Second', '2026-08-24', 'completed'),
    ]);
    const groups = cells.get('2026-08-24')!;
    assert.equal(groups.length, 1);
    assert.equal(groups[0].header.taskCount, 2);
    assert.equal(groups[0].header.id, 'header-alpha.md-2026-08-24');
  });

  test('separates files that share a basename', () => {
    const shared = (path: string, description: string) => ({
      id: `${path}:0`,
      filePath: path,
      fileName: 'journal',
      lineNumber: 0,
      description,
      status: 'incomplete' as const,
      date: '2026-08-24',
      rawLine: '',
    });
    const cells = buildCells([shared('a/journal.md', 'A'), shared('b/journal.md', 'B')]);
    assert.equal(cells.get('2026-08-24')!.length, 2);
  });

  test('orders tasks in-progress, incomplete, then completed', () => {
    const cells = buildCells([
      t('f', 'Done', '2026-08-24', 'completed'),
      t('f', 'Open', '2026-08-24', 'incomplete'),
      t('f', 'Started', '2026-08-24', 'inprogress'),
    ]);
    assert.deepEqual(
      cells.get('2026-08-24')![0].tasks.map((task) => task.description),
      ['Started', 'Open', 'Done'],
    );
  });

  test('breaks ties alphabetically by title', () => {
    const cells = buildCells([
      t('f', 'Zebra', '2026-08-24', 'incomplete'),
      t('f', 'Antelope', '2026-08-24', 'incomplete'),
    ]);
    assert.deepEqual(
      cells.get('2026-08-24')![0].tasks.map((task) => task.description),
      ['Antelope', 'Zebra'],
    );
  });

  test('drops undated tasks from the grid', () => {
    const cells = buildCells([t('f', 'Undated', null, 'incomplete')]);
    assert.equal(cells.size, 0);
  });

  test('keeps files in scan order within a cell', () => {
    const cells = buildCells([
      t('bravo', 'B', '2026-08-24', 'incomplete'),
      t('alpha', 'A', '2026-08-24', 'incomplete'),
    ]);
    assert.deepEqual(
      cells.get('2026-08-24')!.map((group) => group.header.fileName),
      ['bravo', 'alpha'],
    );
  });
});

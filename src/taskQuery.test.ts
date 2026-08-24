import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';

import { buildCells, parseFileTasks, type CalendarTask, type TaskStatus } from './taskQuery.ts';

describe('parseFileTasks', () => {
  test('extracts a dated open task and cleans its description', () => {
    const tasks = parseFileTasks(
      'notes/todo.md',
      'todo',
      '- [ ] Pay rent 🔁 every month 📅 2026-09-01',
    );
    assert.equal(tasks.length, 1);
    const task = tasks[0];
    assert.equal(task.id, 'notes/todo.md:0');
    assert.equal(task.filePath, 'notes/todo.md');
    assert.equal(task.fileName, 'todo');
    assert.equal(task.lineNumber, 0);
    assert.equal(task.status, 'incomplete');
    assert.equal(task.date, '2026-09-01');
    assert.equal(task.description, 'Pay rent');
  });

  test('places a completed task on its completion date', () => {
    const tasks = parseFileTasks(
      'a.md',
      'a',
      '- [x] Write the summary 📅 2026-08-05 ✅ 2026-08-01',
    );
    assert.equal(tasks[0].status, 'completed');
    assert.equal(tasks[0].date, '2026-08-01');
  });

  test('falls back to the scheduled date', () => {
    const tasks = parseFileTasks('a.md', 'a', '- [ ] Call home ⏳ 2026-08-12');
    assert.equal(tasks[0].date, '2026-08-12');
  });

  test('keeps an undated task with a null date', () => {
    const tasks = parseFileTasks('a.md', 'a', '- [ ] Undated musing');
    assert.equal(tasks[0].date, null);
  });

  test('reads subtasks at their real line numbers', () => {
    const content = ['# Title', '', 'Intro prose.', '', '    - [/] Nested 📅 2026-08-30'].join('\n');
    const tasks = parseFileTasks('a.md', 'a', content);
    assert.equal(tasks[0].lineNumber, 4);
    assert.equal(tasks[0].status, 'inprogress');
    assert.equal(tasks[0].description, 'Nested');
  });

  test('skips non-task lines entirely', () => {
    const content = '# Heading\n\nSome text.\n- plain bullet';
    assert.deepEqual(parseFileTasks('a.md', 'a', content), []);
  });
});

describe('buildCells', () => {
  const t = (
    id: string,
    description: string,
    date: string | null,
    status: TaskStatus,
  ): CalendarTask => ({
    id,
    filePath: `${id}.md`,
    fileName: id,
    lineNumber: 0,
    description,
    status,
    date,
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

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';

import { applyStatusToggle, rescheduleLine } from './taskMutations.ts';

const TODAY = '2026-08-24';

describe('applyStatusToggle', () => {
  test('completing stamps the completion date', () => {
    const out = applyStatusToggle(['- [ ] Write the summary 📅 2026-08-26'], 0, 'completed', TODAY);
    assert.equal(out.lines[0], `- [x] Write the summary 📅 2026-08-26 ✅ ${TODAY}`);
    assert.equal(out.recurrence, undefined);
  });

  test('reopening removes the stamp', () => {
    const out = applyStatusToggle(
      [`- [x] Write the summary 📅 2026-08-26 ✅ ${TODAY}`],
      0,
      'incomplete',
      TODAY,
    );
    assert.equal(out.lines[0], '- [ ] Write the summary 📅 2026-08-26');
  });

  test('completing a recurring task spawns its next occurrence above', () => {
    const out = applyStatusToggle(
      ['- [ ] Weekly review 🔁 every week 📅 2026-08-24'],
      0,
      'completed',
      TODAY,
    );
    assert.equal(out.recurrence, 'created');
    assert.deepEqual(out.lines, [
      '- [ ] Weekly review 🔁 every week 📅 2026-08-31',
      `- [x] Weekly review 🔁 every week 📅 2026-08-24 ✅ ${TODAY}`,
    ]);
  });

  test('re-completing does not duplicate the occurrence', () => {
    const lines = [
      '- [ ] Weekly review 🔁 every week 📅 2026-08-31',
      `- [x] Weekly review 🔁 every week 📅 2026-08-24 ✅ ${TODAY}`,
    ];
    // Reopen, complete again: the neighbour already holds the next occurrence.
    const reopened = applyStatusToggle(lines, 1, 'incomplete', TODAY).lines;
    const again = applyStatusToggle(reopened, 1, 'completed', TODAY);
    assert.equal(again.lines.length, 2);
    assert.equal(again.recurrence, 'exists');
  });

  test('flags an unsupported recurrence rule instead of guessing', () => {
    const out = applyStatusToggle(
      ['- [ ] Review 🔁 every week on Monday 📅 2026-08-24'],
      0,
      'completed',
      TODAY,
    );
    assert.equal(out.recurrence, 'unsupported');
    assert.equal(out.lines.length, 1);
  });

  test('tolerates a repeat click on an already-applied state', () => {
    // Second click racing the refresh: the file already holds [/].
    const out = applyStatusToggle(['- [/] Started 📅 2026-08-26'], 0, 'inprogress', TODAY);
    assert.equal(out.changed, false);
    assert.deepEqual(out.lines, ['- [/] Started 📅 2026-08-26']);
  });

  test('re-completing an already stamped task neither duplicates nor spawns', () => {
    const line = `- [x] Done deal 📅 2026-08-26 ✅ ${TODAY}`;
    const out = applyStatusToggle([line], 0, 'completed', TODAY);
    assert.equal(out.changed, false);
    assert.equal(out.recurrence, undefined);
    assert.deepEqual(out.lines, [line]);
  });

  test('throws on a line that is no longer a checkbox', () => {
    assert.throws(
      () => applyStatusToggle(['plain prose'], 0, 'completed', TODAY),
      /Checkbox pattern not found/,
    );
  });

  test('throws past the end of the file', () => {
    assert.throws(
      () => applyStatusToggle(['- [ ] x'], 5, 'completed', TODAY),
      /out of bounds/,
    );
  });

  test('preserves later lines untouched', () => {
    const lines = ['- [ ] a 📅 2026-08-25', '- [ ] b 📅 2026-08-26'];
    const out = applyStatusToggle(lines, 0, 'completed', TODAY);
    assert.equal(out.lines[1], lines[1]);
  });
});

describe('rescheduleLine', () => {
  test('moves the due date of an open task', () => {
    assert.equal(
      rescheduleLine('- [ ] Write the summary 📅 2026-08-05', 'incomplete', '2026-08-10'),
      '- [ ] Write the summary 📅 2026-08-10',
    );
  });

  test('falls back to the scheduled date when there is no due date', () => {
    assert.equal(
      rescheduleLine('- [ ] Call home ⏳ 2026-08-03', 'incomplete', '2026-08-10'),
      '- [ ] Call home ⏳ 2026-08-10',
    );
  });

  test('moves the completion date of a stamped completed task', () => {
    assert.equal(
      rescheduleLine(
        '- [x] Done deal 📅 2026-08-05 ✅ 2026-08-01',
        'completed',
        '2026-08-10',
      ),
      '- [x] Done deal 📅 2026-08-05 ✅ 2026-08-10',
    );
  });

  test('moves the due date of a completed task without a stamp', () => {
    assert.equal(
      rescheduleLine('- [x] Legacy 📅 2026-08-05', 'completed', '2026-08-10'),
      '- [x] Legacy 📅 2026-08-10',
    );
  });

  test('throws when the line carries no date at all', () => {
    assert.throws(
      () => rescheduleLine('- [ ] Undated', 'incomplete', '2026-08-10'),
      /No date pattern found/,
    );
  });
});

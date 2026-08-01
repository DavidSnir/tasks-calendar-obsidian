import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  advanceDate,
  eventDateFor,
  nextOccurrence,
  occurrenceAlreadyExists,
  parseRecurrence,
  setCompletionDate,
  stampDate,
  statusOf,
  TASK_LINE,
} from './taskLines.ts';

const TODAY = '2026-08-01';

/** Complete a line the way handleEventClick does, for end-to-end assertions. */
function complete(line: string): string {
  return setCompletionDate(line.replace(TASK_LINE, (_m, _c, rest) => `- [x] ${rest}`), true, TODAY);
}

describe('setCompletionDate', () => {
  test('stamps a completed task with the date it was completed', () => {
    assert.equal(
      setCompletionDate('- [x] Write the summary 📅 2026-08-05', true, TODAY),
      '- [x] Write the summary 📅 2026-08-05 ✅ 2026-08-01'
    );
  });

  test('removes the stamp when a task is reopened', () => {
    assert.equal(
      setCompletionDate('- [ ] Write the summary 📅 2026-08-05 ✅ 2026-08-01', false, TODAY),
      '- [ ] Write the summary 📅 2026-08-05'
    );
  });

  test('preserves a stamp set elsewhere rather than overwriting it', () => {
    const line = '- [x] Write the summary 📅 2026-08-05 ✅ 2026-07-30';
    assert.equal(setCompletionDate(line, true, TODAY), line);
  });

  test('keeps a trailing block reference last', () => {
    assert.equal(
      setCompletionDate('- [x] Write the summary 📅 2026-08-05 ^abc123', true, TODAY),
      '- [x] Write the summary 📅 2026-08-05 ✅ 2026-08-01 ^abc123'
    );
  });

  test('leaves indentation of a subtask alone', () => {
    assert.equal(
      setCompletionDate('    - [x] Nested item 📅 2026-08-05', true, TODAY),
      '    - [x] Nested item 📅 2026-08-05 ✅ 2026-08-01'
    );
  });

  test('does not leave double spaces when a line has trailing whitespace', () => {
    assert.equal(
      setCompletionDate('- [x] Trailing spaces 📅 2026-08-05   ', true, TODAY),
      '- [x] Trailing spaces 📅 2026-08-05 ✅ 2026-08-01'
    );
  });
});

describe('eventDateFor', () => {
  test('places a completed task on the day it was completed', () => {
    assert.equal(eventDateFor('completed', 'Summary 📅 2026-08-05 ✅ 2026-08-01'), '2026-08-01');
  });

  test('places an open task on its due date', () => {
    assert.equal(eventDateFor('incomplete', 'Summary 📅 2026-08-05'), '2026-08-05');
  });

  test('ignores a stale stamp on a task that is not completed', () => {
    assert.equal(eventDateFor('inprogress', 'Summary 📅 2026-08-05 ✅ 2026-08-01'), '2026-08-05');
  });

  test('falls back to the due date for a task completed without a stamp', () => {
    assert.equal(eventDateFor('completed', 'Legacy task 📅 2026-08-05'), '2026-08-05');
  });

  test('falls back to the scheduled date when there is no due date', () => {
    assert.equal(eventDateFor('incomplete', 'Call the landlord ⏳ 2026-08-12'), '2026-08-12');
  });

  test('returns null for a task with no dates', () => {
    assert.equal(eventDateFor('incomplete', 'Undated task'), null);
  });
});

describe('parseRecurrence', () => {
  test('reads a bare rule', () => {
    assert.deepEqual(parseRecurrence('- [ ] Standup 🔁 every day 📅 2026-08-01'),
      { interval: 1, unit: 'day', whenDone: false });
  });

  test('reads an explicit interval', () => {
    assert.deepEqual(parseRecurrence('- [ ] 1:1 🔁 every 2 weeks 📅 2026-08-05'),
      { interval: 2, unit: 'week', whenDone: false });
  });

  test('reads the when-done suffix', () => {
    assert.deepEqual(parseRecurrence('- [ ] Plants 🔁 every 3 days when done 📅 2026-08-02'),
      { interval: 3, unit: 'day', whenDone: true });
  });

  test('matches weekday before week, so "every weekday" is not read as "every week"', () => {
    assert.deepEqual(parseRecurrence('- [ ] Notes 🔁 every weekday 📅 2026-08-07'),
      { interval: 1, unit: 'weekday', whenDone: false });
  });

  test('tolerates tags and a block reference after the rule', () => {
    assert.deepEqual(parseRecurrence('- [ ] Task 🔁 every week #work ^abc123 📅 2026-08-05'),
      { interval: 1, unit: 'week', whenDone: false });
  });

  test('returns null for a line that does not recur', () => {
    assert.equal(parseRecurrence('- [ ] Ordinary task 📅 2026-08-05'), null);
  });

  // Regression: a loose match read this as "every week" and scheduled the next
  // task seven days out, ignoring "on Monday".
  test('refuses a day-of-week rule rather than reading it as a plain weekly rule', () => {
    assert.equal(parseRecurrence('- [ ] Review 🔁 every week on Monday 📅 2026-08-05'), null);
  });

  test('refuses a day-of-month rule', () => {
    assert.equal(parseRecurrence('- [ ] Rent 🔁 every month on the 1st 📅 2026-08-31'), null);
  });

  test('refuses a rule with a trailing qualifier it cannot honour', () => {
    assert.equal(parseRecurrence('- [ ] Task 🔁 every 2 weeks on Tuesday 📅 2026-08-05'), null);
  });
});

describe('advanceDate', () => {
  const rule = (unit: string, interval = 1, whenDone = false) =>
    ({ unit, interval, whenDone }) as Parameters<typeof advanceDate>[1];

  test('adds days', () => assert.equal(advanceDate('2026-08-01', rule('day')), '2026-08-02'));
  test('adds weeks', () => assert.equal(advanceDate('2026-08-03', rule('week')), '2026-08-10'));
  test('adds an interval of weeks', () =>
    assert.equal(advanceDate('2026-08-05', rule('week', 2)), '2026-08-19'));

  test('clamps to the end of a shorter month', () => {
    assert.equal(advanceDate('2026-08-31', rule('month')), '2026-09-30');
  });

  test('clamps a leap day to the 28th', () => {
    assert.equal(advanceDate('2028-02-29', rule('year')), '2029-02-28');
  });

  test('crosses a year boundary', () => {
    assert.equal(advanceDate('2026-12-31', rule('day')), '2027-01-01');
  });

  test('skips the weekend for a weekday rule', () => {
    // 2026-08-07 is a Friday.
    assert.equal(advanceDate('2026-08-07', rule('weekday')), '2026-08-10');
  });
});

describe('nextOccurrence', () => {
  test('unchecks the task, drops the stamp and advances the due date', () => {
    const done = '- [x] Weekly review 🔁 every week 📅 2026-08-03 ✅ 2026-08-01';
    assert.equal(
      nextOccurrence(done, parseRecurrence(done)!, TODAY),
      '- [ ] Weekly review 🔁 every week 📅 2026-08-10'
    );
  });

  test('advances due and scheduled dates independently', () => {
    const done = '- [x] Both 🔁 every week 📅 2026-08-05 ⏳ 2026-08-03 ✅ 2026-08-01';
    assert.equal(
      nextOccurrence(done, parseRecurrence(done)!, TODAY),
      '- [ ] Both 🔁 every week 📅 2026-08-12 ⏳ 2026-08-10'
    );
  });

  test('counts from the completion date for a when-done rule', () => {
    // Overdue since July: the next one should land ahead of today rather than
    // backfilling the occurrences it missed.
    const done = '- [x] Plants 🔁 every 3 days when done 📅 2026-07-20 ✅ 2026-08-01';
    assert.equal(
      nextOccurrence(done, parseRecurrence(done)!, TODAY),
      '- [ ] Plants 🔁 every 3 days when done 📅 2026-08-04'
    );
  });

  test('preserves indentation', () => {
    const done = '    - [x] Nested 🔁 every day 📅 2026-08-01 ✅ 2026-08-01';
    assert.equal(
      nextOccurrence(done, parseRecurrence(done)!, TODAY),
      '    - [ ] Nested 🔁 every day 📅 2026-08-02'
    );
  });
});

describe('occurrenceAlreadyExists', () => {
  // Regression: completing, reopening, then completing again wrote a second
  // copy of the same future task.
  test('detects the occurrence written by a previous completion', () => {
    const next = '- [ ] Weekly review 🔁 every week 📅 2026-08-10';
    assert.equal(occurrenceAlreadyExists(next, next), true);
  });

  test('ignores differences in trailing whitespace', () => {
    assert.equal(
      occurrenceAlreadyExists('- [ ] Weekly review 🔁 every week 📅 2026-08-10  ',
        '- [ ] Weekly review 🔁 every week 📅 2026-08-10'),
      true
    );
  });

  test('allows a genuinely different occurrence', () => {
    assert.equal(
      occurrenceAlreadyExists('- [ ] Weekly review 🔁 every week 📅 2026-08-17',
        '- [ ] Weekly review 🔁 every week 📅 2026-08-10'),
      false
    );
  });

  test('allows insertion at the top of a file', () => {
    assert.equal(occurrenceAlreadyExists(undefined, '- [ ] Anything'), false);
  });

  test('a complete/reopen/complete cycle converges on one occurrence', () => {
    const original = '- [ ] Weekly review 🔁 every week 📅 2026-08-03';

    const firstDone = complete(original);
    const firstNext = nextOccurrence(firstDone, parseRecurrence(firstDone)!, TODAY);
    assert.equal(occurrenceAlreadyExists(undefined, firstNext), false); // written

    // Reopen the completed task, then complete it a second time.
    const reopened = setCompletionDate(firstDone.replace(TASK_LINE, (_m, _c, rest) => `- [ ] ${rest}`), false, TODAY);
    assert.equal(reopened, original);

    const secondDone = complete(reopened);
    const secondNext = nextOccurrence(secondDone, parseRecurrence(secondDone)!, TODAY);
    assert.equal(occurrenceAlreadyExists(firstNext, secondNext), true); // skipped
  });
});

describe('parsing', () => {
  test('statusOf reads every checkbox character', () => {
    assert.equal(statusOf(' '), 'incomplete');
    assert.equal(statusOf('/'), 'inprogress');
    assert.equal(statusOf('x'), 'completed');
    assert.equal(statusOf('X'), 'completed');
  });

  test('a stamped line still parses as a task', () => {
    const done = complete('- [ ] Write the summary 📅 2026-08-05');
    const match = done.match(TASK_LINE);
    if (!match) assert.fail('completed line should still match TASK_LINE');
    assert.equal(statusOf(match[1]), 'completed');
  });

  test('stampDate formats local time, not UTC', () => {
    // 23:30 local on the 1st must not roll forward to the 2nd.
    assert.equal(stampDate(new Date(2026, 7, 1, 23, 30)), '2026-08-01');
    assert.equal(stampDate(new Date(2026, 7, 1, 0, 30)), '2026-08-01');
  });
});

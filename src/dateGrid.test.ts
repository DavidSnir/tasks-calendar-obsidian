import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  addDays,
  dayOfWeek,
  isoWeekNumber,
  monthMatrix,
  threeDayWindow,
  weekWindow,
} from './dateGrid.ts';

describe('addDays', () => {
  test('steps forward within a month', () => {
    assert.equal(addDays('2026-08-01', 1), '2026-08-02');
  });

  test('crosses a month boundary', () => {
    assert.equal(addDays('2026-08-31', 1), '2026-09-01');
  });

  test('crosses a year boundary', () => {
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  });

  test('steps backward', () => {
    assert.equal(addDays('2026-08-01', -1), '2026-07-31');
  });
});

describe('dayOfWeek', () => {
  test('reads Monday as 1 and Sunday as 0', () => {
    assert.equal(dayOfWeek('2026-08-24'), 1);
    assert.equal(dayOfWeek('2026-08-23'), 0);
  });
});

describe('isoWeekNumber', () => {
  test('a Thursday belongs to week 1 of its own year', () => {
    // 2026-01-01 is a Thursday.
    assert.equal(isoWeekNumber('2026-01-01'), 1);
  });

  test('mid-August 2026 sits in week 35', () => {
    assert.equal(isoWeekNumber('2026-08-24'), 35);
  });

  test('Sunday belongs to the week ending that day', () => {
    assert.equal(isoWeekNumber('2026-08-23'), 34);
  });

  test('the Monday before New Year belongs to week 1 of next year', () => {
    // 2024-12-30 is the Monday of the week containing 2025-01-01.
    assert.equal(isoWeekNumber('2024-12-30'), 1);
  });

  test('a Friday can land in a week 53', () => {
    // 2027-01-01 is a Friday in a 53-week ISO year.
    assert.equal(isoWeekNumber('2027-01-01'), 53);
  });
});

describe('monthMatrix', () => {
  // 2026-08-01 is a Saturday.
  const mondayFirst = monthMatrix(2026, 7, 1);

  test('lays out six full weeks', () => {
    assert.equal(mondayFirst.length, 6);
    assert.ok(mondayFirst.every((row) => row.length === 7));
  });

  test('starts on the Monday on or before the 1st', () => {
    assert.equal(mondayFirst[0][0], '2026-07-27');
  });

  test('ends six weeks later', () => {
    assert.equal(mondayFirst[5][6], '2026-09-06');
  });

  test('places the 1st under its weekday', () => {
    // Row 0 runs Jul 27 - Aug 2, so Saturday Aug 1 sits in its fifth slot.
    assert.equal(mondayFirst[0][5], '2026-08-01');
  });

  test('honours a Sunday week start', () => {
    const sundayFirst = monthMatrix(2026, 7, 0);
    assert.equal(sundayFirst[0][0], '2026-07-26');
    assert.equal(sundayFirst[0][6], '2026-08-01');
  });

  test('crosses a year boundary without trouble', () => {
    const december = monthMatrix(2026, 11, 1);
    assert.equal(december[0][0], '2026-11-30'); // 2026-12-01 is a Tuesday
  });
});

describe('weekWindow', () => {
  test('snaps an anchor back to the Monday that starts its week', () => {
    // 2026-08-26 is a Wednesday.
    assert.deepEqual(weekWindow('2026-08-26', 1), [
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
      '2026-08-28',
      '2026-08-29',
      '2026-08-30',
    ]);
  });

  test('snaps to Sunday when the week starts on Sunday', () => {
    const window = weekWindow('2026-08-26', 0);
    assert.equal(window[0], '2026-08-23');
    assert.equal(window.length, 7);
  });

  test('is stable when the anchor is already the week start', () => {
    const window = weekWindow('2026-08-24', 1);
    assert.equal(window[0], '2026-08-24');
  });
});

describe('threeDayWindow', () => {
  test('starts at the anchor and steps one day at a time', () => {
    assert.deepEqual(threeDayWindow('2026-08-31'), [
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
    ]);
  });
});

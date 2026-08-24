import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';

import { locateLine } from './taskMutations.ts';

const LINE_A = '- [ ] Alpha 📅 2026-08-24';
const LINE_B = '- [ ] Beta 📅 2026-08-25';

describe('locateLine', () => {
  test('prefers an exact hit at the hinted index', () => {
    const lines = ['# notes', '', LINE_A];
    assert.equal(locateLine(lines, LINE_A, 2), 2);
  });

  test('finds a line pushed down by an insertion above it', () => {
    const lines = [LINE_B, LINE_A]; // a spawned occurrence landed above
    assert.equal(locateLine(lines, LINE_A, 0), 1);
  });

  test('finds a line that moved up', () => {
    const lines = [LINE_A, LINE_B];
    assert.equal(locateLine(lines, LINE_B, 1), 1);
    assert.equal(locateLine(lines, LINE_A, 1), 0);
  });

  test('searches a small window around the hint', () => {
    const filler = Array.from({ length: 8 }, (_, i) => `- [ ] filler ${i}`);
    const lines = [...filler.slice(0, 4), LINE_A, ...filler.slice(4)];
    assert.equal(locateLine(lines, LINE_A, 0), 4);
    assert.equal(locateLine(lines, LINE_A, 9), 4);
  });

  test('returns null when the line is gone beyond the window', () => {
    assert.equal(locateLine(['# empty'], LINE_A, 0), null);
  });

  test('stays in bounds near the top and bottom of the file', () => {
    const lines = [LINE_A, LINE_B];
    assert.equal(locateLine(lines, LINE_A, 100), null);
    assert.equal(locateLine(lines, LINE_A, 0), 0);
  });
});

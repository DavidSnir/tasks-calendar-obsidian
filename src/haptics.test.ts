import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';

import { pulse } from './haptics.ts';

describe('pulse', () => {
  test('forwards the pattern to a present vibrate implementation', () => {
    const seen: (number | number[])[] = [];
    const fired = pulse([0, 30], (pattern) => {
      seen.push(pattern);
      return true;
    });
    assert.equal(fired, true);
    assert.deepEqual(seen, [[0, 30]]);
  });

  test('reports nothing fired when the platform has no vibration', () => {
    assert.equal(pulse(10, undefined), false);
  });

  test('swallows implementations that throw', () => {
    assert.equal(
      pulse(10, () => {
        throw new Error('not supported');
      }),
      false,
    );
  });
});

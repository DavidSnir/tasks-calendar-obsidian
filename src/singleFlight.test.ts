import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';

import { CoalescedRunner } from './singleFlight.ts';

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
}

function waitFor(condition: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const check = () => (condition() ? resolve() : setTimeout(check, 0));
    check();
  });
}

describe('CoalescedRunner', () => {
  test('runs a lone request right away', async () => {
    let runs = 0;
    const runner = new CoalescedRunner(async () => {
      runs++;
    });

    runner.request();
    await runner.settled();

    assert.equal(runs, 1);
  });

  test('collapses a burst during a run into exactly one trailing rerun', async () => {
    let runs = 0;
    const first = gate();
    const runner = new CoalescedRunner(async () => {
      runs++;
      if (runs === 1) await first.opened;
    });

    runner.request();
    runner.request();
    runner.request();
    runner.request();

    first.open();
    await runner.settled();

    assert.equal(runs, 2);
  });

  test('a throwing job does not wedge later requests', async () => {
    let runs = 0;
    const runner = new CoalescedRunner(async () => {
      runs++;
      if (runs === 1) throw new Error('boom');
    });

    runner.request();
    await runner.settled();
    runner.request();
    await runner.settled();

    assert.equal(runs, 2);
  });

  test('requests made during the trailing rerun are honored once more', async () => {
    let runs = 0;
    const firstRun = gate();
    const secondRun = gate();
    const runner = new CoalescedRunner(async () => {
      runs++;
      if (runs === 1) await firstRun.opened;
      if (runs === 2) await secondRun.opened;
    });

    runner.request();
    // Lands while run 1 is in flight -> one trailing rerun.
    runner.request();

    firstRun.open();
    await waitFor(() => runs === 2); // run 2 has started (and blocks on its gate)
    assert.equal(runner.isRunning, true);

    // Now, while the trailing rerun itself is blocked mid-job...
    runner.request();

    secondRun.open();
    await runner.settled();
    assert.equal(runs, 3);
  });
});

/**
 * Coalesces bursts of refresh requests into at most one trailing rerun
 * (ADR 0005): while a job runs, further requests set a flag instead of
 * queueing, so N overlapping triggers produce exactly one follow-up pass —
 * and the grid always converges on the latest state.
 *
 * Jobs are expected to handle their own errors; a throwing job is counted in
 * `failureCount` and never wedges the runner.
 */
export class CoalescedRunner {
  private running = false;
  private rerunRequested = false;
  private failures = 0;

  constructor(private readonly job: () => Promise<void>) {}

  /** Run the job, or remember to run it once more when the current run ends. */
  request(): void {
    if (this.running) {
      this.rerunRequested = true;
      return;
    }
    this.running = true;
    void this.drain();
  }

  private async drain(): Promise<void> {
    do {
      this.rerunRequested = false;
      try {
        await this.job();
      } catch {
        // The job owns its error reporting; keep the runner alive either way.
        this.failures++;
      }
    } while (this.rerunRequested);
    this.running = false;
    // No await between the loop exit and this line, so a request() arriving
    // during the final job's completion is already folded into the loop above.
  }

  /** True while a job (or its trailing rerun) is in flight. */
  get isRunning(): boolean {
    return this.running;
  }

  /** Test hook: resolves when nothing is running and nothing is pending. */
  settled(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (!this.running && !this.rerunRequested) resolve();
        else setTimeout(check, 0);
      };
      check();
    });
  }
}

# ADR 0005: Instant optimistic interactions

Date: 2026-08-24
Status: Accepted

## Context

Clicking a task used to run its file write and a full vault rescan under one
exclusive guard: correct, but every click during that window was silently
dropped, so rapid clicks felt dead and visuals waited on I/O. The same
latency applied to drag-rescheduling, where the pill stayed hidden until the
rescan repainted it.

## Decision

Visual feedback never waits for I/O. Three mechanisms share the load:

1. **Optimistic edits** (`Map<taskId, {status?, date?}>`) overlay the last
   scanned task list; every repaint folds them in (`applyOptimisticEdits`).
   Clicks restyle — and complete-today placement follows the stamp rule —
   immediately; drops place the pill in its target cell immediately. A
   landing scan clears the overlay: disk wins.
2. **A serialized write chain** (`promise.then` queue) runs mutations one at
   a time; nothing is ever dropped. Each write relocates its line first
   (`locateLine`: exact raw-line match near the scanned index), because an
   earlier write in the same burst — a recurrence spawn inserts a line above
   — shifts stored indices.
3. **Coalesced rescans** (`CoalescedRunner`): any number of refresh triggers
   during a scan collapse into exactly one trailing pass, which always ends
   on the latest state.

Navigation (prev/next/today/view switches) renders purely from memory and
never rescans at all.

## Consequences

- Rapid clicks cycle statuses fully; drops land instantly; no dropped
  interactions.
- Toggling to in-progress no longer posts a Notice (it was the common case's
  noise).
- Wrong-line edits are structurally impossible; worst case a write aborts
  with a notice and the next scan self-corrects.
- More than five concurrent line-shifting writes between scans would exceed
  the relocation window; the failure mode is a benign aborted write, not
  corruption.

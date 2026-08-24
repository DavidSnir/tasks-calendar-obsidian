# ADR 0002: Pointer-events based drag-and-drop

Date: 2026-08-24
Status: Accepted

## Context

Drag-to-reschedule was previously delegated to `@fullcalendar/interaction`.
With that dependency gone (ADR 0001), dragging must be reimplemented. The git
history shows deliberate mobile investment (a 3-day view stepping one day at a
time for thumb reach, `longPressDelay: 300` so touches could start a drag
without breaking scrolling), so mobile support is a requirement, not a bonus.

HTML5 drag-and-drop (`dragstart`/`dragover`) does not fire on touch devices,
so it cannot be the mechanism.

## Decision

Implement dragging with Pointer Events (`pointerdown`/`pointermove`/
`pointerup`) in `src/dragDrop.ts`:

- Mouse drags start immediately; touch drags start after a 300 ms long-press,
  matching the old `longPressDelay`. Movement before the timer cancels the
  pending drag and lets the surface scroll.
- A ghost copy of the event follows the pointer; the day cell under the
  pointer is highlighted as the drop target; dropping on a different date
  commits through the same mutation path as before.

## Consequences

- Desktop and mobile behave like the FullCalendar build did.
- One code path owns hit-testing, so drop accuracy is testable and fixable in
  one place.
- Scroll-while-dragging (auto-scroll at viewport edges) is not implemented;
  parity with the old behaviour ends where FullCalendar's ended.

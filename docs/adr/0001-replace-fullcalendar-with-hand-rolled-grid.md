# ADR 0001: Replace FullCalendar with a hand-rolled day grid

Date: 2026-08-24
Status: Accepted

## Context

The plugin rendered its month/week/3-day views with `@fullcalendar/core`,
`@fullcalendar/daygrid`, and `@fullcalendar/interaction`. That choice cost:

- ~450 KB of bundle for what is, functionally, a date-grid and a drag
  gesture.
- A permanent fight against the library's DOM and CSS: overriding `.fc-*`
  styles to look like Obsidian, four redundant sizing mechanisms (ResizeObserver,
  window resize, layout-change listener, a 1-second polling interval) working
  around FullCalendar's internal scrollers, and a custom drag-mirror
  positioner patching its drag visuals.
- Drag-and-drop semantics we do not need (duration resizing, time grids,
  external droppables) switched off via config.

The features actually used: a day grid in three durations, all-day events in
cells, click handling, and date-cell drop targets.

## Decision

Replace FullCalendar with a small renderer owned by this plugin:
`src/dateGrid.ts` (pure grid math) + `src/calendarGrid.ts` (DOM rendering),
with dragging reimplemented on Pointer Events (ADR 0002). All three views are
kept; `styles.css` drops every `.fc-*` rule while keeping the Style Settings
variables untouched.

## Consequences

- Bundle shrinks by roughly an order of magnitude; no third-party calendar
  code to debug.
- Sizing collapses from four mechanisms to intrinsic layout plus one
  ResizeObserver.
- We now own edge cases FullCalendar absorbed (month matrices with leading/
  trailing days, week numbers). These are pure functions, covered by unit
  tests.

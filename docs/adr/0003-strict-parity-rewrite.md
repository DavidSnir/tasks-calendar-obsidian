# ADR 0003: Strict parity rewrite

Date: 2026-08-24
Status: Accepted

## Context

The refresh replaces the rendering layer of a working plugin. Rewrites die
when "while we're in here" feature work rides along: scope doubles, and the
replacement can no longer be validated against the behaviour it replaced.

## Decision

The rewrite is parity-only. Every behaviour observable today survives
unchanged; nothing is added; `src/taskLines.ts` (pure, tested task-line logic)
is not modified at all.

Parity checklist:

- Status cycle on click: incomplete → in-progress → completed → incomplete.
- Completion stamp written/removed; completed tasks placed by completion date.
- Recurrence spawn above the completed line; unsupported rules noticed, never
  guessed.
- Drag-to-reschedule updates due, then scheduled, then completion date —
  whichever field placed the event.
- File headers per note/day, click to open, mod-click for a new tab.
- Month / week / 3-day views; 3-day steps one day at a time.
- Settings: show-file-name, RTL, week start Sunday/Monday, Style Settings
  variables (unchanged names), auto-refresh on vault changes.

The one deliberate non-feature: the `weekTagPrefix` setting is removed rather
than implemented — its display feature never shipped, so keeping the setting
was advertising vapour.

## Consequences

- Post-rewrite validation is a diff against known behaviour, checkable by
  hand in Obsidian.
- New capabilities wait until the rewrite is proven.

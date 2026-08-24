# Glossary

Terms used across the codebase, ADRs, and README.

**Task line** — A markdown list item with a checkbox, `- [x]`, matched by
`TASK_LINE` in `src/taskLines.ts`. The atom this plugin reads and rewrites.

**Status** — One of `incomplete` (`[ ]`), `inprogress` (`[/]`),
`completed` (`[x]`/`[X]`). Clicking an event cycles through them.

**Completion stamp** — The `✅ YYYY-MM-DD` suffix written when a task is
completed and removed when reopened. Completed tasks are *placed* on the
calendar by this date (falling back to due, then scheduled).

**Due / scheduled date** — The Tasks-plugin emoji fields `📅 YYYY-MM-DD` and
`⏳ YYYY-MM-DD`. An open task renders on its due date, falling back to
scheduled.

**Recurrence rule** — A `🔁 every …` clause. Only rules anchored end-to-end by
`SUPPORTED_RULE` are honoured; anything else (e.g. `every week on Monday`) is
refused rather than guessed, because writing a wrongly-dated task into notes
is worse than writing none.

**Next occurrence** — The unchecked clone of a recurring task, dates advanced
one interval, inserted above the completed line. Guarded against duplication
by `occurrenceAlreadyExists`.

**File header** — A non-task pseudo-event shown above each file's tasks in a
day cell, labelled with the note name; clicking it opens the note
(mod-click: new tab).

**Anchor date** — The date a view is centred on. Prev/next move the anchor by
the view's step (month, week, or one day in the 3-day view).

**Grid math** — Pure date arithmetic in `src/dateGrid.ts`: month matrices,
week windows, ISO week numbers. No DOM, fully unit-tested.

**Task query** — Vault scan turned into renderable events
(`src/taskQuery.ts`). Parsing is pure and tested; only the vault read is I/O.

**Mutation** — Any write back into a note (status toggle, completion stamp,
recurrence spawn, reschedule). All line-level transforms live in
`src/taskMutations.ts` as pure functions over arrays of lines.

**Event id** — `"<file path>:<line number>"`. Encodes where a task lives so a
drop or click can find the exact line. Line-number ids are why any edit that
inserts or removes lines must rebuild the calendar.

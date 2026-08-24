# Tasks Calendar for Obsidian

A calendar view for Obsidian that visualizes your tasks with dates — with drag-and-drop rescheduling, status cycling, and recurring-task support. Renders Tasks-plugin-style emoji markup directly from your notes; no other plugin required.

## Features

- Monthly, weekly, and 3-day views of tasks across the whole vault.
- Tasks are placed by due date `📅 YYYY-MM-DD`, falling back to scheduled date `⏳ YYYY-MM-DD`.
- Completed tasks are placed on their completion date `✅ YYYY-MM-DD`.
- Click a task to cycle its status: incomplete → in-progress (`/`) → completed → incomplete.
- Completing a task stamps it with today's date; reopening removes the stamp.
- Recurring tasks (`🔁 every …`): completing one writes its next instance right above it. Supports `every day/week/month/year/weekday`, intervals such as `every 2 weeks`, and the `when done` suffix. Rules it cannot fully understand (e.g. `every week on Monday`) never produce a wrongly-dated copy — you get a notice instead.
- Drag a task to another day to reschedule it in the source note. Works with mouse and touch (long-press on mobile).
- File headers group each note's tasks per day; click a header to open the note (cmd/ctrl-click for a new tab).
- Week numbers, configurable week start (Sunday/Monday), RTL support, and Style Settings theming.
- Calendars refresh automatically as your vault changes.

## Installation

### BRAT (recommended)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from the community plugins.
2. Open BRAT settings → *Add Beta plugin*.
3. Enter `https://github.com/DavidSnir/tasks-calendar-obsidian` and confirm.

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [release](https://github.com/DavidSnir/tasks-calendar-obsidian/releases).
2. Place them in `<vault>/.obsidian/plugins/tasks-calendar/`.
3. Enable *Tasks Calendar* in Settings → Community plugins.

## Usage

Open the calendar from the ribbon icon or the command palette ("Open calendar").

Write tasks anywhere in your vault using Tasks-style markup:

```markdown
- [ ] Pay rent 📅 2026-09-01
- [/ ] Draft blog post ⏳ 2026-08-28
- [x] Water the plants 🔁 every 3 days when done ✅ 2026-08-24
```

| Interaction | Effect |
| --- | --- |
| Click task | Cycle status |
| Click file header | Open the note |
| Cmd/ctrl-click header | Open in new tab |
| Drag task to another cell | Change its date |

Note: this plugin reads and writes the common Tasks emoji fields but is not built on the Tasks plugin's query engine; it shows every dated checklist item in the vault.

## Settings

- **Start week on Sunday** — Sunday or Monday first columns.
- **Enable RTL task text** — right-to-left text alignment inside day cells, for Hebrew, Arabic, etc.
- **Style Settings** — colors, fonts, padding, completed-task fade, and more via the [Style Settings](https://github.com/mgmeyers/obsidian-style-settings) plugin.

## Development

```bash
npm install        # dependencies
npm run dev        # watch build
npm test           # unit tests (node:test)
npm run lint       # eslint
npm run build      # typecheck + production bundle
```

The pure logic (date-grid math, markdown parsing, line mutations) lives in `src/dateGrid.ts`, `src/taskQuery.ts`, `src/taskLines.ts`, and `src/taskMutations.ts`, and is covered by unit tests; architectural decisions are recorded in [`docs/adr/`](docs/adr).

## License

[MIT](LICENSE)

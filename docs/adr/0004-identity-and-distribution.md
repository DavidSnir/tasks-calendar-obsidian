# ADR 0004: Keep name and id; distribute via GitHub

Date: 2026-08-24
Status: Accepted (amended 2026-08-24: beta phase ships as `tasks-calendar-beta`)

## Context

The plugin id `tasks-calendar` and display name "Tasks Calendar" collide with
an existing community-directory submission (`aviatesk/obsidian-tasks-calendar`,
obsidian-releases PR #10644) and sit next to `tasks-calendar-wrapper`. The
author distributes via GitHub (BRAT / manual install), which does not require
globally unique ids — BRAT resolves by repository.

Changing the id invalidates users' saved settings, since Obsidian keys plugin
data (`data.json`) by id.

## Decision

Keep display name **Tasks Calendar** and id **`tasks-calendar`**. Distribute
through GitHub releases of this repository (`DavidSnir/tasks-calendar-obsidian`);
document BRAT installation in the README.

If the plugin is ever submitted to the community directory, the id must change
first (e.g. `david-tasks-calendar`) — accepting the settings reset — and this
ADR updated.

## Consequences

- Existing installs keep their settings across upgrades.
- Users who also install aviatesk's plugin will see two plugins claiming the
  id; documented as unsupported.
- Author fields carry "David Snir"; releases follow the standard Obsidian
  `versions.json` + GitHub-release workflow.

### Amendment (beta phase)

While the rewrite stabilizes, the plugin ships as **Tasks Calendar Beta**
(id `tasks-calendar-beta`) so it can run side-by-side with the installed
original instead of replacing it. The stable id reverts to `tasks-calendar`
once the rewrite is proven in daily use.

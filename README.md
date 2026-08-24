# Tasks Calendar for Obsidian

A simple calendar view for Obsidian to visualize tasks with due dates.

## Features

*   Displays tasks with `📅 YYYY-MM-DD` format on a monthly calendar.
*   Uses completion date `✅ YYYY-MM-DD` for completed tasks if available.
*   Falls back to scheduled date `⏳ YYYY-MM-DD` if due date is missing.
*   Supports basic task status toggling (incomplete -> in-progress -> completed -> incomplete) by clicking.
*   Click a file header to open that note (cmd/ctrl-click opens it in a new tab).
*   Stamps a completion date `✅ YYYY-MM-DD` when a task is completed, and removes it if the task is reopened.
*   Recurring tasks: completing a task marked `🔁 every ...` writes its next instance above the completed one.
    Supported: `every day`, `every week`, `every month`, `every year`, `every weekday`, an interval such as
    `every 2 weeks`, and the `when done` suffix (counts from the completion date instead of the task's own date).
    Not supported: day-of-week or day-of-month rules such as `every week on Monday`.
*   Allows dragging tasks to change their due date.
*   Customizable appearance via Style Settings plugin (colors, fonts, etc.).
*   Optional RTL text direction support.
*   Optional week start on Sunday.
*   Optional display of source filename on events.
*   Calendar automatically refreshes on vault changes.
*   Calendar automatically resizes when Obsidian layout changes.

## Installation

*Instructions on how to install the plugin (e.g., via BRAT, manual installation) will go here.*

## Usage

*Instructions on how to use the plugin (e.g., task format, opening the view) will go here.*

## Settings

*   **Show file name on events**: Display the source file name above the task description.
*   **Enable Right-to-Left (RTL) Text**: Display task text with right-to-left directionality.
*   **Week Task Tag Prefix**: Define a tag prefix (e.g., `#week`) for identifying week-specific tasks (Note: Displaying these is not yet implemented).
*   **Start week on Sunday**: Display the calendar week starting on Sunday instead of Monday.
*   **(Style Settings)**: Additional appearance settings can be configured via the community plugin "Style Settings".

## Contributing

*Information for potential contributors.* 
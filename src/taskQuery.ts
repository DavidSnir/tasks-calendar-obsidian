/**
 * Turns vault markdown into the events the calendar renders.
 *
 * Everything here is pure and unit-tested; the only vault I/O lives in the
 * view, which reads files and feeds their contents into parseFileTasks.
 */
import { TASK_LINE, eventDateFor, statusOf, type TaskStatus } from './taskLines.ts';

export type { TaskStatus };

export interface CalendarTask {
  /** `<file path>:<line number>`; locates the exact line for edits. */
  id: string;
  filePath: string;
  fileName: string;
  lineNumber: number;
  /** The untouched markdown line as scanned; anchors relocation after edits shift line numbers. */
  rawLine: string;
  description: string;
  status: TaskStatus;
  /** The day the task renders on, or null when it carries no date. */
  date: string | null;
}

export interface FileHeader {
  id: string;
  filePath: string;
  fileName: string;
  date: string;
  taskCount: number;
}

/** One file's slice of a day cell: the header plus its sorted tasks. */
export interface CellGroup {
  header: FileHeader;
  tasks: CalendarTask[];
}

/**
 * Patterns stripped from a task line to produce its display title: the Tasks
 * emoji fields, recurrence clauses, and bare "every …" text left by other
 * plugins.
 */
const DESCRIPTION_NOISE: RegExp[] = [
  /📅 \d{4}-\d{2}-\d{2}/g,
  /⏳ \d{4}-\d{2}-\d{2}/g,
  /✅ \d{4}-\d{2}-\d{2}/g,
  /🔁 [^📅⏳✅]*/g,
  /every \d+ (day|week|month|year)s?/gi,
  /every (day|week|month|year)/gi,
  /📆 [^📅⏳✅]*/g,
  /🕐 [^📅⏳✅]*/g,
  /⌚ [^📅⏳✅]*/g,
  /🕒 [^📅⏳✅]*/g,
];

/** Parse one file's markdown into dated calendar tasks. */
export function parseFileTasks(
  filePath: string,
  fileName: string,
  content: string,
): CalendarTask[] {
  const tasks: CalendarTask[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(TASK_LINE);
    if (!match) continue;

    const status = statusOf(match[1]);
    const description = DESCRIPTION_NOISE.reduce(
      (acc, pattern) => acc.replace(pattern, ''),
      match[2],
    ).trim();

    tasks.push({
      id: `${filePath}:${i}`,
      filePath,
      fileName,
      lineNumber: i,
      rawLine: lines[i],
      description,
      status,
      date: eventDateFor(status, match[2]),
    });
  }

  return tasks;
}

const STATUS_RANK: Record<TaskStatus, number> = {
  inprogress: 1,
  incomplete: 2,
  completed: 3,
};

/** A not-yet-written change the user made in the UI. */
export interface OptimisticEdit {
  status?: TaskStatus;
  /** An explicit null clears a task's date override (back to due/scheduled). */
  date?: string | null;
}

/**
 * Fold UI-only edits over the last scanned tasks so renders can happen
 * instantly, without waiting for writes or rescans. Pure: returns new task
 * objects for edited entries and never mutates the input.
 */
export function applyOptimisticEdits(
  tasks: CalendarTask[],
  edits: Map<string, OptimisticEdit>,
): CalendarTask[] {
  return tasks.map((task) => {
    const edit = edits.get(task.id);
    if (!edit) return task;
    return {
      ...task,
      status: edit.status ?? task.status,
      date: edit.date !== undefined ? edit.date : task.date,
    };
  });
}

/**
 * Group dated tasks into per-day cells: one CellGroup per file, files kept in
 * scan order, keyed by full path because two files can share a basename.
 * Within a group tasks run in-progress, incomplete, then completed, ties
 * broken alphabetically — the same order the previous build produced.
 */
export function buildCells(tasks: CalendarTask[]): Map<string, CellGroup[]> {
  const byFileThenDate = new Map<string, Map<string, CalendarTask[]>>();

  for (const task of tasks) {
    if (!task.date) continue;

    let dates = byFileThenDate.get(task.filePath);
    if (!dates) {
      dates = new Map();
      byFileThenDate.set(task.filePath, dates);
    }

    const bucket = dates.get(task.date);
    if (bucket) bucket.push(task);
    else dates.set(task.date, [task]);
  }

  const cells = new Map<string, CellGroup[]>();

  for (const [filePath, dates] of byFileThenDate) {
    for (const [date, grouped] of dates) {
      const header: FileHeader = {
        id: `header-${filePath}-${date}`,
        filePath,
        fileName: grouped[0].fileName,
        date,
        taskCount: grouped.length,
      };

      const group: CellGroup = {
        header,
        tasks: [...grouped].sort(
          (a, b) =>
            STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
            a.description.localeCompare(b.description),
        ),
      };

      const cell = cells.get(date);
      if (cell) cell.push(group);
      else cells.set(date, [group]);
    }
  }

  return cells;
}

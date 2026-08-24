/**
 * Pure line-level transforms for writing back into notes: status toggling
 * (with completion stamping and recurrence spawning) and rescheduling.
 *
 * Free of any Obsidian import so they stay testable in isolation; the view
 * wraps these inside vault.process and maps thrown errors onto Notices.
 */
import {
  hasRecurrenceMarker,
  nextOccurrence,
  occurrenceAlreadyExists,
  parseRecurrence,
  setCompletionDate,
  type TaskStatus,
} from './taskLines.ts';

const CHECKBOX = /^(\s*- \[)[\sxX\/](\].*)/;

const DUE_DATE_FIELD = /(📅 )(\d{4}-\d{2}-\d{2})/;
const SCHEDULED_DATE_FIELD = /(⏳ )(\d{4}-\d{2}-\d{2})/;
const COMPLETION_DATE_FIELD = /(✅ )(\d{4}-\d{2}-\d{2})/;

export type RecurrenceOutcome = 'created' | 'exists' | 'unsupported';

export interface ToggleResult {
  /** A fresh array; the input array is never mutated. */
  lines: string[];
  recurrence?: RecurrenceOutcome;
}

function statusChar(status: TaskStatus): string {
  return status === 'completed' ? 'x' : status === 'inprogress' ? '/' : ' ';
}

/**
 * Apply a status change to one line of a file.
 *
 * Completing stamps ✅ today and spawns a recurring task's next occurrence
 * directly above the completed line; moving away from completed removes the
 * stamp again. Throws when the target line is out of bounds or no longer a
 * checkbox, so the caller can revert whatever optimistic UI it applied.
 */
export function applyStatusToggle(
  lines: string[],
  lineNumber: number,
  nextStatus: TaskStatus,
  today: string,
): ToggleResult {
  if (lineNumber >= lines.length) {
    throw new Error(`Line number ${lineNumber} out of bounds`);
  }

  const originalLine = lines[lineNumber];
  if (!CHECKBOX.test(originalLine)) {
    throw new Error('Checkbox pattern not found in line.');
  }

  let updatedLine = originalLine.replace(CHECKBOX, `$1${statusChar(nextStatus)}$2`);
  updatedLine = setCompletionDate(updatedLine, nextStatus === 'completed', today);

  if (updatedLine === originalLine) {
    throw new Error(`Failed to replace status char in line. Expected '${statusChar(nextStatus)}'.`);
  }

  const result: ToggleResult = { lines: [...lines] };
  result.lines[lineNumber] = updatedLine;

  if (nextStatus === 'completed') {
    const rule = parseRecurrence(updatedLine);
    if (rule) {
      const next = nextOccurrence(updatedLine, rule, today);
      // Reopening and re-completing must not write a second copy of the same
      // future task.
      if (occurrenceAlreadyExists(result.lines[lineNumber - 1], next)) {
        result.recurrence = 'exists';
      } else {
        result.lines.splice(lineNumber, 0, next);
        result.recurrence = 'created';
      }
    } else if (hasRecurrenceMarker(updatedLine)) {
      result.recurrence = 'unsupported';
    }
  }

  return result;
}

/**
 * Move whichever date field places this task on the calendar to newDateStr.
 * Completed tasks are placed by their completion stamp, open tasks by due
 * then scheduled; mirroring eventDateFor keeps a drag from leaving the event
 * where it started.
 */
export function rescheduleLine(
  originalLine: string,
  status: TaskStatus,
  newDateStr: string,
): string {
  if (status === 'completed' && COMPLETION_DATE_FIELD.test(originalLine)) {
    return originalLine.replace(COMPLETION_DATE_FIELD, `$1${newDateStr}`);
  }
  if (DUE_DATE_FIELD.test(originalLine)) {
    return originalLine.replace(DUE_DATE_FIELD, `$1${newDateStr}`);
  }
  if (SCHEDULED_DATE_FIELD.test(originalLine)) {
    return originalLine.replace(SCHEDULED_DATE_FIELD, `$1${newDateStr}`);
  }
  if (COMPLETION_DATE_FIELD.test(originalLine)) {
    return originalLine.replace(COMPLETION_DATE_FIELD, `$1${newDateStr}`);
  }
  throw new Error('No date pattern found to update');
}

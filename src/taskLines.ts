/**
 * Pure helpers for reading and rewriting Tasks-style markdown lines.
 *
 * Deliberately free of any Obsidian import: this module writes to the user's
 * notes, so it needs to be testable in isolation. See taskLines.test.ts.
 */

export type TaskStatus = 'incomplete' | 'inprogress' | 'completed';

export interface RecurrenceRule {
  interval: number;
  unit: 'day' | 'week' | 'month' | 'year' | 'weekday';
  /** Count from the completion date instead of the task's own date. */
  whenDone: boolean;
}

export const TASK_LINE = /^\s*- \[(\s|x|X|\/)\] (.*)/;
export const DUE_DATE = /📅 (\d{4}-\d{2}-\d{2})/;
export const SCHEDULED_DATE = /⏳ (\d{4}-\d{2}-\d{2})/;
export const COMPLETION_DATE = /✅ (\d{4}-\d{2}-\d{2})/;

/** Everything between the recurrence marker and the next date field. */
const RECURRENCE_CLAUSE = /🔁\s*([^📅⏳✅]*)/;

/**
 * The recurrence rules this plugin understands, anchored at both ends.
 *
 * Anchoring is the point: a loose match would read "every week on Monday" as
 * "every week" and schedule the next task on the wrong day. Trailing tags and a
 * block reference are tolerated because they are not part of the rule.
 */
const SUPPORTED_RULE =
  /^every\s+(?:(\d+)\s+)?(weekday|day|week|month|year)s?(?:\s+when\s+done)?(?:\s+#\S+)*(?:\s+\^[A-Za-z0-9-]+)?$/i;

/** Format a date as YYYY-MM-DD in local time, the format the Tasks plugin uses. */
export function stampDate(date: Date): string {
  return new Date(date.getTime() - (date.getTimezoneOffset() * 60000))
    .toISOString().split('T')[0];
}

export function statusOf(checkboxChar: string): TaskStatus {
  if (checkboxChar === 'x' || checkboxChar === 'X') return 'completed';
  if (checkboxChar === '/') return 'inprogress';
  return 'incomplete';
}

/**
 * Which date a task is shown on. A completed task is placed by its completion
 * date, falling back to due and then scheduled for tasks completed elsewhere
 * without a stamp. handleEventDrop mirrors this order so a drag always moves
 * whichever date placed the event; the two must stay in step.
 */
export function eventDateFor(status: TaskStatus, lineContent: string): string | null {
  if (status === 'completed') {
    const completed = lineContent.match(COMPLETION_DATE);
    if (completed) return completed[1];
  }
  return lineContent.match(DUE_DATE)?.[1]
    ?? lineContent.match(SCHEDULED_DATE)?.[1]
    ?? null;
}

/**
 * Add or remove the completion date on a task line. An existing stamp is left
 * alone rather than overwritten, so a date set by the Tasks plugin survives.
 */
export function setCompletionDate(line: string, done: boolean, today: string): string {
  const stamp = /\s*✅ \d{4}-\d{2}-\d{2}/;

  if (!done) return line.replace(stamp, '');
  if (stamp.test(line)) return line;

  // A trailing block reference has to stay last, as it does in Tasks.
  const blockRef = /(\s+\^[A-Za-z0-9-]+)\s*$/;
  const completion = `✅ ${today}`;
  return blockRef.test(line)
    ? line.replace(blockRef, ` ${completion}$1`)
    : `${line.trimEnd()} ${completion}`;
}

/** Whether a line claims to recur at all, supported rule or not. */
export function hasRecurrenceMarker(line: string): boolean {
  return line.includes('🔁');
}

/**
 * Parse a recurrence rule, or return null when the line either does not recur
 * or uses a rule this plugin does not implement. Returning null for an
 * unsupported rule is deliberate: writing a wrongly-dated task into someone's
 * notes is worse than not writing one at all.
 */
export function parseRecurrence(line: string): RecurrenceRule | null {
  const clause = line.match(RECURRENCE_CLAUSE);
  if (!clause) return null;

  const rule = clause[1].trim().match(SUPPORTED_RULE);
  if (!rule) return null;

  return {
    interval: rule[1] ? parseInt(rule[1], 10) : 1,
    unit: rule[2].toLowerCase() as RecurrenceRule['unit'],
    whenDone: /\bwhen\s+done\b/i.test(clause[1]),
  };
}

/** Move a YYYY-MM-DD date forward by one interval of a recurrence rule. */
export function advanceDate(dateStr: string, rule: RecurrenceRule): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day); // Local midnight

  // Clamp to the end of the target month, so "every month" on the 31st gives
  // the 30th rather than rolling into the next month.
  const addMonths = (count: number) => {
    const dayOfMonth = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + count);
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(dayOfMonth, daysInMonth));
  };

  switch (rule.unit) {
    case 'day':
      date.setDate(date.getDate() + rule.interval);
      break;
    case 'week':
      date.setDate(date.getDate() + (7 * rule.interval));
      break;
    case 'weekday': {
      let remaining = rule.interval;
      while (remaining > 0) {
        date.setDate(date.getDate() + 1);
        const dayOfWeek = date.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) remaining--;
      }
      break;
    }
    case 'month':
      addMonths(rule.interval);
      break;
    case 'year':
      addMonths(12 * rule.interval);
      break;
  }

  return stampDate(date);
}

/**
 * Build the next instance of a recurring task from the line just completed:
 * unchecked again, completion date dropped, every date moved forward one
 * interval.
 */
export function nextOccurrence(completedLine: string, rule: RecurrenceRule, today: string): string {
  let next = completedLine.replace(/^(\s*- \[)[\sxX\/](\])/, '$1 $2');
  next = next.replace(/\s*✅ \d{4}-\d{2}-\d{2}/, '');

  const base = rule.whenDone ? today : null;
  for (const emoji of ['📅', '⏳']) {
    next = next.replace(
      new RegExp(`(${emoji} )(\\d{4}-\\d{2}-\\d{2})`),
      (_full, prefix: string, date: string) => `${prefix}${advanceDate(base ?? date, rule)}`
    );
  }

  return next;
}

/**
 * Whether an occurrence is already present next to the task being completed.
 *
 * Reopening a completed recurring task and completing it again would otherwise
 * write a second copy of the same future task.
 */
export function occurrenceAlreadyExists(neighbouringLine: string | undefined, nextLine: string): boolean {
  return neighbouringLine !== undefined && neighbouringLine.trim() === nextLine.trim();
}

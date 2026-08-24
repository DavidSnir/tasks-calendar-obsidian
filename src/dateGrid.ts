/**
 * Pure calendar-grid math: no DOM, no Obsidian imports, fully unit-tested.
 *
 * Dates are 'YYYY-MM-DD' strings in local time, the same convention as
 * taskLines.stampDate.
 */
import { stampDate } from './taskLines.ts';

const DAYS_PER_WEEK = 7;
const WEEKS_PER_MONTH_GRID = 6;

export function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day); // Local midnight
}

export function addDays(dateStr: string, days: number): string {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() + days);
  return stampDate(date);
}

/** 0=Sunday .. 6=Saturday, matching Date#getDay. */
export function dayOfWeek(dateStr: string): number {
  return parseDate(dateStr).getDay();
}

/**
 * ISO 8601 week number: weeks start on Monday, and week 1 is the one holding
 * the year's first Thursday. Used only for display; the year a boundary date
 * belongs to is not tracked separately.
 */
export function isoWeekNumber(dateStr: string): number {
  const date = parseDate(dateStr);
  // Move to this week's Thursday; its week number is the whole week's.
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const firstThursday = new Date(date.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((date.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getDay() + 6) % 7)) /
        7,
    )
  );
}

/**
 * A fixed six-week month grid: every row is a full week starting on
 * firstDayOfWeek, leading and trailing days borrowed from the neighbouring
 * months. The fixed height keeps the layout from jumping between months.
 */
export function monthMatrix(
  year: number,
  monthIndex: number,
  firstDayOfWeek: 0 | 1,
): string[][] {
  const offset =
    (new Date(year, monthIndex, 1).getDay() - firstDayOfWeek + DAYS_PER_WEEK) %
    DAYS_PER_WEEK;

  const rows: string[][] = [];
  for (let week = 0; week < WEEKS_PER_MONTH_GRID; week++) {
    const row: string[] = [];
    for (let day = 0; day < DAYS_PER_WEEK; day++) {
      row.push(
        stampDate(new Date(year, monthIndex, 1 - offset + week * 7 + day)),
      );
    }
    rows.push(row);
  }
  return rows;
}

/** The seven dates of the week containing the anchor, starting at week start. */
export function weekWindow(anchor: string, firstDayOfWeek: 0 | 1): string[] {
  const back = (dayOfWeek(anchor) - firstDayOfWeek + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  const start = addDays(anchor, -back);
  return Array.from({ length: DAYS_PER_WEEK }, (_, i) => addDays(start, i));
}

/** The anchor and the two dates after it, stepping one day at a time. */
export function threeDayWindow(anchor: string): string[] {
  return Array.from({ length: 3 }, (_, i) => addDays(anchor, i));
}

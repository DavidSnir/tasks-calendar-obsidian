/**
 * The hand-rolled day-grid renderer (ADR 0001).
 *
 * Renders month / week / 3-day views as plain DOM with `tc-` classes, styled
 * by styles.css. All date math comes from dateGrid.ts; all task data from
 * taskQuery.ts, so nothing here parses markdown or touches the vault.
 */
import {
  isoWeekNumber,
  monthMatrix,
  parseDate,
  threeDayWindow,
  weekWindow,
} from './dateGrid.ts';
import type { CalendarTask, CellGroup } from './taskQuery.ts';
import {
  HAPTIC_DRAG_START_MS,
  HAPTIC_DROP_MS,
  HAPTIC_TARGET_CHANGE_MS,
  pulse,
} from './haptics.ts';

export type GridRange = 'month' | 'week' | '3day';

/** Dates the grid shows for a view/anchor pair, row-major. */
export function gridDates(
  range: GridRange,
  anchor: string,
  firstDayOfWeek: 0 | 1,
): string[][] {
  if (range === 'month') {
    const d = parseDate(anchor);
    return monthMatrix(d.getFullYear(), d.getMonth(), firstDayOfWeek);
  }
  if (range === 'week') return [weekWindow(anchor, firstDayOfWeek)];
  return [threeDayWindow(anchor)];
}

const TITLE_FORMATS = {
  day: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }),
  dayYear: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  monthYear: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }),
};

/** Human title for the current view, e.g. "August 2026" or "Aug 24 – 30, 2026". */
export function formatTitle(range: GridRange, anchor: string, firstDayOfWeek: 0 | 1): string {
  if (range === 'month') return TITLE_FORMATS.monthYear.format(parseDate(anchor));

  const dates =
    range === 'week'
      ? weekWindow(anchor, firstDayOfWeek)
      : threeDayWindow(anchor);
  return formatDateRange(dates[0], dates[dates.length - 1]);
}

function formatDateRange(start: string, end: string): string {
  const a = parseDate(start);
  const b = parseDate(end);
  const sameMonth = a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  if (sameMonth) {
    return `${TITLE_FORMATS.day.format(a)} \u2013 ${TITLE_FORMATS.dayYear.format(b)}`;
  }
  return `${TITLE_FORMATS.dayYear.format(a)} \u2013 ${TITLE_FORMATS.dayYear.format(b)}`;
}

export interface CalendarGridCallbacks {
  /** A task event was clicked; receives the mouse event for modifiers. */
  onTaskClick(taskId: string, evt: MouseEvent): void;
  /** A file header was clicked; the note at filePath should open. */
  onHeaderClick(filePath: string, evt: MouseEvent): void;
  /** A drag moved a task from one date to another. */
  onTaskDropped(taskId: string, fromDate: string, toDate: string): void;
}

export interface RenderState {
  range: GridRange;
  anchor: string;
  firstDayOfWeek: 0 | 1;
  today: string;
  tasks: Map<string, CalendarTask>;
  cells: Map<string, CellGroup[]>;
}

const WEEKDAY_FMT = new Intl.DateTimeFormat('en-US', { weekday: 'short' });

export class CalendarGrid {
  private root: HTMLElement;
  private detachDrag: () => void;

  constructor(
    container: HTMLElement,
    private callbacks: CalendarGridCallbacks,
  ) {
    this.root = container.createDiv('tc-grid');
    this.root.addEventListener('click', this.handleClick);
    this.detachDrag = attachDragging(this.root, {
      longPressDelay: 300,
      onDragStart: () => this.root.addClass('tc-is-dragging'),
      onDragEnd: () => this.root.removeClass('tc-is-dragging'),
      onDrop: (taskId, fromDate, toDate) => {
        if (toDate && toDate !== fromDate) this.callbacks.onTaskDropped(taskId, fromDate, toDate);
      },
    });
  }

  destroy(): void {
    this.detachDrag();
    this.root.removeEventListener('click', this.handleClick);
    this.root.remove();
  }

  render(state: RenderState): void {
    const rows = gridDates(state.range, state.anchor, state.firstDayOfWeek);
    const showWeekNumbers = state.range !== '3day';
    const anchorMonth = state.anchor.slice(0, 7); // 'YYYY-MM'

    this.root.empty();
    this.root.dataset.range = state.range;

    // Weekday header row.
    const head = this.root.createDiv('tc-head');
    if (showWeekNumbers) head.createDiv('tc-weeknum');
    for (const date of rows[0]) {
      head.createDiv({ cls: 'tc-weekday', text: WEEKDAY_FMT.format(parseDate(date)) });
    }

    // Date rows.
    for (const row of rows) {
      const rowEl = this.root.createDiv('tc-row');
      if (showWeekNumbers) {
        // The middle day always lands in the ISO week that dominates the
        // row, whichever day the week starts on.
        rowEl.createDiv({ cls: 'tc-weeknum', text: String(isoWeekNumber(row[3])) });
      }

      for (const date of row) {
        const cell = rowEl.createDiv('tc-cell');
        cell.dataset.date = date;
        if (date === state.today) cell.addClass('tc-today');
        if (state.range === 'month' && !date.startsWith(anchorMonth)) {
          cell.addClass('tc-other-month');
        }

        cell.createDiv({ cls: 'tc-date-num', text: String(parseDate(date).getDate()) });

        this.renderEvents(cell, date, state);
      }
    }
  }

  private renderEvents(cell: HTMLElement, date: string, state: RenderState): void {
    const eventsEl = cell.createDiv('tc-events');
    const groups = state.cells.get(date);

    for (const group of groups ?? []) {
      const headerEl = eventsEl.createDiv('tc-file-header');
      headerEl.dataset.filePath = group.header.filePath;
      headerEl.textContent = group.header.fileName;
      if (group.header.taskCount > 1) {
        headerEl.createSpan({ cls: 'task-count', text: ` (${group.header.taskCount})` });
      }

      for (const task of group.tasks) {
        const eventEl = eventsEl.createDiv('tc-event');
        eventEl.dataset.taskId = task.id;
        eventEl.addClass(`task-${task.status}`);
        eventEl.createSpan({ cls: 'task-description', text: task.description });
      }
    }
  }

  private handleClick = (evt: MouseEvent) => {
    const target = evt.target as HTMLElement;

    const header = target.closest('.tc-file-header') as HTMLElement | null;
    if (header?.dataset.filePath) {
      this.callbacks.onHeaderClick(header.dataset.filePath, evt);
      return;
    }

    const eventEl = target.closest('.tc-event') as HTMLElement | null;
    if (!eventEl?.dataset.taskId) return;

    // Swallow the click that trails a drop so it cannot toggle status.
    if (eventEl.hasClass('tc-click-suppressed')) {
      eventEl.removeClass('tc-click-suppressed');
      return;
    }
    this.callbacks.onTaskClick(eventEl.dataset.taskId, evt);
  };
}

interface DragOptions {
  longPressDelay: number;
  onDragStart(): void;
  onDragEnd(): void;
  onDrop(taskId: string, fromDate: string, toDate: string | null): void;
}

/**
 * Pointer-based dragging (ADR 0002).
 *
 * Mouse drags start immediately; touch drags wait out a long-press so
 * scrolling still works, and cancel if the finger moves first. A ghost copy
 * follows the pointer and the cell underneath is highlighted. Returns a
 * cleanup function.
 */
function attachDragging(root: HTMLElement, opts: DragOptions): () => void {
  let active: {
    taskId: string;
    origin: HTMLElement;
    fromDate: string;
    ghost: HTMLElement;
    lastTargetDate: string | null;
    /** True once the pointer has genuinely moved; separates drags from taps. */
    moved: boolean;
  } | null = null;
  let pressTimer: number | null = null;
  let startPoint: { x: number; y: number } | null = null;

  const clearCells = () => {
    root.querySelectorAll('.tc-drop-target').forEach((el) => el.removeClass('tc-drop-target'));
  };

  const teardown = (commit: boolean) => {
    if (pressTimer !== null) {
      window.clearTimeout(pressTimer);
      pressTimer = null;
    }
    opts.onDragEnd();
    if (!active) return;

    const { taskId, origin, fromDate, lastTargetDate, moved } = active;
    active.ghost.remove();
    clearCells();
    active = null;
    // Only a real drag suppresses the trailing click; a plain tap or a
    // press-release-in-place must still toggle status.
    if (moved) origin.addClass('tc-click-suppressed');

    if (commit && lastTargetDate && lastTargetDate !== fromDate) {
      pulse(HAPTIC_DROP_MS);
      opts.onDrop(taskId, fromDate, lastTargetDate);
    }
  };

  const moveGhostTo = (x: number, y: number) => {
    active!.ghost.style.left = `${x + 8}px`;
    active!.ghost.style.top = `${y + 8}px`;
  };

  const onPointerMove = (evt: PointerEvent) => {
    if (!active) {
      // Finger moved before the long-press fired: let scrolling happen.
      if (
        pressTimer !== null &&
        startPoint &&
        Math.hypot(evt.clientX - startPoint.x, evt.clientY - startPoint.y) > 10
      ) {
        window.clearTimeout(pressTimer);
        pressTimer = null;
      }
      return;
    }

    if (
      !active.moved &&
      startPoint &&
      Math.hypot(evt.clientX - startPoint.x, evt.clientY - startPoint.y) > 4
    ) {
      active.moved = true;
    }

    evt.preventDefault();
    moveGhostTo(evt.clientX, evt.clientY);

    const cell = document
      .elementFromPoint(evt.clientX, evt.clientY)
      ?.closest('.tc-cell') as HTMLElement | null;
    clearCells();
    if (cell?.dataset.date && cell.dataset.date !== active.fromDate) {
      cell.addClass('tc-drop-target');
    }
    const targetDate = cell?.dataset.date ?? null;
    // One tick per newly highlighted cell, not a continuous buzz.
    if (targetDate !== null && targetDate !== active.lastTargetDate) {
      pulse(HAPTIC_TARGET_CHANGE_MS);
    }
    active.lastTargetDate = targetDate;
  };

  const startDrag = (eventEl: HTMLElement, evt: PointerEvent) => {
    const cell = eventEl.closest('.tc-cell') as HTMLElement | null;
    const taskId = eventEl.dataset.taskId;
    if (!cell?.dataset.date || !taskId || active) return;

    const ghost = eventEl.cloneNode(true) as HTMLElement;
    ghost.addClass('tc-ghost');
    ghost.style.left = `${evt.clientX + 8}px`;
    ghost.style.top = `${evt.clientY + 8}px`;
    document.body.appendChild(ghost);

    active = {
      taskId,
      origin: eventEl,
      fromDate: cell.dataset.date,
      ghost,
      lastTargetDate: null,
      moved: false,
    };
    opts.onDragStart();
    pulse(HAPTIC_DRAG_START_MS);
    onPointerMove(evt);
  };

  const onPointerDown = (evt: PointerEvent) => {
    const eventEl = (evt.target as HTMLElement).closest('.tc-event') as HTMLElement | null;
    if (!eventEl || active) return;
    if (evt.pointerType === 'mouse' && evt.button !== 0) return;

    startPoint = { x: evt.clientX, y: evt.clientY };

    if (evt.pointerType === 'mouse') {
      startDrag(eventEl, evt);
      return;
    }

    // Touch: hold still for the long-press; movement cancels (see above).
    pressTimer = window.setTimeout(() => {
      pressTimer = null;
      startDrag(eventEl, evt);
    }, opts.longPressDelay);
  };

  const onPointerUp = () => {
    // A tap (no drag started) must simply clear the pending long-press.
    teardown(active !== null);
  };

  // The browser can revoke the gesture at any moment (scroll steal, incoming
  // call, notification shade). Cancel means abort: never commit a drop the
  // user did not finish.
  const onPointerCancel = () => {
    teardown(false);
  };

  root.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove, { passive: false });
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerCancel);

  return () => {
    teardown(false);
    root.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerCancel);
  };
}

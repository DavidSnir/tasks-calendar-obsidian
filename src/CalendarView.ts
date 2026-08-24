import { ItemView, WorkspaceLeaf, TFile, Notice, setIcon, Keymap } from "obsidian";
import TasksCalendarPlugin from "../main";
import {
  CalendarGrid,
  formatTitle,
  type GridRange,
} from "./calendarGrid";
import { addDays, parseDate } from "./dateGrid";
import { stampDate, type TaskStatus } from "./taskLines";
import {
  applyOptimisticEdits,
  buildCells,
  parseFileTasks,
  type CalendarTask,
  type OptimisticEdit,
} from "./taskQuery";
import { applyStatusToggle, locateLine, rescheduleLine } from "./taskMutations";
import { CoalescedRunner } from "./singleFlight";

export const CALENDAR_VIEW_TYPE = "tasks-calendar-view";

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  incomplete: 'inprogress',
  inprogress: 'completed',
  completed: 'incomplete',
};

/** How far prev/next steps, per view. The 3-day view moves one day at a time. */
function stepDays(range: GridRange): number {
  return range === 'week' ? 7 : range === '3day' ? 1 : 0;
}

/**
 * Thin shell around three collaborators (ADR 0005):
 *  - CalendarGrid renders whatever model it is handed;
 *  - optimisticEdits overlays not-yet-written user changes so every click or
 *    drop repaints instantly, never waiting for I/O;
 *  - writes run one at a time on a promise chain (notes must never be edited
 *    concurrently), each guarded by locateLine against stale indices;
 *  - full vault rescans are coalesced into at most one trailing pass.
 */
export class CalendarView extends ItemView {
  private plugin: TasksCalendarPlugin;
  private grid: CalendarGrid | null = null;
  private gridContainer: HTMLElement | null = null;
  private navTitleEl: HTMLElement | null = null;

  private range: GridRange = 'month';
  private anchor: string = stampDate(new Date());

  /** Last full scan of the vault; the rendering source of truth between scans. */
  private lastTasks: CalendarTask[] = [];
  /** UI-only edits awaiting their write; cleared whenever a scan lands. */
  private optimisticEdits = new Map<string, OptimisticEdit>();
  private tasksById: Map<string, CalendarTask> = new Map();

  private writeChain: Promise<void> = Promise.resolve();
  private rescan: CoalescedRunner;

  constructor(leaf: WorkspaceLeaf, plugin: TasksCalendarPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.rescan = new CoalescedRunner(() => this.loadAndRender());
  }

  getViewType(): string {
    return CALENDAR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Tasks Calendar";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();

    const navEl = container.createDiv("tasks-calendar-inline-nav");
    this.createInlineNavigation(navEl);

    this.gridContainer = container.createDiv("tasks-calendar-container");
    // Text-direction only: the class scopes RTL styling to task text, it must
    // not mirror the grid layout itself.
    if (this.plugin.settings.enableRtl) {
      this.gridContainer.addClass("tasks-calendar-rtl-enabled");
    }

    this.grid = new CalendarGrid(this.gridContainer, {
      onTaskClick: (taskId) => this.handleTaskClick(taskId),
      onHeaderClick: (filePath, evt) => void this.openHeaderFile(filePath, evt),
      onTaskDropped: (taskId, _fromDate, toDate) =>
        this.handleTaskDrop(taskId, toDate),
    });

    this.setViewLinkActive('month');
    this.rescan.request();
  }

  /** Rebuild everything; used when structural settings change. */
  async reload(): Promise<void> {
    this.grid?.destroy();
    this.grid = null;
    await this.onOpen();
  }

  async onClose(): Promise<void> {
    this.grid?.destroy();
    this.grid = null;
  }

  /** Ask for a fresh vault scan; bursts collapse into one trailing pass. */
  refreshCalendarData(): void {
    this.rescan.request();
  }

  private async loadAndRender(): Promise<void> {
    if (!this.grid || !this.gridContainer) return;

    const files = this.app.vault.getMarkdownFiles();
    const allTasks: CalendarTask[] = [];

    for (const file of files) {
      try {
        const content = await this.app.vault.read(file);
        allTasks.push(...parseFileTasks(file.path, file.basename, content));
      } catch (error) {
        console.error(`Tasks Calendar: failed to read ${file.path}`, error);
      }
    }

    this.lastTasks = allTasks;
    // Disk truth wins over anything still optimistic once a scan lands.
    this.optimisticEdits.clear();
    this.renderFromModel();
  }

  /** Repaint from memory: last scan plus whatever edits are not written yet. */
  private renderFromModel(): void {
    if (!this.grid || !this.gridContainer) return;

    const tasks = applyOptimisticEdits(this.lastTasks, this.optimisticEdits);
    this.tasksById = new Map(tasks.map((task) => [task.id, task]));

    this.grid.render({
      range: this.range,
      anchor: this.anchor,
      firstDayOfWeek: this.plugin.settings.startWeekOnSunday ? 0 : 1,
      today: stampDate(new Date()),
      tasks: this.tasksById,
      cells: buildCells(tasks),
    });
    this.updateNavigationTitle();
  }

  /** Effective status/date of a task: scanned state plus pending UI edits. */
  private clientEffective(
    taskId: string,
  ): { status: TaskStatus; date: string | null } | undefined {
    const task = this.tasksById.get(taskId);
    if (!task) return undefined;
    const edit = this.optimisticEdits.get(taskId) ?? {};
    return {
      status: edit.status ?? task.status,
      date: edit.date !== undefined ? edit.date : task.date,
    };
  }

  // --- Interactions ----------------------------------------------------------

  private handleTaskClick(taskId: string): void {
    const effective = this.clientEffective(taskId);
    if (!effective) return;

    const nextStatus = NEXT_STATUS[effective.status];
    // Completing moves a task onto today (the stamp's placement rule);
    // leaving completed hands placement back to due/scheduled.
    const edit: OptimisticEdit = {
      status: nextStatus,
      date: nextStatus === 'completed' ? stampDate(new Date()) : null,
    };

    this.optimisticEdits.set(taskId, { ...this.optimisticEdits.get(taskId), ...edit });
    this.renderFromModel(); // Instant feedback; never waits on I/O.

    this.writeChain = this.writeChain.then(() =>
      this.writeToggle(taskId, nextStatus),
    );
  }

  private handleTaskDrop(taskId: string, toDate: string): void {
    const effective = this.clientEffective(taskId);
    if (!effective || effective.date === toDate) return;

    this.optimisticEdits.set(taskId, {
      ...this.optimisticEdits.get(taskId),
      date: toDate,
    });
    this.renderFromModel(); // The pill lands in its new cell immediately.

    this.writeChain = this.writeChain.then(() =>
      this.writeReschedule(taskId, effective.status, toDate),
    );
  }

  // --- Serialized writes -----------------------------------------------------

  /**
   * One serialized toggle write. The chain guarantees no other mutation runs
   * concurrently; locateLine re-finds the line in case an earlier write in
   * the same burst (e.g. a recurrence spawn) shifted it.
   */
  private async writeToggle(taskId: string, nextStatus: TaskStatus): Promise<void> {
    const task = this.tasksById.get(taskId);
    if (!task) return;

    try {
      const file = this.requireFile(task.filePath);
      let changed = false;
      let recurrence;
      await this.app.vault.process(file, (data) => {
        const lines = data.split('\n');
        const at = locateLine(lines, task.rawLine, task.lineNumber);
        if (at === null) throw new Error('The task moved within its note.');
        const toggle = applyStatusToggle(lines, at, nextStatus, stampDate(new Date()));
        changed = toggle.changed;
        recurrence = toggle.recurrence;
        return toggle.lines.join('\n');
      });

      if (changed) {
        if (recurrence === 'created') {
          new Notice(`Task completed, next occurrence scheduled in ${file.basename}`);
        } else if (recurrence === 'unsupported') {
          new Notice('Unsupported recurrence rule, no next occurrence was created');
        } else if (nextStatus !== 'inprogress') {
          new Notice(`Task status set to ${nextStatus} in ${file.basename}`);
        }
      }
    } catch (error) {
      console.error('Tasks Calendar: failed to toggle task', error);
      new Notice(`Error toggling task status: ${(error as Error).message}`);
      this.optimisticEdits.delete(taskId); // UI lied; the rescan will correct it.
    }
    this.rescan.request();
  }

  private async writeReschedule(
    taskId: string,
    status: TaskStatus,
    toDate: string,
  ): Promise<void> {
    const task = this.tasksById.get(taskId);
    if (!task) return;

    try {
      const file = this.requireFile(task.filePath);
      await this.app.vault.process(file, (data) => {
        const lines = data.split('\n');
        const at = locateLine(lines, task.rawLine, task.lineNumber);
        if (at === null) throw new Error('The task moved within its note.');
        lines[at] = rescheduleLine(lines[at], status, toDate);
        return lines.join('\n');
      });
      new Notice(`Task moved to ${toDate} in ${file.basename}`);
    } catch (error) {
      console.error('Tasks Calendar: failed to reschedule task', error);
      new Notice(`Error updating task: ${(error as Error).message}`);
      this.optimisticEdits.delete(taskId); // Snap back to where the file says.
    }
    // Re-render from disk so headers, counts and placement stay truthful.
    this.rescan.request();
  }

  private requireFile(filePath: string): TFile {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
      throw new Error(`Could not find file ${filePath}`);
    }
    return file;
  }

  private async openHeaderFile(filePath: string, evt: MouseEvent): Promise<void> {
    let file: TFile;
    try {
      file = this.requireFile(filePath);
    } catch {
      new Notice(`Could not find ${filePath}`);
      return;
    }
    // Honours Obsidian's modifiers: cmd/ctrl-click opens a new tab.
    const newLeaf = Keymap.isModEvent(evt);
    await this.app.workspace.getLeaf(newLeaf).openFile(file);
  }

  // --- Navigation ------------------------------------------------------------

  private createInlineNavigation(navEl: HTMLElement): void {
    const leftControls = navEl.createDiv("nav-controls");

    const prevArrow = leftControls.createSpan("nav-arrow");
    setIcon(prevArrow, "chevron-left");
    prevArrow.title = "Previous";
    prevArrow.addEventListener("click", () => this.step(-1));

    const todayLink = leftControls.createSpan("nav-today");
    todayLink.textContent = "Today";
    todayLink.addEventListener("click", () => {
      this.anchor = stampDate(new Date());
      this.renderFromModel();
    });

    const nextArrow = leftControls.createSpan("nav-arrow");
    setIcon(nextArrow, "chevron-right");
    nextArrow.title = "Next";
    nextArrow.addEventListener("click", () => this.step(1));

    this.navTitleEl = navEl.createDiv("nav-title");

    const rightControls = navEl.createDiv("nav-controls");
    this.createViewLink(rightControls, 'month', "Month");
    rightControls.createSpan({ cls: "nav-separator", text: "\u2022" });
    this.createViewLink(rightControls, 'week', "Week");
    rightControls.createSpan({ cls: "nav-separator", text: "\u2022" });
    this.createViewLink(rightControls, '3day', "3 Day");
  }

  private createViewLink(parent: HTMLElement, range: GridRange, label: string): void {
    const link = parent.createSpan("nav-link");
    link.textContent = label;
    link.dataset.range = range;
    link.addEventListener("click", () => {
      this.range = range;
      this.setViewLinkActive(range);
      this.renderFromModel();
    });
  }

  private setViewLinkActive(range: GridRange): void {
    this.containerEl
      .querySelectorAll('.nav-link[data-range]')
      .forEach((el) => el.toggleClass('active', (el as HTMLElement).dataset.range === range));
  }

  private step(direction: 1 | -1): void {
    if (this.range === 'month') {
      const d = parseDate(this.anchor);
      this.anchor = stampDate(new Date(d.getFullYear(), d.getMonth() + direction, 1));
    } else {
      this.anchor = addDays(this.anchor, stepDays(this.range) * direction);
    }
    this.renderFromModel();
  }

  private updateNavigationTitle(): void {
    if (this.navTitleEl) {
      this.navTitleEl.textContent = formatTitle(
        this.range,
        this.anchor,
        this.plugin.settings.startWeekOnSunday ? 0 : 1,
      );
    }
  }
}

import { ItemView, WorkspaceLeaf, TFile, Notice, setIcon, Keymap } from "obsidian";
import TasksCalendarPlugin from "../main";
import {
  CalendarGrid,
  formatTitle,
  type GridRange,
} from "./calendarGrid";
import { addDays, parseDate } from "./dateGrid";
import { stampDate, type TaskStatus } from "./taskLines";
import { buildCells, parseFileTasks, type CalendarTask } from "./taskQuery";
import { applyStatusToggle, rescheduleLine } from "./taskMutations";

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

export class CalendarView extends ItemView {
  private plugin: TasksCalendarPlugin;
  private grid: CalendarGrid | null = null;
  private gridContainer: HTMLElement | null = null;
  private navTitleEl: HTMLElement | null = null;

  private range: GridRange = 'month';
  private anchor: string = stampDate(new Date());
  private tasksById: Map<string, CalendarTask> = new Map();

  constructor(leaf: WorkspaceLeaf, plugin: TasksCalendarPlugin) {
    super(leaf);
    this.plugin = plugin;
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
      onTaskClick: (taskId) => void this.handleTaskClick(taskId),
      onHeaderClick: (filePath, evt) => void this.openHeaderFile(filePath, evt),
      onTaskDropped: (taskId, _fromDate, toDate) =>
        void this.handleTaskDrop(taskId, toDate),
    });

    this.setViewLinkActive('month');
    await this.refreshCalendarData();
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

  async refreshCalendarData(): Promise<void> {
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

    this.tasksById = new Map(allTasks.map((task) => [task.id, task]));

    this.grid.render({
      range: this.range,
      anchor: this.anchor,
      firstDayOfWeek: this.plugin.settings.startWeekOnSunday ? 0 : 1,
      today: stampDate(new Date()),
      tasks: this.tasksById,
      cells: buildCells(allTasks),
    });
    this.updateNavigationTitle();
  }

  // --- Interactions ----------------------------------------------------------

  private async handleTaskClick(taskId: string): Promise<void> {
    const task = this.tasksById.get(taskId);
    if (!task) return;

    const nextStatus = NEXT_STATUS[task.status];
    const eventEls = this.findEventEls(taskId);
    this.restyleEvents(eventEls, nextStatus);

    try {
      const file = this.requireFile(task.filePath);
      let recurrence;
      await this.app.vault.process(file, (data) => {
        const toggle = applyStatusToggle(
          data.split('\n'),
          task.lineNumber,
          nextStatus,
          stampDate(new Date()),
        );
        recurrence = toggle.recurrence;
        return toggle.lines.join('\n');
      });

      if (recurrence === 'created') {
        new Notice(`Task completed, next occurrence scheduled in ${file.basename}`);
      } else if (recurrence === 'unsupported') {
        new Notice('Unsupported recurrence rule, no next occurrence was created');
      } else {
        new Notice(`Task status set to ${nextStatus} in ${file.basename}`);
      }
      await this.refreshCalendarData();
    } catch (error) {
      console.error('Tasks Calendar: failed to toggle task', error);
      new Notice(`Error toggling task status: ${(error as Error).message}`);
      this.restyleEvents(eventEls, task.status); // Revert the optimistic restyle.
    }
  }

  private findEventEls(taskId: string): NodeListOf<HTMLElement> {
    return this.gridContainer?.querySelectorAll(
      `.tc-event[data-task-id="${CSS.escape(taskId)}"]`,
    ) as NodeListOf<HTMLElement>;
  }

  private restyleEvents(
    els: NodeListOf<HTMLElement> | undefined,
    status: TaskStatus,
  ): void {
    els?.forEach((el) => {
      el.dataset.status = status;
      el.removeClass('task-incomplete', 'task-inprogress', 'task-completed');
      el.addClass(`task-${status}`);
    });
  }

  private async handleTaskDrop(taskId: string, toDate: string): Promise<void> {
    const task = this.tasksById.get(taskId);
    if (!task) return;

    try {
      const file = this.requireFile(task.filePath);
      await this.app.vault.process(file, (data) => {
        const lines = data.split('\n');
        lines[task.lineNumber] = rescheduleLine(lines[task.lineNumber], task.status, toDate);
        return lines.join('\n');
      });
      new Notice(`Task moved to ${toDate} in ${file.basename}`);
    } catch (error) {
      console.error('Tasks Calendar: failed to reschedule task', error);
      new Notice(`Error updating task: ${(error as Error).message}`);
    }
    // Re-render from disk so headers, counts and placement stay truthful.
    await this.refreshCalendarData();
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
      void this.refreshCalendarData();
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
      void this.refreshCalendarData();
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
    void this.refreshCalendarData();
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

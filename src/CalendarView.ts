import { ItemView, WorkspaceLeaf, TFile, Notice } from "obsidian";
import { Calendar, EventDropArg, EventClickArg } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction'; // For drag/drop later
import TasksCalendarPlugin from "../main"; // Import the main plugin class to access settings

export const CALENDAR_VIEW_TYPE = "tasks-calendar-view";

type TaskStatus = 'incomplete' | 'inprogress' | 'completed';

export class CalendarView extends ItemView {
  private calendar: Calendar | null = null;
  private plugin: TasksCalendarPlugin; // Reference to the main plugin

  constructor(leaf: WorkspaceLeaf, plugin: TasksCalendarPlugin) { // Accept plugin instance
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return CALENDAR_VIEW_TYPE;
  }

  getDisplayText() {
    return "Tasks Calendar";
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty(); // Clear previous content

    // Create a div for FullCalendar to mount onto
    const calendarEl = container.createDiv("tasks-calendar-container");

    // Apply RTL class based on settings
    if (this.plugin.settings.enableRtl) {
      calendarEl.classList.add("tasks-calendar-rtl-enabled");
    } else {
      calendarEl.classList.remove("tasks-calendar-rtl-enabled");
    }

    // Determine first day of week based on settings
    const firstDay = this.plugin.settings.startWeekOnSunday ? 0 : 1; // 0=Sunday, 1=Monday

    const taskEvents = await this.loadTasks(); // Initial load

    this.calendar = new Calendar(calendarEl, {
      plugins: [ dayGridPlugin, interactionPlugin ],
      initialView: 'dayGridMonth',
      weekNumbers: true,
      weekNumberCalculation: 'ISO',
      firstDay: firstDay, // Set first day of week
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,dayGridWeek' // Add more views if needed
      },
      editable: true, // Enable dragging
      events: taskEvents, // Set initial events
      eventDrop: (info) => { this.handleEventDrop(info); },
      eventClick: (info) => { this.handleEventClick(info); } // Connect the click handler
    });

    this.calendar.render();

    // Add listener for layout changes to resize calendar
    const layoutChangeHandler = () => {
      if (this.calendar) {
        console.log("Layout changed, updating calendar size.");
        // Use nested requestAnimationFrame for better timing after layout settles
        requestAnimationFrame(() => {
          requestAnimationFrame(() => this.calendar?.updateSize());
        });
      }
    };
    // Register the event handler
    this.app.workspace.on('layout-change', layoutChangeHandler);
    // Register a function to unregister the handler when the view closes
    this.register(() => this.app.workspace.off('layout-change', layoutChangeHandler));
  }

  async refreshCalendarData() {
    console.log("--- Refreshing Calendar Data ---");
    if (!this.calendar) {
      console.log("Calendar not initialized, skipping refresh.");
      return;
    }
    const taskEvents = await this.loadTasks();
    this.calendar.setOption('events', taskEvents); // Update the events
    // Alternatively use: this.calendar.refetchEvents(); if event source is a function/feed
  }

  async loadTasks(): Promise<any[]> {
    // DIAGNOSTIC: Confirm loadTasks is called on refetch
    console.log("--- Executing loadTasks ---"); 

    const files = this.app.vault.getMarkdownFiles();
    console.log("Scanning markdown files:", files.map(f => f.path));

    const allTasks: any[] = [];
    // Simpler regex to capture status and the rest of the line
    const taskRegex = /^\s*- \[(\s|x|X|\/)\] (.*)/;
    // Separate regexes for dates
    const completionDateRegex = /✅ (\d{4}-\d{2}-\d{2})/; 
    const dueDateRegex = /📅 (\d{4}-\d{2}-\d{2})/; 
    const scheduledDateRegex = /⏳ (\d{4}-\d{2}-\d{2})/; 

    const showFileName = this.plugin.settings.showFileName;

    for (const file of files) {
      try {
        // Use read() instead of cachedRead() to ensure fresh data
        const content = await this.app.vault.read(file); 
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const match = line.match(taskRegex);

          if (match) {
            const statusChar = match[1];
            const lineContent = match[2]; // The rest of the line after the checkbox
            const taskId = `${file.path}:${i}`;
            const fileName = file.basename;

            // Determine Status
            let status: TaskStatus = 'incomplete';
            let statusClass = 'task-incomplete';
            let statusEmoji = '❎'; 
            if (statusChar.toLowerCase() === 'x') {
                status = 'completed';
                statusClass = 'task-completed';
                statusEmoji = '✅';
            } else if (statusChar === '/') {
                status = 'inprogress';
                statusClass = 'task-inprogress';
                statusEmoji = '❇️';
            }

            // Determine Event Date based on priority
            let eventDate: string | null = null;
            let description = lineContent;

            // 1. Check for completion date (only if task is completed)
            if (status === 'completed') {
              const completionMatch = lineContent.match(completionDateRegex);
              if (completionMatch) {
                eventDate = completionMatch[1];
                description = description.replace(completionDateRegex, '').trim(); // Clean description
                // console.log(`Using completion date ${eventDate} for task in ${file.path} (Line: ${i+1})`);
              }
            }

            // 2. Check for due date (if eventDate not set)
            if (eventDate === null) {
              const dueMatch = lineContent.match(dueDateRegex);
              if (dueMatch) {
                eventDate = dueMatch[1];
                description = description.replace(dueDateRegex, '').trim(); // Clean description
                // console.log(`Using due date ${eventDate} for task in ${file.path} (Line: ${i+1})`);
              }
            }

            // 3. Check for scheduled date (if eventDate still not set)
            if (eventDate === null) {
              const scheduledMatch = lineContent.match(scheduledDateRegex);
              if (scheduledMatch) {
                eventDate = scheduledMatch[1];
                description = description.replace(scheduledDateRegex, '').trim(); // Clean description
                // console.log(`Using scheduled date ${eventDate} for task in ${file.path} (Line: ${i+1})`);
              }
            }

            // 4. If no relevant date found, skip this task for the calendar
            if (eventDate === null) {
              // console.log(`Skipping task with no calendar date in ${file.path} (Line: ${i+1}): ${lineContent}`);
              continue; 
            }

            // Clean up potential completion date emoji if it wasn't used for date
            description = description.replace(completionDateRegex, '').trim();
            // Append status emoji 
            let eventTitle = `${description} ${statusEmoji}`;

            if (showFileName) {
              eventTitle = `${fileName}\n${eventTitle}`;
            }

            console.log(`Adding task: ${description} (Status: ${status}) on ${eventDate} in ${file.path} (Line: ${i+1})`);

            allTasks.push({
              id: taskId,
              title: eventTitle, 
              start: eventDate, 
              allDay: true,
              extendedProps: {
                filePath: file.path,
                lineNumber: i,
                status: status
              },
              className: statusClass 
            });
          }
        }
      } catch (error) {
        console.error(`Error reading or parsing file ${file.path}:`, error);
      }
    }

    console.log(`Finished scanning. Found ${allTasks.length} tasks with calendar dates.`);
    return allTasks;
  }

  async onClose() {
    if (this.calendar) {
      this.calendar.destroy();
      this.calendar = null;
    }
  }

  // --- Handle Drag and Drop --- 
  async handleEventDrop(info: EventDropArg) {
    const event = info.event;
    const newDate = event.start;
    const oldDate = info.oldEvent.start; // Get the original date for comparison

    if (!newDate) {
      console.error("Event drop info missing new date", info);
      new Notice("Error updating task: Invalid date.");
      info.revert(); // Revert the change in the calendar UI
      return;
    }

    // Format the new date as YYYY-MM-DD
    // FullCalendar's date objects are tricky with timezones, ensure we get the local date
    const newDateStr = new Date(newDate.getTime() - (newDate.getTimezoneOffset() * 60000))
      .toISOString().split('T')[0];
      
    const oldDateStr = oldDate ? new Date(oldDate.getTime() - (oldDate.getTimezoneOffset() * 60000))
      .toISOString().split('T')[0] : null;

    // Prevent update if the date hasn't actually changed (avoids unnecessary file processing)
    if (newDateStr === oldDateStr) {
        console.log("Date hasn't changed, skipping file update.");
        return;
    }

    console.log(`Event dropped: ID=${event.id}, New Date=${newDateStr}`);

    // Parse ID to get file path and line number
    const idParts = event.id.split(':');
    if (idParts.length !== 2) {
        console.error("Invalid event ID format:", event.id);
        new Notice("Error updating task: Invalid event ID.");
        info.revert();
        return;
    }
    const filePath = idParts[0];
    const lineNumber = parseInt(idParts[1], 10);

    if (isNaN(lineNumber)) {
        console.error("Invalid line number in event ID:", event.id);
        new Notice("Error updating task: Invalid line number.");
        info.revert();
        return;
    }

    // Get the TFile object
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
        console.error("Could not find file:", filePath);
        new Notice(`Error: Could not find file ${filePath}`);
        info.revert();
        return;
    }

    // Process the file to update the date
    try {
        await this.app.vault.process(file, (data) => {
            const lines = data.split('\n');
            if (lineNumber >= lines.length) {
                console.error(`Line number ${lineNumber} out of bounds for file ${filePath}`);
                throw new Error("Line number out of bounds");
            }

            const originalLine = lines[lineNumber];
            console.log("Original line:", originalLine);

            // Use the same regex as in loadTasks to find and replace the date
            // Be careful to only replace the date part
            const taskDateRegex = /(📅 )(\d{4}-\d{2}-\d{2})/; 
            const updatedLine = originalLine.replace(taskDateRegex, `$1${newDateStr}`);

            if (originalLine === updatedLine) {
                // This might happen if the regex didn't match as expected 
                // or if the date was already correct (though we check earlier)
                console.warn("Line content did not change after replacement attempt.", originalLine);
                // Decide if you want to throw an error or just proceed silently
                // throw new Error("Failed to update date in line"); 
            }

            console.log("Updated line:", updatedLine);
            lines[lineNumber] = updatedLine;
            return lines.join('\n');
        });

        new Notice(`Task date updated in ${file.basename}`);
        // Optional: Maybe refresh the calendar view if needed, although FullCalendar
        // usually updates the dragged event correctly on its own.
        // this.calendar?.refetchEvents();

    } catch (error) {
        console.error(`Failed to update task in file ${filePath}:`, error);
        new Notice(`Error updating task in ${file.basename}. See console for details.`);
        info.revert(); // Revert the calendar UI change if file update failed
    }
  }

  // --- Handle Task Toggling --- 
  async handleEventClick(info: EventClickArg) {
    const event = info.event;
    const currentStatus: TaskStatus = event.extendedProps.status || 'incomplete'; 
    let nextStatus: TaskStatus;
    let nextStatusChar: string;
    let nextClassName: string;

    // Determine the next state in the cycle
    switch (currentStatus) {
      case 'incomplete':
        nextStatus = 'inprogress';
        nextStatusChar = '/';
        nextClassName = 'task-inprogress';
        break;
      case 'inprogress':
        nextStatus = 'completed';
        nextStatusChar = 'x';
        nextClassName = 'task-completed';
        break;
      case 'completed':
      default: 
        nextStatus = 'incomplete';
        nextStatusChar = ' ';
        nextClassName = 'task-incomplete';
        break;
    }
    
    // Store previous state for potential revert
    const previousStatus = currentStatus;
    const previousClassName = event.classNames.filter(cn => cn.startsWith('task-')).join(' '); // Access classNames property

    // --- Optimistic UI Update --- 
    console.log(`Optimistically updating UI: ID=${event.id}, CurrentStatus=${currentStatus}, NextStatus=${nextStatus}`);
    event.setExtendedProp('status', nextStatus);
    // Remove previous status class and add the new one
    event.setProp('classNames', event.classNames.filter(cn => !cn.startsWith('task-')).concat(nextClassName)); // Access classNames property

    // --- Attempt File Update --- 
    // Parse ID (same as before)
    const idParts = event.id.split(':');
    if (idParts.length !== 2) {
        console.error("Invalid event ID format:", event.id);
        new Notice("Error updating task: Invalid event ID.");
        return;
    }
    const filePath = idParts[0];
    const lineNumber = parseInt(idParts[1], 10);
    if (isNaN(lineNumber)) {
        console.error("Invalid line number in event ID:", event.id);
        new Notice("Error updating task: Invalid line number.");
        return;
    }

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
        console.error("Could not find file:", filePath);
        new Notice(`Error: Could not find file ${filePath}`);
        return;
    }

    try {
        await this.app.vault.process(file, (data) => {
            const lines = data.split('\n');
            if (lineNumber >= lines.length) {
                console.error(`Line number ${lineNumber} out of bounds for file ${filePath}`);
                throw new Error("Line number out of bounds");
            }

            const originalLine = lines[lineNumber];
            const checkboxRegex = /^(\s*- \[)[\sxX\/](\].*)/;
            if (!checkboxRegex.test(originalLine)) {
                console.error("Could not find checkbox pattern in line:", originalLine);
                throw new Error("Checkbox pattern not found in line.");
            }
            
            const updatedLine = originalLine.replace(checkboxRegex, `$1${nextStatusChar}$2`);

            // We still check this, but failure doesn't stop the optimistic UI update
            if (originalLine === updatedLine) {
                console.warn(`Line content did not change when trying to set status to '${nextStatusChar}'. Original:`, originalLine);
                // Throw error to trigger catch block for UI revert
                throw new Error(`Failed to replace status char in line. Expected '${nextStatusChar}'.`); 
            }

            lines[lineNumber] = updatedLine;
            return lines.join('\n');
        });

        new Notice(`Task status set to ${nextStatus} in ${file.basename}`);
        // No refetch needed for optimistic update

    } catch (error) {
        console.error(`Failed to toggle task status in file ${filePath}:`, error);
        new Notice(`Error toggling task status: ${error.message}. Reverting change.`);
        
        // --- Revert Optimistic UI Update --- 
        console.log(`Reverting UI update for event ${event.id}`);
        event.setExtendedProp('status', previousStatus);
        event.setProp('classNames', event.classNames.filter(cn => !cn.startsWith('task-')).concat(previousClassName)); // Access classNames property
    }
  }
} 
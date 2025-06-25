import { ItemView, WorkspaceLeaf, TFile, Notice, setIcon } from "obsidian";
import { Calendar, EventDropArg, EventClickArg } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction'; // For drag/drop later
import TasksCalendarPlugin from "../main"; // Import the main plugin class to access settings

export const CALENDAR_VIEW_TYPE = "tasks-calendar-view";

type TaskStatus = 'incomplete' | 'inprogress' | 'completed';

export class CalendarView extends ItemView {
  private calendar: Calendar | null = null;
  private plugin: TasksCalendarPlugin; // Reference to the main plugin
  private navTitleEl: HTMLElement | null = null; // Reference to navigation title element

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

    // Create custom inline navigation first
    const navEl = container.createDiv("tasks-calendar-inline-nav");
    this.createInlineNavigation(navEl);

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
      headerToolbar: false, // Disable default toolbar
      editable: true, // Enable dragging
      droppable: true, // Enable drop zone
      dragScroll: false, // Disable auto-scroll to reduce positioning issues
      eventStartEditable: true, // Allow dragging events to change start date
      eventDurationEditable: false, // Prevent resizing events
      longPressDelay: 300, // Shorter delay for touch devices
      eventOverlap: true, // Allow events to overlap
      snapDuration: '1 day', // Snap to day boundaries
      dragRevertDuration: 200, // Faster revert animation
      events: taskEvents, // Set initial events
      eventDrop: (info) => { this.handleEventDrop(info); },
      eventClick: (info) => { this.handleEventClick(info); }, // Connect the click handler
      datesSet: (info) => { this.updateNavigationTitle(info); }, // Update title when view changes
      
      // Enhanced drag mirror positioning
      eventDidMount: (info) => {
        this.setupCustomDragBehavior(info.el);
      }
    });

    this.calendar.render();

    // Force sizing after render to prevent initial collapse
    setTimeout(() => {
      if (this.calendar) {
        const container = calendarEl;
        container.style.minHeight = '600px';
        container.style.height = 'auto';
        container.style.width = '100%';
        container.style.minWidth = '400px';
        container.style.maxWidth = '100%';
        
        const fcElement = container.querySelector('.fc') as HTMLElement;
        if (fcElement) {
          fcElement.style.minHeight = '550px';
          fcElement.style.height = 'auto';
          fcElement.style.width = '100%';
          fcElement.style.minWidth = '350px';
        }
        
        this.calendar.updateSize();
        console.log("Forced sizing after initial render");
      }
    }, 50);

    // Add listener for layout changes to resize calendar
    const layoutChangeHandler = () => {
      if (this.calendar) {
        console.log("Layout changed, updating calendar size.");
        // Use nested requestAnimationFrame for better timing after layout settles
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (this.calendar) {
              // Ensure container has proper dimensions before updating size
              const container = this.containerEl.querySelector('.tasks-calendar-container') as HTMLElement;
              if (container) {
                // Force proper minimum dimensions regardless of current size
                container.style.minHeight = '600px';
                container.style.height = 'auto';
                container.style.width = '100%';
                container.style.minWidth = '400px';
                container.style.maxWidth = '100%';
                container.style.flexGrow = '1';
                container.style.flexShrink = '0';
                
                // Also ensure FullCalendar's internal elements maintain size
                const fcElement = container.querySelector('.fc') as HTMLElement;
                if (fcElement) {
                  fcElement.style.minHeight = '550px';
                  fcElement.style.height = 'auto';
                  fcElement.style.width = '100%';
                  fcElement.style.minWidth = '350px';
                }
                
                console.log(`Container dimensions after forced sizing: W=${container.offsetWidth}, H=${container.offsetHeight}`);
              }
              this.calendar.updateSize();
            }
          });
        });
      }
    };
    // Register the event handler
    this.app.workspace.on('layout-change', layoutChangeHandler);
    // Register a function to unregister the handler when the view closes
    this.register(() => this.app.workspace.off('layout-change', layoutChangeHandler));
  }

  async onShow() {
    // When the view is shown (e.g., tab is switched to),
    // tell FullCalendar to update its size.
    // This is crucial if the container was hidden or had zero dimensions.
    if (this.calendar && this.containerEl) {
      // Using requestAnimationFrame to ensure the DOM is ready for measurements
      requestAnimationFrame(() => {
        // Adding a small delay to allow the UI to fully settle
        setTimeout(() => {
          if (this.calendar) { // Re-check calendar instance
            const calendarGuiContainer = this.containerEl.querySelector('.tasks-calendar-container') as HTMLElement;
            if (calendarGuiContainer) {
              console.log(`CalendarView.onShow(): Container dimensions before updateSize: W=${calendarGuiContainer.clientWidth}, H=${calendarGuiContainer.clientHeight}`);
              // Force proper dimensions on show
              calendarGuiContainer.style.minHeight = '600px';
              calendarGuiContainer.style.height = 'auto';
              calendarGuiContainer.style.width = '100%';
              calendarGuiContainer.style.minWidth = '400px';
              calendarGuiContainer.style.maxWidth = '100%';
              
              // Also ensure FullCalendar's internal elements maintain size
              const fcElement = calendarGuiContainer.querySelector('.fc') as HTMLElement;
              if (fcElement) {
                fcElement.style.minHeight = '550px';
                fcElement.style.height = 'auto';
                fcElement.style.width = '100%';
                fcElement.style.minWidth = '350px';
              }
            } else {
              console.log("CalendarView.onShow(): tasks-calendar-container not found!");
            }
            this.calendar.updateSize();
            console.log("CalendarView.onShow(): Called updateSize() after timeout");
          }
        }, 100); // 100ms delay, can be adjusted
      });
    }
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
    
    // Additional patterns to clean from task descriptions
    const recurringPatterns = [
      /📅 \d{4}-\d{2}-\d{2}/g,           // Due date pattern
      /⏳ \d{4}-\d{2}-\d{2}/g,           // Scheduled date pattern  
      /✅ \d{4}-\d{2}-\d{2}/g,           // Completion date pattern
      /🔁 [^📅⏳✅]*/g,                   // Recurring pattern (🔁 followed by anything until next emoji)
      /every \d+ (day|week|month|year)s?/gi, // "every X days/weeks/months/years"
      /every (day|week|month|year)/gi,    // "every day/week/month/year"
      /📆 [^📅⏳✅]*/g,                   // Calendar emoji patterns
      /🕐 [^📅⏳✅]*/g,                   // Clock emoji patterns
      /⌚ [^📅⏳✅]*/g,                   // Watch emoji patterns
      /🕒 [^📅⏳✅]*/g,                   // Clock emoji patterns
    ]; 

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
                // console.log(`Using completion date ${eventDate} for task in ${file.path} (Line: ${i+1})`);
              }
            }

            // 2. Check for due date (if eventDate not set)
            if (eventDate === null) {
              const dueMatch = lineContent.match(dueDateRegex);
              if (dueMatch) {
                eventDate = dueMatch[1];
                // console.log(`Using due date ${eventDate} for task in ${file.path} (Line: ${i+1})`);
              }
            }

            // 3. Check for scheduled date (if eventDate still not set)
            if (eventDate === null) {
              const scheduledMatch = lineContent.match(scheduledDateRegex);
              if (scheduledMatch) {
                eventDate = scheduledMatch[1];
                // console.log(`Using scheduled date ${eventDate} for task in ${file.path} (Line: ${i+1})`);
              }
            }

            // Clean up description by removing all date and recurring patterns
            recurringPatterns.forEach(pattern => {
              description = description.replace(pattern, '');
            });
            
            // Final cleanup - remove extra spaces and trim
            description = description.replace(/\s+/g, ' ').trim();

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
              // Add arrow between filename and task with RTL support
              const isRTL = this.plugin.settings.enableRtl;
              const arrow = isRTL ? '←' : '→';
              
              // Both LTR and RTL: [filename] [arrow] [task description]
              eventTitle = `${fileName} ${arrow}\n${description} ${statusEmoji}`;
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

  // --- Custom Inline Navigation --- 
  createInlineNavigation(navEl: HTMLElement) {
    // Left controls
    const leftControls = navEl.createDiv("nav-controls");
    
    const prevArrow = leftControls.createSpan("nav-arrow");
    setIcon(prevArrow, "chevron-left");
    prevArrow.title = "Previous month";
    prevArrow.addEventListener('click', () => {
      if (this.calendar) this.calendar.prev();
    });

    const todayLink = leftControls.createSpan("nav-today");
    todayLink.textContent = "Today";
    todayLink.addEventListener('click', () => {
      if (this.calendar) this.calendar.today();
    });

    const nextArrow = leftControls.createSpan("nav-arrow");
    setIcon(nextArrow, "chevron-right");
    nextArrow.title = "Next month";
    nextArrow.addEventListener('click', () => {
      if (this.calendar) this.calendar.next();
    });

    // Center title
    this.navTitleEl = navEl.createDiv("nav-title");
    this.navTitleEl.textContent = "Loading...";

    // Right controls
    const rightControls = navEl.createDiv("nav-controls");
    
    const monthLink = rightControls.createSpan("nav-link active");
    monthLink.textContent = "Month";
    monthLink.addEventListener('click', () => {
      if (this.calendar) {
        this.calendar.changeView('dayGridMonth');
        // Update active state
        monthLink.classList.add('active');
        weekLink.classList.remove('active');
      }
    });

    const separator = rightControls.createSpan("nav-separator");
    separator.textContent = "•";

    const weekLink = rightControls.createSpan("nav-link");
    weekLink.textContent = "Week";
    weekLink.addEventListener('click', () => {
      if (this.calendar) {
        this.calendar.changeView('dayGridWeek');
        // Update active state
        weekLink.classList.add('active');
        monthLink.classList.remove('active');
      }
    });
  }

  updateNavigationTitle(dateInfo: any) {
    if (this.navTitleEl && dateInfo.view) {
      const viewTitle = dateInfo.view.title;
      this.navTitleEl.textContent = viewTitle;
    }
  }

  // Enhanced drag behavior with proper offset calculation
  setupCustomDragBehavior(eventEl: HTMLElement) {
    eventEl.classList.add('tasks-calendar-draggable');
    
    let isDragging = false;
    let dragMirror: HTMLElement | null = null;
    
    // Track drag start
    const handleMouseDown = (e: MouseEvent) => {
      setTimeout(() => {
        dragMirror = document.querySelector('.fc-event-mirror') as HTMLElement;
        if (dragMirror) {
          isDragging = true;
          dragMirror.style.opacity = '0.8';
          dragMirror.style.transform = 'rotate(2deg)';
          
          // Set initial position accounting for container offset
          this.updateDragMirrorPosition(e, dragMirror);
        }
      }, 10);
    };
    
    // Track mouse movement during drag
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && dragMirror) {
        this.updateDragMirrorPosition(e, dragMirror);
      }
    };
    
    // Clean up on drag end
    const handleMouseUp = () => {
      isDragging = false;
      dragMirror = null;
    };
    
    // Add event listeners
    eventEl.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // Store cleanup function
    (eventEl as any).__dragCleanup = () => {
      eventEl.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }
  
  // Helper method to calculate proper drag mirror position
  private updateDragMirrorPosition(e: MouseEvent, dragMirror: HTMLElement) {
    // Get the calendar container's position relative to viewport
    const calendarContainer = this.containerEl.querySelector('.tasks-calendar-container') as HTMLElement;
    if (!calendarContainer) return;
    
    const containerRect = calendarContainer.getBoundingClientRect();
    const viewportOffset = {
      left: containerRect.left,
      top: containerRect.top
    };
    
    // Calculate mouse position relative to the calendar container
    const relativeX = e.clientX - viewportOffset.left;
    const relativeY = e.clientY - viewportOffset.top;
    
    // Position drag mirror relative to the container, not viewport
    // Add small offset so cursor doesn't cover the drag target
    dragMirror.style.left = (containerRect.left + relativeX + 5) + 'px';
    dragMirror.style.top = (containerRect.top + relativeY + 5) + 'px';
    dragMirror.style.position = 'fixed';
    dragMirror.style.pointerEvents = 'none';
    dragMirror.style.zIndex = '99999';
  }
} 
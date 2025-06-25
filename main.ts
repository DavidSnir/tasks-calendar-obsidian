import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from 'obsidian';
import { CalendarView, CALENDAR_VIEW_TYPE } from './src/CalendarView'; // Import the view

// Settings Interface
export interface TasksCalendarSettings {
	mySetting: string;
	showFileName: boolean;
	enableRtl: boolean;
	weekTagPrefix: string; // Add setting for week tag prefix
	startWeekOnSunday: boolean; // Add setting for first day of week
	textDirection: 'ltr' | 'rtl';
}

// Default Settings
export const DEFAULT_SETTINGS: TasksCalendarSettings = {
	mySetting: 'default',
	showFileName: true,
	enableRtl: false,
	weekTagPrefix: '#week',
	startWeekOnSunday: true,
	textDirection: 'ltr'
}

export default class TasksCalendarPlugin extends Plugin {
	settings: TasksCalendarSettings; // Add settings property
	private refreshTimeout: NodeJS.Timeout | null = null; // Add throttling for refresh

	async onload() {
		console.log('Loading Tasks Calendar plugin');

		// Load settings
		await this.loadSettings();

		// Register the Calendar View
		this.registerView(
			CALENDAR_VIEW_TYPE,
			(leaf) => new CalendarView(leaf, this)
		);

		this.addRibbonIcon('calendar-days', 'Tasks Calendar', () => {
			this.activateView();
		});

		// Add command to open the view
		this.addCommand({
			id: 'open-tasks-calendar-view',
			name: 'Open Tasks Calendar',
			callback: () => {
				this.activateView();
			}
		});

		// Add the settings tab
		this.addSettingTab(new TasksCalendarSettingTab(this.app, this));

		// Register vault change listeners to refresh calendar (throttled to avoid conflicts)
		this.registerEvent(this.app.vault.on('modify', (file) => this.handleVaultChange(file)));
		this.registerEvent(this.app.vault.on('create', (file) => this.handleVaultChange(file)));
		this.registerEvent(this.app.vault.on('delete', (file) => this.handleVaultChange(file)));

		this.app.workspace.onLayoutReady(() => {
			// ... existing code ...
		});
	}

	// Helper function to trigger refresh on active calendar views (throttled)
	handleVaultChange(file: any) {
		// Only process markdown files
		if (!file || !file.path || !file.path.endsWith('.md')) {
			return;
		}

		// Only refresh if there are active calendar views (avoid unnecessary processing)
		const activeCalendarViews = this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE);
		if (activeCalendarViews.length === 0) {
			return;
		}

		// Throttle refresh to avoid conflicts with other plugins (especially Dataview)
		if (this.refreshTimeout) {
			clearTimeout(this.refreshTimeout);
		}

		this.refreshTimeout = setTimeout(() => {
			console.log('Tasks Calendar: Refreshing due to vault change in:', file.path);
			
			// Only refresh if views still exist
			this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE).forEach(leaf => {
				if (leaf.view instanceof CalendarView) {
					leaf.view.refreshCalendarData();
				}
			});
			
			this.refreshTimeout = null;
		}, 500); // 500ms delay to avoid conflicts with other plugins
	}

	// Add methods to load/save settings
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView() {
		// Ensure there's only one instance of the view
		this.app.workspace.detachLeavesOfType(CALENDAR_VIEW_TYPE);

		// Get a leaf in the main workspace and set the view
		await this.app.workspace.getLeaf(true).setViewState({
			type: CALENDAR_VIEW_TYPE,
			active: true,
		});

		// Reveal the leaf (make it the active tab)
		this.app.workspace.revealLeaf(
			this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE)[0]
		);
	}

	onunload() {
		console.log('Unloading Tasks Calendar plugin');
		
		// Clear any pending refresh timeouts
		if (this.refreshTimeout) {
			clearTimeout(this.refreshTimeout);
			this.refreshTimeout = null;
		}
		
		// Clean up: Detach all instances of the view when the plugin unloads
		this.app.workspace.detachLeavesOfType(CALENDAR_VIEW_TYPE);
	}

}

// Settings Tab Class
class TasksCalendarSettingTab extends PluginSettingTab {
	plugin: TasksCalendarPlugin;

	constructor(app: App, plugin: TasksCalendarPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Tasks Calendar Settings'});

		new Setting(containerEl)
			.setName('Show file name on events')
			.setDesc('Display the source file name above the task description on the calendar.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showFileName)
				.onChange(async (value) => {
					this.plugin.settings.showFileName = value;
					await this.plugin.saveSettings();
					// TODO: Refresh view or notify user
				}));

		// Add the start week on Sunday toggle
		new Setting(containerEl)
			.setName('Start week on Sunday')
			.setDesc('Display the calendar week starting on Sunday instead of Monday.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.startWeekOnSunday)
				.onChange(async (value) => {
					this.plugin.settings.startWeekOnSunday = value;
					await this.plugin.saveSettings();
					// TODO: Need to trigger a calendar refresh/re-render
				}));

		// Add the week tag prefix setting
		new Setting(containerEl)
			.setName('Week Task Tag Prefix')
			.setDesc('Specify the tag prefix used to identify week-specific tasks (e.g., "#week" for tags like #week2024-W35). Tasks with this tag will not have a due date.')
			.addText(text => text
				.setPlaceholder('#week')
				.setValue(this.plugin.settings.weekTagPrefix)
				.onChange(async (value) => {
					// Basic validation: ensure it starts with # and isn't empty
					let prefix = value.trim();
					if (prefix.length > 0 && !prefix.startsWith('#')) {
						prefix = '#' + prefix;
					}
					if (prefix === '#') { // Don't allow just '#' 
						prefix = DEFAULT_SETTINGS.weekTagPrefix; // Revert to default if invalid
					}
					this.plugin.settings.weekTagPrefix = prefix;
					await this.plugin.saveSettings();
					text.setValue(prefix); // Update display in case we modified it
				}));

		// Add the new RTL toggle setting
		new Setting(containerEl)
			.setName('Enable RTL (Right-to-Left) Layout')
			.setDesc('Render the calendar in RTL mode for languages like Hebrew or Arabic.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableRtl)
				.onChange(async (value) => {
					this.plugin.settings.enableRtl = value;
					this.plugin.settings.textDirection = value ? 'rtl' : 'ltr';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Placeholder Setting')
			.setDesc('This is just a test setting.')
			.addText(text => text
				.setPlaceholder('Enter something')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					console.log('Secret: ' + value);
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
} 
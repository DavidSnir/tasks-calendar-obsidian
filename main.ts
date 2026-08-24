import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { CalendarView, CALENDAR_VIEW_TYPE } from './src/CalendarView';

export interface TasksCalendarSettings {
	showFileName: boolean;
	enableRtl: boolean;
	startWeekOnSunday: boolean;
	textDirection: 'ltr' | 'rtl';
}

export const DEFAULT_SETTINGS: TasksCalendarSettings = {
	showFileName: true,
	enableRtl: false,
	startWeekOnSunday: true,
	textDirection: 'ltr',
};

export default class TasksCalendarPlugin extends Plugin {
	settings: TasksCalendarSettings;
	private refreshTimeout: NodeJS.Timeout | null = null;

	async onload() {
		await this.loadSettings();

		this.registerView(
			CALENDAR_VIEW_TYPE,
			(leaf) => new CalendarView(leaf, this)
		);

		this.addRibbonIcon('calendar-days', 'Tasks Calendar', () => {
			void this.activateView();
		});

		this.addCommand({
			id: 'open-tasks-calendar-view',
			name: 'Open calendar',
			callback: () => {
				void this.activateView();
			}
		});

		this.addSettingTab(new TasksCalendarSettingTab(this.app, this));

		// Refresh open calendars when the vault changes (throttled: editing one
		// note can fire many modify events in quick succession).
		this.registerEvent(this.app.vault.on('modify', (file) => this.handleVaultChange(file)));
		this.registerEvent(this.app.vault.on('create', (file) => this.handleVaultChange(file)));
		this.registerEvent(this.app.vault.on('delete', (file) => this.handleVaultChange(file)));
	}

	handleVaultChange(file: unknown): void {
		const path = (file as { path?: string } | null)?.path;
		if (!path || !path.endsWith('.md')) {
			return;
		}

		if (this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE).length === 0) {
			return;
		}

		if (this.refreshTimeout !== null) {
			clearTimeout(this.refreshTimeout);
		}

		this.refreshTimeout = setTimeout(() => {
			this.refreshTimeout = null;
			for (const leaf of this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE)) {
				if (leaf.view instanceof CalendarView) {
					void leaf.view.refreshCalendarData();
				}
			}
		}, 500);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/** Data-only changes need a re-render; structural ones need a full rebuild. */
	async refreshViews(structural: boolean): Promise<void> {
		for (const leaf of this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE)) {
			if (!(leaf.view instanceof CalendarView)) continue;
			if (structural) {
				await leaf.view.reload();
			} else {
				await leaf.view.refreshCalendarData();
			}
		}
	}

	async activateView() {
		this.app.workspace.detachLeavesOfType(CALENDAR_VIEW_TYPE);

		await this.app.workspace.getLeaf(true).setViewState({
			type: CALENDAR_VIEW_TYPE,
			active: true,
		});

		const leaf = this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE)[0];
		if (leaf) {
			this.app.workspace.revealLeaf(leaf);
		}
	}

	onunload() {
		if (this.refreshTimeout !== null) {
			clearTimeout(this.refreshTimeout);
			this.refreshTimeout = null;
		}
	}
}

class TasksCalendarSettingTab extends PluginSettingTab {
	plugin: TasksCalendarPlugin;

	constructor(app: App, plugin: TasksCalendarPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Tasks Calendar Settings' });

		new Setting(containerEl)
			.setName('Show file name on events')
			.setDesc('Display the source file name above the task description on the calendar.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showFileName).onChange(async (value) => {
					this.plugin.settings.showFileName = value;
					await this.plugin.saveSettings();
					await this.plugin.refreshViews(false);
				})
			);

		new Setting(containerEl)
			.setName('Start week on Sunday')
			.setDesc('Display the calendar week starting on Sunday instead of Monday.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.startWeekOnSunday).onChange(async (value) => {
					this.plugin.settings.startWeekOnSunday = value;
					await this.plugin.saveSettings();
					await this.plugin.refreshViews(true);
				})
			);

		new Setting(containerEl)
			.setName('Enable RTL (right-to-left) layout')
			.setDesc('Render the calendar in RTL mode for languages like Hebrew or Arabic.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableRtl).onChange(async (value) => {
					this.plugin.settings.enableRtl = value;
					this.plugin.settings.textDirection = value ? 'rtl' : 'ltr';
					await this.plugin.saveSettings();
					await this.plugin.refreshViews(true);
				})
			);
	}
}

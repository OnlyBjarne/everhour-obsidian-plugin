import {
	App,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	SuggestModal,
} from "obsidian";
import { requestApi } from "requestApi";
import { Project as EverhourProject, Project, Task, Timer, User } from "types";
// Remember to rename these classes and interfaces!

interface EverhourPluginData {
	apiKey: string;
	reminder: REMINDER_DAYS[];

	// Cache this data for faster loading
	user?: User;
	tasks?: Task[];
	projects?: Project
}

const DEFAULT_SETTINGS: EverhourPluginData = {
	reminder: [],
	apiKey: "",
};

enum REMINDER_DAYS {
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
}

export default class EverhourPlugin extends Plugin {
	settings: EverhourPluginData;
	user: User;

	activeTimer?: Timer | undefined;

	durationInterval?: number;

	async onload() {
		console.time("startup")
		await this.loadSettings();

		this.addSettingTab(new SampleSettingTab(this.app, this));

		const statusbar = document.getElementsByClassName("everhour-status");
		const statusBarItemEl =
			statusbar.length > 0 ? statusbar.item(0) : this.addStatusBarItem();
		statusBarItemEl?.addClass("everhour-status");
		if (!statusBarItemEl || !(statusBarItemEl instanceof HTMLElement))
			throw new Error("Unable to create statusbar");
		if (!this.settings.apiKey) {
			new Notice("Missing apikey in everhour plugin");
			return;
		}


		const projects = getProjects("Neuron", this.settings.apiKey, {});

		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: "everhour-start-tracking",
			name: "Start Time Tracking",
			callback: async () => {
				new StartTimerModal(
					this.app,
					this.settings.apiKey,
					async (value) => {
						this.activeTimer = await startTimer(
							value.id,
							this.settings.apiKey,
						);

						if (this.activeTimer?.status == "active") {
							this.startDurationTracking(statusBarItemEl);
						}
					},
					await getUserTasks(
						(await getUser(this.settings.apiKey, this.settings)).id,
						this.settings.apiKey,
					),
					new Map((await projects).map((project) => [project.id, project])),
				).open();
			},
		});
		this.addCommand({
			id: "everhour-stop-tracking",
			name: "Stop running timer",
			callback: () => {
				stopCurrentRunning(this.settings.apiKey).then(() => {
					statusBarItemEl.setText("No active timers");
					this.stopDurationInterval();
				});
			},
		});
		// This adds a settings tab so the user can configure various aspects of the plugin

		getRunningTimer(this.settings.apiKey).then((res) => {
			this.activeTimer = res;
			if (this.activeTimer?.status == "active") {
				this.startDurationTracking(statusBarItemEl);
			} else {
				statusBarItemEl.setText("No active timer")

			}
		})

		this.registerInterval(
			// Check status of tracking once every minute to make it sync with server
			window.setInterval(async () => {
				this.activeTimer = await getRunningTimer(
					this.settings.apiKey,
				);
				if (this.activeTimer?.status == "active") {
					this.startDurationTracking(statusBarItemEl);
				} else {
					this.activeTimer = undefined;
					this.stopDurationInterval();
					statusBarItemEl.setText("No active timers");
				}
			}, 60 * 1000),
		);
		console.timeEnd("startup")
	}



	onunload() {
		if (this.durationInterval) {
			window.clearInterval(this.durationInterval);
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	startDurationTracking(statusBarItemEl: HTMLElement) {
		this.stopDurationInterval();
		this.durationInterval = window.setInterval(() => {
			if (this.activeTimer?.status != "active") return;
			statusBarItemEl.setText(
				`${this.activeTimer.task.name}: ${duration(
					this.activeTimer.duration++,
				)}`,
			);
		}, 1000);
	}

	stopDurationInterval() {
		if (this.durationInterval) {
			window.clearInterval(this.durationInterval);
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

function duration(time: number) {
	const date = new Date(0);
	date.setSeconds(time);
	return date.toISOString().substring(11, 19);
}

async function getUser(apikey: string, pluginData: EverhourPluginData): Promise<User> {
	if (pluginData.user) {
		return pluginData.user;
	}
	const user = await requestApi("/users/me", apikey);
	pluginData.user = user;
	return user;
}

async function getUserTasks(userId: number, apikey: string) {
	const res = await requestApi(`/users/${userId}/time`, apikey, {
		limit: 20,
	});
	return res.map((e: any) => e.task);
}

async function getTasks(query: string, apikey: string): Promise<Task[]> {
	const res = await requestApi("/tasks/search", apikey, {
		query,
		limit: 30,
		searchInClosed: false,
	});
	return res;
}

async function getRunningTimer(
	apikey: string,
): Promise<Timer> {
	const res: Timer = await requestApi("/timers/current", apikey, {
		status: "active",
	});
	return res;
}

async function startTimer(taskId: string, apiKey: string) {
	const res: Timer = await requestApi(
		"/timers",
		apiKey,
		{
			task: taskId,
		},
		"POST",
	);
	return res;
}

async function stopCurrentRunning(apikey: string) {
	const res: Timer = await requestApi(
		"/timers/current",
		apikey,
		{},
		"DELETE",
	);
	return res;
}

async function getProjects(
	query = "",
	apiKey: string,
	{ limit = 0 },
): Promise<EverhourProject[]> {
	return requestApi("/projects", apiKey, { query, limit });
}

class StartTimerModal extends SuggestModal<Task> {
	timeout = 0;
	apiKey = "";

	selection: Task;

	userTasks: Task[];

	onSelect: (selection: Task) => Task;

	projects: Map<string, EverhourProject> = new Map();

	constructor(
		app: App,
		apikey: string,
		onSelect: (selection: Task) => any,
		userTasks: Task[],
		projects: Map<string, EverhourProject>,
	) {
		super(app);
		this.apiKey = apikey;
		this.userTasks = userTasks;
		this.onSelect = onSelect;
		this.projects = projects;
	}

	getSuggestions(query = ""): Promise<Task[]> | Task[] {
		if (!query) return this.userTasks;
		return getTasks(query, this.apiKey);
	}

	onChooseSuggestion(value: Task, evt: MouseEvent | KeyboardEvent): void {
		this.onSelect(value);
	}

	async renderSuggestion(value: Task, el: HTMLElement): Promise<void> {
		const projectId = value.projects[0];
		const projectName = this.projects.get(projectId)?.name;

		el.createEl("div", { text: value.name });
		el.createEl("small", { text: projectName });
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: EverhourPlugin;

	constructor(app: App, plugin: EverhourPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const desc = document.createDocumentFragment();
		desc.append(
			"Apikey from ",
			desc.createEl("a", {
				href: "https://app.everhour.com/#/account/profile",
				text: "User settings",
			}),
			" page",
		);
		new Setting(containerEl)
			.setName("Api Token")
			.setDesc(desc)
			.addText((text) =>
				text
					.setPlaceholder("Api Token")
					.setValue(this.plugin.settings.apiKey || "")
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value;
						this.plugin.user = await getUser(
							this.plugin.settings.apiKey,
							this.plugin.settings
						);
						if (this.plugin.user?.id) {
							await this.plugin.saveSettings();
							new Notice(
								`Welcome ${this.plugin.user.name ||
								this.plugin.user.email
								}`,
							);
							this.plugin.onload();
						} else {
							const error = this.containerEl.children[1]
								? this.containerEl.children[1]
								: this.containerEl.createDiv();
							error.setText("Unable to authorize");

							// this.containerEl.setText("Unable to authorize");
						}
					}),
			);
	}
}

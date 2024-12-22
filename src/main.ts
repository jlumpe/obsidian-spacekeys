import { App, Plugin, PluginSettingTab, Modal, Notice, Setting } from 'obsidian';

import { CommandGroup, HotkeysModal, makeTestCommands } from "commands";
import { parseCommandsFromMD } from 'parseconfig';


interface MoreSeqHotkeysSettings {
	commandsFile: string | null;
}


const DEFAULT_SETTINGS: MoreSeqHotkeysSettings = {
	commandsFile: null,
};


export default class MoreSeqHotkeysPlugin extends Plugin {
	settings: MoreSeqHotkeysSettings;
	commands: CommandGroup;

	async onload() {
		console.log('Loading MoreSeqHotkeys');

		this.commands = new CommandGroup();

		await this.loadSettings();
		await this.loadCommands(false);

		this.addSettingTab(new MoreSeqHotkeysSettingTab(this.app, this));

		this.registerCommands()
	}

	private registerCommands(): void {
		this.addCommand({
			id: 'leader',
			name: 'Leader',
			callback: () => {
				new HotkeysModal(this.app, this.commands).open();
			},
		});

		this.addCommand({
			id: 'load-keymap',
			name: 'Load Keymap',
			callback: async () => this.loadCommands(true),
		});
	}

	/**
	 * Load commands from file specified in config.
	 * @param notify - Whether to alert the user when loading succeeds/fails.
	 */
	private async loadCommands(notify = false): Promise<void> {
		// const {app} = this;

		function fail(msg: string) {
			console.error(msg);

			if (notify) {
				// const modal = new Modal(app);
				// modal.setContent(msg);
				// modal.open();
				new Notice(msg, 5000);
			}
		}

		const filename = this.settings.commandsFile;

		if (!filename) {
			fail('Command file not set in plugin settings');
			return;
		}

		const file = this.app.vault.getFileByPath(filename);
		if (file === null) {
			fail('File not found: ' + filename);
			return;
		}

		const contents = await this.app.vault.cachedRead(file);
		const result = parseCommandsFromMD(contents);

		if (result.error)
			fail(result.error);

		else if (result.commands) {
			this.commands = result.commands;
			if (notify)
				new Notice('Config file loaded')
		}
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}


class MoreSeqHotkeysSettingTab extends PluginSettingTab {
	plugin: MoreSeqHotkeysPlugin;

	constructor(app: App, plugin: MoreSeqHotkeysPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Config file')
			// .setDesc('It\'s a secret')
			.addText(text => text
				// .setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.commandsFile)
				.onChange(async (value: string) => {
					this.plugin.settings.commandsFile = value.trim() || null;
					await this.plugin.saveSettings();
				}));
	}
}
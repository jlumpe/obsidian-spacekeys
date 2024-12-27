import { App, Plugin, PluginSettingTab, Modal, Notice, Setting } from 'obsidian';

import { CommandGroup, HotkeysModal, FindCommandModal } from "commands";
import { parseKeymapMD, parseKeymapYAML } from 'parseconfig';


interface SpacekeysSettings {
	keymapFile: string | null;
}


const DEFAULT_SETTINGS: SpacekeysSettings = {
	keymapFile: null,
};


export default class SpacekeysPlugin extends Plugin {
	settings: SpacekeysSettings;
	keymap: CommandGroup;

	async onload() {
		console.log('Loading Spacekeys');

		this.registerCommands()

		this.keymap = new CommandGroup();

		await this.loadSettings();
		await this.loadKeymap(false);

		this.addSettingTab(new SpacekeysSettingTab(this.app, this));
	}

	private registerCommands(): void {
		this.addCommand({
			id: 'leader',
			name: 'Leader',
			callback: () => {
				new HotkeysModal(this.app, this.keymap).open();
			},
		});

		this.addCommand({
			id: 'load-keymap',
			name: 'Load Keymap',
			callback: async () => this.loadKeymap(true),
		});

		this.addCommand({
			id: 'find-command',
			name: 'Find command ID',
			callback: () => {
				new FindCommandModal(this.app).open();
			},
		});
	}

	/**
	 * Load keymap from file specified in config.
	 * @param notify - Whether to alert the user when loading succeeds/fails.
	 */
	private async loadKeymap(notify = false): Promise<void> {
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

		const filename = this.settings.keymapFile;

		if (!filename) {
			fail('Keymap file not set in plugin settings');
			return;
		}

		const file = this.app.vault.getFileByPath(filename);
		if (file === null) {
			fail('File not found: ' + filename);
			return;
		}

		console.log('Spacekeys: loading keymap from ' + filename);

		const contents = await this.app.vault.cachedRead(file);
		const result = parseKeymapMD(contents);

		if (result.error)
			fail(result.error);

		else if (result.keymap) {
			this.keymap = result.keymap;
			if (notify)
				new Notice('Key map file loaded')
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


class SpacekeysSettingTab extends PluginSettingTab {
	plugin: SpacekeysPlugin;

	constructor(app: App, plugin: SpacekeysPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Keymap file')
			// .setDesc('It\'s a secret')
			.addText(text => text
				// .setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.keymapFile ?? '')
				.onChange(async (value: string) => {
					this.plugin.settings.keymapFile = value.trim() || null;
					await this.plugin.saveSettings();
				}));
	}
}

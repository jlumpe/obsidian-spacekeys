import { App, Plugin, PluginSettingTab, Modal, Notice, Setting } from 'obsidian';

import { CommandGroup, HotkeysModal, FindCommandModal } from "commands";
import { parseKeymapMD, parseKeymapYAML, ParseError } from 'parseconfig';
import { UserError, userErrorString } from './util';


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

		this.addSettingTab(new SpacekeysSettingTab(this.app, this));

		if (this.settings.keymapFile) {
			await this.loadKeymap().catch((e) => {
				const msg = userErrorString(e);
				console.log(`Spacekeys: failed to load user keymap file ${this.settings.keymapFile}: ${msg}`);
			});
		}
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
			callback: async () => this
				.loadKeymap()
				.then(() => { new Notice('Keymap loaded from file'); })
				.catch((e) => { new Notice('Failed to load keymap: ' + userErrorString(e), 5000); }),
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
	 * Load keymap from file specified in settings.
	 */
	async loadKeymap(): Promise<void> {

		const filename = this.settings.keymapFile;
		let contents: string;

		if (!filename)
			throw new UserError('Keymap file not set in plugin settings');

		const file = this.app.vault.getFileByPath(filename);
		if (file === null)
			throw new UserError('File not found');

		console.log('Spacekeys: loading keymap from ' + filename);

		try {
			contents = await this.app.vault.cachedRead(file);
		} catch (e) {
			console.error(e);
			throw new UserError('Unable to read file', {context: e});
		}

		try {
			this.keymap = parseKeymapMD(contents);
		} catch (e) {
			console.error(e);
			const details = e instanceof ParseError ? e.message : null;
			throw new UserError('Parse error', {details, context: e});
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

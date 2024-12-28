import { App, Plugin, PluginSettingTab, Modal, Notice, Setting } from 'obsidian';

import { CommandGroup, HotkeysModal, FindCommandModal } from "commands";
import { parseKeymapMD, parseKeymapYAML, ParseError } from 'parseconfig';
import { UserError, userErrorString } from './util';

import { INCLUDED_KEYMAPS_YAML } from 'include';


// File format of keymap file in plugin settings
type KeymapFileFormat = 'auto' | 'markdown' | 'yaml';


/**
 * Guess format of keymap file based on file name.
 * @param filename
 * @param settingsFormat - format set in plugin settings. Will use this value if supplied regardless
 *                         of filename, unless it is "auto".
 */
function guessKeymapFileFormat(filename: string, settingsFormat?: KeymapFileFormat): 'markdown' | 'yaml' | null {
	if (settingsFormat && settingsFormat != 'auto')
		return settingsFormat;
	if (/\.ya?ml$/.test(filename))
		return 'yaml';
	if (/\.md$/.test(filename))
		return 'markdown';
	return null;
}


interface SpacekeysSettings {
	keymapFile: string | null;
	keymapFileFormat: KeymapFileFormat;
}


const DEFAULT_SETTINGS: SpacekeysSettings = {
	keymapFile: null,
	keymapFileFormat: 'auto',
};


/**
 * Get a builtin keymap by name.
 */
function getBuiltinKeymap(name: string): CommandGroup | null {
	if (!(name in INCLUDED_KEYMAPS_YAML)) {
		console.error('No builtin keymap named ' + name);
		return null;
	}

	const yaml = INCLUDED_KEYMAPS_YAML[name];

	try {
		return parseKeymapYAML(yaml);
	} catch (e) {
		console.error('Error parsing default keymap ' + name);
		if (e instanceof ParseError)
			console.error(e.message, e.path, e.data);
		else
			console.error(e);
	}

	return null;
}


export default class SpacekeysPlugin extends Plugin {
	settings: SpacekeysSettings;
	keymap: CommandGroup;

	async onload() {
		console.log('Loading Spacekeys');

		this.registerCommands()

		// Load default keymap
		this.keymap = getBuiltinKeymap('default') ?? new CommandGroup();

		await this.loadSettings();

		this.addSettingTab(new SpacekeysSettingTab(this.app, this));

		if (this.settings.keymapFile) {
			await this.loadKeymap(true).catch((e) => {
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
	 * @param ignoreMissing - If true, don't throw error if keymap file missing or not set in config.
	 * @returns - True if loaded successfully, false if ignoremissing=true and missing.
	 * @throws {UserError} - Error with user message if loading fails.
	 */
	async loadKeymap(ignoreMissing = false): Promise<boolean> {

		const filename = this.settings.keymapFile;
		let contents: string;

		if (!filename)
			if (ignoreMissing)
				return false;
			else
				throw new UserError('Keymap file not set in plugin settings');

		// Check file exists
		const file = this.app.vault.getFileByPath(filename);
		if (file === null)
			if (ignoreMissing)
				return false;
			else
				throw new UserError('File not found');

		// Get or guess format (Markdown or YAML)
		const format = guessKeymapFileFormat(filename, this.settings.keymapFileFormat);
		if (format == null)
			throw new UserError('Could not guess format of file from extension')

		console.log('Spacekeys: loading keymap from ' + filename);

		// Read file contents
		try {
			contents = await this.app.vault.cachedRead(file);
		} catch (e) {
			console.error(e);
			throw new UserError('Unable to read file', {context: e});
		}

		// Parse file contents
		try {
			if (format === 'markdown')
				this.keymap = parseKeymapMD(contents);
			else
				this.keymap = parseKeymapYAML(contents);

		} catch (e) {

			console.error(e);
			const details = e instanceof ParseError ? e.message : null;
			throw new UserError('Parse error', {details, context: e});
		}

		return true;
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

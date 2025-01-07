import { App, Plugin, PluginSettingTab, Notice, Setting, normalizePath, TFile, Modal } from 'obsidian';

import { CommandGroup, HotkeysModal, FindCommandModal } from "commands";
import { parseKeymapMD, parseKeymapYAML, ParseError } from 'parseconfig';
import { ConfirmModal, openFile } from 'obsidian-utils';
import { assert, UserError, userErrorString } from './util';
import { INCLUDED_KEYMAPS_YAML, KEYMAP_MARKDOWN_HEADER } from 'include';


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


/**
 * Create Markdown file wrapping keymap YAML with a default header.
 * @param yaml - YAML keymap definition as string.
 */
function makeKeymapMarkdown(yaml: string): string {
	let markdown = KEYMAP_MARKDOWN_HEADER;
	markdown += '```yaml\n';
	markdown += yaml;
	markdown += '\n```\n';
	return markdown;
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

		// Load keymap from file if path set in settings
		// Do this once Obsidian has finished loading, otherwise the file will be falsely reported
		// as missing.
		this.app.workspace.onLayoutReady(() => {
			if (this.settings.keymapFile) {
				this.loadKeymap(true).catch((e) => {
					const msg = userErrorString(e);
					console.log(`Spacekeys: failed to load user keymap file ${this.settings.keymapFile}: ${msg}`);
				});
			}
		});
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
			name: 'Reload Keymap',
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
	 * @param ignoreUnset - If true, don't throw error if keymap file not set in config.
	 * @returns - True if loaded successfully, false if ignoreUnset=true path not set in config.
	 * @throws {UserError} - Error with user message if loading fails.
	 */
	async loadKeymap(ignoreUnset = false): Promise<boolean> {

		const filename = this.settings.keymapFile;
		let contents: string;

		if (!filename)
			if (ignoreUnset)
				return false;
			else
				throw new UserError('Keymap file not set in plugin settings');

		// Check file exists
		const file = this.app.vault.getFileByPath(filename);
		if (file === null)
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
			.setName('Spacekeys keymap file')
			.setDesc('YAML or Markdown file defining a custom keymap (see plugin description).')
			.setHeading()
			.addButton(btn => btn
				.setIcon('refresh-cw')
				.setTooltip('(Re)load keymap from file')
				.onClick(evt => this.loadKeymap())
				.setClass('mod-cta')
			)
			.addButton(btn => btn
				.setIcon('file-plus-2')
				.setTooltip('Create file with default contents')
				.onClick(evt => this.createFile())
			)
			.addButton(btn => btn
				.setIcon('pencil')
				.setTooltip('Open file for editing')
				.onClick(evt => this.openFile())
			)
			.addButton(btn => btn
				.setIcon('external-link')
				.setTooltip('Show file in system explorer')
				.onClick(evt => this.showFile())
			);

		new Setting(containerEl)
			.setName('Path')
			.setDesc('Path to file within your vault, including extension (.md, .yml).')
			.addText(text => text
				.setPlaceholder('spacekeys.md')
				.setValue(this.plugin.settings.keymapFile ?? '')
				.onChange(async (value: string) => {
					value = value.trim();
					this.plugin.settings.keymapFile = value ? normalizePath(value) : null;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Format')
			.setDesc('Force parsing as specified format, or leave on "Auto" to determine based on file extension.')
			.addDropdown(dropdown => dropdown
				.addOptions({
					auto: 'Auto',
					markdown: 'Markdown',
					yaml: 'YAML',
				})
				.setValue(this.plugin.settings.keymapFileFormat)
				.onChange(async (value: string) => {
					this.plugin.settings.keymapFileFormat = value as KeymapFileFormat;
					await this.plugin.saveSettings();
				})
			);
	}

	/**
	 * Attempt to reload the keymap and display a modal with a detailed error message if it fails.
	 */
	private async loadKeymap(): Promise<void> {
		if (!this.plugin.settings.keymapFile) {
			const keymap = getBuiltinKeymap('default');
			assert(keymap);
			this.plugin.keymap = keymap;
			new Notice('Default keymap loaded');
			return;
		}

		try {
			await this.plugin.loadKeymap();
			new Notice('Keymap reloaded');
			return;

		} catch (e) {
			if (!(e instanceof UserError))
				throw e;
			this.showLoadErrorModal(e);
		}
	}

	private showLoadErrorModal(err: UserError): void {
		const modal = new Modal(this.app);
		const content = modal.contentEl.createEl('p', {text: err.message});
		modal.setTitle('Error loading keymap');

		// Display more context if cause was ParseError
		if (err.context instanceof ParseError) {
			const { path } = err.context;

			content.appendText(': ' + err.context.message);

			// In the case of improper YAML content, display location
			if (path) {
				content.appendText(' (at ');
				if (path.length > 0) {
					content.createEl('code', {text: path.join('.')});
					content.appendText(' in');
				} else {
					content.appendText('root element of');
				}
				content.appendText(' YAML content)');
			}
		}

		content.appendText('.');

		new Setting(modal.contentEl)
			.addButton(btn => btn
				.setButtonText('OK')
				.setCta()
				.onClick(evt => modal.close()));

		modal.open();
	}

	/**
	 * Create file with default contents.
	 */
	private async createFile(): Promise<void> {

		const filePath = this.plugin.settings.keymapFile;
		if (!filePath)
			return;

		const format = guessKeymapFileFormat(filePath, this.plugin.settings.keymapFileFormat);
		if (format == null)
			throw new UserError('Could not guess format of file from extension')

		const yaml = INCLUDED_KEYMAPS_YAML.default;
		const content = format === 'markdown' ? makeKeymapMarkdown(yaml) : yaml;

		const file = this.app.vault.getFileByPath(filePath);

		if (file) {
			const modal = new ConfirmModal(this.app, {
				title: 'Keymap file exists',
				message: `The file "${filePath}" exists, overwrite?`,
				yesText: 'Overwrite',
				yesCls: 'mod-warning',
				default: false,
			});
			modal.callback = async (result) => {
				if (!result)
					return;
				await this.app.vault.modify(file, content);
				openFile(this.app, file, {newLeaf: 'tab'});
			};
			modal.open();

		} else {
			// TODO create directory
			const created = await this.app.vault.create(filePath, content);
			openFile(this.app, created, {newLeaf: 'tab'});
		}
	}

	/**
	 * Open the keymap file for editing.
	 */
	private openFile(): void {
		const filePath = this.plugin.settings.keymapFile;
		if (!filePath)
			return;

		const file = this.app.vault.getAbstractFileByPath(filePath);

		if (!(file instanceof TFile)) {
			new Notice('Not a file: ' + filePath);
			return
		}

		const format = guessKeymapFileFormat(filePath, this.plugin.settings.keymapFileFormat);

		// TODO - close settings window
		// TODO - check if file already open, focus to existing tab

		openFile(this.app, file, {newLeaf: format == 'markdown' ? 'tab': false});

		// Alternate to open in external app, but not part of public API
		// (this.app as any).openWithDefaultApp(filePath);
	}

	/**
	 * Show file in system explorer.
	 */
	private showFile(): void {
		const filePath = this.plugin.settings.keymapFile;
		if (!filePath)
			return;

		// Not public API
		(this.app as any).showInFolder(filePath);
	}
}

import { App, Plugin, PluginSettingTab, Notice, Setting, normalizePath, TFile, Modal } from 'obsidian';

import { CommandGroup } from "src/keys";
import { HotkeysModal, FindCommandModal, HotkeysModalSettings, DEFAULT_HOTKEYSMODAL_SETTINGS, KeycodeGeneratorModal } from "src/modals";
import { parseKeymapMD, parseKeymapYAML, ParseError, guessKeymapFileFormat, KeymapFileFormat, makeKeymapMarkdown } from 'src/keymapfile';
import { ConfirmModal, openFile } from 'src/obsidian-utils';
import { assert, UserError, userErrorString, recursiveDefaults } from 'src/util';
import { INCLUDED_KEYMAPS_YAML } from 'src/include';



interface SpacekeysSettings {
	keymapFile: {
		path: string | null,
		format: KeymapFileFormat,
		extend: boolean,
	},
	modal: HotkeysModalSettings,
}


const DEFAULT_SETTINGS: SpacekeysSettings = {
	keymapFile: {
		path: null,
		format: 'auto',
		extend: false,
	},
	modal: DEFAULT_HOTKEYSMODAL_SETTINGS,
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

		// Load keymap from file if path set in settings
		// Do this once Obsidian has finished loading, otherwise the file will be falsely reported
		// as missing.
		this.app.workspace.onLayoutReady(() => {
			if (this.settings.keymapFile.path) {
				this.loadKeymap(true).catch((e) => {
					const msg = userErrorString(e);
					console.log(`Spacekeys: failed to load user keymap file ${this.settings.keymapFile.path}: ${msg}`);
				});
			}
		});
	}

	private registerCommands(): void {
		this.addCommand({
			id: 'leader',
			name: 'Leader',
			callback: () => {
				new HotkeysModal(this.app, this.keymap, this.settings.modal).open();
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

		this.addCommand({
			id: 'get-keycode',
			name: 'Get Key Code',
			callback: () => {
				new KeycodeGeneratorModal(this.app).open();
			},
		});
	}

	onunload() {
	}

	async loadSettings() {
		const loaded = await this.loadData();
		this.settings = loaded === null ? DEFAULT_SETTINGS : recursiveDefaults(loaded, DEFAULT_SETTINGS);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Load keymap from file specified in settings.
	 * @param ignoreUnset - If true, don't throw error if keymap file not set in config.
	 * @returns - True if loaded successfully, false if ignoreUnset=true path not set in config.
	 * @throws {UserError} - Error with user message if loading fails.
	 */
	async loadKeymap(ignoreUnset = false): Promise<boolean> {

		const filename = this.settings.keymapFile.path;
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
		const format = guessKeymapFileFormat(filename, this.settings.keymapFile.format);
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

		// Extend default?
		const parentKeymap = this.settings.keymapFile.extend && getBuiltinKeymap('default') || undefined;

		// Parse file contents
		try {
			if (format === 'markdown')
				this.keymap = parseKeymapMD(contents, parentKeymap);
			else
				this.keymap = parseKeymapYAML(contents, parentKeymap);

		} catch (e) {

			console.error(e);
			const details = e instanceof ParseError ? e.message : null;
			throw new UserError('Parse error', {details, context: e});
		}

		return true;
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

		// Keymap file

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
				.setValue(this.plugin.settings.keymapFile.path ?? '')
				.onChange(async (value: string) => {
					value = value.trim();
					this.plugin.settings.keymapFile.path = value ? normalizePath(value) : null;
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
				.setValue(this.plugin.settings.keymapFile.format)
				.onChange(async (value: string) => {
					this.plugin.settings.keymapFile.format = value as KeymapFileFormat;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('Extend default')
			.setDesc('File extends the default keymap instead of defining a new one.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.keymapFile.extend)
				.onChange(async (value: boolean) => {
					this.plugin.settings.keymapFile.extend = value;
					await this.plugin.saveSettings();
				})
			);

		// Modal behavior

		new Setting(containerEl)
			.setHeading()
			.setName('Behavior');

		new Setting(containerEl)
			.setName('Delay')
			.setDesc('Delay before expanding suggestions modal (milliseconds).')
			.addText(text => text
				.setValue('' + this.plugin.settings.modal.delay)
				.onChange(async (value: string) => {
					const parsed = parseInt(value);
					this.plugin.settings.modal.delay = parsed > 0 ? parsed : 0;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Backspace undoes last keypress')
			.setDesc(
				'Pressing backspace while the leader modal is open undoes the last keypress. ' +
				'You can disable this to assign commands to the backspace key.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.modal.backspaceReverts)
				.onChange(async (value: boolean) => {
					this.plugin.settings.modal.backspaceReverts = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Backspace closes on empty')
			.setDesc('Attempting to undo the last keypress when there is no input closes the leader modal.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.modal.backspaceCloses)
				.onChange(async (value: boolean) => {
					this.plugin.settings.modal.backspaceCloses = value;
					await this.plugin.saveSettings();
				}));

		// Appearance

		new Setting(containerEl)
			.setHeading()
			.setName('Appearance');

		new Setting(containerEl)
			.setName('Dim background')
			.setDesc('Dim the rest of the window when displaying key suggestions.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.modal.dimBackground)
				.onChange(async (value: boolean) => {
					this.plugin.settings.modal.dimBackground = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Shorten command labels')
			.setDesc(
				'Hide the part of the command description before the colon (if any). ' +
				'This is typically redundant. Does not apply to command descriptions set explicitly ' +
				'in the keymap file.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.modal.trimDescriptions)
				.onChange(async (value: boolean) => {
					this.plugin.settings.modal.trimDescriptions = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Show invalid commands')
			.setDesc('Show key sequences with invalid command IDs. This can help with debugging your key map file.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.modal.showInvalid)
				.onChange(async (value: boolean) => {
					this.plugin.settings.modal.showInvalid = value;
					await this.plugin.saveSettings();
				}));
	}

	/**
	 * Attempt to reload the keymap and display a modal with a detailed error message if it fails.
	 */
	private async loadKeymap(): Promise<void> {
		if (!this.plugin.settings.keymapFile.path) {
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

		const filePath = this.plugin.settings.keymapFile.path;
		if (!filePath)
			return;

		const format = guessKeymapFileFormat(filePath, this.plugin.settings.keymapFile.format);
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
		const filePath = this.plugin.settings.keymapFile.path;
		if (!filePath)
			return;

		const file = this.app.vault.getAbstractFileByPath(filePath);

		if (!(file instanceof TFile)) {
			new Notice('Not a file: ' + filePath);
			return
		}

		const format = guessKeymapFileFormat(filePath, this.plugin.settings.keymapFile.format);

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
		const filePath = this.plugin.settings.keymapFile.path;
		if (!filePath)
			return;

		// Not public API
		(this.app as any).showInFolder(filePath);
	}
}

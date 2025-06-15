import {
	App, Plugin, PluginSettingTab, Notice, Setting, normalizePath, TFile, Modal, Scope,
	KeymapContext, KeymapEventHandler, MarkdownView, debounce, EventRef, Command
} from 'obsidian';

import { CommandGroup } from "src/keys";
import { HotkeysModal, FindCommandModal, HotkeysModalSettings, DEFAULT_HOTKEYSMODAL_SETTINGS, KeycodeGeneratorModal } from "src/modals";
import { parseKeymapMD, parseKeymapYAML, KeymapParseError, guessKeymapFileFormat, KeymapFileFormat, makeKeymapMarkdown } from 'src/keymapfile';
import { ConfirmModal, isInserting, openFile } from 'src/obsidian-utils';
import { assert, UserError, recursiveDefaults } from 'src/util';
import { INCLUDED_KEYMAPS_YAML } from 'src/include';
import { debug_log } from 'src/debug';


interface SpacekeysSettings {
	pluginVersion?: string,
	keymapFile: {
		path: string | null,
		format: KeymapFileFormat,
		extend: boolean,
		autoReload: boolean,
	},
	modal: HotkeysModalSettings,
	activateOnSpace: 'disabled' | 'enabled' | 'markdown_only',
}


const DEFAULT_SETTINGS: SpacekeysSettings = {
	keymapFile: {
		path: null,
		format: 'auto',
		extend: false,
		autoReload: false,
	},
	modal: DEFAULT_HOTKEYSMODAL_SETTINGS,
	activateOnSpace: 'disabled',
};


interface TryLoadKeymapOptions {
	allowDefault?: boolean,
	notifySuccess?: boolean,
	onError?: null | 'notice' | 'modal',
}


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
		if (e instanceof KeymapParseError)
			console.error(e.message, e.path, e.data);
		else
			console.error(e);
	}

	return null;
}


export default class SpacekeysPlugin extends Plugin {
	settings: SpacekeysSettings;
	keymap: CommandGroup;
	lastCommand: Command | null = null;
	spaceHandler: KeymapEventHandler | null = null;
	// Event reference for file watcher, used to clean up when unloading the plugin
	private fileWatcher: EventRef | null = null;
	// Debounced reload function to avoid frequent reloading.
	// May not be entirely necessary, file autosaving while editing is already debounced.
	private debouncedReloadKeymap = debounce(
		() => this.tryLoadKeymap(),
		500, // Delay (ms)
		true  // Call after the delay
	);

	async onload() {
		console.log('Loading plugin: Spacekeys');
		debug_log('development build');

		this.registerCommands()

		// Load default keymap
		this.keymap = getBuiltinKeymap('default') ?? new CommandGroup();

		await this.loadSettings();

		this.addSettingTab(new SpacekeysSettingTab(this.app, this));

		this.updateSpaceHandler();

		// Load keymap from file if path set in settings
		// Do this once Obsidian has finished loading, otherwise the file will be falsely reported
		// as missing.
		this.app.workspace.onLayoutReady(() => {
			if (this.settings.keymapFile.path) {
				this.tryLoadKeymap({notifySuccess: false});

				// Set up file watcher
				this.updateFileWatcher();
			}
		});
	}

	onunload() {
		this.updateSpaceHandler(false);
		this.updateFileWatcher(false);
	}

	private registerCommands(): void {
		this.addCommand({
			id: 'leader',
			name: 'Leader',
			callback: () => this.activateLeader(),
		});

		this.addCommand({
			id: 'load-keymap',
			name: 'Reload keymap',
			callback: () => this.tryLoadKeymap({onError: 'modal'}),
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
			name: 'Get key code',
			callback: () => {
				new KeycodeGeneratorModal(this.app).open();
			},
		});

		this.addCommand({
			id: 'repeat-last',
			name: 'Repeat last command',
			callback: () => this.repeatLastCommand(),
		});
	}

	async loadSettings() {
		const loaded = await this.loadData();

		if (loaded === null) {
			// No saved settings
			this.settings = DEFAULT_SETTINGS;
			return;
		}

		// TODO: check loaded.pluginVersion, account for changes in settings format between versions
		this.settings = recursiveDefaults(loaded, DEFAULT_SETTINGS);
	}

	async saveSettings() {
		this.settings.pluginVersion = this.manifest.version;
		await this.saveData(this.settings);

		// Update file watcher
		this.updateFileWatcher();
	}

	/**
	 * Activate the leader modal.
	 */
	activateLeader() {
		new HotkeysModal(this).open();
	}

	/**
	 * Repeat the last command executed by the leader modal.
	 */
	repeatLastCommand() {
		if (!this.lastCommand)
			new Notice('No last command to repeat');
		else if (this.lastCommand.id === 'spacekeys:repeat-last')
			// This shouldn't happen, should have been checked in HotkeysModal
			console.warn('Last command was repeat-last!')
		else
			// @ts-expect-error: not-typed
			this.app.commands.executeCommand(this.lastCommand);
	}

	/**
	 * Check if experimental activate-on-space behavior is enabled in config.
	 */
	isActivateOnSpaceEnabled() : boolean {
		// Explicit check of positive values in case the option wasn't loaded correctly
		const value = this.settings.activateOnSpace;
		return value == 'enabled' || value == 'markdown_only';
	}

	/**
	 * Register or unregister handler func depending on settings.activateOnSpace.
	 */
	updateSpaceHandler(activate: boolean | null = null) {
		activate = activate ?? this.isActivateOnSpaceEnabled();
		// @ts-expect-error: not-typed
		const scope: Scope = this.app.keymap.getRootScope();

		if (activate) {
			if (this.spaceHandler === null) {
				debug_log('Registering space event handler');
				this.spaceHandler = scope.register([], ' ', this.handleSpace.bind(this));
			}
		} else if (this.spaceHandler !== null) {
			debug_log('Unregistering space event handler');
			scope.unregister(this.spaceHandler);
			this.spaceHandler = null;
		}
	}

	/**
	 * Handle space key when "Activate on space" option enabled.
	 *
	 * Note: it's undocumented, but apparently returning true from the scope hander function
	 * means preventDefault() is NOT called on the event.
	 */
	handleSpace(evt: KeyboardEvent, ctx: KeymapContext): boolean {
		if (!this.isActivateOnSpaceEnabled())
			return true;

		const mdview = this.app.workspace.getActiveViewOfType(MarkdownView);

		// Check that the codemirror editing element (.cm-content) is actually focused.
		// This avoids the edge case of editing the inline title element, where mdview will be
		// non-null but we definitely don't want to capture the keypress.
		const isCodeMirror = !!document.activeElement?.closest('div.cm-content');

		if (mdview && isCodeMirror) {
			// In markdown view. This includes reading mode.
			// Prevent if inserting (focused, and in Vim insert mode if applicable).
			if (isInserting(mdview))
				return true;

		} else {
			// Somewhere else

			// Prevent if non-Markdown views disabled in config
			if (this.settings.activateOnSpace == 'markdown_only')
				return true;

			// Can't use getActiveViewOfType() because several view types do not seem to have their
			// classes exposed publicly, have to use deprecated activeLeaf property.
			const activeView = this.app.workspace.activeLeaf?.view.getViewType();

			// Prevent in web viewer leaf, as the below checks don't seem to work well.
			if (activeView === 'webviewer')
				return true;

			// Prevent in canvas view as space+drag is used to scroll.
			if (activeView === 'canvas')
				return true;

			// Prevent if a text input element is focused.
			// This catches case of search sidebar, for example.
			const focused = document.activeElement?.tagName;
			if (focused == 'INPUT' || focused == 'TEXTAREA')
				return true;

			// Some additional input elements do not have input tags, but have the contentEditable
			// attribute. Prevent in this case as well.
			// (Note that this also applies to the Markdown edit area, but we checked that it's not
			// currently focused).
			if (document.activeElement instanceof HTMLElement &&
					document.activeElement.contentEditable == 'true')
				return true;
		}

		// Activate
		this.activateLeader();
		return false;
	}

	/**
	 * Load keymap from file specified in settings.
	 * @throws {UserError} - Error with user message if loading fails.
	 */
	async loadKeymap(): Promise<void> {

		const filename = this.settings.keymapFile.path;
		let contents: string;

		if (!filename)
			throw new UserError('Keymap file not set in plugin settings');

		// Check file exists
		const file = this.app.vault.getFileByPath(filename);
		if (file === null)
			throw new UserError('File not found');

		// Get or guess format (Markdown or YAML)
		const format = guessKeymapFileFormat(filename, this.settings.keymapFile.format);
		if (format == null)
			throw new UserError('Could not guess format of file from extension')

		debug_log('loading keymap from ' + filename);

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
			const details = e instanceof KeymapParseError ? e.message : null;
			throw new UserError('Parse error', {details, context: e});
		}
	}

	/**
	 * Attempt to reload the keymap and optionally display a notice/modal on success/failure.
	 * @param allowDefault - If true, load default keymap if file not set in config. Otherwise fail
	 *     with an error message.
	 * @param notifySuccess - If true, display a notice on success.
	 * @param onError - If 'notice', display a notice on error. If 'modal', show a modal with the
	 *     error message. If null, do not display anything.
	 * @returns {Object} rval
	 * @returns {boolean} rval.loaded - True if user keymap loaded successfully, false if default was used.
	 * @returns {Error} rval.error - Error object if loading failed, null otherwise.
	 */
	async tryLoadKeymap(
		{
			allowDefault = false,
			notifySuccess = true,
			onError = 'notice',
		}: TryLoadKeymapOptions = {},
	): Promise<{loaded: boolean, error: UserError | null}> {

		// If allowDefault is false and path not set, will error in loadKeymap()
		if (!this.settings.keymapFile.path && allowDefault) {
			const keymap = getBuiltinKeymap('default');
			assert(keymap);
			this.keymap = keymap;
			return {loaded: false, error: null};
		}

		try {
			await this.loadKeymap();

		} catch (e) {
			if (!(e instanceof UserError))
				throw e;

			const msg = `Spacekeys: failed to load keymap (${e.message})`;

			console.error(msg);
			if (e.context)
				console.error(e.context);

			if (onError === 'notice')
				new Notice(msg, 5000);
			else if (onError === 'modal')
				this.showLoadErrorModal(e);

			return {loaded: false, error: e};
		}

		if (notifySuccess)
			new Notice('Spacekeys: keymap reloaded');
		return {loaded: true, error: null};
	}

	/**
	 * Show a modal with a detailed error message if loading the keymap fails.
	 * @param err - The error to display.
	 */
	private showLoadErrorModal(err: UserError): void {
		const modal = new Modal(this.app);
		modal.setTitle('Spacekeys: Error loading keymap');
		modal.modalEl.addClass('spacekeys-keymap-error');

		const dl = modal.contentEl.createEl('dl');

		function addItem(name: string, value?: string): HTMLElement {
			dl.createEl('dt', {text: name + ':'});
			let dd = dl.createEl('dd', {text: value ?? ''});
			return dd;
		}

		addItem('Error', err.message);
		addItem('File').createEl('code', {text: this.settings.keymapFile.path ?? '<unset>'});

		// Display more context if cause was KeymapParseError
		if (err.context instanceof KeymapParseError) {
			const { path, cause } = err.context;
			const detailsEl = addItem('Details');

			if (cause) {
				// Wrapped error from Obsidian parseYaml() function.
				// This contains multiline text, including a snipped of the YAML block itself.
				// Format as <pre>.
				detailsEl.createEl('pre', {text: cause.message});

			} else {
				detailsEl.setText(err.context.message);
			}

			if (path !== null) {
				const pathEl = addItem('YAML path');

				if (path)
					pathEl.createEl('code', {text: path.join('.')});
				else
					pathEl.setText('Root element');
			}

		} else if(err.details) {
			// Doesn't currently actually happen without parse error?
			addItem('Details', err.details);
		}

		// OK button
		new Setting(modal.contentEl)
			.addButton(btn => btn
				.setButtonText('OK')
				.setCta()
				.onClick(evt => modal.close()));

		modal.open();
	}

	/**
	 * Update keymap file watcher.
	 */
	private updateFileWatcher(enable?: boolean): void {

		enable ??= this.settings.keymapFile.path && this.settings.keymapFile.autoReload || false;

		if (enable && !this.fileWatcher) {
			debug_log('Registering keymap file watcher');
			// Watch for file modifications
			this.fileWatcher = this.app.vault.on('modify', (file) => {
				// Check if modified file is our keymap file
				if (file.path === this.settings.keymapFile.path) {
					debug_log('Keymap file modified, reloading');
					this.debouncedReloadKeymap();
				}
			});
		}

		if (!enable && this.fileWatcher) {
			// Remove existing watcher
			debug_log('Unregistering keymap file watcher');
			this.app.vault.offref(this.fileWatcher);
			this.fileWatcher = null;
		}
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
				.onClick(evt => this.plugin.tryLoadKeymap({onError: 'modal'}))
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

		new Setting(containerEl)
			.setName('Auto reload')
			.setDesc('Automatically reload keymap when file changed.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.keymapFile.autoReload)
				.onChange(async (value: boolean) => {
					this.plugin.settings.keymapFile.autoReload = value;
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

		// Experimental

		new Setting(containerEl)
			.setHeading()
			.setName('Experimental')
			.setDesc('Features in this section may not work correctly.');

		new Setting(containerEl)
			.setName('Activate on space')
			.setDesc('Activate when pressing spacebar (when not inserting text).')
			.addDropdown(dropdown => dropdown
				.addOptions({
					disabled: 'Disabled',
					enabled: 'Enabled',
					markdown_only: 'Markdown only'
				})
				.setValue(this.plugin.settings.activateOnSpace)
				.onChange(async (value: string) => {
					// @ts-expect-error
					this.plugin.settings.activateOnSpace = value;
					await this.plugin.saveSettings();
					this.plugin.updateSpaceHandler();
				}));
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
		// this.app.openWithDefaultApp(filePath);
	}

	/**
	 * Show file in system explorer.
	 */
	private showFile(): void {
		const filePath = this.plugin.settings.keymapFile.path;
		if (!filePath)
			return;

		// Not public API
		// @ts-expect-error: not-typed
		this.app.showInFolder(filePath);
	}
}

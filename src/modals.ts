import { App, Command, Notice, FuzzySuggestModal, KeymapContext, MarkdownView, Modal, PluginSettingTab, FuzzyMatch } from 'obsidian';

import { KeyPress, KeymapItem, KeymapCommand, KeymapGroup, KeymapFile } from "src/keys";
import { addModalTitle, findFileByName, getCommandById, listCommands, openFile } from 'src/obsidian-utils';
import { unparseKey } from './keymapfile';

import type SpacekeysPlugin from './main';


/* ---------------------------------------------------------------------------------------------- */
/*                                          Hotkeys modal                                         */
/* ---------------------------------------------------------------------------------------------- */


function keySeqBasicRepr(keys: KeyPress[]): string {
	return keys.map(kp => kp.repr()).join(' ');
}


interface CommandSuggestion {
	key: KeyPress;
	item: KeymapItem;
	command: Command | null;
}


export interface HotkeysModalSettings {
	// ms after opening before showing suggestions
	delay: number,
	// ms after closing to execute command
	execDelay: number,
	// Show invalid commands in keymap
	showInvalid: boolean,
	// Backspace key reverts last key press
	backspaceReverts: boolean,
	// Backspace on empty key sequence closes
	backspaceCloses: boolean,
	// Remove part before colon on automatic command descriptions
	trimDescriptions: boolean,
	// Dim background while suggestions are open
	dimBackground: boolean,
}


export const DEFAULT_HOTKEYSMODAL_SETTINGS: HotkeysModalSettings = {
	delay: 500,
	execDelay: 100,
	showInvalid: true,
	backspaceReverts: true,
	backspaceCloses: true,
	trimDescriptions: true,
	dimBackground: true,
};


export class HotkeysModal extends Modal {
	plugin: SpacekeysPlugin;
	commands: KeymapGroup;
	settings: HotkeysModalSettings;

	suggestionsEl: HTMLElement;
	statusEl: HTMLElement;

	keySequence: Array<KeyPress>;

	private isOpen: boolean;
	private isCollapsed: boolean;
	private timeoutHandle: number | null = null;
	// This is already part of Modal but not part of the public API.
	private dimBackground: boolean;

	constructor(plugin: SpacekeysPlugin) {
		super(plugin.app);
		this.plugin = plugin;
		this.commands = plugin.keymap;
		this.settings = Object.assign({}, DEFAULT_HOTKEYSMODAL_SETTINGS, plugin.settings.modal);

		this.containerEl.addClass('spacekeys-modal-container');
		this.modalEl.addClass('spacekeys-modal');

		this.modalEl.empty();
		this.suggestionsEl = this.modalEl.createEl('div', {cls: 'spacekeys-suggestions'});
		this.statusEl = this.modalEl.createEl('div', {cls: 'spacekeys-modal-status'});

		this.isOpen = false;
		this.setCollapsed(true);
		this.dimBackground = this.settings.dimBackground;

		this.keySequence = [];

		this.scope.register(null, null, this.handleKey.bind(this));
	}

	onOpen() {
		super.onOpen();

		this.isOpen = true;

		if (this.settings.delay <= 0)
			this.setCollapsed(false);
		else {
			this.setExpandTimer();
		}

		this.update();
	}

	onClose() {
		super.onClose();

		this.isOpen = false;
		this.clearExpandTimer();
		this.setCollapsed(true);
	}

	/* --------------------------------------- Expand/collapse -------------------------------------- */

	/**
	 * Set the timer to expand the suggestions part of the modal if delay is enabled.
	 * If there is currently a timer in progress, reset it.
	 */
	private setExpandTimer() {
		this.clearExpandTimer();
		if (this.isOpen && this.isCollapsed)
			this.timeoutHandle = window.setTimeout(() => this.delayedExpand(), this.settings.delay);
	}

	/**
	 * Clear the expand timer if set.
	 */
	private clearExpandTimer() {
		if (this.timeoutHandle !== null)
			window.clearTimeout(this.timeoutHandle);
		this.timeoutHandle = null;
	}

	/**
	 * Called when the expand timer completes.
	 */
	private delayedExpand() {
		this.timeoutHandle = null;
		if (this.isOpen)
			this.setCollapsed(false);
	}

	/**
	 * Add/remove collapsed CSS class on modal, which hides the suggestions.
	 *
	 * If the delay is enabled, the collapsed status is set when closed and unset after opening.
	 * If the delay is disabled, this will remove the collapsed status regardless of argument value.
	 */
	private setCollapsed(status: boolean) {
		status = status && (this.settings.delay > 0);
		this.isCollapsed = status;
		this.containerEl.toggleClass('spacekeys-modal-collapsed', status);
	}

	/* --------------------------------- Handle keypresses + update --------------------------------- */

	/**
	 * Handle keypress.
	 */
	handleKey(evt: KeyboardEvent, ctx: KeymapContext) {
		// (Re)set expand timer
		if (this.settings.delay > 0)
			this.setExpandTimer();

		// Handle backspace
		if (this.settings.backspaceReverts && ctx.key == 'Backspace') {
			if (this.settings.backspaceCloses && this.keySequence.length == 0) {
				this.close();
			} else {
				this.keySequence.pop();
				this.update();
			}
			return;
		}

		this.keySequence.push(KeyPress.fromEvent(evt));
		this.update();

		evt.preventDefault();
	}

	/**
	 * Update after current key sequence changed.
	 */
	update() {
		const item = this.commands.find(this.keySequence);

		// Single command, run it
		if (item instanceof KeymapCommand) {
			this.execCommand(item.command_id);
			this.close()
			return;
		}

		// Open file
		if (item instanceof KeymapFile) {
			this.openFile(item.file_path);
			this.close()
			return;
		}

		// No valid selection
		if (item === null) {
			this.invalidKeys();
			this.close();
			return;
		}

		// Otherwise group

		// Update status
		const isEmpty = this.keySequence.length == 0;
		this.statusEl.toggleClass('spacekeys-modal-status-empty', isEmpty);
		this.statusEl.empty();
		if (this.keySequence.length == 0)
			this.statusEl.appendText('<waiting on input>');
		else
			this.statusEl.appendText(keySeqBasicRepr(this.keySequence));

		// Update suggestions
		this.suggestionsEl.empty();

		// Todo: empty command group
		const suggestions = this.getSuggestions(item);
		for (const suggestion of suggestions) {
			const el = this.suggestionsEl.createEl('div');
			this.renderSuggestion(suggestion, el);
		}
	}

	/**
	 * Get list of next suggested keypress based on currently selected command group.
	 * Filters out invalid commands (if !this.showInvalid) and sorts.
	 */
	getSuggestions(group: KeymapGroup): CommandSuggestion[] {

		const suggestions: CommandSuggestion[] = [];

		for (const child of group.children) {
			const suggestion = {
				key: child.key,
				item: child.item,
				command: child.item instanceof KeymapCommand ? getCommandById(this.app, child.item.command_id) : null,
			};
			if (this.settings.showInvalid || !(child.item instanceof KeymapCommand && suggestion.command === null))
				suggestions.push(suggestion);
		}

		suggestions.sort(this.compareSuggestions.bind(this));
		return suggestions;
	}

	/**
	 * Compare two suggestions for sorting.
	 * Sorts groups before commands, then by key according to KeyPress.compare.
	 */
	compareSuggestions(a: CommandSuggestion, b: CommandSuggestion): number {
		const a_group = a.item instanceof KeymapGroup;
		const b_group = b.item instanceof KeymapGroup;
		const a_file = a.item instanceof KeymapFile;
		const b_file = b.item instanceof KeymapFile;

		// Groups first
		if (a_group && !b_group)
			return -1;
		else if (b_group && !a_group)
			return 1;

		// Then files
		if (a_file && !b_file)
			return -1;
		else if (b_file && !a_file)
			return 1;

		// Then by key
		return KeyPress.compare(a.key, b.key);
	}

	/* ------------------------------------------ Rendering ----------------------------------------- */

	renderKey(key: KeyPress, el: HTMLElement) {
		const repr = key.repr(true);
		el.addClass('spacekeys-suggestion-key');
		// el.appendText(repr);
		el.createEl('kbd', {text: repr});
	}

	renderSuggestion(suggestion: CommandSuggestion, el: HTMLElement): void {
		el.addClass('spacekeys-suggestion');

		let description = suggestion.item.description;

		if (suggestion.item instanceof KeymapCommand) {
			// Single command
			el.addClass('spacekeys-command');

			if (suggestion.command) {
				if (suggestion.command.id === 'spacekeys:repeat-last') {
					// Custom formatting for repeat last
					if (this.plugin.lastCommand)
						// Use description of command to be repeated
						description ??= 'Repeat: ' + this.getCommandDescription(this.plugin.lastCommand.name);
					else
						// No last command, style as invalid
						el.addClass('spacekeys-invalid');
				}

				// Regular command, use command's description
				description ??= this.getCommandDescription(suggestion.command.name);
			} else {
				// Command not found
				el.addClass('spacekeys-invalid');
				description ??= suggestion.item.command_id;
			}

		} else if (suggestion.item instanceof KeymapFile) {
			// File reference
			el.addClass('spacekeys-file');
			description ??= `Open: ${suggestion.item.file_path}`;

		} else {
			// Group
			el.addClass('spacekeys-group');
		}

		const keyEl = el.createEl('div');
		this.renderKey(suggestion.key, keyEl);

		el.createEl('div', {cls: 'spacekeys-suggestion-label', text: description ?? '?'});

		el.setAttr('title', description);
	}

	getCommandDescription(cmdname: string): string {
		// Remove part of command name before colon
		if (this.settings.trimDescriptions)
			return /^.+:\s*(.*)/.exec(cmdname)?.[1] ?? cmdname;
		else
			return cmdname;
	}

	/* -------------------------------------- Handle selections ------------------------------------- */

	/**
	 * Try executing the command.
	 */
	execCommand(command_id: string): void {
		const command = getCommandById(this.app, command_id);

		if (command) {

			// Execute the selected command.
			// This is done after a short delay, which should give the model time to close and allow
			// focus to return to the original context (otherwise some commands might not execute).
			window.setTimeout(
				// @ts-expect-error: not-typed
				() => this.app.commands.executeCommand(command),
				this.settings.execDelay,
			);

			// Record as last command executed
			if (command.id !== 'spacekeys:repeat-last')
				this.plugin.lastCommand = command;

		} else {

			// Create notice of invalid command ID
			const id_esc = JSON.stringify(command_id);
			const frag = document.createDocumentFragment();
			frag.appendText('Unknown command: ');
			frag.createEl('code', {text: id_esc});

			new Notice(frag);

			console.error('Invalid command ID: ' + id_esc);
		}
	}


	/**
	 * Create notice of invalid/unassigned key sequence.
	 */
	invalidKeys(): void {
		const keyseq = keySeqBasicRepr(this.keySequence);
		const frag = document.createDocumentFragment();
		frag.appendText('Invalid key sequence: ');
		frag.createEl('code', {text: keyseq});
		new Notice(frag);
	}

	/**
	 * Open file.
	 */
	openFile(file_path: string): void {
		const file = findFileByName(this.app.vault, file_path);
		if (file)
			openFile(this.app, file, { newLeaf: 'tab' });
		else
			new Notice(`File not found: ${file_path}`);
	}
}


/* ---------------------------------------------------------------------------------------------- */
/*                                          Other modals                                          */
/* ---------------------------------------------------------------------------------------------- */


/**
 * Modal for finding command IDs.
 */
export class FindCommandModal extends FuzzySuggestModal<Command> {
	// readonly plugin: SpacekeysPlugin;
	assignedCommands: Record<string, KeyPress[][]>;

	constructor(plugin: SpacekeysPlugin) {
		super(plugin.app);
		// this.plugin = plugin;
		this.assignedCommands = plugin.keymap.assignedCommands();
		this.initContents();

		this.scope.register(['Ctrl'], 'Enter', (evt: KeyboardEvent, ctx: KeymapContext) => {
			// Also not part of the public API
			// @ts-expect-error: not-typed
			this.chooser.useSelectedItem(evt);
		});
	}

	private initContents() {
		this.modalEl.addClass('spacekeys-find-command-modal');

		addModalTitle(this, 'find command', {spacekeys: true});

		this.setInstructions([
			{command: '↵', purpose: 'Copy ID'},
			{command: 'Ctrl + ↵', purpose: 'Insert ID'},
		]);
	}

	getItems(): Command[] {
		return listCommands(this.app);
	}

	getItemText(command: Command): string {
		return command.name + ' ' + command.id;
	}

	renderSuggestion(item: FuzzyMatch<Command>, el: HTMLElement): void {
		// This is the structure of items in the command palette:
		el.addClass('mod-complex');
		const contentEl = el.createEl('div', {cls: 'suggestion-content'});
		const titleEl = contentEl.createEl('span', {cls: 'suggestion-title'});
		const auxEl = el.createEl('div', {cls: 'suggestion-aux'});


		// This adds the text with <span>'s highlighting the matched text
		super.renderSuggestion(item, titleEl);

		// Show key sequences for commands in key map
		if (item.item.id in this.assignedCommands) {
			el.addClass('spacekeys-is-assigned');
			const keyseqs = this.assignedCommands[item.item.id];

			for (let i = 0; i < keyseqs.length; i++) {
				if (i > 0)
					auxEl.appendText(', ');
				const keysEl = auxEl.createEl('kbd', {cls: 'spacekeys-key-sequence'});
				for (let j = 0; j < keyseqs[i].length; j++) {
					if (j > 0)
						keysEl.appendText(' ');
					keysEl.appendText(keyseqs[i][j].repr(true));
				}
			}
		}
	}

	onChooseItem(item: Command, evt: MouseEvent | KeyboardEvent): void {
		if (evt.ctrlKey)
			this.insertCommand(item);
		else
			this.copyCommand(item);
	}

	/**
	 * Copy command ID to clipboard.
	 */
	copyCommand(command: Command) {
		navigator.clipboard.writeText(command.id);
		new Notice('Copied to clipboard: ' + command.id);
	}

	/**
	 * Insert command into active document.
	 */
	insertCommand(command: Command) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view) {
			const editor = view.editor;
			editor.replaceSelection(command.id);
		} else {
			new Notice('No active editor');
		}
	}
}


/**
 * Modal for translating keypresses into keycodes.
 */
export class KeycodeGeneratorModal extends Modal {

	private keycodes: string = '';
	private text: HTMLInputElement;

	constructor(app: App) {
		super(app);
		this.initContents();
		this.scope.register(null, null, this.handleKey.bind(this));
	}

	private initContents() {
		this.setTitle('Spacekeys key code finder');

		const instructions = `
		Enter one or more keypresses to get their key codes.
		Press Esc to close the modal and copy the key codes to the clipboard.
		`;
		this.contentEl.createEl('p', {text: instructions});

		this.text = this.contentEl.createEl('input', {type: 'text'});
		this.text.addClass('spacekeys-key-code-generator');
		this.text.readOnly = true;
	}

	handleKey(evt: KeyboardEvent, ctx: KeymapContext) {
		const kp = KeyPress.fromEvent(evt);
		const code = unparseKey(kp);
		if (this.keycodes)
			this.keycodes += " ";
		this.keycodes += code;
		this.text.value = this.keycodes;

		evt.preventDefault();
	}

	onClose() {
		super.onClose();

		if (this.keycodes) {
			navigator.clipboard.writeText(this.keycodes);
			new Notice('Key code(s) copied to clipboard');
		}
	}
}

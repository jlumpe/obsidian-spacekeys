import { App, Command, Notice, FuzzySuggestModal, KeymapContext, MarkdownView, Modal } from 'obsidian';

import { addModalTitle, getCommandById, listCommands } from './obsidian-utils';


// Space (0x20) thru tilde (0x7F), all printable ASCII symbols
const KEY_REGEXP = /^[ -~\t]$/;


export function checkKey(key: string): boolean {
	return KEY_REGEXP.test(key);
}


const KEY_REPRS: {[key: string]: string} = {
	' ': 'SPC',
	'\t': 'TAB',
};


function reprKey(key: string): string {
	return KEY_REPRS[key] ?? key;
}


export type CommandItem = CommandRef | CommandGroup;


export class CommandRef {
	command_id: string;
	description: string | null;

	constructor(command_id: string, description?: string) {
		this.command_id = command_id;
		this.description = description ?? null;
	}
}


export class CommandGroup {
	description: string | null;
	children: { [key: string]: CommandItem };

	constructor(description?: string) {
		this.description = description ?? null;
		this.children = {};
	}

	isEmpty(): boolean {
		for (const prop in this.children)
			return false;
		return true;
	}

	/* Add child command/group given next key in sequence. */
	addChild<T extends CommandItem>(key: string, item: T): T {
		if (!checkKey(key))
			throw new Error('Invalid key ' + JSON.stringify(key));
		this.children[key] = item;
		return item;
	}

	/**
	 *  Get the item for the given sequence of keys.
	 * @param keys - Sequence of key characters.
	 * @param strict - If we reach a CommandRef before running out of key characters, return null
	 *                 (strict=true) or the CommandRef (strict=false).
	 */
	find(keys: string, strict = false): CommandItem | null {
		let selected: CommandItem = this;
		let child: CommandItem | undefined;

		for (const key of keys) {
			if (selected instanceof CommandRef)
				return strict ? null : selected;

			child = selected.children[key];

			if (child === undefined)
				return null;

			selected = child;
		}

		return selected;
	}
}


interface CommandSuggestion {
	key: string | null;
	item: CommandItem;
	command: Command | null;
}


export class HotkeysModal extends Modal {
	commands: CommandGroup;
	execDelay = 100;
	showInvalid = true;
	// showIds = true;
	backspaceReverts = true;
	backspaceCloses = true;

	suggestionsEl: HTMLElement;
	statusEl: HTMLElement;

	keySequence: Array<string>;

	constructor(app: App, commands: CommandGroup) {
		super(app);
		this.commands = commands;

		this.containerEl.addClass('spacekeys-modal-container');
		this.modalEl.addClass('spacekeys-modal');

		// if (this.commands.isEmpty())
			// this.emptyStateText = 'No keymap defined';

		this.modalEl.empty();
		this.suggestionsEl = this.modalEl.createEl('div', {cls: 'spacekeys-suggestions'});
		this.statusEl = this.modalEl.createEl('div', {cls: 'spacekeys-modal-status'});

		this.keySequence = [];

		this.scope.register(null, null, this.handleKey.bind(this));
	}

	onOpen() {
		super.onOpen();
		this.update();
	}

	/**
	 * Handle keypress.
	 */
	handleKey(evt: KeyboardEvent, ctx: KeymapContext) {

		if (this.backspaceReverts && ctx.key == 'Backspace') {
			if (this.backspaceCloses && this.keySequence.length == 0) {
				this.close();
			} else {
				this.keySequence.pop();
				this.update();
			}
			return;
		}

		this.keySequence.push(evt.key);
		this.update()
	}

	/**
	 * Update after current key sequence changed.
	 */
	update() {
		const item = this.getCommandItem();

		if (item instanceof CommandRef) {
			// Single command, run it
			this.tryExec(item.command_id);
			this.close()
			return;
		}

		// Update status
		let statusText: string;
		if (this.keySequence.length == 0) {
			statusText = '<waiting on input>';
		} else {
			statusText = this.keySequence.map(this.reprKey.bind(this)).join(' ');
		}
		this.statusEl.empty();
		this.statusEl.appendText(statusText);

		// Update suggestions
		this.suggestionsEl.empty();

		if (item === null)
			// No valid selection
			// TODO: error message
			return;

		const suggestions = this.getSuggestions(item);
		for (const suggestion of suggestions) {
			const el = this.suggestionsEl.createEl('div');
			this.renderSuggestion(suggestion, el);
		}
	}

	/**
	 * Get command item for current key sequence.
	 * TODO
	 */
	getCommandItem(): CommandItem | null {

		let text = '';

		for (const key of this.keySequence) {
			if (key == 'Tab')
				text += '\t';
			else
				text += key;
		}

		return this.commands.find(text);
	}

	/**
	 * Make a suggestion object for the given key and command/group
	 */
	makeSuggestion(key: string | null, item: CommandItem): CommandSuggestion {
		return {
			key: key,
			item: item,
			command: item instanceof CommandRef ? getCommandById(this.app, item.command_id) : null,
		};
	}

	getSuggestions(group: CommandGroup): CommandSuggestion[] {

		const suggestions: CommandSuggestion[] = [];

		for (const [key, item] of Object.entries(group.children)) {
			const suggestion = this.makeSuggestion(key, item);
			if (this.showInvalid || !(item instanceof CommandRef && suggestion.command === null))
				suggestions.push(this.makeSuggestion(key, item));
		}

		suggestions.sort(this.compareSuggestions.bind(this));
		return suggestions;
	}

	/**
	 * Compare two suggestions for sorting.
	 * Sorts groups before commands, then by key alphabetically.
	 */
	compareSuggestions(a: CommandSuggestion, b: CommandSuggestion): number {
		const a_group = a.item instanceof CommandGroup;
		const b_group = b.item instanceof CommandGroup;
		if (a_group && !b_group)
			return -1;
		else if (b_group && !a_group)
			return 1;
		else
			return (a.key ?? '').localeCompare(b.key ?? '');
	}

	reprKey(key: string): string {
		// TODO: modifiers
		if (key == ' ')
			return 'SPC';
		return key;
	}

	renderSuggestion(suggestion: CommandSuggestion, el: HTMLElement): void {

		el.addClass('spacekeys-suggestion');

		let description = suggestion.item.description;
		let command_id: string | null = null;

		if (suggestion.item instanceof CommandRef) {
			// Single command
			command_id = suggestion.item.command_id;
			el.addClass('spacekeys-command');
			const command = getCommandById(this.app, command_id);

			if (command) {
				description ??= command.name;
			} else {
				el.addClass('spacekeys-invalid');
				description ??= command_id;
			}

		} else {
			// Group
			el.addClass('spacekeys-group');
		}

		const keyEl = el.createEl('div', {cls: 'spacekeys-suggestion-key'});
		// keyEl.appendText(this.reprKey(kp));
		keyEl.createEl('kbd', {text: this.reprKey(suggestion.key)});

		el.createEl('div', {cls: 'spacekeys-suggestion-label', text: description ?? '?'});

		el.setAttr('title', description);
	}

	/* Try executing the suggestion */
	tryExec(command_id: string): void {
		const command = getCommandById(this.app, command_id);
		if (command)
			this.execCommand(command);
		else
			this.invalidCommand(command_id);
	}

	/* Create notice of invalid command ID */
	invalidCommand(command_id: string): void {
		const id_esc = JSON.stringify(command_id);
		const frag = document.createDocumentFragment();
		frag.appendText('Unknown command: ');
		frag.createEl('code', {text: id_esc});

		new Notice(frag);

		console.error('Invalid command ID: ' + id_esc);
	}

	/**
	 * Execute the selected command.
	 *
	 * This is done after a short delay, which should give the model time to close and allow focus
	 * to return to the original context (otherwise some commands might not execute).
	 */
	execCommand(command: Command): void {
		setTimeout(
			() => (this.app as any).commands.executeCommand(command),
			this.execDelay,
		);
	}
}


/**
 * Modal for finding command IDs.
 */
export class FindCommandModal extends FuzzySuggestModal<Command> {
	constructor(app: App) {
		super(app);

		const title = addModalTitle(this);
		title.createEl('strong', {text: 'Spacekeys'});
		title.appendText(': find command');

		this.setInstructions([
			{command: '↵', purpose: 'Copy ID'},
			{command: 'Ctrl + ↵', purpose: 'Insert ID'},
		]);

		this.scope.register(['Ctrl'], 'Enter', (evt: KeyboardEvent, ctx: KeymapContext) => {
			// Also not part of the public API
			(this as any).chooser.useSelectedItem(evt);
		});
	}

	getItems(): Command[] {
		return listCommands(this.app);
	}

	getItemText(command: Command): string {
		return command.name + ' ' + command.id;
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
		}
	}
}

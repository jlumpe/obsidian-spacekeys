import { App, Command, SuggestModal, Notice, FuzzySuggestModal, KeymapContext, MarkdownView } from 'obsidian';

import { assert } from "./util";
import { getCommandById, listCommands } from './obsidian-utils';


const CSS_PREFIX = 'spacekeys-';


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


/**
 * Add title element to SuggestModal instance.
 */
function addModalTitle(modal: SuggestModal<any>, o: {text?: string, html?: string}): HTMLElement {
	const { modalEl } = modal;
	const el = createEl('div', {cls: CSS_PREFIX + 'modal-title'});
	modalEl.insertBefore(el, modalEl.firstChild);
	if (o.text)
		el.textContent = o.text;
	if (o.html)
		el.innerHTML = o.html;
	return el;
}


interface CommandSuggestion {
	key: string | null;
	item: CommandItem;
	command: Command | null;
}


export class HotkeysModal extends SuggestModal<CommandSuggestion> {
	execDelay = 100;
	showInvalid = true;
	showIds = true;

	constructor(app: App, public commands: CommandGroup) {
		super(app);

		this.modalEl.addClass(CSS_PREFIX + 'modal');
		addModalTitle(this, {html: '<strong>Spacekeys</strong>'});

		if (this.commands.isEmpty())
			this.emptyStateText = 'No keymap defined';

		// Capture tab key as input
		this.scope.register([], 'Tab', (evt, ctx) => {
			console.log('Tab');
			this.addCharToInput('\t');
			return false;  // Prevent default
		});
	}

	/**
	 * Add the given character to the input field and fire the input changed event.
	 */
	addCharToInput(char: string): void {
		this.inputEl.value = this.inputEl.value + char;
		this.inputEl.trigger('input');
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

	getSuggestions(query: string): CommandSuggestion[] {

		const selected = this.commands.find(query);

		if (selected === null)
			// No valid selection
			return [];

		if (selected instanceof CommandRef) {
			// return [this.makeSuggestion(null, selected)];
			// Single command, run it
			this.tryExec(selected.command_id);
			this.close()
			return [];
		}

		const suggestions: CommandSuggestion[] = [];

		for (const [key, item] of Object.entries(selected.children)) {
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

	renderSuggestion(suggestion: CommandSuggestion, el: HTMLElement): void {

		let description = suggestion.item.description;
		let command_id: string | null = null;

		if (suggestion.item instanceof CommandRef) {
			// Single command
			command_id = suggestion.item.command_id;
			el.addClass(CSS_PREFIX + 'command');

			if (suggestion.command) {
				description ??= suggestion.command.name;

			} else {
				el.addClass(CSS_PREFIX + 'invalid');
				description ??= suggestion.item.command_id;
			}

		} else {
			// Group
			el.addClass(CSS_PREFIX + 'group');
		}

		// Copy structure of command palette suggestion items
		el.addClass('mod-complex');
		const keyEl = el.createEl('div', {cls: CSS_PREFIX + 'key'});
		const content = el.createEl('div', {cls: 'suggestion-content'});
		const title = content.createEl('div', {cls: 'suggestion-title'});

		if (suggestion.key)
			keyEl.createEl('kbd', {text: reprKey(suggestion.key)});

		if (description)
			title.createEl('span', {text: description});

		// Add command ID on right
		if (command_id && this.showIds) {
			const aux = el.createEl('div', {cls: 'suggestion-aux'});
			aux.createEl('code', {text: command_id, cls: CSS_PREFIX + 'command-id'});
		}
	}

	// Override this to prevent exiting when a group is selected
	selectSuggestion(value: CommandSuggestion, evt: MouseEvent | KeyboardEvent): void {
		if (value.item instanceof CommandRef)
			super.selectSuggestion(value, evt);
		else {
			// On group selection, just add the key to the input
			assert(value.key);
			this.addCharToInput(value.key);
		}
	}

	onChooseSuggestion(value: CommandSuggestion, evt: MouseEvent | KeyboardEvent): void {
		if (value.item instanceof CommandRef)
			this.tryExec(value.item.command_id)
		else
			// This shouldn't happen
			console.error('group selected');
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

		addModalTitle(this, {html: '<strong>Spacekeys</strong>: find command'});

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

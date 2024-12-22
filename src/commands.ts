import { App, Command, SuggestModal, Notice } from 'obsidian';


const CSS_PREFIX = 'msh-';


/**
 * Get command from app by ID.
 * This doesn't seem to be an officially supported API.
 */
function getCommandById(app: App, id: string): Command | null {
	const result = (app as any).commands.findCommand(id);
	return result ?? null;
}


const KEY_REGEXP = /[a-zA-Z0-9]/;


export function checkKey(key: string): boolean {
	return KEY_REGEXP.test(key);
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


export function makeTestCommands(): CommandGroup {
	const root = new CommandGroup();

	const x = root.addChild('x', new CommandGroup('Text'));
	x.addChild('h', new CommandRef('editor:set-heading'));
	x.addChild('l', new CommandRef('editor:foo'))

	const e = root.addChild('e', new CommandGroup('Editor'));
	e.addChild('l', new CommandRef('editor:insert-link'));

	root.addChild('i', new CommandRef('invalid'));

	return root;
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
		this.modalEl.addClass(CSS_PREFIX + 'modal')
		console.log(this.inputEl);
	}

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

		// TODO sort
		return suggestions;
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
			keyEl.createEl('kbd', {text: suggestion.key});

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
			this.inputEl.value = this.inputEl.value + value.key;
			this.inputEl.trigger('input');
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
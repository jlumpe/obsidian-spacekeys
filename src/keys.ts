// This *should* match any valid key code (case-insensitive).
export const KEYCODE_REGEXP = /.|[a-z]+|f[1-9]|f1[0-2]/i;


const BASIC_REPRS: {[key: string]: string} = {
	' ': 'SPC',
	enter: 'ENT',
	tab: 'TAB',
	backspace: 'BSP',
	arrowup: 'Up',
	arrowdown: 'Down',
	arrowleft: 'Left',
	arrowright: 'Right',
};


const FANCY_REPRS: {[key: string]: string} = {
	' ': '␣',
	enter: '↵',
	tab: '⇥',
	backspace: '⌫',
	arrowup: '↑',
	arrowdown: '↓',
	arrowleft: '←',
	arrowright: '→',
};


/**
 * Whether the shift modifier key should be ignored for the given key code.
 *
 * For many base keys, holding shift changes the reported key code as well as setting the "shiftKey"
 * flag on the KeyboardEvent. This might be confusing in some contexts, but it is actually useful if
 * we want to parse a key press from a user-defined key map file. In that case, it is more natural
 * to use the code "?" instead of "shift + /". However, in this case we need to ignore the shift key
 * modifier when comparing the key press object parsed from user input to the one generated from a
 * JavaScript KeyboardEvent.

 * The heuristic used here is to ignore shift key if the key code is a single character, with the
 * exception of the space key. This is probably correct for US keyboards, no idea about other types.
 *
 * @param key - Key code from KeyboardEvent (case insensitive).
 */
export function shouldIgnoreShift(key: string): boolean {
	return key.length == 1 && key != ' ';
}


export interface KeyModifiers {
	ctrlKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
	metaKey: boolean;
}


/**
 * Represents a single key press, possibly combined with modifiers.
 *
 * Attributes are identical to KeyboardEvent, except:
 * - "key" is normalized to lower case IF it is more than a single character.
 * - "shiftKey" is set to false based on shouldIgnoreShiftKey(key).
 *
 * The changes are to make parsing the correct codes from the keymap definition file easier.
 */
export class KeyPress {
	key: string;
	ctrlKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
	metaKey: boolean;

	constructor(key: string, mods: Partial<KeyModifiers> = {}) {
		this.key = key;
		this.ctrlKey = mods.ctrlKey ?? false;
		this.shiftKey = mods.shiftKey ?? false;
		this.altKey = mods.altKey ?? false;
		this.metaKey = mods.metaKey ?? false;
	}

	static fromEvent(evt: KeyboardEvent): KeyPress {
		let key = evt.key;
		if (key.length > 1)
			key = key.toUpperCase();

		const kp = new KeyPress(evt.key, evt);

		if (shouldIgnoreShift(key))
			kp.shiftKey = false;

		return kp;
	}

	/**
	 * Basic textual representation of the keypress.
	 */
	basicRepr(): string {
		let s = '';

		if (this.ctrlKey)
			s += 'C';
		if (this.shiftKey && !shouldIgnoreShift(this.key))
			s += 'S';
		if (this.altKey)
			s += 'A';
		if (this.metaKey)
			s += 'M';

		if (s)
			s += '-';

		if (this.key in BASIC_REPRS)
			s += BASIC_REPRS[this.key];
		else if (this.key.length > 1)
			s += this.key.toUpperCase();
		else
			s += this.key;

		return s;
	}

	/**
	 * Fancy textual representation of the keypress.
	 */
	fancyRepr(): string {
		let s = '';

		if (this.ctrlKey)
			s += '^';
		if (this.shiftKey && !shouldIgnoreShift(this.key))
			s += '⇧';
		if (this.altKey)
			s += '⎇';
		if (this.metaKey)
			s += '⊞';  // TODO: Mac command key symbol

		s += FANCY_REPRS[this.key] ?? this.key;

		return s;
	}
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


interface CGChild {
	key: KeyPress,
	item: CommandItem,
}


export class CommandGroup {
	description: string | null;
	children: CGChild[];

	constructor(description?: string) {
		this.description = description ?? null;
		this.children = [];
	}

	isEmpty(): boolean {
		return this.children.length == 0;
	}

	/**
	 * Add child command/group given next key in sequence.
	 * If a child already exists for the given keypress, overwrite it.
	 */
	addChild(key: KeyPress, item: CommandItem) {
		for (let i = 0; i < this.children.length; i++) {
			if (this.children[i].key == key) {
				this.children[i] = {key: key, item: item};
				return;
			}
		}
		this.children.push({key: key, item: item});
	}

	/**
	 * Remove child matching keypress.
	 */
	removeChild(key: KeyPress): CommandItem | null {
		for (let i = 0; i < this.children.length; i++) {
			if (this.children[i].key == key)
				return this.children.splice(i, 1)[0].item;
		}
		return null;
	}

	/**
	 * Get child matching keypress.
	 */
	getChild(key: KeyPress): CommandItem | null {
		for (const child of this.children) {
			if (child.key == key)
				return child.item;
		}
		return null;
	}

	/**
	 * Get the item for the given sequence of keys.
	 * @param keys - Sequence of key presses.
	 * @param strict - If we reach a CommandRef before running out of key characters, return null
	 *                 (strict=true) or the CommandRef (strict=false).
	 */
	find(keys: KeyPress[], strict = false): CommandItem | null {
		let selected: CommandItem = this;
		let child: CommandItem | null;

		for (const key of keys) {
			if (selected instanceof CommandRef)
				return strict ? null : selected;

			child = selected.getChild(key);

			if (!child)
				return null;

			selected = child;
		}

		return selected;
	}
}

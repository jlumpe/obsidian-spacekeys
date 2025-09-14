/* ---------------------------------------------------------------------------------------------- */
/*                                            Key codes                                           */
/* ---------------------------------------------------------------------------------------------- */


// This *should* match any valid key code (case-insensitive).
export const KEYCODE_REGEXP = /^(.|[a-z]+|f[1-9]|f1[0-2])$/i;


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
	// ' ': '␣',
	enter: '↵',
	// tab: '⇥',
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
	ctrl: boolean;
	shift: boolean;
	alt: boolean;
	meta: boolean;
}


/**
 * Represents a single key press, possibly combined with modifiers.
 *
 * Attributes taken from KeyboardEvent:
 * - "key" is normalized to lower case IF it is more than a single character.
 * - Modifier key flags are renamed "shiftKey" -> "shift".
 * - "shift" is set to false based on shouldIgnoreShiftKey(key).
 *
 * The changes are to make parsing the correct codes from the keymap definition file easier.
 */
export class KeyPress {
	key: string;
	ctrl: boolean;
	shift: boolean;
	alt: boolean;
	meta: boolean;

	constructor(key: string, mods: Partial<KeyModifiers> = {}) {
		this.key = key;
		this.ctrl = mods.ctrl ?? false;
		this.shift = mods.shift ?? false;
		this.alt = mods.alt ?? false;
		this.meta = mods.meta ?? false;
	}

	static fromEvent(evt: KeyboardEvent): KeyPress {
		let key = evt.key;
		if (key.length > 1)
			key = key.toLowerCase();

		const mods: KeyModifiers = {
			ctrl: evt.ctrlKey,
			shift: evt.shiftKey,
			alt: evt.altKey,
			meta: evt.metaKey,
		};
		const kp = new KeyPress(key, mods);

		if (shouldIgnoreShift(key))
			kp.shift = false;

		return kp;
	}

	/**
	 * Compare two keypresses for the purpose of sorting.
	 */
	static compare(kp1: KeyPress, kp2: KeyPress): number {
		if (kp1.key != kp2.key) {
			// Sort "special" keys before those corresponding to printable characters.
			const isPrintable1 = shouldIgnoreShift(kp1.key);
			const isPrintable2 = shouldIgnoreShift(kp2.key);

			if (!isPrintable1 && isPrintable2)
				return -1;
			if (isPrintable1 && !isPrintable2)
				return 1;

			return kp1.key.localeCompare(kp2.key);
		}

		// Same key, compare by modifiers
		if (!kp1.ctrl && kp2.ctrl)
			return -1;
		if (kp1.ctrl && !kp2.ctrl)
			return 1;
		if (!kp1.shift && kp2.shift)
			return -1;
		if (kp1.shift && !kp2.shift)
			return 1;
		if (!kp1.alt && kp2.alt)
			return -1;
		if (kp1.alt && !kp2.alt)
			return 1;
		if (!kp1.meta && kp2.meta)
			return -1;
		if (kp1.meta && !kp2.meta)
			return 1;

		return 0;
	}

	/**
	 * Check if this keypress is equal to another.
	 */
	equals(other: KeyPress): boolean {
		return this.key == other.key
			&& this.ctrl == other.ctrl
			&& this.shift == other.shift
			&& this.alt == other.alt
			&& this.meta == other.meta;
	}

	/**
	 * Textual representation of the keypress.
	 * @param fancy Use fancy unicode characters.
	 */
	repr(fancy: boolean = false): string {
		let s = '';

		if (this.ctrl)
			s += fancy ? '^' : 'C';
		if (this.shift && !shouldIgnoreShift(this.key))
			s += fancy ? '⇧' : 'S';
		if (this.alt)
			s += fancy ? '⎇' : 'A';
		if (this.meta)
			s += fancy ? '⊞' : 'M';  // TODO: Mac command key symbol

		if (s && !fancy)
			s += '-';

		if (fancy && this.key in FANCY_REPRS)
			s += FANCY_REPRS[this.key];
		else if (this.key in BASIC_REPRS)
			s += BASIC_REPRS[this.key];
		else if (!fancy && this.key.length > 1)
			// Convert multi-letter codes to upper case
			s += this.key.toUpperCase();
		else
			s += this.key;

		return s;
	}
}


/* ---------------------------------------------------------------------------------------------- */
/*                                             Keymaps                                            */
/* ---------------------------------------------------------------------------------------------- */


export type KeymapItem = KeymapGroup | KeymapCommand | KeymapFile;


/**
 * Reference to a command.
 */
export class KeymapCommand {
	constructor(public command_id: string, public description: string | null = null) {
	}
}


/**
 * Reference to a file to be opened.
 */
export class KeymapFile {
	constructor(public file_path: string, public description: string | null = null) {
	}
}


/**
 * Group of commands in a key map.
 *
 * This either represents a nested group of commands or the entire keymap itself.
 */
export class KeymapGroup {
	description: string | null;
	children: {key: KeyPress, item: KeymapItem}[];

	constructor(description: string | null = null) {
		this.description = description;
		this.children = [];
	}

	isEmpty(): boolean {
		return this.children.length == 0;
	}

	/**
	 * Add child item given next key in sequence.
	 * If a child already exists for the given keypress, overwrite it.
	 */
	setChild(key: KeyPress, item: KeymapItem) {
		for (let i = 0; i < this.children.length; i++) {
			if (this.children[i].key.equals(key)) {
				this.children[i] = {key: key, item: item};
				return;
			}
		}
		this.children.push({key: key, item: item});
	}

	/**
	 * Remove child matching keypress (if it exists).
	 */
	removeChild(key: KeyPress): KeymapItem | null {
		for (let i = 0; i < this.children.length; i++) {
			if (this.children[i].key.equals(key))
				return this.children.splice(i, 1)[0].item;
		}
		return null;
	}

	/**
	 * Get child matching keypress.
	 */
	getChild(key: KeyPress): KeymapItem | null {
		for (const child of this.children) {
			if (child.key.equals(key))
				return child.item;
		}
		return null;
	}

	/**
	 * Get the item for the given sequence of keys.
	 * @param keys - Sequence of key presses.
	 * @param strict - If we reach a non-group item before running out of key characters, return
	 *                 null (strict=true) or the item (strict=false).
	 */
	find(keys: KeyPress[], strict = false): KeymapItem | null {
		let selected: KeymapItem = this;
		let child: KeymapItem | null;

		for (const key of keys) {
			if (selected instanceof KeymapCommand || selected instanceof KeymapFile)
				return strict ? null : selected;

			child = selected.getChild(key);

			if (!child)
				return null;

			selected = child;
		}

		return selected;
	}

	/**
	 * Create a shallow copy of the group (down to the child KeymapItem's).
	 */
	copy(): KeymapGroup {
		const copy = new KeymapGroup(this.description);
		for (const child of this.children)
			copy.children.push({...child});
		return copy;
	}
}

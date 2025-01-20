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
	 * Basic textual representation of the keypress.
	 */
	basicRepr(): string {
		let s = '';

		if (this.ctrl)
			s += 'C';
		if (this.shift && !shouldIgnoreShift(this.key))
			s += 'S';
		if (this.alt)
			s += 'A';
		if (this.meta)
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

		if (this.ctrl)
			s += '^';
		if (this.shift && !shouldIgnoreShift(this.key))
			s += '⇧';
		if (this.alt)
			s += '⎇';
		if (this.meta)
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
			if (this.children[i].key.equals(key)) {
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
			if (this.children[i].key.equals(key))
				return this.children.splice(i, 1)[0].item;
		}
		return null;
	}

	/**
	 * Get child matching keypress.
	 */
	getChild(key: KeyPress): CommandItem | null {
		for (const child of this.children) {
			if (child.key.equals(key))
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

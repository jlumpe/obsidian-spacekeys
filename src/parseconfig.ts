// import { parseYaml } from "obsidian";
import YAML from "yaml";

import { KeyModifiers, KeyPress, KEYCODE_REGEXP, shouldIgnoreShift, CommandRef, CommandGroup, CommandItem } from "keys";
import { assert } from "./util";


type YAMLObject = {[key: string]: YAMLData};
type YAMLData = YAMLObject | Array<YAMLData> | string | number | null;


function isYAMLObject(value: YAMLData): value is YAMLObject {
	return (typeof value === 'object') && !Array.isArray(value) && value !== null;
}


/**
 * Sequence of property names or array indices describing the location of a value within parsed YAML
 * data.
 */
type ParsePath = Array<string | number>;

/**
 * Error attempting to parse keymap from file.
 *
 * @prop path - If the error occurred in creating the keymap from parsed YAML, the path to the
 *              problematic value.
 */
export class ParseError extends Error {
	constructor(msg: string, public path: ParsePath | null = null, public data?: YAMLData) {
		super(msg);
	}
}


/**
 * Aliases strings when parsing key codes.
 */
const KEY_ALIASES: {[key: string]: string} = {
	space: ' ',
	spc: ' ',
	up: 'arrowup',
	down: 'arrowdown',
	left: 'arrowleft',
	right: 'arrowright',
};


interface ParseKeySuccess {
	success: true,
	key: KeyPress,
}

interface ParseKeyError {
	success: false,
	error: string,
}


/**
 * Parse key code.
 */
export function parseKey(s: string): ParseKeySuccess | ParseKeyError {
	const baseError: ParseKeyError = {
		success: false,
		error: 'Invalid key code: ' + JSON.stringify(s),
	};

	if (!s)
		return baseError;
	if (s == '-')
		return {success: true, key: new KeyPress('-')};

	const mods: Partial<KeyModifiers> = {};
	let key: string;

	// Process modifiers
	const dashPos = s.indexOf('-');
	if (dashPos >= 0) {
		const modstr = s.substring(0, dashPos);
		key = s.substring(dashPos + 1).toLowerCase();

		if (!key || !modstr)
			return baseError;

		for (let i = 0; i < modstr.length; i++) {
			if (modstr[i] == 'c')
				mods.ctrl = true;
			else if (modstr[i] == 's')
				mods.shift = true;
			else if (modstr[i] == 'a')
				mods.alt = true;
			else if (modstr[i] == 'm')
				mods.meta = true;
			else
				return {
					success: false,
					error: 'Invalid modifier code: ' + modstr[i].toUpperCase(),
				};
		}
	} else {
		key = s;
	}

	// Normalize case if not single symbol
	if (key.length > 1)
		key = key.toLowerCase();

	// Apply aliases
	key = KEY_ALIASES[key] ?? key;

	if (!KEYCODE_REGEXP.test(key))
		return baseError;

	if (shouldIgnoreShift(key))
		mods.shift = false;  // TODO: report a warning?

	return {success: true, key: new KeyPress(key, mods)};
}


/**
 * Create keymap from parsed YAML data.
 */
function keymapFromYAML(data: YAMLData): CommandGroup {
	if (!isYAMLObject(data))
		throw new ParseError('Root element not an object', [], data);

	if (!('items' in data))
		throw new ParseError('Expected "items" property', [], data);

	const item = commandItemFromYAML(data, []);
	assert(item instanceof CommandGroup);

	return item;
}


function commandItemFromYAML(data: YAMLData, path: ParsePath): CommandItem {
	let item: CommandItem;

	function error(msg: string, extrapath?: ParsePath, dat: YAMLData = data) {
		return new ParseError(msg, extrapath ? path.concat(extrapath) : path, dat);
	}

	if (typeof data === 'string') {
		// Short form command
		item = new CommandRef(data);

	} else if (isYAMLObject(data)) {
		if ('items' in data) {
			if ('command' in data)
				throw error('Object has both "items" and "command" properties');

			// Allow YAML null to stand in for empty object
			if (!isYAMLObject(data.items) && data.items !== null)
				throw error('Expected an object', ['items'], data.items);

			item = new CommandGroup();

			for (const keyStr in data.items) {
				const value = data.items[keyStr];

				// Allow null values as placeholders, skip
				if (value === null)
					continue;

				// Parse keypress
				const result = parseKey(keyStr);
				if (!result.success)
					throw error(result.error, ['item'], data.items);

				// Parse child
				const child = commandItemFromYAML(value, path.concat(['items', keyStr]));
				item.addChild(result.key, child);
			}

		} else if ('command' in data) {
			if (typeof data.command !== 'string')
				throw error('Expected string', ['command'], data.command);

			item = new CommandRef(data.command);

		} else {
			throw error('Object must have either "items" or "command" property');
		}

		if ("description" in data) {
			if (typeof data.description !== 'string' && data.description !== null)
				throw error('Expected string or null', ['description'], data.description);
			item.description = data.description;
		}

	} else {
		throw error('Expected string or object');
	}

	if (item instanceof CommandRef && !item.command_id)
		throw error('Command ID cannot be empty', ['command'], item.command_id);

	return item;
}


/**
 * Parse keymap from plain YAML.
 */
export function parseKeymapYAML(lines: string): CommandGroup {
	let data;

	try {
		data = YAML.parse(lines);
	} catch (error) {
		throw new ParseError(String(error));
	}

	return keymapFromYAML(data);
}


/**
 * Parse keymap from fenced code block in Markdown file.
 */
export function parseKeymapMD(lines: string): CommandGroup {
	const yaml = findCodeBlock(lines);

	if (!yaml)
		throw new ParseError('No code block found');

	return parseKeymapYAML(yaml);
}


/**
 * Find (first) fenced code block in Markdown text and return its contents.
 */
function findCodeBlock(lines: string): string | null {
	const matches = lines.matchAll(/^```.*$/mg);
	let begin: number | null = null;

	for (const match of matches) {
		assert(match.index);
		if (begin === null)
			// First match
			begin = match.index + match[0].length;
		else
			// Second match
			return lines.substring(begin, match.index);
	}

	return null;
}

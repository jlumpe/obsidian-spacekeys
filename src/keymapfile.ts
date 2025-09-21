import { parseYaml } from "obsidian";
import { KeyModifiers, KeyPress, KEYCODE_REGEXP, shouldIgnoreShift, KeymapCommand, KeymapGroup, KeymapItem, KeymapFile } from "src/keys";
import { assert, assertNever, splitFirst } from "src/util";

import KEYMAP_MARKDOWN_HEADER from "include/keymaps/markdown-header.md";


/* ---------------------------------------------------------------------------------------------- */
/*                                         YAML utilities                                         */
/* ---------------------------------------------------------------------------------------------- */

type YAMLObject = {[key: string]: YAMLData};
type YAMLData = YAMLObject | Array<YAMLData> | string | number | boolean | null;


function isYAMLObject(value: YAMLData): value is YAMLObject {
	return (typeof value === 'object') && !Array.isArray(value) && value !== null;
}


/**
 * Sequence of property names or array indices describing the location of a value within parsed YAML
 * data.
 */
type ParsePath = Array<string | number>;


/* ---------------------------------------------------------------------------------------------- */
/*                                             Errors                                             */
/* ---------------------------------------------------------------------------------------------- */

interface KeymapParseErrorOptions {
	path: ParsePath | null;
	data: YAMLData | null;
	cause: Error | null;
}

/**
 * Error attempting to parse keymap from file.
 *
 * @prop path - If the error occurred in creating the keymap from parsed YAML, the path to the
 *              problematic value.
 */
export class KeymapParseError extends Error {
	path: ParsePath | null;
	data: YAMLData | null;
	cause: Error | null;

	constructor(msg: string, options: Partial<KeymapParseErrorOptions> = {}) {
		super(msg);
		this.path = options.path ?? null;
		this.data = options.data ?? null;
		this.cause = options.cause ?? null;
	}
}

/**
 * Convenience function.
 */
function parseError(msg: string, path: ParsePath, data?: YAMLData, extraPath?: ParsePath): never {
	throw new KeymapParseError(msg, {path: extraPath ? path.concat(extraPath) : path, data: data});
}


/* ---------------------------------------------------------------------------------------------- */
/*                                        Key code parsing                                        */
/* ---------------------------------------------------------------------------------------------- */

/**
 * Aliases when parsing key codes.
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
			const m = modstr[i].toLowerCase();
			if (m == 'c')
				mods.ctrl = true;
			else if (m == 's')
				mods.shift = true;
			else if (m == 'a')
				mods.alt = true;
			else if (m == 'm')
				mods.meta = true;
			else
				return {
					success: false,
					error: 'Invalid modifier code: ' + modstr[i],
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
 * Preferred key code aliases for unparseKey()
 */
const REVERSE_ALIASES: {[key: string]: string} = {
	' ': 'spc',
	arrowup: 'up',
	arrowdown: 'down',
	arrowleft: 'left',
	arrowright: 'right',
};


/**
 * Get key code string from KeyPress instance.
 *
 * The return value, when passed to parseKey(), should yield the original KeyPress instance.
 */
export function unparseKey(kp: KeyPress): string {
	const key = REVERSE_ALIASES[kp.key] ?? kp.key;

	let modstr = '';
	if (kp.ctrl)
		modstr += 'c';
	if (kp.shift)
		modstr += 's';
	if (kp.alt)
		modstr += 'a';
	if (kp.meta)
		modstr += 'm';

	return modstr ? modstr + '-' + key : key;
}


/* ---------------------------------------------------------------------------------------------- */
/*                                     Create from parsed YAML                                    */
/* ---------------------------------------------------------------------------------------------- */

/**
 * Create keymap from parsed YAML data.
 */
function keymapFromYAML(data: YAMLData, extend?: KeymapGroup): KeymapGroup {
	if (!isYAMLObject(data))
		parseError('Root element not an object', [], data);

	if (!('items' in data))
		parseError('Expected "items" property', [], data);

	const item = keymapItemFromYAML(data, [], extend);
	assert(item instanceof KeymapGroup);

	return item;
}


/**
 * Parse keymap item (command/file/group) from YAML data.
 * @param data YAML data.
 * @param path Path to data in YAML document, for error reporting.
 * @param extend Existing group to extend.
 * @returns
 */
export function keymapItemFromYAML(data: YAMLData, path: ParsePath, extend?: KeymapGroup): KeymapItem {
	let item: KeymapItem;

	if (typeof data === 'string') {
		// Short form command

		if (!data)
			parseError('Empty string not allowed', path, data);
		const [cmd, desc] = splitFirst(data.trim(), ' ');
		return new KeymapCommand(cmd, desc?.trim() || null);

	} else if (!isYAMLObject(data)) {
		parseError('Expected string or object', path, data);
	}

	const isCommand = 'command' in data;
	const isFile = 'file' in data;
	const isGroup = 'items' in data;

	// None or more than one of the unique property names present
	if ((+isCommand) + (+isFile) + (+isGroup) != 1)
		parseError('Object must have exactly one of the following properties: "items", "command", or "file"', path, data);

	// Command
	if (isCommand) {
		if (typeof data.command !== 'string')
			parseError('Expected string', path, data.command, ['command']);
		if (!data.command)
			parseError('Command ID cannot be empty', path, data.command, ['command']);

		item = new KeymapCommand(data.command);

	// File
	} else if (isFile) {
		if (typeof data.file !== 'string')
			parseError('Expected string', path, data.command, ['file']);
		if (!data.file)
			parseError('File name cannot be empty', path, data.command, ['file']);

		item = new KeymapFile(data.file);

	// Group
	} else if (isGroup) {
		item = keymapGroupFromYAML(data, path, extend);

	} else {
		// Condition checked above
		assertNever();
	}

	// Add description
	if ("description" in data) {
		if (typeof data.description !== 'string' && data.description !== null)
			parseError('Expected string or null', path, data.description, ['description']);
		item.description = data.description || null;
	}

	// TODO: error on extra properties?

	return item;
}


/**
 * Parse keymap group from YAML data.
 */
function keymapGroupFromYAML(data: YAMLObject, path: ParsePath, extend?: KeymapGroup): KeymapGroup {
	let group: KeymapGroup;

	// Check items is object (allow null to stand in for empty object)
	if (!isYAMLObject(data.items) && data.items !== null)
		parseError('Expected group.items to be an object', path, data.item, ['items']);

	// Check clear attribute
	if (data.clear !== undefined && typeof data.clear !== 'boolean')
		parseError('Expected group.clear to be a bool', path, data.clear, ['clear']);

	// Extend existing
	if (extend && data.clear !== true)
		group = extend.copy();
	else
		group = new KeymapGroup();

	for (const keyStr in data.items) {
		const value = data.items[keyStr];

		// Parse keypress
		const result = parseKey(keyStr);
		if (!result.success)
			parseError(result.error, path, data.items, ['items']);
		const key = result.key;

		// Allow null values as placeholders, or to remove entries when extending existing group
		if (value === null) {
			group.removeChild(key);
			continue;
		}

		// Should existing child group be extended?
		const existingChild = group.getChild(key);
		const extendChild = existingChild instanceof KeymapGroup ? existingChild : undefined;

		// Create/extend child
		const child = keymapItemFromYAML(value, path.concat(['items', keyStr]), extendChild);
		group.setChild(key, child);
	}

	return group;
}


/* ---------------------------------------------------------------------------------------------- */
/*                                      Complete file parsing                                     */
/* ---------------------------------------------------------------------------------------------- */

/**
 * Parse keymap from plain YAML.
 */
export function parseKeymapYAML(lines: string, extend?: KeymapGroup): KeymapGroup {
	let data;

	try {
		data = parseYaml(lines);
	} catch (error) {
		throw new KeymapParseError(String(error), {cause: error});
	}

	return keymapFromYAML(data, extend);
}


/**
 * Parse keymap from fenced code block in Markdown file.
 */
export function parseKeymapMD(lines: string, extend?: KeymapGroup): KeymapGroup {
	const yaml = findCodeBlock(lines);

	if (!yaml)
		throw new KeymapParseError('No code block found');

	return parseKeymapYAML(yaml, extend);
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


// File format of keymap file in plugin settings
export type KeymapFileFormat = 'auto' | 'markdown' | 'yaml';


/**
 * Guess format of keymap file based on file name.
 * @param filename
 * @param settingsFormat - format set in plugin settings. Will use this value if supplied regardless
 *                         of filename, unless it is "auto".
 */
export function guessKeymapFileFormat(filename: string, settingsFormat?: KeymapFileFormat): 'markdown' | 'yaml' | null {
	if (settingsFormat && settingsFormat != 'auto')
		return settingsFormat;
	if (/\.ya?ml$/.test(filename))
		return 'yaml';
	if (/\.md$/.test(filename))
		return 'markdown';
	return null;
}


/**
 * Create Markdown file wrapping keymap YAML with a default header.
 * @param yaml - YAML keymap definition as string.
 */
export function makeKeymapMarkdown(yaml: string): string {
	let markdown = KEYMAP_MARKDOWN_HEADER;
	markdown += '```yaml\n';
	markdown += yaml;
	markdown += '\n```\n';
	return markdown;
}

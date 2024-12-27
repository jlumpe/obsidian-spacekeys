import { parseYaml } from "obsidian";

import { CommandGroup, CommandItem, CommandRef, checkKey } from "commands";
import { assert } from "./util";


const keyAliases: {[key: string]: string} = {
	space: ' ',
	spc: ' ',
	tab: '\t',
};


/**
 * Get key character, looking up aliases.
 */
function getKey(s: string): string {
	return keyAliases[s.toLowerCase()] ?? s;
}


type YAMLObject = {[key: string]: YAMLData};
type YAMLData = YAMLObject | Array<YAMLData> | string | number | null;
type ParsePath = Array<string | number>;


function isYAMLObject(value: YAMLData): value is YAMLObject {
	return (typeof value === 'object') && !Array.isArray(value) && value !== null;
}


class YAMLParseError extends Error {
	constructor(msg: string, public path: ParsePath, public data?: YAMLData) {
		super(msg);
	}
}


/**
 * Create keymap from parsed YAML data.
 */
function keymapFromYAML(data: YAMLData): CommandGroup {
	if (!isYAMLObject(data))
		throw new YAMLParseError('Root element not an object', [], data);

	const item = commandItemFromYAML(data, []);
	if (!(item instanceof CommandGroup))
		throw new YAMLParseError('Root item must be a command group', [], data);

	return item;
}


function commandItemFromYAML(data: YAMLData, path: ParsePath): CommandItem {
	let item: CommandItem;

	function error(msg: string, extrapath?: ParsePath, dat: YAMLData = data) {
		return new YAMLParseError(msg, extrapath ? path.concat(extrapath) : path, dat);
	}

	if (typeof data === 'string') {
		item = new CommandRef(data);

	} else if (isYAMLObject(data)) {
		if ('items' in data) {
			if ('command' in data)
				throw error('Object has both "items" and "command" properties');

			// Allow YAML null to stand in for empty object
			if (!isYAMLObject(data.items) && data.items !== null)
				throw error('Expected an object', ['items'], data.items);

			item = new CommandGroup();

			for (const key in data.items) {
				const key2 = getKey(key);
				if (!checkKey(key2))
					throw error('Invalid key ' + JSON.stringify(key), ['items']);

				item.children[key2] = commandItemFromYAML(data.items[key], path.concat(['items', key]));
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
			item.description = data.description || null;
		}

	} else {
		throw error('Expected string or object');
	}

	if (item instanceof CommandRef && !item.command_id)
		throw error('Command ID cannot be empty', ['command'], item.command_id);

	return item;
}


interface ParseResult {
	keymap?: CommandGroup;
	error?: string;
}


/**
 * Parse keymap from plain YAML.
 */
export function parseKeymapYAML(lines: string): ParseResult {
	let data;

	try {
		data = parseYaml(lines);
	} catch (error) {
		return {error: 'YAML parse error: ' + error};
	}

	try {
		return {keymap: keymapFromYAML(data)};

	} catch (e) {
		if (e instanceof YAMLParseError) {
			console.error(String(e));
			console.log({path: e.path, data: e.data});
			return {error: String(e)};
		}
		throw e;
	}
}


/**
 * Parse keymap from fenced code block in Markdown file.
 */
export function parseKeymapMD(lines: string): ParseResult {
	const yaml = findCodeBlock(lines);

	if (!yaml)
		return {error: 'No code block found'};

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

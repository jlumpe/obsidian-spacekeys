import { mockObsidian } from "./common";

mockObsidian();


import { KeyPress, KeyModifiers, KeymapGroup, KeymapCommand, KeymapItem } from "src/keys";
import { parseKey, keymapItemFromYAML, unparseKey, parseKeymapYAML, parseKeymapMD, makeKeymapMarkdown } from "src/keymapfile";
import { INCLUDED_KEYMAPS_YAML } from 'src/include';


/* ---------------------------------------------------------------------------------------------- */
/*                                            Key Codes                                           */
/* ---------------------------------------------------------------------------------------------- */


function parseKeyStrict(code: string): KeyPress {
	const result = parseKey(code);
	if (result.success)
		return result.key;
	throw new Error(result.error);
}

/**
 * Test that parsing a key code gives the expected result.
 * @param code Code to parse.
 * @param key Expected key.
 * @param mods Expected mods.
 */
function testParseKey(code: string, key: string, mods?: Partial<KeyModifiers>): void {
	const expected = new KeyPress(key, mods);
	const parsed = parseKey(code);
	// @ts-expect-error: not-typed
	expect(parsed.error).toBeUndefined();
	expect(parsed).toHaveProperty('success', true);
	expect(parsed).toHaveProperty('key', expected);

	// Also test reverse parsing for each
	// @ts-expect-error: not-typed
	const code2 = unparseKey(parsed.key);
	const parsed2 = parseKey(code2);
	// @ts-expect-error: not-typed
	expect(parsed2.error).toBeUndefined();
	expect(parsed2).toHaveProperty('success', true);
	expect(parsed2).toHaveProperty('key', expected);
}


/**
 * Test that parsing the given key code fails.
 * @param code Code to parse.
 * @param pattern Pattern error string should match.
 */
function testParseKeyInvalid(code: string, pattern?: RegExp) {
	const result = parseKey(code);
	// @ts-expect-error: not-typed
	expect(result.key).toBeUndefined();
	expect(result).toHaveProperty('success', false);
	expect(result).toHaveProperty('error');
	if (pattern)
		// @ts-expect-error: not-typed
		expect(result.error).toMatch(pattern);
}


/*
 * Test parsing key codes.
 */
describe('parseKey', () => {
	test('printable', () => {
		testParseKey('a', 'a');
		testParseKey('A', 'A');
		testParseKey('/', '/');
		testParseKey('?', '?');
	});
	test('aliases', () => {
		testParseKey('spc', ' ');
		testParseKey('LEFT', 'arrowleft');
	});
	test('modifiers', () => {
		testParseKey('c-enter', 'enter', {ctrl: true});
		testParseKey('C-enter', 'enter', {ctrl: true});
		testParseKey('s-enter', 'enter', {shift: true});
		testParseKey('a-enter', 'enter', {alt: true});
		testParseKey('m-enter', 'enter', {meta: true});
		testParseKey('csm-enter', 'enter', {ctrl: true, shift: true, meta: true});
		testParseKey('McS-eNTeR', 'enter', {ctrl: true, shift: true, meta: true});
	});
	test('dash', () => {
		testParseKey('-', '-');
		testParseKey('c--', '-', {ctrl: true});
	});
	test('function key', () => testParseKey('c-F10', 'f10', {ctrl: true}));
	test('invalid', () => {
		testParseKeyInvalid('');
		testParseKeyInvalid('!!!');
		testParseKeyInvalid('01');
		// Empty modifier string
		testParseKeyInvalid('-enter');
		// Invalid modifier code
		testParseKeyInvalid('x-enter');
		// Nothing after modifier
		testParseKeyInvalid('c-');
	});
});


/* ---------------------------------------------------------------------------------------------- */
/*                                          Command items                                         */
/* ---------------------------------------------------------------------------------------------- */

function checkCommand(cmd: any, command_id: string, description: string | null) {
	expect(cmd).toBeInstanceOf(KeymapCommand);
	expect(cmd).toHaveProperty('command_id', command_id);
	expect(cmd).toHaveProperty('description', description);
}

/**
 * Compare two keymap items for equality.
 */
function compareKeymapItems(item1: KeymapItem, item2: KeymapItem, path?: string[]) {
	path ??= [];

	if (item1 instanceof KeymapCommand) {
		expect(item2).toBeInstanceOf(KeymapCommand);
		expect(item2).toHaveProperty('command_id', item1.command_id);
		expect(item2).toHaveProperty('description', item1.description);
	}
	else if (item1 instanceof KeymapGroup) {
		expect(item2).toBeInstanceOf(KeymapGroup);
		item2 = item2 as KeymapGroup;
		expect(item2).toHaveProperty('description', item1.description);
		expect(item2.children).toHaveLength(item1.children.length);

		for (let i = 0; i < item1.children.length; i++) {
			const child1 = item1.children[i];
			const child2 = item2.children[i];
			expect(child2).toHaveProperty('key', child1.key);
			compareKeymapItems(child1.item, child2.item);
		}
	} else
		fail('Expected keymap item');
}


describe('Parse command item', () => {
	test('Command short form', () => {
		const item = keymapItemFromYAML('   foo:bar ', []);
		checkCommand(item, 'foo:bar', null);
	});
	test('Command short form with description', () => {
		const item = keymapItemFromYAML('   foo:bar   This is the description.  ', []);
		checkCommand(item, 'foo:bar', 'This is the description.');
	});
	test('Command long form', () => {
		const item1 = keymapItemFromYAML({command: 'foo:bar'}, []);
		checkCommand(item1, 'foo:bar', null);
		const item2 = keymapItemFromYAML({command: 'foo:bar', description: 'desc'}, []);
		checkCommand(item2, 'foo:bar', 'desc');
	});
	test('Command group', () => {
		const data = {
			description: 'group1',
			items: {
				'c-enter': 'foo:bar desc',
			},
		};
		const item = keymapItemFromYAML(data, []) as KeymapGroup;
		expect(item).toBeInstanceOf(KeymapGroup);
		expect(item).toHaveProperty('description', data.description);
		expect(item.children).toHaveLength(1);
		expect(item.children[0]).toHaveProperty('key', parseKeyStrict('c-enter'));
		checkCommand(item.children[0].item, 'foo:bar', 'desc');
	});
	test('Extend command groups', () => {
		// Group to be extended
		const data_orig = {
			items: {
				"c-x": {
					description: "group1",
					items: {
						"1": "test:1-1 command 1.1",
						"2": "test:1-2 command 1.2",
						"3": "test:1-3 command 1.3",
					},
				},
				"a-y": {
					description: "group2",
					items: {
						"1": "test:1-1 command 2.1",
					},
				},
				"m-z": {
					description: "group3",
					items: {
						"1": "test:3-1 command 3.1",
					},
				},
			}
		};
		// Extensions
		const data_extend = {
			items: {
				"c-x": {
					// Rename group
					description: "group1 renamed",
					items: {
						// Replace command
						"2": "test:1-2r command 1.2 replaced",
						// Remove command
						"3": null,
						// Add command
						"4": "test:1-4 command 1.4",
					},
				},
				"a-y": {
					description: "group2 replacement",
					// Clear existing children
					clear: true,
					items: {
						"2": "test:1-2 command 2.2",
					},
				},
			}
		};
		// Expected result
		const data_expected = {
			items: {
				"c-x": {
					description: "group1 renamed",
					items: {
						"1": "test:1-1 command 1.1",
						"2": "test:1-2r command 1.2 replaced",
						"4": "test:1-4 command 1.4",
					},
				},
				"a-y": {
					description: "group2 replacement",
					items: {
						"2": "test:1-2 command 2.2",
					},
				},
				"m-z": {
					description: "group3",
					items: {
						"1": "test:3-1 command 3.1",
					},
				},
			}
		};

		const orig = keymapItemFromYAML(data_orig, []) as KeymapGroup;
		const extended = keymapItemFromYAML(data_extend, [], orig) as KeymapGroup;
		const expected = keymapItemFromYAML(data_expected, []) as KeymapGroup;
		expect(orig).toBeInstanceOf(KeymapGroup);
		expect(extended).toBeInstanceOf(KeymapGroup);
		expect(expected).toBeInstanceOf(KeymapGroup);
		compareKeymapItems(extended, expected);
	});
	test.todo('Invalid: Mixed command: + items:');
	test.todo('Invalid: No command: or items:');
	test.todo('Invalid: Empty command ID');
	test.todo('Invalid: Invalid types?');
});


/* ---------------------------------------------------------------------------------------------- */
/*                                        Full file parsing                                       */
/* ---------------------------------------------------------------------------------------------- */

test('Parse full keymap', () => {
	const keymap_yaml = INCLUDED_KEYMAPS_YAML.default;
	const keymap1 = parseKeymapYAML(keymap_yaml);
	expect(keymap1).toBeInstanceOf(KeymapGroup);
	// TODO - check contents?

	// Make and parse Markdown file
	const keymap_md = makeKeymapMarkdown(keymap_yaml);
	const keymap2 = parseKeymapMD(keymap_md);
	expect(keymap2).toBeInstanceOf(KeymapGroup);
	compareKeymapItems(keymap1, keymap2);
});

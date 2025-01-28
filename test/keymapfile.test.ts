import { mockObsidian } from "./common";

mockObsidian();


import { KeyPress, KeyModifiers, CommandGroup, CommandRef } from "src/keys";
import { parseKey, commandItemFromYAML, unparseKey } from "src/keymapfile";


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


describe('parseKey', () => {
	test('printable', () => {
		testParseKey('a', 'a');
		testParseKey('A', 'A');
		testParseKey('/', '/');
		testParseKey('?', '?');
	});
	test('aliases', () => {
		testParseKey('spc', ' ');
		testParseKey('left', 'arrowleft');
	});
	test('modifiers', () => {
		testParseKey('c-enter', 'enter', {ctrl: true});
		testParseKey('s-enter', 'enter', {shift: true});
		testParseKey('a-enter', 'enter', {alt: true});
		testParseKey('m-enter', 'enter', {meta: true});
		testParseKey('csm-enter', 'enter', {ctrl: true, shift: true, meta: true});
		testParseKey('mcs-enter', 'enter', {ctrl: true, shift: true, meta: true});
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
		testParseKeyInvalid('-enter');
		testParseKeyInvalid('x-enter');
		testParseKeyInvalid('c-');
	});
});


function checkCommandRef(cmd: any, command_id: string, description: string | null) {
	expect(cmd).toBeInstanceOf(CommandRef);
	expect(cmd).toHaveProperty('command_id', command_id);
	expect(cmd).toHaveProperty('description', description);
}


describe('Parse command item', () => {
	test('Command short form', () => {
		const item = commandItemFromYAML('   foo:bar ', []);
		checkCommandRef(item, 'foo:bar', null);
	});
	test('Command short form with description', () => {
		const item = commandItemFromYAML('   foo:bar   This is the description.  ', []);
		checkCommandRef(item, 'foo:bar', 'This is the description.');
	});
	test('Command long form', () => {
		const item1 = commandItemFromYAML({command: 'foo:bar'}, []);
		checkCommandRef(item1, 'foo:bar', null);
		const item2 = commandItemFromYAML({command: 'foo:bar', description: 'desc'}, []);
		checkCommandRef(item2, 'foo:bar', 'desc');
	});
});

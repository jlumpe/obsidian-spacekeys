import { KeyPress, KeyModifiers } from "keys";
import { parseKey } from "parseconfig";


function testParseKey(s: string, key: string, mods?: Partial<KeyModifiers>): void {
	const expected = new KeyPress(key, mods);
	const parsed = parseKey(s) as any;
	expect(parsed.error).toBeUndefined();
	expect(parsed).toHaveProperty('success', true);
	expect(parsed).toHaveProperty('key', expected);
}


function testParseKeyInvalid(s: string, pattern?: RegExp) {
	const result = parseKey(s) as any;
	expect(result.key).toBeUndefined();
	expect(result).toHaveProperty('success', false);
	expect(result).toHaveProperty('error');
	if (pattern)
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

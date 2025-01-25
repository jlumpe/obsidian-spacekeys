import { isRegularObject, recursiveDefaults, RecursivePartial, splitFirst } from "src/util";


describe('isRegularObject', () => {
	test('obj', () => expect(isRegularObject({})).toBeTruthy());
	test('array', () => expect(isRegularObject([])).toBeFalsy());
	test('null', () => expect(isRegularObject(null)).toBeFalsy());
	test('undef', () => expect(isRegularObject(undefined)).toBeFalsy());
});


describe('recursiveDefaults', () => {
	test('basic', () => {
		interface TestSettings {
			a: number,
			b: string,
			arr: number[],
			obj1: {
				x: null | string,
				y: boolean,
			},
			obj2: {
				z: boolean,
			}
		}
		const defaults: TestSettings = {
			a: 1,
			b: 'two',
			arr: [],
			obj1: {
				x: null,
				y: false,
			},
			obj2: {
				z: true,
			},
		};
		const values: RecursivePartial<TestSettings> = {
			b: 'three',
			arr: [1, 2, 3],
			obj1: {
				x: 'foo',
			},
		};
		const expected = {
			a: 1,
			b: 'three',
			arr: [1, 2, 3],
			obj1: {
				x: 'foo',
				y: false,
			},
			obj2: {
				z: true,
			},
		};
		const result = recursiveDefaults(values, defaults);
		expect(result).toEqual(expected);
	});
	test('non-object', () => {
		interface TestSettings {
			foo: {
				x: string,
				y: boolean,
			} | null,
		}
		const defaults: TestSettings = {
			foo: {
				x: 'x',
				y: true,
			},
		};
		const values: RecursivePartial<TestSettings> = {
			foo: null,
		};
		const result = recursiveDefaults(values, defaults);
		expect(result).toEqual(values);
	});
});


describe('splitFirst', () => {
	test('str empty', () => expect(splitFirst('', '-')).toEqual(['', null]));
	test('str none', () => expect(splitFirst('foo', '-')).toEqual(['foo', null]));
	test('str once', () => expect(splitFirst('foo-bar', '-')).toEqual(['foo', 'bar']));
	test('str multi', () => expect(splitFirst('foo-bar-baz', '-')).toEqual(['foo', 'bar-baz']));
	test('regex ws none', () => expect(splitFirst('foo-bar')).toEqual(['foo-bar', null]));
	test('regex ws once', () => expect(splitFirst('foo  \tbar')).toEqual(['foo', 'bar']));
	test('regex ws multi', () => expect(splitFirst('foo  \tbar baz')).toEqual(['foo', 'bar baz']));
});

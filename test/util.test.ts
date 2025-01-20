import { isRegularObject, recursiveDefaults, RecursivePartial } from "src/util";


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
});

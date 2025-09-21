import YAML from "yaml";


/**
 * obsidian not available when running tests, mock in modules that import it.
 */
export function mockObsidian() {
	jest.mock(
		'obsidian',
		() => ({
			parseYaml: YAML.parse,
		}),
		{virtual: true},
	);
}


/**
 * Expect arrays to be equal up to order.
 */
export function expectArrayEqualUnordered(array1: Array<any>, array2: Array<any>, copy: boolean = true) {
	const copy1 = copy ? [...array1] : array1;
	const copy2 = copy ? [...array2] : array2;
	copy1.sort();
	copy2.sort();
	expect(copy1).toEqual(copy2);
}

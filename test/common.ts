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

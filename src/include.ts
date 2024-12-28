import DEFAULT_KEYMAP_YAML from "../keymaps/default.yml";

export { default as KEYMAP_MARKDOWN_HEADER } from "../keymaps/markdown-header.md";


// Included YAML keymap definitions
export const INCLUDED_KEYMAPS_YAML: { readonly [name: string]: string } = {
	default: DEFAULT_KEYMAP_YAML,
};

import { KeyPress, KeymapGroup, KeymapCommand, KeymapItem } from "src/keys";
import { expectArrayEqualUnordered } from "./common";
import { keymapItemFromYAML } from "src/keymapfile";



describe('KeyPress', () => {
	test.todo('fromEvent() static method');
	test.todo('compare() static method');
	test.todo('equals() method');
	test.todo('repr() method');
});



describe('KeymapGroup', () => {
	const key1 = new KeyPress('a');
	const key2 = new KeyPress('b');
	const key3 = new KeyPress('a', {ctrl: true});
	const key4 = new KeyPress('a', {ctrl: true, alt: true});
	const command1 = new KeymapCommand('foo:1');
	const command2 = new KeymapCommand('foo:2');
	const command3 = new KeymapCommand('foo:3');

	/**
	 *  root
	 *    key1: subgroup
	 *      key2: command2
	 *    key3: command3
	 */
	function makeBasicKeymap(): [KeymapGroup, KeymapGroup] {
		const root = new KeymapGroup();
		const subgroup = new KeymapGroup();
		root.setChild(key1, subgroup);
		subgroup.setChild(key2, command2);
		root.setChild(key3, command3);
		return [root, subgroup];
	}

	test('Children', () => {
		const group = new KeymapGroup();

		// Empty
		expect(group.isEmpty()).toBe(true);
		expect(group.getChild(key1)).toBeNull();

		// Add command 1
		expect(group.setChild(key1, command1)).toBeNull();
		expect(group.getChild(key1)).toBe(command1);
		expect(group.getChild(key2)).toBeNull();
		expect(group.isEmpty()).toBe(false);

		// Add command 2
		expect(group.setChild(key2, command2)).toBeNull();
		expect(group.getChild(key1)).toBe(command1);
		expect(group.getChild(key2)).toBe(command2);
		expect(group.isEmpty()).toBe(false);

		// Replace command 1
		expect(group.setChild(key1, command3)).toBe(command1);
		expect(group.getChild(key1)).toBe(command3);
		expect(group.getChild(key2)).toBe(command2);
		expect(group.isEmpty()).toBe(false);

		// Remove command 2
		expect(group.removeChild(key3)).toBeNull();  // Doesn't exist
		expect(group.removeChild(key2)).toBe(command2);
		expect(group.getChild(key1)).toBe(command3);
		expect(group.getChild(key2)).toBeNull();
		expect(group.isEmpty()).toBe(false);
	});
	test('find()', () => {
		const [root, subgroup] = makeBasicKeymap();

		// Test find()
		expect(root.find([])).toBe(root);
		expect(root.find([key1])).toBe(subgroup);
		expect(root.find([key1, key2])).toBe(command2);
		expect(root.find([key3])).toBe(command3);
		expect(root.find([key4])).toBeNull();
		expect(root.find([key1, key4])).toBeNull();
		expect(root.find([key1, key2, key3])).toBe(command2);  // Non-strict
		expect(root.find([key1, key2, key3], true)).toBeNull();  // Strict
	});
	test('walk()', () => {
		const [root, subgroup] = makeBasicKeymap();
		const items: Array<{item: KeymapItem, keys: KeyPress[]}> = [];

		root.walk((item: KeymapItem, keys: KeyPress[]) => {
			items.push({item: item, keys: keys});
		});

		expectArrayEqualUnordered(items, [
			{item: root, keys: []},
			{item: subgroup, keys: [key1]},
			{item: command2, keys: [key1, key2]},
			{item: command3, keys: [key3]},
		]);
	});
	test('assignedCommands()', () => {
		const [root, subgroup] = makeBasicKeymap();
		// Add duplicate key sequence for command 2
		root.setChild(key4, command2);

		const assigned = root.assignedCommands();

		expectArrayEqualUnordered(Object.keys(assigned), [command2.command_id, command3.command_id]);
		expectArrayEqualUnordered(assigned[command2.command_id], [[key1, key2], [key4]]);
		expect(assigned[command3.command_id]).toEqual([[key3]]);
	});
});

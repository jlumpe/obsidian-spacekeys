import { App, Plugin, PluginSettingTab } from 'obsidian';
import { CommandGroup, HotkeysModal, makeTestCommands } from "commands";



interface MoreSeqHotkeysSettings {
}


const DEFAULT_SETTINGS: MoreSeqHotkeysSettings = {
}


export default class MoreSeqHotkeysPlugin extends Plugin {
	settings: MoreSeqHotkeysSettings;
	commands: CommandGroup;

	async onload() {
		console.log('Loading MoreSeqHotkeys');

		await this.loadSettings();

		this.addSettingTab(new MoreSeqHotkeysSettingTab(this.app, this));

		this.registerCommands()

		this.commands = makeTestCommands();
	}

	private registerCommands(): void {
		this.addCommand({
			id: 'leader',
			name: 'Leader',
			callback: () => {
				new HotkeysModal(this.app, this.commands).open();
			},
		})
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}


class MoreSeqHotkeysSettingTab extends PluginSettingTab {
	plugin: MoreSeqHotkeysPlugin;

	constructor(app: App, plugin: MoreSeqHotkeysPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		// containerEl.empty();

		// new Setting(containerEl)
		// 	.setName('Setting #1')
		// 	.setDesc('It\'s a secret')
		// 	.addText(text => text
		// 		.setPlaceholder('Enter your secret')
		// 		.setValue(this.plugin.settings.mySetting)
		// 		.onChange(async (value) => {
		// 			this.plugin.settings.mySetting = value;
		// 			await this.plugin.saveSettings();
		// 		}));
	}
}

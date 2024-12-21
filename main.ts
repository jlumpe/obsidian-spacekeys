import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface MoreSeqHotkeysSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MoreSeqHotkeysSettings = {
	mySetting: 'default'
}

export default class MoreSeqHotkeysPlugin extends Plugin {
	settings: MoreSeqHotkeysSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new MoreSeqHotkeysSettingTab(this.app, this));
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

		containerEl.empty();

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}

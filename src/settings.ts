import {App, PluginSettingTab, Setting} from "obsidian";
import ObsidianSttPlugin from "./main";

export interface ObsidianSttPluginSettings {
	apiKey: string;
}

export const DEFAULT_SETTINGS: ObsidianSttPluginSettings = {
	apiKey: "",
};

export class ObsidianSttSettingTab extends PluginSettingTab {
	private readonly plugin: ObsidianSttPlugin;

	constructor(app: App, plugin: ObsidianSttPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		new Setting(containerEl)
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setName("OpenRouter key")
			.setDesc("Stored in plugin data and used for transcription requests.")
			.addText((text) => {
				text
					.setPlaceholder("Enter your key")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value.trim();
						await this.plugin.saveSettings();
					});

				text.inputEl.type = "password";
				text.inputEl.autocapitalize = "off";
				text.inputEl.autocomplete = "off";
				text.inputEl.spellcheck = false;
			});
	}
}

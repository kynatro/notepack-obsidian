import { App, PluginSettingTab, Setting } from "obsidian";
import { NotePackSettings } from "./types";
import NotePackPlugin from "./main";

export class NotePackSettingTab extends PluginSettingTab {
  plugin: NotePackPlugin;

  constructor(app: App, plugin: NotePackPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Team folder")
      .setDesc(
        "Path to the folder containing team member subfolders, each with a README.md."
      )
      .addText((text) =>
        text
          .setPlaceholder("Team")
          .setValue(this.plugin.settings.teamFolder)
          .onChange(async (value) => {
            this.plugin.settings.teamFolder = value.trim();
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "Export" });
    containerEl.createEl("p", {
      text: 'These settings control the "NotePack: Export" command which writes todos and recent files into README.md files.',
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("Todo section title")
      .setDesc("Heading text for the todo section in exported README.md files.")
      .addText((text) =>
        text
          .setPlaceholder("Open Todos")
          .setValue(this.plugin.settings.todoAnchorTitle)
          .onChange(async (value) => {
            this.plugin.settings.todoAnchorTitle = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Recent files section title")
      .setDesc(
        "Heading text for the recent files section in the root README.md."
      )
      .addText((text) =>
        text
          .setPlaceholder("Recent Files")
          .setValue(this.plugin.settings.recentFilesAnchorTitle)
          .onChange(async (value) => {
            this.plugin.settings.recentFilesAnchorTitle = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Anchor heading level")
      .setDesc(
        "Markdown heading level for todo and recent file sections (e.g. ##)."
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            "#": "H1 (#)",
            "##": "H2 (##)",
            "###": "H3 (###)",
          })
          .setValue(this.plugin.settings.anchorHeadingLevel)
          .onChange(async (value) => {
            this.plugin.settings.anchorHeadingLevel = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Todo group heading level")
      .setDesc(
        "Heading level for individual todo groups within the section. Should be deeper than the anchor level."
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            "##": "H2 (##)",
            "###": "H3 (###)",
            "####": "H4 (####)",
            "#####": "H5 (#####)",
          })
          .setValue(this.plugin.settings.todoGroupHeadingLevel)
          .onChange(async (value) => {
            this.plugin.settings.todoGroupHeadingLevel = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Recent files count")
      .setDesc("Number of recently modified files to show.")
      .addSlider((slider) =>
        slider
          .setLimits(1, 20, 1)
          .setValue(this.plugin.settings.recentFilesCount)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.recentFilesCount = value;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "Due Dates" });

    new Setting(containerEl)
      .setName("End of day")
      .setDesc(
        'The time at which "end of day" (EOD) due dates are considered overdue. Defaults to 5:00 PM.'
      )
      .addDropdown((dropdown) => {
        const options: Record<string, string> = {};
        for (let h = 0; h < 24; h++) {
          const suffix = h < 12 ? "AM" : "PM";
          const display = h === 0 ? "12:00 AM" : h < 12 ? `${h}:00 AM` : h === 12 ? "12:00 PM" : `${h - 12}:00 PM`;
          options[String(h)] = display;
        }
        dropdown
          .addOptions(options)
          .setValue(String(this.plugin.settings.endOfDayHour))
          .onChange(async (value) => {
            this.plugin.settings.endOfDayHour = parseInt(value);
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("End of week")
      .setDesc(
        'The last day of the work week for "end of week" (EOW) due dates. Defaults to Saturday.'
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            "0": "Sunday",
            "1": "Monday",
            "2": "Tuesday",
            "3": "Wednesday",
            "4": "Thursday",
            "5": "Friday",
            "6": "Saturday",
          })
          .setValue(String(this.plugin.settings.endOfWeekDay))
          .onChange(async (value) => {
            this.plugin.settings.endOfWeekDay = parseInt(value);
            await this.plugin.saveSettings();
          })
      );

  }
}

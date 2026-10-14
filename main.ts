import { App, Notice, Plugin, PluginSettingTab, Setting, TFile } from "obsidian";

interface CustomPluginSettings {
  dailyNoteFolder: string;
  dailyNoteTemplate: string;
  wordCountTarget: number;
  autoSaveInterval: number;
}

const DEFAULT_SETTINGS: CustomPluginSettings = {
  dailyNoteFolder: "Daily Notes",
  dailyNoteTemplate: "Templates/Daily Note.md",
  wordCountTarget: 750,
  autoSaveInterval: 0,
};

export default class CustomPlugin extends Plugin {
  settings: CustomPluginSettings;
  private autoSaveTimer: number | null = null;

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new CustomSettingTab(this.app, this));

    this.addCommand({
      id: "create-daily-note",
      name: "Create daily note",
      callback: () => this.createDailyNote(),
    });

    this.addCommand({
      id: "insert-current-time",
      name: "Insert current time",
      editorCallback: (editor) => {
        const time = new Date().toLocaleTimeString();
        editor.replaceSelection(time);
      },
    });

    this.addCommand({
      id: "show-word-count",
      name: "Show word count of current note",
      editorCallback: (editor) => {
        const text = editor.getValue();
        const count = text.trim().split(/\s+/).filter((w) => w.length > 0).length;
        new Notice(`Word count: ${count}`);
      },
    });

    this.startAutoSave();
  }

  onunload() {
    this.stopAutoSave();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.startAutoSave();
  }

  async createDailyNote() {
    const date = new Date().toISOString().split("T")[0];
    const filePath = `${this.settings.dailyNoteFolder}/${date}.md`;

    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (existing instanceof TFile) {
      await this.app.workspace.getLeaf(false).openFile(existing);
      return;
    }

    let content = "";
    const template = this.app.vault.getAbstractFileByPath(this.settings.dailyNoteTemplate);
    if (template instanceof TFile) {
      content = await this.app.vault.read(template);
      content = content.replace(/{{date}}/g, date);
    }

    const folder = this.app.vault.getAbstractFileByPath(this.settings.dailyNoteFolder);
    if (!folder) {
      await this.app.vault.createFolder(this.settings.dailyNoteFolder);
    }

    const file = await this.app.vault.create(filePath, content);
    await this.app.workspace.getLeaf(false).openFile(file);
  }

  startAutoSave() {
    this.stopAutoSave();
    if (this.settings.autoSaveInterval <= 0) return;

    this.autoSaveTimer = window.setInterval(() => {
      this.app.vault.getAllLoadedFiles().forEach((file) => {
        if (file instanceof TFile && file.extension === "md") {
          // Obsidian auto-saves on its own; this is a placeholder for
          // any custom periodic action you want to run.
        }
      });
    }, this.settings.autoSaveInterval * 1000);
  }

  stopAutoSave() {
    if (this.autoSaveTimer !== null) {
      window.clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }
}

class CustomSettingTab extends PluginSettingTab {
  plugin: CustomPlugin;

  constructor(app: App, plugin: CustomPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Daily notes folder")
      .setDesc("Folder where daily notes are created.")
      .addText((text) =>
        text
          .setPlaceholder("Daily Notes")
          .setValue(this.plugin.settings.dailyNoteFolder)
          .onChange(async (value) => {
            this.plugin.settings.dailyNoteFolder = value.trim() || "Daily Notes";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Daily note template")
      .setDesc("Path to the template file.")
      .addText((text) =>
        text
          .setPlaceholder("Templates/Daily Note.md")
          .setValue(this.plugin.settings.dailyNoteTemplate)
          .onChange(async (value) => {
            this.plugin.settings.dailyNoteTemplate = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Word count target")
      .setDesc("Target word count displayed in status bar (if implemented).")
      .addSlider((slider) =>
        slider
          .setLimits(100, 2000, 50)
          .setValue(this.plugin.settings.wordCountTarget)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.wordCountTarget = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto-save interval (seconds)")
      .setDesc("Set to 0 to disable periodic actions.")
      .addSlider((slider) =>
        slider
          .setLimits(0, 300, 30)
          .setValue(this.plugin.settings.autoSaveInterval)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.autoSaveInterval = value;
            await this.plugin.saveSettings();
          })
      );
  }
}

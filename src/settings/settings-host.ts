import { PluginSettingTab, Setting } from "obsidian";
import type CustomPlugin from "../main";
import type { PluginModule } from "../module";

export class SettingsHostTab extends PluginSettingTab {
  private readonly modules: ReadonlyArray<PluginModule>;

  constructor(plugin: CustomPlugin, modules: ReadonlyArray<PluginModule>) {
    super(plugin.app, plugin);
    this.modules = modules;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Custom Obsidian Plugin")
      .setDesc("Configure each feature below.");

    const tabRoot = containerEl.createDiv("custom-plugin-settings-tabs");
    const tabList = tabRoot.createDiv("custom-plugin-settings-tab-list");
    const contentRoot = tabRoot.createDiv("custom-plugin-settings-content-root");

    const contentEls: HTMLElement[] = [];
    const tabButtons: HTMLElement[] = [];

    for (let i = 0; i < this.modules.length; i++) {
      const module = this.modules[i];
      const contentEl = contentRoot.createDiv("custom-plugin-settings-content");
      contentEl.hide();
      contentEls.push(contentEl);

      const tabButton = tabList.createEl("button", {
        text: module.name,
        cls: "custom-plugin-settings-tab",
      });
      tabButtons.push(tabButton);

      tabButton.addEventListener("click", () => {
        this.activateTab(i, tabButtons, contentEls);
      });

      module.renderSettings(contentEl);
    }

    this.activateTab(0, tabButtons, contentEls);
  }

  private activateTab(
    index: number,
    buttons: HTMLElement[],
    contents: HTMLElement[]
  ): void {
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].toggleClass("is-active", i === index);
      if (i === index) {
        contents[i].show();
      } else {
        contents[i].hide();
      }
    }
  }
}

import { PluginSettingTab, Setting } from "obsidian";
import type CustomPlugin from "../main";
import type { PluginModule } from "../module";
import type { PluginHost } from "../plugin-host";

export class SettingsHostTab extends PluginSettingTab {
  private readonly modules: ReadonlyArray<PluginModule>;
  private readonly host: PluginHost;

  constructor(
    plugin: CustomPlugin,
    modules: ReadonlyArray<PluginModule>,
    host: PluginHost
  ) {
    super(plugin.app, plugin);
    this.modules = modules;
    this.host = host;
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

      contentEl.createDiv(
        "custom-plugin-module-settings", (moduleSettingsEl) => {
          this.renderModuleEnableToggle(contentEl, moduleSettingsEl, module);
          module.renderSettings(moduleSettingsEl);
        }
      );
    }

    this.activateTab(0, tabButtons, contentEls);
  }

  private renderModuleEnableToggle(
    container: HTMLElement,
    moduleSettingsEl: HTMLElement,
    module: PluginModule
  ): void {
    const enabled = this.host.isModuleEnabled(module);
    container.createEl("div", {
      cls: "custom-plugin-module-disabled-notice",
      text: "Enable the plugin to see the settings",
    }, (placeholderEl) => {
      new Setting(container)
        .setName(`Enable ${module.name}`)
        .setDesc("Reload the plugin after changing this toggle.")
        .addToggle((toggle) =>
          toggle.setValue(enabled).onChange(async (value) => {
            await this.host.setModuleEnabled(module, value);
            moduleSettingsEl.toggle(value);
            placeholderEl.toggle(!value);
          })
        );

      container.createEl("hr", { cls: "custom-plugin-settings-divider" });

      if (enabled) {
        placeholderEl.hide();
      } else {
        moduleSettingsEl.hide();
      }
    })

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

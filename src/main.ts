import { Plugin } from "obsidian";
import { PluginHost } from "./plugin-host";
import { SettingsHostTab } from "./settings/settings-host";
import {
  createDrawioModule,
  DEFAULT_DRAWIO_SETTINGS,
} from "./modules/drawio";
import type { ModuleRegistration } from "./module";

const MODULES: ModuleRegistration<unknown>[] = [
  {
    id: "drawio-quick-action",
    name: "Draw.io Quick Action",
    defaults: DEFAULT_DRAWIO_SETTINGS,
    factory: createDrawioModule as ModuleRegistration<unknown>["factory"],
  },
];

export default class CustomPlugin extends Plugin {
  private host: PluginHost;

  async onload() {
    this.host = new PluginHost(this, MODULES);
    await this.host.load();

    this.addSettingTab(new SettingsHostTab(this, this.host.getModules()));
  }

  async onunload() {
    await this.host.unload();
  }
}

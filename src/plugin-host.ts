import { Notice } from "obsidian";
import type { Plugin } from "obsidian";
import type {
  ModuleRegistration,
  PluginModule,
  SettingsContainer,
} from "./module";

type ModuleSettingsWithEnabled = { enabled: boolean };

export class PluginHost {
  private readonly modules: PluginModule[] = [];
  private readonly loadedModules = new Set<PluginModule>();
  private readonly settingsContainers: Record<
    string,
    SettingsContainer<unknown>
  > = {};
  private data: Record<string, unknown> = {};

  constructor(
    private readonly plugin: Plugin,
    private readonly registrations: ModuleRegistration<unknown>[]
  ) {}

  async load(): Promise<void> {
    this.data = (await this.plugin.loadData()) ?? {};

    for (const registration of this.registrations) {
      const settings = this.createSettingsContainer(registration);
      const module = registration.factory(this.plugin, settings);
      this.modules.push(module);

      if (settings.get().enabled) {
        await module.load();
        this.loadedModules.add(module);
      }
    }
  }

  async unload(): Promise<void> {
    for (const module of this.loadedModules) {
      await module.unload();
    }
    this.loadedModules.clear();
    this.modules.length = 0;
  }

  getModules(): ReadonlyArray<PluginModule> {
    return this.modules;
  }

  isModuleEnabled(module: PluginModule): boolean {
    const container = this.settingsContainers[module.id];
    if (!container) return true;
    return (container.get() as ModuleSettingsWithEnabled).enabled;
  }

  async setModuleEnabled(
    module: PluginModule,
    enabled: boolean
  ): Promise<void> {
    const container = this.settingsContainers[module.id];
    if (!container) return;
    await (container as SettingsContainer<ModuleSettingsWithEnabled>).update({
      enabled,
    });
    new Notice("Reload the plugin to apply module changes.");
  }

  private createSettingsContainer<T>(
    registration: ModuleRegistration<T>
  ): SettingsContainer<T & ModuleSettingsWithEnabled> {
    const defaults = { enabled: true, ...(registration.defaults as object) } as T &
      ModuleSettingsWithEnabled;
    const stored = this.data[registration.id];
    let value: T & ModuleSettingsWithEnabled =
      stored && typeof stored === "object"
        ? { ...defaults, ...(stored as object) }
        : { ...defaults };

    const container: SettingsContainer<T & ModuleSettingsWithEnabled> = {
      get: () => value,
      set: async (newValue: T & ModuleSettingsWithEnabled) => {
        value = newValue;
        await this.persist();
      },
      update: async (partial: Partial<T & ModuleSettingsWithEnabled>) => {
        value = { ...value, ...partial };
        await this.persist();
      },
    };

    this.settingsContainers[registration.id] =
      container as SettingsContainer<unknown>;
    return container;
  }

  private async persist(): Promise<void> {
    const output: Record<string, unknown> = {};
    for (const id of Object.keys(this.settingsContainers)) {
      output[id] = this.settingsContainers[id].get();
    }
    this.data = output;
    await this.plugin.saveData(output);
  }
}

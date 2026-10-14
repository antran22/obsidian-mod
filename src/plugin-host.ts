import type { Plugin } from "obsidian";
import type {
  ModuleRegistration,
  PluginModule,
  SettingsContainer,
} from "./module";

export class PluginHost {
  private readonly modules: PluginModule[] = [];
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
      await module.load();
    }
  }

  async unload(): Promise<void> {
    for (const module of this.modules) {
      await module.unload();
    }
    this.modules.length = 0;
  }

  getModules(): ReadonlyArray<PluginModule> {
    return this.modules;
  }

  private createSettingsContainer<T>(
    registration: ModuleRegistration<T>
  ): SettingsContainer<T> {
    const stored = this.data[registration.id];
    let value: T =
      stored && typeof stored === "object"
        ? { ...registration.defaults, ...(stored as object) }
        : { ...registration.defaults };

    const container: SettingsContainer<T> = {
      get: () => value,
      set: async (newValue: T) => {
        value = newValue;
        await this.persist();
      },
      update: async (partial: Partial<T>) => {
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

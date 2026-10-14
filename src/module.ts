import type { Plugin } from "obsidian";

export interface SettingsContainer<T> {
  get(): T;
  set(value: T): Promise<void>;
  update(partial: Partial<T>): Promise<void>;
}

export interface PluginModule {
  readonly id: string;
  readonly name: string;
  load(): Promise<void> | void;
  unload(): Promise<void> | void;
  renderSettings(container: HTMLElement): void;
}

export type ModuleFactory<TSettings> = (
  plugin: Plugin,
  settings: SettingsContainer<TSettings>
) => PluginModule;

export interface ModuleRegistration<TSettings = unknown> {
  readonly id: string;
  readonly name: string;
  readonly defaults: TSettings;
  readonly factory: ModuleFactory<TSettings>;
}

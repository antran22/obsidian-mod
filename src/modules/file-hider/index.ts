import type { Plugin } from "obsidian";
import { Setting, TAbstractFile } from "obsidian";
import type { PluginModule, SettingsContainer } from "../../module";
import {
  DEFAULT_FILE_HIDER_SETTINGS,
  type FileHiderPattern,
  type FileHiderSettings,
} from "./settings";

export { DEFAULT_FILE_HIDER_SETTINGS, type FileHiderSettings };

interface PathVirtualElement {
  file: TAbstractFile | null;
}

interface FileExplorerViewLike {
  requestSort?(): void;
}

type Uninstaller = () => void;

type MethodLike = (...args: unknown[]) => unknown;

type MethodPatch = Record<string, (old: MethodLike) => MethodLike>;

function isMethodLike(value: unknown): value is MethodLike {
  return typeof value === "function";
}

function around(target: object, patches: MethodPatch): Uninstaller {
  const originals = new Map<string | symbol, MethodLike>();
  const record = target as Record<string | symbol, unknown>;

  for (const key of Object.keys(patches)) {
    const factory = patches[key];
    const original = record[key];
    if (!isMethodLike(factory) || !isMethodLike(original)) continue;

    originals.set(key, original);
    record[key] = factory(original);
  }

  return () => {
    for (const [key, original] of originals) {
      record[key] = original;
    }
  };
}

function getFileExplorerLeaf(
  plugin: Plugin
): (ReturnType<Plugin["app"]["workspace"]["getLeavesOfType"]> extends (infer U)[] ? U : never) | undefined {
  const leaves = plugin.app.workspace.getLeavesOfType("file-explorer");
  return leaves[0];
}

function getFileExplorerView(plugin: Plugin): FileExplorerViewLike | undefined {
  const leaf = getFileExplorerLeaf(plugin);
  return leaf?.view as FileExplorerViewLike | undefined;
}

function fileMatches(file: TAbstractFile, regex: RegExp): boolean {
  return regex.test(file.path) || regex.test(file.name);
}

function shouldHideFile(
  file: TAbstractFile | null,
  patterns: FileHiderPattern[]
): boolean {
  if (!file) return false;

  for (const pattern of patterns) {
    if (!pattern.active || pattern.pattern === "") continue;

    try {
      const regex = new RegExp(pattern.pattern);
      if (fileMatches(file, regex)) return true;
    } catch {
      // Ignore invalid regexes.
    }
  }

  return false;
}

export function createFileHiderModule(
  plugin: Plugin,
  settings: SettingsContainer<FileHiderSettings>
): PluginModule {
  let uninstallPatch: Uninstaller | undefined;
  let saveDebounceTimer: ReturnType<typeof setTimeout> | undefined;

  function refreshFileExplorer(): void {
    const view = getFileExplorerView(plugin);
    if (typeof view?.requestSort === "function") {
      view.requestSort();
    }
  }

  function debouncedSave(delayMs = 500) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
      settings
        .set(settings.get())
        .then(() => refreshFileExplorer())
        .catch((error: unknown) => {
          console.error("File Hider: failed to save settings", error);
        });
    }, delayMs);
  }

  async function saveNow() {
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = undefined;
    }
    await settings.set(settings.get());
    refreshFileExplorer();
  }

  function patchFileExplorer(): void {
    const view = getFileExplorerView(plugin);
    if (!view) return;

    const proto = Object.getPrototypeOf(view) as object & {
      getSortedFolderItems?: (...args: unknown[]) => PathVirtualElement[];
      fileHiderPatched?: boolean;
    };

    if (!proto.getSortedFolderItems || proto.fileHiderPatched) return;

    uninstallPatch = around(proto, {
      getSortedFolderItems(old) {
        return function (
          this: unknown,
          ...args: unknown[]
        ): PathVirtualElement[] {
          const children = old.call(this, ...args) as PathVirtualElement[];
          return children.filter(
            (child) => !shouldHideFile(child.file, settings.get().patterns)
          );
        };
      },
    });

    proto.fileHiderPatched = true;
  }

  function unpatchFileExplorer(): void {
    if (uninstallPatch) {
      uninstallPatch();
      uninstallPatch = undefined;
    }

    const view = getFileExplorerView(plugin);
    const proto = view
      ? (Object.getPrototypeOf(view) as { fileHiderPatched?: boolean })
      : undefined;
    if (proto) {
      proto.fileHiderPatched = false;
    }
  }

  return {
    id: "file-hider",
    name: "File Hider",

    load() {
      plugin.app.workspace.onLayoutReady(() => {
        patchFileExplorer();
        refreshFileExplorer();
      });

      plugin.registerEvent(
        plugin.app.workspace.on("layout-change", () => {
          patchFileExplorer();
          refreshFileExplorer();
        })
      );
    },

    unload() {
      unpatchFileExplorer();
    },

    renderSettings(container: HTMLElement): void {
      renderFileHiderSettings(container, settings, debouncedSave, saveNow);
    },
  };
}

function renderFileHiderSettings(
  containerEl: HTMLElement,
  settings: SettingsContainer<FileHiderSettings>,
  debouncedSave: (delayMs?: number) => void,
  saveNow: () => Promise<void>
): void {
  containerEl.empty();

  new Setting(containerEl)
    .setName("Hidden file patterns")
    .setHeading();

  containerEl.createEl("p", {
    text: "Define regex patterns to hide matching files and folders from the sidebar file explorer. Each pattern can be toggled on or off.",
  });

  const table = containerEl.createEl("table", {
    cls: "file-hider-patterns-table",
  });
  const thead = table.createEl("thead");
  const headerRow = thead.createEl("tr");
  headerRow.createEl("th", { text: "Enabled" });
  headerRow.createEl("th", { text: "Name" });
  headerRow.createEl("th", { text: "Regex" });
  headerRow.createEl("th");

  const tbody = table.createEl("tbody");
  settings.get().patterns.forEach((patternConfig) => {
    renderPatternRow(
      patternConfig,
      settings,
      tbody,
      debouncedSave,
      saveNow,
      () => renderFileHiderSettings(containerEl, settings, debouncedSave, saveNow)
    );
  });

  new Setting(containerEl).addButton((button) =>
    button
      .setButtonText("Add new pattern")
      .setCta()
      .onClick(async () => {
        settings.get().patterns.push({
          name: "",
          pattern: "",
          active: true,
        });
        await saveNow();
        renderFileHiderSettings(containerEl, settings, debouncedSave, saveNow);
      })
  );
}

function renderPatternRow(
  patternConfig: FileHiderPattern,
  settings: SettingsContainer<FileHiderSettings>,
  tbody: HTMLElement,
  debouncedSave: (delayMs?: number) => void,
  saveNow: () => Promise<void>,
  redraw: () => void
): void {
  const row = tbody.createEl("tr", { cls: "file-hider-pattern-row" });

  const toggleCell = row.createEl("td", { cls: "file-hider-cell-toggle" });
  toggleCell.createEl(
    "input",
    { type: "checkbox", cls: "file-hider-toggle" },
    (el) => {
      el.checked = patternConfig.active;
      el.addEventListener("change", async () => {
        patternConfig.active = el.checked;
        await saveNow();
      });
    }
  );

  const nameCell = row.createEl("td", { cls: "file-hider-cell-name" });
  nameCell.createEl(
    "input",
    {
      type: "text",
      cls: "file-hider-table-input",
      placeholder: 'e.g., "dotfiles"',
    },
    (el) => {
      el.value = patternConfig.name;
      el.addEventListener("input", () => {
        patternConfig.name = el.value;
        debouncedSave();
      });
    }
  );

  const regexCell = row.createEl("td", { cls: "file-hider-cell-regex" });
  regexCell.createEl(
    "input",
    {
      type: "text",
      cls: "file-hider-table-input",
      placeholder: 'e.g., "^\\."',
    },
    (el) => {
      el.value = patternConfig.pattern;
      el.addEventListener("input", () => {
        patternConfig.pattern = el.value;
        try {
          new RegExp(el.value);
          el.removeClass("file-hider-invalid-regex");
        } catch {
          el.addClass("file-hider-invalid-regex");
        }
        debouncedSave();
      });
    }
  );

  const removeCell = row.createEl("td", { cls: "file-hider-cell-remove" });
  removeCell.createEl(
    "button",
    {
      cls: "clickable-icon file-hider-remove-btn",
      attr: { "aria-label": "Remove pattern" },
    },
    (el) => {
      el.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
      el.addEventListener("click", async () => {
        const patterns = settings.get().patterns;
        settings.update({
          patterns: patterns.filter((p) => p !== patternConfig),
        });
        await saveNow();
        redraw();
      });
    }
  );
}

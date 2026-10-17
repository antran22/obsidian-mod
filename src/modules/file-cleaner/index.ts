import {
  App,
  Notice,
  Plugin,
  Setting,
  TAbstractFile,
  TFile,
  TFolder,
} from "obsidian";
import type { PluginModule, SettingsContainer } from "../../module";
import { CleanupPreviewModal } from "./confirm-modal";
import {
  DEFAULT_FILE_CLEANER_SETTINGS,
  type FileCleanerSettings,
  type FilterMode,
} from "./settings";

export { DEFAULT_FILE_CLEANER_SETTINGS, type FileCleanerSettings };

interface BacklinksData {
  data: Map<string, unknown>;
}

interface ExtendedMetadataCache {
  getBacklinksForFile?: (file: TFile) => BacklinksData;
}

export function createFileCleanerModule(
  plugin: Plugin,
  settings: SettingsContainer<FileCleanerSettings>
): PluginModule {
  const runCleanupCommand = async () => {
    const result = await scanVault(plugin.app, settings.get());
    const items: TAbstractFile[] = [...result.files, ...result.folders];

    if (items.length === 0) {
      new Notice("No unused files or empty folders found.");
      return;
    }

    if (settings.get().showPreview) {
      const modal = new CleanupPreviewModal(plugin.app, items, async (selected) => {
        await deleteItems(plugin.app, selected, settings.get());
      });
      modal.open();
    } else {
      await deleteItems(plugin.app, items, settings.get());
    }
  };

  return {
    id: "file-cleaner",
    name: "File Cleaner",

    load() {
      plugin.addRibbonIcon("trash", "Clean unused files", () => {
        runCleanupCommand().catch((error) => {
          console.error("File Cleaner: cleanup failed", error);
          new Notice("File Cleaner: cleanup failed.");
        });
      });

      plugin.addCommand({
        id: "clean-unused-files",
        name: "Clean unused files",
        callback: () => {
          runCleanupCommand().catch((error) => {
            console.error("File Cleaner: cleanup failed", error);
            new Notice("File Cleaner: cleanup failed.");
          });
        },
      });

      if (settings.get().runOnStartup) {
        plugin.app.workspace.onLayoutReady(() => {
          window.setTimeout(() => {
            runCleanupCommand().catch((error) => {
              console.error("File Cleaner: startup cleanup failed", error);
            });
          }, 1000);
        });
      }
    },

    unload() {
      // Ribbon icons and commands are cleaned up automatically by Obsidian.
    },

    renderSettings(container) {
      renderFileCleanerSettings(container, settings);
    },
  };
}

async function scanVault(
  app: App,
  settings: FileCleanerSettings
): Promise<{ files: TFile[]; folders: TFolder[] }> {
  const inUseAttachments = getInUseAttachmentPaths(app);
  const folders = getSortedFolders(app);

  const filesToRemove: TFile[] = [];
  const foldersToRemove: Set<TFolder> = new Set();

  for (const folder of folders) {
    if (!matchesFolderFilter(folder, settings)) continue;

    const files = getFilesInFolder(folder);
    let remainingFileCount = files.length;

    for (const file of files) {
      if (inUseAttachments.has(file.path)) continue;

      const shouldRemove =
        file.extension === "md"
          ? await isUnusedMarkdown(file, app, settings)
          : isUnusedAttachment(file, settings);

      if (shouldRemove) {
        filesToRemove.push(file);
        remainingFileCount -= 1;
      }
    }

    if (
      remainingFileCount === 0 &&
      !folder.isRoot() &&
      settings.removeEmptyFolders &&
      matchesFolderFilter(folder, settings)
    ) {
      foldersToRemove.add(folder);
    }
  }

  // Unmark folders that contain subfolders not marked for removal.
  for (const folder of [...foldersToRemove]) {
    const subFolders = getSubFoldersInFolder(folder);
    if (subFolders.some((sub) => !foldersToRemove.has(sub))) {
      foldersToRemove.delete(folder);
    }
  }

  return { files: filesToRemove, folders: [...foldersToRemove] };
}

function getInUseAttachmentPaths(app: App): Set<string> {
  const paths = new Set<string>();
  for (const fileLinks of Object.values(app.metadataCache.resolvedLinks)) {
    for (const path of Object.keys(fileLinks)) {
      if (!path.endsWith(".md")) {
        paths.add(path);
      }
    }
  }
  return paths;
}

function getSortedFolders(app: App): TFolder[] {
  const folders = app.vault
    .getAllLoadedFiles()
    .filter((file): file is TFolder => "children" in file)
    .filter((folder) => folder.path !== "/");

  folders.sort((a, b) => {
    const depthA = a.path.split("/").length;
    const depthB = b.path.split("/").length;
    return depthB - depthA || a.path.localeCompare(b.path);
  });

  folders.push(app.vault.getRoot());
  return folders;
}

function getFilesInFolder(folder: TFolder): TFile[] {
  return folder.children.filter((child): child is TFile => !("children" in child));
}

function getSubFoldersInFolder(folder: TFolder): TFolder[] {
  return folder.children.filter(
    (child): child is TFolder => "children" in child
  );
}

async function isUnusedMarkdown(
  file: TFile,
  app: App,
  settings: FileCleanerSettings
): Promise<boolean> {
  if (!settings.deleteEmptyMarkdownFiles) return false;

  const cache = app.metadataCache as unknown as ExtendedMetadataCache;
  const backlinks = cache.getBacklinksForFile?.(file);
  if (
    backlinks &&
    backlinks.data.size > 0 &&
    !settings.deleteEmptyMarkdownFilesWithBacklinks
  ) {
    return false;
  }

  if (file.stat.size === 0) return true;

  const content = await app.vault.cachedRead(file);
  if (content.trim().length === 0) return true;

  const fileCache = app.metadataCache.getFileCache(file);
  if (fileCache?.sections?.length === 1 && fileCache.frontmatter) {
    if (settings.ignoreAllFrontmatter) return true;

    const keys = Object.keys(fileCache.frontmatter);
    return (
      keys.length > 0 &&
      keys.every((key) => settings.ignoredFrontmatter.includes(key))
    );
  }

  return false;
}

function isUnusedAttachment(file: TFile, settings: FileCleanerSettings): boolean {
  const configured = settings.attachmentExtensions.map(normalizeExtension);
  const fileExtension = normalizeExtension(file.extension);
  const matched = configured.includes(fileExtension);

  return settings.extensionFilterMode === "include" ? matched : !matched;
}

function normalizeExtension(extension: string): string {
  return extension.toLowerCase().replace(/^\.+/, "");
}

function matchesFolderFilter(
  folder: TFolder,
  settings: FileCleanerSettings
): boolean {
  if (settings.folderFilters.length === 0) {
    return settings.folderFilterMode === "exclude";
  }

  const matched = settings.folderFilters.some((pattern) => {
    try {
      return new RegExp(`^${pattern}`).test(folder.path);
    } catch {
      return folder.path.startsWith(pattern);
    }
  });

  return settings.folderFilterMode === "include" ? matched : !matched;
}

async function deleteItems(
  app: App,
  items: TAbstractFile[],
  settings: FileCleanerSettings
): Promise<void> {
  if (items.length === 0) {
    new Notice("No items selected for deletion.");
    return;
  }

  // Delete deeper paths first so parents can be removed cleanly.
  const sorted = [...items].sort((a, b) => b.path.length - a.path.length);

  for (const item of sorted) {
    if (!(await app.vault.adapter.exists(item.path))) continue;

    switch (settings.deletionDestination) {
      case "obsidian-global":
        await app.fileManager.trashFile(item);
        break;
      case "permanent":
        await app.vault.delete(item, true);
        break;
      case "system-trash":
        await app.vault.trash(item, true);
        break;
      case "obsidian-trash":
        await app.vault.trash(item, false);
        break;
    }
  }

  new Notice(`File Cleaner: removed ${items.length} item(s).`);
}

function renderFileCleanerSettings(
  container: HTMLElement,
  settings: SettingsContainer<FileCleanerSettings>
): void {

  new Setting(container)
    .setName("Deletion destination")
    .setDesc("Where removed files and folders should go.")
    .addDropdown((dropdown) =>
      dropdown
        .addOption("obsidian-global", "Use Obsidian global trash setting")
        .addOption("system-trash", "System trash")
        .addOption("obsidian-trash", "Obsidian trash (.trash)")
        .addOption("permanent", "Permanently delete")
        .setValue(settings.get().deletionDestination)
        .onChange(async (value) => {
          await settings.update({
            deletionDestination: value as FileCleanerSettings["deletionDestination"],
          });
        })
    );

  new Setting(container)
    .setName("Show preview")
    .setDesc("Show a confirmation dialog with the list of items to delete.")
    .addToggle((toggle) =>
      toggle.setValue(settings.get().showPreview).onChange(async (value) => {
        await settings.update({ showPreview: value });
      })
    );

  new Setting(container)
    .setName("Run on startup")
    .setDesc("Run the cleaner automatically when Obsidian starts.")
    .addToggle((toggle) =>
      toggle.setValue(settings.get().runOnStartup).onChange(async (value) => {
        await settings.update({ runOnStartup: value });
      })
    );

  new Setting(container)
    .setName("Remove empty folders")
    .setDesc("Delete folders that become empty after unused files are removed.")
    .addToggle((toggle) =>
      toggle
        .setValue(settings.get().removeEmptyFolders)
        .onChange(async (value) => {
          await settings.update({ removeEmptyFolders: value });
        })
    );

  container.createEl("h3", { text: "Markdown files" });

  new Setting(container)
    .setName("Delete empty Markdown files")
    .setDesc("Remove Markdown files that are empty and not referenced.")
    .addToggle((toggle) =>
      toggle
        .setValue(settings.get().deleteEmptyMarkdownFiles)
        .onChange(async (value) => {
          await settings.update({ deleteEmptyMarkdownFiles: value });
        })
    );

  new Setting(container)
    .setName("Delete empty Markdown files with backlinks")
    .setDesc(
      "Allow deleting empty Markdown files even if other files link to them."
    )
    .addToggle((toggle) =>
      toggle
        .setValue(settings.get().deleteEmptyMarkdownFilesWithBacklinks)
        .onChange(async (value) => {
          await settings.update({ deleteEmptyMarkdownFilesWithBacklinks: value });
        })
    );

  new Setting(container)
    .setName("Ignored frontmatter properties")
    .setDesc(
      "Comma or newline separated list. Markdown files containing only these frontmatter properties are considered empty."
    )
    .addTextArea((text) => {
      text
        .setPlaceholder("tags\ncreated")
        .setValue(settings.get().ignoredFrontmatter.join("\n"))
        .onChange(async (value) => {
          const list = parseStringList(value);
          await settings.update({ ignoredFrontmatter: list });
        });
      text.inputEl.rows = 4;
    });

  new Setting(container)
    .setName("Ignore all frontmatter")
    .setDesc(
      "Consider Markdown files empty even if they contain any frontmatter."
    )
    .addToggle((toggle) =>
      toggle
        .setValue(settings.get().ignoreAllFrontmatter)
        .onChange(async (value) => {
          await settings.update({ ignoreAllFrontmatter: value });
        })
    );

  container.createEl("h3", { text: "Attachments" });

  new Setting(container)
    .setName("Attachment extension filter mode")
    .setDesc(
      "Include only scans extensions listed below. Exclude scans all extensions except those listed."
    )
    .addDropdown((dropdown) =>
      dropdown
        .addOption("exclude", "Exclude listed extensions")
        .addOption("include", "Include only listed extensions")
        .setValue(settings.get().extensionFilterMode)
        .onChange(async (value) => {
          await settings.update({
            extensionFilterMode: value as FilterMode,
          });
        })
    );

  new Setting(container)
    .setName("Attachment extensions")
    .setDesc(
      "One extension per line (without the dot). Example: png, jpg, pdf."
    )
    .addTextArea((text) => {
      text
        .setPlaceholder("png\njpg\npdf")
        .setValue(settings.get().attachmentExtensions.join("\n"))
        .onChange(async (value) => {
          const list = parseStringList(value).map(normalizeExtension);
          await settings.update({ attachmentExtensions: list });
        });
      text.inputEl.rows = 4;
    });

  container.createEl("h3", { text: "Folders" });

  new Setting(container)
    .setName("Folder filter mode")
    .setDesc(
      "Exclude skips folders matching the patterns below. Include only scans folders that match."
    )
    .addDropdown((dropdown) =>
      dropdown
        .addOption("exclude", "Exclude matching folders")
        .addOption("include", "Include only matching folders")
        .setValue(settings.get().folderFilterMode)
        .onChange(async (value) => {
          await settings.update({ folderFilterMode: value as FilterMode });
        })
    );

  new Setting(container)
    .setName("Folder filters")
    .setDesc(
      "One pattern per line. Patterns are matched against the start of the folder path as regular expressions."
    )
    .addTextArea((text) => {
      text
        .setPlaceholder("templates\narchive")
        .setValue(settings.get().folderFilters.join("\n"))
        .onChange(async (value) => {
          const list = parseStringList(value);
          await settings.update({ folderFilters: list });
        });
      text.inputEl.rows = 4;
    });
}

function parseStringList(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

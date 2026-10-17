export type DeletionDestination =
  | "obsidian-global"
  | "permanent"
  | "system-trash"
  | "obsidian-trash";

export type FilterMode = "exclude" | "include";

export interface FileCleanerSettings {
  deletionDestination: DeletionDestination;
  folderFilterMode: FilterMode;
  folderFilters: string[];
  extensionFilterMode: FilterMode;
  attachmentExtensions: string[];
  deleteEmptyMarkdownFiles: boolean;
  deleteEmptyMarkdownFilesWithBacklinks: boolean;
  ignoredFrontmatter: string[];
  ignoreAllFrontmatter: boolean;
  removeEmptyFolders: boolean;
  showPreview: boolean;
  runOnStartup: boolean;
}

export const DEFAULT_FILE_CLEANER_SETTINGS: FileCleanerSettings = {
  deletionDestination: "obsidian-global",
  folderFilterMode: "exclude",
  folderFilters: [],
  extensionFilterMode: "include",
  attachmentExtensions: [],
  deleteEmptyMarkdownFiles: true,
  deleteEmptyMarkdownFilesWithBacklinks: false,
  ignoredFrontmatter: [],
  ignoreAllFrontmatter: false,
  removeEmptyFolders: false,
  showPreview: true,
  runOnStartup: false,
};

export interface FileHiderPattern {
  name: string;
  pattern: string;
  active: boolean;
}

export interface FileHiderSettings {
  patterns: FileHiderPattern[];
}

export const DEFAULT_FILE_HIDER_SETTINGS: FileHiderSettings = {
  patterns: [
    {
      name: "Hidden files",
      pattern: "^\\.",
      active: false,
    },
  ],
};

export interface UrlPattern {
  name: string;
  pattern: string;
  formatString: string;
  patternEnabled: boolean;
}

export interface UrlFormatterSettings {
  urlPatterns: UrlPattern[];
  enableTitleFetch: boolean;
  titleFetchTimeout: number;
}

export const DEFAULT_URL_FORMATTER_SETTINGS: UrlFormatterSettings = {
  urlPatterns: [
    {
      name: "Tickets per company",
      pattern:
        "https:\\/\\/([A-Za-z0-9-]+)\\.example\\.com\\/([A-Z0-9-]+)",
      formatString: "$2 ($1)",
      patternEnabled: true,
    },
  ],
  enableTitleFetch: false,
  titleFetchTimeout: 5000,
};

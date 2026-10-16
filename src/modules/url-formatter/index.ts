import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { Plugin, Setting } from "obsidian";
import type { PluginModule, SettingsContainer } from "../../module";
import {
  escapeMarkdownTitle,
  getSelection,
  isEditorCursorInLink,
  isSafeInsertPosition,
} from "./selection";
import {
  DEFAULT_URL_FORMATTER_SETTINGS,
  type UrlFormatterSettings,
  type UrlPattern,
} from "./settings";
import { fetchUrlTitle } from "./title-fetcher";

export { DEFAULT_URL_FORMATTER_SETTINGS, type UrlFormatterSettings };

export function createUrlFormatterModule(
  plugin: Plugin,
  settings: SettingsContainer<UrlFormatterSettings>
): PluginModule {
  type SaveTimer = NodeJS.Timeout | undefined;

  let saveDebounceTimer: SaveTimer = undefined;

  function debouncedSave(delayMs = 500) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
      settings.set(settings.get()).catch((error: unknown) => {
        console.error("URL Formatter: failed to save settings", error);
      });
    }, delayMs);
  }

  async function saveNow() {
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = undefined;
    }
    await settings.set(settings.get());
  }

  function formatMarkdownLink(title: string, url: string): string {
    const escapedText = escapeMarkdownTitle(title);
    return `[${escapedText}](${url})`;
  }

  function formatUrl(url: string): string | null {
    for (const patternConfig of settings.get().urlPatterns) {
      if (patternConfig.patternEnabled === false) continue;

      try {
        const regex = new RegExp(patternConfig.pattern);
        const match = url.match(regex);

        if (match) {
          let formattedDisplayText = patternConfig.formatString;

          for (let i = 0; i < match.length; i++) {
            const placeholder = `$${i}`;
            formattedDisplayText = formattedDisplayText
              .split(placeholder)
              .join(match[i] ?? "");
          }

          return `[${formattedDisplayText}](${url})`;
        }
      } catch (e) {
        console.error(
          `URL Formatter: invalid regex pattern "${patternConfig.pattern}":`,
          e
        );
      }
    }

    return null;
  }

  function isUrl(text: string): boolean {
    try {
      new URL(text);
      return true;
    } catch {
      return false;
    }
  }

  function tryWrapSelection(
    url: string,
    event: ClipboardEvent,
    view: EditorView
  ): boolean {
    const selection = getSelection(view);

    if (!selection) {
      return false;
    }

    event.preventDefault();
    const markdownLink = formatMarkdownLink(selection.text, url);

    view.dispatch({
      changes: {
        from: selection.from,
        to: selection.to,
        insert: markdownLink,
      },
      selection: { anchor: selection.from + markdownLink.length },
    });

    return true;
  }

  function tryFormatRegexes(
    url: string,
    event: ClipboardEvent,
    view: EditorView
  ): boolean {
    const formatted = formatUrl(url);
    if (!formatted) {
      return false;
    }

    event.preventDefault();

    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: formatted },
      selection: { anchor: from + formatted.length },
    });

    return true;
  }

  function tryTitleFetch(
    url: string,
    event: ClipboardEvent,
    view: EditorView
  ): boolean {
    event.preventDefault();

    const { from, to } = view.state.selection.main;

    (async () => {
      try {
        const tempString = "🔄";
        view.dispatch({
          changes: { from, to, insert: tempString },
          selection: { anchor: from + tempString.length },
        });

        const newTo = from + tempString.length;

        const title = await fetchUrlTitle(
          url,
          settings.get().titleFetchTimeout
        );

        if (title) {
          const markdownLink = formatMarkdownLink(title, url);

          view.dispatch({
            changes: { from, to: newTo, insert: markdownLink },
            selection: { anchor: from + markdownLink.length },
          });
        } else {
          view.dispatch({
            changes: { from, to: newTo, insert: url },
            selection: { anchor: from + url.length },
          });
        }
      } catch (error) {
        console.error("URL Formatter: title fetch error:", error);
        view.dispatch({
          changes: { from, to, insert: url },
          selection: { anchor: from + url.length },
        });
      }
    })();

    return true;
  }

  function createPasteHandler(): Extension {
    return EditorView.domEventHandlers({
      paste: (event: ClipboardEvent, view: EditorView) => {
        const pastedText = event.clipboardData?.getData("text");

        if (
          !pastedText ||
          !isUrl(pastedText) ||
          !isSafeInsertPosition(view)
        ) {
          return false;
        }

        if (isEditorCursorInLink(view)) {
          return false;
        }

        const url = pastedText.trim();

        if (tryWrapSelection(url, event, view)) {
          return true;
        }

        if (tryFormatRegexes(url, event, view)) {
          return true;
        }

        if (settings.get().enableTitleFetch) {
          return tryTitleFetch(url, event, view);
        }

        return false;
      },
    });
  }

  return {
    id: "url-formatter",
    name: "URL Formatter",

    load() {
      plugin.registerEditorExtension(createPasteHandler());
    },

    unload() {},

    renderSettings(container) {
      renderUrlFormatterSettings(container, settings, debouncedSave, saveNow);
    },
  };
}

function renderUrlFormatterSettings(
  containerEl: HTMLElement,
  settings: SettingsContainer<UrlFormatterSettings>,
  debouncedSave: (delayMs?: number) => void,
  saveNow: () => Promise<void>
): void {
  containerEl.empty();

  new Setting(containerEl).setName("Custom url patterns").setHeading();
  containerEl.createEl("p").innerHTML =
    "Define custom url patterns to automatically format pasted links into clean Markdown.<br>Each pattern requires:";

  const ul = containerEl.createEl("ul");
  ul.createEl("li", { text: "A friendly name for identification." });
  ul.createEl("li", {
    text: "A regular expression (regex) that matches the full url.",
  });
  const liWithCode = ul.createEl("li");
  liWithCode.innerHTML =
    "An output format string using <code>$0</code> for the full match, and <code>$1</code>, <code>$2</code>, etc., for capture groups. Remember to escape special characters (like . / ?).";
  ul.createEl("li", {
    text: "You can easily toggle each pattern on or off.",
  });

  const table = containerEl.createEl("table", {
    cls: "url-formatter-patterns-table",
  });
  const thead = table.createEl("thead");
  const headerRow = thead.createEl("tr");
  headerRow.createEl("th", { text: "Enabled" });
  headerRow.createEl("th", { text: "Name" });
  headerRow.createEl("th", { text: "Regex" });
  headerRow.createEl("th", { text: "Format" });
  headerRow.createEl("th");

  const tbody = table.createEl("tbody");
  settings.get().urlPatterns.forEach((patternConfig) => {
    renderPatternRow(
      patternConfig,
      settings,
      tbody,
      debouncedSave,
      saveNow,
      () => renderUrlFormatterSettings(containerEl, settings, debouncedSave, saveNow)
    );
  });

  new Setting(containerEl).addButton((button) =>
    button
      .setButtonText("Add new pattern")
      .setCta()
      .onClick(async () => {
        settings.get().urlPatterns.push({
          name: "",
          pattern: "",
          formatString: "",
          patternEnabled: true,
        });
        await saveNow();
        renderUrlFormatterSettings(
          containerEl,
          settings,
          debouncedSave,
          saveNow
        );
      })
  );

  new Setting(containerEl).setName("Title Fallback").setHeading();

  containerEl.createEl("p", {
    text: "When no pattern matches, you can optionally fetch the page title from the URL.",
  });

  new Setting(containerEl)
    .setName("Enable title fetching")
    .setDesc("Automatically fetch page title when no pattern matches")
    .addToggle((toggle) =>
      toggle
        .setValue(settings.get().enableTitleFetch)
        .onChange(async (value) => {
          settings.get().enableTitleFetch = value;
          await saveNow();
        })
    );

  new Setting(containerEl)
    .setName("Fetch timeout (seconds)")
    .setDesc("Maximum time to wait for title fetch (1-30 seconds)")
    .addText((text) =>
      text
        .setValue(String(settings.get().titleFetchTimeout / 1000))
        .setPlaceholder("5")
        .onChange(async (value) => {
          const seconds = Math.max(1, Math.min(30, parseInt(value) || 5));
          settings.get().titleFetchTimeout = seconds * 1000;
          await saveNow();
        })
    );

  const infoDiv = containerEl.createDiv("url-formatter-info-box");
  infoDiv.createEl("h4", { text: "Paste Behavior" });

  const ol = infoDiv.createEl("ol");
  ol.createEl("li", {
    text: "If text is selected → URL is wrapped with selection as link title",
  });
  ol.createEl("li", {
    text: "If no selection and pattern matches → URL is formatted using pattern",
  });
  ol.createEl("li", {
    text: "If no match and title fetch enabled → Title is fetched from URL",
  });
  ol.createEl("li", { text: "Otherwise → URL is pasted as-is" });

  containerEl.createEl("p", {
    text: "Note: Selection always takes priority over pattern matching.",
    cls: "url-formatter-note",
  });
}

function renderPatternRow(
  patternConfig: UrlPattern,
  settings: SettingsContainer<UrlFormatterSettings>,
  tbody: HTMLElement,
  debouncedSave: (delayMs?: number) => void,
  saveNow: () => Promise<void>,
  redraw: () => void
): void {
  const row = tbody.createEl("tr", { cls: "url-formatter-pattern-row" });

  const toggleCell = row.createEl("td", { cls: "url-formatter-cell-toggle" });
  toggleCell.createEl(
    "input",
    { type: "checkbox", cls: "url-formatter-toggle" },
    (el) => {
      el.checked = patternConfig.patternEnabled;
      el.addEventListener("change", async () => {
        patternConfig.patternEnabled = el.checked;
        await saveNow();
      });
    }
  );

  const nameCell = row.createEl("td", { cls: "url-formatter-cell-name" });
  nameCell.createEl(
    "input",
    {
      type: "text",
      cls: "url-formatter-table-input",
      placeholder: 'e.g., "example.com"',
    },
    (el) => {
      el.value = patternConfig.name;
      el.addEventListener("input", () => {
        patternConfig.name = el.value;
        debouncedSave();
      });
    }
  );

  const regexCell = row.createEl("td", { cls: "url-formatter-cell-regex" });
  regexCell.createEl(
    "input",
    {
      type: "text",
      cls: "url-formatter-table-input",
      placeholder: 'e.g., "https://..."',
    },
    (el) => {
      el.value = patternConfig.pattern;
      el.addEventListener("input", () => {
        patternConfig.pattern = el.value;
        try {
          new RegExp(el.value);
          el.removeClass("url-formatter-invalid-regex");
        } catch {
          el.addClass("url-formatter-invalid-regex");
        }
        debouncedSave();
      });
    }
  );

  const formatCell = row.createEl("td", { cls: "url-formatter-cell-format" });
  formatCell.createEl(
    "input",
    {
      type: "text",
      cls: "url-formatter-table-input",
      placeholder: 'e.g., "$2 ($1)"',
    },
    (el) => {
      el.value = patternConfig.formatString;
      el.addEventListener("input", () => {
        patternConfig.formatString = el.value;
        debouncedSave();
      });
    }
  );

  const removeCell = row.createEl("td", { cls: "url-formatter-cell-remove" });
  removeCell.createEl(
    "button",
    {
      cls: "clickable-icon url-formatter-remove-btn",
      attr: { "aria-label": "Remove pattern" },
    },
    (el) => {
      el.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
      el.addEventListener("click", async () => {
        const patterns = settings.get().urlPatterns;
        settings.update({ urlPatterns: patterns.filter((p) => p !== patternConfig) });
        await saveNow();
        redraw();
      });
    }
  );
}

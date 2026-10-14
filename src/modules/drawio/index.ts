import { execFile } from "child_process";
import {
  FileSystemAdapter,
  MarkdownView,
  Menu,
  Modal,
  Notice,
  Plugin,
  Setting,
  TAbstractFile,
  TFile,
} from "obsidian";
import type { PluginModule, SettingsContainer } from "../../module";
import DEFAULT_DIAGRAM from "./default-diagram.svg";
import { DEFAULT_DRAWIO_SETTINGS, type DrawioSettings } from "./settings";

export { DEFAULT_DRAWIO_SETTINGS, type DrawioSettings };

class NamePromptModal extends Modal {
  private value = "";

  constructor(app: Plugin["app"], private readonly onSubmit: (name: string) => void) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("New draw.io diagram");

    const submit = () => {
      const name = this.value.trim();
      if (!name) return;
      this.close();
      this.onSubmit(name);
    };

    new Setting(this.contentEl).setName("Name").addText((text) => {
      text
        .setPlaceholder("my-diagram")
        .onChange((value) => (this.value = value));
      text.inputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          submit();
        }
      });
      setTimeout(() => text.inputEl.focus(), 0);
    });

    new Setting(this.contentEl).addButton((button) =>
      button.setButtonText("Create").setCta().onClick(submit)
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

function openInDrawio(fullPath: string): void {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", ["-b", "com.jgraph.drawio.desktop", fullPath]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", "draw.io", fullPath]]
        : ["drawio", [fullPath]];

  execFile(cmd, args, (error) => {
    if (error) new Notice(`Could not open draw.io: ${error.message}`);
  });
}

function isDrawioFile(file: TAbstractFile | null): file is TFile {
  return file instanceof TFile && /\.drawio\.svg$/i.test(file.path);
}

export function createDrawioModule(
  plugin: Plugin,
  _settings: SettingsContainer<DrawioSettings>
): PluginModule {
  const headerActions = new Map<unknown, HTMLElement>();

  return {
    id: "drawio-quick-action",
    name: "Draw.io Quick Action",

    load() {
      plugin.addCommand({
        id: "create-drawio-diagram",
        name: "Create draw.io diagram",
        editorCallback: (editor, view) => {
          const markdownView = view instanceof MarkdownView ? view : null;
          new NamePromptModal(plugin.app, (name) => {
            createDiagram(plugin, name, editor, markdownView).catch((error) => {
              new Notice(`Failed to create diagram: ${error.message}`);
            });
          }).open();
        },
      });

      plugin.registerEvent(
        plugin.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
          if (!isDrawioFile(file)) return;
          menu.addItem((item) =>
            item
              .setTitle("Edit in draw.io")
              .setIcon("pencil")
              .onClick(() => openDrawioFile(plugin, file))
          );
        })
      );

      const refresh = () => refreshHeaderActions(plugin, headerActions);
      plugin.registerEvent(plugin.app.workspace.on("layout-change", refresh));
      plugin.registerEvent(plugin.app.workspace.on("file-open", refresh));
      plugin.app.workspace.onLayoutReady(refresh);
    },

    unload() {
      for (const element of headerActions.values()) {
        element.remove();
      }
      headerActions.clear();
    },

    renderSettings(container) {
      container.createEl("p", {
        text: "No settings",
      });
    },
  };
}

async function createDiagram(
  plugin: Plugin,
  name: string,
  editor: { replaceSelection: (text: string) => void },
  view: MarkdownView | null
): Promise<void> {
  const base = name.replace(/\.drawio\.svg$/i, "").replace(/\.svg$/i, "");
  const sourcePath = view?.file?.path ?? "";
  const diagramPath = await plugin.app.fileManager.getAvailablePathForAttachment(
    `${base}.drawio.svg`,
    sourcePath
  );

  const diagram = DEFAULT_DIAGRAM.trim().length > 0
    ? DEFAULT_DIAGRAM
    : "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<svg></svg>\n";

  const file = await plugin.app.vault.create(diagramPath, diagram);
  const link = plugin.app.fileManager.generateMarkdownLink(file, sourcePath);
  editor.replaceSelection(`!${link}`);
  openDrawioFile(plugin, file);
}

function openDrawioFile(plugin: Plugin, file: TFile): void {
  const adapter = plugin.app.vault.adapter;
  if (adapter instanceof FileSystemAdapter) {
    openInDrawio(adapter.getFullPath(file.path));
  } else {
    new Notice("draw.io integration requires a local vault.");
  }
}

interface ActionableView {
  addAction(icon: string, title: string, callback: () => void): HTMLElement;
  file: TAbstractFile | null;
}

function refreshHeaderActions(
  plugin: Plugin,
  headerActions: Map<unknown, HTMLElement>
): void {
  const seen = new Set<unknown>();

  plugin.app.workspace.iterateAllLeaves((leaf) => {
    const view = leaf.view as unknown as Partial<ActionableView>;
    if (typeof view.addAction !== "function") return;
    seen.add(view);

    const file = view.file ?? null;
    const existing = headerActions.get(view);

    if (isDrawioFile(file)) {
      if (!existing) {
        const element = view.addAction("pencil", "Edit in draw.io", () => {
          openDrawioFile(plugin, file);
        });
        headerActions.set(view, element);
      }
    } else if (existing) {
      existing.remove();
      headerActions.delete(view);
    }
  });

  for (const view of headerActions.keys()) {
    if (!seen.has(view)) headerActions.delete(view);
  }
}

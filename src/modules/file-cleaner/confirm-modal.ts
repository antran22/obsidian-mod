import { App, Modal, TAbstractFile, TFile, TFolder } from "obsidian";

export class CleanupPreviewModal extends Modal {
  private selected: Set<TAbstractFile>;
  private checkboxes: HTMLInputElement[] = [];

  constructor(
    app: App,
    private readonly items: TAbstractFile[],
    private readonly onConfirm: (selected: TAbstractFile[]) => void
  ) {
    super(app);
    this.selected = new Set(items);
  }

  onOpen(): void {
    this.titleEl.setText("Clean unused files");

    this.contentEl.createEl("p", {
      text: `${this.items.length} unused item(s) found. Uncheck items to keep them.`,
    });

    const list = this.contentEl.createEl("ul", {
      cls: "file-cleaner-preview-list",
    });

    const sorted = [...this.items].sort((a, b) =>
      a.path.localeCompare(b.path)
    );

    for (const item of sorted) {
      const li = list.createEl("li", { cls: "file-cleaner-preview-item" });
      const label = li.createEl("label", { cls: "file-cleaner-preview-label" });
      const checkbox = label.createEl("input", {
        type: "checkbox",
        cls: "file-cleaner-preview-checkbox",
      });
      checkbox.checked = this.selected.has(item);
      checkbox.addEventListener("change", () => {
        this.setSelected(item, checkbox.checked);
      });
      this.checkboxes.push(checkbox);

      const icon = label.createSpan({ cls: "file-cleaner-preview-icon" });
      icon.textContent = item instanceof TFolder ? "📁" : "📄";

      const pathSpan = label.createSpan({ cls: "file-cleaner-preview-path" });
      pathSpan.textContent = item.path;
    }

    const buttonRow = this.contentEl.createDiv({
      cls: "file-cleaner-preview-buttons",
    });

    const leftGroup = buttonRow.createDiv();
    leftGroup
      .createEl("button", { text: "Select all" })
      .addEventListener("click", () => this.setAll(true));
    leftGroup
      .createEl("button", { text: "Unselect all" })
      .addEventListener("click", () => this.setAll(false));

    const rightGroup = buttonRow.createDiv();
    rightGroup
      .createEl("button", { text: "Cancel" })
      .addEventListener("click", () => this.close());
    rightGroup
      .createEl("button", { text: "Delete selected", cls: "mod-warning" })
      .addEventListener("click", () => {
        this.close();
        this.onConfirm([...this.selected]);
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private setSelected(item: TAbstractFile, selected: boolean): void {
    if (selected) {
      this.selected.add(item);
    } else {
      this.selected.delete(item);
    }
  }

  private setAll(selected: boolean): void {
    for (const checkbox of this.checkboxes) {
      checkbox.checked = selected;
    }
    if (selected) {
      for (const item of this.items) {
        this.selected.add(item);
      }
    } else {
      this.selected.clear();
    }
  }
}

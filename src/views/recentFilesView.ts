import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import { VIEW_TYPE_RECENT_FILES, NotePackSettings } from "../types";

export class RecentFilesView extends ItemView {
  private settings: NotePackSettings;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(leaf: WorkspaceLeaf, settings: NotePackSettings) {
    super(leaf);
    this.settings = settings;
  }

  getViewType(): string {
    return VIEW_TYPE_RECENT_FILES;
  }

  getDisplayText(): string {
    return "Recent Files";
  }

  getIcon(): string {
    return "clock";
  }

  updateSettings(settings: NotePackSettings): void {
    this.settings = settings;
    this.render();
  }

  async onOpen(): Promise<void> {
    this.render();

    // Re-render periodically since mtime changes don't trigger a specific event
    this.refreshTimer = setInterval(() => this.render(), 10000);

    // Also re-render on layout change (file open, etc.)
    this.registerEvent(
      this.app.vault.on("modify", () => {
        // Debounce: re-render after a short delay
        setTimeout(() => this.render(), 1000);
      })
    );
  }

  async onClose(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("notepack-view");

    const header = container.createDiv({ cls: "notepack-view-header" });
    header.createEl("h4", { text: "Recent Files" });

    const files = this.getRecentFiles();

    if (files.length === 0) {
      container.createDiv({
        cls: "notepack-empty",
        text: "No recently modified files found.",
      });
      return;
    }

    const list = container.createEl("ul", { cls: "notepack-recent-list" });

    for (const file of files) {
      const li = list.createEl("li", { cls: "notepack-recent-item" });

      const link = li.createEl("a", {
        cls: "notepack-recent-link",
      });
      link.addEventListener("click", (e) => {
        e.preventDefault();
        this.app.workspace.getLeaf(false).openFile(file);
      });

      const nameEl = link.createDiv({ cls: "notepack-recent-name" });
      nameEl.setText(file.basename);

      const metaEl = link.createDiv({ cls: "notepack-recent-meta" });
      const parentPath = file.parent ? file.parent.path : "";
      const timeStr = this.formatRelativeTime(file.stat.mtime);
      metaEl.setText(`${parentPath ? parentPath + " · " : ""}${timeStr}`);
    }
  }

  private getRecentFiles(): TFile[] {
    const allFiles = this.app.vault.getMarkdownFiles();

    return allFiles
      .filter((f) => {
        if (f.name === "README.md") return false;
        if (f.path.toLowerCase().includes("archive")) return false;
        return true;
      })
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, this.settings.recentFilesCount);
  }

  private formatRelativeTime(epochMs: number): string {
    const now = Date.now();
    const diffMs = now - epochMs;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;

    const date = new Date(epochMs);
    return date.toLocaleDateString();
  }
}

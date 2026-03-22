import { Plugin, TFile, TAbstractFile, WorkspaceLeaf } from "obsidian";
import {
  NotePackSettings,
  DEFAULT_SETTINGS,
  VIEW_TYPE_MY_TODOS,
  VIEW_TYPE_TEAM_TODOS,
  VIEW_TYPE_RECENT_FILES,
} from "./types";
import { TodoIndex } from "./lib/todoIndex";
import { TodoExporter } from "./lib/todoExporter";
import { NotePackSettingTab } from "./settings";
import { MyTodosView } from "./views/myTodosView";
import { TeamTodosView } from "./views/teamTodosView";
import { RecentFilesView } from "./views/recentFilesView";
import { TeamMemberModal } from "./modals/teamMemberModal";

export default class NotePackPlugin extends Plugin {
  settings: NotePackSettings = DEFAULT_SETTINGS;
  todoIndex: TodoIndex = null!;
  exporter: TodoExporter = null!;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Core engine
    this.todoIndex = new TodoIndex(this.app, this.settings);
    this.exporter = new TodoExporter(this.app, this.settings, this.todoIndex);

    // ---------------------------------------------------------------
    // Register views
    // ---------------------------------------------------------------
    this.registerView(VIEW_TYPE_MY_TODOS, (leaf) => {
      return new MyTodosView(leaf, this.todoIndex);
    });

    this.registerView(VIEW_TYPE_TEAM_TODOS, (leaf) => {
      return new TeamTodosView(leaf, this.todoIndex, this.settings);
    });

    this.registerView(VIEW_TYPE_RECENT_FILES, (leaf) => {
      return new RecentFilesView(leaf, this.settings);
    });

    // ---------------------------------------------------------------
    // Register commands
    // ---------------------------------------------------------------
    this.addCommand({
      id: "show-my-todos",
      name: "Show my todos",
      callback: () => this.activateView(VIEW_TYPE_MY_TODOS),
    });

    this.addCommand({
      id: "show-team-todos",
      name: "Show team todos",
      callback: () => this.activateView(VIEW_TYPE_TEAM_TODOS),
    });

    this.addCommand({
      id: "show-team-member-todos",
      name: "Show team member todos",
      callback: () => {
        new TeamMemberModal(this.app, this.settings, (member) => {
          (async () => {
            await this.activateView(VIEW_TYPE_TEAM_TODOS);
            // Find the view and set the selected member
            const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TEAM_TODOS);
            for (const leaf of leaves) {
              const view = leaf.view as TeamTodosView;
              view.setSelectedMember(member.name);
            }
          })().catch(console.error);
        }).open();
      },
    });

    this.addCommand({
      id: "show-recent-files",
      name: "Show recent files",
      callback: () => this.activateView(VIEW_TYPE_RECENT_FILES),
    });

    this.addCommand({
      id: "export-to-readme",
      name: "Export todos and recent files to file system",
      callback: () => this.exporter.exportAll(),
    });

    this.addCommand({
      id: "rebuild-index",
      name: "Rebuild todo index",
      callback: async () => {
        await this.todoIndex.rebuild();
      },
    });

    // ---------------------------------------------------------------
    // Settings tab
    // ---------------------------------------------------------------
    this.addSettingTab(new NotePackSettingTab(this.app, this));

    // ---------------------------------------------------------------
    // Ribbon icon
    // ---------------------------------------------------------------
    // eslint-disable-next-line obsidianmd/ui/sentence-case
    this.addRibbonIcon("check-square", "NotePack: My todos", () => {
      void this.activateView(VIEW_TYPE_MY_TODOS).catch(console.error);
    });

    // ---------------------------------------------------------------
    // Event listeners
    // ---------------------------------------------------------------

    // Wait for metadata cache to be fully resolved before initial build
    this.app.workspace.onLayoutReady(async () => {
      // If cache is already resolved, build immediately
      if (this.app.metadataCache.resolvedLinks) {
        await this.todoIndex.rebuild();
      }

      // Also listen for the resolved event in case it hasn't fired yet
      this.registerEvent(
        this.app.metadataCache.on("resolved", async () => {
          // Only rebuild if the index is empty (first time)
          if (this.todoIndex.getAllTodos().length === 0) {
            await this.todoIndex.rebuild();
          }
        })
      );
    });

    // Incremental updates on file change
    this.registerEvent(
      this.app.metadataCache.on("changed", (file, data, cache) => {
        void this.todoIndex.updateFile(file, data, cache).catch(console.error);
      })
    );

    // Handle file deletion
    this.registerEvent(
      this.app.vault.on("delete", (file: TAbstractFile) => {
        if (file instanceof TFile) {
          this.todoIndex.removeFile(file.path);
        }
      })
    );

    // Handle file rename
    this.registerEvent(
      this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
        this.todoIndex.removeFile(oldPath);
        if (file instanceof TFile && file.extension === "md") {
          // Wait a tick for the metadata cache to process the rename
          setTimeout(() => {
            (async () => {
              const cache = this.app.metadataCache.getFileCache(file);
              const content = await this.app.vault.cachedRead(file);
              await this.todoIndex.updateFile(file, content, cache ?? undefined);
            })().catch(console.error);
          }, 200);
        }
      })
    );

    // Handle new files
    this.registerEvent(
      this.app.vault.on("create", (file: TAbstractFile) => {
        if (file instanceof TFile && file.extension === "md") {
          // Wait a tick for the metadata cache to process
          setTimeout(() => {
            const cache = this.app.metadataCache.getFileCache(file);
            void this.todoIndex.updateFile(file, undefined, cache ?? undefined).catch(console.error);
          }, 200);
        }
      })
    );
  }

  onunload(): void {
    // Views are automatically unregistered by Obsidian
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);

    // Propagate settings changes to components
    this.todoIndex.updateSettings(this.settings);
    this.exporter.updateSettings(this.settings);

    // Update existing views with new settings
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_TEAM_TODOS)) {
      (leaf.view as TeamTodosView).updateSettings(this.settings);
    }
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_RECENT_FILES)) {
      (leaf.view as RecentFilesView).updateSettings(this.settings);
    }

    // Rebuild index with new scope
    await this.todoIndex.rebuild();
  }

  /**
   * Activate (or focus) a sidebar view. Creates it if it doesn't exist.
   */
  private async activateView(viewType: string): Promise<void> {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(viewType);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: viewType, active: true });
      }
    }

    if (leaf) {
      await workspace.revealLeaf(leaf).catch(console.error);
    }
  }
}

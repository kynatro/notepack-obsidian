import { App, TFile, CachedMetadata, normalizePath } from "obsidian";
import { Todo, NotePackSettings } from "./types";
import { formatAlias, getTeamMemberAliases } from "./team";
import { parseDueDate, parseDateString } from "./dueDateParser";

/**
 * TodoIndex maintains an in-memory map of all unchecked todos across the vault.
 *
 * Instead of re-scanning every file on every change (O(n) per change like the
 * original CLI), this uses Obsidian's metadataCache events to update only the
 * changed file (O(1) per change). A full rebuild is only needed on plugin load
 * or settings change.
 */
export class TodoIndex {
  private app: App;
  private settings: NotePackSettings;

  /** file.path → Todo[] */
  private index: Map<string, Todo[]> = new Map();

  /** Cached alias map, rebuilt when team data changes */
  private aliasMap: Record<string, string> = {};

  /** Monotonically increasing ID counter */
  private nextId = 1;

  /** Listeners notified after any index mutation */
  private listeners: Set<() => void> = new Set();

  constructor(app: App, settings: NotePackSettings) {
    this.app = app;
    this.settings = settings;
  }

  // -------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------

  /**
   * Full rebuild: clear everything and re-index all markdown files.
   * Called on plugin load and when settings change.
   */
  async rebuild(): Promise<void> {
    this.index.clear();
    this.nextId = 1;
    this.aliasMap = getTeamMemberAliases(this.app, this.settings);

    const files = this.app.vault.getMarkdownFiles();
    await Promise.all(
      files
        .filter((file) => this.isFileInScope(file) && !this.isReadme(file))
        .map((file) => this.indexFile(file))
    );

    this.notify();
  }

  /**
   * Refresh the alias map (e.g. when a team README.md changes).
   * Re-resolves aliases for all existing todos without re-reading files.
   */
  refreshAliases(): void {
    this.aliasMap = getTeamMemberAliases(this.app, this.settings);

    for (const [path, todos] of this.index) {
      for (const todo of todos) {
        todo.assignedToAlias = this.resolveAlias(todo.assignedTo);
      }
    }

    this.notify();
  }

  /**
   * Incrementally update the index for a single file.
   * Called from the metadataCache 'changed' event handler.
   */
  async updateFile(file: TFile, _data?: string, cache?: CachedMetadata): Promise<void> {
    if (this.isReadme(file)) {
      // If a team README changed, refresh aliases
      if (file.path.startsWith(normalizePath(this.settings.teamFolder) + "/")) {
        this.refreshAliases();
      }
      return;
    }

    if (!this.isFileInScope(file)) {
      // If the file was previously indexed but is now out of scope, remove it
      if (this.index.has(file.path)) {
        this.index.delete(file.path);
        this.notify();
      }
      return;
    }

    await this.indexFile(file, cache, _data);
    this.notify();
  }

  /**
   * Remove a file from the index (on delete/rename).
   */
  removeFile(path: string): void {
    if (this.index.has(path)) {
      this.index.delete(path);
      this.notify();
    }
  }

  /**
   * Get all todos across the vault.
   */
  getAllTodos(): Todo[] {
    const all: Todo[] = [];
    for (const todos of this.index.values()) {
      all.push(...todos);
    }
    return this.sortTodos(all);
  }

  /**
   * Get todos assigned to a specific person (by alias or name).
   */
  getTodosFor(assignment: string): Todo[] {
    const resolved = this.resolveAlias(assignment);
    return this.sortTodos(
      this.getAllTodos().filter((t) => t.assignedToAlias === resolved)
    );
  }

  /**
   * Get todos assigned to "Me" (unassigned todos).
   */
  getMyTodos(): Todo[] {
    return this.sortTodos(
      this.getAllTodos().filter((t) => t.assignedToAlias === "Me")
    );
  }

  /**
   * Get todos that fall within a specific folder path.
   */
  getTodosInFolder(folderPath: string): Todo[] {
    const all: Todo[] = [];
    for (const [path, todos] of this.index) {
      if (path.startsWith(normalizePath(folderPath) + "/") || path === normalizePath(folderPath)) {
        all.push(...todos);
      }
    }
    return this.sortTodos(all);
  }

  /**
   * Get unique group names from a set of todos, ordered by date descending.
   */
  getGroupNames(todos: Todo[]): string[] {
    const sorted = [...todos].sort((a, b) => {
      if (a.fileDate && b.fileDate) return b.fileDate.localeCompare(a.fileDate);
      if (a.fileDate) return -1;
      if (b.fileDate) return 1;
      return b.fileMtime - a.fileMtime;
    });

    const seen = new Set<string>();
    const groups: string[] = [];
    for (const todo of sorted) {
      if (!seen.has(todo.groupName)) {
        seen.add(todo.groupName);
        groups.push(todo.groupName);
      }
    }
    return groups;
  }

  /**
   * Subscribe to index changes. Returns an unsubscribe function.
   */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Update settings reference (called when settings change). */
  updateSettings(settings: NotePackSettings): void {
    this.settings = settings;
  }

  // -------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  /**
   * Index a single file by reading its cache (or fetching it).
   */
  private async indexFile(file: TFile, cache?: CachedMetadata, data?: string): Promise<void> {
    const fileCache =
      cache || this.app.metadataCache.getFileCache(file);

    // Skip files with excludeTodos front-matter
    if (fileCache?.frontmatter?.excludeTodos) {
      this.index.delete(file.path);
      return;
    }

    const todos: Todo[] = [];
    const listItems = fileCache?.listItems;

    if (!listItems) {
      this.index.set(file.path, []);
      return;
    }

    // Use provided data, or fall back to vault.cachedRead
    const content = data ?? await this.app.vault.cachedRead(file);
    if (!content) {
      this.index.set(file.path, []);
      return;
    }

    const lines = content.split("\n");
    const fileDate = this.extractFileDate(file.name);
    const refDate = fileDate ? parseDateString(fileDate) : new Date();

    for (const item of listItems) {
      // Only unchecked tasks (task === ' ' or task === undefined with checkbox)
      if (item.task !== " ") continue;

      const lineNum = item.position.start.line;
      if (lineNum >= lines.length) continue;

      const line = lines[lineNum];
      const todoMatch = line.match(/^[\s]*-\s?\[ \]\s?(.*)/);
      if (!todoMatch) continue;

      const rawText = todoMatch[1].trim();
      const assignedTo = this.getAssignment(rawText);
      const assignedToAlias = this.resolveAlias(assignedTo);

      todos.push({
        id: this.nextId++,
        file,
        groupName: this.buildGroupName(file),
        text: rawText,
        assignedTo,
        assignedToAlias,
        fileMtime: file.stat.mtime,
        fileDate,
        lineNumber: lineNum,
        dueDate: parseDueDate(rawText, refDate, this.settings.endOfDayHour, this.settings.endOfWeekDay),
      });
    }

    this.index.set(file.path, todos);
  }

  /**
   * Determine if a file is within the configured scan scope.
   */
  private isFileInScope(file: TFile): boolean {
    // Skip archive folders
    if (file.path.toLowerCase().includes("archive")) return false;

    return true;
  }

  private isReadme(file: TFile): boolean {
    return file.name === "README.md";
  }

  /**
   * Parse the @mention assignment from a todo's text.
   * Returns "Me" for unassigned todos.
   */
  private getAssignment(text: string): string {
    const match = text.match(/^@([A-Za-z.]+)/);
    return match ? match[1] : "Me";
  }

  /**
   * Resolve an assignment string to a canonical team member name.
   */
  private resolveAlias(assignment: string): string {
    if (assignment === "Me") return "Me";
    const formatted = formatAlias(assignment.replace(/^@/, "").replace(/\./g, " "));
    return this.aliasMap[formatted] || assignment.replace(/\./g, " ");
  }

  /**
   * Extract a YYYY-MM-DD date prefix from a filename.
   */
  private extractFileDate(filename: string): string | null {
    const match = filename.match(/^(\d{4}(-\d{2}){0,2})/);
    return match ? match[1] : null;
  }

  /**
   * Build a display group name: "ParentFolder / FileStem"
   * If the parent folder name matches the file stem, go up one level.
   */
  private buildGroupName(file: TFile): string {
    const stem = file.basename;
    const parts = file.path.split("/");

    // Remove the filename
    parts.pop();

    let parentName = parts.length > 0 ? parts[parts.length - 1] : "";

    // If parent matches the stem, use grandparent
    if (parentName === stem && parts.length > 1) {
      parentName = parts[parts.length - 2];
    }

    if (!parentName) return stem;
    return `${parentName} / ${stem}`;
  }

  private sortTodos(todos: Todo[]): Todo[] {
    return todos.sort((a, b) => {
      // Sort by fileDate descending (newest first), then by id ascending
      if (a.fileDate && b.fileDate) {
        const cmp = b.fileDate.localeCompare(a.fileDate);
        if (cmp !== 0) return cmp;
      } else if (a.fileDate) {
        return -1;
      } else if (b.fileDate) {
        return 1;
      }
      return a.id - b.id;
    });
  }
}

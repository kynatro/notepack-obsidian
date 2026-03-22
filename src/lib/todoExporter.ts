import { App, TFile, TFolder, Notice, normalizePath } from "obsidian";
import { Todo, NotePackSettings } from "../types";
import { TodoIndex } from "./todoIndex";
import { getTeamMembers } from "../utility/team";

/**
 * Handles exporting / syncing todos and recent files into README.md files.
 * This is the "NotePack: Export" command — an on-demand snapshot, not live-synced.
 */
export class TodoExporter {
  private app: App;
  private settings: NotePackSettings;
  private todoIndex: TodoIndex;

  constructor(app: App, settings: NotePackSettings, todoIndex: TodoIndex) {
    this.app = app;
    this.settings = settings;
    this.todoIndex = todoIndex;
  }

  updateSettings(settings: NotePackSettings): void {
    this.settings = settings;
  }

  /**
   * Export everything: todos to all README.md files + recent files to root README.
   */
  async exportAll(): Promise<void> {
    let count = 0;

    // 1. Export "my" todos to root README.md
    count += await this.exportTodosForPerson("Me");

    // 2. Export each team member's todos to their README.md
    const members = getTeamMembers(this.app, this.settings);
    for (const member of members) {
      count += await this.exportTodosForPerson(member.name);
    }

    // 3. Export folder-level todos
    count += await this.exportTodosForFolders();

    // 4. Export recent files to root README.md
    await this.exportRecentFiles();

    new Notice(`NotePack: Exported todos to ${count} README file(s)`);
  }

  /**
   * Export todos assigned to a person into their README.md.
   * "Me" writes to the vault root README.md.
   * Named persons write to Team/<Name>/README.md.
   */
  async exportTodosForPerson(assignedTo: string): Promise<number> {
    let readmePath: string;

    if (assignedTo.toLowerCase() === "me") {
      readmePath = "README.md";
    } else {
      readmePath = normalizePath(`${this.settings.teamFolder}/${assignedTo}/README.md`);
    }

    const todos =
      assignedTo.toLowerCase() === "me"
        ? this.todoIndex.getMyTodos()
        : this.todoIndex.getTodosFor(assignedTo);

    return (await this.writeTodosToReadme(readmePath, todos)) ? 1 : 0;
  }

  /**
   * Recursively find all README.md files in the vault and write
   * folder-scoped todos into each one.
   */
  async exportTodosForFolders(): Promise<number> {
    const root = this.app.vault.getRoot();
    return this.exportFolderRecursive(root);
  }

  private async exportFolderRecursive(folder: TFolder): Promise<number> {
    let count = 0;

    for (const child of folder.children) {
      if (!(child instanceof TFolder)) continue;
      if (child.path.toLowerCase().includes("archive")) continue;
      if (child.path.startsWith(normalizePath(this.settings.teamFolder) + "/")) continue;

      const readmePath = normalizePath(`${child.path}/README.md`);
      const readmeFile = this.app.vault.getAbstractFileByPath(readmePath);

      if (readmeFile instanceof TFile) {
        const todos = this.todoIndex.getTodosInFolder(child.path);
        if (await this.writeTodosToReadme(readmePath, todos)) {
          count++;
        }
      }

      // Recurse into subdirectories
      count += await this.exportFolderRecursive(child);
    }

    return count;
  }

  /**
   * Write recent files into the root README.md.
   */
  async exportRecentFiles(): Promise<void> {
    const readmePath = "README.md";
    const readmeFile = this.app.vault.getAbstractFileByPath(readmePath);
    if (!(readmeFile instanceof TFile)) return;

    const recentFiles = this.getRecentFiles();
    const anchor = `${this.settings.anchorHeadingLevel} ${this.settings.recentFilesAnchorTitle}`;

    const recentSection = recentFiles
      .map((f) => {
        const relativePath = f.path;
        const encoded = encodeURIComponent(relativePath)
          .replace(/%2F/g, "/")
          .replace(/%3A/g, ":")
          .replace(/%2B/g, "+")
          .replace(/%2C/g, ",");
        return `* [${f.name}](${encoded})`;
      })
      .join("\n");

    const content = `${anchor}\n${recentSection}\n`;

    await this.app.vault.process(readmeFile, (src) =>
      this.replaceSectionInSource(src, anchor, content)
    );
  }

  /**
   * Get the N most recently modified markdown files in the base folders.
   */
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

  /**
   * Write a set of todos into a README.md file, replacing the todo section.
   */
  private async writeTodosToReadme(
    readmePath: string,
    todos: Todo[]
  ): Promise<boolean> {
    const file = this.app.vault.getAbstractFileByPath(readmePath);
    if (!(file instanceof TFile)) return false;

    const anchor = `${this.settings.anchorHeadingLevel} ${this.settings.todoAnchorTitle}`;
    const todosContent = this.buildGroupedTodosString(todos, readmePath, anchor);

    await this.app.vault.process(file, (src) =>
      this.replaceSectionInSource(src, anchor, todosContent)
    );
    return true;
  }

  /**
   * Build the grouped todos markdown string for a README.md file.
   */
  private buildGroupedTodosString(
    todos: Todo[],
    readmePath: string,
    prefix: string
  ): string {
    const groupNames = this.todoIndex.getGroupNames(todos);
    let result = `${prefix}\n`;

    for (const group of groupNames) {
      const groupTodos = todos
        .filter((t) => t.groupName === group)
        .sort((a, b) => a.id - b.id);

      if (groupTodos.length === 0) continue;

      const firstTodo = groupTodos[0];
      const relativePath = this.relativeEncodedPath(
        readmePath,
        firstTodo.file.path
      );

      result += `\n${this.settings.todoGroupHeadingLevel} [${group}](${relativePath})\n`;
      for (const todo of groupTodos) {
        result += `- [ ] ${todo.text}\n`;
      }
    }

    return result;
  }

  /**
   * Replace a heading section in a source string.
   * If the anchor doesn't exist, appends to the end.
   */
  private replaceSectionInSource(
    src: string,
    anchor: string,
    newContent: string
  ): string {
    const headingLevel = this.settings.anchorHeadingLevel;
    const start = src.indexOf(anchor);

    if (start === -1) {
      // Append to end
      return src.trimEnd() + "\n\n" + newContent.trimEnd() + "\n";
    }

    const afterAnchor = src.substring(start + anchor.length);
    const nextHeadingMatch = afterAnchor.indexOf(`\n${headingLevel} `);
    const end =
      nextHeadingMatch === -1
        ? src.length
        : start + anchor.length + nextHeadingMatch;

    const before = src.substring(0, start).trimEnd();
    const after = src.substring(end).trimStart();

    const parts = [before, newContent.trimEnd()];
    if (after) parts.push(after);

    return parts.join("\n\n") + "\n";
  }

  /**
   * Build a relative, URI-encoded path from one file to another.
   */
  private relativeEncodedPath(fromPath: string, toPath: string): string {
    const fromDir = fromPath.substring(0, fromPath.lastIndexOf("/")) || ".";
    const fromParts = fromDir === "." ? [] : fromDir.split("/");
    const toParts = toPath.split("/");

    // Find common prefix
    let common = 0;
    while (
      common < fromParts.length &&
      common < toParts.length &&
      fromParts[common] === toParts[common]
    ) {
      common++;
    }

    const ups = fromParts.length - common;
    const relative = [
      ...Array<string>(ups).fill(".."),
      ...toParts.slice(common),
    ].join("/");

    return encodeURIComponent(relative)
      .replace(/%2F/g, "/")
      .replace(/%3A/g, ":")
      .replace(/%2B/g, "+")
      .replace(/%2C/g, ",");
  }
}

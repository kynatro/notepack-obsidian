import { ItemView, WorkspaceLeaf, MarkdownRenderer } from "obsidian";
import { VIEW_TYPE_TEAM_TODOS, Todo, NotePackSettings } from "../types";
import { TodoIndex } from "../lib/todoIndex";
import { getTeamMembers } from "../utility/team";
import { getDueDateStatus, formatDueDate } from "../utility/dueDateParser";

export class TeamTodosView extends ItemView {
  private todoIndex: TodoIndex;
  private settings: NotePackSettings;
  private selectedMember: string | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    todoIndex: TodoIndex,
    settings: NotePackSettings
  ) {
    super(leaf);
    this.todoIndex = todoIndex;
    this.settings = settings;
  }

  getViewType(): string {
    return VIEW_TYPE_TEAM_TODOS;
  }

  getDisplayText(): string {
    return "Team Todos";
  }

  getIcon(): string {
    return "users";
  }

  updateSettings(settings: NotePackSettings): void {
    this.settings = settings;
  }

  setSelectedMember(name: string | null): void {
    this.selectedMember = name;
    this.render();
  }

  async onOpen(): Promise<void> {
    this.unsubscribe = this.todoIndex.onChange(() => this.render());
    this.render();
  }

  async onClose(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("notepack-view");

    const header = container.createDiv({ cls: "notepack-view-header" });
    header.createEl("h4", { text: "Team Todos" });

    // Team member selector
    const members = getTeamMembers(this.app, this.settings);

    if (members.length === 0) {
      container.createDiv({
        cls: "notepack-empty",
        text: `No team members found. Create subfolders with README.md files in your "${this.settings.teamFolder}" folder.`,
      });
      return;
    }

    const selectorRow = container.createDiv({ cls: "notepack-selector" });

    // "All" button
    const allBtn = selectorRow.createEl("button", {
      text: "All",
      cls: `notepack-member-btn ${this.selectedMember === null ? "is-active" : ""}`,
    });
    allBtn.addEventListener("click", () => {
      this.selectedMember = null;
      this.render();
    });

    for (const member of members) {
      const btn = selectorRow.createEl("button", {
        text: member.name,
        cls: `notepack-member-btn ${this.selectedMember === member.name ? "is-active" : ""}`,
      });
      btn.addEventListener("click", () => {
        this.selectedMember = member.name;
        this.render();
      });
    }

    // Todos display
    let todos: Todo[];
    if (this.selectedMember) {
      todos = this.todoIndex.getTodosFor(this.selectedMember);
    } else {
      // Show all team-assigned todos (everything except "Me")
      todos = this.todoIndex
        .getAllTodos()
        .filter((t) => t.assignedToAlias !== "Me");
    }

    if (todos.length === 0) {
      const msg = this.selectedMember
        ? `No open todos assigned to ${this.selectedMember}.`
        : "No open todos assigned to team members.";
      container.createDiv({ cls: "notepack-empty", text: msg });
      return;
    }

    const count = container.createDiv({ cls: "notepack-count" });
    count.setText(`${todos.length} open todo${todos.length !== 1 ? "s" : ""}`);

    const overdue = todos.filter(
      (t) => t.dueDate && getDueDateStatus(t.dueDate) === "overdue"
    );
    const dueSoon = todos.filter((t) => {
      if (!t.dueDate) return false;
      const s = getDueDateStatus(t.dueDate);
      return s === "today" || s === "soon";
    });
    const regular = todos.filter(
      (t) => !t.dueDate || getDueDateStatus(t.dueDate) === "future"
    );

    if (overdue.length > 0) {
      this.renderUrgentSection(container, "Overdue", overdue, "notepack-section-overdue");
    }
    if (dueSoon.length > 0) {
      this.renderUrgentSection(container, "Due Soon", dueSoon, "notepack-section-due-soon");
    }
    if (regular.length > 0) {
      this.renderGroupedTodos(container, regular);
    }
  }

  private renderUrgentSection(
    container: HTMLElement,
    title: string,
    todos: Todo[],
    sectionCls: string
  ): void {
    const section = container.createDiv({
      cls: `notepack-urgency-section ${sectionCls}`,
    });
    section.createDiv({ cls: "notepack-urgency-header", text: title });

    const sorted = [...todos].sort(
      (a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0)
    );

    const groups = this.todoIndex.getGroupNames(sorted);
    for (const group of groups) {
      const groupTodos = sorted.filter((t) => t.groupName === group);
      if (groupTodos.length === 0) continue;

      const groupEl = section.createDiv({ cls: "notepack-group" });
      const groupHeader = groupEl.createDiv({ cls: "notepack-group-header" });
      const link = groupHeader.createEl("a", {
        text: group,
        cls: "notepack-group-link",
      });
      link.addEventListener("click", (e) => {
        e.preventDefault();
        void this.app.workspace.getLeaf(false).openFile(groupTodos[0].file).catch(console.error);
      });

      const list = groupEl.createEl("ul", { cls: "notepack-todo-list" });
      for (const todo of groupTodos) {
        void this.renderTodoItem(list, todo).catch(console.error);
      }
    }
  }

  private renderGroupedTodos(container: HTMLElement, todos: Todo[]): void {
    const groups = this.todoIndex.getGroupNames(todos);

    for (const group of groups) {
      const groupTodos = todos.filter((t) => t.groupName === group);
      if (groupTodos.length === 0) continue;

      const groupEl = container.createDiv({ cls: "notepack-group" });

      const groupHeader = groupEl.createDiv({ cls: "notepack-group-header" });
      const link = groupHeader.createEl("a", {
        text: group,
        cls: "notepack-group-link",
      });
      link.addEventListener("click", (e) => {
        e.preventDefault();
        void this.app.workspace.getLeaf(false).openFile(groupTodos[0].file).catch(console.error);
      });

      const list = groupEl.createEl("ul", { cls: "notepack-todo-list" });
      for (const todo of groupTodos) {
        void this.renderTodoItem(list, todo).catch(console.error);
      }
    }
  }

  private async renderTodoItem(list: HTMLElement, todo: Todo): Promise<void> {
    const li = list.createEl("li", { cls: "notepack-todo-item" });

    const checkbox = li.createEl("input", { type: "checkbox" });
    checkbox.addClass("notepack-checkbox");
    checkbox.addEventListener("change", () => { void this.checkOffTodo(todo).catch(console.error); });

    const assignee = li.createSpan({
      text: todo.assignedToAlias,
      cls: "notepack-assignee",
    });
    // Hide the assignee badge when filtering to a single member (redundant)
    if (this.selectedMember) assignee.addClass("notepack-hidden");

    const text = li.createSpan({ cls: "notepack-todo-text" });
    // Strip the @mention prefix since we show the assignee separately
    const cleanText = todo.text.replace(/^@[A-Za-z.]+\s*/, "");
    await MarkdownRenderer.render(this.app, cleanText, text, todo.file.path, this).catch(console.error);

    if (todo.dueDate) {
      const status = getDueDateStatus(todo.dueDate);
      li.createSpan({
        text: formatDueDate(todo.dueDate),
        cls: `notepack-due-badge notepack-due-${status}`,
      });
    }
  }

  private async checkOffTodo(todo: Todo): Promise<void> {
    await this.app.vault.process(todo.file, (content) => {
      const lines = content.split("\n");
      if (todo.lineNumber < lines.length) {
        lines[todo.lineNumber] = lines[todo.lineNumber].replace(
          /- \[ \]/,
          "- [x]"
        );
      }
      return lines.join("\n");
    });
  }
}

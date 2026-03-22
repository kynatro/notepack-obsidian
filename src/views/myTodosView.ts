import { ItemView, WorkspaceLeaf, MarkdownRenderer } from "obsidian";
import { VIEW_TYPE_MY_TODOS, Todo } from "../types";
import { TodoIndex } from "../lib/todoIndex";
import { getDueDateStatus, formatDueDate } from "../utility/dueDateParser";

const DISPLAY_TEXT = "My todos";

export class MyTodosView extends ItemView {
  private todoIndex: TodoIndex;
  private unsubscribe: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf, todoIndex: TodoIndex) {
    super(leaf);
    this.todoIndex = todoIndex;
  }

  getViewType(): string {
    return VIEW_TYPE_MY_TODOS;
  }

  getDisplayText(): string {
    return DISPLAY_TEXT;
  }

  getIcon(): string {
    return "check-square";
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
    header.createEl("h4", { text: DISPLAY_TEXT });

    const todos = this.todoIndex.getMyTodos();

    if (todos.length === 0) {
      container.createDiv({
        cls: "notepack-empty",
        text: "No open todos assigned to you.",
      });
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
      this.renderUrgentSection(container, "Due soon", dueSoon, "notepack-section-due-soon");
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
        const file = groupTodos[0].file;
        void this.app.workspace.getLeaf(false).openFile(file).catch(console.error);
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
    checkbox.addEventListener("change", () => {
      void this.checkOffTodo(todo).catch(console.error);
    });

    const text = li.createSpan({ cls: "notepack-todo-text" });
    await MarkdownRenderer.render(this.app, todo.text, text, todo.file.path, this).catch(console.error);

    if (todo.dueDate) {
      const status = getDueDateStatus(todo.dueDate);
      li.createSpan({
        text: formatDueDate(todo.dueDate),
        cls: `notepack-due-badge notepack-due-${status}`,
      });
    }
  }

  /**
   * Check off a todo in its source file by replacing `- [ ]` with `- [x]`.
   */
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

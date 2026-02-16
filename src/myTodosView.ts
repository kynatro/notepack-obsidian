import { ItemView, WorkspaceLeaf, MarkdownRenderer } from "obsidian";
import { VIEW_TYPE_MY_TODOS, Todo } from "./types";
import { TodoIndex } from "./todoIndex";

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
    return "My Todos";
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
    header.createEl("h4", { text: "My Todos" });

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

    this.renderGroupedTodos(container, todos);
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
        this.app.workspace.getLeaf(false).openFile(file);
      });

      const list = groupEl.createEl("ul", { cls: "notepack-todo-list" });

      for (const todo of groupTodos) {
        const li = list.createEl("li", { cls: "notepack-todo-item" });

        const checkbox = li.createEl("input", { type: "checkbox" });
        checkbox.addClass("notepack-checkbox");
        checkbox.addEventListener("change", () => {
          this.checkOffTodo(todo);
        });

        const text = li.createSpan({ cls: "notepack-todo-text" });
        MarkdownRenderer.renderMarkdown(todo.text, text, todo.file.path, this);
      }
    }
  }

  /**
   * Check off a todo in its source file by replacing `- [ ]` with `- [x]`.
   */
  private async checkOffTodo(todo: Todo): Promise<void> {
    const content = await this.app.vault.read(todo.file);
    const lines = content.split("\n");

    if (todo.lineNumber < lines.length) {
      lines[todo.lineNumber] = lines[todo.lineNumber].replace(
        /- \[ \]/,
        "- [x]"
      );
      await this.app.vault.modify(todo.file, lines.join("\n"));
    }
  }
}

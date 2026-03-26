import { ItemView, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_MY_TODOS } from "../types";
import { TodoIndex } from "../lib/todoIndex";
import { renderCategorizedTodos } from "../utility/todoRenderer";

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

  onOpen(): Promise<void> {
    this.unsubscribe = this.todoIndex.onChange(() => this.render());
    this.render();
    return Promise.resolve();
  }

  onClose(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    return Promise.resolve();
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

    renderCategorizedTodos(
      { app: this.app, todoIndex: this.todoIndex, component: this },
      container,
      todos
    );
  }
}

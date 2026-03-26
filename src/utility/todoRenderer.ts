import { App, Component, MarkdownRenderer } from "obsidian";
import { Todo } from "../types";
import { TodoIndex } from "../lib/todoIndex";
import { getDueDateStatus, formatDueDate } from "./dueDateParser";

interface TodoRenderContext {
  app: App;
  todoIndex: TodoIndex;
  component: Component;
}

interface RenderTodoItemOptions {
  showAssignee?: boolean;
  hideAssignee?: boolean;
}

/**
 * Categorize todos into overdue, due-today, due-soon, and regular buckets.
 */
export function categorizeTodos(todos: Todo[]): {
  overdue: Todo[];
  dueToday: Todo[];
  dueSoon: Todo[];
  regular: Todo[];
} {
  const overdue = todos.filter(
    (t) => t.dueDate && getDueDateStatus(t.dueDate) === "overdue"
  );
  const dueToday = todos.filter(
    (t) => t.dueDate && getDueDateStatus(t.dueDate) === "today"
  );
  const dueSoon = todos.filter(
    (t) => t.dueDate && getDueDateStatus(t.dueDate) === "soon"
  );
  const regular = todos.filter(
    (t) => !t.dueDate || getDueDateStatus(t.dueDate) === "future"
  );

  return { overdue, dueToday, dueSoon, regular };
}

/**
 * Render categorized todo sections (overdue, due soon, regular) into a container.
 */
export function renderCategorizedTodos(
  ctx: TodoRenderContext,
  container: HTMLElement,
  todos: Todo[],
  options?: RenderTodoItemOptions
): void {
  const { overdue, dueToday, dueSoon, regular } = categorizeTodos(todos);

  if (overdue.length > 0) {
    renderUrgentSection(ctx, container, "Overdue", overdue, "notepack-section-overdue", options);
  }
  if (dueToday.length > 0) {
    renderUrgentSection(ctx, container, "Due today", dueToday, "notepack-section-due-today", options);
  }
  if (dueSoon.length > 0) {
    renderUrgentSection(ctx, container, "Due soon", dueSoon, "notepack-section-due-soon", options);
  }
  if (regular.length > 0) {
    renderGroupedTodos(ctx, container, regular, options);
  }
}

/**
 * Render an urgent section (overdue or due soon) with grouped todos.
 */
export function renderUrgentSection(
  ctx: TodoRenderContext,
  container: HTMLElement,
  title: string,
  todos: Todo[],
  sectionCls: string,
  options?: RenderTodoItemOptions
): void {
  const section = container.createDiv({
    cls: `notepack-urgency-section ${sectionCls}`,
  });
  section.createDiv({ cls: "notepack-urgency-header", text: title });

  const sorted = [...todos].sort(
    (a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0)
  );

  renderTodoGroups(ctx, section, sorted, options, true);
}

/**
 * Render todos grouped by their group name.
 */
export function renderGroupedTodos(
  ctx: TodoRenderContext,
  container: HTMLElement,
  todos: Todo[],
  options?: RenderTodoItemOptions
): void {
  renderTodoGroups(ctx, container, todos, options);
}

/**
 * Render todo groups with headers and items.
 *
 * When preserveOrder is true, group names are derived from the todo array
 * in insertion order rather than re-sorted by file date preference. This
 * keeps urgent sections ordered by due date.
 */
function renderTodoGroups(
  ctx: TodoRenderContext,
  container: HTMLElement,
  todos: Todo[],
  options?: RenderTodoItemOptions,
  preserveOrder?: boolean
): void {
  const groups = preserveOrder
    ? getInsertionOrderGroupNames(todos)
    : ctx.todoIndex.getGroupNames(todos);

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
      void ctx.app.workspace.getLeaf(false).openFile(groupTodos[0].file).catch(console.error);
    });

    const list = groupEl.createEl("ul", { cls: "notepack-todo-list" });
    for (const todo of groupTodos) {
      void renderTodoItem(ctx, list, todo, options).catch(console.error);
    }
  }
}

/**
 * Get unique group names in the order they first appear in the todo array.
 */
function getInsertionOrderGroupNames(todos: Todo[]): string[] {
  const seen = new Set<string>();
  const groups: string[] = [];
  for (const todo of todos) {
    if (!seen.has(todo.groupName)) {
      seen.add(todo.groupName);
      groups.push(todo.groupName);
    }
  }
  return groups;
}

/**
 * Render a single todo item with checkbox, optional assignee badge, text, and due date.
 */
export async function renderTodoItem(
  ctx: TodoRenderContext,
  list: HTMLElement,
  todo: Todo,
  options?: RenderTodoItemOptions
): Promise<void> {
  const li = list.createEl("li", { cls: "notepack-todo-item" });

  const checkbox = li.createEl("input", { type: "checkbox" });
  checkbox.addClass("notepack-checkbox");
  checkbox.addEventListener("change", () => {
    void checkOffTodo(ctx, todo).catch(console.error);
  });

  if (options?.showAssignee) {
    const assignee = li.createSpan({
      text: todo.assignedToAlias,
      cls: "notepack-assignee",
    });
    if (options.hideAssignee) assignee.addClass("notepack-hidden");
  }

  const text = li.createSpan({ cls: "notepack-todo-text" });
  const displayText = options?.showAssignee
    ? todo.text.replace(/^@[A-Za-z.]+\s*/, "")
    : todo.text;
  await MarkdownRenderer.render(ctx.app, displayText, text, todo.file.path, ctx.component).catch(console.error);

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
export async function checkOffTodo(
  ctx: TodoRenderContext,
  todo: Todo
): Promise<void> {
  await ctx.app.vault.process(todo.file, (content) => {
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

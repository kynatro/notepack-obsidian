import { TFile, Component, MarkdownRenderer } from "obsidian";
import { Todo } from "../types";
import {
  categorizeTodos,
  renderCategorizedTodos,
  renderUrgentSection,
  renderGroupedTodos,
  renderTodoItem,
  checkOffTodo,
} from "../utility/todoRenderer";

// ─── Mock DOM ────────────────────────────────────────────────────────────────

interface MockElement {
  tag: string;
  cls: string;
  text: string;
  attrs: Record<string, string>;
  children: MockElement[];
  listeners: Record<string, Function[]>;
  createDiv(opts?: { cls?: string; text?: string }): MockElement;
  createEl(tag: string, opts?: { cls?: string; text?: string; type?: string }): MockElement;
  createSpan(opts?: { cls?: string; text?: string }): MockElement;
  addClass(cls: string): void;
  addEventListener(event: string, handler: Function): void;
}

function mockElement(tag = "div"): MockElement {
  const el: MockElement = {
    tag,
    cls: "",
    text: "",
    attrs: {},
    children: [],
    listeners: {},
    createDiv(opts) {
      const child = mockElement("div");
      if (opts?.cls) child.cls = opts.cls;
      if (opts?.text) child.text = opts.text;
      el.children.push(child);
      return child;
    },
    createEl(t, opts) {
      const child = mockElement(t);
      if (opts?.cls) child.cls = opts.cls;
      if (opts?.text) child.text = opts.text;
      if (opts?.type) child.attrs.type = opts.type;
      el.children.push(child);
      return child;
    },
    createSpan(opts) {
      return el.createEl("span", opts);
    },
    addClass(c) {
      el.cls = el.cls ? `${el.cls} ${c}` : c;
    },
    addEventListener(event, handler) {
      if (!el.listeners[event]) el.listeners[event] = [];
      el.listeners[event].push(handler);
    },
  };
  return el;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTodo(overrides: Partial<Todo> & { text: string }): Todo {
  return {
    id: 1,
    file: new TFile("notes/file.md"),
    groupName: "file",
    assignedTo: "Me",
    assignedToAlias: "Me",
    fileMtime: 1000,
    fileDate: null,
    lineNumber: 0,
    dueDate: null,
    ...overrides,
  };
}

function pastDate(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d;
}

function futureDate(daysAhead: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildCtx(groupNamesFn?: (todos: Todo[]) => string[]) {
  return {
    app: {
      workspace: {
        getLeaf: jest.fn(() => ({
          openFile: jest.fn(() => Promise.resolve()),
        })),
      },
      vault: {
        process: jest.fn(async (_file: TFile, fn: (c: string) => string) => {
          fn("- [ ] Test todo");
        }),
      },
    } as any,
    todoIndex: {
      getGroupNames: groupNamesFn ?? ((todos: Todo[]) => [...new Set(todos.map((t) => t.groupName))]),
    } as any,
    component: new Component(),
  };
}

// ─── categorizeTodos ─────────────────────────────────────────────────────────

describe("categorizeTodos", () => {
  it("places todos with past due dates in overdue", () => {
    const todos = [makeTodo({ text: "overdue task", dueDate: pastDate(5) })];
    const { overdue, dueSoon, regular } = categorizeTodos(todos);
    expect(overdue).toHaveLength(1);
    expect(dueSoon).toHaveLength(0);
    expect(regular).toHaveLength(0);
  });

  it("places todos due today in dueSoon", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todos = [makeTodo({ text: "today task", dueDate: today })];
    const { overdue, dueSoon, regular } = categorizeTodos(todos);
    expect(overdue).toHaveLength(0);
    expect(dueSoon).toHaveLength(1);
    expect(regular).toHaveLength(0);
  });

  it("places todos due within 7 days in dueSoon", () => {
    const todos = [makeTodo({ text: "soon task", dueDate: futureDate(3) })];
    const { overdue, dueSoon, regular } = categorizeTodos(todos);
    expect(overdue).toHaveLength(0);
    expect(dueSoon).toHaveLength(1);
    expect(regular).toHaveLength(0);
  });

  it("places todos due far in the future in regular", () => {
    const todos = [makeTodo({ text: "future task", dueDate: futureDate(30) })];
    const { overdue, dueSoon, regular } = categorizeTodos(todos);
    expect(overdue).toHaveLength(0);
    expect(dueSoon).toHaveLength(0);
    expect(regular).toHaveLength(1);
  });

  it("places todos without due dates in regular", () => {
    const todos = [makeTodo({ text: "no date", dueDate: null })];
    const { overdue, dueSoon, regular } = categorizeTodos(todos);
    expect(overdue).toHaveLength(0);
    expect(dueSoon).toHaveLength(0);
    expect(regular).toHaveLength(1);
  });

  it("categorizes a mixed set correctly", () => {
    const todos = [
      makeTodo({ id: 1, text: "overdue", dueDate: pastDate(2) }),
      makeTodo({ id: 2, text: "today", dueDate: new Date(new Date().setHours(0, 0, 0, 0)) }),
      makeTodo({ id: 3, text: "soon", dueDate: futureDate(5) }),
      makeTodo({ id: 4, text: "future", dueDate: futureDate(30) }),
      makeTodo({ id: 5, text: "no date", dueDate: null }),
    ];
    const { overdue, dueSoon, regular } = categorizeTodos(todos);
    expect(overdue).toHaveLength(1);
    expect(dueSoon).toHaveLength(2);
    expect(regular).toHaveLength(2);
  });

  it("returns empty arrays when given no todos", () => {
    const { overdue, dueSoon, regular } = categorizeTodos([]);
    expect(overdue).toHaveLength(0);
    expect(dueSoon).toHaveLength(0);
    expect(regular).toHaveLength(0);
  });
});

// ─── renderCategorizedTodos ──────────────────────────────────────────────────

describe("renderCategorizedTodos", () => {
  beforeEach(() => {
    (MarkdownRenderer.render as jest.Mock).mockClear();
  });

  it("renders overdue section when overdue todos exist", () => {
    const ctx = buildCtx();
    const container = mockElement();
    const todos = [makeTodo({ text: "late", dueDate: pastDate(3) })];

    renderCategorizedTodos(ctx, container as any, todos);

    const urgentSection = container.children.find((c) =>
      c.cls.includes("notepack-section-overdue")
    );
    expect(urgentSection).toBeDefined();
  });

  it("renders due soon section when due-soon todos exist", () => {
    const ctx = buildCtx();
    const container = mockElement();
    const todos = [makeTodo({ text: "soon", dueDate: futureDate(2) })];

    renderCategorizedTodos(ctx, container as any, todos);

    const section = container.children.find((c) =>
      c.cls.includes("notepack-section-due-soon")
    );
    expect(section).toBeDefined();
  });

  it("renders grouped todos section for regular todos", () => {
    const ctx = buildCtx();
    const container = mockElement();
    const todos = [makeTodo({ text: "future task", dueDate: futureDate(30) })];

    renderCategorizedTodos(ctx, container as any, todos);

    const group = container.children.find((c) =>
      c.cls.includes("notepack-group")
    );
    expect(group).toBeDefined();
  });

  it("renders all three sections for mixed todos", () => {
    const ctx = buildCtx();
    const container = mockElement();
    const todos = [
      makeTodo({ id: 1, text: "late", dueDate: pastDate(3) }),
      makeTodo({ id: 2, text: "soon", dueDate: futureDate(2) }),
      makeTodo({ id: 3, text: "later", dueDate: futureDate(30) }),
    ];

    renderCategorizedTodos(ctx, container as any, todos);

    expect(container.children.length).toBe(3);
  });

  it("renders nothing when given empty array", () => {
    const ctx = buildCtx();
    const container = mockElement();

    renderCategorizedTodos(ctx, container as any, []);

    expect(container.children).toHaveLength(0);
  });
});

// ─── renderUrgentSection ─────────────────────────────────────────────────────

describe("renderUrgentSection", () => {
  beforeEach(() => {
    (MarkdownRenderer.render as jest.Mock).mockClear();
  });

  it("creates a section with the given title and class", () => {
    const ctx = buildCtx();
    const container = mockElement();
    const todos = [makeTodo({ text: "overdue task", dueDate: pastDate(5) })];

    renderUrgentSection(ctx, container as any, "Overdue", todos, "notepack-section-overdue");

    const section = container.children[0];
    expect(section.cls).toContain("notepack-urgency-section");
    expect(section.cls).toContain("notepack-section-overdue");

    const header = section.children[0];
    expect(header.cls).toBe("notepack-urgency-header");
    expect(header.text).toBe("Overdue");
  });

  it("sorts todos by due date ascending", () => {
    const ctx = buildCtx();
    const container = mockElement();
    const laterDate = pastDate(1);
    const earlierDate = pastDate(5);
    const todos = [
      makeTodo({ id: 1, text: "later", dueDate: laterDate, groupName: "a" }),
      makeTodo({ id: 2, text: "earlier", dueDate: earlierDate, groupName: "b" }),
    ];

    renderUrgentSection(ctx, container as any, "Overdue", todos, "notepack-section-overdue");

    // Groups should appear in order of earliest due date
    const section = container.children[0];
    const groups = section.children.filter((c) => c.cls === "notepack-group");
    expect(groups).toHaveLength(2);
    const groupLinks = groups.map(
      (g) => g.children.find((c) => c.cls === "notepack-group-header")!
        .children.find((c) => c.tag === "a")!.text
    );
    expect(groupLinks).toEqual(["b", "a"]);
  });

  it("groups todos by group name within the section", () => {
    const ctx = buildCtx();
    const container = mockElement();
    const date = pastDate(3);
    const todos = [
      makeTodo({ id: 1, text: "task 1", dueDate: date, groupName: "Project A" }),
      makeTodo({ id: 2, text: "task 2", dueDate: date, groupName: "Project A" }),
      makeTodo({ id: 3, text: "task 3", dueDate: date, groupName: "Project B" }),
    ];

    renderUrgentSection(ctx, container as any, "Overdue", todos, "notepack-section-overdue");

    const section = container.children[0];
    const groups = section.children.filter((c) => c.cls === "notepack-group");
    expect(groups).toHaveLength(2);
  });
});

// ─── renderGroupedTodos ──────────────────────────────────────────────────────

describe("renderGroupedTodos", () => {
  beforeEach(() => {
    (MarkdownRenderer.render as jest.Mock).mockClear();
  });

  it("creates a group with header link and todo list", () => {
    const ctx = buildCtx();
    const container = mockElement();
    const todos = [makeTodo({ text: "do thing", groupName: "Notes" })];

    renderGroupedTodos(ctx, container as any, todos);

    const group = container.children[0];
    expect(group.cls).toBe("notepack-group");

    const header = group.children.find((c) => c.cls === "notepack-group-header")!;
    const link = header.children.find((c) => c.tag === "a")!;
    expect(link.text).toBe("Notes");
    expect(link.cls).toBe("notepack-group-link");

    const list = group.children.find((c) => c.tag === "ul")!;
    expect(list.cls).toBe("notepack-todo-list");
  });

  it("creates separate groups for different group names", () => {
    const ctx = buildCtx();
    const container = mockElement();
    const todos = [
      makeTodo({ id: 1, text: "a", groupName: "Alpha" }),
      makeTodo({ id: 2, text: "b", groupName: "Beta" }),
    ];

    renderGroupedTodos(ctx, container as any, todos);

    expect(container.children).toHaveLength(2);
    const links = container.children.map(
      (g) => g.children.find((c) => c.cls === "notepack-group-header")!
        .children.find((c) => c.tag === "a")!.text
    );
    expect(links).toContain("Alpha");
    expect(links).toContain("Beta");
  });

  it("group link click opens the file", () => {
    const ctx = buildCtx();
    const container = mockElement();
    const todos = [makeTodo({ text: "task", groupName: "Notes" })];

    renderGroupedTodos(ctx, container as any, todos);

    const link = container.children[0]
      .children.find((c) => c.cls === "notepack-group-header")!
      .children.find((c) => c.tag === "a")!;

    expect(link.listeners["click"]).toHaveLength(1);

    const mockEvent = { preventDefault: jest.fn() };
    link.listeners["click"][0](mockEvent);
    expect(mockEvent.preventDefault).toHaveBeenCalled();

    const leaf = ctx.app.workspace.getLeaf.mock.results[0].value;
    expect(leaf.openFile).toHaveBeenCalledWith(todos[0].file);
  });

  it("skips empty groups", () => {
    const ctx = buildCtx(() => ["Group A", "Empty Group"]);
    const container = mockElement();
    const todos = [makeTodo({ text: "task", groupName: "Group A" })];

    renderGroupedTodos(ctx, container as any, todos);

    expect(container.children).toHaveLength(1);
  });
});

// ─── renderTodoItem ──────────────────────────────────────────────────────────

describe("renderTodoItem", () => {
  beforeEach(() => {
    (MarkdownRenderer.render as jest.Mock).mockClear();
  });

  it("creates a list item with checkbox and text", async () => {
    const ctx = buildCtx();
    const list = mockElement("ul");
    const todo = makeTodo({ text: "Buy milk" });

    await renderTodoItem(ctx, list as any, todo);

    const li = list.children[0];
    expect(li.tag).toBe("li");
    expect(li.cls).toBe("notepack-todo-item");

    const checkbox = li.children.find((c) => c.tag === "input")!;
    expect(checkbox.cls).toBe("notepack-checkbox");
    expect(checkbox.attrs.type).toBe("checkbox");

    const text = li.children.find((c) => c.cls === "notepack-todo-text")!;
    expect(text.tag).toBe("span");

    expect(MarkdownRenderer.render).toHaveBeenCalledWith(
      ctx.app,
      "Buy milk",
      text,
      todo.file.path,
      ctx.component
    );
  });

  it("renders a due date badge when dueDate is set", async () => {
    const ctx = buildCtx();
    const list = mockElement("ul");
    const todo = makeTodo({ text: "task", dueDate: futureDate(30) });

    await renderTodoItem(ctx, list as any, todo);

    const li = list.children[0];
    const badge = li.children.find((c) => c.cls.includes("notepack-due-badge"))!;
    expect(badge).toBeDefined();
    expect(badge.cls).toContain("notepack-due-future");
  });

  it("does not render a due date badge when dueDate is null", async () => {
    const ctx = buildCtx();
    const list = mockElement("ul");
    const todo = makeTodo({ text: "task", dueDate: null });

    await renderTodoItem(ctx, list as any, todo);

    const li = list.children[0];
    const badge = li.children.find((c) => c.cls.includes("notepack-due-badge"));
    expect(badge).toBeUndefined();
  });

  it("renders overdue badge class for past due dates", async () => {
    const ctx = buildCtx();
    const list = mockElement("ul");
    const todo = makeTodo({ text: "late", dueDate: pastDate(5) });

    await renderTodoItem(ctx, list as any, todo);

    const li = list.children[0];
    const badge = li.children.find((c) => c.cls.includes("notepack-due-badge"))!;
    expect(badge.cls).toContain("notepack-due-overdue");
  });

  it("does not show assignee badge by default", async () => {
    const ctx = buildCtx();
    const list = mockElement("ul");
    const todo = makeTodo({ text: "task", assignedToAlias: "Alice" });

    await renderTodoItem(ctx, list as any, todo);

    const li = list.children[0];
    const assignee = li.children.find((c) => c.cls.includes("notepack-assignee"));
    expect(assignee).toBeUndefined();
  });

  it("shows assignee badge when showAssignee is true", async () => {
    const ctx = buildCtx();
    const list = mockElement("ul");
    const todo = makeTodo({ text: "@Alice task", assignedToAlias: "Alice" });

    await renderTodoItem(ctx, list as any, todo, { showAssignee: true });

    const li = list.children[0];
    const assignee = li.children.find((c) => c.cls.includes("notepack-assignee"))!;
    expect(assignee).toBeDefined();
    expect(assignee.text).toBe("Alice");
  });

  it("hides assignee badge when hideAssignee is true", async () => {
    const ctx = buildCtx();
    const list = mockElement("ul");
    const todo = makeTodo({ text: "@Alice task", assignedToAlias: "Alice" });

    await renderTodoItem(ctx, list as any, todo, { showAssignee: true, hideAssignee: true });

    const li = list.children[0];
    const assignee = li.children.find((c) => c.cls.includes("notepack-assignee"))!;
    expect(assignee.cls).toContain("notepack-hidden");
  });

  it("strips @mention prefix when showAssignee is true", async () => {
    const ctx = buildCtx();
    const list = mockElement("ul");
    const todo = makeTodo({ text: "@Alice review PR", assignedToAlias: "Alice" });

    await renderTodoItem(ctx, list as any, todo, { showAssignee: true });

    expect(MarkdownRenderer.render).toHaveBeenCalledWith(
      ctx.app,
      "review PR",
      expect.anything(),
      todo.file.path,
      ctx.component
    );
  });

  it("does not strip @mention prefix when showAssignee is false", async () => {
    const ctx = buildCtx();
    const list = mockElement("ul");
    const todo = makeTodo({ text: "@Alice review PR" });

    await renderTodoItem(ctx, list as any, todo);

    expect(MarkdownRenderer.render).toHaveBeenCalledWith(
      ctx.app,
      "@Alice review PR",
      expect.anything(),
      todo.file.path,
      ctx.component
    );
  });

  it("checkbox change event calls checkOffTodo", async () => {
    const ctx = buildCtx();
    const list = mockElement("ul");
    const todo = makeTodo({ text: "task" });

    await renderTodoItem(ctx, list as any, todo);

    const li = list.children[0];
    const checkbox = li.children.find((c) => c.tag === "input")!;

    expect(checkbox.listeners["change"]).toHaveLength(1);
    checkbox.listeners["change"][0]();

    // vault.process should have been called
    await new Promise((r) => setTimeout(r, 0));
    expect(ctx.app.vault.process).toHaveBeenCalledWith(todo.file, expect.any(Function));
  });
});

// ─── checkOffTodo ────────────────────────────────────────────────────────────

describe("checkOffTodo", () => {
  it("replaces - [ ] with - [x] at the correct line", async () => {
    let result = "";
    const ctx = buildCtx();
    ctx.app.vault.process = jest.fn(async (_file: TFile, fn: (c: string) => string) => {
      result = fn("First line\n- [ ] My todo\nLast line");
    });

    const todo = makeTodo({ text: "My todo", lineNumber: 1 });
    await checkOffTodo(ctx, todo);

    expect(result).toBe("First line\n- [x] My todo\nLast line");
  });

  it("only replaces the first checkbox on the target line", async () => {
    let result = "";
    const ctx = buildCtx();
    ctx.app.vault.process = jest.fn(async (_file: TFile, fn: (c: string) => string) => {
      result = fn("- [ ] First todo\n- [ ] Second todo");
    });

    const todo = makeTodo({ text: "Second todo", lineNumber: 1 });
    await checkOffTodo(ctx, todo);

    expect(result).toBe("- [ ] First todo\n- [x] Second todo");
  });

  it("does nothing when line number is out of bounds", async () => {
    let result = "";
    const ctx = buildCtx();
    ctx.app.vault.process = jest.fn(async (_file: TFile, fn: (c: string) => string) => {
      result = fn("- [ ] Only line");
    });

    const todo = makeTodo({ text: "task", lineNumber: 5 });
    await checkOffTodo(ctx, todo);

    expect(result).toBe("- [ ] Only line");
  });

  it("calls vault.process with the correct file", async () => {
    const ctx = buildCtx();
    const file = new TFile("projects/todo.md");
    const todo = makeTodo({ text: "task", file });

    await checkOffTodo(ctx, todo);

    expect(ctx.app.vault.process).toHaveBeenCalledWith(file, expect.any(Function));
  });
});

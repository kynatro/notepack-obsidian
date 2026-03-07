import { App, TFile, TFolder } from "obsidian";
import { TodoIndex } from "../todoIndex";
import { DEFAULT_SETTINGS, NotePackSettings } from "../types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeListItems(content: string) {
  const lines = content.split("\n");
  const items: any[] = [];
  lines.forEach((line, i) => {
    if (/^\s*-\s?\[ \]/.test(line)) {
      items.push({ task: " ", position: { start: { line: i } } });
    } else if (/^\s*-\s?\[[xX]\]/.test(line)) {
      items.push({ task: "x", position: { start: { line: i } } });
    }
  });
  return items.length > 0 ? items : undefined;
}

function parseFrontmatter(content: string): Record<string, any> | undefined {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return undefined;
  const fm: Record<string, any> = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();
    if (val === "true") fm[key] = true;
    else if (val === "false") fm[key] = false;
    else fm[key] = val;
  }
  return fm;
}

interface FileEntry {
  content: string;
  mtime?: number;
}

function buildMockApp(
  files: Record<string, FileEntry | string>,
  folderTree: Record<string, string[]> = {}
): App {
  const normalised: Record<string, FileEntry> = {};
  for (const [p, v] of Object.entries(files)) {
    normalised[p] = typeof v === "string" ? { content: v } : v;
  }

  const tfiles: Record<string, TFile> = {};
  for (const [path, entry] of Object.entries(normalised)) {
    tfiles[path] = new TFile(path, entry.mtime ?? 1000);
  }

  const tfolders: Record<string, TFolder> = {};
  for (const [folderPath, childPaths] of Object.entries(folderTree)) {
    const folder = new TFolder(folderPath);
    folder.children = childPaths.map((cp) => {
      if (tfiles[cp]) return tfiles[cp];
      if (!tfolders[cp]) tfolders[cp] = new TFolder(cp);
      return tfolders[cp];
    });
    tfolders[folderPath] = folder;
  }

  const vault = {
    getMarkdownFiles: () => Object.values(tfiles).filter((f) => f.extension === "md"),
    getAbstractFileByPath: (path: string) =>
      tfiles[path] ?? tfolders[path] ?? null,
    adapter: {
      readSync: (path: string) => normalised[path]?.content,
    },
    cachedRead: jest.fn(async (file: TFile) => normalised[file.path]?.content ?? ""),
    read: jest.fn(async (file: TFile) => normalised[file.path]?.content ?? ""),
    modify: jest.fn(async () => {}),
  } as any;

  const metadataCache = {
    getFileCache: (file: TFile) => {
      const entry = normalised[file.path];
      if (!entry) return null;
      const listItems = makeListItems(entry.content);
      const frontmatter = parseFrontmatter(entry.content);
      return { listItems, frontmatter };
    },
  } as any;

  return { vault, metadataCache } as unknown as App;
}

const baseSettings: NotePackSettings = {
  ...DEFAULT_SETTINGS,
  baseFolders: [],
  teamFolder: "Team",
};

// ─── rebuild ─────────────────────────────────────────────────────────────────

describe("TodoIndex.rebuild", () => {
  it("indexes todos from all markdown files", () => {
    const app = buildMockApp({
      "notes/2026-03-05.md": "- [ ] Buy milk\n- [ ] Call dentist",
    });
    const idx = new TodoIndex(app, baseSettings);
    idx.rebuild();
    expect(idx.getAllTodos()).toHaveLength(2);
  });

  it("skips checked items", () => {
    const app = buildMockApp({
      "notes/file.md": "- [x] Done task\n- [ ] Open task",
    });
    const idx = new TodoIndex(app, baseSettings);
    idx.rebuild();
    expect(idx.getAllTodos()).toHaveLength(1);
    expect(idx.getAllTodos()[0].text).toBe("Open task");
  });

  it("skips README.md files", () => {
    const app = buildMockApp({
      "README.md": "- [ ] Root todo",
      "notes/file.md": "- [ ] Real todo",
    });
    const idx = new TodoIndex(app, baseSettings);
    idx.rebuild();
    const todos = idx.getAllTodos();
    expect(todos).toHaveLength(1);
    expect(todos[0].text).toBe("Real todo");
  });

  it("skips files in archive folders", () => {
    const app = buildMockApp({
      "archive/old.md": "- [ ] Old todo",
      "notes/current.md": "- [ ] Current todo",
    });
    const idx = new TodoIndex(app, baseSettings);
    idx.rebuild();
    expect(idx.getAllTodos()).toHaveLength(1);
    expect(idx.getAllTodos()[0].text).toBe("Current todo");
  });

  it("respects baseFolders setting — excludes files outside scope", () => {
    const app = buildMockApp({
      "notes/included.md": "- [ ] In scope",
      "other/excluded.md": "- [ ] Out of scope",
    });
    const idx = new TodoIndex(app, { ...baseSettings, baseFolders: ["notes"] });
    idx.rebuild();
    expect(idx.getAllTodos()).toHaveLength(1);
    expect(idx.getAllTodos()[0].text).toBe("In scope");
  });

  it("includes team folder files regardless of baseFolders", () => {
    const app = buildMockApp({
      "Team/Alice/2026-03-01.md": "- [ ] Alice todo",
    });
    const idx = new TodoIndex(app, {
      ...baseSettings,
      baseFolders: ["notes"],
      teamFolder: "Team",
    });
    idx.rebuild();
    expect(idx.getAllTodos()).toHaveLength(1);
  });

  it("notifies listeners after rebuild", () => {
    const app = buildMockApp({ "notes/a.md": "- [ ] task" });
    const idx = new TodoIndex(app, baseSettings);
    const cb = jest.fn();
    idx.onChange(cb);
    idx.rebuild();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("skips files with excludeTodos frontmatter", () => {
    const app = buildMockApp({
      "notes/excluded.md": "---\nexcludeTodos: true\n---\n- [ ] Hidden todo",
      "notes/included.md": "- [ ] Visible todo",
    });
    const idx = new TodoIndex(app, baseSettings);
    idx.rebuild();
    expect(idx.getAllTodos()).toHaveLength(1);
    expect(idx.getAllTodos()[0].text).toBe("Visible todo");
  });

  it("resets nextId on each rebuild", () => {
    const app = buildMockApp({ "notes/a.md": "- [ ] task" });
    const idx = new TodoIndex(app, baseSettings);
    idx.rebuild();
    const firstId = idx.getAllTodos()[0].id;
    idx.rebuild();
    const secondId = idx.getAllTodos()[0].id;
    expect(firstId).toBe(secondId);
  });
});

// ─── updateFile ──────────────────────────────────────────────────────────────

describe("TodoIndex.updateFile", () => {
  it("adds todos for a new file", () => {
    const app = buildMockApp({});
    const idx = new TodoIndex(app, baseSettings);

    const file = new TFile("notes/new.md");
    const cache = {
      listItems: [{ task: " ", position: { start: { line: 0 } } }],
    };
    idx.updateFile(file, "- [ ] New todo", cache as any);

    expect(idx.getAllTodos()).toHaveLength(1);
    expect(idx.getAllTodos()[0].text).toBe("New todo");
  });

  it("replaces todos for an existing file", () => {
    const app = buildMockApp({ "notes/a.md": "- [ ] Old todo" });
    const idx = new TodoIndex(app, baseSettings);
    idx.rebuild();
    expect(idx.getAllTodos()).toHaveLength(1);

    const file = new TFile("notes/a.md");
    const newContent = "- [ ] Updated todo\n- [ ] Second todo";
    const cache = {
      listItems: [
        { task: " ", position: { start: { line: 0 } } },
        { task: " ", position: { start: { line: 1 } } },
      ],
    };
    idx.updateFile(file, newContent, cache as any);

    const todos = idx.getAllTodos();
    expect(todos).toHaveLength(2);
    expect(todos.map((t) => t.text)).toContain("Updated todo");
    expect(todos.map((t) => t.text)).toContain("Second todo");
  });

  it("removes file from index when file goes out of scope", () => {
    const app = buildMockApp({ "other/a.md": "- [ ] Out of scope todo" });
    const idx = new TodoIndex(app, { ...baseSettings, baseFolders: ["other"] });
    idx.rebuild();
    expect(idx.getAllTodos()).toHaveLength(1);

    // Update settings so file is now out of scope
    idx.updateSettings({ ...baseSettings, baseFolders: ["notes"] });
    const file = new TFile("other/a.md");
    idx.updateFile(file, "- [ ] Out of scope todo", undefined);

    expect(idx.getAllTodos()).toHaveLength(0);
  });

  it("notifies listeners on update", () => {
    const app = buildMockApp({});
    const idx = new TodoIndex(app, baseSettings);
    const cb = jest.fn();
    idx.onChange(cb);

    const file = new TFile("notes/b.md");
    idx.updateFile(file, "- [ ] Task", {
      listItems: [{ task: " ", position: { start: { line: 0 } } }],
    } as any);
    expect(cb).toHaveBeenCalled();
  });
});

// ─── removeFile ──────────────────────────────────────────────────────────────

describe("TodoIndex.removeFile", () => {
  it("removes todos for a deleted file", () => {
    const app = buildMockApp({ "notes/a.md": "- [ ] Task" });
    const idx = new TodoIndex(app, baseSettings);
    idx.rebuild();
    expect(idx.getAllTodos()).toHaveLength(1);

    idx.removeFile("notes/a.md");
    expect(idx.getAllTodos()).toHaveLength(0);
  });

  it("notifies listeners when a file is removed", () => {
    const app = buildMockApp({ "notes/a.md": "- [ ] Task" });
    const idx = new TodoIndex(app, baseSettings);
    idx.rebuild();

    const cb = jest.fn();
    idx.onChange(cb);
    idx.removeFile("notes/a.md");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("does nothing (no notification) when file not in index", () => {
    const app = buildMockApp({});
    const idx = new TodoIndex(app, baseSettings);
    const cb = jest.fn();
    idx.onChange(cb);
    idx.removeFile("nonexistent.md");
    expect(cb).not.toHaveBeenCalled();
  });
});

// ─── getAllTodos / sorting ────────────────────────────────────────────────────

describe("TodoIndex.getAllTodos", () => {
  it("returns todos sorted by fileDate descending then id ascending", () => {
    const app = buildMockApp({
      "2026-01-01.md": "- [ ] Jan task",
      "2026-03-05.md": "- [ ] Mar task",
    });
    const idx = new TodoIndex(app, baseSettings);
    idx.rebuild();
    const todos = idx.getAllTodos();
    expect(todos[0].text).toBe("Mar task");
    expect(todos[1].text).toBe("Jan task");
  });

  it("files with dates sort before files without dates", () => {
    const app = buildMockApp({
      "undated.md": "- [ ] Undated task",
      "2026-03-05.md": "- [ ] Dated task",
    });
    const idx = new TodoIndex(app, baseSettings);
    idx.rebuild();
    const todos = idx.getAllTodos();
    expect(todos[0].text).toBe("Dated task");
  });
});

// ─── getTodosFor ─────────────────────────────────────────────────────────────

describe("TodoIndex.getTodosFor", () => {
  it("returns todos assigned to a specific person", () => {
    const app = buildMockApp({
      "notes/a.md": "- [ ] @Alice.Smith do this\n- [ ] @Bob do that",
    });
    const idx = new TodoIndex(app, baseSettings);
    idx.rebuild();

    const aliceTodos = idx.getTodosFor("Alice Smith");
    expect(aliceTodos).toHaveLength(1);
    expect(aliceTodos[0].text).toBe("@Alice.Smith do this");
  });

  it("returns empty array when nobody matches", () => {
    const app = buildMockApp({ "notes/a.md": "- [ ] @Bob task" });
    const idx = new TodoIndex(app, baseSettings);
    idx.rebuild();
    expect(idx.getTodosFor("Charlie")).toHaveLength(0);
  });
});

// ─── getMyTodos ───────────────────────────────────────────────────────────────

describe("TodoIndex.getMyTodos", () => {
  it("returns only unassigned todos", () => {
    const app = buildMockApp({
      "notes/a.md": "- [ ] My task\n- [ ] @Bob assigned task",
    });
    const idx = new TodoIndex(app, baseSettings);
    idx.rebuild();
    const myTodos = idx.getMyTodos();
    expect(myTodos).toHaveLength(1);
    expect(myTodos[0].text).toBe("My task");
  });
});

// ─── getTodosInFolder ────────────────────────────────────────────────────────

describe("TodoIndex.getTodosInFolder", () => {
  it("returns todos from files within the given folder", () => {
    const app = buildMockApp({
      "projects/alpha/note.md": "- [ ] Alpha task",
      "projects/beta/note.md": "- [ ] Beta task",
    });
    const idx = new TodoIndex(app, baseSettings);
    idx.rebuild();
    const alphaTodos = idx.getTodosInFolder("projects/alpha");
    expect(alphaTodos).toHaveLength(1);
    expect(alphaTodos[0].text).toBe("Alpha task");
  });

  it("returns todos for nested subdirectories", () => {
    const app = buildMockApp({
      "projects/alpha/sub/deep.md": "- [ ] Deep task",
      "projects/beta/note.md": "- [ ] Beta task",
    });
    const idx = new TodoIndex(app, baseSettings);
    idx.rebuild();
    const alphaTodos = idx.getTodosInFolder("projects/alpha");
    expect(alphaTodos).toHaveLength(1);
    expect(alphaTodos[0].text).toBe("Deep task");
  });
});

// ─── getGroupNames ────────────────────────────────────────────────────────────

describe("TodoIndex.getGroupNames", () => {
  it("returns unique group names", () => {
    const app = buildMockApp({
      "2026-03-05.md": "- [ ] Task A\n- [ ] Task B",
    });
    const idx = new TodoIndex(app, baseSettings);
    idx.rebuild();
    const todos = idx.getAllTodos();
    const groups = idx.getGroupNames(todos);
    expect(groups).toHaveLength(1);
  });

  it("orders by fileDate descending", () => {
    const app = buildMockApp({
      "2026-01-01.md": "- [ ] Jan",
      "2026-03-01.md": "- [ ] Mar",
    });
    const idx = new TodoIndex(app, baseSettings);
    idx.rebuild();
    const groups = idx.getGroupNames(idx.getAllTodos());
    // Mar should come first
    expect(groups[0]).toContain("2026-03-01");
  });
});

// ─── onChange (subscription) ─────────────────────────────────────────────────

describe("TodoIndex.onChange", () => {
  it("calls listener on rebuild", () => {
    const app = buildMockApp({ "notes/a.md": "- [ ] task" });
    const idx = new TodoIndex(app, baseSettings);
    const cb = jest.fn();
    idx.onChange(cb);
    idx.rebuild();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe prevents future calls", () => {
    const app = buildMockApp({ "notes/a.md": "- [ ] task" });
    const idx = new TodoIndex(app, baseSettings);
    const cb = jest.fn();
    const unsub = idx.onChange(cb);
    unsub();
    idx.rebuild();
    expect(cb).not.toHaveBeenCalled();
  });

  it("supports multiple independent listeners", () => {
    const app = buildMockApp({ "notes/a.md": "- [ ] task" });
    const idx = new TodoIndex(app, baseSettings);
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    idx.onChange(cb1);
    idx.onChange(cb2);
    idx.rebuild();
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });
});

// ─── todo field extraction ────────────────────────────────────────────────────

describe("TodoIndex – todo field extraction", () => {
  it("assigns 'Me' for unassigned todos", () => {
    const app = buildMockApp({ "notes/a.md": "- [ ] Unassigned task" });
    const idx = new TodoIndex(app, baseSettings);
    idx.rebuild();
    expect(idx.getAllTodos()[0].assignedTo).toBe("Me");
    expect(idx.getAllTodos()[0].assignedToAlias).toBe("Me");
  });

  it("extracts @mention assignment", () => {
    const app = buildMockApp({ "notes/a.md": "- [ ] @Alice.Smith do work" });
    const idx = new TodoIndex(app, baseSettings);
    idx.rebuild();
    const todo = idx.getAllTodos()[0];
    expect(todo.assignedTo).toBe("Alice.Smith");
  });

  it("extracts fileDate from dated filename", () => {
    const app = buildMockApp({ "2026-03-05.md": "- [ ] task" });
    const idx = new TodoIndex(app, baseSettings);
    idx.rebuild();
    expect(idx.getAllTodos()[0].fileDate).toBe("2026-03-05");
  });

  it("fileDate is null for undated filename", () => {
    const app = buildMockApp({ "notes/meeting.md": "- [ ] task" });
    const idx = new TodoIndex(app, baseSettings);
    idx.rebuild();
    expect(idx.getAllTodos()[0].fileDate).toBeNull();
  });

  it("records correct lineNumber", () => {
    const app = buildMockApp({
      "notes/a.md": "# Heading\n\nSome text\n- [ ] Line 3 task",
    });
    const idx = new TodoIndex(app, baseSettings);
    idx.rebuild();
    expect(idx.getAllTodos()[0].lineNumber).toBe(3);
  });

  it("parses due date from todo text using file date as reference", () => {
    // File dated Jan 1; "due tomorrow" should resolve to Jan 2, not today
    const app = buildMockApp({
      "2026-01-01.md": "- [ ] task due tomorrow",
    });
    const idx = new TodoIndex(app, baseSettings);
    idx.rebuild();
    const due = idx.getAllTodos()[0].dueDate;
    expect(due).not.toBeNull();
    expect(due!.getFullYear()).toBe(2026);
    expect(due!.getMonth()).toBe(0); // January
    expect(due!.getDate()).toBe(2);
  });

  it("dueDate is null when no due date in text", () => {
    const app = buildMockApp({ "notes/a.md": "- [ ] No date here" });
    const idx = new TodoIndex(app, baseSettings);
    idx.rebuild();
    expect(idx.getAllTodos()[0].dueDate).toBeNull();
  });

  it("builds group name as 'parent / stem'", () => {
    const app = buildMockApp({ "Projects/Alpha.md": "- [ ] task" });
    const idx = new TodoIndex(app, baseSettings);
    idx.rebuild();
    expect(idx.getAllTodos()[0].groupName).toBe("Projects / Alpha");
  });

  it("group name uses grandparent when parent matches stem", () => {
    // e.g. Projects/Alpha/Alpha.md → parent 'Alpha' matches stem 'Alpha'
    const app = buildMockApp({ "Projects/Alpha/Alpha.md": "- [ ] task" });
    const idx = new TodoIndex(app, baseSettings);
    idx.rebuild();
    expect(idx.getAllTodos()[0].groupName).toBe("Projects / Alpha");
  });
});

// ─── rebuildAsync ─────────────────────────────────────────────────────────────

describe("TodoIndex.rebuildAsync", () => {
  it("indexes todos using async reads", async () => {
    const app = buildMockApp({
      "notes/a.md": "- [ ] Async task 1\n- [ ] Async task 2",
    });
    const idx = new TodoIndex(app, baseSettings);
    await idx.rebuildAsync();
    expect(idx.getAllTodos()).toHaveLength(2);
  });

  it("skips README.md files", async () => {
    const app = buildMockApp({
      "README.md": "- [ ] Should be skipped",
      "notes/a.md": "- [ ] Counted",
    });
    const idx = new TodoIndex(app, baseSettings);
    await idx.rebuildAsync();
    expect(idx.getAllTodos()).toHaveLength(1);
  });

  it("notifies listeners after async rebuild", async () => {
    const app = buildMockApp({ "notes/a.md": "- [ ] task" });
    const idx = new TodoIndex(app, baseSettings);
    const cb = jest.fn();
    idx.onChange(cb);
    await idx.rebuildAsync();
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

import { App, TFile, TFolder } from "obsidian";
import { TodoExporter } from "../exporter";
import { TodoIndex } from "../todoIndex";
import { DEFAULT_SETTINGS, NotePackSettings, Todo } from "../types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const baseSettings: NotePackSettings = {
  ...DEFAULT_SETTINGS,
  teamFolder: "Team",
  anchorHeadingLevel: "##",
  todoAnchorTitle: "Open Todos",
  recentFilesAnchorTitle: "Recent Files",
  todoGroupHeadingLevel: "####",
  recentFilesCount: 5,
};

/** Build a TFile-like mock (stat.mtime controllable). */
function makeTFile(path: string, mtime = 1000): TFile {
  const f = new TFile(path, mtime);
  return f;
}

function makeFolder(path: string, children: Array<TFile | TFolder> = []): TFolder {
  const f = new TFolder(path);
  f.children = children;
  return f;
}

/** Build a minimal Todo for testing. */
function makeTodo(
  overrides: Partial<Todo> & { filePath: string; text?: string }
): Todo {
  const file = makeTFile(overrides.filePath);
  return {
    id: 1,
    file,
    groupName: "Group / Note",
    text: overrides.text ?? "Do something",
    assignedTo: "Me",
    assignedToAlias: "Me",
    fileMtime: 1000,
    fileDate: null,
    lineNumber: 0,
    dueDate: null,
    ...overrides,
  };
}

/** Build a mock App with controllable file system and vault ops. */
function buildMockApp(opts: {
  files?: Record<string, string>;
  folderTree?: Record<string, Array<TFile | TFolder>>;
  markdownFiles?: TFile[];
}): {
  app: App;
  modifyCalls: Array<{ path: string; content: string }>;
} {
  const { files = {}, folderTree = {}, markdownFiles } = opts;
  const modifyCalls: Array<{ path: string; content: string }> = [];

  const tfiles: Record<string, TFile> = {};
  for (const path of Object.keys(files)) {
    tfiles[path] = makeTFile(path);
  }

  const tfolders: Record<string, TFolder> = {};
  for (const [path, children] of Object.entries(folderTree)) {
    const folder = makeFolder(path, children);
    tfolders[path] = folder;
  }

  const rootFolder = makeFolder("/");
  // Only top-level folders go under root (folders without a "/" in their path)
  rootFolder.children = Object.values(tfolders).filter(
    (f) => !f.path.includes("/")
  );

  const vault = {
    getAbstractFileByPath: (path: string) =>
      tfiles[path] ?? tfolders[path] ?? null,
    getMarkdownFiles: () =>
      markdownFiles ?? Object.values(tfiles).filter((f) => f.extension === "md"),
    getRoot: () => rootFolder,
    read: jest.fn(async (file: TFile) => files[file.path] ?? ""),
    modify: jest.fn(async (file: TFile, content: string) => {
      modifyCalls.push({ path: file.path, content });
      files[file.path] = content;
    }),
    process: jest.fn(async (file: TFile, fn: (data: string) => string) => {
      const content = fn(files[file.path] ?? "");
      modifyCalls.push({ path: file.path, content });
      files[file.path] = content;
    }),
    cachedRead: jest.fn(async (file: TFile) => files[file.path] ?? ""),
    adapter: { readSync: (path: string) => files[path] },
  } as any;

  const metadataCache = {
    getFileCache: () => null,
  } as any;

  const app = { vault, metadataCache } as unknown as App;
  return { app, modifyCalls };
}

/** Build a TodoIndex stub with predetermined return values. */
function buildIndexStub(opts: {
  myTodos?: Todo[];
  teamTodos?: Record<string, Todo[]>;
  folderTodos?: Record<string, Todo[]>;
  getGroupNames?: (todos: Todo[]) => string[];
}): TodoIndex {
  const stub = {
    getMyTodos: jest.fn(() => opts.myTodos ?? []),
    getTodosFor: jest.fn((name: string) => opts.teamTodos?.[name] ?? []),
    getTodosInFolder: jest.fn((path: string) => opts.folderTodos?.[path] ?? []),
    getGroupNames: jest.fn((todos: Todo[]) => {
      if (opts.getGroupNames) return opts.getGroupNames(todos);
      const seen = new Set<string>();
      todos.forEach((t) => seen.add(t.groupName));
      return Array.from(seen);
    }),
  } as unknown as TodoIndex;
  return stub;
}

// ─── exportTodosForPerson ─────────────────────────────────────────────────────

describe("TodoExporter.exportTodosForPerson", () => {
  it("returns 0 when README.md does not exist", async () => {
    const { app } = buildMockApp({});
    const idx = buildIndexStub({});
    const exporter = new TodoExporter(app, baseSettings, idx);
    const result = await exporter.exportTodosForPerson("Me");
    expect(result).toBe(0);
  });

  it("writes to root README.md for 'Me'", async () => {
    const todo = makeTodo({ filePath: "notes/2026-03-05.md", text: "My task" });
    const { app, modifyCalls } = buildMockApp({
      files: { "README.md": "## Open Todos\n" },
    });
    const idx = buildIndexStub({ myTodos: [todo] });
    const exporter = new TodoExporter(app, baseSettings, idx);
    await exporter.exportTodosForPerson("Me");
    expect(modifyCalls).toHaveLength(1);
    expect(modifyCalls[0].path).toBe("README.md");
  });

  it("writes to Team/<Name>/README.md for a named person", async () => {
    const todo = makeTodo({
      filePath: "notes/a.md",
      text: "Alice task",
      assignedToAlias: "Alice",
    });
    const { app, modifyCalls } = buildMockApp({
      files: { "Team/Alice/README.md": "## Open Todos\n" },
    });
    const idx = buildIndexStub({ teamTodos: { Alice: [todo] } });
    const exporter = new TodoExporter(app, baseSettings, idx);
    await exporter.exportTodosForPerson("Alice");
    expect(modifyCalls[0].path).toBe("Team/Alice/README.md");
  });

  it("returns 1 when README is successfully written", async () => {
    const { app } = buildMockApp({
      files: { "README.md": "## Open Todos\n" },
    });
    const idx = buildIndexStub({ myTodos: [] });
    const exporter = new TodoExporter(app, baseSettings, idx);
    const result = await exporter.exportTodosForPerson("Me");
    expect(result).toBe(1);
  });

  it("includes todo text in written content", async () => {
    const todo = makeTodo({
      filePath: "notes/note.md",
      text: "Finish report",
      groupName: "notes / note",
    });
    const { app, modifyCalls } = buildMockApp({
      files: { "README.md": "" },
    });
    const idx = buildIndexStub({ myTodos: [todo] });
    const exporter = new TodoExporter(app, baseSettings, idx);
    await exporter.exportTodosForPerson("Me");
    expect(modifyCalls[0].content).toContain("- [ ] Finish report");
  });

  it("is case-insensitive for 'Me'", async () => {
    const { app, modifyCalls } = buildMockApp({
      files: { "README.md": "" },
    });
    const idx = buildIndexStub({ myTodos: [] });
    const exporter = new TodoExporter(app, baseSettings, idx);
    await exporter.exportTodosForPerson("ME");
    expect(modifyCalls[0].path).toBe("README.md");
  });
});

// ─── replaceSectionInSource (via exportTodosForPerson) ───────────────────────

describe("TodoExporter – section replacement", () => {
  it("replaces existing section when anchor exists", async () => {
    const existing = "# Title\n\n## Open Todos\nold content\n\n## Other Section\n";
    const { app, modifyCalls } = buildMockApp({
      files: { "README.md": existing },
    });
    const idx = buildIndexStub({ myTodos: [] });
    const exporter = new TodoExporter(app, baseSettings, idx);
    await exporter.exportTodosForPerson("Me");
    const result = modifyCalls[0].content;
    expect(result).not.toContain("old content");
    expect(result).toContain("## Other Section");
    expect(result).toContain("## Open Todos");
  });

  it("appends section when anchor does not exist", async () => {
    const existing = "# Title\n\nSome intro text.\n";
    const { app, modifyCalls } = buildMockApp({
      files: { "README.md": existing },
    });
    const idx = buildIndexStub({ myTodos: [] });
    const exporter = new TodoExporter(app, baseSettings, idx);
    await exporter.exportTodosForPerson("Me");
    const result = modifyCalls[0].content;
    expect(result).toContain("Some intro text.");
    expect(result).toContain("## Open Todos");
  });

  it("preserves content after section when another heading follows", async () => {
    const existing =
      "## Open Todos\nold\n\n## Recent Files\nrecent content\n";
    const { app, modifyCalls } = buildMockApp({
      files: { "README.md": existing },
    });
    const idx = buildIndexStub({ myTodos: [] });
    const exporter = new TodoExporter(app, baseSettings, idx);
    await exporter.exportTodosForPerson("Me");
    const result = modifyCalls[0].content;
    expect(result).toContain("## Recent Files");
    expect(result).toContain("recent content");
  });
});

// ─── exportRecentFiles ────────────────────────────────────────────────────────

describe("TodoExporter.exportRecentFiles", () => {
  it("does nothing when root README.md does not exist", async () => {
    const { app, modifyCalls } = buildMockApp({});
    const idx = buildIndexStub({});
    const exporter = new TodoExporter(app, baseSettings, idx);
    await exporter.exportRecentFiles();
    expect(modifyCalls).toHaveLength(0);
  });

  it("writes recent files section to root README.md", async () => {
    const files: Record<string, string> = {
      "README.md": "## Open Todos\n",
      "notes/alpha.md": "content",
      "notes/beta.md": "content",
    };
    const mdFiles = [
      makeTFile("README.md", 500),
      makeTFile("notes/alpha.md", 2000),
      makeTFile("notes/beta.md", 1000),
    ];
    const { app, modifyCalls } = buildMockApp({
      files,
      markdownFiles: mdFiles,
    });
    const idx = buildIndexStub({});
    const exporter = new TodoExporter(app, baseSettings, idx);
    await exporter.exportRecentFiles();
    expect(modifyCalls[0].content).toContain("## Recent Files");
    expect(modifyCalls[0].content).toContain("alpha.md");
  });

  it("excludes README.md from recent files list", async () => {
    const files: Record<string, string> = {
      "README.md": "",
      "notes/note.md": "content",
    };
    const mdFiles = [
      makeTFile("README.md", 9999),
      makeTFile("notes/note.md", 1000),
    ];
    const { app, modifyCalls } = buildMockApp({
      files,
      markdownFiles: mdFiles,
    });
    const idx = buildIndexStub({});
    const exporter = new TodoExporter(app, baseSettings, idx);
    await exporter.exportRecentFiles();
    const result = modifyCalls[0].content;
    expect(result).not.toContain("* [README.md]");
  });

  it("excludes archive files from recent files list", async () => {
    const files: Record<string, string> = {
      "README.md": "",
      "notes/note.md": "content",
      "archive/old.md": "content",
    };
    const mdFiles = [
      makeTFile("README.md", 100),
      makeTFile("notes/note.md", 1000),
      makeTFile("archive/old.md", 9999),
    ];
    const { app, modifyCalls } = buildMockApp({
      files,
      markdownFiles: mdFiles,
    });
    const idx = buildIndexStub({});
    const exporter = new TodoExporter(app, baseSettings, idx);
    await exporter.exportRecentFiles();
    expect(modifyCalls[0].content).not.toContain("old.md");
  });

  it("sorts recent files by mtime descending", async () => {
    const files: Record<string, string> = {
      "README.md": "",
      "notes/old.md": "content",
      "notes/new.md": "content",
    };
    const mdFiles = [
      makeTFile("README.md", 100),
      makeTFile("notes/old.md", 500),
      makeTFile("notes/new.md", 9000),
    ];
    const { app, modifyCalls } = buildMockApp({
      files,
      markdownFiles: mdFiles,
    });
    const idx = buildIndexStub({});
    const exporter = new TodoExporter(app, { ...baseSettings, recentFilesCount: 10 }, idx);
    await exporter.exportRecentFiles();
    const result = modifyCalls[0].content;
    const newPos = result.indexOf("new.md");
    const oldPos = result.indexOf("old.md");
    expect(newPos).toBeLessThan(oldPos);
  });

  it("respects recentFilesCount setting", async () => {
    const files: Record<string, string> = { "README.md": "" };
    const mdFiles = [makeTFile("README.md", 100)];
    for (let i = 1; i <= 10; i++) {
      const path = `notes/note${i}.md`;
      files[path] = "content";
      mdFiles.push(makeTFile(path, i * 100));
    }
    const { app, modifyCalls } = buildMockApp({ files, markdownFiles: mdFiles });
    const idx = buildIndexStub({});
    const exporter = new TodoExporter(
      app,
      { ...baseSettings, recentFilesCount: 3 },
      idx
    );
    await exporter.exportRecentFiles();
    // Count markdown links in output
    const links = (modifyCalls[0].content.match(/\* \[/g) ?? []).length;
    expect(links).toBe(3);
  });
});

// ─── relativeEncodedPath (via buildGroupedTodosString) ───────────────────────

describe("TodoExporter – relative encoded paths in grouped todos", () => {
  it("builds a relative path from root README to a nested file", async () => {
    const todo = makeTodo({
      filePath: "notes/project/task.md",
      text: "nested task",
      groupName: "project / task",
    });
    const { app, modifyCalls } = buildMockApp({
      files: { "README.md": "" },
    });
    const idx = buildIndexStub({ myTodos: [todo] });
    const exporter = new TodoExporter(app, baseSettings, idx);
    await exporter.exportTodosForPerson("Me");
    // Should contain a relative link to the file
    expect(modifyCalls[0].content).toContain("notes/project/task.md");
  });

  it("builds a relative path from subfolder README to sibling folder", async () => {
    const todo = makeTodo({
      filePath: "notes/projects/task.md",
      text: "sibling task",
      groupName: "projects / task",
    });
    // README is in Team/Alice/
    const files: Record<string, string> = {
      "Team/Alice/README.md": "",
    };
    const { app, modifyCalls } = buildMockApp({ files });
    const idx = buildIndexStub({ teamTodos: { Alice: [todo] } });
    const exporter = new TodoExporter(app, baseSettings, idx);
    await exporter.exportTodosForPerson("Alice");
    // Path should use ../.. to navigate up from Team/Alice
    expect(modifyCalls[0].content).toMatch(/\.\.\//);
  });

  it("URL-encodes spaces in filenames", async () => {
    const todo = makeTodo({
      filePath: "notes/my project/task note.md",
      text: "spaced task",
      groupName: "my project / task note",
    });
    const { app, modifyCalls } = buildMockApp({
      files: { "README.md": "" },
    });
    const idx = buildIndexStub({ myTodos: [todo] });
    const exporter = new TodoExporter(app, baseSettings, idx);
    await exporter.exportTodosForPerson("Me");
    expect(modifyCalls[0].content).toContain("%20");
  });
});

// ─── exportTodosForFolders ────────────────────────────────────────────────────

describe("TodoExporter.exportTodosForFolders", () => {
  it("returns 0 when vault has no subfolders with READMEs", async () => {
    const { app } = buildMockApp({});
    const idx = buildIndexStub({});
    const exporter = new TodoExporter(app, baseSettings, idx);
    const result = await exporter.exportTodosForFolders();
    expect(result).toBe(0);
  });

  it("writes to subfolder README.md when it exists", async () => {
    const subReadme = makeTFile("notes/projects/README.md");
    const projectsFolder = makeFolder("notes/projects", [subReadme]);
    const notesFolder = makeFolder("notes", [projectsFolder]);

    const todo = makeTodo({
      filePath: "notes/projects/task.md",
      text: "Project task",
      groupName: "projects / task",
    });

    const files: Record<string, string> = {
      "notes/projects/README.md": "",
    };
    const { app, modifyCalls } = buildMockApp({
      files,
      folderTree: {
        notes: [projectsFolder],
        "notes/projects": [subReadme],
      },
    });
    const idx = buildIndexStub({
      folderTodos: { "notes/projects": [todo] },
    });
    const exporter = new TodoExporter(app, baseSettings, idx);
    await exporter.exportTodosForFolders();
    expect(modifyCalls.some((c) => c.path === "notes/projects/README.md")).toBe(true);
  });

  it("skips archive subfolders", async () => {
    const archiveReadme = makeTFile("notes/archive/README.md");
    const archiveFolder = makeFolder("notes/archive", [archiveReadme]);
    const notesFolder = makeFolder("notes", [archiveFolder]);

    const files: Record<string, string> = {
      "notes/archive/README.md": "",
    };
    const { app, modifyCalls } = buildMockApp({
      files,
      folderTree: {
        notes: [archiveFolder],
        "notes/archive": [archiveReadme],
      },
    });
    const idx = buildIndexStub({});
    const exporter = new TodoExporter(app, baseSettings, idx);
    await exporter.exportTodosForFolders();
    expect(modifyCalls).toHaveLength(0);
  });
});

// ─── exportAll ────────────────────────────────────────────────────────────────

describe("TodoExporter.exportAll", () => {
  it("exports my todos, team todos, folder todos, and recent files", async () => {
    const myTodo = makeTodo({ filePath: "notes/a.md", text: "My task" });
    const aliceTodo = makeTodo({
      filePath: "notes/b.md",
      text: "Alice task",
      assignedToAlias: "Alice",
    });

    const aliceFolder = makeFolder("Team/Alice");
    const teamFolder = makeFolder("Team", [aliceFolder]);
    const aliceReadme = makeTFile("Team/Alice/README.md");

    const files: Record<string, string> = {
      "README.md": "",
      "Team/Alice/README.md": "",
    };

    const { app, modifyCalls } = buildMockApp({
      files,
      folderTree: {
        Team: [aliceFolder],
      },
    });

    // Make the team folder discoverable for getTeamMembers
    const origGet = app.vault.getAbstractFileByPath.bind(app.vault);
    (app.vault as any).getAbstractFileByPath = (path: string) => {
      if (path === "Team") return teamFolder;
      if (path === "Team/Alice") return aliceFolder;
      if (path === "Team/Alice/README.md") return aliceReadme;
      return origGet(path);
    };

    const idx = buildIndexStub({
      myTodos: [myTodo],
      teamTodos: { Alice: [aliceTodo] },
    });
    const exporter = new TodoExporter(app, baseSettings, idx);
    await exporter.exportAll();

    // Should have written to root README.md (my todos + recent files) and Team/Alice/README.md
    const paths = modifyCalls.map((c) => c.path);
    expect(paths).toContain("README.md");
    expect(paths).toContain("Team/Alice/README.md");
  });

  it("returns without error when no README files exist", async () => {
    const { app } = buildMockApp({});
    const idx = buildIndexStub({});
    const exporter = new TodoExporter(app, baseSettings, idx);
    // Should not throw
    await exporter.exportAll();
  });
});

// ─── updateSettings ───────────────────────────────────────────────────────────

describe("TodoExporter.updateSettings", () => {
  it("uses new settings after update", async () => {
    const files: Record<string, string> = { "README.md": "" };
    const { app, modifyCalls } = buildMockApp({ files });
    const idx = buildIndexStub({ myTodos: [] });
    const exporter = new TodoExporter(app, baseSettings, idx);
    exporter.updateSettings({
      ...baseSettings,
      todoAnchorTitle: "My Open Tasks",
    });
    await exporter.exportTodosForPerson("Me");
    expect(modifyCalls[0].content).toContain("## My Open Tasks");
  });
});

import { App, TFile, TFolder } from "obsidian";
import { formatAlias, getTeamMembers, getTeamMemberAliases, getMentionOnlyNames, getAllTeamMembers } from "../utility/team";
import { DEFAULT_SETTINGS, NotePackSettings } from "../types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const settings: NotePackSettings = { ...DEFAULT_SETTINGS, teamFolder: "Team" };

/**
 * Build a minimal mock App whose vault and metadataCache can be controlled
 * per-test via the returned handles.
 */
function buildMockApp(opts: {
  teamFolderChildren?: Array<TFile | TFolder>;
  fileCacheMap?: Record<string, any>;
} = {}): App {
  const { teamFolderChildren = [], fileCacheMap = {} } = opts;

  const teamFolder = new TFolder("Team");
  teamFolder.children = teamFolderChildren;

  const vault = {
    getAbstractFileByPath: (path: string) => {
      if (path === "Team") return teamFolder;
      // Look for files stored in fileCacheMap by path
      if (fileCacheMap[path] !== undefined) {
        const file = new TFile(path);
        return file;
      }
      // Check team member subfolders
      for (const child of teamFolderChildren) {
        if (child.path === path) return child;
        if (child instanceof TFolder) {
          for (const grandchild of child.children) {
            if (grandchild.path === path) return grandchild;
          }
        }
      }
      return null;
    },
  } as any;

  const metadataCache = {
    getFileCache: (file: TFile) => fileCacheMap[file.path] ?? null,
  } as any;

  return { vault, metadataCache } as unknown as App;
}

// ─── formatAlias ─────────────────────────────────────────────────────────────

describe("formatAlias", () => {
  it("converts spaces to dots and lowercases", () => {
    expect(formatAlias("John Doe")).toBe("john.doe");
  });

  it("handles already lowercase input", () => {
    expect(formatAlias("jane smith")).toBe("jane.smith");
  });

  it("handles single word", () => {
    expect(formatAlias("Alice")).toBe("alice");
  });

  it("handles multiple spaces", () => {
    expect(formatAlias("First Middle Last")).toBe("first.middle.last");
  });

  it("preserves dots in input", () => {
    expect(formatAlias("j.doe")).toBe("j.doe");
  });
});

// ─── getTeamMembers ──────────────────────────────────────────────────────────

describe("getTeamMembers", () => {
  it("returns empty array when team folder does not exist", () => {
    const vault = {
      getAbstractFileByPath: () => null,
    } as any;
    const app = { vault, metadataCache: {} } as unknown as App;
    expect(getTeamMembers(app, settings)).toEqual([]);
  });

  it("returns empty array when team folder path is a file, not a folder", () => {
    const vault = {
      getAbstractFileByPath: () => new TFile("Team"),
    } as any;
    const app = { vault, metadataCache: {} } as unknown as App;
    expect(getTeamMembers(app, settings)).toEqual([]);
  });

  it("returns one member per subfolder", () => {
    const alice = new TFolder("Team/Alice");
    const bob = new TFolder("Team/Bob");
    const app = buildMockApp({ teamFolderChildren: [alice, bob] });
    const members = getTeamMembers(app, settings);
    expect(members).toHaveLength(2);
    expect(members.map((m) => m.name)).toEqual(["Alice", "Bob"]);
  });

  it("ignores non-folder children", () => {
    const aliceFolder = new TFolder("Team/Alice");
    const someFile = new TFile("Team/notes.md");
    const app = buildMockApp({ teamFolderChildren: [aliceFolder, someFile] });
    const members = getTeamMembers(app, settings);
    expect(members).toHaveLength(1);
    expect(members[0].name).toBe("Alice");
  });

  it("skips folders with 'archive' in the path", () => {
    const alice = new TFolder("Team/Alice");
    const archive = new TFolder("Team/Archive");
    const app = buildMockApp({ teamFolderChildren: [alice, archive] });
    const members = getTeamMembers(app, settings);
    expect(members).toHaveLength(1);
    expect(members[0].name).toBe("Alice");
  });

  it("skips archive folders case-insensitively", () => {
    const alice = new TFolder("Team/Alice");
    const archived = new TFolder("Team/ARCHIVED-members");
    const app = buildMockApp({ teamFolderChildren: [alice, archived] });
    const members = getTeamMembers(app, settings);
    expect(members).toHaveLength(1);
  });

  it("defaults to empty aliases and isNonReporting=false when no README exists", () => {
    const alice = new TFolder("Team/Alice");
    const app = buildMockApp({ teamFolderChildren: [alice] });
    const members = getTeamMembers(app, settings);
    expect(members[0]).toEqual({ name: "Alice", aliases: [], isNonReporting: false });
  });

  it("reads aliases from README.md front-matter", () => {
    const alice = new TFolder("Team/Alice");
    const readmeFile = new TFile("Team/Alice/README.md");
    alice.children = [readmeFile];

    const app = buildMockApp({
      teamFolderChildren: [alice],
      fileCacheMap: {
        "Team/Alice/README.md": {
          frontmatter: { aliases: ["ali", "a.smith"] },
        },
      },
    });

    const members = getTeamMembers(app, settings);
    expect(members[0].aliases).toEqual(["ali", "a.smith"]);
  });

  it("reads isNonReporting from README.md front-matter", () => {
    const alice = new TFolder("Team/Alice");
    const readmeFile = new TFile("Team/Alice/README.md");
    alice.children = [readmeFile];

    const app = buildMockApp({
      teamFolderChildren: [alice],
      fileCacheMap: {
        "Team/Alice/README.md": {
          frontmatter: { isNonReporting: true },
        },
      },
    });

    const members = getTeamMembers(app, settings);
    expect(members[0].isNonReporting).toBe(true);
  });

  it("defaults when README exists but has no frontmatter", () => {
    const alice = new TFolder("Team/Alice");
    const readmeFile = new TFile("Team/Alice/README.md");
    alice.children = [readmeFile];

    const app = buildMockApp({
      teamFolderChildren: [alice],
      fileCacheMap: {
        "Team/Alice/README.md": { frontmatter: undefined },
      },
    });

    const members = getTeamMembers(app, settings);
    expect(members[0]).toEqual({ name: "Alice", aliases: [], isNonReporting: false });
  });

  it("defaults when README cache returns null", () => {
    const alice = new TFolder("Team/Alice");
    const readmeFile = new TFile("Team/Alice/README.md");
    alice.children = [readmeFile];

    const app = buildMockApp({
      teamFolderChildren: [alice],
      fileCacheMap: {
        "Team/Alice/README.md": null,
      },
    });

    const members = getTeamMembers(app, settings);
    expect(members[0]).toEqual({ name: "Alice", aliases: [], isNonReporting: false });
  });

  it("ignores non-array aliases field", () => {
    const alice = new TFolder("Team/Alice");
    const readmeFile = new TFile("Team/Alice/README.md");
    alice.children = [readmeFile];

    const app = buildMockApp({
      teamFolderChildren: [alice],
      fileCacheMap: {
        "Team/Alice/README.md": {
          frontmatter: { aliases: "just-a-string" },
        },
      },
    });

    const members = getTeamMembers(app, settings);
    expect(members[0].aliases).toEqual([]);
  });
});

// ─── getTeamMemberAliases ─────────────────────────────────────────────────────

describe("getTeamMemberAliases", () => {
  it("returns empty object when no team folder", () => {
    const vault = { getAbstractFileByPath: () => null } as any;
    const app = { vault, metadataCache: {} } as unknown as App;
    expect(getTeamMemberAliases(app, settings)).toEqual({});
  });

  it("maps canonical name to itself (lowercased, dot-separated)", () => {
    const alice = new TFolder("Team/Alice Smith");
    const app = buildMockApp({ teamFolderChildren: [alice] });
    const map = getTeamMemberAliases(app, settings);
    expect(map["alice.smith"]).toBe("Alice Smith");
  });

  it("maps single-word canonical name", () => {
    const alice = new TFolder("Team/Alice");
    const app = buildMockApp({ teamFolderChildren: [alice] });
    const map = getTeamMemberAliases(app, settings);
    expect(map["alice"]).toBe("Alice");
  });

  it("maps explicit aliases to canonical name", () => {
    const alice = new TFolder("Team/Alice");
    const readmeFile = new TFile("Team/Alice/README.md");
    alice.children = [readmeFile];

    const app = buildMockApp({
      teamFolderChildren: [alice],
      fileCacheMap: {
        "Team/Alice/README.md": {
          frontmatter: { aliases: ["Ali", "a.jones"] },
        },
      },
    });

    const map = getTeamMemberAliases(app, settings);
    expect(map["ali"]).toBe("Alice");
    expect(map["a.jones"]).toBe("Alice");
  });

  it("includes all members", () => {
    const alice = new TFolder("Team/Alice");
    const bob = new TFolder("Team/Bob");
    const app = buildMockApp({ teamFolderChildren: [alice, bob] });
    const map = getTeamMemberAliases(app, settings);
    expect(map["alice"]).toBe("Alice");
    expect(map["bob"]).toBe("Bob");
  });

  it("later member with same alias overwrites earlier", () => {
    const alice = new TFolder("Team/Alice");
    const aliceReadme = new TFile("Team/Alice/README.md");
    alice.children = [aliceReadme];

    const bob = new TFolder("Team/Bob");
    const bobReadme = new TFile("Team/Bob/README.md");
    bob.children = [bobReadme];

    const app = buildMockApp({
      teamFolderChildren: [alice, bob],
      fileCacheMap: {
        "Team/Alice/README.md": { frontmatter: { aliases: ["shared"] } },
        "Team/Bob/README.md": { frontmatter: { aliases: ["shared"] } },
      },
    });

    const map = getTeamMemberAliases(app, settings);
    // Bob is processed after Alice, so his entry wins
    expect(map["shared"]).toBe("Bob");
  });
});

// ─── getMentionOnlyNames ──────────────────────────────────────────────────────

describe("getMentionOnlyNames", () => {
  const folderMembers = [
    { name: "Alice", aliases: [], isNonReporting: false },
    { name: "Bob", aliases: [], isNonReporting: false },
  ];

  it("returns names that are assigned but have no folder", () => {
    const assigned = ["Alice", "Bob", "Charlie"];
    expect(getMentionOnlyNames(folderMembers, assigned)).toEqual(["Charlie"]);
  });

  it("returns empty array when all assigned names have folders", () => {
    const assigned = ["Alice", "Bob"];
    expect(getMentionOnlyNames(folderMembers, assigned)).toEqual([]);
  });

  it("returns empty array when no assigned names", () => {
    expect(getMentionOnlyNames(folderMembers, [])).toEqual([]);
  });

  it("returns all assigned names when no folder members exist", () => {
    const assigned = ["Charlie", "Dana"];
    expect(getMentionOnlyNames([], assigned)).toEqual(["Charlie", "Dana"]);
  });
});

// ─── getAllTeamMembers ────────────────────────────────────────────────────────

describe("getAllTeamMembers", () => {
  const folderMembers = [
    { name: "Bob", aliases: ["b.smith"], isNonReporting: false },
    { name: "Alice", aliases: [], isNonReporting: true },
  ];

  it("returns folder members and mention-only names sorted alphabetically", () => {
    const assigned = ["Alice", "Bob", "Charlie"];
    const result = getAllTeamMembers(folderMembers, assigned);
    expect(result.map((m) => m.name)).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("preserves folder member properties", () => {
    const assigned = ["Alice"];
    const result = getAllTeamMembers(folderMembers, assigned);
    const alice = result.find((m) => m.name === "Alice")!;
    expect(alice.isNonReporting).toBe(true);
    const bob = result.find((m) => m.name === "Bob")!;
    expect(bob.aliases).toEqual(["b.smith"]);
  });

  it("creates bare TeamMember objects for mention-only names", () => {
    const assigned = ["Charlie"];
    const result = getAllTeamMembers(folderMembers, assigned);
    const charlie = result.find((m) => m.name === "Charlie")!;
    expect(charlie).toEqual({ name: "Charlie", aliases: [], isNonReporting: false });
  });

  it("returns only folder members when no assigned names", () => {
    const result = getAllTeamMembers(folderMembers, []);
    expect(result.map((m) => m.name)).toEqual(["Alice", "Bob"]);
  });

  it("returns only mention-only members when no folder members", () => {
    const result = getAllTeamMembers([], ["Dana", "Charlie"]);
    expect(result.map((m) => m.name)).toEqual(["Charlie", "Dana"]);
  });

  it("returns empty array when no members of either kind", () => {
    expect(getAllTeamMembers([], [])).toEqual([]);
  });
});

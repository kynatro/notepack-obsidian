# NotePack Obsidian - Architecture

## Overview

NotePack is an Obsidian sidebar plugin that indexes unchecked todos (`- [ ]`) across vault files, categorizes them by assignee and due date, and renders them in reactive sidebar views. It also exports todo summaries to README files and tracks recently modified files.

## Directory Structure

```
src/
├── main.ts              # Plugin entry point (NotePackPlugin extends Plugin)
├── settings.ts          # Settings tab UI (NotePackSettingTab extends PluginSettingTab)
├── types.ts             # All TypeScript interfaces and constants
├── lib/
│   ├── todoIndex.ts     # Core indexing engine - parses and stores todos in memory
│   └── todoExporter.ts  # Exports todo summaries into README.md files
├── utility/
│   ├── dueDateParser.ts # Natural language due date parsing (due by, EOW, next Friday, etc.)
│   ├── team.ts          # Team member resolution from folder structure + README front-matter
│   └── todoRenderer.ts  # Shared rendering functions for todo UI components
├── views/
│   ├── myTodosView.ts   # "My Todos" sidebar - unassigned todos
│   ├── teamTodosView.ts # "Team Todos" sidebar - assigned todos with member filtering
│   └── recentFilesView.ts # Recently modified files sidebar
├── modals/
│   └── teamMemberModal.ts # Fuzzy-search team member picker modal
├── __mocks__/
│   └── obsidian.ts      # Jest mock of obsidian module
└── __tests__/
    ├── dueDateParser.test.ts
    ├── todoIndex.test.ts
    ├── todoRenderer.test.ts
    ├── todoExporter.test.ts
    └── team.test.ts
```

## Key Types (`src/types.ts`)

```typescript
interface Todo {
  id: number;              // Monotonic unique ID
  file: TFile;             // Source file
  groupName: string;       // "ParentFolder / FileStem" for display grouping
  text: string;            // Raw todo text (without "- [ ]" prefix)
  assignedTo: string;      // Raw @mention string, or "Me" if unassigned
  assignedToAlias: string; // Canonical name resolved from aliases, or "Me"
  fileMtime: number;       // File modification timestamp
  fileDate: string | null; // Date parsed from YYYY-MM-DD filename prefix
  lineNumber: number;      // 0-based line number in source file
  dueDate: Date | null;    // Parsed due date from text
}

interface TeamMember {
  name: string;            // Canonical name (folder name in team directory)
  aliases: string[];       // @mention aliases from README front-matter
  isNonReporting: boolean; // Excluded from default views
}

interface NotePackSettings {
  teamFolder: string;           // Path to team members folder
  todoAnchorTitle: string;      // Heading text for exported todo sections
  recentFilesAnchorTitle: string;
  anchorHeadingLevel: string;   // "##", "###", etc.
  todoGroupHeadingLevel: string;
  recentFilesCount: number;     // Max files in recent files view
  endOfDayHour: number;         // 0-23, for EOD due date calc
  endOfWeekDay: number;         // 0=Sunday..6=Saturday
  showUndatedFirst: boolean;    // Sort undated todos before/after dated
}
```

View type constants: `VIEW_TYPE_MY_TODOS`, `VIEW_TYPE_TEAM_TODOS`, `VIEW_TYPE_RECENT_FILES`.

## Data Flow

```
Vault file change
  → metadataCache.on("changed") / on("resolved")
  → TodoIndex.updateFile(file) / rebuild()
    → Parse listItems from Obsidian's metadata cache
    → For each unchecked todo (status === " "):
      - Extract @mention → resolve alias via team.ts → set assignedTo/assignedToAlias
      - Parse due date via dueDateParser.ts → set dueDate
      - Parse YYYY-MM-DD from filename → set fileDate
      - Build groupName from parent folder + file stem
    → Store in Map<filePath, Todo[]>
    → notify() all registered listeners
  → Views re-render via onChange callback
```

## Plugin Bootstrap (`src/main.ts`)

`NotePackPlugin.onload()`:
1. Load settings from Obsidian data storage
2. Create `TodoIndex` and `TodoExporter` instances
3. Register three sidebar views (MyTodos, TeamTodos, RecentFiles)
4. Register 6 commands (show views, export, rebuild index)
5. Add ribbon icon for "My Todos"
6. Attach vault/cache event listeners for incremental indexing

Event listeners:
- `workspace.onLayoutReady()` → initial index build
- `metadataCache.on("resolved")` → first-time build
- `metadataCache.on("changed")` → incremental file update
- `vault.on("delete")` → remove file from index
- `vault.on("rename")` → re-index renamed file
- `vault.on("create")` → index new file

## Core Subsystems

### TodoIndex (`src/lib/todoIndex.ts`)
- In-memory `Map<filePath, Todo[]>` of all unchecked todos
- `rebuild()` - Full vault scan
- `updateFile()` - Incremental single-file re-index
- `removeFile()` / `renameFile()` - Handle file lifecycle
- `getMyTodos()` - Todos where assignedTo === "Me"
- `getTodosFor(name)` - Todos for a specific team member
- `getGroupNames()` - Ordered list of group names for rendering
- Observer pattern: `onChange(listener)` / `offChange(listener)` / `notify()`

### TodoExporter (`src/lib/todoExporter.ts`)
- Writes todo summaries into README.md files within vault folders
- `exportAll()` - Export for all team members and folders
- `exportTodosForPerson()` - Single person's README
- `exportTodosForFolders()` - Folder-scoped export
- `exportRecentFiles()` - Recent files list into README
- Replaces content between anchor headings, preserving other README content

### Due Date Parser (`src/utility/dueDateParser.ts`)
- `parseDueDate(text, refDate)` - Extract due date from todo text
  - Patterns: `due by X`, `due on X`, `due X`, `by X`
  - Supports: ISO dates, US dates, month names, relative dates (today, tomorrow, Friday)
  - Special: EOD, EOW, EOM, EOQ, EOY (with compounds like "EOD Monday")
  - Handles "next week/month/year"
- `getDueDateStatus(date)` → "overdue" | "today" | "soon" | "future"
- `getOverdueDays(date)` → Number of days overdue (minimum 1), or null if not overdue
- `formatOverdueDays(days)` → Compact display string ("3d", "2w", "1mo")
- `formatDueDate(date)` → Display string ("Today", "Tomorrow", "Mar 15")
- `parseDateString(str)` → Parse YYYY-MM-DD / YYYY-MM / YYYY from filenames

### Team Resolution (`src/utility/team.ts`)
- Team members defined by subfolders in the configured team folder
- Aliases read from front-matter of each member's `README.md`
- `getTeamMembers()` - Read folder structure + front-matter
- `getTeamMemberAliases()` - Build alias→canonical name map
- `getAllTeamMembers()` - Merge folder members + mention-only members
- `formatAlias()` - Normalize to lowercase dot-delimited ("John Doe" → "john.doe")

### Todo Renderer (`src/utility/todoRenderer.ts`)
- `categorizeTodos(todos)` → `{ overdue, dueToday, dueSoon, regular }` buckets
- `renderCategorizedTodos(ctx, container, todos, options)` - Render with urgency sections
- `renderUrgentSection(ctx, container, title, todos, sectionCls, options)` - Render overdue/due-today/due-soon section with header and sorted todos
- `renderGroupedTodos(ctx, container, todos, options)` - Group by file/folder and render
- `renderTodoItem(ctx, list, todo, options)` - Single item: checkbox + assignee + text + due badge
- `checkOffTodo(ctx, todo)` - Replace "- [ ]" with "- [x]" in source file

## View Architecture

All views extend `ItemView` and follow the pattern:
- Constructor: receive `app`, `todoIndex`, `settings`
- `onOpen()`: subscribe to TodoIndex changes, call `render()`
- `onClose()`: unsubscribe from listeners
- `render()`: clear container, build DOM, attach event handlers

**MyTodosView**: Shows unassigned todos, displays open count, categorized by urgency.

**TeamTodosView**: Shows all team-assigned todos with a button row for filtering by member. Dynamic member list includes folder-based and mention-only members.

**RecentFilesView**: Polls every 10s + debounced vault.on("modify"). Shows N most recent files with relative timestamps.

## File Scoping & Exclusion

- `archive/` folders excluded (case-insensitive path check)
- Files with `excludeTodos: true` in front-matter are skipped
- `README.md` files excluded from todo indexing (used only for team metadata)

## Build & Test

- **Bundler**: esbuild (entry: `src/main.ts` → `main.js`, CJS, ES2018, tree-shaking)
- **Tests**: Jest with ts-jest, obsidian module mocked
- **Coverage thresholds**: 80% lines, 75% branches, 80% functions
- **Coverage exclusions**: main.ts, settings.ts, views/, modals/
- **Scripts**: `npm run build` (production), `npm run dev` (watch), `npm test` (lint + test)

## Design Patterns

- **Observer**: TodoIndex notifies views of changes via onChange/offChange
- **Incremental indexing**: Only re-processes changed files, full rebuild on load/settings change
- **Dependency injection**: Views and exporters receive dependencies in constructor; tests pass mocks
- **DOM construction**: Obsidian's `createDiv()`, `createEl()`, `createSpan()` API
- **CSS scoping**: All classes prefixed with `.notepack-*`

## CSS Classes (`styles.css`)

Key class groups:
- Layout: `.notepack-view`, `.notepack-view-header`, `.notepack-count`
- Groups: `.notepack-group`, `.notepack-group-header`, `.notepack-group-link`
- Items: `.notepack-todo-list`, `.notepack-todo-item`, `.notepack-checkbox`, `.notepack-todo-text`
- Member filter: `.notepack-selector`, `.notepack-member-btn`, `.notepack-member-btn.is-active`
- Due badges: `.notepack-due-badge`, `.notepack-due-overdue`, `.notepack-due-today`, `.notepack-due-soon`, `.notepack-due-future`
- Recent files: `.notepack-recent-list`, `.notepack-recent-item`, `.notepack-recent-link`
- Assignee: `.notepack-assignee`
- Urgency sections: `.notepack-urgency-section`, `.notepack-urgency-header`

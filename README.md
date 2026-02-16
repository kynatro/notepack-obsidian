# NotePack for Obsidian

Todo collation with team management — an Obsidian plugin port of [notepack-cli](https://github.com/kynatro/notepack-cli).

## What It Does

NotePack scans your vault's markdown files for unchecked todos (`- [ ]`), assigns them to people via `@mention` syntax, and provides organized sidebar views. It's designed for people managers and project leads who take notes in markdown and need to track who owes what.

### Todo Assignment

Any unchecked todo without an `@mention` is assigned to **you**:

```md
- [ ] Follow up on budget review
```

Prefix with `@Name` to assign to a team member:

```md
- [ ] @Jane.Doe to write the project plan
- [ ] @John send updated timeline
```

### Team Management

Create a `Team` folder (configurable) with subfolders for each team member. Each member folder should have a `README.md` with optional front-matter:

```
Team/
  Jane Doe/
    README.md
  Johnathan Doe/
    README.md
```

In each member's `README.md`, define aliases so they can be `@mentioned` in different ways:

```yaml
---
aliases:
  - Jane
  - JD
---
```

NotePack automatically creates a `firstname.lastname` alias for every member (e.g., `@Jane.Doe`).

## Commands

Open the command palette (`Ctrl/Cmd + P`) and search for "NotePack":

| Command | Description |
|---------|-------------|
| **Show my todos** | Opens a sidebar view with all your unassigned todos |
| **Show team todos** | Opens a sidebar view showing all team-assigned todos with member filtering |
| **Show team member todos** | Fuzzy-search a team member, then show their todos |
| **Show recent files** | Opens a sidebar view of recently modified files |
| **Export todos & recent files to README.md** | Writes todo snapshots into README.md files and recent files into the root README.md |
| **Rebuild todo index** | Force a full re-index of all files |

### Sidebar Views

The three sidebar views (My Todos, Team Todos, Recent Files) are live — they update automatically as you edit files. You can:

- Click a group heading to navigate to the source file
- Check off a todo directly from the sidebar (it updates the source file)
- Filter team todos by member using the button row

### Export Command

The export command writes a point-in-time snapshot of todos into README.md files, similar to how the original CLI's `notepack update` worked. This is useful if you sync your notes via git and want rendered README views on GitHub/GitLab. The export:

- Writes your todos to the vault root `README.md`
- Writes each team member's todos to their `Team/<Name>/README.md`
- Writes folder-scoped todos to any `README.md` found in subdirectories
- Writes recently modified files to the root `README.md`

## Settings

Configure via **Settings → NotePack**:

- **Base folders**: Comma-separated folder paths to scan (empty = entire vault)
- **Team folder**: Path to the team member folder hierarchy
- **Todo section title**: Heading text used in README.md exports (default: "Open Todos")
- **Recent files section title**: Heading text for recent files (default: "Recent Files")
- **Anchor heading level**: H-level for sections in README.md (default: `##`)
- **Todo group heading level**: H-level for grouped todos within sections (default: `####`)
- **Recent files count**: How many recent files to display
- **Debounce delay**: Milliseconds to wait after a change before re-indexing

## File Conventions

NotePack works with any file organization, but it works best if you:

- Prefix note filenames with dates: `2024-01-15 Sprint Planning.md`
- Keep a consistent note structure with a `## Follow-up` section for todos
- Use `@Name` at the start of todos for assignment
- Add `excludeTodos: true` to front-matter in files you want skipped

## Architecture (vs. CLI)

The original notepack-cli re-reads every file on every change. This plugin uses Obsidian's `metadataCache` for incremental indexing — only the changed file is re-processed. The in-memory index makes view rendering instant regardless of vault size.

| CLI | Plugin |
|-----|--------|
| `fs.readdirSync` / `fs.readFileSync` | `app.vault` API |
| `chokidar.watch` | `app.vault.on('modify')` / `metadataCache.on('changed')` |
| `front-matter` npm package | `metadataCache.getFileCache().frontmatter` |
| Full O(n) rescan on every change | O(1) incremental update per file |
| `child_process.exec('find ...')` | `app.vault.getMarkdownFiles()` |
| Console output | Sidebar leaf views |
| `README.md` live-writing | On-demand export command |

## Development

```sh
npm install
npm run dev    # Watch mode (esbuild)
npm run build  # Production build
```

Copy `main.js`, `manifest.json`, and `styles.css` into your vault's `.obsidian/plugins/notepack/` folder.

## License

MIT — see [LICENSE](LICENSE).

import { TFile } from "obsidian";

/**
 * A single parsed todo item from a markdown file.
 */
export interface Todo {
  /** Unique identifier within the current index */
  id: number;
  /** The source TFile containing this todo */
  file: TFile;
  /** Display group name (parent folder / file stem) */
  groupName: string;
  /** The raw todo text (without the `- [ ]` prefix) */
  text: string;
  /** The resolved assignment — "Me" if unassigned */
  assignedTo: string;
  /** The full team member name if aliased, otherwise same as assignedTo */
  assignedToAlias: string;
  /** File modification time (epoch ms) */
  fileMtime: number;
  /** Date prefix from filename (YYYY-MM-DD) if present, else null */
  fileDate: string | null;
  /** Line number (0-based) in the source file */
  lineNumber: number;
  /** Parsed due date from todo text, or null if none found */
  dueDate: Date | null;
}

/**
 * A team member parsed from their folder's README.md front-matter.
 */
export interface TeamMember {
  /** Folder name, used as canonical name */
  name: string;
  /** Additional @mention aliases */
  aliases: string[];
  /** Whether this person is a non-reporting member */
  isNonReporting: boolean;
}

/**
 * Plugin settings persisted to data.json.
 */
export interface NotePackSettings {
  /** Team folder path (vault-relative) */
  teamFolder: string;
  /** Heading text for the todo section in README.md exports */
  todoAnchorTitle: string;
  /** Heading text for the recent files section in README.md exports */
  recentFilesAnchorTitle: string;
  /** Heading level for anchor sections (e.g. "##") */
  anchorHeadingLevel: string;
  /** Heading level for todo groups within sections (e.g. "####") */
  todoGroupHeadingLevel: string;
  /** Number of recent files to show */
  recentFilesCount: number;
  /** Hour (0–23) at which "end of day" is considered — used when parsing EOD due dates */
  endOfDayHour: number;
  /** Day of week (0=Sunday … 6=Saturday) considered the last day of the work week for EOW */
  endOfWeekDay: number;
}

export const DEFAULT_SETTINGS: NotePackSettings = {
  teamFolder: "Team",
  todoAnchorTitle: "Open Todos",
  recentFilesAnchorTitle: "Recent Files",
  anchorHeadingLevel: "##",
  todoGroupHeadingLevel: "####",
  recentFilesCount: 5,
  endOfDayHour: 17,
  endOfWeekDay: 6,
};

/**
 * View type identifiers used for registering sidebar leaves.
 */
export const VIEW_TYPE_MY_TODOS = "notepack-my-todos";
export const VIEW_TYPE_TEAM_TODOS = "notepack-team-todos";
export const VIEW_TYPE_RECENT_FILES = "notepack-recent-files";

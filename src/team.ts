import { App, TFile, TFolder, normalizePath } from "obsidian";
import { TeamMember, NotePackSettings } from "./types";

/**
 * Format an alias for case-insensitive, dot-delimited matching.
 *
 * "John Doe" → "john.doe"
 */
export function formatAlias(alias: string): string {
  return alias.replace(/\s/g, ".").toLowerCase();
}

/**
 * Read all team members from the configured team folder.
 *
 * Each subfolder in the team folder is treated as a team member. The
 * folder name is the canonical name. A README.md with front-matter
 * can provide `aliases` (string[]) and `isNonReporting` (boolean).
 */
export function getTeamMembers(app: App, settings: NotePackSettings): TeamMember[] {
  const teamFolderPath = settings.teamFolder;
  const teamFolder = app.vault.getAbstractFileByPath(teamFolderPath);

  if (!(teamFolder instanceof TFolder)) {
    return [];
  }

  const members: TeamMember[] = [];

  for (const child of teamFolder.children) {
    if (!(child instanceof TFolder)) continue;
    if (child.path.toLowerCase().includes("archive")) continue;

    const name = child.name;
    const readmePath = normalizePath(`${child.path}/README.md`);
    const readmeFile = app.vault.getAbstractFileByPath(readmePath);
    let aliases: string[] = [];
    let isNonReporting = false;

    if (readmeFile instanceof TFile) {
      const cache = app.metadataCache.getFileCache(readmeFile);
      if (cache?.frontmatter) {
        if (Array.isArray(cache.frontmatter.aliases)) {
          aliases = cache.frontmatter.aliases;
        }
        if (cache.frontmatter.isNonReporting) {
          isNonReporting = true;
        }
      }
    }

    members.push({ name, aliases, isNonReporting });
  }

  return members;
}

/**
 * Build a lookup map from every known alias (lowercased, dot-delimited)
 * to the canonical team member name.
 *
 * Automatically includes "firstname.lastname" variants for every member.
 */
export function getTeamMemberAliases(
  app: App,
  settings: NotePackSettings
): Record<string, string> {
  const members = getTeamMembers(app, settings);
  const map: Record<string, string> = {};

  for (const member of members) {
    // Canonical name as alias
    map[formatAlias(member.name)] = member.name;

    // Explicit aliases
    for (const alias of member.aliases) {
      map[formatAlias(alias)] = member.name;
    }
  }

  return map;
}

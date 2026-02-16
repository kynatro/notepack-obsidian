import { App, FuzzySuggestModal } from "obsidian";
import { TeamMember, NotePackSettings } from "./types";
import { getTeamMembers } from "./team";

/**
 * Modal that presents a fuzzy-searchable list of team members.
 * Used by the "Show team member todos" command.
 */
export class TeamMemberModal extends FuzzySuggestModal<TeamMember> {
  private settings: NotePackSettings;
  private onChoose: (member: TeamMember) => void;

  constructor(
    app: App,
    settings: NotePackSettings,
    onChoose: (member: TeamMember) => void
  ) {
    super(app);
    this.settings = settings;
    this.onChoose = onChoose;
    this.setPlaceholder("Select a team member...");
  }

  getItems(): TeamMember[] {
    return getTeamMembers(this.app, this.settings);
  }

  getItemText(member: TeamMember): string {
    return member.name;
  }

  onChooseItem(member: TeamMember): void {
    this.onChoose(member);
  }
}

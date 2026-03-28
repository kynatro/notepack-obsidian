import { App, FuzzySuggestModal } from "obsidian";
import { TeamMember, NotePackSettings } from "../types";
import { getTeamMembers, getAllTeamMembers } from "../utility/team";
import { TodoIndex } from "../lib/todoIndex";

/**
 * Modal that presents a fuzzy-searchable list of team members.
 * Used by the "Show team member todos" command.
 */
export class TeamMemberModal extends FuzzySuggestModal<TeamMember> {
  private settings: NotePackSettings;
  private todoIndex: TodoIndex;
  private onChoose: (member: TeamMember) => void;

  constructor(
    app: App,
    settings: NotePackSettings,
    todoIndex: TodoIndex,
    onChoose: (member: TeamMember) => void
  ) {
    super(app);
    this.settings = settings;
    this.todoIndex = todoIndex;
    this.onChoose = onChoose;
    this.setPlaceholder("Select a team member...");
  }

  getItems(): TeamMember[] {
    const folderMembers = getTeamMembers(this.app, this.settings);
    const assignedNames = this.todoIndex.getAssignedNames();
    return getAllTeamMembers(folderMembers, assignedNames);
  }

  getItemText(member: TeamMember): string {
    const textItems = [member.name];
    const todoCount = this.todoIndex.getTodosFor(member.name).length;
    
    if (todoCount > 0) {
      textItems.push(`(${todoCount})`)
    }

    return textItems.join(' ');
  }

  onChooseItem(member: TeamMember): void {
    this.onChoose(member);
  }
}

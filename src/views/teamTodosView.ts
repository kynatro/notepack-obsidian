import { ItemView, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_TEAM_TODOS, Todo, NotePackSettings } from "../types";
import { TodoIndex } from "../lib/todoIndex";
import { getTeamMembers, getAllTeamMembers } from "../utility/team";
import { renderCategorizedTodos } from "../utility/todoRenderer";

const DISPLAY_TEXT = "Team todos";

export class TeamTodosView extends ItemView {
  private todoIndex: TodoIndex;
  private settings: NotePackSettings;
  private selectedMember: string | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    todoIndex: TodoIndex,
    settings: NotePackSettings
  ) {
    super(leaf);
    this.todoIndex = todoIndex;
    this.settings = settings;
  }

  getViewType(): string {
    return VIEW_TYPE_TEAM_TODOS;
  }

  getDisplayText(): string {
    return DISPLAY_TEXT;
  }

  getIcon(): string {
    return "users";
  }

  updateSettings(settings: NotePackSettings): void {
    this.settings = settings;
  }

  setSelectedMember(name: string | null): void {
    this.selectedMember = name;
    this.render();
  }

  onOpen(): Promise<void> {
    this.unsubscribe = this.todoIndex.onChange(() => this.render());
    this.render();
    return Promise.resolve();
  }

  onClose(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    return Promise.resolve();
  }

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("notepack-view");

    const header = container.createDiv({ cls: "notepack-view-header" });
    header.createEl("h4", { text: DISPLAY_TEXT });

    // Build the full list of team member names: folder-based members first,
    // then any additional names found in @mentions that don't have folders.
    const folderMembers = getTeamMembers(this.app, this.settings);
    const assignedNames = this.todoIndex.getAssignedNames();
    const allMemberNames = getAllTeamMembers(folderMembers, assignedNames).map(
      (m) => m.name
    );

    if (allMemberNames.length === 0) {
      container.createDiv({
        cls: "notepack-empty",
        text: `No team members found. Create subfolders with README.md files in your "${this.settings.teamFolder}" folder or assign todos with @mentions.`,
      });
      return;
    }

    const selectorRow = container.createDiv({ cls: "notepack-selector" });

    // "All" button
    const allBtn = selectorRow.createEl("button", {
      text: "All",
      cls: `notepack-member-btn ${this.selectedMember === null ? "is-active" : ""}`,
    });
    allBtn.addEventListener("click", () => {
      this.selectedMember = null;
      this.render();
    });

    for (const name of allMemberNames) {
      const btn = selectorRow.createEl("button", {
        text: name,
        cls: `notepack-member-btn ${this.selectedMember === name ? "is-active" : ""}`,
      });
      btn.addEventListener("click", () => {
        this.selectedMember = name;
        this.render();
      });
    }

    // Todos display
    let todos: Todo[];
    if (this.selectedMember) {
      todos = this.todoIndex.getTodosFor(this.selectedMember);
    } else {
      // Show all team-assigned todos (everything except "Me")
      todos = this.todoIndex
        .getAllTodos()
        .filter((t) => t.assignedToAlias !== "Me");
    }

    if (todos.length === 0) {
      const msg = this.selectedMember
        ? `No open todos assigned to ${this.selectedMember}.`
        : "No open todos assigned to team members.";
      container.createDiv({ cls: "notepack-empty", text: msg });
      return;
    }

    const count = container.createDiv({ cls: "notepack-count" });
    count.setText(`${todos.length} open todo${todos.length !== 1 ? "s" : ""}`);

    renderCategorizedTodos(
      { app: this.app, todoIndex: this.todoIndex, component: this },
      container,
      todos,
      { showAssignee: true, hideAssignee: !!this.selectedMember }
    );
  }
}

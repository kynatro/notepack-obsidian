export class TFile {
  path: string;
  name: string;
  basename: string;
  extension: string;
  stat: { mtime: number; ctime: number; size: number };
  parent: any = null;

  constructor(path: string, mtime = Date.now()) {
    this.path = path;
    const parts = path.split("/");
    this.name = parts[parts.length - 1];
    const dot = this.name.lastIndexOf(".");
    this.extension = dot !== -1 ? this.name.slice(dot + 1) : "";
    this.basename = dot !== -1 ? this.name.slice(0, dot) : this.name;
    this.stat = { mtime, ctime: mtime, size: 0 };
  }
}

export class TFolder {
  path: string;
  name: string;
  children: Array<TFile | TFolder> = [];
  parent: any = null;

  constructor(path: string) {
    this.path = path;
    const parts = path.split("/");
    this.name = parts[parts.length - 1];
  }
}

export class TAbstractFile {}

export class Notice {
  constructor(_msg: string) {}
}

export class App {}
export class Plugin {}
export class ItemView {}
export class WorkspaceLeaf {}
export class PluginSettingTab {}
export const MarkdownRenderer = { renderMarkdown: jest.fn() };
export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
}

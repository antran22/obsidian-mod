import { EditorView } from "@codemirror/view";

export interface Selection {
  text: string;
  from: number;
  to: number;
}

export function hasSelection(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  return from !== to;
}

export function getSelection(view: EditorView): Selection | null {
  const { from, to } = view.state.selection.main;

  if (from === to) {
    return null;
  }

  const text = view.state.doc.sliceString(from, to);

  return {
    text: text,
    from: from,
    to: to,
  };
}

export function isEditorCursorInLink(view: EditorView): boolean {
  const pos = view.state.selection.main.from;
  const line = view.state.doc.lineAt(pos);
  const lineText = line.text;
  const cursorPos = pos - line.from;
  return isInLink(lineText, cursorPos);
}

export function isInLink(lineText: string, cursorPos: number): boolean {
  const allLinks = [
    ...extractMarkdownLinks(lineText),
    ...extractWikilinks(lineText),
  ];
  return allLinks.some(
    (link) => cursorPos > link.start && cursorPos <= link.end
  );
}

interface LinkBounds {
  start: number;
  end: number;
}

function extractMarkdownLinks(lineText: string): LinkBounds[] {
  const matches: LinkBounds[] = [];
  const regex = /\[[^\]]*\]\([^)]*\)/g;
  let match;

  while ((match = regex.exec(lineText)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length - 1,
    });
  }

  return matches;
}

function extractWikilinks(lineText: string): LinkBounds[] {
  const matches: LinkBounds[] = [];
  const regex = /\[\[.*?\]\]/g;
  let match;

  while ((match = regex.exec(lineText)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length - 1,
    });
  }

  return matches;
}

export function isSafeInsertPosition(view: EditorView): boolean {
  const pos = view.state.selection.main.from;
  const line = view.state.doc.lineAt(pos);
  const lineText = line.text;

  const backtickCount = (lineText.match(/`/g) || []).length;
  if (backtickCount % 2 === 1) {
    return false;
  }

  return true;
}

export function escapeMarkdownTitle(title: string): string {
  let escaped = title;

  escaped = escaped.replace(/\[/g, "\\[");
  escaped = escaped.replace(/\]/g, "\\]");
  escaped = escaped.replace(/\n/g, " ");
  escaped = escaped.replace(/\s{2,}/g, " ");

  return escaped.trim();
}

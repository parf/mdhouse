/**
 * Markdown styled in place for the editor: headings sized, link text marked, and the punctuation that
 * only says how text looks — `#`, `*`, `_`, `~~`, inline-code backticks, a link's brackets, destination
 * and title — hidden on every line but the ones the selection touches. Only decorations: the text is
 * never changed. Code blocks, tables, HTML and `[[wikilinks]]` stay as written.
 */
import { syntaxTree } from '@codemirror/language';
import type { EditorState, Range } from '@codemirror/state';
import { Decoration, type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

/** Blocks shown exactly as written: nothing inside is styled or hidden. */
const VERBATIM = new Set(['FencedCode', 'CodeBlock', 'Table', 'HTMLBlock', 'CommentBlock', 'ProcessingInstructionBlock']);
const hide = Decoration.replace({});
const linkText = Decoration.mark({ class: 'cm-md-link' });
const heading = [1, 2, 3, 4, 5, 6].map((n) => Decoration.line({ class: `cm-md-h cm-md-h${n}` }));

/** The line numbers the selection touches: their marks stay visible. */
function activeLines(state: EditorState): Set<number> {
  const lines = new Set<number>();
  for (const r of state.selection.ranges) {
    const last = state.doc.lineAt(r.to).number;
    for (let n = state.doc.lineAt(r.from).number; n <= last; n++) lines.add(n);
  }
  return lines;
}

/** The decorations for `ranges` of the text (what is on screen). */
export function markdownDecorations(state: EditorState, ranges: readonly { from: number; to: number }[]): DecorationSet {
  const active = activeLines(state);
  const shown = (pos: number) => active.has(state.doc.lineAt(pos).number);
  const out: Range<Decoration>[] = [];
  const tree = syntaxTree(state);
  for (const { from, to } of ranges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;
        if (VERBATIM.has(name)) return false;
        const atx = /^ATXHeading([1-6])$/.exec(name) ?? /^SetextHeading([12])$/.exec(name);
        if (atx) {
          out.push(heading[Number(atx[1]) - 1]!.range(state.doc.lineAt(node.from).from));
          if (name.startsWith('ATX') && !shown(node.from)) {
            const mark = node.node.getChild('HeaderMark');
            // `## Title`: the hashes and the space after them
            if (mark && mark.from === node.from) out.push(hide.range(mark.from, Math.min(mark.to + (state.sliceDoc(mark.to, mark.to + 1) === ' ' ? 1 : 0), node.to)));
            // `## Title ##`: the closing hashes
            const close = node.node.lastChild;
            if (close && close.name === 'HeaderMark' && close.from > node.from) out.push(hide.range(state.sliceDoc(close.from - 1, close.from) === ' ' ? close.from - 1 : close.from, close.to));
          }
          return;
        }
        if (name === 'Link') {
          // `[[page]]` is a wikilink, not a link in brackets: left as written
          if (state.sliceDoc(node.from - 1, node.from) === '[' && state.sliceDoc(node.to, node.to + 1) === ']') return false;
          const marks = node.node.getChildren('LinkMark');
          const open = marks[0];
          const close = marks[1];
          if (open && close && close.from > open.to) out.push(linkText.range(open.to, close.from));
          if (open && close && !shown(node.from) && state.doc.lineAt(node.from).number === state.doc.lineAt(node.to).number) {
            out.push(hide.range(open.from, open.to));
            // `](destination "title")` or `][label]`: everything after the text
            out.push(hide.range(close.from, node.to));
          }
          return;
        }
        if ((name === 'EmphasisMark' || name === 'StrikethroughMark') && !shown(node.from)) out.push(hide.range(node.from, node.to));
        if (name === 'CodeMark' && node.node.parent?.name === 'InlineCode' && !shown(node.from)) out.push(hide.range(node.from, node.to));
      },
    });
  }
  return Decoration.set(out, true);
}

/** The editor extension: decorations kept in step with the text, the viewport and the selection. */
export const markdownStyling = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = markdownDecorations(view.state, view.visibleRanges);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged || syntaxTree(u.state) !== syntaxTree(u.startState)) {
        this.decorations = markdownDecorations(u.state, u.view.visibleRanges);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

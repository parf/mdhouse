import { describe, expect, test } from 'bun:test';
import { ensureSyntaxTree, LanguageSupport } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { markdownDecorations } from '../src/ui/md-styling';

/** The text with what is hidden removed, and the classes of the styled spans, with the caret at `caret`. */
function look(doc: string, caret = doc.length) {
  const state = EditorState.create({ doc, selection: EditorSelection.cursor(caret), extensions: [new LanguageSupport(markdownLanguage)] });
  ensureSyntaxTree(state, state.doc.length, 5000);
  const set = markdownDecorations(state, [{ from: 0, to: state.doc.length }]);
  let shown = '';
  let at = 0;
  const classes: string[] = [];
  set.between(0, state.doc.length, (from, to, d) => {
    const spec = d.spec as { class?: string };
    if (spec.class) classes.push(`${spec.class}:${state.sliceDoc(from, to)}`);
    else if (to > from) {
      shown += state.sliceDoc(at, from);
      at = to;
    }
  });
  return { shown: shown + state.sliceDoc(at), classes, text: state.doc.toString() };
}

describe('Markdown styled in place', () => {
  test('off the active line: heading hashes, emphasis, inline code and link syntax are hidden; the text never changes', () => {
    const doc = '## Title\n\nSome **bold**, _it_, ~~gone~~, `code` and [a link](http://x.example "t").\n\nlast';
    const got = look(doc);
    expect(got.text).toBe(doc);
    expect(got.shown).toBe('Title\n\nSome bold, it, gone, code and a link.\n\nlast');
    expect(got.classes).toContain('cm-md-h cm-md-h2:');
    expect(got.classes).toContain('cm-md-link:a link');
  });

  test('the line the caret is on shows its marks', () => {
    const doc = '# One\n\n**two** [x](y.md)';
    expect(look(doc, doc.length).shown).toBe('One\n\n**two** [x](y.md)');
    expect(look(doc, 1).shown).toBe('# One\n\ntwo x');
  });

  test('code blocks, tables and HTML stay as written', () => {
    const doc = '```md\n# not a heading **x**\n```\n\n| **a** | b |\n|---|---|\n| 1 | 2 |\n\n<div>**x**</div>\n\nend';
    expect(look(doc).shown).toBe(doc);
  });

  test('a wikilink stays as written', () => {
    expect(look('see [[other]] and [[a|b]] here\n\nend').shown).toBe('see [[other]] and [[a|b]] here\n\nend');
  });

  test('a reference link hides its label; a link over two lines stays as written', () => {
    expect(look('see [text][ref] here\n\nend').shown).toBe('see text here\n\nend');
    expect(look('[two\nlines](u)\n\nend').shown).toBe('[two\nlines](u)\n\nend');
  });
});

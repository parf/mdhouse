# MW.5d — Dedicated Markdown editor <a id="MW.5d"></a>

[Workspaces TODO](TODO.md#MW.5d) · [№EDIT-W3](DECISIONS.md#EDIT-W3)

CTO owns implementation, acceptance and integration into `main`.

## Scope

- **Edit** on the current writable Markdown document opens a dedicated page, for example
  `/mdhouse/README.md?edit`. The page gives the editor the available space and shows the file
  name, **Back to document**, **Preview** and **Save**. Direct URLs and reload work.
- Reuse CodeMirror and the existing source read, save and draft logic. Style headings, emphasis
  and links in place. Reveal Markdown punctuation and link destinations on the active line.
  Keep tables and diagrams editable as source. Use [write-down](https://github.com/aarjithn/write-down)
  as interaction inspiration.
- **Preview** switches the same page to the rendered unsaved draft. Reuse mdhouse rendering and
  its passive content boundary, with relative paths resolved from the edited document. Preview
  displays tables, Mermaid, wikilinks and Q&A/decision blocks. Return to editing with the same
  cursor, selection and scroll position.
- **Save** and `Ctrl+S` / `⌘S` save the source and stay in the editor. Leaving keeps the per-file
  draft. The document view retains focused actions such as task ticks, Q&A and section inserts.

## Acceptance

- [ ] From a writable Markdown document, open the editor, reload directly, make an edit, save,
  and return to the document. Check keyboard and touch, light and dark, and desktop and phone.
- [ ] Verify plain Markdown source fidelity through edit, selection, undo and save. Check
  `LF`/`CRLF`, BOM and final newline. Switching modes keeps draft, caret and scroll.
- [ ] Compare the same draft in Preview and the document renderer with tables, Mermaid, wikilinks,
  relative links/images and Q&A. Check hostile authored HTML and confirm preview cannot run
  document actions or write source. Check that Preview uses the latest draft during rapid toggles.
- [ ] Verify direct entry for Viewer, RO, reference and non-Markdown files. Verify live write
  revocation and external edits preserve the draft and prevent stale writes. Keep current jail,
  admission and Team grant checks at the existing source API and any preview route.
- [ ] Run focused checks, the combined test/type gate and bounded scratch browser checks. Obtain
  independent review on the exact revision. Record the result and update editor docs and changelog.

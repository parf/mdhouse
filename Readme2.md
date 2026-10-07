# mdhouse — an outside read

mdhouse is a local web viewer for Markdown trees: point it at one or more folders and it serves
a fast browser UI with file tree, search, Git-aware recency/history, diffs, favorites/mutes,
live updates over WebSocket, and read-only-by-default behavior. It does not import or index
content into a separate store; it reads files directly from disk. The repo is Bun + TypeScript
+ Preact, with markdown-it, shiki, Mermaid, optional git, and optional ripgrep. The CLI
launches a background server (or a systemd user service), and a second `mdhouse <dir>` call
hands the new root to the already-running instance over a `0600` Unix socket in
`~/.config/mdhouse/`. ([mdhouse repository](https://github.com/parf/mdhouse))

Since 1.1 it also writes — but only in folders served with `--rw`, and only small, checked
edits: tick a checkbox, answer a question, add a note under a heading. That turns a plan folder
into something you can work through in the browser, not just read.

## A few design choices stand out as especially good

- Read-only by default; write access is per folder, granted only from the CLI, and every write
  goes through one guarded path.
- Each write is fingerprinted: the page sends a hash of the lines it showed, and the server
  refuses if the file has moved on — a stale tab cannot clobber anything, and the draft is kept.
- Edits are written in the document's own syntax — an answer to `> ?` is `> 💬`, to `**Q:**` is
  `**A:**`, to `- [ ]` an indented quote — so the file stays as its author wrote it and reads the
  same on GitHub.
- Question / disagreement / answer blocks (❓ ⁉️ 💬) in five Markdown forms, plus checkbox and
  status-glyph items, all render alike — a Q&A log reads at a glance.
- No indexing/import step — good fit for repos and constantly changing `Plans/` trees.
- Git is treated as first-class metadata, not just an optional decoration.
- Recent/Mine views are more useful than a conventional "wiki home page" for active engineering
  docs.
- Live filesystem updates via WebSocket instead of polling.
- The rendered diff / marked-up document idea is stronger than plain source diffs for Markdown.
- The freshness scheme: 🔥 under 10 min, ♨️ for the rest of the first hour, then amber/grey age
  coloring.

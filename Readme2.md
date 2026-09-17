# mdhouse — an outside read

mdhouse is a local web viewer for Markdown trees: point it at one or more folders and it serves
a fast browser UI with file tree, search, Git-aware recency/history, diffs, favorites/mutes,
live updates over WebSocket, and read-only-by-default behavior. It does not import or index
content into a separate store; it reads files directly from disk. The repo is Bun + TypeScript
+ Preact, with markdown-it, shiki, Mermaid, optional git, and optional ripgrep. The CLI
launches a background server, and a second `mdhouse <dir>` call hands the new root to the
already-running instance over a `0600` Unix socket in `~/.config/mdhouse/`.
([mdhouse repository](https://github.com/parf/mdhouse))

## A few design choices stand out as especially good

- Read-only by default with all writes forced through one guarded path.
- No indexing/import step — good fit for repos and constantly changing `Plans/` trees.
- Git is treated as first-class metadata, not just an optional decoration.
- Recent/Mine views are more useful than a conventional "wiki home page" for active engineering
  docs.
- Live filesystem updates via WebSocket instead of polling.
- The rendered diff / marked-up document idea is stronger than plain source diffs for Markdown.
- The freshness scheme: 🔥 under 10 min, ♨️ for the rest of the first hour, then amber/grey age
  coloring.

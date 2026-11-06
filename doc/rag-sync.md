# mdhouse-rag-sync

A separate, on-demand bin. It plans a RAG sync of one folder's Markdown files. mdhouse itself
never starts it.

```text
mdhouse-rag-sync plan --root <dir> --filescan <agent> --rag <agent> --namespace <ns> --table <name>
mdhouse-rag-sync sync …
mdhouse-rag-sync search …
mdhouse-rag-sync --help
```

- `plan` prints a JSON sync plan: the `*.md` files under `--root` (path, size, mtime), files over
  32 KiB that the RAG sink skips, entries that could not be listed and why, and the target.
- Reads no file content, no credential; no network or Agent Bus call. The plan's digest is a
  declaration only: not an authorization, not a content hash.
- Not walked: dot entries (`.git`, `.scratch`, dotfiles), `node_modules`, `bower_components`,
  `jspm_packages`, at any depth. Symlinks and special files are never followed.
- Bounds: 10000 files, 5000 directories, depth 32. A bound reached, an unreadable entry, a symlink
  or a special file is an issue: the listing is incomplete, never cut silently.
- `sync` and `search` are not wired yet: they do nothing and exit 3.
- `--namespace`, `--table`: 1–64 of `a-z 0-9 _ -`, starting with a letter or digit.
- Errors never repeat an argument's value.

Exit: `0` ok · `1` error or incomplete listing (the plan is still printed) · `2` usage · `3` not wired

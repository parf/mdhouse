# mdhouse-rag-sync

A separate, on-demand bin. It syncs one folder's Markdown files to RAG through the folder's
owner-provisioned FileScan. mdhouse itself never starts it.

```text
mdhouse-rag-sync plan   <target>
mdhouse-rag-sync sync   <target> --apply [--until-done]
mdhouse-rag-sync search <target> --query <text> [--mode keyword|semantic|hybrid] [--paid] [--limit 1-16]
mdhouse-rag-sync --help

<target> = --root <dir> --filescan #filescan/<instance>@<realm> --rag #rag/<instance>@<realm>
           --namespace <ns> --table <name>
```

## plan

- Prints a JSON sync plan: the `*.md` files under `--root` (path, size, mtime), files over 32 KiB
  (they need the RAG's large-file support), entries that could not be listed and why, and the target.
- Reads no file content, no credential; no network or Agent Bus call. The plan's digest is a
  declaration only: not an authorization, not a content hash.
- Not walked: dot entries (`.git`, `.scratch`, dotfiles), `node_modules`, `bower_components`,
  `jspm_packages`, at any depth. Symlinks and special files are never followed. Only lowercase
  `*.md`.
- Bounds: 10000 files, 5000 directories, depth 32. A bound reached, an unreadable entry, a symlink,
  a special file or a directory named `*.md` is an issue: the listing is incomplete, never cut
  silently.

## sync and search

- Only for a complete listing; otherwise nothing is sent.
- Talk as `#mdhouse@<host>` through the local account socket, never TCP:
  - the socket must be the login's own and closed to other users;
  - `#mdhouse@<host>` must exist, be an active agent and be owned by the login — the bin never
    registers it;
  - its token is kept in memory only.
- `sync` needs `--apply`. It reads the FileScan's Configuration as the login, checks it against the
  plan (root identity, include/exclude, namespace, table, `mode` `demand`), then sends one finite
  `sync`. A file sent before with no confirmation is sent again; each send is paid.
- `--until-done` repeats the sync until every file is confirmed: 30 s after progress, doubling to
  15 min while nothing moves (provider down or throttled); a refusal stops it.
- `search` sends one query to the RAG; `keyword` (default) is free, `semantic` and `hybrid` need `--paid`.
- Each request waits for its answer by its own random topic and tag; acks and other messages are
  not answers. A lost answer is `unknown`; the next `sync` repeats it.
- The root is rechecked (device/inode) before anything with a body is sent.
- Errors never repeat an argument's value, a token or a reply.
- An mdhouse server from before this version drains its whole inbox when it reconnects, and can take
  a sync's answer: the sync then reports `unknown`. Reload it first.

Exit: `0` confirmed sync / search answered · `1` error, refused or failed · `2` usage ·
`4` outcome unknown · `5` sync incomplete (run again to resume)

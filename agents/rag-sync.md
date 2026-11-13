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
- `--until-done` repeats the sync until every file is confirmed: 5 s after a round that confirmed more,
  else doubling to 15 min (provider down or throttled). Each round lists the root, plans and reads the owner
  configuration again; a refusal, an incomplete listing or another root stops it (exit 1). Three rounds in a
  row at the 15 min wait with nothing more confirmed stop it with the last result and its exit code.
- `sync` keeps a registry and history in the JSON KV of `#mdhouse@<host>`, best effort:
  - `rag/source/<namespace>/<table>` — the source (folder path, FileScan, RAG), written on the first sync. A sync
    whose folder, FileScan or RAG differs from it exits 1 and sends nothing. To replace it:
    `agent-bus kv delete --json '#mdhouse@<host>' rag/source/<namespace>/<table>`;
  - `rag/last/<namespace>/<table>` — the latest run; `rag/hist/<namespace>/<table>/<time>-<hex>` — one entry per
    run (with up to 20 failed or unknown files), the newest 200 kept;
  - one line in the agent log: notice confirmed, warning not confirmed, alert gave up.

  An unreachable KV or log is said once on stderr; the result, the output and the exit code do not change.
- The `R` button in the sidebar header opens the RAG search page (`/rag`): the project's index status and a keyword search of it; until a
  source is registered it shows how to set RAG up. It only reads — it never syncs.
- `search` sends one query to the RAG; `keyword` (default) is free, `semantic` and `hybrid` need `--paid`.
- A record the RAG returns without `lines`/`heading_path` gets them from the local file at its `content_hash`; a changed file marks the record `stale: true`, with no citation.
- Each request waits for its answer by its own random topic and tag; acks and other messages are
  not answers. A lost answer is `unknown`; the next `sync` repeats it.
- The root is rechecked (device/inode) before anything with a body is sent.
- Errors never repeat an argument's value, a token or a reply.
- An mdhouse server from before this version reads its inbox on reconnect and can take a sync's answer:
  the sync then reports `unknown`. Reload it first.

Exit: `0` confirmed sync / search answered · `1` error, refused or failed · `2` usage ·
`4` outcome unknown · `5` sync incomplete (run again to resume)

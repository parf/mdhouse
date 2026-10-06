# DONE

The engineering record: how things work, what was measured, and the traps found on the way.
What each release changed for users is in [`CHANGELOG.md`](../../CHANGELOG.md); why things are
the way they are is in [`DECISIONS.md`](DECISIONS.md).

Test trees named below: **the docs tree** — ~1 000 `.md` files in one large repository, with
tables, nested lists, task lists and Cyrillic text; **the scratch tree** — a directory its own
repository ignores; `~/src` — ~30 sibling repositories.

## Scanning and roots

- `git ls-files -co --exclude-standard` per repository: the docs tree is 1 036 files in 51 ms;
  `~/src` is 1 051 files from 30 repos in 172 ms, found in one shallow pass.
- **A root its own repository ignores** listed nothing, because git correctly reports zero files.
  `scanRoot()` asks `git check-ignore -q .` for the root and falls back to the directory walk;
  such a root has no repos and therefore no history, which is accurate.
- **The path jail** walks up to the nearest ancestor that exists, `realpath`s it and rebuilds the
  tail — otherwise a new file under a symlink out of the tree was judged by its spelling and
  `writeFile` would have landed outside the root.
- Read-only proof: after a full browsing session on the docs tree, `git status --porcelain` is
  empty.

## Rendering

- `data-line` on every block element; nested lists and multi-line blockquotes render.
- Mermaid is served from `/vendor/mermaid/` behind a runtime import; inlined, it made the bundle
  5.4 MB. The app bundle is ~60 KB.
- `<img src>` inside raw HTML is rewritten through `/api/asset`, like Markdown images.
- Links with spaces or non-ASCII were double-encoded (`%2520`); decoding happens once, per path
  segment, in `resolveRelative`, the funnel every rewrite shares.
- `**Q:**` / `**A:**` leading a paragraph, list item or line become ❓ / 💬
  (`questionsAndAnswers`), and keep their own line.

## Search

- ripgrep `--json`, streamed and capped, with an in-process fallback. On the docs tree a query
  matched `rg -l` exactly.
- **ripgrep reports byte offsets; JavaScript indexes UTF-16.** Highlights slid off matches on
  Cyrillic lines until `byteOffsetMapper()` converted them per line.

## Git

- **A NUL cannot travel inside an argv string**, so a `\x00` record separator truncated
  `--format` and every query returned nothing. Git's own `%x00` / `%x1f` escapes fixed it.
- **`diff.external` (difftastic, delta) is honoured by `git diff`**, which handed the parser a
  side-by-side rendering with no `@@`. Every diff passes `--no-ext-diff --no-textconv`.
- **Non-ASCII filenames** come back quoted and octal-escaped unless `core.quotepath=false`, now
  set in the one git wrapper.
- **The creating commit** needs `git log --follow --diff-filter=A --reverse`, and `--reverse`
  cannot stop early: 930 ms on a 108 000-commit repository. It moved off `/api/doc` onto the
  history request and is cached per file — `/api/doc` went from 950 ms to 10 ms.
- **A repository inside the root** had no history: `repoFor` measured from the repo to the
  *root*, which came out as `..`. It measures from the repo to the file.
- A deletion-only hunk has no new-side line; its position is in the hunk header (`+4,0`), which
  `DiffHunk.b` now carries.
- The front page's last-pull time is `FETCH_HEAD`'s mtime, checked in both the git dir and the
  common dir for linked worktrees.

## The marked-up diff

Each block's span runs from its own `data-line` to the next block's, so an added line resolves
to the **deepest** element that owns it — a changed list item, not the whole list. Front matter
is offset by `doc.lineOffset`. The marks are applied to the live DOM and removed on the way out,
so mermaid diagrams, link handlers and scroll position survive the toggle. An older revision's
diff describes a text the page is not showing, so that view falls back to the patch.

The patch view renders each line's inline Markdown server-side (`markupHunks`), with links inert
and raw HTML escaped — in a diff, the markup is the content.

## Client

- `ui/tree.ts` collided case-insensitively with `ui/Tree.tsx` and broke the bundler's resolver;
  it is `tree-model.ts`.
- The WebSocket was torn down on every data load because the effect listed changing values; the
  handler lives in a ref and the socket opens once.
- `buildTree` walked the *uncollapsed* children after collapsing a single-child chain, so every
  collapsed folder contained a copy of itself.
- Two layout traps on the folder page: a path inside a button never truncates, because the button
  grows to fit it; and a file name of underscores cannot wrap. Either one pushed the table past
  the page. Separately, a class named `filters` collided with the sidebar's own.

## Daemon and CLI

- `setsid` gives the daemon a session of its own, so it outlives its terminal; without it
  (macOS) a detached child still outlives its parent.
- **Bun reports a dead unix socket as `FailedToOpenSocket`,** not `ECONNREFUSED`. A stale socket
  is removed only on that code; any other error belongs to a live daemon, and deleting its socket
  would cut it off.
- `-o` opened two tabs, because the launcher passed it on to the daemon; the launcher strips it.
- A port held by something other than mdhouse is detected by binding it for a moment *before*
  detaching, so the answer reaches the terminal rather than syslog.
- **prefs.json used to be lost** two ways: a file that failed to parse loaded as empty and the
  next save wrote that over it; and every process held its own copy, so the CLI, the service and
  a second daemon each undid the others' changes. Now: read–apply–write per change, temp file +
  rename, and an unreadable file is moved aside.
- The systemd unit copies `PATH` from the installing shell (systemd's has no git, rg or bun) and
  `XDG_CONFIG_HOME` when set; another port gets `mdhouse-<port>.service`, which is also how it was
  tested without touching the real one.

## Security

- **DNS rebinding** read every served file and changed settings: under rebinding `Origin`,
  `Host` and `Sec-Fetch-Site` all say same-origin. `trustedHost()` refuses any `Host` that is not
  `localhost`, an IP literal or (with `--host`) the machine's name. Reproduced with
  `Host: evil.example` before the fix (200) and after (421).
- `/api/marks` and the WebSocket took cross-site requests — Bun parses a `text/plain` body as
  JSON regardless. Both now check `sameOrigin()`.
- **Wrapping Bun's `routes`**: the HTML bundle is an object with no enumerable values, so "every
  value is a function" was vacuously true and the guard replaced it with `{}` — the server would
  not start. Method maps are now recognised by their upper-case HTTP-method keys, and a test
  starts a real server so a startup failure cannot pass the suite again.

## Verification habits

- `tsconfig.json` covers `src/` and `test/`; before 0.4.0 the tests were never typechecked.
- UI changes are checked in headless Chrome against the real trees, including at narrow widths
  and with a root of ~1 800 files.
- Anything that writes config is tested against a temporary `XDG_CONFIG_HOME` and a spare port,
  never against the live instance. 121 tests.
- Restarting the live instance re-adds folders that were added for the session only — a bare
  restart brings back just the saved ones.

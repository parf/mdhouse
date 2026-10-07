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
- `::: q` / `::: question` / `::: a` / `::: answer` are markdown-it-container blocks
  (`qaContainerPlugin`). The container's open token has a `map`, so the existing line-map rule
  tags it with `data-line` with no extra work; the custom renderer emits it via `renderAttrs`.

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
  rename, and an unreadable file is moved aside. **Then the fix had its own bug:** two changes
  at once in one process (two quick ★ clicks) both read the same file, and the later write
  dropped the earlier change — or failed renaming a shared temp file. Changes now queue
  in-process, and every temp file has its own name. Found by the 1.0 pre-release review.
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

## Checkbox write-back (1.1)

- `--rw` became per folder: `Registry.create([{ path, writable }])`, a `writable` list in prefs
  (only saved folders can be in it), and `/add` with `rw` upgrading a served root in place.
  Before, the daemon built every root, saved ones included, with the one process flag.
- A tick is `POST /api/task { p, line, hash }` → `toggleTask()` → `Registry.writeFile()`; the
  watcher's push reloads every tab. The page also refetches after every click, so a box always
  carries the fingerprint of the file as it now is.
- **Trap:** the document page re-decided its view whenever the file's git status changed. A
  tick makes the file "modified", which threw the reader out of the document into the patch
  view, where boxes are disabled. The view is now decided once per document, when it arrives.
- **Trap:** a refused click reloads identical HTML (nothing was written), so the effect that
  re-enables boxes never re-ran and the box stayed disabled; the handler re-enables it itself.
- Verified on scratch git repos on a spare port: one tick → one changed line (`git diff`), a
  second tab followed live, a read-only folder's boxes stay disabled and a forced POST gets
  `403`, a stale fingerprint gets the note and no write.

## Answering in the browser (1.2)

- `src/lib/qa.ts` finds a question's and an answer's line ranges per form and writes the
  answer; `GET`/`POST /api/qa/answer` → `writeAnswer()` → `Registry.writeFile()`, on the same
  per-file queue as ticks (`queueWrite`). The renderer's `data-hash` and the server's are the
  same `lineHash` over the same lines — a test checks every form.
- **Trap:** the editor was first a controlled textarea whose text went through `Doc` state and
  an effect that re-rendered it into its host. Keys typed faster than that round trip were
  overwritten by an older render. The editor now owns its text; `Doc` keeps a copy for remounts.
- **Trap:** on a re-render the editor silently took the question's new fingerprint and the
  answer's, so a save after someone else's answer overwrote it without a word. It now says so.
- **Trap:** the markdown-it core rule that marks task items runs before inline parsing:
  `children` is still empty, so a status glyph is cut from `inline.content`, not from a text token.
- Verified in headless Chrome on a scratch repo (the playground): every form inserted and
  replaced, bullets inside the answer, Check & Save on a box and a glyph, Esc, a question
  changed on disk and an answer written meanwhile under an open editor. A modified file opens
  on its diff, where answering is off — the test switches back to the document first.

## Packaging

- **Every npm release before 1.0.0 served `500 Build Failed` at `/`.** Bun bundles the UI at
  request time, and its JSX settings (`jsx: react-jsx`, `jsxImportSource: preact`) live in
  `tsconfig.json` — which `package.json` `files` did not include. A clone has the file, so it
  only failed for people who installed the package. Found by the 1.0 release check: `npm pack`,
  install into a temporary prefix, start it, load the page in a browser. That check is now part
  of every release.

## Verification habits

- `tsconfig.json` covers `src/` and `test/`; before 0.4.0 the tests were never typechecked.
- UI changes are checked in headless Chrome against the real trees, including at narrow widths
  and with a root of ~1 800 files.
- Anything that writes config is tested against a temporary `XDG_CONFIG_HOME` and a spare port,
  never against the live instance. 121 tests.
- Restarting the live instance re-adds folders that were added for the session only — a bare
  restart brings back just the saved ones.

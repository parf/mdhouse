# mdhouse — project knowledge

Stable knowledge for working on mdhouse. Open work is in [`TODO.md`](TODO.md), finished work in
[`DONE.md`](DONE.md), decisions in [`DECISIONS.md`](DECISIONS.md), and what each release changed
for users in [`CHANGELOG.md`](../CHANGELOG.md).

## Purpose

A Markdown workspace on your own machine — read every file, answer questions, triage issues and
commit, together with your AI agents. Point mdhouse at a directory and every file under it opens
at its own address, live, with git history and diffs. In folders served with `--rw` the page
writes ticks, answers and added blocks into the file, and commits, pulls, pushes from the git view.

Ticket: PRF-55 — <https://linear.app/realmo-product/issue/PRF-55/md-files-viewereditor-web-mdhouse>

## AI team development

[`ai-team/`](ai-team/README.md) defines the project-wide development model: durable scope and status
live in Plans, assignments and results travel through Agent Bus, and the role sessions run in Kitty
through the required `ab-*` launchers. It applies across the project and is not part of a release.

## Architecture

One Bun process. `Bun.serve` bundles `src/index.html` and everything it imports natively, so
there is no separate build step — `bun run src/cli.ts <dir>` is the whole thing. A Preact SPA on
the client; a JSON API and a WebSocket on the server; a unix socket for the CLI to talk to a
running daemon.

```
src/
  cli.ts         arguments, launcher (detach, hand-over, exit), `service` subcommand
  server.ts      Bun.serve — routes, API, WebSocket, roots added and removed at runtime
  index.html     the bundle entry point
  app.tsx        shell: routing, data loading, keyboard, live channel
  lib/           server side: roots, urls, access, filetypes, ignore, prefs, scan, render, qa, qa-html, legacy,
                 insert, git, gitpage, search, store, watch, control (unix socket), service (systemd unit),
                 loghint (where output goes), agent-bus (the Agent Bus client)
  ui/            client side: Sidebar, Tree, Doc, Diff, Home, DirPage, GitPanel, PageHead, Settings,
                 AboutModal, AgentBusPanel, QaEditor, VoiceInput, QaStrip, qa-page, AddEditor, ExternalEdit, mark-changes,
                 RootSelect, tree building, icons, formatting
  styles/        one stylesheet, CSS custom properties, light and dark
scripts/
  cdp.ts         clicks and screenshots in headless Chrome for UI checks — not in the npm package
```

`lib/` is imported by the client for its **types only** — those imports erase at build time —
except `filetypes` and `urls`, shared by both (`filetypes`' shiki import is tree-shaken out of the
page — shiki has `sideEffects: false`). No server code ships to the browser.

## Contracts and invariants

### Never write to a tree that did not ask for it

Writability belongs to a **folder**, never to the process. OS-owner CLI `--rw` explicitly grants
write access; reopening without it does not upgrade access. A verified administrator can add an
existing directory with an explicit RW/RO choice and confirm mode changes in Settings. Saved choices
persist; session choices stay in memory until saved. Explicit RO defeats auto-RW; reference/path and
unsupported-config caps remain authoritative. See the scoped access and project-add contracts below.

Every disk write to a served tree goes through the one chokepoint `Registry.writeFile()`, which
refuses a read-only root and writes whole or not at all — a temp file beside the document, renamed
over it (through a symlink to its target, the mode kept). Its callers are `POST /api/task` (a checkbox tick),
`POST /api/qa` (a change to one Q&A item) and `POST /api/insert` (a block added
under a heading). mdhouse's own config (`prefs.json`, the
control socket) lives outside every tree.

Reference roots (`kind: 'reference'`, `Registry.addReference`, `_…` IDs) are never writable or removable
and do not count as projects for `defaultRoot`/`single`. `Registry.writeFile()` also refuses their files
through overlapping project roots or symlinks. Git commit/reset/pull preserve the same read-only floor.
Every daemon start mounts installed `<pkg>/doc` as `_mdhouse` (`mdhouse reference`) after project
roots. Naming that directory or its alias is refused; a saved copy is skipped without rewriting prefs.
`/api/doc` reports `writable: Registry.writableAt(loc)` and `reference: true` for reference paths,
including overlap addressing; UI hides write controls, external editing and Agent Bus dispatch there.
The reference ships the plan convention, Markdown/markup guides and canonical shareable skills under `doc/skills`.

### A Q&A change touches its item, or nothing

- `src/lib/qa.ts` — the item model of the markup (`.claude/skills/markup.md`): `qaItems` on markdown-it's
  block tokens, shared by the renderer and the server; `stateOf` (`.claude/skills/qa-states.md`); `ITEM_ID` — an
  item's anchor (`D1`, `Q-R1`, `RW.2`); `applyQa` — say ·
  verdict · pick · tick · done · target · edit
- `src/lib/qa-html.ts` — an item as HTML: `data-qa`, `data-line`, `data-hash` (`lineHash` of the item's
  lines), `data-k`; every reply / option / 💡 its own `data-line`
- `src/lib/legacy.ts` — `convertLegacy`: the old forms rewritten into the markup; every read of a doc goes
  through it (`readDoc` in server.ts), so a write writes it converted
- `GET /api/qa` → `{me, text?}` (a reply's text to edit); `POST /api/qa` writes only if the item's
  fingerprint still matches — else `409`; shares the per-file queue with ticks
- client: `src/ui/qa-page.ts` (delegated buttons), `src/ui/QaEditor.tsx` (the form, Alt+1…9, Alt+E), `src/ui/VoiceInput.tsx` (browser speech input, shared with Agent Bus), `src/ui/QaStrip.tsx`
  (counts, filter); drafts live in `Doc`, kept per document when the reader leaves

### An added block goes where the heading says, or nowhere

`src/lib/insert.ts`: top-level headings render with `data-hash` (`lineHash` of the heading line);
`insertBlock` re-checks it, then inserts right under the heading or at the end of its section —
the next top-level heading of its level or higher, from the renderer's block parse (`sectionOf`),
trailing blank lines kept after the block — separated by blank lines, in the chosen kind's syntax;
new lines end as the line before them (`insertLines`, shared with `applyQa`). A signed quote takes
the repository's `git config user.name` (else the login), resolved on the server.

### A tick changes one line, or nothing

`toggleTask(src, line, hash)` in `src/lib/render.ts` flips one bracket, nothing else. The rendered
checkbox carries `data-line` (1-based, within the body) and `data-hash` (FNV-1a of the raw source
line); the server re-reads the file, counts front matter back in, and flips the bracket only if
that line still hashes the same and still looks like a task item — else `409`, and the page
reloads. Writes to one file are queued; `\r\n` and every other byte are kept.

### The path jail

`Registry.resolve()` is the only way a request value becomes an absolute path. Two gates: a
textual one (no `..`, no NUL) and a filesystem one — the nearest existing ancestor is
`realpath`ed and the result must still be inside the root, so a not-yet-existing file under a
symlink is judged by where it would really land. Nothing outside `src/lib/roots.ts` may join a request
string onto a root path.

Instance dirs (`Registry.hide`, at `serve()` start): `dirname(prefs.path)`, `CONFIG_DIR`,
`$XDG_STATE_HOME/mdhouse`, `$XDG_RUNTIME_DIR/mdhouse`, by real location — when one lies strictly inside a
root, `resolve()` → null for anything in it (a root that is or is inside one is served as named), so every read/write route, the tree, files and search refuse it as a jailed path;
watcher events and the flow `dirty` list drop their paths.

### URL shape

- `/<rootId>/<rel>` — a file's page; the root id always leads, also with one root.
- `/<rootId>/<dir>/` — a folder's page (trailing slash); `/<rootId>/`, `/<rootId>` — the root's.
  A folder without its slash → 301 to its page.
- Built and parsed by `src/lib/urls.ts` (`fileUrl`, `dirUrl`, `routeOf`, `isPageHref`) — server
  (`Registry.docUrl()` / `fromDocUrl()`) and page alike.
- A root id never takes a reserved name (`RESERVED`: `api ws vendor __app _bun settings d
  favicon.ico`) — suffixed `-2` as a clash is.
- `/d/…` (the old shape) → 301 to the new address, query kept.
- `/` — the front page; `/settings` — settings.
- A root switch goes back to the page last shown in that root — localStorage `mdhouse.lastByRoot`
  `{rootId: url}`, a document by its own `url`; only when it is still there (`api.pageExists`:
  `HEAD /api/raw`, a folder `/api/files`), else as before.
- Views V1 / V2 (`src/ui/views.ts`): per root, files `rel` and folders `dir/` — localStorage
  `mdhouse.views`. Each is a sidebar tab after Mine (`Tab` `V1` / `V2`): the tree narrowed to it,
  muted files left out; its count on the tab, an empty one says how to fill it. `ViewChips` on a
  document's and a folder's title, and on a document's breadcrumbs (its folder), adds (`+V1`, on
  hover) and takes out (`V1`).
- Ignored browsing: Show ignored/Hide ignored appears when eligible gitignored Markdown exists
  (or the switch is on). Direct folder navigation reveals its eligible files without changing the
  switch. Folders selected in either V1/V2 also appear in main/default; each V tab keeps only its
  own entries. Explicit exclusions and `.git` protection still apply. Direct file navigation also
  reveals its parent scope and expands/selects the exact file without changing the global switch.
- File Git state is server-supplied `gitState: ignored | untracked`: shared orange/blue row names
  and distinct Gitignored/Untracked badges in sidebar, lists and right file panel, light/dark.
  Missing/no-repo/noGit is neutral; prefs ignored marks and synthesized local status confer no Git state.
  Store caches collapsed ignored/untracked path sets (two Git calls per repo per invalidation),
  longest owning repository wins; tracked files have neither new badge.

### Git is batched

Recents, authors and status badges come from one `git log` and one `git status` per repository,
never one call per displayed row. Committer filtering happens client-side on data already
fetched. Every git call goes through one wrapper that sets `core.quotepath=false`, and every
diff passes `--no-ext-diff --no-textconv`.

### `data-line` on every rendered block

A `markdown-it` core rule copies `token.map[0]` onto each block element. The marked-up diff view,
ticks, Q&A writes and ↓ ⇊ use it; section → AI and editor scroll-sync will. Do not remove it.

### One anchor scheme

Heading slugs are generated server-side by `markdown-it-anchor` and used unchanged by the
contents list, so a heading link and its contents entry cannot disagree.

### Who may talk to the server

- Routes: the page — `/`, `/<rootId>/…` (`fetch` → `rootPage`, unknown → 404), `/settings` (the bundle at `/__app/`), `/d/*` → 301, `/vendor/mermaid/*`, `/ws`; read —
  `/api/roots`, `/api/tree`, `/api/doc`, `/api/raw` (`/api/asset` its old name), `/api/files`, `/api/search`, `/api/recents`,
  `/api/digest`, `/api/git`, `/api/git/commits|files|remote|log|diff`, `/api/ab`, `/api/ab/job`; write — below.
- **Every route** (and the WebSocket) first passes `trustedHost()`: the `Host` header must be
  `localhost`, an IP literal, or — when bound to the network with `--host` — this machine's own
  name. Anything else is `421`. With `access.hostNames` (`--host-name`) set, only those names
  pass — localhost and IPs are `421` too; read per request like `access`. This is the DNS-rebinding guard: a rebound page looks
  same-origin in every header except the name it was addressed to. `guard()` in `src/server.ts` wraps
  every route.
- **Then access** — `admit()`, `src/lib/access.ts`, off until set from the CLI: an address outside
  `--allow` (this machine always passes) is `403`; with any user, no valid Basic login is `401`.
  Read from `prefs.json` + `secrets.json` for every request (re-read when either changes), so `user-add`
  applies to a running server at once. The page routes hand out the HTML bundle's page from a
  hidden `/__app/` route, so the page is behind both checks too; the bundle and its chunks are
  code with no data, and stay open. [doc/access.md](../doc/access.md).
- **State-changing requests** — `POST /api/marks`, `/api/task`, `/api/qa`, `/api/insert`, `/api/roots/remove`, `/api/settings`,
  `/api/git/commit|commit-file|commit-files|pull|push|reset`, `/api/ab/default|filter|send` — and the
  WebSocket upgrade also pass `sameOrigin()`: `Origin` and `Sec-Fetch-Site` must not name another
  site. Bun parses a body whatever its content-type, so this is the only thing standing between
  a cross-site form post and the handler.
- `/api/files?p=<root>/<dir>` lists every file under a folder (the folder page's ALL view): git's list
  in a repo (`.gitignore` holds), else (or in a folder its repo ignores) a walk without dot-folders and `node_modules`; at most 5000.
  `src/lib/scan.ts` `listFiles()` preserves explicit root exclusions and resolves each result through
  Registry before stat; `.git`, canonical aliases into exclusions and outside symlinks are refused.
- Every file has a page. `src/lib/filetypes.ts` `kindOf()`: `md | code | text | image | pdf | html |
  video | audio | binary` — by name; `langOf()` (Shiki ids + aliases + `Dockerfile`, `.h`, `.conf` …)
  → `code`; an unknown name: no NUL in its first 8 kB → `text`, else `binary`.
- `/api/doc` answers every kind: `{kind, raw, …}`; Markdown rendered; `code` / `text` / `html` →
  `html` by `src/lib/render.ts` `highlightFile()` — one `<span class="line" id="L<n>">` per line, plain `<pre>`
  over 300 kB, no body over 5 MB (`tooBig`). Write routes stay Markdown-only (`docAt`).
- **`.git` never:** a path with a `.git` segment is 404 on `/api/doc` and `/api/raw` (remote URLs,
  credentials).
- `/api/raw` — `Content-Security-Policy: sandbox` without scripts on HTML, SVG/media, code/text and
  unknown binary; HTML iframe also has empty `sandbox`. Code is text/plain; PDF uses the browser's
  viewer without that header; unknown binary is `attachment`. `nosniff` on all.
- Rendered links: every file in the root → its page (`localHref`); `<img src>` → `/api/raw`.
- `/api/git/diff`: Markdown lines rendered (`markupHunks`); any other file's as typed.
- The CLI goes over the `0600` unix socket instead, which a browser cannot reach at all.

### Agent Bus

`src/lib/agent-bus.ts` — [ab-integration.md](ab-integration.md). `agentBus.enabled` is `true`, `false` or `'auto'` — `auto` is the default of a NEW prefs file only (`fresh()`); an existing file keeps its value, an older mdhouse reads `'auto'` as off (`=== true`); `Prefs.agentBus` returns the effective `enabled` (auto: `accountSocket().found`, looked at on every call — `$XDG_RUNTIME_DIR/agent-bus/user-<login>.sock`, else `/run/agent-bus/…`; `MDHOUSE_AB_SOCKET_DIRS`, colon-separated, replaces that search for a sandbox or a test; `test/preload.ts` points it at nothing) and `stored` (the saved value); `--agent-bus on|off|auto|<sock>|<url>`; start/status line `abLine()`. Off: every `/api/ab*` POST is 404.

- The daemon through `ai-agent-bus-sdk` (`connectBus`: every client option explicit) over its account socket (`user-<login>.sock`); or `http(s)://host:port` with `agentBus.token` (asked for by `--agent-bus <url>`, never in argv, never sent to the page)
- mdhouse is its own agent `#mdhouse@<host>`: registered create-only (`If-None-Match: *`; 412 = there), canonical `tags: ["personal"]` and `allow: ["@owner"]` on creation; existing records keep owner settings, token minted, every call with it
- A connection never reads its inbox unfiltered: each call waits for its own topic and tag; earlier-run replies expire by the daemon's TTL. Endpoint/credential changes preserve active connections and the shared job index.
- **Never `AGENT_BUS_*` from the environment** — a mdhouse started from an AI session's shell would act as that session
- Alive: `readers > 0`, or `last_used` < 90 s
- `/api/ab/send` `{p, targets, action, note}` → `{job}`; per target `sent`, then the client's `call` (topic `mdhouse`) → ack, answer / `done` / timeout at 10 min; events → WS topic `ab` and kept per job (last 50) for `/api/ab/job`
- The request text names the file by its absolute path and the page by its URL (`requestText`)
- `/api/doc` → `ab: [names]` from `<!-- AB: … -->` — only while on
- Page: `AgentBusPanel` — a chat panel on the right, `position: fixed`; `main` and the top strip get `margin-right` via `.app:has(.ab-panel)`; full width ≤720px. `a` / the button opens it and turns the left sidebar off (`onAgentPanel`). Closed, it stays mounted (returns null) so its jobs keep listening and the button shows waiting / answered
- **Every page keeps its last 20 requests** with their answers — localStorage `mdhouse.ab.<root>/<rel>` (`KEEP` in `src/ui/AgentBusPanel.tsx`); back after a reload
- The conversation per document: a module `Map` keyed by the wire path, saved to that key; live events reach it through `src/ui/api.ts` `liveListeners`. A kept job still waiting that `/api/ab/job` no longer knows (404 — mdhouse restarted) is shown `lost`
- A restart of mdhouse drops every waiting job: reply first, then restart
- `agentBus.filter` — a regex per line against the name without `#` (default `^claude ^codex ^opencode`), narrows `/api/ab` agents; a default agent always stays; `POST /api/ab/filter` refuses a line that is not a regex
- Control (MW.7): `src/lib/ab-control.ts` `Control` answers topic `mdhouse.ctl` `{v:1, op, requestId}` — `inventory` → roots + tabs; `open {rootId, path, clientId}` → `{url, opened, reason?: gone|busy|team}`, one tab only, never broadcast; reads only. Sender: daemon `@owner`, then `agentBus.control` (`off` | whole-name regexes, each valid on its own — `a)|(.*` refuses all; empty = no narrowing; a bad regex or malformed value refuses all; `--ab-control`). Path: `registryDocUrl` (`registry.resolve`, `.md`/`.mdx` file, no `.git`). Replay by sender + `requestId` (500, 10 min); other params → `conflict`. Tabs: at most `TABS_MAX` (200) per server, past it the longest idle is dropped. Audit: journal line + agent log (while on)
- Automation (MW.11, not wired): `src/lib/automation.ts` — `parseRegistration` (strict `.mdhouse/automation/<id>.json`), `Automation.handle({from, schedule, body})` (the bus `schedule` stamp from `#bus` is the only provenance; body `{v:1, op:'run', project, registration}`; replay by `<scheduleId>:<slot>`; overlap skip, 5 min interval, 10/day, 3 failures stop; every firing asks `deps.approval`, `notApproved` always says no until Q-R3-AUTO2), `RunIndex` (`automation/<root>/<id>/state|hist/…`, 200 kept); `src/lib/automation-registry.ts` — the jailed loader (`runnableFlow` packages only, 16 KiB, plain files in the project)
- Automation page (MW.11 slice 2 UI): `src/ui/AutomationPage.tsx` at `/<root>/?automation` (a flag on the project's address like `?git`: no server route; `onAutomation`; linked from Settings → project → Automation), contract `src/ui/automation-model.ts` / `automation-api.ts` — `GET /api/automation?root=` (`canApprove`, registrations with `approval` none|approved|changed, `runs`, `errors`), `POST /api/automation/approve {root, registration, hash}` (409 `stale` when the file changed), `/revoke`; Approve/Revoke only when the server says `canApprove`
- Search and phone navigation (Q-R3-UX1): `src/ui/search-scope.ts` (`Files | Index`, remembered; an Index search is `/rag?q=…`), `src/ui/nav.ts` + `PhoneNav.tsx` (≤900px touch: Files · Changes `/<root>/?git=changes` · Search · Ask, badge from `changeSummary`; Doc ↔ App through the `mdhouse:ask-agent` / `mdhouse:ask-state` window events)
- Automation (MW.11): `src/lib/automation.ts` — `parseRegistration` (strict `.mdhouse/automation/<id>.json`), `Automation.handle({from, schedule, body})` (the bus `schedule` stamp from `#bus` is the only provenance; body `{v:1, op:'run', project, registration}`; replay by `<scheduleId>:<slot>`; overlap skip, 5 min interval, 10/day, 3 failures stop; every firing asks `deps.approval`), `RunIndex` (`automation/<folderKey>/<id>/state|hist/…`, 200 kept); `src/lib/automation-registry.ts` — the jailed loader (`runnableFlow` packages only, 16 KiB, plain files in the project); `src/lib/automation-state.ts` — `busStore` (JSON values in the KV of the instance's `#mdhouse` record, [№DATA-W2](R3/workspaces/DECISIONS.md#DATA-W2)), `Approvals` (`auto/approval/<folderKey>/<id>` `{hash, scheduleId, at, by}`; `check` fail-closed), `folderKey` = sha256(root path)[0:16]. Wired in `serve()`: `bus.control({topic:'schedule', lock:'auto'})` (Viewer → `viewer`); a schedule body's `project` = `folderKey`, mapped by `AutoDeps.project` to the served root (none → `unregistered`); start = `startFlowRun` (trigger schedule), audit → journal + agent log, notify → `bus.tell`
- `mdhouse docs [--path]` (`src/cli.ts`, pure parts in `src/lib/docs-cmd.ts`): prints the one line for a project's AGENTS.md (the GitHub raw URL of `for-agents.md`), then the installed `doc/` path and the daemon's `/api/raw?p=_mdhouse/for-agents.md` for offline use; runs before any daemon or prefs write
- Serving: `AgentBus.control` — while on and `control` ≠ `off`, holds lock `ctl` on its own record (TTL 60 s, extended every 20 s) and writes a per-process nonce to KV `ctl.owner`; a foreign nonce or a failed extend stops serving (one agent name = one lock holder); while `ctl` is held under a foreign nonce no process takes it, even where the daemon would grant it again to the same name (agent-busd 1.0.15 does not). Shutdown releases it (≤ 1.5 s)
- Tabs: `src/lib/ws-tabs.ts` — `/ws` hello carries `clientId` + `resume` (HMAC, per-process key); `/ws?client=<id>.<proof>` keeps the id unless a live socket holds it; client frames `ping`, `{t:'at', page, title, busy}`; server frame `{t:'open', url}` to one socket. Client: `src/ui/tab-presence.ts` (sessionStorage `mdhouse.client`; DocEditor unsaved → busy; `openTarget` same-origin path only)

### Agent skills read the page's states

`.claude/skills/` — Claude Code skills, not in the npm package:

- `/ask-questions` → `/resolve-questions` — questions in the markup (default `Plans/questions.md`);
  answers carried into `DECISIONS.md` / `TODO.md`, then `✅`
- `/find-issues` → `/fix-issues` — a read-only reviewer per touched subsystem (`Plans/subsystems.md`)
  writes `Plans/issues/YYYY-MM/YYYY-MM-DD.md`; the triaged and `🎯` ones done, `✅` + the commit
- shared: `.claude/skills/qa-states.md` (states, who acts), `.claude/skills/markup.md`, `.claude/skills/glyphs.md`, `.claude/skills/review-checklist.md`
- `src/lib/qa.ts` `stateOf` and `.claude/skills/qa-states.md` say the same states — change both together

## Data sources

- `/api/doc?meta=1` returns common metadata and owning HEAD `gitRevision`, no body/token/render.
  `ifContent=<64 lowercase hex>` compares SHA256 of normalized full renderer source (frontmatter
  included) or read highlighter text; equal returns `unchanged:true` plus metadata before rendering.
  Binary/tooBig has no hash. Parameters cannot be combined; existing root/.git/admission guards apply.
  Source hash is not authorization or filesystem-atomic proof. Manual/full reload refreshes semantic
  context such as link existence and Agent Bus targets; conditional answers retain that context.
  `ui/doc-refresh.ts` binds replies to root/path/content/generation; stale metadata cannot win newer
  content/navigation, missing optional status/state/reference clears old values while body/token stay.
- File History is hidden and not fetched for authoritative Gitignored. Untracked history is fetched
  but hidden until current-file commits are confirmed; tracked behavior is preserved. Shared history
  helper binds path/revision/state, so old answers cannot reopen another file's panel. Useful current
  changes and the return-from-diff control remain; empty previous-revision controls are hidden.

- Mermaid output remains an inert SVG image: detached template normalization + XMLSerializer, strict
  SVG namespace/XML/viewBox validation, decoded natural dimensions before replacement. Native helper
  `ui/mermaid-image.ts` bounds input/output and decode wait; errors are visible text, no active SVG fallback.
  Mermaid effect follows actual safeBody/actToken changes, including same-URL refetch; stale async
  generations cannot replace or mark detached/currently superseded blocks. Generic Git events
  request file metadata only; exact-file FS events use conditional renderer-source hashes, retaining
  unchanged body/provenance. Stable HEAD/status/state drives history without repeated body rendering.

- **File list** — `git ls-files -co -s --exclude-standard` per repository, so `.gitignore` is
  honoured with no configuration; a nested repo (`name/`) or submodule (mode 160000) is listed
  the same way; a directory walk with a deny list covers ground that is not in
  any repo, or that its repo ignores. `src/lib/scan.ts`.
  `GET /api/tree` adds hasIgnored/revealed/capped and accepts repeated root-relative reveal scopes:
  max 32, 1024 UTF-8 bytes each, 16 KiB total. Malformed scopes return 400; denied/missing scopes
  are omitted. A selected scope lifts built-in defaults only along its own path, not explicit
  `.mdhouseignore`/extraDeny or `.git`. Base/scope results pass Registry before stat; ignored
  availability uses eligible jailed paths. Scopes cache in a 64-entry per-root LRU until invalidate;
  each is capped at 5000 files, with a visible incomplete warning. Registry checks cost one realpath
  per listed path per invalidation.
- **Git history, status, HEAD** — `git log --name-status`, `git status --porcelain`, and
  `rev-parse` plus `FETCH_HEAD`'s mtime for the front page's branch and last pull. `src/lib/git.ts`.
  A path goes to git as `:(literal)<path>` (`literal()`); a folder's Markdown as `./<dir, glob
  chars escaped>/*.md`.
- **Content search** — `rg --json --hidden` when ripgrep is installed, an in-process scan when it
  is not; hits only in the scanned tree.
  `src/lib/search.ts`.
- **Config** — one file, `~/.config/mdhouse/prefs.json` (`$XDG_CONFIG_HOME` respected): marks
  keyed by absolute root path, the saved directories, the settings page's options, and `server`
  (`port`, `host`) saved by `-p --port/--host`, and `access` (`allow` networks, `users` login →
  argon2id hash, `hostNames`), and version-2 `autoRwRules` paths (`--auto-rw`; `settings.autoRw` switches them), and `agentBus` (`enabled`, `socket` — a path or `http(s)://`, `token` for a URL —
  `--agent-bus [on|off|<x.sock>]`; `default` agents and the names `filter` — the settings page), canonical
  `agentBusSpaces` overrides with server-only credentials, and
  `settings.me` — the name a signed Q&A reply carries (empty: git, else the login). A root's
  `writable` derives from `inherit | rw | ro`: explicit RO beats auto, explicit RW and inheritance
  remain capped by reference protection, invalid/unsupported prefs and a Viewer (`mode: "viewer"`,
  `--viewer|--workspace`, `mode` in `/api/settings`; the file is then version 3 with `writable[]`
  moved to `viewerWritable[]`). Auto changes and CLI grants apply live (`Prefs.refresh()` re-reads the file
  when it changed). Read as JSON with comments; every key is in `doc/prefs.json.dist`. Port and host resolve as flag → env → config →
  `127.0.0.1:7777`, the same in every command, so the unpinned systemd unit (`mdhouse --fg`)
  comes up where a start by hand does; a port from `service --port` or `MDHOUSE_PORT` is pinned into it. Beside it, `control-<port>.sock`. Never a dotfile inside a
  browsed tree.
- **Git view** — `/<root>/<dir>/?git`, `/` redirects to the root's: `Home` scoped to a folder,
  plus `src/ui/GitPanel.tsx` (remote check, commit / pull / push, Commits, Files). Server:
  `src/lib/gitpage.ts` behind `/api/git`, `/api/git/commits|files|remote` (files: the first 5000, `capped`), POST
  `/api/git/commit|commit-file|pull|push|reset` (reset: one `.md` file, `git checkout HEAD -- file`, only if it still has the shown diff's `hash` — else 409; commit-file: one file from its own page, `git add` when untracked then `git commit -- file`, 409 when it is clean; commit-files `{p, message, files:[{path, code}]}`: the Changes view's ticked entries as `dirtyFiles` lists them — each still dirty with that code under the queue, else 409 `{error, files}`; R/C/U/AA/DD → 409 terminal; `git add` the `??` ones, then `git commit -- <:(literal) paths>`, other staged files left) — writable folder, same origin, one at a time per repo; commit and commit-file refuse (409) a file outside the root or in a read-only root, pull a repo holding a read-only root or files outside the root; network
  git never prompts (`GIT_TERMINAL_PROMPT=0`, ssh `BatchMode`). Files link to their pages (under the root;
  else plain text) — no host links.
  Tab in the url: `?git` Recent, `?git=favs|mine|commits|files`.
- **One header** (`src/ui/PageHead.tsx`) for a folder page and its git view: logo; folder name —
  on the folder page a link to its git view, everywhere else to the folder page; on the right
  GIT / Favs / Recent / Mine / Commits / Files (GIT, Commits, Files only inside a repo) and ⚙.
  A document's header has a git button before ✎: the root's git view.
- **Folder pages** are built in the browser from the tree payload it already holds; they cost
  no request.

## Operational rules

- Everything is cached per root in `src/lib/store.ts` and invalidated by the filesystem watcher —
  never rebuilt per request. A root removed at runtime drops its cache and its watchers. The
  watcher: the root, recursive; plus the git dir and common dir (`rev-parse --absolute-git-dir
  --git-common-dir`) outside it — a folder of a checkout, a linked worktree.
- Live updates are WebSocket pushes. **No polling anywhere**, by decision.
- `git` and `ripgrep` are used when present and degrade gracefully when absent. The sidebar
  footer shows `no git` when the git path was unavailable; search results say `no ripgrep` beside
  "In contents" when the in-process scan ran (`SearchResult.degraded`).
- `prefs.json` has several writers (the CLI, a daemon per port, the systemd service). Every
  change is read–apply–write against the file as it is now, one at a time within a process
  (`Prefs.queue`) and across processes (`prefs.json.lock`, `O_EXCL`; unchanged 2 s → stale, taken over), written to a uniquely named temp file (0600, the dir created 0700) and renamed
  into place — a symlinked `prefs.json` at its target; a file that does not parse is moved aside as `prefs.json.broken-<time>`, never
  written over. Secrets (`lib/secrets.ts`): `secrets.json` beside the real `prefs.json` (0600) — `{version:1, agentBus:{endpoint, token}, spaces:{<path>:{endpoint, credential}}, users}`, written first (none made while empty); `prefs.json` gets `token: ''`, no well-formed space credential, each hash `SECRET_MOVED` (never verifies: every release since 1.4 catches the throw → false). On read a real value in `prefs.json` wins (an older writer) and moves on the next write; token/credential apply only to the same endpoint; a `secrets.json` that is not JSON or another version blocks the pair (Viewer, no write, no login). Unknown top-level keys are kept; unsupported/newer or ambiguous access formats are never written and grant no root write access. The CLI still sends `-p` / `--rm` to a running daemon, so its open tabs update.
- The systemd unit (`MDHOUSE_SERVICE=1`) is stopped by `systemctl` only: `mdhouse exit` sees
  `service` in the ping and names the command instead (exit 1); its `--fg` with the port taken
  exits 1 instead of handing over, so `Restart=on-failure` retries.
- A control call times out — ping / exit 2 s, add / remove 60 s: a daemon that does not answer
  (Ctrl+Z) is `{error}` "not answering", its socket kept; every command says so and exits 1.
- One control socket per port. A live one is never unlinked: a second server on the port (another
  host) runs without it and says `mdhouse exit` cannot reach it.
- Tests: `bun test`, against a temp config dir (`test/preload.ts`); types: `npx tsc --noEmit -p .`, which covers `src/` and `test/`.

## External editor schemes

`settings.editScheme` defaults to `edit`; `normalizeEditScheme` and `editUrl` in shared `lib/urls.ts`
normalize custom app schemes, refuse browser/executable schemes and encode path segments. Invalid
Settings patches return 400 before changes; invalid loaded values use `edit`. Disabling `editLink`
hides controls without erasing the scheme. Reference documents never expose external editor links.

## Flow authoring packages

`lib/flow-package.ts` validates data-only versioned manifests and explicitly catalogued Markdown assets
under `doc/flows/`. The bounded loader reads trusted caller-selected package directories, rejects
traversal/symlink escapes and declares approval boundaries; it never grants access or executes work.
The catalog ships 39 authoring packages; live runtime, schedules and persisted run records remain R3 work.

`lib/flow-run.ts` validates bounded caller-asserted analysis state and replays versioned events for
consistency, not authenticity or semantic truth. `lib/flow-run-markdown.ts` renders a deterministic
unsaved preview with supplied data in inert JSON fences. Both grant no authority and perform no
filesystem/provider/HTTP work; materialization, actual approvals and marker updates are separate.

`lib/flow-host.ts` (MW.3.3 A) — packages only from `<reference>/flows`, runnable: `runnableFlow(m)` — `explicit-baseline` range, every step `analysis` + approval `none`, a required evidence label matching `/\brange\b/i` (`rangeLabel`, the one the host supplies); now recent-commits-review, project-review, docs-refresh-verify, engineering-delivery-sync.
- `planFlowRun` reads git (HEAD, base, `base..HEAD`, uncommitted paths apart, any file type) and returns the exact run document + HMAC token (per process) over `{req, runId, startedAt, sha256(doc)}`; writes nothing
- Range: `since-last-run` = `last-commit-id` of `defaults.destination` (none → 409 `no-baseline` `why: first-run | marker-missing | marker-unreachable`); `baseline` = `/^[0-9a-f]{4,40}$/`, a commit, ancestor of HEAD, else 400 `bad-baseline`
- `startFlowRun` — RO → 403 `not-writable` first; then queue `flow:<root>:<package>` + `queueWrite(<destination abs>)`; inside: open run (`openRunOf`: newest `running`/`held` that `verifyRun` accepts — a refused one blocks nothing; the catalog's `openRun` is the same) → 409 `open-run` + `run`; re-plan with the token's id/time and the starting actor, other bytes → 409 `stale`; `registry.writeFile(…, {parents})` to `Plans/flows/runs/<package>/<UTC>-<runId8>.md`. Token 10 min (`TOKEN_TTL_MS`). Schedule: `run-` + sha256(`<id>:<slot>`)[0:16]; a repeat returns its run
- First evidence label (commit range) supplied by mdhouse, the rest `missing` → a new run is `held`; page-asserted evidence cites source `run-document`
- Run document: host sections from the replayed state + ```` ```json mdhouse-flow-meta ```` (rootId, runPath, trigger, marker, commits, dirty, seal); `## Findings`…`## Checks` are the analyst's, kept on every rewrite (gone → 400). `last-commit-id`: first line of its own outside fenced code
- `/api/doc` → `flow` (`docFlow`) for a valid run under `Plans/flows/runs/`; `canAct` = writable, open and `verifyRun` passes (else `refused`; `opts.noGit` → `git is off`)
- Seal: `seal {key, mac}` = key id (sha256 of the key)[0:16] + HMAC-SHA256 over `stable([root path, runId, package id, packageDigest, base, target, commit-range digest, destination, runPath])`; key `<config dir>/flow-seal.key` (`sealKeyAt`: 32 bytes, created 0600 on first use, written aside + `link`; never in a project, never logged)
- `verifyRun` — the run's input must be the host's own: seal present and its MAC equal (other key id → 409 `foreign`, read-only here — another machine or a lost key), meta `commits` = the range digest, under `runs/<package>/`, the installed runnable package (manifest + digest equal), the package's selection defaults, base → target → HEAD ancestry (cached per repo/base/target/HEAD, 256); else 409 `tampered`
- `POST /api/flow/event {root, path, expectedVersion, clientId, action}` — doc-write order (sameOrigin · `opts.noGit` → 404 `no-git` · body · run path → 404 · RO → 403 · `queueWrite` · re-read: version/ended → 409 `stale`, complete while held → 409 `held`, moved/copied → 400). Event id = `ev-` + sha256(clientId)[0:16]: the same action again → current state. Complete → the destination's `last-commit-id` + `Last run:` → target (`advanceDestination`) first, then the run document; a failed destination write → 500 `partial`, the run unchanged
- `GET /api/automation?root=` (admin) → `{root, canApprove, registrations:[{id, file, flow, range, when, maxLateMs, maxLate, overlap, notify?, hash, approval: none|approved|changed|no-timer (its bus schedule gone or with an older body)|unknown (bus down), approvedHash?, approved?, schedule, disabled, failures, startedToday, lastStartAt?, runs (5, newest first)}], errors, busError?}`; errors `{error, reason}`: `invalid` 400, `no-root` / `not-found` 404, `stale` 409; `canApprove` + `canApproveWhy`: `viewer` · `exposed` · `bus-off` · `no-git` · `read-only` (first that applies; none → true). `POST /api/automation/approve {root, registration, hash}` → `{registration, approval:'approved', hash, approved, schedule}`; git off → 409 `no-git`; not writable → 409 `read-only`; hash ≠ file → 409 `stale`; bus off → 409; bus schedule refused → 409; KV unreachable → 503 (a schedule made is deleted); a previous schedule deleted. `POST /api/automation/revoke {root, registration}` → `{registration, approval:'none', revoked}`; none → 404; deletes the schedule (`scheduleError?`)
- `GET /api/flow/catalog?root=` → `{packages:[{id, family, title, ranges, defaults, lastRun, openRun}]}`; `POST /api/flow/preview {rootId, packageId, range}` — bare `read()`, POST + sameOrigin, Viewer allowed → `{token, runPath, base, target, dirty, warnings, html}` (`render()`); `POST /api/flow/start {token}` → `{status, runPath, url}`. Trigger = manual, actor = `authorOf(req)`. Errors `{error, reason}`; `opts.noGit` → 404 `no-git`

## Local browser administration

`lib/admin-session.ts` holds memory-only single-use proofs and expiring revocable sessions.
`mdhouse admin` requests a proof through private OS-owner control and prints a loopback fragment URL
only to an interactive terminal; redirected output refuses before minting. No auto-open or saved secret.
`--list` lists safe session metadata; `--revoke` ends all sessions and unused proofs. Restart ends them too.
Control `/admin/mint|list|revoke` requires an owner-only real config directory and socket; existing CLI
operations retain OS-owner authority. Remote/bootstrap-through-proxy and Team identity remain separate.

`ui/admin-entry.ts` removes valid or malformed admin fragments synchronously, exchanges once before
application startup and keeps the proof out of storage. POST `/api/admin/session` checks trusted Host,
admission, actual loopback peer and exact local Host/Origin, then sets a host-only HttpOnly SameSite=Strict
port-named cookie. GET `/api/admin` returns safe state; POST `/api/admin/logout` revokes and clears it.
Admin responses are no-store/no-referrer. Personal (no Basic users), CLI-started: a loopback peer is admin
(`Actor.via: 'local'`, GET `/api/admin` → `{admin, local}`), proxied requests included. Otherwise Basic login,
trusted addresses, author cookies and project RW never confer admin. Local HTTP is the only exchange transport in this slice; no inferred proxy HTTPS.
Port-specific cookie names prevent accidental overwrites, not a browser origin boundary.

## Mutation classification

`lib/authz.ts`: every route in `serve()` is `read(handler)` (bare, answers every method), `bundle(index)`
or a method map whose writes are `mutation(family, handler)`; `guard()` runs `inventory()` and `serve()`
refuses to start on an untagged bare handler or object, a malformed method map, an unclassified write,
a family on a read or bare handler, conflicting tags, a duplicate mutation or an unknown family.
GET/HEAD/OPTIONS and `read()` are declared non-mutating, not effect-free: `GET /api/git/remote?fresh`
fetches from the network. `serve()` returns `routes`; `test/authz.test.ts` pins the full list.
`ADMIN_FAMILIES` gates `instance-config` and `root-admin` writes after Host/admission, with same-origin
and a verified browser-admin session before body handling. Missing/expired/revoked authority is
`401 {error, reason: 'admin'}`. `Actor` comes from a local Personal request or the verified session; immutable `user` remains unset.
Other families retain existing behavior; marks admin policy is decided, not enforced; no Team/grant system is activated.

| Family | Routes (POST) |
|---|---|
| `doc-write` | `/api/source`, `/api/task`, `/api/qa`, `/api/insert` |
| `git-write` | `/api/git/commit`, `/commit-file`, `/commit-files`, `/reset` |
| `git-sync` | `/api/git/pull`, `/push` |
| `instance-config` | `/api/settings`, `/api/ab/default`, `/api/ab/filter` |
| `admin-session` | `/api/admin/session`, `/api/admin/logout` |
| `attribution` | `/api/author` |
| `external-send` | `/api/ab/send` |
| `root-admin` | `/api/roots/ab`, `/api/roots/add`, `/api/roots/remove`, `/api/roots/name`, `/api/roots/save`, `/api/roots/mode` |
| `shared-prefs` | `/api/marks` — admin-only decided, not enforced ([№Q-R3-ADMIN1](R3/workspaces/DECISIONS.md#Q-R3-ADMIN1)) |
| `flow` | `/api/flow/start`, `/api/flow/event` |
| `automation` | `/api/automation/approve`, `/revoke` — admin-only; a Viewer or an exposed instance refuses first |
| `control` | no HTTP route |

Viewer (`prefs.mode() === 'viewer'`, `lib/authz.ts` `VIEWER_REFUSED`): `doc-write`, `git-write`, `git-sync`,
`external-send`, `shared-prefs`, `attribution`, `flow` → 403 `{reason: 'viewer'}` in `guard()` before the
handler; `Root.writable` caps again at the write. `instance-config`, `root-admin`, `admin-session` stay admin-only,
and a Viewer has no ADMIN-W1 local administrator (`isLocalAdmin`): only a minted `mdhouse admin` session. A blocked
prefs file is a Viewer (`reason: 'blocked'`); `POST /api/settings` writes settings + `mode` in one mutate, blocked → 409.

Exposure ([№Q-R3-EXPOSE1](R3/workspaces/DECISIONS.md#Q-R3-EXPOSE1)): `lib/access.ts` `exposureOk(bound, access)` — loopback bind, users, or an `allow` list with no `/0` entry; `hostNames` never count (Host header only). Otherwise `registry.exposed()` caps `Root.writable` (live: `prefs.refresh()`, stat-based), so `writeFile` refuses too, and `viewerGate` refuses every `VIEWER_REFUSED` family → 403 `{reason: 'exposed'}` (`exposedWhy`); the CLI start line is `exposedNote`.

Viewer UI (`ui/viewer-text.ts` pure strings/helpers, `ui/viewer.tsx` context + badge): `options.mode === 'viewer'` from
`GET /api/settings`, re-read in every tab on a `roots` event and on any refused write (`reason: viewer` →
`VIEWER_DENIED`, one message from `refusedText()` in `api.ts`). A Viewer *removes* (does not disable) what changes
something: tree/document marks, the Agent Bus button/panel/`a` key, `editHref` (✎ and per-block edit links), Settings
"Your name" (shown as text), the per-project `[RW]/[RO]` row, Auto-RW and the Add-project RW box; per-project RO badges
give way to a `Viewer — read-only` badge (own line under the sidebar header, inline in the top strip). Everything that
keys on `root.writable` (ticks, Q&A, insert, editor, git actions) is already off. Settings → Mode: two buttons,
administrator only, `confirm()` before a switch (to Viewer: "You will need mdhouse admin to switch back."); a Viewer
without a session shows "Viewer — sign in with `mdhouse admin` to switch back". RAG search stays.

## User session history (pure model)

`lib/user-session-model.ts` — pure transitions, caller-supplied `now`, no storage, routes or
callers yet. Users are `github:<numeric ID>`; status `enabled | disabled | removed` (final,
history kept). Sessions: no cap, purge or absolute TTL; an id is never reused.

- `touch()` order: user enabled → session is this user's → not revoked → idle ≤ 30 days
  (else revoked `reauth`) → a resolved address in the session's login country (else revoked
  `country-change`) → the caller's route decision. A refusal touches nothing.
- Then `lastUsedAt`, the exact canonical address (MRU 10), the UA (latest, plain text ≤ 512),
  and on `match` cities (city+state+country), states (state+country) and countries — each MRU 10
  with `lastSeen`. `country`: `match | unbound | pending | unavailable`; `unbound` (login had no
  country) is undecided policy — neither trusted nor refused.
- `applyGeo()` lands only on the same pending address of a live, non-idle session of an enabled
  user; a candidate country is never recorded; it never reorders addresses or changes UA/`lastUsedAt`.
- `historyView()` — self or a caller-declared admin; the admin bit and session validity are the
  caller's declarations, not authorization.

`lib/geoip.ts` `GeoLookup` — injected `fetch` only; public unicast addresses only; ipwho.is, then
freeipapi.com only on any primary failure (timeout, network, non-200, 429 back-off, oversize,
non-JSON, `success:false`, wrong echoed IP, bad country). Fixed HTTPS hosts, `redirect: 'error'`,
no credentials. Geo: city, state, country, ISP, org, ASN + label — null when the provider omits it.

## Standalone RAG sync bin

`bin/mdhouse-rag-sync` calls `src/rag-sync-cli.ts` independently of the app/service entrypoint.
Help/import have no work; `plan` requires explicit root/FileScan/RAG/namespace/table and inventories
local metadata through a read-only Registry. Recursive `*.md` is case-sensitive; dot entries,
node_modules/bower_components/jspm_packages are excluded, symlinks/special files are not followed.
Incomplete listing is visible with nonzero exit; >32 KiB files are annotated, not silently dropped.
`sync --until-done` repeats until confirmed: FileScan's failed/unknown files are the fail queue; back-off
5 s after progress (more confirmed than any round before), doubling to 15 min without; each round re-lists,
re-plans and re-reads the owner config; a refusal, incomplete listing or changed root stops it; 3 rounds in
a row at the cap with no progress stop it with the last result and exit code.
`lib/rag-sync-plan.ts` strictly validates bounded metadata/root device+inode/target/selection and
produces a deterministic full-metadata digest, not content hash, auth or atomic-folder proof.
`lib/rag-sync-runtime.ts` validates finite sync preflights/results and scoped search citations through
an injected transport. Sync requires explicit apply, matching owner configuration, demand mode,
no subscribers and RAG 0.4.2 or later capabilities/collection health; provider replies may add fields. Every sync resends
files sent before with no confirmation; semantic/hybrid search requires explicit paid intent.
`search` fills a record's missing `lines`/`heading_path` (`lib/rag-cite.ts`) from the root-jailed local file at `content_hash`: hash mismatch → `stale: true`, no citation; excerpt not found or file unreadable → the record as returned.
`sync` registers its source and records its runs in the agent's own JSON KV (`lib/rag-registry.ts`, [№MW.2a.3](R3/workspaces/TODO.md#MW.2a.3)):
`rag/source/<ns>/<table>` (add; another folder/FileScan/RAG → exit 1, nothing sent), `rag/last/<ns>/<table>` (set),
`rag/hist/<ns>/<table>/<time>-<hex>` (add, newest 200); one agent-log line per run (notice/warning/alert). KV and log are best
effort — a failure is one stderr line and never changes result, output or exit code; an unreachable KV on the registry read proceeds.
`lib/rag-sync-bus.ts` (on `ai-agent-bus-sdk`) uses only the protected local account socket: verifies the account and existing
owned mdhouse agent, holds its token in memory and consumes only each request's random topic/tag.
No registration, subscription, watch or background process is created. App reconnect cleanup also
consumes only the mdhouse topic; older running app versions need an operator-authorized reload.
Help/import/plan remain credential/network-free. Connected mock acceptance does not prove live
provider readiness, source-mask deployment or real indexing/search; those remain separate gates.

### RAG search page

`/rag?q=…&root=<id>` (page route; `rag` is a reserved first segment, so no project takes it) is opened by the colored
`R` link in the sidebar header and the top strip (a real `<a href>`, `PageHead` click rule). Read-only; it never syncs,
registers or writes KV/log (the bin runs only on explicit demand).

- `GET /api/rag?root=` — Agent Bus off → `{enabled:false}`; unknown/reference root 404; else `{enabled, path, guide?, source, last}`:
  the source registered for this root's real path (`rag/source/*` in the `#mdhouse@<host>` KV on the **instance** bus, through
  the live `AgentBus` connection — no second identity, never `AGENT_BUS_*`) and `rag/last/<sid>`, every `rag/source/*` read 16 at a time
  until the match; 15 s per-root cache of successes, one in-flight lookup per root shared by concurrent requests;
  a bus failure is `{enabled:true, error}` (200, safe words). The RAG/FileScan names never reach the page.
- `GET /api/rag/search?root=&q=&limit=` — `sameOrigin` and header `x-mdhouse: 1` (a cross-site page needs a CORS preflight for it, never granted;
  a cross-site GET costs a bus message) → 403; served in a Viewer (reading); Agent Bus off → 404; q 1–1024
  chars, limit 1–16 (default 8); no registered source → 404. **Keyword mode and the target (`source.rag`, namespace, table) are the
  server's, never the request's.** Reply through `decodeSearchReply`, then `citeRecords` (jailed local file, hash → `lines`/
  `heading_path`/`stale`); hit `url` = `registry.docUrl` + `#L<line>`; excerpt cut at 600 chars; ≤2 searches in flight (429);
  waits ≤60 s (504); invalid reply/bus failure 503 in safe words; `no-store`.
- Page (`ui/RagPage.tsx`, pure logic `ui/rag-model.ts`): status line (glyph first: ✅ ⚠️ ❌ ❓ ⛔) `index <sid> · last sync <ago> · <result> <confirmed>/<total>`;
  one input (Enter submits; the address is the query — pushState, Back works, seq-counter supersede, button off while searching);
  cards with the source link at the line, breadcrumb, `lines a–b`, `stale`, excerpt as text with query words in `<mark>` runs (never HTML);
  not enabled → step-by-step enabling for the case (Agent Bus off: `mdhouse --agent-bus`; no source: provision FileScan + RAG, the sync command with
  this project's real path, check again; guide link `_mdhouse/rag-sync.md`); bus unreachable → safe error + Check again.

## Session-history snapshot foundations

`lib/user-session-codec.ts` encodes/decodes strict version-1 `{version,revision,model}` snapshots as
canonical deterministic JSON. Unknown/newer/corrupt input is rejected whole, including duplicate JSON
keys and resource-budget violations; no reset, truncation, session cap or purge. Independent MRU
lists and all retained sessions survive roundtrip. Validation proves consistency, not authentication.

`lib/user-session-store.ts` is inert until a trusted caller supplies an explicit protected absolute
directory. It stores only the history model in `sessions.json`, not cookie secrets. Owner-only real
dir/file, no-follow handles, bounded reads, same-directory atomic replacement and byte-hash CAS
protect snapshots; each successful write increments revision. An exclusive protected lock serializes
writers, times out without stealing, and is released only for the owned inode. Unknown/corrupt state
is refused without reset; errors after rename report unknown outcome and require load before retry.
Node lacks openat: directory identity checks narrow, but do not eliminate, path replacement races.
No default config path, routes, OAuth, live GeoIP or new permission is activated by these modules.

## Browser author attribution

`lib/author.ts` normalizes browser names and the host/port-scoped `mdhouse_author_<port>` cookie.
GET/POST `/api/author` reads/sets/clears attribution without changing prefs or permission. Q&A and
my-quotes prefer the trusted session-author hook, then browser fallback; without either, legacy
prefs/git/login attribution remains. The cookie is HttpOnly, host-only, SameSite=Lax and HTTPS Secure
when the trusted request transport is HTTPS. It authenticates nobody and grants no access.

## Passive document content and generated actions

`lib/passive.ts` applies the sanitize-html allowlist after server document/image rewriting, file
highlighting and diff-line markup. `authored()` strips renderer data attributes from raw HTML tokens
and makes unfinished fragments inert; authored classes and `{#id .class}` remain supported.
`lib/passive-style.ts` is pure shared CSS allowlist data for server and client filters.
`ui/safe-html.ts` filters HTML at document/diff DOM sinks with DOMPurify and rebuilds allowed styles.
Source text, line hashes and source Copy are unchanged. Passive tables/details/formatting, Shiki,
anchors and genuine Q&A/task controls remain; scripts/handlers, frames/forms/base/meta/link/style tags,
inline SVG/MathML and unlisted URL schemes are removed. Page CSP is defense in depth.

Each top-level render returns a fresh `actToken`; generated action nodes carry matching `data-act`
and their own line/hash/state/option/reply metadata. Client write handlers accept exact generated
controls, not authored class/ancestor context; heading actions use trusted per-render WeakMap entries.
This is DOM provenance, not route authorization. Existing root/actor/stale checks remain independent.
Question/reply body clicks may open their own form; double-click selection is on marked glyph/row.
Mermaid uses locked strict app configuration and inert SVG images; labels are not selectable and
link/callback directives are inactive. Diagram source grants no privileged request or script capability.

## Scratch smoke lifecycle

`scripts/safe-smoke.ts` supplies the common CLI/import startup/cleanup for browser corpora. It refuses
busy/live ports, captures detached own groups, verifies listener ownership and expected roots, and
cleans only its captured groups/temp directories. Stop failures are non-green; no listener-derived
kill or foreign endpoint reuse. `scripts/passive-lib.ts` stages fixtures and its own probe, delegates
server/Chrome lifecycle to that helper, and propagates cleanup failures.


## Projects in Settings

Settings groups served Projects as Saved, This session and immutable Reference, with its own
selection/details pane. Selecting details does not change the app's current project/document.
Current canonical path, effective RW/RO and persistence are visible; existing removal keeps the
last-project and reference protections. `/api/roots` optionally reports writableBy `rw | auto`
only when effectively writable, describing the existing cause rather than granting authority.
Browser author settings stay browser-only; Documents and Agent Bus instance settings are labelled
all projects. No per-project overrides or new config mutation authority is implied. Display-name,
RW/save and AB override editors remain their explicit admin-gated owning tasks. IDs/paths/CLI flags,
API/storage keys and physical directory/subfolder semantics are unchanged.


## Project display names

`lib/project-name.ts` validates trimmed text up to 80 UTF-16 units, rejecting controls, bidi reordering
and malformed text. Empty resets; duplicate names are allowed. CLI `--name <text>|reset` requires one
explicit directory, refuses `--rm`, and passes optional `add.name` through private OS-owner control.
The argument is validated before config/root mutation. Existing root IDs, paths, URLs, access and marks stay unchanged.

POST `/api/roots/name` accepts exactly `{id,name}` behind the `root-admin` same-origin/session guard;
unknown root is 404, reference is 403. Payload `name` is the effective label and `customName` is optional.
Root/tree/control listings expose display labels; the tree label is overlaid during serialization.
Saved names live in additive prefs `names`; session names stay in server memory until explicit save,
which transfers the current name. Removing/forgetting saved status removes persisted name metadata;
a last kept project retains its name in memory. No implicit root saving or write upgrade.

Settings edits/resets names for administrators; name denial preserves the draft. Root events refresh
labels across existing chooser, headings, Settings and tab titles without rebuilding document content.
Duplicate chooser labels use path context, falling back to the full canonical path when needed.
Agent Bus control inventory remains unimplemented work under [№MW.7](R3/workspaces/TODO.md#MW.7).


## Explicitly saving an existing project

Settings `[unsaved]` confirms the canonical folder, current name and access before POST `/api/roots/save`.
The body accepts exactly `{id,rev}`; current mode/name come from the server. Existing `root-admin`
same-origin and administrator checks apply, including a fresh session check after waiting for the prefs lock.
Reference roots refuse; missing/revoked admin is 401, malformed/extra fields 400, unknown root 404,
changed/already-saved confirmation 409 `reason: stale`. A retry needs a fresh confirmation.

`/api/roots` exposes read-only `configuredWritable` and an unsaved project's full SHA-256 `saveRev`.
The revision binds canonical identity, configured/effective access, auto source/reference cap, saved state
and session name. It grants nothing. Root metadata mutations serialize; fresh locked prefs are checked
before one transaction saves folder membership, configured write choice and canonical name.
Only after success is the in-memory session name discarded and roots metadata published.

Saving preserves the current tri-state mode, not auto-derived effective RW. Auto-only RW remains conditional on the same
policy and becomes RO when that policy no longer applies. No root ID, path, URL, content, mark/view or
access toggle changes; no new-root RW defaults or Viewer/profile activation. Existing CLI flag behavior
is unchanged. Saved projects have plain descriptive text instead of an unsaved/saved badge.

Prefs mutators write a detached candidate atomically before installing it in process memory; failed
pre-rename writes leave readers unchanged. Broken-file recovery retains its existing archive behavior,
using a copied fallback so failures cannot mutate the previous in-memory object. Temporary failed writes
are cleaned up. Unknown/newer-version protection and the owner-only file format remain unchanged.


## Scoped project RW/RO and prefs version 2

`Registry` stores `inherit | rw | ro`; effective writes require explicit RW or inherited auto-RW,
with immutable reference/path protection and a blocked-format cap. Explicit RO always defeats auto.
Saved choices persist; session choices stay in memory until saved or removed. Name lifetime B is unchanged.
`--rw` is an explicit OS-owner grant; bare reopening and `-p` without `--rw` retain an existing explicit RO.
No control resets mode to inherit in this slice, and no global default/profile/Viewer/Team mode is activated.

Version 1 is read without rewriting or expanding access. The first successful prefs mutation atomically
writes version 2: existing auto rules move unchanged to `autoRwRules`, legacy `autoRw` becomes empty,
and saved explicit RO uses `readonly[]`; `writable[]` remains saved explicit RW. Migration is idempotent.
A restarted old reader loses automatic write access and cannot write the newer config; existing deliberate
RW remains. One process per machine is supported; normal reload applies new code. Manually started multiple
instances are the user's responsibility, not a scanner/restart feature or a development gate.

Unsupported versions, missing/malformed required v2 lists, nonempty legacy auto rules or conflicting RO/RW
entries block prefs and root writes without resetting/rewriting the file. Unknown extension keys survive.
Git queued commit/commit-file/reset/pull/push recheck current root/path access before executing; Registry
rechecks document access at final write. Already running Git commands are not cancelled.

POST `/api/roots/mode` accepts exactly `{id,mode:'rw'|'ro',rev}` behind same-origin/verified admin checks.
Root payload `mode` plus full SHA-256 `accessRev` bind identity, mode, fresh stored/auto/reference/effective
state and saved status; names are independent. The revision grants nothing. A mode change invalidates
saveRev, and saving invalidates accessRev. Saved writes use the locked policy/admin guard and atomic
persistence before installing live mode; session changes write no prefs. Errors leave mode unchanged.

Settings confirms effective RW→explicit RO or RO→explicit RW, shows the source and lifetime, disables
immutable/capped or unauthorized changes, and refreshes stale revisions without retry. Open Doc/Git controls
follow current root access, retain drafts and preserve unchanged body/token/Mermaid; control disabled attrs
may change. Document-reference paths never gain write controls through a wider writable root.


## Settings Add existing project

POST `/api/roots/add` accepts exactly `{path,mode:'rw'|'ro'}` behind same-origin and verified
administrator checks for every path. The absolute path must resolve to an existing directory;
relative paths and tilde expansion are refused. Web add refuses reference roots and descendants.
The canonical directory preparation/registration is shared with CLI/control. Web add never changes
an already served canonical root: 409 `reason: served` includes its id, with its current mode intact.
A blocked prefs file (newer or malformed) is 409 `reason: blocked` with the reason text; an unreadable one is 500.
A successful add returns `{roots,id}`, publishes roots metadata and serves the directory for this
session only with its explicit mode already installed. No directory or project file is created.
Settings requires an explicit mode selection, preserves refused drafts and selects the added project.
The existing `[unsaved]` confirmation persists current mode and name; no add-and-save/default activation.

Preparation resolves and validates without registering. Async filesystem/git work and fresh locked
read-only prefs/admin checks precede synchronous Registry/watcher installation. Revocation, changed
canonical target, externally saved policy, invalid/newer prefs and IO failures expose no partial grant
or config write. Fresh-policy validation never migrates or repairs prefs. Existing CLI persistence,
name and reference-descendant behavior stays unchanged.


## Per-project Agent Bus configuration and routing

Canonical project paths key `agentBusSpaces` in server prefs. Saved overrides persist; unsaved
endpoint/default overrides stay in memory until an explicit save atomically carries them with mode/name.
Endpoint override precedes instance endpoint; target defaults resolve independently. Empty endpoint/default
removes that field, all empty removes the entry. Malformed project config is unavailable, never fallback.
Server-provisioned credentials stay server-only: no web token field, returned secret, localStorage or argv.
A project endpoint never inherits the instance credential; endpoint change/clear discards its old credential.

GET `/api/ab/config` supplies no-connect metadata for Settings: instance endpoint/default/filter and
project endpoint/default/revision plus boolean `hasCredential`. It does not register/mint/list/send.
POST `/api/roots/ab` accepts exactly `{id,endpoint,default,rev}` behind admin/same-origin/reference guards.
Fresh locked policy/revision/admin checks and atomic prefs installation preserve state on stale/IO failure;
refused browser drafts stay typed. Project config identity participates in explicit save revision without secrets.
Endpoints are bounded absolute sockets or HTTP(S), without userinfo/query/fragment/control characters.
Public errors are fixed safe messages; raw provider bodies and credentials never reach HTTP/WS/log errors.

A project's own `Agent Bus` row opens the endpoint/default-agent editor; default agent: one, picked from the running agents.
Reference controls are disabled. Off integration shows the CLI hint, with no web enable switch.
Settings reads configuration without connecting; connection/agent listing needs an explicit user action.
GET `/api/ab?root=<id>` reports the selected project's effective endpoint/source and agent list;
root omitted keeps instance behavior. `/api/ab/send` routes by the jailed document's root.
Connections are pooled by endpoint/credential, while jobs/events remain globally addressable after overrides
change. Shared/rotated connections never take another's reply; saving metadata does not connect or send.

Panel targets resolve whole levels: explicit per-document choice → document AB names → project defaults →
instance defaults. A higher-priority unavailable target stays visible and refuses sending; it is never
silently removed/replaced. Explicit picks survive reopening/default changes in existing guarded per-doc storage.
Endpoint precedence is independent of these target priorities. No AB control/lifecycle/install/RAG activation.


## Full Markdown source editor

CodeMirror 6 supplies the editor engine; the app integrates a source editor, not a Markdown serializer.
Minimal state/view/commands/language/Markdown/highlight modules are exact-pinned, MIT dependencies.
The current Bun HTML bundler inlines the dynamic import: measured served scripts add 336,984 bytes raw /
111,221 bytes gzip over the pre-editor baseline; a separate network-lazy bundle is not claimed. Markdown is edited
as literal text; authored HTML stays text in the editor and uses the existing passive renderer after save.
Current upstream is [CodeMirror Forgejo](https://code.haverbeke.berlin/codemirror); the GitHub archives are
[the maintainer's migration](https://discuss.codemirror.net/t/codemirrors-migration-to-forgejo/9706).

GET `/api/source?p=<root>/<rel>` reads one jailed Markdown file snapshot with `{text,hash,writable,reference?}`,
no-store. `hash` is raw-byte SHA-256, distinct from `/api/doc`'s legacy-converted contentHash. Fatal UTF-8 decoding
retains BOM; invalid encoding is 422 and the existing 5,000,000-byte source cap is 413. Nothing converts legacy
syntax or reformats source. POST `/api/source` accepts exactly `{p,hash,text}`, doc-write family, same-origin,
existing admission/jail/reference/RW checks, serialized file queue and fresh raw hash comparison. Stale is 409;
Registry.writeFile writes verbatim atomically with final live access/path checks and mode preservation.
IO failure keeps the old file. No renderer actToken is needed for app-chrome Save; authored content grants nothing.

In-app Edit is available on current writable Markdown outside references. Save/Ctrl+S uses the raw snapshot hash;
Close keeps the draft, explicit Discard asks first. Draft/base are kept per document in memory and guarded
localStorage; navigation/reload and stale/IO/RO failures retain text. Live access loss disables save. Dirty edits
are never overwritten by watcher refresh; the page shows an external-change note. LF/CRLF/BOM/final-newline and
legacy forms retain source fidelity; unsupported input is explicit. Existing document diff/history/commit and
watcher/WebSocket refresh are reused. No new authority, Git operation, editor engine or merge algorithm.


## Access status emphasis

Decorative project badges on the sidebar header, replacement top strip and Settings chooser omit normal RW and highlight effective RO.
Settings access controls remain visible: RW is muted, RO emphasized; reference status stays neutral.
Normal saved persistence is muted, while unsaved state and explicit Agent Bus overrides remain distinguishable.
Presentation uses existing live metadata and changes no configured/effective access, default or mutation guard.
There is no authoritative global Viewer mode yet; Viewer-specific configured-RW indication remains pending
[№MW.12.2](R3/workspaces/TODO.md#MW.12.2), without a synthetic mode or permission activation.


## Shared first-header band

CSS `--head-band` uses the sidebar's existing 41px header band for the replacement topstrip and each main
page's first header row. Document breadcrumbs, root/folder/Home/Git and Settings headers, notice headings and
loading align inside that band; titles after breadcrumbs retain their separate hierarchy and row gap.
Page wrappers have no independent top padding, including narrow layouts. Side/bottom/max-width geometry is
unchanged; wrapped heads may grow naturally. Spinner keeps its own 15px circle; the notice gear aligns too.
This is page-header layout only, with no permission/source/control/navigation policy change.

# Findings — CLAUDE.md review (3 Fable reviewers, 2026-10-07)

## Workflow & verification

### CLAUDE.md

- ✅ 🔴 `CLAUDE.md:85` `bun run dev` = `bun --hot run src/cli.ts . --fg` (`package.json:46`): port 7777 + real `~/.config/mdhouse`; on `EADDRINUSE` the `--fg` path (`src/cli.ts:536`) calls `handOver()` → **adds this clone as a session root to the live instance**, starts nothing. Replace with: `XDG_CONFIG_HOME=$S/cfg bun --hot run src/cli.ts $S/repo --rw --port 7790 --fg` + note "never bare `bun run dev` while :7777 runs".
  > 💬 `6da9649` — `bun run dev` dropped from Commands, with a warning line; scratch runs `bun --hot` on :7790. The script itself: ❓ below (`package.json:46`).
- ✅ 🟠 `CLAUDE.md:93` `$S` vs `CLAUDE.md:142` `$SCRATCH` — two names, neither defined; empty `$S` → `XDG_CONFIG_HOME=/cfg ./bin/mdhouse /repo`. Define once under the Testing heading.
  > 💬 `6da9649` — `S` defined once (the scratchpad); Deploy uses `$S` too.
- ✅ 🟠 `CLAUDE.md:88-98` scratch instance: no "restart after every `src/` edit" — bundle is built once at start (`src/server.ts:219` `development: false`); live section (`:103`) says it, scratch doesn't → screenshots of stale code. Add: `- edited src/ → restart it, or run via bun --hot (above)`.
  > 💬 `6da9649` — `./bin/mdhouse` → restart after every `src/` edit; or `bun --hot`.
- ✅ 🟠 `CLAUDE.md:96` "Headless Chrome for clicks and screenshots" — no recipe anywhere in the repo; puppeteer not installed (`~/.cache/puppeteer` is stale). Add: `google-chrome --headless=new --disable-gpu --window-size=1280,900 --virtual-time-budget=3000 --screenshot=$S/a.png http://localhost:7790/d/` and `… --dump-dom URL` (SPA: empty shell without the time budget); clicks via `--remote-debugging-port` + a `bun -` CDP script, or puppeteer-core installed in `$S`, never in the repo.
  > 💬 `6da9649` — recipe added; checked: `--dump-dom` finds `doc-title` with the budget (1), not without (0).
- ✅ 🟠 `CLAUDE.md:90` "Scratch repo" — never made. Add: `mkdir -p $S/repo && cp doc/*.md $S/repo && git -C $S/repo init -q && git -C $S/repo add -A && git -C $S/repo commit -qm init` (`doc/qa-playground.md` has every Q&A form; git page/diffs/badges need ≥1 commit).
  > 💬 `6da9649` — scratch repo one-liner added.
- ✅ ⚪ `CLAUDE.md:17` "a look in the browser" → add `light + dark, ≤720px` (`src/styles/app.css:70,795` breakpoints; DONE.md:174 calls it the habit).
  > 💬 `6da9649` — "light + dark, and ≤720px" in Testing.
- ✅ ⚪ `CLAUDE.md:80` Commands — where tests go: `lib → test/<module>.test.ts; routes → serve() on a fixed 6179x port like test/server-guards.test.ts; src/ui has no unit tests — the browser check is the test`.
  > 💬 `6da9649` — where tests go, under Commands.
- ✅ ⚪ `CLAUDE.md:83` `bun test` → `XDG_CONFIG_HOME=$S/cfg bun test` (see Code 1) until the test is fixed.
  > 💬 `112b307` — fixed in the tests instead: `bunfig.toml` preload sets a temp `XDG_CONFIG_HOME`.
- ✅ ⚪ `AGENTS.md:3` points at `.claude/*` — dir does not exist.
  > 💬 `6732651` — `.claude/skills/resolve-findings/` exists now.

### Code

- ✅ 🟠 `test/control.test.ts:8` `controlPath(PORT)` and every `serve()` test (`test/server-guards.test.ts:60,98,156,208,251,311,386`) → `src/server.ts:904` `serveControl()` → `src/lib/control.ts:80,174` create `control-6179x.sock` in the **real** `~/.config/mdhouse` (CONFIG_DIR from env at import, `src/lib/prefs.ts:85`). Visible to `knownPorts()` → `mdhouse exit --all` during a run targets test sockets; a crashed run leaves stale sockets beside `control-7777.sock`. Contradicts "never on the live instance". Fix: `bunfig.toml` `[test] env` or `process.env.XDG_CONFIG_HOME` set in a preload before `control.ts` is imported.
  > 💬 `112b307` — `test/preload.ts`. Proof: without it the real dir got `control-61790/61794/61795.sock` during the run; with it, nothing.
- ✅ 🟠 `package.json:46` `"dev"` script — same hazard as above for humans: with the service up it silently feeds `.` to :7777 (`src/cli.ts:536-541`). Pin a port and config: `XDG_CONFIG_HOME=.scratch/cfg bun --hot run src/cli.ts . --fg --port 7790` (or drop the script; README.md:162 advertises it as "hot reload").
  > 💬 `bff63ce` — `:7790`, `XDG_CONFIG_HOME=.scratch/cfg` (gitignored). Ran it with :7777 up: served on :7790, live untouched.
- ⏳ ⚪ `test/server-guards.test.ts:60…386`, `test/control.test.ts:7` fixed ports/sockets — two concurrent `bun test` runs (agent + user) collide with `EADDRINUSE`/`EADDRINUSE`-shaped failures that look like regressions. `port: 0` + `server.port` where the test doesn't need a known port.
  > 💬 Deferred: moving tests to `port: 0` touches every server test; collisions need two `bun test` runs at once.
- ✅ ⚪ `src/cli.ts:536` `--fg` + port busy → `handOver()` to whatever mdhouse answers: a supervisor's `--fg` (unit `ExecStart … --fg`) started while a hand-run daemon holds 7777 exits 0 "already running — added to it", `Restart=on-failure` doesn't fire, and the service is silently not the one serving. `--fg` should refuse (`exit 1`) rather than hand over; hand-over belongs to the launcher path only.
  > 💬 `2ec89f3` — see `src/cli.ts:536-541` below.


## Deploy & service

### CLAUDE.md

- ✅ 🔴 Reload: the socket poll ends silently after 5 s and `./bin/mdhouse $a` runs anyway — if the new code fails at start (or a SIGKILLed process left a stale socket), the client finds :7777 free and starts a **detached** copy; the unit then hands over and stays dead. Poll the HTTP port instead, and stop with the journal if it never answers:
  `for i in $(seq 50); do curl -so /dev/null localhost:7777/ && break; sleep 0.1; done`
  `curl -so /dev/null localhost:7777/ || { journalctl --user -u mdhouse.service -n 30; exit 1; }`
  > 💬 `6da9649` — polls HTTP; stops with the journal if it never answers. Ran it on :7777: up, one `--fg` copy.
- ✅ 🟠 Reload: `R=$(curl -s …)` empty on 401 (login on), no jq, or daemon down → session-only folders dropped silently. `set -e`; `curl -fsS … | jq … || exit 1`
  > 💬 `6da9649` — `set -e`, `curl -fsS … | jq`.
- ✅ 🟠 Tag releases: `git tag vX.Y.Z`, push with main; changelog range `git log vA.B.C..` — the last tag is `v0.1.2`
  > 💬 `eb60912` — tag + `git push origin main --tags` in Deploy; published releases since 0.3.0 tagged locally (checked against `npm view mdhouse versions`), pushed with the next publish.
- ✅ 🟠 Order: `npm publish` before `git push` — a failed publish (OTP, 403) then costs a local amend, not a public commit + tag
  > 💬 `eb60912` — publish, then tag + push.
- ✅ 🟠 Post-publish: install `mdhouse@X.Y.Z` from the registry into a temp prefix and run it — `npm view` only proves the manifest
  > 💬 `6da9649` — "install `mdhouse@X.Y.Z` from the registry, run it" added.
- ✅ 🟠 Rollback: `npm deprecate mdhouse@X.Y.Z "broken — use …"`, fix, bump, republish; never `npm unpublish`
  > 💬 `6da9649` — deprecate, fix, bump, publish; never unpublish.
- ✅ ⚪ Semver line ambiguous: `+0.0.1 fix · +0.1 feature · +1 breaking (URL, prefs key, CLI flag removed/renamed)`
  > 💬 `eb60912` — "+1 — breaking: URL, prefs key, CLI flag removed or renamed" added to your rule.
- ⚠️ ⚪ Auth: `npm whoami` before publish; `~/.npmrc` holds a long-lived classic token — 2FA / granular token; `--provenance` is CI-only
  > 💬 `6da9649` — `npm whoami` added. 2FA / granular token is your account: not touched.

## Code conventions & security

### CLAUDE.md

- ✅ 🟠 "Code idioms" says `AbortController` — not used anywhere in `src/`. Superseded requests use a seq counter (`src/app.tsx:169-194`) or a `live` flag cleared in effect cleanup (`src/ui/DirPage.tsx:60-69`)
  > 💬 `6da9649` — `AbortController` removed; seq counter / `live` flag named. `grep -rn AbortController src` → nothing.
- ✅ 🟠 Write-route recipe, in order: `sameOrigin` → 403 · body shape → 400 · `registry.resolve(p)` + `.md` → 404 · read-only root → 403 · `queueWrite(loc.abs)` · re-read, `lineHash` → 409 `{error, reason:'stale'}` · `registry.writeFile()`. Git writes: `gitWrite()` + `queueWrite('git:'+repo)` (`src/server.ts:100-130, 280-422`)
  > 💬 `6da9649` — *Server invariants*.
- ✅ 🟠 Error contract: `fail(status, msg)` → `{error}`; 400 · 403 · 404 · 409 stale · 413 · 415 · 421 bad Host; client 409 → reload + note, no auto-retry (`src/ui/api.ts:188-220`, `src/ui/Doc.tsx:296-305`)
  > 💬 `6da9649` — *Server invariants*.
- ✅ 🟠 Paths & shell: request value → path only via `registry.resolve`; git/rg as argv arrays, `--` before paths, `rev` must match `/^[0-9a-f]{4,40}$/` (`src/lib/git.ts`, `src/lib/gitpage.ts:34`)
  > 💬 `6da9649` — *Server invariants*.
- ✅ 🟠 Rendered HTML is trusted (`html: true`, `dangerouslySetInnerHTML`), no sanitizer — page input is written as Markdown, never injected as HTML
  > 💬 `6da9649` — *Server invariants*.
- ✅ ⚪ TS/Preact: `import type`; `noUncheckedIndexedAccess`; `class=` not `className`; hooks from `preact/hooks`
  > 💬 `6da9649` — *Code idioms*.
- ✅ ⚪ Tests: `bun:test`, sentence names; temp trees via `mkdtemp`, removed in `finally`; each server test its own port in 617xx (taken 61771, 61790–61795, 61797)
  > 💬 `6da9649` — under Commands (617xx port, `finally`).
- ✅ ⚪ `prefs.json` only via `Prefs.mutate`; `store.invalidate(rootId)` from the watcher, never per request
  > 💬 `6da9649` — `Prefs.mutate` in *Server invariants*.

### Code

- ✅ 🟠 Stale comments break "current contract only": `src/lib/render.ts:620` ("--sanitize mode is applied by the caller" — no such mode) and `src/lib/roots.ts:246` ("Nothing calls it yet" — every write route calls it)
  > 💬 `d4f8eba` — both comments say what the code does now.


## Code conventions & security — addendum

(Second pass; items above in this section stand. Baseline verified: `bun test` 207 pass, `npx tsc --noEmit -p .` clean.)

### CLAUDE.md

- ✅ 🟠 `CLAUDE.md:47` link idiom is incomplete: `<a href>` + `onClick` that returns on `e.button !== 0 || metaKey || ctrlKey || shiftKey`, then `preventDefault()` + `go()` — that is what keeps middle/ctrl-click a real tab (`src/ui/PageHead.tsx:31`, `src/ui/Doc.tsx:868-872`, `src/ui/Settings.tsx:67`, delegated: `src/ui/Doc.tsx:249`)
  > 💬 `6da9649` — the full guard, with `src/ui/PageHead.tsx`.
- ✅ 🟠 `Root.writable` is a getter (`src/lib/roots.ts:275-277`, `--rw` or auto-rw) — never cache it; a request reads prefs via `prefs.refresh()` / `currentAccess()` first (`src/lib/prefs.ts:263-284`, `src/server.ts:93,171`)
  > 💬 `6da9649` — *Server invariants*.
- ✅ ⚪ `/__app/` and its chunks sit outside `guard()` on purpose — code only, never data (`src/server.ts:183-214`); every other route is behind `trustedHost` → `admit`
  > 💬 `6da9649` — *Server invariants*.
- ✅ ⚪ `opts.noGit` short-circuits every git-touching route (`src/server.ts:117,532,657,694`); a new route that shells out to git must too
  > 💬 `6da9649` — *Server invariants*.
- ✅ ⚪ Server tests: `serve({ registry: await Registry.create([dir]), prefs: await Prefs.load(join(dir,'prefs.json')), port, hostname: '127.0.0.1', noGit: true })`, torn down `server.stop(true); watcher.close(); control?.stop()` in `finally` (`test/server-guards.test.ts:58-81`)
  > 💬 `6da9649` — pointer to `test/server-guards.test.ts` under Commands.

### Code

- ✅ ⚪ `src/server.ts:540` `/api/git/reset` queues on `loc.abs`, while commit/pull/push queue on `git:${repo}` (`:140,521`) — a reset can run inside a commit/pull; "one at a time per repo" (README) does not hold for it
  > 💬 `d4f8eba` — reset takes `git:${repo}`, then the file queue.
- ✅ ⚪ `src/lib/access.ts:115-116` unknown login returns before `Bun.password.verify` — the argon2 delay reveals which logins exist (constant-time: verify against a dummy hash)
  > 💬 `d4f8eba` — verifies against a dummy hash. Test: unknown login 0.05 ms before, ~as slow as a wrong password now.
- ✅ ⚪ `src/server.ts:631` `/api/search` `maxHits: Number(limit ?? 500)` — `limit=abc` → `NaN`, `hits.length >= NaN` never true (`src/lib/search.ts:129,197`) → no cap; recents/digest clamp theirs (`:641,652`)
  > 💬 `d4f8eba` — `limitOf()` for search / recents / digest / history. Test: `limit=abc` gave 600 hits, now 500.
- ⏳ ⚪ `src/lib/search.ts:174` no-ripgrep fallback compiles the user's regex — `(a+)+$` on a big file blocks the single thread; rg's engine is linear-time, this path is not
  > 💬 Deferred: only without `rg`; a fix needs a design (worker + timeout, or no regex in the fallback).
- ✅ ⚪ `src/server.ts:757` `/api/marks` POST `path` is never resolved or length-capped — any string lands in `prefs.json`; `:520` commit message likewise uncapped (answers/inserts cap at 100k, `:350,390`)
  > 💬 `d4f8eba` — 413 over 4096 (path) / 100k (message).

## Deploy & service — addendum

(adds to the `## Deploy & service` items above — nothing there is repeated)

### CLAUDE.md

- 🚫 ⚪ `CLAUDE.md:119` the socket wait is right in the clean path: SIGTERM runs `shutdown` (`src/cli.ts:561` → `src/server.ts:897-901`) which unlinks the socket, and HTTP (`src/server.ts:216`) binds before the socket (`:904`) — measured on a scratch instance: port at 65 ms, socket at 67 ms. Only the failure path (no daemon within 5 s, SIGKILLed one) is the 🔴 above.
  > 💬 Moot: the reload polls HTTP now.
- ✅ ⚪ `CLAUDE.md:117,120` `./bin/mdhouse $a` is unquoted word-splitting — a root path with a space breaks. `jq -r '.roots[] | select(.saved|not) | [(if .writable then "--rw" else empty end), .path] | @sh'` and `eval ./bin/mdhouse $a`
  > 💬 `6da9649` — `@sh` + `eval`. Ran it with a `--rw` root named `a b`: back with `--rw`.
- ✅ ⚪ `CLAUDE.md:139` add the baseline so a stray file shows: `npm pack --dry-run` → `62 files, 832 kB` (1.4.0)
  > 💬 `eb60912` — "~55 files, ~184 kB (1.4.x)", after the PNGs left.

### Code

- ✅ 🟠 `src/cli.ts:216-240`, `src/server.ts:907-913` `mdhouse exit` cannot tell it is stopping the unit: the ping reply has no `service` field, `/exit` → `process.exit(0)` → unit inactive, `Restart=on-failure` idle, and the next `mdhouse <dir>` starts a detached copy on :7777. Fix: ping returns `service: process.env.MDHOUSE_SERVICE === '1'`; `exit` on such a daemon prints `systemctl --user stop mdhouse.service` and exits 1 (or runs it).
  > 💬 `2ec89f3` — ping carries `service` (unit from `/proc/self/cgroup`); `exit` prints `systemctl --user stop mdhouse.service`, exit 1. Ran on a scratch `MDHOUSE_SERVICE=1` instance: refused, still up; a plain daemon still stops.
- ✅ 🟠 `src/cli.ts:536-541` `--fg` on `EADDRINUSE` hands over and exits 0 — under `MDHOUSE_SERVICE=1` that makes a detached/hand-started copy the live one for good (unit "succeeded", no retry). Service mode should `exit 1` here so systemd keeps retrying (Workflow ⚪ above is the same path).
  > 💬 `2ec89f3` — under `MDHOUSE_SERVICE=1`: "port taken — not starting; systemd will retry", exit 1. Ran it: exit 1, the first copy untouched.
- ⏳ ⚪ `src/lib/control.ts:125-131` the client unlinks a socket after a failed connect; a daemon that has just unlinked the stale file and bound a fresh one (`:178-185`) loses it — unreachable until restart. `statSync(sock).ino` before the fetch, unlink only if unchanged; or leave cleanup to `serveControl` alone.
  > 💬 Deferred: no reproduction yet.
- ✅ ⚪ `package.json:35-43` `files` ships `doc/*.png` (~680 kB of the 832 kB tarball) and `doc/qa-playground.md`; README image links are relative and npmjs resolves them to GitHub via `repository`. Add `"!doc/*.png"` (or move the PNGs out of `doc/`).
  > 💬 `bff63ce` — `!doc/*.png`: 62 files / 833 kB → 55 / 184 kB. npmjs images: check after the next publish (Deploy checklist).
- ✅ ⚪ `package.json:44-48` no `prepublishOnly` — `npm publish` can ship red tests: `"prepublishOnly": "bun test && tsc --noEmit -p ."`
  > 💬 `bff63ce` — `bun test && tsc --noEmit -p .`; `npm run prepublishOnly` green.
- ✅ ⚪ `package.json:59-63` `typescript` is not a devDep — `npx tsc` runs a transitive `node_modules/typescript` (7.0.2 today); `@types/bun: latest` — the type check drifts by day. Pin both.
  > 💬 `9fc58c2` — `typescript ^7.0.2`, `@types/bun ^1.4.2` in devDependencies.

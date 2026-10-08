# mdhouse — agent guide

Bun + Preact Markdown workspace for every `.md` under a folder. npm package `mdhouse`, repo
`github.com/parf/mdhouse`.

- Project knowledge (modules, URLs, invariants, prefs, security rules): `Plans/README.md`
- Open items `TODO.md` · choices `DECISIONS.md` · engineering record `DONE.md` (same folder)
- User-facing history: `CHANGELOG.md`

## How I want you to work

- **Plan mode for complex tasks.** Several interdependent steps, an architectural decision,
  or an approach I'd want to approve → plan mode before the first edit. Plan the
  verification too. If something goes sideways mid-task, stop and re-plan.
- **Root causes only.** No temporary fixes, no workarounds left in place. Find why, fix why.
- **Minimal impact.** Each change as small as it can be. Touch only what the task needs.
- **Prove it before calling it done.** Tests, `tsc`, and for UI a look in the browser.
  Would a staff engineer approve this diff?
- **Elegance, in balance.** On non-trivial changes ask if there's a cleaner way; if a fix
  feels hacky, redo it. Don't over-engineer small obvious fixes.
- **Verify every report first.** A bug report, failing test, review finding or plan line is
  a claim. Confirm it by execution, then fix it without asking — or refuse with the evidence.
- **Subagents liberally** for research and parallel analysis; one focused task each.
- **Capture lessons.** After any correction from me, append rule / why / trigger to
  `lessons.local.md` (gitignored). Review it at session start.
- **Task hygiene.** Multi-step work as checkable items, marked off as you go; short summary
  per step; close with what actually changed.
- **Stop marker.** Any stop or question ends the reply with a separate last line
  `🟥🟥🟥 <reason>` (blank line before). Not on progress or done-summaries.

## Conventions

- Answer in Russian (code, commits, docs in English).
- **Docs: my wording, verbatim.** No added explanations or asides; short — bullets, glyphs,
  one line where one will do. Offer improvements in one line instead of making them. Never
  bundle unrequested code/config changes into a doc edit.
- **Keep docs in the same commit:**
  - `Plans/README.md` — any route, lib module, prefs key, git call shape or security rule
  - `TODO.md` — tick / reword items as each step lands; `DECISIONS.md` when a choice changes
  - `CHANGELOG.md` `## Unreleased` — every user-visible change
- **Questions files:** when folding answers into TODO/DECISIONS, carry over every answer;
  never delete the questions file unasked.
- **My files:** don't commit, reset or delete my uncommitted edits (TODO ticks, playground
  docs) unless asked. Commit only the paths you changed (`git commit <paths>`).
- **Push / publish only when I say "publish"** (or "deploy").
- localStorage: every access in try/catch; keys `mdhouse.*`.
- UI links are real `<a href>`; `onClick` returns on `e.button !== 0 || metaKey || ctrlKey ||
  shiftKey` (a real tab), else `preventDefault()` + `go(url)` (pushState) — `src/ui/PageHead.tsx`.

## Glyphs

For findings, reviews and task status — in docs, pages and replies; not decoration:

- **Severity:** 🔴 high · 🟠 medium · ⚪ low
- **Status:** ✅ done · ⚠️ partial / follow-up · 🎫 handed off · ❌ ran and failed ·
  🚫 cancelled by decision · ⛔ cannot be done (nothing ran)
- **Open:** ❓ no answer yet · ⁉️ two sources contradict — both come off once settled
- **Green always means OK.** Green on something that needs action is a defect.
- No substitutes (no 🟡 / ◯). ❌ only for something that ran and did not pass.
- Status, severity, open — always the first symbol in the line.

## Code idioms

- `const` by default, `let` only when reassigned, never `var`.
- **Fetch:** check `res.ok` before `res.json()` (a proxy error page is HTML); a duplicate-request
  guard (flag set on entry, cleared in `finally`). A newer request supersedes an older one by a seq
  counter (`src/app.tsx`) or a `live` flag cleared in the effect's cleanup — not `AbortController`.
- TS: `import type`; `noUncheckedIndexedAccess` — `arr[0]!` or `?? ''`. Preact: `class=`, hooks
  from `preact/hooks`.
- **Comments: current contract only.** What it does now, invariants, non-obvious behavior.
  No history, investigation notes or plans — those go in `DONE.md` / `DECISIONS.md`.
  Short direct sentences that start with the behavior (`Returns…`, `Skips…`).

## Server invariants

- **Document write route, in order:** `sameOrigin` → 403 · body shape → 400 · `registry.resolve(p)`
  + `.md` → 404 · read-only root → 403 · `queueWrite(loc.abs)` · re-read, `lineHash` → 409
  `{error, reason: 'stale'}` · `registry.writeFile()` (the only write to a tree).
- **Git write:** `gitWrite()`, then `queueWrite('git:' + repo)` — one at a time per repo.
- Errors: `fail(status, msg)` → `{error}`: 400 · 403 · 404 · 409 stale · 413 too long · 421 bad Host.
- A request value becomes a path only through `registry.resolve`. git/rg run as argv arrays,
  `--` before paths; a `rev` must match `/^[0-9a-f]{4,40}$/`.
- `opts.noGit` short-circuits every route that runs git.
- `Root.writable` is a getter (`--rw` / auto-rw) — never cache it. `prefs.json` changes only via
  `Prefs.mutate`.
- Rendered HTML is trusted (`html: true`), no sanitizer: page input is written to the file as
  Markdown, never injected as HTML.
- `/__app/` (code only) sits outside `guard()`; every other route is behind `trustedHost` → `admit`.

## Shell tricks

- Feed text on stdin through a **quoted** heredoc — nothing gets escaped:
  `git commit -q -F - <<'EOF' … EOF`, `bun - <<'TS' … TS`. Unquoted `<<EOF` still expands `$`.
- My shell is fish: wrap bash-isms (`$(…)`, `<<<`, `for … do`) in `bash -c '…'`.
- Check logs proactively after a change: `journalctl --user -u mdhouse.service -n 50`
  (live), or the `--fg` output (scratch).
- Never force-push; never `git commit -a` together with paths — `git commit <paths>`.

## Commands

```sh
bun test                    # all tests — a temp config dir (test/preload.ts)
npx tsc --noEmit -p .       # types
```

- `bun run dev` — :7790, its own config in `.scratch/`; never reaches :7777
- lib → `test/<module>.test.ts`; a route → `serve()` on its own 617xx port, torn down in
  `finally` (`test/server-guards.test.ts`); `src/ui` logic (`format`, `tree-model`) → its test; components —
  the browser check is the test

## Testing in a browser — never on the live instance

`S` = the session's scratchpad dir. Scratch repo (git views need ≥1 commit; `doc/qa-playground.md`
has every Q&A form) + spare port + temp config:

```sh
mkdir -p $S/repo $S/cfg && cp doc/*.md $S/repo && git -C $S/repo init -q && git -C $S/repo add -A && git -C $S/repo commit -qm init
XDG_CONFIG_HOME=$S/cfg bun --hot run src/cli.ts $S/repo --rw --port 7792 --fg
```

- the page bundle is built at start — `bun --hot` reloads server code only: restart after a UI edit;
  `./bin/mdhouse` → restart after every `src/` edit
- stop it by pid (`ss -ltnpH 'sport = :7792'`), not `pkill -f`
- look at it in light + dark, and ≤720px
- headless Chrome — an SPA needs the time budget, without it the DOM is empty:
  `google-chrome --headless=new --disable-gpu --window-size=1280,900 --virtual-time-budget=3000 --screenshot=$S/a.png <url>`
  (`--dump-dom` the same way); clicks: `--remote-debugging-port` + a small CDP script in `$S`
- never install/uninstall `mdhouse.service` in tests — `service --port <spare>` with a temp
  `XDG_CONFIG_HOME`, then `mdhouse service uninstall --port <spare>` (the unit lands in
  `~/.config/systemd/user` whatever the config)

## Live instance (:7777) — start / stop / reload

systemd user unit `mdhouse.service` (`ExecStart=bun …/bin/mdhouse --fg`, saved folders from
`~/.config/mdhouse/prefs.json`, `Restart=on-failure`). It runs this clone's code, so a reload
is all a code change needs — no build step.

```sh
systemctl --user start   mdhouse.service
systemctl --user stop    mdhouse.service
systemctl --user status  mdhouse.service
journalctl --user -u mdhouse.service -n 50   # log
```

**Reload** (keeps session-only folders — the ones added without `-p`):

```sh
bash -c '
set -e
R=$(curl -fsS localhost:7777/api/roots | jq -r ".roots[] | select(.saved|not) | [(if .writable then \"--rw\" else empty end), .path] | @sh")
systemctl --user restart mdhouse.service
for i in $(seq 50); do curl -so /dev/null localhost:7777/ && break; sleep 0.1; done
curl -so /dev/null localhost:7777/ || { journalctl --user -u mdhouse.service -n 30; exit 1; }
while read -r a; do [ -n "$a" ] && eval ./bin/mdhouse $a; done <<< "$R"
pgrep -af "^/usr/bin/bun .*bin/mdhouse"'
```

- waits for HTTP, not the socket file: a SIGKILLed copy leaves a stale socket; if the new code
  fails at start it stops with the journal instead of starting a detached copy

- `pgrep` shows one `--fg` process, no `logger` pipe
- then tell me to reload the page (new bundle)
- `mdhouse exit` refuses the unit and names `systemctl --user stop mdhouse.service`; the unit's
  `--fg` exits 1 when the port is taken, so systemd retries — never start a copy by hand on :7777

## Deploy (release to npm)

Only on "publish".

- [ ] Clean tree except my own files; on `main`
- [ ] `bun test` green, `npx tsc --noEmit -p .` clean
- [ ] Bump semver version in `package.json`, from the one on npm (`npm view mdhouse version`):
      +0.0.1 — minor feature, +0.1 otherwise, +1 — breaking: URL, prefs key, CLI flag removed or
      renamed; then changelog
- [ ] `CHANGELOG.md`: `## Unreleased` → `## X.Y.Z — YYYY-MM-DD`; covers every commit since the
      last release (`git log $(git describe --tags --abbrev=0)..`); drop no-change entries; a
      `## X.Y.Z` with no tag (never published) folds into it
- [ ] `Plans/README.md`, `TODO.md`, `DONE.md` current
- [ ] Release commit `mdhouse X.Y.Z` (package.json + CHANGELOG), body = what changed
- [ ] Pack, smoke-test and publish from a clean checkout of it — `npm pack` / `npm publish` take the
      working tree, uncommitted edits included: `git worktree add $S/rel-src HEAD && cd $S/rel-src && bun install`
- [ ] `npm pack --dry-run` lists `CHANGELOG.md`, `tsconfig.json`, `bin`, `src`, `doc`, no PNGs —
      ~55 files, ~184 kB (1.4.x); much more means a stray file
- [ ] **Packed-install smoke test** (every 0.x shipped `500 Build Failed` without `tsconfig.json`):
      ```sh
      T=$S/rel; mkdir -p $T/prefix $T/cfg $T/notes
      npm pack --pack-destination $T
      printf '# Notes\n\n**Q:** works?\n**A:** yes\n' > $T/notes/a.md
      npm install -g --prefix $T/prefix $T/mdhouse-X.Y.Z.tgz
      XDG_CONFIG_HOME=$T/cfg $T/prefix/bin/mdhouse $T/notes --port 7791 --fg
      ```
      load `/` and a doc in headless Chrome — renders, no 500; stop it by pid
- [ ] `npm whoami` → the right account
- [ ] `npm publish` (`prepublishOnly` runs the tests and tsc again) — before the push, so a failed
      publish costs a local amend, not a public commit
- [ ] `git tag vX.Y.Z && git push origin main --tags`
- [ ] Install `mdhouse@X.Y.Z` from the registry into a temp prefix, run it as in the smoke test —
      `npm view` proves only the manifest
- [ ] npmjs.com/package/mdhouse shows the README images (they come from GitHub)
- [ ] Broken release: `npm deprecate mdhouse@X.Y.Z "broken — use …"`, fix, bump, publish; never
      `npm unpublish`
- [ ] `git worktree remove $S/rel-src`
- [ ] Restart the live instance (above)

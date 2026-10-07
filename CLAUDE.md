# mdhouse — agent guide

Bun + Preact web viewer for every `.md` under a folder. npm package `mdhouse`, repo
`github.com/parf/mdhouse`.

- Project knowledge (modules, URLs, invariants, prefs, security rules): `Plans/PRF-55-md-viewer-web/README.md`
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
  - `Plans/…/README.md` — any route, lib module, prefs key, git call shape or security rule
  - `TODO.md` — tick / reword items as each step lands; `DECISIONS.md` when a choice changes
  - `CHANGELOG.md` `## Unreleased` — every user-visible change
- **Questions files:** when folding answers into TODO/DECISIONS, carry over every answer;
  never delete the questions file unasked.
- **My files:** don't commit, reset or delete my uncommitted edits (TODO ticks, playground
  docs) unless asked. Commit only the paths you changed (`git commit <paths>`).
- **Push / publish only when I say "publish"** (or "deploy").
- localStorage: every access in try/catch; keys `mdhouse.*`.
- UI links are real `<a href>`; plain clicks go through `go(url)` (pushState), middle click
  opens a tab.

## Glyphs

For findings, reviews and task status — in docs, pages and replies; not decoration:

- **Severity:** 🔴 high · 🟠 medium · ⚪ low
- **Status:** ✅ done · ⚠️ partial / follow-up · 🎫 handed off · ❌ ran and failed ·
  🚫 cancelled by decision · ⛔ cannot be done (nothing ran)
- **Open:** ❓ no answer yet · ⁉️ two sources contradict — both come off once settled
- **Green always means OK.** Green on something that needs action is a defect.
- No substitutes (no 🟡 / ◯). ❌ only for something that ran and did not pass.

## Code idioms

- `const` by default, `let` only when reassigned, never `var`.
- **Fetch:** check `res.ok` before `res.json()` (a proxy error page is HTML); a duplicate-request
  guard (flag set on entry, cleared in `finally`); `AbortController` when a newer request
  supersedes an older one — on `AbortError` return silently.
- **Comments: current contract only.** What it does now, invariants, non-obvious behavior.
  No history, investigation notes or plans — those go in `DONE.md` / `DECISIONS.md`.
  Short direct sentences that start with the behavior (`Returns…`, `Skips…`).

## Shell tricks

- Feed text on stdin through a **quoted** heredoc — nothing gets escaped:
  `git commit -q -F - <<'EOF' … EOF`, `bun - <<'TS' … TS`. Unquoted `<<EOF` still expands `$`.
- My shell is fish: wrap bash-isms (`$(…)`, `<<<`, `for … do`) in `bash -c '…'`.
- Check logs proactively after a change: `journalctl --user -u mdhouse.service -n 50`
  (live), or the `--fg` output (scratch).
- Never force-push; never `git commit -a` together with paths — `git commit <paths>`.

## Commands

```sh
bun test                    # all tests
npx tsc --noEmit -p .       # types
bun run dev                 # hot reload, this folder, foreground
```

## Testing in a browser — never on the live instance

Scratch repo + spare port + temp config:

```sh
XDG_CONFIG_HOME=$S/cfg ./bin/mdhouse $S/repo --rw --port 7790 --fg
```

Stop it by pid (`ss -ltnpH 'sport = :7790'`), not `pkill -f`. Headless Chrome for clicks and
screenshots. Never install/uninstall `mdhouse.service` in tests — use
`service --port <spare>` with a temp `XDG_CONFIG_HOME`.

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
R=$(curl -s localhost:7777/api/roots | jq -r ".roots[] | select(.saved|not) | (if .writable then \"--rw \" else \"\" end) + .path")
systemctl --user restart mdhouse.service
for i in $(seq 50); do [ -S ~/.config/mdhouse/control-7777.sock ] && break; sleep 0.1; done
while read -r a; do [ -n "$a" ] && ./bin/mdhouse $a; done <<< "$R"
pgrep -af "^/usr/bin/bun .*bin/mdhouse"'
```

- `pgrep` shows one `--fg` process, no `logger` pipe
- then tell me to reload the page (new bundle)
- never `mdhouse exit` + `mdhouse`: `exit` stops the unit with status 0, systemd doesn't
  restart it, and a detached copy runs instead

## Deploy (release to npm)

Only on "publish".

- [ ] Clean tree except my own files; on `main`
- [ ] `bun test` green, `npx tsc --noEmit -p .` clean
- [ ] Bump semver version in `package.json` (+0.0.1 — minor feature, +0.1 otherwise); then changelog
- [ ] `CHANGELOG.md`: `## Unreleased` → `## X.Y.Z — YYYY-MM-DD`; covers every commit since the
      last release (`git log <last "mdhouse X.Y.Z" commit>..`); drop no-change entries
- [ ] `Plans/…/README.md`, `TODO.md`, `DONE.md` current
- [ ] `npm pack --dry-run` lists `CHANGELOG.md`, `tsconfig.json`, `bin`, `src`, `doc`
- [ ] **Packed-install smoke test** (every 0.x shipped `500 Build Failed` without `tsconfig.json`):
      ```sh
      T=$SCRATCH/rel; mkdir -p $T/prefix $T/cfg $T/notes
      npm pack --pack-destination $T
      printf '# Notes\n\n**Q:** works?\n**A:** yes\n' > $T/notes/a.md
      npm install -g --prefix $T/prefix $T/mdhouse-X.Y.Z.tgz
      XDG_CONFIG_HOME=$T/cfg $T/prefix/bin/mdhouse $T/notes --port 7791 --fg
      ```
      load `/` and a doc in headless Chrome — renders, no 500; stop it by pid
- [ ] Release commit `mdhouse X.Y.Z` (package.json + CHANGELOG), body = what changed
- [ ] `git push origin main && npm publish`
- [ ] `npm view mdhouse version` shows X.Y.Z
- [ ] Restart the live instance (above)

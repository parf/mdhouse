# Q&A sample — every case

Plain Markdown around the items stays as it is: headings, paragraphs, `code`, lists without glyphs.

- an ordinary list item — no glyph, nothing happens
- another one

## 1. Questions in a quote

> ❓ When the live instance already holds port 7777 and a second developer starts their own copy
> of mdhouse on the same machine, which port should the dev server pick, and should it remember
> that choice between restarts or ask every time?

> ❓ Where does the dev server keep its configuration when the live instance and the dev one run
> side by side — and what happens to the favourites and folders a developer saves while testing?
> 💬 In `.scratch/cfg` under the repo. It is gitignored, so it never meets `~/.config/mdhouse`, and
> resetting it is a plain `rm -r .scratch`. Favourites saved while testing stay there and never
> reach the live instance.

> ⁉️ The README says the service listens on 7777, but the unit file written by `service install
> --port 8080` pins 8080 — which one is the documented default, and should the README name both?

> ⁉️ `CLAUDE.md` says tests never touch the live config, while `control.test.ts` created sockets
> in `~/.config/mdhouse` on every run.
> 💬 The test was wrong: it now runs against a temp `XDG_CONFIG_HOME` set in `test/preload.ts`.
> Checked by watching the real config dir during a full run — nothing appeared.

> ❓ What should a reload keep?
> 💬 Everything a user added by hand:
> - session-only folders, with their `--rw`
> - the port and host it was started with
>
> Nothing else — prefs live on disk anyway.

## 2. Questions as list items — threads

- ❓ Do we keep the old `/d/<root>/x.md` URLs working after the single-root change, or is it fine
  to break the links people have already pasted into tickets and chat?
  > 💬 👤agent Redirect the old form to the new one for a year, then drop it — the redirect
  > costs one route and a test.
  >
  > 💬 ⚠️ 👤parf need more — which links are actually out there, and where? A year may be too
  > long or too short depending on that.
- ⏳ Rename `?git=favs` to `?git=stars` across the git view, the README and the tests, keeping the
  old spelling working as an alias so bookmarks do not break?
  > 💬 👤parf yes — keep the old one working, and mention the rename in the changelog.
- ✅ Should the summary strip count closed items at all, given that nobody filters for them?
  > 💬 👤parf yes — ✅ is where I go to check what was decided, and the total must add up.

## 3. Findings — stages

- 🔴 `src/cli.ts:536` `--fg` hands its folders over when the port is busy and exits 0, so under
  systemd the unit "succeeds", nothing retries, and a copy started by hand silently becomes the
  live one. Fix: exit 1 under `MDHOUSE_SERVICE=1`.
- ❓ 🟠 `package.json:46` the `dev` script feeds `.` to the live instance whenever :7777 is up,
  instead of starting anything.
  > 💬 👤agent pin it to :7790 with its own config, or drop the script — it is advertised in the
  > README, so dropping it needs a README change too.
- 🟠 `src/server.ts:631` `/api/search` takes `limit=abc` as `NaN`, and `hits.length >= NaN` is never
  true — the result has no cap at all.
- ❓ ⚪ `doc/qa.md:155` the glyph table lists ⏳ as "in progress" while the brainstorm uses it for
  "waiting on the agent" — same thing, or two states?
- ⚪ `src/lib/control.ts:125` the client unlinks a socket after a failed connect; a daemon that has
  just bound a fresh one loses it.
- 🔵 `README.md:12` "browsable" is fine but "browse" reads better in the first line.
- ⏳ 🟠 `test/` every server test binds a fixed port in 617xx, so two `bun test` runs at once collide
  with errors that look like regressions.
  > 💬 👤parf go with `port: 0` and read the real port back.
- ⛔ 🟠 `npm` 2FA: the token in `~/.npmrc` is a long-lived classic one; switching to a granular token
  needs the npm account, which this session cannot reach.
- ❌ 🔴 the packed-install smoke test of 1.4.1: `/` answered `500 Build Failed`.
  > 💬 👤agent `tsconfig.json` missing from `files` again — the release is stopped.
- ⚠️ 🟠 `CHANGELOG.md` split: 1.x and the betas are apart, but the link from the package points at a
  file the package does not ship.
- ⏸️ ⚪ `src/lib/search.ts:174` the no-ripgrep fallback compiles the user's regex — `(a+)+$` on a big
  file blocks the single thread.
  > 💬 👤agent needs a design (a worker with a timeout, or no regex in the fallback) — later.
- 🎫 ⚪ `bin/mdhouse` Windows paths with spaces — RLM-412.
- ✅ 🟠 `test/control.test.ts:8` the tests created control sockets in the real config dir, beside the
  live instance's own.
  > 💬 👤agent `112b307` — a temp config via `test/preload.ts`; checked by watching the real dir
  > during a full run.
- 🚫 ⚪ `CLAUDE.md:119` the reload waits for the socket file, which a SIGKILLed copy leaves behind.
  > 💬 👤agent moot — the reload polls HTTP now.

## 4. Suggestions — one of, any of

- ❓ Which port should `bun run dev` use by default, given that the live instance holds 7777 and
  the smoke test of a release uses 7791?
  - ( ) `7790`, with its own config in `.scratch/` 🌟
  - ( ) `port: 0` — whatever is free, printed at start
  - ( ) `7778`, next to the live one ⭐
- ✅ Where should the summary strip sit on a page that has both a table of contents and a git
  history panel?
  - (x) right under the title, above everything else 🌟
    > 💬 👤parf and keep it sticky while scrolling a long findings file.
  - ( ) in the table of contents, as its first line
  - ( ) at the bottom of the page
    > 💬 👤parf no — nobody scrolls to the bottom to find out what is open.
  > 💬 👤parf revisit once we have pages with more than a hundred items.
- ❓ What should ship in the npm package besides the code?
  - [x] `doc/*.md` — the docs linked from the README 🌟
  - [x] `CHANGELOG.md`
  - [ ] `doc/*.png` — 680 kB of screenshots
  - [ ] `Plans/` — the design notes
    > 💬 👤parf never — they are for us, not for users.

## 5. Requests on existing text

The parser walks the token stream twice: once to find headings for the table of contents, and
once more to turn task items into checkboxes with their line and hash.

> 👉 **rewrite:** one pass — shorter, and keep the numbers about the cost of the second walk.

Search falls back to a JavaScript regex when ripgrep is missing from the machine.

> ✅ 👉 **why:** "falls back" — is the fallback ever hit in practice, and how slow is it?
> 💬 👤agent only without rg; about 40× slower on a 10 MB tree — noted in the README.

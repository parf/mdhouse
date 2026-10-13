# Agent Bus integration — plan

## Context

From the page, tell an AI session "this doc changed — read it and reply", then see its answer, without
switching to the terminal. Agent Bus (`~/src/ai-agent-bus`) already links the sessions on this machine
(`#claude/<cwd>@parf.us`). TODO item: "Agent Bus integration — must be enabled in config".

## What the bus gives (researched)

- Daemon `agent-busd`, HTTP+JSON over a unix socket; `/run/agent-bus/user-<account>.sock` (0600) —
  the unix account is the identity, no token. Routes: `docs/09-daemon-api.md`.
- TS client `@agent-bus/client` — local only (`private`, not on npm) → mdhouse cannot depend on it
  (mdhouse ships on npm). **mdhouse gets its own small client** over Bun `fetch({ unix })`, as
  `src/mcp/bus.ts` in the bus repo does: `status`, `register`, `token`, `ls`, `send`, `consume`.
- Identity: mdhouse registers its own agent `#mdhouse@<realm>` (owner = the user, `personal`,
  `allow: ['@owner']`), mints its token (`POST /token`), talks as it. Needed: replies need a registered
  inbox. Never reads `AGENT_BUS_*` env — a mdhouse started from a Claude shell would act as that session.
- Alive = `readers > 0` (a long-poll is open); a pushed session re-polls every 55 s, so also alive when
  `last_used` < 90 s.
- Request / reply: send with a unique `tag` + `topic`; the agent acks (`receipt: 'ack'`), works, replies
  with the same topic + tag (or `done`). mdhouse waits with `consume({ tag })` — filtered, so no clash
  with any other reader. Pull only, ≤ 60 s per poll.

## Behavior

**Config — CLI only**
- `mdhouse --agent-bus` / `--agent-bus off` → prefs `agentBus: { enabled }` (like `--auto-rw`); a running
  server picks it up via `prefs.refresh()`. Optional `--agent-bus <socket>` for a non-default socket.

**Settings page (`/settings`) — an "Agent Bus" section**
- Off: one line — "Enable the Agent Bus integration: `mdhouse --agent-bus`".
- On: status (socket, mdhouse's own name, ✓ connected / the error), and **Default agent** — the live
  agents (`readers > 0`, mdhouse itself left out), checkboxes, one or more → prefs `agentBus.default`.

**Any MD page**
- An 🛰 Agent Bus button in `doc-actions` + shortcut `a` (in `?` help) → popup.
- Targets, in this order:
  1. `<!-- AB: name -->` in the doc (the AI writes it; several allowed) — alive → used; dead → a "dead"
     notice on it (shown, unchecked);
  2. else the default agent(s) from settings;
  3. else none known → the live agents as checkboxes, pick one or more (for this send; the default is
     set in Settings).
- Buttons (Alt+1…9, numbered as in `QaEditor`) + a textarea for a note:
  1. **Updated — reply** (default, Ctrl+Enter): `<abs path> updated (<url>) — read it and reply.`
  2. **Do 🎯** — act on the 🎯 items of `<path>`.
  3. **Resolve questions** — carry the answered ones over (`/resolve-questions` wording).
  4. **Review** — review `<path>` with `doc/agent-markup.md`.
  The note is appended to any of them; a note with no button → sent as is.
- After send: the popup (or a corner panel once it is closed) shows each target: sent → ✓ ack → the
  answer (Markdown, rendered) / ✓ done / ⏳ no reply in 10 min.

## Server

- `src/lib/agent-bus.ts` (new) — the client + `AgentBus` service:
  `connect()` (status → register own agent if missing → token), `live()`, `alive(name)`,
  `ask(to[], body, onEvent)` → a job id; per target: `send(tag, topic 'mdhouse')`, then `consume({tag})`
  loop until answer / done / 10 min; receipts → events. Jobs kept in memory (last 50).
- Routes (behind `guard()`; POSTs `sameOrigin` first; 404 `{error}` when the bus is off):
  - `GET /api/ab` → `{ enabled, me, connected, error?, default, live: [{name, descr}] }`
  - `POST /api/ab/default` `{ names }` → prefs
  - `POST /api/ab/send` `{ p, targets, action, note }` → `registry.resolve(p)` + `.md` → 404; → `{ job }`
  - `GET /api/ab/job?id=` → the job's events (after a WS reconnect)
- Events → WebSocket topic `ab` (`{t:'ab', job, to, kind, body?}`), subscribed in `open` as `roots`;
  the page filters by its job id.
- `DocPayload` gets `ab: string[]` — names from `<!-- AB: … -->` (extracted in the doc route from the source).

## Files

- new `src/lib/agent-bus.ts`, `src/ui/AgentBusModal.tsx`, `test/agent-bus.test.ts`
- `src/lib/prefs.ts` (`agentBus` key, setter via `mutate`), `src/cli.ts` (flag, USAGE)
- `src/server.ts` (routes, WS topic, payload), `src/ui/api.ts` (calls, `LiveMessage` `ab`)
- `src/ui/Doc.tsx` (button, `a` key), `src/ui/Settings.tsx` (section), `src/ui/AboutModal.tsx` (shortcut)
- `src/styles/app.css` (popup, status rows, light + dark)
- docs: `Plans/README.md` (module, routes, prefs key, never `AGENT_BUS_*`), `doc/prefs.json.dist`,
  `README.md` (one line), `doc/agent-markup.md` (`<!-- AB: your bus name -->`), `CHANGELOG.md`,
  `Plans/TODO.md` (the item → this plan), `DECISIONS.md` (own client, not `@agent-bus/client`; own agent name)

## Verification

- `test/agent-bus.test.ts`: a fake daemon on a temp unix socket — register on 404 / skip on exists,
  token, live filter (`readers`, `last_used`), ask: ack → answer, done, timeout; `<!-- AB -->` parsing.
- Routes on a 617xx port: off → 404, cross-origin → 403, bad body → 400, unknown doc → 404.
- `bun test`, `npx tsc --noEmit -p .`.
- Live end-to-end: scratch server :7793, temp config, `--agent-bus`, a doc with
  `<!-- AB: #claude/home-parf-src-mdhouse@parf.us -->` → popup → Ctrl+Enter → this session gets it,
  acks and replies → the page shows ✓ ack, then the answer. Dead name → the notice. Headless Chrome
  light + dark + ≤720px.

## Open

- ❓ Who may send: anyone the server admits, or only writable (`--rw`) folders? Plan: any admitted page,
  since only the CLI turns it on.

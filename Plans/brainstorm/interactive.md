# Interactive functionality & intended usage

## What is interactive now (`--rw`)

- ☑ tick a checkbox — one line written, every tab follows
- 💬 answer ❓ / ⁉️ blocks (every form) and task / status / severity items; **Check & Save** ticks too
- ✎ ↓ ⇊ under a heading — add text, quote, signed quote (git name), tip, ❓, ⁉️, 💬
- ✎ open the file at a line in the editor (`edit:` URL)
- git view — commit, pull, push; **Reset file** on a document's uncommitted changes
- History — uncommitted changes on top, a click shows the diff
- ★ favorites; Settings — folders, edit link, auto-rw
- every write: fingerprint check (409 on a stale page), read-only folders refused, live reload

## Intended usage — the loop

1. an agent writes Markdown: plan, questions, findings, TODO
2. I read it in mdhouse, answer on the page (💬, ticks, notes)
3. the agent reads the answers and acts (`/resolve-findings`), answers back in place
4. git keeps the history of the conversation

## Open questions

- ❓ Who uses it: me alone, a team, agents — whose name goes on an answer?
- ❓ How does an agent learn there is a new answer: it re-reads when asked, a file watch, a git commit, a message (agent bus)?
- ❓ How do I learn there is a new question: notification, a "waiting for you" list across folders, a badge on the tab?
- ❓ Questions with suggested options (TODO) — radio buttons / checkboxes written back as what?
- ❓ Answers auto-committed, or left for me to commit?
- ❓ Free editing of a whole block / document on the page, or only the structured actions above?
- ❓ An agent writing the same file while I answer — is the 409 + kept draft enough?
- ❓ Phone use — answering from a phone over ssh forward / LAN?
- ❓ A findings / review page type: counts by glyph, filter open only?

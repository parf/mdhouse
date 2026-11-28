# MW.0d.4 — Public project access <a id="MW.0d.4"></a>

[Workspaces TODO](TODO.md#MW.0d.4) · [№USER-W9](DECISIONS.md#USER-W9)

CTO owns implementation, review and integration into local `main`.

## Behavior

- In **Settings → Access → project → Groups**, show **Public** as a built-in row. Give it the
  choices **No Grant** and **Read-Only**, saved with the other project grants. Explain that it
  applies to visitors without GitHub sign-in. Keep it out of editable membership and user filters.
- **No Grant** is the effective default for every existing or new project. A grant is per project.
  In active Team, guests can open and read only explicitly public projects. Keep host/network
  admission, the nested-project jail, and the existing signed-in Team and Personal rules.
- Browsing, search, direct links and assets use the same guest project scope. Keep the sign-in
  action available on public pages. Guest access has no write, admin, Git, Agent Bus, RAG, flow
  or account-management authority. Any live events allowed to guests carry only guest-safe data.
- Apply changes through the existing revision and synchronous authorization refresh. Reject an
  invalid Public grant server-side. Revocation takes effect on the next request, including work
  awaiting a response or active event subscriptions as covered by the current Team contract.

## Acceptance

- [x] In the real UI, set and clear Public Read-Only for one project as an administrator. A fresh
  guest can open it while private projects remain absent and inaccessible. Verify the sign-in action
  and the no-public-project login path. Confirm normal signed-in grants still work.
- [x] Verify direct HTML, roots, tree, search, raw/assets, nested project and live-event boundaries.
  Cover default and older policy data, invalid RW, stale admin revisions, revoked guest grants,
  banned accounts, and guests denied every mutation and administrative surface.
- [x] Record an independent security review bound to the integrated code, the combined test/type
  gate and a bounded scratch browser check. Keep the live Team policy and project grants as set by
  the owner.

## Owner steering (2026-11-27)

- [x] A direct user grant overrides the group grant in both directions; No Grant inherits ([№USER-W8](DECISIONS.md#USER-W8)).
- [x] Every Groups/Users grant is a radio choice in the table; one click saves. No Grant is first and sends `access: null`; RO and RW have distinct colours. Public reads exactly **No Grant** / **Read-Only**. A stored explicit block stays until changed.
- [x] The project Access heading shows the full folder path in muted text.

## Result

- ✅ Integrated on `main` at `efceb3a`: W1 server `62c5a84`, `3bc5bb0`; W2 UI `89ce6e1`…`604c839`.
- ✅ Independent security review PASS bound to `efceb3a`; combined gate 1779/0 + tsc; W1 mutations 13 killed.
- ✅ Scratch browser 81/81 on the identical tree (Team active, fake GitHub, Agent Bus isolated): Public set/clear, guest scope and sign-in, no-public login, direct-over-group both ways, radios, 390px light/dark.
- ⚪ An older mdhouse refuses a policy with `public` and fails closed ([README](../../README.md)).
- ⚪ RO-root and Viewer caps in Access not exercised in a browser.

## Follow-ups

- [ ] Skip `/api/git`, `/api/git/log` and `/api/digest` calls from the UI while Team is active (401 guest / 403 member today).
- [ ] Commit a reusable Team scratch harness (`scripts/team-smoke.ts`) that isolates Agent Bus with `MDHOUSE_AB_SOCKET_DIRS`.

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

- [ ] In the real UI, set and clear Public Read-Only for one project as an administrator. A fresh
  guest can open it while private projects remain absent and inaccessible. Verify the sign-in action
  and the no-public-project login path. Confirm normal signed-in grants still work.
- [ ] Verify direct HTML, roots, tree, search, raw/assets, nested project and live-event boundaries.
  Cover default and older policy data, invalid RW, stale admin revisions, revoked guest grants,
  banned accounts, and guests denied every mutation and administrative surface.
- [ ] Record an independent security review bound to the integrated code, the combined test/type
  gate and a bounded scratch browser check. Keep the live Team policy and project grants as set by
  the owner.

# Decisions — MDHOUSE Workspaces

## Product direction

- 📌 Q-W0 The next release is a Markdown workspace by default, not a viewer with editing
  exceptions. Adding a project means working in it: read, edit, use agent flows, review and ship.
  Viewer remains an explicit configured mode for read-only use.

- 📌 Q-W0a The workspace is personal by default and team-ready when configured. Personal/Team
  is independent from Workspace/Viewer: one controls participants and access, the other controls
  editing. A shared instance gives each browser its own author identity instead of attributing every
  person's reply to the server owner.

- 📌 Q-W4 The product term is **Markdown workspace**. The full description is
  **personal-first, team-ready Markdown workspace**; `Workspace` is the editable mode name.

- 📌 Q-W5 Persist `mode: "workspace" | "viewer"` in prefs and expose it in onboarding,
  Settings and CLI. Workspace uses RW by default and explicit per-root RW/RO choices. Viewer is a
  hard effective-RO override for every root and removes document write/interactivity controls.
  Stored per-root choices are preserved, but grant no write access until Workspace is enabled again;
  existing roots keep their configured access during upgrade.

- 📌 PROFILE-W1 R3 supports four named access profiles: **Personal Workspace** (`personal`) — one
  owner, optional login, RW by default; **Open Viewer** (`open-viewer`) — anyone admitted by host/network policy,
  hard RO; **Private Viewer** (`private-viewer`) — approved GitHub users, hard RO; and **Team
  Workspace** (`team`) — approved GitHub users with per-project RO/RW grants.

  Profiles are first-class presets over the same admission, Workspace/Viewer and grant enforcement.
  Trusted localhost/CIDRs are an explicit visible modifier for Private Viewer and Team Workspace,
  with their own project policy. Switching profile previews and confirms effective-access changes;
  Viewer preserves stored root/user grants while capping them at RO.

  Personal Workspace is not limited to localhost. Local no-login is its zero-config default; a
  remote single-owner deployment may use GitHub login or an explicit trusted CIDR/VPN/proxy boundary.
  Any bind beyond loopback requires an explicit admission choice and must not silently expose RW.

## Access model

- 📌 USER-W1 Team instances manage known users in mdhouse: an authorized owner may add them by GitHub
  username, edit status/grants, disable and remove them. The normal Add user UI has one required
  field: GitHub username. Normal Team login uses GitHub OAuth.
  mdhouse resolves and stores the immutable GitHub user ID as identity; the username is refreshed
  display/routing metadata, so a rename neither loses nor transfers grants. Instance `ACCESS` permits
  sign-in; content access is granted separately per canonical project/root as `RO` or `RW`. A newly
  added project grant defaults to `RW`, and no project grant means no project visibility or
  direct-route access.

  Local username/password accounts are secondary compatibility/recovery identities under Advanced,
  not part of normal Add user or Team onboarding. Provider identity keeps a local account distinct
  from a GitHub account with the same visible name.

- 📌 USER-W2 Effective permission is the intersection of every applicable boundary. Write requires
  Workspace mode, root RW, user project grant RW and an Editor session. Viewer, root RO or user RO
  reduces the result to RO. User/grant changes apply immediately and cannot promote the immutable
  reference root or grant access outside the root jail.

- 📌 USER-W3 An instance may require known users for access and may optionally admit requests from
  localhost or configured CIDRs as a trusted alternative. Trusted-source access has an explicit
  project policy, never inherits an administrator's grants, and never trusts forwarding headers
  without a separately configured trusted proxy.

- 📌 USER-W4 A successful GitHub OAuth callback creates mdhouse's secure revocable web session.
  Authenticated Markdown attribution uses the current GitHub username while audit/grant identity uses
  provider + immutable GitHub ID. A per-browser author cookie is only a fallback for personal or
  explicitly trusted anonymous use and cannot override authenticated identity. OAuth secrets and
  tokens remain server-side.

- 📌 Q-W1 An explicitly added root is RW by default.
  `mdhouse add <dir>` means the user intends mdhouse to work in that directory. `--ro` opts one
  root out; viewer mode makes RO its default. There is no `READ_ONLY_ROOTS` or protected-path
  list. The root itself is the grant, and the realpath jail prevents reads or writes outside it.

  Automatically supplied mdhouse reference material is not an explicit user grant and remains RO.

- 📌 Q-W2 `prefs.json` is the one persisted root model. CLI and web Settings both edit it;
  `Settings → Directories` has an Add directory button offering RW by default and an RO choice,
  using the same canonical registration path.

- 📌 Q-W3 Every instance auto-mounts one current, immutable RO reference root from the
  installed package for plan, markup, syntax and shareable skill documentation.

## Agent Bus routing

- 📌 AB-W1 Agent Bus may have an endpoint per space. The endpoint configured for the
  document's canonical root takes precedence over the instance-wide default; a space without an
  override uses the default. Endpoint credentials stay server-side with the prefs and are never
  sent to the browser.

- 📌 AB-W2 Agent selection follows one precedence chain:
  1. agents explicitly selected in the document's right panel;
  2. agents named by `<!-- AB: name -->` in the document;
  3. the space's configured default agents;
  4. the instance-wide default agents.

  Agent selection and daemon endpoint selection are independent. An unavailable higher-priority
  target is shown as unavailable and is not silently replaced by a lower-priority default.

- 📌 AB-W3 Per-space Agent Bus configuration is edited on that root's row in
  `Settings → Directories`, not in the instance-wide Agent Bus section. Every root always shows
  a compact `[AB]` button beside the `[RW]` / `[RO]` access badge; its configured per-space value is shown next to the button
  only when set. `[AB]` opens the directory editor. A legend below the directory list explains the
  controls. Saving an empty override deletes the value and restores fallback behavior, but `[AB]`
  remains visible. When every per-space Agent Bus field is empty, its config entry is removed entirely.

## Directory row controls

- 📌 DIR-W1 Directory badges show state that needs attention and act on it. A saved root has
  no saved badge. A session-only root shows `[unsaved]`; clicking it asks for confirmation, saves
  the canonical root with its current access mode to prefs, then removes the badge.

- 📌 DIR-W2 Every root shows its current access mode as `[RW]` or `[RO]`. Clicking the badge
  asks for confirmation and changes to the opposite mode immediately. For a saved root the choice
  is persisted; for an unsaved root it lasts for the session and is persisted if the root is later
  saved. In Workspace this is the explicit per-root choice and wins over the workspace default. In
  Viewer every root is effectively RO and the access-mode action is absent; the configured choice is
  retained for a later return to Workspace.

- 📌 DIR-W3 A project/root may have an optional human display name, stored in prefs against
  its canonical directory path. The display name is UI metadata only: it does not rename the
  directory or change its root ID, URLs or jail. Without one, mdhouse uses the existing directory
  label. An empty value deletes the override.

## External editor

- 📌 EDIT-W1 The external edit-link URL scheme is configurable. `edit` remains the default,
  preserving `edit:/full/path:line`; a user may set another scheme such as `mdedit` and register it
  with Typora while leaving the common `edit:` handler for another editor. The enable/disable switch
  remains separate from the scheme value. In Settings the scheme field is inline next to Edit link
  and is shown only while Edit link is enabled; disabling the link hides but does not erase it. Its
  contextual help uses `mdedit:/path:line` to explain a separate Typora handler.

## Agent Bus control API

- 📌 CTRL-W1 mdhouse exposes a small Agent Bus control API that returns the IDs available for
  control. A command explicitly supplies `rootId`, `clientId` and the Markdown `path`: the root says
  where the file lives, and the connected browser/tab ID says where it opens. There is no pairing
  step and no broadcast fallback. A disconnected or unknown client returns the canonical URL with
  `opened: false`.

## Flow model

- 📌 FLOW-W1 A flow is a set of Markdown documents plus routing between them, with optional
  scheduling. Built-in flows are editable document/routing packages, not separate hard-coded product
  features. Documents hold purpose, inputs, work, questions, decisions and outputs; routing says which
  document, person/team, Agent Bus target or external destination receives the next step. The common
  runner starts the entry route once or on schedule. New domains and improved versions should normally
  require document/routing changes, not a new UI implementation.

- 📌 FLOW-W2 Every proposed engineering and domain flow enters the library. The first versions
  may be small; usage evidence improves them later. Finance and Legal flows provide evidence-backed
  analysis and drafts, never autonomous financial/legal decisions, filings, signatures or payments.

- 📌 FLOW-W3 Every generated flow document records the full Git `last-commit-id` it has
  processed. **Since last run** is a standard scope: on refresh, that document reads
  `last-commit-id..HEAD`; after a successful run it advances the marker to the processed HEAD. The
  marker advances only after all document writes and routed outputs for that run succeed. A missing
  or unreachable commit after rewritten history requires an explicit new baseline rather than a
  silent full-project scan or skipped range.

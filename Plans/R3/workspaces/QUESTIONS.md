# Open questions — MDHOUSE Workspaces

> **Serg Parf:** Viewer mode  REMOVES all "rw" / interactivity elements
> so rw entries became RO

- 📌 Q-W1 What does “RW by default” cover: every directory added to mdhouse, or only a managed `~/mdhouse/<project>` workspace?
  > 💬 problem - people have hard time using it because cli it too hard for them
  > right now it meant to be Markdown workspace - not just a simple viewer as it was before
  >
  > so - ideas
  > 1. default add mode is "--rw" / "--ro" is option
  > 2. add special option to turn it into Viewer (make it RO default)
  >
  > ~/mdhouse/<project> - is setup default - rw out of the box;
  > there we'll place some sample project - so people can play with our markup and plans/decision systems
  >
  > 💬👾 Verified: today every root starts RO unless `--rw`, a saved root is RW only when it is in
  > `prefs.writable`, and `autoRw` is a separate path-based exception. I suggest making **workspace**
  > the default mode: a newly added root is RW, `--ro` opts one root out, and a saved **viewer** mode
  > makes newly added roots RO. `~/mdhouse/<project>` stays RW out of the box in either case. This is
  > a real permission-model change: current `Root` has no immutable kind, so protected reference roots
  > must be added before changing the default.
  >
  > ✅ 💡👾 Default to workspace mode (`RW`, with `--ro`); add a saved viewer mode whose default is `RO`.
  >
  > 💬 👤parf так и идея что не надо `READ_ONLY_ROOTS`; если пользователь делает
  > `mdhouse add` — he means it.
  >
  > 💬👾 Agreed. Explicit add is the trust boundary; the path jail limits that access to the added root.
  > Automatically supplied mdhouse reference docs are different because the user did not add them;
  > they remain RO. → [`DECISIONS.md`](DECISIONS.md#Q-W1)
  >
  > 💬 👤parf agree

- 📌 Q-W2 Where does “add any directory from config” live: `prefs.json`, the web settings page, or both?
  Adding a directory must still use canonical paths and must not bypass the path jail or the chosen RW rule.
  > 💬 from web interface user can add new directories as RW(default) or RO
  >
  > 💬👾 Verified: `prefs.json` already persists arbitrary roots in `saved` plus their access in
  > `writable`; the CLI/control path already canonicalizes and adds them. The missing part is web add.
  > I suggest both: `prefs.json` remains the canonical store, while Settings gets an **Add folder** form
  > with RW selected by default and an RO choice. The HTTP handler should call the same root-registration
  > operation as CLI control, then all document access continues through `Registry.resolve()`.
  >
  > ✅ 💡👾 Keep one persisted model in `prefs.json`; let CLI and web settings edit that same model.
  >
  > 💬 👤parf agree
  >
  > 💬👾 → [`DECISIONS.md`](DECISIONS.md#Q-W2)

> **Serg Parf:** * mdhouse instance should ALWAYS RO export set of MD files:
> all MD files needed to generate our markups for our editing
>
> Plans.md
> MARKUP
> syntax
> ...
> skills we want to share

- 📌 Q-W3 How should every mdhouse instance expose its own Markdown reference material?
  > 💬👾 I read the requirement above as an automatically mounted, always-RO reference root containing
  > the plan convention, markup/syntax docs and shareable skills. It should be a distinct immutable root:
  > neither workspace mode, `--rw`, `autoRw`, prefs edits nor the web UI may make it writable. Serving the
  > installed package's files directly gives one current copy; copying them into each project would drift.
  >
  > ✅ 💡👾 Auto-mount one immutable mdhouse reference root from the installed package in every instance.
  >
  > 💬 👤parf agree
  >
  > 💬👾 → [`DECISIONS.md`](DECISIONS.md#Q-W3)

- 📌 Q-W4 What should the next release call mdhouse's primary product mode?
  > 💬👾 The product is now for reading, editing, agent collaboration, review and delivery, not only
  > viewing. `Workspace` is familiar, already used by the package description, and does not overpromise
  > a full IDE. `Workbench` emphasizes active work but is a less familiar product category.
  >
  > ✅ 💡👾 Use **local-first Markdown workspace** in the product description and **Workspace** as the mode name.
  - (x) Markdown workspace 🌟
  - ( ) Markdown workbench
  - ( ) Markdown studio
  > 💬 👤parf agree
  >
  > 💬👾 → [`DECISIONS.md`](DECISIONS.md#Q-W4)

- 📌 Q-W5 How is Viewer mode configured?
  > 💬👾 It should change the default for newly added roots, while an explicit per-root RW/RO choice wins.
  > Existing saved roots must keep their effective access during upgrade; a product-default change must
  > not silently turn an old RO root into RW.
  >
  > ✅ 💡👾 Persist `mode: "workspace" | "viewer"` in prefs, expose it in onboarding and Settings, and
  > provide matching CLI configuration. Keep per-root access explicit in the saved-root model.
  >
  > 💬 👤parf agree
  >
  > 💬👾 → [`DECISIONS.md`](DECISIONS.md#Q-W5)

- 📌 Q-W6 How should a personal mdhouse become a Team workspace?
  > 💬👾 Team is a deployment profile, not another editing mode. It should assemble the existing network
  > and access controls with per-browser author identity, while Workspace/Viewer remains a separate
  > choice. Personal use must stay zero-config and local by default.
  >
  > ✅ 💡👾 Support four access profiles in Settings, onboarding and CLI: Personal Workspace, Open
  > Viewer, Private Viewer and Team Workspace. Team setup selects Team Workspace, configures GitHub
  > login, adds usernames and grants projects. Trusted localhost/CIDRs are an explicit visible
  > modifier, not a hidden bypass.
  >
  > 💬👾 → [`DECISIONS.md`](DECISIONS.md#PROFILE-W1)

- 📌 Q-W7 Which browser should an Agent Bus `open` command navigate in a Team workspace?
  > 💬👾 Returning the canonical URL is always safe, but the main goal needs a visible browser to open it.
  > Broadcasting would unexpectedly move every teammate's page. Pairing a browser identity with the
  > control request gives the command one explicit destination.
  >
  > 💡👾 Navigate the paired/requesting browser only; always return the URL; if no paired browser is
  > connected, keep the command successful with `opened: false` and the URL in its reply.
  - ( ) Paired browser only 🌟
  - ( ) Every browser viewing that space
  - ( ) Return URL only
  > 💬 👤parf сделаем simple API; он передаст IDs для Agent Bus; Agent Bus будет
  > указывать, где открыть.
  >
  > 💬👾 → [`DECISIONS.md`](DECISIONS.md#CTRL-W1): no pairing and no broadcast; the command names
  > the destination IDs explicitly.

- 📌 Q-W8 How should Reader → Editor login work?
  > 💬👾 Read access can remain open while writes require an Editor actor. Viewer always stays Reader.
  > Workspace may grant Editor through login, and may optionally trust localhost or configured
  > intranet CIDRs without login. Root RW is necessary but not sufficient: every write route must
  > also authorize the actor.
  >
  > ✅ 💡👾 Use GitHub OAuth for normal Team web login. Add users by GitHub username, but bind their
  > account and grants to the immutable GitHub user ID. The callback creates a secure revocable
  > mdhouse session; current GitHub username identifies authored work. Localhost/configured CIDRs may
  > remain an explicitly trusted alternative. Local username/password and HTTP Basic remain secondary
  > Advanced compatibility/recovery mechanisms, not the normal Add user or Team login path.
  >
  > 💬👾 → [`DECISIONS.md`](DECISIONS.md#USER-W1), [`USER-W4`](DECISIONS.md#USER-W4)

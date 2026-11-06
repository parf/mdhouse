# Resolved — MDHOUSE Workspaces

Decision history; current rules: [DECISIONS.md](DECISIONS.md).

- ✅ Q-W1 What does “RW by default” cover: every directory added to mdhouse, or only a managed `~/mdhouse/<project>` workspace?

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

- ✅ Q-W2 Where does “add any directory from config” live: `prefs.json`, the web settings page, or both?

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

- ✅ Q-W3 How should every mdhouse instance expose its own Markdown reference material?

  > **Serg Parf:** * mdhouse instance should ALWAYS RO export set of MD files:
  > all MD files needed to generate our markups for our editing
  >
  > Plans.md
  > MARKUP
  > syntax
  > ...
  > skills we want to share

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

- ✅ Q-W4 What should the next release call mdhouse's primary product mode?

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

- ✅ Q-W5 How is Viewer mode configured?

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

- ✅ Q-W6 How should a personal mdhouse become a Team workspace?

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

- ✅ Q-W7 Which browser should an Agent Bus `open` command navigate in a Team workspace?

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

- ✅ Q-W8 How should Reader → Editor login work?

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

## Administration contract history

- ✅ ADMIN-W1 Instance administration is distinct from project Reader/Editor and trusted-network admission.
  > 💬 👤parf cli - там только admin; там не может быть проверки. - менять может только тот user от кого запущен процесс - всегда ab - вообще под вопросом пока я хочу только read-only api + открытие страницы в browser
  >
  > 💬 👤parf если режим personal - то можно ; как только появились пользователи - team режим - должны знать кто admin добавление users - тоже admin only
  >
  > 💬 👤parf само собой редактирование свойств project - тоже admin (enable/disable rw)
  >
  > 💬👾 → [№ADMIN-W1](DECISIONS.md#ADMIN-W1), [№PROFILE-W1](DECISIONS.md#PROFILE-W1),
  > [№USER-W1](DECISIONS.md#USER-W1), [№DIR-W2](DECISIONS.md#DIR-W2),
  > [№CTRL-W1](DECISIONS.md#CTRL-W1): CLI/control stays OS-owner administration;
  > Team web admin is configured explicitly and bound to an existing immutable provider ID.
  > Personal/no users preserves owner management; first-user/admin transition is atomic and fails
  > closed on missing admin/profile conflicts. AB control is read-only query plus targeted page open,
  > with separate sender/root/user authorization. No AB root/config/user/grant/RW mutation is approved.

  A project RW grant, localhost/CIDR, first visitor or author cookie grants no admin power. The
  existing OS-owner-protected CLI/control socket may bootstrap a revocable browser admin session
  without GitHub/account onboarding, preserving local Personal optional login. Remote administrator
  designation is explicit. CEO confirmed this contract on 2026-11-05
  (`mdhouse-r3-start/kickoff-confirmed`).

  Mint browser bootstrap proof only through OS-controlled CLI/unix control, never through public
  HTTP. Use a short-lived, single-use random proof held in server memory, deliver it as a URL
  fragment and remove it before project content renders. Exchange behind
  trusted-host/admission/same-origin checks for a revocable HttpOnly host-only session with expiry
  and appropriate HTTPS/SameSite flags. No token in config/project files, logs, query strings or
  audit records. Service startup prints no secret; explicit owner CLI and browser opening provide
  the recovery/setup path. Exact transport and session enforcement require independent security
  review and negative tests before integration.


## Document content history

- ✅ Q-R3-HTML1 How should trusted HTML coexist with authenticated administration? <a id="Q-R3-HTML1"></a>
  Evidence: current rendered Markdown permits active same-origin HTML; `img onerror` changed only
  scratch `editLink` through `/api/settings`, and iframe `srcdoc` changed the parent DOM.
  Impact: future admin/session cookies do not stop document script from making same-origin privileged
  requests. The current trusted-HTML contract is deliberate; changing it needs an owner decision.
  - ( ) Constrain document-supplied active content while retaining passive HTML; verify CSP/frames/forms/base/raw-MIME boundaries and normal app/mermaid behavior 🌟
  - ( ) Retain active trusted HTML and design separate privileged origins/capabilities with an explicit trust contract
  > 💬👾 Verified by W1 in owned scratch on ports 7861/7862, fresh browser profiles, temporary config,
  > and captured own PIDs. No secrets, real admin endpoints or live instance were used. Current
  > `onerror` and inline iframe `srcdoc` ran; direct script nodes and raw `.js` did not run. A proxy
  > adding `script-src 'self'` blocked all four probes, but full app compatibility and isolation
  > were not proved. Same-origin form/base/frame and future script-resource paths still need review.
  >
  > 💡👾 Choose the intended content/privilege contract before implementation. Keep
  > [№MW.0g](TODO.md#MW.0g) admin wiring on hold; attribution, reference content and flow packages
  > continue independently. A partial CSP patch is not an accepted isolation guarantee.
  >
  > 💬 👤parf we can check referer on admin forms and never accept incorrect one
  >
  > 💬👾 This proposes an additional check, not a changed HTML/CSP/origin contract. W1 is verifying
  > whether active same-origin document code can supply the exact expected admin/settings URL through
  > Fetch `referrer`, with actual Referer/Origin/Sec-Fetch headers and a harmless scratch state change.
  > Missing-header behavior and legitimate Settings requests will be recorded separately.
  >
  > 💬👾 Scratch Referer equality test confirmed the limitation: explicit Fetch referrer, history
  > replacement and same-origin Settings iframe all sent the same expected Referer, Origin and
  > Sec-Fetch headers as a legitimate Settings click; each changed scratch editLink. Default or
  > missing Referer was denied. Evidence is retained in W1's owned xss/ref-run.sh and referer.jsonl.
  >
  > 💬 👤parf запретить активное содержимое документов,
  >
  > 💬 👤parf для mermaid можно сделать исключение
  >
  > 💬👾 → [№Q-R3-HTML1](DECISIONS.md#Q-R3-HTML1): passive document boundary approved, with the
  > app-controlled Mermaid renderer as a constrained exception. Referer is additional evidence,
  > never the isolation mechanism. Implementation/review/browser acceptance remains open.


## Profile clarification history

- ✅ USER-W4 Fetch the authenticated GitHub profile after login.
  Public profile metadata does not authenticate another account or grant project/admin access.
  Email may be hidden; no key-based feature is added.
  > 💬 👤parf Да - как только у нас есть logged in user - we ask it
  >
  > 💬👾 → [№USER-W4](DECISIONS.md#USER-W4): authenticated `/user` profile, immutable provider ID,
  > optional display fields; no live GitHub account operations were performed.

- ✅ USER-W1 Preview the verified public account before adding a user.
  Look up server-side; keep provider/not-found failures distinct. Input changes invalidate preview;
  confirmation binds the verified immutable ID, with safe stale/change rejection before save.
  > 💬 👤parf когда admin добавляет пользователя через web interface - надо тоже ходить и проверять 1. есть ли такой user in general 2. показать public data - тот ли это человек (легко ошибиться в имени) ; only then confirm
  >
  > 💬👾 → [№USER-W1](DECISIONS.md#USER-W1): global add creates ACCESS only; project-context add
  > grants only that explicit project (default RW). Lookup/cancel/failure creates no account/grant.

- ✅ USER-W5 Require authenticated answer signatures with >1 user. <a id="USER-W5"></a>
  > 💬 👤parf Важно - когда включен team mode (>1 user); надо включать режим подписи имени под ответами (тк commit идут все равно от одного пользователя)
  >
  > 💬👾 → [№USER-W5](DECISIONS.md#USER-W5): >1 is the mandatory-signature condition, not a replacement Team/admin threshold. All answer/comment/edit flows use spoof-resistant authenticated attribution; Personal preference is separate.

- ✅ USER-W6 Keep private user-session history and require idle-session GitHub re-login. <a id="USER-W6"></a>
  > 💬 👤parf for every user keep its sessions; keep last 10 ips and last 10 unique city, county; 10 unique countries with last date; & last browser agent used
  > show to user and admin only
  > when session was not used for more than 30 days; require re-login via github
  >
  > 💬👾 → [№USER-W6](DECISIONS.md#USER-W6): self/admin authorization applies server-side to list/details/direct requests. Idle is per session, checked before updating last-used; neighboring active sessions never renew it. County stays distinct from country. Geo source/availability and trusted client-IP extraction require analysis before implementation; no arbitrary external/paid lookup or spoofable XFF trust. Short-lived admin TTLs are unchanged.

  >
  > 💬 👤parf use some 2 public service for IP resolve (try one, only on fail try second)
  >
  > 💬👾 Public-service selection/use is authorized for this feature; official API docs and mocks suffice for research, with no real user-IP lookup. Select HTTPS/free public services without implied paid/signup credentials; report exact pair, fields/limits/terms and county gaps before live wiring. Secondary follows primary failure only; trusted client-IP validation and private/loopback exclusion remain mandatory.

  >
  > 💬 👤parf yes, i meant city,country (for use city,state,country)
  >
  > 💬👾 Clarification supersedes county in [№USER-W6](DECISIONS.md#USER-W6): fields and unique location key are city/state/country; provider region may map to state with its meaning preserved. County was a typo and is not required; no third provider search. Last 10 unique countries with lastSeen remain separate; other session policy is unchanged.

  >
  > 💬 👤parf keep isp, org, asn!!
  >
  > 💬👾 Required additions to [№USER-W6](DECISIONS.md#USER-W6) are ISP, organization and ASN alongside IP/GeoIP observations, with unchanged self/admin visibility. Preserve ASN number and label if supplied; missing metadata is unavailable. The owner’s AntiSpider example is context, not a requirement for hostname, hosting, counters or allow-policy. Verify the provisional pair’s official schemas before wiring; do not research by looking up the example IP.

  >
  > 💬 👤parf sequence; city level, state level, country-level
  > new country alwats require re-login
  >
  > 💬👾 [№USER-W6](DECISIONS.md#USER-W6): separate last-10 unique city/state/country histories; city key includes state/country, state key includes country. New-country GitHub reauthentication is independent of idle30d, before protected actions or trusted-history/baseline updates. Unknown/private/failed GeoIP is not a new country; baseline question remains [№Q-R3-COUNTRY1](QUESTIONS.md#Q-R3-COUNTRY1).

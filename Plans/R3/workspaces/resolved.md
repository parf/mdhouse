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

## Country reauthentication baseline history

- ✅ Q-R3-COUNTRY1 Which baseline makes a country new for reauthentication? <a id="Q-R3-COUNTRY1"></a>
  [№USER-W6](DECISIONS.md#USER-W6) requires GitHub re-login before a protected action from a new
  country. A user's country history can include observations from other sessions; GeoIP can be
  unavailable. Candidate observations cannot establish an authenticated baseline by themselves.
  - ( ) Compare against this session's last GitHub-authenticated country 🌟
  - ( ) Compare against all countries already known for the user
  > 💡👾 Per-session baseline: a US-authenticated session arriving from DE must reauthenticate even
  > if another session previously used DE. A return to US after authenticating in DE also requires
  > reauthentication. Only successful GitHub authentication may set a verified available country;
  > unknown/private/failed GeoIP leaves the baseline unknown, not a guessed country. Keep a country
  > candidate pending and do not execute the protected action while a required new-country decision
  > is unresolved; exact first-known-country handling must be settled with this baseline.
  >
  > 💬 👤parf каждый переход
  >
  > 💬👾 Per-session last GitHub-authenticated country is the baseline. US→DE→US requires re-login on both transitions, regardless of history or another session. Only successful reauthentication updates the baseline; protected action/trusted history waits for that confirmation. Unknown/private/failed GeoIP is not a transition; initial-unknown behavior remains unsettled, and the earlier suggested pending rule is not owner-approved blanket denial.

- ✅ USER-W7 Restrict established Team identity changes to configured admin. <a id="USER-W7"></a>
  > 💬 👤parf user can not change his github username and his name/realm after they set, only admin can
  >
  > 💬👾 → [№USER-W7](DECISIONS.md#USER-W7): server-side direct/stale/API checks enforce the lock, including automatic login/profile synchronization. Preserve immutable GitHub numeric principal; admin username corrections require existence/public preview/confirmation and cannot silently bind another account or transfer grants. Name/realm changes confer no grants. Personal author attribution is separate. No authenticated-user realm field currently exists; [№Q-R3-REALM1](QUESTIONS.md#Q-R3-REALM1) asks its meaning before introducing schema.

  >
  > 💬 👤parf pretty obvious - can;t sign/login under other person
  >
  > 💬👾 [№USER-W7](DECISIONS.md#USER-W7): admin profile edits are not login-as or permission to replace another principal. Signature comes only from authenticated actor; reject body/cookie spoof and silent OAuth different-ID rebinding. Existing name/realm wording remains history, but no missing realm schema blocks username/name protection or authorizes a new field.

## Original RAG discovery question — historical wording

The current handoff question remains open in [QUESTIONS](QUESTIONS.md#Q-R3-RAG1); the v0.2 discovery
below is historical, superseded by verified 0.3 capabilities and the current RAG contract.

- ❓ Q-R3-RAG1 Which Agent Bus contract supplies the approved R3 source/job lifecycle? <a id="Q-R3-RAG1"></a> — [final thread](#Q-R3-RAG1-final)
  > 💬👾 Verified 2026-11-05 through `#rag@parf.us` help/help-json v0.2.0 and local
  > `/usr/local/src/ai-agent-bus/docs/agents/rag.md`: available methods are `upsert`, `get`,
  > `list`, keyword/BM25 `search`, `keyword_index`, `delete`, `prompts`. No source registry,
  > asynchronous job/progress, semantic retrieval or source refresh lifecycle is advertised.
  > Namespace/table filters are labels, not authorization boundaries; admitted callers can access
  > all namespaces. No data mutations or paid provider calls were performed in this discovery.
  >
  > 💬👾 R3f/MW.2a assumes those capabilities already exist. Options: identify another approved
  > existing endpoint/version with that contract, coordinate missing Agent Bus capabilities under
  > separately approved ownership, or explicitly revise the R3 requirement to the available API.
  > Recommend identifying the intended provider/version first. Do not invent endpoints or silently
  > reduce release scope. Independent R3 work continues; only dependent MW.2a implementation waits.
  >
  > 💬 📡 CEO relayed owner direction: "we can make instances of rag; each one have own namespace #rag/project1".
  > Owner will add the missing provider capabilities. Questions and wishes are now collected separately
  > in [`../RAG-CONTRACT.md`](../RAG-CONTRACT.md), including the verbatim owner wording.
  >
  > 💬👾 Per-project instances are the intended routing/isolation model. Namespace labels alone are
  > still not authorization. Exact provider schemas/grants remain open as RAG-Q1–RAG-Q12; MW.2a stays
  > pending their handoff. No provider repository changes or functional/paid calls are authorized here.

- ✅ RAG-W1 Keep RAG sync as our separate on-demand executable. <a id="RAG-W1"></a>
  > 💬 📡 CEO Owner clarification: RAG sync is a separate task run only on explicit owner demand. Exclude it from normal R3 execution cohorts/automatic syncing; do not initiate provider status sync or calls as background work.
  >
  > 💬 👤parf не так - rag sync is separate bin module; still yours
  >
  > 💬👾 Correction supersedes the earlier exclusion of planning/implementation: RAG sync stays in our R3 ownership and normal prioritization as a separate bin module. Execution is on demand; no implicit background sync, provisioning, paid/live authority or status polling is authorized by planning work.
  >
  > 💬 📡 CEO Owner reminds us to use #ab-ceo setup instructions: one FileScan per folder; owner/AB-CEO authorize root, record/Configuration.dir, token/reload and caller grants; after provisioning our module configures the agreed RAG endpoint/namespace/table subscription and reads status/sub list.
  >
  > 💬👾 Watch/poll versus bounded on-demand behavior remains [№Q-R3-RAGSYNC1](QUESTIONS.md#Q-R3-RAGSYNC1). Existing endpoint/root questions are linked, not asked again; no live provisioning or paid call was performed.

  >
  > 💬 📡 CEO AB-CEO af433a09927c623d reports owner approved Q353/Q355 with CHANGE: parf remains record Owner; #cx/mdhouse-cto gets Maintainer on #rag/mdhouse@parf.us and #filescan/mdhouse@parf.us (config/access/subscriptions/scan/reset). T-49 registration in progress, wait exact live records/grants.
  >
  > 💬👾 This supersedes earlier no-CTO-grants assumptions for the explicit mdhouse sync scope only. FileScan uses parf's account runner, approved root/mask/exclusions and mdhouse/docs; #mdhouse registration ownership remains an owner decision. No subscription/ingestion has started, T-48 remains pending, reset/destructive replay and worker/wildcard grants are not implied.

## On-demand sync lifetime history

- ✅ Q-R3-RAGSYNC1 How does the separate bin finish an on-demand sync when FileScan watches/polls? <a id="Q-R3-RAGSYNC1"></a>
  [№RAG-W1](DECISIONS.md#RAG-W1) requires explicit owner-demand execution. FileScan uses persistent
  subscriptions and can resend pending work; leaving one connected may continue paid RAG writes
  after the bin exits. Endpoint/root decisions already live in [№Q-R3-RAG1](#Q-R3-RAG1).
  - ( ) Bounded one-shot sync with only an explicitly owned temporary subscription; no persistent sync after exit 🌟
  - ( ) Explicit owner-selected watch mode, with visible lifetime/stop controls and separate authorization
  > 💡👾 Default to a previewable one-shot plan that names exact folder/instance/endpoint/namespace/table,
  > catches up only within the requested run, and tears down only its owned subscription. Preserve
  > unknown/in-flight paid outcomes as diagnostics; do not claim cancellation or retry safety. Add
  > persistent watch behavior only when explicitly selected and authorized, never by default.
  >
  > 💬 📡 #ab-dir reports owner chose the recommended options for Q368–Q375; T-48 finite sync leaves no subscription, watch or timer, keeps per-target confirmed marks, and never auto-resends an unknown file.
  >
  > 💬👾 Finite provider sync supersedes the earlier temporary-subscription proposal; runtime/API must still be delivered and deployed. Watch retry policy is separate standing authority, not permission for on-demand resends. This closes the lifetime product choice, not implementation or live acceptance.


## Ignored Markdown browsing — 2026-11-06

- ✅ BROWSE-W1 Browse generated gitignored Markdown <a id="BROWSE-W1"></a>
  CEO owner-approved handoff (`901766014bcd1329`):
  > Owner approved browsing behavior, implement via team scheme/simple-first coherent cohort: (1) left browse panel button 'Show ignored' when gitignored files exist; (2) navigating directly inside a gitignored directory automatically lists its files, e.g. .ai-team/ and vendor/**/*.md, without global toggle; (3) a gitignored directory in V1 or V2 is always shown in all views. Motivation generated temporary gitignored Markdown reports. Preserve distinct explicit excludes/security/path jail; gitignore is visibility default, not access boundary. Repro confirmed live: /app/realty/.gitignore:44 /.ai-team/, normal /api/tree?root=realty has0 .ai-team, ignored=1 has31. No live7777 checks/reload needed. First inspect current V1/V2 semantics and existing toggle/tree scanning, record exact acceptance/owner quote in owning plans; resolve implementation details from code, material ambiguities QUESTIONS. Implement scoped fix + proportional focused tests, no full/version bump; exact review as needed. Don't silently reveal genuinely forbidden .git or alter explicit exclusions.
  >
  > 💬 👤parf когда V1 / V2 - то только то что там выбрано; я про main/default view
  >
  > 💬👾 Clarification relayed by CEO (`33d4dead175bbfb8`): ignored folders selected in either view appear with contents in main/default; no cross-view union inside V1/V2. [Decision](DECISIONS.md#BROWSE-W1).


## Git file states and direct reveal — 2026-11-06

- ✅ GIT-W1 Distinct file states after ignored browsing <a id="GIT-W1"></a>
  CEO owner-approved handoff (`f34120e4877ce419`):
  > Owner approved proposed UI: direct open realty/.ai-team/README.md expands/reveals exact path and selected file in left tree; distinct Gitignored (orange) vs Untracked (blue) file colors + two distinct right file-view badges. Shared semantic CSS/classes everywhere (sidebar/list/file right panel, light/dark), tracked files neither badge; do not conflate no-repo with untracked. User said «да - так намного лучше» after corrected two-badge preview. Please record scope/quote and implement as one small approved cohort via team scheme with focused checks, preserve strict V1/V2 own selections and explicit exclusions/jail. Avoid duplicating MW.9; build on it.
  >
  > 💬 👤parf да - так намного лучше


## Git history visibility — 2026-11-06

- ✅ GIT-W2 Hide misleading file history <a id="GIT-W2"></a>
  > 💬 👤parf http://md/realty/.ai-team/README.md если gitignored - зачем git history показывать
  >
  > 💬👾 CEO handoff `32e3b6d9c39e4039`: hide action/panel for authoritative gitignored and untracked with no history; tracked including ignore-pattern matches preserve history. Existing authoritative gitState only; no unrelated UI expansion.


## Unchanged document rendering — 2026-11-06

- ✅ RENDER-W1 Do not refresh unchanged file bodies <a id="RENDER-W1"></a>
  > 💬 👤parf если файл не меняется - зачем ?
  >
  > 💬👾 CEO steering `7fc318b1241e4cd8`: generic root Git events must not rerender unchanged documents; refresh Git status/history separately or check content identity, retaining valid body/token. Changed content refreshes normally; cache/restore alone is insufficient.


## Current Projects Settings — 2026-11-06

- ✅ PROJECTS-W1 Projects terminology and current supported configuration <a id="PROJECTS-W1"></a>
  CEO handoff (`042ab6f45fcc9e53`):
  > Owner reminds remaining requested work: per-project settings IN Settings view; rename Directories→Projects; many tasks simple, should progress them. Audit owning TODO/currentUI against original approved acceptance NOW and pick compatible simple/medium cohort beforecode, not more inert foundation detours. Ship rename throughout relevant UI/shared terms + current per-project settings that existing authority supports, project selection/grouping in Settings. Do not make routine text/UI work wait for unrelated OAuth/RAG; preserve required admin gates for mutations, explicitly scope any unavoidable dependent portion. Delegate available workers via established scheme, one proportional combined gate/review, no full after minor changes; exact task list/status back concise. Local reload after accepted integration under standing owner request, coordinated CEO only.
  >
  > 💬👾 Current Projects UI/read DTO/copy cohort accepted on be56acd. New name/access/kept/AB override editors remain explicit admin-gated tasks, not claimed delivered. Live result: e061cd7d59e9822f.

## Project display-name lifetime

- ✅ Q-R3-NAME1 Should a name outlive an unsaved project session? <a id="Q-R3-NAME1"></a>
  [№DIR-W3](DECISIONS.md#DIR-W3), [Project names](../README.md#project-names) and
  [№MW.1a](TODO.md#MW.1a) define canonical-path display metadata and `-p --name`, but not name lifetime
  for a session root or CLI `--name` without `-p`. Neither choice may save the root or change access.
  - ( ) Persist names by canonical path independently of saved roots, retaining them on removal like existing marks 🌟
  - ( ) Keep session-root names in memory until the root is explicitly saved
  > 💬👾 Owner-facing choices: A — persist by path independently of saved roots; B — keep the name temporary until the project is explicitly saved.
  >
  > 💬 👤parf B

## Explicit project access rollout

- ✅ Q-R3-MODE1 Which downgrade and rollout boundary should gate explicit project RO? <a id="Q-R3-MODE1"></a>
  [№DIR-W2](DECISIONS.md#DIR-W2) requires explicit RO to beat auto-RW; current boolean cannot represent it.
  An additive RO field is ignored by old readers and can reopen auto-RW. Merely raising prefs version
  currently blocks old prefs writes, not document writes. A safe proposed version-2 format moves unchanged
  auto rules to a new key and clears legacy auto rules; restarted old binaries lose automatic RW and
  cannot edit the newer config, while their existing explicit writable list still works.
  Existing older processes may retain explicit RW in Registry memory even after refresh: CTO reproduced
  a successful actual file write after simulated v2 stored RO. Stopping/restarting such processes is an
  operator action; it is not authorized by the current implementation task. Known control-port inspection
  can find some old processes but cannot prove there is no old process without a control socket.
  - ( ) Implement the scoped mode migration/toggle with conservative old-reader downgrade and an explicit operator rollout boundary; no automatic restart or claim of complete old-process revocation 🌟
  - ( ) Implement only an inert compatibility prerequisite now; defer persistent RO/toggle until the rollout policy is separately approved
  Independent facts: old saved/session and auto choices must not gain effective access during migration;
  existing explicit RO must survive CLI `-p` without `--rw`; an explicit `--rw` remains an OS-owner grant.
  Returning to inherit is outside this bounded toggle slice, which chooses only explicit RW or RO.
  > 💬 👤parf A = но как это старый = у нас один BG process?
  >
  > 💬 👤parf у нас такого быть не может - у нас на машину - один процесс
  > если пользователь как-то запустил много - то конечно до reload ничего не меняется (это его проблеммы)


## Per-project Agent Bus configuration lifetime — 2026-11-07

- ✅ Q-R3-AB1 How does per-project Agent Bus configuration behave for an unsaved project? <a id="Q-R3-AB1"></a>
  [Directory management](../README.md#directory-management) says saved-root changes persist and
  unsaved-root changes remain in the session until saved, immediately before the `[AB]` rule.
  [№AB-W1](DECISIONS.md#AB-W1)/[№AB-W3](DECISIONS.md#AB-W3) define canonical keys, overrides and clearing,
  but do not explicitly include AB configuration in the save operation. [№Q-R3-NAME1](DECISIONS.md#Q-R3-NAME1)
  is specific to names. No per-project AB schema or implementation exists yet.
  Tokens remain server-side only; this slice adds no token input or new credential CLI surface.
  - ( ) Keep unsaved endpoint/default overrides in memory; explicit save carries them into canonical prefs 🌟
  - ( ) Require saving the project before editing AB configuration; show `[AB]` read-only until then
  - ( ) Persist canonical AB overrides independently of whether the project is saved
  > 💡👾 Use the existing Directory management lifetime for AB endpoint/defaults; clarify that explicit save
  > carries this metadata. Saved-root credentials can be provisioned in server-side prefs only.

  > 💬👾 Verified-source clarification, not a new owner answer: CEO checked
  > [Directory management](../README.md#directory-management), whose unconditional saved/session
  > root-property lifetime immediately precedes `[AB]`. Apply it to endpoint/default overrides:
  > unsaved memory-only, explicit save atomically carries AB metadata with mode/name; saved edits persist.
  > Tokens remain server-only; endpoint changes discard the prior credential.
  > Source: CEO `r3-project-ab / bounded-design-20261107`, 2026-11-07, message `0dc84fbd14ffd54c`.

## Editor, RAG and automations owner direction

- ✅ RAG-W2 Separate retrieval audiences and indexes <a id="RAG-W2"></a>
  > 💬 👤parf Полный Markdown-редактор. - бери готовый
  >
  > 💬 👤parf RAG давай немного отложим, пока продумай как и для чего интегрировать: Docs/knowledge indexing; Code indexing; 2 unrelated indexes; one for MDHouse Endusers (knowledge); второй для Devs & AI Agents !!!
  >
  > 💬 👤parf Еще - TODO - automations: AgentBus умеет Cron/At service; it can call agents - so we can run our AI pipelines - like code review, qa and more
  >
  > 💬 👤parf наверно второй - обший
  > fisrt one - docs only
  >
  > 💬 👤parf - Общий code index  = same idea as first one but for Code+Docs

## Access badge baseline

- ✅ BADGE-W1 Show deviations from the current mode baseline <a id="BADGE-W1"></a>
  > 💬 👤parf [Image #1] RW is default now - it should be hidden, and RO should be shown when set
  > howecver in viewer mode it should be opposite
  >
  > 💬👾 Workspace: hide RW and show RO. Viewer: hide RO and show configured RW, while Viewer still forbids writes.
  >
  > 💬 👤parf good, go
  >
  > 💬 👤parf применяем это везде
  >
  > deafults are either hidden or grey / and important / unusual stuff highlighted
  >
  > 💬 👤parf [Image #1] Settings project list with repeated RW badges.

## Data placement

- ✅ CONFIG-W1 Project-local configuration is versioned <a id="CONFIG-W1"></a>
  > 💬 👤parf и вообще решить что должно куда идти.  $PROJECT_HOME/.mdhouse/ - git controlled
  >
  > 💬 👤parf это особенно важно для teams flows & automations

## Shared marks authorization — 2026-11-05

- ✅ Q-R3-ADMIN1 Who may change the existing shared file marks? <a id="Q-R3-ADMIN1"></a>
  `/api/marks` stores favorite/muted/ignored for the entire root in instance prefs, including RO roots.
  Ignored entries disappear from everyone's default tree; this is not a private browser preference.
  [№MW.0g](TODO.md#MW.0g) must classify this mutation before activating web administration.
  - (x) Personal owner / Team configured instance administrator 🌟
  - ( ) Project Editor with an explicit grant to that project
  > 💬👾 Verified `src/server.ts` marks route and `src/lib/prefs.ts`: all browsers share the same
  > root-keyed arrays; ignored changes invalidate the shared tree. Recommend treating these existing
  > global marks as instance configuration. A per-user marks store is a separate scope, not inferred.

## Initial unknown country — 2026-11-06

- ✅ Q-R3-COUNTRY2 What should the first known country do when GitHub login had no GeoIP country? <a id="Q-R3-COUNTRY2"></a>
  [№USER-W6](DECISIONS.md#USER-W6) uses each session's authenticated country; unknown/private/failed
  GeoIP is not a transition. The pure model reports unbound and does not trust that observation.
  - (x) Require GitHub reauthentication when a verified country first becomes available 🌟
  - ( ) Enroll the first verified country automatically without reauthentication
  > 💡👾 Authenticate the first known country before a protected action and baseline/history trust.
  > While GeoIP is unavailable, do not invent a country-change denial; ordinary identity/access
  > rules still apply. This recommendation is not an approved blanket deny for unknown geography.
  >
  > 💬 👤parf country=NA (not avaiable)
  >
  > 💬👾 ISO 3166-1 `NA` = Namibia; store not-available as a non-code marker (`--`/`null`)?
  > `NA → US`: reauthenticate (NA is a baseline 🌟) or enroll (NA is unknown, per [№Q-R3-COUNTRY1](DECISIONS.md#Q-R3-COUNTRY1))?
  >
  > 💬👾 (x) settles `NA → US` = reauthenticate. Open only: the stored marker — `NA` (= Namibia) or `--`/`null`.
  >
  > 💬 👤parf пустой страны в COUNTRY2 = NA

## Team identity realm — 2026-11-06

- ✅ Q-R3-REALM1 What does realm identify in the locked user name/realm? <a id="Q-R3-REALM1"></a>
  [№USER-W7](DECISIONS.md#USER-W7) makes established GitHub username and name/realm admin-edit-only.
  Current code has only the Basic challenge realm `mdhouse` and the Agent Bus host-derived realm;
  neither is an authenticated-user field. Is realm an existing external identity component or
  another label? Its meaning and source must be specified before adding a user-schema field; this question does not
  block username/name protection or authenticated-actor-only login/signatures.
  > ✅ 💡👾 Keep the established username/name lock; leave realm unmodeled until its meaning is explicit.
  >
  > 💬 👤parf elaborate
  >
  > 💬👾 "Realm" exists today only as: Basic auth `realm="mdhouse"` (`src/server.ts:358`); Agent Bus `#mdhouse@<host>` (`src/lib/agent-bus.ts:89`).
  > No user record has one. Which is meant?
  > - A — nothing extra: "name/realm" = the user's display name
  > - B — the user's Agent Bus identity `#<name>@<realm>` (agents sign as the user)
  > - C — an organization / team label of the user
  - (x) A — display name only; no realm field 🌟
  - ( ) B — the user's Agent Bus identity `#<name>@<realm>`
  - ( ) C — organization / team label
  > 💬 👤parf agree

## Agent upkeep — 2026-11-12

- ✅ Q-R3-RELOAD1 CLAUDE.md reload script: skip the reference root? <a id="Q-R3-RELOAD1"></a>
  The script re-adds every unsaved root; `/home/parf/src/mdhouse/doc` (kind `reference`, built in) is unsaved, so `./bin/mdhouse` on it fails and `set -e` stops the reload.
  - (x) add `select(.kind != "reference")` after `select(.saved|not)` in the jq filter 🌟
  - ( ) leave as is

- ✅ Q-R3-HANDOFF1 `.ai-team/{w1,w2,w3}/HANDOFF.md` still name the 145 removed worktrees / `r3/*` branches (archive: `.scratch/worktree-archive-2026-11-12/`). <a id="Q-R3-HANDOFF1"></a>
  - (x) replace those lines with the archive path 🌟
  - ( ) leave as is

## Q-R3-RAG1 final thread — 2026-11-12 <a id="Q-R3-RAG1-final"></a>

- ✅ Q-R3-RAG1 Which typed FileScan handoff completes the R3 source lifecycle?
  RAG 0.3.0 free capabilities are verified; provider reports 0.4.1 live. Retrieval is no longer
  blocked on v0.2 discovery, but actual T-49 live records/grants still await confirmation.
  Dedicated endpoint [№Q353](http://localhost:7777/ai-agent-bus/Plans/R1.1/QUESTIONS.md#rag-for-mdhouse) and FileScan roots
  [№Q355](http://localhost:7777/ai-agent-bus/Plans/R1.1/QUESTIONS.md#owner-items-from-2026-11-06) are provider-reported approved with CTO Maintainer changes; T-49 live records/grants and T-48
  bounded/large-text deployment remain pending. #mdhouse caller already exists as parf-owned; no re-registration.
  T-45 typed docs/fixture are delivered: subscriber change messages and status snapshots, but no
  source registry, job API/history or event stream. A4 end-to-end and A7 dedup remain unmet.
  > 💡👾 Use the explicit dedicated endpoint/stored project namespace after provisioning; complete
  > FileScan/recovery fixture acceptance without inventing provider jobs/history, treating pending:0
  > as complete-folder proof or silently substituting polling for required live lifecycle updates.
  > [Current contract](../RAG-CONTRACT.md); [original question/history](resolved.md#Q-R3-RAG1).
  >
  > 💬👾 2026-11-12: provisioning done — `#rag/mdhouse@parf.us` RAG 0.4.5 on `#qdrant@parf.us`, `#filescan/mdhouse@parf.us` on this repo; `mdhouse-rag-sync` confirmed 163/184 files.
  > AB agent: no provider source registry / job API / history is planned. The question is no longer a provider question; the rest is mdhouse work.
  - (x) close: rule → DECISIONS, remaining work → TODO MW.2a 🌟
    - lifecycle = FileScan instance + runner roots per source (admin step) → `mdhouse-rag-sync` → RAG
    - source registry, sync history, A7 request-id outcomes: KV on `#mdhouse@<host>` (`set --add`); events: `#mdhouse` agent log
    - small-file citations (heading/lines): computed by mdhouse from the file at `content_hash`; mismatch → stale, no citation
  - ( ) keep open — wait for a provider job/history API
  > 💬 👤parf закрой сам

## Owner decisions — 2026-11-12

- ✅ Q-R3-VIEWADMIN1 In a Viewer, is there a local administrator? <a id="Q-R3-VIEWADMIN1"></a>
  Done as the temp CTO decided (`4ee3733`): a proxied request could switch a Viewer back to Workspace in one request.
  - (x) no — Viewer: sign in with `mdhouse admin` 🌟
  - ( ) yes — local install = admin, Viewer too

- ✅ Q-R3-EXPOSE1 Served on a network address (`--host 0.0.0.0`), no users, no allow list — today every RW project is writable by the network. <a id="Q-R3-EXPOSE1"></a>
  - ( ) A — as is: a non-loopback address was chosen on purpose
  - (x) B — every project RO; the start line says why 🌟
  - ( ) C — refuse to start; name what to configure

- ✅ Q-R3-HOSTNAME1 Does `--host-name` (a proxy on this host) count as an explicit access policy for Q-R3-EXPOSE1? <a id="Q-R3-HOSTNAME1"></a>
  - (x) yes — `md` keeps working as today 🌟
  - ( ) no — same as a network address

- ✅ Q-R3-VIEWPROXY1 A Viewer behind `--host-name`: `mdhouse admin` cannot mint (localhost is refused), so switching back is CLI only (`mdhouse --workspace`). <a id="Q-R3-VIEWPROXY1"></a>
  - (x) keep — CLI only 🌟
  - ( ) allow minting for the loopback name even with host names set

- ✅ Q-R3-SUBSYS1 `Plans/subsystems.md`: new files match no prefix. <a id="Q-R3-SUBSYS1"></a>
  - (x) J "agent bus & RAG ⚠️" (agent-bus, rag-*, rag-sync-cli); authz/admin-session → A; install.md → I 🌟
  - ( ) leave as is

- ✅ Q-R3-REFDOC1 Installed reference (`_mdhouse`, MW.17) — these rewrite your docs: <a id="Q-R3-REFDOC1"></a>
  - [x] fold `skills/markup.md` into `agent-markup.md`, keep a 5-line pointer
  - [x] split `plans.md`: portable Plans convention stays; this repo's commit rules go to CLAUDE.md (your file — you edit it)
  - [ ] one home per glyph table (`glyphs.md`) and per Q&A sample set (`qa-playground.md`); the others link
  - [x] add `mdhouse docs` — prints the reference path
  > 💬 i want to separate MD files we export to users and ones we use for testing; qa-playground is useless for normal end
  >
  > 💬 at the end i need ONE line with URL to be inserted into AGENTS.md file for a project i work with
  > and it should know how to 
  > 1. write plans
  > 2. what glyphs 
  > 3, what markup to use
  >
  >  so mdhouse will understand
  > ^^ thats the END goal

- ✅ Q-R3-AUTO1 MW.11 scheduled AI pipelines (design `Plans/R3/AUTOMATION.md` by #opencode/md-api; bus schedules fire a run in mdhouse). Temp CTO defaults — untick what you disagree with: <a id="Q-R3-AUTO1"></a>
  - [x] v1 = analysis only: no code execution, commit or push
  - [x] only the instance administrator registers a schedule; a Viewer never
  - [x] auto-disable after 3 failures in a row; at most 10 runs a day per schedule
  - [x] schedules live on the instance's `#mdhouse` record
  - [x] QA v1 = review of documents and changes; running the project's tests comes later, approved separately
  - [x] run results land in the project under `Plans/flows/runs/` (visible, committable) — same place as manual runs (MW.3.3)
  - [x] notify on the page, plus optionally one chosen agent

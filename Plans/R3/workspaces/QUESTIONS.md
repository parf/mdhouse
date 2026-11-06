# Open questions — MDHOUSE Workspaces

> **Serg Parf:** Viewer mode  REMOVES all "rw" / interactivity elements
> so rw entries became RO

- <a id="Q-W1"></a>[№Q-W1](DECISIONS.md#Q-W1)
- <a id="Q-W2"></a>[№Q-W2](DECISIONS.md#Q-W2)
- <a id="Q-W3"></a>[№Q-W3](DECISIONS.md#Q-W3)
- <a id="Q-W4"></a>[№Q-W4](DECISIONS.md#Q-W4)
- <a id="Q-W5"></a>[№Q-W5](DECISIONS.md#Q-W5)
- <a id="Q-W6"></a>[№Q-W6](DECISIONS.md#Q-W6)
- <a id="Q-W7"></a>[№Q-W7](DECISIONS.md#Q-W7)
- <a id="Q-W8"></a>[№Q-W8](DECISIONS.md#Q-W8)

- ❓ Q-R3-RAG1 Which typed FileScan handoff completes the R3 source lifecycle? <a id="Q-R3-RAG1"></a>
  RAG 0.3.0 free capabilities are verified; retrieval is no longer blocked on v0.2 discovery.
  Dedicated endpoint [№Q353](http://localhost:7777/ai-agent-bus/Plans/R1.1/QUESTIONS.md#rag-for-mdhouse) and FileScan roots
  [№Q355](http://localhost:7777/ai-agent-bus/Plans/R1.1/QUESTIONS.md#owner-items-from-2026-11-06) are open owner decisions in Agent Bus R1.1 QUESTIONS, verified read-only.
  T-45 typed docs/fixture are delivered: subscriber change messages and status snapshots, but no
  source registry, job API/history or event stream. A4 end-to-end and A7 dedup remain unmet.
  > 💡👾 Use the explicit dedicated endpoint/stored project namespace after provisioning; complete
  > FileScan/recovery fixture acceptance without inventing provider jobs/history, treating pending:0
  > as complete-folder proof or silently substituting polling for required live lifecycle updates.
  > [Current contract](../RAG-CONTRACT.md); [original question/history](resolved.md#Q-R3-RAG1).

- [№Q-R3-HTML1](DECISIONS.md#Q-R3-HTML1) <a id="Q-R3-HTML1"></a>

## Shared marks authorization — 2026-11-05

- ❓ Q-R3-ADMIN1 Who may change the existing shared file marks? <a id="Q-R3-ADMIN1"></a>
  `/api/marks` stores favorite/muted/ignored for the entire root in instance prefs, including RO roots.
  Ignored entries disappear from everyone's default tree; this is not a private browser preference.
  [№MW.0g](TODO.md#MW.0g) must classify this mutation before activating web administration.
  - ( ) Personal owner / Team configured instance administrator 🌟
  - ( ) Project Editor with an explicit grant to that project
  > 💬👾 Verified `src/server.ts` marks route and `src/lib/prefs.ts`: all browsers share the same
  > root-keyed arrays; ignored changes invalidate the shared tree. Recommend treating these existing
  > global marks as instance configuration. A per-user marks store is a separate scope, not inferred.

## Country reauthentication baseline — 2026-11-06

- [№Q-R3-COUNTRY1](DECISIONS.md#Q-R3-COUNTRY1) <a id="Q-R3-COUNTRY1"></a>

## Team identity realm — 2026-11-06

- ❓ Q-R3-REALM1 What does realm identify in the locked user name/realm? <a id="Q-R3-REALM1"></a>
  [№USER-W7](DECISIONS.md#USER-W7) makes established GitHub username and name/realm admin-edit-only.
  Current code has only the Basic challenge realm `mdhouse` and the Agent Bus host-derived realm;
  neither is an authenticated-user field. Is realm an existing external identity component or
  another label? Its meaning and source must be specified before adding a user-schema field; this question does not
  block username/name protection or authenticated-actor-only login/signatures.
  > 💡👾 Keep the established username/name lock; leave realm unmodeled until its meaning is explicit.

## Initial unknown country — 2026-11-06

- ❓ Q-R3-COUNTRY2 What should the first known country do when GitHub login had no GeoIP country? <a id="Q-R3-COUNTRY2"></a>
  [№USER-W6](DECISIONS.md#USER-W6) uses each session's authenticated country; unknown/private/failed
  GeoIP is not a transition. The pure model reports unbound and does not trust that observation.
  - ( ) Require GitHub reauthentication when a verified country first becomes available 🌟
  - ( ) Enroll the first verified country automatically without reauthentication
  > 💡👾 Authenticate the first known country before a protected action and baseline/history trust.
  > While GeoIP is unavailable, do not invent a country-change denial; ordinary identity/access
  > rules still apply. This recommendation is not an approved blanket deny for unknown geography.

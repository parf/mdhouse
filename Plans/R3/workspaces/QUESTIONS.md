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

- ❓ Q-R3-RAG1 Which Agent Bus contract supplies the approved R3 source/job lifecycle? <a id="Q-R3-RAG1"></a>
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

# RAG — requirements and open questions

<!-- AB: #cx/mdhouse-ceo -->

For the owner implementing the Agent Bus RAG agent. mdhouse integration: [№R3f](TODO.md#R3f) / [№MW.2a](workspaces/TODO.md#MW.2a).
Scope: [release](README.md#r3f-rag-through-the-agent-bus-rag-agent),
[implementation](workspaces/TODO.md), [№Q-R3-RAG1](workspaces/QUESTIONS.md#Q-R3-RAG1).
API names below describe capabilities, not agreed method names. Provider answers are recorded below;
RAG 0.3 deployment, typed schemas and acceptance remain unverified.

## Owner direction

> we can make instances of rag; each one have own namespace
>
> #rag/project1
>
> напиши все вопросы и пожелания по RAG в отдельный файл. я сделаю/добавлю нужную функциональность в #rag agent

- Owner implements missing RAG-agent functionality; mdhouse implements project UI and orchestration.
- Use one `#rag/mdhouse` instance; every call requires `namespace = <project>` with strict isolation from RAG 0.3.
- FileScan owns source ingestion, refresh and progress; Agent Bus event-log subscriptions deliver updates.
- RAG owns storage, classification, embeddings, indexes, retrieval execution and source credentials.
- mdhouse enforces project grants independently; RAG access never grants mdhouse filesystem access.

## Verified baseline — 2026-11-05

Local `docs/agents/rag.md` and `src/agents/rag/agent.json` in `/usr/local/src/ai-agent-bus`, v0.2.0:

- Existing: `upsert`, `get`, `list`, BM25 `search`, `keyword_index`, `delete`, `prompts`.
- `upsert` already classifies, chunks and embeds; BM25 search does not perform semantic retrieval.
- No advertised source registry, asynchronous source/job lifecycle, progress or refresh API.
- Namespace/table are labels, not access locks; admitted callers can access all namespaces.
- One source record is limited to 32 KiB / eight chunks; calls have a 120-second total budget.
- Unknown/incomplete outcomes require inspection; repeating upsert may spend again or replace newer data.
- No provider mutations or paid calls were made for this discovery.

## R3 integration requirements

- [ ] RAG-R1 Instance routing and isolation
  Resolve project → endpoint + RAG agent + namespace; reject cross-project access without silent fallback {#RAG-R1}

- [ ] RAG-R2 Source registry
  Add/list/inspect/select/remove allowed sources using stable source IDs and safe display metadata {#RAG-R2}

- [ ] RAG-R3 Ingestion and indexing
  Start ingestion, embedding/indexing and refresh/reindex; return stable job IDs for long operations {#RAG-R3}

- [ ] RAG-R4 Observable jobs
  Expose state, stage, progress, timestamps, failures and recoverable partial results {#RAG-R4}

- [ ] RAG-R5 Freshness
  Expose source revision/content hash, index generation and last successful refresh; distinguish stale/partial/ready {#RAG-R5}

- [ ] RAG-R6 Retrieval
  Query explicitly selected sources; support semantic retrieval and identify effective search mode/version {#RAG-R6}

- [ ] RAG-R7 Evidence
  Return citations/provenance sufficient to preserve inspectable references in Markdown and flow history {#RAG-R7}

- [ ] RAG-R8 Authorization
  Check provider grants separately from mdhouse grants; distinguish read/query from source/index mutations {#RAG-R8}

- [ ] RAG-R9 Recovery
  Define replay/idempotency, timeout/unknown/incomplete outcomes and safe retry without duplicate work/spend {#RAG-R9}

- [ ] RAG-R10 Live updates
  Deliver job/source changes without browser/server polling; support reconnect and state reconciliation {#RAG-R10}

- [ ] RAG-R11 Secrets and paths
  Keep credentials server-side; no source connector, path or URL may bypass its own explicit grant {#RAG-R11}

- [ ] RAG-R12 Common request contract
  Manual requests, retrieval tests and scheduled flows use the same source selection and evidence contract {#RAG-R12}

## Questions for the provider

- ❓ RAG-Q1 How is each instance bound to its namespace and caller grants?
  Can `#rag/project1` pin its namespace and reject a supplied different namespace on every method?
  Is isolation enforced by a dedicated collection, restricted backend credentials, agent policy, or a combination?
  Can the same mdhouse identity use several instances without gaining cross-project access?
  > 💡👾 Pin the namespace in instance configuration; keep collection/credential choices provider-owned.
  >
  > 💬👾 (#ab-ceo, for the owner) One instance, `#rag/mdhouse`, and mdhouse passes `namespace = <project>` on every call. From RAG 0.3 the namespace is required on every method, with no cross-namespace default; search, list, get and delete touch only that namespace, and an id from another namespace answers not_found. `#rag/mdhouse` admits only mdhouse's bus identity, so the namespace is a label only mdhouse sets and mdhouse keeps enforcing project grants itself. A separate `#rag/<project>` instance stays possible for an untrusted caller later.

- ❓ RAG-Q2 What is the instance setup and capability-discovery contract?
  Who creates/configures an instance and its storage/grants? What exact address does mdhouse persist?
  How does mdhouse discover API version, supported methods/search modes, limits and readiness without a paid call?
  > 💡👾 Explicit owner provisioning; a read-only versioned capabilities response; unsupported features fail visibly.
  >
  > 💬👾 The owner provisions `#rag/mdhouse` (records, Allow, Qdrant collection, keys); mdhouse persists that bus name. RAG 0.3 adds a free `capabilities` call: RAG app version, methods, search modes, limits and embedding model; no paid call. An unsupported method is refused by name.

- ❓ RAG-Q3 Which source kinds and ingestion inputs should R3 support?
  Text/upload, jailed project files/directories, Git revisions, URLs or connected services: which are available first?
  Who enumerates files, handles ignores/symlinks, chunks large documents and attaches source revisions?
  How are size/file-count/type limits, URL redirects and credential references validated?
  > 💡👾 Start with explicitly selected project Markdown/text; remote connectors need separate explicit grants.
  > Keep source fetching/credentials provider-owned where supported; mdhouse exports only authorized jailed content.
  >
  > 💬👾 Not in `#rag`: sources and ingestion come from FileScan (`#filescan/<name>`, in build now). It watches one project folder (poll plus inotify), sends RAG upserts and deletes for new, changed, renamed and removed files, feeds the existing files on first setup, follows symlink and size rules, and sends files over RAG's inline limit by bigfile or as size plus hash. mdhouse points one FileScan instance at each project folder with `namespace = <project>`.

- ❓ RAG-Q4 What is the source registry and lifecycle schema?
  Define create/list/get/update/remove, stable identity, duplicate registration, pagination and source validation.
  Does removal detach a project selection, delete indexed data, or delete the source itself?
  What happens to in-flight jobs and retained citations after removal or a source move?
  > 💡👾 Separate detach from destructive deletion; report unavailable historical evidence without rewriting it.
  >
  > 💬👾 A source is a FileScan instance plus its subscription to `#rag/mdhouse`. Detaching is removing the subscription (indexed data stays); deleting data is RAG 0.3's explicit "drop namespace" call, or FileScan's delete events per file. Citations keep their record id and content hash; a removed record answers not_found, so mdhouse can show "source removed" without rewriting history.

- ❓ RAG-Q5 What are the asynchronous job and progress contracts?
  Define start/inspect/list and states for ingestion/index/refresh/reindex, stage/counts, timestamps and error details.
  Which operations remain synchronous? How do job IDs survive the current 120-second request deadline or a restart?
  Can mdhouse cancel a job, and what data/cost remains after cancellation?
  >
  > 💬👾 No RAG job system: an upsert stays one synchronous call per record. Long work (a folder's first feed, refresh) is FileScan's, which reports progress in its `status` (pending, sent, confirmed, failed per subscriber) and survives restarts with its state file. Cancel = stop or pause that FileScan instance; records already upserted stay.

- ❓ RAG-Q6 How are long-running source/job changes delivered without polling?
  Are there Agent Bus subscriptions/events or a single deferred completion/progress route?
  Define event identity/order, terminal delivery, missed-event reconciliation and retention after restart.
  > 💡👾 Subscribe plus an authoritative snapshot/cursor on reconnect; publish revisions so duplicates are harmless.
  >
  > 💬👾 Through Agent Bus: FileScan and RAG write notices, warnings and alerts to their own agent event logs, and mdhouse subscribes to those logs (`#bus` `sub add`); alerts survive a daemon restart. On reconnect mdhouse reads FileScan `status` as the authoritative snapshot; events carry ids, so a duplicate is harmless.

- ❓ RAG-Q7 How do refresh, reindex and freshness interact?
  Who detects changed/deleted source documents? Are refreshes explicit, scheduled, event-driven, or combined?
  Can a query select a consistent index generation while another is building? What happens after partial failure?
  How are model/chunking changes and old index cleanup handled without mixing incompatible generations?
  > 💡👾 Preserve the last complete readable generation until replacement succeeds; expose stale/partial state.
  >
  > 💬👾 Change detection is FileScan's (content hash per file, deletes guarded against an unmounted or emptied folder). Refresh is continuous, not a separate job. Index generations (build new, then swap) are not planned now; a model or chunking change is a re-feed into a new namespace, then mdhouse switches to it and drops the old one.

- ❓ RAG-Q8 What is the semantic/keyword/hybrid retrieval request and response?
  Define source filters, query, result/token limits, scores/order, pagination, no-result and missing-source behavior.
  Can queries require a generation or minimum freshness? Does retrieval return evidence or also generate an answer?
  Are reranking and hybrid search supported, optional, or unavailable?
  > 💡👾 Return evidence separately from answer generation; never silently substitute another source or search mode.
  >
  > 💬👾 RAG 0.3 adds semantic and hybrid search (dense vectors plus the existing BM25, fused); the request names namespace, query, mode and limit, and the answer names the effective mode. Evidence only: answer generation is a separate call to `#ai`. Reranking is not planned yet.

- ❓ RAG-Q9 What citation and provenance fields will retrieval return?
  Need instance/source/record/chunk IDs, source URI or jailed project-relative path, revision/hash, excerpt,
  location (lines/page/section when available), index generation and indexed/retrieved timestamps.
  Which IDs remain resolvable after refresh/delete, and how can a user inspect the exact cited revision?
  > 💡👾 Return stable citation objects; mdhouse renders safe links and records effective sources/version in Markdown.
  >
  > 💬👾 RAG 0.3 results carry namespace, record id, chunk index, the source path FileScan sent, content hash, excerpt, scores and indexed time. A record id stays resolvable until its file is deleted or the namespace is dropped.

- ❓ RAG-Q10 How are permission changes and revocation enforced?
  Which caller may query, list sources, ingest, reindex, cancel, delete or administer the instance?
  If mdhouse calls as a service identity, how are project/user denials and active-session revocation handled?
  Does an in-flight job stop publishing results when access is revoked, and can events leak source metadata?
  > 💡👾 mdhouse checks the current user/project grant on requests, delivery and reconnect; provider checks its grants.
  > Instance IDs, namespace names, source IDs and job IDs are identifiers, never credentials.
  >
  > 💬👾 The bus checks who may call `#rag/mdhouse` (its Allow: mdhouse only) and RAG's roles separate read from mutating methods. mdhouse checks its own user and project grants on every request and delivery. Bus names, namespaces and record ids are identifiers, never credentials.

- ❓ RAG-Q11 What makes mutations safe to replay or resume?
  Define request-id scope/lifetime, same-ID/different-body rejection, deduplication and concurrency/conflict behavior.
  How does the caller resolve an unknown result without blindly repeating a paid upsert or destructive operation?
  Which incomplete operations have a continuation token, and which require explicit user confirmation to retry?
  > 💡👾 Persist operation outcomes; expose inspection/resume before retry and never claim unchanged state after uncertainty.
  >
  > 💬👾 Today an upsert is a replace by record id, so a repeat after an unknown outcome overwrites with the same content (it may re-embed, a small cost); FileScan resends until RAG confirms and never sends twice once confirmed. A request id with a stored outcome is the next step after 0.3, not in it.

- ❓ RAG-Q12 What are the errors, limits and usage contracts?
  Define denied/missing/unsupported/stale/busy/rate-limited/provider-unavailable errors and retry guidance.
  Expose document/batch/storage/concurrency/deadline limits and estimated/actual provider usage where available.
  Can mdhouse preview paid or destructive work before confirmation without invoking a paid provider?
  > 💡👾 Keep expensive and destructive operations explicit; no automatic retries after ambiguous outcomes.
  >
  > 💬👾 Refusals are named (not_found, forbidden, busy, limit, provider refused); limits are in `capabilities`. Cost: an embedding per upserted chunk and one per semantic or hybrid query; keyword search is free. Destructive calls (drop namespace) are explicit and never retried automatically.

## Requested handoff and acceptance

- [ ] RAG-A1 Versioned typed schemas and examples for every supported capability, including errors and limits. {#RAG-A1}
- [ ] RAG-A2 Instance provisioning/grant runbook and a safe fixture; no secrets in docs or example responses. {#RAG-A2}
- [ ] RAG-A3 Shared instance: mdhouse denies cross-project selection; RAG confines every method and record ID to the supplied namespace. {#RAG-A3}
- [ ] RAG-A4 Add source → ingest/index → progress/completion → inspect freshness → retrieve cited result. {#RAG-A4}
- [ ] RAG-A5 Change source → refresh/reindex → retrieve the intended generation; test deletion and stale citations. {#RAG-A5}
- [ ] RAG-A6 Exercise unavailable/denied source, revoked access, cancellation, crash/reconnect and partial provider failure. {#RAG-A6}
- [ ] RAG-A7 Replay one request ID without duplicate work; resolve unknown outcome before any repeat paid call. {#RAG-A7}
- [ ] RAG-A8 Manual request and scheduled-flow fixtures preserve the same source IDs, versions and provenance. {#RAG-A8}
- [ ] RAG-A9 Document supported retrieval modes; missing required capability leaves [№MW.2a](workspaces/TODO.md#MW.2a)/[№R3f](TODO.md#R3f) acceptance open. {#RAG-A9}

Nice to have, subject to provider support: cost preview/usage, cancellation, hybrid search/reranking,
generation retention controls and richer file/URL/service connectors. These are questions and wishes,
not additional R3 release gates beyond the approved lifecycle, retrieval, isolation and evidence contract.

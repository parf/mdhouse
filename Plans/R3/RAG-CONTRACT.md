# RAG — requirements and open questions

For the owner implementing the Agent Bus RAG agent. mdhouse integration: R3f / MW.2a.
Scope: [release](README.md#r3f-rag-through-the-agent-bus-rag-agent),
[implementation](workspaces/TODO.md), [original question](workspaces/QUESTIONS.md#Q-R3-RAG1).
API names below describe capabilities, not agreed method names. Questions remain open until answered.

## Owner direction

> we can make instances of rag; each one have own namespace
>
> #rag/project1
>
> напиши все вопросы и пожелания по RAG в отдельный файл. я сделаю/добавлю нужную функциональность в #rag agent

- Owner implements missing RAG-agent functionality; mdhouse implements project UI and orchestration.
- Use a project-specific RAG instance, for example `#rag/project1`, with its own namespace.
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

| ID | Capability | Required result |
| --- | --- | --- |
| RAG-R1 | Instance routing and isolation | Resolve project → endpoint + RAG agent + namespace; reject cross-project access without silent fallback |
| RAG-R2 | Source registry | Add/list/inspect/select/remove allowed sources using stable source IDs and safe display metadata |
| RAG-R3 | Ingestion and indexing | Start ingestion, embedding/indexing and refresh/reindex; return stable job IDs for long operations |
| RAG-R4 | Observable jobs | Expose state, stage, progress, timestamps, failures and recoverable partial results |
| RAG-R5 | Freshness | Expose source revision/content hash, index generation and last successful refresh; distinguish stale/partial/ready |
| RAG-R6 | Retrieval | Query explicitly selected sources; support semantic retrieval and identify effective search mode/version |
| RAG-R7 | Evidence | Return citations/provenance sufficient to preserve inspectable references in Markdown and flow history |
| RAG-R8 | Authorization | Check provider grants separately from mdhouse grants; distinguish read/query from source/index mutations |
| RAG-R9 | Recovery | Define replay/idempotency, timeout/unknown/incomplete outcomes and safe retry without duplicate work/spend |
| RAG-R10 | Live updates | Deliver job/source changes without browser/server polling; support reconnect and state reconciliation |
| RAG-R11 | Secrets and paths | Keep credentials server-side; no source connector, path or URL may bypass its own explicit grant |
| RAG-R12 | Common request contract | Manual requests, retrieval tests and scheduled flows use the same source selection and evidence contract |

## Questions for the provider

- ❓ RAG-Q1 How is each instance bound to its namespace and caller grants?
  Can `#rag/project1` pin its namespace and reject a supplied different namespace on every method?
  Is isolation enforced by a dedicated collection, restricted backend credentials, agent policy, or a combination?
  Can the same mdhouse identity use several instances without gaining cross-project access?
  > 💡👾 Pin the namespace in instance configuration; keep collection/credential choices provider-owned.

- ❓ RAG-Q2 What is the instance setup and capability-discovery contract?
  Who creates/configures an instance and its storage/grants? What exact address does mdhouse persist?
  How does mdhouse discover API version, supported methods/search modes, limits and readiness without a paid call?
  > 💡👾 Explicit owner provisioning; a read-only versioned capabilities response; unsupported features fail visibly.

- ❓ RAG-Q3 Which source kinds and ingestion inputs should R3 support?
  Text/upload, jailed project files/directories, Git revisions, URLs or connected services: which are available first?
  Who enumerates files, handles ignores/symlinks, chunks large documents and attaches source revisions?
  How are size/file-count/type limits, URL redirects and credential references validated?
  > 💡👾 Start with explicitly selected project Markdown/text; remote connectors need separate explicit grants.
  > Keep source fetching/credentials provider-owned where supported; mdhouse exports only authorized jailed content.

- ❓ RAG-Q4 What is the source registry and lifecycle schema?
  Define create/list/get/update/remove, stable identity, duplicate registration, pagination and source validation.
  Does removal detach a project selection, delete indexed data, or delete the source itself?
  What happens to in-flight jobs and retained citations after removal or a source move?
  > 💡👾 Separate detach from destructive deletion; report unavailable historical evidence without rewriting it.

- ❓ RAG-Q5 What are the asynchronous job and progress contracts?
  Define start/inspect/list and states for ingestion/index/refresh/reindex, stage/counts, timestamps and error details.
  Which operations remain synchronous? How do job IDs survive the current 120-second request deadline or a restart?
  Can mdhouse cancel a job, and what data/cost remains after cancellation?

- ❓ RAG-Q6 How are long-running source/job changes delivered without polling?
  Are there Agent Bus subscriptions/events or a single deferred completion/progress route?
  Define event identity/order, terminal delivery, missed-event reconciliation and retention after restart.
  > 💡👾 Subscribe plus an authoritative snapshot/cursor on reconnect; publish revisions so duplicates are harmless.

- ❓ RAG-Q7 How do refresh, reindex and freshness interact?
  Who detects changed/deleted source documents? Are refreshes explicit, scheduled, event-driven, or combined?
  Can a query select a consistent index generation while another is building? What happens after partial failure?
  How are model/chunking changes and old index cleanup handled without mixing incompatible generations?
  > 💡👾 Preserve the last complete readable generation until replacement succeeds; expose stale/partial state.

- ❓ RAG-Q8 What is the semantic/keyword/hybrid retrieval request and response?
  Define source filters, query, result/token limits, scores/order, pagination, no-result and missing-source behavior.
  Can queries require a generation or minimum freshness? Does retrieval return evidence or also generate an answer?
  Are reranking and hybrid search supported, optional, or unavailable?
  > 💡👾 Return evidence separately from answer generation; never silently substitute another source or search mode.

- ❓ RAG-Q9 What citation and provenance fields will retrieval return?
  Need instance/source/record/chunk IDs, source URI or jailed project-relative path, revision/hash, excerpt,
  location (lines/page/section when available), index generation and indexed/retrieved timestamps.
  Which IDs remain resolvable after refresh/delete, and how can a user inspect the exact cited revision?
  > 💡👾 Return stable citation objects; mdhouse renders safe links and records effective sources/version in Markdown.

- ❓ RAG-Q10 How are permission changes and revocation enforced?
  Which caller may query, list sources, ingest, reindex, cancel, delete or administer the instance?
  If mdhouse calls as a service identity, how are project/user denials and active-session revocation handled?
  Does an in-flight job stop publishing results when access is revoked, and can events leak source metadata?
  > 💡👾 mdhouse checks the current user/project grant on requests, delivery and reconnect; provider checks its grants.
  > Instance IDs, namespace names, source IDs and job IDs are identifiers, never credentials.

- ❓ RAG-Q11 What makes mutations safe to replay or resume?
  Define request-id scope/lifetime, same-ID/different-body rejection, deduplication and concurrency/conflict behavior.
  How does the caller resolve an unknown result without blindly repeating a paid upsert or destructive operation?
  Which incomplete operations have a continuation token, and which require explicit user confirmation to retry?
  > 💡👾 Persist operation outcomes; expose inspection/resume before retry and never claim unchanged state after uncertainty.

- ❓ RAG-Q12 What are the errors, limits and usage contracts?
  Define denied/missing/unsupported/stale/busy/rate-limited/provider-unavailable errors and retry guidance.
  Expose document/batch/storage/concurrency/deadline limits and estimated/actual provider usage where available.
  Can mdhouse preview paid or destructive work before confirmation without invoking a paid provider?
  > 💡👾 Keep expensive and destructive operations explicit; no automatic retries after ambiguous outcomes.

## Requested handoff and acceptance

- [ ] Versioned typed schemas and examples for every supported capability, including errors and limits.
- [ ] Instance provisioning/grant runbook and a safe fixture; no secrets in docs or example responses.
- [ ] Two instances: project1 callers cannot reach project2 data by changing namespace/source/job IDs.
- [ ] Add source → ingest/index → progress/completion → inspect freshness → retrieve cited result.
- [ ] Change source → refresh/reindex → retrieve the intended generation; test deletion and stale citations.
- [ ] Exercise unavailable/denied source, revoked access, cancellation, crash/reconnect and partial provider failure.
- [ ] Replay one request ID without duplicate work; resolve unknown outcome before any repeat paid call.
- [ ] Manual request and scheduled-flow fixtures preserve the same source IDs, versions and provenance.
- [ ] Document supported retrieval modes; missing required capability leaves MW.2a/R3f acceptance open.

Nice to have, subject to provider support: cost preview/usage, cancellation, hybrid search/reranking,
generation retention controls and richer file/URL/service connectors. These are questions and wishes,
not additional R3 release gates beyond the approved lifecycle, retrieval, isolation and evidence contract.

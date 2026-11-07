# RAG research — Docs and shared Code+Docs

Research date: 2026-11-07. Design proposal, not implementation or provider authorization.
Owner scope: [№RAG-W2](workspaces/DECISIONS.md#RAG-W2). RAG implementation remains deferred.

## What existing systems do

| Primary source | Observed practice | Implication for mdhouse |
| --- | --- | --- |
| [GitHub Copilot repository indexing](https://docs.github.com/en/copilot/concepts/prompting-and-context/repository-indexing) | Semantic repository indexing supports natural-language code questions and is refreshed as repositories change. | Repository knowledge is a retrieval corpus; it need not become a custom IDE engine. |
| [Anthropic contextual retrieval](https://www.anthropic.com/research/contextual-retrieval) | Combines lexical BM25 and embeddings; chunk context and reranking improved retrieval in its experiments. | Preserve exact names/error codes alongside semantic discovery. Measure on our questions; published gains are not mdhouse results. |
| [Qdrant hybrid queries](https://qdrant.tech/documentation/search/hybrid-queries/) | Supports multiple retrieval stages and reciprocal rank fusion. | Reuse retrieval primitives rather than build a search engine. |
| [Qdrant multitenancy example](https://qdrant.tech/documentation/examples/multitenancy/) | Queries restrict retrieval with tenant payload filters. | Shared storage does not mean shared authorization; server-supplied filters must constrain every retrieval stage. |
| [LlamaIndex ingestion pipeline](https://developers.llamaindex.ai/python/framework/module_guides/loading/ingestion_pipeline/) | Document management tracks document IDs and hashes, skips unchanged documents and reprocesses changed ones. | Stable source identity and incremental ingestion precede scheduling or expensive enrichment. |
| [Sourcegraph precise navigation](https://sourcegraph.com/docs/code-navigation/precise-code-navigation) | Precise definitions/references use language-specific SCIP indexes; search-based navigation is a fallback. | Symbol graphs are an optional later capability, not a prerequisite for the shared Code+Docs knowledge index. |
| [Sourcegraph architecture](https://sourcegraph.com/docs/admin/architecture) | Indexing every branch is generally impractical; precise indexes are tied to code revisions. | Start with selected/default revisions, retain commit identity, and add branch coverage only for a demonstrated need. |

## Recommended two-index model

Both indexes answer questions by retrieving evidence and producing cited answers. Their audiences and
corpora differ. They may share ingestion/retrieval software and infrastructure; they must not share
an implicit corpus, permissions, ingestion manifest or search fallback.

| | End-user Docs | Shared developer/AI Code+Docs |
| --- | --- | --- |
| Purpose | Find policies, instructions, decisions and business/project knowledge; summarize with sources. | Explain implementation and architecture, locate examples/contracts/tests, supply context for review, QA and changes. |
| Inputs | Explicitly selected documents. Begin with Markdown; add PDF/Office extraction only when needed. | Selected repositories: source, tests, READMEs, technical docs and relevant configuration. |
| Units | Heading/section-aware chunks; retain document title and heading path. Preserve meaningful lists/tables. | Functions/classes where practical; section-aware technical docs; bounded fallback chunks for unsupported formats. |
| Source identity | Corpus, document ID, source path/URI, content hash, section and revision. | Corpus, repository ID, commit, path, content hash, language, symbol if available, line range. |
| Answer evidence | Open the cited document/section. | Open code lines or a technical document at the indexed revision; distinguish current workspace content from indexed content. |
| Common questions | “What is the approved policy?” “Which decision changed this?” | “Where is this handled?” “What contract/tests constrain this change?” “How do these repositories integrate?” |

Suggested initial deployment: two separately addressable collections/namespaces and authorization
entry points. This is an architectural recommendation, not a claim that two servers or two embedding
models are necessary. Shared Code+Docs may cover multiple repositories; sharing never bypasses
repository access restrictions. Users select the corpus explicitly; never silently fall back between them.

## Retrieval and evidence

1. Resolve caller, selected corpus and allowed sources on the server. Apply those restrictions before
   candidates reach reranking, generation, logs or caches; revalidate source access when opening citations.
2. Retrieve lexical and semantic candidates, fuse and deduplicate. Exact identifier/path search remains
   available. Start with a simple baseline; add reranking only if measured quality justifies latency/cost.
3. Expand selected chunks with bounded parent/neighbor context. Keep context tied to the same source
   version. Do not let large files or duplicated docs dominate the evidence budget.
4. Return source IDs, revision/hash, section/lines and excerpts alongside answers. If evidence is absent,
   conflicting or stale, say so; a similarity score is not factual confidence.
5. Treat retrieved content as evidence, not instructions or action authority. Review/QA pipelines may
   consume it, but merge, deploy and external sends retain their separate approval boundaries.

## Ingestion and freshness

Maintain a manifest of source ID, content hash, extraction/chunking version, embedding version and
last confirmed indexed revision. Upsert changed content, skip unchanged content, and remove obsolete
chunks after deletes/renames. Use deterministic chunk IDs within a source version and idempotent jobs.
Do not publish a partially indexed revision as complete; preserve the last complete generation and
show incomplete/failed status. ACL removal must deny retrieval even before index cleanup finishes.

Exclude credentials, .git internals, build outputs and dependency/vendor trees by default; use explicit
source inclusion rules. Selected documentation inside otherwise ignored directories needs deliberate
configuration. Secret exclusions and repository grants are independent controls.

Initially index approved committed/default-branch snapshots. For uncommitted development context,
read current files directly or use an explicit ephemeral workspace overlay; never label them as indexed
HEAD. Answer freshness should state what revision was actually retrieved.

Manual/on-demand ingestion comes first. Later Agent Bus Cron/At may trigger the same bounded jobs,
with per-corpus concurrency control, run IDs and safe retry semantics. No scheduling is authorized by
this report; it does not replace the existing finite-sync/provider contract.

## Validation before implementation choice

- Build a small labelled query set for each corpus: exact terms, paraphrases, cross-file answers,
  no-answer cases, conflicting revisions, multilingual docs and inaccessible sources.
- Compare lexical-only, vector-only, hybrid and optional reranked retrieval on the same snapshot.
  Measure retrieval recall/ranking, citation correctness, answer support, latency and ingestion cost.
- Require zero unauthorized-source exposure in tested retrieval/citation/cache/error paths; test revoked
  access, deletes, branch changes and incomplete ingestion explicitly.
- For Code+Docs, measure useful context for real review/QA tasks against direct search/file reading.
  Embedding model, chunk limits and top-K are experimental parameters, not universal best practices.

Next design step: inspect the delivered RAG/FileScan APIs against these needs; produce a capability-gap
matrix and one minimal pilot per corpus. Do not select providers, provision indexes or ingest data merely
because this research exists. Avoid a framework rewrite: reuse the existing RAG service where its actual
capabilities meet the contract; use LlamaIndex/Sourcegraph as patterns, not mandatory dependencies.

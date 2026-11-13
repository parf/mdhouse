import { useEffect, useRef, useState } from 'preact/hooks';
import { api, type RagSearch, type RagStatus, type RootInfo } from './api';
import { Ago } from './Ago';
import { follow } from './PageHead';
import { Info } from './Settings';
import { SearchScope } from './SearchScope';
import { breadcrumb, highlight, lineLabel, parseRagUrl, progress, ragUrl, resultGlyph, stateOf, syncCommand } from './rag-model';

interface Props {
  /** The page's query string: `?q=…&root=…`. */
  search: string;
  /** The project the sidebar shows; the page follows it unless the address names another. */
  rootId: string;
  roots: RootInfo[];
  go: (url: string) => void;
  gear: preact.ComponentChildren;
  /** The scope switch's other side: back to the files search, carrying the query. */
  onFiles: (query: string) => void;
}

/** A command to copy: the text as `<code>`, selectable, with a button for the clipboard. */
function CopyCode({ text }: { text: string }) {
  const [note, setNote] = useState('');
  const copy = () => {
    try {
      void navigator.clipboard?.writeText(text).then(
        () => setNote('Copied'),
        () => setNote('Select the command and copy it'),
      );
    } catch {
      setNote('Select the command and copy it');
    }
  };
  return (
    <div class="rag-cmd">
      <pre>
        <code>{text}</code>
      </pre>
      <button type="button" class="rag-act" onClick={copy}>
        Copy
      </button>
      {note && (
        <span class="settings-hint" role="status">
          {note}
        </span>
      )}
    </div>
  );
}

/** How to turn RAG on, for the case at hand: Agent Bus off, or no source registered for this folder. */
function Enable({ state, status, go, onCheck }: { state: 'off' | 'unindexed'; status: RagStatus; go: (url: string) => void; onCheck: () => void }) {
  return (
    <section class="rag-enable">
      {state === 'off' ? (
        <>
          <h2>RAG is off — the Agent Bus is not on</h2>
          <ol>
            <li>
              Start mdhouse with the Agent Bus:
              <CopyCode text="mdhouse --agent-bus" />A running mdhouse picks it up; no restart.
            </li>
            <li>
              Come back here and check again.
              <div>
                <button type="button" class="rag-act" onClick={onCheck}>
                  Check again
                </button>
              </div>
            </li>
          </ol>
        </>
      ) : (
        <>
          <h2>Not indexed — this project has no RAG source yet</h2>
          <ol>
            <li>
              The Agent Bus owner provisions two agents for this folder: a <b>FileScan</b> (lists its Markdown files) and a <b>RAG</b> (indexes
              them and answers searches).{' '}
              {status.guide && (
                <a href={status.guide} onClick={(e) => follow(e, () => go(status.guide!))}>
                  Full guide
                </a>
              )}
            </li>
            <li>
              Run the first sync — it sends this project's Markdown to the RAG (a paid call) and registers the project as the source. Replace the{' '}
              <code>&lt;placeholders&gt;</code>:
              <CopyCode text={syncCommand(status.path ?? '<folder>')} />
              <span class="settings-hint">
                One folder per namespace/table. The command runs only when you start it; mdhouse never syncs by itself.{' '}
                <Info label="About the sync">
                  <code>--until-done</code> repeats the sync until every file is confirmed, waiting while the provider is down; it stops by itself
                  after three rounds at its longest wait with nothing new.
                </Info>
              </span>
            </li>
            <li>
              Come back here and check again.
              <div>
                <button type="button" class="rag-act" onClick={onCheck}>
                  Check again
                </button>
              </div>
            </li>
          </ol>
        </>
      )}
    </section>
  );
}

/** `RAG search`: the project's index status, a keyword search of it, and — until it is set up — how to set it up. */
export function RagPage({ search, rootId, roots, go, gear, onFiles }: Props) {
  const url = parseRagUrl(search);
  const projects = roots.filter((r) => r.kind !== 'reference');
  const root = projects.find((r) => r.id === url.root) ?? projects.find((r) => r.id === rootId) ?? projects[0];
  const id = root?.id ?? '';

  // Picking another project in the sidebar moves the page to it.
  const sidebarRoot = useRef(rootId);
  useEffect(() => {
    if (sidebarRoot.current === rootId) return;
    sidebarRoot.current = rootId;
    go(ragUrl({ q: url.q, root: rootId }));
  }, [rootId]);

  const [status, setStatus] = useState<RagStatus | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const statusSeq = useRef(0);
  const [again, setAgain] = useState(0);
  useEffect(() => {
    if (!id) return;
    const seq = ++statusSeq.current;
    setStatus(null);
    setFailed(null);
    api.rag(id).then(
      (s) => seq === statusSeq.current && setStatus(s),
      (err: Error) => seq === statusSeq.current && setFailed(err.message),
    );
  }, [id, again]);
  const state = stateOf(status, failed);

  const [draft, setDraft] = useState(url.q);
  useEffect(() => setDraft(url.q), [url.q]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state === 'indexed') input.current?.focus();
  }, [state]);

  const [found, setFound] = useState<{ q: string; data: RagSearch } | null>(null);
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);
  const searchSeq = useRef(0);
  // The address is the query: a submit, Back and a shared link all land here.
  useEffect(() => {
    if (state !== 'indexed' || !url.q) {
      searchSeq.current++;
      setFound(null);
      setSearchError('');
      setSearching(false);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    setSearchError('');
    api.ragSearch(id, url.q).then(
      (data) => {
        if (seq !== searchSeq.current) return;
        setFound({ q: url.q, data });
        setSearching(false);
      },
      (err: Error) => {
        if (seq !== searchSeq.current) return;
        setFound(null);
        setSearchError(err.message);
        setSearching(false);
      },
    );
  }, [state, id, url.q]);

  const submit = (e: Event) => {
    e.preventDefault();
    const q = draft.trim();
    if (!q || searching) return;
    go(ragUrl({ q, root: id }));
  };
  const last = status?.last;

  return (
    <div class="settings rag">
      <header class="home-head">
        <h1>Search</h1>
        <span class="head-gear">{gear}</span>
      </header>
      <SearchScope value="index" onPick={(t) => t === 'files' && onFiles(draft)} />

      {!root ? (
        <p class="settings-hint">No project is served.</p>
      ) : (
        <p class="settings-hint rag-scope" aria-live="polite">
          {state === 'loading' && <>Checking the index of {root.name}…</>}
          {state === 'error' && (
            <>
              <span class="settings-error">{failed ?? status?.error}</span>{' '}
              <button type="button" class="rag-act" onClick={() => setAgain((n) => n + 1)}>
                Check again
              </button>
            </>
          )}
          {state === 'off' && <>Agent Bus is off — RAG search is not available for {root.name}.</>}
          {state === 'unindexed' && <>{root.name} is not indexed.</>}
          {state === 'indexed' && status?.source && (
            <>
              {last ? resultGlyph(last.result) : '❓'} <b>{root.name}</b> · index <code>{status.source.sid}</code> ·{' '}
              {last ? (
                <>
                  last sync <Ago at={Date.parse(last.endedAt)} flame={false} /> · {last.result} {progress(last)}
                </>
              ) : (
                'never synced'
              )}{' '}
              <Info label="About the index">
                The index is filled by <code>mdhouse-rag-sync</code>, which runs only when you start it. A hit marked stale was indexed from an
                earlier version of its file.
              </Info>
            </>
          )}
        </p>
      )}

      {(state === 'off' || state === 'unindexed') && status && <Enable state={state} status={status} go={go} onCheck={() => setAgain((n) => n + 1)} />}

      {state === 'indexed' && (
        <>
          <form class="rag-form" role="search" onSubmit={submit}>
            <input
              ref={input}
              class="settings-scheme rag-q"
              type="search"
              value={draft}
              maxLength={1024}
              placeholder="Search the index"
              aria-label="Search the RAG index"
              autocomplete="off"
              spellcheck={false}
              onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
            />
            <button type="submit" class="rag-act" disabled={searching || !draft.trim()}>
              Search
            </button>
            <span class="settings-hint">keyword · free</span>
          </form>

          {searching && (
            <p class="settings-hint" role="status">
              Searching…
            </p>
          )}
          {searchError && (
            <p class="settings-error" role="alert">
              {searchError}{' '}
              <button type="button" class="rag-act" onClick={() => setAgain((n) => n + 1)}>
                Check again
              </button>
            </p>
          )}
          {found && !searching && (
            <>
              <p class="settings-hint" role="status">
                {found.data.count === 0 ? 'No matches' : `${found.data.count} result${found.data.count === 1 ? '' : 's'}`} · {found.data.took} ms
              </p>
              {found.data.count === 0 ? (
                <p class="settings-hint">Keyword search matches words in the indexed text — try fewer or different words.</p>
              ) : (
                <ol class="rag-hits">
                  {found.data.hits.map((hit) => (
                    <li class="rag-hit" key={hit.url + hit.source}>
                      <div class="rag-hit-head">
                        <a class="rag-src" href={hit.url} onClick={(e) => follow(e, () => go(hit.url))}>
                          {hit.source}
                        </a>
                        {lineLabel(hit.lines) && <span class="rag-tag">{lineLabel(hit.lines)}</span>}
                        {hit.stale && (
                          <span class="rag-tag stale" title="The file changed since it was indexed — run the sync again">
                            stale
                          </span>
                        )}
                      </div>
                      {breadcrumb(hit.heading_path) && <div class="rag-crumb">{breadcrumb(hit.heading_path)}</div>}
                      <pre class="rag-excerpt">
                        {highlight(hit.excerpt, found.q).map((run, i) => (run.hit ? <mark key={i}>{run.text}</mark> : run.text))}
                        {hit.truncated && ' …'}
                      </pre>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'preact/hooks';
import { flowApi, FlowApiError } from './flow-api';
import {
  defaultRange, flowReasonText, noBaselineText, rangeOf, startable,
  type FlowCatalogEntry, type FlowPreview, type FlowRangeKind,
} from './flow-model';
import { safeHtml } from './safe-html';
import { useViewer } from './viewer';

const api = flowApi();

interface Props {
  rootId: string;
  go: (url: string) => void;
}

/** "Run flow" on a project's home: pick a package and a range, read the preview, confirm. A Viewer gets no button. */
export function RunFlow({ rootId, go }: Props) {
  const viewer = useViewer();
  const [open, setOpen] = useState(false);
  if (viewer) return null;
  return (
    <>
      <button type="button" class="flow-btn" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} title="Run a flow on this project">
        Run flow
      </button>
      {open && <FlowDialog rootId={rootId} go={go} onClose={() => setOpen(false)} />}
    </>
  );
}

function FlowDialog({ rootId, go, onClose }: Props & { onClose: () => void }) {
  const [packages, setPackages] = useState<FlowCatalogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState('');
  const [kind, setKind] = useState<FlowRangeKind>('baseline');
  const [commit, setCommit] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [preview, setPreview] = useState<FlowPreview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .catalog(rootId)
      .then((c) => {
        if (!live) return;
        setPackages(c.packages);
        const first = c.packages.find(startable) ?? c.packages[0];
        if (first) {
          setPick(first.id);
          setKind(defaultRange(first));
        }
      })
      .catch((e: FlowApiError) => live && setError(flowReasonText(e.reason, e.message)));
    return () => {
      live = false;
    };
  }, [rootId]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [onClose]);

  const current = useMemo(() => packages?.find((p) => p.id === pick) ?? null, [packages, pick]);
  const choose = (id: string) => {
    setPick(id);
    setPreview(null);
    setError(null);
    setNote(null);
    const p = packages?.find((x) => x.id === id);
    if (p) setKind(defaultRange(p));
  };

  const doPreview = async () => {
    if (!current || busy) return;
    const r = rangeOf(kind, commit);
    if ('error' in r) return setError(r.error);
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      setPreview(await api.preview(rootId, current.id, r.range));
    } catch (e) {
      const err = e as FlowApiError;
      setPreview(null);
      if (err.reason === 'no-baseline') {
        setKind('baseline');
        setNote(noBaselineText(err.why));
      } else if (err.reason === 'open-run' && err.run) {
        setPackages((ps) => ps?.map((p) => (p.id === current.id ? { ...p, openRun: { url: err.run!.url, status: err.run!.status as never } } : p)) ?? null);
      } else setError(flowReasonText(err.reason, err.message));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!preview || busy) return;
    setBusy(true);
    setError(null);
    try {
      const started = await api.start(preview.token);
      onClose();
      go(started.url);
    } catch (e) {
      const err = e as FlowApiError;
      if (err.reason === 'open-run' && err.run) {
        onClose();
        go(err.run.url);
        return;
      }
      setPreview(null);
      setError(flowReasonText(err.reason, err.message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div class="flow-scrim" onClick={onClose} />
      <div class="flow-dialog" role="dialog" aria-modal="true" aria-label="Run a flow">
        <header class="flow-head">
          <strong>Run a flow</strong>
          <button type="button" class="icon-btn" aria-label="Close" title="Close — Esc" onClick={onClose}>
            ✕
          </button>
        </header>
        {!packages && !error && <div class="spinner" />}
        {packages && (
          <div class="flow-form">
            <label class="flow-field">
              <span>Flow</span>
              <select value={pick} onChange={(e) => choose((e.target as HTMLSelectElement).value)}>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                    {p.openRun ? ' — open run' : ''}
                  </option>
                ))}
              </select>
            </label>
            {current?.summary && <p class="flow-summary">{current.summary}</p>}
            {current?.openRun ? (
              <p class="flow-open">
                A run of this flow is open: <a href={current.openRun.url} onClick={(e) => { if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); onClose(); go(current.openRun!.url); } }}>open it</a> to finish, mark it partial or cancel it.
              </p>
            ) : (
              current && (
                <>
                  <fieldset class="flow-range">
                    <legend>Range</legend>
                    {current.ranges.includes('since-last-run') && (
                      <label class="flow-opt">
                        <input type="radio" name="flow-range" checked={kind === 'since-last-run'} onChange={() => { setKind('since-last-run'); setPreview(null); }} /> Since the last run
                      </label>
                    )}
                    {current.ranges.includes('baseline') && (
                      <label class="flow-opt">
                        <input type="radio" name="flow-range" checked={kind === 'baseline'} onChange={() => { setKind('baseline'); setPreview(null); }} /> From a commit
                      </label>
                    )}
                    {kind === 'baseline' && (
                      <input
                        class="flow-commit"
                        type="text"
                        inputMode="text"
                        autocapitalize="off"
                        autocomplete="off"
                        spellcheck={false}
                        placeholder="commit id, 4–40 hex digits"
                        value={commit}
                        onInput={(e) => { setCommit((e.target as HTMLInputElement).value); setPreview(null); }}
                        aria-label="Commit to start from"
                      />
                    )}
                  </fieldset>
                  {note && <p class="flow-note">{note}</p>}
                  <div class="flow-actions">
                    <button type="button" class="flow-go" disabled={busy} onClick={doPreview}>
                      {busy && !preview ? '…' : 'Preview'}
                    </button>
                  </div>
                </>
              )
            )}
            {preview && (
              <section class="flow-preview" aria-label="Preview">
                <p class="flow-where">
                  Writes <code>{preview.runPath}</code> · {preview.base.slice(0, 8)}..{preview.target.slice(0, 8)}
                </p>
                {preview.dirty.length > 0 && <p class="flow-dirty">Uncommitted, kept apart: {preview.dirty.join(', ')}</p>}
                {preview.warnings.map((w, i) => (
                  <p class="flow-warn" key={i}>
                    {w}
                  </p>
                ))}
                <div class="flow-html md" dangerouslySetInnerHTML={{ __html: safeHtml(preview.html) }} />
                <div class="flow-actions">
                  <button type="button" class="flow-go primary" disabled={busy} onClick={confirm}>
                    {busy ? '…' : 'Confirm run'}
                  </button>
                </div>
              </section>
            )}
          </div>
        )}
        {error && <p class="flow-error" role="alert">{error}</p>}
      </div>
    </>
  );
}

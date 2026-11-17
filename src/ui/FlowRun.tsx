import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { flowApi, FlowApiError } from './flow-api';
import {
  defaultRange, defaultTarget, flowReasonText, flowTargets, noBaselineText, rangeOf, scopeMismatch, startable, subjectOf,
  TARGET_LABEL, type FlowCatalogEntry, type FlowPreview, type FlowRangeKind, type FlowTargetKind,
} from './flow-model';
import { follow } from './PageHead';
import { safeHtml } from './safe-html';
import { useViewer } from './viewer';
import { VIEWER_MESSAGE } from './viewer-text';

const api = flowApi();
const KINDS: FlowTargetKind[] = ['page', 'directory', 'project'];

interface Props {
  rootId: string;
  rootName: string;
  /** Where the page was opened from: a file, a folder (`…/`), or `''` — the project. */
  from: string;
  /** The project can be written: a run is a document in it. */
  writable: boolean;
  go: (url: string) => void;
  /** The page it was opened from, for the way back. */
  backUrl: string;
  gear?: preact.ComponentChildren;
}

/**
 * The Run Flow page (`/<root>/?flow=<from>`): what the run is on — Page, Directory or Project, from where it was
 * opened — then a package that runs on that, a range, the preview and Confirm. The target is the run's input.
 * A Viewer, a read-only project and a target nothing runs on are explained here; nothing is hidden.
 */
export function FlowPage(props: Props) {
  const viewer = useViewer();
  const targets = useMemo(() => flowTargets(props.from), [props.from]);
  const [kind, setKind] = useState<FlowTargetKind>(() => defaultTarget(targets));
  useEffect(() => setKind(defaultTarget(targets)), [targets]);

  const blocked = viewer ? VIEWER_MESSAGE : !props.writable ? flowReasonText('read-only', '') : null;
  const where = (k: FlowTargetKind) => (k === 'project' ? props.rootName : targets[k]);
  const origin = !props.from ? 'the project' : props.from.endsWith('/') ? 'a folder' : 'a page';
  const why = (k: FlowTargetKind) =>
    k === 'page' ? `opened from ${origin}, not a page` : origin === 'a page' ? 'a file at the top of the project has no folder of its own' : `opened from ${origin}, not a folder`;

  return (
    <div class="settings flow-page">
      <header class="home-head">
        <h1>Run Flow</h1>
        <span class="head-gear">{props.gear}</span>
      </header>
      <p class="settings-hint">
        <a href={props.backUrl} onClick={(e) => follow(e, () => props.go(props.backUrl))}>
          ← Back
        </a>
      </p>

      <fieldset class="flow-on" aria-label="Run flow on">
        <legend>Run flow on</legend>
        {KINDS.map((k) => {
          const off = targets[k] === null;
          return (
            <label key={k} class={`flow-on-opt${off ? ' off' : ''}`} title={off ? `No ${TARGET_LABEL[k].toLowerCase()}: ${why(k)}` : undefined}>
              <input type="radio" name="flow-on" checked={kind === k} disabled={off} onChange={() => setKind(k)} />
              <span class="flow-on-label">{TARGET_LABEL[k]}</span>
              <code class="flow-on-path">{off ? `— ${why(k)}` : where(k) || props.rootName}</code>
            </label>
          );
        })}
      </fieldset>

      {blocked ? (
        <p class="flow-error" role="status">
          {blocked}
        </p>
      ) : (
        <FlowForm key={`${props.rootId}|${kind}|${props.from}`} rootId={props.rootId} kind={kind} targets={targets} go={props.go} />
      )}
    </div>
  );
}

function FlowForm({ rootId, kind, targets, go }: { rootId: string; kind: FlowTargetKind; targets: Record<FlowTargetKind, string | null>; go: (url: string) => void }) {
  const [packages, setPackages] = useState<FlowCatalogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState('');
  const [range, setRange] = useState<FlowRangeKind>('baseline');
  const [commit, setCommit] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [preview, setPreview] = useState<FlowPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const going = useRef(false);
  /** The last preview went out of date: say so and offer to preview again. */
  const [again, setAgain] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .catalog(rootId)
      .then((c) => {
        if (!live) return;
        setPackages(c.packages);
        // A package that runs on this target and can start now leads.
        const fits = c.packages.filter((p) => !scopeMismatch(p, kind));
        const first = fits.find(startable) ?? fits[0] ?? c.packages[0];
        if (first) {
          setPick(first.id);
          setRange(defaultRange(first));
        }
      })
      .catch((e: FlowApiError) => live && setError(flowReasonText(e.reason, e.message)));
    return () => {
      live = false;
    };
  }, [rootId, kind]);

  const current = useMemo(() => packages?.find((p) => p.id === pick) ?? null, [packages, pick]);
  const mismatch = current ? scopeMismatch(current, kind) : null;
  const on = kind === 'project' ? 'the whole project' : `one ${kind}`;
  const choose = (id: string) => {
    setPick(id);
    setPreview(null);
    setError(null);
    setNote(null);
    setAgain(false);
    const p = packages?.find((x) => x.id === id);
    if (p) setRange(defaultRange(p));
  };

  const doPreview = async () => {
    if (!current || mismatch || going.current) return;
    const r = rangeOf(range, commit);
    if ('error' in r) return setError(r.error);
    going.current = true;
    setBusy(true);
    setError(null);
    setNote(null);
    setAgain(false);
    try {
      setPreview(await api.preview(rootId, current.id, r.range, subjectOf(kind, targets)));
    } catch (e) {
      const err = e as FlowApiError;
      setPreview(null);
      if (err.reason === 'no-baseline') {
        setRange('baseline');
        setNote(noBaselineText(err.why));
      } else setError(flowReasonText(err.reason, err.message));
    } finally {
      going.current = false;
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!preview || going.current) return;
    going.current = true;
    setBusy(true);
    setError(null);
    try {
      const started = await api.start(preview.token);
      go(started.url);
    } catch (e) {
      const err = e as FlowApiError;
      setPreview(null);
      if (err.reason === 'open-run' && err.run) {
        // The package now shows its open run, with the words and the link — no silent jump.
        const url = err.run.url;
        setPackages((ps) => ps?.map((p) => (p.id === current?.id ? { ...p, openRun: { url, status: err.run!.status as never } } : p)) ?? null);
      } else {
        setError(flowReasonText(err.reason, err.message));
        // A preview that went out of date (or a document that appeared meanwhile): the way on is a fresh one.
        if (err.reason === 'stale') setAgain(true);
      }
    } finally {
      going.current = false;
      setBusy(false);
    }
  };

  const fitting = packages?.filter((p) => !scopeMismatch(p, kind)) ?? [];

  return (
    <>
      {!packages && !error && <div class="spinner" />}
      {packages && (
        <div class="flow-form">
          {!fitting.length && <p class="flow-note">No installed flow runs on {on} — pick another target above.</p>}
          <label class="flow-field">
            <span>Flow</span>
            <select value={pick} onChange={(e) => choose((e.target as HTMLSelectElement).value)}>
              {packages.map((p) => {
                const off = scopeMismatch(p, kind);
                return (
                  <option key={p.id} value={p.id}>
                    {p.title}
                    {p.openRun ? ' — open run' : ''}
                    {off ? ` — ${off}` : ''}
                  </option>
                );
              })}
            </select>
          </label>
          {current?.summary && <p class="flow-summary">{current.summary}</p>}
          {mismatch ? (
            <p class="flow-note" role="status">
              {current!.title} {mismatch}, not on {on}: pick that target above, or another flow.
            </p>
          ) : current?.openRun ? (
            <p class="flow-open">
              A run of this flow is open: <a href={current.openRun.url} onClick={(e) => follow(e, () => go(current.openRun!.url))}>open it</a> to finish, mark it partial or cancel it.
            </p>
          ) : (
            current && (
              <>
                <fieldset class="flow-range">
                  <legend>Range</legend>
                  {current.ranges.includes('since-last-run') && (
                    <label class="flow-opt">
                      <input type="radio" name="flow-range" checked={range === 'since-last-run'} onChange={() => { setRange('since-last-run'); setPreview(null); }} /> Since the last run
                    </label>
                  )}
                  {current.ranges.includes('baseline') && (
                    <label class="flow-opt">
                      <input type="radio" name="flow-range" checked={range === 'baseline'} onChange={() => { setRange('baseline'); setPreview(null); }} /> From a commit
                    </label>
                  )}
                  {range === 'baseline' && (
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
                    {busy && !preview ? '…' : again ? 'Preview again' : 'Preview'}
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
    </>
  );
}

import { useEffect, useRef, useState } from 'preact/hooks';
import { ApiError } from './api';
import { automationApi } from './automation-api';
import {
  APPROVAL_WORDS, approveWhyWords, REAPPROVE_WORDS, actionFailure, autoReasonText, canApproveReg, canRevokeReg, latest, needsReapprove, rangeWords, revokeNote, runLine, scheduleLine, shortHash, whenWords, willRun,
  type AutoRegistration, type AutomationState,
} from './automation-model';
import { Ago } from './Ago';

const api = automationApi();

interface Props {
  rootId: string;
  rootName: string;
  gear: preact.ComponentChildren;
}

/** A project's scheduled runs: what its team committed, what this machine approved, what ran. Only an administrator approves. */
export function AutomationPage({ rootId, rootName, gear }: Props) {
  const [state, setState] = useState<AutomationState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const going = useRef(false);
  /** One request counter for the page: a project switch, or a newer load, makes an older answer stale. */
  const seq = useRef(latest());
  const gen = useRef(0);

  const load = (keep = false) => {
    const mine = seq.current.next();
    if (!keep) setError(null);
    api.state(rootId).then(
      (s) => seq.current.current(mine) && setState(s),
      (e: ApiError) => {
        if (!seq.current.current(mine)) return;
        setState(null);
        setError(autoReasonText(e.reason, e.message));
      },
    );
  };
  useEffect(() => {
    gen.current++;
    going.current = false;
    setState(null);
    setAsking(null);
    setBusy(false);
    setError(null);
    setNote(null);
    load();
    return () => void seq.current.next();
  }, [rootId]);

  const act = async (what: () => Promise<{ scheduleError?: string } | unknown>) => {
    if (going.current) return;
    going.current = true;
    const g = gen.current;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const result = await what();
      if (g !== gen.current) return;
      setAsking(null);
      setNote(revokeNote((result ?? {}) as { scheduleError?: string }));
      load();
    } catch (e) {
      if (g !== gen.current) return;
      const err = e as ApiError;
      const failure = actionFailure(err.reason, err.message);
      setError(failure.text);
      if (failure.reset) {
        // The file changed under the review: drop it, read again, and keep saying so — a fresh Review shows the new one.
        setAsking(null);
        load(true);
      }
    } finally {
      if (g === gen.current) {
        going.current = false;
        setBusy(false);
      }
    }
  };

  return (
    <div class="settings auto">
      <header class="home-head">
        <h1>Automation</h1>
        <span class="head-gear">{gear}</span>
      </header>
      <p class="settings-hint">
        Scheduled runs of <b>{rootName}</b>: pipelines its team keeps in <code>.mdhouse/automation/</code>. A file runs on this machine only after an administrator
        approves its exact content; change the file and it stops until approved again.
      </p>
      {error && (
        <p class="settings-error" role="alert">
          {error}
        </p>
      )}
      {note && (
        <p class="settings-hint" role="status">
          {note}
        </p>
      )}
      {!state && !error && <div class="spinner" />}
      {state?.busError && (
        <p class="settings-error" role="alert">
          The approvals are kept on the Agent Bus and it cannot be read: {state.busError}. Nothing runs meanwhile.
        </p>
      )}
      {state && !state.canApprove && !state.busError && (
        <p class="settings-hint">{approveWhyWords(state.canApproveWhy) ?? 'You can read this; approving needs the administrator, the Agent Bus on, and an mdhouse that is not open to the network.'}</p>
      )}
      {state && !state.canApprove && state.busError && state.canApproveWhy && <p class="settings-hint">{approveWhyWords(state.canApproveWhy)}</p>}
      {state?.errors.map((e) => (
        <p class="settings-error auto-file-error" key={e.file}>
          <code>{e.file}</code> is not a registration: {e.error}
        </p>
      ))}
      {state && !state.registrations.length && !state.errors.length && (
        <p class="settings-hint">
          No registrations. A pipeline is one file, <code>.mdhouse/automation/&lt;name&gt;.json</code>, committed with the project.
        </p>
      )}
      {state?.registrations.map((reg) => (
        <Registration
          key={reg.id}
          reg={reg}
          state={state}
          asking={asking === reg.id}
          busy={busy}
          onAsk={() => setAsking(asking === reg.id ? null : reg.id)}
          onApprove={() => void act(() => api.approve(rootId, reg.id, reg.hash))}
          onRevoke={() => void act(() => api.revoke(rootId, reg.id))}
        />
      ))}
    </div>
  );
}

function Registration({ reg, state, asking, busy, onAsk, onApprove, onRevoke }: { reg: AutoRegistration; state: AutomationState; asking: boolean; busy: boolean; onAsk: () => void; onApprove: () => void; onRevoke: () => void }) {
  return (
    <section class={`auto-reg approval-${reg.approval}${reg.disabled ? ' stopped' : ''}`} aria-label={`Registration ${reg.id}`}>
      <header class="auto-head">
        <b>{reg.id}</b>
        <span class={`auto-state s-${reg.approval}`}>{reg.approval === 'approved' ? 'approved' : reg.approval === 'changed' ? 'changed' : reg.approval === 'unknown' ? 'unknown' : reg.approval === 'no-timer' ? 'no timer' : 'not approved'}</span>
        {reg.disabled && <span class="auto-state s-stopped">stopped after {reg.failures} failures</span>}
      </header>
      <dl class="auto-facts">
        <dt>Flow</dt>
        <dd>
          <code>{reg.flow}</code> over the commits {rangeWords(reg.range)}
        </dd>
        <dt>When</dt>
        <dd>
          {whenWords(reg.when)} <span class="settings-hint">— {'cron' in reg.when ? <code>{reg.when.cron}</code> : <code>{reg.when.at}</code>}</span>
        </dd>
        <dt>Late</dt>
        <dd>skipped when later than {reg.maxLate}</dd>
        {reg.notify && (
          <>
            <dt>Tells</dt>
            <dd>
              <code>{reg.notify}</code>
            </dd>
          </>
        )}
        <dt>File</dt>
        <dd>
          <code>{reg.file}</code> · hash <code title={reg.hash}>{shortHash(reg.hash)}</code>
        </dd>
        <dt>State</dt>
        <dd>
          {needsReapprove(reg) ? REAPPROVE_WORDS : APPROVAL_WORDS[reg.approval]}
          {reg.approved && (
            <>
              {' '}
              — by {reg.approved.by}, <Ago at={Date.parse(reg.approved.at)} flame={false} />
            </>
          )}
          {reg.lastStartAt && (
            <>
              {' '}
              · last started <Ago at={Date.parse(reg.lastStartAt)} flame={false} /> · {reg.startedToday} today
            </>
          )}
        </dd>
        {reg.schedule && (
          <>
            <dt>Timer</dt>
            <dd>{scheduleLine(reg)}</dd>
          </>
        )}
      </dl>
      {(canApproveReg(state, reg) || canRevokeReg(state, reg)) && (
        <div class="auto-actions">
          {canApproveReg(state, reg) && (
            <button type="button" class="rag-act" aria-expanded={asking} disabled={busy} onClick={onAsk}>
              {reg.approval === 'changed' || needsReapprove(reg) ? 'Review and approve again' : 'Review and approve'}
            </button>
          )}
          {canRevokeReg(state, reg) && (
            <button type="button" class="rag-act" disabled={busy} onClick={onRevoke}>
              Revoke
            </button>
          )}
        </div>
      )}
      {asking && (
        <div class="auto-confirm" role="group" aria-label="What approving lets run">
          <p>
            Approving file <code>{shortHash(reg.hash)}</code> lets this machine, without asking again:
          </p>
          <ul>
            {willRun(reg).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div class="auto-actions">
            <button type="button" class="rag-act primary" disabled={busy} onClick={onApprove}>
              {busy ? '…' : 'Approve this file'}
            </button>
            <button type="button" class="rag-act" disabled={busy} onClick={onAsk}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <h2 class="auto-runs-h">Last runs</h2>
      {reg.runs.length ? (
        <ul class="auto-runs">
          {reg.runs.slice(0, 5).map((r, i) => (
            <li key={`${r.at}-${i}`}>{runLine(r)}</li>
          ))}
        </ul>
      ) : (
        <p class="settings-hint">None yet.</p>
      )}
    </section>
  );
}

import { useEffect, useRef, useState } from 'preact/hooks';
import { ApiError } from './api';
import { automationApi } from './automation-api';
import {
  APPROVAL_WORDS, autoReasonText, canApproveReg, canRevokeReg, rangeWords, runLine, scheduleLine, shortHash, whenWords, willRun,
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
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const going = useRef(false);

  const load = () => {
    let live = true;
    setError(null);
    api.state(rootId).then(
      (s) => live && setState(s),
      (e: ApiError) => {
        if (!live) return;
        setState(null);
        setError(autoReasonText(e.reason, e.message));
      },
    );
    return () => {
      live = false;
    };
  };
  useEffect(() => {
    setState(null);
    setAsking(null);
    return load();
  }, [rootId]);

  const act = async (what: () => Promise<unknown>) => {
    if (going.current) return;
    going.current = true;
    setBusy(true);
    setError(null);
    try {
      await what();
      setAsking(null);
      load();
    } catch (e) {
      const err = e as ApiError;
      setError(autoReasonText(err.reason, err.message));
      if (err.reason === 'stale') load();
    } finally {
      going.current = false;
      setBusy(false);
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
      {!state && !error && <div class="spinner" />}
      {state?.busError && (
        <p class="settings-error" role="alert">
          The approvals are kept on the Agent Bus and it cannot be read: {state.busError}. Nothing runs meanwhile.
        </p>
      )}
      {state && !state.canApprove && !state.busError && <p class="settings-hint">You can read this; approving needs the administrator, the Agent Bus on, and an mdhouse that is not open to the network.</p>}
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
        <span class={`auto-state s-${reg.approval}`}>{reg.approval === 'approved' ? 'approved' : reg.approval === 'changed' ? 'changed' : reg.approval === 'unknown' ? 'unknown' : 'not approved'}</span>
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
          {APPROVAL_WORDS[reg.approval]}
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
              {reg.approval === 'changed' ? 'Review and approve again' : 'Review and approve'}
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

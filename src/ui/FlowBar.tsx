import { useState } from 'preact/hooks';
import { FlowApiError, flowApi } from './flow-api';
import { barOutcomes, flowReasonText, isTerminal, newClientId, outcomeError, type DocFlow, type FlowAction, type FlowOutcome } from './flow-model';
import { useViewer } from './viewer';

const api = flowApi();
const OUTCOME_LABEL: Record<FlowOutcome, string> = { complete: '✅ Complete', blocked: '⛔ Blocked', failed: '❌ Failed' };

interface Props {
  flow: DocFlow;
  root: string;
  path: string;
  /** The run moved: the page reads it again. */
  onChanged: () => void;
}

/**
 * On a run document: where the run is, and the few things a person asserts to move it on. Everything shown
 * comes from the server's reading of the run's own state (`doc.flow`), never from the document's markup.
 * A Viewer, or a run nobody can act on, has no bar.
 */
export function FlowBar({ flow, root, path, onChanged }: Props) {
  const viewer = useViewer();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  if (viewer || !flow.canAct) return null;
  const open = !isTerminal(flow.status);
  const outcomes = barOutcomes(flow);

  const send = async (action: FlowAction) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.event({ root, path, expectedVersion: flow.version, clientId: newClientId(), action });
      setText('');
      setCancelling(false);
      onChanged();
    } catch (e) {
      const err = e as FlowApiError;
      setError(flowReasonText(err.reason, err.message));
      if (err.reason === 'stale') onChanged();
    } finally {
      setBusy(false);
    }
  };
  const outcome = (o: FlowOutcome) => {
    const bad = outcomeError(o, text);
    if (bad) return setError(bad);
    void send({ type: 'outcome', outcome: o, text: text.trim() });
  };

  return (
    <section class="flow-bar" aria-label="Flow run">
      <div class="flow-bar-head">
        <span class={`flow-status s-${flow.status}`}>{flow.status}</span>
        <span class="flow-node">{flow.node.title}</span>
      </div>
      {flow.holds.length > 0 && (
        <ul class="flow-holds">
          {flow.holds.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      )}
      {open && (
        <>
          {(flow.evidence.length > 0 || flow.questions.length > 0) && (
            <ul class="flow-items">
              {flow.evidence.map((ev) => (
                <li key={`e:${ev.label}`}>
                  <span class="flow-label">
                    {ev.label}
                    {ev.required ? ' *' : ''} — {ev.status}
                  </span>
                  <button type="button" class="flow-mini" disabled={busy} onClick={() => void send({ type: 'evidence', label: ev.label, status: ev.status === 'supplied' ? 'missing' : 'supplied', note: text.trim() })}>
                    {ev.status === 'supplied' ? 'Mark missing' : 'Mark supplied'}
                  </button>
                </li>
              ))}
              {flow.questions.map((q) => (
                <li key={`q:${q.id}`}>
                  <span class="flow-label">
                    ❓ {q.title}
                    {q.required ? ' *' : ''} — {q.status}
                  </span>
                  <button type="button" class="flow-mini" disabled={busy} onClick={() => void send({ type: 'question', questionId: q.id, status: q.status === 'answered' ? 'unanswered' : 'answered', turn: text.trim() })}>
                    {q.status === 'answered' ? 'Reopen' : 'Mark answered'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <textarea
            class="flow-text"
            rows={2}
            placeholder="A note for the action you press — required for Blocked and Failed"
            value={text}
            onInput={(e) => {
              setText((e.target as HTMLTextAreaElement).value);
              setError(null);
            }}
            aria-label="Note for the next action"
          />
          <div class="flow-bar-actions">
            {outcomes.map((o) => (
              <button type="button" key={o} class={`flow-go${o === 'complete' ? ' primary' : ''}`} disabled={busy} onClick={() => outcome(o)}>
                {OUTCOME_LABEL[o]}
              </button>
            ))}
            {!cancelling ? (
              <button type="button" class="flow-go quiet" disabled={busy} onClick={() => setCancelling(true)}>
                Cancel run
              </button>
            ) : (
              <button type="button" class="flow-go danger" disabled={busy} onClick={() => void send({ type: 'cancel', reason: text.trim() || 'cancelled from the page' })} title="Uses the note above as the reason">
                Confirm cancel
              </button>
            )}
          </div>
        </>
      )}
      {error && (
        <p class="flow-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

import { useRef, useState } from 'preact/hooks';
import { FlowApiError, flowApi } from './flow-api';
import { ApiError } from './api';
import { actionIds, assertionError, barOutcomes, flowReasonText, isTerminal, refusedNote, outcomeError, showsBar, type DocFlow, type FlowAction, type FlowOutcome } from './flow-model';
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
  const going = useRef(false);
  const ids = useRef(actionIds()).current;
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  if (viewer) return null;
  const refused = refusedNote(flow);
  if (refused)
    return (
      <section class="flow-bar refused" aria-label="Flow run">
        <p class="flow-error">{refused}</p>
      </section>
    );
  if (!showsBar(flow)) return null;
  const open = !isTerminal(flow.status);
  const outcomes = barOutcomes(flow);

  const send = async (action: FlowAction) => {
    if (going.current) return;
    going.current = true;
    setBusy(true);
    setError(null);
    try {
      await api.event({ root, path, expectedVersion: flow.version, clientId: ids.idFor(JSON.stringify([root, path, flow.version, action])), action });
      ids.settle();
      setText('');
      setCancelling(false);
      onChanged();
    } catch (e) {
      if (!(e instanceof ApiError)) {
        // No answer at all: the same press, with the same id, may be sent again — the server replays what it recorded.
        setError('No answer from the server — press again to retry.');
        return;
      }
      ids.settle();
      const err = e as FlowApiError;
      setError(flowReasonText(err.reason, err.message));
      if (err.reason === 'stale') onChanged();
    } finally {
      going.current = false;
      setBusy(false);
    }
  };
  const assert = (kind: 'evidence' | 'question', action: FlowAction) => {
    const bad = assertionError(kind, text);
    if (bad) return setError(bad);
    void send(action);
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
                  <button type="button" class="flow-mini" disabled={busy} onClick={() => assert('evidence', { type: 'evidence', label: ev.label, status: ev.status === 'supplied' ? 'missing' : 'supplied', note: text.trim() })}>
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
                  <button type="button" class="flow-mini" disabled={busy} onClick={() => assert('question', { type: 'question', questionId: q.id, status: q.status === 'answered' ? 'unanswered' : 'answered', turn: text.trim() })}>
                    {q.status === 'answered' ? 'Reopen' : 'Mark answered'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <textarea
            class="flow-text"
            rows={2}
            placeholder="A note for the action you press — required for every outcome, evidence and answer"
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

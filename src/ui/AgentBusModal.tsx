import { useEffect, useRef, useState } from 'preact/hooks';
import { api, liveListeners, type AbAction, type AbEvent, type AbInfo, type BusAgent, type LiveMessage } from './api';
import { IconX } from './icons';

/** The buttons, numbered for Alt+1…9; the first is the default — Ctrl+Enter. */
const ACTIONS: Array<[AbAction, string, string]> = [
  ['updated', 'Updated — reply', 'The page changed: read it and reply'],
  ['target', 'Do 🎯', 'Do the 🎯 items, then reply'],
  ['resolve', 'Resolve questions', 'Carry the answers over, then reply'],
  ['review', 'Review', 'Review the page in the agent markup, then reply'],
  ['note', 'Send note', 'The note alone'],
];

/** Where a request stands for the page's button: nothing sent, waiting, or an answer in. */
export type AbState = 'idle' | 'waiting' | 'answered';

const SHOWN: Record<AbEvent['kind'], string> = {
  sent: '→ sent',
  ack: '✓ read — working',
  answer: '💬',
  done: '✅ done',
  timeout: '⏳ no reply in 10 min',
  error: '❌',
};

/** Events in the order they happened, each once — the live channel and a catch-up can both bring one. */
const merge = (a: AbEvent[], b: AbEvent[]): AbEvent[] => {
  const key = (e: AbEvent) => `${e.to}\n${e.kind}\n${e.at}`;
  const seen = new Set(a.map(key));
  return [...a, ...b.filter((e) => !seen.has(key(e)))].sort((x, y) => x.at - y.at);
};

interface Props {
  open: boolean;
  onClose: () => void;
  /** The document, as a wire path `root/rel`. */
  p: string;
  /** The agents the document names (`<!-- AB: … -->`). */
  named: string[];
  onState: (s: AbState) => void;
}

/**
 * The Agent Bus popup: whom to ask (the agents the page names, else the default ones, else a pick
 * from the live ones), a note, and the buttons; then each agent's progress and its answer. Stays
 * mounted while closed, so a reply that comes later is there when it is opened again.
 */
export function AgentBusModal({ open, onClose, p, named, onState }: Props) {
  const [info, setInfo] = useState<AbInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<string | null>(null);
  const [events, setEvents] = useState<AbEvent[]>([]);
  const bar = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  // the agents, fresh on every open: who is alive changes
  useEffect(() => {
    if (!open) return;
    let live = true;
    setInfoError(null);
    api
      .abInfo()
      .then((got) => live && setInfo(got))
      .catch((err: Error) => live && setInfoError(err.message));
    requestAnimationFrame(() => area.current?.focus());
    return () => {
      live = false;
    };
  }, [open]);

  // this page's job: its events as they come, and the ones sent before the page knew the job —
  // or while the socket reconnected — from the server's record of it
  useEffect(() => {
    if (!job) return;
    const catchUp = () => void api.abJob(job).then((got) => setEvents((evs) => merge(evs, got.events)), () => {});
    const on = (msg: LiveMessage) => {
      if (msg.t === 'ab' && msg.job === job) setEvents((evs) => merge(evs, [msg]));
      else if (msg.t === 'hello') catchUp();
    };
    liveListeners.add(on);
    catchUp();
    return () => void liveListeners.delete(on);
  }, [job]);

  const agents: BusAgent[] = info?.enabled ? info.agents : [];
  const aliveOf = (name: string) => agents.find((a) => a.name === name)?.alive ?? false;
  const defaults = info?.enabled ? info.default : [];
  // whom the page asks: the named ones, else the default ones, else none — a pick from the live ones
  const asked = named.length ? named : defaults;
  const others = agents.filter((a) => a.alive && !asked.includes(a.name));
  const chosen = picked ?? new Set(asked.filter(aliveOf));

  // the last event per target, in the order they were asked
  const last = new Map<string, AbEvent>();
  for (const ev of events) last.set(ev.to, ev);
  const waiting = [...last.values()].some((ev) => ev.kind === 'sent' || ev.kind === 'ack');
  const answered = [...last.values()].some((ev) => ev.kind === 'answer');
  useEffect(() => onState(waiting ? 'waiting' : answered ? 'answered' : 'idle'), [waiting, answered]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const toggle = (name: string) =>
    setPicked(() => {
      const next = new Set(chosen);
      if (!next.delete(name)) next.add(name);
      return next;
    });

  const send = async (action: AbAction) => {
    if (sending) return;
    const targets = [...chosen];
    if (!targets.length) return setError('Pick an agent');
    if (action === 'note' && !note.trim()) return setError('Write a note');
    setSending(true);
    setError(null);
    try {
      const got = await api.abSend({ p, targets, action, note });
      setEvents([]);
      setJob(got.job);
      setNote('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  const row = (name: string, descr = '') => {
    const alive = aliveOf(name);
    return (
      <label class={`ab-agent${alive ? '' : ' dead'}`} key={name}>
        <input type="checkbox" checked={chosen.has(name)} onChange={() => toggle(name)} />
        <span>
          <span class="ab-name">{name}</span>
          {!alive && info?.enabled && (
            <span class="ab-dead">{agents.some((a) => a.name === name) ? 'dead — not running' : 'not on the bus'}</span>
          )}
          {descr && <span class="ab-descr">{descr}</span>}
        </span>
      </label>
    );
  };

  return (
    <div class="modal-backdrop" onClick={onClose} role="presentation">
      <div
        class="modal-dialog ab-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ab-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void send('updated');
            return;
          }
          // Alt+1…9: the button with that number (the key's code, so any layout works)
          const n = e.altKey && !e.ctrlKey && !e.metaKey && /^Digit([1-9])$/.exec(e.code);
          if (n) {
            e.preventDefault();
            bar.current?.querySelector<HTMLButtonElement>(`[data-n="${n[1]}"]`)?.click();
          }
        }}
      >
        <button class="modal-close icon-btn" onClick={onClose} title="Close" aria-label="Close">
          <IconX size={15} />
        </button>
        <h2 id="ab-title" class="ab-title">Agent Bus</h2>

        {infoError && <p class="ab-error">{infoError}</p>}
        {info?.enabled && !info.connected && <p class="ab-error">Not connected: {info.error}</p>}

        <div class="ab-agents">
          {named.length > 0 && <div class="ab-from">Named on the page</div>}
          {!named.length && defaults.length > 0 && <div class="ab-from">Default</div>}
          {asked.map((n) => row(n))}
          {!asked.length && <div class="ab-from">Pick one or more</div>}
          {(asked.length ? others.length > 0 : true) &&
            (asked.length ? (
              <details class="ab-more">
                <summary>Other live agents — {others.length}</summary>
                {others.map((a) => row(a.name, a.descr))}
              </details>
            ) : (
              others.map((a) => row(a.name, a.descr))
            ))}
          {info?.enabled && info.connected && !asked.length && !others.length && <p class="ab-from">No agent is running</p>}
        </div>

        <textarea
          ref={area}
          class="ab-note"
          rows={3}
          placeholder="A note — added to the request (optional)"
          value={note}
          onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)}
        />
        <div class="ab-bar" ref={bar}>
          {ACTIONS.map(([a, label, tip], i) => (
            <button
              type="button"
              key={a}
              class={i === 0 ? 'default' : ''}
              disabled={sending || !chosen.size}
              data-n={i + 1}
              title={`${tip} — ${i === 0 ? 'Ctrl+Enter · ' : ''}Alt+${i + 1}`}
              onClick={() => void send(a)}
            >
              <span class="n">{i + 1}</span> {label}
            </button>
          ))}
        </div>
        {error && <p class="ab-error">{error}</p>}

        {last.size > 0 && (
          <div class="ab-results">
            {[...last.values()].map((ev) => (
              <div class={`ab-result ${ev.kind}`} key={ev.to}>
                <span class="ab-name">{ev.to}</span> <span class="ab-kind">{SHOWN[ev.kind]}</span>
                {ev.body && <div class="ab-body">{ev.body}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

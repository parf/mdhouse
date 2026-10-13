import { useEffect, useRef, useState } from 'preact/hooks';
import { api, liveListeners, type AbAction, type AbEvent, type AbInfo, type BusAgent, type LiveMessage } from './api';
import { IconBus, IconX } from './icons';

/** The buttons, numbered for Alt+1…5, in two rows; the first is the default — Ctrl+Enter. */
const ACTIONS: Array<[AbAction, string, string]> = [
  ['updated', 'Updated — reply', 'The page changed: read it and reply'],
  ['note', 'Send note', 'The note alone'],
  ['target', 'Do 🎯', 'Do the 🎯 items, then reply'],
  ['resolve', 'Resolve', 'Carry the answered questions over, then reply'],
  ['review', 'Review', 'Review the page in the agent markup, then reply'],
];
const LABEL = Object.fromEntries(ACTIONS.map(([a, l]) => [a, l])) as Record<AbAction, string>;

/** Where the page's requests stand, for its button: nothing sent, waiting, or an answer in. */
export type AbState = 'idle' | 'waiting' | 'answered';

/** One thing the reader sent: what, to whom, its note; the job its events belong to. */
interface Sent {
  job: string;
  action: AbAction;
  note: string;
  targets: string[];
  at: number;
}

interface Chat {
  sent: Sent[];
  events: AbEvent[];
}

/** Each document's conversation: in memory for the tab, its last `KEEP` requests in localStorage. */
const chats = new Map<string, Chat>();
const KEEP = 20;
const storeKey = (p: string) => `mdhouse.ab.${p}`;

function loadChat(p: string): Chat {
  try {
    const got = JSON.parse(localStorage.getItem(storeKey(p)) ?? 'null') as Chat | null;
    if (Array.isArray(got?.sent) && Array.isArray(got?.events)) return got;
  } catch {
    /* unavailable or not ours */
  }
  return { sent: [], events: [] };
}

function saveChat(p: string, chat: Chat): void {
  const sent = chat.sent.slice(-KEEP);
  const jobs = new Set(sent.map((s) => s.job));
  const events = chat.events.filter((e) => jobs.has(e.job));
  try {
    if (sent.length) localStorage.setItem(storeKey(p), JSON.stringify({ sent, events }));
    else localStorage.removeItem(storeKey(p));
  } catch {
    /* full or unavailable: the tab still has it */
  }
}

/** Events in the order they happened, each once — the live channel and a catch-up can both bring one. */
const merge = (a: AbEvent[], b: AbEvent[]): AbEvent[] => {
  const key = (e: AbEvent) => `${e.job}\n${e.to}\n${e.kind}\n${e.at}`;
  const seen = new Set(a.map(key));
  return [...a, ...b.filter((e) => !seen.has(key(e)))].sort((x, y) => x.at - y.at);
};

const STATUS: Record<AbEvent['kind'], string> = {
  sent: 'sent',
  ack: 'read — working…',
  answer: 'answered',
  done: 'done, no answer',
  timeout: 'no reply in 10 min',
  error: 'refused',
  lost: 'reply lost — mdhouse restarted',
};

/** `#claude/home-parf-src-mdhouse@parf.us` → `home-parf-src-mdhouse` — the part a reader tells apart. */
const short = (name: string) => name.replace(/^#/, '').replace(/@.*$/, '').replace(/^[^/]*\//, '');

const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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
 * The Agent Bus panel, on the right: the conversation about this document — what the reader
 * sent, each agent's progress and its answers — then whom to ask, a note and the buttons.
 */
export function AgentBusPanel({ open, onClose, p, named, onState }: Props) {
  const [info, setInfo] = useState<AbInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chat, setChat] = useState<Chat>(() => chats.get(p) ?? loadChat(p));
  const bar = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chats.set(p, chat);
    saveChat(p, chat);
  }, [p, chat]);

  // the agents, fresh each time the panel opens: who is alive changes
  useEffect(() => {
    if (!open) return;
    let live = true;
    api
      .abInfo()
      .then((got) => live && setInfo(got))
      .catch((err: Error) => live && setInfoError(err.message));
    area.current?.focus();
    return () => {
      live = false;
    };
  }, [open]);

  // this document's jobs: their events as they come, and the ones sent before the page knew
  // a job — or while the socket reconnected — from the server's record of it
  // only the jobs still waiting on someone: a finished one hears nothing more
  const final = new Set(['answer', 'done', 'timeout', 'error', 'lost']);
  const jobs = chat.sent
    .filter((s) => s.targets.some((to) => !final.has(chat.events.filter((e) => e.job === s.job && e.to === to).at(-1)?.kind ?? '')))
    .map((s) => s.job)
    .join(' ');
  useEffect(() => {
    if (!jobs) return;
    const mine = new Set(jobs.split(' '));
    const catchUp = () => {
      for (const job of mine) {
        void api.abJob(job).then(
          (got) => setChat((c) => ({ ...c, events: merge(c.events, got.events) })),
          (err: { status?: number }) => {
            if (err.status !== 404) return;
            // the server forgot it — it restarted: a target still waiting will not hear back
            setChat((c) => {
              const s = c.sent.find((x) => x.job === job);
              const open = (s?.targets ?? []).filter((to) => {
                const ev = c.events.filter((e) => e.job === job && e.to === to).at(-1);
                return !ev || ev.kind === 'sent' || ev.kind === 'ack';
              });
              if (!open.length) return c;
              const at = Date.now();
              return { ...c, events: merge(c.events, open.map((to) => ({ job, to, kind: 'lost' as const, at }))) };
            });
          },
        );
      }
    };
    const on = (msg: LiveMessage) => {
      if (msg.t === 'ab' && mine.has(msg.job)) setChat((c) => ({ ...c, events: merge(c.events, [msg]) }));
      else if (msg.t === 'hello') catchUp();
    };
    liveListeners.add(on);
    catchUp();
    return () => void liveListeners.delete(on);
  }, [jobs]);

  // the newest at the bottom, in sight
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat]);

  const agents: BusAgent[] = info?.enabled ? info.agents : [];
  const known = (name: string) => agents.some((a) => a.name === name);
  const aliveOf = (name: string) => agents.find((a) => a.name === name)?.alive ?? false;
  const defaults = info?.enabled ? info.default : [];
  // whom the page asks: the named ones, else the default ones, else a pick from the live ones
  const asked = named.length ? named : defaults;
  const others = agents.filter((a) => a.alive && !asked.includes(a.name));
  const chosen = picked ?? new Set(asked.filter(aliveOf));

  // per job and target, the last event
  const last = new Map<string, AbEvent>();
  for (const ev of chat.events) last.set(`${ev.job}\n${ev.to}`, ev);
  const lasts = [...last.values()];
  const waiting = lasts.some((ev) => ev.kind === 'sent' || ev.kind === 'ack');
  const answered = lasts.some((ev) => ev.kind === 'answer');
  useEffect(() => onState(waiting ? 'waiting' : answered ? 'answered' : 'idle'), [waiting, answered]);

  const toggle = (name: string) =>
    setPicked(() => {
      const next = new Set(chosen);
      if (!next.delete(name)) next.add(name);
      return next;
    });

  const send = async (action: AbAction) => {
    if (sending) return;
    const targets = [...chosen];
    if (!targets.length) {
      setPicking(true);
      return setError('Pick an agent');
    }
    if (action === 'note' && !note.trim()) return setError('Write a note');
    setSending(true);
    setError(null);
    try {
      const got = await api.abSend({ p, targets, action, note });
      setChat((c) => ({ ...c, sent: [...c.sent, { job: got.job, action, note, targets, at: Date.now() }] }));
      setNote('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const agentRow = (name: string, descr = '') => (
    <label class={`ab-agent${aliveOf(name) ? '' : ' dead'}`} key={name}>
      <input type="checkbox" checked={chosen.has(name)} onChange={() => toggle(name)} />
      <span>
        <span class="ab-name">{name}</span>
        {!aliveOf(name) && info?.enabled && <span class="ab-dead">{known(name) ? 'dead — not running' : 'not on the bus'}</span>}
        {descr && <span class="ab-descr">{descr}</span>}
      </span>
    </label>
  );

  // closed, it stays mounted: its jobs keep listening, and the page's button shows where they stand
  if (!open) return null;

  return (
    <aside
      class="ab-panel"
      aria-label="Agent Bus"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          void send('updated');
        } else {
          // Alt+1…5: the button with that number (the key's code, so any layout works)
          const n = e.altKey && !e.ctrlKey && !e.metaKey && /^Digit([1-9])$/.exec(e.code);
          if (n) {
            e.preventDefault();
            bar.current?.querySelector<HTMLButtonElement>(`[data-n="${n[1]}"]`)?.click();
          }
        }
      }}
    >
      <header class="ab-head">
        <span class="ab-logo">
          <IconBus size={16} />
        </span>
        <span class="ab-title">Agent Bus</span>
        <button class="icon-btn" onClick={onClose} title="Close — Esc" aria-label="Close">
          <IconX size={15} />
        </button>
      </header>

      <div class="ab-to">
        <span class="ab-to-label">to</span>
        {[...chosen].map((n) => (
          <span class={`ab-chip${aliveOf(n) ? ' alive' : ''}`} key={n} title={n}>
            {short(n)}
          </span>
        ))}
        {!chosen.size && <span class="ab-chip none">nobody yet</span>}
        <button class="ab-pick" aria-expanded={picking} onClick={() => setPicking((v) => !v)} title="Whom to ask">
          {picking ? 'done' : 'change'}
        </button>
      </div>
      {picking && (
        <div class="ab-agents">
          {asked.length > 0 && <div class="ab-from">{named.length ? 'Named on the page' : 'Default'}</div>}
          {asked.map((n) => agentRow(n))}
          {others.length > 0 && <div class="ab-from">Live agents</div>}
          {others.map((a) => agentRow(a.name, a.descr))}
          {info?.enabled && info.connected && !asked.length && !others.length && <p class="ab-from">No agent is running</p>}
        </div>
      )}
      {infoError && <p class="ab-error">{infoError}</p>}
      {info?.enabled && !info.connected && <p class="ab-error">Not connected: {info.error}</p>}

      <div class="ab-log" ref={log}>
        {!chat.sent.length && (
          <div class="ab-empty">
            <IconBus size={28} />
            <p>Tell an agent this page changed, or ask it to work on it.</p>
            <p class="ab-keys">
              <kbd>Ctrl+Enter</kbd> updated — reply · <kbd>Alt+1…5</kbd> a button · <kbd>Esc</kbd> close
            </p>
          </div>
        )}
        {chat.sent.map((s) => (
          <div class="ab-turn" key={s.job}>
            <div class="ab-msg me">
              <div class="ab-meta">
                you → {s.targets.map(short).join(', ')} · {clock(s.at)}
              </div>
              <div class="ab-text">
                <b>{LABEL[s.action]}</b>
                {s.note.trim() && <div class="ab-note-text">{s.note.trim()}</div>}
              </div>
            </div>
            {s.targets.map((to) => {
              const ev = last.get(`${s.job}\n${to}`);
              if (ev?.kind === 'answer' || (ev?.kind === 'error' && ev.body)) {
                return (
                  <div class={`ab-msg agent${ev.kind === 'error' ? ' error' : ''}`} key={to}>
                    <div class="ab-meta">
                      {short(to)} · {clock(ev.at)}
                    </div>
                    <div class="ab-text">{ev.body}</div>
                  </div>
                );
              }
              return (
                <div class={`ab-status ${ev?.kind ?? 'pending'}`} key={to}>
                  {(ev?.kind === 'sent' || ev?.kind === 'ack' || !ev) && <span class="ab-dots" aria-hidden="true" />}
                  {short(to)} — {ev ? STATUS[ev.kind] : 'sending'}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <footer class="ab-compose">
        <textarea
          ref={area}
          class="ab-input"
          rows={3}
          placeholder="A note — added to the request"
          value={note}
          onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)}
        />
        {error && <p class="ab-error">{error}</p>}
        <div class="ab-bar" ref={bar}>
          {ACTIONS.map(([a, label, tip], i) => (
            <button
              type="button"
              key={a}
              class={i === 0 ? 'default' : ''}
              disabled={sending}
              data-n={i + 1}
              title={`${tip} — ${i === 0 ? 'Ctrl+Enter · ' : ''}Alt+${i + 1}`}
              onClick={() => void send(a)}
            >
              <span class="n">{i + 1}</span> {label}
            </button>
          ))}
        </div>
      </footer>
    </aside>
  );
}

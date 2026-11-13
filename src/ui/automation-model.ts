/** The Automation page's contract with the server (MW.11 slice 2) and the words it shows. */

/** `unknown`: the bus's key-value store could not be read, so what this machine approved cannot be said (the state's `busError` says why). */
export type ApprovalState = 'none' | 'approved' | 'changed' | 'unknown';
export type RunOutcome = 'started' | 'skipped' | 'refused' | 'failed' | 'ok' | 'held';

export interface AutoRun {
  at: string;
  outcome: RunOutcome;
  why?: string;
  runPath?: string;
  status?: string;
}

export type AutoWhen = { cron: string } | { at: string };
/** The server writes the range as the registration's own object (`{kind:'since-last-run'}`); the bare string is accepted too. */
export type AutoRange = 'since-last-run' | { kind: 'since-last-run' } | { kind: 'baseline'; commit: string };

export interface AutoRegistration {
  id: string;
  file: string;
  flow: string;
  range: AutoRange;
  when: AutoWhen;
  maxLate: string;
  maxLateMs?: number;
  overlap: 'skip';
  notify?: string;
  /** sha256 of the file's bytes — what an approval is of. */
  hash: string;
  approval: ApprovalState;
  approvedHash?: string;
  /** Who approved the file as it is, and when; the bus schedule that was made for it. */
  approved?: { at: string; by: string; scheduleId: string };
  schedule?: { id: string; enabled: boolean; next?: string; last?: string } | null;
  disabled: boolean;
  failures: number;
  startedToday: number;
  lastStartAt?: string;
  /** Newest first, at most five. */
  runs: AutoRun[];
}

/** `GET /api/automation?root=` */
export interface AutomationState {
  root: string;
  /** An administrator session, and not a Viewer: the only case the page offers Approve and Revoke. */
  canApprove: boolean;
  registrations: AutoRegistration[];
  errors: Array<{ file: string; error: string }>;
  /** Why the approvals could not be read, when they could not. */
  busError?: string;
}

export type AutoReason = 'viewer' | 'admin' | 'exposed' | 'no-root' | 'not-found' | 'stale' | 'invalid';

// ---------------------------------------------------------------- words

const DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const num = (s: string): number | null => (/^\d{1,2}$/.test(s) ? Number(s) : null);
const hhmm = (h: number, m: number): string => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

/** A cron in words, in UTC — the common shapes; anything else is shown as the expression itself. */
export function cronWords(expr: string): string {
  const f = expr.trim().split(/\s+/);
  const raw = `cron ${expr.trim()} (UTC)`;
  if (f.length !== 5) return raw;
  const [min, hour, dom, mon, dow] = f as [string, string, string, string, string];
  const every = /^\*\/(\d{1,2})$/.exec(min);
  if (every && hour === '*' && dom === '*' && mon === '*' && dow === '*') return `every ${Number(every[1])} minutes`;
  if (min === '0' && hour === '*' && dom === '*' && mon === '*' && dow === '*') return 'every hour, on the hour';
  const m = num(min);
  const h = num(hour);
  if (m === null || h === null || dom !== '*' || mon !== '*' || m > 59 || h > 23) return raw;
  const at = `at ${hhmm(h, m)} UTC`;
  if (dow === '*') return `every day ${at}`;
  if (dow === '1-5') return `weekdays ${at}`;
  if (dow === '0,6' || dow === '6,0') return `weekends ${at}`;
  const d = num(dow);
  if (d !== null && d <= 7) return `${DAYS[d % 7]} ${at}`;
  return raw;
}

/** `when` in words with its UTC reading. */
export function whenWords(when: AutoWhen): string {
  if ('cron' in when) return cronWords(when.cron);
  const d = new Date(when.at);
  return Number.isNaN(d.getTime()) ? `once, ${when.at}` : `once, ${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export const rangeWords = (r: AutoRange): string => (r === 'since-last-run' || r.kind === 'since-last-run' ? 'since the last run' : `from commit ${r.commit}`);

export const APPROVAL_WORDS: Record<ApprovalState, string> = {
  none: 'not approved on this machine — it will not run',
  approved: 'approved on this machine',
  changed: 'the file changed since it was approved — it will not run until approved again',
  unknown: 'not known — the bus that keeps the approvals cannot be reached; nothing runs meanwhile',
};

export const OUTCOME_GLYPH: Record<RunOutcome, string> = { started: '▶', ok: '✅', held: '⏸', skipped: '↷', refused: '🚫', failed: '❌' };

/** The bus schedule of an approved registration, in a line; nothing when there is none. */
export function scheduleLine(reg: Pick<AutoRegistration, 'schedule'>): string {
  const sc = reg.schedule;
  if (!sc) return '';
  const next = sc.next ? `next ${sc.next.slice(0, 16).replace('T', ' ')} UTC` : 'no next time';
  return `bus schedule ${sc.id} — ${sc.enabled ? next : 'disabled on the bus'}`;
}

/** One line of a registration's history. */
export function runLine(r: AutoRun): string {
  const when = r.at.slice(0, 16).replace('T', ' ');
  const detail = r.why ?? r.status ?? '';
  return `${OUTCOME_GLYPH[r.outcome]} ${when} UTC · ${r.outcome}${detail ? ` — ${detail}` : ''}`;
}

/** What a firing of this registration will do, as the Approve confirmation says it. */
export function willRun(reg: AutoRegistration): string[] {
  return [
    `Start the flow ${reg.flow} ${whenWords(reg.when)}`,
    `over the commits ${rangeWords(reg.range)}; a run later than ${reg.maxLate} is skipped`,
    'analysis only: it writes its run document under Plans/flows/runs/ and nothing else',
    ...(reg.notify ? [`and tell ${reg.notify} how it went`] : []),
  ];
}

export const shortHash = (hash: string): string => hash.slice(0, 12);

/** Approve is for an administrator, for a registration that is not already approved at its current hash. */
export const canApproveReg = (state: Pick<AutomationState, 'canApprove'>, reg: Pick<AutoRegistration, 'approval'>): boolean => state.canApprove && (reg.approval === 'none' || reg.approval === 'changed');
export const canRevokeReg = (state: Pick<AutomationState, 'canApprove'>, reg: Pick<AutoRegistration, 'approval'>): boolean => state.canApprove && (reg.approval === 'approved' || reg.approval === 'changed');

const REASON_WORDS: Partial<Record<AutoReason, string>> = {
  stale: 'The file changed since this page loaded: reload to see what it says now.',
  admin: 'Only the administrator sees and approves scheduled runs — sign in with mdhouse admin.',
  exposed: 'This mdhouse is open to the network: scheduled runs are managed only from the machine it runs on.',
  'no-root': 'That project is not served.',
  'not-found': 'That registration is gone.',
};
/** The page's words for a refusal; the server's own text for the rest (a bus that is off, a schedule it refused). */
export const autoReasonText = (reason: string | undefined, fallback: string): string => (reason && REASON_WORDS[reason as AutoReason]) || fallback;

/** The page: a flag on the project's own address, like `?git`, so it needs no server route. */
export const automationUrl = (rootId: string): string => `/${rootId}/?automation`;
/** Whether an address's query asks for it. */
export const onAutomation = (search: string): boolean => new URLSearchParams(search).has('automation');

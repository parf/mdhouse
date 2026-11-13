/** The Automation page's contract with the server (MW.11 slice 2) and the words it shows. */

export type ApprovalState = 'none' | 'approved' | 'changed';
export type RunOutcome = 'started' | 'skipped' | 'refused' | 'failed' | 'ok' | 'held';

export interface AutoRun {
  at: string;
  outcome: RunOutcome;
  why?: string;
  runPath?: string;
  status?: string;
}

export type AutoWhen = { cron: string } | { at: string };
export type AutoRange = 'since-last-run' | { kind: 'baseline'; commit: string };

export interface AutoRegistration {
  id: string;
  file: string;
  flow: string;
  range: AutoRange;
  when: AutoWhen;
  maxLate: string;
  overlap: 'skip';
  notify?: string;
  /** sha256 of the file's bytes — what an approval is of. */
  hash: string;
  approval: ApprovalState;
  approvedHash?: string;
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
}

export type AutoReason = 'viewer' | 'admin' | 'no-root' | 'not-found' | 'stale' | 'invalid' | 'not-decided';

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

export const rangeWords = (r: AutoRange): string => (r === 'since-last-run' ? 'since the last run' : `from commit ${r.commit}`);

export const APPROVAL_WORDS: Record<ApprovalState, string> = {
  none: 'not approved on this machine — it will not run',
  approved: 'approved on this machine',
  changed: 'the file changed since it was approved — it will not run until approved again',
};

export const OUTCOME_GLYPH: Record<RunOutcome, string> = { started: '▶', ok: '✅', held: '⏸', skipped: '↷', refused: '🚫', failed: '❌' };

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
export const canApproveReg = (state: Pick<AutomationState, 'canApprove'>, reg: Pick<AutoRegistration, 'approval'>): boolean => state.canApprove && reg.approval !== 'approved';
export const canRevokeReg = (state: Pick<AutomationState, 'canApprove'>, reg: Pick<AutoRegistration, 'approval'>): boolean => state.canApprove && reg.approval !== 'none';

const REASON_WORDS: Partial<Record<AutoReason, string>> = {
  stale: 'The file changed since this page loaded: reload to see what it says now.',
  admin: 'Only the administrator approves — sign in with mdhouse admin.',
  'no-root': 'That project is not served.',
  'not-found': 'That registration is gone.',
};
/** The page's words for a refusal; the server's own text for `not-decided` and the rest. */
export const autoReasonText = (reason: string | undefined, fallback: string): string => (reason && REASON_WORDS[reason as AutoReason]) || fallback;

/** The page: a flag on the project's own address, like `?git`, so it needs no server route. */
export const automationUrl = (rootId: string): string => `/${rootId}/?automation`;
/** Whether an address's query asks for it. */
export const onAutomation = (search: string): boolean => new URLSearchParams(search).has('automation');

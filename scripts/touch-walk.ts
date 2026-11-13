// bun scripts/touch-walk.ts <width> <height> <light|dark> <tag> [step…|all] — touch-emulated Chrome (:9333) walks the primary journey on a SCRATCH mdhouse (TW_BASE, default :7801; :7777 refused);
// TW_REPO = the scratch git repo it serves (README.md, notes/plan.md, qa-playground.md, an uncommitted change), TW_OUT = screenshot dir. Steps: nav doc qa edit diff commit ab rag folder kbd strip; search, nav4, automation (fake routes; TW_CAN=0 reads only), flow, flowbar, flowviewer, flowro (flowbar and flowviewer answer /api/flow/* and inject doc.flow with a fake; flow is the real round trip on a clean scratch repo (TW_PACKAGE = the flow, default recent-commits-review), flowro checks a read-only project).
// After every step scripts/touch-audit.js reports targets <44px (with hit area), cut-off, overlapping, covered, hover-only, <16px fields and horizontal scroll.
import { readFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const [W, H, scheme, tag, ...only] = process.argv.slice(2);
const w = Number(W), h = Number(H);
const base = process.env.TW_BASE ?? 'http://localhost:7801';
if (new URL(base).port === '7777') throw new Error('refusing :7777 — scratch instances only');
const OUT = process.env.TW_OUT ?? '/tmp/opencode/touch-walk';
const HERE = import.meta.dir;
mkdirSync(OUT, { recursive: true });
const tab = await (await fetch(`http://127.0.0.1:9333/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map<number, (v: any) => void>();
ws.onmessage = (e) => { const m = JSON.parse(e.data as string); if (m.id && pending.has(m.id)) pending.get(m.id)!(m.result ?? m.error); if (m.method === 'Fetch.requestPaused') fake(m.params); };
const send = (method: string, params: object = {}) => new Promise<any>((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
// The flow step answers /api/flow/* itself (a fake of the contract, stateful for the run bar) until the real routes are on main.
const bar: any = { version: 1, status: 'running', ev: 'missing', q: 'unanswered', events: [] as any[] };
const docFlow = () => ({ runId: 'r1', version: bar.version, status: bar.status, node: { id: 'review', title: 'Review the commits', outcomes: ['complete', 'blocked', 'failed'] }, holds: bar.q === 'unanswered' ? ['A required question is open'] : [], evidence: [{ label: 'git log', status: bar.ev, note: '', required: true }], questions: [{ id: 'Q1', title: 'Is the baseline right?', required: true, status: bar.q }], canAct: bar.status === 'running' || bar.status === 'held' });
const auto: any = { approved: false, can: process.env.TW_CAN !== '0' };
const autoState = () => ({ root: 'repo', canApprove: auto.can, errors: [{ file: 'bad.json', error: 'unknown key "command"' }], registrations: [{ id: 'weekly', file: '.mdhouse/automation/weekly.json', flow: 'recent-commits-review', range: 'since-last-run', when: { cron: '30 8 * * 1-5' }, maxLate: '1h', overlap: 'skip', notify: '#claude/x@host', hash: 'ab12cd34'.repeat(8), approval: auto.approved ? 'approved' : 'none', disabled: false, failures: 0, startedToday: 1, lastStartAt: new Date(Date.now() - 3600_000).toISOString(), runs: [{ at: '2026-11-13T08:30:05Z', outcome: 'refused', why: 'not approved' }, { at: '2026-11-12T08:30:05Z', outcome: 'started', status: 'held' }] }] });
const fake = async (p: any) => {
  if (new URL(p.request.url).pathname.startsWith('/api/automation')) {
    const path = new URL(p.request.url).pathname; let out: any = autoState();
    if (path.endsWith('/approve')) { auto.approved = true; out = { registration: 'weekly', approval: 'approved', hash: 'x' }; }
    if (path.endsWith('/revoke')) { auto.approved = false; out = { registration: 'weekly', approval: 'none' }; }
    return send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'application/json' }], body: Buffer.from(JSON.stringify(out)).toString('base64') });
  }
  if (p.responseStatusCode !== undefined && new URL(p.request.url).pathname === '/api/doc') {
    const r = await send('Fetch.getResponseBody', { requestId: p.requestId });
    const j = JSON.parse(r.base64Encoded ? Buffer.from(r.body, 'base64').toString() : r.body);
    if (j.rel === 'notes/plan.md') j.flow = docFlow();
    const headers = (p.responseHeaders ?? []).filter((h: any) => !/content-length|content-encoding/i.test(h.name));
    return send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: p.responseStatusCode, responseHeaders: headers, body: Buffer.from(JSON.stringify(j)).toString('base64') });
  }
  if (new URL(p.request.url).pathname === '/api/flow/event') {
    const b = JSON.parse(p.request.postData); bar.events.push(b);
    let status = 200; let out: any;
    if (b.expectedVersion !== bar.version) { status = 409; out = { error: 'moved', reason: 'stale' }; }
    else { bar.version++; const a = b.action; if (a.type === 'outcome') bar.status = a.outcome === 'complete' ? 'complete' : a.outcome; if (a.type === 'cancel') bar.status = 'cancelled'; if (a.type === 'evidence') bar.ev = a.status; if (a.type === 'question') bar.q = a.status; out = { status: bar.status, version: bar.version, url: '/repo/notes/plan.md' }; }
    return send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: status, responseHeaders: [{ name: 'content-type', value: 'application/json' }], body: Buffer.from(JSON.stringify(out)).toString('base64') });
  }
  if (p.request.url.includes('/api/doc')) return send('Fetch.continueRequest', { requestId: p.requestId });
  const u = new URL(p.request.url); const body = p.request.postData ? JSON.parse(p.request.postData) : {};
  let status = 200; let out: any = {};
  if (u.pathname === '/api/flow/catalog') out = { packages: [{ id: 'recent-commits-review', family: 'commit-review', title: 'Recent commits review', ranges: ['since-last-run', 'baseline'], lastRun: null, openRun: null }, { id: 'project-review', family: 'project', title: 'Project review', ranges: ['since-last-run', 'baseline'], lastRun: null, openRun: { url: '/repo/Plans/flows/runs/project-review/x.md', status: 'running' } }] };
  else if (u.pathname === '/api/flow/preview') { if (body.range.kind === 'since-last-run') { status = 409; out = { error: 'first', reason: 'no-baseline', why: 'first-run' }; } else out = { token: 't1', runPath: 'Plans/flows/runs/recent-commits-review/20261112-ab12cd34.md', base: 'a'.repeat(40), target: 'b'.repeat(40), dirty: ['README.md'], warnings: ['2 files are uncommitted and stay out of the range.'], html: '<h1>Flow analysis preview</h1><p>Unsaved. <b>Scope</b>: last 12 commits.</p><script>alert(1)</script><ul><li>README.md</li><li>notes/plan.md</li></ul>' }; }
  else if (u.pathname === '/api/flow/start') out = { status: 'running', runPath: 'x', url: '/repo/notes/plan.md' };
  send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: status, responseHeaders: [{ name: 'content-type', value: 'application/json' }], body: Buffer.from(JSON.stringify(out)).toString('base64') });
};
await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
await send('Page.enable'); await send('Runtime.enable');
if (only.includes('flowbar') || only.includes('flowviewer') || only.includes('automation')) await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/automation*' }, { urlPattern: '*/api/flow/*' }, { urlPattern: '*/api/doc*', requestStage: 'Response' }] });
const sleep = (ms: number) => Bun.sleep(ms);
export const ev = async (expression: string): Promise<any> => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r?.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed');
  return r?.result?.value;
};
let n = 0;
const log: string[] = [];
const say = (s: string) => { log.push(s); console.log(s); };
const shot = async (name: string) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const f = `${OUT}/${tag}-${w}-${scheme}-${String(++n).padStart(2, '0')}-${name}.png`;
  await Bun.write(f, Buffer.from(r.data, 'base64'));
  return f;
};
const AUDIT = readFileSync(`${HERE}/touch-audit.js`, 'utf8');
const audit = async (name: string) => {
  const r = JSON.parse(await ev(AUDIT));
  const f = await shot(name);
  say(`[${name}] ${f.split('/').pop()} sw=${r.sw}/${r.iw} small=${r.small.length} cut=${r.cut.length} overlap=${r.overlap.length} hidden=${r.hidden.length} covered=${r.covered.length} zoom=${r.zoom.length} drawer=${r.drawer}`);
  for (const k of ['small', 'cut', 'overlap', 'hidden', 'covered', 'zoom'] as const) for (const x of r[k].slice(0, 60)) say(`    ${k}: ${x}`);
  return r;
};
// a real tap at the centre of the first visible match; reports an element that would take it instead
const tap = async (sel: string, nth = 0) => {
  const r = await ev(`(() => { const all=[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e=>{const r=e.getBoundingClientRect(); return r.width>0&&r.height>0}); const e=all[${nth}]; if(!e) return null; e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); const cx=r.left+r.width/2, cy=r.top+r.height/2; const top=document.elementFromPoint(cx,cy); return {cx,cy,w:r.width,h:r.height,ok: top===e||e.contains(top)||(top&&top.contains(e)&&top!==document.body&&top!==document.documentElement), by: top? top.tagName.toLowerCase()+'.'+String(top.className).slice(0,30):null}; })()`);
  if (!r) { say(`  TAP ${sel}[${nth}]: not found`); return false; }
  if (!r.ok) say(`  TAP ${sel}: covered by ${r.by}`);
  if (r.h < 44 || r.w < 44) say(`  TAP ${sel}: ${Math.round(r.w)}x${Math.round(r.h)}`);
  await sleep(150);
  const rr = await ev(`(() => { const all=[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e=>{const r=e.getBoundingClientRect(); return r.width>0&&r.height>0}); const e=all[${nth}]; const r=e.getBoundingClientRect(); return [r.left+r.width/2, r.top+r.height/2]; })()`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rr[0], y: rr[1] }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(500);
  return true;
};
const type = async (text: string) => { await send('Input.insertText', { text }); await sleep(200); };
const go = async (path: string) => { await send('Page.navigate', { url: base + path }); await sleep(1800); };
const want = (s: string) => !only.length || only.includes(s) || only.includes('all');
const R = process.env.TW_REPO ?? '/tmp/opencode/journey/repo';
const read = (f: string) => readFileSync(`${R}/${f}`, 'utf8');

if (want('nav')) {
  await go('/repo/README.md');
  await audit('doc-closed-drawer');
  await tap('.topstrip .icon-btn[aria-label="Show sidebar"]');
  await audit('drawer-open');
  await tap('.sidebar button.row.dir', 0);
  await audit('drawer-folder-open');
  await tap('.sidebar a[href="/repo/notes/plan.md"]', 0);
  say(`  nav: tapped plan.md; location=${await ev('location.pathname')} drawer=${await ev("document.querySelector('.app').dataset.sidebar")}`);
}
if (want('head')) {
  await go('/repo/README.md');
  const r = await audit('doc-phone-header');
  say('  first heading top: ' + await ev(`Math.round(document.querySelector('.md h1, .md h2').getBoundingClientRect().top)`) + 'px; header controls: ' + await ev(`document.querySelectorAll('.doc-head :is(button,a[href],input)').length`));
  await tap('.doc-more', 0);
  await audit('doc-sheet');
  say('  sheet: ' + await ev(`[...document.querySelectorAll('.doc-sheet .icon-btn')].map(e=>e.textContent.trim()).join(' | ')`));
  await tap('.doc-sheet .icon-btn', 0);
  await tap('.doc-context > summary', 0);
  await audit('doc-context');
  say('  context: ' + await ev(`document.querySelector('.doc-context').open + ' commit btn visible: ' + !!document.querySelector('.doc-context .doc-commit .git-btn')`));
}
if (want('doc')) {
  await go('/repo/README.md');
  await audit('doc');
  await tap('.md input[type=checkbox]', 0);
  await sleep(600);
  say(`  task ticked on disk: ${/- \[x\] first task/.test(read('README.md'))}`);
  await tap('.md .heading-more', 0);
  await audit('heading-menu');
  await tap('.md .heading-menu .heading-add', 0);
  await audit('heading-add-form');
  await tap('.md .add-kind', 0);
  await audit('heading-add-kind');
}
if (want('qa')) {
  await go('/repo/qa-playground.md');
  await audit('qa-doc');
  await tap('.md .g-btn:not(.dis)', 0);
  await audit('qa-form');
  say('  qa form buttons: ' + await ev(`[...document.querySelectorAll('.qa-edit .bar button, .qa-edit .bar label')].filter(e=>e.getBoundingClientRect().height>0).map(e=>e.textContent.trim()).join(' | ')`));
  await tap('.qa-edit .bar .more', 0);
  await audit('qa-form-more');
  await tap('.qa-edit .bar .more', 0);
  await tap('.qa-edit textarea', 0);
  await type('Answered from the touch walk.');
  await audit('qa-form-typed');
  await tap('.qa-edit .bar .save', 0);
  await sleep(900);
  say(`  answer on disk: ${read('qa-playground.md').includes('Answered from the touch walk.')}`);
  await audit('qa-after');
}
if (want('edit')) {
  await go('/repo/notes/plan.md');
  await audit('plan-doc');
  await tap('.doc-edit-btn', 0);
  await sleep(1200);
  await audit('editor-open');
  await tap('.cm-content', 0);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'End', code: 'End', windowsVirtualKeyCode: 35, modifiers: 2 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'End', code: 'End', modifiers: 2 });
  await type('\n\nEdited on a phone.\n');
  await audit('editor-typed');
  await tap('.doc-editor-save', 0);
  await sleep(900);
  say(`  edit on disk: ${read('notes/plan.md').includes('Edited on a phone.')}`);
  await audit('editor-saved');
}
if (want('diff')) {
  await go('/repo/README.md');
  await audit('doc-uncommitted');
  await tap('button.uncommitted', 0);
  await sleep(700);
  await audit('diff');
  say('  diff view: ' + await ev(`(document.querySelector('.diff, .doc-diff, [class*=diff]')||{}).className||'none'`));
}
if (want('commit')) {
  await go('/repo/README.md');
  await audit('commit-doc');
  // The document's status chip opens Changes scoped to it; the commit happens there.
  await tap('.status-chip', 0);
  await sleep(800);
  await audit('commit-open');
  await tap('.changes-message', 0);
  await type('touch walk commit');
  await audit('commit-typed');
  await tap('.changes-commit-btn', 0);
  await sleep(1200);
  say('  git log: ' + execSync(`git -C ${R} log --oneline -2`).toString().replace(/\n/g, ' | '));
  await audit('commit-done');
  await go('/repo/?git=changes');
  await audit('changes');
}
if (want('ab')) {
  await go('/repo/README.md');
  if (await ev("!!document.querySelector('.doc-more')")) { await tap('.doc-more', 0); await tap('.doc-sheet .ab-btn', 0); } else await tap('.ab-btn', 0);
  await sleep(900);
  await audit('ab-panel');
  await tap('.ab-pick', 0);
  await audit('ab-pick');
  await tap('.ab-pick', 0);
  await tap('.ab-panel textarea', 0);
  await type('please review');
  await audit('ab-typed');
  await tap('.ab-panel button.default', 0);
  await sleep(1800);
  say('  ab reply shown: ' + await ev(`document.querySelector('.ab-log')?.innerText.includes('I read the page')`));
  await audit('ab-sent');
}
if (want('rag')) {
  await go('/repo/README.md');
  await tap('.topstrip .rag-btn, .side-head .rag-btn', 0);
  say(`  rag location=${await ev('location.pathname+location.search')}`);
  await audit('rag');
  await tap('input.rag-q', 0);
  await type('notes');
  await tap('.rag-form button[type=submit]', 0);
  await sleep(1200);
  await audit('rag-results');
  await tap('.rag-src', 0);
  say(`  hit opened: ${await ev('location.pathname+location.hash')}`);
  await audit('rag-hit-doc');
}
if (want('folder')) { await go('/repo/notes/'); await audit('folder'); }

if (want('kbd')) {
  await go('/repo/README.md');
  await ev("document.querySelector('.md input.task-checkbox:not(:checked)').focus(); 1");
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await sleep(900);
  say(`  keyboard tick on disk: ${/- \[x\] (first|second) task/.test(read('README.md'))}`);
  await audit('kbd-after');
}
if (want('strip')) {
  await go('/repo/qa-playground.md');
  await audit('strip-collapsed');
  say('  strip: ' + await ev(`document.querySelector('.qa-strip')?.className + ' h=' + Math.round(document.querySelector('.qa-strip').getBoundingClientRect().height)`));
  await tap('.qa-toggle', 0);
  await audit('strip-open');
  say('  strip open h=' + await ev(`Math.round(document.querySelector('.qa-strip').getBoundingClientRect().height)`));
  await tap('.qa-strip .qa-chips .chip', 2);
  await audit('strip-filtered');
  say('  strip after pick: ' + await ev(`document.querySelector('.qa-toggle').textContent + ' hidden rows=' + document.querySelectorAll('.qa-hide').length + ' expanded=' + document.querySelector('.qa-toggle').getAttribute('aria-expanded')`));
}

if (only.includes('flow')) {
  // The whole round trip on the real routes: Run flow -> preview -> confirm -> evidence -> Complete at each step ->
  // the report records last-commit-id = the run's target -> the next "since the last run" starts there. Needs a clean scratch repo.
  const pk = process.env.TW_PACKAGE ?? 'recent-commits-review';
  const pick = async () => { await ev(`(() => { const s = document.querySelector('.flow-dialog select'); s.value = ${JSON.stringify(pk)}; s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(300); };
  const first = execSync(`git -C ${R} rev-list --max-parents=0 HEAD`).toString().trim().slice(0, 8);
  await go('/repo/?git');
  await audit('home');
  await tap('.flow-btn', 0);
  say('  flows listed: ' + await ev("[...document.querySelectorAll('.flow-dialog select option')].map(o => o.value).join(', ')"));
  await pick();
  await audit('flow-dialog');
  await tap('.flow-opt input', 0);
  await tap('.flow-go', 0);
  await audit('flow-no-baseline');
  say('  note: ' + await ev("document.querySelector('.flow-note')?.textContent"));
  await tap('.flow-commit', 0);
  await type(first);
  await tap('.flow-go', 0);
  await audit('flow-preview');
  say('  script in pane: ' + await ev("!!document.querySelector('.flow-html script')") + ' items: ' + await ev("document.querySelectorAll('.flow-html li').length"));
  await tap('.flow-go.primary', 0);
  await sleep(1500);
  say('  run document: ' + await ev('location.pathname') + '; dialog open: ' + await ev("!!document.querySelector('.flow-dialog')"));
  await audit('flow-run');
  for (let i = 0; i < 6; i++) {
    const idx = await ev(`[...document.querySelectorAll('.flow-mini')].findIndex(b => b.textContent.trim() === 'Mark supplied')`);
    if (idx < 0) break;
    await tap('.flow-text', 0);
    await type('Checked in the run document and the commits.');
    await tap('.flow-mini', idx);
    await sleep(900);
  }
  await audit('flow-evidence');
  for (let i = 0; i < 10 && await ev("!!document.querySelector('.flow-bar')"); i++) {
    say('  step: ' + await ev("document.querySelector('.flow-node')?.textContent + ' / ' + document.querySelector('.flow-status')?.textContent"));
    await tap('.flow-text', 0);
    await type('Reviewed the range; no findings.');
    await tap('.flow-bar-actions .flow-go.primary', 0);
    await sleep(1500);
  }
  say('  bar after the last step: ' + await ev("!!document.querySelector('.flow-bar')"));
  await audit('flow-done');
  const head = execSync(`git -C ${R} rev-parse HEAD`).toString().trim();
  const report = read(`Plans/flows/${pk}.md`);
  say(`  report last-commit-id = HEAD: ${report.includes('last-commit-id: ' + head)}`);
  execSync(`git -C ${R} add -A && git -C ${R} -c user.email=t@t -c user.name=t commit -qm "after the run"`);
  await go('/repo/?git');
  await tap('.flow-btn', 0);
  await pick();
  say('  next range preselected: ' + await ev("document.querySelector('.flow-opt input:checked')?.parentElement?.textContent.trim()"));
  await tap('.flow-go', 0);
  const newHead = execSync(`git -C ${R} rev-parse HEAD`).toString().trim();
  say('  next preview: ' + await ev("document.querySelector('.flow-where')?.textContent") + '  (HEAD ' + newHead.slice(0, 8) + ', previous ' + head.slice(0, 8) + ')');
  await audit('flow-next');
}
if (only.includes('flowbar')) {
  await go('/repo/notes/plan.md');
  await audit('flowbar');
  say('  bar: ' + await ev("document.querySelector('.flow-bar')?.innerText.replace(/\\n/g,' | ')"));
  await tap('.flow-text', 0);
  await type('Seen.');
  await tap('.flow-items .flow-mini', 0);
  await tap('.flow-text', 0);
  await type('Seen.');
  await tap('.flow-items .flow-mini', 1);
  await audit('flowbar-asserted');
  say('  bar after assertions: ' + await ev("document.querySelector('.flow-bar')?.innerText.replace(/\\n/g,' | ')"));
  await tap('.flow-bar-actions .flow-go', 1);
  say('  blocked without a note: ' + await ev("document.querySelector('.flow-error')?.textContent"));
  await tap('.flow-text', 0);
  await type('Reviewed all of it.');
  await audit('flowbar-typed');
  await tap('.flow-bar-actions .flow-go.primary', 0);
  await sleep(700);
  say('  after Complete: bar shown ' + await ev("!!document.querySelector('.flow-bar')") + '; events sent: ' + JSON.stringify(bar.events.map((e: any) => e.action.type + (e.action.outcome ? ':' + e.action.outcome : ''))));
}
if (only.includes('flowviewer')) {
  await go('/repo/?git');
  say('  viewer: ' + await ev("document.body.innerText.includes('Viewer')") + '; Run flow button: ' + await ev("!!document.querySelector('.flow-btn')"));
  await go('/repo/notes/plan.md');
  say('  doc.flow injected with canAct=true; flow bar: ' + await ev("!!document.querySelector('.flow-bar')"));
  await audit('viewer-run-doc');
  if (process.env.TW_RUN) {
    await go(process.env.TW_RUN);
    say('  real open run document: flow bar ' + await ev("!!document.querySelector('.flow-bar')") + '; doc has flow.canAct ' + await ev("fetch('/api/doc?p=' + location.pathname.slice(1)).then(r => r.json()).then(j => JSON.stringify(j.flow && { status: j.flow.status, canAct: j.flow.canAct }))"));
  }
}
if (only.includes('flowro')) {
  await go('/repo/?git');
  say('  writable project: Run flow button: ' + await ev("!!document.querySelector('.flow-btn')"));
  await go('/ro/?git');
  say('  read-only project: Run flow button: ' + await ev("!!document.querySelector('.flow-btn')") + ' (page: ' + await ev("location.pathname") + ')');
}
if (only.includes('search')) {
  await go('/repo/README.md');
  await tap('.icon-btn[title^="Search"]', 0);
  await sleep(500);
  say('  scope switch: ' + await ev("[...document.querySelectorAll('.scope-opt')].map(b => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(' ')"));
  await audit('search-files');
  await tap('.scope-opt', 1);
  await tap('[data-search-input]', 0);
  await type('notes');
  say('  index hint: ' + await ev("document.querySelector('.side-body .empty')?.textContent"));
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(1200);
  say('  after Enter: ' + await ev('location.pathname + location.search') + '; page switch: ' + await ev("[...document.querySelectorAll('main .scope-opt')].map(b => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(' ')"));
  await audit('search-index');
  await tap('main .scope-opt', 0);
  await sleep(1000);
  say('  back to Files: ' + await ev('location.pathname') + '; sidebar field: ' + await ev("document.querySelector('[data-search-input]')?.value") + '; scope: ' + await ev("[...document.querySelectorAll('.sidebar .scope-opt')].map(b => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(' ')"));
  await audit('search-files-again');
}
if (only.includes('nav4')) {
  await go('/repo/README.md');
  say('  bar: ' + await ev("[...document.querySelectorAll('.phone-nav .nav-dest')].map(b => b.textContent.trim() + (b.classList.contains('on') ? '*' : '')).join(' | ') || 'none'"));
  say('  Changes badge: ' + await ev("document.querySelector('.nav-badge')?.textContent ?? 'none'"));
  await audit('nav4-doc');
  await tap('.phone-nav .nav-dest', 0);
  say('  Files: drawer ' + await ev("document.querySelector('.app').dataset.sidebar"));
  await audit('nav4-files');
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: w - 20, y: 400 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(400);
  say('  scrim closes the drawer: ' + await ev("document.querySelector('.app').dataset.sidebar"));
  await tap('.phone-nav .nav-dest', 2);
  await sleep(500);
  say('  Search: drawer ' + await ev("document.querySelector('.app').dataset.sidebar") + '; field focused ' + await ev("document.activeElement?.matches('[data-search-input]')") + '; bar hidden while typing ' + await ev("!document.querySelector('.phone-nav')"));
  await audit('nav4-search');
  await go('/repo/README.md');
  await tap('.phone-nav .nav-dest', 3);
  await sleep(700);
  say('  Ask: panel ' + await ev("!!document.querySelector('.ab-panel')") + '; bar hidden while its field has the keyboard ' + await ev("!document.querySelector('.phone-nav')"));
  await audit('nav4-ask');
  await tap('.ab-panel .icon-btn[aria-label=Close]', 0);
  await go('/repo/?git=changes');
  say('  Changes: ' + await ev('location.pathname + location.search') + '; current ' + await ev("document.querySelector('.phone-nav .nav-dest.on')?.textContent.trim()"));
  await tap('.phone-nav .nav-dest', 1);
  await audit('nav4-changes');
}
if (only.includes('automation')) {
  // The routes are a fake (stateful); TW_CAN=0 is a session that may only read.
  await go('/repo/?automation');
  say('  page: ' + await ev("document.querySelector('.auto h1')?.textContent + ' | regs ' + document.querySelectorAll('.auto-reg').length + ' | file errors ' + document.querySelectorAll('.auto-file-error').length"));
  say('  words: ' + await ev("[...document.querySelectorAll('.auto-facts dd')].slice(0,2).map(d => d.textContent.trim()).join(' / ')"));
  await audit('automation');
  const buttons = await ev("[...document.querySelectorAll('.auto-actions .rag-act')].map(b => b.textContent.trim()).join(' | ') || 'none'");
  say('  buttons: ' + buttons);
  if (buttons !== 'none') {
    await tap('.auto-actions .rag-act', 0);
    say('  confirm: ' + await ev("[...document.querySelectorAll('.auto-confirm li')].map(l => l.textContent).join(' ; ')"));
    await audit('automation-confirm');
    await tap('.auto-confirm .rag-act.primary', 0);
    await sleep(900);
    say('  after approve: ' + await ev("document.querySelector('.auto-state')?.textContent + ' | buttons ' + [...document.querySelectorAll('.auto-actions .rag-act')].map(b => b.textContent.trim()).join(' | ')"));
    await audit('automation-approved');
    await tap('.auto-actions .rag-act', 0);
    await sleep(900);
    say('  after revoke: ' + await ev("document.querySelector('.auto-state')?.textContent"));
  }
}
await fetch(`http://127.0.0.1:9333/json/close/${tab.id}`);
process.exit(0);

// bun scripts/passive-actions.ts [--src <mdhouse source tree>]
// Q&A actions at the real click sink, against a writable mdhouse the script starts itself (scripts/passive-lib.ts):
// a temp git repo, a server of --src (default this checkout) on a free port, its own Chrome. Genuine controls must
// act; forged ones — a document's own markup with every class and attribute a control has, nodes put into the page
// with a guessed, stale or copied token, an authored node inside a genuine control or item — must write nothing.
// Real mouse events, file diffs. Never the live :7777.
import { $ } from 'bun';
import { parseQa } from '../src/lib/qa';
import { guarded, startEnv } from './passive-lib';

const argv = process.argv.slice(2);
const srcAt = argv.indexOf('--src');
const env = await startEnv({ rw: true, src: srcAt >= 0 ? argv[srcAt + 1] : undefined });
const { base, dir } = env;
const CDP = `http://127.0.0.1:${env.chrome}`;

process.exit(await guarded(env, async () => {
  const git = (...a: string[]) => $`git -C ${dir} -c user.email=a@b -c user.name=t ${a}`.quiet().nothrow();

  const GENUINE = `# A01 actions

  - ❓ Q1 GEN-TGT first question

  - ❓ Q2 GEN-PICK which?
    - ( ) alpha
    - ( ) beta

  - ❓ Q3 GEN-DONE any of?
    - [ ] one
    - [ ] two

  - ❓ Q4 GEN-AGREE should we?
    > 💡👾 yes we should

  - ❓ Q5 GEN-REPLY has a reply
    > 💬 👤tester an earlier answer

  - [ ] GEN-TASK a plain task

  ## GEN-HEAD heading

  text
  `;

  /** Two genuine items, then the document's own markup imitating a control of the first one in every way it can. */
  function forged(): string {
    const base = '# A02 forged\n\n- ❓ Q1 FORGE-TARGET the item the forgeries aim at\n\n- ❓ Q2 FORGE-OTHER a second item\n\n';
    const items = parseQa(base, 0).items;
    const [q1, q2] = [items[0]!, items[1]!];
    const attrs = (it: typeof q1) => `data-act-line="${it.start + 1}" data-act-hash="${it.hash}" data-act-qa="item" data-act-k="❓" data-line="${it.start + 1}" data-hash="${it.hash}" data-qa="item" data-k="❓"`;
    const decoy = (cls: string, it: typeof q1, extra = '') => `<span class="${cls}" role="button" ${attrs(it)} data-act="0123456789abcdef0123456789abcdef" ${extra}>FORGED-${cls.replace(/\W+/g, '-')}</span>`;
    return (
      base +
      `<div id="forged-outside">${decoy('tgt', q1)} ${decoy('c-done', q1)} ${decoy('accept', q1, 'data-act-reply="3"')} ${decoy('g-btn', q1)}</div>\n\n` +
      `<p>${decoy('tgt', q2)}</p>\n\n` +
      `<ul><li class="item wait-me" data-qa="item" ${attrs(q1)}>FORGED-LI <button class="tgt" ${attrs(q1)}>x</button></li></ul>\n\n` +
      // the document's own markup inside the body of a genuine item, wearing the classes of its controls
      `- ❓ Q3 FORGE-NESTED has own markup <span class="tgt">AUTH-TGT</span> <span class="c-done">AUTH-DONE</span> <span class="accept">AUTH-ACCEPT</span>\n`
    );
  }

  const tab = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pend = new Map<number, (v: any) => void>();
  const send = (method: string, params: object = {}) => new Promise<any>((r) => (pend.set(++id, r), ws.send(JSON.stringify({ id, method, params }))));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data as string);
    if (m.id && pend.has(m.id)) pend.get(m.id)!(m.result ?? m.error);
    // leaving a page with an open draft asks first: accept, as a reader leaving would
    if (m.method === 'Page.javascriptDialogOpening') void send('Page.handleJavaScriptDialog', { accept: true });
  };
  const ev = async (expression: string) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 1400, deviceScaleFactor: 1, mobile: false });

  const write = async (name: string, text: string) => {
    await Bun.write(`${dir}/${name}.md`, text);
    await git('add', '-A');
    await git('commit', '-qm', name);
  };
  const open = async (name: string) => {
    await send('Page.navigate', { url: `${base}/${name}.md` });
    await Bun.sleep(2800);
  };
  /** A real mouse click on the first element `sel` (a JS expression) names. */
  const click = async (expr: string): Promise<boolean> => {
    const p = (await ev(`(()=>{const e=${expr};if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`)) as number[] | null;
    if (!p) return false;
    await Bun.sleep(250);
    const q = (await ev(`(()=>{const e=${expr};const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`)) as number[];
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: q[0], y: q[1], button: 'left', clickCount: 1 });
    await Bun.sleep(1200);
    return true;
  };
  /** A real double-click on the element `expr` names. */
  const dblclick = async (expr: string): Promise<boolean> => {
    const p = (await ev(`(()=>{const e=${expr};if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`)) as number[] | null;
    if (!p) return false;
    await Bun.sleep(250);
    const q = (await ev(`(()=>{const r=(${expr}).getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`)) as number[];
    for (const clickCount of [1, 2]) for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: q[0], y: q[1], button: 'left', clickCount });
    await Bun.sleep(1200);
    return true;
  };
  const text = async (name: string) => Bun.file(`${dir}/${name}.md`).text();
  const restore = async (name: string) => {
    await git('checkout', '--', `${name}.md`);
    await Bun.sleep(400);
  };
  /** The li whose text has `needle` (the item's own line, not a nested one). */
  const li = (needle: string) => `[...document.querySelectorAll('.md li.item')].find((l)=>l.textContent.includes(${JSON.stringify(needle)}))`;
  const formOpen = () => ev(`!!document.querySelector('.md .qa-edit textarea, .md .add-editor textarea')`);

  let bad = 0;
  const report = (ok: boolean, name: string, detail = '') => {
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' ' + detail}`);
  };

  // ── genuine controls act ──
  await write('A01-actions', GENUINE);
  await open('A01-actions');
  const A = 'A01-actions';
  let before = await text(A);
  await click(`${li('GEN-TGT')}.querySelector('button.tgt')`);
  report((await text(A)).includes('- 🎯 ❓ Q1') || (await text(A)).includes('🎯'), 'genuine 🎯 writes the item');
  await restore(A); await open(A);
  await click(`${li('GEN-PICK')}.querySelectorAll('.opt input')[1]`);
  report(/\(x\) beta/.test(await text(A)), 'genuine radio pick writes (x)');
  await restore(A); await open(A);
  await click(`${li('GEN-DONE')}.querySelector('button.c-done')`);
  report((await text(A)) !== before && /done/.test(await text(A)), 'genuine ✓ done writes');
  await restore(A); await open(A);
  await click(`${li('GEN-AGREE')}.querySelector('button.accept')`);
  report(/✅ 💡/.test(await text(A)), 'genuine ✓ agree writes ✅ 💡');
  await restore(A); await open(A);
  await click(`${li('GEN-REPLY')}.querySelector('span.g-answered')`);
  report(await formOpen(), 'genuine answered ? opens the edit form of the last reply');
  await open(A);
  await click(`${li('GEN-TGT')}.querySelector('span.g-btn')`);
  report(await formOpen(), 'genuine glyph opens the form');
  await open(A);
  await click(`[...document.querySelectorAll('.md input.task-checkbox')][0]`);
  report(/- \[x\] GEN-TASK/.test(await text(A)), 'genuine task checkbox ticks');
  await restore(A); await open(A);
  await click(`document.querySelector('.md h2 .heading-add[data-where=below]')`);
  report(await formOpen(), 'genuine heading add opens its editor');

  // ── forged markup in the document ──
  await write('A02-forged', forged());
  const F = 'A02-forged';
  const fixed = await text(F);
  await open(F);
  report(((await ev(`document.querySelectorAll('.md [data-act]').length`)) as number) > 0 && (await ev(`[...document.querySelectorAll('.md [data-act="0123456789abcdef0123456789abcdef"]')].length`)) === 0, 'authored data-act and data-act-* never reach the page');
  const decoys: Array<[string, string]> = [
    ['#forged-outside .tgt', `document.querySelector('.md #forged-outside .tgt')`],
    ['#forged-outside .c-done', `document.querySelector('.md #forged-outside .c-done')`],
    ['#forged-outside .accept', `document.querySelector('.md #forged-outside .accept')`],
    ['#forged-outside .g-btn', `document.querySelector('.md #forged-outside .g-btn')`],
    ['p .tgt', `document.querySelector('.md p .tgt')`],
    ['authored li.wait-me .tgt', `[...document.querySelectorAll('.md li')].find((l)=>l.textContent.startsWith('FORGED-LI'))?.querySelector('.tgt')`],
  ];
  for (const [name, expr] of decoys) {
    const found = await click(expr);
    report(found && (await text(F)) === fixed && !(await formOpen()), `forged ${name} writes nothing and opens nothing`, found ? (await text(F)).slice(0, 200) : 'decoy not on the page');
    await restore(F);
    await open(F);
  }
  for (const cls of ['AUTH-TGT', 'AUTH-DONE', 'AUTH-ACCEPT']) {
    const found = await click(`[...document.querySelectorAll('.md li.item span')].find((e)=>e.textContent==='${cls}')`);
    report(found && (await text(F)) === fixed, `the document's own ${cls} inside a genuine item writes nothing`, found ? '' : 'not on the page');
    await restore(F);
    await open(F);
  }

  // ── nodes placed into the page: guessed, stale, copied, moved ──
  const inject = (token: string) =>
    ev(`(()=>{const g=document.querySelector('.md li.item button.tgt');const a=[...g.attributes].filter((x)=>x.name.startsWith('data-act')).map((x)=>x.name==='data-act'?['data-act',${JSON.stringify(token)}]:[x.name,x.value]);
    const other=${li('FORGE-OTHER')};const b=document.createElement('button');b.className='tgt';b.id='planted';for(const [k,v] of a)b.setAttribute(k,v);other.append(b);return a.length})()`);
  const mine = (await ev(`document.querySelector('.md li.item button.tgt').dataset.act`)) as string;
  await inject('f'.repeat(32));
  await click(`document.getElementById('planted')`);
  report((await text(F)) === fixed, 'a control with a guessed token writes nothing');
  await restore(F);
  await open(F);
  await inject(mine);
  await open(F); // the render changed: `mine` is now an old token
  const live = (await ev(`document.querySelector('.md li.item button.tgt').dataset.act`)) as string;
  await inject(mine);
  await click(`document.getElementById('planted')`);
  report(live !== mine && (await text(F)) === fixed, 'a control with a stale token (an earlier render) writes nothing');
  await restore(F);
  await open(F);
  await ev(`(()=>{const q1=${li('FORGE-TARGET')};const q2=${li('FORGE-OTHER')};const t=q2.querySelector('button.tgt');t.id='moved';q1.append(t)})()`);
  await click(`document.getElementById('moved')`);
  const t = await text(F);
  const lines = t.split('\n');
  report(!lines.find((l) => l.includes('FORGE-TARGET'))!.includes('🎯'), 'a genuine control moved into another item never acts on the item it stands in');
  await restore(F); await open(F);

  // ── authored nodes inside genuine controls and items: the control itself must be what was clicked ──
  await open(A);
  for (const [name, ctl] of [['🎯', "button.tgt"], ['✓ done', 'button.c-done'], ['✓ agree', 'button.accept']] as const) {
    const host = ctl === 'button.tgt' ? li('GEN-TGT') : ctl === 'button.c-done' ? li('GEN-DONE') : li('GEN-AGREE');
    await ev(`(()=>{const b=${host}.querySelector('${ctl}');const s=document.createElement('span');s.id='inside';s.textContent='x';b.append(s)})()`);
    const found = await click(`document.getElementById('inside')`);
    report(found && (await text(A)) === GENUINE, `a node inside the genuine ${name} button acts as nothing`, found ? (await text(A)).slice(0, 160) : 'not on the page');
    await restore(A);
    await open(A);
  }
  await ev(`(()=>{const l=${li('GEN-TGT')};const s=document.createElement('span');s.id='insideLi';s.textContent='own text';l.querySelector('.h-t, .t, .head')?.append(s)})()`);
  const dbl = await dblclick(`document.getElementById('insideLi')`);
  report(dbl && !(await text(A)).includes('🎯'), 'a double-click on text inside a genuine item does not select it');
  await restore(A);
  await open(A);
  await dblclick(`${li('GEN-TGT')}.querySelector('span.g-btn')`);
  report((await text(A)).includes('🎯'), 'a double-click on the genuine glyph selects the item');
  await restore(A);
  await open(A);

  // ── the markers stay out of the file and out of Copy ──
  await open(A);
  const token = (await ev(`document.querySelector('.md [data-act]').dataset.act`)) as string;
  const copied = (await ev(`(()=>{const r=document.createRange();r.selectNodeContents(document.querySelector('.md'));const s=getSelection();s.removeAllRanges();s.addRange(r);return s.toString()})()`)) as string;
  report(!copied.includes(token) && !copied.includes('data-act'), 'the token is not in the copied text');
  await click(`${li('GEN-TGT')}.querySelector('button.tgt')`);
  report(!(await text(A)).includes('data-act') && !(await text(A)).includes(token), 'a write puts no marker in the file');
  await restore(A);

  // ── drafts survive a live re-render and a document switch ──
  await open(A);
  await click(`${li('GEN-TGT')}.querySelector('span.g-btn')`);
  await ev(`(()=>{const t=document.querySelector('.md .qa-edit textarea');t.focus()})()`);
  await send('Input.insertText', { text: 'my unsent draft' });
  await Bun.write(`${dir}/${A}.md`, GENUINE + '\nan external edit\n'); // the file changes under the open form: the page re-renders
  await Bun.sleep(2500);
  report((await ev(`document.querySelector('.md .qa-edit textarea')?.value`)) === 'my unsent draft', 'a draft survives a live re-render of the document');
  const tokenAfter = (await ev(`document.querySelector('.md [data-act]')?.dataset.act`)) as string;
  report(tokenAfter !== token, 'the re-render brought a new token');
  await click(`${li('GEN-PICK')}.querySelector('button.tgt')`);
  report((await text(A)).includes('🎯'), 'a genuine control acts after a re-render (new token, new DOM, same payload)');
  await git('checkout', '--', `${A}.md`);

  // a draft is kept when the reader switches documents and comes back, and the controls still act
  await open(A);
  await click(`${li('GEN-TGT')}.querySelector('span.g-btn')`);
  await ev(`document.querySelector('.md .qa-edit textarea').focus()`);
  await send('Input.insertText', { text: 'draft across documents' });
  // in-app navigation, as a reader clicking the tree does (a page load would drop the draft by design)
  await ev(`[...document.querySelectorAll('a[href]')].find((a)=>a.getAttribute('href').endsWith('/README.md'))?.click()`);
  await Bun.sleep(1800);
  await ev(`[...document.querySelectorAll('a[href]')].find((a)=>a.getAttribute('href').endsWith('/A01-actions.md'))?.click()`);
  await Bun.sleep(2200);
  report((await ev(`document.querySelector('.md .qa-edit textarea')?.value`)) === 'draft across documents', 'a draft survives switching to another document and back');
  await ev(`document.querySelector('.md .qa-edit textarea').value=''`);
  await click(`${li('GEN-PICK')}.querySelector('button.tgt')`);
  report((await text(A)).includes('🎯'), 'a genuine control acts after switching documents');
  await git('checkout', '--', `${A}.md`);

  console.log(bad ? `${bad} action check(s) failed` : 'actions: genuine controls act, forged and moved ones write nothing');
  await fetch(`${CDP}/json/close/${tab.id}`);
  return bad ? 1 : 0;
}));

// bun scripts/passive-corpus.ts [--src <mdhouse source tree>] [name prefixes…]
// Hostile and passive documents against an mdhouse the script starts itself (scripts/passive-lib.ts over scripts/safe-smoke.ts): a temp repo
// with the fixtures, a server of --src (default this checkout) on a free port, its own Chrome and probe listener.
// Each document loads in a fresh tab. A handler a document writes pushes its id onto window.__pwned; the probe
// listener counts requests the page was tricked into making. Exit 1 on any hit. Never the live :7777.
import { readdirSync } from 'node:fs';
import { startEnv } from './passive-lib';

const args = process.argv.slice(2);
const srcAt = args.indexOf('--src');
const src = srcAt >= 0 ? args.splice(srcAt, 2)[1] : undefined;
const only = args;
const dir = new URL('./passive-corpus/', import.meta.url).pathname;
const env = await startEnv({ fixtures: dir, src });
const { base, probes } = env;
const CDP = `http://127.0.0.1:${env.chrome}`;
const pick = (names: string[]) => names.filter((n) => !only.length || only.some((o) => n.startsWith(o)));
const docs = pick(readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('F')).map((f) => f.slice(0, -3)).sort());
const positives = pick(readdirSync(`${dir}positive/`).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort());

async function one(name: string, positive = false) {
  const before = probes.length;
  const tab = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pend = new Map<number, (v: any) => void>();
  const send = (method: string, params: object = {}) => new Promise<any>((r) => (pend.set(++id, r), ws.send(JSON.stringify({ id, method, params }))));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data as string);
    if (m.id && pend.has(m.id)) pend.get(m.id)!(m.result ?? m.error);
    if (m.method === 'Page.javascriptDialogOpening') void send('Page.handleJavaScriptDialog', { accept: true });
  };
  const ev = async (expression: string) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__pwned=[];window.pwn=()=>window.__pwned.push("callback");' });
  await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${base}/${positive ? 'positive/' : ''}${name}.md` });
  await Bun.sleep(3500);
  await ev(`(()=>{const b=document.querySelector('.md');if(!b)return;for(const e of b.querySelectorAll('#lnk, #fb, a[href^="javascript"], svg a, .mermaid a')){try{e.click()}catch{}}})()`);
  await Bun.sleep(1200);
  const r = await ev(`(()=>{const b=document.querySelector('.md');return {pwned:window.__pwned,page:!!b,forbidden:b?b.querySelectorAll('iframe,object,embed,form,base,meta,link,style,script,svg').length:0,handlers:b?[...b.querySelectorAll('*')].filter(e=>[...e.attributes].some(a=>/^on/i.test(a.name))).length:0,mermaid:b?[...b.querySelectorAll('pre.mermaid')].map(p=>({img:p.querySelectorAll('img').length,error:p.dataset.rendered==='error'})):[]}})()`);
  // what a passive document must keep: its own classes and the styles the contract allows, by computed value
  const kept = positive
    ? await ev(`(()=>{const q=(i)=>document.getElementById(i);const c=(i,p)=>getComputedStyle(q(i))[p];const tok=[...document.querySelectorAll('.md pre code span[style]')];return {
      red:c('a','color')==='rgb(255, 0, 0)',bold:Number(c('b','fontWeight'))>=700,bg:c('c','backgroundColor')==='rgb(255, 238, 238)',cls:q('d')?.classList.contains('custom')&&q('d').classList.contains('other'),
      fixedDropped:c('e','position')==='static',rgb:c('f','color')==='rgb(10, 20, 30)',centre:c('g','textAlign')==='center',urlDropped:c('h','backgroundImage')==='none'&&c('h','color')==='rgb(0, 0, 255)',italicUnderline:c('i','fontStyle')==='italic'&&c('i','textDecorationLine')==='underline'}})()`).catch(() => null)
    : null;
  const edge = positive && name === 'P03-style-edge-cases'
    ? await ev(`(()=>{const c=(i,p)=>getComputedStyle(document.getElementById(i))[p];return {
      upperPropDropped:c('a','color')!=='rgb(255, 0, 0)',commentStripped:c('b','color')==='rgb(255, 0, 0)',duplicateLastWins:c('c','color')==='rgb(0, 0, 255)',importantKept:c('d','color')==='rgb(255, 0, 0)',
      spacesKept:c('e','color')==='rgb(255, 0, 0)'&&Number(c('e','fontWeight'))>=700,escapedPropDropped:c('f','color')!=='rgb(255, 0, 0)',escapedValueDropped:c('g','color')!=='rgb(255, 0, 0)',
      mixedKeepsColour:c('h','backgroundColor')==='rgb(255, 238, 238)'&&c('h','backgroundImage')==='none',hiddenDeclarationDropped:c('i','color')==='rgb(255, 0, 0)'&&c('i','backgroundImage')==='none',lastInvalidDropped:Number(c('j','fontWeight'))>=700,
      customCaseDropped:document.getElementById('k').getAttribute('style')===null,entityDecoded:c('l','color')==='rgb(255, 0, 0)',upperValueKept:c('m','color')==='rgb(255, 0, 0)'}})()`)
    : null;
  const shiki = positive && name === 'P02-code' ? await ev(`(()=>{const t=[...document.querySelectorAll('.md pre span[style*="--shiki-light"]')];return {tokens:t.length,colours:new Set(t.map((e)=>getComputedStyle(e).color)).size,align:[...document.querySelectorAll('.md th, .md td')].map((e)=>getComputedStyle(e).textAlign).join(',')}})()`) : null;
  await fetch(`${CDP}/json/close/${tab.id}`);
  return { name, ...r, probes: probes.slice(before), kept, edge, shiki };
}

/**
 * Raw `.html` files: opened as a page they sit in an iframe. None of their active vectors may run or
 * navigate (the probe listener stays silent), and the passive page stays readable and styled.
 */
const htmlDocs = pick(readdirSync(`${dir}html/`).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)).sort());

async function oneHtml(name: string) {
  const before = probes.length;
  const tab = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pend = new Map<number, (v: any) => void>();
  const contexts: Array<{ id: number; frameId: string }> = [];
  const send = (method: string, params: object = {}) => new Promise<any>((r) => (pend.set(++id, r), ws.send(JSON.stringify({ id, method, params }))));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data as string);
    if (m.id && pend.has(m.id)) pend.get(m.id)!(m.result ?? m.error);
    if (m.method === 'Runtime.executionContextCreated' && m.params.context.auxData?.isDefault) contexts.push({ id: m.params.context.id, frameId: m.params.context.auxData.frameId });
    if (m.method === 'Page.javascriptDialogOpening') void send('Page.handleJavaScriptDialog', { accept: true });
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__pwned=[];' });
  await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${base}/html/${name}.html` });
  await Bun.sleep(3500);
  const tree = await send('Page.getFrameTree');
  const child = tree.frameTree.childFrames?.[0]?.frame.id as string | undefined;
  const top = tree.frameTree.frame.id as string;
  const inFrame = async (expression: string) => {
    const c = contexts.filter((x) => x.frameId === child).at(-1);
    return c ? (await send('Runtime.evaluate', { contextId: c.id, expression, returnByValue: true })).result?.value : undefined;
  };
  // what a reader can do in the page: click its link and its form button (inert when nothing may run or submit)
  await inFrame(`(()=>{for(const e of document.querySelectorAll('#j, #b')){try{e.click()}catch{}}})()`);
  await Bun.sleep(2500); // a one second refresh would have fired by now
  const topPwned = await send('Runtime.evaluate', { expression: 'window.__pwned.length', returnByValue: true });
  const page = await inFrame(`({text:document.body?.innerText??'',h1:document.querySelector('h1')?getComputedStyle(document.querySelector('h1')).color:'',url:location.href.slice(0,40)})`);
  await fetch(`${CDP}/json/close/${tab.id}`);
  return { name, framed: !!child, topPwned: topPwned.result?.value, page, probes: probes.slice(before), top: top ? 1 : 0 };
}

let bad = 0;
for (const d of docs) {
  const r = await one(d);
  const hit = !r.page || r.pwned?.length || r.forbidden || r.handlers || r.probes.length;
  if (hit) bad++;
  console.log(`${hit ? 'FAIL' : 'ok  '} ${d}${hit ? ' ' + JSON.stringify(r) : ''}`);
}
for (const d of positives) {
  const r = await one(d, true);
  const wrong = d === 'P03-style-edge-cases' ? Object.entries(r.edge ?? {}).filter(([, v]) => v !== true).map(([k]) => k) : d === 'P01-passive-styles' ? Object.entries(r.kept ?? {}).filter(([, v]) => v !== true).map(([k]) => k) : r.shiki && r.shiki.tokens > 0 && r.shiki.colours > 1 && /center,right/.test(r.shiki.align) ? [] : ['shiki'];
  const fail = !r.page || r.pwned?.length || r.probes.length || wrong.length;
  if (fail) bad++;
  console.log(`${fail ? 'FAIL' : 'ok  '} ${d} (positive)${fail ? ' ' + JSON.stringify({ wrong, ...r }) : ''}`);
}
for (const d of htmlDocs) {
  const r = await oneHtml(d);
  const passive = d === 'X06-passive';
  const readable = !passive || (/X06 passive page/.test(r.page?.text ?? '') && /visible bold text/.test(r.page?.text ?? '') && /cell/.test(r.page?.text ?? '') && r.page?.h1 === 'rgb(0, 128, 0)');
  const fail = !r.framed || r.topPwned !== 0 || r.probes.length || !readable;
  if (fail) bad++;
  console.log(`${fail ? 'FAIL' : 'ok  '} ${d} (raw html)${fail ? ' ' + JSON.stringify({ framed: r.framed, topPwned: r.topPwned, probes: r.probes, page: r.page }) : ''}`);
}
console.log(bad ? `${bad} document(s) failed` : 'passive: no hostile document gained a capability, passive styles, classes and raw html pages kept');
// a failed cleanup is a failed run: nothing is reported green while something it started may still be there
await env.stop().catch((e) => {
  console.error(`cleanup failed: ${(e as Error).message}`);
  process.exit(2);
});
process.exit(bad ? 1 : 0);

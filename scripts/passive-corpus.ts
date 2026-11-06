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
  /** Targets Chrome split out of the page (a sandboxed iframe can run in its own process), attached as flat sessions. */
  const attached: Array<{ sessionId: string; type: string; url: string }> = [];
  const send = (method: string, params: object = {}, sessionId?: string) =>
    new Promise<any>((r) => (pend.set(++id, r), ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data as string);
    if (m.id && pend.has(m.id)) pend.get(m.id)!(m.result ?? m.error);
    if (m.method === 'Target.attachedToTarget') attached.push({ sessionId: m.params.sessionId, type: m.params.targetInfo.type, url: m.params.targetInfo.url });
    if (m.method === 'Page.javascriptDialogOpening') void send('Page.handleJavaScriptDialog', { accept: true }, m.sessionId);
  };
  const top = async (expression: string) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.value;
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__pwned=[];' });
  await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${base}/html/${name}.html` });

  // The page view is the default: wait for the app to put the iframe in, then for the framed document to load.
  const ready = async (): Promise<boolean> => {
    for (let i = 0; i < 60; i++) {
      if ((await top(`!!document.querySelector('iframe.file-frame')`)) === true) return true;
      await Bun.sleep(250);
    }
    return false;
  };
  const framedInTop = await ready();
  // The framed page is either a child frame of this page or its own target, attached by now: wait for either.
  let child: string | undefined;
  let session: (typeof attached)[number] | undefined;
  for (let i = 0; i < 40 && !child && !session; i++) {
    await Bun.sleep(250);
    child = (await send('Page.getFrameTree')).frameTree.childFrames?.[0]?.frame.id;
    session = attached.filter((a) => a.type === 'iframe').at(-1);
  }
  await Bun.sleep(1500);
  const diag = await top(`(()=>{const f=document.querySelector('iframe.file-frame');const t=document.querySelector('button[title="Show the source"], button[title="Show the page"]');const shown=(sel)=>[...document.querySelectorAll(sel)].filter((e)=>e.offsetParent!==null).length;return {iframe:!!f,sandbox:f?.getAttribute('sandbox'),src:f?.getAttribute('src')?.slice(0,32),toggle:t?t.getAttribute('aria-pressed')+' '+t.title:null,visibleSourceLines:shown('.code-file .line')}})()`);
  const where = session ? 'own-target' : child ? 'same-process' : 'none';
  const preview = diag;

  // The sandboxed page runs no script, so it has no JS context to ask: it is read through the DOM and CSS protocols.
  const framed = async () => {
    const find = (n: any): any => {
      if (n.contentDocument) return n.contentDocument;
      for (const c of [...(n.children ?? []), ...(n.shadowRoots ?? [])]) {
        const r = find(c);
        if (r) return r;
      }
      return null;
    };
    let sid: string | undefined;
    let inner = find((await send('DOM.getDocument', { depth: -1, pierce: true })).root);
    if (!inner && session) {
      sid = session.sessionId;
      inner = (await send('DOM.getDocument', { depth: -1, pierce: true }, sid)).root;
    }
    return inner ? { inner, sid } : null;
  };
  const read = async () => {
    const f = await framed();
    if (!f) return null;
    const { inner, sid } = f;
    const html = (inner.children ?? []).find((c: any) => c.nodeName === 'HTML');
    if (!html) return { text: '', h1: '', url: String(inner.documentURL ?? '').slice(0, 40), ran: [] as string[] };
    const attrs: string[] = html.attributes ?? [];
    const ran = attrs.filter((_: string, k: number) => k % 2 === 0 && attrs[k]!.startsWith('data-ran'));
    const outer = (await send('DOM.getOuterHTML', { nodeId: html.nodeId }, sid)).outerHTML as string;
    const text = outer.replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    let h1 = '';
    const q = await send('DOM.querySelector', { nodeId: inner.nodeId, selector: 'h1' }, sid);
    if (q.nodeId) {
      await send('CSS.enable', {}, sid);
      h1 = ((await send('CSS.getComputedStyleForNode', { nodeId: q.nodeId }, sid)).computedStyle ?? []).find((c: any) => c.name === 'color')?.value ?? '';
    }
    return { text, h1, url: String(inner.documentURL ?? '').slice(0, 40), ran };
  };
  // what a reader can do in the page: click its link and its form button (inert when nothing may run or submit)
  let clicked = 0;
  const f0 = await framed();
  if (f0) {
    for (const sel of ['#j', '#b']) {
      const q = await send('DOM.querySelector', { nodeId: f0.inner.nodeId, selector: sel }, f0.sid);
      if (!q.nodeId) continue;
      const box = await send('DOM.getBoxModel', { nodeId: q.nodeId }, f0.sid);
      const quad: number[] | undefined = box.model?.content;
      if (!quad) continue;
      const x = (quad[0]! + quad[4]!) / 2;
      const y = (quad[1]! + quad[5]!) / 2;
      for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
      clicked++;
    }
  }
  await Bun.sleep(2500); // a one second refresh would have fired by now
  const topPwned = await top('window.__pwned.length');
  const page = await read();
  // the source view: the same file as highlighted lines in the page itself, with no frame
  await top(`document.querySelector('button[title="Show the source"], button[title="Show the page"]')?.click()`);
  await Bun.sleep(1500);
  const source = await top(`({iframe:!!document.querySelector('iframe.file-frame'),lines:[...document.querySelectorAll('.code-file .line')].filter((e)=>e.offsetParent!==null).length,text:(document.querySelector('.code-file')?.textContent??'').includes('<h1')})`);
  await fetch(`${CDP}/json/close/${tab.id}`);
  return { name, framed: !!page, where, framedInTop, preview, source, topPwned, page, clicked, probes: probes.slice(before), targets: attached.map((a) => `${a.type} ${a.url.slice(0, 50)}`), childFrame: !!child };
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
  // the page view has the sandboxed frame and no source lines; the source view has the lines and no frame
  const views = r.preview?.iframe === true && r.preview?.sandbox === '' && r.preview?.visibleSourceLines === 0 && r.source?.iframe === false && r.source?.lines > 0 && r.source?.text === true;
  // nothing ran in the framed page itself (each vector sets a marker before it fetches), and the page did not navigate away
  const inert = r.page?.ran?.length === 0 && /\/api\/raw/.test(r.page?.url ?? '');
  const fail = !r.framed || r.topPwned !== 0 || r.probes.length || !readable || !views || !inert;
  if (fail) bad++;
  console.log(`${fail ? 'FAIL' : 'ok  '} ${d} (raw html, frame ${r.where})${fail ? ' ' + JSON.stringify(r) : ''}`);
}
console.log(bad ? `${bad} document(s) failed` : 'passive: no hostile document gained a capability, passive styles, classes and raw html pages kept');
// a failed cleanup is a failed run: nothing is reported green while something it started may still be there
await env.stop().catch((e) => {
  console.error(`cleanup failed: ${(e as Error).message}`);
  process.exit(2);
});
process.exit(bad ? 1 : 0);

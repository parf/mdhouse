import { expect, test } from 'bun:test';
import { runSync, runSearch, decodeSyncReply, decodeSearchReply, decodeFileScanStatus, decodeRagCapabilities, RagSyncRuntimeError } from '../src/lib/rag-sync-runtime';
import type { RuntimeRequest, RuntimeTransport, SyncInput, SyncReply } from '../src/lib/rag-sync-runtime';
import { RAG_SYNC_REQUIRED_EXCLUDES } from '../src/lib/rag-sync-plan';

const root = { path: '/home/parf/src/mdhouse', dev: '1', ino: '2' };
const target = { filescan: '#filescan/mdhouse@parf.us', rag: '#rag/mdhouse@parf.us', namespace: 'mdhouse', table: 'docs' };
function input(): SyncInput {
  return { plan: { caller: '#mdhouse@parf.us', root: { ...root }, target: { ...target }, include: ['*.md'], exclude: [...RAG_SYNC_REQUIRED_EXCLUDES],
    inventory: { root: { ...root }, complete: true, issues: [] }, sources: [{ path: 'README.md', size: 100, mtimeMs: 0 }, { path: 'doc/large.md', size: 40000, mtimeMs: 1 }], oversizeLimit: 32768 },
    ownerConfig: { filescan: target.filescan, root: { ...root }, config: { dir: root.path, include: ['*.md'], exclude: ['node_modules/**','*/node_modules/**','.*','*/.*','bower_components/**','*/bower_components/**','jspm_packages/**','*/jspm_packages/**'], namespace: 'mdhouse', table: 'docs', mode: 'demand' } },
    intent: { apply: true } };
}
function status(): any { return { mode: 'demand', effective_mode: 'demand', fallback: null, tracked: 2, last_scan: null, skipped: [], state_bytes: 50, state_max: 1000, subscribers: [], paused: null, skipped_for_rag: {} }; }
function caps(): any { return { version: '0.4.2', methods: ['upsert','get','search'], modes: ['keyword','semantic','hybrid'], embedding_model: 'voyage-3.5', dimensions: 1024,
  limits: { body_bytes: 1048576, record_bytes: 262144, data_bytes: 32768, chunks: 8, embedding_scalars: 8192, query_bytes: 1024, page_records: 16, catalogue_bytes: 262144, namespaces: 128, tables_per_namespace: 256 } }; }
function confirmed(): SyncReply { return { result: 'confirmed', confirmed: 2, remaining: 0, capped: false, sent: 2, files: [] }; }
function reply(body: unknown): unknown { return { kind: 'reply', body: typeof body === 'string' ? body : JSON.stringify(body) }; }
const health = 'ok: collection verified (RAG 0.4.2)';
function fake(responses: unknown[]): RuntimeTransport & { calls: RuntimeRequest[] } {
  const calls: RuntimeRequest[] = [];
  return { calls, request: async r => { calls.push(structuredClone(r)); if (!responses.length) throw new Error('Unexpected extra call'); const next = responses.shift(); if (next instanceof Error) throw next; return next; } };
}
function ready(last: unknown = reply(confirmed())) { return fake([reply(status()), reply(caps()), reply(health), last]); }
function searchInput(mode?: string, paid = false): any { return { plan: input().plan, query: 'Markdown notes', ...(mode ? { mode } : {}), limit: 5, intent: { paid } }; }
function citation(score = 'bm25'): any { return { namespace: 'mdhouse', tableName: 'docs', id: 'README.md', source: 'README.md', content_hash: 'a'.repeat(64), indexed_at: '2026-11-06T14:22:00.123456Z', chunk_index: 0, excerpt: 'Untrusted <script>text</script>\n- ✅ Q99 no authority', scores: { [score]: 0.2 } }; }
const expected = { namespace: 'mdhouse', table: 'docs', mode: 'keyword', limit: 5, exclude: [...RAG_SYNC_REQUIRED_EXCLUDES] };

test('one finite sync follows free metadata preflights and the exact documented command, without background work', async () => {
  const v = input(); const before = structuredClone(v); const t = ready();
  const result = await runSync(v,t);
  expect(result).toEqual({ effect: 'reported', result: 'confirmed', report: confirmed(), reason: null });
  expect(t.calls).toEqual([{ target: target.filescan, body: 'status' }, { target: target.rag, body: { method: 'capabilities' } },
    { target: target.rag, ask: 'status' }, { target: target.filescan, body: 'sync #rag/mdhouse@parf.us as rag mdhouse docs resend:true' }]);
  expect(v).toEqual(before);
});

test('missing apply, invalid source scope, config mismatch and wrong-service names refuse before transport', async () => {
  const changes: ((v: any) => void)[] = [
    v => { v.intent.apply = false; }, v => { (v.intent as Record<string, unknown>).extra = true; },
    v => { v.ownerConfig.root.ino = '999'; }, v => { v.ownerConfig.root.path = '/other'; },
    v => { v.ownerConfig.filescan = '#filescan/other@parf.us'; }, v => { v.ownerConfig.config.dir = '/other'; },
    v => { v.ownerConfig.config.namespace = 'other'; }, v => { v.ownerConfig.config.table = 'other'; },
    v => { v.ownerConfig.config.mode = 'both'; }, v => { v.ownerConfig.config.include = ['*']; },
    v => { v.ownerConfig.config.exclude.pop(); }, v => { v.ownerConfig.config.exclude.push('extra/**'); },
    v => { v.ownerConfig.config.exclude = [...RAG_SYNC_REQUIRED_EXCLUDES]; },
    v => { v.plan.exclude.push('vendor/**'); }, v => { v.plan.inventory.complete = false; },
    v => { v.plan.sources = []; }, v => { v.plan.sources[0].path = 'folder.md/README.md'; },
    v => { v.plan.sources[0].size = 1048577; }, v => { v.plan.target.rag = '#ai@parf.us'; },
    v => { v.plan.target.rag = '#rag@parf.us'; }, v => { v.plan.target.filescan = '#user@parf.us'; },
    v => { v.plan.target.namespace = 'mdhouse resend:true'; }, v => { v.plan.target.table = 'docs\nreset'; },
    v => { v.ownerConfig.config.secret = 'not a config field'; },
  ];
  for (const change of changes) { const v = input(); change(v); const t = fake([]); expect((await runSync(v,t)).effect).toBe('notsent'); expect(t.calls).toHaveLength(0); }
});

test('demand status, collection health and delivered large-file contract are required before effect dispatch', async () => {
  const statuses: any[] = [];
  for (const change of [
    (s: any) => { s.mode = 'watch'; }, (s: any) => { s.effective_mode = 'poll'; },
    (s: any) => { s.paused = { kind: 'empty', reason: 'held', at: 1 }; },
    (s: any) => { s.subscribers = [{ id: 'x', target: target.rag, sent: 0, confirmed: 0, dropped: 0, pending: 0 }]; },
    (s: any) => { s.skipped = [['bad.md','not text']]; }, (s: any) => { s.tracked = '2'; },
    (s: any) => { s.skipped_for_rag = { sub: { 'bad.md': 'unsupported' } }; },
  ]) { const s = status(); change(s); statuses.push(s); }
  for (const s of statuses) { const t = fake([reply(s)]); expect((await runSync(input(),t)).effect).toBe('notsent'); expect(t.calls).toHaveLength(1); }
  for (const change of [
    (c: any) => { c.version = '0.4.1'; }, (c: any) => { c.version = '0.4'; }, (c: any) => { c.version = 'v0.4.5'; },
    (c: any) => { c.embedding_model = null; }, (c: any) => { c.dimensions = 0; },
    (c: any) => { c.methods = ['search']; }, (c: any) => { c.limits.data_bytes = 100; },
    (c: any) => { c.modes = ['unknown']; }, (c: any) => { c.limits.body_bytes = 32768; },
  ]) { const c = caps(); change(c); const t = fake([reply(status()),reply(c)]); expect((await runSync(input(),t)).effect).toBe('notsent'); expect(t.calls).toHaveLength(2); }
  for (const body of ['failed: not configured (RAG 0.4.2)', 'unknown: RAG 0.4.2 has not verified its collection', { ready: true }, 'ok: collection verified (RAG 0.4.1)']) {
    const t = fake([reply(status()),reply(caps()),reply(body)]); expect((await runSync(input(),t)).effect).toBe('notsent'); expect(t.calls).toHaveLength(3);
  }
});

test('incomplete/unknown/failed/capped remain non-success, preserve bounded evidence and never trigger a second sync', async () => {
  for (const [result,state] of [['incomplete','in_flight'],['unknown','unknown'],['failed','failed']] as const) {
    const report: SyncReply = { result, confirmed: 1, remaining: 2, sent: 1, capped: true, files: [{ path: 'doc/large.md', state, reason: 'Only listed evidence, not a total failure count.' }] };
    const t = ready(reply(report)); const output = await runSync(input(),t);
    expect(output.effect).toBe('reported'); expect(output.result).toBe(result); expect(output.report).toEqual(report); expect(t.calls).toHaveLength(4);
    expect(output.report).not.toHaveProperty('failedCount'); expect(output.report).not.toHaveProperty('totalFailed');
  }
  const t = ready(reply({ result:'failed', confirmed:0, remaining:300, sent:200, capped:true, files:[] }));
  expect((await runSync(input(),t)).result).toBe('failed'); // failure may lie beyond the bounded file evidence
});

test('contradictory confirmations, invalid counts/scope/types and lost post-send replies are unknown, not unchanged', async () => {
  const changes: ((r: any) => void)[] = [
    r => { r.capped = true; }, r => { r.remaining = 1; }, r => { r.confirmed = 0; }, r => { r.sent = -1; },
    r => { r.confirmed = true; }, r => { r.remaining = 0.1; }, r => { r.result = 'done'; },
    r => { r.files = [{ path: '../outside.md', state:'failed',reason:'bad' }]; },
    r => { r.files = Array(201).fill({path:'x.md',state:'failed',reason:'bad'}); },
  ];
  for (const change of changes) { const r = confirmed(); change(r); const t = ready(reply(r)); const result = await runSync(input(),t); expect(result.effect).toBe('unknown'); expect(result.report).toBeNull(); expect(t.calls).toHaveLength(4); }
  for (const last of [new Error('lost'), {kind:'uncertain',sent:true,reason:'lost-reply'}, reply('{'), reply('unknown: pending'),
    {kind:'reply',body:JSON.stringify(confirmed()),from:'#forged@parf.us'}, {kind:'uncertain',sent:'no',reason:'forged'}]) {
    const t = ready(last); expect((await runSync(input(),t)).effect).toBe('unknown'); expect(t.calls).toHaveLength(4);
  }
  const t = ready({kind:'uncertain',sent:false,reason:'root-changed'}); expect((await runSync(input(),t)).effect).toBe('notsent');
  const refusal = ready(reply({error:{code:'busy',text:'Refused before the new sync'}}));
  expect(await runSync(input(),refusal)).toEqual({effect:'reported',result:'failed',report:null,reason:'FileScan-refused'});
});

test('all sync reply invariants and duplicate JSON keys are checked without normalizing contradictions', () => {
  for (const r of [
    {result:'incomplete',confirmed:0,remaining:0,sent:0,capped:false,files:[]},
    {result:'unknown',confirmed:0,remaining:1,sent:0,capped:false,files:[{path:'a.md',state:'failed',reason:'x'}]},
    {result:'incomplete',confirmed:0,remaining:1,sent:0,capped:false,files:[{path:'a.md',state:'unknown',reason:'x'}]},
  ]) expect(() => decodeSyncReply(r)).toThrow(RagSyncRuntimeError);
  const duplicate = JSON.stringify(confirmed()).replace('"remaining":0','"remaining":2,"remai\\u006eing":0');
  expect(() => decodeSyncReply(duplicate)).toThrow('duplicate');
});

test('keyword search is one explicit scoped RPC; semantic/hybrid require separate paid intent before any transport', async () => {
  for (const mode of ['keyword','semantic','hybrid'] as const) {
    const score = {keyword:'bm25',semantic:'dense',hybrid:'rrf'}[mode]; const payload = {mode,records:[citation(score)]};
    const t = fake([reply(payload)]); const v = searchInput(mode,mode !== 'keyword');
    const output = await runSearch(v,t);
    expect(output.effect).toBe('reported'); expect(output.result).toEqual(payload);
    expect(t.calls).toEqual([{target:target.rag,body:{method:'search',namespace:'mdhouse',tableName:'docs',query:'Markdown notes',mode,limit:5}}]);
    if (mode !== 'keyword') { const no = fake([]); expect((await runSearch(searchInput(mode,false),no)).effect).toBe('notsent'); expect(no.calls).toHaveLength(0); }
  }
  const t = fake([reply({mode:'keyword',records:[]})]); expect((await runSearch(searchInput(),t)).effect).toBe('reported');
  expect((t.calls[0]!.body as any).mode).toBe('keyword');
});

test('search refuses generic/wrong-service endpoints, invalid query and arbitrary extra paid options before transport', async () => {
  for (const change of [
    (v:any)=>{v.plan.target.rag='#ai@parf.us';}, (v:any)=>{v.plan.target.rag='#rag@parf.us';},
    (v:any)=>{v.plan.target.rag='person@parf.us';}, (v:any)=>{v.query='';}, (v:any)=>{v.query='a'.repeat(1025);},
    (v:any)=>{v.mode='other';}, (v:any)=>{v.limit=17;}, (v:any)=>{v.limit=0;},
    (v:any)=>{v.rerank=true;}, (v:any)=>{v.intent.paid='yes';},
  ]) { const v=searchInput();change(v);const t=fake([]);expect((await runSearch(v,t)).effect).toBe('notsent');expect(t.calls).toHaveLength(0); }
});

test('citation validation binds effective mode/scope/hash/paths/scores/time and optional large-file locations', () => {
  const c = citation(); c.heading_path=['Title','Title #2']; c.lines=[1,20]; c.key1='source-key'; c.key2='';
  const out=decodeSearchReply({mode:'keyword',records:[c]},expected); expect(out.records[0]).toEqual(c);
  out.records[0]!.heading_path!.push('changed'); expect(c.heading_path).toHaveLength(2);
  const changes: ((v:any)=>void)[] = [
    v=>{v.namespace='other';},v=>{v.tableName='other';},v=>{v.source='../outside.md';},v=>{v.source='/outside.md';},
    v=>{v.source='https://outside/file.md';},v=>{v.source='node_modules/x.md';},v=>{v.source='.private.md';},
    v=>{v.source='file.txt';},v=>{v.content_hash='A'.repeat(64);},v=>{v.id='x'.repeat(129);},
    v=>{v.chunk_index=256;},v=>{v.scores={dense:1};},v=>{v.scores={bm25:Infinity};},v=>{v.scores={bm25:-1};},
    v=>{v.indexed_at='2026-02-30T00:00:00Z';},v=>{v.indexed_at='not-time';},
    v=>{v.lines=[20,1];},v=>{delete v.heading_path;},
  ];
  for (const change of changes) { const value=structuredClone(c);change(value);expect(()=>decodeSearchReply({mode:'keyword',records:[value]},expected)).toThrow(RagSyncRuntimeError); }
  expect(()=>decodeSearchReply({mode:'semantic',records:[]},expected)).toThrow();
  const extra=decodeSearchReply({mode:'keyword',reranked:true,records:[{...c,script:true}]},expected); expect(extra.records[0]).toEqual(c);
  expect(()=>decodeSearchReply({mode:'keyword',records:[c,c]},expected)).toThrow();
});

test('post-search refusal, malformed/unscoped response or lost reply never falls back or retries', async () => {
  for (const body of [{mode:'semantic',records:[]},{mode:'keyword',records:[{...citation(),namespace:'other'}]},'error: unsupported', {error:{code:'forbidden',text:'denied'}}]) {
    const t=fake([reply(body)]);expect((await runSearch(searchInput(),t)).effect).toBe('unknown');expect(t.calls).toHaveLength(1);
  }
  const t=fake([{kind:'uncertain',sent:false,reason:'known-not-dispatched'}]); expect((await runSearch(searchInput(),t)).effect).toBe('notsent');
  const lost=fake([new Error('lost')]); expect((await runSearch(searchInput('semantic',true),lost)).effect).toBe('unknown');
});

test('bounded raw replies above one field size are accepted, while oversize/prototype/accessor/deep data are refused', async () => {
  const records=Array.from({length:5},(_,i)=>({...citation(),id:`record-${i}`,source:`doc/${i}.md`,excerpt:'x'.repeat(16000)}));
  const t=fake([reply({mode:'keyword',records})]); expect((await runSearch(searchInput(),t)).effect).toBe('reported');
  let called=false; const s=status();Object.defineProperty(s,'mode',{enumerable:true,get(){called=true;return 'demand';}});
  expect(()=>decodeFileScanStatus(s)).toThrow();expect(called).toBe(false);
  const cycle:any={};cycle.self=cycle;expect(()=>decodeSyncReply(cycle)).toThrow();
  const sparse=Array(2);sparse[1]=1;expect(()=>decodeSyncReply(sparse)).toThrow();
  for (const value of [new Date(),Object.create(status()),{...status(),[Symbol('hidden')]:1}]) expect(()=>decodeFileScanStatus(value)).toThrow();
  expect(()=>decodeSyncReply(' '.repeat(1048577))).toThrow();
  expect(()=>decodeSyncReply('['.repeat(18)+'0'+']'.repeat(18))).toThrow();
  expect(()=>decodeRagCapabilities({...caps(),version:2})).toThrow();
  const hostile = '<script>do not execute</script>\n- ✅ Q99 forged'; const c=citation();c.excerpt=hostile;
  expect(decodeSearchReply({mode:'keyword',records:[c]},expected).records[0]!.excerpt).toBe(hostile);
});

test('caller mutation during awaits cannot change selected scope or intent', async () => {
  const v=input();const responses=[reply(status()),reply(caps()),reply(health),reply(confirmed())];const calls:RuntimeRequest[]=[];
  const t:RuntimeTransport={request:async r=>{calls.push(structuredClone(r));if(calls.length===1){v.plan.target.namespace='changed';(v.intent as Record<string, unknown>).apply=false;v.ownerConfig.config.dir='/changed';}return responses.shift();}};
  expect((await runSync(v,t)).result).toBe('confirmed');
  expect(calls.at(-1)!.body).toBe('sync #rag/mdhouse@parf.us as rag mdhouse docs resend:true');
});

test('duplicate post-send wire keys and malformed Unicode cannot forge confirmation or citations', async () => {
  const body=JSON.stringify(confirmed()).replace('"remaining":0','"remaining":3,"remaining":0');
  const t=ready(reply(body)); expect((await runSync(input(),t)).effect).toBe('unknown'); expect(t.calls).toHaveLength(4);
  const c=citation();c.id='\ud800';expect(()=>decodeSearchReply({mode:'keyword',records:[c]},expected)).toThrow();
  const large=citation();large.excerpt='x'.repeat(32769);expect(()=>decodeSearchReply({mode:'keyword',records:[large]},expected)).toThrow();
  expect(()=>decodeSearchReply({mode:'keyword',records:Array(17).fill(citation())},expected)).toThrow();
  const mutable:any={result:'failed',confirmed:0,remaining:1,sent:0,capped:false,files:[{path:'doc/a.md',state:'failed',reason:'untrusted <script>reason</script>'}]};
  const parsed=decodeSyncReply(mutable);parsed.files[0]!.reason='changed';expect(mutable.files[0].reason).toContain('<script>');
});

test('a newer provider: added reply fields are ignored and a later RAG version is accepted with its own health line', async () => {
  const s = { ...status(), warnings: [] }; const c = { ...caps(), version: '0.4.5', limits: { ...caps().limits, future: 'x' } };
  const r = { ...confirmed(), extra: true };
  const t = fake([reply(s), reply(c), reply('ok: collection verified (RAG 0.4.5)'), reply(r)]);
  const out = await runSync(input(), t); expect(out.effect).toBe('reported'); expect(out.report).toEqual(confirmed());
  const stale = fake([reply(status()), reply({ ...caps(), version: '0.4.5' }), reply(health)]);
  expect((await runSync(input(), stale)).effect).toBe('notsent');
});

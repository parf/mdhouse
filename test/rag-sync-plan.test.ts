import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { planRagSync, RagSyncPlanError, RAG_SYNC_PLAN_LIMITS, RAG_SYNC_PLAN_VERSION, RAG_SYNC_REQUIRED_EXCLUDES } from '../src/lib/rag-sync-plan';
import type { RagSyncPlanInput } from '../src/lib/rag-sync-plan';

function input(): RagSyncPlanInput {
  const root = { path: '/home/parf/src/mdhouse', dev: '2049', ino: '12345' };
  return { caller: '#mdhouse@parf.us', target: { filescan: '#filescan/mdhouse@parf.us', rag: '#rag/mdhouse@parf.us', namespace: 'mdhouse', table: 'docs' },
    root, include: ['*.md'], exclude: [...RAG_SYNC_REQUIRED_EXCLUDES],
    inventory: { root: { ...root }, complete: true, issues: [] }, oversizeLimit: 32768,
    sources: [{ path: 'README.md', size: 100, mtimeMs: 1700000000000.25 }, { path: 'doc/guide.md', size: 32768, mtimeMs: 1700000000001 }] };
}
function failure(value: unknown): void { expect(() => planRagSync(value)).toThrow(RagSyncPlanError); }
function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical((v as Record<string, unknown>)[k])).join(',') + '}';
  return JSON.stringify(v);
}

test('concrete target produces a fresh versioned local-only metadata plan without remote or content claims', () => {
  const original = input(); const before = structuredClone(original);
  const plan = planRagSync(original);
  expect(plan.version).toBe(RAG_SYNC_PLAN_VERSION);
  expect(plan.target).toEqual(original.target); expect(plan.root).toEqual(original.root);
  expect(plan.kind).toBe('local-plan-only'); expect(plan.remoteReadiness).toBe('unverified');
  expect(plan.authority).toBe('declarations-only'); expect(plan.execution).toBe('not-performed');
  expect(plan.coverage).toEqual({ status: 'metadata-only', total: 2, eligible: 2, oversize: 0, issues: 0,
    inventoryComplete: true, textEncoding: 'unverified', providerIndexability: 'unverified' });
  expect(plan.sources.map(s => s.eligibility)).toEqual(['eligible-by-metadata', 'eligible-by-metadata']);
  expect(plan.digestMeaning).toBe('canonical-plan-metadata-not-content-or-atomic-folder-proof');
  expect(plan.digest).toMatch(/^[a-f0-9]{64}$/); expect(original).toEqual(before);
  plan.root.ino = '9'; plan.inventory.root.path = '/changed'; plan.target.namespace = 'changed';
  plan.exclude.push('vendor/**'); plan.sources[0]!.size = 999;
  expect(original).toEqual(before); expect(planRagSync(original).digest).not.toBe('');
  original.sources[0]!.path = 'changed.md'; expect(plan.sources[0]!.path).toBe('README.md');
});

test('canonical digest binds the full plan and is deterministic across object/list metadata order', () => {
  const original = input(); const first = planRagSync(original);
  const reversed = { ...original, sources: [...original.sources].reverse(), exclude: [...original.exclude].reverse(),
    target: Object.fromEntries(Object.entries(original.target).reverse()) };
  expect(planRagSync(reversed)).toEqual(first);
  const { digest, ...metadata } = first;
  expect(digest).toBe(createHash('sha256').update(canonical(metadata)).digest('hex'));
  const changes: ((v: RagSyncPlanInput) => void)[] = [
    v => { v.root.path = '/another'; v.inventory.root.path = '/another'; },
    v => { v.root.dev = '0'; v.inventory.root.dev = '0'; }, v => { v.root.ino = '678'; v.inventory.root.ino = '678'; },
    v => { v.caller = '#mdhouse@other.us'; }, v => { v.target.rag = '#rag/other@parf.us'; },
    v => { v.target.filescan = '#filescan/other@parf.us'; }, v => { v.target.namespace = 'other'; },
    v => { v.target.table = 'other'; }, v => { v.exclude.push('vendor/**'); }, v => { v.sources[0]!.size++; },
    v => { v.sources[0]!.mtimeMs++; }, v => { v.sources[0]!.path = 'other.md'; },
    v => { v.inventory.complete = false; },
  ];
  for (const change of changes) { const copy = structuredClone(original); change(copy); expect(planRagSync(copy).digest).not.toBe(first.digest); }
});

test('oversized and incomplete inventories remain visible partial plans; empty inventory is never missing-source success', () => {
  const v = input(); v.sources.push({ path: 'Plans/large.md', size: 32769, mtimeMs: 0 });
  let plan = planRagSync(v);
  expect(plan.coverage.status).toBe('partial'); expect(plan.coverage.oversize).toBe(1);
  expect(plan.sources.find(s => s.path === 'Plans/large.md')!.eligibility).toBe('oversize');
  expect(plan.sources).toHaveLength(3); expect(plan.coverage.eligible).toBe(2);
  v.inventory.complete = false; v.inventory.issues = [{ path: 'doc/unreadable.md', reason: 'unreadable' }, { path: '', reason: 'limit' }];
  plan = planRagSync(v); expect(plan.coverage.issues).toBe(2); expect(plan.inventory.issues[0]!.path).toBe('');
  plan.inventory.issues[0]!.reason = 'changed'; expect(v.inventory.issues[1]!.reason).toBe('limit');
  v.sources = []; v.inventory.issues = []; v.inventory.complete = true;
  expect(planRagSync(v).coverage.status).toBe('empty');
  v.inventory.complete = false; expect(planRagSync(v).coverage.status).toBe('partial');
  v.inventory.complete = true; v.inventory.issues = [{ path: '', reason: 'changed' }]; failure(v);
});

test('jailed lexical declarations reject cross-root identities and every unsafe source spelling', () => {
  for (const p of ['/outside.md', '../outside.md', 'dir/../outside.md', './file.md', 'dir//file.md', 'dir/',
    'C:/file.md', 'https://host/file.md', 'dir\\file.md', 'dir/%2e%2e/file.md', 'file.md?query', 'file.md#fragment',
    'control\u0000.md', 'white\nline.md', 'decomposed-e\u0301.md']) {
    const v = input(); v.sources[0]!.path = p; failure(v);
  }
  for (const field of ['path', 'dev', 'ino'] as const) {
    const v = input(); v.inventory.root[field] = field === 'path' ? '/elsewhere' : '99'; failure(v);
  }
  for (const p of ['relative', '/', '/a/../b', '/a//b', '/a/', '/a\\b', '/a\u0000b']) {
    const v = input(); v.root.path = p; v.inventory.root.path = p; failure(v);
  }
  for (const ino of ['0', '-1', '01', '1.5', '18446744073709551616']) {
    const v = input(); v.root.ino = ino; v.inventory.root.ino = ino; failure(v);
  }
});

test('dotfiles and fixed dependency trees are excluded at every depth; prefix excludes preserve unrelated sources', () => {
  for (const p of ['.secret.md', '.git/readme.md', '.scratch/run.md', 'a/.private/readme.md',
    'node_modules/pkg/README.md', 'a/node_modules/pkg/README.md', 'bower_components/readme.md', 'a/jspm_packages/readme.md']) {
    const v = input(); v.sources[0]!.path = p; failure(v);
  }
  for (const required of RAG_SYNC_REQUIRED_EXCLUDES) {
    const v = input(); v.exclude = v.exclude.filter(s => s !== required); failure(v);
  }
  const v = input(); v.exclude.push('vendor/**');
  v.sources[0]!.path = 'vendor/a.md'; failure(v);
  v.sources[0]!.path = 'vendor-other/a.md'; expect(planRagSync(v).sources).toHaveLength(2);
  for (const pattern of ['**/*.md', '*', '**/random/**', '../outside/**', '/outside/**', 'a/[a-z]/**']) {
    const bad = input(); bad.exclude.push(pattern); failure(bad);
  }
});

test('strict schema rejects file contents, unsupported source types, missing fields and arbitrary names or metadata', () => {
  const changes: ((v: any) => void)[] = [
    v => { v.version = 1; }, v => { v.secret = 'not accepted'; }, v => { v.sources[0].text = 'file body'; },
    v => { v.sources[0].content_hash = 'a'.repeat(64); }, v => { delete v.inventory; }, v => { v.root.extra = true; },
    v => { v.target.token = 'secret'; }, v => { v.caller = '#mdhouse'; }, v => { v.target.filescan = '#filescan'; },
    v => { v.target.rag = 'https://endpoint'; }, v => { v.target.rag = v.target.filescan; },
    v => { v.caller = v.target.rag; }, v => { v.target.namespace = '*'; }, v => { v.target.table = ''; },
    v => { v.target.namespace = 'e\u0301'; }, v => { v.include = ['*.mdx']; }, v => { v.include = ['*.md', '*.txt']; },
    v => { v.sources[0].path = 'file.txt'; }, v => { v.sources[0].path = 'file.MD'; },
    v => { v.sources[0].size = -1; }, v => { v.sources[0].size = 1.5; }, v => { v.sources[0].size = Number.MAX_SAFE_INTEGER+1; },
    v => { v.sources[0].mtimeMs = NaN; }, v => { v.sources[0].mtimeMs = -1; }, v => { v.sources[0].mtimeMs = Infinity; },
    v => { v.oversizeLimit = 65536; }, v => { v.inventory.complete = 'yes'; },
    v => { v.sources.push({ ...v.sources[0] }); }, v => { v.exclude.push(v.exclude[0]); },
    v => { v.inventory.complete = false; v.inventory.issues = [{ path: '', reason: 'ignored' }]; },
    v => { v.inventory.complete = false; v.inventory.issues = [{ path: '', reason: 'limit' }, { path: '', reason: 'limit' }]; },
  ];
  for (const change of changes) { const v = input(); change(v); failure(v); }
});

test('declared issues can retain uncertain source metadata without representing it as verified', () => {
  const v = input(); v.inventory.complete = false; v.inventory.issues = [{ path: 'README.md', reason: 'changed' }];
  const p = planRagSync(v); expect(p.sources[0]!.path).toBe('README.md'); expect(p.coverage.status).toBe('partial');
  expect(p.coverage.providerIndexability).toBe('unverified');
  const alias = input(); alias.inventory.root = alias.root;
  const fresh = planRagSync(alias); fresh.root.dev = '999'; expect(fresh.inventory.root.dev).toBe('2049');
  expect(alias.root.dev).toBe('2049');
});

test('unknown public data rejects accessors/prototypes/symbols/cycles/sparse/nonfinite values without invoking getters', () => {
  let called = false; const getter = input(); Object.defineProperty(getter, 'root', { enumerable: true, get() { called = true; return {}; } });
  const hidden = input(); Object.defineProperty(hidden, 'hidden', { value: true });
  const cycle: any = input(); cycle.root = cycle;
  const sparse = Array(4); sparse[3] = 1;
  class ForeignArray extends Array {}
  for (const v of [getter, hidden, cycle, Object.create(input()), new Date(), undefined, null, Infinity,
    { ...input(), extra: sparse }, { ...input(), extra: new ForeignArray() }, { ...input(), [Symbol('hidden')]: 1 },
    { ...input(), extra: () => 1 }, JSON.parse('{"__proto__":{}}')]) failure(v);
  expect(called).toBe(false);
});

test('resource budgets reject whole inputs, not truncated successful plans', () => {
  const v = input();
  v.sources = Array.from({ length: RAG_SYNC_PLAN_LIMITS.sources+1 }, (_, i) => ({ path: `docs/${i}.md`, size: 1, mtimeMs: 0 })); failure(v);
  const tooLong = input(); tooLong.sources[0]!.path = '😀'.repeat(600) + '.md'; failure(tooLong);
  let deep: unknown = 0; for (let i = 0; i < 14; i++) deep = [deep]; failure({ ...input(), extra: deep });
  failure({ ...input(), extra: new Array(RAG_SYNC_PLAN_LIMITS.nodes+1).fill(null) });
  failure({ ...input(), extra: 'x'.repeat(RAG_SYNC_PLAN_LIMITS.string+1) });
  const issues = input(); issues.inventory.complete = false;
  issues.inventory.issues = Array.from({ length: RAG_SYNC_PLAN_LIMITS.issues+1 }, (_, i) => ({ path: `dir/${i}.md`, reason: 'changed' })); failure(issues);
});

test('metadata eligibility does not inspect content and aggregate bytes are bounded below item-count limits', () => {
  const v = input(); v.sources = [{ path: 'unknown-encoding.md', size: 1, mtimeMs: 0 }, { path: 'empty.md', size: 0, mtimeMs: 0 }];
  const plan = planRagSync(v);
  expect(plan.sources.every(s => s.eligibility === 'eligible-by-metadata')).toBe(true);
  expect(plan.coverage.textEncoding).toBe('unverified'); expect(plan.coverage.providerIndexability).toBe('unverified');
  expect(Object.keys(plan.sources[0]!).sort()).toEqual(['eligibility', 'mtimeMs', 'path', 'size']);
  v.sources = Array.from({ length: 7000 }, (_, i) => ({ path: 'x'.repeat(1200) + i + '.md', size: 1, mtimeMs: 0 }));
  failure(v);
});

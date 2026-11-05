import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { FLOW_LIMITS, loadFlowCatalog, loadFlowPackage, validateFlowPackage } from '../src/lib/flow-package';
import { FEATURE_PACKAGE_IDS } from './flow-library-coverage';

function sample(): any {
  return {
    schemaVersion: 1, id: 'example', title: 'Example flow', family: 'test', entry: 'start',
    defaults: { scope: 'selected-project', range: 'explicit-baseline', audience: 'development', output: 'findings', destination: 'Plans/flows/example.md' },
    evidence: { required: ['selected sources'], missing: 'block' }, example: 'example.md',
    steps: [{ id: 'start', document: 'workflow.md', effect: 'analysis', approval: 'none', on: {
      complete: { kind: 'end', status: 'complete' }, blocked: { kind: 'end', status: 'blocked' }, failed: { kind: 'end', status: 'failed' },
    } }],
  };
}

test('valid declarations return fresh data without executing or mutating anything', () => {
  const input = sample();
  const output = validateFlowPackage(input);
  input.steps[0].on.complete.status = 'failed';
  input.evidence.required.push('changed');
  expect(output.steps[0]!.on.complete).toEqual({ kind: 'end', status: 'complete' });
  expect(output.evidence.required).toEqual(['selected sources']);
});

const bad: [string, (value: any) => void][] = [
  ['version', (v) => { v.schemaVersion = 2; }],
  ['unknown field', (v) => { v.command = 'touch outside'; }],
  ['package schedule unsupported', (v) => { v.schedule = '* * * * *'; }],
  ['bad title', (v) => { v.title = ' '; }],
  ['oversize label', (v) => { v.title = 'x'.repeat(1025); }],
  ['non-slug ID', (v) => { v.id = '../x'; }],
  ['missing default', (v) => { delete v.defaults.audience; }],
  ['invalid range', (v) => { v.defaults.range = 'HEAD'; }],
  ['empty output', (v) => { v.defaults.output = ''; }],
  ['oversize output', (v) => { v.defaults.output = 'x'.repeat(81); }],
  ['nondeclarative output', (v) => { v.defaults.output = 'run ./script'; }],
  ['missing evidence', (v) => { v.evidence.required = []; }],
  ['duplicate evidence', (v) => { v.evidence.required.push(v.evidence.required[0]); }],
  ['silent missing-source fallback', (v) => { v.evidence.missing = 'ignore'; }],
  ['missing example', (v) => { delete v.example; }],
  ['missing entry', (v) => { v.entry = 'absent'; }],
  ['missing target', (v) => { v.steps[0].on.complete = { kind: 'step', id: 'absent' }; }],
  ['duplicate nodes', (v) => { v.steps.push(structuredClone(v.steps[0])); }],
  ['unreachable node', (v) => { v.steps.push({ ...structuredClone(v.steps[0]), id: 'unused' }); }],
  ['self cycle', (v) => { v.steps[0].on.complete = { kind: 'step', id: 'start' }; }],
  ['multi-node cycle', (v) => {
    v.steps.push({ ...structuredClone(v.steps[0]), id: 'second' });
    v.steps[0].on.complete = { kind: 'step', id: 'second' };
    v.steps[1].on.complete = { kind: 'step', id: 'start' };
  }],
  ['retry on failed outcome', (v) => { v.steps[0].on.failed = { kind: 'step', id: 'start' }; }],
  ['failure implies success', (v) => { v.steps[0].on.failed.status = 'complete'; }],
  ['wrong union fields', (v) => { v.steps[0].on.complete.target = 'surprise'; }],
  ['external URL instead of binding ID', (v) => { v.steps[0].on.complete = { kind: 'handoff', to: 'external', target: 'https://example.com' }; }],
  ['unknown effect', (v) => { v.steps[0].effect = 'shell'; }],
  ['analysis has approval', (v) => { v.steps[0].approval = 'explicit'; }],
  ['mutation lacks approval', (v) => { v.steps[0].effect = 'deploy'; }],
  ['missing failure outcome', (v) => { delete v.steps[0].on.failed; }],
  ['extra outcome', (v) => { v.steps[0].on.approved = { kind: 'end', status: 'complete' }; }],
  ['too many nodes', (v) => { v.steps = Array(FLOW_LIMITS.nodes + 1).fill(v.steps[0]); }],
  ['prototype key', (v) => { v.steps[0].on = JSON.parse('{"__proto__":{}}'); }],
];
for (const [name, change] of bad) test(`rejects ${name}`, () => {
  const value = sample(); change(value);
  expect(() => validateFlowPackage(value)).toThrow('Invalid flow package');
});
for (const value of [null, [], 'text', 1, new Date()]) test(`rejects non-manifest ${JSON.stringify(value)}`, () => {
  expect(() => validateFlowPackage(value)).toThrow();
});
for (const path of ['/tmp/x.md', '../x.md', 'a/../x.md', 'a/.git/x.md', 'a/.GIT/x.md', 'https://example.com/x.md', 'C:\\x.md', 'a\\x.md', 'a//x.md', './x.md', 'a/%2e%2e/x.md', 'x.md?query', 'x\0.md']) {
  test(`rejects unsafe asset and output declaration ${JSON.stringify(path)}`, () => {
    for (const field of ['document', 'destination', 'example']) {
      const value = sample();
      if (field === 'document') value.steps[0].document = path;
      else if (field === 'destination') value.defaults.destination = path;
      else value.example = path;
      expect(() => validateFlowPackage(value)).toThrow();
    }
  });
}

test('accepts branched DAGs and inert named handoffs', () => {
  for (const to of ['person', 'team', 'agent', 'external']) {
    const value = sample();
    value.steps[0].on.complete = { kind: 'handoff', to, target: to === 'external' ? 'configured-tracker' : '#reviewer' };
    expect(validateFlowPackage(value).steps[0]!.on.complete!.kind).toBe('handoff');
  }
  const value = sample();
  value.steps.push({ ...structuredClone(value.steps[0]), id: 'next' });
  value.steps[0].on.complete = { kind: 'step', id: 'next' };
  expect(validateFlowPackage(value).steps).toHaveLength(2);
});

test('each consequential effect requires independent approval and recoverable outcomes', () => {
  for (const effect of ['edit', 'commit', 'ticket', 'merge', 'deploy'] as const) {
    const value = sample();
    Object.assign(value.steps[0], { effect, approval: 'explicit', on: {
      succeeded: { kind: 'end', status: 'complete' }, denied: { kind: 'end', status: 'cancelled' },
      failed: { kind: 'end', status: 'failed' }, partial: { kind: 'end', status: 'partial' },
    } });
    expect(validateFlowPackage(value).steps[0]!.effect).toBe(effect);
    for (const missing of ['succeeded', 'denied', 'failed', 'partial']) {
      const invalid = structuredClone(value); delete invalid.steps[0].on[missing];
      expect(() => validateFlowPackage(invalid)).toThrow();
    }
    value.steps[0].on.denied = { kind: 'step', id: 'start' };
    expect(() => validateFlowPackage(value)).toThrow();
  }
});

async function fixture(run: (dir: string, value: any) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'mdhouse-flow-'));
  const value = sample();
  try {
    await writeFile(join(dir, 'flow.json'), JSON.stringify(value));
    await writeFile(join(dir, 'workflow.md'), '# Workflow\n');
    await writeFile(join(dir, 'example.md'), '# Synthetic example\n');
    await run(dir, value);
  } finally { await rm(dir, { recursive: true, force: true }); }
}

test('a Legal package and new output load without family-specific code', async () => fixture(async (dir, value) => {
  Object.assign(value, { id: 'legal-brief', family: 'legal', title: 'Obligation register' });
  value.defaults.output = 'obligation-register';
  value.defaults.destination = 'Plans/legal/obligations.md';
  value.evidence.required = ['supplied contract and source references'];
  await writeFile(join(dir, 'flow.json'), JSON.stringify(value));
  await writeFile(join(dir, 'workflow.md'), '# Obligation register\n\nDraft cited obligations for qualified human review; never sign or file.\n');
  const loaded = await loadFlowPackage(dir);
  expect(loaded.manifest.family).toBe('legal');
  expect(loaded.manifest.defaults.output).toBe('obligation-register');
  expect(loaded.manifest.defaults.destination).toBe('Plans/legal/obligations.md');
  expect(loaded.documents.get('workflow.md')).toContain('never sign or file');
}));

test('loads only declared Markdown; nested/in-package symlink assets work', async () => fixture(async (dir, value) => {
  await mkdir(join(dir, 'nested'));
  await symlink('../workflow.md', join(dir, 'nested/link.md'));
  value.steps[0].document = 'nested/link.md';
  await writeFile(join(dir, 'flow.json'), JSON.stringify(value));
  const output = await loadFlowPackage(dir);
  expect(output.documents.get('nested/link.md')).toBe('# Workflow\n');
  expect(output.example).toContain('Synthetic');
}));
for (const scenario of ['missing', 'empty', 'oversize', 'invalid-utf8', 'directory', 'escape', 'example-escape', 'git-link', 'oversize-manifest', 'broken-json']) {
  test(`loader rejects ${scenario}`, async () => fixture(async (dir) => {
    const file = join(dir, scenario === 'oversize-manifest' || scenario === 'broken-json' ? 'flow.json' : scenario === 'example-escape' ? 'example.md' : 'workflow.md');
    if (scenario === 'missing') await rm(file);
    if (scenario === 'empty') await writeFile(file, ' \n');
    if (scenario === 'oversize' || scenario === 'oversize-manifest') await writeFile(file, 'x'.repeat((scenario === 'oversize' ? FLOW_LIMITS.document : FLOW_LIMITS.manifest) + 1));
    if (scenario === 'invalid-utf8') await writeFile(file, Buffer.from([0xc3, 0x28]));
    if (scenario === 'broken-json') await writeFile(file, '{bad');
    if (scenario === 'directory') { await rm(file); await mkdir(file); }
    if (scenario === 'escape' || scenario === 'example-escape') { await rm(file); await symlink('/etc/hosts', file); }
    if (scenario === 'git-link') {
      await mkdir(join(dir, '.git')); await writeFile(join(dir, '.git/hidden.md'), 'hidden');
      await rm(file); await symlink('.git/hidden.md', file);
    }
    await expect(loadFlowPackage(dir)).rejects.toThrow();
  }));
}

test('built-in catalog covers all four Feature/delivery paths with examples and explicit gates', async () => {
  const packages = (await loadFlowCatalog(resolve(import.meta.dir, '../doc/flows')))
    .filter((flow) => flow.manifest.family === 'feature-delivery');
  expect(packages.map((p) => p.manifest.id)).toEqual([...FEATURE_PACKAGE_IDS]);
  for (const flow of packages) {
    expect(flow.manifest.family).toBe('feature-delivery');
    expect(flow.example).toContain('Synthetic example');
    expect(flow.example).toContain('Expected output');
    expect(flow.example).toContain('Expected route');
    for (const document of flow.documents.values()) {
      for (const heading of ['Inputs', 'Evidence', 'Questions', 'Checks', 'Approvals', 'Transitions', 'Outcome']) expect(document).toContain(`## ${heading}`);
      expect(document).toContain('last-commit-id');
      expect(document).toContain('not runnable');
    }
    for (const node of flow.manifest.steps) if (node.effect !== 'analysis') expect(node.approval).toBe('explicit');
  }
  expect(packages.find((p) => p.manifest.id === 'delivery')!.manifest.steps.some((n) => n.effect === 'deploy')).toBe(true);
});

test('catalog identity, coverage records and referenced assets fail atomically', async () => {
  for (const scenario of ['duplicate', 'identity', 'family', 'example', 'unknown', 'missing']) {
    await fixture(async (dir) => {
      const child = join(dir, 'one'); await mkdir(child);
      for (const name of ['flow.json', 'workflow.md', 'example.md']) await writeFile(join(child, name), await readFile(join(dir, name)));
      const entry = { id: 'example', family: 'test', manifest: 'one/flow.json', example: 'one/example.md' };
      const catalog: any = { schemaVersion: 1, packages: [entry] };
      if (scenario === 'duplicate') catalog.packages.push(entry);
      if (scenario === 'identity') entry.id = 'wrong';
      if (scenario === 'family') entry.family = 'wrong';
      if (scenario === 'example') entry.example = 'example.md';
      if (scenario === 'unknown') catalog.schedule = 'unsupported';
      if (scenario === 'missing') await rm(join(child, 'example.md'));
      await writeFile(join(dir, 'catalog.json'), JSON.stringify(catalog));
      await expect(loadFlowCatalog(dir)).rejects.toThrow();
    });
  }
});

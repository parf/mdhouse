import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { loadFlowCatalog } from '../src/lib/flow-package';
import { render } from '../src/lib/render';
import { parseQa } from '../src/lib/qa';
import { CHANGE_REVIEW_COVERAGE, EXPECTED_PACKAGE_IDS } from './flow-library-coverage';

const directory = resolve(import.meta.dir, '../agents/flows');

test('change-review batches extend the exact library without dropping prior families', async () => {
  const library = await loadFlowCatalog(directory);
  expect(library.map((flow) => flow.manifest.id)).toEqual([...EXPECTED_PACKAGE_IDS]);
});

for (const row of CHANGE_REVIEW_COVERAGE) test(`${row.id}: independent defaults/evidence/stage coverage and canonical synthetic examples`, async () => {
  const library = await loadFlowCatalog(directory);
  const flow = library.find((entry) => entry.manifest.id === row.id)!;
  expect(flow).toBeDefined();
  expect(flow.manifest.family).toBe(row.family);
  expect(flow.manifest.defaults).toEqual({
    scope: row.scope, audience: row.audience, output: row.output, range: 'explicit-baseline',
    destination: `Plans/flows/${row.id}.md`,
  });
  expect(flow.manifest.evidence).toEqual({ required: [...row.sources], missing: 'block' });
  expect(flow.manifest.entry).toBe(row.stages[0]);
  expect(flow.manifest.steps.map((step) => step.id)).toEqual([...row.stages]);
  const workflow = flow.documents.get('workflow.md')!;
  expect(workflow).toContain('[Shared execution contract](../README.md#runtime-boundary)');
  expect(workflow).toContain('not runnable');
  expect(workflow).toContain('complete without a tracker');
  expect(workflow).toContain('missing mandatory evidence');
  expect(workflow.split('\n').length).toBeLessThan(90);
  expect(flow.example).toContain('Synthetic example');
  expect(flow.example).toContain('not an executed or verified run');
  expect(flow.example).not.toMatch(/\b[0-9a-f]{40}\b/);
  for (const [name, text] of [['workflow.md', workflow], ['example.md', flow.example]] as const) {
    const path = `agents/flows/${row.id}/${name}`;
    const out = await render(text, { rootId: 'r', docPath: path, docUrl: (p) => `/r/${p}` });
    expect(out.html).toContain('id="Q1"');
    const parsed = parseQa(text, 0);
    expect(parsed.items.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/^  > (?:💬|💡)(?!👾)/m);
    expect(text).not.toMatch(/^  > (?:💬|💡)👾.*\n  > (?:💬|💡)👾/m);
    for (const [, id] of text.matchAll(/(?<!\[)№([A-Z][A-Z.-]*\d+[a-z]?(?:\.\d+)?)/g)) expect(out.html).toContain(`id="${id}"`);
  }
});

test('recent commits preserves all six narrative outputs and optional ticketing stays outside the default graph', async () => {
  const flow = (await loadFlowCatalog(directory)).find((entry) => entry.manifest.id === 'recent-commits-review')!;
  const document = flow.documents.get('workflow.md')!;
  for (const output of ['project-change', 'user-facing', 'developer-facing', 'operations-facing', 'changelog/release-note', 'documentation drift', 'commits/files/LoC', 'never a productivity score', 'regressions', 'missing tests', 'API/config', 'task/ticket proposals', 'completed', 'unplanned', 'partially delivered', 'stale']) expect(document).toContain(output);
  for (const filter of ['range', 'author', 'branch', 'subsystem', 'week', 'month']) expect(document).toContain(filter);
  expect(flow.manifest.steps.every((step) => step.effect === 'analysis')).toBe(true);
  expect(flow.manifest.steps.at(-1)!.on.complete).toEqual({ kind: 'end', status: 'complete' });
  const prose = flow.example.replace(/\s+/g, ' ');
  for (const proof of ['2 commits', '3 files', '12 added', '4 removed', 'A1', 'partially delivered', 'No ticket was filed']) expect(prose).toContain(proof);
});

test('incoming changes require exact-target re-review and separate merge approval with recoverable outcomes', async () => {
  const flow = (await loadFlowCatalog(directory)).find((entry) => entry.manifest.id === 'incoming-change-review')!;
  const document = flow.documents.get('workflow.md')!;
  for (const criterion of ['correctness', 'tests', 'security', 'dependencies', 'compatibility', 'documentation', 'operational risk', 'conflicts', 'required reviews', 'unresolved threads', 'migrations', 'release notes', 'rollback', 'vendor/upstream', 'provider response', 'changed target', 'post-merge']) expect(document).toContain(criterion);
  const merge = flow.manifest.steps.find((step) => step.id === 'merge')!;
  expect(merge.effect).toBe('merge');
  expect(merge.approval).toBe('explicit');
  expect(merge.on.denied).toEqual({ kind: 'end', status: 'cancelled' });
  expect(merge.on.failed).toEqual({ kind: 'end', status: 'failed' });
  expect(merge.on.partial).toEqual({ kind: 'end', status: 'partial' });
  expect(merge.on.succeeded).toEqual({ kind: 'step', id: 'post-merge' });
  expect(flow.manifest.steps.filter((step) => step.effect !== 'analysis').map((step) => step.id)).toEqual(['merge']);
  expect(flow.example).toContain('readiness.blocked');
  expect(flow.example).toContain('merge.denied');
  expect(flow.example).toContain('merge.partial');
  expect(flow.example).toContain('No merge was performed');
});

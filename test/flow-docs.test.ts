import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { loadFlowCatalog } from '../src/lib/flow-package';
import { parseQa } from '../src/lib/qa';
import { render } from '../src/lib/render';
import { DOCUMENTATION_COVERAGE, EXPECTED_PACKAGE_IDS } from './flow-library-coverage';

const directory = resolve(import.meta.dir, '../agents/flows');

test('the explicit library covers every approved Documentation package and preserves Feature/delivery', async () => {
  const library = await loadFlowCatalog(directory);
  expect(library.map((flow) => flow.manifest.id)).toEqual([...EXPECTED_PACKAGE_IDS]);
  expect(library.filter((flow) => flow.manifest.family === 'documentation')).toHaveLength(5);
});

for (const row of DOCUMENTATION_COVERAGE) test(`${row.id}: concrete defaults, source requirements, synthetic scenario and safe report routes`, async () => {
  const library = await loadFlowCatalog(directory);
  const flow = library.find((candidate) => candidate.manifest.id === row.id)!;
  expect(flow).toBeDefined();
  expect(flow.manifest.family).toBe('documentation');
  expect(flow.manifest.defaults).toEqual({
    scope: row.scope, range: 'explicit-baseline', audience: row.audience,
    output: row.output, destination: `Plans/flows/${row.id}.md`,
  });
  expect(flow.manifest.evidence).toEqual({ required: [...row.sources], missing: 'block' });
  expect(flow.manifest.entry).toBe(row.stages[0]);
  expect(flow.manifest.steps.map((step) => step.id)).toEqual([...row.stages]);
  for (const step of flow.manifest.steps) {
    expect(step.effect).toBe('analysis');
    expect(step.approval).toBe('none');
    expect(step.on.blocked).toEqual({ kind: 'end', status: 'blocked' });
    expect(step.on.failed).toEqual({ kind: 'end', status: 'failed' });
  }
  expect(flow.manifest.steps.at(-1)!.on.complete).toEqual({ kind: 'end', status: 'complete' });
  const workflow = flow.documents.get('workflow.md')!;
  expect(workflow).toContain('not runnable');
  expect(workflow).toContain('missing mandatory evidence');
  expect(workflow).toContain('separate preview and explicit approval');
  expect(workflow).toContain('complete without a tracker');
  expect(workflow).toContain('Neither manual nor scheduled execution is implemented');
  expect(workflow).toContain('Schedules can start work, never approve actions.');
  expect(flow.example).toContain('Synthetic example');
  expect(flow.example).toContain('not an executed or verified run');
  expect(flow.example).toContain('## Expected output');
  expect(flow.example).toContain('## Expected route');
  for (const evidence of row.exampleEvidence) expect(flow.example).toContain(evidence);
  expect(flow.example).not.toMatch(/\b[0-9a-f]{40}\b/);

  for (const [name, text] of [['workflow.md', workflow], ['example.md', flow.example]]) {
    const path = `agents/flows/${row.id}/${name}`;
    const parsed = parseQa(text!, 0);
    expect(parsed.items.length).toBeGreaterThan(0);
    const out = await render(text!, { rootId: 'r', docPath: path, docUrl: (p) => `/r/${p}` });
    const sourceIds = [...text!.matchAll(/^- (?:❓|🟠|⚪|📌|✅) ([A-Z][A-Z.-]*\d+[a-z]?(?:\.\d+)?) /gm)].map((m) => m[1]!);
    expect(sourceIds).toContain('Q1');
    expect(new Set(sourceIds).size).toBe(sourceIds.length);
    for (const id of sourceIds) expect(out.html).toContain(`id="${id}"`);
    for (const match of text!.matchAll(/(?<!\[)№([A-Z][A-Z.-]*\d+[a-z]?(?:\.\d+)?)/g)) expect(sourceIds).toContain(match[1]!);
    expect(text).not.toMatch(/^> ?(?:💬|💡)/m);
    expect(text).not.toMatch(/^  > (?:💬|💡)(?!👾)/m);
    expect(text).not.toMatch(/^  > (?:💬|💡)👾.*\n  > (?:💬|💡)👾/m);
  }
});

test('Documentation instructions preserve deep subsystem work and selectable reader/scope dimensions', async () => {
  const library = await loadFlowCatalog(directory);
  const get = (id: string) => library.find((flow) => flow.manifest.id === id)!.documents.get('workflow.md')!;
  const generate = get('docs-generate-update');
  for (const contract of ['deep subsystem documentation', 'dependencies', 'invariants', 'failure modes', 'project and subsystem summaries']) expect(generate).toContain(contract);
  const overview = get('docs-project-overview');
  for (const reader of ['executive', 'marketing/product', 'development', 'QA', 'operations', 'security', 'custom']) expect(overview).toContain(reader);
  for (const dimension of ['whole project', 'subsystem', 'aspect', 'path', 'timeframe']) expect(overview).toContain(dimension);
  expect(get('docs-refresh-verify')).toContain('verified claims from inference');
  expect(get('docs-refresh-verify')).toContain('unresolved contradictions');
  for (const form of ['tutorial', 'how-to', 'reference', 'explanation']) expect(get('docs-architecture')).toContain(form);
  for (const field of ['sources', 'last-verified-change', 'owners', 'confidence', 'drift']) expect(get('docs-trust-report')).toContain(field);
});

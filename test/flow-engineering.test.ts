import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { loadFlowCatalog } from '../src/lib/flow-package';
import { render } from '../src/lib/render';
import { parseQa } from '../src/lib/qa';
import { ENGINEERING_COVERAGE, EXPECTED_PACKAGE_IDS } from './flow-library-coverage';

const directory = resolve(import.meta.dir, '../doc/flows');

test('first Engineering batch preserves all prior packages and exact approved coverage', async () => {
  const library = await loadFlowCatalog(directory);
  expect(library.map((entry) => entry.manifest.id)).toEqual([...EXPECTED_PACKAGE_IDS]);
  expect(library.filter((entry) => entry.manifest.family === 'engineering')).toHaveLength(4);
});

for (const row of ENGINEERING_COVERAGE) test(`${row.id}: evidence, honest unknowns and recoverable report routes`, async () => {
  const flow = (await loadFlowCatalog(directory)).find((entry) => entry.manifest.id === row.id)!;
  expect(flow).toBeDefined();
  expect(flow.manifest.family).toBe('engineering');
  expect(flow.manifest.defaults).toEqual({ scope: 'selected-project', range: 'explicit-baseline',
    audience: row.audience, output: row.output, destination: `Plans/flows/${row.id}.md` });
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
  expect(workflow).toContain('[Shared execution contract](../README.md#runtime-boundary)');
  expect(workflow).toContain('not runnable');
  expect(workflow).toContain('missing mandatory evidence');
  expect(workflow).toContain('complete without a tracker');
  expect(workflow).toContain('separate preview and explicit approval');
  expect(workflow).toContain('`DECISIONS.md`');
  expect(workflow).toContain('`resolved.md`');
  expect(flow.example).toContain('Synthetic example');
  expect(flow.example).toContain('not an executed or verified run');
  expect(flow.example).not.toMatch(/\b[0-9a-f]{40}\b/);
  const prose = flow.example.replace(/\s+/g, ' ');
  for (const fact of row.exampleFacts) expect(prose).toContain(fact);
  for (const [name, text] of [['workflow.md', workflow], ['example.md', flow.example]] as const) {
    const out = await render(text, { rootId: 'r', docPath: `doc/flows/${row.id}/${name}`, docUrl: (p) => `/r/${p}` });
    expect(out.html).toContain('id="Q1"');
    expect(parseQa(text, 0).items.length).toBeGreaterThan(0);
    for (const [, id] of text.matchAll(/(?<!\[)№([A-Z][A-Z.-]*\d+[a-z]?(?:\.\d+)?)/g)) expect(out.html).toContain(`id="${id}"`);
    expect(text).not.toMatch(/^  > (?:💬|💡)(?!👾)/m);
    expect(text).not.toMatch(/^  > (?:💬|💡)👾.*\n  > (?:💬|💡)👾/m);
  }
});

test('Engineering instructions cover each named domain rather than reuse a generic report', async () => {
  const library = await loadFlowCatalog(directory);
  const text = (id: string) => library.find((entry) => entry.manifest.id === id)!.documents.get('workflow.md')!;
  for (const field of ['version', 'breaking changes', 'migrations', 'rollout', 'observability', 'rollback', 'stakeholder']) expect(text('engineering-release-readiness')).toContain(field);
  for (const field of ['subsystem', 'dependencies', 'data-flow', 'ADR', 'ownership gaps', 'routing']) expect(text('engineering-architecture-ownership')).toContain(field);
  for (const field of ['dependencies', 'vulnerabilities', 'licenses', 'flaky tests', 'CI drift', 'deprecated APIs', 'maintenance backlog', 'unknown']) expect(text('engineering-project-health')).toContain(field);
  for (const field of ['clean account', 'role-specific tours', 'glossary', 'first-task guide', 'ownership/contact map', 'prerequisite']) expect(text('engineering-onboarding-handoff')).toContain(field);
});

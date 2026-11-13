import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { loadFlowCatalog } from '../src/lib/flow-package';
import { parseQa } from '../src/lib/qa';
import { render } from '../src/lib/render';
import { BUSINESS_COVERAGE, EXPECTED_PACKAGE_IDS } from './flow-library-coverage';

const directory = resolve(import.meta.dir, '../agents/flows');

test('Business authoring coverage preserves the previous nineteen packages', async () => {
  const library = await loadFlowCatalog(directory);
  expect(library.map((flow) => flow.manifest.id)).toEqual([...EXPECTED_PACKAGE_IDS]);
  expect(library.filter((flow) => flow.manifest.family === 'business')).toHaveLength(5);
});

for (const row of BUSINESS_COVERAGE) test(`${row.id}: distinct evidence, honest proposals and synthetic citations`, async () => {
  const flow = (await loadFlowCatalog(directory)).find((entry) => entry.manifest.id === row.id)!;
  expect(flow).toBeDefined();
  expect(flow.manifest.family).toBe('business');
  expect(flow.manifest.defaults).toEqual({ scope: row.scope, range: 'explicit-baseline',
    audience: row.audience, output: row.output, destination: `Plans/flows/${row.id}.md` });
  expect(flow.manifest.evidence).toEqual({ required: [...row.sources], missing: 'block' });
  expect(flow.manifest.entry).toBe(row.stages[0]);
  expect(flow.manifest.steps.map((step) => step.id)).toEqual([...row.stages]);
  for (const step of flow.manifest.steps) {
    expect(step.effect).toBe('analysis'); expect(step.approval).toBe('none');
    expect(step.on.blocked).toEqual({ kind: 'end', status: 'blocked' });
    expect(step.on.failed).toEqual({ kind: 'end', status: 'failed' });
  }
  expect(flow.manifest.steps.at(-1)!.on.complete).toEqual({ kind: 'end', status: 'complete' });
  const document = flow.documents.get('workflow.md')!;
  for (const term of ['not runnable', '[Shared execution contract](../README.md#runtime-boundary)', 'missing mandatory evidence', 'source references', 'complete without a tracker', 'separate preview and explicit approval', '`DECISIONS.md`', '`resolved.md`']) expect(document).toContain(term);
  expect(flow.example).toContain('not an executed or verified run');
  expect(flow.example).toContain('Synthetic example');
  expect(flow.example).not.toMatch(/\b[0-9a-f]{40}\b/);
  expect(flow.example).not.toMatch(/^- (?:✅|📌)/m);
  for (const fact of row.exampleFacts) expect(flow.example.replace(/\s+/g, ' ')).toContain(fact);
  for (const [name, text] of [['workflow.md', document], ['example.md', flow.example]] as const) {
    const out = await render(text, { rootId: 'r', docPath: `agents/flows/${row.id}/${name}`, docUrl: (p) => `/r/${p}` });
    expect(out.html).toContain('id="Q1"');
    expect(parseQa(text, 0).items.length).toBeGreaterThan(0);
    for (const [, id] of text.matchAll(/(?<!\[)№([A-Z][A-Z.-]*\d+[a-z]?(?:\.\d+)?)/g)) expect(out.html).toContain(`id="${id}"`);
    expect(text).not.toMatch(/^  > (?:💬|💡)(?!👾)/m);
    expect(text).not.toMatch(/^  > (?:💬|💡)👾.*\n  > (?:💬|💡)👾/m);
  }
});

test('Business-specific distinctions include metric comparability and proposal/decision separation', async () => {
  const library = await loadFlowCatalog(directory);
  const text = (id: string) => library.find((flow) => flow.manifest.id === id)!.documents.get('workflow.md')!;
  for (const field of ['product', 'customers', 'value proposition', 'channels', 'revenue model', 'costs', 'risks', 'priorities']) expect(text('business-overview')).toContain(field);
  for (const field of ['goals', 'constraints', 'options', 'trade-offs', 'milestones', 'assumptions', 'owners', 'measurable outcomes']) expect(text('business-strategy-planning')).toContain(field);
  for (const field of ['market', 'segment', 'customer', 'competitor', 'observations', 'assumptions', 'unanswered questions']) expect(text('business-market-customer')).toContain(field);
  for (const field of ['targets', 'actuals', 'drivers', 'risks', 'decisions', 'follow-up', 'weekly', 'monthly', 'quarterly', 'denominator', 'freshness']) expect(text('business-kpi-review')).toContain(field);
  for (const field of ['alternatives', 'evidence', 'costs', 'risks', 'reversibility', 'recommendation', 'pending', 'rationale']) expect(text('business-decision-memo')).toContain(field);
});

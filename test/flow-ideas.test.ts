import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { loadFlowCatalog } from '../src/lib/flow-package';
import { parseQa } from '../src/lib/qa';
import { render } from '../src/lib/render';
import { IDEAS_COVERAGE, EXPECTED_PACKAGE_IDS } from './flow-library-coverage';

const directory = resolve(import.meta.dir, '../agents/flows');

test('Ideas coverage preserves all previous twenty-four authoring packages', async () => {
  const library = await loadFlowCatalog(directory);
  expect(library.map((flow) => flow.manifest.id)).toEqual([...EXPECTED_PACKAGE_IDS]);
  expect(library.filter((flow) => flow.manifest.family === 'ideas')).toHaveLength(5);
});

for (const row of IDEAS_COVERAGE) test(`${row.id}: provenance, assumptions and deliberate action boundaries`, async () => {
  const flow = (await loadFlowCatalog(directory)).find((entry) => entry.manifest.id === row.id)!;
  expect(flow).toBeDefined(); expect(flow.manifest.family).toBe('ideas');
  expect(flow.manifest.defaults).toEqual({ scope: 'selected-document', range: 'explicit-baseline',
    audience: 'product', output: row.output, destination: `Plans/flows/${row.id}.md` });
  expect(flow.manifest.evidence).toEqual({ required: [...row.sources], missing: 'block' });
  expect(flow.manifest.entry).toBe(row.stages[0]);
  expect(flow.manifest.steps.map((step) => step.id)).toEqual([...row.stages]);
  for (const step of flow.manifest.steps) {
    expect(step.effect).toBe('analysis'); expect(step.approval).toBe('none');
    expect(step.on.blocked).toEqual({ kind: 'end', status: 'blocked' });
    expect(step.on.failed).toEqual({ kind: 'end', status: 'failed' });
  }
  expect(flow.manifest.steps.at(-1)!.on.complete).toEqual(row.handoff
    ? { kind: 'handoff', to: 'person', target: 'project-owner' } : { kind: 'end', status: 'complete' });
  const document = flow.documents.get('workflow.md')!;
  for (const term of ['not runnable', '[Shared execution contract](../README.md#runtime-boundary)', 'missing mandatory evidence', 'source references', 'complete without a tracker', 'separate preview and explicit approval', '`DECISIONS.md`', '`RESOLVED.md`']) expect(document).toContain(term);
  expect(flow.example).toContain('Synthetic example');
  expect(flow.example).toContain('not an executed or verified run');
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

test('Ideas instructions preserve all five domain contracts without starting work', async () => {
  const library = await loadFlowCatalog(directory);
  const text = (id: string) => library.find((flow) => flow.manifest.id === id)!.documents.get('workflow.md')!;
  for (const field of ['problem', 'audience', 'outcome', 'constraints', 'open questions', 'solution']) expect(text('ideas-capture')).toContain(field);
  for (const field of ['related work', 'objections', 'duplicates', 'source provenance', 'original IDs', 'opportunity brief']) expect(text('ideas-research-synthesis')).toContain(field);
  for (const field of ['impact', 'confidence', 'effort', 'urgency', 'strategic fit', 'reversibility', 'assumptions', 'score']) expect(text('ideas-prioritization')).toContain(field);
  for (const field of ['smallest validation', 'success', 'guardrail', 'audience', 'duration', 'decision rule', 'baseline', 'denominator']) expect(text('ideas-experiment-design')).toContain(field);
  for (const field of ['selected idea', 'project', 'plan', 'feature flow', 'rejected alternatives', 'unresolved questions', 'original IDs', 'no root creation']) expect(text('ideas-to-project')).toContain(field);
});

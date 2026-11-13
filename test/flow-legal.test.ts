import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { loadFlowCatalog } from '../src/lib/flow-package';
import { render } from '../src/lib/render';
import { LEGAL_COVERAGE, EXPECTED_PACKAGE_IDS } from './flow-library-coverage';

const directory = resolve(import.meta.dir, '../agents/flows');

test('Legal assets preserve all thirty-four previous packages and add exactly five', async () => {
  const library = await loadFlowCatalog(directory);
  expect(library.map((flow) => flow.manifest.id)).toEqual([...EXPECTED_PACKAGE_IDS]);
  expect(library.filter((flow) => flow.manifest.family !== 'legal')).toHaveLength(34);
  expect(library.filter((flow) => flow.manifest.family === 'legal')).toHaveLength(5);
});

for (const row of LEGAL_COVERAGE) test(`${row.id}: supplied evidence and qualified review boundaries`, async () => {
  const flow = (await loadFlowCatalog(directory)).find((entry) => entry.manifest.id === row.id)!;
  expect(flow).toBeDefined();
  expect(flow.manifest.family).toBe('legal');
  expect(flow.manifest.defaults).toEqual({ scope: 'selected-document', range: 'explicit-baseline',
    audience: 'legal', output: row.output, destination: `Plans/flows/${row.id}.md` });
  expect(flow.manifest.evidence).toEqual({ required: [...row.sources], missing: 'block' });
  expect(flow.manifest.entry).toBe(row.stages[0]);
  expect(flow.manifest.steps.map((step) => step.id)).toEqual([...row.stages]);
  for (const [index, step] of flow.manifest.steps.entries()) {
    expect(step.effect).toBe('analysis'); expect(step.approval).toBe('none');
    expect(step.on.blocked).toEqual({ kind: 'end', status: 'blocked' });
    expect(step.on.failed).toEqual({ kind: 'end', status: 'failed' });
    expect(step.on.complete).toEqual(index + 1 === row.stages.length
      ? { kind: 'end', status: 'complete' } : { kind: 'step', id: row.stages[index + 1]! });
  }
  const document = flow.documents.get('workflow.md')!;
  const prose = document.replace(/\s+/g, ' ');
  for (const term of ['not runnable', '[Shared execution contract](../README.md#runtime-boundary)',
    'missing mandatory evidence', 'source citations', 'confidentiality', 'jurisdiction', 'date',
    'uncertain interpretation', 'qualified human review', 'not legal advice',
    'complete without a tracker', 'No filings, signatures, acceptance or sends']) expect(prose).toContain(term);
  for (const stage of row.stages) expect(document).toContain(`### ${stage}\n`);
  expect(flow.example).toContain('Synthetic example');
  expect(flow.example).toContain('not an executed or verified run');
  expect(flow.example).not.toMatch(/\b[0-9a-f]{40}\b/);
  for (const fact of row.exampleFacts) expect(flow.example.replace(/\s+/g, ' ')).toContain(fact);
  for (const [name, text] of [['workflow.md', document], ['example.md', flow.example]] as const) {
    const out = await render(text, { rootId: 'r', docPath: `agents/flows/${row.id}/${name}`, docUrl: (p) => `/r/${p}` });
    expect(out.html).toContain('id="Q1"');
    for (const [, id] of text.matchAll(/(?<!\[)№([A-Z][A-Z.-]*\d+[a-z]?(?:\.\d+)?)/g)) expect(out.html).toContain(`id="${id}"`);
    expect(text).not.toMatch(/^  > (?:💬|💡)(?!👾)/m);
    expect(text).not.toMatch(/^  > (?:💬|💡)👾.*\n  > (?:💬|💡)👾/m);
    expect(text).not.toMatch(/^- (?:✅|📌) /m);
  }
});

test('Legal packages retain domain-specific source fields and do not infer legal status or deadlines', async () => {
  const library = await loadFlowCatalog(directory);
  const text = (id: string) => library.find((flow) => flow.manifest.id === id)!.documents.get('workflow.md')!.replace(/\s+/g, ' ');
  for (const term of ['parties', 'money', 'renewal', 'termination', 'unusual clauses', 'missing terms']) expect(text('legal-contract-review')).toContain(term);
  for (const term of ['owner', 'notice window', 'trigger', 'timezone', 'no deadline', 'reminders are not installed']) expect(text('legal-obligation-renewal')).toContain(term);
  for (const term of ['requirement set', 'version', 'implementation evidence', 'not a compliance certification']) expect(text('legal-policy-compliance')).toContain(term);
  for (const term of ['products', 'processes', 'documents', 'owners', 'draft remediation', 'effective date']) expect(text('legal-change-impact')).toContain(term);
  for (const term of ['facts', 'timeline', 'desired outcome', 'questions for counsel', 'minimum necessary disclosure', 'privilege']) expect(text('legal-request-brief')).toContain(term);
});

test('synthetic evidence gaps stop at declared nodes while a counsel brief retains unresolved facts', async () => {
  const library = await loadFlowCatalog(directory);
  const cases = [
    ['legal-contract-review', 'issues', 'blocked', 'Draft A §2', 'Draft A §9'],
    ['legal-obligation-renewal', 'windows', 'blocked', 'Agreement B §4', 'service start not supplied'],
    ['legal-policy-compliance', 'map', 'blocked', 'Requirements C v1', 'Policy C v2 §3'],
    ['legal-change-impact', 'applicability', 'blocked', 'Change D draft §5', 'Baseline D §5'],
    ['legal-request-brief', 'brief', 'complete', 'Email E metadata', 'Intake E note'],
  ] as const;
  for (const [id, stage, outcome, ...citations] of cases) {
    const flow = library.find((item) => item.manifest.id === id)!;
    expect(flow.manifest.steps.find((step) => step.id === stage)!.on[outcome]).toEqual({ kind: 'end', status: outcome });
    expect(flow.example).toContain(`${stage}.${outcome} → end(${outcome})`);
    for (const citation of citations) expect(flow.example).toContain(citation);
    expect(flow.example).toContain('Question №Q1 stays open');
    expect(flow.example.toLowerCase()).toContain('confidentiality');
    expect(flow.example.toLowerCase()).toContain('jurisdiction');
  }
  const renewal = library.find((item) => item.manifest.id === 'legal-obligation-renewal')!.example;
  expect(renewal.match(/\b\d{4}-\d{2}-\d{2}\b/g)).toEqual(['2026-10-01']);
  const brief = library.find((item) => item.manifest.id === 'legal-request-brief')!.example;
  expect(brief).toContain('Restricted attachment text is omitted');
  expect(brief).toContain('any dependent factual conclusion remains blocked');
});

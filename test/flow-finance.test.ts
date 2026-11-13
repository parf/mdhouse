import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { loadFlowCatalog } from '../src/lib/flow-package';
import { render } from '../src/lib/render';
import { FINANCE_COVERAGE, EXPECTED_PACKAGE_IDS } from './flow-library-coverage';

const directory = resolve(import.meta.dir, '../agents/flows');

test('Finance packages preserve the exact previous twenty-nine package library', async () => {
  const library = await loadFlowCatalog(directory);
  expect(library.map((flow) => flow.manifest.id)).toEqual([...EXPECTED_PACKAGE_IDS]);
  expect(library.filter((flow) => flow.manifest.family === 'finance')).toHaveLength(5);
});

for (const row of FINANCE_COVERAGE) test(`${row.id}: explicit inputs, uncertainty and analysis-only boundaries`, async () => {
  const flow = (await loadFlowCatalog(directory)).find((entry) => entry.manifest.id === row.id)!;
  expect(flow).toBeDefined(); expect(flow.manifest.family).toBe('finance');
  expect(flow.manifest.defaults).toEqual({ scope: 'selected-document', range: 'explicit-baseline',
    audience: 'finance', output: row.output, destination: `Plans/flows/${row.id}.md` });
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
  const prose = document.replace(/\s+/g, ' ');
  for (const term of ['not runnable', '[Shared execution contract](../README.md#runtime-boundary)', 'missing mandatory evidence', 'source references', 'currency', 'period', 'units', 'assumptions', 'estimates', 'complete without a tracker', 'separate preview and explicit approval', 'not financial advice', 'never initiate payments or move funds']) expect(prose).toContain(term);
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
  }
});

function tableNumber(text: string, label: string): number {
  const row = text.split('\n').find((line) => line.split('|')[1]?.trim() === label);
  expect(row).toBeDefined();
  const raw = row!.split('|')[2]?.trim();
  expect(raw).toBeDefined();
  expect(raw!).toMatch(/^-?\d+(?:\.\d+)?$/);
  const value = Number(raw);
  expect(Number.isFinite(value)).toBe(true);
  return value;
}

test('synthetic formulas reconcile their own supplied tables without a production finance engine', async () => {
  const library = await loadFlowCatalog(directory);
  const example = (id: string) => library.find((flow) => flow.manifest.id === id)!.example;
  const variance = example('finance-variance-report');
  expect(tableNumber(variance, 'Expense delta')).toBe(tableNumber(variance, 'Actual expense') - tableNumber(variance, 'Plan expense'));
  const units = example('finance-unit-economics-pricing');
  expect(tableNumber(units, 'Contribution')).toBe(tableNumber(units, 'Unit price') - tableNumber(units, 'Variable cost'));
  expect(tableNumber(units, 'Contribution')).toBeLessThan(0);
  const cash = example('finance-cash-runway');
  expect(tableNumber(cash, 'Available cash')).toBe(tableNumber(cash, 'Total cash') - tableNumber(cash, 'Restricted cash'));
  expect(tableNumber(cash, 'Positive-burn scenario months')).toBe(tableNumber(cash, 'Available cash') / tableNumber(cash, 'Positive-burn scenario'));
  const document = example('finance-document-review');
  expect(tableNumber(document, 'Unexplained difference')).toBe(tableNumber(document, 'Stated total') - tableNumber(document, 'Line one') - tableNumber(document, 'Line two'));
});

test('Finance workflow formulas expose denominator and model limits rather than silently filling zeros', async () => {
  const library = await loadFlowCatalog(directory);
  const text = (id: string) => library.find((flow) => flow.manifest.id === id)!.documents.get('workflow.md')!;
  expect(text('finance-budget-forecast')).toContain('ending cash = opening cash + inflows - outflows');
  for (const term of ['actual - plan', 'zero', 'sign convention']) expect(text('finance-variance-report')).toContain(term);
  for (const term of ['price - variable cost', 'fixed costs / contribution', 'nonpositive']) expect(text('finance-unit-economics-pricing')).toContain(term);
  for (const term of ['available cash / positive net burn', 'restricted', 'zero or negative']) expect(text('finance-cash-runway')).toContain(term);
  for (const term of ['terms', 'dates', 'amounts', 'tax', 'source records']) expect(text('finance-document-review')).toContain(term);
});

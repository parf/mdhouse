import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { loadFlowCatalog } from '../src/lib/flow-package';
import { rangeLabel, runnableFlow } from '../src/lib/flow-host';

const catalog = await loadFlowCatalog(resolve(import.meta.dir, '../agents/flows'));
const byId = (id: string) => catalog.find((p) => p.manifest.id === id)!.manifest;

describe('which flows the host runs without code of its own', () => {
  test('exactly the analysis-only, explicit-baseline packages that name a range in their evidence', () => {
    expect(catalog.filter((p) => runnableFlow(p.manifest)).map((p) => p.manifest.id).sort()).toEqual([
      'docs-refresh-verify', 'engineering-delivery-sync', 'project-review', 'recent-commits-review',
    ]);
  });
  test('the host supplies the label that names the range, wherever it sits', () => {
    expect(rangeLabel(byId('recent-commits-review'))).toBe('explicit commit range and selected filters');
    expect(rangeLabel(byId('docs-refresh-verify'))).toBe('explicit change range');
    expect(byId('docs-refresh-verify').evidence.required.indexOf('explicit change range')).toBe(2);
  });
  test('a package with a consequential step, or no range evidence, is not runnable', () => {
    const base = byId('recent-commits-review');
    expect(runnableFlow({ ...base, steps: [{ ...base.steps[0]!, effect: 'edit' as never, approval: 'explicit' }] })).toBe(false);
    expect(runnableFlow({ ...base, evidence: { ...base.evidence, required: ['diffs', 'plans'] } })).toBe(false);
    expect(runnableFlow({ ...base, defaults: { ...base.defaults, range: 'last-run' as never } })).toBe(false);
    expect(runnableFlow(byId('docs-trust-report'))).toBe(false);
  });
});

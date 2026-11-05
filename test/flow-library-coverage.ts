/** Expected library coverage from the approved flow narrative, independent of catalog contents. */
export const FEATURE_PACKAGE_IDS = ['feature', 'project-review', 'delivery', 'next-feature'] as const;

export const DOCUMENTATION_COVERAGE = [
  {
    id: 'docs-generate-update', scope: 'selected-project', audience: 'development', output: 'documentation-set',
    stages: ['inventory', 'decompose', 'deep-docs', 'summarize', 'report'],
    sources: ['code and configuration inventory', 'subsystem boundaries and dependencies', 'API contracts and checks'],
    exampleEvidence: ['parser.md', 'storage.md', 'atomic replacement', 'empty input', 'project-summary.md'],
  },
  {
    id: 'docs-refresh-verify', scope: 'selected-document', audience: 'development', output: 'documentation-findings',
    stages: ['scope', 'compare', 'resolve', 'report'],
    sources: ['selected documentation', 'current code configuration and API evidence', 'explicit change range'],
    exampleEvidence: ['encoding', 'UTF-8', 'UTF-16', 'unresolved contradiction', 'compare.blocked'],
  },
  {
    id: 'docs-project-overview', scope: 'selected-project', audience: 'executive', output: 'project-overview',
    stages: ['scope', 'synthesize', 'report'],
    sources: ['project or subsystem evidence', 'audience and selected aspect paths or timeframe', 'current change baseline'],
    exampleEvidence: ['reliability', '2026-10-01', '2026-10-07', 'payments', 'executive'],
  },
  {
    id: 'docs-architecture', scope: 'selected-project', audience: 'development', output: 'documentation-architecture',
    stages: ['inventory', 'classify', 'gaps', 'report'],
    sources: ['documentation and link inventory', 'reader tasks and product evidence'],
    exampleEvidence: ['tutorial', 'how-to', 'reference', 'explanation', 'orphan', 'duplicate'],
  },
  {
    id: 'docs-trust-report', scope: 'selected-project', audience: 'development', output: 'documentation-trust-report',
    stages: ['inventory', 'verify', 'register', 'report'],
    sources: ['documentation inventory', 'source revisions and verification records', 'owner metadata or explicit unknown'],
    exampleEvidence: ['last-verified-change', 'unknown', 'drift', 'owner', 'confidence'],
  },
] as const;

export const EXPECTED_PACKAGE_IDS: readonly string[] = [
  ...FEATURE_PACKAGE_IDS, ...DOCUMENTATION_COVERAGE.map((row) => row.id),
];

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

export const CHANGE_REVIEW_COVERAGE = [
  {
    id: 'recent-commits-review', family: 'commit-review', scope: 'selected-project',
    audience: 'development', output: 'commit-review',
    stages: ['scope', 'summaries', 'risks', 'delivery-sync', 'report'],
    sources: ['explicit commit range and selected filters', 'diffs and reproduction evidence', 'linked plans documentation and task state'],
  },
  {
    id: 'incoming-change-review', family: 'incoming-change', scope: 'selected-document',
    audience: 'development', output: 'merge-readiness',
    stages: ['intake', 'review', 'feedback', 're-review', 'readiness', 'merge', 'post-merge', 'report'],
    sources: ['PR or incoming patch with exact base and target', 'checks reviews conflicts and threads', 'ownership plans migration release and rollback evidence'],
  },
] as const;

export const ENGINEERING_COVERAGE = [
  {
    id: 'engineering-release-readiness', audience: 'operations', output: 'release-readiness',
    stages: ['inventory', 'assess', 'readiness', 'report'],
    sources: ['version and change inventory', 'checks breaking changes and migrations', 'rollout observability and rollback evidence'],
    exampleFacts: ['rollback: missing', 'readiness.blocked', 'No deployment'],
  },
  {
    id: 'engineering-architecture-ownership', audience: 'development', output: 'architecture-map',
    stages: ['inventory', 'map', 'ownership', 'report'],
    sources: ['subsystem code configuration and interfaces', 'dependencies and data flow', 'owner registry or explicit unknown'],
    exampleFacts: ['shared-cache', 'owner: unknown', 'ADR proposal', 'No routing message'],
  },
  {
    id: 'engineering-project-health', audience: 'development', output: 'project-health',
    stages: ['inventory', 'assess', 'prioritize', 'report'],
    sources: ['dependency and configuration inventory', 'security and license evidence or explicit unavailable', 'test CI and deprecation records'],
    exampleFacts: ['security: unknown', 'license: unknown', 'not verified', 'No safe verdict'],
  },
  {
    id: 'engineering-onboarding-handoff', audience: 'development', output: 'onboarding-guide',
    stages: ['prerequisites', 'clean-setup', 'role-handoff', 'report'],
    sources: ['setup prerequisites and documentation', 'clean-account commands results and environment', 'role ownership and contact map or explicit unknown'],
    exampleFacts: ['CONFIG_PROFILE', 'clean-setup.blocked', 'not a successful setup', 'first-task guide'],
  },
] as const;

export const EXPECTED_PACKAGE_IDS: readonly string[] = [
  ...FEATURE_PACKAGE_IDS, ...DOCUMENTATION_COVERAGE.map((row) => row.id),
  ...CHANGE_REVIEW_COVERAGE.map((row) => row.id),
  ...ENGINEERING_COVERAGE.map((row) => row.id),
];

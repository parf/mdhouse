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
    id: 'engineering-release-readiness', scope: 'selected-project', audience: 'operations', output: 'release-readiness',
    stages: ['inventory', 'assess', 'readiness', 'report'],
    sources: ['version and change inventory', 'checks breaking changes and migrations', 'rollout observability and rollback evidence'],
    exampleFacts: ['rollback: missing', 'readiness.blocked', 'No deployment'],
  },
  {
    id: 'engineering-architecture-ownership', scope: 'selected-project', audience: 'development', output: 'architecture-map',
    stages: ['inventory', 'map', 'ownership', 'report'],
    sources: ['subsystem code configuration and interfaces', 'dependencies and data flow', 'owner registry or explicit unknown'],
    exampleFacts: ['shared-cache', 'owner: unknown', 'ADR proposal', 'No routing message'],
  },
  {
    id: 'engineering-project-health', scope: 'selected-project', audience: 'development', output: 'project-health',
    stages: ['inventory', 'assess', 'prioritize', 'report'],
    sources: ['dependency and configuration inventory', 'security and license evidence or explicit unavailable', 'test CI and deprecation records'],
    exampleFacts: ['security: unknown', 'license: unknown', 'not verified', 'No safe verdict'],
  },
  {
    id: 'engineering-onboarding-handoff', scope: 'selected-project', audience: 'development', output: 'onboarding-guide',
    stages: ['prerequisites', 'clean-setup', 'role-handoff', 'report'],
    sources: ['setup prerequisites and documentation', 'clean-account commands results and environment', 'role ownership and contact map or explicit unknown'],
    exampleFacts: ['CONFIG_PROFILE', 'clean-setup.blocked', 'not a successful setup', 'first-task guide'],
  },
  {
    id: 'engineering-incident-regression', scope: 'selected-subsystem', audience: 'operations', output: 'incident-brief',
    stages: ['intake', 'correlate', 'reproduce', 'recovery-options', 'report'],
    sources: ['symptoms logs and timestamps', 'selected code and configuration changes', 'reproduction and check records or explicit unavailable'],
    exampleFacts: ['correlation, not proven root cause', 'reproduce.blocked', 'No rollback'],
  },
  {
    id: 'engineering-delivery-sync', scope: 'selected-project', audience: 'product', output: 'delivery-sync',
    stages: ['inventory', 'compare', 'acceptance-gaps', 'report'],
    sources: ['same-range plans tickets code tests and documentation', 'acceptance requirements and observed results', 'ownership and current task state'],
    exampleFacts: ['plan says done', 'migration check: missing', 'partially delivered', 'No checkpoint'],
  },
  {
    id: 'engineering-api-schema-impact', scope: 'selected-subsystem', audience: 'development', output: 'compatibility-impact',
    stages: ['scope', 'contract-diff', 'consumer-impact', 'migration-proposal', 'report'],
    sources: ['exact base and target endpoint event database and config schemas', 'consumer and compatibility evidence', 'migration constraints and owners or explicit unknown'],
    exampleFacts: ['removed field', 'compatibility: unknown', 'migration proposal', 'No database'],
  },
  {
    id: 'engineering-maintenance-debt', scope: 'selected-project', audience: 'development', output: 'maintenance-backlog',
    stages: ['inventory', 'verify-candidates', 'prioritize', 'report'],
    sources: ['code configuration and usage checks', 'flag deprecation ownership and decision history', 'documentation and source-linked TODO or FIXME records'],
    exampleFacts: ['dynamic registry', 'not dead code', 'expired flag', 'No deletion'],
  },
] as const;

export const BUSINESS_COVERAGE = [
  {
    id: 'business-overview', scope: 'selected-project', audience: 'executive', output: 'business-overview',
    stages: ['scope', 'evidence', 'synthesize', 'report'],
    sources: ['product customers value and channels', 'revenue and cost evidence or explicit unknown', 'risks priorities period and owners'],
    exampleFacts: ['revenue: unknown', 'not a verified business model', 'No product copy'],
  },
  {
    id: 'business-strategy-planning', scope: 'selected-project', audience: 'product', output: 'strategy-plan',
    stages: ['frame', 'options', 'milestones', 'report'],
    sources: ['goals constraints and decision criteria', 'option evidence costs and assumptions', 'owners milestones and measurable outcomes'],
    exampleFacts: ['10 staff-days', '6 staff-days', '12 staff-days', 'proposal, not an approved plan'],
  },
  {
    id: 'business-market-customer', scope: 'selected-document', audience: 'product', output: 'market-customer-brief',
    stages: ['scope', 'source-review', 'synthesize', 'report'],
    sources: ['market segment customer and competitor sources', 'source dates population and method', 'contradictions assumptions and unanswered questions'],
    exampleFacts: ['SMB interviews', 'enterprise survey', 'not a representative market estimate', 'No live research'],
  },
  {
    id: 'business-kpi-review', scope: 'selected-document', audience: 'executive', output: 'kpi-review',
    stages: ['define', 'validate', 'interpret', 'report'],
    sources: ['metric definitions targets and actual inputs', 'period population units and source freshness', 'driver evidence risks and decision owners'],
    exampleFacts: ['8 / 10 = 80%', 'not comparable', 'not a demonstrated driver', 'No target'],
  },
  {
    id: 'business-decision-memo', scope: 'selected-document', audience: 'executive', output: 'decision-memo',
    stages: ['frame', 'compare', 'recommend', 'record', 'report'],
    sources: ['decision problem alternatives and evidence', 'cost risk reversibility and constraints', 'decision authority and actual answer or explicit pending'],
    exampleFacts: ['recommendation only', 'owner decision: pending', 'No decision was approved', 'RESOLVED.md'],
  },
] as const;

export const IDEAS_COVERAGE = [
  {
    id: 'ideas-capture', output: 'idea-brief', handoff: false,
    stages: ['capture', 'clarify', 'report'],
    sources: ['original note and provenance', 'problem audience outcome and constraints or explicit unknown', 'owner and unanswered questions'],
    exampleFacts: ['Build a chatbot', 'problem: unknown', 'not a prescribed solution'],
  },
  {
    id: 'ideas-research-synthesis', output: 'opportunity-brief', handoff: false,
    stages: ['scope', 'sources', 'cluster', 'synthesize', 'report'],
    sources: ['original ideas and source references', 'related work evidence dates and objections', 'duplicate boundaries and provenance or explicit unknown'],
    exampleFacts: ['different audiences', 'source provenance', 'not consensus', 'No live research'],
  },
  {
    id: 'ideas-prioritization', output: 'idea-prioritization', handoff: false,
    stages: ['scope', 'compare', 'assumptions', 'report'],
    sources: ['candidate ideas and goal links', 'impact confidence and effort evidence or assumptions', 'urgency strategic fit reversibility and decision criteria'],
    exampleFacts: ['confidence: unknown', 'No numerical score', 'not an approved priority'],
  },
  {
    id: 'ideas-experiment-design', output: 'experiment-plan', handoff: false,
    stages: ['hypothesis', 'design', 'measurement', 'decision-rule', 'report'],
    sources: ['hypothesis evidence and intended audience', 'success guardrail definitions baseline and denominator', 'duration decision rule and owner'],
    exampleFacts: ['baseline: missing', 'denominator: undefined', 'measurement.blocked', 'No experiment'],
  },
  {
    id: 'ideas-to-project', output: 'project-proposal', handoff: true,
    stages: ['collect', 'proposal', 'handoff'],
    sources: ['selected idea and actual selection record', 'original evidence rejected alternatives and unresolved questions', 'intended owner and project plan or feature destination'],
    exampleFacts: ['original IDs', 'rejected alternative', 'unresolved question', 'No project was created'],
  },
] as const;

export const FINANCE_COVERAGE = [
  {
    id: 'finance-budget-forecast', output: 'budget-forecast',
    stages: ['scope', 'assumptions', 'scenarios', 'cash-plan', 'report'],
    sources: ['supplied budget and financial records', 'currency period units and opening cash or explicit missing', 'scenario assumptions estimates and owners'],
    exampleFacts: ['opening cash: unknown', 'ending cash: unknown', 'cash-plan.blocked', 'not an approved budget'],
  },
  {
    id: 'finance-variance-report', output: 'variance-report',
    stages: ['scope', 'align', 'calculate', 'interpret', 'report'],
    sources: ['plan and actual records for selected period or business unit', 'currency units definitions and comparison basis', 'material driver evidence and explicit uncertainty'],
    exampleFacts: ['not comparable', 'zero baseline', 'percentage: undefined', 'No budget'],
  },
  {
    id: 'finance-unit-economics-pricing', output: 'unit-economics',
    stages: ['scope', 'model', 'sensitivity', 'report'],
    sources: ['revenue and variable or fixed cost assumptions', 'unit currency period and volume definitions', 'scenario evidence and unknown cost limits'],
    exampleFacts: ['nonpositive contribution', 'break-even: undefined', 'not a pricing recommendation', 'No price'],
  },
  {
    id: 'finance-cash-runway', output: 'cash-runway',
    stages: ['scope', 'reconcile', 'scenarios', 'report'],
    sources: ['supplied balances restrictions and commitments', 'cash inflows outflows and same-period burn', 'scenario assumptions freshness and unknowns'],
    exampleFacts: ['restricted cash', 'zero burn', 'negative burn', 'not unlimited funding', 'No payment'],
  },
  {
    id: 'finance-document-review', output: 'financial-review-checklist',
    stages: ['intake', 'extract', 'compare', 'checklist', 'report'],
    sources: ['supplied invoices statements or models', 'terms dates amounts currency and line evidence', 'tax fee and reconciliation basis or explicit missing'],
    exampleFacts: ['unexplained difference', 'tax/fees: unknown', 'not a confirmed invoice error', 'compare.blocked'],
  },
] as const;

export const LEGAL_COVERAGE = [
  {
    id: 'legal-contract-review', output: 'contract-review',
    stages: ['intake', 'extract', 'issues', 'report'],
    sources: ['supplied contract versions and clause references', 'parties dates money obligations and missing terms', 'confidentiality jurisdiction and counsel review scope'],
    exampleFacts: ['conflicting notice clauses', 'jurisdiction: unknown', 'not an enforceability conclusion', 'issues.blocked'],
  },
  {
    id: 'legal-obligation-renewal', output: 'obligation-register',
    stages: ['scope', 'extract', 'windows', 'register'],
    sources: ['supplied commitments and renewal clauses', 'owners trigger dates notice windows and source locations', 'date timezone and confidentiality limits or explicit unknown'],
    exampleFacts: ['trigger date: missing', 'deadline: unknown', 'windows.blocked', 'No reminder'],
  },
  {
    id: 'legal-policy-compliance', output: 'compliance-review',
    stages: ['scope', 'map', 'gaps', 'report'],
    sources: ['supplied policy or implementation evidence', 'supplied requirement set version jurisdiction and date', 'source mappings exceptions and interpretation uncertainties'],
    exampleFacts: ['requirement set is stale', 'applicability: unconfirmed', 'not a compliance certification', 'map.blocked'],
  },
  {
    id: 'legal-change-impact', output: 'legal-impact-map',
    stages: ['intake', 'applicability', 'impact', 'remediation', 'report'],
    sources: ['supplied regulatory or contractual change and baseline', 'effective date jurisdiction and version evidence', 'affected products processes documents and owners'],
    exampleFacts: ['effective date: unknown', 'conditional impact', 'applicability.blocked', 'No remediation task was filed'],
  },
  {
    id: 'legal-request-brief', output: 'counsel-request-brief',
    stages: ['intake', 'timeline', 'questions', 'brief'],
    sources: ['supplied facts timeline and document references', 'desired outcome and questions for qualified counsel', 'confidentiality disclosure limits and contradictory evidence'],
    exampleFacts: ['contradictory timeline', 'privilege: unconfirmed', 'not legal advice', 'No brief was sent'],
  },
] as const;

export const EXPECTED_PACKAGE_IDS: readonly string[] = [
  ...FEATURE_PACKAGE_IDS, ...DOCUMENTATION_COVERAGE.map((row) => row.id),
  ...CHANGE_REVIEW_COVERAGE.map((row) => row.id),
  ...ENGINEERING_COVERAGE.map((row) => row.id),
  ...BUSINESS_COVERAGE.map((row) => row.id),
  ...IDEAS_COVERAGE.map((row) => row.id),
  ...FINANCE_COVERAGE.map((row) => row.id),
  ...LEGAL_COVERAGE.map((row) => row.id),
];

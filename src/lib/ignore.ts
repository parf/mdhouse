/**
 * Which directories never contain docs worth showing.
 *
 * `.gitignore` is handled for free by `git ls-files --exclude-standard` (see scan.ts), so this
 * list exists for two narrower jobs: filtering the parts of a root that are not in any repo,
 * and hiding build/vendor trees that are *tracked* and would otherwise drown the sidebar.
 * The seed comes from the r-doc viewer's `docsSkipPatterns()` plus the usual suspects.
 */

export const DEFAULT_DENY = [
  '.git',
  'node_modules',
  'vendor',
  'bower_components',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.cache',
  '.venv',
  'venv',
  '__pycache__',
  'target',
  // r-doc's own skip list — huge generated or third-party trees inside /rd
  'lib.external',
  'git-hooks',
  'pma',
  'csr',
];

export interface IgnoreRules {
  /** Directory basenames never descended into. */
  deny: Set<string>;
}

export function defaultRules(extra: string[] = []): IgnoreRules {
  return { deny: new Set([...DEFAULT_DENY, ...extra]) };
}

export function isDenied(rules: IgnoreRules, dirName: string): boolean {
  return rules.deny.has(dirName);
}

/**
 * A root's own `.mdhouseignore`: one directory basename per line, `#` comments.
 * Deliberately not a glob language — this only ever suppresses directory names.
 */
export async function loadRootRules(rootPath: string, extra: string[] = []): Promise<IgnoreRules> {
  const rules = defaultRules(extra);
  const file = Bun.file(`${rootPath}/.mdhouseignore`);
  if (!(await file.exists())) return rules;

  for (const raw of (await file.text()).split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('!')) rules.deny.delete(line.slice(1).trim());
    else rules.deny.add(line.replace(/\/+$/, ''));
  }
  return rules;
}

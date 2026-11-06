/**
 * Which directories never contain docs worth showing.
 *
 * `.gitignore` is handled for free by `git ls-files --exclude-standard` (see scan.ts), so this
 * list exists for two narrower jobs: filtering the parts of a root that are not in any repo,
 * and hiding build/vendor trees that are *tracked* and would otherwise drown the sidebar.
 * The list is the usual build and dependency directories, plus a few big generated trees.
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
  // Huge generated or third-party trees found in large PHP checkouts
  'lib.external',
  'git-hooks',
  'pma',
  'csr',
];

export interface IgnoreRules {
  /** Directory basenames never descended into. */
  deny: Set<string>;
  /**
   * The names a deliberate scope never lifts: `.git`, the CLI's extra names and the root's
   * `.mdhouseignore` names. The rest of `deny` is the built-in default list.
   */
  explicit: Set<string>;
}

/** Never shown, whatever a `.mdhouseignore` or a scope says. */
export const HARD_DENY = '.git';

export function defaultRules(extra: string[] = []): IgnoreRules {
  return { deny: new Set([...DEFAULT_DENY, ...extra]), explicit: new Set([HARD_DENY, ...extra]) };
}

export function isDenied(rules: IgnoreRules, dirName: string): boolean {
  return rules.deny.has(dirName);
}

/** True when a segment of the root-relative `rel` is `.git` or an explicit exclusion. */
export function isExplicitlyDenied(rules: IgnoreRules, rel: string): boolean {
  return rel.split('/').some((seg) => seg === HARD_DENY || rules.explicit.has(seg));
}

/**
 * A root's own `.mdhouseignore`: one directory basename per line, `#` comments.
 * Deliberately not a glob language — this only ever suppresses directory names. `!name` shows a
 * name again, except `.git`.
 */
export async function loadRootRules(rootPath: string, extra: string[] = []): Promise<IgnoreRules> {
  const rules = defaultRules(extra);
  const file = Bun.file(`${rootPath}/.mdhouseignore`);
  if (!(await file.exists())) return rules;

  for (const raw of (await file.text()).split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('!')) {
      const name = line.slice(1).trim();
      if (name === HARD_DENY) continue;
      rules.deny.delete(name);
      rules.explicit.delete(name);
    } else {
      const name = line.replace(/\/+$/, '');
      rules.deny.add(name);
      rules.explicit.add(name);
    }
  }
  return rules;
}

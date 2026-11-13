/**
 * The registration loader: `$PROJECT/.mdhouse/automation/<id>.json`, team data under Git. Every path goes through
 * the registry's jail; a file is read only if it is a plain file of a bounded size, parsed strictly, and names a
 * package this host runs with no code of its own (`runnableFlow`). A file that fails any of that is an error
 * with its reason, never a registration. Nothing here writes.
 */
import { readdir, stat } from 'node:fs/promises';
import { AUTO_MAX_FILE, contentHash, parseRegistration, type AutoDeps, type LoadedRegistration } from './automation';
import { runnableFlow } from './flow-host';
import type { LoadedFlowPackage } from './flow-package';
import type { Registry } from './roots';

export const AUTOMATION_DIR = '.mdhouse/automation';
const FILE = /^([a-z0-9][a-z0-9_-]{0,63})\.json$/;

export interface LoadResult {
  loaded: LoadedRegistration[];
  errors: Array<{ file: string; error: string }>;
}

/** One file of a project: its registration, or why it is not one. Null: it does not exist (or is not a plain file in the jail). */
export async function readRegistration(registry: Registry, rootId: string, id: string, catalog: LoadedFlowPackage[]): Promise<{ loaded: LoadedRegistration } | { error: string } | null> {
  const root = registry.get(rootId);
  if (!root || root.kind === 'reference' || !FILE.test(`${id}.json`)) return null;
  const loc = await registry.resolve(`${root.id}/${AUTOMATION_DIR}/${id}.json`);
  if (!loc || loc.root.id !== root.id) return null;
  const st = await stat(loc.abs).catch(() => null);
  if (!st?.isFile()) return null;
  if (st.size > AUTO_MAX_FILE) return { error: `over ${AUTO_MAX_FILE} bytes` };
  const text = await Bun.file(loc.abs).text().catch(() => null);
  if (text === null) return { error: 'unreadable' };
  const parsed = parseRegistration(text, id);
  if (!parsed.ok) return { error: parsed.error };
  const pkg = catalog.find((p) => p.manifest.id === parsed.value.flow);
  if (!pkg) return { error: `flow "${parsed.value.flow}" is not an installed package` };
  if (!runnableFlow(pkg.manifest)) return { error: `flow "${parsed.value.flow}" is not analysis-only with a range` };
  return { loaded: { rootId: root.id, reg: parsed.value, hash: contentHash(text) } };
}

/** Every registration of a project, and every file that is none. */
export async function loadRegistrations(registry: Registry, rootId: string, catalog: LoadedFlowPackage[]): Promise<LoadResult> {
  const out: LoadResult = { loaded: [], errors: [] };
  const root = registry.get(rootId);
  if (!root || root.kind === 'reference') return out;
  const dir = await registry.resolve(`${root.id}/${AUTOMATION_DIR}`);
  const names = dir ? await readdir(dir.abs).catch(() => []) : [];
  for (const name of names.sort()) {
    const m = FILE.exec(name);
    if (!m) {
      if (name.endsWith('.json')) out.errors.push({ file: name, error: 'the file name is not a registration id (a-z 0-9 _ -, .json)' });
      continue;
    }
    const r = await readRegistration(registry, root.id, m[1]!, catalog);
    if (!r) out.errors.push({ file: name, error: 'not a plain file inside the project' });
    else if ('error' in r) out.errors.push({ file: name, error: r.error });
    else out.loaded.push(r.loaded);
  }
  return out;
}

/** `AutoDeps.registration` over a registry and the installed catalog. */
export const registrationLookup =
  (registry: Registry, catalog: () => Promise<LoadedFlowPackage[]>): AutoDeps['registration'] =>
  async (rootId, id) =>
    readRegistration(registry, rootId, id, await catalog());

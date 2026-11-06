import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadFlowCatalog } from '../src/lib/flow-package';
import { EXPECTED_PACKAGE_IDS } from './flow-library-coverage';

test('npm artifact ships the canonical R3 license and loadable flow authoring packages', async () => {
  const root = resolve(import.meta.dir, '..');
  const dir = await mkdtemp(join(tmpdir(), 'mdhouse-package-'));
  const run = async (args: string[]) => {
    const child = Bun.spawn(args, { cwd: root, stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
    ]);
    if (code !== 0) throw new Error(`${args[0]} exited ${code}: ${stderr}`);
    return stdout;
  };
  try {
    const result = JSON.parse(await run([
      'npm', 'pack', '--json', '--ignore-scripts', '--pack-destination', dir,
    ])) as { filename: string }[];
    expect(result).toHaveLength(1);
    const archive = join(dir, result[0]!.filename);
    const entries = (await run(['tar', '-tzf', archive])).trim().split('\n');
    expect(entries).toContain('package/LICENSE.md');
    expect(entries).not.toContain('package/LICENSE');
    const read = (path: string) => run(['tar', '-xOzf', archive, `package/${path}`]);
    const license = await read('LICENSE.md');
    expect(license).toBe(await Bun.file(join(root, 'LICENSE.md')).text());
    expect(license).toStartWith('# PolyForm Strict License 1.0.0\n');
    const notice = '\nCopyright Sergey Porfiriev\n';
    expect(license).toEndWith(notice);
    // Pins the unchanged official text from https://polyformproject.org/licenses/strict/1.0.0.txt.
    expect(createHash('sha256').update(license.slice(0, -notice.length)).digest('hex'))
      .toBe('e2361f52ad5be22b937a6e983c824a534c5cffa454b6c34af2f8ce0c2cdf7c1a');
    const metadata = JSON.parse(await read('package.json')) as { license: string; bin: Record<string, string> };
    expect(metadata.license).toBe('SEE LICENSE IN LICENSE.md');
    expect(metadata.bin.mdhouse).toBe('./bin/mdhouse');
    expect(metadata.bin['mdhouse-rag-sync']).toBe('./bin/mdhouse-rag-sync');
    expect(entries).toContain('package/bin/mdhouse-rag-sync');
    expect(entries).toContain('package/src/rag-sync-cli.ts');
    expect(entries).toContain('package/src/lib/rag-sync-plan.ts');
    expect(entries).toContain('package/doc/rag-sync.md');
    const readme = await read('README.md');
    expect(readme).toContain('PolyForm Strict License 1.0.0');
    expect(readme).toContain('[`LICENSE.md`](LICENSE.md)');
    expect(readme).toContain('Sergey Porfiriev');
    expect(readme).not.toMatch(/GNU General Public License|GPL-\d|\]\(LICENSE\)/i);
    const changelog = await read('CHANGELOG.md');
    expect(changelog).toContain('R3 and later distributions use the PolyForm Strict License 1.0.0');
    expect(entries).toContain('package/src/lib/flow-package.ts');
    expect(entries).toContain('package/doc/flows/README.md');
    const extracted = join(dir, 'extracted');
    await mkdir(extracted);
    await run(['tar', '-xzf', archive, '-C', extracted]);
    const help = await run([join(extracted, 'package/bin/mdhouse-rag-sync'), '--help']);
    expect(help).toContain('mdhouse-rag-sync');
    expect(help).toContain('plan --root');
    const shipped = await loadFlowCatalog(join(extracted, 'package/doc/flows'));
    const source = await loadFlowCatalog(join(root, 'doc/flows'));
    expect(shipped.map((flow) => flow.manifest.id)).toEqual([...EXPECTED_PACKAGE_IDS]);
    expect(shipped).toEqual(source);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30_000);

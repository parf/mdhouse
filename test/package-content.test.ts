import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('npm artifact ships the canonical R3 license and matching metadata', async () => {
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
    const metadata = JSON.parse(await read('package.json')) as { license: string };
    expect(metadata.license).toBe('SEE LICENSE IN LICENSE.md');
    const readme = await read('README.md');
    expect(readme).toContain('PolyForm Strict License 1.0.0');
    expect(readme).toContain('[`LICENSE.md`](LICENSE.md)');
    expect(readme).toContain('Sergey Porfiriev');
    expect(readme).not.toMatch(/GNU General Public License|GPL-\d|\]\(LICENSE\)/i);
    const unreleased = (await read('CHANGELOG.md')).split('\n## ')[1] ?? '';
    expect(unreleased).toStartWith('Unreleased\n');
    expect(unreleased).toContain('PolyForm Strict License 1.0.0');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30_000);

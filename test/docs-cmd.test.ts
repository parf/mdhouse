import { describe, expect, test } from 'bun:test';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { agentsLine, clientHost, docsText, GITHUB_RAW, startUrl } from '../src/lib/docs-cmd';

const REF = realpathSync(resolve(import.meta.dir, '../doc'));

describe('mdhouse docs, the pure parts', () => {
  test('a wildcard bind is this machine; an IPv6 address is bracketed', () => {
    expect(clientHost('0.0.0.0')).toBe('127.0.0.1');
    expect(clientHost('::')).toBe('127.0.0.1');
    expect(clientHost('127.0.0.1')).toBe('127.0.0.1');
    expect(clientHost('::1')).toBe('[::1]');
    expect(clientHost('docs.example.org')).toBe('docs.example.org');
  });
  test('the start file is fetched raw from the daemon, and from GitHub without one', () => {
    expect(startUrl('127.0.0.1', 8080)).toBe('http://127.0.0.1:8080/api/raw?p=_mdhouse/for-agents.md');
    expect(GITHUB_RAW).toBe('https://raw.githubusercontent.com/parf/mdhouse/main/doc/for-agents.md');
  });
  test('the line is one line with both addresses', () => {
    const line = agentsLine('127.0.0.1', 7777);
    expect(line).not.toContain('\n');
    expect(line).toContain(startUrl('127.0.0.1', 7777));
    expect(line).toContain(GITHUB_RAW);
  });
  test('the path alone, or the path and the line', () => {
    expect(docsText('/x/doc', '127.0.0.1', 7777, true)).toBe('/x/doc\n');
    const full = docsText('/x/doc', '127.0.0.1', 7777, false).split('\n');
    expect(full[0]).toBe('/x/doc');
    expect(full).toContain(agentsLine('127.0.0.1', 7777));
  });
});

describe('mdhouse docs, the command', () => {
  const run = async (...args: string[]) => {
    const p = Bun.spawn(['bun', resolve(import.meta.dir, '../src/cli.ts'), 'docs', ...args], {
      env: { ...process.env, XDG_CONFIG_HOME: '/nonexistent-mdhouse-config', MDHOUSE_PORT: '', MDHOUSE_HOST: '' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    return { code: await p.exited, out: await new Response(p.stdout).text(), err: await new Response(p.stderr).text() };
  };
  test('prints the installed reference and the line, needing no daemon', async () => {
    const r = await run();
    expect(r.code).toBe(0);
    expect(r.out.split('\n')[0]).toBe(REF);
    expect(r.out).toContain('http://127.0.0.1:7777/api/raw?p=_mdhouse/for-agents.md');
  });
  test('--path prints only the path', async () => {
    expect((await run('--path')).out).toBe(`${REF}\n`);
  });
  test('the port in use is in the line', async () => {
    expect((await run('--port', '8123')).out).toContain('http://127.0.0.1:8123/api/raw?p=_mdhouse/for-agents.md');
  });
});

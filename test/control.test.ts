import { afterAll, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { askDaemon, controlPath, serveControl } from '../src/lib/control';

// A port number nothing binds — the control socket is a file, not a TCP port, so this only
// has to be unique among tests.
const PORT = 61771;
const SOCK = controlPath(PORT);

afterAll(() => {
  if (existsSync(SOCK)) unlinkSync(SOCK);
});

describe('the control socket', () => {
  test('carries an add request and its reply, and is private to the user', async () => {
    const seen: string[][] = [];
    const control = await serveControl(PORT, async (req) => {
      seen.push(req.dirs);
      return { url: 'http://127.0.0.1:61771', roots: [] };
    });
    expect(control).not.toBeNull();

    expect((statSync(SOCK).mode & 0o777).toString(8)).toBe('600');

    const reply = await askDaemon(PORT, { dirs: ['/tmp'] });
    expect(reply).toEqual({ url: 'http://127.0.0.1:61771', roots: [] });
    expect(seen).toEqual([['/tmp']]);

    control!.stop();
    expect(existsSync(SOCK)).toBe(false);
  });

  test('asking when nobody is listening says so instead of throwing', async () => {
    expect(await askDaemon(PORT, { dirs: ['/tmp'] })).toBeNull();
  });

  test('a stale socket file left by a killed daemon is cleared away', async () => {
    writeFileSync(SOCK, '');
    chmodSync(SOCK, 0o600);

    expect(await askDaemon(PORT, { dirs: [] })).toBeNull();
    expect(existsSync(SOCK)).toBe(false);
  });

  test('a failure in the handler reaches the caller as a message', async () => {
    const control = await serveControl(PORT, async () => {
      throw new Error('no such directory: /nope');
    });

    expect(await askDaemon(PORT, { dirs: ['/nope'] })).toEqual({ error: 'no such directory: /nope' });
    control!.stop();
  });
});

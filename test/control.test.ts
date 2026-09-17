import { afterAll, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { askDaemon, askExit, askPing, controlPath, knownPorts, serveControl } from '../src/lib/control';

// A port number nothing binds — the control socket is a file, not a TCP port, so this only
// has to be unique among tests.
const PORT = 61771;
const SOCK = controlPath(PORT);
const URL = 'http://127.0.0.1:61771';

const handlers = (over: Partial<Parameters<typeof serveControl>[1]> = {}) => ({
  add: async () => ({ url: URL, roots: [] }),
  ping: () => ({ pid: process.pid, url: URL, roots: [] }),
  exit: () => {},
  ...over,
});

afterAll(() => {
  if (existsSync(SOCK)) unlinkSync(SOCK);
});

describe('the control socket', () => {
  test('carries an add request and its reply, and is private to the user', async () => {
    const seen: string[][] = [];
    const control = await serveControl(
      PORT,
      handlers({
        add: async (req) => {
          seen.push(req.dirs);
          return { url: URL, roots: [] };
        },
      }),
    );
    expect(control).not.toBeNull();

    expect((statSync(SOCK).mode & 0o777).toString(8)).toBe('600');

    const reply = await askDaemon(PORT, { dirs: ['/tmp'] });
    expect(reply).toEqual({ url: URL, roots: [] });
    expect(seen).toEqual([['/tmp']]);

    control!.stop();
    expect(existsSync(SOCK)).toBe(false);
  });

  test('a ping says who is behind the socket, and lists it among the known ports', async () => {
    const control = await serveControl(PORT, handlers());

    expect(await askPing(PORT)).toEqual({ pid: process.pid, url: URL, roots: [] });
    expect(knownPorts()).toContain(PORT);

    control!.stop();
    expect(await askPing(PORT)).toBeNull();
  });

  test('an exit request is answered, then acted on', async () => {
    let stopped = 0;
    const control = await serveControl(
      PORT,
      handlers({
        exit: () => {
          stopped++;
          control!.stop();
        },
      }),
    );

    // askExit reports what it stopped and waits for the socket to go.
    expect(await askExit(PORT)).toEqual({ pid: process.pid, url: URL, roots: [] });
    expect(stopped).toBe(1);
    expect(existsSync(SOCK)).toBe(false);

    // Asking twice is not an error; there is simply nothing there.
    expect(await askExit(PORT)).toBeNull();
  });

  test('asking when nobody is listening says so instead of throwing', async () => {
    expect(await askDaemon(PORT, { dirs: ['/tmp'] })).toBeNull();
  });

  test('a stale socket file left by a killed daemon is cleared away', async () => {
    writeFileSync(SOCK, '');
    chmodSync(SOCK, 0o600);

    expect(await askPing(PORT)).toBeNull();
    expect(existsSync(SOCK)).toBe(false);
  });

  test('a failure in the handler reaches the caller as a message', async () => {
    const control = await serveControl(
      PORT,
      handlers({
        add: async () => {
          throw new Error('no such directory: /nope');
        },
      }),
    );

    expect(await askDaemon(PORT, { dirs: ['/nope'] })).toEqual({ error: 'no such directory: /nope' });
    control!.stop();
  });
});

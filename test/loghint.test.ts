import { describe, expect, test } from 'bun:test';
import { logHints } from '../src/lib/loghint';

const host = (platform: string, cmds: string[], files: string[] = []) => ({
  platform,
  which: (c: string) => cmds.includes(c),
  exists: (f: string) => files.includes(f),
});

describe('where a detached daemon’s output can be read', () => {
  test('journald, when it is running', () => {
    expect(logHints(host('linux', ['logger', 'journalctl'], ['/run/systemd/journal']))?.follow).toBe(
      'journalctl -t mdhouse -f',
    );
  });

  test('journalctl installed but journald not running (a container) is not journald', () => {
    expect(logHints(host('linux', ['logger', 'journalctl']))).toBeNull();
    expect(logHints(host('linux', ['logger', 'journalctl'], ['/var/log/messages']))?.recent).toBe(
      'grep mdhouse /var/log/messages | tail -20',
    );
  });

  test('macOS reads and follows the unified log', () => {
    const h = logHints(host('darwin', ['logger']));
    expect(h?.recent).toContain('log show');
    expect(h?.follow).toContain('log stream');
  });

  test('no logger: nothing keeps it, so no command is offered', () => {
    expect(logHints(host('linux', ['journalctl'], ['/run/systemd/journal']))).toBeNull();
  });
});

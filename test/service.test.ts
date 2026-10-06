import { describe, expect, test } from 'bun:test';
import { unitName, unitText } from '../src/lib/service';

const spec = { bun: '/usr/bin/bun', cli: '/opt/mdhouse/bin/mdhouse', path: '/usr/bin:/bin' };

describe('the systemd unit', () => {
  test('runs mdhouse in the foreground, on the saved directories', () => {
    const text = unitText(spec);
    expect(text).toContain('ExecStart=/usr/bin/bun /opt/mdhouse/bin/mdhouse --fg\n');
    expect(text).toContain('Environment=PATH=/usr/bin:/bin');
    expect(text).toContain('Environment=MDHOUSE_SERVICE=1');
    expect(text).toContain('WantedBy=default.target');
    expect(text).not.toContain('XDG_CONFIG_HOME');
  });

  test('the usual unit pins no port: it listens wherever the config says, like a plain start', () => {
    expect(unitName(7777)).toBe('mdhouse.service');
    expect(unitName(8080)).toBe('mdhouse.service'); // a port from the config, not from `service --port`
    expect(unitText(spec)).not.toContain('--port');
  });

  test('an explicit `service --port` gets its own unit with the port pinned', () => {
    expect(unitName(8080, true)).toBe('mdhouse-8080.service');
    expect(unitName(7777, true)).toBe('mdhouse.service');
    expect(unitText({ ...spec, port: 8080 })).toContain('--fg --port 8080\n');
  });

  test('paths with spaces are quoted, and a custom config home is carried over', () => {
    const text = unitText({ ...spec, cli: '/home/a b/mdhouse', xdgConfigHome: '/cfg dir' });
    expect(text).toContain('ExecStart=/usr/bin/bun "/home/a b/mdhouse" --fg');
    expect(text).toContain('Environment="XDG_CONFIG_HOME=/cfg dir"');
  });
});

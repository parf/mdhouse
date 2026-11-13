import { describe, expect, test } from 'bun:test';
import { AgentBus, type ControlServing } from '../src/lib/agent-bus';

/**
 * A daemon as `AgentBus.control` uses it: one lock table and one KV per agent name, held by the
 * agent name — two processes with one name are the same holder, as on the real daemon.
 */
class FakeDaemon {
  lock: { holder: string; until: number } | null = null;
  kv = new Map<string, string>();
  now = 0;
  served: Array<{ topic: string; handler: (m: { from: string; body: string; ask?: string }) => Promise<string | null> }> = [];

  bus(me: string) {
    const d = this;
    return {
      record: () => ({
        kv: {
          get: async (_k: string, name: string) => {
            if (!d.kv.has(name)) throw new Error('not found');
            return { kind: 'string', value: d.kv.get(name)! };
          },
          set: async (_k: string, name: string, value: string) => void d.kv.set(name, value),
        },
        locks: {
          tryAcquire: async (_n: string, { ttl }: { ttl: number }) => {
            if (d.lock && d.lock.until > d.now) throw new Error(`lock held by ${d.lock.holder}`);
            d.lock = { holder: me, until: d.now + ttl };
          },
          extend: async (_n: string, ttl: number) => {
            if (!d.lock || d.lock.until <= d.now || d.lock.holder !== me) throw new Error('not the holder');
            d.lock.until = d.now + ttl;
          },
          release: async () => {
            if (d.lock?.holder === me) d.lock = null;
          },
          holders: async () => (d.lock && d.lock.until > d.now ? [{ name: 'ctl', holder: d.lock.holder, expires: '' }] : []),
        },
      }),
      serve: (handler: (typeof d.served)[number]['handler'], o: { topic: string; signal: AbortSignal }) => {
        const entry = { topic: o.topic, handler };
        d.served.push(entry);
        return new Promise<void>((resolve) =>
          o.signal.addEventListener('abort', () => {
            d.served.splice(d.served.indexOf(entry), 1);
            resolve();
          }),
        );
      },
    };
  }
}

function instance(d: FakeDaemon, over: Partial<ControlServing> = {}) {
  const ab = new AgentBus(() => ({ addr: '/fake.sock', token: '' }), () => {}, { me: '#mdhouse@test' });
  (ab as unknown as { connect: () => Promise<unknown> }).connect = async () => d.bus('#mdhouse@test');
  const log: string[] = [];
  let wanted = true;
  const stop = ab.control({
    topic: 'mdhouse.ctl',
    handle: async (from, body) => `${from}:${body}`,
    wanted: () => wanted,
    log: (l) => log.push(l),
    help: 'HELP',
    tickMs: 3_600_000,
    ttlMs: 60_000,
    ...over,
  });
  return { log, stop, setWanted: (w: boolean) => (wanted = w) };
}

const settle = () => Bun.sleep(10);

describe('AgentBus.control — one server per agent name', () => {
  test('serves its topic, answers asks with help, and releases the lock on stop', async () => {
    const d = new FakeDaemon();
    const a = instance(d);
    await settle();
    expect(d.served.map((s) => s.topic)).toEqual(['mdhouse.ctl']);
    expect(await d.served[0]!.handler({ from: '#x', body: 'b' })).toBe('#x:b');
    expect(await d.served[0]!.handler({ from: '#x', body: '', ask: 'help' })).toBe('HELP');
    expect(d.lock?.holder).toBe('#mdhouse@test');
    await a.stop();
    expect(d.served).toEqual([]);
    expect(d.lock).toBeNull();
    expect(a.log).toEqual(['control: serving topic mdhouse.ctl', 'control: stopped — shutdown']);
  });

  test('a second process with the same name does not serve while the lock is held', async () => {
    const d = new FakeDaemon();
    const a = instance(d);
    await settle();
    const b = instance(d);
    await settle();
    expect(d.served.length).toBe(1);
    expect(b.log).toEqual(['control: served by another mdhouse']);
    await b.stop();
    expect(d.lock).not.toBeNull();
    await a.stop();
  });

  test('a lock refused for another reason is said so, once', async () => {
    const d = new FakeDaemon();
    const bus = d.bus.bind(d);
    d.bus = (me: string) => {
      const b = bus(me);
      const rec = b.record();
      rec.locks.tryAcquire = async () => {
        throw new Error('down');
      };
      return { ...b, record: () => rec };
    };
    const a = instance(d);
    await settle();
    expect(a.log).toEqual(['control: not served — the agent bus failed']);
    expect(d.served).toEqual([]);
    await a.stop();
  });

  test('not wanted: nothing is asked of the daemon', async () => {
    const d = new FakeDaemon();
    const a = instance(d, { wanted: () => false });
    await settle();
    expect(d.served).toEqual([]);
    expect(d.lock).toBeNull();
    expect(d.kv.size).toBe(0);
    await a.stop();
  });
});

describe('AgentBus.control — the tick', () => {
  /** An instance whose ticks are driven by the test: the interval is replaced. */
  function driven(d: FakeDaemon, me = '#mdhouse@test') {
    let fire: () => void = () => {};
    const realSet = globalThis.setInterval;
    globalThis.setInterval = ((fn: () => void) => {
      fire = fn;
      return realSet(() => {}, 3_600_000);
    }) as typeof setInterval;
    const ab = new AgentBus(() => ({ addr: '/fake.sock', token: '' }), () => {}, { me });
    (ab as unknown as { connect: () => Promise<unknown> }).connect = async () => d.bus(me);
    const log: string[] = [];
    let wanted = true;
    const stop = ab.control({ topic: 'mdhouse.ctl', handle: async () => '', wanted: () => wanted, log: (l) => log.push(l), help: '', ttlMs: 60_000 });
    globalThis.setInterval = realSet;
    return { log, stop, tick: async () => (fire(), settle()), want: (w: boolean) => (wanted = w) };
  }

  test('each tick extends the lock while the nonce is its own', async () => {
    const d = new FakeDaemon();
    const a = driven(d);
    await settle();
    d.now = 50_000;
    await a.tick();
    expect(d.lock!.until).toBe(110_000);
    expect(d.served.length).toBe(1);
    await a.stop();
  });

  test('another process wrote its nonce (a daemon restart freed the lock): stops, keeps the lock', async () => {
    const d = new FakeDaemon();
    const a = driven(d);
    await settle();
    d.kv.set('ctl.owner', 'someone-else');
    await a.tick();
    expect(d.served).toEqual([]);
    expect(a.log.at(-1)).toBe('control: stopped — another mdhouse serves control');
    expect(d.lock).not.toBeNull();
    await a.stop();
  });

  test('extend fails (the lock expired): stops serving', async () => {
    const d = new FakeDaemon();
    const a = driven(d);
    await settle();
    d.now = 61_000;
    await a.tick();
    expect(d.served).toEqual([]);
    expect(a.log.at(-1)).toStartWith('control: stopped — lock lost: ');
    await a.stop();
  });

  test('turned off: stops and releases; turned on again: serves again', async () => {
    const d = new FakeDaemon();
    const a = driven(d);
    await settle();
    a.want(false);
    await a.tick();
    expect(d.served).toEqual([]);
    expect(d.lock).toBeNull();
    a.want(true);
    await a.tick();
    expect(d.served.length).toBe(1);
    await a.stop();
  });

  test('the second process takes over once the first stops and its lock is gone', async () => {
    const d = new FakeDaemon();
    const a = driven(d);
    await settle();
    const b = driven(d);
    await settle();
    expect(d.served.length).toBe(1);
    await a.stop();
    await b.tick();
    expect(d.served.length).toBe(1);
    expect(b.log.at(-1)).toBe('control: serving topic mdhouse.ctl');
    await b.stop();
  });
});

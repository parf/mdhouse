/**
 * Ports for tests: `testPort(61790)` is this process's own free port standing for 61790, the same one
 * on every call. Concurrent `bun test` runs each get their own, so one run never meets another's
 * listener or control socket.
 *
 * A port is picked at random below the kernel's ephemeral range (32768+), where no outgoing
 * connection takes it, and checked by binding it once. Distinct numbers get distinct ports.
 */
const LOW = 20_000;
const HIGH = 32_767;
const given = new Map<number, number>();
const taken = new Set<number>();

function bindable(port: number): boolean {
  try {
    Bun.serve({ hostname: '127.0.0.1', port, fetch: () => new Response('') }).stop(true);
    return true;
  } catch {
    return false;
  }
}

export function testPort(n: number): number {
  const known = given.get(n);
  if (known !== undefined) return known;
  for (let i = 0; i < 1000; i++) {
    const p = LOW + Math.floor(Math.random() * (HIGH - LOW + 1));
    if (taken.has(p) || !bindable(p)) continue;
    taken.add(p);
    given.set(n, p);
    return p;
  }
  throw new Error(`no free test port for ${n}`);
}

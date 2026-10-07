/**
 * Who may open mdhouse at all: an allow list of networks, and users with passwords.
 *
 * Both are off until set, and both are kept in prefs.json — set from the CLI, never from the
 * page. The allow list never shuts out this machine (127.0.0.0/8, ::1), so it cannot lock you
 * out. Users are asked for from every address, this machine included: behind a misconfigured
 * nginx or alike proxy every request arrives from 127.0.0.1. With both set, both apply.
 *
 * No TLS: mdhouse is for an intranet. Basic auth sends the password in the clear, so across an
 * untrusted network forward the port over ssh instead.
 */

/** An address as bytes: 4 for IPv4, 16 for IPv6. An IPv4-mapped IPv6 address is its IPv4. */
export function ipBytes(ip: string): number[] | null {
  const addr = ip.replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(addr);
  if (mapped) return ipBytes(mapped[1]!);
  if (/^\d+\.\d+\.\d+\.\d+$/.test(addr)) {
    const parts = addr.split('.').map(Number);
    return parts.every((n) => n >= 0 && n <= 255) ? parts : null;
  }
  if (!addr.includes(':') || !/^[0-9a-f:.]+$/i.test(addr)) return null;
  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const groups = (s = '') => (s ? s.split(':') : []);
  const head = groups(halves[0]);
  const tail = halves.length === 2 ? groups(halves[1]) : [];
  // A trailing dotted quad is two groups.
  const last = tail.length ? tail : head;
  if (last.at(-1)?.includes('.')) {
    const quad = ipBytes(last.pop()!);
    if (quad?.length !== 4) return null;
    const [a, b, c, d] = quad as [number, number, number, number];
    last.push(((a << 8) | b).toString(16), ((c << 8) | d).toString(16));
  }
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const all = [...head, ...Array(fill).fill('0'), ...tail];
  if (all.length !== 8 || !all.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return null;
  return all.flatMap((g) => [parseInt(g, 16) >> 8, parseInt(g, 16) & 255]);
}

export interface Cidr {
  bytes: number[];
  prefix: number;
}

/** `192.168.1.0/24`, `10.0.0.5` (one address), `fd00::/8`. Null when it is not one. */
export function parseCidr(text: string): Cidr | null {
  const [ip = '', len, extra] = text.trim().split('/');
  if (extra !== undefined) return null;
  const bytes = ipBytes(ip);
  if (!bytes) return null;
  const max = bytes.length * 8;
  const prefix = len === undefined ? max : /^\d+$/.test(len) ? Number(len) : NaN;
  return prefix >= 0 && prefix <= max ? { bytes, prefix } : null;
}

export function inCidr(ip: number[], net: Cidr): boolean {
  if (ip.length !== net.bytes.length) return false;
  for (let bit = 0; bit < net.prefix; bit++) {
    const mask = 0x80 >> bit % 8;
    if (((ip[bit >> 3] ?? 0) & mask) !== ((net.bytes[bit >> 3] ?? 0) & mask)) return false;
  }
  return true;
}

/** This machine: 127.0.0.0/8 and ::1. */
export function isLoopback(ip: number[]): boolean {
  return ip.length === 4 ? ip[0] === 127 : ip.every((b, i) => b === (i === 15 ? 1 : 0));
}

/** May a request from `address` come in, by the allow list? An empty list allows everyone. */
export function allowedAddress(address: string | undefined, allow: string[]): boolean {
  if (!allow.length) return true;
  const ip = address ? ipBytes(address) : null;
  if (!ip) return false;
  if (isLoopback(ip)) return true;
  return allow.some((c) => {
    const net = parseCidr(c);
    return !!net && inCidr(ip, net);
  });
}

/** `Authorization: Basic …` as login and password, or null. */
export function basicCredentials(header: string | null): { login: string; password: string } | null {
  const m = header && /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(header);
  if (!m) return null;
  let text: string;
  try {
    text = new TextDecoder().decode(Uint8Array.from(atob(m[1] ?? ''), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
  const colon = text.indexOf(':');
  return colon < 0 ? null : { login: text.slice(0, colon), password: text.slice(colon + 1) };
}

/** A login may not hold `:` (Basic auth splits on the first one) or spaces. */
export const validLogin = (login: string): boolean => /^[^\s:]{1,64}$/.test(login);

let dummy: Promise<string> | undefined;
const dummyHash = () => (dummy ??= Bun.password.hash('mdhouse: no such login'));

/**
 * Checks Basic credentials against the stored hashes. A password hash is slow on purpose, and a
 * browser sends the header with every request, so a header already verified against the same
 * users is remembered.
 */
export class Users {
  private verified = new Map<string, string>();

  async check(header: string | null, users: Record<string, string>): Promise<boolean> {
    if (!header) return false;
    const stamp = JSON.stringify(users);
    if (this.verified.get(header) === stamp) return true;
    const cred = basicCredentials(header);
    if (!cred) return false;
    const hash = Object.hasOwn(users, cred.login) ? users[cred.login] : null;
    if (!hash) {
      // An unknown login costs the same hash an existing one does, so the delay does not tell them apart.
      await Bun.password.verify(cred.password, await dummyHash()).catch(() => false);
      return false;
    }
    let ok = false;
    try {
      ok = await Bun.password.verify(cred.password, hash);
    } catch {
      ok = false;
    }
    if (ok) {
      if (this.verified.size > 200) this.verified.clear();
      this.verified.set(header, stamp);
    }
    return ok;
  }
}

export const hashPassword = (password: string): Promise<string> => Bun.password.hash(password);

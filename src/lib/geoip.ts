import { inCidr, ipBytes, parseCidr, type Cidr } from './access';

/**
 * IP location and network lookup over two public HTTPS services: ipwho.is first, freeipapi.com
 * only when the first fails. The caller supplies `fetch` — there is no default and no live wiring.
 *
 * Only a public unicast address is ever sent. Every answer is validated and must echo the asked
 * address. Missing fields stay null: nothing is guessed or taken from the other provider.
 */

/** What one lookup found. `state` is the provider's region (state/province). */
export interface Geo {
  /** The canonical address the provider answered for — always the one asked. */
  readonly ip: string;
  readonly city: string | null;
  readonly state: string | null;
  /** ISO 3166-1 alpha-2. */
  readonly country: string;
  readonly countryName: string | null;
  readonly isp: string | null;
  readonly org: string | null;
  readonly asn: number | null;
  readonly asnLabel: string | null;
  readonly source: GeoSource;
}

export type GeoSource = 'ipwho.is' | 'freeipapi.com';

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** An address in canonical text: dotted IPv4 (an IPv4-mapped IPv6 is its IPv4) or RFC 5952 IPv6. Null when it is not one. */
export function canonicalIp(ip: string): string | null {
  const b = ipBytes(ip);
  if (!b) return null;
  if (b.length === 4) return b.join('.');
  const groups = Array.from({ length: 8 }, (_, i) => ((b[2 * i]! << 8) | b[2 * i + 1]!).toString(16));
  // The longest run of two or more zero groups becomes `::` (the first one on a tie).
  let best = -1;
  let len = 0;
  for (let i = 0; i < 8; ) {
    if (groups[i] !== '0') {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && groups[j] === '0') j++;
    if (j - i > len) [best, len] = [i, j - i];
    i = j;
  }
  if (len < 2) return groups.join(':');
  return `${groups.slice(0, best).join(':')}::${groups.slice(best + len).join(':')}`;
}

const nets = (list: string[]): Cidr[] => list.map((c) => parseCidr(c)!);

/** IPv4 ranges that are not public unicast (RFC 6890 and successors). */
const V4_SPECIAL = nets([
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12',
  '192.0.0.0/24', '192.0.2.0/24', '192.31.196.0/24', '192.52.193.0/24', '192.88.99.0/24', '192.168.0.0/16',
  '192.175.48.0/24', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4',
]);
/** IPv6 global unicast is 2000::/3; these parts of it are special or carry another address. */
const V6_GLOBAL = parseCidr('2000::/3')!;
const V6_SPECIAL = nets(['2001::/23', '2001:db8::/32', '2002::/16', '3fff::/20']);

/** The canonical address when it is public unicast — the only kind ever sent to a provider — else null. */
export function publicIp(ip: string): string | null {
  const canon = canonicalIp(ip);
  const b = canon ? ipBytes(canon) : null;
  if (!canon || !b) return null;
  if (b.length === 4) return V4_SPECIAL.some((n) => inCidr(b, n)) ? null : canon;
  return inCidr(b, V6_GLOBAL) && !V6_SPECIAL.some((n) => inCidr(b, n)) ? canon : null;
}

/** A provider string as display text: control and bidi-override characters removed, trimmed, ≤ `max` code points; empty → null. */
export function cleanText(v: unknown, max = 100): string | null {
  if (typeof v !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const t = v.replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, '').trim();
  return t ? [...t].slice(0, max).join('') : null;
}

const asnNumber = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^(AS)?\d{1,10}$/i.test(v.trim()) ? Number(v.trim().replace(/^AS/i, '')) : NaN;
  return Number.isInteger(n) && n > 0 && n <= 0xffffffff ? n : null;
};

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const COUNTRY = /^[A-Z]{2}$/;

interface Provider {
  readonly source: GeoSource;
  url(ip: string): string;
  /** The Geo from a parsed body, or null when the body is not a valid answer for `ip`. */
  parse(body: unknown, ip: string): Geo | null;
}

/** ipwho.is — https://ipwhois.io/documentation */
const IPWHOIS: Provider = {
  source: 'ipwho.is',
  url: (ip) => `https://ipwho.is/${ip}?fields=success,message,ip,country,country_code,region,city,connection`,
  parse(body, ip) {
    if (!isObject(body) || body.success !== true) return null;
    if (typeof body.ip !== 'string' || canonicalIp(body.ip) !== ip) return null;
    if (typeof body.country_code !== 'string' || !COUNTRY.test(body.country_code)) return null;
    const conn = isObject(body.connection) ? body.connection : {};
    return {
      ip,
      city: cleanText(body.city),
      state: cleanText(body.region),
      country: body.country_code,
      countryName: cleanText(body.country),
      isp: cleanText(conn.isp),
      org: cleanText(conn.org),
      asn: asnNumber(conn.asn),
      asnLabel: null,
      source: 'ipwho.is',
    };
  },
};

/** freeipapi.com — https://freeipapi.com/docs/api-reference/get-ip-info */
const FREEIPAPI: Provider = {
  source: 'freeipapi.com',
  url: (ip) => `https://free.freeipapi.com/api/v1/json/${ip}`,
  parse(body, ip) {
    if (!isObject(body)) return null;
    if (typeof body.ipAddress !== 'string' || canonicalIp(body.ipAddress) !== ip) return null;
    if (typeof body.countryCode !== 'string' || !COUNTRY.test(body.countryCode)) return null;
    const dash = (v: unknown) => (v === '-' ? null : cleanText(v));
    return {
      ip,
      city: dash(body.cityName),
      state: dash(body.regionName),
      country: body.countryCode,
      countryName: dash(body.countryName),
      isp: null,
      org: null,
      asn: asnNumber(body.asn),
      asnLabel: dash(body.asnOrganization),
      source: 'freeipapi.com',
    };
  },
};

export const PROVIDERS: readonly Provider[] = [IPWHOIS, FREEIPAPI];

export interface GeoLookupOptions {
  fetch: Fetch;
  now?: () => number;
  /** Per provider, for the whole request and body. */
  timeoutMs?: number;
  maxBytes?: number;
}

/** A 429's `Retry-After` in ms: seconds or an HTTP date; default 10 min, at most 24 h. */
export function retryAfterMs(header: string | null, now: number): number {
  const DEFAULT = 10 * 60_000;
  const MAX = 24 * 3600_000;
  if (!header) return DEFAULT;
  const v = header.trim();
  const ms = /^\d+$/.test(v) ? Number(v) * 1000 : Date.parse(v) - now;
  return Number.isFinite(ms) && ms > 0 ? Math.min(ms, MAX) : DEFAULT;
}

/**
 * Sequential lookup: the primary, then the secondary only when the primary failed in any way —
 * timeout, network error, non-200, oversize or non-JSON body, `success:false` (invalid or reserved
 * included), a wrong echoed IP, a bad country, or a 429 back-off still running. Never both at once.
 */
export class GeoLookup {
  readonly #fetch: Fetch;
  readonly #now: () => number;
  readonly #timeoutMs: number;
  readonly #maxBytes: number;
  readonly #blockedUntil = new Map<GeoSource, number>();

  constructor(opts: GeoLookupOptions) {
    if (typeof opts?.fetch !== 'function') throw new Error('GeoLookup needs an injected fetch');
    this.#fetch = opts.fetch;
    this.#now = opts.now ?? Date.now;
    this.#timeoutMs = opts.timeoutMs ?? 3000;
    this.#maxBytes = opts.maxBytes ?? 16_384;
  }

  /** The location of a public address, or null: not public, or both providers failed. */
  async resolve(ip: string): Promise<Geo | null> {
    const canon = publicIp(ip);
    if (!canon) return null;
    for (const p of PROVIDERS) {
      const geo = await this.#ask(p, canon);
      if (geo) return geo;
    }
    return null;
  }

  async #ask(p: Provider, ip: string): Promise<Geo | null> {
    if ((this.#blockedUntil.get(p.source) ?? 0) > this.#now()) return null;
    const ctl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        ctl.abort();
        resolve(null);
      }, this.#timeoutMs);
    });
    try {
      return await Promise.race([this.#request(p, ip, ctl.signal), timeout]);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async #request(p: Provider, ip: string, signal: AbortSignal): Promise<Geo | null> {
    const res = await this.#fetch(p.url(ip), {
      method: 'GET',
      redirect: 'error',
      credentials: 'omit',
      headers: { accept: 'application/json', 'user-agent': 'mdhouse' },
      signal,
    });
    if (res.status === 429) {
      this.#blockedUntil.set(p.source, this.#now() + retryAfterMs(res.headers.get('retry-after'), this.#now()));
      return null;
    }
    if (res.status !== 200) return null;
    const text = await readBounded(res, this.#maxBytes);
    if (text === null) return null;
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return null;
    }
    return p.parse(body, ip);
  }
}

/** The body as text, or null when it is longer than `max` bytes. */
async function readBounded(res: Response, max: number): Promise<string | null> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

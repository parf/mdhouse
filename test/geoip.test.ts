import { describe, expect, test } from 'bun:test';
import { canonicalIp, cleanText, GeoLookup, publicIp, retryAfterMs, type Fetch } from '../src/lib/geoip';

const PUB4 = '8.8.8.8';
const PUB6 = '2606:4700::1111';

/** ipwho.is answer per its documentation, for `ip`. */
const whois = (ip: string, extra: Record<string, unknown> = {}) => ({
  success: true,
  ip,
  country: 'United States',
  country_code: 'US',
  region: 'California',
  city: 'Mountain View',
  connection: { asn: 15169, org: 'Google LLC', isp: 'Google LLC', domain: 'google.com' },
  ...extra,
});
/** freeipapi.com answer per its documentation, for `ip`. */
const free = (ip: string, extra: Record<string, unknown> = {}) => ({
  ipVersion: 4,
  ipAddress: ip,
  countryName: 'United States of America',
  countryCode: 'US',
  cityName: 'Mountain View',
  regionName: 'California',
  regionCode: 'CA',
  asn: '15169',
  asnOrganization: 'Google LLC',
  isProxy: false,
  ...extra,
});

type Reply = Response | (() => Promise<Response>) | Error;
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

/** A fetch that answers per host, in order, and records every call. */
function mock(replies: { whois?: Reply[]; free?: Reply[] }) {
  const calls: { url: string; init: RequestInit; at: number }[] = [];
  let seq = 0;
  const q = { 'ipwho.is': [...(replies.whois ?? [])], 'free.freeipapi.com': [...(replies.free ?? [])] };
  const fetch: Fetch = async (url, init) => {
    calls.push({ url, init, at: seq++ });
    const host = new URL(url).host as keyof typeof q;
    const r = q[host]?.shift();
    if (!r) throw new Error(`unexpected call to ${host}`);
    if (r instanceof Error) throw r;
    return typeof r === 'function' ? r() : r;
  };
  return { fetch, calls, hosts: () => calls.map((c) => new URL(c.url).host) };
}

describe('canonicalIp', () => {
  test('IPv4, IPv4-mapped IPv6 and RFC 5952 IPv6', () => {
    expect(canonicalIp('8.8.8.8')).toBe('8.8.8.8');
    expect(canonicalIp('::ffff:8.8.8.8')).toBe('8.8.8.8');
    expect(canonicalIp('[2606:4700:0:0:0:0:0:1111]')).toBe('2606:4700::1111');
    expect(canonicalIp('2001:DB8:0:0:1:0:0:1')).toBe('2001:db8::1:0:0:1');
    expect(canonicalIp('2001:db8:0:1:1:1:1:1')).toBe('2001:db8:0:1:1:1:1:1');
    expect(canonicalIp('::1')).toBe('::1');
    expect(canonicalIp('::')).toBe('::');
  });

  test('anything else is null', () => {
    for (const bad of ['', 'localhost', '1.2.3', '256.1.1.1', '1::2::3', '8.8.8.8/32', '8.8.8.8 ']) expect(canonicalIp(bad)).toBeNull();
  });
});

describe('publicIp', () => {
  test('public unicast passes, canonical', () => {
    expect(publicIp(PUB4)).toBe(PUB4);
    expect(publicIp('::ffff:1.1.1.1')).toBe('1.1.1.1');
    expect(publicIp('2606:4700:0::1111')).toBe(PUB6);
  });

  test('private, loopback, special and malformed addresses never leave', () => {
    const v4 = ['0.0.0.0', '10.1.2.3', '100.64.0.1', '127.0.0.1', '169.254.1.1', '172.16.0.1', '172.31.255.255', '192.0.0.1', '192.0.2.1', '192.88.99.1', '192.168.1.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '240.0.0.1', '255.255.255.255'];
    const v6 = ['::', '::1', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '2001:db8::1', '2002:808:808::1', '2001:0:4136::1', '3fff::1', '64:ff9b::808:808', '100::1', '::ffff:10.0.0.1'];
    for (const ip of [...v4, ...v6, 'nope', '']) expect(publicIp(ip)).toBeNull();
  });
});

describe('cleanText', () => {
  test('controls and bidi overrides removed, trimmed, bounded, empty → null', () => {
    expect(cleanText('  Kyiv\u0000\u001b[31m‮  ')).toBe('Kyiv[31m');
    expect(cleanText('<script>alert(1)</script>')).toBe('<script>alert(1)</script>'); // kept as text, never markup
    expect([...cleanText('😀'.repeat(300))!].length).toBe(100);
    expect(cleanText(' ‏ ')).toBeNull();
    expect(cleanText(42)).toBeNull();
    expect(cleanText(null)).toBeNull();
  });
});

describe('retryAfterMs', () => {
  test('seconds, HTTP date, default and cap', () => {
    expect(retryAfterMs('30', 0)).toBe(30_000);
    expect(retryAfterMs(new Date(60_000).toUTCString(), 0)).toBe(60_000);
    expect(retryAfterMs(null, 0)).toBe(600_000);
    expect(retryAfterMs('soon', 0)).toBe(600_000);
    expect(retryAfterMs('0', 0)).toBe(600_000);
    expect(retryAfterMs('999999', 0)).toBe(24 * 3600_000);
  });
});

describe('GeoLookup', () => {
  test('needs an injected fetch — there is no default', () => {
    expect(() => new GeoLookup({} as never)).toThrow('injected fetch');
  });

  test('a non-public address makes no call at all', async () => {
    const m = mock({});
    const g = new GeoLookup({ fetch: m.fetch });
    for (const ip of ['127.0.0.1', '10.0.0.1', '192.168.0.10', '::1', 'fe80::1', 'fd00::1', 'bogus']) expect(await g.resolve(ip)).toBeNull();
    expect(m.calls).toHaveLength(0);
  });

  test('primary success: one HTTPS call to ipwho.is with the network fields, no secondary', async () => {
    const m = mock({ whois: [json(whois(PUB4))] });
    const geo = await new GeoLookup({ fetch: m.fetch }).resolve(PUB4);
    expect(geo).toEqual({
      ip: PUB4,
      city: 'Mountain View',
      state: 'California',
      country: 'US',
      countryName: 'United States',
      isp: 'Google LLC',
      org: 'Google LLC',
      asn: 15169,
      asnLabel: null,
      source: 'ipwho.is',
    });
    expect(m.hosts()).toEqual(['ipwho.is']);
    const { url, init } = m.calls[0]!;
    expect(url).toBe('https://ipwho.is/8.8.8.8?fields=success,message,ip,country,country_code,region,city,connection');
    expect(init.redirect).toBe('error');
    expect(init.credentials).toBe('omit');
    expect(init.method).toBe('GET');
    expect(new Headers(init.headers).get('cookie')).toBeNull();
    expect('county' in geo!).toBe(false);
  });

  test('IPv6 goes in the path canonical', async () => {
    const m = mock({ whois: [json(whois(PUB6))] });
    expect((await new GeoLookup({ fetch: m.fetch }).resolve('2606:4700:0:0:0:0:0:1111'))?.ip).toBe(PUB6);
    expect(m.calls[0]!.url.startsWith(`https://ipwho.is/${PUB6}?`)).toBe(true);
  });

  test('missing optional fields stay null and do not trigger the secondary', async () => {
    const m = mock({ whois: [json({ success: true, ip: PUB4, country_code: 'US' })] });
    const geo = await new GeoLookup({ fetch: m.fetch }).resolve(PUB4);
    expect(geo).toMatchObject({ city: null, state: null, country: 'US', countryName: null, isp: null, org: null, asn: null, asnLabel: null });
    expect(m.hosts()).toEqual(['ipwho.is']);
  });

  const failures: [string, () => Reply][] = [
    ['success:false invalid', () => json({ success: false, message: 'Invalid IP address' })],
    ['success:false reserved', () => json({ success: false, message: 'Reserved range' })],
    ['another IP echoed', () => json(whois('8.8.4.4'))],
    ['no IP echoed', () => json({ ...whois(PUB4), ip: undefined })],
    ['bad country code', () => json(whois(PUB4, { country_code: 'usa' }))],
    ['missing country code', () => json(whois(PUB4, { country_code: null }))],
    ['500', () => json({ success: false }, 500)],
    ['503 html', () => new Response('<html>down</html>', { status: 503 })],
    ['302', () => new Response(null, { status: 302, headers: { location: 'https://evil.example/' } })],
    ['403 plan', () => json({ success: false, message: 'The current subscription plan does not support this API endpoint' }, 403)],
    ['not JSON', () => new Response('<html>ok</html>', { status: 200 })],
    ['JSON array', () => json([whois(PUB4)])],
    ['oversize by length', () => new Response('{}', { status: 200, headers: { 'content-length': '99999' } })],
    ['oversize streamed', () => new Response(JSON.stringify({ ...whois(PUB4), pad: 'x'.repeat(20_000) }), { status: 200 })],
    ['network error', () => new TypeError('fetch failed')],
  ];
  for (const [name, reply] of failures) {
    test(`primary ${name} → exactly one secondary call, after the primary`, async () => {
      const m = mock({ whois: [reply()], free: [json(free(PUB4))] });
      const geo = await new GeoLookup({ fetch: m.fetch }).resolve(PUB4);
      expect(geo).toMatchObject({ source: 'freeipapi.com', country: 'US', city: 'Mountain View', state: 'California', asn: 15169, asnLabel: 'Google LLC', isp: null, org: null });
      expect(m.hosts()).toEqual(['ipwho.is', 'free.freeipapi.com']);
      expect(m.calls[1]!.url).toBe('https://free.freeipapi.com/api/v1/json/8.8.8.8');
      expect(m.calls[1]!.init.redirect).toBe('error');
    });
  }

  test('primary timeout → secondary; the slow call is aborted', async () => {
    let signal: AbortSignal | undefined;
    const m = mock({ whois: [() => new Promise<Response>(() => {})], free: [json(free(PUB4))] });
    const fetch: Fetch = (url, init) => {
      if (url.includes('ipwho.is')) signal = init.signal ?? undefined;
      return m.fetch(url, init);
    };
    const geo = await new GeoLookup({ fetch, timeoutMs: 20 }).resolve(PUB4);
    expect(geo?.source).toBe('freeipapi.com');
    expect(signal?.aborted).toBe(true);
    expect(m.hosts()).toEqual(['ipwho.is', 'free.freeipapi.com']);
  });

  test('never in parallel: the secondary starts only after the primary settled', async () => {
    const order: string[] = [];
    const fetch: Fetch = async (url) => {
      const host = new URL(url).host;
      order.push(`start ${host}`);
      await new Promise((r) => setTimeout(r, 5));
      order.push(`end ${host}`);
      return host === 'ipwho.is' ? json({ success: false }, 500) : json(free(PUB4));
    };
    await new GeoLookup({ fetch }).resolve(PUB4);
    expect(order).toEqual(['start ipwho.is', 'end ipwho.is', 'start free.freeipapi.com', 'end free.freeipapi.com']);
  });

  test('both fail → null; nothing guessed', async () => {
    const m = mock({ whois: [json({ success: false }, 500)], free: [json(free(PUB4, { countryCode: '' }))] });
    expect(await new GeoLookup({ fetch: m.fetch }).resolve(PUB4)).toBeNull();
    const m2 = mock({ whois: [new Error('down')], free: [json(free('1.1.1.1'))] });
    expect(await new GeoLookup({ fetch: m2.fetch }).resolve(PUB4)).toBeNull();
  });

  test('secondary placeholders and spoofed text are null or plain text', async () => {
    const m = mock({
      whois: [json({ success: false }, 500)],
      free: [json(free(PUB4, { cityName: '-', regionName: '‮evil\u0007', countryName: '<b>US</b>', asn: 'n/a', asnOrganization: '' }))],
    });
    expect(await new GeoLookup({ fetch: m.fetch }).resolve(PUB4)).toMatchObject({ city: null, state: 'evil', countryName: '<b>US</b>', asn: null, asnLabel: null });
  });

  test('429 backs the provider off for Retry-After; the secondary answers meanwhile', async () => {
    let now = 1_000_000;
    const m = mock({
      whois: [json({ success: false, message: 'Rate limit exceeded' }, 429, { 'retry-after': '60' }), json(whois(PUB4))],
      free: [json(free(PUB4)), json(free(PUB4))],
    });
    const g = new GeoLookup({ fetch: m.fetch, now: () => now });
    expect((await g.resolve(PUB4))?.source).toBe('freeipapi.com');
    now += 59_000;
    expect((await g.resolve(PUB4))?.source).toBe('freeipapi.com');
    now += 2_000;
    expect((await g.resolve(PUB4))?.source).toBe('ipwho.is');
    expect(m.hosts()).toEqual(['ipwho.is', 'free.freeipapi.com', 'free.freeipapi.com', 'ipwho.is']);
  });

  test('429 on both → null, and both stay backed off', async () => {
    const now = 0;
    const m = mock({ whois: [json({}, 429)], free: [json({}, 429)] });
    const g = new GeoLookup({ fetch: m.fetch, now: () => now });
    expect(await g.resolve(PUB4)).toBeNull();
    expect(await g.resolve(PUB4)).toBeNull();
    expect(m.calls).toHaveLength(2);
  });
});

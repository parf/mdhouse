import { describe, expect, test } from 'bun:test';
import { allowedAddress, basicCredentials, hashPassword, ipBytes, parseCidr, Users, validLogin } from '../src/lib/access';

describe('ipBytes', () => {
  test('IPv4, IPv6, mapped, bracketed, zone', () => {
    expect(ipBytes('192.168.1.7')).toEqual([192, 168, 1, 7]);
    expect(ipBytes('::ffff:10.0.0.1')).toEqual([10, 0, 0, 1]);
    expect(ipBytes('::1')).toEqual([...Array(15).fill(0), 1]);
    expect(ipBytes('[fe80::1%eth0]')?.slice(0, 2)).toEqual([0xfe, 0x80]);
    expect(ipBytes('2001:db8::10.0.0.1')?.slice(-4)).toEqual([10, 0, 0, 1]);
    expect(ipBytes('1:2:3:4:5:6:7:8')?.length).toBe(16);
  });
  test('refuses what is not an address', () => {
    for (const bad of ['', '256.1.1.1', '1.2.3', 'example.com', '1::2::3', '1:2:3', '1:2:3:4:5:6:7:8:9', '12345::']) {
      expect(ipBytes(bad)).toBeNull();
    }
  });
});

describe('parseCidr', () => {
  test('network, one address, IPv6', () => {
    expect(parseCidr('192.168.1.0/24')).toEqual({ bytes: [192, 168, 1, 0], prefix: 24 });
    expect(parseCidr('10.0.0.5')?.prefix).toBe(32);
    expect(parseCidr('fd00::/8')?.prefix).toBe(8);
  });
  test('refuses bad ones', () => {
    for (const bad of ['10.0.0.0/33', '10.0.0.0/x', '10.0.0.0/8/1', 'fd00::/129', 'nope/8']) expect(parseCidr(bad)).toBeNull();
  });
});

describe('allowedAddress', () => {
  const allow = ['192.168.1.0/24', 'fd00::/8'];
  test('an empty list allows every address', () => {
    expect(allowedAddress('8.8.8.8', [])).toBe(true);
  });
  test('inside and outside the list', () => {
    expect(allowedAddress('192.168.1.200', allow)).toBe(true);
    expect(allowedAddress('::ffff:192.168.1.3', allow)).toBe(true);
    expect(allowedAddress('fd12::1', allow)).toBe(true);
    expect(allowedAddress('192.168.2.1', allow)).toBe(false);
    expect(allowedAddress('8.8.8.8', allow)).toBe(false);
    expect(allowedAddress(undefined, allow)).toBe(false);
  });
  test('this machine is always allowed', () => {
    for (const me of ['127.0.0.1', '127.8.0.1', '::1', '::ffff:127.0.0.1']) expect(allowedAddress(me, ['10.0.0.0/8'])).toBe(true);
  });
  test('a broken entry allows nothing, the rest still work', () => {
    expect(allowedAddress('10.1.1.1', ['bogus', '10.0.0.0/8'])).toBe(true);
    expect(allowedAddress('11.1.1.1', ['bogus'])).toBe(false);
  });
});

describe('Basic credentials', () => {
  const basic = (s: string) => `Basic ${btoa(s)}`;
  test('login and password, split on the first colon', () => {
    expect(basicCredentials(basic('ann:pa:ss'))).toEqual({ login: 'ann', password: 'pa:ss' });
    expect(basicCredentials(basic('nocolon'))).toBeNull();
    expect(basicCredentials('Bearer x')).toBeNull();
    expect(basicCredentials(null)).toBeNull();
  });
  test('validLogin', () => {
    expect(validLogin('ann')).toBe(true);
    expect(validLogin('a:b')).toBe(false);
    expect(validLogin('a b')).toBe(false);
    expect(validLogin('')).toBe(false);
  });
  test('Users.check verifies against the hash, and forgets when users change', async () => {
    const users = { ann: await hashPassword('secret') };
    const check = new Users();
    expect(await check.check(basic('ann:secret'), users)).toBe(true);
    expect(await check.check(basic('ann:secret'), users)).toBe(true); // remembered
    expect(await check.check(basic('ann:wrong'), users)).toBe(false);
    expect(await check.check(basic('bob:secret'), users)).toBe(false);
    expect(await check.check(basic('toString:x'), users)).toBe(false);
    expect(await check.check(null, users)).toBe(false);
    // Password changed: the remembered header no longer counts.
    expect(await check.check(basic('ann:secret'), { ann: await hashPassword('other') })).toBe(false);
  });
  test('an unknown login takes as long as a wrong password: the delay does not reveal which logins exist', async () => {
    const users = { ann: await hashPassword('secret') };
    const check = new Users();
    const time = async (cred: string) => {
      const t = performance.now();
      await check.check(basic(cred), users);
      return performance.now() - t;
    };
    await time('nobody:x'); // the dummy hash is made once
    const wrong = await time('ann:wrong');
    const unknown = await time('nobody:x');
    expect(unknown).toBeGreaterThan(wrong / 3);
  });
});

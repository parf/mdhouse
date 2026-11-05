import { describe, expect, test } from 'bun:test';
import { inspect } from 'node:util';
import {
  AdminSessions,
  MAX_PROOF_TTL_MS,
  adminCookie,
  adminCookieName,
  clearAdminCookie,
  readAdminCookie,
} from '../src/lib/admin-session';

function clock(start = 1_000_000) {
  const c = { t: start, now: () => c.t };
  return c;
}

function session(admin: AdminSessions) {
  const r = admin.exchange(admin.mintProof().proof);
  if (!r.ok) throw new Error('exchange failed');
  return r;
}

describe('admin proofs', () => {
  test('are 32 random bytes, base64url, unique', () => {
    const admin = new AdminSessions({ limits: { maxProofs: 200 } });
    const proofs = Array.from({ length: 100 }, () => admin.mintProof().proof);
    expect(new Set(proofs).size).toBe(100);
    for (const p of proofs) {
      expect(p).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(p, 'base64url').length).toBe(32);
    }
  });

  test('TTL above two minutes or a non-positive limit is refused', () => {
    expect(() => new AdminSessions({ limits: { proofTtlMs: MAX_PROOF_TTL_MS + 1 } })).toThrow();
    expect(() => new AdminSessions({ limits: { idleMs: 0 } })).toThrow();
    expect(() => new AdminSessions({ limits: { maxSessions: 1.5 } })).toThrow();
    expect(new AdminSessions({ limits: { proofTtlMs: MAX_PROOF_TTL_MS } }).limits.proofTtlMs).toBe(MAX_PROOF_TTL_MS);
  });

  test('are single use: a replay is the generic invalid outcome', () => {
    const admin = new AdminSessions();
    const { proof } = admin.mintProof();
    expect(admin.exchange(proof).ok).toBe(true);
    expect(admin.exchange(proof)).toEqual({ ok: false });
  });

  test('expire at the TTL boundary, and an expired one is consumed', () => {
    const c = clock();
    const admin = new AdminSessions({ now: c.now, limits: { proofTtlMs: 60_000 } });
    const a = admin.mintProof();
    const b = admin.mintProof();
    expect(a.expiresAt).toBe(c.t + 60_000);
    c.t += 59_999;
    expect(admin.exchange(a.proof).ok).toBe(true);
    c.t += 1;
    expect(admin.exchange(b.proof)).toEqual({ ok: false });
    c.t -= 1;
    expect(admin.exchange(b.proof)).toEqual({ ok: false });
  });

  test('garbage, look-alikes and non-strings get the same outcome', () => {
    const admin = new AdminSessions();
    const { proof } = admin.mintProof();
    for (const bad of [undefined, null, 42, {}, [proof], '', proof + 'x', proof.slice(1), ` ${proof}`, 'A'.repeat(43)]) {
      expect(admin.exchange(bad)).toEqual({ ok: false });
    }
    expect(admin.exchange(proof).ok).toBe(true);
  });

  test('a session secret is not a proof, and a proof is not a session', () => {
    const admin = new AdminSessions();
    const { proof } = admin.mintProof();
    expect(admin.verify(proof)).toEqual({ ok: false });
    const s = session(admin);
    expect(admin.exchange(s.secret)).toEqual({ ok: false });
    expect(admin.exchange(proof).ok).toBe(true);
  });
});

describe('admin sessions', () => {
  test('verify returns the safe id; the secret differs from it and from the proof', () => {
    const admin = new AdminSessions();
    const { proof } = admin.mintProof();
    const s = admin.exchange(proof);
    if (!s.ok) throw new Error('exchange failed');
    expect(s.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(s.secret).not.toBe(proof);
    expect(s.id).toMatch(/^[0-9a-f]{32}$/);
    expect(admin.verify(s.secret)).toMatchObject({ ok: true, id: s.id });
    expect(admin.verify(s.id)).toEqual({ ok: false });
  });

  test('idle expiry; verify restarts the idle timer', () => {
    const c = clock();
    const admin = new AdminSessions({ now: c.now, limits: { idleMs: 1000, absoluteMs: 10_000 } });
    const s = session(admin);
    expect(s.expiresAt).toBe(c.t + 1000);
    c.t += 999;
    expect(admin.verify(s.secret)).toMatchObject({ ok: true, expiresAt: c.t + 1000 });
    c.t += 999;
    expect(admin.verify(s.secret).ok).toBe(true);
    c.t += 1000;
    expect(admin.verify(s.secret)).toEqual({ ok: false });
    c.t -= 1;
    expect(admin.verify(s.secret)).toEqual({ ok: false });
  });

  test('absolute expiry wins over activity', () => {
    const c = clock();
    const admin = new AdminSessions({ now: c.now, limits: { idleMs: 1000, absoluteMs: 2500 } });
    const s = session(admin);
    const end = c.t + 2500;
    c.t += 900;
    expect(admin.verify(s.secret).ok).toBe(true);
    c.t += 900;
    expect(admin.verify(s.secret)).toMatchObject({ ok: true, expiresAt: end });
    c.t = end - 1;
    expect(admin.verify(s.secret).ok).toBe(true);
    c.t = end;
    expect(admin.verify(s.secret)).toEqual({ ok: false });
  });

  test('list shows safe fields only; revoke and revoke-all', () => {
    const c = clock();
    const admin = new AdminSessions({ now: c.now });
    const a = session(admin);
    c.t += 5;
    const b = session(admin);
    const pending = admin.mintProof().proof;
    const listed = admin.list();
    expect(listed.map((s) => s.id)).toEqual([a.id, b.id]);
    expect(Object.keys(listed[0]!).sort()).toEqual(['createdAt', 'expiresAt', 'id', 'lastSeenAt']);
    const dump = JSON.stringify(listed) + inspect(admin, { depth: 9, showHidden: true }) + JSON.stringify(admin);
    for (const secret of [a.secret, b.secret, pending]) expect(dump).not.toContain(secret);

    expect(admin.revoke('nope')).toBe(false);
    expect(admin.revoke(a.id)).toBe(true);
    expect(admin.verify(a.secret)).toEqual({ ok: false });
    expect(admin.verify(b.secret).ok).toBe(true);
    expect(admin.revokeAll()).toBe(1);
    expect(admin.verify(b.secret)).toEqual({ ok: false });
    expect(admin.exchange(pending)).toEqual({ ok: false });
    expect(admin.list()).toEqual([]);
  });

  test('caps evict the oldest proof and the least recently seen session', () => {
    const c = clock();
    const admin = new AdminSessions({ now: c.now, limits: { maxProofs: 2, maxSessions: 2 } });
    const p1 = admin.mintProof().proof;
    const p2 = admin.mintProof().proof;
    const p3 = admin.mintProof().proof;
    expect(admin.exchange(p1)).toEqual({ ok: false });
    const a = admin.exchange(p2);
    const b = admin.exchange(p3);
    if (!a.ok || !b.ok) throw new Error('exchange failed');
    c.t += 1;
    admin.verify(a.secret);
    const d = session(admin);
    expect(admin.verify(b.secret)).toEqual({ ok: false });
    expect(admin.verify(a.secret).ok).toBe(true);
    expect(admin.verify(d.secret).ok).toBe(true);
    expect(admin.list()).toHaveLength(2);
  });

  test('instances share nothing — a restart signs everyone out', () => {
    const a = new AdminSessions();
    const b = new AdminSessions();
    const s = session(a);
    const proof = a.mintProof().proof;
    expect(b.verify(s.secret)).toEqual({ ok: false });
    expect(b.exchange(proof)).toEqual({ ok: false });
    expect(a.exchange(proof).ok).toBe(true);
    expect(a.verify(s.secret).ok).toBe(true);
  });
});

describe('admin cookie', () => {
  const secret = 'A'.repeat(43);

  test('names carry the port and the HTTPS prefix', () => {
    expect(adminCookieName({ port: 7777, secure: false })).toBe('mdhouse-admin-7777');
    expect(adminCookieName({ port: 7792, secure: false })).toBe('mdhouse-admin-7792');
    expect(adminCookieName({ port: 443, secure: true })).toBe('__Host-mdhouse-admin-443');
    for (const port of [0, -1, 65536, 7.5, NaN]) expect(() => adminCookieName({ port, secure: false })).toThrow();
  });

  test('is host-only, HttpOnly, SameSite=Strict; Secure only on HTTPS', () => {
    const plain = adminCookie(secret, 90_500, { port: 7777, secure: false });
    expect(plain).toBe(`mdhouse-admin-7777=${secret}; Path=/; HttpOnly; SameSite=Strict; Max-Age=90`);
    const tls = adminCookie(secret, 1000, { port: 443, secure: true });
    expect(tls).toBe(`__Host-mdhouse-admin-443=${secret}; Path=/; HttpOnly; SameSite=Strict; Max-Age=1; Secure`);
    expect(plain + tls).not.toMatch(/Domain/i);
    expect(clearAdminCookie({ port: 7777, secure: false })).toBe('mdhouse-admin-7777=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
    expect(() => adminCookie('x; Domain=evil', 1000, { port: 7777, secure: false })).toThrow();
  });

  test('reads only its own name: not another port, the author cookie or a look-alike', () => {
    const scope = { port: 7777, secure: false };
    const header = `mdhouse-author=bob; mdhouse-admin-7792=other; xmdhouse-admin-7777=evil; mdhouse-admin-7777=${secret}`;
    expect(readAdminCookie(header, scope)).toBe(secret);
    expect(readAdminCookie(header, { port: 7792, secure: false })).toBe('other');
    expect(readAdminCookie(header, { port: 7777, secure: true })).toBeNull();
    expect(readAdminCookie('mdhouse-author=bob', scope)).toBeNull();
    expect(readAdminCookie(undefined, scope)).toBeNull();
  });

  test('two instances on one host keep separate cookies and sessions', () => {
    const live = new AdminSessions();
    const scratch = new AdminSessions();
    const l = session(live);
    const s = session(scratch);
    const jar = [adminCookie(l.secret, 1000, { port: 7777, secure: false }), adminCookie(s.secret, 1000, { port: 7792, secure: false })]
      .map((c) => c.split(';')[0])
      .join('; ');
    expect(live.verify(readAdminCookie(jar, { port: 7777, secure: false })).ok).toBe(true);
    expect(scratch.verify(readAdminCookie(jar, { port: 7792, secure: false })).ok).toBe(true);
    expect(live.verify(s.secret)).toEqual({ ok: false });
    expect(scratch.verify(l.secret)).toEqual({ ok: false });
  });
});

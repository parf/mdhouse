import { describe, expect, test } from 'bun:test';
import { MAX_AUTHOR, authorCookieName, authorSetCookie, normalizeAuthorName, readAuthorCookie } from '../src/lib/author';
import { badgeName, badgeSource } from '../src/lib/qa';

describe('normalizeAuthorName', () => {
  test('letters, digits, _ and - of any script are kept, NFC', () => {
    expect(normalizeAuthorName('Alice')).toBe('Alice');
    expect(normalizeAuthorName('Сергей')).toBe('Сергей');
    expect(normalizeAuthorName('Zoë-2_b')).toBe('Zoë-2_b');
    expect(normalizeAuthorName('Zoë')).toBe('Zoë'); // e + combining diaeresis → one NFC code point
    expect(normalizeAuthorName('  Bob  ')).toBe('Bob');
  });

  test('anything that could end the badge or start Markdown is dropped', () => {
    expect(normalizeAuthorName('a\nb')).toBe('ab');
    expect(normalizeAuthorName('x`y*z_[w](u)|v#~\\')).toBe('xyz_wuv');
    expect(normalizeAuthorName('**bold**name')).toBe('boldname');
    expect(normalizeAuthorName('a b:c;d.e!f?g<h>i&j')).toBe('abcdefghij');
    expect(normalizeAuthorName('Eve\n- 🎯 injected')).toBe('Eve-injected');
  });

  test('badge glyphs and emoji cannot form a second badge or a status', () => {
    expect(normalizeAuthorName('👤parf')).toBe('parf');
    expect(normalizeAuthorName('a👾b📡slack🎫RLM')).toBe('abslackRLM');
    expect(normalizeAuthorName('1️⃣')).toBe('1'); // keycap: variation selector and enclosing mark go
    expect(normalizeAuthorName('✅❓')).toBeNull();
  });

  test('zero width, bidi and other format characters are dropped', () => {
    expect(normalizeAuthorName('a​b‍c⁠d')).toBe('abcd');
    expect(normalizeAuthorName('‮evil‬')).toBe('evil');
    expect(normalizeAuthorName('⁦x⁩')).toBe('x');
    expect(normalizeAuthorName('a\u0000b\u0007c')).toBe('abc');
  });

  test('a name with nothing usable is refused: empty, marks only, punctuation only', () => {
    for (const bad of ['', '   ', '́́', '‮', '---', '__', '!!!', '👤', 5, null, undefined, {}]) {
      expect(normalizeAuthorName(bad)).toBeNull();
    }
  });

  test('combining marks only follow a letter or digit, at most two in a row', () => {
    expect(normalizeAuthorName('́a')).toBe('a');
    expect(normalizeAuthorName('á̂̃̄̅')).toBe('á̂'.normalize('NFC'));
    expect(normalizeAuthorName('-́a')).toBe('-a'); // not after a dash
  });

  test('capped at 32 code points, never splitting a surrogate pair', () => {
    expect(normalizeAuthorName('a'.repeat(100))).toBe('a'.repeat(MAX_AUTHOR));
    const astral = '𝒜'.repeat(40); // letters outside the BMP: two UTF-16 units each
    const out = normalizeAuthorName(astral)!;
    expect([...out].length).toBe(MAX_AUTHOR);
    expect(out.length).toBe(MAX_AUTHOR * 2);
    expect(out.endsWith('\uD835')).toBe(false);
  });
});

describe('the author cookie', () => {
  test('one cookie per port', () => {
    expect(authorCookieName(7777)).toBe('mdhouse_author_7777');
  });

  test('read: among other cookies, percent-decoded, normalized again, the other port ignored', () => {
    const h = `a=1; mdhouse_author_7777=${encodeURIComponent('Сергей')}; b=2`;
    expect(readAuthorCookie(h, 7777)).toBe('Сергей');
    expect(readAuthorCookie(h, 7790)).toBeNull();
    expect(readAuthorCookie(`mdhouse_author_7777=${encodeURIComponent('x\n- 🎯 y')}`, 7777)).toBe('x-y');
    expect(readAuthorCookie('mdhouse_author_7777=%E0%A4%A', 7777)).toBeNull(); // malformed percent
    expect(readAuthorCookie('mdhouse_author_7777=', 7777)).toBeNull();
    expect(readAuthorCookie(null, 7777)).toBeNull();
    expect(readAuthorCookie('mdhouse_author_77777=Eve', 7777)).toBeNull(); // a prefix of another name
  });

  test('set: host only, HttpOnly, Lax, one year; Secure only when asked; null clears', () => {
    const set = authorSetCookie(7777, 'Alice', false);
    expect(set).toBe('mdhouse_author_7777=Alice; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax');
    expect(set).not.toContain('Domain');
    expect(set).not.toContain('Secure');
    expect(authorSetCookie(7777, 'Alice', true)).toEndWith('; Secure');
    expect(authorSetCookie(7777, 'Сергей', false)).toContain(`=${encodeURIComponent('Сергей')};`);
    expect(authorSetCookie(7777, null, false)).toBe('mdhouse_author_7777=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
  });
});

describe('badgeSource keeps the signer fallback exactly', () => {
  test('prefs, then git email, git name, login; badgeName is its name', () => {
    expect(badgeSource('Me', { email: 'g@x', name: 'G N' }, 'login')).toEqual({ name: 'Me', source: 'prefs' });
    expect(badgeSource('', { email: 'g@x', name: 'G N' }, 'login')).toEqual({ name: 'g', source: 'git' });
    expect(badgeSource('', { email: '', name: 'G N' }, 'login')).toEqual({ name: 'GN', source: 'git' });
    expect(badgeSource('', null, 'login')).toEqual({ name: 'login', source: 'login' });
    expect(badgeSource('', null, '')).toEqual({ name: 'me', source: 'login' });
    for (const args of [['Me', null, 'l'], ['', { email: 'a@b', name: '' }, 'l'], ['', null, 'l']] as const) {
      expect(badgeName(args[0], args[1], args[2])).toBe(badgeSource(args[0], args[1], args[2]).name);
    }
  });
});

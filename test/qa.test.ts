import { describe, expect, test } from 'bun:test';
import { applyQa, badgeName, parseQa, stateOf, type QaChange, type QaRequest } from '../src/lib/qa';

const itemAt = (src: string, line: number, offset = 0) => {
  const it = parseQa(src, offset).items.find((i) => i.start === line - 1);
  if (!it) throw new Error(`no item on line ${line}`);
  return it;
};
/** Apply a change to the item on `line`, as a page that rendered `src` would. */
const act = (src: string, line: number, op: QaChange, offset = 0) => {
  const r = applyQa(src, offset, { line, hash: itemAt(src, line, offset).hash, ...op } as QaRequest, 'parf');
  if ('error' in r) throw new Error(r.error);
  return r.src;
};

describe('items: where an item and its thread end', () => {
  test('a lazy line belongs to the question, not its answer (B2)', () => {
    const src = '> ❓ Do we keep\nthe old URLs?\n> 💬 yes\n';
    const it = itemAt(src, 1);
    expect(it.head).toBe('Do we keep\nthe old URLs?');
    expect(it.replies.map((r) => r.body)).toEqual(['yes']);
    expect(act('- ❓ Do we keep\nthe old URLs?\n', 1, { op: 'say', text: 'yes' })).toBe('- ❓ Do we keep\nthe old URLs?\n  > 💬 yes\n');
  });

  test('a thread after a blank line is the item’s own (B5)', () => {
    const src = '- ❓ Which host?\n\n  > 💬 prod-a1\n';
    expect(itemAt(src, 1).replies.map((r) => r.body)).toEqual(['prod-a1']);
    expect(act(src, 1, { op: 'say', text: 'b2' })).toBe('- ❓ Which host?\n\n  > 💬 prod-a1\n  >\n  > 💬 b2\n');
  });

  test('a sub-item’s reply is its own: answering the parent leaves it (B1)', () => {
    const src = '- ❓ Ship?\n  - ❓ Changelog?\n    > 💬 Yes, Ann.\n';
    expect(itemAt(src, 1).replies).toEqual([]);
    expect(itemAt(src, 2).replies.map((r) => r.body)).toEqual(['Yes, Ann.']);
    expect(act(src, 1, { op: 'say', text: 'Friday' })).toBe('- ❓ Ship?\n  - ❓ Changelog?\n    > 💬 Yes, Ann.\n  > 💬 Friday\n');
  });

  test('a glyph item in a fence, or a plain list item, is no item', () => {
    expect(parseQa('```\n- ❓ no\n```\n- plain\n- [ ] task\n- 🎉 party\n', 0).items).toEqual([]);
  });

  test('an issue: claim, Evidence / Impact, cases, a 💡; an id', () => {
    const it = itemAt('- 🔴 D1 `a.ts:1` lost\n  Evidence: ran it\n  Impact: everyone\n  - case\n  > 💡👾 fix\n', 1);
    expect(it.glyphs).toEqual(['🔴']);
    expect(it.head).toBe('D1 `a.ts:1` lost\nEvidence: ran it\nImpact: everyone');
    expect(it.children.map((c) => c.kind)).toEqual(['case']);
    expect(it.replies[0]!.suggest).toBe(true);
  });
});

describe('items: state', () => {
  const state = (src: string) => stateOf(itemAt(src, 1));
  test('a ❓ waits on me; a person’s whole reply answers it; an agent’s asks again', () => {
    expect(state('- ❓ q\n').waitMe).toBe(true);
    expect(state('- ❓ q\n  > 💬 👤parf yes\n').answered).toBe(true);
    expect(state('- ❓ q\n  > 💬 👤parf yes\n  >\n  > 💬👾 sure?\n').answered).toBe(false);
  });
  test('⚠️, elaborate, a bare no, an undecided 💡: not answered', () => {
    for (const r of ['💬 ⚠️ 👤parf partly', '💬 👤parf elaborate — more', '💬 👤parf no', '💡👾 maybe'])
      expect(state(`- ❓ q\n  > ${r}\n`).answered).toBe(false);
    expect(state('- ❓ q\n  > ✅ 💡👾 maybe\n  >\n  > 💬 👤parf yes\n').answered).toBe(true);
  });
  test('the agent’s record is not a turn', () => {
    expect(state('- ❓ q\n  > 💬 👤parf yes\n  >\n  > 💬👾 → DECISIONS.md\n').answered).toBe(true);
  });
  test('a pick answers a one-of; checkboxes need done', () => {
    expect(state('- ❓ q\n  - (x) a\n  - ( ) b\n').answered).toBe(true);
    expect(state('- ❓ q\n  - [x] a\n').answered).toBe(false);
    expect(state('- ❓ q\n  - [x] a\n  > 💬 👤parf done\n').answered).toBe(true);
  });
  test('severity: open finding, triaged, closed, 🔵 a note treated as done', () => {
    expect(state('- 🔴 x\n').finding).toBe(true);
    expect(state('- 🔴 x\n  > 💬 👤parf do it\n').triaged).toBe(true);
    expect(state('- ✅ 🔴 x\n').closed).toBe(true);
    expect(state('- 🔵 not reviewed\n')).toMatchObject({ closed: true, finding: false, key: '🔵' });
    expect(state('- 🎯 ❓ 🟠 x\n').key).toBe('❓ 🟠 open 🎯');
  });
});

describe('items: writing', () => {
  test('say: signed, partial, multi-line; a line that would start a turn is escaped, a fence is not', () => {
    expect(act('- ❓ q\n', 1, { op: 'say', text: 'a\n💬 b\n\n```\n💬 c\n```', sign: true })).toBe(
      '- ❓ q\n  > 💬 👤parf a\n  > &#128172; b\n  >\n  > ```\n  > 💬 c\n  > ```\n',
    );
    expect(act('- ❓ q\n', 1, { op: 'say', text: 'half', action: 'partial' })).toBe('- ❓ q\n  > 💬 ⚠️ half\n');
  });

  test('a stage replaces the first glyph and keeps the severity (B4); ✅ is signed settled', () => {
    expect(act('- 🔴 x\n', 1, { op: 'say', text: '', action: '✅' })).toBe('- ✅ 🔴 x\n  > 💬 👤parf settled\n');
    expect(act('- ❓ 🟠 x\n', 1, { op: 'say', text: 'later', action: '⏸️' })).toBe('- ⏸️ 🟠 x\n  > 💬 later\n');
    expect(act('- ✅ x\n', 1, { op: 'say', text: '', action: 'elaborate' })).toBe('- ❓ x\n  > 💬 👤parf elaborate\n');
  });

  test('🎫 needs who takes it', () => {
    const src = '- 🟠 x\n';
    const r = applyQa(src, 0, { line: 1, hash: itemAt(src, 1).hash, op: 'say', text: 'soon', action: '🎫' }, 'parf');
    expect(r).toEqual({ error: 'needs-who' });
    expect(act(src, 1, { op: 'say', text: '👥backend', action: '🎫' })).toBe('- 🎫 🟠 x\n  > 💬 👥backend\n');
  });

  test('🎯 toggles first in the line', () => {
    expect(act('- ❓ 🟠 x\n', 1, { op: 'target' })).toBe('- 🎯 ❓ 🟠 x\n');
    expect(act('- 🎯 ❓ 🟠 x\n', 1, { op: 'target' })).toBe('- ❓ 🟠 x\n');
  });

  test('verdict on the newest 💡: ✅ 💡 / 🚫 💡 and a signed yes / no', () => {
    const src = '- ❓ q\n  > 💡👾 do it\n';
    expect(act(src, 1, { op: 'verdict', sug: 2, yes: true, text: 'now' })).toBe('- ❓ q\n  > ✅ 💡👾 do it\n  >\n  > 💬 👤parf yes — now\n');
    expect(act(src, 1, { op: 'verdict', sug: 2, yes: false })).toBe('- ❓ q\n  > 🚫 💡👾 do it\n  >\n  > 💬 👤parf no\n');
  });

  test('pick clears the other radios; tick toggles a checkbox; done; a comment under an option', () => {
    expect(act('- ❓ q\n  - (x) a\n  - ( ) b\n', 1, { op: 'pick', opt: 3, on: true })).toBe('- ❓ q\n  - ( ) a\n  - (x) b\n');
    expect(act('- ❓ q\n  - (x) a\n', 1, { op: 'pick', opt: 2, on: false })).toBe('- ❓ q\n  - ( ) a\n');
    expect(act('- ❓ q\n  - [ ] a\n', 1, { op: 'tick', opt: 2 })).toBe('- ❓ q\n  - [x] a\n');
    expect(act('- ❓ q\n  - [x] a\n', 1, { op: 'done' })).toBe('- ❓ q\n  - [x] a\n  > 💬 👤parf done\n');
    expect(act('- ❓ q\n  - ( ) a\n  - ( ) b\n', 1, { op: 'say', text: 'this', under: 2, action: 'pick' })).toBe(
      '- ❓ q\n  - (x) a\n    > 💬 this\n  - ( ) b\n',
    );
  });

  test('edit replaces a reply’s text and keeps who wrote it', () => {
    expect(act('- ❓ q\n  > 💬 👤parf old\n  > two\n', 1, { op: 'edit', reply: 2, text: 'new' })).toBe('- ❓ q\n  > 💬 👤parf new\n');
  });

  test('quote items, ordered lists, CRLF, no final newline, front matter', () => {
    expect(act('> ❓ q\n> 💬 a\n', 1, { op: 'say', text: 'b' })).toBe('> ❓ q\n> 💬 a\n>\n> 💬 b\n');
    expect(act('1. ❓ q\n', 1, { op: 'say', text: 'a' })).toBe('1. ❓ q\n   > 💬 a\n');
    expect(act('- ❓ q\r\nnext\r\n', 1, { op: 'say', text: 'a' })).toBe('- ❓ q\r\nnext\r\n  > 💬 a\r\n');
    expect(act('- ❓ q', 1, { op: 'say', text: 'a' })).toBe('- ❓ q\n  > 💬 a');
    expect(act('---\nt: 1\n---\n- ❓ q\n', 1, { op: 'say', text: 'a' }, 3)).toBe('---\nt: 1\n---\n- ❓ q\n  > 💬 a\n');
  });

  test('a page older than the file, or a line that is no item, is refused', () => {
    expect(applyQa('- ❓ q\n', 0, { line: 1, hash: 'nope', op: 'target' }, 'me')).toEqual({ error: 'stale' });
    expect(applyQa('text\n', 0, { line: 1, hash: 'x', op: 'target' }, 'me')).toEqual({ error: 'not-an-item' });
    const src = '- ❓ q\n';
    expect(applyQa(src, 0, { line: 1, hash: itemAt(src, 1).hash, op: 'say', text: ' ' }, 'me')).toEqual({ error: 'empty' });
    expect(applyQa(src, 0, { line: 1, hash: itemAt(src, 1).hash, op: 'tick', opt: 1 }, 'me')).toEqual({ error: 'no-target' });
  });

  test('badgeName: prefs, then the email’s local part, then the git name, then the login', () => {
    expect(badgeName('Me Too', null, 'u')).toBe('MeToo');
    expect(badgeName('', { email: 'parf2@realmo.com', name: 'Serg Parf' }, 'u')).toBe('parf2');
    expect(badgeName('', { name: 'Serg Parf' }, 'u')).toBe('SergParf');
    expect(badgeName('', null, 'u')).toBe('u');
  });
});

import { describe, expect, test } from 'bun:test';
import { answerText, findQuestion, lineHash, writeAnswer, type QaForm } from '../src/lib/qa';

/** Answer the question on body line `line`, as a page that rendered `src` would. */
function answer(src: string, line: number, form: QaForm, text: string, check = false, offset = 0) {
  const found = findQuestion(src, offset, line, form);
  if (!found) throw new Error('no question there');
  return writeAnswer(src, offset, { line, form, hash: found.hash, answerHash: found.answerHash, text, check });
}

const srcOf = (r: ReturnType<typeof writeAnswer>) => {
  if ('error' in r) throw new Error(r.error);
  return r.src;
};

describe('writing an answer, in the question’s own syntax', () => {
  test('quote: a 💬 line in the same quote, bullets kept inside it', () => {
    expect(srcOf(answer('> ? Who?\n\nafter\n', 1, 'quote', 'The team:\n- a\n- b'))).toBe(
      '> ? Who?\n> 💬 The team:\n> - a\n> - b\n\nafter\n',
    );
  });

  test('quote: an existing answer — A: or 💬 — is replaced, and written back as 💬', () => {
    const src = '> ? Who?\n> A: nobody\n> still nobody\n\nafter\n';
    expect(answerText(['> A: nobody', '> still nobody'], 'quote')).toBe('nobody\nstill nobody');
    expect(srcOf(answer(src, 1, 'quote', 'The team.'))).toBe('> ? Who?\n> 💬 The team.\n\nafter\n');
  });

  test('a disagreement is answered the same way', () => {
    expect(srcOf(answer('> ?! Spec says 5, code 7.\n', 1, 'quote', 'Code wins.'))).toBe(
      '> ?! Spec says 5, code 7.\n> 💬 Code wins.\n',
    );
  });

  test('alert: a separate [!ANSWER] block after a blank line, or replaced in place', () => {
    expect(srcOf(answer('> [!QUESTION]\n> Why?\n\nnext\n', 1, 'alert', 'Because.'))).toBe(
      '> [!QUESTION]\n> Why?\n\n> [!ANSWER]\n> Because.\n\nnext\n',
    );
    expect(srcOf(answer('> [!QUESTION]\n> Why?\n\n> [!ANSWER]\n> Old.\n', 1, 'alert', 'New.\n\nTwo.'))).toBe(
      '> [!QUESTION]\n> Why?\n\n> [!ANSWER]\n> New.\n>\n> Two.\n',
    );
  });

  test('bold: an **A:** line; as a list item, the next item of the same list', () => {
    expect(srcOf(answer('**Q:** Warm?\n\nnext\n', 1, 'bold', 'Yes.'))).toBe('**Q:** Warm?\n**A:** Yes.\n\nnext\n');
    expect(srcOf(answer('- **Q:** Warm?\n- other\n', 1, 'bold', 'Yes.\nmostly'))).toBe(
      '- **Q:** Warm?\n- **A:** Yes.\n  mostly\n- other\n',
    );
  });

  test('container: a ::: a block after the question, or replaced', () => {
    expect(srcOf(answer('::: q Why?\n:::\n', 1, 'container', 'Because:\n- a'))).toBe(
      '::: q Why?\n:::\n\n::: a\nBecause:\n- a\n:::\n',
    );
    const src = '::: q Why?\n:::\n\n::: answer\nOld.\n:::\n';
    expect(answerText(['::: answer', 'Old.', ':::'], 'container')).toBe('Old.');
    expect(srcOf(answer(src, 1, 'container', 'New.'))).toBe('::: q Why?\n:::\n\n::: a\nNew.\n:::\n');
  });

  test('task: an indented > 💬 inside the item; Check & Save ticks it too', () => {
    const src = '- [ ] Which hosts take the adapter in the versioned\n      inventory?\n- [ ] Next one\n';
    expect(srcOf(answer(src, 1, 'task', 'prod-a1:\n- adapter'))).toBe(
      '- [ ] Which hosts take the adapter in the versioned\n      inventory?\n  > 💬 prod-a1:\n  > - adapter\n- [ ] Next one\n',
    );
    expect(srcOf(answer(src, 1, 'task', 'prod-a1', true))).toBe(
      '- [x] Which hosts take the adapter in the versioned\n      inventory?\n  > 💬 prod-a1\n- [ ] Next one\n',
    );
    const answered = '- [x] Done?\n  > 💬 Yes.\n- [ ] Next\n';
    expect(srcOf(answer(answered, 1, 'task', 'Yes, twice.'))).toBe('- [x] Done?\n  > 💬 Yes, twice.\n- [ ] Next\n');
  });

  test('status glyph items are task items: answered inside, Check & Save makes the glyph ✅', () => {
    const src = '- ⚠️ Is the coffee machine fixed?\n- 🚫 Rewrite it in Rust?\n';
    expect(srcOf(answer(src, 1, 'task', 'Half of it.'))).toBe(
      '- ⚠️ Is the coffee machine fixed?\n  > 💬 Half of it.\n- 🚫 Rewrite it in Rust?\n',
    );
    expect(srcOf(answer(src, 1, 'task', 'Yes.', true))).toBe(
      '- ✅ Is the coffee machine fixed?\n  > 💬 Yes.\n- 🚫 Rewrite it in Rust?\n',
    );
    // Already done: Check & Save leaves the glyph alone.
    expect(srcOf(answer('- ✔️ Done?\n', 1, 'task', 'Yes.', true))).toBe('- ✔️ Done?\n  > 💬 Yes.\n');
    // Every glyph of the set, with or without the variation selector; a glyph glued to the text is not one.
    for (const g of ['✅', '☑️', '☑', '✔️', '☐', '☒', '⚠️', '⚠', '🎫', '❌', '🚫', '⛔', '⏳', '❓', '⁉️', '🔴', '🟠', '⚪', '⚪️', '🟢']) {
      expect(findQuestion(`- ${g} Why?\n`, 0, 1, 'task')).not.toBeNull();
    }
    expect(findQuestion('- ✅Why?\n', 0, 1, 'task')).toBeNull();
    expect(findQuestion('- 🎉 Why?\n', 0, 1, 'task')).toBeNull();
  });

  test('CRLF stays CRLF; front matter is counted back in', () => {
    expect(srcOf(answer('> ? Who?\r\n\r\nafter\r\n', 1, 'quote', 'Me.'))).toBe('> ? Who?\r\n> 💬 Me.\r\n\r\nafter\r\n');
    expect(srcOf(answer('---\nt: x\n---\n**Q:** Warm?\n', 1, 'bold', 'Yes.', false, 3))).toBe(
      '---\nt: x\n---\n**Q:** Warm?\n**A:** Yes.\n',
    );
  });
});

describe('found in review: the answer lands where the page shows it, and stays an answer', () => {
  test('a quote question keeps its own follow-on paragraphs; a blank > before the answer is skipped', () => {
    const src = '> ? Should we migrate?\n>\n> Context: the old DB is EOL.\n';
    expect(srcOf(answer(src, 1, 'quote', 'Yes'))).toBe('> ? Should we migrate?\n>\n> Context: the old DB is EOL.\n> 💬 Yes\n');
    const spaced = '> ? q\n>\n> 💬 old\n';
    expect(findQuestion(spaced, 0, 1, 'quote')!.answer).toEqual({ start: 2, end: 3 });
    expect(srcOf(answer(spaced, 1, 'quote', 'new'))).toBe('> ? q\n>\n> 💬 new\n');
  });

  test('a task item keeps its context quote, sub-list and lazy line; the answer goes after them', () => {
    expect(srcOf(answer('- [ ] Migrate?\n  > Context: DB is EOL.\n', 1, 'task', 'Yes'))).toBe(
      '- [ ] Migrate?\n  > Context: DB is EOL.\n  > 💬 Yes\n',
    );
    const sub = '- [ ] q\n  - sub\n  > 💬 old\n- next\n';
    expect(answerText(findQuestion(sub, 0, 1, 'task')!.lines.slice(2, 3), 'task')).toBe('old');
    expect(srcOf(answer(sub, 1, 'task', 'new'))).toBe('- [ ] q\n  - sub\n  > 💬 new\n- next\n');
    expect(srcOf(answer('- [ ] question\ncontinues here\n', 1, 'task', 'a'))).toBe('- [ ] question\ncontinues here\n  > 💬 a\n');
  });

  test('a bold answer with a list is replaced whole, in and out of a list', () => {
    const once = srcOf(answer('**Q:** Warm?\n', 1, 'bold', 'Yes:\n- a\n- b'));
    expect(once).toBe('**Q:** Warm?\n**A:** Yes:\n- a\n- b\n');
    const found = findQuestion(once, 0, 1, 'bold')!;
    expect(answerText(found.lines.slice(found.answer!.start, found.answer!.end), 'bold')).toBe('Yes:\n- a\n- b');
    expect(srcOf(answer(once, 1, 'bold', 'No:\n- c'))).toBe('**Q:** Warm?\n**A:** No:\n- c\n');
    const list = '- **Q:** Warm?\n- **A:** Yes:\n  - a\n- other\n';
    expect(srcOf(answer(list, 1, 'bold', 'No.'))).toBe('- **Q:** Warm?\n- **A:** No.\n- other\n');
  });

  test('an indented **A:** under a list-item question is its answer', () => {
    const src = '- **Q:** what?\n  **A:** this.\n- next\n';
    expect(findQuestion(src, 0, 1, 'bold')!.answer).toEqual({ start: 1, end: 2 });
    expect(srcOf(answer(src, 1, 'bold', 'that.'))).toBe('- **Q:** what?\n  **A:** that.\n- next\n');
  });

  test('a quote or alert question inside a list item is answered inside it', () => {
    expect(srcOf(answer('- item\n  > ? q\n- next\n', 2, 'quote', 'Yes'))).toBe('- item\n  > ? q\n  > 💬 Yes\n- next\n');
    expect(srcOf(answer('- item\n\n  > [!QUESTION]\n  > q\n', 3, 'alert', 'Yes'))).toBe(
      '- item\n\n  > [!QUESTION]\n  > q\n\n  > [!ANSWER]\n  > Yes\n',
    );
  });

  test('answer lines that would read as markup are escaped, and read back as typed', () => {
    const cases: [string, QaForm, string, string][] = [
      ['> ? q\n', 'quote', 'because\n? really\n💬 and\nQ: this', '> 💬 because\n> \\? really\n> &#128172; and\n> &#81;: this'],
      ['::: q q\n:::\n', 'container', 'see\n:::\ntail', '::: a\nsee\n\\:::\ntail\n:::'],
      ['**Q:** q\n', 'bold', 'Yes\n---\n**Q:** sneaky\n# no', '**A:** Yes\n\\---\n\\**Q:** sneaky\n\\# no'],
    ];
    for (const [src, form, text, written] of cases) {
      const out = srcOf(answer(src, 1, form, text));
      expect(out).toContain(written);
      const found = findQuestion(out, 0, 1, form)!;
      expect(answerText(found.lines.slice(found.answer!.start, found.answer!.end), form)).toBe(text);
    }
  });

  test('a CRLF file whose question is its last line, with no final newline', () => {
    expect(srcOf(answer('a\r\n> ? q', 2, 'quote', 'ans'))).toBe('a\r\n> ? q\r\n> 💬 ans');
  });
});

describe('a page older than the file is refused', () => {
  test('the question changed', () => {
    const r = writeAnswer('> ? Who now?\n', 0, { line: 1, form: 'quote', hash: lineHash('> ? Who?'), answerHash: '', text: 'x' });
    expect(r).toEqual({ error: 'stale' });
  });

  test('the answer changed (or appeared) since the page was loaded', () => {
    const src = '> ? Who?\n> 💬 Someone else wrote this meanwhile.\n';
    const r = writeAnswer(src, 0, { line: 1, form: 'quote', hash: lineHash('> ? Who?'), answerHash: '', text: 'x' });
    expect(r).toEqual({ error: 'stale' });
  });

  test('no question there, or an empty answer', () => {
    expect(writeAnswer('plain\n', 0, { line: 1, form: 'quote', hash: '', answerHash: '', text: 'x' })).toEqual({
      error: 'not-a-question',
    });
    expect(answer('> ? Who?\n', 1, 'quote', '   ')).toEqual({ error: 'empty' });
  });
});

describe('the renderer fingerprints a question with the same function', () => {
  test('data-hash equals the server’s hash for every form', async () => {
    const { render } = await import('../src/lib/render');
    const src = [
      '> ? Quote?', '', '> [!QUESTION]', '> Alert?', '', '**Q:** Bold?', '', '::: q Container?', ':::', '',
      '- [ ] Task?', '      continued', '',
    ].join('\n');
    const status = await render('- ⚠️ Status *item*?\n- ✅ Done?\n- plain\n', { rootId: 'r', docPath: 'a.md', docUrl: (x: string) => x } as never);
    expect(status.html).toContain(`class="status-item"`);
    expect(status.html).toContain('<span class="task-glyph">⚠️</span>Status <em>item</em>?');
    expect(status.html).toContain(`data-hash="${findQuestion('- ⚠️ Status *item*?', 0, 1, 'task')!.hash}"`);
    expect(status.html.match(/data-done/g)?.length).toBe(1);
    expect(status.tasks).toEqual({ done: 0, total: 0 });
    const { html } = await render(src, { rootId: 'r', docPath: 'a.md', docUrl: (x: string) => x } as never);
    const tags = [...html.matchAll(/data-line="(\d+)"[^>]*?data-qa-form="(\w+)" data-hash="(\w+)"|data-qa-form="(\w+)" data-hash="(\w+)"[^>]*?/g)];
    expect(tags.length).toBeGreaterThanOrEqual(5);
    for (const form of ['quote', 'alert', 'bold', 'container', 'task'] as const) {
      const line = { quote: 1, alert: 3, bold: 6, container: 8, task: 11 }[form];
      const found = findQuestion(src, 0, line, form)!;
      expect(html).toContain(`data-hash="${found.hash}"`);
    }
  });
});

/* ── Q&A items ── */

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
  test('a lazy line belongs to the question, not its answer (B.2)', () => {
    const src = '> ❓ Do we keep\nthe old URLs?\n> 💬 yes\n';
    const it = itemAt(src, 1);
    expect(it.head).toBe('Do we keep\nthe old URLs?');
    expect(it.replies.map((r) => r.body)).toEqual(['yes']);
    expect(act('- ❓ Do we keep\nthe old URLs?\n', 1, { op: 'say', text: 'yes' })).toBe('- ❓ Do we keep\nthe old URLs?\n  > 💬 yes\n');
  });

  test('a thread after a blank line is the item’s own (B.5)', () => {
    const src = '- ❓ Which host?\n\n  > 💬 prod-a1\n';
    expect(itemAt(src, 1).replies.map((r) => r.body)).toEqual(['prod-a1']);
    expect(act(src, 1, { op: 'say', text: 'b2' })).toBe('- ❓ Which host?\n\n  > 💬 prod-a1\n  >\n  > 💬 b2\n');
  });

  test('a sub-item’s reply is its own: answering the parent leaves it (B.1)', () => {
    const src = '- ❓ Ship?\n  - ❓ Changelog?\n    > 💬 Yes, Ann.\n';
    expect(itemAt(src, 1).replies).toEqual([]);
    expect(itemAt(src, 2).replies.map((r) => r.body)).toEqual(['Yes, Ann.']);
    expect(act(src, 1, { op: 'say', text: 'Friday' })).toBe('- ❓ Ship?\n  - ❓ Changelog?\n    > 💬 Yes, Ann.\n  > 💬 Friday\n');
  });

  test('a glyph item in a fence, or a plain list item, is no item', () => {
    expect(parseQa('```\n- ❓ no\n```\n- plain\n- [ ] task\n- 🎉 party\n', 0).items).toEqual([]);
  });

  test('an issue: claim, Evidence / Impact, cases, a 💡; an id', () => {
    const it = itemAt('- 🔴 D.1 `a.ts:1` lost\n  Evidence: ran it\n  Impact: everyone\n  - case\n  > 💡👾 fix\n', 1);
    expect(it.glyphs).toEqual(['🔴']);
    expect(it.head).toBe('D.1 `a.ts:1` lost\nEvidence: ran it\nImpact: everyone');
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

  test('a stage replaces the first glyph and keeps the severity (B.4); ✅ is signed settled', () => {
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

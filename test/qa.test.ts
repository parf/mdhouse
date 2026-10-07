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
    for (const g of ['✅', '☑️', '☑', '✔️', '☐', '☒', '⚠️', '⚠', '🎫', '❌', '🚫', '⛔', '⏳', '❓', '⁉️']) {
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

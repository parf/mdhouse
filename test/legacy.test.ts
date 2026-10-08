import { describe, expect, test } from 'bun:test';
import { convertLegacy } from '../src/lib/legacy';
import { parseQa } from '../src/lib/qa';

describe('old Q&A forms → the new markup', () => {
  test('glyphs in a quote', () => {
    expect(convertLegacy('> ? Who?\n> A: nobody\n')).toBe('> ❓ Who?\n> 💬 nobody\n');
    expect(convertLegacy('> ?! Spec 5, code 7.\n> Q Why?\n')).toBe('> ⁉️ Spec 5, code 7.\n\n> ❓ Why?\n');
    expect(convertLegacy('> !? a\n> Q: b\n')).toBe('> ⁉️ a\n\n> ❓ b\n');
  });

  test('alerts; an answer after a blank line joins its question', () => {
    expect(convertLegacy('> [!QUESTION]\n> Why?\n\n> [!ANSWER]\n> Because.\n>\n> Two.\n\nnext\n')).toBe(
      '> ❓ Why?\n> 💬 Because.\n>\n> Two.\n\nnext\n',
    );
  });

  test('bold paragraphs and bold list items', () => {
    expect(convertLegacy('**Q:** Is it?\n**A:** Yes.\n\n**Q:** And?\n\n**A:** Too.\n')).toBe('> ❓ Is it?\n> 💬 Yes.\n\n> ❓ And?\n> 💬 Too.\n');
    expect(convertLegacy('- **Q:** a?\n- **Q:** b?\n- **A:** yes\n  more\n')).toBe('- ❓ a?\n- ❓ b?\n  > 💬 yes\n  > more\n');
  });

  test('containers', () => {
    expect(convertLegacy('::: q Keep it?\n:::\n\n::: answer\nYes:\n\n- a\n:::\n')).toBe('> ❓ Keep it?\n> 💬 Yes:\n>\n> - a\n');
  });

  test('old status glyphs', () => {
    expect(convertLegacy('- ☐ q\n- ☑ d\n- ☒ x\n')).toBe('- ❓ q\n- ✅ d\n- 🚫 x\n');
  });

  test('not questions, fences, the new markup and front matter stay as written', () => {
    const same = [
      '> A quick note.\n\n> Quite so.\n\nText with a **Q:** in it.\n\n- 🎉 party\n',
      '```\n**Q:** code\n> ? code\n```\n',
      '- ❓ q\n  > 💬 👤parf a\n\n> ❓ q\n> 💬 a\n',
      '---\nx: "**Q:** y"\n---\nbody\n',
    ];
    for (const s of same) expect(convertLegacy(s, s.startsWith('---') ? 3 : 0)).toBe(s);
  });

  test('CRLF is kept; converting twice changes nothing', () => {
    expect(convertLegacy('**Q:** a\r\n**A:** b\r\n')).toBe('> ❓ a\r\n> 💬 b\r\n');
    const play = Bun.file(`${import.meta.dir}/../doc/qa-playground.md`);
    return play.text().then((s) => {
      const once = convertLegacy(s);
      expect(convertLegacy(once)).toBe(once);
      // every question of the playground is an item afterwards
      expect(parseQa(once, 0).items.filter((i) => i.glyphs[0] === '❓').length).toBeGreaterThanOrEqual(12);
    });
  });
});

test('a file in the new markup is never rewritten: agent badges, quotes at several indents, a loose thread', async () => {
  for (const f of ['Plans/brainstorm/qa-sample.md', 'Plans/issues/2026-10-07.md', 'Plans/brainstorm/markup.md']) {
    const s = await Bun.file(`${import.meta.dir}/../${f}`).text();
    expect(convertLegacy(s)).toBe(s);
  }
  const mixed = '- ❓ q\n  - ( ) a\n    > 💬 👤parf no\n  > 💬👾 → x\n\n> ❓ q\n\n> 💬 loose\n';
  expect(convertLegacy(mixed)).toBe(mixed);
});

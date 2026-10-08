/**
 * The Q&A forms mdhouse read before doc/qa.md's markup, rewritten into it. A document is read
 * through `convertLegacy` on every load, so the page shows the new markup and every write to the
 * file writes it converted.
 *
 * - `> ? q` / `> Q: q` / `> Q q` → `> ❓ q`; `> ?! …` / `> !? …` → `> ⁉️ …`; `> A: a` → `> 💬 a`
 * - `> [!QUESTION]` + `> q` → `> ❓ q`; `> [!ANSWER]` + `> a` → `> 💬 a`
 * - a `**Q:** q` paragraph → `> ❓ q`, its `**A:** a` lines → `> 💬 a`
 * - `- **Q:** q` → `- ❓ q`; a `- **A:** a` item after it → `  > 💬 a` under it
 * - `::: q|question` … `:::` → `> ❓ …`; `::: a|answer` → `> 💬 …`
 * - status items `☐` → `❓`, `☑` `✔️` → `✅`, `☒` → `🚫`
 *
 * An answer block after a question block (blank lines between) joins the question's quote. A
 * second question inside one quote starts a quote of its own. Fenced code is left alone.
 */

const OLD_MARK = /^(\?!|!\?|⁉️?|\?|❓|\u{1F4AC}|Q:|A:|Q(?=\s))[ \t]*/u;
const QUOTE = /^([ \t]*>[ \t]?)(.*)$/;
const LIST_BOLD = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)\*\*([QA]):\*\*[ \t]*(.*)$/;
const BOLD = /^\*\*([QA]):\*\*[ \t]*(.*)$/;
const OPEN = /^:::[ \t]*(q|question|a|answer)(?:[ \t]+(.*))?$/;
const CLOSE = /^:::[ \t]*$/;
const STATUS = /^([ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+)(☐|☑|✔️?|☒)(?=[ \t])/u;
const STATUS_TO: Record<string, string> = { '☐': '❓', '☑': '✅', '✔': '✅', '✔️': '✅', '☒': '🚫' };

type Kind = 'q' | 'd' | 'a';
/** A mark only the old forms use — `?`, `?!`, `Q:`, `A:` …; ❓ ⁉️ 💬 are the new markup's own. */
const isOld = (mark: string | undefined) => !!mark && !/^(❓|⁉|\u{1F4AC})/u.test(mark);
const kindOf = (mark: string): Kind =>
  mark === '?!' || mark === '!?' || mark.startsWith('⁉') ? 'd' : mark === '\u{1F4AC}' || mark === 'A:' ? 'a' : 'q';
const GLYPH: Record<Kind, string> = { q: '❓', d: '⁉️', a: '💬' };
const blank = (l: string) => l.trim() === '';

/** `src` with every old Q&A form in its body rewritten; the very same string when there is none. */
export function convertLegacy(src: string, offset = 0): string {
  const crlf = src.includes('\r\n');
  const all = src.split('\n').map((l) => l.replace(/\r$/, ''));
  const head = all.slice(0, offset);
  const lines = all.slice(offset);
  const out: string[] = [];
  let changed = false;
  /** The quote prefix of the question just written: an answer block after it joins it. */
  let lastQ: string | null = null;
  /** A `- **Q:**` item just written: where an answer item under it goes. */
  let listQ: { indent: number; pad: string } | null = null;
  let fence: string | null = null;

  /** Drop the blank lines just written, so an answer joins the question above it. */
  const join = () => {
    while (out.length && blank(out.at(-1)!)) out.pop();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const bare = line.replace(/^(?:[ \t]*>[ \t]?)*[ \t]*/, '');
    const f = /^(`{3,}|~{3,})/.exec(bare);
    if (fence) {
      if (f && f[1]![0] === fence[0] && f[1]!.length >= fence.length) fence = null;
      out.push(line);
      continue;
    }
    if (f) {
      fence = f[1]!;
      out.push(line);
      lastQ = listQ = null;
      continue;
    }
    if (blank(line)) {
      out.push(line);
      continue;
    }

    // ---- a quote: an alert, or one whose first line opens with a mark
    const q = QUOTE.exec(line);
    if (q) {
      let end = i;
      while (end < lines.length && QUOTE.test(lines[end]!)) end++;
      const block = lines.slice(i, end);
      const prefix = q[1]!.replace(/>[ \t]?$/, '> ');
      const bodyOf = (l: string) => QUOTE.exec(l)![2]!;
      const alert = /^\[!(QUESTION|ANSWER)\][ \t]*(.*)$/i.exec(q[2]!);
      const mark = OLD_MARK.exec(q[2]!);
      if (alert) {
        const kind: Kind = alert[1]!.toUpperCase() === 'ANSWER' ? 'a' : 'q';
        let first = alert[2]!;
        let rest = block.slice(1);
        if (!first && rest.length && !blank(bodyOf(rest[0]!))) {
          first = bodyOf(rest[0]!);
          rest = rest.slice(1);
        }
        if (kind === 'a' && lastQ === prefix) join();
        out.push(`${prefix}${GLYPH[kind]} ${first}`.trimEnd(), ...rest);
        lastQ = kind === 'q' ? prefix : null;
        changed = true;
      } else if (mark && block.some((l) => isOld(OLD_MARK.exec(bodyOf(l))?.[1]))) {
        // a quote with an old mark in it; one in the new markup only (❓ ⁉️ 💬) is left as written
        if (kindOf(mark[1]!) === 'a' && lastQ === prefix) join();
        block.forEach((l, n) => {
          const m = OLD_MARK.exec(bodyOf(l));
          if (!m) return out.push(l);
          const kind = kindOf(m[1]!);
          // a second question in one quote: a quote of its own
          if (n > 0 && kind !== 'a') out.push('');
          if (!isOld(m[1])) return out.push(l);
          const own = QUOTE.exec(l)![1]!.replace(/>[ \t]?$/, '> ');
          out.push(`${own}${GLYPH[kind]} ${bodyOf(l).slice(m[0].length)}`.trimEnd());
        });
        const lastMark = [...block].reverse().map((l) => OLD_MARK.exec(bodyOf(l))).find(Boolean);
        lastQ = lastMark && kindOf(lastMark[1]!) !== 'a' ? prefix : null;
        changed = true;
      } else {
        out.push(...block);
        lastQ = null;
      }
      listQ = null;
      i = end - 1;
      continue;
    }

    // ---- `- **Q:** …` / `- **A:** …` list items
    const li = LIST_BOLD.exec(line);
    if (li) {
      const indent = li[1]!.length;
      if (li[4] === 'Q') {
        out.push(`${li[1]}${li[2]}${li[3]}❓ ${li[5]}`.trimEnd());
        listQ = { indent, pad: ' '.repeat(indent + li[2]!.length + li[3]!.length) };
      } else if (listQ && listQ.indent === indent) {
        // the answer goes under the question, with the lines that continue it
        out.push(`${listQ.pad}> 💬 ${li[5]}`.trimEnd());
        while (i + 1 < lines.length && !blank(lines[i + 1]!) && lines[i + 1]!.search(/\S/) > indent && !LIST_BOLD.test(lines[i + 1]!)) {
          out.push(`${listQ.pad}> ${lines[++i]!.trim()}`);
        }
      } else {
        out.push(line);
        continue;
      }
      changed = true;
      lastQ = null;
      continue;
    }

    // ---- a `**Q:**` / `**A:**` paragraph: a quote
    const bold = BOLD.exec(line);
    if (bold) {
      if (bold[1] === 'A' && lastQ === '> ') join();
      let n = 0;
      let lastKind: Kind = 'a';
      for (; i < lines.length && !blank(lines[i]!); i++, n++) {
        const m = BOLD.exec(lines[i]!);
        if (m) {
          lastKind = m[1] === 'Q' ? 'q' : 'a';
          if (n > 0 && m[1] === 'Q') out.push('');
          out.push(`> ${GLYPH[lastKind]} ${m[2]}`.trimEnd());
        } else out.push(`> ${lines[i]}`);
      }
      i--;
      lastQ = lastKind === 'q' || bold[1] === 'Q' ? '> ' : null;
      listQ = null;
      changed = true;
      continue;
    }

    // ---- `::: q` / `::: a` containers
    const open = OPEN.exec(line);
    if (open) {
      let end = i + 1;
      while (end < lines.length && !CLOSE.test(lines[end]!)) end++;
      if (end < lines.length) {
        const kind: Kind = open[1]!.startsWith('a') ? 'a' : 'q';
        const body = lines.slice(i + 1, end);
        let first = open[2]?.trim() ?? '';
        while (!first && body.length) first = body.shift()!.trim();
        if (kind === 'a' && lastQ === '> ') join();
        while (body.length && blank(body.at(-1)!)) body.pop();
        out.push(`> ${GLYPH[kind]} ${first}`.trimEnd(), ...body.map((l) => (blank(l) ? '>' : `> ${l}`)));
        lastQ = kind === 'q' ? '> ' : null;
        listQ = null;
        changed = true;
        i = end;
        continue;
      }
    }

    // ---- old status glyphs
    const st = STATUS.exec(line);
    if (st) {
      out.push(`${st[1]}${STATUS_TO[st[2]!]}${line.slice(st[0].length)}`);
      changed = true;
    } else out.push(line);
    lastQ = null;
    // a line inside the `- **Q:**` item keeps it open for an answer item
    if (listQ && !(line.search(/\S/) > listQ.indent)) listQ = null;
  }

  if (!changed) return src;
  return [...head, ...out].map((l, n, a) => (crlf && n < a.length - 1 ? `${l}\r` : l)).join('\n');
}

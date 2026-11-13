import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseDocument } from 'htmlparser2';
import { passive } from '../src/lib/passive';
import { highlightFile, markupHunks, render } from '../src/lib/render';
import { testPort } from './ports';

const ctx = { rootId: 'r', docPath: 'x.md', docUrl: (rel: string) => `/r/${rel}` };

type El = { type: string; name?: string; attribs?: Record<string, string>; children?: El[] };

/** Every element of an HTML string, flattened. */
function elements(html: string): El[] {
  const out: El[] = [];
  const walk = (n: El) => {
    if (n.type === 'tag' || n.type === 'script' || n.type === 'style') out.push(n);
    for (const c of n.children ?? []) walk(c);
  };
  walk(parseDocument(html) as unknown as El);
  return out;
}

const URL_ATTRS = ['href', 'src', 'srcset', 'action', 'formaction', 'poster', 'data', 'xlink:href', 'background', 'cite', 'ping'];
const FORBIDDEN_TAGS = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'form', 'base', 'meta', 'link', 'svg', 'math',
  'template', 'noscript', 'textarea', 'select', 'animate', 'set', 'use', 'foreignobject', 'applet', 'portal', 'xmp',
]);

/** What is still active in passive HTML — empty when it is passive. */
function active(html: string): string[] {
  const found: string[] = [];
  for (const el of elements(html)) {
    const name = el.name!.toLowerCase();
    if (FORBIDDEN_TAGS.has(name) || name.includes(':')) found.push(`<${name}>`);
    if (name === 'input' && !['checkbox', 'radio'].includes(el.attribs?.type ?? '')) found.push(`input type=${el.attribs?.type}`);
    if (name === 'button' && el.attribs?.type !== 'button') found.push(`button type=${el.attribs?.type}`);
    for (const [k, v] of Object.entries(el.attribs ?? {})) {
      const key = k.toLowerCase();
      if (key.startsWith('on') || key === 'srcdoc' || key === 'formaction' || key === 'action' || key.includes(':')) found.push(`${name} ${key}`);
      if (URL_ATTRS.includes(key)) {
        const url = v.replace(/[\u0000- ]/g, '').toLowerCase();
        if (/^(?!https?:|mailto:|tel:)[a-z][a-z0-9+.-]*:/.test(url) || url.startsWith('//')) found.push(`${name} ${key}=${v}`);
      }
      if (key === 'style' && /url\(|expression|position|z-index|@import|behavior/i.test(v)) found.push(`${name} style=${v}`);
      if (name === 'a' && el.attribs?.target && el.attribs.rel !== 'noopener noreferrer') found.push('a target without rel');
    }
  }
  return found;
}

const ACTIVE: Record<string, string> = {
  script: '<script>alert(1)</script>',
  scriptSrc: '<script src="/api/raw?p=r/evil.js"></script>',
  onerror: '<img src="x.png" onerror="fetch(\'/api/settings\')">',
  onerrorUpper: '<IMG SRC="x.png" ONERROR="alert(1)">',
  onload: '<body onload="alert(1)"><p>x</p></body>',
  onclick: '<a href="#a" onclick="alert(1)">a</a>',
  onfocus: '<div tabindex="0" autofocus onfocus="alert(1)">x</div>',
  ontoggle: '<details open ontoggle="alert(1)"><summary>s</summary>x</details>',
  iframe: '<iframe src="/settings"></iframe>',
  srcdoc: '<iframe srcdoc="<script>parent.x=1</script>"></iframe>',
  object: '<object data="/api/raw?p=r/a.html"></object>',
  embed: '<embed src="/api/raw?p=r/a.svg">',
  form: '<form method="post" enctype="text/plain" action="/api/settings"><input name=\'{"editLink":false,"x":"\' value=\'"}\'><button>go</button></form>',
  formaction: '<button formaction="/api/settings" formmethod="post">go</button>',
  inputImage: '<input type="image" src="x.png" formaction="/api/settings">',
  inputSubmit: '<input type="submit" value="go">',
  inputFile: '<input type="file">',
  inputText: '<input type="text" value="x">',
  base: '<base href="https://evil.example/">',
  metaRefresh: '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
  link: '<link rel="stylesheet" href="https://evil.example/x.css">',
  style: '<style>body{background:url(https://evil.example/b)}</style>',
  styleAttr: '<p style="position:fixed;top:0;left:0;z-index:99;background:url(https://evil.example/b)">x</p>',
  styleImport: '<p style="color:red;behavior:url(x.htc)">x</p>',
  jsHref: '<a href="javascript:alert(1)">a</a>',
  jsHrefEntities: '<a href="jav&#x09;ascript:alert(1)">a</a>',
  jsHrefCase: '<a href=" JaVaScRiPt:alert(1)">a</a>',
  jsHrefColonEntity: '<a href="javascript&colon;alert(1)">a</a>',
  vbHref: '<a href="vbscript:msgbox(1)">a</a>',
  dataHtml: '<a href="data:text/html,<script>alert(1)</script>">a</a>',
  dataImgSvg: '<img src="data:image/svg+xml,<svg onload=alert(1)>">',
  protoRelative: '<a href="//evil.example/x">a</a>',
  imgSrcset: '<img srcset="javascript:alert(1) 1x, x.png 2x">',
  svgScript: '<svg><script>alert(1)</script></svg>',
  svgAnimate: '<svg><a><animate attributeName="href" values="javascript:alert(1)"/><text y="20">x</text></a></svg>',
  svgForeign: '<svg><foreignObject><iframe srcdoc="x"></iframe></foreignObject></svg>',
  svgUse: '<svg><use href="data:image/svg+xml,<svg id=x onload=alert(1)>#x"/></svg>',
  mathStyle: '<math><mi><style><img src=x onerror=alert(1)></style></mi></math>',
  mathHref: '<math href="javascript:alert(1)"><mi>x</mi></math>',
  template: '<template><img src=x onerror=alert(1)></template>',
  noscript: '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
  xmlns: '<p xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="javascript:alert(1)">x</p>',
  targetBlank: '<a href="https://example.com" target="_blank">x</a>',
  targetRelOpener: '<a href="https://example.com" target="_blank" rel="opener">x</a>',
  videoPoster: '<video src="javascript:alert(1)" poster="javascript:alert(2)" onplay="alert(3)" controls></video>',
  commentBreak: '<!--><img src=x onerror=alert(1)>-->',
  nestedQuote: '<p title="a"><img src=x onerror=alert(1)>">x</p>',
};

describe('passive() removes every active construct', () => {
  for (const [name, html] of Object.entries(ACTIVE)) {
    test(name, () => {
      expect(active(html)).not.toEqual([]); // the corpus is active before
      expect(active(passive(html))).toEqual([]);
    });
  }

  test('a document carrying the active corpus renders passive, its text kept', async () => {
    const src = Object.entries(ACTIVE).map(([k, v]) => `## ${k}\n\n${v}\n\ntext-${k}\n`).join('\n');
    const { html } = await render(src, ctx);
    expect(active(html)).toEqual([]);
    for (const k of Object.keys(ACTIVE)) expect(html).toContain(`text-${k}`);
  });

  test('a document data attribute is dropped; the renderer set is kept', () => {
    expect(passive('<span data-x="1" data-line="3" data-hash="ab" data-qa="q">x</span>')).toBe('<span data-line="3" data-hash="ab" data-qa="q">x</span>');
  });
});

describe('passive formatting survives', () => {
  test('a table, details, kbd, task boxes, Q&A radio and checkbox options, buttons, images and links', () => {
    const html = [
      '<table><thead><tr><th style="text-align:right" colspan="2">h</th></tr></thead><tbody><tr><td rowspan="1">1</td></tr></tbody></table>',
      '<details open><summary>s</summary><p>x <kbd>Ctrl</kbd> <mark>m</mark> <del>d</del> <ins>i</ins></p></details>',
      '<input type="checkbox" checked disabled class="task" data-line="4" /><input type="radio" name="q1" checked /><input type="checkbox" name="q2" />',
      '<button type="button" class="qa-btn" data-tip="agree">✓</button><span role="button" aria-label="x" tabindex="0">y</span>',
      '<img src="/api/raw?p=r/a.png" alt="a" width="10" loading="lazy" /><a href="https://example.com/x?y=1#z">e</a><a href="/r/b.md#c" class="md-local-link">l</a><a href="mailto:a@b.c">m</a><a href="#top">t</a>',
      '<p style="color:#c00;background-color:rgb(1, 2, 3);font-weight:700;font-style:italic;text-decoration:underline">s</p>',
      '<video src="/api/raw?p=r/a.mp4" controls></video><audio src="https://example.com/a.ogg" controls></audio>',
    ].join('\n');
    expect(passive(html)).toBe(html);
  });

  test('button is always a plain button', () => {
    expect(passive('<button>x</button>')).toBe('<button type="button">x</button>');
    expect(passive('<button type="submit">x</button>')).toBe('<button type="button">x</button>');
  });

  test('Shiki output, a highlighted file and a diff hunk keep their lines, ids and colours', async () => {
    const code = '```ts\nconst a: number = 1 // c\n```\n';
    const { html } = await render(code, ctx);
    expect(html).toContain('--shiki-light:');
    expect(html).toContain('--shiki-dark:');
    const file = await highlightFile('const a = 1\nlet b = "<script>"\n', 'ts');
    expect(file).toContain('id="L1" data-line="1"');
    expect(file).toContain('id="L2" data-line="2"');
    expect(file).toContain('&lt;script&gt;');
    expect(active(file)).toEqual([]);
    const [hunk] = markupHunks([{ header: '@@', lines: [{ kind: 'add', text: '    - **b** <img src=x onerror=alert(1)>', old: null, new: 1 }] } as never]);
    const line = (hunk as unknown as { lines: { html: string }[] }).lines[0]!.html;
    expect(line).toContain('style="padding-left:4ch"');
    expect(line).toContain('<strong>b</strong>');
    expect(active(line)).toEqual([]);
  });

  test('the shipped docs render exactly as before, apart from comments', async () => {
    const root = resolve(import.meta.dir, '..');
    for (const f of ['test/fixtures/qa-playground.md', 'doc/syntax.md', 'doc/markdown.md', 'doc/qa.md', 'doc/skills/glyphs.md']) {
      const { html } = await render(readFileSync(join(root, f), 'utf8'), ctx);
      expect(passive(html)).toBe(html); // already passive: a second pass changes nothing
      expect(active(html)).toEqual([]);
    }
    const playground = (await render(readFileSync(join(root, 'test/fixtures/qa-playground.md'), 'utf8'), ctx)).html;
    const inputs = elements(playground).filter((e) => e.name === 'input').map((e) => e.attribs!.type);
    expect(inputs).toContain('radio');
    expect(inputs).toContain('checkbox');
    expect(playground).toMatch(/<li [^>]*data-qa="[^"]+"/);
    expect(playground).toMatch(/data-hash="[0-9a-f]+"/);
    expect(playground).toMatch(/<button [^>]*type="button"/);
  });
});

test('the server sends passive HTML for a document and a file; raw HTML runs no script; the page has a CSP', async () => {
  const { Registry } = await import('../src/lib/roots');
  const { Prefs } = await import('../src/lib/prefs');
  const { serve } = await import('../src/server');
  const dir = await mkdtemp(join(tmpdir(), 'mdhouse-passive-'));
  const evil = '# e\n\n<img src="x.png" onerror="fetch(\'/api/settings\')">\n\n<iframe srcdoc="<script>1</script>"></iframe>\n';
  await writeFile(join(dir, 'e.md'), evil);
  await writeFile(join(dir, 'e.html'), '<script>1</script><img src=x onerror=alert(1)>');
  const port = testPort(61786);
  const { server, watcher, control } = await serve({
    registry: await Registry.create([dir]),
    prefs: await Prefs.load(join(dir, 'prefs.json')),
    port,
    hostname: '127.0.0.1',
    noGit: true,
  });
  try {
    const at = (p: string) => fetch(`http://127.0.0.1:${port}${p}`);
    const root = (await (await at('/api/roots')).json()).roots[0].id;
    const doc = (await (await at(`/api/doc?p=${root}/e.md`)).json()) as { html: string };
    expect(active(doc.html)).toEqual([]);
    expect(doc.html).toContain('<img src="/api/raw');
    const file = (await (await at(`/api/doc?p=${root}/e.html`)).json()) as { html: string };
    expect(active(file.html)).toEqual([]);
    expect(file.html).toMatch(/&lt;<\/span><span [^>]*>script</);
    const raw = await at(`/api/raw?p=${root}/e.html`);
    expect(raw.headers.get('content-security-policy')).toBe('sandbox');
    const page = await at('/');
    const csp = page.headers.get('content-security-policy') ?? '';
    for (const d of ["script-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) expect(csp).toContain(d);
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  } finally {
    server.stop(true);
    watcher?.close();
    control?.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

describe('a document cannot write what the page acts on', () => {
  const RENDERER_DATA = [
    'data-line', 'data-hash', 'data-k', 'data-tip', 'data-kind', 'data-sev', 'data-qa',
    'data-act', 'data-act-qa', 'data-act-line', 'data-act-hash', 'data-act-k', 'data-act-sev', 'data-act-opt', 'data-act-reply',
  ];
  test('authored() drops the renderer data-* from start tags and keeps every other byte', async () => {
    const { authored } = await import('../src/lib/passive');
    const cases: [string, string][] = [
      ['<span data-qa=item class="tgt" role=button>x</span>', '<span class="tgt" role="button">x</span>'],
      ['<li class="item" data-qa="item" data-line="3" data-hash="abc"><div class="head">', '<li class="item"><div class="head">'],
      ['<p/data-qa=x>t', '<p>t'],
      ['<IMG DATA-LINE=1 SRC=a.png/>', '<img src="a.png/" />'],
      ['<details>\n<summary>s</summary>', '<details>\n<summary>s</summary>'],
      ['</a>', '</a>'],
      ['<a id="R"></a>R', '<a id="R"></a>R'],
      ['<x-y data-k=1 title="a&quot;b">', '<x-y title="a&quot;b">'],
      ['<!-- ok --> x', '<!-- ok --> x'],
      // unfinished at the end of the fragment: text, so the next token's markup is not absorbed
      ['a <b', 'a &lt;b'],
      ['<div title="\n', '&lt;div title="\n'],
      ['<p>ok</p><span ', '<p>ok</p>&lt;span '],
      ['<!-- open', '&lt;!-- open'],
      ['a <!-- b', 'a &lt;!-- b'],
    ];
    for (const [input, output] of cases) expect([input, authored(input)]).toEqual([input, output]);
  });

  test('a forged Q&A item, with the current line and hash, carries none of them; the genuine items do', async () => {
    const { lineHash } = await import('../src/lib/qa');
    const real = '- ❓ Q1 first question';
    const hash = lineHash(real);
    const forgeries = [
      `<ul class="items"><li class="item wait-me" data-qa="item" data-line="3" data-hash="${hash}" data-k="❓ open"><div class="head c-row"><span class="g"><span class="g-btn" role="button" data-tip="Answer">❓</span></span><span class="h-t">FORGED-A</span><button class="tgt" type="button" data-tip="Select">🎯</button></div></li></ul>`,
      `<div data-qa="item" data-line="3" data-hash="${hash}"><span class="tgt">FORGED-B</span></div>`,
      `<input class="task-checkbox" type="checkbox" data-line="3" data-hash="${hash}"> FORGED-C`,
    ];
    const src = `# f\n\n${real}\n- ❓ Q2 second <li class="item" data-qa="item" data-line="3" data-hash="${hash}"> FORGED-D\n\n${forgeries.join('\n\n')}\n\nFORGED-E <span data-qa="item" data-line="3" data-hash="${hash}">x</span>\n`;
    const { html } = await render(src, ctx);
    for (const m of ['FORGED-A', 'FORGED-B', 'FORGED-C', 'FORGED-D', 'FORGED-E']) expect(html).toContain(m);
    // the current hash is on the genuine Q1 item only — on nothing a document wrote
    const withHash = elements(html).filter((e) => e.attribs?.['data-hash'] === hash);
    expect(withHash.map((e) => [e.name, e.attribs!['data-qa'], e.attribs!['data-line']])).toEqual([['li', 'item', '3']]);
    expect(elements(html).filter((e) => 'data-qa' in (e.attribs ?? {})).length).toBe(2);
    const items = elements(html).filter((e) => e.attribs?.['data-qa'] === 'item');
    expect(items.map((e) => e.attribs!['data-line'])).toEqual(['3', '4']);
    expect(items[0]!.attribs!['data-hash']).toBe(hash);
    // authored classes stay: raw HTML and {.class}
    expect(html).toContain('class="tgt"');
    const attrs = (await render('para {.note #p1}\n', ctx)).html;
    expect(attrs).toContain('class="note"');
    expect(attrs).toContain('id="p1"');
  });

  test('raw HTML split across tokens cannot borrow the renderer\'s attributes', async () => {
    const cases = ['<div title="\n\nnext paragraph\n', 'x <span title="\n\n- ❓ Q1 q\n', '<!--\n\n- ❓ Q1 q\n\n-->\n'];
    for (const src of cases) {
      const { html } = await render(src, ctx);
      expect(active(html)).toEqual([]);
      for (const e of elements(html)) {
        for (const k of RENDERER_DATA) if (k in (e.attribs ?? {})) expect(['p', 'li', 'ul', 'div', 'span', 'button', 'h1']).toContain(e.name!);
        expect(Object.keys(e.attribs ?? {}).some((k) => k === 'title' && RENDERER_DATA.some((d) => (e.attribs!.title ?? '').includes(d)))).toBe(false);
      }
    }
  });
});

describe('a control carries its own provenance and target', () => {
  const ACT = ['data-act', 'data-act-qa', 'data-act-line', 'data-act-hash', 'data-act-k', 'data-act-sev', 'data-act-opt', 'data-act-reply'];
  const marked = (html: string, token: string) => elements(html).filter((e) => e.attribs?.['data-act'] === token);
  const anyAct = (html: string) => elements(html).filter((e) => Object.keys(e.attribs ?? {}).some((k) => k.startsWith('data-act')));
  const label = (e: El) => `${e.name}.${(e.attribs?.class ?? '').split(' ')[0]}`;
  /** Every marked control of a render, with what it acts on. */
  const controls = (html: string, token: string) =>
    marked(html, token).map((e) => [label(e), e.attribs!['data-act-line'], e.attribs!['data-act-opt'] ?? e.attribs!['data-act-reply'] ?? '']);

  test('a fresh 16-byte token per render', async () => {
    const a = await render('# T\n\n- ❓ q\n', ctx);
    const b = await render('# T\n\n- ❓ q\n', ctx);
    expect(a.actToken).toMatch(/^[0-9a-f]{32}$/);
    expect(b.actToken).toMatch(/^[0-9a-f]{32}$/);
    expect(a.actToken).not.toBe(b.actToken);
    // a page rendered before carries a token the new render does not know
    expect(marked(b.html, a.actToken)).toEqual([]);
    expect(marked(a.html, a.actToken).length).toBeGreaterThan(0);
  });

  test('the allowlist keeps exactly the provenance attributes', () => {
    const html = passive(`<span ${ACT.map((k) => `${k}="1"`).join(' ')} data-act-x="1" data-actx="1" data-act-="1" data-act-root="1">x</span>`);
    expect(Object.keys(elements(html)[0]!.attribs!).sort()).toEqual([...ACT].sort());
  });

  test('a document cannot write a token: raw HTML, any case, {attrs}', async () => {
    const forged = 'f'.repeat(32);
    const src = [
      `<button class="tgt" data-act="${forged}" data-act-line="3" data-act-hash="x">A</button>`,
      `<SPAN DATA-ACT="${forged}" Data-Act-Qa="item" data-act-opt="4" data-act-root="${forged}">B</SPAN>`,
      `<span/data-act=${forged}>C</span>`,
      `para D {data-act=${forged} data-act-line=3}`,
      `- ❓ Q <i data-act="${forged}" data-act-reply="9">E</i>`,
    ].join('\n\n');
    const { html, actToken } = await render(src + '\n', ctx);
    for (const m of 'ABCDE') expect(html).toContain(m);
    // a forged token survives only as text, never on an element
    expect(elements(html).some((e) => Object.values(e.attribs ?? {}).includes(forged))).toBe(false);
    // only the genuine item's controls are marked, all with this render's token
    expect(anyAct(html).every((e) => e.attribs!['data-act'] === actToken)).toBe(true);
    expect(new Set(marked(html, actToken).map((e) => e.attribs!['data-act-line']))).toEqual(new Set(['9']));
  });

  test('every generated control, and only those, is marked with its own item, option and reply', async () => {
    const src = [
      '# Head', '', '- [ ] task', '',
      '- ❓ Q1 pick', '  - [ ] one', '  - [ ] two', '    > 💬 👤a why', '  > 💬 👾 plain', '  > 💡 👾 proposal', '',
      '- ❓ Q2 radio', '  - ( ) a', '  - ( ) b', '',
      '- 🎯 🔴 F1 finding', '  - ❓ nested', '',
      '- ❓ asked', '  > 💬 👤a yes', '',
      '## Sub', '', '> - [ ] quoted task', '',
    ].join('\n');
    const { html, actToken } = await render(src, ctx);
    expect(anyAct(html).length).toBe(marked(html, actToken).length);
    const got = controls(html, actToken);
    // headings, the task box and every Q&A control — each names its own line
    expect(got.filter(([l]) => /^h\d/.test(l!))).toEqual([['h1.', '1', ''], ['h2.', '22', '']]);
    expect(got.filter(([l]) => l === 'input.task-checkbox')).toEqual([['input.task-checkbox', '3', ''], ['input.task-checkbox', '24', '']]);
    const q1 = got.filter(([, line]) => line === '5');
    expect(q1).toEqual([
      ['li.item', '5', ''], ['span.g-btn', '5', ''], ['button.c-done', '5', ''], ['button.c-btn', '5', ''], ['button.tgt', '5', ''],
      ['input.', '5', '6'], ['button.c-btn', '5', '6'], ['input.', '5', '7'], ['button.c-btn', '5', '7'], ['div.reply', '5', '8'],
      ['div.reply', '5', '9'], ['button.accept', '5', '10'], ['button.reject', '5', '10'], ['button.s-reply', '5', '10'],
    ]);
    expect(got.filter(([, line]) => line === '12').map(([l, , t]) => `${l}${t}`)).toEqual([
      'li.item', 'span.g-btn', 'button.c-btn', 'button.tgt', 'input.13', 'button.c-btn13', 'input.14', 'button.c-btn14',
    ]);
    // the nested item's controls name the nested item, not the finding around it
    expect(got.filter(([, line]) => line === '16').map(([l]) => l)).toEqual(['li.item', 'span.g-btn', 'button.tgt']);
    expect(got.filter(([, line]) => line === '17').map(([l]) => l)).toEqual(['li.item', 'span.g-btn', 'button.tgt']);
    expect(got.filter(([, line]) => line === '19').map(([l, , t]) => `${l}${t}`)).toEqual(['span.g', 'button.tgt', 'div.reply20']); // span.g.g-answered
    // each control's item context is the item's own
    for (const e of marked(html, actToken).filter((e) => e.attribs!['data-act-qa'])) {
      const item = elements(html).find((i) => i.name === 'li' && i.attribs?.['data-qa'] && i.attribs['data-line'] === e.attribs!['data-act-line'])!;
      expect([e.attribs!['data-act-hash'], e.attribs!['data-act-k'], e.attribs!['data-act-sev'], e.attribs!['data-act-qa']])
        .toEqual([item.attribs!['data-hash'], item.attribs!['data-k'], item.attribs!['data-sev'], item.attribs!['data-qa']]);
    }
    // options and replies name the line the page targets
    for (const e of marked(html, actToken).filter((e) => e.attribs!['data-act-reply']))
      expect(e.attribs!['data-act-reply']).toMatch(/^(8|9|10|20)$/);
  });

  test('a genuine control moved into authored or malformed markup still names its own item', async () => {
    const hostile = [
      '<li class="item" data-qa="item" data-line="3"><ul>',
      '</li></ul></div><div class="item">',
      '<details><summary>',
      '<span class="s-act"><button class="accept">',
      '<div class="c-wrap" data-line="4"><label>',
    ];
    for (const h of hostile) {
      const src = `- ❓ Q1 first\n  - [ ] keep\n\n- ❓ Q2 ${h} second\n  > 💬 👾 r\n`;
      const { html, actToken } = await render(src, ctx);
      const got = controls(html, actToken);
      // no control acts on another item or option than the one it was made for
      expect([h, got.filter(([, line]) => line === '1').map(([l, , t]) => `${l}${t}`)]).toEqual([h, ['li.item', 'span.g-btn', 'button.c-done', 'button.c-btn', 'button.tgt', 'input.2', 'button.c-btn2']]);
      expect([h, got.filter(([, line]) => line === '4').map(([l, , t]) => `${l}${t}`)]).toEqual([h, ['li.item', 'span.g-btn', 'button.tgt', 'div.reply5']]);
      expect(got.every(([, line]) => line === '1' || line === '4')).toBe(true);
    }
  });

  test('nested renders mark nothing: Markdown inside a reply, a diff, a highlighted file', async () => {
    const src = '- ❓ Q\n  > 💬 👾 para one\n  >\n  > - ❓ inner\n  > - [ ] inner task\n  >\n  > # inner head\n';
    const { html, actToken } = await render(src, ctx);
    expect(new Set(marked(html, actToken).map((e) => e.attribs!['data-act-line']))).toEqual(new Set(['1']));
    expect(anyAct(await highlightFile('<b data-act="x">', 'html'))).toEqual([]);
    const hunks = markupHunks([{ heading: '', b: 1, lines: [{ kind: '+', text: '- ❓ q' }, { kind: '+', text: '# h' }] }] as never);
    expect(JSON.stringify(hunks)).not.toContain('data-act');
  });
});

test('inline style keeps only allowed declarations: comments, escapes, case, duplicates, mixes', () => {
  const cases: [string, string][] = [
    ['color:red/*x*/;font-weight:bold', 'color:red;font-weight:bold'],
    ['color:red !important', 'color:red !important'],
    ['col\\6fr:red', ''],
    ['COLOR:Red', ''],
    ['color:red;color:url(x)', 'color:red'],
    ['color:red;position:fixed;font-style:italic', 'color:red;font-style:italic'],
    ['color:expression(alert(1))', ''],
  ];
  for (const [style, kept] of cases) {
    const out = passive(`<p style="${style}">a</p>`);
    expect([style, out]).toEqual([style, kept ? `<p style="${kept}">a</p>` : '<p>a</p>']);
  }
});

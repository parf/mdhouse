import { describe, expect, test } from 'bun:test';
import { breadcrumb, highlight, lineLabel, parseRagUrl, progress, queryTerms, ragUrl, resultGlyph, shellWord, stateOf, syncCommand } from '../src/ui/rag-model';

describe('the page address', () => {
  test('q and root go in the query; an empty part is left out', () => {
    expect(ragUrl({})).toBe('/rag');
    expect(ragUrl({ root: 'notes' })).toBe('/rag?root=notes');
    expect(ragUrl({ q: 'agent bus & more', root: 'a b' })).toBe('/rag?q=agent+bus+%26+more&root=a+b');
  });
  test('and read back, a query trimmed', () => {
    expect(parseRagUrl('?q=%20plan%20&root=notes')).toEqual({ q: 'plan', root: 'notes' });
    expect(parseRagUrl('')).toEqual({ q: '', root: '' });
    expect(parseRagUrl(ragUrl({ q: 'agent bus & more', root: 'a b' }).slice(4))).toEqual({ q: 'agent bus & more', root: 'a b' });
  });
});

describe('highlighting a query in text', () => {
  const runs = (text: string, q: string) => highlight(text, q).map((r) => (r.hit ? `[${r.text}]` : r.text)).join('');
  test('every occurrence of a word, any case, as runs of the original text', () => {
    expect(runs('The Agent bus: agent-bus and BUS', 'agent bus')).toBe('The [Agent] [bus]: [agent]-[bus] and [BUS]');
  });
  test('no match, or an empty query: one plain run', () => {
    expect(highlight('plain', 'zzz')).toEqual([{ text: 'plain', hit: false }]);
    expect(highlight('plain', '')).toEqual([{ text: 'plain', hit: false }]);
  });
  test('a longer word wins over a shorter one inside it; one-letter words only when alone', () => {
    expect(queryTerms('bus a business')).toEqual(['business', 'bus']);
    expect(queryTerms('a')).toEqual(['a']);
    expect(runs('a bus', 'a bus')).toBe('a [bus]');
  });
  test('markup in the text stays text and regex characters in the query are literal', () => {
    expect(runs('<b>x.*</b> x', 'x.*')).toBe('<b>[x.*]</b> x');
    expect(highlight('<img src=x onerror=alert(1)>', 'img').map((r) => r.text).join('')).toBe('<img src=x onerror=alert(1)>');
  });

  test('a character whose lower case is longer shifts nothing: marks sit on the matched words', () => {
    expect(runs('İstanbul word İİ word', 'word')).toBe('İstanbul [word] İİ [word]');
    expect(runs('İ Straße STRASSE', 'straße')).toBe('İ [Straße] STRASSE');
  });
});

describe('labels', () => {
  test('result glyphs lead a status: done, partial, failed, unknown, not run, anything else', () => {
    expect(['confirmed', 'incomplete', 'failed', 'unknown', 'notsent', 'weird'].map(resultGlyph)).toEqual(['✅', '⚠️', '❌', '❓', '⛔', '❓']);
  });
  test('progress is confirmed over every file, empty when the run did not say', () => {
    expect(progress({ confirmed: 12, remaining: 3 })).toBe('12/15');
    expect(progress({ confirmed: 185, remaining: 0 })).toBe('185/185');
    expect(progress({ confirmed: null, remaining: 3 })).toBe('');
  });
  test('lines and the heading breadcrumb', () => {
    expect(lineLabel([5, 6])).toBe('lines 5–6');
    expect(lineLabel([5, 5])).toBe('line 5');
    expect(lineLabel(undefined)).toBe('');
    expect(breadcrumb(['A', 'B', 'C'])).toBe('A › B › C');
    expect(breadcrumb([])).toBe('');
    expect(breadcrumb(undefined)).toBe('');
  });
});

describe('the sync command', () => {
  test('the folder is filled in and quoted only when it needs it; the names stay placeholders', () => {
    expect(syncCommand('/home/me/notes')).toBe(
      "mdhouse-rag-sync sync --root /home/me/notes --filescan '#filescan/<name>@<host>' --rag '#rag/<name>@<host>' --namespace <ns> --table <table> --apply --until-done",
    );
    expect(syncCommand('/home/me/my notes')).toContain("--root '/home/me/my notes' ");
  });
  test('a quote in the path cannot end the word', () => {
    expect(shellWord("/a/it's")).toBe("'/a/it'\\''s'");
    expect(shellWord('/a/$(x)')).toBe("'/a/$(x)'");
    expect(shellWord('/a/b;c')).toBe("'/a/b;c'");
  });
});

describe('what the page shows', () => {
  const on = { enabled: true, source: { sid: 'n/m', namespace: 'n', table: 'm' } };
  test('in order: failed read, loading, off, error, not indexed, indexed', () => {
    expect(stateOf(null, 'down')).toBe('error');
    expect(stateOf(null, null)).toBe('loading');
    expect(stateOf({ enabled: false }, null)).toBe('off');
    expect(stateOf({ enabled: true, error: 'the agent bus is unreachable' }, null)).toBe('error');
    expect(stateOf({ enabled: true, source: null }, null)).toBe('unindexed');
    expect(stateOf(on, null)).toBe('indexed');
  });
});

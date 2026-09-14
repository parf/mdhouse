import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { searchContent, searchInProcess } from '../src/lib/search';
import type { MdFile } from '../src/lib/scan';

let dir: string;
let files: MdFile[];

const FIXTURES: Record<string, string> = {
  'plain.md': 'first line\nowner2_name appears here\nlast line\n',
  // The reason this file exists: ripgrep reports offsets in bytes, so a multi-byte prefix
  // used to slide the highlight off the match.
  'cyrillic.md': 'Владелец owner2_name берётся из sidecar\nещё строка\n',
  'many.md': Array.from({ length: 5 }, (_, i) => `line ${i} owner2_name`).join('\n') + '\n',
};

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mdhouse-search-'));
  files = [];
  for (const [name, body] of Object.entries(FIXTURES)) {
    await Bun.write(join(dir, name), body);
    files.push({ rel: name, name, dir: '', mtime: Date.now(), size: body.length });
  }
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('content search', () => {
  test('finds matches with line numbers', async () => {
    const { hits } = await searchContent(dir, files, 'owner2_name');
    expect(hits.length).toBeGreaterThanOrEqual(7);

    const plain = hits.find((h) => h.rel === 'plain.md');
    expect(plain?.line).toBe(2);
  });

  test('highlight ranges land on the match, even after multi-byte text', async () => {
    const { hits } = await searchContent(dir, files, 'owner2_name');
    for (const hit of hits) {
      expect(hit.ranges.length).toBeGreaterThan(0);
      for (const [start, end] of hit.ranges) {
        expect(hit.text.slice(start, end)).toBe('owner2_name');
      }
    }
  });

  test('the in-process fallback agrees with ripgrep', async () => {
    const viaRg = await searchContent(dir, files, 'owner2_name');
    const viaScan = await searchInProcess(dir, files, 'owner2_name', {});

    expect(viaRg.degraded).toBe(false);
    expect(viaScan.degraded).toBe(true);

    const shape = (r: { hits: Array<{ rel: string; line: number }> }) =>
      r.hits.map((h) => `${h.rel}:${h.line}`).sort();
    expect(shape(viaScan)).toEqual(shape(viaRg));
  });

  test('the fallback highlights multi-byte lines correctly too', async () => {
    const { hits } = await searchInProcess(dir, files, 'Владелец', {});
    expect(hits).toHaveLength(1);
    expect(hits[0]!.rel).toBe('cyrillic.md');
    expect(hits[0]!.text.slice(...(hits[0]!.ranges[0] as [number, number]))).toBe('Владелец');
  });

  test('an empty query returns nothing rather than everything', async () => {
    const { hits } = await searchContent(dir, files, '   ');
    expect(hits).toHaveLength(0);
  });

  test('plain queries are literal, not regex', async () => {
    const { hits } = await searchContent(dir, files, 'owner2_name.');
    expect(hits).toHaveLength(0);
  });
});

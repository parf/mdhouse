import { describe, expect, test } from 'bun:test';
import { inGitDir, kindOf, langOf } from '../src/lib/filetypes';

describe('kindOf — how a file is shown', () => {
  test('by its name', () => {
    expect(kindOf('a/README.md')).toBe('md');
    expect(kindOf('x.mdx')).toBe('md');
    expect(kindOf('src/cli.ts')).toBe('code');
    expect(kindOf('Dockerfile')).toBe('code');
    expect(kindOf('notes.txt')).toBe('text');
    expect(kindOf('page.HTML')).toBe('html');
    expect(kindOf('logo.png')).toBe('image');
    expect(kindOf('logo.svg')).toBe('image');
    expect(kindOf('doc.pdf')).toBe('pdf');
    expect(kindOf('clip.webm')).toBe('video');
    expect(kindOf('song.mp3')).toBe('audio');
  });

  test('a name that says nothing: text without a NUL in its first bytes, else binary', () => {
    expect(kindOf('LICENSE', new TextEncoder().encode('MIT\n'))).toBe('text');
    expect(kindOf('blob.dat', new Uint8Array([1, 0, 2]))).toBe('binary');
    expect(kindOf('blob.dat')).toBe('binary');
  });
});

describe('langOf — the Shiki language', () => {
  test('shiki ids and aliases by extension', () => {
    expect(langOf('a.ts')).toBe('ts');
    expect(langOf('a.py')).toBe('py');
    expect(langOf('run.sh')).toBe('sh');
    expect(langOf('c.yml')).toBe('yml');
    expect(langOf('d.json')).toBe('json');
    expect(langOf('main.go')).toBe('go');
  });

  test('names and extensions shiki does not know', () => {
    expect(langOf('Dockerfile')).toBe('dockerfile');
    expect(langOf('docker/Dockerfile.dev')).toBe('dockerfile');
    expect(langOf('Makefile')).toBe('makefile');
    expect(langOf('x.h')).toBe('c');
    expect(langOf('nginx.conf')).toBe('ini');
    expect(langOf('.env')).toBe('dotenv');
  });

  test('none', () => {
    expect(langOf('LICENSE')).toBeNull();
    expect(langOf('notes.txt')).toBeNull();
    expect(langOf('blob.dat')).toBeNull();
    expect(langOf('.gitignore')).toBeNull();
  });
});

test('inGitDir — a path inside a .git folder', () => {
  expect(inGitDir('.git/config')).toBe(true);
  expect(inGitDir('sub/.git/HEAD')).toBe(true);
  expect(inGitDir('.gitignore')).toBe(false);
  expect(inGitDir('a.git/x')).toBe(false);
});

/** What a file is, and how its page shows it — shared by the server's routes and the folder page. */

import { bundledLanguages } from 'shiki';

export const MD_EXT = /\.mdx?$/i;
export const HTML_EXT = /\.html?$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|ico|bmp)$/i;
const VIDEO_EXT = /\.(mp4|webm|ogv|mov|m4v)$/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|flac|opus|aac)$/i;
const TEXT_EXT = /\.(txt|text)$/i;

/** How a file's page shows it. */
export type Kind = 'md' | 'code' | 'text' | 'image' | 'pdf' | 'html' | 'video' | 'audio' | 'binary';

/** Whole file names shiki does not know by their extension. */
const BY_NAME: Record<string, string> = {
  dockerfile: 'dockerfile',
  containerfile: 'dockerfile',
  makefile: 'makefile',
  gnumakefile: 'makefile',
  'cmakelists.txt': 'cmake',
  justfile: 'just',
  '.env': 'dotenv',
  '.bashrc': 'bash',
  '.bash_profile': 'bash',
  '.profile': 'bash',
  '.zshrc': 'zsh',
  '.gitconfig': 'ini',
  '.editorconfig': 'ini',
};

/** Extensions shiki does not know, to the language that reads them. */
const BY_EXT: Record<string, string> = {
  h: 'c',
  hpp: 'cpp',
  hh: 'cpp',
  conf: 'ini',
  cfg: 'ini',
  service: 'ini',
  desktop: 'ini',
  env: 'dotenv',
  htm: 'html',
  patch: 'diff',
  pl: 'perl',
  ex: 'elixir',
  exs: 'elixir',
  ml: 'ocaml',
  bib: 'bibtex',
};

/** The Shiki language for a file, by its name or extension — null when none reads it. */
export function langOf(rel: string): string | null {
  const name = (rel.split('/').pop() ?? '').toLowerCase();
  if (BY_NAME[name]) return BY_NAME[name];
  if (name.startsWith('dockerfile.') || name.endsWith('.dockerfile')) return 'dockerfile';
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return null;
  const ext = name.slice(dot + 1);
  return BY_EXT[ext] ?? (Object.hasOwn(bundledLanguages, ext) ? ext : null);
}

/**
 * How a file's page shows it, by its name. A name that says nothing is `text` when `head` (its
 * first 8 kB) has no NUL byte, else `binary`.
 */
export function kindOf(rel: string, head?: Uint8Array): Kind {
  if (MD_EXT.test(rel)) return 'md';
  if (HTML_EXT.test(rel)) return 'html';
  if (IMAGE_EXT.test(rel)) return 'image';
  if (/\.pdf$/i.test(rel)) return 'pdf';
  if (VIDEO_EXT.test(rel)) return 'video';
  if (AUDIO_EXT.test(rel)) return 'audio';
  if (langOf(rel)) return 'code';
  if (TEXT_EXT.test(rel)) return 'text';
  return head && !head.includes(0) ? 'text' : 'binary';
}

/** A path inside a `.git` folder: remote URLs and credentials live there — never shown. */
export const inGitDir = (rel: string): boolean => rel.split('/').includes('.git');

import { useEffect, useMemo, useState } from 'preact/hooks';
import type { TreePayload, FileEntry } from '../lib/store';
import { IconClock } from './icons';
import { api } from './api';
import { docName, fileSize, likeMatcher } from './format';
import { Ago } from './Ago';
import { Dir } from './Home';
import { sizeClass, SizeMark } from './Tree';
import { PageHead } from './PageHead';

type Sort = 'new' | 'az';

const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
const LS_SORT = 'mdhouse.dirSort';
const FILTER_HELP = [
  'Matches anywhere, ignoring case: LIKE \'%text%\'',
  '^text   starts with text',
  'text$   ends with text',
  '%       any run of characters, e.g.  rlm%metrics',
  '_       exactly one character',
  'Esc clears the box.',
].join('\n');

/** Past this many files a folder page grows filter boxes. */
const FILTER_FROM = 50;

interface Props {
  tree: TreePayload | null;
  /** Root-relative folder, '' for the root itself. */
  dir: string;
  onOpen: (rel: string) => void;
  /** A folder's page url, root-relative dir. */
  dirUrl: (dir: string) => string;
  go: (url: string) => void;
  onAbout?: () => void;
  gear?: preact.ComponentChildren;
  rootId: string;
}

const loadSort = (): Sort => {
  try {
    return localStorage.getItem(LS_SORT) === 'az' ? 'az' : 'new';
  } catch {
    return 'new';
  }
};

/**
 * A folder's own page: every Markdown file beneath it, in one table — `ls -lR` for documents.
 *
 * Newest first by default, since a folder is usually opened to see what moved in it; A–Z reads
 * it as a tree instead. Either way a run of files from the same subfolder names that folder
 * once, in a cell spanning the run, the same as the front page does.
 *
 * Built from the tree the sidebar already holds, so it costs no request and follows live
 * changes with it.
 */
export function DirPage({ tree, dir, onOpen, dirUrl, go, onAbout, gear, rootId }: Props) {
  const [inRepo, setInRepo] = useState(false);
  useEffect(() => {
    let live = true;
    setInRepo(false);
    api
      .git(`${rootId}/${dir}`)
      .then(() => live && setInRepo(true))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [rootId, dir]);
  const [sort, setSort] = useState<Sort>(loadSort);
  const pick = (s: Sort) => {
    setSort(s);
    try {
      localStorage.setItem(LS_SORT, s);
    } catch {
      /* a per-viewer convenience; fine without it */
    }
  };

  // Two filters, one per column; they start empty on every folder.
  const [dirQuery, setDirQuery] = useState('');
  const [nameQuery, setNameQuery] = useState('');
  useEffect(() => {
    setDirQuery('');
    setNameQuery('');
  }, [dir]);

  const all = useMemo(
    () => (tree?.files ?? []).filter((f) => f.size > 0 && (!dir || f.rel.startsWith(`${dir}/`))),
    [tree, dir],
  );
  const filterable = all.length > FILTER_FROM;

  const files = useMemo(() => {
    const dirOk = likeMatcher(filterable ? dirQuery : '');
    const nameOk = likeMatcher(filterable ? nameQuery : '');
    const under = all.filter((f) => dirOk(dir ? f.dir.slice(dir.length + 1) : f.dir) && nameOk(docName(f.name)));
    return sort === 'new'
      ? under.sort((a, b) => b.mtime - a.mtime)
      : // ls -lR order: folder first, then name — a folder's own files before its subfolders',
        // which comparing whole paths gets wrong (`infra/colo/x` sorts before `infra/y`).
        under.sort((a, b) => cmp(a.dir, b.dir) || cmp(a.name, b.name));
  }, [all, dir, sort, filterable, dirQuery, nameQuery]);

  const total = files.reduce((n, f) => n + f.size, 0);

  // Where each file sits relative to this page's folder; '' for the folder itself.
  const sub = (f: FileEntry) => (f.dir === dir ? '' : dir ? f.dir.slice(dir.length + 1) : f.dir);

  return (
    <div class="home dir-page">
      <PageHead
        rootName={tree?.root.name ?? ''}
        dir={dir}
        dirUrl={dirUrl(dir)}
        crumbUrl={dirUrl}
        view={null}
        repo={inRepo}
        go={go}
        onAbout={onAbout}
        gear={gear}
      />

      <div class="dir-meta">
        <span>
          {files.length !== all.length && `${files.length} of `}
          {all.length} {all.length === 1 ? 'file' : 'files'} · {fileSize(total)}
        </span>
      </div>

      {!tree ? (
        <div class="spinner" />
      ) : !all.length ? (
        <p class="empty">No Markdown files here.</p>
      ) : (
        <table class="home-table dir-table">
          {/* The header row: a filter over each of the first two columns once there are enough
              files to need one, and the order switch over the age column it orders by. */}
          <thead>
            <tr class="filter-row">
              <td class="dir">
                {filterable && <FilterBox value={dirQuery} onInput={setDirQuery} placeholder="filter folder" />}
              </td>
              <td class="name">
                {filterable && (
                  <div class="filter-with-help">
                    <FilterBox value={nameQuery} onInput={setNameQuery} placeholder="filter filename" />
                    {/* Its own popup rather than a title attribute: a native tooltip waits a second
                        or two, and is easy to miss entirely. */}
                    <span class="filter-help" tabIndex={0} aria-label={FILTER_HELP}>
                      i
                      <span class="tip" role="tooltip">
                        {FILTER_HELP}
                      </span>
                    </span>
                  </div>
                )}
              </td>
              <td class="when">
                <button
                  class="sort-flip"
                  onClick={() => pick(sort === 'new' ? 'az' : 'new')}
                  title={sort === 'new' ? 'Newest first — click for A–Z' : 'A–Z, folder by folder — click for newest first'}
                >
                  {sort === 'new' ? (
                    <>
                      <IconClock size={11} /> Newest
                    </>
                  ) : (
                    'A–Z'
                  )}
                </button>
              </td>
              <td class="size" />
            </tr>
          </thead>
          <tbody>
            {!files.length && (
              <tr>
                <td colSpan={4} class="none">
                  Nothing matches.
                </td>
              </tr>
            )}
            {files.map((f, i) => {
              const at = sub(f);
              // A run of files from one subfolder names it once, in a cell spanning the run.
              let span = 0;
              if (i === 0 || sub(files[i - 1]!) !== at) {
                span = 1;
                while (i + span < files.length && sub(files[i + span]!) === at) span++;
              }
              const small = sizeClass(f.size);
              const muted = f.marks?.includes('muted');
              return (
                <tr
                  key={f.rel}
                  class={`file${small ? ` ${small}` : ''}${muted ? ' muted' : ''}`}
                  onClick={() => onOpen(f.rel)}
                  title={f.rel}
                >
                  {span > 0 && (
                    <td class="dir" rowSpan={span}>
                      {at ? (
                        <button
                          class="dir-link"
                          onClick={(e) => {
                            e.stopPropagation();
                            go(dirUrl(dir ? `${dir}/${at}` : at));
                          }}
                          title={`Open ${dir ? `${dir}/${at}` : at}/`}
                        >
                          <Dir dir={at} />
                        </button>
                      ) : (
                        <span class="dir-path root">./</span>
                      )}
                    </td>
                  )}
                  <td class="name">
                    <span class="link">{docName(f.name)}</span>
                    {small === 'tiny' && <SizeMark size={f.size} />}
                  </td>
                  <td class="when">
                    <Ago at={f.mtime} />
                  </td>
                  <td class={`size${small === 'small' ? ' small' : ''}`}>{fileSize(f.size)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** One column's filter. Esc clears it. */
function FilterBox({
  value,
  onInput,
  placeholder,
}: {
  value: string;
  onInput: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      class="col-filter"
      type="search"
      value={value}
      placeholder={placeholder}
      title={FILTER_HELP}
      spellcheck={false}
      onInput={(e) => onInput((e.target as HTMLInputElement).value)}
      onKeyDown={(e) => e.key === 'Escape' && onInput('')}
    />
  );
}

import { useEffect, useState } from 'preact/hooks';
import { api, GitRefusal, type GitCommit, type GitInfo, type RemoteState } from './api';
import { Ago } from './Ago';

/** Where a repo file opens: here when it is Markdown under the root, else on its host, else nowhere. */
type Target = { rel: string } | { href: string } | null;

export function targetOf(info: GitInfo, path: string, sha: string | undefined): Target {
  const prefix = info.rootRel ? `${info.rootRel}/` : '';
  if (/\.mdx?$/i.test(path) && path.startsWith(prefix)) return { rel: path.slice(prefix.length) };
  if (!info.origin || !sha) return null;
  return { href: info.origin.blob.replace('{sha}', sha).replace('{path}', path.split('/').map(encodeURIComponent).join('/')) };
}

function FileLink({ info, path, sha, onOpen, label }: { info: GitInfo; path: string; sha?: string; onOpen: (rel: string) => void; label?: string }) {
  const t = targetOf(info, path, sha);
  const text = label ?? path;
  if (!t) return <span class="git-file plain">{text}</span>;
  if ('href' in t) {
    return (
      <a class="git-file ext" href={t.href} target="_blank" rel="noopener noreferrer" title={`On ${info.origin?.kind === 'guess' ? 'its host (a possible url)' : info.origin?.kind}`}>
        {text}
      </a>
    );
  }
  return (
    <a
      class="git-file"
      href="#"
      onClick={(e) => {
        e.preventDefault();
        onOpen(t.rel);
      }}
    >
      {text}
    </a>
  );
}

const REMOTE_TEXT: Record<RemoteState['state'], (r: RemoteState) => string> = {
  same: () => 'up to date with origin',
  ahead: (r) => `ahead of origin by ${r.ahead} — not pushed`,
  behind: (r) => `origin is ${r.behind} commit${r.behind === 1 ? '' : 's'} ahead — pull`,
  new: () => 'origin has new commits — pull',
  diverged: (r) => `diverged: ${r.ahead} here, ${r.behind} on origin`,
  none: (r) => r.message ?? 'no origin',
};

/** The repo on its host, and an on-demand look at whether origin moved — ls-remote, no fetch. */
export function RemoteBar({ p, info }: { p: string; info: GitInfo }) {
  const [remote, setRemote] = useState<RemoteState | 'checking' | null>(null);
  useEffect(() => setRemote(null), [p]);
  return (
    <div class="git-remote">
      {info.origin && (
        <a href={info.origin.web} target="_blank" rel="noopener noreferrer" class="git-origin">
          {info.origin.web.replace(/^https:\/\//, '')} ↗
        </a>
      )}
      <button
        class="git-btn"
        disabled={remote === 'checking'}
        onClick={async () => {
          setRemote('checking');
          setRemote(await api.gitRemote(p).catch((e) => ({ state: 'none' as const, message: (e as Error).message })));
        }}
        title="Ask origin for its branch head — read-only, nothing is fetched"
      >
        Check remote
      </button>
      {remote && remote !== 'checking' && <span class={`git-remote-state ${remote.state}`}>{REMOTE_TEXT[remote.state](remote)}</span>}
      {remote === 'checking' && <span class="git-remote-state">asking origin…</span>}
    </div>
  );
}

/**
 * Commit, pull and push, in a writable folder. Commit is `git commit -a`: the files it takes are
 * listed first, and any that is not Markdown has to be ticked. Pull and push with uncommitted
 * files ask first, and only go when those are all Markdown.
 */
export function GitActions({ p, info, onDone }: { p: string; info: GitInfo; onDone: () => void }) {
  const files = info.dirty.filter((f) => f.code !== '??');
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(info.commitMessage);
  const [nonMd, setNonMd] = useState(false);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState<{ text: string; ok?: boolean } | null>(null);
  const [confirm, setConfirm] = useState<{ action: 'pull' | 'push'; files: GitInfo['dirty'] } | null>(null);
  const hasNonMd = files.some((f) => !f.md);

  useEffect(() => setMessage((m) => m || info.commitMessage), [info.commitMessage]);

  const sync = async (action: 'pull' | 'push', confirmed: boolean) => {
    setBusy(action);
    setNote(null);
    setConfirm(null);
    try {
      const r = await api.gitSync(p, action, confirmed);
      setNote({ text: r.output || `${action} done`, ok: true });
      onDone();
    } catch (e) {
      if (e instanceof GitRefusal && e.confirm) setConfirm({ action, files: e.files });
      else setNote({ text: (e as Error).message });
    } finally {
      setBusy('');
    }
  };

  const commit = async () => {
    setBusy('commit');
    setNote(null);
    try {
      const r = await api.gitCommit(p, message, files.map((f) => f.path), nonMd);
      setNote({ text: r.output.split('\n')[0] ?? 'committed', ok: true });
      setOpen(false);
      setMessage('');
      setNonMd(false);
      onDone();
    } catch (e) {
      setNote({ text: (e as Error).message });
      onDone();
    } finally {
      setBusy('');
    }
  };

  return (
    <div class="git-actions">
      <div class="git-buttons">
        <button class="git-btn" disabled={!files.length || !!busy} onClick={() => setOpen((o) => !o)} title="git commit -a">
          Commit{files.length ? ` (${files.length})` : ''}
        </button>
        <button class="git-btn" disabled={!!busy} onClick={() => void sync('pull', false)} title="git pull --ff-only">
          {busy === 'pull' ? 'Pulling…' : 'Pull'}
        </button>
        <button class="git-btn" disabled={!!busy} onClick={() => void sync('push', false)} title="git push">
          {busy === 'push' ? 'Pushing…' : 'Push'}
        </button>
      </div>

      {confirm && (
        <div class="git-confirm">
          <b>You have uncommitted files</b>
          <ul>
            {confirm.files.map((f) => (
              <li key={f.path}>
                <code>{f.code.trim() || 'M'}</code> {f.path}
              </li>
            ))}
          </ul>
          <button class="git-btn" onClick={() => void sync(confirm.action, true)}>
            {confirm.action === 'pull' ? 'Pull' : 'Push'} anyway
          </button>
          <button class="git-btn quiet" onClick={() => setConfirm(null)}>
            Cancel
          </button>
        </div>
      )}

      {open && (
        <div class="git-commit">
          <p class="git-commit-head">
            <code>git commit -a</code> takes:
          </p>
          <ul>
            {files.map((f) => (
              <li key={f.path} class={f.md ? '' : 'non-md'}>
                <code>{f.code.trim() || 'M'}</code> {f.path}
              </li>
            ))}
          </ul>
          {hasNonMd && (
            <label class="git-nonmd">
              <input type="checkbox" checked={nonMd} onChange={(e) => setNonMd((e.target as HTMLInputElement).checked)} /> Commit the files that
              are not Markdown too
            </label>
          )}
          <input
            class="git-message"
            value={message}
            placeholder="Commit message"
            onInput={(e) => setMessage((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && message.trim() && (!hasNonMd || nonMd)) void commit();
              if (e.key === 'Escape') setOpen(false);
            }}
            ref={(el) => el?.focus()}
          />
          <button class="git-btn primary" disabled={!message.trim() || (hasNonMd && !nonMd) || !!busy} onClick={() => void commit()}>
            {busy === 'commit' ? 'Committing…' : 'Commit'}
          </button>
        </div>
      )}

      {note && <pre class={note.ok ? 'git-note ok' : 'git-note'}>{note.text}</pre>}
    </div>
  );
}

/** Every commit that touched the folder, any file type; a click shows its files. */
export function CommitsView({ p, info, onOpen, revision }: { p: string; info: GitInfo; onOpen: (rel: string) => void; revision: number }) {
  const [commits, setCommits] = useState<GitCommit[] | null>(null);
  const [more, setMore] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    let live = true;
    void api.gitCommits(p).then((r) => {
      if (!live) return;
      setCommits(r.commits);
      setMore(r.commits.length === 50);
    });
    return () => {
      live = false;
    };
  }, [p, revision]);

  if (!commits) return <div class="spinner" />;
  if (!commits.length) return <p class="empty">No commits here yet.</p>;
  const prefix = info.dir ? `${info.dir}/` : '';
  return (
    <div class="git-commits">
      {commits.map((c) => {
        const shown = open.has(c.hash);
        return (
          <div class="git-commit-row" key={c.hash}>
            <button
              class="git-commit-line"
              aria-expanded={shown}
              onClick={() =>
                setOpen((s) => {
                  const n = new Set(s);
                  n.has(c.hash) ? n.delete(c.hash) : n.add(c.hash);
                  return n;
                })
              }
            >
              <span class="subject">{c.subject}</span>
              <span class="count">{c.files.length}</span>
              <span class="when">
                <Ago at={c.date} />
              </span>
              <span class="who">{c.author}</span>
            </button>
            {info.origin ? (
              <a class="sha" href={info.origin.commit.replace('{sha}', c.hash)} target="_blank" rel="noopener noreferrer" title="On its host">
                {c.hash.slice(0, 8)}
              </a>
            ) : (
              <span class="sha">{c.hash.slice(0, 8)}</span>
            )}
            {shown && (
              <ul class="git-commit-files">
                {c.files.map((f) => (
                  <li key={f.path}>
                    <code class={`st st-${f.status}`}>{f.status}</code>{' '}
                    {f.status === 'D' ? (
                      <span class="git-file plain">{f.path.slice(prefix.length) || f.path}</span>
                    ) : (
                      <FileLink info={info} path={f.path} sha={c.hash} onOpen={onOpen} label={f.path.startsWith(prefix) ? f.path.slice(prefix.length) : f.path} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {more && (
        <button
          class="git-btn more"
          onClick={async () => {
            const r = await api.gitCommits(p, commits.length);
            setCommits([...commits, ...r.commits]);
            setMore(r.commits.length === 50);
          }}
        >
          More
        </button>
      )}
    </div>
  );
}

/** Every file git tracks under the folder: Markdown opens here, the rest on its host. */
export function FilesView({ p, info, onOpen, revision }: { p: string; info: GitInfo; onOpen: (rel: string) => void; revision: number }) {
  const [files, setFiles] = useState<string[] | null>(null);
  useEffect(() => {
    let live = true;
    void api.gitFiles(p).then((r) => live && setFiles(r.files));
    return () => {
      live = false;
    };
  }, [p, revision]);
  if (!files) return <div class="spinner" />;
  if (!files.length) return <p class="empty">git tracks no files here.</p>;
  const prefix = info.dir ? `${info.dir}/` : '';
  const sha = info.head?.commit?.hash;
  let lastDir = '\0';
  return (
    <ul class="git-files">
      {files.map((path) => {
        const rel = path.slice(prefix.length);
        const cut = rel.lastIndexOf('/');
        const dir = cut < 0 ? '' : rel.slice(0, cut);
        const head = dir !== lastDir;
        lastDir = dir;
        return (
          <li key={path} class={head ? 'first' : ''}>
            <span class="git-dir">{head ? (dir ? `${dir}/` : '') : ''}</span>
            <FileLink info={info} path={path} sha={sha} onOpen={onOpen} label={rel.slice(cut + 1)} />
          </li>
        );
      })}
    </ul>
  );
}

import { useEffect, useRef, useState } from 'preact/hooks';
import { api, GitRefusal, type GitInfo } from './api';
import type { FileDiff } from '../lib/git';
import { Diff } from './Diff';
import { follow } from './PageHead';
import { changeOf, changeSummary, commitLabel, initialTicks } from './git-state';

const GLYPH = { modified: 'M', added: 'A', deleted: 'D', untracked: 'U' } as const;

/** A refusal in words: what the server said when it is one line, else a plain sentence (git's own text stays in the title). */
const refusalWords = (e: unknown, fallback: string): { text: string; detail?: string } => {
  const msg = e instanceof Error ? e.message : '';
  if (e instanceof GitRefusal && e.status < 500 && msg && !msg.includes('\n')) return { text: msg };
  return { text: fallback, detail: msg || undefined };
};

/**
 * One project's uncommitted files, in one place: each with its state and diff, a tick (untracked
 * files start unticked), a message, and a button that says what it commits. Push is its own step,
 * shown only when the branch has a remote. Scoped to one file (`file`, root-relative) from a
 * document's status chip. Read-only (`writable` false, a Viewer): files and diffs, no commit.
 */
export function Changes(props: {
  p: string;
  rootId: string;
  info: GitInfo;
  file: string | null;
  writable: boolean;
  fileUrl: (rel: string) => string;
  onOpen: (rel: string) => void;
  /** The project-wide Changes URL, and the app's navigation for it. */
  allUrl: string;
  go: (url: string) => void;
  onDone: () => void;
}) {
  const { info, writable } = props;
  const prefix = info.rootRel ? `${info.rootRel}/` : '';
  const scoped = props.file === null ? null : prefix + props.file;
  const dirty = scoped === null ? info.dirty : info.dirty.filter((f) => f.path === scoped);
  const summary = changeSummary(info.dirty);
  const [ticked, setTicked] = useState(() => initialTicks(info.dirty, scoped));
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const going = useRef(false);
  const [note, setNote] = useState<{ text: string; ok?: boolean; detail?: string } | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set(scoped ? [scoped] : []));

  // A file that is no longer changed loses its tick; the scope's file keeps its own.
  useEffect(() => {
    setTicked((t) => new Set([...t].filter((p) => info.dirty.some((f) => f.path === p))));
  }, [info.dirty]);

  const chosen = dirty.filter((f) => ticked.has(f.path));
  const label = commitLabel(chosen.map((f) => f.path));
  const suggested = chosen.length === 1 ? `Update ${chosen[0]!.path.split('/').pop()}` : '';

  const toggle = (path: string) =>
    setTicked((t) => {
      const n = new Set(t);
      if (n.has(path)) n.delete(path);
      else n.add(path);
      return n;
    });

  const commit = async () => {
    const text = (message.trim() || suggested).trim();
    if (!chosen.length || !text || going.current) return;
    going.current = true;
    setBusy('commit');
    setNote(null);
    try {
      await api.gitCommitFiles(props.p, text, chosen.map((f) => ({ path: f.path, code: f.code })));
      setNote({ text: `${label!.replace('Commit', 'Committed')}.`, ok: true });
      setMessage('');
    } catch (e) {
      setNote(refusalWords(e, 'git could not commit — see the details, or commit in a terminal'));
    } finally {
      going.current = false;
      setBusy('');
      props.onDone();
    }
  };

  // Push: only when the branch has an upstream; the count is what it holds that the upstream lacks.
  const hasRemote = !!info.sync?.upstream;
  const ahead = info.sync?.ahead ?? 0;
  const push = async (confirmed = false) => {
    if (going.current) return;
    going.current = true;
    setBusy('push');
    setNote(null);
    try {
      await api.gitSync(props.p, 'push', confirmed);
      setNote({ text: 'Pushed.', ok: true });
    } catch (e) {
      if (e instanceof GitRefusal && e.confirm) setNote({ text: 'Uncommitted files stay on this machine — push the commits anyway?', detail: 'confirm' });
      else setNote(refusalWords(e, 'git could not push — check the remote in a terminal'));
    } finally {
      going.current = false;
      setBusy('');
      props.onDone();
    }
  };

  return (
    <section class="changes">
      <h2>
        {scoped === null ? 'Changes' : 'Changes — this file'} <span class="n">{scoped === null ? summary.label : `${dirty.length ? '1 change' : 'No changes'}`}</span>
        {scoped !== null && (
          <a class="changes-all" href={props.allUrl} onClick={(e) => follow(e, () => props.go(props.allUrl))}>
            All changes ({summary.total})
          </a>
        )}
      </h2>
      {!dirty.length && <p class="empty">Nothing to commit — every file matches the last commit.</p>}
      <ul class="changes-list">
        {dirty.map((f) => {
          const change = changeOf(f.code);
          const rel = f.path.startsWith(prefix) ? f.path.slice(prefix.length) : null;
          const shown = open.has(f.path);
          return (
            <li key={f.path} class={`change ch-${change}`}>
              <div class="change-row">
                {writable && (
                  <label class="change-tick">
                    <input type="checkbox" checked={ticked.has(f.path)} onChange={() => toggle(f.path)} aria-label={`Include ${f.path}`} />
                  </label>
                )}
                <span class={`tag ch-${change}`} title={change}>
                  {GLYPH[change]} <span class="word">{change}</span>
                </span>
                {rel !== null && change !== 'deleted' ? (
                  <a class="change-path" href={props.fileUrl(rel)} onClick={(e) => follow(e, () => props.onOpen(rel))}>
                    {rel}
                  </a>
                ) : (
                  <span class="change-path" title={rel === null ? 'outside this project' : undefined}>
                    {rel ?? f.path}
                  </span>
                )}
                {rel !== null && change !== 'deleted' && (
                  <button
                    type="button"
                    class="change-diff-btn"
                    aria-expanded={shown}
                    onClick={() =>
                      setOpen((o) => {
                        const n = new Set(o);
                        if (n.has(f.path)) n.delete(f.path);
                        else n.add(f.path);
                        return n;
                      })
                    }
                  >
                    {shown ? 'Hide diff' : 'Diff'}
                  </button>
                )}
              </div>
              {shown && rel !== null && change !== 'deleted' && <FileDiffView p={`${props.rootId}/${rel}`} code={f.code} />}
            </li>
          );
        })}
      </ul>

      {writable && dirty.length > 0 && (
        <div class="changes-commit">
          <textarea
            class="changes-message"
            rows={2}
            value={message}
            placeholder={suggested || 'Commit message'}
            aria-label="Commit message"
            onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void commit();
            }}
          />
          <button type="button" class="git-btn primary changes-commit-btn" disabled={!label || !(message.trim() || suggested) || !!busy} onClick={() => void commit()}>
            {busy === 'commit' ? 'Committing…' : (label ?? 'Tick a file to commit')}
          </button>
        </div>
      )}

      {writable && (
        <div class="changes-push">
          {hasRemote ? (
            <button type="button" class="git-btn" disabled={!!busy || ahead === 0} onClick={() => void push()} title={ahead === 0 ? 'Nothing to push' : undefined}>
              {busy === 'push' ? 'Pushing…' : ahead > 0 ? `Push ${ahead} commit${ahead === 1 ? '' : 's'}` : 'Nothing to push'}
            </button>
          ) : (
            <span class="settings-hint">No remote branch — commits stay on this machine.</span>
          )}
        </div>
      )}

      {note && (
        <p class={note.ok ? 'git-note ok' : 'git-note'} title={note.detail && note.detail !== 'confirm' ? note.detail : undefined}>
          {note.text}{' '}
          {note.detail === 'confirm' && (
            <button type="button" class="git-btn" onClick={() => void push(true)}>
              Push anyway
            </button>
          )}
        </p>
      )}
    </section>
  );
}

/** One file's uncommitted diff, loaded when shown; a newer file replaces an older answer. */
function FileDiffView({ p, code }: { p: string; code: string }) {
  const [diff, setDiff] = useState<FileDiff | null>(null);
  useEffect(() => {
    let live = true;
    setDiff(null);
    api.diff(p).then(
      (d) => live && setDiff(d),
      () => live && setDiff({ kind: 'none', added: 0, removed: 0, hunks: [], truncated: false }),
    );
    return () => {
      live = false;
    };
  }, [p, code]);
  return (
    <div class="change-diff">
      <Diff diff={diff} loading={!diff} />
    </div>
  );
}

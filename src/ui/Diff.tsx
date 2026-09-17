import type { FileDiff } from '../lib/git';
import { Ago } from './Ago';

/**
 * A unified diff, in the colours everyone already reads diffs in.
 *
 * Two gutters rather than one: the old line number and the new one, as GitHub and `git
 * diff --color-moved` show them, because "which line is this now" and "which line was it
 * before" are different questions and a Markdown document answers both badly from context.
 */
export function Diff({ diff, loading }: { diff: FileDiff | null; loading: boolean }) {
  if (loading || !diff) return <div class="spinner" />;

  if (diff.kind === 'none') {
    return <p class="empty">Not in a git repository — there is nothing to compare against.</p>;
  }
  if (!diff.hunks.length) {
    return <p class="empty">No changes: this file is exactly as it was committed.</p>;
  }

  return (
    <div class="diff">
      <DiffHead diff={diff} />

      {diff.hunks.map((hunk, i) => (
        <table class="diff-hunk" key={i}>
          <tbody>
            {/* The band git writes the `@@` on: it marks the lines skipped to get here, so it
                is drawn only where lines actually were skipped — never above a hunk that
                starts at the top of the file. Git's heading rides along when it named one. */}
            {(i > 0 || (hunk.lines[0]?.a ?? 1) > 1 || (hunk.lines[0]?.b ?? 1) > 1) && (
              <tr class="hunk-head">
                <td colSpan={3} class="ln" title="lines unchanged and not shown">
                  ⋯
                </td>
                <td class="code">{hunk.heading}</td>
              </tr>
            )}
            {hunk.lines.map((line, n) => (
              <tr key={n} class={line.t === '+' ? 'add' : line.t === '-' ? 'del' : 'ctx'}>
                <td class="ln">{line.a ?? ''}</td>
                <td class="ln">{line.b ?? ''}</td>
                <td class="sign">{line.t === ' ' ? '' : line.t}</td>
                {/* The line with its Markdown rendered, by the same renderer the document
                    uses. The gutters and the sign column stay as they are — they are the
                    patch, not the text. An empty line still has to occupy one. */}
                {line.html ? (
                  <td class="code md-line" dangerouslySetInnerHTML={{ __html: line.html }} />
                ) : (
                  <td class="code">{line.text || '\u00a0'}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      ))}

      {diff.truncated && <p class="empty">The rest of this diff is too long to show.</p>}
    </div>
  );
}

/**
 * What is being compared, and by how much. Shared with the marked-up document view, which
 * needs the same sentence above a page that otherwise looks like any other document.
 */
export function DiffHead({ diff, children }: { diff: FileDiff; children?: preact.ComponentChildren }) {
  return (
    <div class="diff-head">
      <Label diff={diff} />
      {children}
      <span class="churn">
        {diff.added > 0 && <span class="plus">+{diff.added}</span>}
        {diff.removed > 0 && <span class="minus">−{diff.removed}</span>}
      </span>
    </div>
  );
}

/** What is being compared, in words. */
function Label({ diff }: { diff: FileDiff }) {
  if (diff.kind === 'working') {
    return (
      <span>
        <b>Uncommitted changes</b> <span class="sep">·</span> your working copy against the last commit
      </span>
    );
  }
  if (diff.kind === 'new') {
    return (
      <span>
        <b>Not committed yet</b> <span class="sep">·</span> git has never seen this file
      </span>
    );
  }
  const rev = diff.rev;
  if (!rev) return <span>Last commit</span>;
  return (
    <span>
      <b>{rev.subject}</b>
      <span class="sep">·</span>
      <code>{rev.hash.slice(0, 8)}</code>
      <span class="sep">·</span>
      {rev.author}
      <span class="sep">·</span>
      <Ago at={rev.date} flame={false} />
    </span>
  );
}

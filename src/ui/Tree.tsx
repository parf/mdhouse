import type { Node, DirNode, FileNode } from './tree-model';
import type { Mark } from '../lib/prefs';
import { IconChevron, IconFolder, IconStar, IconMute } from './icons';
import { docName, fileSize, shortAgo } from './format';
import { Ago, RecentHeat } from './Ago';
import { follow } from './PageHead';

interface Props {
  nodes: Node[];
  expanded: Set<string>;
  current: string | null;
  compact: boolean;
  onToggleDir: (path: string) => void;
  /** Open a folder's own page — the count badge on its row. */
  onOpenDirPage: (path: string) => void;
  onOpen: (path: string) => void;
  /** A document's URL, for the row's link. */
  fileUrl: (path: string) => string;
  onMark: (path: string, mark: Mark, on: boolean) => void;
}

const STATUS_LABEL: Record<string, string> = {
  modified: 'M',
  untracked: 'U',
  staged: 'S',
  deleted: 'D',
};

/** Files this small are stubs, or close to it, and are marked at the end of their row. */
export const sizeClass = (size: number) => (size < 101 ? 'tiny' : size < 500 ? 'small' : '');

/**
 * ∅ for a file under 101 bytes; the size itself, in violet, for one under 500; nothing for
 * anything bigger. The struck-through name already says "small" — an S tile beside it only
 * said it twice, where the number says how small. ∅ stays: it means "stub", which a number
 * does not.
 */
export function SizeMark({ size, end }: { size: number | undefined; end?: boolean }) {
  const small = size ? sizeClass(size) : '';
  if (!small) return null;
  if (small === 'small') {
    return (
      <span class={`size-num small${end ? ' end' : ''}`} title={`${size} bytes`}>
        {size}
      </span>
    );
  }
  return (
    <span class={`size-mark tiny${end ? ' end' : ''}`} title={`${size} B`} aria-label={`${size} bytes`}>
      ∅
    </span>
  );
}

function Row({ node, depth, ...p }: Props & { node: Node; depth: number }) {
  const indent = 8 + depth * 13;

  if (node.kind === 'dir') {
    const dir = node as DirNode;
    const open = p.expanded.has(dir.path);
    // An ancestor of the open document: bold, so the way down to it reads at a glance.
    const onPath = !!p.current?.startsWith(`${dir.path}/`);
    return (
      <>
        <button
          class={`row dir${onPath ? ' on-path' : ''}`}
          style={{ '--indent': `${indent}px` }}
          data-dir={dir.path}
          aria-current={p.current === `${dir.path}/` ? 'true' : undefined}
          onClick={() => p.onToggleDir(dir.path)}
          title={dir.path}
        >
          <span class="twist">
            <IconChevron size={12} open={open} />
          </span>
          <span class="ico">
            <IconFolder size={14} />
          </span>
          <span class="label">{dir.name}</span>
          {/* The name toggles the folder; the count opens its page, every file beneath it. A
              span, not a link: a row is a button, and a button cannot hold another control. */}
          {!open && (
            <span
              class="badge count"
              role="link"
              tabIndex={0}
              title={`Open ${dir.path}/ — all ${dir.count} files`}
              onClick={(e) => {
                e.stopPropagation();
                p.onOpenDirPage(dir.path);
              }}
              // Reachable from the keyboard too; the key must not also toggle the row around it.
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                e.stopPropagation();
                p.onOpenDirPage(dir.path);
              }}
            >
              {dir.count}
            </span>
          )}
        </button>
        {open && dir.children.map((child) => <Row key={child.path} {...p} node={child} depth={depth + 1} />)}
      </>
    );
  }

  const file = node as FileNode;
  const marks = file.file.marks ?? [];
  const isFav = marks.includes('favorite');
  const isMuted = marks.includes('muted');
  const status = file.file.status;
  const size = file.file.size;
  const small = sizeClass(size);

  return (
    <a
      class={`row file${isMuted ? ' muted' : ''}${isFav ? ' fav' : ''}${small ? ` ${small}` : ''}`}
      style={{ '--indent': `${indent}px` }}
      aria-current={p.current === file.path ? 'true' : undefined}
      href={p.fileUrl(file.path)}
      onClick={(e) => follow(e, () => p.onOpen(file.path))}
      title={`${file.path} · ${size < 1000 ? `${size} B` : fileSize(size)}`}
    >
      {/* No page icon: every row here is a Markdown file, so it would say nothing. A favourite's
          star sits in the chevron's slot, where it costs no width. */}
      <span class="twist">{isFav && <IconStar size={12} filled />}</span>
      <span class="label">{docName(file.name)}</span>
      {small === 'tiny' && <SizeMark size={size} end />}

      <RecentHeat at={file.file.mtime} />

      {status && (
        <span class={`badge ${status}`} title={status}>
          {STATUS_LABEL[status]}
        </span>
      )}

      {/* Compact has room for a size too, but not beside the ∅ mark, which already says it. */}
      {/* The open sidebar has room for when, as well as how big: the age, heat-coloured like
          every other age, just ahead of the size. */}
      {!p.compact && (
        <span class="badge age">
          <Ago at={file.file.mtime} flame={false} format={shortAgo} />
        </span>
      )}
      {(!p.compact || small !== 'tiny') && <span class={`badge size${small ? ` ${small}` : ''}`}>{fileSize(size)}</span>}

      {!p.compact && (
        <span class="marks">
          <MarkButton
            label={isFav ? 'Unfavorite' : 'Favorite'}
            on={isFav}
            onPress={() => p.onMark(file.path, 'favorite', !isFav)}
          >
            <IconStar size={12} filled={isFav} />
          </MarkButton>
          <MarkButton label={isMuted ? 'Unmute' : 'Mute'} on={isMuted} onPress={() => p.onMark(file.path, 'muted', !isMuted)}>
            <IconMute size={12} />
          </MarkButton>
        </span>
      )}
    </a>
  );
}

function MarkButton({
  label,
  on,
  onPress,
  children,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  children: preact.ComponentChildren;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      aria-pressed={on}
      // Inside the row's link: neither the row's handler nor the link's navigation.
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPress();
      }}
    >
      {children}
    </button>
  );
}

export function Tree(props: Props) {
  if (!props.nodes.length) return <p class="empty">No Markdown files here.</p>;
  return (
    <div class="tree">
      {props.nodes.map((node) => (
        <Row key={node.path} {...props} node={node} depth={0} />
      ))}
    </div>
  );
}

import type { Node, DirNode, FileNode } from './tree-model';
import type { Mark } from '../lib/prefs';
import { IconChevron, IconDoc, IconFolder, IconStar, IconMute, IconEyeOff } from './icons';
import { docName } from './format';
import { RecentHeat } from './Ago';

interface Props {
  nodes: Node[];
  expanded: Set<string>;
  current: string | null;
  compact: boolean;
  onToggleDir: (path: string) => void;
  onOpen: (path: string) => void;
  onMark: (path: string, mark: Mark, on: boolean) => void;
}

const STATUS_LABEL: Record<string, string> = {
  modified: 'M',
  untracked: 'U',
  staged: 'S',
  deleted: 'D',
};

function Row({ node, depth, ...p }: Props & { node: Node; depth: number }) {
  const indent = 8 + depth * 13;

  if (node.kind === 'dir') {
    const dir = node as DirNode;
    const open = p.expanded.has(dir.path);
    return (
      <>
        <button
          class="row dir"
          style={{ '--indent': `${indent}px` }}
          data-dir={dir.path}
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
          {!open && <span class="badge">{dir.count}</span>}
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

  return (
    <button
      class={`row file${isMuted ? ' muted' : ''}${isFav ? ' fav' : ''}`}
      style={{ '--indent': `${indent}px` }}
      aria-current={p.current === file.path ? 'true' : undefined}
      onClick={() => p.onOpen(file.path)}
      title={file.path}
    >
      <span class="twist" />
      <span class="ico">{isFav ? <IconStar size={14} filled /> : <IconDoc size={14} />}</span>
      <span class="label">{docName(file.name)}</span>

      <RecentHeat at={file.file.mtime} />

      {status && (
        <span class={`badge ${status}`} title={status}>
          {STATUS_LABEL[status]}
        </span>
      )}

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
          <MarkButton label="Ignore" on={false} onPress={() => p.onMark(file.path, 'ignored', true)}>
            <IconEyeOff size={12} />
          </MarkButton>
        </span>
      )}
    </button>
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
      onClick={(e) => {
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

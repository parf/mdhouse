import type { RootInfo } from './api';
import { rootLabel } from './format';
import { chooserLabels } from './project-groups';

/**
 * The project chooser, in every sidebar state. How much of each path it shows grows with the
 * room it has: the folder and its parent in the compact sidebar, two parents in the open one,
 * the whole path (home as `~`) in the full-width top bar left when the sidebar is off. A project
 * with its own name shows that name instead; the path stays in the tooltip.
 *
 * With one entry there is nothing to switch between and it renders nothing at all — the widget
 * appears exactly when it means something.
 */
export function RootSelect({
  roots,
  rootId,
  onPick,
  className,
  above = 1,
  max = 28,
  home,
}: {
  roots: RootInfo[];
  rootId: string;
  onPick: (id: string) => void;
  className?: string;
  /** Folders shown above each root's own, or the whole path. */
  above?: number | 'all';
  /** Longest label before its left end is cut. */
  max?: number;
  home?: string;
}) {
  if (roots.length < 2) return null;

  const current = roots.find((r) => r.id === rootId);
  const labels = chooserLabels(
    roots,
    (path) => rootLabel(path, { above, max, home }),
    (path) => rootLabel(path, { above: 'all', max: Infinity, home }),
  );
  return (
    <select
      class={`root-select${className ? ` ${className}` : ''}`}
      value={rootId}
      title={current ? `${current.path} — switch project` : 'Switch project'}
      aria-label="Switch project"
      onChange={(e) => onPick((e.target as HTMLSelectElement).value)}
    >
      {roots.map((r) => (
        <option key={r.id} value={r.id} title={r.path}>
          {labels.get(r.id)}
        </option>
      ))}
    </select>
  );
}

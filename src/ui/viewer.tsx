import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { RootInfo } from './api';
import { storedTitle, viewerAccessTag } from './project-groups';
import { IconEye } from './icons';
import { VIEWER_BADGE, VIEWER_TITLE } from './viewer-text';

/** Whether the instance is a Viewer — set once at the root of the app from the settings. */
export const ViewerContext = createContext(false);
export const useViewer = (): boolean => useContext(ViewerContext);

/**
 * The header badge that stands for every project's read-only state while the instance is a Viewer.
 * A phone's top strip shows the short form (eye + Viewer); the title carries the full words.
 */
export function ViewerBadge() {
  return (
    <span class="ro viewer-badge" title={`${VIEWER_BADGE}. ${VIEWER_TITLE}`}>
      <span class="vb-full">{VIEWER_BADGE}</span>
      <span class="vb-short" aria-hidden="true">
        <IconEye size={12} /> Viewer
      </span>
    </span>
  );
}

/** A Viewer's tag for a project stored as RW: gray, never a control. Nothing for any other project. */
export function StoredRwTag({ root, tag = false }: { root: RootInfo | undefined; tag?: boolean }) {
  const text = viewerAccessTag(root);
  return text && root ? (
    <span class={tag ? 'tag stored-rw' : 'stored-rw'} title={storedTitle(root)}>
      {text}
    </span>
  ) : null;
}

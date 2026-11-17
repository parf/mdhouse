import { RunFlow } from './FlowRun';
import { IconClock, IconDiff, IconDoc, IconGit, IconGitMark, IconStar, IconUser } from './icons';

export type HomeView = 'favorites' | 'recent' | 'mine' | 'changes' | 'commits' | 'files';

export const VIEWS: Array<{ id: HomeView; label: string; param: string; Icon: (p: { size?: number }) => preact.JSX.Element; git?: true }> = [
  { id: 'favorites', label: 'Favs', param: 'favs', Icon: (p) => <IconStar {...p} filled /> },
  { id: 'recent', label: 'Recent', param: '', Icon: IconClock },
  { id: 'mine', label: 'Mine', param: 'mine', Icon: IconUser },
  { id: 'changes', label: 'Changes', param: 'changes', Icon: IconDiff, git: true },
  { id: 'commits', label: 'Commits', param: 'commits', Icon: IconGit, git: true },
  { id: 'files', label: 'Files', param: 'files', Icon: IconDoc, git: true },
];

/** `?git` is Recent, `?git=favs` / `mine` / `changes` / `commits` / `files` the others; `changes` may add `&file=<root-relative path>`. */
export const viewOf = (search: string): HomeView =>
  VIEWS.find((v) => v.param && v.param === new URLSearchParams(search).get('git'))?.id ?? 'recent';
export const viewQuery = (id: HomeView) => {
  const param = VIEWS.find((v) => v.id === id)?.param;
  return param ? `?git=${param}` : '?git';
};

/** A link's click: a plain left click runs `run` in the app; a middle or modified click is the browser's (a new tab). */
export function follow(e: MouseEvent, run: () => void) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  run();
}

/** True for a click inside a link — a clickable row leaves those to the link. */
export const inLink = (e: MouseEvent) => !!(e.target as Element | null)?.closest('a');

/** A real link, so a middle click opens a tab; a plain click stays in the app. */
function Link(props: { href: string; go: (url: string) => void; class?: string; title?: string; role?: 'tab'; selected?: boolean; children: preact.ComponentChildren }) {
  return (
    <a
      class={props.class}
      href={props.href}
      title={props.title}
      role={props.role}
      aria-selected={props.role ? props.selected : undefined}
      onClick={(e) => follow(e, () => props.go(props.href))}
    >
      {props.children}
    </a>
  );
}

/**
 * GIT, then the git view's tabs, for the folder at `dirUrl` — the folder page's header, and a document's
 * title row for its project. `view` marks the open tab; null marks none.
 */
export function HeadTabs({ dirUrl, view, repo, go }: { dirUrl: string; view: HomeView | null; repo: boolean; go: (url: string) => void }) {
  return (
    <div class="tabs head-tabs" role="tablist">
      {repo && (
        <Link class="git-tab" role="tab" selected={view !== null} href={`${dirUrl}?git`} go={go} title="What changed here, by commit">
          <IconGitMark size={13} />
          <span>GIT</span>
        </Link>
      )}
      {/* Favs has no tab: `?git=favs` still opens, the sidebar's Favorites tab is where favorites live. */}
      {VIEWS.filter((v) => v.id !== 'favorites' && (!v.git || repo)).map(({ id, label, Icon }) => (
        <Link key={id} role="tab" selected={view === id} href={dirUrl + viewQuery(id)} go={go}>
          <Icon size={12} />
          <span>{label}</span>
        </Link>
      ))}
    </div>
  );
}

interface Props {
  /** The folder's root name, and its path in the root ('' for the root itself). */
  rootName: string;
  dir: string;
  /** The folder's page url, `/<rootId>/…/`; its git view is the same plus `?git`. */
  dirUrl: string;
  /** A parent folder's url, for the breadcrumbs — the same kind of page as this one. */
  crumbUrl: (dir: string) => string;
  /** The git view's current tab; null on the folder page. */
  view: HomeView | null;
  /** The folder is inside a repo: GIT, Commits and Files show. */
  repo: boolean;
  go: (url: string) => void;
  onAbout?: () => void;
  gear?: preact.ComponentChildren;
  /** The view chips on the title (`ViewChips`). */
  chips?: preact.ComponentChildren;
  /** The project's id: with it, the root's page offers Run flow. */
  rootId?: string;
  /** The root can be written: a flow run is a document in it. */
  writable?: boolean;
}

/**
 * The header of a folder's page and of its git view — one layout for both, so switching
 * between them moves nothing. The name leads to the other view; the tabs on the right are
 * GIT, then the git view's own tabs.
 */
export function PageHead({ rootName, dir, dirUrl, crumbUrl, view, repo, go, onAbout, gear, chips, rootId, writable }: Props) {
  const segments = dir ? dir.split('/') : [];
  const name = segments.at(-1) ?? rootName;
  const onGit = view !== null;
  return (
    <>
      {dir && (
        <nav class="crumbs head-crumbs">
          <Link class="crumb" href={crumbUrl('')} go={go}>
            {rootName}
          </Link>
          {segments.slice(0, -1).map((seg, i) => (
            <span key={i}>
              <span class="sep">/</span>
              <Link class="crumb" href={crumbUrl(segments.slice(0, i + 1).join('/'))} go={go}>
                {seg}
              </Link>
            </span>
          ))}
        </nav>
      )}
      <header class="home-head">
        <h1>
          <button class="mark" onClick={onAbout} title="About mdhouse" aria-label="About mdhouse" />
          {onGit || !repo ? (
            <Link class="head-name" href={dirUrl} go={go} title="Every file in this folder, as a list">
              {name}/
            </Link>
          ) : (
            <Link class="head-name" href={`${dirUrl}?git`} go={go} title="What changed here, by commit">
              {name}/
            </Link>
          )}
          {chips}
        </h1>
        <div class="head-right">
        <HeadTabs dirUrl={dirUrl} view={view} repo={repo} go={go} />
        {rootId && writable && !dir && repo && <RunFlow rootId={rootId} go={go} />}
        {gear}
        </div>
      </header>
    </>
  );
}

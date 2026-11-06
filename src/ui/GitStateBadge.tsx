import { GIT_STATE, gitStateOf } from './git-state';

/** The one badge for a file's Git state — short in rows, with the name in the title; `full` spells it out. */
export function GitStateBadge({ item, full }: { item: unknown; full?: boolean }) {
  const state = gitStateOf(item);
  if (!state) return null;
  const { name, short } = GIT_STATE[state];
  return (
    <span class={`git-badge git-${state}`} title={name} aria-label={name}>
      {full ? name : short}
    </span>
  );
}

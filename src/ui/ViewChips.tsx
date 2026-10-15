import { VIEW_IDS, type RootViews, type ViewId } from './views';

/**
 * On a page's title: `[V1]` for each view holding the page — a click takes it out — and, shown on
 * hover, `[+V2]` for each view that does not.
 */
export function ViewChips({ item, views, onToggle }: { item: string; views: RootViews; onToggle: (id: ViewId, item: string) => void }) {
  const holds = VIEW_IDS.filter((id) => views[id].includes(item));
  const adds = VIEW_IDS.filter((id) => !views[id].includes(item));
  return (
    <span class="view-chips">
      {holds.map((id) => (
        <button key={id} type="button" class="view-chip on" title={`In view ${id} — click to take it out`} onClick={() => onToggle(id, item)}>
          {id}
        </button>
      ))}
      {adds.length > 0 && (
        <span class="view-add">
          {adds.map((id) => (
            <button key={id} type="button" class="view-chip add" title={`Add to view ${id}`} onClick={() => onToggle(id, item)}>
              +{id}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

import { VIEW_IDS, type RootViews, type ViewId } from './views';
import { IconView } from './icons';

/**
 * On a page's title: the view's icon for each view holding the page — a click takes it out — and,
 * shown on hover, `+` and the icon for each view that does not.
 */
export function ViewChips({ item, views, onToggle }: { item: string; views: RootViews; onToggle: (id: ViewId, item: string) => void }) {
  const holds = VIEW_IDS.filter((id) => views[id].includes(item));
  const adds = VIEW_IDS.filter((id) => !views[id].includes(item));
  return (
    <span class="view-chips">
      {holds.map((id) => (
        <button key={id} type="button" class="view-chip on" title={`In view ${id} — click to take it out`} onClick={() => onToggle(id, item)}>
          <IconView n={id.slice(1)} size={15} />
        </button>
      ))}
      {adds.length > 0 && (
        <span class="view-add">
          {adds.map((id) => (
            <button key={id} type="button" class="view-chip add" title={`Add to view ${id}`} onClick={() => onToggle(id, item)}>
              +<IconView n={id.slice(1)} size={15} />
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

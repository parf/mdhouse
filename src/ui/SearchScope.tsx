import { TARGETS, type SearchTarget } from './search-scope';

/** `Files | Index`: the one switch on the sidebar's search box and on the `/rag` page. */
export function SearchScope({ value, onPick }: { value: SearchTarget; onPick: (target: SearchTarget) => void }) {
  return (
    <div class="scope-switch" role="group" aria-label="Search in">
      {TARGETS.map((t) => (
        <button key={t.id} type="button" class="scope-opt" aria-pressed={value === t.id} title={t.title} onClick={() => onPick(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

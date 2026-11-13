import { useEffect, useState } from 'preact/hooks';
import { IconBus, IconDoc, IconGit, IconSearch } from './icons';
import { NAV, changesUrl, currentNav, navItems, type NavId, type NavState } from './nav';
import { follow } from './PageHead';

const ICON: Record<NavId, (p: { size?: number }) => preact.JSX.Element> = { files: IconDoc, changes: IconGit, search: IconSearch, ask: IconBus };

interface Props extends NavState {
  rootId: string;
  go: (url: string) => void;
  onFiles: () => void;
  onSearch: () => void;
  onAsk: () => void;
}

/**
 * On a phone, the places you go: four labelled buttons at the thumb. Hidden while a text field has the keyboard, so it never
 * sits on it. The top strip's ☰ ⚙ stay; the R and the magnifier it had are these destinations now.
 */
export function PhoneNav(props: Props) {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const field = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input:not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable]');
    const on = (e: Event) => setTyping(field(e.target));
    const off = () => setTyping(false);
    addEventListener('focusin', on);
    addEventListener('focusout', off);
    return () => {
      removeEventListener('focusin', on);
      removeEventListener('focusout', off);
    };
  }, []);
  if (typing) return null;
  const ids = navItems(props);
  const current = currentNav(props);
  const href = changesUrl(props.rootId);
  return (
    <nav class="phone-nav" aria-label="Places">
      {NAV.filter((n) => ids.includes(n.id)).map(({ id, label, title }) => {
        const Icon = ICON[id];
        const inner = (
          <>
            <Icon size={20} />
            <span>{label}</span>
          </>
        );
        const cls = `nav-dest${current === id ? ' on' : ''}`;
        const aria = current === id ? ('page' as const) : undefined;
        if (id === 'changes')
          return (
            <a key={id} class={cls} href={href} title={title} aria-current={aria} onClick={(e) => follow(e, () => props.go(href))}>
              {inner}
            </a>
          );
        const act = id === 'files' ? props.onFiles : id === 'search' ? props.onSearch : props.onAsk;
        return (
          <button key={id} type="button" class={cls} title={title} aria-current={aria} onClick={act}>
            {inner}
          </button>
        );
      })}
    </nav>
  );
}

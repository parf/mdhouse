import { useEffect, useState } from 'preact/hooks';
import { api } from './api';
import { follow } from './PageHead';

type Why = 'name' | 'any-case' | 'similar';
interface Choice {
  rel: string;
  url: string;
  why: Why;
}
const WHY: Record<Why, string> = { name: 'same name', 'any-case': 'same name, other case', similar: 'similar name' };

/**
 * Where to go (`/<root>/?choose=<target>&from=<doc>#<heading>`): a link that names several pages, or none, lands
 * here — a page made for the moment, no file. The places it could mean, ranked by the server (`wikiCandidates`);
 * a click goes there, with the heading. None: it says so and offers the way back. Nothing is picked for you.
 */
export function ChoosePage(props: { rootId: string; rootName: string; target: string; from: string; go: (url: string) => void; backUrl: string; rootUrl: string; gear?: preact.ComponentChildren }) {
  const [got, setGot] = useState<{ exact?: { rel: string; url: string }; candidates: Choice[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hash = location.hash;
  useEffect(() => {
    let live = true;
    setGot(null);
    setError(null);
    api.choose(props.rootId, props.target, props.from).then(
      (r) => live && setGot(r),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [props.rootId, props.target, props.from]);

  const link = (url: string, text: preact.ComponentChildren) => (
    <a href={url + hash} onClick={(e) => follow(e, () => props.go(url + hash))}>
      {text}
    </a>
  );
  const many = (got?.candidates.length ?? 0) > 1;

  return (
    <div class="settings choose-page">
      <header class="home-head">
        <h1>Where to go?</h1>
        <span class="head-gear">{props.gear}</span>
      </header>
      <p class="settings-hint">
        {link(props.backUrl, '← Back')}
        {props.from && <> to <code>{props.from}</code></>}
      </p>
      <p>
        The link <code>{props.target}</code>
        {got?.exact ? ' names one page now:' : got ? (got.candidates.length ? (many ? ` could mean ${got.candidates.length} pages in ${props.rootName}:` : ' names no page; a similar one:') : ` names no page in ${props.rootName}.`) : ' …'}
      </p>
      {error && <p class="settings-error">{error}</p>}
      {!got && !error && <div class="spinner" />}
      {got?.exact && <p class="choose-exact">{link(got.exact.url, <code>{got.exact.rel}</code>)}</p>}
      {got && !got.exact && got.candidates.length > 0 && (
        <ol class="choose-list">
          {got.candidates.map((c) => (
            <li key={c.rel}>
              {link(c.url, <code>{c.rel}</code>)} <span class="choose-why">{WHY[c.why]}</span>
            </li>
          ))}
        </ol>
      )}
      {got && !got.exact && !got.candidates.length && (
        <p class="settings-hint">
          Nothing was created. Check the name in the document, or look in {link(props.rootUrl, props.rootName)}.
        </p>
      )}
    </div>
  );
}

/** Mermaid diagrams in rendered HTML, drawn in the browser by the constrained renderer as inert images. */
import { mermaidImage } from './mermaid-image';

/**
 * Mermaid is ~5 MB bundled, so it is deliberately kept out of the app bundle: the server
 * publishes mermaid's own ESM build under /vendor/mermaid/, and this import goes through a
 * variable so the bundler cannot resolve it statically and inline it. A document with no
 * diagram never pays for any of it.
 */
const MERMAID_URL = '/vendor/mermaid/mermaid.esm.min.mjs';
let mermaidModule: Promise<typeof import('mermaid')> | null = null;

let mermaidRenderId = 0;

/** Renders only blocks still owned by this live body generation after every async boundary. */
export async function renderMermaid(container: HTMLElement, current: () => boolean): Promise<void> {
  const blocks = container.querySelectorAll<HTMLElement>('pre.mermaid:not([data-rendered])');
  const belongs = (block: HTMLElement) => current() && container.isConnected && block.isConnected && container.contains(block);
  if (!blocks.length || !current()) return;
  const renderId = ++mermaidRenderId;
  const fail = (block: HTMLElement, source: string, error: unknown) => {
    if (!belongs(block)) return;
    block.dataset.rendered = 'error';
    block.title = String(error);
    block.textContent = `Unable to render diagram.\n${source}`;
  };

  try {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    mermaidModule ??= import(/* @vite-ignore */ MERMAID_URL) as Promise<typeof import('mermaid')>;
    const { default: mermaid } = await mermaidModule;
    if (!current() || !container.isConnected) return;
    mermaid.initialize({
      startOnLoad: false,
      theme: dark ? 'dark' : 'default',
      securityLevel: 'strict',
      // Directives in a diagram cannot change these.
      secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'suppressErrorRendering', 'maxEdges', 'theme', 'themeCSS', 'themeVariables', 'fontFamily', 'altFontFamily', 'dompurifyConfig'],
    });

    for (const [i, block] of blocks.entries()) {
      if (!belongs(block)) continue;
      const source = block.textContent ?? '';
      try {
        const { svg } = await mermaid.render(`mmd-${renderId}-${i}`, source);
        if (!belongs(block)) continue;
        const image = await mermaidImage(svg);
        if (!belongs(block)) continue;
        block.replaceChildren(image);
        block.dataset.rendered = '1';
      } catch (err) {
        fail(block, source, err);
      }
    }
  } catch (err) {
    for (const block of blocks) fail(block, block.textContent ?? '', err);
  }
}

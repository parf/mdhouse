/** Native-browser fixtures for the CTO's owned scratch proof; no DOM mocks or automatic launch. */
import { mermaidImage, mermaidSvgXml } from '../src/ui/mermaid-image';

const ns = 'http://www.w3.org/2000/svg';
const wrap = (label: string) => `<svg xmlns="${ns}" viewBox="0 0 320 100"><foreignObject width="320" height="100"><div xmlns="http://www.w3.org/1999/xhtml"><p>${label}</p></div></foreignObject></svg>`;

/** A minimal failing-shaped source; the full private owner diagram stays in CTO scratch. */
export const mermaidLabelFixture = `flowchart TB
  cto["CTO<br/>work split · overlaps · acceptance"]
  rg["Team<br>CEO · CTO · workers"]
  tester["Tester<br/>test runs"]
  cto --> rg --> tester`;

/** Invoke in the real browser after bundling; the caller owns process/probe lifecycle. */
export async function checkMermaidImages(probeUrl: string): Promise<string[]> {
  const passed: string[] = [];
  const assert = (ok: unknown, name: string) => { if (!ok) throw new Error(name); };
  for (const [name, label] of [['plain', 'ordinary text'], ['br', 'CTO<br>work split'], ['br-slash', 'Team<br/>workers']] as const) {
    const image = await mermaidImage(wrap(label));
    assert(image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0, name);
    const xml = decodeURIComponent(image.src.slice(image.src.indexOf(',') + 1));
    assert(!new DOMParser().parseFromString(xml, 'image/svg+xml').querySelector('parsererror'), `${name}-xml`);
    passed.push(name);
  }
  for (const svg of ['<svg', `<svg xmlns="urn:wrong" viewBox="0 0 10 10"/>`,
    `<svg xmlns="${ns}" viewBox="0 0 10 10"/><p>outside</p>`,
    `<svg xmlns="${ns}" viewBox="0 0 NaN 10"/>`,
    `<svg xmlns="${ns}" viewBox="0 0 10 10"><g unbound:value="x"/></svg>`]) {
    let rejected = false;
    try { mermaidSvgXml(svg); } catch { rejected = true; }
    assert(rejected, 'malformed-or-namespace-rejected');
  }
  passed.push('malformed-and-namespace');
  // Neither parsing the template nor decoding the SVG image may execute/fetch this authored data.
  const state = window as unknown as Record<string, unknown>;
  state.__mermaidImagePwned = false;
  const hostile = wrap(`<img src="${probeUrl}" onerror="window.__mermaidImagePwned=true"><br>untrusted`);
  const image = await mermaidImage(hostile);
  const box = document.createElement('div');
  try {
    box.append(image); document.body.append(box);
    assert(box.children.length === 1 && box.firstElementChild === image && !box.querySelector('svg,iframe,script'), 'img-only');
    assert(state.__mermaidImagePwned === false, 'no-handler');
  } finally { box.remove(); delete state.__mermaidImagePwned; }
  passed.push('hostile-output-img-only');
  return passed;
}

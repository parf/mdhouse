/** Converts controlled Mermaid output to XML without attaching its SVG/HTML tree to the page. */
const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_SVG = 2 * 1024 * 1024;

/** Normalizes HTML void elements in foreignObject through an inert template, then validates XML. */
export function mermaidSvgXml(svg: string): { xml: string; width: number; height: number } {
  if (typeof svg !== 'string' || !svg.trim() || svg.length > MAX_SVG || /<!DOCTYPE|<!ENTITY/i.test(svg)) {
    throw new Error('Invalid diagram SVG');
  }
  const template = document.createElement('template');
  template.innerHTML = svg;
  const roots = [...template.content.childNodes].filter((node) => node.nodeType !== Node.TEXT_NODE || !!node.textContent?.trim());
  const root = roots[0];
  if (roots.length !== 1 || !(root instanceof SVGElement) || root.localName !== 'svg'
    || root.namespaceURI !== SVG_NS || root.getAttribute('xmlns') !== SVG_NS) {
    throw new Error('Diagram must have one SVG root');
  }
  const xml = new XMLSerializer().serializeToString(root);
  if (xml.length > MAX_SVG) throw new Error('Diagram SVG is too large');
  const parsed = new DOMParser().parseFromString(xml, 'image/svg+xml');
  const checked = parsed.documentElement;
  if (parsed.doctype || parsed.getElementsByTagName('parsererror').length || checked.localName !== 'svg' || checked.namespaceURI !== SVG_NS) {
    throw new Error('Diagram SVG is not valid XML');
  }
  const raw = checked.getAttribute('viewBox')?.trim() ?? '';
  const parts = raw.split(/[\s,]+/);
  const number = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  const vb = parts.map(Number);
  if (parts.length !== 4 || parts.some((v) => !number.test(v)) || /,\s*,|^,|,$/.test(raw)
    || vb.some((v) => !Number.isFinite(v)) || vb[2]! <= 0 || vb[3]! <= 0
    || vb[2]! > 32768 || vb[3]! > 32768) {
    throw new Error('Diagram SVG has an invalid viewBox');
  }
  return { xml, width: Math.ceil(vb[2]!), height: Math.ceil(vb[3]!) };
}

/** Returns only a decoded inert image; template/SVG nodes never enter the live document. */
export async function mermaidImage(svg: string): Promise<HTMLImageElement> {
  const { xml, width, height } = mermaidSvgXml(svg);
  const img = new Image();
  img.alt = 'diagram';
  img.className = 'mermaid-img';
  img.width = width;
  img.height = height;
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      img.decode(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Diagram image did not decode')), 10000); }),
    ]);
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('Diagram image has no dimensions');
    return img;
  } catch (error) {
    img.removeAttribute('src');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

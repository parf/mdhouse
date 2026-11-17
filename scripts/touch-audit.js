(() => {
  const iw = innerWidth;
  const inClosed = (e) => { for (let d = e.parentElement?.closest('details:not([open])'); d; d = d.parentElement?.closest('details:not([open])')) { const sum = d.querySelector(':scope > summary'); if (!(sum && sum.contains(e))) return true; } return false; };
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !inClosed(e); };
  const sel = 'button, [role=button], a[href], input:not([type=hidden]), select, textarea, summary, [tabindex="0"], .cm-content';
  const name = (e) => (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + '.' + String(e.className).trim().split(/\s+/).slice(0, 3).join('.') + ' "' + (e.getAttribute('aria-label') || e.title || e.textContent || e.value || '').trim().slice(0, 24).replace(/\s+/g, ' ') + '"').slice(0, 90);
  const all = [...document.querySelectorAll(sel)].filter((e) => vis(e) && getComputedStyle(e).opacity !== '0');
  const inProse = (e) => e.tagName === 'A' && e.closest('.md') && !e.closest('.heading-actions, .qa-strip, .doc-actions, .rag-hit-head');
  const eff = (e) => { const r = e.getBoundingClientRect(); let w = r.width, h = r.height; const pa = getComputedStyle(e, '::after'); if (pa.content !== 'none' && pa.position === 'absolute') { w = Math.max(w, parseFloat(pa.width) || 0); h = Math.max(h, parseFloat(pa.height) || 0); } return [w, h]; };
  const ih = innerHeight;
  const small = all.filter((e) => {
    if (inProse(e) || e.tagName === 'PRE' || e.closest('.cm-content') && e.tagName !== 'BUTTON') return false;
    if (e.tagName === 'INPUT' && (e.type === 'checkbox' || e.type === 'radio')) { const l = e.closest('label'); const r = (l || e).getBoundingClientRect(); return r.height < 44; }
    if (e.closest('.cm-editor') && !['BUTTON'].includes(e.tagName)) return false;
    const [ew, eh] = eff(e); return eh < 43.5 || ew < 43.5; // two axes: a tap needs room both ways
  }).map((e) => { const [ew, eh] = eff(e); return `${Math.round(ew)}x${Math.round(eh)} ${name(e)}`; });
  const cut = all.filter((e) => { const r = e.getBoundingClientRect(); let p = e.parentElement; while (p) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'scroll') && p !== document.documentElement && p !== document.body) return false; p = p.parentElement; } return r.right > iw + 1 || r.left < -1; }).map(name);
  const reach = (e) => { const r = e.getBoundingClientRect(); if (r.bottom < 0 || r.top > ih) return false; const cx = Math.min(Math.max(r.left + r.width / 2, 0), iw - 1), cy = Math.min(Math.max(r.top + r.height / 2, 0), ih - 1); const t = document.elementFromPoint(cx, cy); return !!t && (e === t || e.contains(t)); };
  const rects = all.filter(reach).map((e) => [e, e.getBoundingClientRect()]);
  const covered = all.filter((e) => { const r = e.getBoundingClientRect(); if (r.bottom < 0 || r.top > ih || r.right < 0 || r.left > iw) return false; const cx = Math.min(Math.max(r.left + r.width / 2, 0), iw - 1), cy = Math.min(Math.max(r.top + r.height / 2, 0), ih - 1); const t = document.elementFromPoint(cx, cy); return !!t && e !== t && !e.contains(t) && !t.contains(e) && !t.closest('.scrim, .sidebar, .topstrip, .side-head, .ab-panel, .info-tip, dialog, .qa-edit, .doc-editor, .cm-editor, .voice-trigger, .qa-strip, .sheet-scrim, .doc-sheet, .phone-nav'); }).map((e) => { const r = e.getBoundingClientRect(); const t = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, 0), iw - 1), Math.min(Math.max(r.top + r.height / 2, 0), ih - 1)); return name(e) + ' <- ' + name(t); });
  const overlap = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const [a, ra] = rects[i], [b, rb] = rects[j];
    if (a.contains(b) || b.contains(a)) continue;
    if (!!a.closest('.topstrip, .side-head') !== !!b.closest('.topstrip, .side-head')) continue;
    if (!!a.closest('.phone-nav') !== !!b.closest('.phone-nav')) continue; // a fixed bar sits over the page; the page scrolls out from under it
    if ((a.matches('textarea, input') && b.matches('.voice-btn, .form-edit, .clear')) || (b.matches('textarea, input') && a.matches('.voice-btn, .form-edit, .clear'))) continue;
    const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (ox > 6 && oy > 6) overlap.push(name(a) + '  X  ' + name(b));
  }
  // controls the page keeps hidden until hover or focus: interactive, in the layout, but invisible
  const hidden = [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && (cs.opacity === '0' || cs.visibility === 'hidden') && !e.closest('[hidden], .info-tip, dialog:not([open])'); }).map(name);
  const zoom = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea, select')].filter((e) => vis(e) && parseFloat(getComputedStyle(e).fontSize) < 16 && !e.closest('.cm-editor')).map((e) => name(e) + ' ' + getComputedStyle(e).fontSize);
  return JSON.stringify({ zoom: [...new Set(zoom)], sw: document.documentElement.scrollWidth, iw, drawer: document.querySelector('.app')?.dataset.sidebar, small: [...new Set(small)], cut: [...new Set(cut)], overlap: overlap.slice(0, 12), hidden: [...new Set(hidden)], covered: [...new Set(covered)] });
})()

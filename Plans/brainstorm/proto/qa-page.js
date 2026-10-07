// Behaviour of a page rendered by qa-render.ts — in the browser only; nothing is written back.
(() => {
  const doc = document.getElementById('doc');

  // ---- editors: one at a time
  const closeEditors = () => doc.querySelectorAll('.c-edit, .f-edit').forEach((e) => e.remove());
  // who I am — mdhouse would take the git user name; ?me=name here
  const ME = new URLSearchParams(location.search).get('me') || 'parf';
  /** "👤me" in the editor: remembered per browser. */
  const signKey = 'mdhouse.qa.sign';
  // the sandboxed preview has no localStorage: the page remembers it for as long as it is open
  let signMem = false;
  const signed = () => { try { return localStorage.getItem(signKey) === '1'; } catch { return signMem; } };
  const setSigned = (on) => { signMem = on; try { localStorage.setItem(signKey, on ? '1' : '0'); } catch {} };
  const reply = (text, sign) => {
    const r = document.createElement('div');
    r.className = 'reply';
    r.innerHTML = (sign ? `<span class="who" data-kind="person">👤${ME}</span>` : '') + '<span class="txt"></span>';
    r.querySelector('.txt').textContent = text;
    return r;
  };
  /** A textarea + Save / Cancel; `stages` adds the stage buttons a finding moves with. */
  function editor(host, { prefill = '', stages = false, onSave }) {
    closeEditors();
    const ed = document.createElement('div');
    ed.className = stages ? 'f-edit' : 'c-edit';
    ed.innerHTML = '<textarea placeholder="Reply…"></textarea><div class="bar"><button class="save">💬 Save</button>'
      + (stages ? '<span class="lbl">and set:</span><button data-s="✅">✅ done</button><button data-s="🚫">🚫 rejected</button>'
        + '<button data-s="⏸️">⏸️ deferred</button><button data-s="❓">❓ needs my call</button>' : '')
      + '<button class="cancel">(ESC)Cancel</button>'
      + `<label class="sign" data-tip="Sign the reply: it starts with 👤${ME}"><input type="checkbox"> 👤${ME}</label></div>`;
    host.append(ed);
    const ta = ed.querySelector('textarea');
    ta.value = prefill;
    ta.focus();
    const sign = ed.querySelector('.sign input');
    sign.checked = signed();
    sign.addEventListener('change', () => setSigned(sign.checked));
    const done = (stage) => { onSave(ta.value.trim(), stage, sign.checked); ed.remove(); };
    ed.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      e.preventDefault();
      if (b.classList.contains('cancel')) return ed.remove();
      done(b.dataset.s ?? null);
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') ed.remove();
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) done(null);
    });
  }
  const threadOf = (host, cls = 'thread') => {
    let th = host.querySelector(`:scope > .${cls.split(' ').at(-1)}`);
    if (!th) { th = document.createElement('div'); th.className = cls; host.append(th); }
    return th;
  };

  doc.addEventListener('click', (e) => {
    // ---- the first glyph of a line is its button
    const g = e.target.closest('.g-btn, .g-answered');
    if (g) {
      e.preventDefault();
      const host = g.closest('details, .item, .qwrap, .req');
      if (host.tagName === 'DETAILS') host.open = true;
      // a ✅ on a radio question undoes the pick
      const radios = host.querySelector(':scope > .opts.radio');
      if (radios && g.textContent === '✅') {
        radios.querySelectorAll('.opt').forEach((o) => { o.classList.remove('picked'); o.querySelector('input').checked = false; });
        radios.classList.remove('done');
        return setStage(host, '❓');
      }
      const finding = !g.classList.contains('g-answered') && host.classList.contains('item') && !host.classList.contains('wait-me');
      const last = host.querySelector(':scope .reply:last-of-type .txt');
      editor(host, {
        prefill: g.classList.contains('g-answered') && last ? last.textContent : '',
        stages: finding || host.tagName === 'DETAILS',
        onSave: (text, stage, sign) => {
          if (text) threadOf(host, 'thread q-thread').append(reply(text, sign));
          if (stage) setStage(host, stage);
        },
      });
      return;
    }
    // ---- 💬 on a question / option line: a comment under it
    const c = e.target.closest('.c-btn');
    if (c) {
      e.preventDefault();
      const wrap = c.closest('.c-wrap');
      const host = wrap ?? c.closest('.item, details');
      const th = wrap ? wrap.querySelector('.opt-thread') : threadOf(host, 'thread q-thread');
      editor(th, { onSave: (text, _, sign) => text && th.append(reply(text, sign)) });
      return;
    }
    // ---- a click on a comment edits it
    const r = e.target.closest('.reply');
    if (r && !e.target.closest('.c-edit, .f-edit') && r.querySelector('.txt')) {
      const txt = r.querySelector('.txt');
      editor(r.parentElement, { prefill: txt.textContent, onSave: (text) => { if (text) txt.textContent = text; } });
    }
  });

  /** The status glyph changes; a severity stays in the text. */
  function setStage(host, stage) {
    const g = host.querySelector(':scope > .head > .g .g-btn, :scope > summary .g-btn');
    if (g) g.textContent = stage;
    const keys = (host.dataset.k || '').split(' ').filter((k) => k !== 'open' && !['✅', '🚫', '⏸️', '🎫', '❓', '⁉️', '⏳'].includes(k));
    const closed = ['✅', '🚫', '⏸️', '🎫'].includes(stage);
    host.dataset.k = [stage, ...keys, ...(closed ? [] : ['open'])].join(' ');
    host.style.opacity = closed ? '.55' : '';
    host.classList.toggle('wait-me', stage === '❓');
    counts();
  }

  // ---- options: a radio pick settles the question; checkboxes just tick
  doc.addEventListener('change', (e) => {
    const input = e.target.closest('.opt input');
    if (!input) return;
    const opts = input.closest('.opts');
    const host = opts.parentElement;
    if (input.type === 'radio') {
      opts.querySelectorAll(':scope > .c-wrap > .c-row > .opt').forEach((o) => o.classList.toggle('picked', o.contains(input)));
      opts.classList.add('done');
      setStage(host, '✅');
    } else input.closest('.opt').classList.toggle('picked', input.checked);
  });

  // ---- the strip: the total, then thresholds 🔴 ⊂ 🟠 ⊂ ⚪ (open), ✅ (closed)
  const strip = document.getElementById('strip');
  const has = (r, ...g) => r.dataset.k.split(' ').some((k) => g.includes(k));
  const open = (r) => has(r, 'open');
  const levels = [
    ['all', () => true, (n) => `Show all ${n}`],
    ['🔴', (r) => open(r) && has(r, '🔴'), (n) => `High — ${n}`],
    ['🟠', (r) => open(r) && (has(r, '🔴', '🟠') || (has(r, '❓', '⁉️') && !has(r, '⚪', '🔵'))), (n) => `Medium and up, and ❓ ⁉️ without a severity — ${n}`],
    ['⚪', open, (n) => `All open — ${n}`],
    ['✅', (r) => !open(r), (n) => `All closed: ✅ 🚫 ⏸️ 🎫 — ${n}`],
  ];
  let on = null;
  const rows = () => [...doc.querySelectorAll('[data-k]')];
  function counts() {
    for (const [k, test, tip] of levels) {
      const b = strip.querySelector(`[data-level="${k}"]`);
      const n = rows().filter(test).length;
      b.textContent = k === 'all' ? `${n}` : `${k} ${n}`;
      b.dataset.tip = tip(n);
      b.classList.toggle('zero', !n);
    }
  }
  for (const [k, test] of levels) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.dataset.level = k;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      on = on === k || k === 'all' ? null : k;
      strip.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b && on !== null)));
      doc.classList.toggle('filtered', on !== null);
      rows().forEach((r) => r.classList.toggle('hide', on !== null && !test(r)));
    });
    strip.append(b);
    if (k === 'all') strip.insertAdjacentHTML('beforeend', '<span class="sep" aria-hidden="true">│</span>');
  }
  counts();
})();

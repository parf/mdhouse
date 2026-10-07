// Behaviour of a page rendered by qa-render.ts — in the browser only; nothing is written back.
(() => {
  const doc = document.getElementById('doc');

  // ---- editors: one at a time
  const closeEditors = () => doc.querySelectorAll('.c-edit, .f-edit').forEach((e) => e.remove());
  // who I am: ?me= in the address, else what the renderer put in (config, else git)
  const ME = new URLSearchParams(location.search).get('me') || doc.dataset.me || 'me';
  /** "👤me" in the editor: remembered per browser. */
  const signKey = 'mdhouse.qa.sign';
  // the sandboxed preview has no localStorage: the page remembers it for as long as it is open
  let signMem = false;
  const signed = () => { try { return localStorage.getItem(signKey) === '1'; } catch { return signMem; } };
  const setSigned = (on) => { signMem = on; try { localStorage.setItem(signKey, on ? '1' : '0'); } catch {} };
  const reply = (text, sign, partial = false) => {
    const r = document.createElement('div');
    r.className = partial ? 'reply partial' : 'reply';
    r.innerHTML = (partial ? '⚠️ ' : '') + (sign ? `<span class="who" data-kind="person">👤${ME}</span>` : '') + '<span class="txt"></span>';
    r.querySelector('.txt').textContent = text;
    return r;
  };
  /**
   * Every form has 💬 (save), ESC (cancel) and 👤me; the buttons between them are what fits what is
   * edited. A button with `s` saves and moves the line to that stage; `partial` saves the reply as
   * 💬 ⚠️ (need more); `pick` saves and picks the option the comment is on.
   */
  const ACTIONS = {
    question: [['partial', '⚠️ need more', 'A partial answer: it stays open'], ['✅', '✅ settled'], ['⏳', '⏳ agent', 'Waiting on the agent'], ['⏸️', '⏸️ defer'], ['🚫', '🚫 drop']],
    finding: [['✅', '✅ done', 'Fixed / done'], ['🚫', '🚫 reject', 'Rejected — say why'], ['⏸️', '⏸️ defer', 'Deferred — later'], ['🎫', '🎫 ticket', 'Handed off to a ticket'], ['⏳', '⏳ agent', 'Waiting on the agent'], ['❓', '❓ me', 'My call — waiting on me'], ['⚠️', '⚠️ partial', 'Partly done — follow-up needed']],
    option: [['pick', 'pick it', 'Save and pick this option']],
    request: [['✅', '✅ done'], ['⏸️', '⏸️ defer'], ['🚫', '🚫 drop']],
    proposal: [['yes', '✓ yes', 'It is the answer: 💡 becomes 💬'], ['no', '✗ no', 'Reply no; it goes back to the agent']],
    comment: [],
  };
  function editor(host, { kind = 'comment', prefill = '', placeholder = 'Reply…', save = '💬', onSave }) {
    closeEditors();
    const ed = document.createElement('div');
    ed.className = kind === 'finding' ? 'f-edit' : 'c-edit';
    const extra = (ACTIONS[kind] || [])
      .map(([a, label, tip]) => `<button data-a="${a}"${tip ? ` data-tip="${tip}"` : ''}>${label}</button>`).join('');
    ed.innerHTML = `<textarea placeholder="${placeholder}"></textarea><div class="bar"><button class="save" data-tip="Save — Ctrl+Enter">${save}</button>`
      + extra + '<button data-a="elaborate" data-tip="Ask for more: a reply \'elaborate — …\'; the item stays open">🔍 more</button>'
      + '<button class="cancel" data-tip="Cancel">ESC</button>'
      + `<label class="sign" data-tip="Sign the reply: it starts with 👤${ME}"><input type="checkbox"> 👤</label></div>`;
    // a suggestion's form reads YES / NO / REPLY
    if (kind === 'proposal') ed.querySelector('[data-a="no"]').after(ed.querySelector('.bar > button:first-child'));
    host.append(ed);
    const ta = ed.querySelector('textarea');
    ta.value = prefill;
    ta.focus();
    const sign = ed.querySelector('.sign input');
    sign.checked = signed();
    sign.addEventListener('change', () => setSigned(sign.checked));
    const done = (action) => {
      if (action === 'elaborate') {
        // every form: a signed reply that asks for more; the item never closes
        const text = ta.value.trim();
        const th = host.classList.contains('opt-thread') || host.classList.contains('thread') ? host : threadOf(host, 'thread q-thread');
        th.append(reply(text ? `elaborate — ${text}` : 'elaborate', true, true));
        const item = th.closest('details, .item, .req');
        if (item) reopen(item);
      } else onSave(ta.value.trim(), action, sign.checked);
      ed.remove();
    };
    ed.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      e.preventDefault();
      if (b.classList.contains('cancel')) return ed.remove();
      done(b.dataset.a ?? null);
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
      // stage buttons for a finding only — a line with a severity; every question gets the same plain form
      const k = host.dataset.k || '';
      const kind = host.classList.contains('req') || /👉/u.test(k) ? 'request'
        : /🔴|🟠|⚪|🔵/u.test(k) ? 'finding' : 'question';
      const last = host.querySelector(':scope .reply:last-of-type .txt');
      editor(host, {
        kind,
        prefill: g.classList.contains('g-answered') && last ? last.textContent : '',
        onSave: (text, action, sign) => {
          if (text) threadOf(host, 'thread q-thread').append(reply(text, sign, action === 'partial'));
          if (action === 'partial') setStage(host, '❓');
          else if (action) setStage(host, action);
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
      editor(th, {
        kind: wrap ? 'option' : 'comment',
        onSave: (text, action, sign) => {
          if (text) th.append(reply(text, sign));
          if (action === 'pick') wrap.querySelector('.opt input').click();
        },
      });
      return;
    }
    // ---- 💡 a suggestion: accept makes it the answer; edit answers with its text
    const acc = e.target.closest('.s-act button');
    if (acc) {
      e.preventDefault();
      const sug = acc.closest('.reply.proposal');
      const host = sug.closest('details, .item');
      // one form, three ways to save it: YES / NO / REPLY — the text is optional for each
      const first = acc.classList.contains('accept') ? 'yes' : acc.classList.contains('reject') ? 'no' : 'reply';
      editor(host, {
        kind: 'proposal',
        placeholder: { yes: 'Yes — anything to add? (optional)', no: 'No — why? (optional)', reply: 'Reply…' }[first],
        save: '💬 reply',
        onSave: (text, action, sign) => {
          const th = threadOf(host, 'thread q-thread');
          if (action === 'yes' || action === 'no') {
            // 💡 → ✅ 💡 / 🚫 💡, and the answer, signed: 💬 👤me yes — … / no — …
            const v = action === 'yes' ? '✅' : '🚫';
            sug.classList.add('decided', action === 'yes' ? 'taken' : 'declined');
            sug.firstChild.textContent = `${v} 💡 `;
            sug.querySelector('.s-act').remove();
            th.append(reply(text ? `${action} — ${text}` : action, true));
            answered(host);
          } else if (text) th.append(reply(text, sign));
        },
      });
      const bar = document.querySelector('.c-edit .bar');
      bar.querySelector(`[data-a="${first}"]`)?.classList.add('save');
      return;
    }
    // ---- a click anywhere on an unanswered question or an open finding opens its form, as its glyph does
    const q = e.target.closest('.item.wait-me, .item.finding');
    if (q && !e.target.closest('a, input, label, button, .reply, .c-edit, .f-edit, .opts')) {
      q.querySelector(':scope > .head .g-btn')?.click();
      return;
    }
    // ---- a click on a comment edits it
    const r = e.target.closest('.reply');
    if (r && !e.target.closest('.c-edit, .f-edit') && r.querySelector('.txt')) {
      const txt = r.querySelector('.txt');
      editor(r.parentElement, { prefill: txt.textContent, onSave: (text) => { if (text) txt.textContent = text; } });
    }
  });

  /** Asked to elaborate: open again, whatever it was — nothing about it is settled. */
  function reopen(host) {
    if (host.tagName === 'DETAILS') host.open = true;
    const k = (host.dataset.k || '').split(' ');
    if (!k.includes('open')) host.dataset.k = [...k, 'open'].join(' ');
    host.style.opacity = '';
    counts();
  }

  /** A question that got its answer: a green ?, no longer waiting on me. */
  function answered(host) {
    const g = host.querySelector(':scope > .head > .g .g-btn');
    if (g && ['❓', '⁉️'].includes(g.textContent)) {
      g.className = 'g-answered';
      g.textContent = g.textContent === '⁉️' ? '!?' : '?';
      g.dataset.tip = 'Answered — click to edit the answer';
    }
    host.classList.remove('wait-me');
    host.dataset.k = (host.dataset.k || '').split(' ').filter((k) => k !== 'open').join(' ');
    counts();
  }

  /** The status glyph changes; a severity stays in the text. */
  function setStage(host, stage) {
    const g = host.querySelector(':scope > .head > .g .g-btn, :scope > summary .g-btn, :scope > summary .g-answered');
    if (g) {
      if (g.classList.contains('g-answered')) { g.className = 'g g-btn sev'; }
      g.textContent = stage;
    }
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

  // ---- folded lines: a clear "▾ show all" when anything is cut or left out
  function markHidden() {
    doc.querySelectorAll('details.settled').forEach((d) => {
      d.querySelector(':scope > summary > .more')?.remove();
      if (d.open) return;
      const cut = [...d.querySelectorAll(':scope > summary .t-q, :scope > summary .t-a')].some((el) => el.scrollHeight > el.clientHeight + 1);
      const replies = d.querySelectorAll(':scope > .thread > .reply').length;
      const extra = replies > 1 || d.querySelector(':scope > .opts');
      if (!cut && !extra) return;
      const more = document.createElement('span');
      more.className = 'more';
      more.textContent = '▾ show all' + (replies > 1 ? ` · ${replies} replies` : '');
      d.querySelector(':scope > summary').append(more);
    });
  }
  markHidden();
  doc.addEventListener('toggle', markHidden, true);
  addEventListener('resize', markHidden);

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

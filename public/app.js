// Beanstalk Storybook: a small single-page app. Views are picked by the URL hash:
// #books, #new, #book/<id>, #wallet, #order/<id>.
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (cents) => `${cents < 0 ? '−' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;
const usd = (n) => `$${Number(n).toFixed(2)}`;
const when = (t) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const view = $('#view');
const state = { me: null, stories: [], timers: [] };

async function api(url, method = 'GET', body) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body && JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { location.hash = ''; await boot(); throw new Error('Please sign in.'); }
  if (!r.ok) throw Object.assign(new Error(j.error || `Server error ${r.status}`), { field: j.field, status: r.status });
  return j;
}

function stopTimers() {
  state.timers.forEach(clearInterval);
  state.timers = [];
}

async function refreshMe() {
  state.me = await api('/api/me');
  $('#balance').textContent = `Wallet ${money(state.me.balanceCents)}`;
}

function setChrome() {
  const on = Boolean(state.me?.user);
  $('#tabs').hidden = !on; $('#balance').hidden = !on; $('#who').hidden = !on;
  if (on) $('#email').textContent = state.me.user.email || state.me.user.name || '';
  const tab = (location.hash.slice(1).split('/')[0] || 'books');
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
}

$('#logout').onclick = async () => { await api('/auth/logout', 'POST'); state.me = null; location.hash = ''; boot(); };

// ---------- Sign in ----------

function signInView() {
  const failed = new URLSearchParams(location.search).get('login') === 'failed';
  view.innerHTML = `
    <div class="row">
      <div class="stack">
        <h1>A storybook starring your child</h1>
        <p class="muted">Upload a photo, pick a story, and in about a minute your child is the hero of a 20-page illustrated book: <em>Jack and the Beanstalk</em> or <em>Little Red Riding Hood</em>. Download the PDF, or order it printed as a hardcover.</p>
        <div class="actions">
          <a class="btn" href="/auth/google">Sign in with Google</a>
          ${state.me?.devLogin ? '<button class="quiet" id="dev">Dev login</button>' : ''}
        </div>
        ${failed ? '<div class="notice err">Sign-in failed. Please try again.</div>' : ''}
        <p class="small muted">Your books are saved to your account, so they're still here when you come back.</p>
      </div>
      <div class="stories">${state.stories.map((s) => `
        <div class="story"><div class="pic" style="background-image:url('/api/stories/${s.id}/preview.jpg')"></div><div class="t">${esc(s.title)}</div></div>`).join('')}
      </div>
    </div>`;
  const dev = $('#dev');
  if (dev) dev.onclick = async () => { await api('/auth/dev', 'POST', { who: new URLSearchParams(location.search).get('who') || 'dev' }); boot(); };
}

// ---------- Library ----------

async function booksView() {
  const books = await api('/api/books');
  view.innerHTML = `
    <div class="stack">
      <h1>My books</h1>
      <div class="grid">
        <a class="card newcard" href="#new">+ New book<br><span class="small muted" style="font-weight:400">${money(state.me.bookPriceCents)} from your wallet</span></a>
        ${books.map((b) => `
          <a class="card bookcard" href="#book/${b.id}">
            <div class="cover" style="${b.coverSlot && b.pagesDone ? `background-image:url('/api/books/${b.id}/thumbs/${b.coverSlot}')` : ''}"></div>
            <div class="meta">
              <h3>${esc(b.title)}</h3>
              <div class="small muted">${b.name ? `starring ${esc(b.name)} · ` : ''}${esc(when(b.createdAt))}</div>
              ${b.story ? (b.pagesDone < 20 ? `<div class="small" style="color:var(--warn)">${b.pagesDone} of 20 pages</div>` : '') : '<div class="small muted">Made with an earlier version</div>'}
            </div>
          </a>`).join('')}
      </div>
    </div>`;
}

// ---------- New book ----------

const ABOUT_FIELDS = [
  ['name', "Child's name", 'text', 'e.g. Sam', 30],
  ['age', 'Age', 'text', 'e.g. 7', 3],
  ['favorites', 'Favorite things', 'text', 'e.g. dinosaurs, pancakes, the color green', 120],
  ['bio', 'About me', 'textarea', 'A sentence or two for the back cover', 300],
];
const aboutForm = (about = {}) => ABOUT_FIELDS.map(([key, label, type, ph, max]) => `
  <label class="field" data-f="${key}">${label}
    ${type === 'textarea' ? `<textarea name="${key}" maxlength="${max}" placeholder="${ph}">${esc(about[key])}</textarea>` : `<input type="text" name="${key}" maxlength="${max}" placeholder="${ph}" value="${esc(about[key])}">`}
    <span class="fielderr"></span>
  </label>`).join('');
const readAbout = (root) => Object.fromEntries(ABOUT_FIELDS.map(([key]) => [key, $(`[name=${key}]`, root).value]));

function showFieldError(root, e) {
  root.querySelectorAll('.bad').forEach((el) => el.classList.remove('bad'));
  root.querySelectorAll('.fielderr').forEach((el) => { el.textContent = ''; });
  const box = e.field && $(`[data-f="${e.field}"]`, root);
  if (box) { box.classList.add('bad'); $('.fielderr', box).textContent = e.message; return true; }
  return false;
}

function newView() {
  const pick = { story: state.stories[0]?.id, photo: null };
  const enough = state.me.balanceCents >= state.me.bookPriceCents;
  view.innerHTML = `
    <div class="stack">
      <h1>New book</h1>
      <div class="card stack">
        <h2>1. Pick a story</h2>
        <div class="stories" id="stories">${state.stories.map((s) => `
          <button class="story" data-story="${s.id}" type="button"><div class="pic" style="background-image:url('/api/stories/${s.id}/preview.jpg')"></div><div class="t">${esc(s.title)}</div></button>`).join('')}
        </div>
      </div>
      <div class="card stack" id="form">
        <h2>2. The child</h2>
        <div data-f="photo">
          <div class="drop" id="drop"><div class="ph" id="ph"></div><div>Click or drop a photo<br><span class="small">A clear, front-facing photo of the child's face. JPEG, PNG or WebP.</span></div></div>
          <input type="file" id="file" accept="image/jpeg,image/png,image/webp" hidden>
          <span class="fielderr"></span>
        </div>
        <div class="row">${aboutForm()}</div>
        <p class="small muted">The name and details are printed on the cover and the About Me page, so they're checked first. The photo is sent to OpenAI to draw the book and isn't saved here.</p>
      </div>
      <div class="card actions">
        <button id="make" disabled>Make my book: ${money(state.me.bookPriceCents)}</button>
        <span class="small muted">Wallet balance ${money(state.me.balanceCents)}${enough ? '' : ' · <a href="#wallet">add money first</a>'}</span>
        <div id="makeErr" class="notice err" hidden style="flex-basis:100%"></div>
      </div>
    </div>`;
  const ready = () => { $('#make').disabled = !(pick.story && pick.photo && enough); };
  const select = (id) => { pick.story = id; view.querySelectorAll('[data-story]').forEach((b) => b.classList.toggle('on', b.dataset.story === id)); ready(); };
  view.querySelectorAll('[data-story]').forEach((b) => { b.onclick = () => select(b.dataset.story); });
  select(pick.story);
  const load = (file) => readPhoto(file, (photo) => { pick.photo = photo; $('#ph').style.backgroundImage = `url('${photo}')`; ready(); });
  $('#drop').onclick = () => $('#file').click();
  $('#file').onchange = (e) => load(e.target.files[0]);
  $('#drop').ondragover = (e) => e.preventDefault();
  $('#drop').ondrop = (e) => { e.preventDefault(); load(e.dataTransfer.files[0]); };
  $('#make').onclick = async () => {
    const btn = $('#make');
    btn.disabled = true; btn.textContent = 'Checking…'; $('#makeErr').hidden = true;
    try {
      const { id } = await api('/api/books', 'POST', { story: pick.story, photo: pick.photo, about: readAbout($('#form')) });
      await refreshMe();
      location.hash = `#book/${id}`;
    } catch (e) {
      if (!showFieldError($('#form'), e)) { $('#makeErr').textContent = e.message; $('#makeErr').hidden = false; }
      btn.textContent = `Make my book: ${money(state.me.bookPriceCents)}`; ready();
    }
  };
}

// Downscale on the client so uploads stay small and fast.
function readPhoto(file, done) {
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) return alert('Please choose a JPEG, PNG or WebP image.');
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(img.src);
    done(c.toDataURL('image/jpeg', 0.9));
  };
  img.src = URL.createObjectURL(file);
}

// ---------- Book ----------

const BUSY = ['queued', 'painting', 'checking', 'retrying'];
const STAGES = [['checking', 'Checking details'], ['painting', 'Painting pages'], ['testing', 'Checking each picture'], ['finishing', 'Putting the book together']];

function triesBadge(s, max) {
  if (!s || !s.attempts) return '';
  if (BUSY.includes(s.status)) return s.attempts > 1 ? `<span class="tries retry">Try ${s.attempts} of ${max}</span>` : '';
  if (s.status !== 'done') return '';
  if (s.passed === false) return `<span class="tries best" title="None of the ${s.attempts} tries passed the check; the best one is kept">${s.attempts} tries · best kept</span>`;
  return `<span class="tries${s.attempts > 1 ? ' retry' : ''}" title="Passed the picture check">${s.attempts} ${s.attempts === 1 ? 'try' : 'tries'} ✓</span>`;
}

function tileState(s) {
  if (!s) return 'Waiting';
  return { queued: 'Waiting', painting: 'Painting…', checking: 'Checking…', retrying: 'Redoing…', error: 'Failed: click to try again' }[s.status] || '';
}

async function bookView(id) {
  const shown = {};
  let book = await api(`/api/books/${id}`);
  if (book.stage === 'legacy') {
    view.innerHTML = `<div class="card stack"><h1>Early 3-page draft</h1><p class="muted">This book was made with an earlier version of the app and can't be opened here. Make a new book to get the full 20-page story.</p><div class="actions"><a class="btn" href="#new">New book</a><button class="link danger" id="del">Delete this draft</button></div></div>`;
    $('#del').onclick = async () => { await api(`/api/books/${id}`, 'DELETE'); location.hash = '#books'; };
    return;
  }
  view.innerHTML = `
    <div class="stack">
      <div><h1>${esc(book.title)}</h1><div class="muted">starring ${esc(book.about.name)}</div></div>
      <div class="card" id="progress">
        <h2 id="stageTitle"></h2>
        <div class="stages" id="stages"></div>
        <div class="bar"><i id="totalBar"></i></div>
        <p class="small muted" id="stageNote" style="margin:8px 0 0"></p>
      </div>
      <div class="card stack">
        <div class="actions" style="justify-content:space-between">
          <h2 style="margin:0">Pages</h2>
          <span class="small muted">Click a page to see it with its words. Each picture is checked and redone if it fails, up to ${book.maxTries} tries.</span>
        </div>
        <div class="tiles" id="tiles">${book.pages.map((p) => `
          <button class="tile" data-slot="${p.slot}" type="button"><span class="state"></span><span class="num">${p.number}</span></button>`).join('')}
        </div>
      </div>
      <div class="card actions" id="bookActions">
        <a class="btn off" id="pdf" href="/api/books/${id}/pdf">Download PDF</a>
        <button class="ghost" id="print" disabled>Order a printed copy</button>
        <span class="small muted" id="cost"></span>
        <button class="link danger" id="del" style="margin-left:auto">Delete book</button>
      </div>
      <div class="card stack" id="bibleCard" hidden>
        <div class="actions" style="justify-content:space-between"><h2 style="margin:0">Character bible</h2><span class="small muted">Stored once per story and edited into every page; your hero is added when the book is made.</span></div>
        <div class="bible" id="bible"></div>
      </div>
      <div class="card stack">
        <h2>About Me (back cover)</h2>
        <div class="row" id="aboutForm">${aboutForm(book.about)}</div>
        <div class="actions"><button class="ghost" id="saveAbout">Save details</button><span class="small" id="aboutSaved"></span></div>
      </div>
    </div>`;

  $('#del').onclick = async () => {
    if (!confirm('Delete this book and its pictures? This can’t be undone.')) return;
    await api(`/api/books/${id}`, 'DELETE'); location.hash = '#books';
  };
  $('#print').onclick = async () => { const { id: orderId } = await api(`/api/books/${id}/orders`, 'POST'); location.hash = `#order/${orderId}`; };
  $('#saveAbout').onclick = async () => {
    $('#aboutSaved').textContent = 'Checking…';
    try {
      const r = await api(`/api/books/${id}`, 'PATCH', { about: readAbout($('#aboutForm')) });
      showFieldError($('#aboutForm'), {});
      book.about = r.about; $('[name=name]', $('#aboutForm')).value = r.about.name;
      $('#aboutSaved').textContent = 'Saved. The PDF uses the new details.';
    } catch (e) {
      $('#aboutSaved').textContent = '';
      if (!showFieldError($('#aboutForm'), e)) $('#aboutSaved').textContent = e.message;
    }
  };
  view.querySelectorAll('.tile').forEach((t) => { t.onclick = () => openPage(book, t.dataset.slot, () => poll(true)); });
  let bibleShown = 0;
  async function showBible() {
    const cast = await api(`/api/books/${id}/bible`);
    if (cast.length === bibleShown) return;
    bibleShown = cast.length;
    $('#bible').innerHTML = cast.map((c) => `<figure><img alt="${esc(c.name)}" loading="lazy" src="${c.url}?v=${book.readyMs || 0}"><figcaption>${esc(c.own ? `${book.hero}: ${book.about.name}` : c.name)}</figcaption></figure>`).join('');
    $('#bibleCard').hidden = false;
  }

  function render() {
    const pages = book.pages.map((p) => book.slots[p.slot]);
    const painted = pages.filter((s) => s && (s.hasImage || ['checking', 'retrying'].includes(s.status))).length;
    const checked = pages.filter((s) => s?.status === 'done').length;
    const failed = pages.filter((s) => s?.status === 'error').length;
    const busy = pages.some((s) => s && BUSY.includes(s.status)) || book.stage === 'finishing';
    const ready = book.stage === 'ready';
    const stageIdx = ready ? 4 : checked === 20 ? 3 : painted === 20 ? 2 : 1;
    $('#progress').hidden = ready && !state.justMade;
    $('#stageTitle').textContent = ready ? 'Your book is ready' : !busy && failed ? `${failed} page${failed > 1 ? 's' : ''} failed` : `Stage ${stageIdx + 1} of 4: ${STAGES[stageIdx]?.[1] || ''}`;
    $('#stages').innerHTML = STAGES.map(([, label], i) => {
      const detail = i === 1 ? ` (${painted} of 20)` : i === 2 ? ` (${checked} of 20)` : '';
      return `<div class="stage ${i < stageIdx || ready ? 'done' : ''} ${i === stageIdx && !ready ? 'on' : ''}">${label}${detail}</div>`;
    }).join('');
    $('#totalBar').style.width = `${ready ? 100 : Math.round((5 + painted * 2.5 + checked * 2) / 95 * 100)}%`;
    $('#stageNote').textContent = ready && book.readyMs ? `Made in ${Math.round(book.readyMs / 1000)} seconds.` : busy ? 'Pages appear below as each one is finished. You can leave this page; your book keeps going.' : '';
    for (const p of book.pages) {
      const s = book.slots[p.slot];
      const tile = $(`[data-slot="${p.slot}"]`);
      const key = s?.hasImage && !BUSY.includes(s.status) ? `${s.version}` : '';
      if (key && shown[p.slot] !== key) {
        tile.querySelector('img')?.remove();
        tile.insertAdjacentHTML('afterbegin', `<img alt="Page ${p.number}" loading="lazy" src="/api/books/${id}/thumbs/${p.slot}?v=${key}">`);
        shown[p.slot] = key;
      }
      tile.classList.toggle('busy', Boolean(s && BUSY.includes(s.status)));
      $('.state', tile).textContent = key ? '' : tileState(s);
      tile.querySelector('.tries')?.remove();
      tile.insertAdjacentHTML('beforeend', triesBadge(s, book.maxTries));
    }
    $('#pdf').classList.toggle('off', !ready);
    $('#print').disabled = !ready;
    if (!busy) showBible().catch(() => {});
    $('#cost').textContent = book.cost.usd ? `This book cost ${usd(book.cost.usd)} in AI calls to make (${book.cost.images} images, ${book.cost.checks} checks).` : '';
    return busy;
  }

  async function poll(force) {
    book = await api(`/api/books/${id}`);
    const busy = render();
    if (busy || force) startPolling();
    if (!busy) stopTimers();
  }
  function startPolling() {
    if (state.timers.length) return;
    state.timers.push(setInterval(() => poll().catch(() => {}), 1200));
  }
  if (render()) startPolling();
}

function pageHtml(book, slot, big = true) {
  const p = book.pages.find((x) => x.slot === slot);
  const s = book.slots[slot];
  const layout = s?.layout || { mode: 'panel', fontSize: 24 };
  const img = `<img alt="Page ${p.number}" src="/api/books/${book.id}/${big ? 'images' : 'thumbs'}/${slot}?v=${s?.version}">`;
  // Font size scales with the page width, matching the PDF (points on an 810-point-wide page).
  const font = `font-size:${(layout.fontSize / 810 * 100).toFixed(2)}cqw`;
  if (layout.mode === 'band') {
    const pad = 26 / 630;
    const top = Math.max(0, layout.y0 - pad) * 100;
    const height = (Math.min(1, layout.y1 + pad) - Math.max(0, layout.y0 - pad)) * 100;
    return `<div class="page">${img}<div class="words ${layout.zone}" style="top:${top}%;height:${height}%;${font}"><span>${esc(p.text)}</span></div></div>`;
  }
  return `<div class="page panel">${img}<div class="words" style="${font}">${esc(p.text)}</div></div>`;
}

function openPage(book, slot, after) {
  const s = book.slots[slot];
  const p = book.pages.find((x) => x.slot === slot);
  const dlg = $('#viewer');
  if (s && BUSY.includes(s.status)) return;
  if (!s?.hasImage) {
    dlg.innerHTML = `
      <div class="viewer stack">
        <div class="actions" style="justify-content:space-between"><h2 style="margin:0">Page ${p.number} didn't work</h2><button class="quiet" id="close">Close</button></div>
        <div class="notice err">${esc(s?.error || 'This page could not be made.')}</div>
        <p class="muted">Try again: it usually works the second time. It doesn't cost you anything extra.</p>
        <div class="actions"><button id="retry">Try again</button></div>
        <div class="small" id="pageErr" style="color:var(--err)"></div>
      </div>`;
    $('#close').onclick = () => dlg.close();
    $('#retry').onclick = async () => {
      try { await api(`/api/books/${book.id}/slots/${slot}/remake`, 'POST', {}); dlg.close(); after(); } catch (e) { $('#pageErr').textContent = e.message; }
    };
    dlg.showModal();
    return;
  }
  const check = s.passed === true ? 'Passed the picture check' : s.passed === false ? `None of ${s.attempts} tries passed the check; the best is kept` : 'Not checked';
  dlg.innerHTML = `
    <div class="viewer stack">
      <div class="actions" style="justify-content:space-between"><h2 style="margin:0">Page ${p.number}</h2><button class="quiet" id="close">Close</button></div>
      ${pageHtml(book, slot)}
      <div class="small muted">${s.attempts} ${s.attempts === 1 ? 'try' : 'tries'} · ${check}${s.layout?.mode === 'panel' ? ' · Words moved below the picture so they cover nothing' : ''}</div>
      <div class="actions">
        <input type="text" id="editText" maxlength="300" placeholder="Change one thing, e.g. make the cow brown" style="flex:1;min-width:200px">
        <button class="ghost" id="editBtn">Edit page</button>
        <button class="quiet" id="remake">Re-make page</button>
      </div>
      <div class="small" id="pageErr" style="color:var(--err)"></div>
    </div>`;
  const act = async (path, body) => {
    try { await api(`/api/books/${book.id}/slots/${slot}/${path}`, 'POST', body); dlg.close(); after(); } catch (e) { $('#pageErr').textContent = e.message; }
  };
  $('#close').onclick = () => dlg.close();
  $('#remake').onclick = () => act('remake');
  $('#editBtn').onclick = () => { const t = $('#editText').value.trim(); if (t) act('edit', { instruction: t }); };
  dlg.showModal();
}

// ---------- Wallet ----------

const KIND = { deposit: 'Added by card', book: 'Book', print: 'Printed book', refund: 'Refund to card', refund_request: 'Refund request', credit: 'Credit' };

async function walletView() {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  let flash = '';
  if (params.get('session')) {
    try {
      const r = await api('/api/wallet/confirm', 'POST', { session: params.get('session') });
      flash = r.credited ? '<div class="notice ok">Payment received. Your wallet has been topped up.</div>' : '<div class="notice warn">That payment hasn’t gone through yet.</div>';
    } catch (e) { flash = `<div class="notice err">${esc(e.message)}</div>`; }
    history.replaceState(null, '', '#wallet');
    await refreshMe();
  }
  const w = await api('/api/wallet');
  const orders = await api('/api/orders');
  const margin = w.cost.books ? (w.bookPriceCents / 100 - w.cost.avgUsd) : null;
  view.innerHTML = `
    <div class="stack">
      <h1>Wallet</h1>
      ${flash}
      <div class="row">
        <div class="card stack">
          <div class="muted small">Balance</div>
          <div class="big">${money(w.balanceCents)}</div>
          <div class="small muted">Each book costs ${money(w.bookPriceCents)}. Printed copies are priced at checkout.</div>
          <div class="actions">${w.depositOptions.map((c) => `<button class="ghost" data-add="${c}">Add ${money(c)}</button>`).join('')}</div>
          <div class="small muted">Test mode: pay with card 4242 4242 4242 4242, any future date, any CVC.</div>
        </div>
        <div class="card stack">
          <div class="muted small">What a book costs us to make</div>
          <div class="big">${w.cost.books ? usd(w.cost.avgUsd) : '—'}</div>
          <div class="small muted">${w.cost.books ? `Average AI spend over ${w.cost.books} finished book${w.cost.books > 1 ? 's' : ''} (every image, retry and picture check), against the ${money(w.bookPriceCents)} we charge: ${margin >= 0 ? `${usd(margin)} margin` : `${usd(-margin)} loss`} per book. Range ${usd(w.cost.minUsd)} to ${usd(w.cost.maxUsd)}.` : 'Shown once a book has been made.'}</div>
        </div>
      </div>
      <div class="card stack">
        <h2>History</h2>
        ${w.history.length ? `<table><thead><tr><th>When</th><th>What</th><th>Status</th><th style="text-align:right">Amount</th><th></th></tr></thead><tbody>
          ${w.history.map((h) => `<tr>
            <td class="small">${esc(when(h.created_at))}</td>
            <td>${esc(KIND[h.kind] || h.kind)}<div class="small muted">${esc(h.description)}${h.book_id ? ` · <a href="#book/${h.book_id}">book</a>` : ''}${h.order_id ? ` · <a href="#order/${h.order_id}">order</a>` : ''}</div></td>
            <td class="small">${esc(h.status)}</td>
            <td class="amt ${h.amount_cents > 0 ? 'plus' : ''}">${h.amount_cents ? (h.amount_cents > 0 ? '+' : '') + money(h.amount_cents) : ''}</td>
            <td>${h.kind === 'deposit' && h.status === 'completed' && h.refunded_cents < h.amount_cents ? `<button class="link" data-refund="${h.id}" data-max="${h.amount_cents - h.refunded_cents}">Refund</button>` : h.refunded_cents ? `<span class="small muted">${money(h.refunded_cents)} refunded</span>` : ''}</td>
          </tr>`).join('')}
        </tbody></table>` : '<p class="muted">Nothing yet. Add money to make your first book.</p>'}
      </div>
      <div class="card stack">
        <h2>Print orders</h2>
        ${orders.length ? `<table><tbody>${orders.map((o) => `<tr><td><a href="#order/${o.id}">${esc(o.title)}</a><div class="small muted">${esc(when(o.createdAt))}</div></td><td class="small">${esc(o.printerStatus || o.status)}</td><td class="amt">${o.priceCents ? money(o.priceCents) : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No print orders yet.</p>'}
      </div>
    </div>`;
  view.querySelectorAll('[data-add]').forEach((b) => {
    b.onclick = async () => { b.disabled = true; try { location.href = (await api('/api/wallet/deposit', 'POST', { cents: Number(b.dataset.add) })).url; } catch (e) { alert(e.message); b.disabled = false; } };
  });
  view.querySelectorAll('[data-refund]').forEach((b) => {
    b.onclick = async () => {
      const max = Number(b.dataset.max);
      const amount = prompt(`Refund how much to the card? Up to ${money(Math.min(max, w.balanceCents))}.`, (Math.min(max, w.balanceCents) / 100).toFixed(2));
      if (amount === null) return;
      try { await api('/api/wallet/refund', 'POST', { depositId: Number(b.dataset.refund), cents: Math.round(Number(amount) * 100) }); await refreshMe(); walletView(); } catch (e) { alert(e.message); }
    };
  });
}

// ---------- Print order ----------

const US_STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
const ADDRESS = [['name', 'Full name', 35], ['street1', 'Street address', 30], ['street2', 'Apartment, suite (optional)', 30], ['city', 'City', 30], ['postcode', 'ZIP code', 10], ['phone_number', 'Phone', 20], ['email', 'Email for shipping updates', 80]];
const SHIP = { MAIL: 'Standard mail', PRIORITY_MAIL: 'Priority mail', EXPEDITED: 'Expedited' };

async function orderView(id) {
  const o = await api(`/api/orders/${id}`);
  const placed = !['draft', 'approved', 'quoted', 'placing'].includes(o.status);
  const a = o.address || {};
  const step = (n, done, title, body) => `<div class="card stack"><div class="step-h"><span class="dot ${done ? 'done' : ''}">${done ? '✓' : n}</span><h2 style="margin:0">${title}</h2></div>${body}</div>`;
  view.innerHTML = `
    <div class="stack">
      <div><h1>Printed copy</h1><div class="muted">${esc(o.title)} · 11 × 8.5 in hardcover</div></div>
      ${placed ? step('✓', true, 'Order placed', `
        <p>The printer has your order${o.printerId ? ` (#${esc(o.printerId)})` : ''}. Status: <b>${esc(o.printerStatus || o.status)}</b>.</p>
        ${o.status === 'failed' ? `<div class="notice err">${esc(o.error)}</div>` : ''}
        <div class="notice warn">This is the printer's sandbox: the order is real to their system, but nothing is printed or shipped and no money moves.</div>
        <p class="small muted">Shipping to ${esc(a.name)}, ${esc(a.street1)}, ${esc(a.city)}, ${esc(a.state_code)} ${esc(a.postcode)} · ${esc(SHIP[o.shippingLevel] || o.shippingLevel)} · paid ${money(o.priceCents)}</p>`) : `
      <div class="steps">
        ${step(1, o.approved, 'Check the proof', `
          <p class="muted">This is exactly the book that will be printed: cover, copyright page, all 20 pages and the About Me back cover. Nothing is sent to the printer until you approve it.</p>
          <div class="actions"><a class="btn ghost" id="proof" href="/api/orders/${o.id}/proof.pdf" target="_blank" rel="noopener">Open the proof (PDF)</a></div>
          <label class="actions small"><input type="checkbox" id="ok" ${o.approved ? 'checked disabled' : o.proofViewed ? '' : 'disabled'}> I've looked through every page, and I approve this book for printing.</label>
          ${o.approved ? '' : '<div><button id="approve" disabled>Approve</button> <span class="small muted" id="approveHint">Open the proof first.</span></div>'}`)}
        ${step(2, Boolean(o.priceCents), 'Delivery address', o.approved ? `
          <form id="addr" class="row" onsubmit="return false">
            ${ADDRESS.map(([k, label, max]) => `<label class="field" data-f="${k}">${label}<input type="${k === 'email' ? 'email' : k === 'phone_number' ? 'tel' : 'text'}" name="${k}" maxlength="${max}" value="${esc(a[k] ?? (k === 'email' ? state.me.user.email : ''))}"><span class="fielderr"></span></label>`).join('')}
            <label class="field" data-f="state_code">State<select name="state_code"><option value="">Choose…</option>${US_STATES.map((s) => `<option ${a.state_code === s ? 'selected' : ''}>${s}</option>`).join('')}</select><span class="fielderr"></span></label>
            <label class="field">Shipping<select name="shippingLevel">${Object.entries(SHIP).map(([k, v]) => `<option value="${k}" ${o.shippingLevel === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          </form>
          <div class="actions"><button class="ghost" id="quote">Get the price</button><span class="small muted">US addresses only.</span></div>
          <div id="quoteErr" class="notice err" hidden></div>` : '<p class="muted">Approve the proof first.</p>')}
        ${step(3, false, 'Place the order', o.priceCents ? `
          <p>Printed hardcover, shipped to ${esc(a.name)}: <b class="big" style="font-size:1.6rem">${money(o.priceCents)}</b></p>
          ${(o.quote?.warnings || []).map((w) => `<div class="notice warn">${esc(w.message || w)}</div>`).join('')}
          <p class="small muted">Paid from your wallet (balance ${money(state.me.balanceCents)}). Includes printing, binding, shipping and tax.</p>
          <div class="actions"><button id="place">Place order</button>${state.me.balanceCents < o.priceCents ? ' <a href="#wallet">Add money first</a>' : ''}</div>
          <div id="placeErr" class="notice err" hidden></div>` : '<p class="muted">Enter the address to see the price.</p>')}
      </div>`}
    </div>`;

  const proof = $('#proof');
  if (proof) proof.onclick = () => setTimeout(() => { const ok = $('#ok'); if (ok && !o.approved) { ok.disabled = false; $('#approveHint').textContent = 'Tick the box once you’ve checked every page.'; } }, 600);
  const ok = $('#ok');
  if (ok && $('#approve')) ok.onchange = () => { $('#approve').disabled = !ok.checked; };
  const approve = $('#approve');
  if (approve) approve.onclick = async () => { try { await api(`/api/orders/${id}/approve`, 'POST'); orderView(id); } catch (e) { $('#approveHint').textContent = e.message; } };
  const quote = $('#quote');
  if (quote) quote.onclick = async () => {
    const form = $('#addr');
    const address = Object.fromEntries([...form.querySelectorAll('[name]')].map((el) => [el.name, el.value]));
    quote.disabled = true; quote.textContent = 'Checking address…'; $('#quoteErr').hidden = true;
    try { await api(`/api/orders/${id}/quote`, 'POST', { address, shippingLevel: address.shippingLevel }); orderView(id); } catch (e) {
      if (!showFieldError(form, e)) { $('#quoteErr').textContent = e.message; $('#quoteErr').hidden = false; }
      quote.disabled = false; quote.textContent = 'Get the price';
    }
  };
  const place = $('#place');
  if (place) place.onclick = async () => {
    place.disabled = true; place.textContent = 'Sending to the printer…';
    try { await api(`/api/orders/${id}/place`, 'POST'); await refreshMe(); orderView(id); } catch (e) { $('#placeErr').textContent = e.message; $('#placeErr').hidden = false; place.disabled = false; place.textContent = 'Place order'; await refreshMe(); }
  };
}

// ---------- Router ----------

async function route() {
  stopTimers();
  setChrome();
  if (!state.me?.user) return signInView();
  const [name, id] = location.hash.slice(1).split('?')[0].split('/');
  try {
    if (name === 'new') return newView();
    if (name === 'book' && id) return await bookView(id);
    if (name === 'wallet') return await walletView();
    if (name === 'order' && id) return await orderView(id);
    return await booksView();
  } catch (e) {
    view.innerHTML = `<div class="notice err">${esc(e.message)}</div>`;
  }
}

async function boot() {
  for (let i = 0; ; i++) {
    try {
      [state.stories] = await Promise.all([fetch('/api/stories').then((r) => { if (!r.ok) throw new Error(); return r.json(); }), refreshMe()]);
      return route();
    } catch {
      if (i === 30) { view.innerHTML = '<div class="notice err">The site isn’t responding. Please reload the page in a minute.</div>'; return; }
      view.innerHTML = '<div class="card stack"><h2>Waking up the server…</h2><p class="muted">The site sleeps when nobody has used it for a while. This takes up to a minute.</p></div>';
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

window.addEventListener('hashchange', route);
boot();

// Blog page (/blog): the list of articles and, at /blog?p=<slug>, one article with a photo viewer.
import { t, getLang } from './i18n.js';

const $ = (sel, root = document) => root.querySelector(sel);
const LOCALE = { en: 'en-GB', si: 'si-LK', ta: 'ta-LK' };
const TOOTH = 'M20 6c-9 0-15 7-15 17 0 8 4 13 6 22 2 9 4 13 8 13 5 0 5-12 13-12s8 12 13 12c4 0 6-4 8-13 2-9 6-14 6-22 0-10-6-17-15-17-6 0-8 3-12 3S26 6 20 6z';
const ICON = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  photo: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7M8 11h5"/>',
  wifi: '<path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0M12 19h.01"/><path d="M3 3l18 18"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
};
const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;
const toothSvg = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="${TOOTH}"/></svg>`;

const listView = $('#bl-list-view');
const article = $('#bl-article');
const state = {
  posts: null, categories: [], loading: false, failed: false,
  cat: '', q: '',
  slug: null, current: null, more: [], articleState: null, // null | 'loading' | 'missing' | 'error'
  listScroll: 0,
};
const cache = new Map(); // slug -> { post, more }

function api(path) {
  return fetch(path, { headers: { Accept: 'application/json' } }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
    return data;
  });
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v; // only ever our own icon markup
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
}

const formatDate = (iso) => (iso ? new Intl.DateTimeFormat(LOCALE[getLang()], { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)) : '');
const postHref = (slug) => `/blog?p=${encodeURIComponent(slug)}`;
// Posts without a cover get one of a few coloured backgrounds, always the same one for the same post.
const tone = (slug) => [...slug].reduce((n, ch) => (n + ch.charCodeAt(0)) % 4, 0);

// ---------- post text ----------
// Staff write plain text: an empty line starts a new paragraph, "## " a heading and "- " a list item.
// Everything is added as text, never as HTML.

function renderBody(target, body) {
  target.replaceChildren();
  const blocks = String(body || '').replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  for (const raw of blocks) {
    const lines = raw.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim());
    if (!lines.length) continue;
    let para = [];
    let list = null;
    const flushPara = () => {
      if (!para.length) return;
      const p = el('p');
      para.forEach((line, i) => { if (i) p.append(el('br')); p.append(line.trim()); });
      target.append(p);
      para = [];
    };
    for (const line of lines) {
      const s = line.trim();
      if (/^#{2,3}\s+/.test(s)) {
        flushPara(); list = null;
        target.append(el(s.startsWith('###') ? 'h3' : 'h2', { text: s.replace(/^#{2,3}\s+/, '') }));
      } else if (/^[-*•]\s+/.test(s)) {
        flushPara();
        if (!list) { list = el('ul'); target.append(list); }
        list.append(el('li', { text: s.replace(/^[-*•]\s+/, '') }));
      } else {
        list = null;
        para.push(s);
      }
    }
    flushPara();
  }
}

// ---------- cards ----------

function cover(post, { eager = false } = {}) {
  const box = el('div', { class: `bl-cover tone-${tone(post.slug)}` });
  if (post.cover) {
    const img = el('img', { src: post.cover, alt: '', loading: eager ? 'eager' : 'lazy', decoding: 'async' });
    img.addEventListener('load', () => box.classList.add('ld'), { once: true });
    if (img.complete) box.classList.add('ld');
    box.append(img);
  } else {
    box.classList.add('no-img');
    box.append(el('span', { class: 'bl-cover-mark', html: toothSvg }));
  }
  if (post.imageCount > 1) {
    box.append(el('span', { class: 'bl-photos', html: svg('photo') }, [el('span', { text: t('blog.photos', { n: post.imageCount }) })]));
  }
  return box;
}

function meta(post) {
  return el('p', { class: 'bl-meta' }, [
    el('time', { datetime: post.publishedAt, text: formatDate(post.publishedAt) }),
    el('span', { class: 'bl-dot', 'aria-hidden': 'true' }),
    el('span', { class: 'bl-min', html: svg('clock') }, [el('span', { text: t('blog.minRead', { n: post.readMinutes }) })]),
  ]);
}

function card(post, i = 0) {
  const a = el('a', { class: 'bl-card', href: postHref(post.slug), 'data-slug': post.slug, style: `--i:${Math.min(i, 8)}` }, [
    cover(post),
    el('div', { class: 'bl-card-body' }, [
      post.category ? el('span', { class: 'bl-cat-pill', text: post.category }) : null,
      el('h3', { text: post.title }),
      el('p', { class: 'bl-excerpt', text: post.excerpt }),
      el('div', { class: 'bl-card-foot' }, [meta(post), el('span', { class: 'bl-go', 'aria-hidden': 'true', html: svg('arrow') })]),
    ]),
  ]);
  return a;
}

function featured(post) {
  return el('a', { class: 'bl-feature', href: postHref(post.slug), 'data-slug': post.slug }, [
    cover(post, { eager: true }),
    el('div', { class: 'bl-feature-body' }, [
      el('div', { class: 'bl-feature-tags' }, [
        el('span', { class: 'bl-latest', html: svg('star') }, [el('span', { text: t('blog.latest') })]),
        post.category ? el('span', { class: 'bl-cat-pill', text: post.category }) : null,
      ]),
      el('h2', { text: post.title }),
      el('p', { class: 'bl-excerpt', text: post.excerpt }),
      meta(post),
      el('span', { class: 'btn btn-primary bl-feature-btn' }, [el('span', { text: t('blog.read') }), el('span', { html: svg('arrow'), class: 'bl-ic' })]),
    ]),
  ]);
}

function skeletons(n) {
  return Array.from({ length: n }, () => el('div', { class: 'bl-card bl-skel', 'aria-hidden': 'true' }, [
    el('div', { class: 'bl-cover' }), el('div', { class: 'bl-card-body' }, [el('i'), el('i'), el('i')]),
  ]));
}

// ---------- list ----------

function visiblePosts() {
  const q = state.q.trim().toLocaleLowerCase();
  return (state.posts || []).filter((p) => (!state.cat || p.category === state.cat)
    && (!q || [p.title, p.excerpt, p.category].some((s) => s && s.toLocaleLowerCase().includes(q))));
}

function renderCats() {
  const box = $('#bl-cats');
  box.replaceChildren();
  if (!state.posts?.length || !state.categories.length) { box.hidden = true; return; }
  box.hidden = false;
  for (const value of ['', ...state.categories]) {
    const b = el('button', { type: 'button', class: 'bl-chip', 'aria-pressed': String(state.cat === value), 'data-cat': value, text: value || t('blog.all') });
    box.append(b);
  }
}

function showState(kind) {
  const box = $('#bl-state');
  box.hidden = !kind;
  if (!kind) return;
  const conf = {
    empty: { ic: 'book', title: 'blog.empty.title', text: 'blog.empty.text' },
    noMatch: { ic: 'search', title: 'blog.noMatch.title', text: 'blog.noMatch.text', btn: 'blog.clear' },
    error: { ic: 'wifi', title: 'blog.loadError', btn: 'blog.retry' },
  }[kind];
  box.dataset.kind = kind;
  $('#bl-state-ic').innerHTML = svg(conf.ic);
  $('#bl-state-title').textContent = t(conf.title);
  setText('#bl-state-text', conf.text ? t(conf.text) : '');
  const btn = $('#bl-state-btn');
  btn.hidden = !conf.btn;
  if (conf.btn) btn.textContent = t(conf.btn);
}

function renderList() {
  const grid = $('#bl-grid');
  const feat = $('#bl-featured');
  const count = $('#bl-count');
  $('#bl-q-clear').hidden = !state.q;
  renderCats();
  if (!state.posts) {
    feat.replaceChildren();
    grid.replaceChildren(...(state.failed ? [] : skeletons(6)));
    count.textContent = '';
    showState(state.failed ? 'error' : null);
    return;
  }
  const posts = visiblePosts();
  const filtering = Boolean(state.cat || state.q.trim());
  count.textContent = posts.length === 1 ? t('blog.countOne') : t('blog.count', { n: posts.length });
  count.hidden = !state.posts.length;
  const showFeature = !filtering && posts.length > 0;
  feat.replaceChildren(...(showFeature ? [featured(posts[0])] : []));
  grid.replaceChildren(...posts.slice(showFeature ? 1 : 0).map(card));
  showState(!state.posts.length ? 'empty' : !posts.length ? 'noMatch' : null);
}

async function loadList() {
  if (state.loading) return;
  state.loading = true;
  state.failed = false;
  renderList();
  try {
    const { posts, categories } = await api('/api/posts');
    state.posts = posts;
    state.categories = categories;
    if (state.cat && !categories.includes(state.cat)) state.cat = '';
  } catch {
    state.failed = true;
  } finally {
    state.loading = false;
    renderList();
    // An article that was not found suggests others, which may only just have arrived.
    if (state.slug && (state.articleState === 'missing' || state.articleState === 'error')) renderArticle();
  }
}

$('#bl-cats').addEventListener('click', (e) => {
  const chip = e.target.closest('.bl-chip');
  if (!chip) return;
  state.cat = chip.dataset.cat;
  renderList();
});
let searchTimer;
$('#bl-q').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.q = e.target.value; renderList(); }, 120);
});
$('#bl-search').addEventListener('submit', (e) => {
  e.preventDefault();
  state.q = $('#bl-q').value;
  renderList();
  $('#bl-q').blur();
  $('#bl-count').scrollIntoView({ behavior: 'smooth', block: 'center' });
});
function clearFilters() {
  state.q = '';
  state.cat = '';
  $('#bl-q').value = '';
  renderList();
}
$('#bl-q-clear').addEventListener('click', () => { clearFilters(); $('#bl-q').focus(); });
$('#bl-state-btn').addEventListener('click', () => {
  if ($('#bl-state').dataset.kind === 'error') loadList();
  else clearFilters();
});

// ---------- one article ----------

function setText(id, text) {
  const node = $(id);
  node.textContent = text || '';
  node.hidden = !text;
}

function renderArticle() {
  const s = state.articleState;
  const post = state.current;
  article.classList.toggle('is-loading', s === 'loading');
  article.classList.toggle('is-missing', s === 'missing' || s === 'error');
  if (s === 'loading') {
    setText('#bl-a-cat', '');
    $('#bl-a-title').textContent = '';
    setText('#bl-a-summary', '');
    $('#bl-a-date').textContent = '';
    $('#bl-a-min').textContent = '';
    $('#bl-a-cover').hidden = true;
    $('#bl-a-body').replaceChildren(...[1, 2, 3, 4].map(() => el('i', { class: 'bl-line' })));
    $('#bl-gallery').hidden = true;
    $('#bl-more').hidden = true;
    return;
  }
  if (s === 'missing' || s === 'error') {
    setText('#bl-a-cat', '');
    $('#bl-a-title').textContent = t(s === 'missing' ? 'blog.notFound.title' : 'blog.loadError');
    setText('#bl-a-summary', s === 'missing' ? t('blog.notFound.text') : '');
    $('#bl-a-cover').hidden = true;
    const body = $('#bl-a-body');
    body.replaceChildren();
    if (s === 'error') {
      const retry = el('button', { type: 'button', class: 'btn btn-ghost', text: t('blog.retry') });
      retry.addEventListener('click', () => openArticle(state.slug, { push: false }));
      body.append(retry);
    }
    $('#bl-gallery').hidden = true;
    renderMore(state.posts ? state.posts.slice(0, 3) : []);
    document.title = `${t(s === 'missing' ? 'blog.notFound.title' : 'blog.docTitle')} · SELF DOC`;
    return;
  }
  if (!post) return;
  setText('#bl-a-cat', post.category);
  $('#bl-a-title').textContent = post.title;
  setText('#bl-a-summary', post.summary);
  $('#bl-a-date').textContent = formatDate(post.publishedAt);
  $('#bl-a-min').textContent = t('blog.minRead', { n: post.readMinutes });
  const coverImg = post.images.find((i) => i.url === post.cover) || post.images[0];
  const coverBtn = $('#bl-a-cover');
  coverBtn.hidden = !coverImg;
  if (coverImg) {
    const img = $('#bl-a-cover-img');
    if (img.getAttribute('src') !== coverImg.url) {
      coverBtn.classList.remove('ld');
      img.onload = () => coverBtn.classList.add('ld');
      img.src = coverImg.url;
      if (img.complete) coverBtn.classList.add('ld');
    }
    if (coverImg.width && coverImg.height) coverBtn.style.aspectRatio = `${coverImg.width} / ${coverImg.height}`;
    coverBtn.dataset.index = String(post.images.indexOf(coverImg));
    coverBtn.setAttribute('aria-label', t('blog.openPhoto', { n: post.images.indexOf(coverImg) + 1 }));
  }
  renderBody($('#bl-a-body'), post.body);
  renderGallery(post);
  renderMore(state.more);
  document.title = `${post.title} · SELF DOC`;
}

function renderGallery(post) {
  const box = $('#bl-gallery');
  const grid = $('#bl-gallery-grid');
  box.hidden = post.images.length < 2;
  grid.replaceChildren();
  if (box.hidden) return;
  $('#bl-gallery-n').textContent = String(post.images.length);
  // A mosaic of up to 5 photos; the fifth says "+N" when there are more (all of them are in the viewer).
  const shown = post.images.slice(0, 5);
  const extra = post.images.length - shown.length;
  grid.dataset.n = String(shown.length);
  shown.forEach((img, i) => {
    const tile = el('button', { type: 'button', class: 'bl-tile', 'data-index': String(i), 'aria-label': t('blog.openPhoto', { n: i + 1 }), style: `--i:${i}` });
    if (extra && i === shown.length - 1) {
      tile.append(el('span', { class: 'bl-tile-more', 'aria-hidden': 'true', text: `+${extra + 1}` }));
      tile.setAttribute('aria-label', `${t('blog.openPhoto', { n: i + 1 })} (${t('blog.photos', { n: post.images.length })})`);
    }
    const pic = el('img', { src: img.url, alt: '', loading: 'lazy', decoding: 'async', width: img.width, height: img.height });
    pic.addEventListener('load', () => tile.classList.add('ld'), { once: true });
    if (pic.complete) tile.classList.add('ld');
    tile.append(pic);
    grid.append(tile);
  });
}

function renderMore(posts) {
  $('#bl-more').hidden = !posts.length;
  $('#bl-more-grid').replaceChildren(...posts.map(card));
}

async function openArticle(slug, { push = true } = {}) {
  if (push) history.pushState({ slug, fromList: !state.slug }, '', postHref(slug));
  if (!state.slug) state.listScroll = window.scrollY;
  state.slug = slug;
  showView('article');
  window.scrollTo(0, 0);
  const cached = cache.get(slug);
  if (cached) {
    Object.assign(state, { current: cached.post, more: cached.more, articleState: null });
  } else {
    Object.assign(state, { current: null, more: [], articleState: 'loading' });
  }
  renderArticle();
  updateProgress();
  if (!cached) {
    try {
      const data = await api(`/api/posts/${encodeURIComponent(slug)}`);
      cache.set(slug, data);
      if (state.slug !== slug) return;
      Object.assign(state, { current: data.post, more: data.more, articleState: null });
    } catch (err) {
      if (state.slug !== slug) return;
      state.articleState = err.status === 404 ? 'missing' : 'error';
    }
    renderArticle();
    updateProgress();
  }
  $('#bl-a-title').focus({ preventScroll: true });
}

function closeArticle({ push = true } = {}) {
  if (push) history.pushState({}, '', '/blog');
  state.slug = null;
  state.current = null;
  showView('list');
  document.title = `${t('blog.docTitle')} · SELF DOC`;
  if (!state.posts && !state.loading) loadList();
  requestAnimationFrame(() => window.scrollTo(0, state.listScroll));
  updateProgress();
}

function showView(name) {
  listView.hidden = name !== 'list';
  article.hidden = name !== 'article';
  document.body.classList.toggle('reading', name === 'article');
}

// Open articles in place (the page stays loaded), but let people open them in a new tab as usual.
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[data-slug]');
  if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  openArticle(link.dataset.slug);
});
$('#bl-back').addEventListener('click', (e) => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  // Go back if the list is the page before, so the browser's own back and forward stay tidy.
  if (history.state?.slug && history.state.fromList) history.back();
  else closeArticle();
});
window.addEventListener('popstate', () => route({ push: false }));

function route({ push = false } = {}) {
  const slug = new URLSearchParams(location.search).get('p');
  if (slug) openArticle(slug, { push });
  else if (state.slug) closeArticle({ push });
}

// ---------- share ----------

let toastTimer;
function toast(text) {
  const box = $('#bl-toast');
  box.textContent = text;
  box.hidden = false;
  box.classList.remove('out');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.classList.add('out'); setTimeout(() => { box.hidden = true; }, 300); }, 2200);
}

function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
  return legacyCopy(text);
}
function legacyCopy(text) {
  const area = el('textarea', { readonly: true, style: 'position:fixed;opacity:0;top:0' });
  area.value = text;
  document.body.append(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  return ok ? Promise.resolve() : Promise.reject(new Error('copy failed'));
}

$('#bl-share').addEventListener('click', async () => {
  const post = state.current;
  if (!post) return;
  const url = new URL(postHref(post.slug), location.origin).href;
  if (navigator.share) {
    try { await navigator.share({ title: post.title, text: post.excerpt, url }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  copyText(url).then(() => toast(t('blog.copied')), () => toast(url));
});

// ---------- reading progress ----------

const bar = $('#bl-progress');
function updateProgress() {
  if (article.hidden) { bar.style.setProperty('--p', 0); bar.classList.remove('on'); return; }
  const body = $('#bl-a-body');
  const start = article.offsetTop;
  const end = body.offsetTop + body.offsetHeight - window.innerHeight * 0.6;
  const p = end > start ? (window.scrollY - start) / (end - start) : 1;
  bar.style.setProperty('--p', Math.max(0, Math.min(1, p)).toFixed(4));
  bar.classList.add('on');
}
window.addEventListener('scroll', () => requestAnimationFrame(updateProgress), { passive: true });
window.addEventListener('resize', updateProgress);

// ---------- photo viewer ----------

const lb = $('#bl-lightbox');
const lbImg = $('#bl-lb-img');
const viewer = { index: 0, opener: null };
const photos = () => state.current?.images || [];

function openViewer(index, opener) {
  if (!photos().length) return;
  viewer.opener = opener || document.activeElement;
  lb.hidden = false;
  document.body.classList.add('lb-open');
  const strip = $('#bl-lb-strip');
  strip.replaceChildren(...photos().map((img, i) => el('button', { type: 'button', class: 'bl-lb-thumb', 'data-index': String(i), 'aria-label': t('blog.openPhoto', { n: i + 1 }) }, [el('img', { src: img.url, alt: '', loading: 'lazy' })])));
  strip.hidden = photos().length < 2;
  showPhoto(index, 0);
  requestAnimationFrame(() => lb.classList.add('open'));
  $('#bl-lb-close').focus();
}

function closeViewer() {
  if (lb.hidden) return;
  lb.classList.remove('open');
  document.body.classList.remove('lb-open');
  setTimeout(() => { if (!lb.classList.contains('open')) lb.hidden = true; }, 220);
  viewer.opener?.focus?.({ preventScroll: true });
}

function showPhoto(index, dir = 0) {
  const list = photos();
  if (!list.length) return;
  viewer.index = (index + list.length) % list.length;
  const img = list[viewer.index];
  const stage = $('#bl-lb-stage');
  stage.classList.remove('ld', 'from-left', 'from-right');
  void stage.offsetWidth; // restart the slide-in animation
  if (dir) stage.classList.add(dir > 0 ? 'from-right' : 'from-left');
  lbImg.onload = () => stage.classList.add('ld');
  lbImg.src = img.url;
  if (lbImg.complete) stage.classList.add('ld');
  $('#bl-lb-count').textContent = list.length > 1 ? t('blog.photoOf', { n: viewer.index + 1, total: list.length }) : '';
  $('#bl-lb-prev').hidden = $('#bl-lb-next').hidden = list.length < 2;
  document.querySelectorAll('.bl-lb-thumb').forEach((b, i) => b.setAttribute('aria-current', String(i === viewer.index)));
  document.querySelector('.bl-lb-thumb[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  // Fetch the neighbours now so moving through the photos feels instant.
  for (const n of [1, -1]) { const next = list[(viewer.index + n + list.length) % list.length]; if (next) new Image().src = next.url; }
}

article.addEventListener('click', (e) => {
  const tile = e.target.closest('.bl-tile, .bl-a-cover');
  if (tile) openViewer(Number(tile.dataset.index) || 0, tile);
});
$('#bl-lb-close').addEventListener('click', closeViewer);
$('#bl-lb-prev').addEventListener('click', () => showPhoto(viewer.index - 1, -1));
$('#bl-lb-next').addEventListener('click', () => showPhoto(viewer.index + 1, 1));
$('#bl-lb-strip').addEventListener('click', (e) => {
  const b = e.target.closest('.bl-lb-thumb');
  if (b) showPhoto(Number(b.dataset.index), Number(b.dataset.index) > viewer.index ? 1 : -1);
});
lb.addEventListener('click', (e) => { if (e.target === lb || e.target.id === 'bl-lb-stage') closeViewer(); });
document.addEventListener('keydown', (e) => {
  if (lb.hidden) return;
  if (e.key === 'Escape') { e.stopImmediatePropagation(); closeViewer(); }
  else if (e.key === 'ArrowLeft') showPhoto(viewer.index - 1, -1);
  else if (e.key === 'ArrowRight') showPhoto(viewer.index + 1, 1);
  else if (e.key === 'Tab') { // keep focus inside the viewer
    const items = [...lb.querySelectorAll('button:not([hidden])')].filter((b) => b.offsetParent);
    const i = items.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); items.at(-1)?.focus(); }
    else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0]?.focus(); }
  }
}, true);

// Swipe left or right to move between photos, or down to close.
let touch = null;
lb.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' && !e.target.closest('.bl-lb-strip, .bl-lb-btn')) touch = { x: e.clientX, y: e.clientY }; });
lb.addEventListener('pointerup', (e) => {
  if (!touch) return;
  const dx = e.clientX - touch.x;
  const dy = e.clientY - touch.y;
  touch = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) showPhoto(viewer.index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  else if (dy > 90 && dy > Math.abs(dx)) closeViewer();
});
lb.addEventListener('pointercancel', () => { touch = null; });

// ---------- start ----------

function applyChrome() {
  $('#year').textContent = new Date().getFullYear();
  if (!state.slug) document.title = `${t('blog.docTitle')} · SELF DOC`;
}

window.addEventListener('langchange', () => {
  applyChrome();
  renderList();
  if (state.slug) renderArticle();
  if (!lb.hidden) showPhoto(viewer.index);
});

applyChrome();
const startSlug = new URLSearchParams(location.search).get('p');
if (startSlug) {
  history.replaceState({ slug: startSlug }, '', location.href);
  openArticle(startSlug, { push: false });
}
loadList();

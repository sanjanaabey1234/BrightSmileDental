// Website interactions: language and theme switches, mobile menu, sticky navigation and scroll-in animations.
import { LANGS, getLang, setLang, applyPage } from './i18n.js';

const root = document.documentElement;
const THEME_KEY = 'selfdoc_theme';
const themeMeta = document.querySelector('meta[name="theme-color"]');
const syncThemeMeta = () => themeMeta?.setAttribute('content', root.dataset.theme === 'dark' ? '#0a1315' : '#f6f9f8');
syncThemeMeta();

applyPage();

document.getElementById('theme-toggle')?.addEventListener('click', () => {
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, root.dataset.theme); } catch { /* storage unavailable */ }
  syncThemeMeta();
});

// Language menus (data-lang-menu): a button showing the current language and a list of choices.
function initLangMenu(menu) {
  const button = menu.querySelector('.lang-btn');
  const list = menu.querySelector('.lang-list');
  const current = menu.querySelector('.lang-current');
  list.innerHTML = '';
  for (const lang of LANGS) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'lang-item';
    item.setAttribute('role', 'menuitemradio');
    item.dataset.lang = lang.code;
    item.lang = lang.code;
    item.innerHTML = '<span class="lang-short"></span><span class="lang-label"></span><span class="lang-check" aria-hidden="true"></span>';
    item.querySelector('.lang-short').textContent = lang.short;
    item.querySelector('.lang-label').textContent = lang.label;
    item.addEventListener('click', () => { close(); setLang(lang.code); });
    list.append(item);
  }
  const sync = () => {
    const code = getLang();
    current.textContent = LANGS.find((l) => l.code === code).short;
    list.querySelectorAll('.lang-item').forEach((el) => el.setAttribute('aria-checked', String(el.dataset.lang === code)));
  };
  const close = () => { list.hidden = true; button.setAttribute('aria-expanded', 'false'); };
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = list.hidden;
    list.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) list.querySelector('[aria-checked="true"]')?.focus();
  });
  document.addEventListener('click', (e) => { if (!menu.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !list.hidden) { close(); button.focus(); } });
  window.addEventListener('langchange', sync);
  sync();
}
document.querySelectorAll('[data-lang-menu]').forEach(initLangMenu);

// Mobile menu
const menuBtn = document.getElementById('menu-btn');
const links = document.getElementById('nav-links');
const setMenu = (open) => {
  links.classList.toggle('open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
};
menuBtn?.addEventListener('click', () => setMenu(!links.classList.contains('open')));
links?.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && links?.classList.contains('open')) setMenu(false); });

// Navigation bar gets a background once the page scrolls.
const nav = document.getElementById('nav');
const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

// Fade sections in as they scroll into view.
const revealItems = document.querySelectorAll('[data-reveal]');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('in');
      io.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
  revealItems.forEach((el) => io.observe(el));
} else {
  revealItems.forEach((el) => el.classList.add('in'));
}

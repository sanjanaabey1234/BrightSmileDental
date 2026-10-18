// Website interactions: theme switch, mobile menu, sticky navigation and scroll-in animations.

const root = document.documentElement;
const THEME_KEY = 'selfdoc_theme';
const themeMeta = document.querySelector('meta[name="theme-color"]');
const syncThemeMeta = () => themeMeta?.setAttribute('content', root.dataset.theme === 'dark' ? '#0a1315' : '#f6f9f8');
syncThemeMeta();

document.getElementById('theme-toggle')?.addEventListener('click', () => {
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, root.dataset.theme); } catch { /* storage unavailable */ }
  syncThemeMeta();
});

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

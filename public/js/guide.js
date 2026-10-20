// Guide page (/guide): the patient guide video with chapters, and step cards that jump to each part.
import { t } from './i18n.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const video = $('#gd-video');
const player = $('#gd-player');
const playBtn = $('#gd-play');
const chapters = $$('#gd-chapter-list button').map((b) => ({ el: b, t: Number(b.dataset.t) }));
let clinic = null;

function startAt(seconds) {
  if (Number.isFinite(seconds)) {
    const seek = () => { try { video.currentTime = seconds; } catch { /* not ready yet: plays from the start */ } };
    // iPhones load nothing before the first tap, and ignore a jump until the video's length is known.
    if (video.readyState >= 1) seek();
    else video.addEventListener('loadedmetadata', seek, { once: true });
  }
  video.play().catch(() => { /* the browser blocked playing; the controls still work */ });
}

// The big play button on the poster
playBtn.addEventListener('click', () => startAt(null));
const syncPlayBtn = () => player.classList.toggle('started', !video.paused || video.currentTime > 0.2);
video.addEventListener('play', syncPlayBtn);
video.addEventListener('pause', syncPlayBtn);
video.addEventListener('timeupdate', syncPlayBtn); // also after jumping to a chapter

// Chapter list and the "Watch this part" buttons
document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-t]');
  if (!b) return;
  startAt(Number(b.dataset.t));
  if (!b.closest('#gd-chapter-list')) {
    const top = player.getBoundingClientRect().top + scrollY - 90;
    window.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
});

// Highlight the chapter being played, with a small progress bar inside it.
function syncChapter() {
  const now = video.currentTime;
  const end = video.duration || chapters.at(-1).t + 20;
  chapters.forEach((c, i) => {
    const next = chapters[i + 1]?.t ?? end;
    const on = now >= c.t && now < next;
    c.el.toggleAttribute('aria-current', on);
    c.el.style.setProperty('--p', on ? ((now - c.t) / (next - c.t)).toFixed(3) : now >= next ? 1 : 0);
  });
}
video.addEventListener('timeupdate', syncChapter);
video.addEventListener('seeked', syncChapter);
video.addEventListener('loadedmetadata', syncChapter);

// Number keys 1-5 jump to a chapter while the player has focus.
player.addEventListener('keydown', (e) => {
  const n = Number(e.key);
  if (n >= 1 && n <= chapters.length && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); startAt(chapters[n - 1].t); }
});

function applyText() {
  $('#gd-safe-text').textContent = t('guide.safeText', { n: clinic?.emergencyNumber || '1990' });
  document.title = `${t('guide.docTitle')} · ${clinic?.name || 'SELF DOC'}`;
  $('#year').textContent = new Date().getFullYear();
}

window.addEventListener('langchange', applyText);
applyText();
syncChapter();
fetch('/api/config').then((r) => r.json()).then((data) => { clinic = data.clinic; applyText(); }).catch(() => {});

// Runs in <head> before the page paints: applies the saved (or system) colour theme and the
// saved language, and marks that JavaScript is available so scroll animations can start hidden.
(function () {
  var root = document.documentElement;
  root.classList.add('js');
  var saved = null;
  var lang = null;
  try {
    saved = localStorage.getItem('selfdoc_theme');
    lang = localStorage.getItem('selfdoc_lang');
  } catch (e) { /* storage unavailable */ }
  var dark = saved ? saved === 'dark' : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  if (lang === 'si' || lang === 'ta') {
    root.lang = lang;
    // Hide the English text until the translation is applied (CSS reveals it anyway after a moment).
    root.classList.add('i18n-pending');
  }
})();

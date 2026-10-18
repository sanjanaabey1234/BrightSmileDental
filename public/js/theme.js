// Runs in <head> before the page paints: applies the saved (or system) colour theme
// and marks that JavaScript is available so scroll animations can start hidden.
(function () {
  var root = document.documentElement;
  root.classList.add('js');
  var saved = null;
  try { saved = localStorage.getItem('selfdoc_theme'); } catch (e) { /* storage unavailable */ }
  var dark = saved ? saved === 'dark' : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
})();

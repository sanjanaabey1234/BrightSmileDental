// Runs in <head> before the staff dashboard paints: applies the saved (or system) colour theme.
// Shares the website's setting, so the theme follows staff between the two.
(function () {
  var root = document.documentElement;
  var saved = null;
  try { saved = localStorage.getItem('selfdoc_theme'); } catch (e) { /* storage unavailable */ }
  var dark = saved ? saved === 'dark' : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
})();

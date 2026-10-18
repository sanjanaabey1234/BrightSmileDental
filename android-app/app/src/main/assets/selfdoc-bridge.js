// Injected by the SELF DOC Android app into SELF DOC pages only (the app restricts it to the site's
// origin). It connects website features to the phone without changing the website:
// saving downloads (CSV export), print / save as PDF, copy to clipboard, the Back button,
// and matching the phone's status bar to the page colour.
(function () {
  if (window.__selfdocApp) return;
  var bridge = window.SelfDocApp;
  if (!bridge) return;
  window.__selfdocApp = true;

  function post(msg) {
    try { bridge.postMessage(JSON.stringify(msg)); } catch (e) { /* app not reachable */ }
  }

  // ---------- downloads ----------
  // A WebView cannot save "blob:" download links, so remember each blob and hand it to the app.
  var blobs = new Map();
  var createURL = URL.createObjectURL.bind(URL);
  var revokeURL = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = function (obj) {
    var url = createURL(obj);
    if (obj instanceof Blob) blobs.set(url, obj);
    return url;
  };
  // Pages often revoke the link right after clicking it; keep it a minute so the app can read it.
  URL.revokeObjectURL = function (url) {
    setTimeout(function () { blobs.delete(url); revokeURL(url); }, 60000);
  };

  function saveBlob(blob, name) {
    var reader = new FileReader();
    reader.onload = function () {
      post({ type: 'save', name: name || 'download', mime: blob.type || 'application/octet-stream', data: String(reader.result).split(',')[1] || '' });
    };
    reader.readAsDataURL(blob);
  }

  function downloadBlob(link) {
    return link && link.hasAttribute('download') ? blobs.get(link.href) : null;
  }

  var anchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    var blob = downloadBlob(this);
    if (blob) { saveBlob(blob, this.getAttribute('download')); return; }
    return anchorClick.call(this);
  };
  document.addEventListener('click', function (e) {
    var link = e.target && e.target.closest ? e.target.closest('a[download]') : null;
    var blob = downloadBlob(link);
    if (blob) { e.preventDefault(); saveBlob(blob, link.getAttribute('download')); }
  }, true);

  // ---------- print / save as PDF ----------
  // The result card fades in (opacity 0 -> 1). The page copies it into a print area just before
  // printing, and Android would capture that copy while it is still invisible, so animations are
  // switched off for printing and any running ones are finished first.
  function stopAnimationsForPrint() {
    if (!document.getElementById('selfdoc-print-style') && document.head) {
      var style = document.createElement('style');
      style.id = 'selfdoc-print-style';
      style.textContent = '@media print { *, *::before, *::after { animation: none !important; transition: none !important; } }';
      document.head.appendChild(style);
    }
    if (document.getAnimations) {
      document.getAnimations().forEach(function (a) { try { a.finish(); } catch (e) { /* endless animation */ } });
    }
  }
  window.print = function () {
    stopAnimationsForPrint();
    post({ type: 'print', title: document.title });
  };

  // ---------- copy ----------
  try {
    if (navigator.clipboard) {
      Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true,
        value: function (text) { post({ type: 'copy', text: String(text) }); return Promise.resolve(); },
      });
    }
  } catch (e) { /* keep the browser's own clipboard */ }

  // ---------- Back button ----------
  // Closes whatever is open (chat window, language or phone menu, patient details) and reports
  // whether it did; every one of these already closes on the Escape key.
  window.__selfdocBack = function () {
    var shown = function (el) { return !!el && !el.hidden; };
    var open = shown(document.getElementById('drawer'))
      || shown(document.getElementById('chat'))
      || Array.prototype.some.call(document.querySelectorAll('.lang-list'), shown)
      || !!document.querySelector('#nav-links.open');
    if (!open) return false;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return true;
  };

  // ---------- status bar colour ----------
  var lastColor = '';
  function reportColor() {
    if (!document.body) return;
    var color = getComputedStyle(document.body).backgroundColor;
    if (color && color !== lastColor) { lastColor = color; post({ type: 'theme', color: color }); }
  }
  function watchTheme() {
    reportColor();
    // The theme switch changes <html data-theme>; the background may fade, so check again after it.
    new MutationObserver(function () { reportColor(); setTimeout(reportColor, 450); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchTheme);
  else watchTheme();
  window.addEventListener('pageshow', reportColor);
})();

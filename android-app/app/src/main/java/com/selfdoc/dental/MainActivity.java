package com.selfdoc.dental;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.activity.EdgeToEdge;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.google.android.material.snackbar.Snackbar;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Collections;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The SELF DOC patient app: the live website and chatbot in a WebView, plus the phone features a
 * plain WebView lacks: saving downloads, print / save as PDF, copying, a Back button that closes
 * open panels first, Call/Email links, and an offline screen that retries by itself.
 */
public class MainActivity extends AppCompatActivity {

    private static final String BRIDGE_NAME = "SelfDocApp";
    private static final long SPLASH_MAX_MS = 4000;
    private static final Pattern CSS_COLOR =
            Pattern.compile("rgba?\\(\\s*([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)(?:\\s*[,/]\\s*([\\d.]+%?))?");
    private static final String BACK_SCRIPT =
            "(function(){try{return !!(window.__selfdocBack&&window.__selfdocBack());}catch(e){return false;}})()";

    private Uri site;
    private Set<String> siteOrigins;
    private String bridgeScript;
    private boolean bridgeAtDocumentStart;

    private View root;
    private WebView webView;
    private ProgressBar progress;
    private View offline;

    private boolean firstPageShown;
    private boolean splashTimedOut;
    /** The page that could not load while the offline screen is showing; null otherwise. */
    private String failedUrl;
    private ConnectivityManager.NetworkCallback networkCallback;

    /** The page this screen opens with; the staff app opens the dashboard instead. */
    protected String startPath() {
        return "/";
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
        // Keep the splash until the first page has loaded (or a few seconds at most).
        splash.setKeepOnScreenCondition(() -> !firstPageShown && !splashTimedOut);
        new Handler(Looper.getMainLooper()).postDelayed(() -> splashTimedOut = true, SPLASH_MAX_MS);

        EdgeToEdge.enable(this);
        setContentView(R.layout.activity_main);
        root = findViewById(R.id.root);
        webView = findViewById(R.id.web);
        progress = findViewById(R.id.progress);
        offline = findViewById(R.id.offline);
        findViewById(R.id.retry).setOnClickListener(v -> retry());

        site = Uri.parse(BuildConfig.SITE_URL);
        siteOrigins = Collections.singleton(site.getScheme() + "://" + site.getAuthority());
        bridgeScript = readAsset("selfdoc-bridge.js");

        // Keep the page clear of the status bar, navigation bar, camera cut-out and keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets keyboard = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));
            return WindowInsetsCompat.CONSUMED;
        });

        setUpWebView();
        setUpBackButton();
        watchNetwork();

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(startUrl());
        }
    }

    private String startUrl() {
        return site.buildUpon().path(startPath()).build().toString();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setUpWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString() + " SelfDocApp/" + BuildConfig.VERSION_NAME);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            // The website has its own dark theme; don't let Android darken it a second time.
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings, false);
        }
        CookieManager.getInstance().setAcceptCookie(true);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        installBridge();
        webView.setWebViewClient(new SiteClient());
        webView.setWebChromeClient(new SiteChromeClient());
    }

    /** Connects selfdoc-bridge.js in the page to this activity. Only SELF DOC pages can use it. */
    private void installBridge() {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(webView, BRIDGE_NAME, siteOrigins,
                    (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                        if (isMainFrame) handleMessage(message.getData());
                    });
        } else {
            webView.addJavascriptInterface(new LegacyBridge(), BRIDGE_NAME);
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(webView, bridgeScript, siteOrigins);
            bridgeAtDocumentStart = true;
        }
    }

    /** Fallback for old WebViews without the origin-checked message channel. */
    final class LegacyBridge {
        @JavascriptInterface
        public void postMessage(String json) {
            runOnUiThread(() -> {
                if (webView != null && isOnSite(webView.getUrl())) handleMessage(json);
            });
        }
    }

    private boolean isOnSite(String url) {
        return url != null && isOnSite(Uri.parse(url));
    }

    private boolean isOnSite(Uri url) {
        return url != null
                && site.getScheme().equalsIgnoreCase(url.getScheme())
                && site.getAuthority().equalsIgnoreCase(url.getAuthority());
    }

    private void handleMessage(String json) {
        if (json == null) return;
        try {
            JSONObject msg = new JSONObject(json);
            switch (msg.optString("type")) {
                case "save":
                    saveFile(msg.optString("name", "download"), msg.optString("mime", "application/octet-stream"), msg.optString("data"));
                    break;
                case "print":
                    print(msg.optString("title"));
                    break;
                case "copy":
                    copy(msg.optString("text"));
                    break;
                case "theme":
                    applyPageColor(msg.optString("color"));
                    break;
                default:
                    break;
            }
        } catch (JSONException ignored) {
            // Not a message from the bridge script.
        }
    }

    // ---------- downloads ----------

    private void saveFile(String name, String type, String base64) {
        String fileName = name.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        if (fileName.isEmpty()) fileName = "download";
        // "text/csv; charset=utf-8" -> "text/csv": Downloads and file viewers expect the bare type.
        String mime = type.split(";")[0].trim();
        if (mime.isEmpty()) mime = "application/octet-stream";
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            Uri uri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Android 10+: straight into the phone's Downloads folder, no permission needed.
                ContentResolver resolver = getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                values.put(MediaStore.Downloads.MIME_TYPE, mime);
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IOException("Downloads folder unavailable");
                try (OutputStream out = resolver.openOutputStream(uri)) {
                    if (out == null) throw new IOException("Cannot write the file");
                    out.write(bytes);
                }
                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                resolver.update(uri, values, null, null);
            } else {
                // Android 8 and 9: the app's own Download folder, opened or shared from the message.
                File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) dir = new File(getFilesDir(), "downloads");
                if (!dir.exists() && !dir.mkdirs()) throw new IOException("Cannot create the folder");
                File file = new File(dir, fileName);
                try (OutputStream out = new FileOutputStream(file)) {
                    out.write(bytes);
                }
                uri = FileProvider.getUriForFile(this, getPackageName() + ".files", file);
            }
            showSaved(fileName, uri, mime);
        } catch (IOException | RuntimeException e) {
            toast(R.string.save_failed);
        }
    }

    private void showSaved(String fileName, Uri uri, String mime) {
        int text = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? R.string.saved_to_downloads : R.string.saved_file;
        Snackbar.make(root, getString(text, fileName), Snackbar.LENGTH_LONG)
                .setDuration(6000) // long enough to read it and tap Open
                .setAction(R.string.open, v -> openFile(uri, mime))
                .show();
    }

    private void openFile(Uri uri, String mime) {
        Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivity(view);
        } catch (ActivityNotFoundException e) {
            // No viewer for this file type (common for CSV): offer to share it instead.
            Intent send = new Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(send, getString(R.string.open)));
        }
    }

    // ---------- print, copy, page colour ----------

    private void print(String title) {
        PrintManager printManager = (PrintManager) getSystemService(PRINT_SERVICE);
        if (printManager == null || webView == null) return;
        String job = title == null || title.trim().isEmpty() ? getString(R.string.app_name) : title.trim();
        // Android's print screen also offers "Save as PDF".
        printManager.print(job, webView.createPrintDocumentAdapter(job), new PrintAttributes.Builder().build());
    }

    private void copy(String text) {
        ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
        if (clipboard != null) clipboard.setPrimaryClip(ClipData.newPlainText(getString(R.string.app_name), text));
    }

    /** Paints the status and navigation bar areas in the page's background colour (light or dark theme). */
    private void applyPageColor(String css) {
        Matcher m = CSS_COLOR.matcher(css == null ? "" : css);
        if (!m.find()) return;
        String alpha = m.group(4);
        if (alpha != null && (alpha.equals("0") || alpha.equals("0%"))) return; // transparent: keep the current colour
        int color = Color.rgb(channel(m.group(1)), channel(m.group(2)), channel(m.group(3)));
        getWindow().setBackgroundDrawable(new ColorDrawable(color));
        boolean lightPage = 0.299 * Color.red(color) + 0.587 * Color.green(color) + 0.114 * Color.blue(color) > 150;
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), root);
        bars.setAppearanceLightStatusBars(lightPage);
        bars.setAppearanceLightNavigationBars(lightPage);
    }

    private static int channel(String value) {
        return Math.max(0, Math.min(255, Math.round(Float.parseFloat(value))));
    }

    // ---------- navigation, Back button, offline ----------

    private void openOutside(Uri url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, url));
        } catch (ActivityNotFoundException e) {
            toast(R.string.no_app);
        }
    }

    private void setUpBackButton() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView == null) {
                    leave();
                    return;
                }
                // First let the page close the chat window, a menu or patient details.
                webView.evaluateJavascript(BACK_SCRIPT, closed -> {
                    if ("true".equals(closed)) return;
                    if (webView != null && offline.getVisibility() != View.VISIBLE && webView.canGoBack()) webView.goBack();
                    else leave();
                });
            }

            private void leave() {
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }

    private void watchNetwork() {
        ConnectivityManager connectivity = getSystemService(ConnectivityManager.class);
        if (connectivity == null) return;
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                // Back online: reload the page that failed.
                runOnUiThread(() -> {
                    if (offline.getVisibility() == View.VISIBLE) retry();
                });
            }
        };
        try {
            connectivity.registerDefaultNetworkCallback(networkCallback);
        } catch (RuntimeException e) {
            networkCallback = null;
        }
    }

    private void retry() {
        if (webView == null) return;
        offline.setVisibility(View.GONE);
        String url = failedUrl != null ? failedUrl : startUrl();
        failedUrl = null;
        webView.loadUrl(url);
    }

    private final class SiteClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (isOnSite(url)) return false; // SELF DOC pages stay in the app
            openOutside(url);                 // phone numbers, email, maps and other websites
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (!bridgeAtDocumentStart && isOnSite(url)) view.evaluateJavascript(bridgeScript, null);
            // After a failed load the WebView also "finishes" its own error page, so the offline
            // screen is only hidden by retry() (the button, or the connection coming back).
            if (failedUrl == null) offline.setVisibility(View.GONE);
            firstPageShown = true;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!request.isForMainFrame()) return;
            failedUrl = request.getUrl().toString();
            progress.setVisibility(View.GONE);
            offline.setVisibility(View.VISIBLE);
            firstPageShown = true;
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // The page's renderer crashed or was stopped to free memory: start this screen afresh.
            ((ViewGroup) view.getParent()).removeView(view);
            view.destroy();
            webView = null;
            recreate();
            return true;
        }
    }

    private final class SiteChromeClient extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            progress.setProgress(newProgress);
            progress.setVisibility(newProgress < 100 ? View.VISIBLE : View.GONE);
        }

        @Override
        public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
            new MaterialAlertDialogBuilder(MainActivity.this)
                    .setMessage(message)
                    .setPositiveButton(android.R.string.ok, (d, w) -> result.confirm())
                    .setOnCancelListener(d -> result.confirm())
                    .show();
            return true;
        }

        @Override
        public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
            new MaterialAlertDialogBuilder(MainActivity.this)
                    .setMessage(message)
                    .setPositiveButton(android.R.string.ok, (d, w) -> result.confirm())
                    .setNegativeButton(android.R.string.cancel, (d, w) -> result.cancel())
                    .setOnCancelListener(d -> result.cancel())
                    .show();
            return true;
        }
    }

    // ---------- lifecycle ----------

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (networkCallback != null) {
            try {
                getSystemService(ConnectivityManager.class).unregisterNetworkCallback(networkCallback);
            } catch (RuntimeException ignored) {
                // already unregistered
            }
        }
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    // ---------- helpers ----------

    private String readAsset(String name) {
        try (InputStream in = getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
            return out.toString("UTF-8");
        } catch (IOException e) {
            throw new IllegalStateException("Missing app file " + name, e);
        }
    }

    private void toast(int text) {
        Toast.makeText(this, text, Toast.LENGTH_LONG).show();
    }
}

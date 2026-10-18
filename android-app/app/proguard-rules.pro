# Keep the JavaScript bridge used on phones whose WebView is too old for the modern message channel.
-keepclassmembers class com.selfdoc.dental.MainActivity$LegacyBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface

import UIKit
import WebKit

// MARK: - Site addresses

enum SiteOrigin {
    /// "https://host", or "http://host:3000" when a test server uses its own port.
    static func make(scheme: String, host: String, port: Int) -> String {
        let defaultPort = port == 0 || (scheme == "https" && port == 443) || (scheme == "http" && port == 80)
        return defaultPort ? "\(scheme)://\(host)" : "\(scheme)://\(host):\(port)"
    }
}

extension URL {
    /// The part of an address that says which website it is; nil for phone numbers, email and the like.
    var siteOrigin: String? {
        guard let scheme = scheme?.lowercased(), let host = host?.lowercased(), !host.isEmpty else { return nil }
        return SiteOrigin.make(scheme: scheme, host: host, port: port ?? 0)
    }
}

extension WKSecurityOrigin {
    var siteOrigin: String {
        SiteOrigin.make(scheme: self.protocol.lowercased(), host: host.lowercased(), port: port)
    }
}

// MARK: - Texts

/// A text in the phone's language: English, Sinhala or Tamil (English for any other language).
func localized(_ key: String) -> String {
    NSLocalizedString(key, comment: "")
}

/// A text in the website's language ("en", "si" or "ta"), for the bottom bar.
func localized(_ key: String, language: String) -> String {
    let code = String(language.lowercased().prefix(2))
    guard let path = Bundle.main.path(forResource: code, ofType: "lproj"), let bundle = Bundle(path: path) else {
        return localized(key)
    }
    return bundle.localizedString(forKey: key, value: nil, table: nil)
}

// MARK: - Colours

extension UIColor {
    /// A colour written as 0xRRGGBB, as in the website's CSS.
    convenience init(rgb: UInt32) {
        self.init(red: CGFloat((rgb >> 16) & 0xFF) / 255,
                  green: CGFloat((rgb >> 8) & 0xFF) / 255,
                  blue: CGFloat(rgb & 0xFF) / 255,
                  alpha: 1)
    }
}

/// The page's background colour as the bridge script reports it ("rgb(246, 249, 248)").
struct PageColor {
    let red: Double
    let green: Double
    let blue: Double

    /// Nil when the colour is transparent or can't be read; the app then keeps the colour it has.
    init?(css: String) {
        let pattern = #"rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: css, range: NSRange(css.startIndex..., in: css)) else { return nil }
        func group(_ index: Int) -> String? {
            guard let range = Range(match.range(at: index), in: css) else { return nil }
            return String(css[range])
        }
        if let alpha = group(4), alpha == "0" || alpha == "0%" { return nil }
        guard let r = group(1).flatMap(Double.init), let g = group(2).flatMap(Double.init),
              let b = group(3).flatMap(Double.init) else { return nil }
        red = min(255, max(0, r))
        green = min(255, max(0, g))
        blue = min(255, max(0, b))
    }

    var uiColor: UIColor {
        UIColor(red: red / 255, green: green / 255, blue: blue / 255, alpha: 1)
    }

    /// A light page gets dark status bar text (the same test as the Android app).
    var isLight: Bool {
        0.299 * red + 0.587 * green + 0.114 * blue > 150
    }
}

// MARK: - Bridge messages

/// The web view keeps its message handlers alive; this one holds the screen only weakly, so it can be freed.
final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}

// MARK: - PDF pages

/// A4 pages with a half-inch margin, for "Print / save PDF".
final class PDFPageRenderer: UIPrintPageRenderer {
    private let paper = CGRect(x: 0, y: 0, width: 595.28, height: 841.89)

    override var paperRect: CGRect { paper }
    override var printableRect: CGRect { paper.insetBy(dx: 36, dy: 36) }
}

import Foundation

/// Which website the app opens, and which of the two apps this is (SELF DOC or SELF DOC Staff).
/// The staff app is the same code built with the STAFF_APP flag (see the "SELF DOC Staff" target).
enum AppConfig {
    /// The live SELF DOC website. The patient app opens it at "/", the staff app at "/admin".
    static let siteURL: URL = {
        #if DEBUG
        // Test builds can point at a local server: in Xcode choose Product > Scheme > Edit Scheme > Run >
        // Arguments and add the environment variable SELFDOC_SITE_URL, for example http://localhost:3000
        if let custom = ProcessInfo.processInfo.environment["SELFDOC_SITE_URL"],
           let url = URL(string: custom), url.host != nil {
            return url
        }
        #endif
        return URL(string: "https://bright-smile-dental-delta.vercel.app")!
    }()

    #if STAFF_APP
    /// The page this app opens with.
    static let startPath = "/admin"
    /// Whether the app shows the Home / Free check / Blog / Book bar; the dashboard has its own navigation.
    static let showsTabs = false
    /// Logo on the launch screen (the same image the system shows while the app starts).
    static let launchLogo = "LaunchLogoStaff"
    #else
    static let startPath = "/"
    static let showsTabs = true
    static let launchLogo = "LaunchLogo"
    #endif

    static var version: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
    }
}

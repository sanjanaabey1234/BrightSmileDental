import UIKit

/// The SELF DOC iPhone app. Its one screen is WebViewController, which SceneDelegate puts in the window.
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        keepWebsiteDataOutOfBackups()
        return true
    }

    // The scene itself is described in Info.plist ("Default Configuration" -> SceneDelegate).
    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }

    /// The app holds patient health conversations, so the website's saved data and cookies stay out of iCloud
    /// and computer backups (the Android app turns backups off for the same reason).
    private func keepWebsiteDataOutOfBackups() {
        guard let library = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first else { return }
        for name in ["WebKit", "Cookies"] {
            var folder = library.appendingPathComponent(name, isDirectory: true)
            try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try? folder.setResourceValues(values)
        }
    }
}

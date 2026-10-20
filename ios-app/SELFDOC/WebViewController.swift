import Network
import UIKit
import WebKit

/// The SELF DOC app screen: the live website in a web view, plus the phone features a plain web view lacks:
/// saving downloads, print / save as PDF, copying, Call/Email links, the page's alerts and questions, an offline
/// screen that retries by itself, and (patient app) the Home / Free check / Blog / Book bar.
final class WebViewController: UIViewController {

    /// The patient app's bottom bar, in bar order.
    private enum Tab: Int, CaseIterable {
        case home, chat, blog, book

        var titleKey: String {
            switch self {
            case .home: return "nav.home"
            case .chat: return "nav.chat"
            case .blog: return "nav.blog"
            case .book: return "nav.book"
            }
        }

        var icon: (normal: String, selected: String) {
            switch self {
            case .home: return ("house", "house.fill")
            case .chat: return ("bubble.left.and.bubble.right", "bubble.left.and.bubble.right.fill")
            case .blog: return ("newspaper", "newspaper.fill")
            case .book: return ("calendar", "calendar")
            }
        }
    }

    private static let bridgeName = "SelfDocApp"
    private static let splashMaxSeconds: UInt64 = 4

    /// selfdoc-bridge.js: the same file as in the Android app.
    private static let bridgeSource: String = {
        guard let url = Bundle.main.url(forResource: "selfdoc-bridge", withExtension: "js"),
              let source = try? String(contentsOf: url, encoding: .utf8) else {
            fatalError("Missing app file selfdoc-bridge.js")
        }
        return source
    }()

    private let site = AppConfig.siteURL
    private let siteOrigin = AppConfig.siteURL.siteOrigin ?? ""
    private var webView: WKWebView!
    private let progressBar = UIProgressView(progressViewStyle: .bar)
    private let offlineView = OfflineView()
    private let splash = SplashView(logo: AppConfig.launchLogo)
    private let tabBar = UITabBar()
    private var observations: [NSKeyValueObservation] = []
    private let network = NWPathMonitor()

    /// The page that could not load while the offline screen is showing; nil otherwise.
    private var failedURL: URL?
    /// The last SELF DOC page the web view was asked to open (used if it fails).
    private var lastRequestedURL: URL?
    /// Whether the page's chat window is open (reported by the bridge script).
    private var chatOpen = false
    /// Bar item the person just tapped, kept until the page catches up.
    private var pendingTab: Tab?
    /// Whether the page is light (dark status bar text) or dark.
    private var lightPage = true

    override var preferredStatusBarStyle: UIStatusBarStyle {
        lightPage ? .darkContent : .lightContent
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        lightPage = traitCollection.userInterfaceStyle != .dark
        view.backgroundColor = UIColor(named: "PageBackground")
        makeWebView()
        layOutViews()
        setUpTabBar()
        offlineView.retryButton.addTarget(self, action: #selector(retry), for: .touchUpInside)
        Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: Self.splashMaxSeconds * 1_000_000_000)
            self?.splash.hide()
        }
        watchNetwork()
        load(AppConfig.startPath)
    }

    deinit {
        network.cancel()
    }

    // MARK: - Web view

    private func makeWebView() {
        let content = WKUserContentController()
        // The bridge script runs in SELF DOC pages only, before the page's own scripts.
        let script = "if (location.origin === '\(siteOrigin)') {\n\(Self.bridgeSource)\n}"
        content.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        content.add(WeakScriptMessageHandler(self), name: Self.bridgeName)

        let config = WKWebViewConfiguration()
        config.userContentController = content
        config.websiteDataStore = .default()
        // The guide video plays inside the page; its full-screen button opens the iPhone's own video player.
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = .all
        config.dataDetectorTypes = [] // the page decides what is a phone number or a link
        config.applicationNameForUserAgent = "Mobile/15E148 SelfDocApp/\(AppConfig.version)"

        let web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = true // swipe in from the left edge to go back
        web.allowsLinkPreview = false
        // See-through while a page loads, so the page colour shows instead of a white flash.
        web.isOpaque = false
        web.backgroundColor = .clear
        web.scrollView.backgroundColor = .clear
        #if DEBUG
        if #available(iOS 16.4, *) {
            web.isInspectable = true // Safari on a Mac > Develop menu
        }
        #endif

        observations = [
            web.observe(\.estimatedProgress, options: [.new]) { [weak self] _, _ in
                guard let screen = self else { return }
                Task { @MainActor in screen.showProgress() }
            },
            web.observe(\.isLoading, options: [.new]) { [weak self] _, _ in
                guard let screen = self else { return }
                Task { @MainActor in screen.showProgress() }
            },
            // The address also changes on Back, swipes and links inside the site.
            web.observe(\.url, options: [.new]) { [weak self] _, _ in
                guard let screen = self else { return }
                Task { @MainActor in screen.syncTabs() }
            },
        ]
        webView = web
    }

    private func layOutViews() {
        let views: [UIView] = AppConfig.showsTabs
            ? [webView, offlineView, progressBar, tabBar, splash]
            : [webView, offlineView, progressBar, splash]
        for item in views {
            item.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(item)
        }
        offlineView.isHidden = true
        progressBar.isHidden = true
        progressBar.progressTintColor = UIColor(named: "AccentColor")
        progressBar.trackTintColor = .clear
        progressBar.accessibilityIdentifier = "page-loading" // the UI tour waits for it to go

        // The page sits below the status bar and above the bottom bar (or the home indicator).
        let safe = view.safeAreaLayoutGuide
        let pageBottom = AppConfig.showsTabs ? tabBar.topAnchor : safe.bottomAnchor
        var constraints = [
            webView.topAnchor.constraint(equalTo: safe.topAnchor),
            webView.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: pageBottom),
            offlineView.topAnchor.constraint(equalTo: view.topAnchor),
            offlineView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            offlineView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            offlineView.bottomAnchor.constraint(equalTo: AppConfig.showsTabs ? tabBar.topAnchor : view.bottomAnchor),
            progressBar.topAnchor.constraint(equalTo: safe.topAnchor),
            progressBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            progressBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            progressBar.heightAnchor.constraint(equalToConstant: 3),
            splash.topAnchor.constraint(equalTo: view.topAnchor),
            splash.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            splash.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            splash.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ]
        if AppConfig.showsTabs {
            constraints += [
                tabBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                tabBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
                tabBar.bottomAnchor.constraint(equalTo: view.bottomAnchor),
                // The items sit above the home indicator; the bar's colour reaches the bottom of the screen.
                tabBar.topAnchor.constraint(equalTo: safe.bottomAnchor, constant: -49),
            ]
        }
        NSLayoutConstraint.activate(constraints)
    }

    private func load(_ pathAndHash: String) {
        guard let url = URL(string: pathAndHash, relativeTo: site)?.absoluteURL else { return }
        failedURL = nil
        offlineView.isHidden = true
        webView.load(URLRequest(url: url))
    }

    @objc private func retry() {
        let url = failedURL ?? URL(string: AppConfig.startPath, relativeTo: site)?.absoluteURL ?? site
        failedURL = nil
        offlineView.isHidden = true
        webView.load(URLRequest(url: url))
    }

    private func showProgress() {
        let progress = webView.estimatedProgress
        let loading = webView.isLoading && progress < 1
        progressBar.isHidden = !loading
        progressBar.setProgress(Float(progress), animated: loading)
    }

    private var currentPath: String {
        let path = webView?.url?.path ?? ""
        return path.isEmpty ? "/" : path
    }

    /// Back online: reload the page that failed.
    private func watchNetwork() {
        network.pathUpdateHandler = { [weak self] path in
            guard path.status == .satisfied, let screen = self else { return }
            Task { @MainActor in
                if !screen.offlineView.isHidden { screen.retry() }
            }
        }
        network.start(queue: DispatchQueue(label: "selfdoc.network"))
    }

    private func pageFailed(_ error: Error) {
        let error = error as NSError
        // Only connection problems show the offline screen. "Cancelled" means a newer page replaced this one
        // or a link went to another app.
        guard error.domain == NSURLErrorDomain, error.code != NSURLErrorCancelled else { return }
        failedURL = (error.userInfo[NSURLErrorFailingURLErrorKey] as? URL) ?? lastRequestedURL ?? webView.url
        progressBar.isHidden = true
        offlineView.isHidden = false
        splash.hide()
    }

    /// Phone numbers, email, maps and other websites open in the phone's own apps.
    private func openOutside(_ url: URL) {
        UIApplication.shared.open(url, options: [:]) { [weak self] opened in
            if !opened { self?.showNote(localized("no.app")) }
        }
    }

    // MARK: - Downloads, PDF, page colour

    /// CSV export and other downloads: saved to a file and offered in the share sheet (Save to Files, Mail, ...).
    private func saveFile(name: String, base64: String) {
        guard let data = Data(base64Encoded: base64, options: .ignoreUnknownCharacters) else {
            showNote(localized("save.failed"))
            return
        }
        do {
            share(try writeTemporaryFile(data, named: cleanFileName(name, fallback: "download")))
        } catch {
            showNote(localized("save.failed"))
        }
    }

    /// "Print / save PDF": the page laid out with the website's print styles on A4 pages, offered in the share
    /// sheet, which has Print, Save to Files, Mail, WhatsApp and the rest.
    private func savePDF(title: String) {
        let renderer = PDFPageRenderer()
        renderer.addPrintFormatter(webView.viewPrintFormatter(), startingAtPageAt: 0)
        let pages = renderer.numberOfPages
        guard pages > 0 else {
            printWithSystemScreen(title: title)
            return
        }
        let pdf = UIGraphicsPDFRenderer(bounds: renderer.paperRect).pdfData { context in
            renderer.prepare(forDrawingPages: NSRange(location: 0, length: pages))
            for page in 0..<pages {
                context.beginPage()
                renderer.drawPage(at: page, in: context.pdfContextBounds)
            }
        }
        do {
            share(try writeTemporaryFile(pdf, named: cleanFileName(title, fallback: "SELF DOC") + ".pdf"))
        } catch {
            printWithSystemScreen(title: title)
        }
    }

    /// Fallback: the iPhone's print screen (its share button can also save a PDF).
    private func printWithSystemScreen(title: String) {
        let info = UIPrintInfo(dictionary: nil)
        info.jobName = title.isEmpty ? "SELF DOC" : title
        info.outputType = .general
        let printer = UIPrintInteractionController.shared
        printer.printInfo = info
        printer.printFormatter = webView.viewPrintFormatter()
        printer.present(animated: true, completionHandler: nil)
    }

    private func cleanFileName(_ name: String, fallback: String) -> String {
        let clean = name.replacingOccurrences(of: #"[\\/:*?"<>|]"#, with: "_", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return clean.isEmpty ? fallback : clean
    }

    private func writeTemporaryFile(_ data: Data, named name: String) throws -> URL {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("shared", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let file = folder.appendingPathComponent(name)
        try data.write(to: file, options: .atomic)
        return file
    }

    private func share(_ file: URL) {
        let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        if let popover = sheet.popoverPresentationController {
            popover.sourceView = view
            popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.maxY - 120, width: 1, height: 1)
        }
        topController()?.present(sheet, animated: true)
    }

    /// Paints the status bar area (and the bottom bar) to match the page, in the light or dark theme.
    private func applyPageColor(_ css: String) {
        guard let color = PageColor(css: css) else { return }
        lightPage = color.isLight
        view.backgroundColor = color.uiColor
        webView.underPageBackgroundColor = color.uiColor
        setNeedsStatusBarAppearanceUpdate()
        styleTabBar()
    }

    // MARK: - Dialogs

    /// The view controller on top, which can show something new; nil if the screen is busy changing.
    private func topController() -> UIViewController? {
        guard viewIfLoaded?.window != nil else { return nil }
        var top: UIViewController = self
        while let presented = top.presentedViewController {
            top = presented
        }
        return top.isBeingDismissed || top.isBeingPresented ? nil : top
    }

    /// Shows a dialog; if it can't be shown right now, `fallback` answers instead (a waiting page needs an answer).
    private func presentDialog(_ alert: UIAlertController, fallback: @escaping () -> Void) {
        guard let top = topController(), !(top is UIAlertController) else {
            fallback()
            return
        }
        top.present(alert, animated: true)
    }

    private func showNote(_ message: String) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: localized("ok"), style: .default))
        presentDialog(alert) {}
    }

    // MARK: - Bottom bar (patient app): Home, Free check, Blog, Book

    private func setUpTabBar() {
        guard AppConfig.showsTabs else { return }
        tabBar.delegate = self
        tabBar.items = Tab.allCases.map { tab in
            let item = UITabBarItem(title: localized(tab.titleKey),
                                    image: UIImage(systemName: tab.icon.normal),
                                    selectedImage: UIImage(systemName: tab.icon.selected))
            item.tag = tab.rawValue
            return item
        }
        tabBar.selectedItem = tabBar.items?.first
        styleTabBar()
    }

    private func navigate(_ tab: Tab) {
        let pageShown = offlineView.isHidden
        let path = currentPath
        pendingTab = tab
        switch tab {
        case .home:
            // Main page: close the chat if it is open and go back to the top.
            if pageShown && path == "/" {
                runPageAction("home") { [weak self] in self?.load("/") }
            } else {
                load("/")
            }
        case .chat:
            // The chatbot fills the screen like its own page.
            if pageShown && path == "/" {
                runPageAction("openChat") { [weak self] in self?.load("/#check") }
            } else {
                load("/#check")
            }
        case .blog:
            // On the blog already: back to the list of articles (or to its top).
            if pageShown && path == "/blog" {
                pendingTab = nil // the address already says blog
                runPageAction("blog") { [weak self] in self?.load("/blog") }
            } else {
                load("/blog")
            }
        case .book:
            if pageShown && path == "/book" {
                pendingTab = nil
                runPageAction("top", fallback: nil)
            } else {
                load("/book")
            }
        }
    }

    /// Asks the page to do something itself (open or close the chat, scroll up); falls back if it can't.
    private func runPageAction(_ action: String, fallback: (() -> Void)?) {
        let script = "(function(){try{return !!(window.__selfdocNav&&window.__selfdocNav('\(action)'));}catch(e){return false;}})()"
        webView.evaluateJavaScript(script) { result, _ in
            if (result as? Bool) != true { fallback?() }
        }
    }

    /// Highlights the bar item for where the person is: booking page, blog, chat window, or home.
    private func syncTabs() {
        guard AppConfig.showsTabs, webView != nil else { return }
        let path = currentPath
        let target: Tab = pendingTab
            ?? (path == "/book" ? .book : path == "/blog" ? .blog : chatOpen ? .chat : .home)
        guard let item = tabBar.items?[target.rawValue], tabBar.selectedItem !== item else { return }
        tabBar.selectedItem = item
    }

    /// Shows the bar's labels in the website's language (English, Sinhala or Tamil).
    private func setTabLabels(_ language: String) {
        guard AppConfig.showsTabs, let items = tabBar.items else { return }
        for tab in Tab.allCases {
            items[tab.rawValue].title = localized(tab.titleKey, language: language)
        }
    }

    /// Website colours for the bar, light or dark to match the page.
    private func styleTabBar() {
        guard AppConfig.showsTabs else { return }
        let active = UIColor(rgb: lightPage ? 0x0B7A73 : 0x2CC4B5)
        let idle = UIColor(rgb: lightPage ? 0x687C7F : 0x86A09D)
        let appearance = UITabBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = UIColor(rgb: lightPage ? 0xFFFFFF : 0x12211F)
        appearance.shadowColor = UIColor(rgb: lightPage ? 0xE0EAE8 : 0x233A3B)
        for layout in [appearance.stackedLayoutAppearance, appearance.inlineLayoutAppearance,
                       appearance.compactInlineLayoutAppearance] {
            layout.normal.iconColor = idle
            layout.normal.titleTextAttributes = [.foregroundColor: idle]
            layout.selected.iconColor = active
            layout.selected.titleTextAttributes = [.foregroundColor: active]
        }
        tabBar.standardAppearance = appearance
        tabBar.scrollEdgeAppearance = appearance
        tabBar.tintColor = active
        tabBar.unselectedItemTintColor = idle
    }
}

// MARK: - Bottom bar taps

extension WebViewController: UITabBarDelegate {
    // Called on every tap, also on the item that is already highlighted.
    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        if let tab = Tab(rawValue: item.tag) { navigate(tab) }
    }
}

// MARK: - Messages from the bridge script

extension WebViewController: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        // Only SELF DOC pages, in the main frame, may use the bridge.
        guard message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.siteOrigin == siteOrigin,
              let json = message.body as? String, let data = json.data(using: .utf8),
              let msg = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return }
        switch msg["type"] as? String ?? "" {
        case "save":
            saveFile(name: msg["name"] as? String ?? "download", base64: msg["data"] as? String ?? "")
        case "print":
            savePDF(title: msg["title"] as? String ?? "")
        case "copy":
            UIPasteboard.general.string = msg["text"] as? String ?? ""
        case "theme":
            applyPageColor(msg["color"] as? String ?? "")
        case "chat":
            chatOpen = msg["open"] as? Bool ?? false
            if pendingTab == (chatOpen ? .chat : .home) { pendingTab = nil }
            syncTabs()
        case "lang":
            setTabLabels(msg["lang"] as? String ?? "en")
        default:
            break
        }
    }
}

// MARK: - Page loading

extension WebViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        let mainFrame = navigationAction.targetFrame?.isMainFrame ?? true
        let scheme = url.scheme?.lowercased() ?? ""
        if url.siteOrigin == siteOrigin || !mainFrame || ["about", "blob", "data"].contains(scheme) {
            if mainFrame && url.siteOrigin == siteOrigin { lastRequestedURL = url }
            decisionHandler(.allow) // SELF DOC pages stay in the app
            return
        }
        decisionHandler(.cancel)
        openOutside(url)
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        chatOpen = false // a new page starts with its chat closed
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // After a failed load the offline screen is only hidden by retry() (the button, or the connection coming back).
        if failedURL == nil { offlineView.isHidden = true }
        splash.hide()
        pendingTab = nil
        syncTabs()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        pageFailed(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        pageFailed(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // The page stopped (for example to free memory): load it again.
        if webView.url != nil {
            webView.reload()
        } else {
            load(AppConfig.startPath)
        }
    }
}

// MARK: - New windows and the page's alerts

extension WebViewController: WKUIDelegate {
    // Links that open a new window: SELF DOC pages open here, anything else outside the app.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            if url.siteOrigin == siteOrigin {
                webView.load(navigationAction.request)
            } else {
                openOutside(url)
            }
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: localized("ok"), style: .default) { _ in completionHandler() })
        presentDialog(alert, fallback: completionHandler)
    }

    // For example "Delete this post?" in the staff dashboard.
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: localized("cancel"), style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: localized("ok"), style: .default) { _ in completionHandler(true) })
        presentDialog(alert) { completionHandler(false) }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: localized("cancel"), style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: localized("ok"), style: .default) { [weak alert] _ in
            completionHandler(alert?.textFields?.first?.text ?? "")
        })
        presentDialog(alert) { completionHandler(nil) }
    }
}

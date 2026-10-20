import XCTest

/// A walk through both iPhone apps in the iPhone Simulator, used the way a person would, with a screenshot of each
/// screen. GitHub's "iPhone app" workflow runs it against a copy of the website with demo data (never the real
/// clinic data) and records a video of the whole run.
///
/// Settings come from the workflow (xcodebuild passes TEST_RUNNER_<NAME> to the tests as <NAME>):
/// SELFDOC_SITE_URL (the website copy), STAFF_PASSWORD, and SHOTS_DIR (where the screenshots are saved).
final class AppTourTests: XCTestCase {
    private let env = ProcessInfo.processInfo.environment

    override func setUpWithError() throws {
        continueAfterFailure = true // one missing step should not hide the rest of the tour
        // The tour starts a free check and signs in as staff: never against the real clinic website.
        guard env["SELFDOC_SITE_URL"] != nil else {
            throw XCTSkip("Set SELFDOC_SITE_URL to a test copy of the website (node ios-app/ci/tour-site.mjs).")
        }
    }

    // Runs first (tests run in name order): a patient does the free check, reads the blog and opens booking.
    func testPatientApp() {
        let app = XCUIApplication()
        launch(app)
        let bar = app.tabBars.firstMatch
        XCTAssertTrue(bar.waitForExistence(timeout: 60), "the bottom bar shows")
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 60), "the website shows")
        settle(app, seconds: 4)
        shot("01-home")

        app.webViews.firstMatch.swipeUp()
        settle(app)
        shot("02-home-scrolled")

        // Free check: the chatbot fills the screen. Answer the first two questions.
        bar.buttons["Free check"].tap()
        let answer = app.webViews.textFields["Message"]
        XCTAssertTrue(answer.waitForExistence(timeout: 30), "the chat's answer box shows")
        settle(app, seconds: 5) // the first question types itself out
        XCTAssertTrue(bar.buttons["Free check"].isSelected, "Free check is highlighted")
        shot("03-free-check")
        answer.tap()
        answer.typeText("Nimal")
        settle(app, seconds: 1)
        shot("04-typing-an-answer")
        let send = app.webViews.buttons["Send"]
        if send.exists { send.tap() } else { answer.typeText("\n") }
        let myself = app.webViews.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Myself")).firstMatch
        XCTAssertTrue(myself.waitForExistence(timeout: 20), "the next question offers \"Myself\"")
        settle(app, seconds: 2)
        shot("05-next-question")
        if myself.exists {
            myself.tap()
            settle(app, seconds: 4)
            shot("06-age-question")
        }

        // Blog: the list, an article with its photos, and back to the list with the Blog button.
        bar.buttons["Blog"].tap()
        let article = app.webViews.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "How to brush")).firstMatch
        XCTAssertTrue(article.waitForExistence(timeout: 30), "the blog lists the brushing article")
        settle(app, seconds: 3)
        XCTAssertTrue(bar.buttons["Blog"].isSelected, "Blog is highlighted")
        shot("07-blog")
        if article.exists {
            article.tap()
            settle(app, seconds: 3)
            shot("08-article")
            app.webViews.firstMatch.swipeUp()
            settle(app)
            shot("09-article-photos")
            bar.buttons["Blog"].tap() // back to the list
            settle(app, seconds: 2)
            shot("10-blog-again")
        }

        // Book a visit.
        bar.buttons["Book"].tap()
        settle(app, seconds: 3)
        XCTAssertTrue(bar.buttons["Book"].isSelected, "Book is highlighted")
        shot("11-book")
        app.webViews.firstMatch.swipeUp()
        settle(app)
        shot("12-book-form")

        // Sideways.
        XCUIDevice.shared.orientation = .landscapeLeft
        settle(app, seconds: 2)
        shot("13-landscape")
        XCUIDevice.shared.orientation = .portrait
        settle(app, seconds: 2)

        bar.buttons["Home"].tap()
        settle(app, seconds: 2)
        XCTAssertTrue(bar.buttons["Home"].isSelected, "Home is highlighted")
        shot("14-home-again")
    }

    // Then the staff app: sign in and see the dashboard, with the check the patient just started.
    func testStaffApp() {
        let staff = XCUIApplication(bundleIdentifier: "com.selfdoc.dental.staff")
        launch(staff)
        let password = staff.webViews.secureTextFields.firstMatch
        XCTAssertTrue(password.waitForExistence(timeout: 60), "the staff sign-in shows")
        settle(staff, seconds: 2)
        shot("20-staff-sign-in")
        password.tap()
        password.typeText((env["STAFF_PASSWORD"] ?? "") + "\n")
        settle(staff, seconds: 6)
        XCTAssertFalse(password.exists, "signed in")
        shot("21-staff-dashboard")
        staff.webViews.firstMatch.swipeUp()
        settle(staff)
        shot("22-staff-dashboard-more")
    }

    // MARK: - Helpers

    private func launch(_ app: XCUIApplication) {
        if let site = env["SELFDOC_SITE_URL"] {
            app.launchEnvironment["SELFDOC_SITE_URL"] = site
        }
        // No endless page animations, or every tap waits for the app to go idle.
        app.launchEnvironment["SELFDOC_REDUCE_MOTION"] = "1"
        app.launch()
    }

    /// Waits until the page has loaded (the app's thin loading bar is gone), then a moment for animations.
    private func settle(_ app: XCUIApplication, seconds: TimeInterval = 1.5) {
        let loading = app.progressIndicators["page-loading"]
        let deadline = Date().addingTimeInterval(30)
        while loading.exists && Date() < deadline {
            Thread.sleep(forTimeInterval: 0.3)
        }
        Thread.sleep(forTimeInterval: seconds)
    }

    /// Saves a screenshot in the test results and, on GitHub, as a PNG file.
    private func shot(_ name: String) {
        print("TOUR \(Date()) \(name)")
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        if let folder = env["SHOTS_DIR"] {
            try? screenshot.pngRepresentation.write(to: URL(fileURLWithPath: folder).appendingPathComponent("\(name).png"))
        }
    }
}

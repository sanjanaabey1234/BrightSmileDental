# SELF DOC iPhone app

The iPhone version of the [Android app](../android-app/README.md). It opens the live site (`https://bright-smile-dental-delta.vercel.app`), so every feature works just as on the web. That includes the chatbot, the results, the three languages, light and dark themes, booking, the blog and the guide videos. The app needs iOS 16 or newer and an internet connection.

## Two apps, one Xcode project

[SELFDOC.xcodeproj](SELFDOC.xcodeproj) builds two apps from the same code, matching the two Android icons:

| App (scheme in Xcode) | Opens |
|---|---|
| **SELF DOC** (white tooth on teal) | The website and the oral health chatbot |
| **SELF DOC Staff** (tooth with a yellow badge) | The staff dashboard (`/admin`) |

## Bottom bar (SELF DOC app)

The same four buttons as on Android:

| Button | What it does |
|---|---|
| **Home** | Shows the main page. If the chatbot is open, it closes. |
| **Free check** | Opens the chatbot, which fills the screen like its own page. |
| **Blog** | Opens the blog. Tapping it while reading an article goes back to the list. |
| **Book** | Opens the booking page. |

- The highlighted button follows where you are, including after swiping back.
- The labels follow the website's language (English, Sinhala or Tamil), and the bar follows its light or dark theme.
- The app hides the website's "Blog" and "Book a visit" menu links, because the bar has them. The SELF DOC Staff app has no bar.

## What the app adds on top of the website

- **CSV export** (staff app) opens the iPhone share sheet: **Save to Files**, AirDrop, Mail and so on.
- **Print / save PDF** on the patient's result makes an A4 PDF and opens the share sheet, which has **Print** and **Save to Files**.
- **Copy reference** copies to the iPhone clipboard.
- **Blog post photos** (staff app): tapping the photo box offers **Photo Library** (several photos at once), **Take Photo** or **Choose File**. The iPhone turns HEIC photos into JPEG by itself.
- **Full-screen video:** the guide video's full-screen button opens the iPhone's own video player, which turns sideways.
- **Questions from the website**, such as "Delete this post?", appear as iPhone dialogs with OK and Cancel.
- **Call**, **Email** and **Get directions** open the Phone, Mail or Maps app. Other websites open in Safari.
- **Going back:** swipe in from the left edge of the screen.
- **No internet:** a "You're offline" screen with a **Try again** button. The app also reloads by itself when the connection returns.
- **Status bar:** takes the page's colour in both light and dark themes.

The app does this with the same small script as the Android app, [SELFDOC/selfdoc-bridge.js](SELFDOC/selfdoc-bridge.js), and injects it only into pages from the SELF DOC website. The two copies must stay identical; `npm test` checks this.

## See it running without a Mac

Each push that changes `ios-app/` starts the **iPhone app** workflow on GitHub ([.github/workflows/ios.yml](../.github/workflows/ios.yml)). Its **Run in the iPhone Simulator** job:

1. Starts a copy of the website on GitHub's Mac with an empty database and three demo blog posts. The real clinic data is never touched.
2. Opens both apps in Apple's iPhone Simulator.
3. Goes through them like a person would ([SELFDOCUITests/AppTourTests.swift](SELFDOCUITests/AppTourTests.swift)):
   - starts a free check and answers the first questions;
   - reads a blog article, opens booking, and turns the phone sideways;
   - signs in to the staff app.

In the finished run, download **SELF-DOC-iPhone-tour** under **Artifacts**. It has a screenshot of every screen and a video of the whole tour (`selfdoc-iphone-tour.mp4`).

On a Mac, the same tour runs with **Product › Test**, but only against a test copy of the website:
- Start the copy with `node ios-app/ci/tour-site.mjs`.
- Set `SELFDOC_SITE_URL=http://localhost:3000` and `STAFF_PASSWORD=tour-password` in the scheme's Test settings.

Without `SELFDOC_SITE_URL` it skips itself, so it never starts a free check on the real site.

## Put it on an iPhone

Apple only lets apps onto an iPhone if they are signed with an Apple ID, and building an iPhone app needs a Mac. There are three ways to do this.

### 1. With a Mac and Xcode

1. Install **Xcode** from the Mac App Store (free).
2. Open `ios-app/SELFDOC.xcodeproj`.
3. Click the project in the left panel. For the target **SELF DOC**, open **Signing & Capabilities** and choose your Apple ID under **Team** (**Add an Account…** if it isn't listed). If Xcode says the bundle identifier is taken, change `com.selfdoc.dental` to something of your own, such as `com.yourname.selfdoc`.
4. Connect the iPhone with a cable, choose it at the top of the window, and press **▶ Run**.
5. The first time, the iPhone asks you to do two things:
   - Turn on **Settings › Privacy & Security › Developer Mode**.
   - Trust the developer under **Settings › General › VPN & Device Management**.
6. For the staff app, choose the **SELF DOC Staff** scheme next to ▶, set its Team the same way, and run it.

With a free Apple ID the apps stop opening after 7 days; run them from Xcode again to renew them. A paid **Apple Developer Program** membership ($99 a year) makes them last a year and lets you share them through **TestFlight** or the **App Store**.

### 2. Without a Mac: GitHub builds it, Windows installs it

1. Push the code to GitHub. The **iPhone app** workflow ([.github/workflows/ios.yml](../.github/workflows/ios.yml)) builds both apps on one of GitHub's Macs. You can watch it in the repository's **Actions** tab, or start it there with **Run workflow**.
2. Open the finished run. Under **Artifacts**, download **SELF-DOC-iPhone-apps-unsigned**. It's a zip containing `SELFDOC-1.3.1-unsigned.ipa` and `SELFDOCStaff-1.3.1-unsigned.ipa`.
3. Use **Sideloadly** (or **AltStore**) on the Windows PC. It signs an `.ipa` with your Apple ID and installs it on an iPhone connected by cable. Its website lists what it needs; for Sideloadly that's iTunes and iCloud for Windows.
4. On the iPhone, turn on **Developer Mode** and trust your Apple ID, as in steps 5 of the Mac method.

The 7-day limit for free Apple IDs applies here too.

### 3. Quickest: add the website to the Home Screen

In Safari, open the website, tap **Share › Add to Home Screen**. The SELF DOC icon appears on the Home Screen. Do the same on `/admin` for the staff dashboard, which gets the staff icon. This opens the site in Safari, so everything on the website works, but the app-only extras above (bottom bar, offline screen and so on) are not there.

## App Store

Publishing needs the Apple Developer Program and a Mac (or a rented cloud Mac). In Xcode, choose **Product › Archive**, then **Distribute App**. Apple reviews apps that mostly show a website more strictly ("minimum functionality"). The bottom bar, offline screen, PDF sharing and photo features help, but approval isn't guaranteed.

## Change it

- **Website address:** `siteURL` in [SELFDOC/AppConfig.swift](SELFDOC/AppConfig.swift).
- **Test against a computer's local server:** in Xcode, choose **Product › Scheme › Edit Scheme › Run › Arguments**. Add the environment variable `SELFDOC_SITE_URL` with a value such as `http://localhost:3000` (this works in the iPhone Simulator). Only test builds read it.
- **For each new version**, raise **Version** (`MARKETING_VERSION`) and **Build** (`CURRENT_PROJECT_VERSION`) for both targets, so iPhones accept it as an update.

## Files

```
SELFDOC.xcodeproj         The Xcode project: targets "SELF DOC" and "SELF DOC Staff"
SELFDOC/AppConfig.swift   Website address; which app is which (the staff target sets STAFF_APP)
SELFDOC/WebViewController.swift   The screen: web view, bottom bar, downloads, PDF, dialogs, offline
SELFDOC/OfflineView.swift, SplashView.swift, Helpers.swift, AppDelegate.swift, SceneDelegate.swift
SELFDOC/selfdoc-bridge.js The script shared with the Android app
SELFDOC/*.lproj           App texts in English, Sinhala and Tamil
SELFDOC/Assets.xcassets   App icons, launch logos, colours
SELFDOC/Info.plist        App settings, including the permission messages
```

## Privacy

- The website's saved data and cookies are kept out of iCloud and computer backups, because the app holds health conversations. The Android app turns backups off for the same reason.
- The app asks for the **camera** only when someone chooses **Take Photo** in the staff app's photo box. It asks to **add to Photos** only when someone saves a blog photo. It uses no other permissions and no tracking.

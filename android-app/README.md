# SELF DOC Android app

An Android app for the SELF DOC website. It opens the live site (`https://bright-smile-dental-delta.vercel.app`), so every feature works just as on the web. That includes the chatbot, the results, the three languages, light and dark themes, booking, and live staff updates. Nothing in the website itself was changed for the app.

## Two icons, one APK

Installing the APK adds two icons to the phone:

| Icon | Opens |
|---|---|
| **SELF DOC** (white tooth on teal) | The website and the oral health chatbot |
| **SELF DOC Staff** (tooth with a yellow badge) | The staff dashboard (`/admin`) |

## What the app adds on top of the website

A plain web view can't do some things a browser can, so the app connects them to the phone:

- **CSV export** in the staff dashboard saves the file to the phone's **Downloads** folder.
- **Print / save as PDF** on the patient's result opens Android's print screen, which includes **Save as PDF**.
- **Copy reference** copies to the phone's clipboard.
- **Call** and **Email** buttons open the phone dialler or email app.
- The **Back button** first closes whatever is open: the chatbot, a menu, or a patient's details. After that it goes back a page, then leaves the app.
- **No internet:** a "You're offline" screen with a **Try again** button. The app also reloads by itself when the connection returns.
- **Phone bars:** the status bar and navigation bar take the page's colour in both light and dark themes.

The app does this with a small script, [app/src/main/assets/selfdoc-bridge.js](app/src/main/assets/selfdoc-bridge.js). The app injects it only into pages from the SELF DOC website.

## Install the APK on a phone

The ready-to-install file is `release/SELF-DOC-1.0.0.apk` on the computer that built it. APK files are not uploaded to GitHub.

1. Copy `SELF-DOC-1.0.0.apk` to the phone, or send it by email, Google Drive or WhatsApp.
2. Open the file on the phone. If Android asks, allow your file manager or browser to **install unknown apps**.
3. Tap **Install**. If Play Protect warns about an unknown developer, choose **Install anyway**. This happens with any app that isn't from the Play Store.

The app needs Android 8.0 or newer and an internet connection.

## Build it yourself

You need JDK 17 or newer and the Android SDK (platform 36). Android Studio includes both. Then:

```bash
cd android-app
gradlew assembleRelease     # signed APK: app/build/outputs/apk/release/app-release.apk
gradlew assembleDebug       # test APK:   app/build/outputs/apk/debug/app-debug.apk
```

- **To point the app at a different website address**, change `SITE_URL` in [app/build.gradle](app/build.gradle).
- **For each new version**, raise `versionCode` and `versionName` in [app/build.gradle](app/build.gradle) so phones accept it as an update.

## The signing key: keep a backup

Release APKs are signed with `selfdoc-release.jks`, using the passwords in `keystore.properties`. Neither file is committed to Git.

**Keep a private backup of both files.** An update must be signed with the same key, or phones refuse to install it over the old version. The Google Play Store needs the same key too.

## Privacy

- Android cloud backup is off for this app, because it holds health conversations.
- The app has no extra permissions apart from internet access.

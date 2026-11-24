# Android application

The Android app is a native Kotlin and Jetpack Compose application. It does not load the website in a WebView. It includes the Vazirmatn font and keeps courses, meetings, notes, links, events, and preferences on the device.

The minimum Android version is Android 7 (API 24). GitHub Actions builds and signs a release APK on pushes to `main`. Configure these repository Actions secrets:

- `KEYSTORE_BASE64`
- `KEYSTORE_PASSWORD`
- `KEY_ALIAS`
- `KEY_PASSWORD`

The web version remains in the repository root and continues to deploy through GitHub Pages. The APK is built from the native Android project.

To move existing data from an older WebView APK, export its JSON backup before installing this native version, then use Settings → Load backup. The native app uses its own local storage and cannot read the old WebView's private browser storage directly.

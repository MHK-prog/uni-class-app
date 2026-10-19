# Android WebView app

The APK bundles the current web app files under `appassets.androidplatform.net`, so the schedule opens offline and keeps its data in the app's local storage.

GitHub Actions builds and signs a release APK on pushes to `main`. Add these repository Actions secrets:

- `KEYSTORE_BASE64`
- `KEYSTORE_PASSWORD`
- `KEY_ALIAS`
- `KEY_PASSWORD`

The public APK download link is the latest release asset at `https://github.com/MHK-prog/uni-class-app/releases/latest/download/app-release.apk`.

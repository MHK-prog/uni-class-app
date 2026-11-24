# ایکلاس برای اندروید

ایکلاس یک برنامهٔ بومی Kotlin و Jetpack Compose است و سایت را در WebView باز نمی‌کند. فونت وزیر داخل برنامه است و درس‌ها، زمان‌ها، یادداشت‌ها، پیوندها، رویدادها و تنظیمات را روی دستگاه نگه می‌دارد. از منوی برنامه می‌توانید زنگ هشدار کلاس‌ها را روشن کنید و زمان یادآوری را انتخاب کنید.

The minimum Android version is Android 7 (API 24). GitHub Actions builds and signs a release APK on pushes to `main`. Configure these repository Actions secrets:

- `KEYSTORE_BASE64`
- `KEYSTORE_PASSWORD`
- `KEY_ALIAS`
- `KEY_PASSWORD`

The web version remains in the repository root and continues to deploy through GitHub Pages. The APK is built from the native Android project.

To move existing data from an older WebView APK, export its JSON backup before installing this native version, then use Settings → Load backup. The native app uses its own local storage and cannot read the old WebView's private browser storage directly.

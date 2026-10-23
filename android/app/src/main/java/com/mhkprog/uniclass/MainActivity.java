package com.mhkprog.uniclass;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.ValueCallback;
import android.widget.Toast;

import androidx.webkit.ServiceWorkerClientCompat;
import androidx.webkit.ServiceWorkerControllerCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    private static final String APP_URL = "https://appassets.androidplatform.net/assets/www/index.html";
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final int FILE_PICKER_REQUEST = 31;
    private static final int SAVE_BACKUP_REQUEST = 32;

    private WebView webView;
    private WebViewAssetLoader assetLoader;
    private ValueCallback<Uri[]> filePickerCallback;
    private String pendingBackupJson;
    private boolean notifyBackupResult;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(9, 8, 13));
        getWindow().setNavigationBarColor(Color.rgb(9, 8, 13));
        if (android.os.Build.VERSION.SDK_INT >= 29) {
            getWindow().setStatusBarContrastEnforced(false);
            getWindow().setNavigationBarContrastEnforced(false);
        }

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(9, 8, 13));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);

        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        webView.setWebViewClient(new AppWebViewClient());
        webView.setWebChromeClient(new AppWebChromeClient());
        webView.addJavascriptInterface(new ScheduleBridge(), "AndroidScheduleBridge");

        ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(new ServiceWorkerClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });

        setContentView(webView);
        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(APP_URL);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_PICKER_REQUEST) {
            Uri selected = resultCode == RESULT_OK && data != null ? data.getData() : null;
            if (filePickerCallback != null) {
                filePickerCallback.onReceiveValue(selected == null ? null : new Uri[]{selected});
                filePickerCallback = null;
            }
            return;
        }
        if (requestCode == SAVE_BACKUP_REQUEST) {
            Uri destination = resultCode == RESULT_OK && data != null ? data.getData() : null;
            boolean saved = false;
            if (destination != null && pendingBackupJson != null) {
                try (OutputStream output = getContentResolver().openOutputStream(destination)) {
                    if (output == null) throw new IllegalStateException("Could not open the selected file.");
                    output.write(pendingBackupJson.getBytes(StandardCharsets.UTF_8));
                    saved = true;
                    Toast.makeText(this, "نسخهٔ پشتیبان ذخیره شد.", Toast.LENGTH_SHORT).show();
                } catch (Exception error) {
                    Toast.makeText(this, "ذخیرهٔ نسخهٔ پشتیبان انجام نشد.", Toast.LENGTH_LONG).show();
                }
            }
            pendingBackupJson = null;
            if (notifyBackupResult) {
                reportBackupResult(saved);
            }
            notifyBackupResult = false;
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView == null) {
            finish();
            return;
        }
        webView.evaluateJavascript("window.handleAppBack ? window.handleAppBack() : false", result -> {
            if (!"true".equals(result) && !isFinishing()) finish();
        });
    }

    private final class AppWebChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (filePickerCallback != null) filePickerCallback.onReceiveValue(null);
            filePickerCallback = callback;
            try {
                startActivityForResult(params.createIntent(), FILE_PICKER_REQUEST);
                return true;
            } catch (Exception error) {
                filePickerCallback = null;
                callback.onReceiveValue(null);
                return false;
            }
        }
    }

    private final class ScheduleBridge {
        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(MainActivity.this::finish);
        }

        @JavascriptInterface
        public void saveBackup(String json) {
            requestBackupSave(json, "class-schedule.json", false);
        }

        @JavascriptInterface
        public void saveBackupForImport(String json, String filename) {
            requestBackupSave(json, filename, true);
        }

        @JavascriptInterface
        public void openExternalUrl(String value) {
            Uri uri = Uri.parse(value);
            String scheme = uri.getScheme();
            if (uri.getHost() == null || !("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))) return;
            runOnUiThread(() -> MainActivity.this.openExternalUrl(uri));
        }
    }

    private void requestBackupSave(String json, String filename, boolean notifyWeb) {
        if (json == null || json.isEmpty()) {
            if (notifyWeb) reportBackupResult(false);
            return;
        }
        runOnUiThread(() -> {
            pendingBackupJson = json;
            notifyBackupResult = notifyWeb;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/json");
            String safeFilename = filename == null ? "class-schedule.json" : filename.replaceAll("[^A-Za-z0-9._-]", "_");
            if (!safeFilename.toLowerCase().endsWith(".json")) safeFilename += ".json";
            intent.putExtra(Intent.EXTRA_TITLE, safeFilename);
            try {
                startActivityForResult(intent, SAVE_BACKUP_REQUEST);
            } catch (Exception error) {
                pendingBackupJson = null;
                notifyBackupResult = false;
                if (notifyWeb) reportBackupResult(false);
                Toast.makeText(MainActivity.this, "ذخیرهٔ نسخهٔ پشتیبان ممکن نشد.", Toast.LENGTH_LONG).show();
            }
        });
    }

    private void reportBackupResult(boolean saved) {
        if (webView == null) return;
        webView.post(() -> webView.evaluateJavascript("window.onScheduleBackupResult && window.onScheduleBackupResult(" + saved + ")", null));
    }

    private final class AppWebViewClient extends WebViewClientCompat {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return assetLoader.shouldInterceptRequest(request.getUrl());
        }

        @Override
        @SuppressWarnings("deprecation")
        public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            return assetLoader.shouldInterceptRequest(Uri.parse(url));
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return openExternalUrl(request.getUrl());
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return openExternalUrl(Uri.parse(url));
        }
    }

    private boolean openExternalUrl(Uri uri) {
        String scheme = uri.getScheme();
        if (!("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) || APP_HOST.equalsIgnoreCase(uri.getHost())) return false;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }
}

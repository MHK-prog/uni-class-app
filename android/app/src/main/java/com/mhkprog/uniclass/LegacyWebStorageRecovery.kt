package com.mhkprog.uniclass

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONTokener

private const val LEGACY_APP_ORIGIN = "https://appassets.androidplatform.net/assets/www/index.html"
private const val LEGACY_STORAGE_KEY = "class-schedule-app-v1"
private const val LEGACY_11511_MIGRATION_CHECKED = "legacy-1-15-11-web-storage-migration-checked"

fun attemptLegacyWebStorageRecovery(
    context: Context,
    store: ScheduleStore,
    onFinished: (Boolean) -> Unit
) {
    val prefs = context.getSharedPreferences("eclass-native", Context.MODE_PRIVATE)
    if (prefs.getBoolean(LEGACY_11511_MIGRATION_CHECKED, false)) return
    if (store.state.courses.isNotEmpty() || store.state.events.isNotEmpty()) {
        prefs.edit().putBoolean(LEGACY_11511_MIGRATION_CHECKED, true).apply()
        onFinished(false)
        return
    }

    val activity = context.findActivity()
    val container = activity?.findViewById<ViewGroup>(android.R.id.content)
    if (activity == null || container == null) {
        onFinished(false)
        return
    }

    val reader = WebView(activity)
    var finished = false
    fun finish(recovered: Boolean) {
        if (finished) return
        finished = true
        prefs.edit().putBoolean(LEGACY_11511_MIGRATION_CHECKED, true).apply()
        reader.stopLoading()
        (reader.parent as? ViewGroup)?.removeView(reader)
        reader.destroy()
        onFinished(recovered)
    }

    reader.visibility = View.INVISIBLE
    reader.layoutParams = ViewGroup.LayoutParams(1, 1)
    reader.settings.javaScriptEnabled = true
    reader.settings.domStorageEnabled = true
    reader.settings.blockNetworkLoads = true
    reader.webViewClient = object : WebViewClient() {
        override fun onPageFinished(view: WebView, url: String?) {
            runCatching {
                view.evaluateJavascript("JSON.stringify(window.localStorage.getItem('$LEGACY_STORAGE_KEY'))") { encoded ->
                    val raw = runCatching { JSONTokener(encoded ?: "null").nextValue() as? String }.getOrNull()
                    finish(raw?.let(store::restoreLegacyIfEmpty) == true)
                }
            }.onFailure { finish(false) }
        }
    }

    container.addView(reader)
    runCatching {
        reader.loadDataWithBaseURL(
            LEGACY_APP_ORIGIN,
            "<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>",
            "text/html",
            "UTF-8",
            LEGACY_APP_ORIGIN
        )
    }.onFailure { finish(false) }
}

private fun Context.findActivity(): Activity? {
    var current: Context? = this
    while (current != null) {
        if (current is Activity) return current
        current = (current as? ContextWrapper)?.baseContext
    }
    return null
}

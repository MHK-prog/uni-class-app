package com.mhkprog.uniclass

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.ui.Modifier

class MainActivity : ComponentActivity() {
    private lateinit var store: ScheduleStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = ScheduleStore(applicationContext)
        window.statusBarColor = android.graphics.Color.rgb(9, 8, 13)
        window.navigationBarColor = android.graphics.Color.rgb(9, 8, 13)
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = 0
        setContent {
            EClassApp(store = store, onExit = ::finish)
        }
    }
}

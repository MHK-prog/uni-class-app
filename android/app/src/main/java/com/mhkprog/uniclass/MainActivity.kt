package com.mhkprog.uniclass

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.view.WindowCompat

class MainActivity : ComponentActivity() {
    private lateinit var store: ScheduleStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = ScheduleStore(applicationContext)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = android.graphics.Color.TRANSPARENT
        window.navigationBarColor = android.graphics.Color.TRANSPARENT
        setContent {
            EClassApp(store = store, onExit = ::finish)
        }
    }

    override fun onResume() {
        super.onResume()
        if (::store.isInitialized) ClassAlarmScheduler.sync(applicationContext, store.state)
    }
}

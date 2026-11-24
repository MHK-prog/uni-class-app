package com.mhkprog.uniclass

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

internal object ClassAlarmScheduler {
    internal const val ACTION_CLASS_ALARM = "com.mhkprog.uniclass.CLASS_ALARM"
    internal const val ACTION_REFRESH_ALARMS = "com.mhkprog.uniclass.REFRESH_CLASS_ALARMS"
    private const val CHANNEL_ID = "class-reminders"
    private const val SCHEDULER_PREFS = "eclass-alarm-scheduler"
    private const val KEY_PENDING_URIS = "pending-alarm-uris"
    private const val EXTRA_TITLE = "course-title"
    private const val EXTRA_TEACHER = "course-teacher"
    private const val EXTRA_CLASS = "class-name"
    private const val EXTRA_START = "class-start"
    private const val EXTRA_IS_REFRESH = "is-refresh"
    private const val REFRESH_URI = "eclass://class-reminder/refresh"
    private val tehranZone = ZoneId.of(PersianDates.TEHRAN_ZONE)

    fun requestExactAlarmAccess(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        if (manager.canScheduleExactAlarms()) return true
        runCatching {
            context.startActivity(
                Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
                    .setData(Uri.parse("package:${context.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }
        return false
    }

    fun sync(context: Context, state: AppState) {
        val appContext = context.applicationContext
        val manager = appContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val schedulerPrefs = appContext.getSharedPreferences(SCHEDULER_PREFS, Context.MODE_PRIVATE)
        val oldUris = schedulerPrefs.getStringSet(KEY_PENDING_URIS, emptySet()).orEmpty().toSet()
        oldUris.forEach { uri -> cancel(manager, appContext, uri) }

        val pendingUris = mutableSetOf<String>()
        if (!state.preferences.classAlarmsEnabled || !canShowNotifications(appContext)) {
            schedulerPrefs.edit().putStringSet(KEY_PENDING_URIS, emptySet()).apply()
            return
        }

        ensureNotificationChannel(appContext)
        val now = ZonedDateTime.now(tehranZone)
        val today = now.toLocalDate()
        for (dayOffset in 0L..20L) {
            val date = today.plusDays(dayOffset)
            val weekIndex = PersianDates.weekIndex(PersianDates.iso(date), state.termStartDate)
            val weekday = PersianDates.weekday(date)
            state.courses.forEach { course ->
                course.scheduleByWeek.getOrNull(weekIndex).orEmpty()
                    .filter { it.day == weekday && validTime(it.start) }
                    .forEach meetingLoop@{ meeting ->
                        val start = runCatching { LocalTime.parse(meeting.start.enDigits()) }.getOrNull() ?: return@meetingLoop
                        val reminderAt = date.atTime(start).minusMinutes(state.preferences.alarmMinutesBefore.toLong())
                            .atZone(tehranZone)
                        if (reminderAt.isAfter(now)) {
                            val uri = alarmUri(course.id, date, meeting.start)
                            val intent = alarmIntent(appContext, uri)
                                .putExtra(EXTRA_TITLE, course.title)
                                .putExtra(EXTRA_TEACHER, course.teacher)
                                .putExtra(EXTRA_CLASS, course.className)
                                .putExtra(EXTRA_START, meeting.start)
                            schedule(manager, appContext, intent, reminderAt.toInstant().toEpochMilli())
                            pendingUris += uri
                        }
                    }
            }
        }

        // Refresh tomorrow's schedule each day so reminders remain current even when the app stays closed.
        val refreshAt = today.plusDays(1).atTime(3, 0).atZone(tehranZone)
        if (refreshAt.isAfter(now)) {
            val refreshIntent = alarmIntent(appContext, REFRESH_URI, ACTION_REFRESH_ALARMS)
                .putExtra(EXTRA_IS_REFRESH, true)
            schedule(manager, appContext, refreshIntent, refreshAt.toInstant().toEpochMilli())
            pendingUris += REFRESH_URI
        }
        schedulerPrefs.edit().putStringSet(KEY_PENDING_URIS, pendingUris).apply()
    }

    fun deliver(context: Context, intent: Intent) {
        if (intent.getBooleanExtra(EXTRA_IS_REFRESH, false)) return
        if (!canShowNotifications(context)) return

        ensureNotificationChannel(context)
        val title = intent.getStringExtra(EXTRA_TITLE).orEmpty().ifBlank { "کلاس" }
        val teacher = intent.getStringExtra(EXTRA_TEACHER).orEmpty()
        val className = intent.getStringExtra(EXTRA_CLASS).orEmpty()
        val start = intent.getStringExtra(EXTRA_START).orEmpty().faDigits()
        val detail = buildList {
            if (start.isNotBlank()) add("ساعت $start")
            if (className.isNotBlank()) add("کلاس $className")
            if (teacher.isNotBlank()) add("استاد $teacher")
        }.joinToString(" · ").ifBlank { "زمان برگزاری کلاس رسیده است." }
        val notificationId = intent.dataString?.hashCode() ?: title.hashCode()
        val openApp = Intent(context, MainActivity::class.java)
            .setAction(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .setData(Uri.parse("eclass://class-reminder/open/$notificationId"))
        val contentIntent = PendingIntent.getActivity(
            context,
            notificationId,
            openApp,
            PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag()
        )
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(context, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(context)
        }
        val notification = builder
            .setSmallIcon(R.drawable.ic_notification_alarm)
            .setContentTitle("یادآوری کلاس: $title")
            .setContentText(detail)
            .setStyle(Notification.BigTextStyle().bigText(detail))
            .setCategory(Notification.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .setDefaults(Notification.DEFAULT_ALL)
            .build()
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .notify(notificationId, notification)
    }

    private fun canShowNotifications(context: Context): Boolean =
        Build.VERSION.SDK_INT < 33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun ensureNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "یادآوری کلاس‌ها", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "یادآوری زمان شروع کلاس‌های ایکلاس"
                enableVibration(true)
                setShowBadge(true)
            }
            (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(channel)
        }
    }

    private fun schedule(manager: AlarmManager, context: Context, intent: Intent, triggerAtMillis: Long) {
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag()
        )
        val exactAvailable = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager.canScheduleExactAlarms()
        val scheduledExactly = if (exactAvailable) runCatching {
            manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
        }.isSuccess else false
        if (!scheduledExactly) {
            manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
        }
    }

    private fun cancel(manager: AlarmManager, context: Context, uri: String) {
        val action = if (uri == REFRESH_URI) ACTION_REFRESH_ALARMS else ACTION_CLASS_ALARM
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            0,
            alarmIntent(context, uri, action),
            PendingIntent.FLAG_NO_CREATE or immutableFlag()
        ) ?: return
        manager.cancel(pendingIntent)
        pendingIntent.cancel()
    }

    private fun alarmIntent(context: Context, uri: String, action: String = ACTION_CLASS_ALARM) =
        Intent(context, ClassAlarmReceiver::class.java).setAction(action).setData(Uri.parse(uri))

    private fun alarmUri(courseId: String, date: LocalDate, start: String) =
        Uri.Builder().scheme("eclass").authority("class-reminder")
            .appendPath(courseId).appendPath(date.toString()).appendPath(start).build().toString()

    private fun immutableFlag() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
}

class ClassAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            Intent.ACTION_DATE_CHANGED -> ClassAlarmScheduler.sync(context, ScheduleStore(context).state)
            ClassAlarmScheduler.ACTION_CLASS_ALARM -> {
                ClassAlarmScheduler.deliver(context, intent)
                ClassAlarmScheduler.sync(context, ScheduleStore(context).state)
            }
            ClassAlarmScheduler.ACTION_REFRESH_ALARMS ->
                ClassAlarmScheduler.sync(context, ScheduleStore(context).state)
        }
    }
}

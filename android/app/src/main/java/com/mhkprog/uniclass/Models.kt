package com.mhkprog.uniclass

import android.content.Context
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

val weekDays = listOf("شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه")
val accentNames = listOf("purple", "blue", "teal", "green", "orange", "pink", "red")

data class Meeting(val day: String, val start: String, val end: String)
data class CourseLink(val id: String = newId(), val title: String, val url: String)
data class CourseNote(val id: String = newId(), val title: String, val text: String)
data class Course(
    val id: String = newId(),
    val title: String,
    val teacher: String = "",
    val className: String = "",
    val scheduleByWeek: List<List<Meeting>> = listOf(emptyList(), emptyList()),
    val links: List<CourseLink> = emptyList(),
    val notes: List<CourseNote> = emptyList()
)
data class ScheduleEvent(
    val id: String = newId(), val title: String, val date: String,
    val start: String = "", val end: String = "", val description: String = ""
)
data class AppPreferences(
    val theme: String = "dark",
    val accent: String = "purple",
    val classAlarmsEnabled: Boolean = false,
    val alarmMinutesBefore: Int = 10
)
data class AppState(
    val termStartDate: String = PersianDates.currentSaturdayISO(),
    val courses: List<Course> = emptyList(),
    val events: List<ScheduleEvent> = emptyList(),
    val preferences: AppPreferences = AppPreferences()
)

fun newId(): String = UUID.randomUUID().toString()

class ScheduleStore(context: Context) {
    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("eclass-native", Context.MODE_PRIVATE)
    var state by mutableStateOf(readState())
        private set

    fun update(transform: (AppState) -> AppState) {
        state = normalize(transform(state))
        prefs.edit().putString(KEY_STATE, encode(state).toString()).apply()
    }

    fun restore(json: String) {
        state = normalize(decode(json))
        prefs.edit().putString(KEY_STATE, encode(state).toString()).apply()
    }

    fun restoreLegacy(json: String): Boolean {
        val legacy = runCatching { normalize(decode(json)) }.getOrNull() ?: return false
        if (legacy.courses.isEmpty() && legacy.events.isEmpty()) return false
        state = legacy
        prefs.edit().putString(KEY_STATE, encode(state).toString()).apply()
        return true
    }

    fun backupJson(): String = encode(state).toString(2)

    fun saveAutomaticBackup() {
        val directory = File(appContext.filesDir, "backups").apply { mkdirs() }
        File(directory, "eclass-before-import-${System.currentTimeMillis()}.json")
            .writeText(backupJson(), Charsets.UTF_8)
    }

    private fun readState(): AppState = runCatching {
        prefs.getString(KEY_STATE, null)?.let(::decode)?.let(::normalize) ?: AppState()
    }.getOrElse { AppState() }

    private fun normalize(input: AppState): AppState = input.copy(
        termStartDate = input.termStartDate.takeIf(PersianDates::isValidIso) ?: PersianDates.currentSaturdayISO(),
        courses = input.courses.mapNotNull { course ->
            val title = course.title.faDigits().trim().take(80)
            if (title.isEmpty()) null else course.copy(
                title = title,
                teacher = course.teacher.faDigits().trim().take(80),
                className = course.className.faDigits().trim().take(50),
                scheduleByWeek = (0..1).map { week ->
                    course.scheduleByWeek.getOrNull(week).orEmpty()
                        .map { it.copy(start = it.start.enDigits(), end = it.end.enDigits()) }
                        .filter { it.day in weekDays && validTime(it.start) && validTime(it.end) && it.start < it.end }
                        .distinctBy { "${it.day}|${it.start}|${it.end}" }
                        .sortedWith(compareBy<Meeting> { weekDays.indexOf(it.day) }.thenBy { it.start })
                },
                links = course.links.mapNotNull { link ->
                    val label = link.title.faDigits().trim().take(80)
                    val url = normalizeUrl(link.url)
                    if (label.isEmpty() || url.isEmpty()) null else link.copy(title = label, url = url)
                },
                notes = course.notes.mapNotNull { note ->
                    val label = note.title.faDigits().trim().take(100)
                    if (label.isEmpty()) null else note.copy(title = label, text = note.text.faDigits().trim().take(5000))
                }
            )
        },
        events = input.events.mapNotNull { event ->
            val title = event.title.faDigits().trim().take(100)
            if (title.isEmpty() || !PersianDates.isValidIso(event.date)) null
            else event.copy(
                title = title,
                start = event.start.enDigits().takeIf(::validTime).orEmpty(),
                end = event.end.enDigits().takeIf(::validTime).orEmpty(),
                description = event.description.faDigits().trim().take(2000)
            )
        },
        preferences = AppPreferences(
            theme = if (input.preferences.theme == "light") "light" else "dark",
            accent = input.preferences.accent.takeIf { it in accentNames } ?: "purple",
            classAlarmsEnabled = input.preferences.classAlarmsEnabled,
            alarmMinutesBefore = input.preferences.alarmMinutesBefore.coerceIn(5, 60)
        )
    )

    companion object {
        private const val KEY_STATE = "state-v1"

        fun normalizeUrl(raw: String): String = runCatching {
            val candidate = raw.trim().let {
                if (it.startsWith("http://", true) || it.startsWith("https://", true)) it else "https://$it"
            }
            val uri = Uri.parse(candidate)
            if (uri.scheme in listOf("http", "https") && !uri.host.isNullOrBlank()) uri.toString() else ""
        }.getOrDefault("")

        fun decode(raw: String): AppState {
            val root = JSONObject(raw.removePrefix("\uFEFF"))
            val term = root.optJSONObject("cycle")?.optString("termStartDate", "")
                ?.takeIf(PersianDates::isValidIso)
                ?: root.optJSONObject("settings")?.optString("termStartDate", "")
                    ?.takeIf(PersianDates::isValidIso)
                ?: PersianDates.currentSaturdayISO()
            val coursesArray = root.optJSONArray("courses") ?: JSONArray()
            val courses = (0 until coursesArray.length()).mapNotNull courseLoop@{ index ->
                val item = coursesArray.optJSONObject(index) ?: return@courseLoop null
                val title = item.optString("title", item.optString("name", "")).faDigits().trim()
                if (title.isEmpty()) return@courseLoop null
                val scheduleArray = item.optJSONArray("scheduleByWeek")
                val schedules = (0..1).map { week ->
                    val entries = scheduleArray?.optJSONArray(week) ?: JSONArray()
                    (0 until entries.length()).mapNotNull meetingLoop@{ entryIndex ->
                        val entry = entries.optJSONObject(entryIndex) ?: return@meetingLoop null
                        val day = normalizeDay(entry.optString("day", entry.optString("weekday", "")))
                        val start = entry.optString("start", entry.optString("startTime", "")).enDigits()
                        val end = entry.optString("end", entry.optString("endTime", "")).enDigits()
                        if (day in weekDays && validTime(start) && validTime(end) && start < end) Meeting(day, start, end) else null
                    }
                }
                val linksArray = item.optJSONArray("links") ?: JSONArray()
                var links = (0 until linksArray.length()).mapNotNull linkLoop@{ linkIndex ->
                    val link = linksArray.optJSONObject(linkIndex) ?: return@linkLoop null
                    CourseLink(
                        id = link.optString("id").ifBlank { newId() },
                        title = link.optString("title", link.optString("label", "")),
                        url = link.optString("url", link.optString("href", ""))
                    )
                }
                if (links.isEmpty()) {
                    val oldChannel = item.optString("teacherChannel", "")
                    if (oldChannel.isNotBlank()) links = listOf(CourseLink(title = "کانال استاد", url = oldChannel))
                }
                val notesArray = item.optJSONArray("notes") ?: JSONArray()
                val notes = (0 until notesArray.length()).mapNotNull noteLoop@{ noteIndex ->
                    val note = notesArray.optJSONObject(noteIndex) ?: return@noteLoop null
                    CourseNote(
                        id = note.optString("id").ifBlank { newId() },
                        title = note.optString("title", ""),
                        text = note.optString("text", note.optString("body", ""))
                    )
                }
                Course(
                    id = item.optString("id").ifBlank { newId() }, title = title,
                    teacher = item.optString("teacher", ""),
                    className = item.optString("className", item.optString("classroom", item.optString("room", ""))),
                    scheduleByWeek = schedules, links = links, notes = notes
                )
            }
            val eventsArray = root.optJSONArray("events") ?: JSONArray()
            val events = (0 until eventsArray.length()).mapNotNull eventLoop@{ index ->
                val item = eventsArray.optJSONObject(index) ?: return@eventLoop null
                ScheduleEvent(
                    id = item.optString("id").ifBlank { newId() }, title = item.optString("title", ""),
                    date = item.optString("date", ""), start = item.optString("start", ""),
                    end = item.optString("end", ""), description = item.optString("description", "")
                )
            }
            val appearance = root.optJSONObject("preferences") ?: JSONObject()
            return AppState(
                termStartDate = term, courses = courses, events = events,
                preferences = AppPreferences(
                    theme = appearance.optString("theme", "dark"),
                    accent = appearance.optString("accent", "purple"),
                    classAlarmsEnabled = appearance.optBoolean("classAlarmsEnabled", false),
                    alarmMinutesBefore = appearance.optInt("alarmMinutesBefore", 10)
                )
            )
        }

        fun encode(state: AppState): JSONObject {
            val courses = JSONArray()
            state.courses.forEach { course ->
                val schedules = JSONArray()
                (0..1).forEach { week ->
                    val entries = JSONArray()
                    course.scheduleByWeek.getOrNull(week).orEmpty().forEach { meeting ->
                        entries.put(JSONObject().put("day", meeting.day).put("start", meeting.start).put("end", meeting.end))
                    }
                    schedules.put(entries)
                }
                val links = JSONArray()
                course.links.forEach { links.put(JSONObject().put("id", it.id).put("title", it.title).put("url", it.url)) }
                val notes = JSONArray()
                course.notes.forEach { notes.put(JSONObject().put("id", it.id).put("title", it.title).put("text", it.text)) }
                courses.put(JSONObject().put("id", course.id).put("title", course.title).put("teacher", course.teacher)
                    .put("className", course.className).put("scheduleByWeek", schedules).put("links", links).put("notes", notes))
            }
            val events = JSONArray()
            state.events.forEach { event ->
                events.put(JSONObject().put("id", event.id).put("title", event.title).put("date", event.date)
                    .put("start", event.start).put("end", event.end).put("description", event.description))
            }
            return JSONObject().put("formatVersion", 9)
                .put("cycle", JSONObject().put("termStartDate", state.termStartDate))
                .put("courses", courses).put("events", events)
                .put("preferences", JSONObject()
                    .put("theme", state.preferences.theme)
                    .put("accent", state.preferences.accent)
                    .put("classAlarmsEnabled", state.preferences.classAlarmsEnabled)
                    .put("alarmMinutesBefore", state.preferences.alarmMinutesBefore))
        }

        private fun normalizeDay(raw: String): String = when (
            raw.replace(" ", "").replace("‌", "").replace("ي", "ی").replace("ك", "ک")
        ) {
            "سهشنبه" -> "سه‌شنبه"
            "چهارشنبه" -> "چهارشنبه"
            "پنجشنبه" -> "پنجشنبه"
            "شنبه" -> "شنبه"
            "یکشنبه" -> "یکشنبه"
            "دوشنبه" -> "دوشنبه"
            "جمعه" -> "جمعه"
            else -> raw
        }
    }
}

fun validTime(value: String): Boolean = Regex("^(?:[01]\\d|2[0-3]):[0-5]\\d$").matches(value.enDigits())

fun String.faDigits(): String = map { char -> when (char) {
    in '0'..'9' -> '\u06f0' + (char - '0')
    in '\u0660'..'\u0669' -> '\u06f0' + (char - '\u0660')
    else -> char
} }.joinToString("")

fun Int.faDigits(): String = toString().faDigits()

fun String.enDigits(): String = map { char -> when (char) {
    in '\u06f0'..'\u06f9' -> '0' + (char - '\u06f0')
    in '\u0660'..'\u0669' -> '0' + (char - '\u0660')
    else -> char
} }.joinToString("")

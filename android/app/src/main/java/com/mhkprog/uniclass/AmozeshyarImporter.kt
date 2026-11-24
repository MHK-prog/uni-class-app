package com.mhkprog.uniclass

import android.util.Base64
import org.jsoup.Jsoup
import org.jsoup.nodes.Element
import java.nio.charset.Charset
import java.nio.charset.StandardCharsets

object AmozeshyarImporter {
    fun parse(bytes: ByteArray): List<Course> {
        val html = extractHtml(bytes)
        val document = Jsoup.parse(html)
        val candidates = mutableListOf<Triple<Element, Int, Columns>>()

        for (table in document.select("table")) {
            val rows = table.select("tr")
            for (headerIndex in rows.indices) {
                val headers = cells(rows[headerIndex]).map { normalizeHeader(it) }
                val columns = findColumns(headers)
                if (columns.name >= 0 && columns.teacher >= 0 && columns.schedule >= 0) {
                    candidates += Triple(table, headerIndex, columns)
                    break
                }
            }
        }
        if (candidates.isEmpty()) {
            val table = document.getElementById("panel__3")
            if (table != null && table.select("tr").size > 1) candidates += Triple(table, 0, Columns(4, 11, 14, -1, -1))
        }
        val selected = candidates.firstOrNull { it.first.id() == "panel__3" } ?: candidates.firstOrNull()
            ?: throw IllegalArgumentException("جدول درس‌های آموزشیار در فایل پیدا نشد.")
        val (table, headerIndex, columns) = selected
        val courses = linkedMapOf<String, Course>()
        val rows = table.select("tr")
        for (row in rows.drop(headerIndex + 1)) {
            val values = cells(row)
            if (values.size <= maxOf(columns.name, columns.teacher, columns.schedule)) continue
            val title = values.getOrNull(columns.name).orEmpty().trim().faDigits()
            if (title.isBlank()) continue
            val teacher = values.getOrNull(columns.teacher).orEmpty().trim().faDigits()
            val scheduleText = values.getOrNull(columns.schedule).orEmpty()
            val className = (values.getOrNull(columns.className).orEmpty().takeIf { it.isNotBlank() && it != "-" }
                ?: values.getOrNull(columns.location).orEmpty().takeIf { it.isNotBlank() && it != "-" }.orEmpty()).faDigits()
            val key = normalizeKey(title) + "|" + normalizeKey(teacher)
            val course = courses.getOrPut(key) { Course(title = title, teacher = teacher, className = className) }
            val meetings = parseSchedule(scheduleText)
            val weeks = course.scheduleByWeek.map { it.toMutableList() }.toMutableList()
            meetings.forEachIndexed { week, items -> items.forEach { if (it !in weeks[week]) weeks[week].add(it) } }
            courses[key] = course.copy(className = course.className.ifBlank { className }, scheduleByWeek = weeks)
        }
        if (courses.isEmpty()) throw IllegalArgumentException("در فایل، درس قابل وارد کردنی پیدا نشد.")
        return courses.values.map { course ->
            course.copy(scheduleByWeek = course.scheduleByWeek.map { entries ->
                entries.sortedWith(compareBy<Meeting> { weekDays.indexOf(it.day) }.thenBy { it.start })
            })
        }
    }

    private data class Columns(val name: Int, val teacher: Int, val schedule: Int, val className: Int, val location: Int)

    private fun cells(row: Element): List<String> = row.children().filter { it.tagName() == "td" || it.tagName() == "th" }.map { cell ->
        cell.select("br").append(" ")
        cell.text().replace(Regex("\\s+"), " ").trim()
    }

    private fun findColumns(headers: List<String>): Columns {
        fun index(predicate: (String) -> Boolean) = headers.indexOfFirst(predicate)
        val name = index { it.contains("نامدرس") }
        val teacher = index { it.contains("ناماستاد") || it.contains("اساتید") }
        val schedule = index { it.contains("زمان") && (it.contains("برگزاری") || it.contains("کلاس")) }
        val className = index { it.contains("نامکلاس") || it.contains("شمارهکلاس") }
        val location = index { it.contains("مکان") && it.contains("برگزاری") }
        return Columns(name, teacher, schedule, className, location)
    }

    private fun normalizeHeader(value: String): String = normalizeText(value).replace(Regex("[\\s:()（）\\-–—_]+"), "")

    private fun parseSchedule(raw: String): List<List<Meeting>> {
        val text = normalizeText(raw)
        val markers = Regex("هفته\\s*(فرد|زوج)").findAll(text).toList()
        val segments = mutableListOf<Pair<Int?, String>>()
        if (markers.isEmpty()) segments += null to text
        else {
            val first = markers.first()
            if (text.substring(0, first.range.first).isNotBlank()) segments += null to text.substring(0, first.range.first)
            markers.forEachIndexed { index, marker ->
                val end = markers.getOrNull(index + 1)?.range?.first ?: text.length
                segments += (if (marker.groupValues[1] == "فرد") 0 else 1) to text.substring(marker.range.last + 1, end)
            }
        }
        val result = listOf(mutableListOf<Meeting>(), mutableListOf())
        val dayPattern = Regex("یک\\s*شنبه|دو\\s*شنبه|سه\\s*شنبه|چهار\\s*شنبه|پنج\\s*شنبه|جمعه|شنبه")
        val timePattern = Regex("(\\d{1,2})\\s*[:٫.]\\s*(\\d{2})\\s*(?:تا|الی|[-–—])\\s*(\\d{1,2})\\s*[:٫.]\\s*(\\d{2})")
        val dayMap = mapOf(
            "شنبه" to "شنبه", "یکشنبه" to "یکشنبه", "دوشنبه" to "دوشنبه", "سهشنبه" to "سه‌شنبه",
            "چهارشنبه" to "چهارشنبه", "پنجشنبه" to "پنجشنبه", "جمعه" to "جمعه"
        )
        segments.forEach { (parity, segment) ->
            val dayMatches = dayPattern.findAll(segment).toList()
            val ranges = timePattern.findAll(segment).toList()
            var cursor = 0
            var previousDays = emptySet<String>()
            ranges.forEach { range ->
                val between = dayMatches.filter { it.range.first >= cursor && it.range.first < range.range.first }
                val candidates = if (between.isNotEmpty()) between else if (previousDays.isNotEmpty()) emptyList() else dayMatches.filter { it.range.first < range.range.first }
                if (between.isNotEmpty()) previousDays = between.mapNotNull { match -> dayMap[match.value.replace(Regex("\\s+"), "")] }.toSet()
                val days = if (candidates.isNotEmpty()) candidates.mapNotNull { dayMap[it.value.replace(Regex("\\s+"), "")] }.toSet() else previousDays
                cursor = range.range.last + 1
                val start = "${range.groupValues[1].toInt().toString().padStart(2, '0')}:${range.groupValues[2]}"
                val end = "${range.groupValues[3].toInt().toString().padStart(2, '0')}:${range.groupValues[4]}"
                if (start >= end || days.isEmpty()) return@forEach
                val targets = if (parity == null) listOf(0, 1) else listOf(parity)
                targets.forEach { week -> days.forEach { day -> result[week].add(Meeting(day, start, end)) } }
            }
        }
        return result.map { it.distinct() }
    }

    private fun normalizeText(raw: String): String = raw
        .replace(Regex("[۰-۹٠-٩]")) { match ->
            val digit = match.value[0].code
            ((if (digit in 0x06F0..0x06F9) digit - 0x06F0 else digit - 0x0660) + '0'.code).toChar().toString()
        }
        .replace('ي', 'ی').replace('ك', 'ک').replace("‌", "")
        .replace(Regex("[\\u064B-\\u065F\\u0670\\u200F]"), "")
        .replace('\u00a0', ' ').replace(Regex("\\s+"), " ").trim()

    private fun normalizeKey(value: String): String = normalizeText(value).lowercase().replace(Regex("[^a-z0-9\\u0600-\\u06ff]"), "")

    private fun extractHtml(bytes: ByteArray): String {
        val raw = String(bytes, StandardCharsets.ISO_8859_1)
        val boundary = Regex("boundary\\s*=\\s*(?:\"([^\"]+)\"|'([^']+)'|([^;\\s\\r\\n]+))", RegexOption.IGNORE_CASE)
            .find(raw.take(8192))?.groupValues?.drop(1)?.firstOrNull(String::isNotBlank)
        val parts = if (boundary.isNullOrBlank()) listOf(raw) else raw.split("--$boundary")
        for (part in parts) {
            val separator = part.indexOf("\r\n\r\n").takeIf { it >= 0 } ?: part.indexOf("\n\n").takeIf { it >= 0 } ?: continue
            val separatorSize = if (part.startsWith("\r\n\r\n", separator)) 4 else 2
            val headers = part.substring(0, separator)
            var body = part.substring(separator + separatorSize).replace(Regex("\\r?\\n--?\\s*$"), "")
            val htmlPart = Regex("content-type\\s*:\\s*text/html", RegexOption.IGNORE_CASE).containsMatchIn(headers) ||
                Regex("<html[\\s>]|<table[\\s>]").containsMatchIn(body)
            if (!htmlPart) continue
            val transfer = Regex("content-transfer-encoding\\s*:\\s*([^\\s;]+)", RegexOption.IGNORE_CASE).find(headers)?.groupValues?.get(1)?.lowercase()
            val charsetName = Regex("charset\\s*=\\s*\"?([^;\\s\"\\r\\n]+)", RegexOption.IGNORE_CASE).find(headers)?.groupValues?.get(1)
            val decoded = decodePart(body, transfer)
            val charset = runCatching { Charset.forName(charsetName ?: "UTF-8") }.getOrDefault(StandardCharsets.UTF_8)
            val text = String(decoded, charset)
            if (Regex("<html[\\s>]|<table[\\s>]").containsMatchIn(text)) return text
        }
        val utf8 = String(bytes, StandardCharsets.UTF_8)
        if (Regex("<html[\\s>]|<table[\\s>]").containsMatchIn(utf8)) return utf8
        throw IllegalArgumentException("بخش HTML در فایل پیدا نشد؛ فایل MHT آموزشیار را دوباره ذخیره کنید.")
    }

    private fun decodePart(body: String, transfer: String?): ByteArray = when (transfer) {
        "base64" -> runCatching { Base64.decode(body.filterNot(Char::isWhitespace), Base64.DEFAULT) }.getOrDefault(body.toByteArray(StandardCharsets.ISO_8859_1))
        "quoted-printable" -> {
            val compact = body.replace(Regex("=\\r?\\n"), "")
            val output = ArrayList<Byte>(compact.length)
            var index = 0
            while (index < compact.length) {
                if (compact[index] == '=' && index + 2 < compact.length) {
                    val hex = compact.substring(index + 1, index + 3).toIntOrNull(16)
                    if (hex != null) { output.add(hex.toByte()); index += 3; continue }
                }
                output.add(compact[index].code.toByte()); index++
            }
            output.toByteArray()
        }
        else -> body.toByteArray(StandardCharsets.ISO_8859_1)
    }
}

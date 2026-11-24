package com.mhkprog.uniclass

import android.icu.util.PersianCalendar
import android.icu.util.ULocale
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.TimeZone

data class JalaliDate(val year: Int, val month: Int, val day: Int)

object PersianDates {
    const val TEHRAN_ZONE = "Asia/Tehran"
    val monthNames = listOf(
        "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
        "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"
    )

    fun todayIran(): LocalDate = LocalDate.now(ZoneId.of(TEHRAN_ZONE))
    fun nowIran() = java.time.ZonedDateTime.now(ZoneId.of(TEHRAN_ZONE))

    fun currentSaturdayISO(): String {
        val today = todayIran()
        val daysSinceSaturday = (today.dayOfWeek.value + 1) % 7
        return today.minusDays(daysSinceSaturday.toLong()).toString()
    }

    fun isValidIso(value: String): Boolean = runCatching {
        Regex("\\d{4}-\\d{2}-\\d{2}").matches(value) && LocalDate.parse(value).toString() == value
    }.getOrDefault(false)

    fun parseIso(value: String): LocalDate = LocalDate.parse(value)
    fun iso(date: LocalDate): String = date.format(DateTimeFormatter.ISO_LOCAL_DATE)

    fun toJalali(date: LocalDate): JalaliDate {
        val calendar = newCalendar()
        calendar.timeInMillis = date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        return JalaliDate(calendar.get(PersianCalendar.YEAR), calendar.get(PersianCalendar.MONTH) + 1, calendar.get(PersianCalendar.DAY_OF_MONTH))
    }

    fun fromJalali(year: Int, month: Int, day: Int): LocalDate {
        require(month in 1..12)
        require(day in 1..daysInMonth(year, month))
        val calendar = newCalendar()
        calendar.clear()
        calendar.setLenient(false)
        calendar.set(PersianCalendar.YEAR, year)
        calendar.set(PersianCalendar.MONTH, month - 1)
        calendar.set(PersianCalendar.DAY_OF_MONTH, day)
        return java.time.Instant.ofEpochMilli(calendar.timeInMillis).atZone(ZoneOffset.UTC).toLocalDate()
    }

    fun daysInMonth(year: Int, month: Int): Int = if (month <= 6) 31 else if (month <= 11) 30 else {
        val currentStart = fromJalali(year, month, 1)
        val nextStart = fromJalali(if (month == 12) year + 1 else year, if (month == 12) 1 else month + 1, 1)
        ChronoUnit.DAYS.between(currentStart, nextStart).toInt()
    }

    fun shiftJalaliMonth(date: LocalDate, offset: Int): LocalDate {
        val current = toJalali(date)
        val zeroBased = current.year * 12 + (current.month - 1) + offset
        val year = Math.floorDiv(zeroBased, 12)
        val month = Math.floorMod(zeroBased, 12) + 1
        return fromJalali(year, month, minOf(current.day, daysInMonth(year, month)))
    }

    fun weekday(date: LocalDate): String = weekDays[(date.dayOfWeek.value + 1) % 7]

    fun format(date: LocalDate, includeWeekday: Boolean = false): String {
        val jalali = toJalali(date)
        val body = "${jalali.day.faDigits()} ${monthNames[jalali.month - 1]} ${jalali.year.faDigits()}"
        return if (includeWeekday) "${weekday(date)}، $body" else body
    }

    fun jalaliMonthTitle(date: LocalDate): String {
        val jalali = toJalali(date)
        return "${monthNames[jalali.month - 1]} ${jalali.year.faDigits()}"
    }

    fun monthGrid(date: LocalDate): List<LocalDate?> {
        val jalali = toJalali(date)
        val first = fromJalali(jalali.year, jalali.month, 1)
        val leading = (first.dayOfWeek.value + 1) % 7
        return buildList {
            repeat(leading) { add(null) }
            repeat(daysInMonth(jalali.year, jalali.month)) { day -> add(first.plusDays(day.toLong())) }
            while (size % 7 != 0) add(null)
        }
    }

    fun weekIndex(dateIso: String, termStartIso: String): Int {
        val days = ChronoUnit.DAYS.between(LocalDate.parse(termStartIso), LocalDate.parse(dateIso))
        return Math.floorMod(Math.floorDiv(days, 7), 2).toInt()
    }

    private fun newCalendar() = PersianCalendar(TimeZone.getTimeZone("UTC"), ULocale("fa_IR"))
}

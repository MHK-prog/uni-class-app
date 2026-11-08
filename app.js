'use strict';

const TIME_ZONE = 'Asia/Tehran';
// Keep in sync with APP_VERSION in sw.js.
const APP_VERSION = '1.15.4';
const STORAGE_KEY = 'class-schedule-app-v1';
const DAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
const WEEK_DAY_ORDER = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
const WEEK_DAY_SHORT = { شنبه: 'ش', یکشنبه: 'ی', دوشنبه: 'د', 'سه‌شنبه': 'س', 'چهارشنبه': 'چ', پنجشنبه: 'پ', جمعه: 'ج' };
const LEGACY_DEFAULT_ANCHOR = '2026-10-03';
const DEFAULT_CYCLE = { termStartDate: currentSaturdayISO() };
const numberFa = new Intl.NumberFormat('fa-IR');
const jalaliDateFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const jalaliShortDateFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' });
const jalaliPartsFormatter = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });
const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const $ = selector => document.querySelector(selector);
let state = loadState();
let selectedDateISO = targetDay(0).iso;
let selectedDateMode = 'today';
let selectedScheduleByWeek = [[], []];
let toastTimer;
let activeDetailsCourseId = '';
let activeNotesCourseId = '';
let activeModalCount = 0;
let lockedScrollY = 0;
let drawerCloseTimer;
let calendarTarget = 'dashboard';
let calendarDraftISO = '';
let calendarCursorISO = '';
let pendingAmozeshyarCourses = null;
let pendingAmozeshyarScheduleChoices = new Map();
let nativeBackupResolve = null;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && Array.isArray(saved.courses)) {
      const oldSettings = normalizeLegacySettings(saved.settings);
      const oldParity = previousStartParity(saved.cycle, oldSettings);
      const cycle = normalizeCycle(saved.cycle, oldSettings);
      const courseSettings = { ...oldSettings, anchorDate: cycle.termStartDate, anchorParity: oldParity, hasParity: true };
      const normalized = { cycle, courses: normalizeCourses(saved.courses, courseSettings, oldParity === 'even') };
      if (saved.cycle?.termStartParity || saved.cycle?.anchorParity || oldSettings.hasParity) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized)); } catch (error) { console.warn('Could not migrate saved schedule.', error); }
      }
      return normalized;
    }
  } catch (error) { console.warn('Could not load saved schedule.', error); }
  return { cycle: { ...DEFAULT_CYCLE }, courses: [] };
}

function normalizeLegacySettings(input = {}) {
  if (!input || typeof input !== 'object') input = {};
  const date = input.termStartDate || input.anchorDate || '';
  const validDate = isValidISODate(date);
  const storedParity = input.termStartParity || input.anchorParity;
  const hasParity = storedParity === 'odd' || storedParity === 'even';
  return { anchorDate: validDate ? date : LEGACY_DEFAULT_ANCHOR, anchorParity: storedParity === 'even' ? 'even' : 'odd', hasParity };
}

function normalizeCycle(input = {}, oldSettings = normalizeLegacySettings()) {
  if (!input || typeof input !== 'object') input = {};
  const date = input.termStartDate || input.anchorDate || oldSettings.anchorDate || DEFAULT_CYCLE.termStartDate;
  return { termStartDate: isValidISODate(date) ? date : DEFAULT_CYCLE.termStartDate };
}

function previousStartParity(cycle = {}, oldSettings = normalizeLegacySettings()) {
  const parity = cycle?.termStartParity || cycle?.anchorParity || (oldSettings.hasParity ? oldSettings.anchorParity : 'odd');
  return parity === 'even' ? 'even' : 'odd';
}

function isValidISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validTime(value) { return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value); }
function makeId(seed = '') { return globalThis.crypto?.randomUUID?.() || `course-${Date.now()}-${seed}-${Math.random().toString(36).slice(2, 8)}`; }

function normalizeChannelUrl(value) {
  const input = String(value || '').trim();
  if (!input) return '';
  const candidate = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  try {
    const url = new URL(candidate);
    return ['https:', 'http:'].includes(url.protocol) && url.hostname ? url.href : '';
  } catch (error) { return ''; }
}

function normalizeCourseLinks(items, legacyChannel = '') {
  const links = (Array.isArray(items) ? items : []).map((raw, index) => ({
    id: String(raw?.id || makeId(`link-${index}`)),
    title: toFaDigits(String(raw?.title || raw?.label || '').trim()).slice(0, 80),
    url: normalizeChannelUrl(raw?.url || raw?.href || '')
  })).filter(link => link.title && link.url);
  if (links.length) return links;
  const oldUrl = normalizeChannelUrl(legacyChannel);
  return oldUrl ? [{ id: makeId('legacy-link'), title: 'کانال استاد', url: oldUrl }] : [];
}

function normalizeDaysByWeek(raw, oldSettings, flipWeeks = false) {
  const normalizeRow = row => [...new Set((Array.isArray(row) ? row : []).filter(day => WEEK_DAY_ORDER.includes(day)))].sort((a, b) => WEEK_DAY_ORDER.indexOf(a) - WEEK_DAY_ORDER.indexOf(b));
  const finish = rows => flipWeeks ? [rows[1], rows[0]] : rows;
  const rawRows = raw.daysByWeek;
  if (Array.isArray(rawRows)) {
    return finish([normalizeRow(rawRows[0]), normalizeRow(rawRows[1])]);
  }
  if (rawRows && typeof rawRows === 'object') {
    const first = rawRows.first || rawRows.week1 || [];
    const second = rawRows.second || rawRows.week2 || [];
    return finish([normalizeRow(first), normalizeRow(second)]);
  }

  // Migrate the previous one-day/weekly-or-parity format into the two-week cycle.
  const day = WEEK_DAY_ORDER.includes(raw.day) ? raw.day : '';
  if (!day) return [[], []];
  const oldWeek = String(raw.week || '');
  let week = ['هفته زوج', 'هفتهٔ زوج', 'زوج'].includes(oldWeek) ? 'even'
    : ['هفته فرد', 'هفتهٔ فرد', 'فرد'].includes(oldWeek) ? 'odd' : oldWeek;
  if (!['weekly', 'even', 'odd'].includes(week)) week = 'weekly';
  if (week === 'weekly' || !week) return [[day], [day]];
  const firstParity = oldSettings.anchorParity;
  return finish(week === firstParity ? [[day], []] : [[], [day]]);
}

function normalizeScheduleByWeek(raw, oldSettings, flipWeeks = false) {
  const stored = raw.scheduleByWeek;
  if (Array.isArray(stored) || (stored && typeof stored === 'object')) {
    const source = Array.isArray(stored) ? stored : [stored.first || stored.week1 || [], stored.second || stored.week2 || []];
    let rows = [0, 1].map(index => {
      const byDay = new Map();
      for (const item of Array.isArray(source[index]) ? source[index] : []) {
        const day = item?.day || item?.weekday;
        if (!WEEK_DAY_ORDER.includes(day)) continue;
        byDay.set(day, {
          day,
          start: validTime(item.start || item.startTime) ? (item.start || item.startTime) : '',
          end: validTime(item.end || item.endTime) ? (item.end || item.endTime) : ''
        });
      }
      return WEEK_DAY_ORDER.filter(day => byDay.has(day)).map(day => byDay.get(day));
    });
    if (flipWeeks) rows = [rows[1], rows[0]];
    return rows;
  }

  // Migrate the old shared time range to each selected day.
  const daysByWeek = normalizeDaysByWeek(raw, oldSettings, flipWeeks);
  const start = validTime(raw.start) ? raw.start : '';
  const end = validTime(raw.end) ? raw.end : '';
  return daysByWeek.map(days => days.map(day => ({ day, start, end })));
}

function normalizeCourses(items, oldSettings = normalizeLegacySettings(), flipWeeks = false) {
  return items.map((raw, index) => {
    const title = toFaDigits(String(raw.title || raw.name || '').trim()).slice(0, 80);
    if (!title) return null;
    return {
      id: String(raw.id || makeId(index)), title,
      scheduleByWeek: normalizeScheduleByWeek(raw, oldSettings, flipWeeks),
      className: toFaDigits(String(raw.className ?? raw.classroom ?? raw.room ?? '').trim()).slice(0, 50),
      teacher: toFaDigits(String(raw.teacher || '').trim()).slice(0, 80),
      links: normalizeCourseLinks(raw.links, raw.teacherChannel),
      notes: normalizeNotes(raw.notes)
    };
  }).filter(Boolean);
}

function normalizeNotes(items) {
  if (!Array.isArray(items)) return [];
  return items.map((raw, index) => ({
    id: String(raw?.id || makeId(`note-${index}`)),
    title: toFaDigits(String(raw?.title || '').trim()).slice(0, 100),
    text: toFaDigits(String(raw?.text || raw?.body || '').trim()).slice(0, 5000)
  })).filter(note => note.title);
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; }
  catch (error) { showToast('ذخیره در این مرورگر ممکن نشد؛ از خروجی نسخهٔ پشتیبان بگیرید.'); return false; }
}

function iranParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { year: +value.year, month: +value.month, day: +value.day, hour: +value.hour, minute: +value.minute, second: +value.second };
}

function targetDay(offset = 0, now = new Date()) {
  const p = iranParts(now);
  const date = new Date(Date.UTC(p.year, p.month - 1, p.day + offset, 12));
  return dateFromISO(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`);
}

function dateFromISO(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return {
    year, month, day, iso, weekday: DAYS[date.getUTCDay()],
    formatted: jalaliDateFormatter.format(date), shortFormatted: jalaliShortDateFormatter.format(date)
  };
}

function jalaliPartsForISO(iso) {
  const date = dateFromISO(iso);
  const parts = Object.fromEntries(jalaliPartsFormatter.formatToParts(new Date(Date.UTC(date.year, date.month - 1, date.day, 12))).map(part => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

function shiftISODate(iso, dayOffset) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + dayOffset, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function jalaliMonthStart(iso) {
  let first = iso, current = jalaliPartsForISO(iso);
  while (true) {
    const previous = shiftISODate(first, -1), parts = jalaliPartsForISO(previous);
    if (parts.year !== current.year || parts.month !== current.month) return first;
    first = previous;
  }
}

function renderCalendar() {
  const monthStart = jalaliMonthStart(calendarCursorISO), monthParts = jalaliPartsForISO(monthStart);
  $('#calendar-month').textContent = `${JALALI_MONTHS[monthParts.month - 1]} ${numberFa.format(monthParts.year)}`;
  const firstGregorianWeekday = new Date(`${monthStart}T12:00:00Z`).getUTCDay();
  const cells = Array.from({ length: (firstGregorianWeekday + 1) % 7 }, () => {
    const blank = document.createElement('span'); blank.className = 'calendar-empty'; blank.setAttribute('aria-hidden', 'true'); return blank;
  });
  const todayISO = targetDay(0).iso;
  for (let offset = 0; offset < 32; offset += 1) {
    const iso = shiftISODate(monthStart, offset), parts = jalaliPartsForISO(iso);
    if (parts.year !== monthParts.year || parts.month !== monthParts.month) break;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'calendar-day'; button.textContent = numberFa.format(parts.day);
    button.setAttribute('aria-label', jalaliDateFormatter.format(new Date(`${iso}T12:00:00Z`)));
    if (iso === calendarDraftISO) { button.classList.add('selected'); button.setAttribute('aria-pressed', 'true'); }
    else button.setAttribute('aria-pressed', 'false');
    if (iso === todayISO) button.classList.add('today');
    button.addEventListener('click', () => { calendarDraftISO = iso; renderCalendar(); });
    cells.push(button);
  }
  $('#calendar-grid').replaceChildren(...cells);
}

function openDatePicker(target) {
  calendarTarget = target;
  calendarDraftISO = target === 'term' ? state.cycle.termStartDate : targetDay(1).iso;
  if (!isValidISODate(calendarDraftISO)) calendarDraftISO = targetDay(0).iso;
  calendarCursorISO = calendarDraftISO;
  $('#calendar-title').textContent = target === 'term' ? 'تاریخ شروع ترم' : 'انتخاب تاریخ برنامه';
  renderCalendar();
  showAppModal($('#date-picker-dialog'));
}

function saturdayOnOrBefore(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 1) % 7);
  return date;
}

function weekIndexBetween(anchorDate, dateString) {
  const anchor = saturdayOnOrBefore(anchorDate);
  const target = saturdayOnOrBefore(dateString);
  const weeks = Math.floor((target.getTime() - anchor.getTime()) / (7 * 86400000));
  return ((weeks % 2) + 2) % 2;
}

function cycleWeekIndex(dateString) { return weekIndexBetween(state.cycle.termStartDate, dateString); }

function toFaDigits(value) {
  return String(value).replace(/[0-9٠-٩۰-۹]/g, digit => {
    const code = digit.charCodeAt(0);
    const value = code >= 0x06f0 ? code - 0x06f0 : code >= 0x0660 ? code - 0x0660 : code - 0x30;
    return '۰۱۲۳۴۵۶۷۸۹'[value];
  });
}
function displayTime(value) { return value ? toFaDigits(value) : '—'; }

function parityForCycleIndex(index) { return index === 0 ? 'odd' : 'even'; }

function parityLabel(index) { return `هفتهٔ ${parityForCycleIndex(index) === 'even' ? 'زوج' : 'فرد'}`; }

function courseScheduleEntries(course) {
  return [0, 1].flatMap(index => Array.isArray(course.scheduleByWeek?.[index]) ? course.scheduleByWeek[index] : []);
}

function scheduleEntryIsComplete(entry) {
  return validTime(entry?.start) && validTime(entry?.end) && entry.start < entry.end;
}

function courseScheduleIsIncomplete(course) {
  const entries = courseScheduleEntries(course);
  return !entries.length || entries.some(entry => !scheduleEntryIsComplete(entry));
}

function firstCourseStart(course) {
  return courseScheduleEntries(course).map(entry => entry.start).filter(validTime).sort()[0] || '99:99';
}

function formatCourseSchedule(course, compact = false) {
  return [0, 1].map(index => {
    const entries = [...(course.scheduleByWeek?.[index] || [])].sort((a, b) => WEEK_DAY_ORDER.indexOf(a.day) - WEEK_DAY_ORDER.indexOf(b.day));
    const label = parityForCycleIndex(index) === 'even' ? 'زوج' : 'فرد';
    const items = entries.map(entry => {
      const day = compact ? WEEK_DAY_SHORT[entry.day] : entry.day;
      const time = scheduleEntryIsComplete(entry) ? `${displayTime(entry.start)}–${displayTime(entry.end)}` : 'ساعت ثبت نشده';
      return `${day} ${time}`;
    });
    return `${label}: ${items.join('، ') || '—'}`;
  }).join('\n');
}

function currentSaturdayISO(now = new Date()) {
  const p = iranParts(now), date = new Date(Date.UTC(p.year, p.month - 1, p.day, 12));
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 1) % 7);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function syncTermSettings() {
  const label = $('#term-start-date-label');
  if (label) label.textContent = jalaliDateFormatter.format(new Date(`${state.cycle.termStartDate}T12:00:00Z`));
}

function syncWeekRowLabels() {
  document.querySelectorAll('.week-row-label').forEach(label => {
    const index = Number(label.nextElementSibling?.dataset.weekIndex);
    label.textContent = parityLabel(index);
  });
  document.querySelectorAll('.day-circle').forEach(button => {
    button.setAttribute('aria-label', `${parityLabel(Number(button.dataset.weekIndex))}، ${button.title}`);
  });
}

function syncDayPickers() {
  document.querySelectorAll('.day-circle').forEach(button => {
    const weekIndex = Number(button.dataset.weekIndex), active = selectedScheduleByWeek[weekIndex].some(entry => entry.day === button.dataset.day);
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function renderScheduleTimeRows() {
  [0, 1].forEach(weekIndex => {
    const container = $(`#week-${weekIndex === 0 ? 'one' : 'two'}-times`);
    const rows = selectedScheduleByWeek[weekIndex].map(entry => {
      const row = document.createElement('div'); row.className = 'schedule-time-row';
      const day = document.createElement('strong'); day.className = 'schedule-time-day'; day.textContent = entry.day;
      row.append(day);
      for (const [field, labelText] of [['start', 'شروع'], ['end', 'پایان']]) {
        const label = document.createElement('label'); label.className = 'field-label'; label.textContent = labelText;
        const input = document.createElement('input'); input.type = 'time'; input.className = 'schedule-time-input';
        input.dataset.weekIndex = String(weekIndex); input.dataset.day = entry.day; input.dataset.field = field;
        input.setAttribute('aria-label', `${parityLabel(weekIndex)}، ${entry.day}، ${labelText}`);
        input.value = entry[field] || ''; label.append(input); row.append(label);
      }
      return row;
    });
    container.replaceChildren(...rows);
  });
}

function initDayPickers() {
  document.querySelectorAll('.day-circles').forEach(row => {
    const weekIndex = Number(row.dataset.weekIndex);
    WEEK_DAY_ORDER.forEach(day => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'day-circle'; button.dataset.day = day; button.dataset.weekIndex = String(weekIndex);
      button.textContent = WEEK_DAY_SHORT[day]; button.title = day; button.setAttribute('aria-label', `${parityLabel(weekIndex)}، ${day}`); button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        const selectedIndex = selectedScheduleByWeek[weekIndex].findIndex(item => item.day === day);
        if (selectedIndex >= 0) selectedScheduleByWeek[weekIndex].splice(selectedIndex, 1);
        else selectedScheduleByWeek[weekIndex].push({ day, start: '', end: '' });
        syncDayPickers();
        renderScheduleTimeRows();
      });
      row.append(button);
    });
  });
}

function statusFor(schedule, currentMinutes, isToday) {
  if (!scheduleEntryIsComplete(schedule)) return 'incomplete';
  if (!isToday) return 'upcoming';
  const [startHour, startMinute] = schedule.start.split(':').map(Number);
  const [endHour, endMinute] = schedule.end.split(':').map(Number);
  if (currentMinutes < startHour * 60 + startMinute) return 'upcoming';
  if (currentMinutes < endHour * 60 + endMinute) return 'live';
  return 'done';
}

function selectedInfo(now = new Date()) {
  const date = dateFromISO(selectedDateISO || targetDay(0, now).iso), current = iranParts(now), today = targetDay(0, now);
  return { ...date, isToday: date.iso === today.iso, currentMinutes: current.hour * 60 + current.minute, weekIndex: cycleWeekIndex(date.iso) };
}

function render(now = new Date()) {
  const today = targetDay(0, now);
  if (selectedDateMode === 'today') selectedDateISO = today.iso;
  const info = selectedInfo(now), current = iranParts(now);
  $('#iran-clock').textContent = toFaDigits(`${String(current.hour).padStart(2, '0')}:${String(current.minute).padStart(2, '0')}`);
  $('#selected-date').textContent = info.formatted;
  $('#today-name').textContent = today.weekday;
  $('#cycle-week-label').textContent = parityLabel(info.weekIndex);
  const isToday = info.iso === today.iso, todayButton = $('.day-option[data-day="today"]');
  todayButton.classList.toggle('active', isToday); todayButton.setAttribute('aria-pressed', String(isToday));
  const dateButton = $('#pick-date-button');
  dateButton.classList.toggle('active', !isToday); dateButton.setAttribute('aria-pressed', String(!isToday));
  $('#picked-date-short').textContent = info.shortFormatted;
  $('#drawer-app-version').textContent = toFaDigits(APP_VERSION);
  const matching = state.courses.map(course => ({ course, schedule: course.scheduleByWeek?.[info.weekIndex]?.find(entry => entry.day === info.weekday) }))
    .filter(item => scheduleEntryIsComplete(item.schedule)).sort((a, b) => a.schedule.start.localeCompare(b.schedule.start));
  const rendered = matching.map(item => ({ ...item, status: statusFor(item.schedule, info.currentMinutes, info.isToday) }));
  $('#empty-title').textContent = info.isToday
    ? matching.length ? 'کلاس‌های امروز تمام شده‌اند' : 'امروز کلاسی ندارید'
    : `${info.weekday} ${info.shortFormatted} کلاسی ندارید`;
  const list = $('#schedule-list');
  list.replaceChildren(...rendered.map(item => createCourseCard(item.course, item.status, false, item.schedule)));
  $('#empty-state').hidden = rendered.length !== 0; list.hidden = rendered.length === 0;
  const byDay = [...state.courses].sort((a, b) => firstCourseStart(a).localeCompare(firstCourseStart(b)) || a.title.localeCompare(b.title, 'fa'));
  $('#manage-course-list').replaceChildren(...byDay.map(course => createCourseCard(course, courseScheduleIsIncomplete(course) ? 'incomplete' : 'upcoming', true)));
  $('#manage-empty').hidden = byDay.length !== 0;
  syncWeekRowLabels();
}

function createCourseCard(course, status, editable = false, schedule = null) {
  const article = document.createElement('article');
  article.className = `course-card status-${status} ${status === 'incomplete' ? 'incomplete' : ''} ${editable ? 'editable-card' : ''}`;
  const time = document.createElement('div'); time.className = 'course-time';
  time.textContent = editable ? formatCourseSchedule(course, true) : scheduleEntryIsComplete(schedule) ? `${displayTime(schedule.start)} – ${displayTime(schedule.end)}` : '—';
  const info = document.createElement('div'); info.className = 'course-info';
  const title = document.createElement('h3'); title.textContent = course.title; info.append(title);
  if (editable) {
    const actions = document.createElement('div'); actions.className = 'card-actions';
    const details = document.createElement('button'); details.type = 'button'; details.className = 'details-button secondary-button'; details.textContent = 'جزئیات'; details.setAttribute('aria-label', `جزئیات ${course.title}`); details.addEventListener('click', () => openCourseDetails(course));
    actions.append(details); article.append(time, info, actions);
  } else {
    article.tabIndex = 0;
    article.setAttribute('role', 'button');
    article.setAttribute('aria-label', course.title);
    article.setAttribute('aria-haspopup', 'dialog');
    article.addEventListener('click', () => openCourseDetails(course));
    article.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openCourseDetails(course);
      }
    });
    const meta = document.createElement('div'); meta.className = 'course-meta';
    if (course.className) { const className = document.createElement('span'); className.className = 'meta-chip'; className.textContent = `کلاس ${course.className}`; meta.append(className); }
    if (course.teacher) {
      const teacher = document.createElement('span'); teacher.className = 'meta-chip';
      teacher.textContent = `استاد ${course.teacher}`; meta.append(teacher);
    }
    if (meta.childElementCount) info.append(meta);
    article.append(time, info);
  }
  return article;
}

function createCourseLinkRow(link = {}) {
  const row = document.createElement('div'); row.className = 'course-link-row';
  row.dataset.linkId = String(link.id || makeId('link'));
  const titleLabel = document.createElement('label'); titleLabel.className = 'field-label';
  titleLabel.append(document.createTextNode('عنوان لینک'));
  const titleInput = document.createElement('input'); titleInput.type = 'text'; titleInput.className = 'course-link-title';
  titleInput.maxLength = 80; titleInput.placeholder = 'مثلاً کانال استاد'; titleInput.value = link.title || '';
  titleLabel.append(titleInput);
  const urlLabel = document.createElement('label'); urlLabel.className = 'field-label';
  urlLabel.append(document.createTextNode('نشانی لینک'));
  const urlInput = document.createElement('input'); urlInput.type = 'url'; urlInput.inputMode = 'url';
  urlInput.className = 'course-link-url'; urlInput.maxLength = 300; urlInput.placeholder = 'https://...'; urlInput.value = link.url || '';
  urlLabel.append(urlInput);
  const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'secondary-button icon-action course-link-remove';
  remove.setAttribute('aria-label', 'حذف لینک');
  const icon = document.createElement('img'); icon.src = 'assets/icons/delete.webp'; icon.alt = ''; icon.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span'); text.textContent = 'حذف لینک';
  remove.append(icon, text); remove.addEventListener('click', () => row.remove());
  row.append(titleLabel, urlLabel, remove);
  return row;
}

function renderCourseLinkRows(links = []) {
  const container = $('#course-links-list');
  container.replaceChildren(...normalizeCourseLinks(links).map(createCourseLinkRow));
}

function collectCourseLinks() {
  const links = [];
  for (const row of $('#course-links-list').querySelectorAll('.course-link-row')) {
    const title = toFaDigits(row.querySelector('.course-link-title').value.trim());
    const rawUrl = row.querySelector('.course-link-url').value.trim();
    if (!title && !rawUrl) continue;
    if (!title) return { links: null, error: 'برای هر لینک، عنوان آن را وارد کنید.' };
    if (!rawUrl) return { links: null, error: 'نشانی لینک را وارد کنید.' };
    const url = normalizeChannelUrl(rawUrl);
    if (!url) return { links: null, error: 'نشانی لینک معتبر نیست.' };
    links.push({ id: row.dataset.linkId || makeId('link'), title, url });
  }
  return { links, error: '' };
}

function openCourseDialog(course = null) {
  const form = $('#course-form'); form.reset(); $('#form-error').hidden = true;
  $('#dialog-title').textContent = course ? 'ویرایش درس' : 'افزودن درس';
  $('#course-id').value = course?.id || ''; $('#course-title').value = course?.title || '';
  selectedScheduleByWeek = course ? course.scheduleByWeek.map(entries => entries.map(entry => ({ ...entry }))) : [[], []];
  syncDayPickers();
  renderScheduleTimeRows();
  $('#course-class-name').value = course?.className || ''; $('#course-teacher').value = course?.teacher || '';
  renderCourseLinkRows(course ? normalizeCourseLinks(course.links, course.teacherChannel) : []);
  $('#delete-course-button').hidden = !course;
  showAppModal($('#course-dialog')); $('#course-title').focus();
}

function showAppModal(dialog) {
  if (dialog.open) return;
  if (activeModalCount === 0) {
    lockedScrollY = window.scrollY;
    document.body.style.top = `-${lockedScrollY}px`;
    document.body.classList.add('dialog-open');
  }
  activeModalCount += 1;
  dialog.showModal();
}

function openMenuDrawer(dragOffset = null, dragWidth = null) {
  const drawer = $('#menu-drawer');
  clearTimeout(drawerCloseTimer);
  drawer.classList.remove('drawer-closing');
  if (dragOffset === null) {
    drawer.classList.add('drawer-entering');
    drawer.style.setProperty('--drawer-backdrop-opacity', '0');
    showAppModal(drawer);
    $('#menu-button').setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => {
      drawer.classList.remove('drawer-entering');
      drawer.style.setProperty('--drawer-backdrop-opacity', '0.62');
    });
    return;
  }
  drawer.classList.add('drawer-entering', 'drawer-dragging');
  showAppModal(drawer);
  $('#menu-button').setAttribute('aria-expanded', 'true');
  drawer.classList.remove('drawer-entering');
  const width = dragWidth || Math.min(window.innerWidth * 0.75, 420);
  const offset = Math.max(0, width + dragOffset);
  drawer.style.transform = `translate3d(${offset}px, 0, 0)`;
  setDrawerBackdropOpacity(drawer, 1 - Math.min(width, offset) / width, width);
}

function setDrawerBackdropOpacity(drawer, progress = null, width = Math.min(window.innerWidth * 0.75, 420)) {
  if (progress === null) {
    width = width || 1;
    const match = drawer.style.transform.match(/translate(?:3d|X)\((-?[\d.]+)px/);
    const offset = match ? Number(match[1]) : 0;
    progress = 1 - Math.max(0, Math.min(width, offset)) / width;
  }
  drawer.style.setProperty('--drawer-backdrop-opacity', String(Math.max(0, Math.min(1, progress)) * 0.62));
}

function moveMenuDrawer(delta, opening, width) {
  const drawer = $('#menu-drawer');
  if (!drawer.open && opening && delta < -6) openMenuDrawer(delta, width);
  if (!drawer.open) return;
  drawer.classList.add('drawer-dragging');
  const offset = opening ? width + delta : delta;
  const clampedOffset = Math.max(0, Math.min(width, offset));
  drawer.style.transform = `translate3d(${clampedOffset}px, 0, 0)`;
  setDrawerBackdropOpacity(drawer, 1 - clampedOffset / width, width);
}

function settleMenuDrawer(open) {
  const drawer = $('#menu-drawer');
  if (!drawer.open) return;
  drawer.classList.remove('drawer-dragging', 'drawer-entering', 'drawer-closing');
  drawer.style.transform = open ? 'translateX(0)' : 'translateX(100%)';
  setDrawerBackdropOpacity(drawer, open ? 1 : 0);
  if (open) {
    drawer.style.removeProperty('transform');
    drawer.style.removeProperty('--drawer-backdrop-opacity');
    return;
  }
  closeMenuDrawer();
}

function closeMenuDrawer(immediate = false) {
  const drawer = $('#menu-drawer');
  if (!drawer.open) return;
  clearTimeout(drawerCloseTimer);
  drawer.classList.remove('drawer-dragging', 'drawer-entering');
  if (immediate) { drawer.close(); return; }
  drawer.classList.add('drawer-closing');
  drawer.style.transform = 'translateX(100%)';
  setDrawerBackdropOpacity(drawer, 0);
  drawerCloseTimer = setTimeout(() => { if (drawer.open) drawer.close(); }, 280);
}

function handleModalClosed() {
  activeModalCount = Math.max(0, activeModalCount - 1);
  if (activeModalCount === 0) {
    const scrollY = lockedScrollY;
    document.body.classList.remove('dialog-open');
    document.body.style.top = '';
    window.scrollTo(0, scrollY);
  }
}

function openCourseDetails(course) {
  activeDetailsCourseId = course.id;
  const details = $('#course-details-dialog');
  $('#details-title').textContent = course.title;
  $('#details-schedule').textContent = formatCourseSchedule(course);
  $('#details-class-name').textContent = course.className || 'ثبت نشده';
  $('#details-teacher').textContent = course.teacher || 'ثبت نشده';
  const links = normalizeCourseLinks(course.links, course.teacherChannel);
  const linkList = $('#details-course-links');
  if (!links.length) linkList.textContent = 'ثبت نشده';
  else linkList.replaceChildren(...links.map(link => {
    const anchor = document.createElement('a');
    anchor.className = 'details-course-link'; anchor.href = link.url; anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer'; anchor.textContent = link.title;
    return anchor;
  }));
  showAppModal(details);
}

function refreshCourseDetails() {
  const course = state.courses.find(item => item.id === activeDetailsCourseId);
  if (course && $('#course-details-dialog').open) openCourseDetails(course);
}

function switchPage(destination) {
  document.querySelectorAll('[data-page-panel]').forEach(panel => { panel.hidden = panel.dataset.pagePanel !== destination; });
  document.querySelectorAll('.page-link').forEach(link => link.classList.toggle('active', link.dataset.page === destination));
  const activePage = document.querySelector(`[data-page-panel="${destination}"]`);
  if (activePage) {
    activePage.classList.remove('page-enter');
    void activePage.offsetWidth;
    activePage.classList.add('page-enter');
    setTimeout(() => activePage.classList.remove('page-enter'), 260);
  }
}

function handleAppBack() {
  const drawer = $('#menu-drawer'), drawerWasOpen = drawer.open;
  if (drawerWasOpen) closeMenuDrawer();
  const activeDialog = [...document.querySelectorAll('dialog')].find(dialog => dialog.open && dialog.id !== 'menu-drawer');
  if (activeDialog) { activeDialog.close(); return true; }
  const activePage = document.querySelector('[data-page-panel]:not([hidden])')?.dataset.pagePanel || 'dashboard';
  if (activePage !== 'dashboard') switchPage('dashboard');
  return drawerWasOpen || activePage !== 'dashboard';
}

window.handleAppBack = handleAppBack;

function openNotesPage(courseId) {
  activeNotesCourseId = courseId;
  renderNotesPage();
  switchPage('notes');
  if ($('#course-details-dialog').open) $('#course-details-dialog').close();
}

function renderNotesPage() {
  const course = state.courses.find(item => item.id === activeNotesCourseId);
  if (!course) { switchPage('courses'); return; }
  $('#notes-course-name').textContent = course.title;
  const list = $('#notes-list');
  list.replaceChildren(...course.notes.map(note => {
    const article = document.createElement('article'); article.className = 'note-card';
    const heading = document.createElement('h2'); heading.textContent = note.title;
    const body = document.createElement('p'); body.textContent = note.text || '—';
    const actions = document.createElement('div'); actions.className = 'note-actions';
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'secondary-button icon-action'; edit.title = 'ویرایش یادداشت'; edit.setAttribute('aria-label', `ویرایش یادداشت ${note.title}`);
    const editIcon = document.createElement('img'); editIcon.className = 'button-icon'; editIcon.src = 'assets/icons/edit.webp'; editIcon.alt = ''; editIcon.setAttribute('aria-hidden', 'true');
    edit.append(editIcon, 'ویرایش'); edit.addEventListener('click', () => openNoteDialog(note));
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'secondary-button icon-action note-delete'; remove.title = 'حذف یادداشت'; remove.setAttribute('aria-label', `حذف یادداشت ${note.title}`);
    const removeIcon = document.createElement('img'); removeIcon.src = 'assets/icons/delete.webp'; removeIcon.alt = ''; removeIcon.setAttribute('aria-hidden', 'true');
    remove.append(removeIcon, 'حذف'); remove.addEventListener('click', () => removeNote(note.id));
    actions.append(edit, remove); article.append(heading, body, actions); return article;
  }));
  $('#notes-empty').hidden = course.notes.length !== 0;
}

function openNoteDialog(note = null) {
  $('#note-form').reset(); $('#note-error').hidden = true;
  $('#note-dialog-title').textContent = note ? 'ویرایش یادداشت' : 'یادداشت تازه';
  $('#note-id').value = note?.id || '';
  $('#note-title').value = note?.title || '';
  $('#note-text').value = note?.text || '';
  showAppModal($('#note-dialog'));
  $('#note-title').focus();
}

function removeNote(noteId) {
  const course = state.courses.find(item => item.id === activeNotesCourseId);
  const note = course?.notes.find(item => item.id === noteId);
  if (!course || !note || !window.confirm(`یادداشت «${note.title}» حذف شود؟`)) return;
  course.notes = course.notes.filter(item => item.id !== noteId);
  saveState(); renderNotesPage(); showToast('یادداشت حذف شد.');
}

function removeCourse(id) {
  const course = state.courses.find(item => item.id === id);
  if (!course || !window.confirm(`درس «${course.title}» حذف شود؟`)) return;
  state.courses = state.courses.filter(item => item.id !== id); saveState(); $('#course-dialog').close();
  if ($('#course-details-dialog').open && activeDetailsCourseId === id) $('#course-details-dialog').close();
  if (activeNotesCourseId === id) switchPage('courses');
  render(); showToast('درس حذف شد.');
}

function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function makeBackupFilename(prefix = 'class-schedule-backup') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return prefix + '-' + stamp + '.json';
}

function backupPayload() {
  return JSON.stringify({ formatVersion: 7, cycle: state.cycle, courses: state.courses }, null, 2);
}

function downloadBackup(payload, filename) {
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportSchedule() {
  const payload = backupPayload();
  if (window.AndroidScheduleBridge?.saveBackup) {
    window.AndroidScheduleBridge.saveBackup(payload);
    showToast('برای ذخیره، محل فایل را انتخاب کنید.');
    return;
  }
  downloadBackup(payload, makeBackupFilename());
  showToast('نسخهٔ پشتیبان برنامه دانلود شد.');
}

window.onScheduleBackupResult = saved => {
  const resolve = nativeBackupResolve;
  nativeBackupResolve = null;
  if (resolve) resolve(saved === true);
};

async function saveBackupBeforeImport() {
  if (!state.courses.length) return true;
  const payload = backupPayload(), filename = makeBackupFilename('class-schedule-before-amozeshyar-import');
  if (window.AndroidScheduleBridge?.saveBackupForImport) {
    return new Promise(resolve => {
      const timeout = setTimeout(() => {
        nativeBackupResolve = null;
        resolve(false);
      }, 5 * 60 * 1000);
      nativeBackupResolve = saved => { clearTimeout(timeout); resolve(saved); };
      try { window.AndroidScheduleBridge.saveBackupForImport(payload, filename); }
      catch (error) { clearTimeout(timeout); nativeBackupResolve = null; resolve(false); }
    });
  }
  downloadBackup(payload, filename);
  return true;
}

function binaryStringToBytes(value) {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) bytes[index] = value.charCodeAt(index) & 0xff;
  return bytes;
}

function decodeQuotedPrintable(value) {
  const bytes = [];
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index) & 0xff;
    if (code === 61 && value[index + 1] === '\r' && value[index + 2] === '\n') { index += 2; continue; }
    if (code === 61 && value[index + 1] === '\n') { index += 1; continue; }
    if (code === 61 && /^[0-9a-f]{2}$/i.test(value.slice(index + 1, index + 3))) {
      bytes.push(parseInt(value.slice(index + 1, index + 3), 16)); index += 2; continue;
    }
    bytes.push(code);
  }
  return new Uint8Array(bytes);
}

function decodeMhtPart(headers, body) {
  const encoding = (headers.match(/content-transfer-encoding\s*:\s*([^\r\n;]+)/i)?.[1] || '').trim().toLowerCase();
  let bytes;
  if (encoding === 'quoted-printable') bytes = decodeQuotedPrintable(body);
  else if (encoding === 'base64') {
    const decoded = atob(body.replace(/\s/g, ''));
    bytes = binaryStringToBytes(decoded);
  } else bytes = binaryStringToBytes(body);
  const charset = headers.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1] || 'utf-8';
  try { return new TextDecoder(charset).decode(bytes); }
  catch (error) { return new TextDecoder('utf-8').decode(bytes); }
}

async function readMhtHtml(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 8192, bytes.length)));
  }
  const boundary = binary.slice(0, 8192).match(/boundary\s*=\s*(?:"([^"]+)"|'([^']+)'|([^;\s\r\n]+))/i);
  const boundaryValue = boundary && (boundary[1] || boundary[2] || boundary[3]);
  const parts = boundaryValue ? binary.split('--' + boundaryValue) : [binary];
  for (const part of parts) {
    const crlfSeparator = part.indexOf('\r\n\r\n');
    const lfSeparator = part.indexOf('\n\n');
    const separator = crlfSeparator >= 0 ? crlfSeparator : lfSeparator;
    if (separator < 0) continue;
    const separatorLength = separator === crlfSeparator ? 4 : 2;
    const headers = part.slice(0, separator);
    const body = part.slice(separator + separatorLength).replace(/\r?\n--?\s*$/, '');
    const isHtmlPart = /content-type\s*:\s*text\/html/i.test(headers) || /<html[\s>]|<table[\s>]/i.test(body);
    if (!isHtmlPart) continue;
    const html = decodeMhtPart(headers, body);
    if (/<html[\s>]|<table[\s>]/i.test(html)) return html;
  }
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  if (/<html[\s>]|<table[\s>]/i.test(utf8)) return utf8;
  throw new Error('بخش HTML داخل فایل پیدا نشد؛ فایل MHT آموزشیار را دوباره ذخیره کنید.');
}

function normalizeAmozeshyarText(value) {
  return String(value || '')
    .replace(/[۰-۹٠-٩]/g, digit => {
      const code = digit.charCodeAt(0);
      return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
    })
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[\u064b-\u065f\u0670\u200c\u200f]/g, '')
    .replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseAmozeshyarSchedule(value) {
  const text = normalizeAmozeshyarText(value);
  const markers = [...text.matchAll(/هفته\s*(فرد|زوج)/g)];
  const segments = [];
  if (!markers.length) segments.push({ parity: null, text });
  else {
    const preface = text.slice(0, markers[0].index);
    if (preface.trim()) segments.push({ parity: null, text: preface });
    markers.forEach((marker, index) => {
      const start = marker.index + marker[0].length;
      const end = markers[index + 1]?.index ?? text.length;
      segments.push({ parity: marker[1] === 'زوج' ? 'even' : 'odd', text: text.slice(start, end) });
    });
  }

  const grouped = new Map();
  const dayMap = {
    شنبه: 'شنبه', یکشنبه: 'یکشنبه', دوشنبه: 'دوشنبه', سهشنبه: 'سه‌شنبه',
    چهارشنبه: 'چهارشنبه', پنجشنبه: 'پنجشنبه', جمعه: 'جمعه'
  };
  for (const segment of segments) {
    const days = [...segment.text.matchAll(/یک\s*شنبه|دو\s*شنبه|سه\s*شنبه|چهار\s*شنبه|پنج\s*شنبه|جمعه|شنبه/g)];
    const ranges = [...segment.text.matchAll(/(\d{1,2})\s*[:٫.]\s*(\d{2})\s*(?:تا|الی|[-–—])\s*(\d{1,2})\s*[:٫.]\s*(\d{2})/g)];
    let cursor = 0, previousDays = [];
    for (const range of ranges) {
      const matchedDays = days
        .filter(day => day.index >= cursor && day.index < range.index)
        .map(day => dayMap[day[0].replace(/\s/g, '')])
        .filter(Boolean);
      if (matchedDays.length) previousDays = [...new Set(matchedDays)];
      else if (!previousDays.length) {
        previousDays = [...new Set(days.filter(day => day.index < range.index).map(day => dayMap[day[0].replace(/\s/g, '')]).filter(Boolean))];
      }
      cursor = range.index + range[0].length;
      const startHour = Number(range[1]), startMinute = Number(range[2]);
      const endHour = Number(range[3]), endMinute = Number(range[4]);
      const start = String(startHour).padStart(2, '0') + ':' + String(startMinute).padStart(2, '0');
      const end = String(endHour).padStart(2, '0') + ':' + String(endMinute).padStart(2, '0');
      if (!previousDays.length || !validTime(start) || !validTime(end) || start >= end) continue;
      const key = start + '-' + end;
      if (!grouped.has(key)) grouped.set(key, { start, end, daysByWeek: [new Set(), new Set()] });
      const group = grouped.get(key);
      const weekIndexes = segment.parity === 'odd' ? [0] : segment.parity === 'even' ? [1] : [0, 1];
      weekIndexes.forEach(weekIndex => previousDays.forEach(day => group.daysByWeek[weekIndex].add(day)));
    }
  }
  return [...grouped.values()].map(group => ({
    start: group.start,
    end: group.end,
    daysByWeek: group.daysByWeek.map(days => WEEK_DAY_ORDER.filter(day => days.has(day)))
  }));
}

function parseAmozeshyarHtml(html) {
  const parsedDocument = new DOMParser().parseFromString(html, 'text/html');
  const getRows = table => [...table.querySelectorAll('tr')].filter(row => row.closest('table') === table);
  const getCells = row => [...row.children].filter(cell => /^(TH|TD)$/i.test(cell.tagName)).map(cell => {
    const copy = cell.cloneNode(true);
    copy.querySelectorAll('br').forEach(lineBreak => lineBreak.replaceWith(document.createTextNode(' ')));
    copy.querySelectorAll('div,p,li').forEach(block => block.append(document.createTextNode(' ')));
    return copy.textContent.replace(/\s+/g, ' ').trim();
  });
  const normalizeHeader = value => normalizeAmozeshyarText(value).replace(/[\s:()\uFF08\uFF09\-\u2013\u2014_]/g, '');
  const findColumns = headers => {
    const nameIndex = headers.findIndex(header => header.includes('\u0646\u0627\u0645\u062f\u0631\u0633'));
    const teacherIndex = headers.findIndex(header => header.includes('\u0646\u0627\u0645\u0627\u0633\u062a\u0627\u062f') || header.includes('\u0627\u0633\u0627\u062a\u06cc\u062f'));
    const scheduleIndex = headers.findIndex(header => header.includes('\u0632\u0645\u0627\u0646') && (header.includes('\u0628\u0631\u06af\u0632\u0627\u0631\u06cc') || header.includes('\u06a9\u0644\u0627\u0633')));
    const dayIndex = headers.findIndex(header => header.includes('\u0631\u0648\u0632') && header.includes('\u0647\u0641\u062a\u0647'));
    const classNameIndex = headers.findIndex(header => header.includes('\u0646\u0627\u0645\u06a9\u0644\u0627\u0633\u062f\u0631\u0633'));
    const locationIndex = headers.findIndex(header => header.includes('\u0645\u06a9\u0627\u0646') && header.includes('\u0628\u0631\u06af\u0632\u0627\u0631\u06cc'));
    return { nameIndex, teacherIndex, scheduleIndex, dayIndex, classNameIndex, locationIndex };
  };
  const candidates = [];
  for (const table of parsedDocument.querySelectorAll('table')) {
    const rows = getRows(table);
    for (let headerIndex = 0; headerIndex < rows.length; headerIndex += 1) {
      const headers = getCells(rows[headerIndex]).map(normalizeHeader);
      const indexes = findColumns(headers);
      if (indexes.nameIndex < 0 || indexes.teacherIndex < 0 || indexes.scheduleIndex < 0) continue;
      candidates.push({ table, rows, headerIndex, indexes });
      break;
    }
  }
  if (!candidates.length) {
    const legacyTable = parsedDocument.getElementById('panel__3');
    const rows = legacyTable ? getRows(legacyTable) : [];
    if (rows.length >= 2) candidates.push({
      table: legacyTable, rows, headerIndex: 0,
      indexes: { nameIndex: 4, teacherIndex: 11, scheduleIndex: 14, dayIndex: -1, classNameIndex: -1, locationIndex: -1 }
    });
  }
  if (!candidates.length) throw new Error('\u062c\u062f\u0648\u0644 \u062f\u0631\u0648\u0633 \u0622\u0645\u0648\u0632\u0634\u06cc\u0627\u0631 \u062f\u0631 \u0641\u0627\u06cc\u0644 \u067e\u06cc\u062f\u0627 \u0646\u0634\u062f.');
  const selected = candidates.find(item => item.table.id === 'panel__3') || candidates[0];
  const { rows, headerIndex, indexes } = selected;
  const coursesByKey = new Map();
  for (const row of rows.slice(headerIndex + 1)) {
    const cells = getCells(row);
    if (cells.length <= Math.max(indexes.nameIndex, indexes.teacherIndex, indexes.scheduleIndex)) continue;
    const title = cells[indexes.nameIndex].trim();
    if (!title) continue;
    const teacher = cells[indexes.teacherIndex].trim();
    const timeText = cells[indexes.scheduleIndex] || '';
    const dayText = indexes.dayIndex >= 0 ? cells[indexes.dayIndex] || '' : '';
    const scheduleText = dayText ? `${dayText} ${timeText}` : timeText;
    const meetings = parseAmozeshyarSchedule(scheduleText);
    const importedClassName = indexes.classNameIndex >= 0 && cells[indexes.classNameIndex] && cells[indexes.classNameIndex] !== '-'
      ? cells[indexes.classNameIndex]
      : indexes.locationIndex >= 0 && cells[indexes.locationIndex] && cells[indexes.locationIndex] !== '-' ? cells[indexes.locationIndex] : '';
    const courseBase = {
      title: toFaDigits(title), teacher: toFaDigits(teacher), links: [],
      className: toFaDigits(importedClassName), notes: []
    };
    const key = `${courseMatchKey(courseBase.title)}|${courseMatchKey(courseBase.teacher)}`;
    if (!coursesByKey.has(key)) {
      coursesByKey.set(key, { ...courseBase, id: makeId('amozeshyar'), scheduleMaps: [new Map(), new Map()] });
    }
    const course = coursesByKey.get(key);
    if (!course.className && courseBase.className) course.className = courseBase.className;
    meetings.forEach(meeting => meeting.daysByWeek.forEach((days, weekIndex) => {
      days.forEach(day => {
        const previous = course.scheduleMaps[weekIndex].get(day);
        const start = previous && previous.start < meeting.start ? previous.start : meeting.start;
        const end = previous && previous.end > meeting.end ? previous.end : meeting.end;
        course.scheduleMaps[weekIndex].set(day, { day, start, end });
      });
    }));
  }
  const courses = [...coursesByKey.values()].map(course => {
    const scheduleByWeek = course.scheduleMaps.map(byDay => WEEK_DAY_ORDER.filter(day => byDay.has(day)).map(day => byDay.get(day)));
    const { scheduleMaps, ...result } = course;
    return { ...result, scheduleByWeek };
  });
  if (!courses.length) throw new Error('\u0647\u06cc\u0686 \u062f\u0631\u0633 \u0645\u0639\u062a\u0628\u0631\u06cc \u062f\u0631 \u062c\u062f\u0648\u0644 \u0622\u0645\u0648\u0632\u0634\u06cc\u0627\u0631 \u067e\u06cc\u062f\u0627 \u0646\u0634\u062f.');
  return courses;
}

function courseScheduleSignature(course) {
  return [0, 1].map(weekIndex => WEEK_DAY_ORDER.map(day => {
    const entry = course.scheduleByWeek?.[weekIndex]?.find(item => item.day === day);
    return entry ? `${day}:${entry.start}-${entry.end}` : '';
  }).filter(Boolean).join('|')).join('||');
}

function courseHasSchedule(course) {
  return course.scheduleByWeek?.some(week => week.length) || false;
}

function importedScheduleConflicts(importedCourses, previousCourses) {
  return importedCourses.flatMap(course => {
    const previous = findPreviousCourseForImport(course, previousCourses);
    if (!previous || !courseHasSchedule(course) || !courseHasSchedule(previous)) return [];
    return courseScheduleSignature(course) === courseScheduleSignature(previous) ? [] : [{ course, previous }];
  });
}

function updateAmozeshyarApplyButton() {
  const button = $('#apply-amozeshyar-import');
  if (!button) return;
  const conflicts = importedScheduleConflicts(pendingAmozeshyarCourses || [], state.courses);
  button.disabled = conflicts.some(({ course }) => !pendingAmozeshyarScheduleChoices.has(course.id));
}
function courseMatchKey(value) {
  return normalizeAmozeshyarText(value).toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]/g, '');
}

function courseMatchScore(incoming, previous) {
  let score = 0;
  for (let week = 0; week < 2; week += 1) {
    for (const entry of incoming.scheduleByWeek[week]) {
      const old = previous.scheduleByWeek[week].find(item => item.day === entry.day);
      if (!old) continue;
      score += 2;
      if (entry.start && entry.start === old.start) score += 2;
      if (entry.end && entry.end === old.end) score += 2;
    }
  }
  return score;
}

function findPreviousCourseForImport(incoming, previousCourses) {
  let candidates = previousCourses.filter(course => courseMatchKey(course.title) === courseMatchKey(incoming.title));
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  if (incoming.teacher) {
    const sameTeacher = candidates.filter(course => courseMatchKey(course.teacher) === courseMatchKey(incoming.teacher));
    if (sameTeacher.length) candidates = sameTeacher;
  }
  if (candidates.length === 1) return candidates[0];

  const scored = candidates.map(course => ({ course, score: courseMatchScore(incoming, course) }));
  const highestScore = Math.max(...scored.map(item => item.score));
  const bestMatches = scored.filter(item => item.score === highestScore && highestScore > 0);
  return bestMatches.length === 1 ? bestMatches[0].course : null;
}

function mergeImportedNotes(importedNotes, previousNotes) {
  const seen = new Set();
  return [...normalizeNotes(importedNotes), ...normalizeNotes(previousNotes)].filter(note => {
    const key = `${courseMatchKey(note.title)}|${note.text.trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function enrichImportedCourses(importedCourses, previousCourses, scheduleChoices = new Map()) {
  return importedCourses.map(course => {
    const previous = findPreviousCourseForImport(course, previousCourses);
    if (!previous) return course;
    const usePreviousSchedule = scheduleChoices.get(course.id) === 'previous' || !courseHasSchedule(course);
    return {
      ...course,
      scheduleByWeek: usePreviousSchedule ? previous.scheduleByWeek : course.scheduleByWeek,
      className: course.className || previous.className,
      teacher: course.teacher || previous.teacher,
      links: course.links?.length ? course.links : normalizeCourseLinks(previous.links, previous.teacherChannel),
      notes: mergeImportedNotes(course.notes, previous.notes)
    };
  });
}

function appendImportScheduleLine(parent, label, course) {
  const line = document.createElement('div');
  line.className = 'import-schedule-line';
  const heading = document.createElement('strong');
  heading.textContent = label;
  const schedule = document.createElement('span');
  schedule.textContent = formatCourseSchedule(course, false).replace(/\n/g, ' | ');
  line.append(heading, schedule);
  parent.append(line);
}

function appendImportScheduleChoice(parent, course, previous) {
  const group = document.createElement('fieldset');
  group.className = 'import-schedule-choice';
  const legend = document.createElement('legend');
  legend.textContent = '\u0627\u0646\u062a\u062e\u0627\u0628 \u0633\u0627\u0639\u062a \u0627\u06cc\u0646 \u062f\u0631\u0633';
  group.append(legend);
  appendImportScheduleLine(group, '\u0628\u0631\u0646\u0627\u0645\u0647 \u0642\u0628\u0644\u06cc', previous);
  appendImportScheduleLine(group, '\u0628\u0631\u0646\u0627\u0645\u0647 \u062c\u062f\u06cc\u062f', course);
  const options = document.createElement('div');
  options.className = 'import-schedule-options';
  [
    { value: 'previous', text: '\u0642\u0628\u0644\u06cc \u0631\u0627 \u0646\u06af\u0647 \u062f\u0627\u0631' },
    { value: 'new', text: '\u062c\u062f\u06cc\u062f \u0631\u0627 \u0646\u06af\u0647 \u062f\u0627\u0631' }
  ].forEach(option => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio'; input.name = `amozeshyar-schedule-${course.id}`; input.value = option.value;
    input.checked = pendingAmozeshyarScheduleChoices.get(course.id) === option.value;
    input.addEventListener('change', () => {
      pendingAmozeshyarScheduleChoices.set(course.id, option.value);
      updateAmozeshyarApplyButton();
    });
    const text = document.createElement('span'); text.textContent = option.text;
    label.append(input, text); options.append(label);
  });
  group.append(options);
  parent.append(group);
}

async function previewAmozeshyarFile(file) {
  const error = $('#amozeshyar-error'), preview = $('#amozeshyar-preview');
  error.hidden = true; preview.hidden = true; pendingAmozeshyarCourses = null; pendingAmozeshyarScheduleChoices = new Map();
  try {
    if (!file) return;
    const html = await readMhtHtml(file);
    const courses = normalizeCourses(parseAmozeshyarHtml(html));
    const previewCourses = enrichImportedCourses(courses, state.courses);
    const conflicts = importedScheduleConflicts(courses, state.courses);
    const incomplete = previewCourses.filter(courseScheduleIsIncomplete).length;
    const enrichedCount = courses.filter(course => findPreviousCourseForImport(course, state.courses)).length;
    const conflictCount = conflicts.length;
    $('#amozeshyar-summary').textContent = numberFa.format(courses.length) + ' \u062f\u0631\u0633 \u067e\u06cc\u062f\u0627 \u0634\u062f\u061b ' + numberFa.format(incomplete) + ' \u062f\u0631\u0633 \u0646\u06cc\u0627\u0632 \u0628\u0647 \u0628\u0631\u0631\u0633\u06cc \u062f\u0627\u0631\u062f.' + (enrichedCount ? ' \u0627\u0637\u0644\u0627\u0639\u0627\u062a \u062a\u06a9\u0645\u06cc\u0644\u06cc ' + numberFa.format(enrichedCount) + ' \u062f\u0631\u0633 \u0627\u0632 \u0628\u0631\u0646\u0627\u0645\u0647\u0654 \u0642\u0628\u0644\u06cc \u062d\u0641\u0638 \u0645\u06cc\u200c\u0634\u0648\u062f.' : '') + (conflictCount ? ' \u0633\u0627\u0639\u062a ' + numberFa.format(conflictCount) + ' \u062f\u0631\u0633 \u062a\u063a\u06cc\u06cc\u0631 \u06a9\u0631\u062f\u0647\u061b \u0628\u0631\u0627\u06cc \u0647\u0631\u06a9\u062f\u0627\u0645 \u06cc\u06a9\u06cc \u0627\u0632 \u062f\u0648 \u0628\u0631\u0646\u0627\u0645\u0647 \u0631\u0627 \u0627\u0646\u062a\u062e\u0627\u0628 \u06a9\u0646\u06cc\u062f.' : '');
    $('#amozeshyar-apply-label').textContent = state.courses.length ? '\u067e\u0634\u062a\u06cc\u0628\u0627\u0646\u200c\u06af\u06cc\u0631\u06cc \u0648 \u062c\u0627\u06cc\u06af\u0632\u06cc\u0646\u06cc' : '\u0648\u0627\u0631\u062f \u06a9\u0631\u062f\u0646 \u0628\u0631\u0646\u0627\u0645\u0647';
    const list = $('#amozeshyar-preview-list'), items = previewCourses.map(course => {
      const item = document.createElement('li');
      item.className = 'import-course-item';
      const heading = document.createElement('strong');
      heading.textContent = course.title + ' \u2014 ' + (course.teacher || '\u0627\u0633\u062a\u0627\u062f \u0646\u0627\u0645\u0634\u062e\u0635');
      const conflict = conflicts.find(value => value.course.id === course.id);
      item.append(heading);
      if (conflict) appendImportScheduleChoice(item, course, conflict.previous);
      else {
        const schedule = document.createElement('span');
        schedule.className = 'import-course-schedule';
        schedule.textContent = formatCourseSchedule(course, true).replace(/\n/g, ' | ');
        item.append(schedule);
      }
      return item;
    });
    list.replaceChildren(...items);
    pendingAmozeshyarCourses = courses; preview.hidden = false; updateAmozeshyarApplyButton();
  } catch (errorValue) {
    error.textContent = errorValue.message || '\u062e\u0648\u0627\u0646\u062f\u0646 \u0641\u0627\u06cc\u0644 \u0622\u0645\u0648\u0632\u0634\u06cc\u0627\u0631 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062f.';
    error.hidden = false;
  } finally { $('#amozeshyar-file').value = ''; }
}

async function applyAmozeshyarImport() {
  if (!pendingAmozeshyarCourses?.length) return;
  const conflicts = importedScheduleConflicts(pendingAmozeshyarCourses, state.courses);
  const unanswered = conflicts.find(({ course }) => !pendingAmozeshyarScheduleChoices.has(course.id));
  if (unanswered) {
    showToast('\u0628\u0631\u0627\u06cc \u062f\u0631\u0633\u200c\u0647\u0627\u06cc\u06cc \u06a9\u0647 \u0633\u0627\u0639\u062a\u0634\u0627\u0646 \u062a\u063a\u06cc\u06cc\u0631 \u06a9\u0631\u062f\u0647\u060c \u0628\u0631\u0646\u0627\u0645\u0647\u0654 \u0642\u0628\u0644\u06cc \u06cc\u0627 \u062c\u062f\u06cc\u062f \u0631\u0627 \u0627\u0646\u062a\u062e\u0627\u0628 \u06a9\u0646\u06cc\u062f.');
    $(`input[name="amozeshyar-schedule-${unanswered.course.id}"]`)?.focus();
    return;
  }
  const replacingExisting = state.courses.length > 0;
  if (replacingExisting && !window.confirm('\u0628\u0631\u0646\u0627\u0645\u0647\u0654 \u0641\u0639\u0644\u06cc \u062c\u0627\u06cc\u06af\u0632\u06cc\u0646 \u0634\u0648\u062f\u061f \u0627\u0628\u062a\u062f\u0627 \u0627\u0632 \u0622\u0646 \u0646\u0633\u062e\u0647\u0654 \u067e\u0634\u062a\u06cc\u0628\u0627\u0646 \u0630\u062e\u06cc\u0631\u0647 \u0645\u06cc\u200c\u0634\u0648\u062f.')) return;
  const button = $('#apply-amozeshyar-import');
  button.disabled = true;
  try {
    const backupSaved = await saveBackupBeforeImport();
    if (!backupSaved) {
      showToast('\u067e\u0634\u062a\u06cc\u0628\u0627\u0646 \u0630\u062e\u06cc\u0631\u0647 \u0646\u0634\u062f\u061b \u0628\u0631\u0646\u0627\u0645\u0647\u0654 \u0641\u0639\u0644\u06cc \u062d\u0641\u0638 \u0634\u062f \u0648 \u0648\u0627\u0631\u062f\u0633\u0627\u0632\u06cc \u0627\u0646\u062c\u0627\u0645 \u0646\u0634\u062f.');
      return;
    }
    state = { cycle: state.cycle, courses: enrichImportedCourses(pendingAmozeshyarCourses, state.courses, pendingAmozeshyarScheduleChoices) };
    saveState(); render(); syncTermSettings(); pendingAmozeshyarCourses = null; pendingAmozeshyarScheduleChoices = new Map();
    $('#amozeshyar-preview').hidden = true;
    switchPage('courses');
    showToast(numberFa.format(state.courses.length) + (replacingExisting ? ' \u062f\u0631\u0633 \u0648\u0627\u0631\u062f \u0634\u062f\u061b \u0628\u0631\u0646\u0627\u0645\u0647\u0654 \u0642\u0628\u0644\u06cc \u067e\u0634\u062a\u06cc\u0628\u0627\u0646\u200c\u06af\u06cc\u0631\u06cc \u0634\u062f.' : ' \u062f\u0631\u0633 \u0648\u0627\u0631\u062f \u0634\u062f.'));
  } catch (error) {
    showToast('\u0648\u0627\u0631\u062f\u0633\u0627\u0632\u06cc \u0627\u0646\u062c\u0627\u0645 \u0646\u0634\u062f: ' + (error.message || '\u0630\u062e\u06cc\u0631\u0647\u0654 \u067e\u0634\u062a\u06cc\u0628\u0627\u0646 \u0645\u0645\u06a9\u0646 \u0646\u0628\u0648\u062f.'));
  } finally { button.disabled = false; }
}

async function importSchedule(file) {
  try {
    const parsed = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
    if (!parsed || !Array.isArray(parsed.courses)) throw new Error('ساختار فایل درست نیست.');
    const oldSettings = normalizeLegacySettings(parsed.settings);
    const oldParity = previousStartParity(parsed.cycle, oldSettings);
    const cycle = normalizeCycle(parsed.cycle, oldSettings);
    const courseSettings = { ...oldSettings, anchorDate: cycle.termStartDate, anchorParity: oldParity, hasParity: true };
    const courses = normalizeCourses(parsed.courses, courseSettings, oldParity === 'even');
    if (parsed.courses.length && !courses.length) throw new Error('هیچ درس معتبری در فایل پیدا نشد.');
    if (state.courses.length && !window.confirm('برنامهٔ فعلی با اطلاعات فایل پشتیبان جایگزین شود؟')) return;
    state = { cycle, courses }; saveState(); render(); syncTermSettings();
    showToast(numberFa.format(courses.length) + ' درس از پشتیبان بازیابی شد.');
  } catch (error) { showToast('بازیابی پشتیبان ناموفق بود: ' + (error.message || 'فایل JSON معتبر نیست.')); }
  finally { $('#import-file').value = ''; }
}

function init() {
  initDayPickers();
  document.querySelectorAll('.day-option[data-day]').forEach(button => button.addEventListener('click', () => {
    selectedDateMode = 'today';
    selectedDateISO = targetDay(0).iso;
    render();
  }));
  $('#pick-date-button').addEventListener('click', () => openDatePicker('dashboard'));
  $('#term-start-date-picker').addEventListener('click', () => openDatePicker('term'));
  $('#calendar-previous').addEventListener('click', () => { calendarCursorISO = shiftISODate(jalaliMonthStart(calendarCursorISO), -1); renderCalendar(); });
  $('#calendar-next').addEventListener('click', () => { calendarCursorISO = shiftISODate(jalaliMonthStart(calendarCursorISO), 40); renderCalendar(); });
  $('#calendar-today').addEventListener('click', () => { calendarDraftISO = targetDay(0).iso; calendarCursorISO = calendarDraftISO; renderCalendar(); });
  $('.close-calendar').addEventListener('click', () => $('#date-picker-dialog').close());
  $('#calendar-apply').addEventListener('click', () => {
    if (calendarTarget === 'term') {
      state.cycle = { termStartDate: calendarDraftISO };
      saveState();
      syncTermSettings();
      showToast('تاریخ شروع ترم تنظیم شد.');
    } else {
      selectedDateISO = calendarDraftISO;
      selectedDateMode = calendarDraftISO === targetDay(0).iso ? 'today' : 'custom';
    }
    $('#date-picker-dialog').close();
    render();
  });
  $('#refresh-button').addEventListener('click', async () => {
    const button = $('#refresh-button'); closeMenuDrawer(); button.classList.add('refreshing');
    try { const registration = await navigator.serviceWorker?.getRegistration(); await registration?.update(); } catch (error) { console.warn('Could not check for app updates.', error); }
    window.location.reload();
  });
  $('#add-course-button').addEventListener('click', () => openCourseDialog());
  $('#menu-button').addEventListener('click', () => { if (!$('#menu-drawer').open) openMenuDrawer(); });
  $('.close-menu').addEventListener('click', () => closeMenuDrawer());
  let horizontalGesture = null, gestureFrame = 0, suppressedBackdropTap = null;
  const suppressBackdropClickAt = touch => {
    suppressedBackdropTap = { x: touch.clientX, y: touch.clientY, until: performance.now() + 650 };
  };
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('click', event => {
      if (dialog.id === 'menu-drawer' && suppressedBackdropTap) {
        const isSwipeClick = event.target === event.currentTarget && performance.now() < suppressedBackdropTap.until && Math.abs(event.clientX - suppressedBackdropTap.x) < 32 && Math.abs(event.clientY - suppressedBackdropTap.y) < 32;
        suppressedBackdropTap = null;
        if (isSwipeClick) {
          event.preventDefault(); event.stopImmediatePropagation();
          return;
        }
      }
      if (event.target !== event.currentTarget) return;
      if (dialog.id === 'menu-drawer') closeMenuDrawer(); else dialog.close();
    });
    dialog.addEventListener('close', () => {
      if (dialog.id === 'menu-drawer') {
        clearTimeout(drawerCloseTimer);
        $('#menu-button').setAttribute('aria-expanded', 'false');
        dialog.classList.remove('drawer-entering', 'drawer-dragging', 'drawer-closing');
        dialog.style.removeProperty('transform');
        dialog.style.removeProperty('--drawer-backdrop-opacity');
      }
      handleModalClosed();
    });
  });
  const moveGesture = (gesture, delta) => {
    if (gesture.open) { if (delta > 0) moveMenuDrawer(delta, false, gesture.width); }
    else if (delta < 0) moveMenuDrawer(delta, true, gesture.width);
  };
  document.addEventListener('touchstart', event => {
    if (event.touches.length !== 1) {
      cancelAnimationFrame(gestureFrame); gestureFrame = 0;
      if (horizontalGesture && $('#menu-drawer').open) settleMenuDrawer(true);
      else if ($('#menu-drawer').open) closeMenuDrawer(true);
      horizontalGesture = null;
      return;
    }
    const touch = event.touches[0], drawer = $('#menu-drawer');
    const fromRightEdge = touch.clientX >= window.innerWidth - 24 && !event.target.closest('input,select,textarea');
    const open = drawer.open;
    const width = open ? Math.max(1, drawer.offsetWidth) : Math.max(1, Math.min(window.innerWidth * 0.75, 420));
    horizontalGesture = open ? (drawer.contains(event.target) ? { x: touch.clientX, y: touch.clientY, open, width, started: performance.now() } : null)
      : fromRightEdge ? { x: touch.clientX, y: touch.clientY, open, width, started: performance.now() } : null;
  }, { passive: true });
  document.addEventListener('touchmove', event => {
    if (!horizontalGesture || event.touches.length !== 1) return;
    const touch = event.touches[0], dx = touch.clientX - horizontalGesture.x, dy = Math.abs(touch.clientY - horizontalGesture.y);
    if (dy > 36 && dy > Math.abs(dx) * 1.15) {
      cancelAnimationFrame(gestureFrame); gestureFrame = 0;
      if (horizontalGesture.open) settleMenuDrawer(true);
      else if ($('#menu-drawer').open) { suppressBackdropClickAt(touch); settleMenuDrawer(true); }
      horizontalGesture = null;
      return;
    }
    if (Math.abs(dx) < 5) return;
    horizontalGesture.lastDelta = dx;
    if (!gestureFrame) gestureFrame = requestAnimationFrame(() => {
      gestureFrame = 0;
      if (horizontalGesture) moveGesture(horizontalGesture, horizontalGesture.lastDelta);
    });
  }, { passive: true });
  document.addEventListener('touchend', event => {
    if (!horizontalGesture) return;
    const gesture = horizontalGesture, touch = event.changedTouches[0], dx = touch.clientX - gesture.x, dy = Math.abs(touch.clientY - gesture.y);
    cancelAnimationFrame(gestureFrame); gestureFrame = 0; horizontalGesture = null;
    moveGesture(gesture, dx);
    const elapsed = Math.max(1, performance.now() - gesture.started), velocity = dx / elapsed;
    if (dy < 100 && !gesture.open) {
      const shouldOpen = dx <= -48 || (dx <= -24 && velocity < -0.45);
      if (shouldOpen) suppressBackdropClickAt(touch);
      if ($('#menu-drawer').open && $('#menu-drawer').classList.contains('drawer-dragging')) settleMenuDrawer(shouldOpen);
      else if ($('#menu-drawer').open) settleMenuDrawer(true);
      else if (shouldOpen) openMenuDrawer();
    } else if (dy < 100 && gesture.open) {
      const shouldClose = dx / gesture.width > 0.28 || velocity > 0.45;
      if ($('#menu-drawer').classList.contains('drawer-dragging')) settleMenuDrawer(!shouldClose);
      else if (shouldClose) closeMenuDrawer();
    } else if (gesture.open) settleMenuDrawer(true);
    else if ($('#menu-drawer').open) settleMenuDrawer(true);
  }, { passive: true });
  document.addEventListener('touchcancel', event => {
    if (!horizontalGesture) return;
    cancelAnimationFrame(gestureFrame); gestureFrame = 0;
    const touch = event.changedTouches?.[0];
    if ($('#menu-drawer').open) {
      if (!horizontalGesture.open && touch) suppressBackdropClickAt(touch);
      settleMenuDrawer(true);
    }
    horizontalGesture = null;
  }, { passive: true });
  document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => { switchPage(button.dataset.page); closeMenuDrawer(); }));
  $('#export-button').addEventListener('click', exportSchedule);
  $('#select-amozeshyar-file').addEventListener('click', () => $('#amozeshyar-file').click());
  $('#amozeshyar-file').addEventListener('change', event => previewAmozeshyarFile(event.target.files?.[0]));
  $('#apply-amozeshyar-import').addEventListener('click', applyAmozeshyarImport);
  $('#restore-backup-button').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', event => { const file = event.target.files?.[0]; if (file) importSchedule(file); });
  $('.close-dialog').addEventListener('click', () => $('#course-dialog').close());
  $('.cancel-dialog').addEventListener('click', () => $('#course-dialog').close());
  $('#delete-course-button').addEventListener('click', () => removeCourse($('#course-id').value));
  $('.close-details').addEventListener('click', () => $('#course-details-dialog').close());
  $('#edit-course-from-details').addEventListener('click', () => {
    const course = state.courses.find(item => item.id === activeDetailsCourseId);
    if (course) openCourseDialog(course);
  });
  $('#course-notes-button').addEventListener('click', () => openNotesPage(activeDetailsCourseId));
  $('#add-course-link-button').addEventListener('click', () => {
    const row = createCourseLinkRow();
    $('#course-links-list').append(row);
    row.querySelector('.course-link-title').focus();
  });
  $('#course-links-list').addEventListener('input', event => {
    if (!event.target.matches('.course-link-title')) return;
    const start = event.target.selectionStart, end = event.target.selectionEnd;
    const converted = toFaDigits(event.target.value);
    if (converted !== event.target.value) { event.target.value = converted; event.target.setSelectionRange(start, end); }
  });
  $('#details-course-links').addEventListener('click', event => {
    const anchor = event.target.closest('a.details-course-link');
    if (!anchor || !window.AndroidScheduleBridge?.openExternalUrl) return;
    event.preventDefault();
    window.AndroidScheduleBridge.openExternalUrl(anchor.href);
  });
  $('#back-to-courses').addEventListener('click', () => switchPage('courses'));
  $('#add-note-button').addEventListener('click', () => openNoteDialog());
  $('.close-note').addEventListener('click', () => $('#note-dialog').close());
  $('.cancel-note').addEventListener('click', () => $('#note-dialog').close());
  $('#note-form').addEventListener('submit', event => {
    event.preventDefault();
    const course = state.courses.find(item => item.id === activeNotesCourseId);
    const title = toFaDigits($('#note-title').value.trim()), text = toFaDigits($('#note-text').value.trim());
    if (!course) { $('#note-error').textContent = 'درس پیدا نشد.'; $('#note-error').hidden = false; return; }
    if (!title) { $('#note-error').textContent = 'عنوان یادداشت را وارد کنید.'; $('#note-error').hidden = false; return; }
    const id = $('#note-id').value || makeId('note');
    const note = { id, title, text };
    const index = course.notes.findIndex(item => item.id === id);
    if (index >= 0) course.notes[index] = note; else course.notes.push(note);
    saveState(); $('#note-dialog').close(); renderNotesPage(); refreshCourseDetails();
    showToast(index >= 0 ? 'یادداشت ویرایش شد.' : 'یادداشت اضافه شد.');
  });
  ['course-title', 'course-class-name', 'course-teacher', 'note-title', 'note-text'].forEach(id => {
    $(`#${id}`).addEventListener('input', event => {
      const start = event.target.selectionStart, end = event.target.selectionEnd;
      const converted = toFaDigits(event.target.value);
      if (converted !== event.target.value) { event.target.value = converted; event.target.setSelectionRange(start, end); }
    });
  });
  $('#course-form').addEventListener('input', event => {
    const input = event.target.closest('.schedule-time-input');
    if (!input) return;
    const weekIndex = Number(input.dataset.weekIndex);
    const entry = selectedScheduleByWeek[weekIndex]?.find(item => item.day === input.dataset.day);
    if (entry) entry[input.dataset.field] = input.value;
  });
  $('#course-form').addEventListener('submit', event => {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    const title = toFaDigits(String(values.get('title') || '').trim());
    const error = $('#form-error');
    if (!title) { error.textContent = 'نام درس را وارد کنید.'; error.hidden = false; return; }
    for (const [weekIndex, entries] of selectedScheduleByWeek.entries()) {
      for (const entry of entries) {
        const where = `${entry.day} در ${parityLabel(weekIndex)}`;
        const hasStart = Boolean(entry.start), hasEnd = Boolean(entry.end);
        if (hasStart !== hasEnd) { error.textContent = `برای ${where} ساعت شروع و پایان را با هم وارد کنید.`; error.hidden = false; return; }
        if (hasStart && entry.start >= entry.end) { error.textContent = `ساعت پایان ${where} باید بعد از ساعت شروع باشد.`; error.hidden = false; return; }
      }
    }
    const { links, error: linkError } = collectCourseLinks();
    if (!links) { error.textContent = linkError; error.hidden = false; return; }
    const id = String(values.get('id') || makeId()), previous = state.courses.find(item => item.id === id);
    const course = {
      id, title, scheduleByWeek: selectedScheduleByWeek.map(entries => entries.map(entry => ({ ...entry }))),
      className: toFaDigits(String(values.get('className') || '').trim()),
      teacher: toFaDigits(String(values.get('teacher') || '').trim()),
      links,
      notes: previous?.notes || []
    };
    const index = state.courses.findIndex(item => item.id === id);
    if (index >= 0) state.courses[index] = course; else state.courses.push(course);
    saveState(); $('#course-dialog').close(); render(); refreshCourseDetails(); showToast(index >= 0 ? 'تغییرات درس ذخیره شد.' : 'درس اضافه شد.');
  });
  if (window.history?.pushState) {
    const appState = { classScheduleApp: true };
    window.history.pushState(appState, '', window.location.href);
    window.addEventListener('popstate', () => {
      if (handleAppBack()) window.history.pushState(appState, '', window.location.href);
      else window.AndroidScheduleBridge?.exitApp?.();
    });
  }
  render(); syncTermSettings(); setInterval(render, 15000);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Offline support unavailable.', error)));
}

init();

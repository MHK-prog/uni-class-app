'use strict';

const TIME_ZONE = 'Asia/Tehran';
// Keep in sync with APP_VERSION in sw.js.
const APP_VERSION = '1.12.0';
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
let selectedDaysByWeek = [[], []];
let toastTimer;
let activeDetailsCourseId = '';
let activeNotesCourseId = '';
let activeModalCount = 0;
let lockedScrollY = 0;
let drawerCloseTimer;
let calendarTarget = 'dashboard';
let calendarDraftISO = '';
let calendarCursorISO = '';

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

function normalizeCourses(items, oldSettings = normalizeLegacySettings(), flipWeeks = false) {
  return items.map((raw, index) => {
    const title = toFaDigits(String(raw.title || raw.name || '').trim()).slice(0, 80);
    if (!title) return null;
    return {
      id: String(raw.id || makeId(index)), title,
      daysByWeek: normalizeDaysByWeek(raw, oldSettings, flipWeeks),
      start: validTime(raw.start) ? raw.start : '',
      end: validTime(raw.end) ? raw.end : '',
      className: toFaDigits(String(raw.className ?? raw.classroom ?? raw.room ?? '').trim()).slice(0, 50),
      teacher: toFaDigits(String(raw.teacher || '').trim()).slice(0, 80),
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
  calendarDraftISO = target === 'term' ? $('#term-start-date').value : selectedDateISO;
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

function formatDaysByWeek(daysByWeek = [[], []]) {
  return daysByWeek.map((days, index) => {
    const initials = WEEK_DAY_ORDER.filter(day => days.includes(day)).map(day => WEEK_DAY_SHORT[day]).join('، ') || '—';
    return `${parityForCycleIndex(index) === 'even' ? 'زوج' : 'فرد'}: ${initials}`;
  }).join('  |  ');
}

function currentSaturdayISO(now = new Date()) {
  const p = iranParts(now), date = new Date(Date.UTC(p.year, p.month - 1, p.day, 12));
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 1) % 7);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function syncTermSettings() {
  const date = $('#term-start-date'), label = $('#term-start-date-label');
  if (date) date.value = state.cycle.termStartDate;
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
    const weekIndex = Number(button.dataset.weekIndex), active = selectedDaysByWeek[weekIndex].includes(button.dataset.day);
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
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
        const selected = selectedDaysByWeek[weekIndex];
        selectedDaysByWeek[weekIndex] = selected.includes(day) ? selected.filter(item => item !== day) : [...selected, day];
        syncDayPickers();
      });
      row.append(button);
    });
  });
}

function statusFor(course, currentMinutes, isToday) {
  if (!course.daysByWeek?.some(days => days.length) || !course.start || !course.end) return 'incomplete';
  if (!isToday) return 'upcoming';
  const [startHour, startMinute] = course.start.split(':').map(Number);
  const [endHour, endMinute] = course.end.split(':').map(Number);
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
  $('#app-version').textContent = toFaDigits(APP_VERSION);
  $('#drawer-app-version').textContent = toFaDigits(APP_VERSION);
  const matching = state.courses.filter(course => course.daysByWeek?.[info.weekIndex]?.includes(info.weekday) && course.start && course.end).sort((a, b) => a.start.localeCompare(b.start));
  const rendered = matching.map(course => ({ course, status: statusFor(course, info.currentMinutes, info.isToday) })).filter(item => !(info.isToday && item.status === 'done'));
  $('#empty-title').textContent = info.isToday
    ? matching.length ? 'کلاس‌های امروز تمام شده‌اند' : 'امروز کلاسی ندارید'
    : `${info.weekday} ${info.shortFormatted} کلاسی ندارید`;
  const list = $('#schedule-list');
  list.replaceChildren(...rendered.map(item => createCourseCard(item.course, item.status)));
  $('#empty-state').hidden = rendered.length !== 0; list.hidden = rendered.length === 0;
  const byDay = [...state.courses].sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title, 'fa'));
  $('#manage-course-list').replaceChildren(...byDay.map(course => createCourseCard(course, !course.daysByWeek.some(days => days.length) || !course.start || !course.end ? 'incomplete' : 'upcoming', true)));
  $('#manage-empty').hidden = byDay.length !== 0;
  const hasIncomplete = state.courses.some(course => !course.daysByWeek.some(days => days.length) || !course.start || !course.end);
  const indicator = $('.incomplete-indicator');
  indicator.hidden = !hasIncomplete;
  $('#menu-button').setAttribute('aria-label', hasIncomplete ? 'باز کردن منو؛ درس ناقص دارید' : 'باز کردن منو');
  syncWeekRowLabels();
}

function createCourseCard(course, status, editable = false) {
  const article = document.createElement('article');
  article.className = `course-card status-${status} ${status === 'incomplete' ? 'incomplete' : ''} ${editable ? 'editable-card' : ''}`;
  const time = document.createElement('div'); time.className = 'course-time';
  time.textContent = status === 'incomplete' ? '—' : `${displayTime(course.start)} – ${displayTime(course.end)}`;
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
      const icon = document.createElement('img'); icon.className = 'meta-icon'; icon.src = 'assets/icons/profile.webp'; icon.alt = ''; icon.setAttribute('aria-hidden', 'true');
      teacher.append(icon, `استاد ${course.teacher}`); meta.append(teacher);
    }
    if (meta.childElementCount) info.append(meta);
    article.append(time, info);
  }
  return article;
}

function openCourseDialog(course = null) {
  const form = $('#course-form'); form.reset(); $('#form-error').hidden = true;
  $('#dialog-title').textContent = course ? 'ویرایش درس' : 'افزودن درس';
  $('#course-id').value = course?.id || ''; $('#course-title').value = course?.title || '';
  selectedDaysByWeek = course ? course.daysByWeek.map(days => [...days]) : [[], []];
  syncDayPickers();
  $('#course-start').value = course?.start || ''; $('#course-end').value = course?.end || ''; $('#course-class-name').value = course?.className || ''; $('#course-teacher').value = course?.teacher || '';
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
  $('#details-time').textContent = course.start && course.end ? `${displayTime(course.start)} – ${displayTime(course.end)}` : 'زمان ثبت نشده';
  $('#details-days').textContent = formatDaysByWeek(course.daysByWeek);
  $('#details-class-name').textContent = course.className || 'ثبت نشده';
  $('#details-teacher').textContent = course.teacher || 'ثبت نشده';
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
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'secondary-button';
    const editIcon = document.createElement('img'); editIcon.className = 'button-icon'; editIcon.src = 'assets/icons/edit.webp'; editIcon.alt = ''; editIcon.setAttribute('aria-hidden', 'true');
    edit.append(editIcon, 'ویرایش'); edit.addEventListener('click', () => openNoteDialog(note));
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'secondary-button note-delete'; remove.textContent = 'حذف'; remove.addEventListener('click', () => removeNote(note.id));
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

function exportSchedule() {
  const payload = JSON.stringify({ formatVersion: 6, cycle: state.cycle, courses: state.courses }, null, 2);
  if (window.AndroidScheduleBridge?.saveBackup) {
    window.AndroidScheduleBridge.saveBackup(payload);
    showToast('برای ذخیره، محل فایل را انتخاب کنید.');
    return;
  }
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'class-schedule.json'; link.click(); URL.revokeObjectURL(url);
  showToast('نسخهٔ پشتیبان برنامه دانلود شد.');
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
    if (state.courses.length && !window.confirm('برنامهٔ فعلی با اطلاعات فایل جایگزین شود؟')) return;
    state = { cycle, courses }; saveState(); render(); syncTermSettings();
    showToast(`${numberFa.format(courses.length)} درس وارد شد.`);
  } catch (error) { showToast(`وارد کردن فایل ناموفق بود: ${error.message || 'فایل JSON معتبر نیست.'}`); }
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
  $('#calendar-cancel').addEventListener('click', () => $('#date-picker-dialog').close());
  $('.close-calendar').addEventListener('click', () => $('#date-picker-dialog').close());
  $('#calendar-apply').addEventListener('click', () => {
    if (calendarTarget === 'term') {
      $('#term-start-date').value = calendarDraftISO;
      syncTermSettings();
    } else {
      selectedDateISO = calendarDraftISO;
      selectedDateMode = calendarDraftISO === targetDay(0).iso ? 'today' : 'custom';
    }
    $('#date-picker-dialog').close();
    render();
  });
  $('#refresh-button').addEventListener('click', async () => {
    const button = $('#refresh-button'); button.classList.add('refreshing');
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
    const fromRightEdge = touch.clientX >= window.innerWidth - 40;
    const onPageSwipeSurface = event.target.closest('.app-shell') && !event.target.closest('input,select,textarea');
    const open = drawer.open;
    const width = open ? Math.max(1, drawer.offsetWidth) : Math.max(1, Math.min(window.innerWidth * 0.75, 420));
    horizontalGesture = open ? (drawer.contains(event.target) ? { x: touch.clientX, y: touch.clientY, open, width, started: performance.now() } : null)
      : (fromRightEdge || onPageSwipeSurface) ? { x: touch.clientX, y: touch.clientY, open, width, started: performance.now() } : null;
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
      const shouldOpen = -dx / gesture.width > 0.28 || velocity < -0.45;
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
  $('#import-button').addEventListener('click', () => $('#import-file').click());
  $('#export-button').addEventListener('click', exportSchedule);
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
  $('#term-settings-form').addEventListener('submit', event => {
    event.preventDefault();
    const date = $('#term-start-date').value;
    if (!isValidISODate(date)) {
      showToast('تاریخ شروع ترم را انتخاب کنید.');
      return;
    }
    state.cycle = { termStartDate: date };
    saveState(); render(); syncTermSettings(); showToast('تاریخ شروع ترم ذخیره شد.');
  });
  ['course-title', 'course-class-name', 'course-teacher', 'note-title', 'note-text'].forEach(id => {
    $(`#${id}`).addEventListener('input', event => {
      const start = event.target.selectionStart, end = event.target.selectionEnd;
      const converted = toFaDigits(event.target.value);
      if (converted !== event.target.value) { event.target.value = converted; event.target.setSelectionRange(start, end); }
    });
  });
  $('#course-form').addEventListener('submit', event => {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    const title = toFaDigits(String(values.get('title') || '').trim());
    const start = String(values.get('start') || ''), end = String(values.get('end') || ''), error = $('#form-error');
    if (!title) { error.textContent = 'نام درس را وارد کنید.'; error.hidden = false; return; }
    if ((start && !end) || (!start && end)) { error.textContent = 'برای ساعت، شروع و پایان را با هم وارد کنید.'; error.hidden = false; return; }
    if (start && end && start >= end) { error.textContent = 'ساعت پایان باید بعد از ساعت شروع باشد.'; error.hidden = false; return; }
    const id = String(values.get('id') || makeId()), previous = state.courses.find(item => item.id === id);
    const course = {
      id, title, daysByWeek: selectedDaysByWeek.map(days => [...days]), start, end,
      className: toFaDigits(String(values.get('className') || '').trim()),
      teacher: toFaDigits(String(values.get('teacher') || '').trim()),
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

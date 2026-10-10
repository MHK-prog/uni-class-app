'use strict';

const TIME_ZONE = 'Asia/Tehran';
// Keep in sync with APP_VERSION in sw.js.
const APP_VERSION = '1.7.0';
const STORAGE_KEY = 'class-schedule-app-v1';
const DAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
const WEEK_DAY_ORDER = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
const WEEK_DAY_SHORT = { شنبه: 'ش', یکشنبه: 'ی', دوشنبه: 'د', 'سه‌شنبه': 'س', 'چهارشنبه': 'چ', پنجشنبه: 'پ', جمعه: 'ج' };
const LEGACY_DEFAULT_ANCHOR = '2026-10-03';
const DEFAULT_CYCLE = { anchorDate: currentSaturdayISO() };
const STATUS_LABELS = { upcoming: 'در پیش', live: 'در حال برگزاری', done: 'تمام‌شده' };
const numberFa = new Intl.NumberFormat('fa-IR');
const $ = selector => document.querySelector(selector);
let state = loadState();
let selectedDay = 'today';
let selectedDaysByWeek = [[], []];
let toastTimer;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && Array.isArray(saved.courses)) {
      const oldSettings = normalizeLegacySettings(saved.settings);
      return { cycle: normalizeCycle(saved.cycle, oldSettings), courses: normalizeCourses(saved.courses, oldSettings) };
    }
  } catch (error) { console.warn('Could not load saved schedule.', error); }
  return { cycle: { ...DEFAULT_CYCLE }, courses: [] };
}

function normalizeLegacySettings(input = {}) {
  if (!input || typeof input !== 'object') input = {};
  const date = input.anchorDate || '';
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00Z`));
  return { anchorDate: validDate ? date : LEGACY_DEFAULT_ANCHOR, anchorParity: input.anchorParity === 'odd' ? 'odd' : 'even' };
}

function normalizeCycle(input = {}, oldSettings = normalizeLegacySettings()) {
  if (!input || typeof input !== 'object') input = {};
  const date = input.anchorDate || oldSettings.anchorDate || DEFAULT_CYCLE.anchorDate;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00Z`));
  return { anchorDate: validDate ? date : DEFAULT_CYCLE.anchorDate };
}

function validTime(value) { return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value); }
function makeId(seed = '') { return globalThis.crypto?.randomUUID?.() || `course-${Date.now()}-${seed}-${Math.random().toString(36).slice(2, 8)}`; }

function normalizeDaysByWeek(raw, oldSettings) {
  const rawRows = raw.daysByWeek;
  if (Array.isArray(rawRows)) {
    return [0, 1].map(index => [...new Set((Array.isArray(rawRows[index]) ? rawRows[index] : []).filter(day => WEEK_DAY_ORDER.includes(day)))].sort((a, b) => WEEK_DAY_ORDER.indexOf(a) - WEEK_DAY_ORDER.indexOf(b)));
  }
  if (rawRows && typeof rawRows === 'object') {
    const first = rawRows.first || rawRows.week1 || [];
    const second = rawRows.second || rawRows.week2 || [];
    return [first, second].map(row => [...new Set((Array.isArray(row) ? row : []).filter(day => WEEK_DAY_ORDER.includes(day)))].sort((a, b) => WEEK_DAY_ORDER.indexOf(a) - WEEK_DAY_ORDER.indexOf(b)));
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
  return week === firstParity ? [[day], []] : [[], [day]];
}

function normalizeCourses(items, oldSettings = normalizeLegacySettings()) {
  return items.map((raw, index) => {
    const title = String(raw.title || raw.name || '').trim().slice(0, 80);
    if (!title) return null;
    return {
      id: String(raw.id || makeId(index)), title,
      daysByWeek: normalizeDaysByWeek(raw, oldSettings),
      start: validTime(raw.start) ? raw.start : '',
      end: validTime(raw.end) ? raw.end : '',
      room: String(raw.room || '').trim().slice(0, 50)
    };
  }).filter(Boolean);
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
  const result = { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  const iso = `${result.year}-${String(result.month).padStart(2, '0')}-${String(result.day).padStart(2, '0')}`;
  return {
    ...result, iso, weekday: DAYS[date.getUTCDay()],
    formatted: new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(date)
  };
}

function saturdayOnOrBefore(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 1) % 7);
  return date;
}

function cycleWeekIndex(dateString) {
  const anchor = saturdayOnOrBefore(state.cycle.anchorDate);
  const target = saturdayOnOrBefore(dateString);
  const weeks = Math.floor((target.getTime() - anchor.getTime()) / (7 * 86400000));
  return ((weeks % 2) + 2) % 2;
}

function toFaDigits(value) { return String(value).replace(/[0-9]/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]); }
function displayTime(value) { return value ? toFaDigits(value) : '—'; }

function formatDaysByWeek(daysByWeek = [[], []]) {
  return daysByWeek.map((days, index) => {
    const initials = WEEK_DAY_ORDER.filter(day => days.includes(day)).map(day => WEEK_DAY_SHORT[day]).join('، ') || '—';
    return `${index === 0 ? '۱' : '۲'}: ${initials}`;
  }).join('  |  ');
}

function currentSaturdayISO(now = new Date()) {
  const p = iranParts(now), date = new Date(Date.UTC(p.year, p.month - 1, p.day, 12));
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 1) % 7);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
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
      button.textContent = WEEK_DAY_SHORT[day]; button.title = day; button.setAttribute('aria-label', `${weekIndex === 0 ? 'هفتهٔ اول' : 'هفتهٔ دوم'}، ${day}`); button.setAttribute('aria-pressed', 'false');
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
  const offset = selectedDay === 'tomorrow' ? 1 : 0;
  const date = targetDay(offset, now), current = iranParts(now);
  return { ...date, isToday: offset === 0, currentMinutes: current.hour * 60 + current.minute, weekIndex: cycleWeekIndex(date.iso) };
}

function render(now = new Date()) {
  const today = targetDay(0, now), tomorrow = targetDay(1, now), info = selectedInfo(now), current = iranParts(now);
  $('#iran-clock').textContent = toFaDigits(`${String(current.hour).padStart(2, '0')}:${String(current.minute).padStart(2, '0')}`);
  $('#selected-date').textContent = info.formatted;
  $('#today-name').textContent = today.weekday; $('#tomorrow-name').textContent = tomorrow.weekday;
  $('#cycle-week-label').textContent = info.weekIndex === 0 ? 'هفتهٔ اول' : 'هفتهٔ دوم';
  $('#app-version').textContent = APP_VERSION;
  const matching = state.courses.filter(course => course.daysByWeek?.[info.weekIndex]?.includes(info.weekday) && course.start && course.end).sort((a, b) => a.start.localeCompare(b.start));
  const rendered = matching.map(course => ({ course, status: statusFor(course, info.currentMinutes, info.isToday) })).filter(item => !(info.isToday && item.status === 'done'));
  $('#empty-title').textContent = selectedDay === 'tomorrow' ? 'فردا کلاسی ندارید' : matching.length ? 'کلاس‌های امروز تمام شده‌اند' : 'امروز کلاسی ندارید';
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
}

function createCourseCard(course, status, editable = false) {
  const article = document.createElement('article');
  article.className = `course-card status-${status} ${status === 'incomplete' ? 'incomplete' : ''} ${editable ? 'editable-card' : ''}`;
  const time = document.createElement('div'); time.className = 'course-time';
  time.textContent = status === 'incomplete' ? '—' : `${displayTime(course.start)} – ${displayTime(course.end)}`;
  const info = document.createElement('div'); info.className = 'course-info';
  const title = document.createElement('h3'); title.textContent = course.title; info.append(title);
  const meta = document.createElement('div'); meta.className = 'course-meta';
  if (editable) { const days = document.createElement('span'); days.className = 'meta-chip recurrence-summary'; days.textContent = formatDaysByWeek(course.daysByWeek); meta.append(days); }
  if (course.room) { const room = document.createElement('span'); room.className = 'meta-chip'; room.textContent = `کلاس ${course.room}`; meta.append(room); }
  info.append(meta);
  if (editable) {
    const actions = document.createElement('div'); actions.className = 'card-actions';
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'card-action'; edit.textContent = '✎'; edit.title = 'ویرایش درس'; edit.setAttribute('aria-label', `ویرایش ${course.title}`); edit.addEventListener('click', () => openCourseDialog(course));
    actions.append(edit); article.append(time, info, actions);
  } else {
    const pill = document.createElement('span'); pill.className = 'status-pill'; pill.textContent = STATUS_LABELS[status];
    article.append(time, info, pill);
  }
  return article;
}

function openCourseDialog(course = null) {
  const form = $('#course-form'); form.reset(); $('#form-error').hidden = true;
  $('#dialog-title').textContent = course ? 'ویرایش درس' : 'افزودن درس';
  $('#course-id').value = course?.id || ''; $('#course-title').value = course?.title || '';
  selectedDaysByWeek = course ? course.daysByWeek.map(days => [...days]) : [[], []];
  syncDayPickers();
  $('#course-start').value = course?.start || ''; $('#course-end').value = course?.end || ''; $('#course-room').value = course?.room || '';
  $('#delete-course-button').hidden = !course;
  $('#course-dialog').showModal(); $('#course-title').focus();
}

function removeCourse(id) {
  const course = state.courses.find(item => item.id === id);
  if (!course || !window.confirm(`درس «${course.title}» حذف شود؟`)) return;
  state.courses = state.courses.filter(item => item.id !== id); saveState(); $('#course-dialog').close(); render(); showToast('درس حذف شد.');
}

function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function exportSchedule() {
  const payload = JSON.stringify({ formatVersion: 2, cycle: state.cycle, courses: state.courses }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'class-schedule.json'; link.click(); URL.revokeObjectURL(url);
  showToast('نسخهٔ پشتیبان برنامه دانلود شد.');
}

async function importSchedule(file) {
  try {
    const parsed = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
    if (!parsed || !Array.isArray(parsed.courses)) throw new Error('ساختار فایل درست نیست.');
    const oldSettings = normalizeLegacySettings(parsed.settings);
    const cycle = normalizeCycle(parsed.cycle, oldSettings);
    const courses = normalizeCourses(parsed.courses, oldSettings);
    if (parsed.courses.length && !courses.length) throw new Error('هیچ درس معتبری در فایل پیدا نشد.');
    if (state.courses.length && !window.confirm('برنامهٔ فعلی با اطلاعات فایل جایگزین شود؟')) return;
    state = { cycle, courses }; saveState(); render();
    showToast(`${numberFa.format(courses.length)} درس وارد شد.`);
  } catch (error) { showToast(`وارد کردن فایل ناموفق بود: ${error.message || 'فایل JSON معتبر نیست.'}`); }
  finally { $('#import-file').value = ''; }
}

function init() {
  initDayPickers();
  document.querySelectorAll('[data-day]').forEach(button => button.addEventListener('click', () => {
    selectedDay = button.dataset.day;
    document.querySelectorAll('[data-day]').forEach(option => { const active = option === button; option.classList.toggle('active', active); option.setAttribute('aria-pressed', String(active)); });
    render();
  }));
  $('#add-course-button').addEventListener('click', () => openCourseDialog());
  $('#menu-button').addEventListener('click', () => { if (!$('#menu-drawer').open) $('#menu-drawer').showModal(); });
  $('.close-menu').addEventListener('click', () => $('#menu-drawer').close());
  $('#menu-drawer').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
  $('#course-dialog').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
  let horizontalGesture = null;
  document.addEventListener('touchstart', event => {
    if (event.touches.length !== 1) { horizontalGesture = null; return; }
    const touch = event.touches[0], drawer = $('#menu-drawer');
    const onPageSwipeSurface = event.target.closest('.app-shell') && !event.target.closest('button,a,input,select,textarea,.day-switch');
    horizontalGesture = drawer.open ? (drawer.contains(event.target) ? { x: touch.clientX, y: touch.clientY, open: true } : null)
      : onPageSwipeSurface ? { x: touch.clientX, y: touch.clientY, open: false } : null;
  }, { passive: true });
  document.addEventListener('touchend', event => {
    if (!horizontalGesture) return;
    const touch = event.changedTouches[0], dx = touch.clientX - horizontalGesture.x, dy = Math.abs(touch.clientY - horizontalGesture.y);
    if (dy < 90 && Math.abs(dx) > dy * 1.2 && !horizontalGesture.open && dx < -55) $('#menu-drawer').showModal();
    else if (dy < 90 && Math.abs(dx) > dy * 1.2 && horizontalGesture.open && dx > 55) $('#menu-drawer').close();
    horizontalGesture = null;
  }, { passive: true });
  document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => {
    const destination = button.dataset.page;
    document.querySelectorAll('[data-page-panel]').forEach(panel => { panel.hidden = panel.dataset.pagePanel !== destination; });
    document.querySelectorAll('.page-link').forEach(link => link.classList.toggle('active', link === button));
    $('#menu-drawer').close();
  }));
  $('#import-button').addEventListener('click', () => $('#import-file').click());
  $('#export-button').addEventListener('click', exportSchedule);
  $('#import-file').addEventListener('change', event => { const file = event.target.files?.[0]; if (file) importSchedule(file); });
  $('.close-dialog').addEventListener('click', () => $('#course-dialog').close());
  $('.cancel-dialog').addEventListener('click', () => $('#course-dialog').close());
  $('#delete-course-button').addEventListener('click', () => removeCourse($('#course-id').value));
  $('#course-form').addEventListener('submit', event => {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    const title = String(values.get('title') || '').trim();
    const start = String(values.get('start') || ''), end = String(values.get('end') || ''), error = $('#form-error');
    if (!title) { error.textContent = 'نام درس را وارد کنید.'; error.hidden = false; return; }
    if ((start && !end) || (!start && end)) { error.textContent = 'برای ساعت، شروع و پایان را با هم وارد کنید.'; error.hidden = false; return; }
    if (start && end && start >= end) { error.textContent = 'ساعت پایان باید بعد از ساعت شروع باشد.'; error.hidden = false; return; }
    const id = String(values.get('id') || makeId()), course = { id, title, daysByWeek: selectedDaysByWeek.map(days => [...days]), start, end, room: String(values.get('room') || '').trim() };
    const index = state.courses.findIndex(item => item.id === id);
    if (index >= 0) state.courses[index] = course; else state.courses.push(course);
    saveState(); $('#course-dialog').close(); render(); showToast(index >= 0 ? 'تغییرات درس ذخیره شد.' : 'درس اضافه شد.');
  });
  render(); setInterval(render, 15000);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Offline support unavailable.', error)));
}

init();

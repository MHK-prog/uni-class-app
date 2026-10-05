'use strict';

const TIME_ZONE = 'Asia/Tehran';
const STORAGE_KEY = 'class-schedule-app-v1';
const DEFAULT_SETTINGS = { anchorDate: '2026-10-03', anchorParity: 'even' };
const DAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
const WEEK_LABELS = { weekly: 'هر هفته', even: 'هفتهٔ زوج', odd: 'هفتهٔ فرد' };
const STATUS_LABELS = { upcoming: 'در پیش', live: 'در حال برگزاری', done: 'تمام‌شده' };
const numberFa = new Intl.NumberFormat('fa-IR');
const $ = selector => document.querySelector(selector);
let state = loadState();
let selectedDay = 'today';
let toastTimer;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && Array.isArray(saved.courses)) return { settings: normalizeSettings(saved.settings), courses: normalizeCourses(saved.courses) };
  } catch (error) { console.warn('Could not load saved schedule.', error); }
  return { settings: { ...DEFAULT_SETTINGS }, courses: [] };
}

function normalizeSettings(input = {}) {
  const date = input.anchorDate || '';
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00Z`));
  return { anchorDate: validDate ? date : DEFAULT_SETTINGS.anchorDate, anchorParity: input.anchorParity === 'odd' ? 'odd' : 'even' };
}

function validTime(value) { return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value); }
function makeId(seed = '') { return globalThis.crypto?.randomUUID?.() || `course-${Date.now()}-${seed}-${Math.random().toString(36).slice(2, 8)}`; }

function normalizeCourses(items) {
  return items.map((raw, index) => {
    const title = String(raw.title || raw.name || '').trim().slice(0, 80);
    if (!title) return null;
    let week = raw.week;
    if (week === 'هفته زوج' || week === 'زوج') week = 'even';
    else if (week === 'هفته فرد' || week === 'فرد') week = 'odd';
    else if (!['weekly', 'even', 'odd'].includes(week)) week = 'weekly';
    return {
      id: String(raw.id || makeId(index)), title,
      day: DAYS.includes(raw.day) ? raw.day : '',
      start: validTime(raw.start) ? raw.start : '',
      end: validTime(raw.end) ? raw.end : '',
      week, room: String(raw.room || '').trim().slice(0, 50)
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

function parityFor(dateString) {
  const anchor = saturdayOnOrBefore(state.settings.anchorDate);
  const target = saturdayOnOrBefore(dateString);
  const weeks = Math.floor((target.getTime() - anchor.getTime()) / (7 * 86400000));
  const sameParity = Math.abs(weeks % 2) === 0;
  const even = state.settings.anchorParity === 'even' ? sameParity : !sameParity;
  return even ? 'even' : 'odd';
}

function toFaDigits(value) { return String(value).replace(/[0-9]/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]); }
function displayTime(value) { return value ? toFaDigits(value) : '—'; }

function statusFor(course, currentMinutes, isToday, selectedParity) {
  if (!course.day || !course.start || !course.end) return 'incomplete';
  if (course.week !== 'weekly' && course.week !== selectedParity) return 'excluded';
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
  return { ...date, isToday: offset === 0, currentMinutes: current.hour * 60 + current.minute, parity: parityFor(date.iso) };
}

function syncSettingsForm() {
  $('#anchor-date').value = state.settings.anchorDate;
  $('#anchor-parity').value = state.settings.anchorParity;
  $('#anchor-parity-label').textContent = state.settings.anchorParity === 'even' ? 'زوج' : 'فرد';
}

function render(now = new Date()) {
  const today = targetDay(0, now), tomorrow = targetDay(1, now), info = selectedInfo(now), current = iranParts(now);
  $('#iran-clock').textContent = toFaDigits(`${String(current.hour).padStart(2, '0')}:${String(current.minute).padStart(2, '0')}`);
  $('#selected-date').textContent = info.formatted;
  $('#today-name').textContent = today.weekday; $('#tomorrow-name').textContent = tomorrow.weekday;
  $('#week-parity').textContent = info.parity === 'even' ? 'زوج' : 'فرد';
  $('#schedule-kicker').textContent = selectedDay === 'today' ? 'برنامهٔ امروز' : 'برنامهٔ فردا';
  $('#empty-title').textContent = selectedDay === 'today' ? 'امروز کلاسی ندارید' : 'فردا کلاسی ندارید';
  const matching = state.courses.filter(course => course.day === info.weekday && (course.week === 'weekly' || course.week === info.parity)).sort((a, b) => a.start.localeCompare(b.start));
  const rendered = matching.map(course => ({ course, status: statusFor(course, info.currentMinutes, info.isToday, info.parity) }));
  $('#class-count').textContent = `${numberFa.format(rendered.length)} کلاس`;
  $('#count-upcoming').textContent = numberFa.format(rendered.filter(item => item.status === 'upcoming').length);
  $('#count-live').textContent = numberFa.format(rendered.filter(item => item.status === 'live').length);
  $('#count-done').textContent = numberFa.format(rendered.filter(item => item.status === 'done').length);
  const list = $('#schedule-list');
  list.replaceChildren(...rendered.map(item => createCourseCard(item.course, item.status)));
  $('#empty-state').hidden = rendered.length !== 0; list.hidden = rendered.length === 0;
  const incomplete = state.courses.filter(course => !course.day || !course.start || !course.end);
  $('#incomplete-section').hidden = incomplete.length === 0;
  $('#incomplete-list').replaceChildren(...incomplete.map(course => createCourseCard(course, 'incomplete'));
}

function createCourseCard(course, status) {
  const article = document.createElement('article');
  article.className = `course-card status-${status} ${status === 'incomplete' ? 'incomplete' : ''} has-actions`;
  const time = document.createElement('div'); time.className = 'course-time';
  time.textContent = status === 'incomplete' ? '—' : `${displayTime(course.start)} – ${displayTime(course.end)}`;
  const info = document.createElement('div'); info.className = 'course-info';
  const title = document.createElement('h3'); title.textContent = course.title; info.append(title);
  const meta = document.createElement('div'); meta.className = 'course-meta';
  const week = document.createElement('span'); week.className = 'meta-chip'; week.textContent = WEEK_LABELS[course.week] || WEEK_LABELS.weekly; meta.append(week);
  if (course.room) { const room = document.createElement('span'); room.className = 'meta-chip'; room.textContent = `کلاس ${course.room}`; meta.append(room); }
  if (status === 'incomplete') { const note = document.createElement('span'); note.className = 'meta-chip'; note.textContent = 'روز یا ساعت ثبت نشده'; meta.append(note); }
  info.append(meta);
  const pill = document.createElement('span'); pill.className = 'status-pill'; pill.textContent = status === 'incomplete' ? 'برنامه ناقص' : STATUS_LABELS[status];
  const actions = document.createElement('div'); actions.className = 'card-actions';
  const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'card-action'; edit.textContent = '✎'; edit.title = 'ویرایش درس'; edit.setAttribute('aria-label', `ویرایش ${course.title}`); edit.addEventListener('click', () => openCourseDialog(course));
  const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'card-action delete'; remove.textContent = '×'; remove.title = 'حذف درس'; remove.setAttribute('aria-label', `حذف ${course.title}`); remove.addEventListener('click', () => removeCourse(course.id));
  actions.append(edit, remove); article.append(time, info, pill, actions); return article;
}

function openCourseDialog(course = null) {
  const form = $('#course-form'); form.reset(); $('#form-error').hidden = true;
  $('#dialog-title').textContent = course ? 'ویرایش درس' : 'افزودن درس';
  $('#course-id').value = course?.id || ''; $('#course-title').value = course?.title || '';
  $('#course-day').value = course?.day || ''; $('#course-week').value = course?.week || 'weekly';
  $('#course-start').value = course?.start || ''; $('#course-end').value = course?.end || ''; $('#course-room').value = course?.room || '';
  $('#course-dialog').showModal(); $('#course-title').focus();
}

function removeCourse(id) {
  const course = state.courses.find(item => item.id === id);
  if (!course || !window.confirm(`درس «${course.title}» حذف شود؟`)) return;
  state.courses = state.courses.filter(item => item.id !== id); saveState(); render(); showToast('درس حذف شد.');
}

function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function exportSchedule() {
  const payload = JSON.stringify({ formatVersion: 1, settings: state.settings, courses: state.courses }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'class-schedule.json'; link.click(); URL.revokeObjectURL(url);
  showToast('نسخهٔ پشتیبان برنامه دانلود شد.');
}

async function importSchedule(file) {
  try {
    const parsed = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
    if (!parsed || !Array.isArray(parsed.courses)) throw new Error('ساختار فایل درست نیست.');
    const courses = normalizeCourses(parsed.courses);
    if (parsed.courses.length && !courses.length) throw new Error('هیچ درس معتبری در فایل پیدا نشد.');
    if (state.courses.length && !window.confirm('برنامهٔ فعلی با اطلاعات فایل جایگزین شود؟')) return;
    state = { settings: normalizeSettings(parsed.settings), courses }; saveState(); syncSettingsForm(); render();
    showToast(`${numberFa.format(courses.length)} درس وارد شد.`);
  } catch (error) { showToast(`وارد کردن فایل ناموفق بود: ${error.message || 'فایل JSON معتبر نیست.'}`); }
  finally { $('#import-file').value = ''; }
}

function init() {
  DAYS.forEach(day => { const option = document.createElement('option'); option.value = day; option.textContent = day; $('#course-day').append(option); });
  document.querySelectorAll('[data-day]').forEach(button => button.addEventListener('click', () => {
    selectedDay = button.dataset.day;
    document.querySelectorAll('[data-day]').forEach(option => { const active = option === button; option.classList.toggle('active', active); option.setAttribute('aria-pressed', String(active)); });
    render();
  }));
  $('#add-course-button').addEventListener('click', () => openCourseDialog());
  $('#empty-import-button').addEventListener('click', () => $('#import-file').click());
  $('#import-button').addEventListener('click', () => $('#import-file').click());
  $('#export-button').addEventListener('click', exportSchedule);
  $('#import-file').addEventListener('change', event => { const file = event.target.files?.[0]; if (file) importSchedule(file); });
  $('.close-dialog').addEventListener('click', () => $('#course-dialog').close());
  $('.cancel-dialog').addEventListener('click', () => $('#course-dialog').close());
  $('#course-form').addEventListener('submit', event => {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    const title = String(values.get('title') || '').trim(), day = String(values.get('day') || '');
    const start = String(values.get('start') || ''), end = String(values.get('end') || ''), error = $('#form-error');
    if (!title) { error.textContent = 'نام درس را وارد کنید.'; error.hidden = false; return; }
    if ((start && !end) || (!start && end)) { error.textContent = 'برای ساعت، شروع و پایان را با هم وارد کنید.'; error.hidden = false; return; }
    if (start && end && start >= end) { error.textContent = 'ساعت پایان باید بعد از ساعت شروع باشد.'; error.hidden = false; return; }
    const id = String(values.get('id') || makeId()), course = { id, title, day, start, end, week: String(values.get('week') || 'weekly'), room: String(values.get('room') || '').trim() };
    const index = state.courses.findIndex(item => item.id === id);
    if (index >= 0) state.courses[index] = course; else state.courses.push(course);
    saveState(); $('#course-dialog').close(); render(); showToast(index >= 0 ? 'تغییرات درس ذخیره شد.' : 'درس اضافه شد.');
  });
  $('#week-settings-form').addEventListener('submit', event => {
    event.preventDefault();
    const pickedDate = new Date(`${$('#anchor-date').value}T12:00:00Z`);
    if (pickedDate.getUTCDay() !== 6) { showToast('تاریخ مبنا باید شنبه باشد.'); return; }
    state.settings = normalizeSettings({ anchorDate: $('#anchor-date').value, anchorParity: $('#anchor-parity').value });
    saveState(); syncSettingsForm(); render(); showToast('مبنای هفته ذخیره شد.');
  });
  syncSettingsForm(); render(); setInterval(render, 15000);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Offline support unavailable.', error)));
}

init();

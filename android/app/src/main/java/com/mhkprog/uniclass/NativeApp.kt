@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.mhkprog.uniclass

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.view.View
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Divider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.AbsoluteAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.temporal.ChronoUnit

private sealed class NativeRoute {
    data object Dashboard : NativeRoute()
    data object Courses : NativeRoute()
    data object Settings : NativeRoute()
    data object Help : NativeRoute()
    data object Import : NativeRoute()
    data class CourseEditor(val courseId: String?) : NativeRoute()
    data class Collection(val courseId: String, val type: CollectionType) : NativeRoute()
}

private enum class CollectionType { LINKS, SCHEDULE, NOTES }
private data class FieldEditor(val courseId: String, val field: String)
private data class DateDialogState(val selected: LocalDate, val onChoose: (LocalDate) -> Unit)
private data class EventDraft(
    val id: String = "", val title: String = "", val date: LocalDate = PersianDates.todayIran(),
    val start: String = "", val end: String = "", val description: String = ""
)
private data class SelectedMht(val name: String, val bytes: ByteArray, val token: Long = System.nanoTime())

private data class NativePalette(
    val background: Color, val panel: Color, val panel2: Color, val line: Color,
    val text: Color, val muted: Color, val accent: Color, val accentSoft: Color,
    val upcoming: Color, val live: Color, val done: Color, val danger: Color
)

private fun color(hex: Long) = Color(hex)
private val accents = mapOf(
    "purple" to 0xFFA477FF, "blue" to 0xFF4D9CFF, "teal" to 0xFF38C6C2,
    "green" to 0xFF42C987, "orange" to 0xFFFFA94D, "pink" to 0xFFEE75B5, "red" to 0xFFEF6262
)

private fun palette(theme: String, accent: String): NativePalette {
    val a = color(accents[accent] ?: accents.getValue("purple"))
    return if (theme == "light") NativePalette(
        background = color(0xFFF3F5F9), panel = color(0xFFFFFFFF), panel2 = color(0xFFEAEAF2),
        line = color(0xFFD8D9E2), text = color(0xFF26222D), muted = color(0xFF696473),
        accent = a, accentSoft = a, upcoming = color(0xFFD28B19), live = color(0xFF218F68),
        done = color(0xFF3D87D8), danger = color(0xFFD44A56)
    ) else NativePalette(
        background = color(0xFF09080D), panel = color(0xFF15121C), panel2 = color(0xFF1C1726),
        line = color(0xFF30283B), text = color(0xFFF4EFFF), muted = color(0xFFA69BB9),
        accent = a, accentSoft = a.copy(alpha = 0.82f), upcoming = color(0xFFEDBD57),
        live = color(0xFF43D6A5), done = color(0xFF68A8FF), danger = color(0xFFFF7785)
    )
}

@Composable
fun EClassApp(store: ScheduleStore, onExit: () -> Unit) {
    val state = store.state
    val colors = remember(state.preferences.theme, state.preferences.accent) { palette(state.preferences.theme, state.preferences.accent) }
    val context = LocalContext.current
    var route by remember { mutableStateOf<NativeRoute>(NativeRoute.Dashboard) }
    val history = remember { mutableStateListOf<NativeRoute>() }
    var drawerOpen by rememberSaveable { mutableStateOf(false) }
    var selectedDateIso by rememberSaveable { mutableStateOf(PersianDates.iso(PersianDates.todayIran())) }
    var clockTick by remember { mutableIntStateOf(0) }
    var detailCourseId by remember { mutableStateOf<String?>(null) }
    var fieldEditor by remember { mutableStateOf<FieldEditor?>(null) }
    var deletingCourseId by remember { mutableStateOf<String?>(null) }
    var pendingRestoreJson by remember { mutableStateOf<String?>(null) }
    var dateDialog by remember { mutableStateOf<DateDialogState?>(null) }
    var eventDraft by remember { mutableStateOf<EventDraft?>(null) }
    var toastText by remember { mutableStateOf("") }
    var selectedMht by remember { mutableStateOf<SelectedMht?>(null) }

    fun navigate(destination: NativeRoute) {
        history.add(route)
        route = destination
        drawerOpen = false
    }
    fun goBack() {
        if (drawerOpen) drawerOpen = false
        else if (eventDraft != null) eventDraft = null
        else if (dateDialog != null) dateDialog = null
        else if (fieldEditor != null) fieldEditor = null
        else if (detailCourseId != null) detailCourseId = null
        else if (history.isNotEmpty()) route = history.removeAt(history.lastIndex)
        else if (route != NativeRoute.Dashboard) route = NativeRoute.Dashboard
        else onExit()
    }
    fun changePage(destination: NativeRoute) {
        history.clear()
        route = destination
        drawerOpen = false
    }
    fun updateCourse(courseId: String, transform: (Course) -> Course) {
        store.update { app -> app.copy(courses = app.courses.map { if (it.id == courseId) transform(it) else it }) }
    }
    fun openDatePicker(initial: LocalDate, onChoose: (LocalDate) -> Unit) {
        dateDialog = DateDialogState(initial, onChoose)
    }

    LaunchedEffect(Unit) {
        var lastIranDate = PersianDates.iso(PersianDates.todayIran())
        while (true) {
            delay(15_000)
            clockTick++
            val todayIso = PersianDates.iso(PersianDates.todayIran())
            if (!PersianDates.isValidIso(selectedDateIso)) selectedDateIso = todayIso
            else if (selectedDateIso == lastIranDate && todayIso != lastIranDate) selectedDateIso = todayIso
            lastIranDate = todayIso
        }
    }
    BackHandler { goBack() }

    val backupPayload = remember { mutableStateOf("") }
    val saveBackupLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri != null) runCatching {
            val output = context.contentResolver.openOutputStream(uri) ?: error("فایل ذخیره نشد")
            output.use { it.write(backupPayload.value.toByteArray(Charsets.UTF_8)) }
            toastText = "نسخهٔ پشتیبان ذخیره شد."
        }.onFailure { toastText = "ذخیرهٔ پشتیبان انجام نشد." }
    }
    val restoreLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) runCatching {
            val json = context.contentResolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
                ?: error("فایل خوانده نشد")
            ScheduleStore.decode(json)
            if (store.state.courses.isNotEmpty() || store.state.events.isNotEmpty()) pendingRestoreJson = json
            else {
                store.restore(json)
                toastText = "برنامه از نسخهٔ پشتیبان بازیابی شد."
            }
        }.onFailure { toastText = "فایل پشتیبان معتبر نیست." }
    }
    val mhtLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) runCatching {
            val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: error("فایل خوانده نشد")
            selectedMht = SelectedMht(uri.lastPathSegment?.substringAfterLast('/') ?: "schedule.mht", bytes)
        }.onFailure { toastText = "خواندن فایل انجام نشد." }
    }

    val scheme = if (state.preferences.theme == "light") lightColorScheme(
        primary = colors.accent, onPrimary = Color.White, background = colors.background,
        surface = colors.panel, onSurface = colors.text, secondary = colors.accentSoft
    ) else darkColorScheme(
        primary = colors.accent, onPrimary = Color.White, background = colors.background,
        surface = colors.panel, onSurface = colors.text, secondary = colors.accentSoft
    )

    SideEffect {
        val window = (context as? Activity)?.window ?: return@SideEffect
        val lightBars = state.preferences.theme == "light"
        window.statusBarColor = colors.background.toArgb()
        window.navigationBarColor = colors.background.toArgb()
        var flags = if (lightBars) View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR else 0
        if (Build.VERSION.SDK_INT >= 26 && lightBars) flags = flags or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        window.decorView.systemUiVisibility = flags
        if (Build.VERSION.SDK_INT >= 29) {
            window.isStatusBarContrastEnforced = false
            window.isNavigationBarContrastEnforced = false
        }
    }

    androidx.compose.runtime.CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
        val vazirFamily = remember { FontFamily(Font(R.font.vazirmatn_regular, FontWeight.Normal)) }
        MaterialTheme(colorScheme = scheme, typography = MaterialTheme.typography.copy(defaultFontFamily = vazirFamily)) {
            Surface(Modifier.fillMaxSize(), color = colors.background) {
                Box(Modifier.fillMaxSize()) {
        Column(
                        Modifier.fillMaxHeight().widthIn(max = 560.dp).fillMaxWidth().align(Alignment.TopCenter)
                            .windowInsetsPadding(WindowInsets.safeDrawing).padding(horizontal = 14.dp)
                            .pointerInput(drawerOpen) {
                                var startedAtLeft = false
                                var distance = 0f
                                detectHorizontalDragGestures(onDragStart = { startedAtLeft = it.x < 36.dp.toPx(); distance = 0f },
                                    onHorizontalDrag = { _, amount -> distance += amount },
                                    onDragEnd = { if (!drawerOpen && startedAtLeft && distance > 75f) drawerOpen = true },
                                    onDragCancel = { distance = 0f })
                            }
                    ) {
                        TopBar(colors = colors, onMenu = { drawerOpen = true })
                        AnimatedContent(targetState = route, label = "app-page") { currentRoute ->
                            when (currentRoute) {
                                NativeRoute.Dashboard -> DashboardPage(
                                    state = state, selectedDateIso = selectedDateIso, clockTick = clockTick,
                                    colors = colors, onStepDay = { delta -> selectedDateIso = PersianDates.iso(PersianDates.parseIso(selectedDateIso).plusDays(delta.toLong())) },
                                    onPickDate = { openDatePicker(PersianDates.parseIso(selectedDateIso)) { selectedDateIso = PersianDates.iso(it) } },
                                    onCourse = { detailCourseId = it },
                                    onManageCourses = { navigate(NativeRoute.Courses) },
                                    onAddCourse = { navigate(NativeRoute.CourseEditor(null)) },
                                    onAddEvent = { eventDraft = EventDraft(date = PersianDates.parseIso(selectedDateIso)) },
                                    onEvent = { event -> eventDraft = event.toDraft() }
                                )
                                NativeRoute.Courses -> CoursesPage(
                                    courses = state.courses, colors = colors,
                                    onAdd = { navigate(NativeRoute.CourseEditor(null)) },
                                    onOpen = { detailCourseId = it }, onDelete = { deletingCourseId = it }
                                )
                                NativeRoute.Settings -> SettingsPage(
                                    state = state, colors = colors,
                                    onTermDate = { openDatePicker(PersianDates.parseIso(state.termStartDate)) { date -> store.update { it.copy(termStartDate = PersianDates.iso(date)) } } },
                                    onTheme = { theme -> store.update { it.copy(preferences = it.preferences.copy(theme = theme)) } },
                                    onAccent = { accent -> store.update { it.copy(preferences = it.preferences.copy(accent = accent)) } },
                                    onBackup = {
                                        backupPayload.value = store.backupJson()
                                        saveBackupLauncher.launch("eclass-backup.json")
                                    },
                                    onRestore = { restoreLauncher.launch(arrayOf("application/json", "text/json", "application/octet-stream")) },
                                    onImport = { navigate(NativeRoute.Import) }
                                )
                                NativeRoute.Help -> HelpPage(colors)
                                NativeRoute.Import -> ImportPage(
                                    store = store, colors = colors,
                                    selectedFile = selectedMht,
                                    onPickFile = { mhtLauncher.launch(arrayOf("application/x-mimearchive", "message/rfc822", "text/html", "application/octet-stream")) },
                                    onBackupRestore = { restoreLauncher.launch(arrayOf("application/json", "text/json", "application/octet-stream")) },
                                    toast = { toastText = it }
                                )
                                is NativeRoute.CourseEditor -> CourseEditorPage(
                                    course = state.courses.firstOrNull { it.id == currentRoute.courseId }, colors = colors,
                                    onCancel = { goBack() },
                                    onSave = { title, teacher, className ->
                                        if (currentRoute.courseId == null) {
                                            store.update { it.copy(courses = it.courses + Course(title = title, teacher = teacher, className = className)) }
                                        } else updateCourse(currentRoute.courseId, { it.copy(title = title, teacher = teacher, className = className) })
                                        toastText = "اطلاعات درس ذخیره شد."
                                        goBack()
                                    }
                                )
                                is NativeRoute.Collection -> CourseCollectionPage(
                                    course = state.courses.firstOrNull { it.id == currentRoute.courseId }, type = currentRoute.type,
                                    colors = colors, onBack = { goBack() },
                                    onSaveCourse = { updated -> updateCourse(updated.id) { updated } },
                                    onOpenUrl = { value -> runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(value))) }.onFailure { toastText = "باز کردن لینک ممکن نشد." } },
                                    onToast = { toastText = it }
                                )
                            }
                        }
                    }

                    AnimatedVisibility(
                        visible = drawerOpen,
                        enter = fadeIn(), exit = fadeOut(),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        Box(Modifier.fillMaxSize()) {
                            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.56f)).clickable { drawerOpen = false })
                            AnimatedVisibility(
                                visible = drawerOpen,
                                enter = slideInHorizontally(initialOffsetX = { -it }),
                                exit = slideOutHorizontally(targetOffsetX = { -it }),
                                modifier = Modifier.align(AbsoluteAlignment.TopLeft)
                            ) {
                                DrawerPanel(
                                    colors = colors, onClose = { drawerOpen = false },
                                    onDashboard = { changePage(NativeRoute.Dashboard) },
                                    onCourses = { changePage(NativeRoute.Courses) },
                                    onSettings = { changePage(NativeRoute.Settings) },
                                    onHelp = { changePage(NativeRoute.Help) }
                                )
                            }
                        }
                    }

                    if (detailCourseId != null) {
                        val course = state.courses.firstOrNull { it.id == detailCourseId }
                        if (course != null) CourseDetailsDialog(
                            course = course, colors = colors,
                            onDismiss = { detailCourseId = null },
                            onField = { fieldEditor = FieldEditor(course.id, it) },
                            onCollection = { type -> detailCourseId = null; navigate(NativeRoute.Collection(course.id, type)) }
                        ) else detailCourseId = null
                    }

                    fieldEditor?.let { editor ->
                        val course = state.courses.firstOrNull { it.id == editor.courseId }
                        if (course != null) CourseFieldDialog(
                            course = course, field = editor.field, colors = colors,
                            onDismiss = { fieldEditor = null },
                            onSave = { value ->
                                updateCourse(course.id) { current -> when (editor.field) {
                                    "title" -> current.copy(title = value)
                                    "teacher" -> current.copy(teacher = value)
                                    else -> current.copy(className = value)
                                } }
                                fieldEditor = null
                            }
                        )
                    }

                    deletingCourseId?.let { id ->
                        ConfirmDialog("حذف درس", "این درس و یادداشت‌ها و لینک‌هایش حذف شوند؟", colors,
                            onDismiss = { deletingCourseId = null }, onConfirm = {
                                store.update { it.copy(courses = it.courses.filterNot { course -> course.id == id }) }
                                deletingCourseId = null
                            })
                    }

                    pendingRestoreJson?.let { json ->
                        ConfirmDialog("بازیابی پشتیبان", "اطلاعات فعلی با فایل پشتیبان جایگزین می‌شود. یک نسخهٔ پشتیبان داخلی از اطلاعات فعلی ساخته خواهد شد.", colors,
                            onDismiss = { pendingRestoreJson = null }, onConfirm = {
                                runCatching { store.saveAutomaticBackup(); store.restore(json) }
                                    .onSuccess { toastText = "برنامه از نسخهٔ پشتیبان بازیابی شد." }
                                    .onFailure { toastText = "بازیابی پشتیبان انجام نشد." }
                                pendingRestoreJson = null
                            })
                    }

                    eventDraft?.let { draft ->
                        EventDialog(draft = draft, colors = colors,
                            onDismiss = { eventDraft = null },
                            onPickDate = { initial -> openDatePicker(initial) { chosen -> eventDraft = eventDraft?.copy(date = chosen) } },
                            onSave = { updated ->
                                if (updated.title.isBlank()) toastText = "عنوان رویداد را وارد کنید."
                                else if ((updated.start.isNotBlank() && !validTime(updated.start)) || (updated.end.isNotBlank() && !validTime(updated.end))) toastText = "ساعت را با قالب ۱۴:۳۰ وارد کنید."
                                else {
                                    val event = ScheduleEvent(
                                        id = updated.id.ifBlank { newId() }, title = updated.title, date = PersianDates.iso(updated.date),
                                        start = updated.start.enDigits(), end = updated.end.enDigits(), description = updated.description
                                    )
                                    store.update { app -> app.copy(events = (app.events.filterNot { it.id == event.id } + event).sortedBy { it.date + it.start }) }
                                    eventDraft = null
                                }
                            }, onDelete = { id -> store.update { it.copy(events = it.events.filterNot { event -> event.id == id }) }; eventDraft = null }
                        )
                    }

                    dateDialog?.let { picker ->
                        JalaliDateDialog(picker.selected, colors, onDismiss = { dateDialog = null }, onSelect = {
                            picker.onChoose(it)
                            dateDialog = null
                        })
                    }

                    if (toastText.isNotBlank()) {
                        LaunchedEffect(toastText) { delay(2200); toastText = "" }
                        Surface(
                            Modifier.align(Alignment.BottomCenter).padding(bottom = 22.dp).widthIn(max = 420.dp),
                            color = colors.panel2, shape = RoundedCornerShape(14.dp), border = BorderStroke(1.dp, colors.line)
                        ) { Text(toastText, Modifier.padding(horizontal = 18.dp, vertical = 12.dp), color = colors.text, textAlign = TextAlign.Center, fontSize = 14.sp) }
                    }
                }
            }
        }
    }
}

@Composable
private fun TopBar(colors: NativePalette, onMenu: () -> Unit) {
    Row(Modifier.fillMaxWidth().height(62.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("ایکلاس", color = colors.text, fontSize = 21.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.weight(1f))
        IconButton(onClick = onMenu, modifier = Modifier.size(50.dp)) {
            Image(painterResource(R.drawable.ic_menu_native), contentDescription = "باز کردن منو", modifier = Modifier.size(30.dp))
        }
    }
}

@Composable
private fun AppIcon(resource: Int, description: String?, modifier: Modifier = Modifier.size(23.dp)) {
    Image(painter = painterResource(resource), contentDescription = description, modifier = modifier)
}

@Composable
private fun DrawerPanel(
    colors: NativePalette, onClose: () -> Unit, onDashboard: () -> Unit,
    onCourses: () -> Unit, onSettings: () -> Unit, onHelp: () -> Unit
) {
    Column(
        Modifier.fillMaxHeight().widthIn(min = 250.dp, max = 340.dp).fillMaxWidth(0.78f)
            .clip(RoundedCornerShape(topStart = 20.dp, bottomStart = 20.dp))
            .then(Modifier)
            .padding(0.dp)
    ) {
        Surface(Modifier.fillMaxSize(), color = colors.background, border = BorderStroke(1.dp, colors.line), shape = RoundedCornerShape(topStart = 20.dp, bottomStart = 20.dp)) {
            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("منو", Modifier.weight(1f), color = colors.text, fontSize = 21.sp, fontWeight = FontWeight.Bold)
                    IconButton(onClick = onClose) { AppIcon(R.drawable.ic_close_native, "بستن", Modifier.size(30.dp)) }
                }
                DrawerItem("برنامه", colors, onDashboard)
                DrawerItem("مدیریت درس‌ها", colors, onCourses)
                DrawerItem("تنظیمات", colors, onSettings)
                DrawerItem("راهنما", colors, onHelp)
                Spacer(Modifier.weight(1f))
                Text("نسخهٔ ${BuildConfig.VERSION_NAME.faDigits()}", Modifier.fillMaxWidth(), color = colors.muted, textAlign = TextAlign.Center, fontSize = 13.sp)
            }
        }
    }
}

@Composable
private fun DrawerItem(label: String, colors: NativePalette, onClick: () -> Unit) {
    Surface(onClick = onClick, color = colors.panel, shape = RoundedCornerShape(13.dp), border = BorderStroke(1.dp, colors.line)) {
        Row(Modifier.fillMaxWidth().heightIn(min = 54.dp).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(label, color = colors.text, fontSize = 16.sp, fontWeight = FontWeight.Medium)
        }
    }
}

@Composable
private fun DashboardPage(
    state: AppState, selectedDateIso: String, clockTick: Int, colors: NativePalette,
    onStepDay: (Int) -> Unit, onPickDate: () -> Unit, onCourse: (String) -> Unit, onManageCourses: () -> Unit,
    onAddCourse: () -> Unit, onAddEvent: () -> Unit, onEvent: (EventDraft) -> Unit
) {
    val selectedDate = remember(selectedDateIso) { PersianDates.parseIso(selectedDateIso) }
    val today = PersianDates.todayIran()
    val now = PersianDates.nowIran()
    val week = PersianDates.weekIndex(selectedDateIso, state.termStartDate)
    val entries = remember(state, selectedDateIso, clockTick) {
        val dayName = PersianDates.weekday(selectedDate)
        val schedule = state.courses.flatMap { course ->
            course.scheduleByWeek.getOrNull(week).orEmpty().filter { it.day == dayName }
                .map { DashboardItem.CourseItem(course, it) }
        }
        val events = state.events.filter { it.date == selectedDateIso }.map { DashboardItem.EventItem(it) }
        (schedule + events).sortedWith(compareBy<DashboardItem> { it.startMinute() }.thenBy { it.title() })
    }
    var quickAddExpanded by remember { mutableStateOf(false) }
    val calendarWidth = LocalConfiguration.current.screenWidthDp

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(top = 2.dp, bottom = 13.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            DayCapsule("ساعت", "${now.hour.toString().padStart(2, '0')}:${now.minute.toString().padStart(2, '0')}", colors, Modifier.weight(1f))
            DayCapsule("تاریخ", PersianDates.format(selectedDate), colors, Modifier.weight(1f))
            DayCapsule("روز هفته", PersianDates.weekday(selectedDate), colors, Modifier.weight(1f))
            DayCapsule("نوع هفته", if (week == 0) "فرد" else "زوج", colors, Modifier.weight(0.8f), accent = true)
        }
        Row(Modifier.fillMaxWidth().padding(bottom = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            IconButton(onClick = { onStepDay(-1) }, modifier = Modifier.size(48.dp)) { Icon(Icons.Filled.KeyboardArrowRight, "روز قبل", tint = colors.accentSoft, modifier = Modifier.size(32.dp)) }
            Surface(onClick = onPickDate, modifier = Modifier.weight(1f), shape = RoundedCornerShape(13.dp), color = colors.panel, border = BorderStroke(1.dp, colors.line)) {
                Row(Modifier.height(48.dp).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                    Text("انتخاب تاریخ", color = colors.text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                }
            }
            IconButton(onClick = { onStepDay(1) }, modifier = Modifier.size(48.dp)) { Icon(Icons.Filled.KeyboardArrowLeft, "روز بعد", tint = colors.accentSoft, modifier = Modifier.size(32.dp)) }
        }

        Box(Modifier.weight(1f).fillMaxWidth().pointerInput(selectedDateIso) {
            var drag = 0f
            detectHorizontalDragGestures(onHorizontalDrag = { _, amount -> drag += amount }, onDragEnd = {
                if (drag > 70f) onStepDay(1) else if (drag < -70f) onStepDay(-1)
                drag = 0f
            }, onDragCancel = { drag = 0f })
        }) {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 90.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                if (entries.isEmpty()) {
                    EmptyCard(
                        if (selectedDate == today) "امروز کلاسی ندارید" else "${PersianDates.weekday(selectedDate)} ${PersianDates.format(selectedDate)} کلاسی ندارید",
                        colors, "مدیریت درس‌ها", onClick = onManageCourses
                    )
                } else {
                    entries.forEach { item ->
                        when (item) {
                            is DashboardItem.CourseItem -> ScheduleCard(
                                title = item.course.title, start = item.meeting.start, end = item.meeting.end,
                                status = meetingStatus(item.meeting.start, item.meeting.end, selectedDate, today, now.hour * 60 + now.minute),
                                meta = listOfNotNull(item.course.className.takeIf(String::isNotBlank)?.let { "کلاس $it" }, item.course.teacher.takeIf(String::isNotBlank)?.let { "استاد $it" }),
                                colors = colors, onClick = { onCourse(item.course.id) }
                            )
                            is DashboardItem.EventItem -> ScheduleCard(
                                title = item.event.title, start = item.event.start, end = item.event.end,
                                status = meetingStatus(item.event.start, item.event.end, selectedDate, today, now.hour * 60 + now.minute),
                                meta = listOf("رویداد"), colors = colors, onClick = { onEvent(item.event.toDraft()) }
                            )
                        }
                    }
                }
            }

            Column(Modifier.align(Alignment.BottomStart), horizontalAlignment = Alignment.Start, verticalArrangement = Arrangement.spacedBy(9.dp)) {
                AnimatedVisibility(quickAddExpanded, enter = fadeIn(), exit = fadeOut()) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        FloatingChoice("درس", colors) { quickAddExpanded = false; onAddCourse() }
                        FloatingChoice("رویداد", colors) { quickAddExpanded = false; onAddEvent() }
                    }
                }
                Button(onClick = { quickAddExpanded = !quickAddExpanded }, modifier = Modifier.size(58.dp), shape = CircleShape,
                    colors = ButtonDefaults.buttonColors(containerColor = colors.accent)) {
                    Text(if (quickAddExpanded) "×" else "+", color = Color.White, fontSize = 31.sp, fontWeight = FontWeight.Normal)
                }
            }
        }
    }
}

private sealed class DashboardItem {
    data class CourseItem(val course: Course, val meeting: Meeting) : DashboardItem()
    data class EventItem(val event: ScheduleEvent) : DashboardItem()
    fun startMinute(): Int = when (this) {
        is CourseItem -> timeMinute(meeting.start)
        is EventItem -> timeMinute(event.start)
    }
    fun title(): String = when (this) { is CourseItem -> course.title; is EventItem -> event.title }
}

private fun timeMinute(time: String): Int = time.enDigits().split(":").let { parts -> (parts.getOrNull(0)?.toIntOrNull() ?: 0) * 60 + (parts.getOrNull(1)?.toIntOrNull() ?: 0) }

private fun meetingStatus(start: String, end: String, selected: LocalDate, today: LocalDate, now: Int): String {
    if (selected < today) return "done"
    if (selected > today || !validTime(start) || !validTime(end)) return "upcoming"
    return when {
        now < timeMinute(start) -> "upcoming"
        now < timeMinute(end) -> "live"
        else -> "done"
    }
}

@Composable
private fun DayCapsule(label: String, value: String, colors: NativePalette, modifier: Modifier = Modifier, accent: Boolean = false) {
    Surface(modifier.heightIn(min = 59.dp), color = if (accent) colors.accent.copy(alpha = 0.16f) else colors.panel,
        shape = RoundedCornerShape(18.dp), border = BorderStroke(1.dp, if (accent) colors.accent.copy(alpha = 0.45f) else colors.line)) {
        Column(Modifier.padding(horizontal = 5.dp, vertical = 7.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Text(label, color = colors.muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(value.faDigits(), color = if (accent) colors.accentSoft else colors.text, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun ScheduleCard(
    title: String, start: String, end: String, status: String, meta: List<String>,
    colors: NativePalette, onClick: () -> Unit
) {
    val edge = when (status) { "live" -> colors.live; "done" -> colors.done; else -> colors.upcoming }
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(15.dp),
        colors = CardDefaults.cardColors(containerColor = colors.panel), border = BorderStroke(1.dp, colors.line)) {
        Row(Modifier.fillMaxWidth().heightIn(min = 78.dp).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(Modifier.width(3.dp).height(48.dp), color = edge, shape = RoundedCornerShape(4.dp)) {}
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(title, color = colors.text, fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (meta.isNotEmpty()) {
                    Spacer(Modifier.height(2.dp))
                    Text(meta.joinToString("   •   "), color = colors.muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.width(106.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(if (validTime(start) && validTime(end)) "${start.faDigits()} – ${end.faDigits()}" else "—", color = colors.text, fontSize = 14.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                Spacer(Modifier.height(5.dp))
                Surface(color = edge.copy(alpha = 0.15f), shape = RoundedCornerShape(8.dp)) {
                    Text(when (status) { "live" -> "در حال برگزاری"; "done" -> "تمام‌شده"; else -> "در پیش" }, Modifier.padding(horizontal = 8.dp, vertical = 3.dp), color = edge, fontSize = 11.sp)
                }
            }
        }
    }
}

@Composable
private fun FloatingChoice(label: String, colors: NativePalette, onClick: () -> Unit) {
    Surface(onClick = onClick, color = colors.panel2, shape = RoundedCornerShape(14.dp), border = BorderStroke(1.dp, colors.line)) {
        Text(label, Modifier.padding(horizontal = 20.dp, vertical = 11.dp), color = colors.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun EmptyCard(message: String, colors: NativePalette, action: String? = null, onClick: (() -> Unit)? = null) {
    Surface(Modifier.fillMaxWidth(), color = colors.panel, shape = RoundedCornerShape(15.dp), border = BorderStroke(1.dp, colors.line)) {
        Column(Modifier.padding(18.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(message, color = colors.muted, fontSize = 15.sp, textAlign = TextAlign.Center)
            if (action != null && onClick != null) TextButton(onClick) { Text(action, color = colors.accentSoft, fontSize = 14.sp) }
        }
    }
}

@Composable
private fun CoursesPage(courses: List<Course>, colors: NativePalette, onAdd: () -> Unit, onOpen: (String) -> Unit, onDelete: (String) -> Unit) {
    Column(Modifier.fillMaxSize()) {
        PageTitle("درس‌ها", "افزودن درس", colors, onAdd)
        if (courses.isEmpty()) EmptyCard("هنوز درسی اضافه نکرده‌اید.", colors)
        else Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            courses.forEach { course ->
                Surface(color = colors.panel, shape = RoundedCornerShape(14.dp), border = BorderStroke(1.dp, colors.line)) {
                    Row(Modifier.fillMaxWidth().heightIn(min = 66.dp).padding(start = 6.dp, end = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(course.title, Modifier.weight(1f).clickable { onOpen(course.id) }.padding(vertical = 14.dp), color = colors.text, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        TextButton(onClick = { onOpen(course.id) }) { Text("⋮", color = colors.accentSoft, fontSize = 24.sp, fontWeight = FontWeight.Bold) }
                        IconButton(onClick = { onDelete(course.id) }) { AppIcon(R.drawable.delete, "حذف", Modifier.size(25.dp)) }
                    }
                }
            }
        }
    }
}

@Composable
private fun PageTitle(title: String, action: String, colors: NativePalette, onAction: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(top = 6.dp, bottom = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, Modifier.weight(1f), color = colors.text, fontSize = 21.sp, fontWeight = FontWeight.Bold)
        Button(onAction, colors = ButtonDefaults.buttonColors(containerColor = colors.accent), shape = RoundedCornerShape(12.dp)) {
            AppIcon(R.drawable.add, null, Modifier.size(23.dp)); Spacer(Modifier.width(5.dp)); Text(action, fontSize = 14.sp)
        }
    }
}

@Composable
private fun SettingsPage(
    state: AppState, colors: NativePalette, onTermDate: () -> Unit,
    onTheme: (String) -> Unit, onAccent: (String) -> Unit,
    onBackup: () -> Unit, onRestore: () -> Unit, onImport: () -> Unit
) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("تنظیمات", color = colors.text, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 7.dp))
        SettingsGroup("تقویم ترم", colors) {
            SettingRow("تاریخ شروع ترم", PersianDates.format(PersianDates.parseIso(state.termStartDate)), null, colors, onTermDate)
        }
        SettingsGroup("ظاهر برنامه", colors) {
            Text("حالت نمایش", color = colors.muted, fontSize = 13.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ChoiceChip("تیره", state.preferences.theme == "dark", colors, Modifier.weight(1f)) { onTheme("dark") }
                ChoiceChip("روشن", state.preferences.theme == "light", colors, Modifier.weight(1f)) { onTheme("light") }
            }
            Spacer(Modifier.height(5.dp))
            Text("رنگ برنامه", color = colors.muted, fontSize = 13.sp)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                accents.keys.forEach { name ->
                    val chosen = state.preferences.accent == name
                    Surface(
                        onClick = { onAccent(name) }, modifier = Modifier.size(if (chosen) 39.dp else 34.dp),
                        color = color(accents.getValue(name)), shape = CircleShape,
                        border = BorderStroke(if (chosen) 3.dp else 1.dp, if (chosen) colors.text else colors.line)
                    ) {}
                }
            }
            Text("${accentLabel(state.preferences.accent)} · ${if (state.preferences.theme == "dark") "تیره" else "روشن"}", color = colors.text, fontSize = 14.sp)
        }
        SettingsGroup("پشتیبان و ورود اطلاعات", colors) {
            SettingRow("ذخیرهٔ پشتیبان", "ذخیرهٔ همهٔ درس‌ها، زمان‌ها و یادداشت‌ها", R.drawable.download, colors, onBackup)
            SettingRow("بارگذاری پشتیبان", "جایگزینی اطلاعات با فایل پشتیبان", R.drawable.upload, colors, onRestore)
            SettingRow("وارد کردن از آموزشیار", "انتخاب فایل MHT یا MHTML", null, colors, onImport)
        }
    }
}

private fun accentLabel(name: String) = when (name) {
    "blue" -> "آبی"; "teal" -> "فیروزه‌ای"; "green" -> "سبز"; "orange" -> "نارنجی"; "pink" -> "صورتی"; "red" -> "قرمز"; else -> "بنفش"
}

@Composable
private fun SettingsGroup(title: String, colors: NativePalette, content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    Surface(Modifier.fillMaxWidth(), color = colors.panel, shape = RoundedCornerShape(16.dp), border = BorderStroke(1.dp, colors.line)) {
        Column(Modifier.padding(15.dp), verticalArrangement = Arrangement.spacedBy(11.dp)) {
            Text(title, color = colors.text, fontSize = 17.sp, fontWeight = FontWeight.Bold)
            content()
        }
    }
}

@Composable
private fun SettingRow(title: String, subtitle: String, icon: Int?, colors: NativePalette, onClick: () -> Unit) {
    Surface(onClick = onClick, color = colors.panel2, shape = RoundedCornerShape(12.dp)) {
        Row(Modifier.fillMaxWidth().heightIn(min = 61.dp).padding(horizontal = 12.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, color = colors.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                Text(subtitle, color = colors.muted, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            Spacer(Modifier.width(8.dp))
            icon?.let { AppIcon(it, null, Modifier.size(24.dp)) }
        }
    }
}

@Composable
private fun ChoiceChip(label: String, selected: Boolean, colors: NativePalette, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Surface(onClick = onClick, modifier = modifier.heightIn(min = 46.dp), color = if (selected) colors.accent.copy(alpha = .20f) else colors.panel2,
        shape = RoundedCornerShape(12.dp), border = BorderStroke(1.dp, if (selected) colors.accent else colors.line)) {
        Box(contentAlignment = Alignment.Center) { Text(label, color = if (selected) colors.accentSoft else colors.text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp) }
    }
}

@Composable
private fun HelpPage(colors: NativePalette) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 22.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("راهنما", color = colors.text, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 7.dp, bottom = 3.dp))
        HelpCard("دیدن برنامهٔ روزانه", "با پیکان‌ها بین روزها جابه‌جا شوید یا «انتخاب تاریخ» را بزنید. هر جلسهٔ درس کارت جداگانه دارد و وضعیت آن با رنگ مشخص می‌شود.", colors)
        HelpCard("افزودن درس و زمان", "از منو به مدیریت درس‌ها بروید و درس را بسازید. از جزئیات درس، بخش زمان‌های برگزاری را باز کنید و برای هر هفته، روز و ساعت جداگانه اضافه کنید.", colors)
        HelpCard("لینک و یادداشت", "در جزئیات هر درس می‌توانید لینک‌های موردنیاز و یادداشت‌های خودتان را ثبت، ویرایش یا حذف کنید.", colors)
        HelpCard("رویدادها", "دکمهٔ + پایین برنامه را بزنید، رویداد را انتخاب کنید و عنوان، تاریخ، ساعت یا توضیحات را وارد کنید.", colors)
        HelpCard("پشتیبان و آموزشیار", "در تنظیمات می‌توانید از اطلاعات فایل پشتیبان بگیرید یا آن را بازیابی کنید. فایل MHT آموزشیار هم از همان صفحه قابل وارد کردن است.", colors)
        HelpCard("هفتهٔ فرد و زوج", "هفتهٔ شروع ترم هفتهٔ فرد است. برنامه، هفته‌های بعد را با فاصله‌های هفت‌روزه به‌صورت زوج و فرد حساب می‌کند.", colors)
    }
}

@Composable
private fun HelpCard(title: String, body: String, colors: NativePalette) {
    Surface(Modifier.fillMaxWidth(), color = colors.panel, shape = RoundedCornerShape(14.dp), border = BorderStroke(1.dp, colors.line)) {
        Column(Modifier.padding(15.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(title, color = colors.accentSoft, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Text(body, color = colors.text, fontSize = 14.sp, lineHeight = 21.sp)
        }
    }
}

@Composable
private fun CourseEditorPage(course: Course?, colors: NativePalette, onCancel: () -> Unit, onSave: (String, String, String) -> Unit) {
    var title by remember(course?.id) { mutableStateOf(course?.title.orEmpty()) }
    var teacher by remember(course?.id) { mutableStateOf(course?.teacher.orEmpty()) }
    var className by remember(course?.id) { mutableStateOf(course?.className.orEmpty()) }
    var error by remember(course?.id) { mutableStateOf("") }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth().padding(top = 5.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(if (course == null) "افزودن درس" else "ویرایش درس", Modifier.weight(1f), color = colors.text, fontSize = 21.sp, fontWeight = FontWeight.Bold)
            IconButton(onClick = onCancel) { AppIcon(R.drawable.ic_close_native, "بستن", Modifier.size(28.dp)) }
        }
        OutlinedTextField(title, { title = it.faDigits() }, Modifier.fillMaxWidth(), label = { Text("نام درس") }, singleLine = true)
        OutlinedTextField(teacher, { teacher = it.faDigits() }, Modifier.fillMaxWidth(), label = { Text("نام استاد") }, singleLine = true)
        OutlinedTextField(className, { className = it.faDigits() }, Modifier.fillMaxWidth(), label = { Text("نام کلاس") }, singleLine = true)
        if (error.isNotEmpty()) Text(error, color = colors.danger, fontSize = 13.sp)
        Button(onClick = {
            if (title.isBlank()) error = "نام درس را وارد کنید."
            else onSave(title.trim(), teacher.trim(), className.trim())
        }, Modifier.fillMaxWidth().heightIn(min = 50.dp), colors = ButtonDefaults.buttonColors(containerColor = colors.accent), shape = RoundedCornerShape(13.dp)) {
            AppIcon(R.drawable.ic_check_native, null, Modifier.size(23.dp)); Spacer(Modifier.width(7.dp)); Text("ذخیرهٔ درس", fontSize = 16.sp)
        }
    }
}

@Composable
private fun CourseCollectionPage(
    course: Course?, type: CollectionType, colors: NativePalette, onBack: () -> Unit,
    onSaveCourse: (Course) -> Unit, onOpenUrl: (String) -> Unit, onToast: (String) -> Unit
) {
    if (course == null) {
        EmptyCard("این درس در دسترس نیست.", colors)
        return
    }
    var linkEditor by remember { mutableStateOf<CourseLink?>(null) }
    var linkDialogOpen by remember { mutableStateOf(false) }
    var noteEditor by remember { mutableStateOf<CourseNote?>(null) }
    var noteDialogOpen by remember { mutableStateOf(false) }
    var scheduleEditor by remember { mutableStateOf<ScheduleEditor?>(null) }
    var deleteItem by remember { mutableStateOf<DeleteCollectionItem?>(null) }
    val pageTitle = when (type) { CollectionType.LINKS -> "لینک‌ها"; CollectionType.SCHEDULE -> "زمان‌های برگزاری"; CollectionType.NOTES -> "یادداشت‌ها" }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(top = 4.dp, bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, null, tint = colors.accentSoft); Spacer(Modifier.width(6.dp)); Text("بازگشت", color = colors.accentSoft) }
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(pageTitle, color = colors.text, fontSize = 19.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                Text(course.title, color = colors.muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Button(onClick = {
                when (type) {
                    CollectionType.LINKS -> { linkEditor = null; linkDialogOpen = true }
                    CollectionType.NOTES -> { noteEditor = null; noteDialogOpen = true }
                    CollectionType.SCHEDULE -> scheduleEditor = ScheduleEditor()
                }
            }, colors = ButtonDefaults.buttonColors(containerColor = colors.accent), shape = RoundedCornerShape(12.dp)) {
                AppIcon(R.drawable.add, null, Modifier.size(21.dp)); Spacer(Modifier.width(4.dp)); Text("افزودن", fontSize = 14.sp)
            }
        }

        val itemCount = when (type) {
            CollectionType.LINKS -> course.links.size
            CollectionType.NOTES -> course.notes.size
            CollectionType.SCHEDULE -> course.scheduleByWeek.sumOf { it.size }
        }
        if (itemCount == 0) {
            EmptyCard(when (type) { CollectionType.LINKS -> "لینکی برای این درس ثبت نشده است."; CollectionType.NOTES -> "یادداشتی ثبت نشده."; CollectionType.SCHEDULE -> "زمانی برای این درس ثبت نشده است." }, colors)
        } else Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            when (type) {
                CollectionType.LINKS -> course.links.forEach { link ->
                    CollectionCard(link.title, link.url, colors, onOpen = { onOpenUrl(link.url) }, onEdit = { linkEditor = link; linkDialogOpen = true }, onDelete = { deleteItem = DeleteCollectionItem.LinkItem(link) })
                }
                CollectionType.NOTES -> course.notes.forEach { note ->
                    CollectionCard(note.title, null, colors, onOpen = { noteEditor = note; noteDialogOpen = true }, onEdit = { noteEditor = note; noteDialogOpen = true }, onDelete = { deleteItem = DeleteCollectionItem.NoteItem(note) }, titleOnly = true)
                }
                CollectionType.SCHEDULE -> course.scheduleByWeek.forEachIndexed { weekIndex, entries -> entries.forEach { meeting ->
                    val subtitle = "${if (weekIndex == 0) "هفتهٔ فرد" else "هفتهٔ زوج"} · ${meeting.day} · ${meeting.start.faDigits()} تا ${meeting.end.faDigits()}"
                    CollectionCard(subtitle, null, colors, onOpen = { scheduleEditor = ScheduleEditor(week = weekIndex.toString(), day = meeting.day, start = meeting.start.faDigits(), end = meeting.end.faDigits(), oldWeek = weekIndex, oldMeeting = meeting) }, onEdit = { scheduleEditor = ScheduleEditor(week = weekIndex.toString(), day = meeting.day, start = meeting.start.faDigits(), end = meeting.end.faDigits(), oldWeek = weekIndex, oldMeeting = meeting) }, onDelete = { deleteItem = DeleteCollectionItem.ScheduleItem(weekIndex, meeting) }, titleOnly = true)
                } }
            }
        }
    }

    if (linkDialogOpen) LinkDialog(linkEditor, colors, onDismiss = { linkDialogOpen = false }, onSave = { title, url ->
        val normalized = ScheduleStore.normalizeUrl(url)
        if (title.isBlank() || normalized.isBlank()) onToast("عنوان و نشانی معتبر لینک را وارد کنید.")
        else {
            val next = if (linkEditor == null) course.copy(links = course.links + CourseLink(title = title.trim(), url = normalized))
            else course.copy(links = course.links.map { if (it.id == linkEditor?.id) it.copy(title = title.trim(), url = normalized) else it })
            onSaveCourse(next); linkDialogOpen = false
        }
    })
    if (noteDialogOpen) NoteDialog(noteEditor, colors, onDismiss = { noteDialogOpen = false }, onSave = { title, body ->
        if (title.isBlank()) onToast("عنوان یادداشت را وارد کنید.")
        else {
            val next = if (noteEditor == null) course.copy(notes = course.notes + CourseNote(title = title.trim(), text = body.trim()))
            else course.copy(notes = course.notes.map { if (it.id == noteEditor?.id) it.copy(title = title.trim(), text = body.trim()) else it })
            onSaveCourse(next); noteDialogOpen = false
        }
    })
    scheduleEditor?.let { draft -> ScheduleDialog(draft, colors, onDismiss = { scheduleEditor = null }, onSave = { updated ->
        val start = updated.start.enDigits(); val end = updated.end.enDigits()
        if (!validTime(start) || !validTime(end) || start >= end) onToast("ساعت شروع و پایان را درست وارد کنید.")
        else {
            val schedules = course.scheduleByWeek.map { it.toMutableList() }.toMutableList()
            if (updated.oldWeek != null && updated.oldMeeting != null) schedules[updated.oldWeek].remove(updated.oldMeeting)
            val weeks = when (updated.week) { "both" -> listOf(0, 1); else -> listOf(updated.week.toIntOrNull() ?: 0) }
            weeks.forEach { weekIndex ->
                val meeting = Meeting(updated.day, start, end)
                if (meeting !in schedules[weekIndex]) schedules[weekIndex].add(meeting)
            }
            onSaveCourse(course.copy(scheduleByWeek = schedules)); scheduleEditor = null
        }
    }) }
    deleteItem?.let { item -> ConfirmDialog("حذف مورد", "این مورد حذف شود؟", colors, onDismiss = { deleteItem = null }, onConfirm = {
        when (item) {
            is DeleteCollectionItem.LinkItem -> onSaveCourse(course.copy(links = course.links.filterNot { it.id == item.value.id }))
            is DeleteCollectionItem.NoteItem -> onSaveCourse(course.copy(notes = course.notes.filterNot { it.id == item.value.id }))
            is DeleteCollectionItem.ScheduleItem -> onSaveCourse(course.copy(scheduleByWeek = course.scheduleByWeek.mapIndexed { i, entries -> if (i == item.week) entries.filterNot { it == item.meeting } else entries }))
        }
        deleteItem = null
    }) }
}

private data class ScheduleEditor(
    val week: String = "0", val day: String = weekDays.first(), val start: String = "", val end: String = "",
    val oldWeek: Int? = null, val oldMeeting: Meeting? = null
)
private sealed class DeleteCollectionItem {
    data class LinkItem(val value: CourseLink) : DeleteCollectionItem()
    data class NoteItem(val value: CourseNote) : DeleteCollectionItem()
    data class ScheduleItem(val week: Int, val meeting: Meeting) : DeleteCollectionItem()
}

@Composable
private fun CollectionCard(
    title: String, subtitle: String?, colors: NativePalette, onOpen: () -> Unit,
    onEdit: () -> Unit, onDelete: () -> Unit, titleOnly: Boolean = false
) {
    Surface(color = colors.panel, shape = RoundedCornerShape(14.dp), border = BorderStroke(1.dp, colors.line)) {
        Row(Modifier.fillMaxWidth().heightIn(min = 64.dp).padding(start = 4.dp, end = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f).clickable(onClick = onOpen).padding(vertical = 12.dp, horizontal = 9.dp)) {
                Text(title, color = colors.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = if (titleOnly) 2 else 1, overflow = TextOverflow.Ellipsis)
                if (!subtitle.isNullOrBlank()) Text(subtitle, color = colors.muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            TextButton(onClick = onEdit) { Text("⋮", color = colors.accentSoft, fontSize = 24.sp, fontWeight = FontWeight.Bold) }
            IconButton(onClick = onDelete) { AppIcon(R.drawable.delete, "حذف", Modifier.size(24.dp)) }
        }
    }
}

@Composable
private fun CourseDetailsDialog(
    course: Course, colors: NativePalette, onDismiss: () -> Unit,
    onField: (String) -> Unit, onCollection: (CollectionType) -> Unit
) {
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxWidth().padding(horizontal = 18.dp).widthIn(max = 470.dp), color = colors.panel,
            shape = RoundedCornerShape(20.dp), border = BorderStroke(1.dp, colors.line)) {
            Column(Modifier.heightIn(max = 680.dp).verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("جزئیات درس", Modifier.weight(1f), color = colors.text, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    IconButton(onClick = onDismiss) { AppIcon(R.drawable.ic_close_native, "بستن", Modifier.size(28.dp)) }
                }
                DetailRow("نام درس", course.title, colors) { onField("title") }
                DetailRow("روز و ساعت", scheduleSummary(course), colors) { onCollection(CollectionType.SCHEDULE) }
                DetailRow("استاد", course.teacher.ifBlank { "ثبت نشده" }, colors) { onField("teacher") }
                DetailRow("کلاس", course.className.ifBlank { "ثبت نشده" }, colors) { onField("className") }
                DetailRow("لینک‌ها", if (course.links.isEmpty()) "ثبت نشده" else "${course.links.size.faDigits()} لینک", colors) { onCollection(CollectionType.LINKS) }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { onCollection(CollectionType.NOTES) }, Modifier.weight(1f).heightIn(min = 50.dp), colors = ButtonDefaults.buttonColors(containerColor = colors.accent), shape = RoundedCornerShape(12.dp)) {
                        Text("یادداشت‌ها (${course.notes.size.faDigits()})", fontSize = 14.sp)
                    }
                    OutlinedButton(onClick = onDismiss, Modifier.weight(1f).heightIn(min = 50.dp), border = BorderStroke(1.dp, colors.line)) { Text("بستن", color = colors.text) }
                }
            }
        }
    }
}

private fun scheduleSummary(course: Course): String {
    val lines = course.scheduleByWeek.mapIndexed { week, entries ->
        entries.joinToString("، ") { "${it.day} ${it.start.faDigits()}–${it.end.faDigits()}" }
            .takeIf(String::isNotBlank)?.let { "${if (week == 0) "فرد" else "زوج"}: $it" }
    }.filterNotNull()
    return lines.joinToString("  |  ").ifBlank { "برای افزودن بزنید" }
}

@Composable
private fun DetailRow(label: String, value: String, colors: NativePalette, onClick: () -> Unit) {
    Surface(onClick = onClick, color = colors.panel2, shape = RoundedCornerShape(12.dp)) {
        Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 13.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(label, Modifier.width(90.dp), color = colors.muted, fontSize = 13.sp)
            Text(value, Modifier.weight(1f), color = colors.text, fontSize = 14.sp, textAlign = TextAlign.Start, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun CourseFieldDialog(course: Course, field: String, colors: NativePalette, onDismiss: () -> Unit, onSave: (String) -> Unit) {
    val label = when (field) { "title" -> "نام درس"; "teacher" -> "نام استاد"; else -> "نام کلاس" }
    var value by remember(course.id, field) { mutableStateOf(when (field) { "title" -> course.title; "teacher" -> course.teacher; else -> course.className }) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("ویرایش $label", color = colors.text) },
        text = { OutlinedTextField(value, { value = it.faDigits() }, Modifier.fillMaxWidth(), label = { Text(label) }, singleLine = true) },
        confirmButton = { TextButton(onClick = { if (field != "title" || value.isNotBlank()) onSave(value.trim()) }) { Text("ذخیره", color = colors.accentSoft) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("لغو", color = colors.muted) } },
        containerColor = colors.panel
    )
}

@Composable
private fun EventDialog(
    draft: EventDraft, colors: NativePalette, onDismiss: () -> Unit,
    onPickDate: (LocalDate) -> Unit, onSave: (EventDraft) -> Unit, onDelete: (String) -> Unit
) {
    var title by remember(draft.id) { mutableStateOf(draft.title) }
    var start by remember(draft.id) { mutableStateOf(draft.start.faDigits()) }
    var end by remember(draft.id) { mutableStateOf(draft.end.faDigits()) }
    var description by remember(draft.id) { mutableStateOf(draft.description) }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxWidth().padding(horizontal = 18.dp).widthIn(max = 470.dp), color = colors.panel, shape = RoundedCornerShape(20.dp), border = BorderStroke(1.dp, colors.line)) {
            Column(Modifier.heightIn(max = 720.dp).verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (draft.id.isBlank()) "رویداد تازه" else "ویرایش رویداد", Modifier.weight(1f), color = colors.text, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    IconButton(onClick = onDismiss) { AppIcon(R.drawable.ic_close_native, "بستن", Modifier.size(28.dp)) }
                }
                OutlinedTextField(title, { title = it.faDigits() }, Modifier.fillMaxWidth(), label = { Text("عنوان رویداد") }, singleLine = true)
                SettingRow("تاریخ رویداد", PersianDates.format(draft.date), null, colors) { onPickDate(draft.date) }
                Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                    OutlinedTextField(start, { start = it.faDigits().take(5) }, Modifier.weight(1f), label = { Text("زمان شروع") }, singleLine = true)
                    OutlinedTextField(end, { end = it.faDigits().take(5) }, Modifier.weight(1f), label = { Text("زمان پایان") }, singleLine = true)
                }
                OutlinedTextField(description, { description = it.faDigits().take(2000) }, Modifier.fillMaxWidth().heightIn(min = 110.dp), label = { Text("توضیحات") }, minLines = 3)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (draft.id.isNotBlank()) OutlinedButton(onClick = { onDelete(draft.id) }, Modifier.weight(1f), border = BorderStroke(1.dp, colors.danger)) { Text("حذف", color = colors.danger) }
                    OutlinedButton(onClick = onDismiss, Modifier.weight(1f), border = BorderStroke(1.dp, colors.line)) { Text("لغو", color = colors.text) }
                    Button(onClick = { onSave(draft.copy(title = title.trim(), start = start, end = end, description = description.trim())) }, Modifier.weight(1f), colors = ButtonDefaults.buttonColors(containerColor = colors.accent)) { AppIcon(R.drawable.ic_check_native, null, Modifier.size(22.dp)); Spacer(Modifier.width(5.dp)); Text("ذخیره") }
                }
            }
        }
    }
}

private fun ScheduleEvent.toDraft() = EventDraft(id, title, PersianDates.parseIso(date), start, end, description)

@Composable
private fun JalaliDateDialog(selected: LocalDate, colors: NativePalette, onDismiss: () -> Unit, onSelect: (LocalDate) -> Unit) {
    var cursor by remember(selected) { mutableStateOf(selected) }
    var draft by remember(selected) { mutableStateOf(selected) }
    val grid = remember(cursor) { PersianDates.monthGrid(cursor) }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxWidth().padding(horizontal = 18.dp).widthIn(max = 430.dp), color = colors.panel,
            shape = RoundedCornerShape(20.dp), border = BorderStroke(1.dp, colors.line)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("انتخاب تاریخ", Modifier.weight(1f), color = colors.text, fontSize = 19.sp, fontWeight = FontWeight.Bold)
                    IconButton(onClick = onDismiss) { AppIcon(R.drawable.ic_close_native, "بستن", Modifier.size(28.dp)) }
                }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    IconButton(onClick = { cursor = PersianDates.shiftJalaliMonth(cursor, -1) }) { Icon(Icons.Filled.KeyboardArrowRight, "ماه قبل", tint = colors.accentSoft) }
                    Text(PersianDates.jalaliMonthTitle(cursor), color = colors.text, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                    IconButton(onClick = { cursor = PersianDates.shiftJalaliMonth(cursor, 1) }) { Icon(Icons.Filled.KeyboardArrowLeft, "ماه بعد", tint = colors.accentSoft) }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    listOf("ش", "ی", "د", "س", "چ", "پ", "ج").forEach { Text(it, Modifier.weight(1f), color = colors.muted, textAlign = TextAlign.Center, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
                }
                grid.chunked(7).forEach { week ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        week.forEach { date ->
                            if (date == null) Spacer(Modifier.weight(1f).height(42.dp))
                            else {
                                val chosen = date == draft
                                Surface(onClick = { draft = date }, modifier = Modifier.weight(1f).padding(2.dp).height(40.dp),
                                    color = if (chosen) colors.accent else Color.Transparent, shape = CircleShape,
                                    border = if (date == PersianDates.todayIran() && !chosen) BorderStroke(1.dp, colors.accent) else null) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Text(PersianDates.toJalali(date).day.faDigits(), color = if (chosen) Color.White else colors.text, fontSize = 15.sp, fontWeight = if (chosen) FontWeight.Bold else FontWeight.Normal)
                                    }
                                }
                            }
                        }
                    }
                }
                Text(PersianDates.format(draft, includeWeekday = true), Modifier.fillMaxWidth(), color = colors.muted, textAlign = TextAlign.Center, fontSize = 13.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onDismiss, Modifier.weight(1f), border = BorderStroke(1.dp, colors.line)) { Text("لغو", color = colors.text) }
                    Button(onClick = { onSelect(draft) }, Modifier.weight(1f), colors = ButtonDefaults.buttonColors(containerColor = colors.accent)) { AppIcon(R.drawable.ic_check_native, null, Modifier.size(22.dp)); Spacer(Modifier.width(5.dp)); Text("انتخاب") }
                }
            }
        }
    }
}

@Composable
private fun ConfirmDialog(title: String, message: String, colors: NativePalette, onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(onDismissRequest = onDismiss, title = { Text(title, color = colors.text) }, text = { Text(message, color = colors.muted) },
        confirmButton = { TextButton(onClick = onConfirm) { Text("حذف", color = colors.danger) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("لغو", color = colors.muted) } }, containerColor = colors.panel)
}

@Composable
private fun ImportPage(
    store: ScheduleStore, colors: NativePalette, selectedFile: SelectedMht?,
    onPickFile: () -> Unit, onBackupRestore: () -> Unit, toast: (String) -> Unit
) {
    val current = store.state
    var parsedCourses by remember { mutableStateOf<List<Course>?>(null) }
    var parseError by remember { mutableStateOf("") }
    var scheduleChoices by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var confirmImport by remember { mutableStateOf(false) }

    LaunchedEffect(selectedFile?.token) {
        parsedCourses = null
        parseError = ""
        scheduleChoices = emptyMap()
        selectedFile?.let { file ->
            try {
                parsedCourses = withContext(Dispatchers.Default) { AmozeshyarImporter.parse(file.bytes) }
            } catch (error: Exception) {
                parseError = error.message ?: "خواندن فایل انجام نشد."
            }
        }
    }

    val imported = parsedCourses
    val conflicts = remember(imported, current.courses) {
        imported.orEmpty().mapNotNull { incoming ->
            val old = findPreviousCourse(incoming, current.courses) ?: return@mapNotNull null
            if (!hasSchedule(incoming) || !hasSchedule(old) || scheduleSignature(incoming) == scheduleSignature(old)) null
            else incoming.id to (incoming to old)
        }
    }
    val needsChoice = conflicts.any { (id, _) -> scheduleChoices[id] == null }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 22.dp), verticalArrangement = Arrangement.spacedBy(11.dp)) {
        Text("وارد کردن از آموزشیار (آزمایشی)", color = colors.text, fontSize = 21.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 7.dp))
        Text("فایل ذخیره‌شدهٔ MHT یا MHTML را انتخاب کنید.", color = colors.muted, fontSize = 14.sp)
        Button(onClick = onPickFile, Modifier.fillMaxWidth().heightIn(min = 52.dp), colors = ButtonDefaults.buttonColors(containerColor = colors.accent), shape = RoundedCornerShape(13.dp)) {
            AppIcon(R.drawable.upload, null, Modifier.size(22.dp)); Spacer(Modifier.width(8.dp)); Text(selectedFile?.name ?: "انتخاب فایل آموزشیار", fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (parseError.isNotBlank()) Text(parseError, color = colors.danger, fontSize = 14.sp)
        if (imported != null) {
            Text("${imported.size.faDigits()} درس پیدا شد", color = colors.text, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            imported.forEach { course ->
                Surface(Modifier.fillMaxWidth(), color = colors.panel, shape = RoundedCornerShape(12.dp), border = BorderStroke(1.dp, colors.line)) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(course.title, color = colors.text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                        if (course.teacher.isNotBlank()) Text("استاد: ${course.teacher}", color = colors.muted, fontSize = 12.sp)
                        Text(scheduleSummary(course).ifBlank { "زمانی پیدا نشد" }, color = colors.muted, fontSize = 12.sp)
                    }
                }
            }
            conflicts.forEach { (incomingId, pair) ->
                val (incoming, previous) = pair
                SettingsGroup("تغییر ساعت درس: ${incoming.title}", colors) {
                    Text("برنامهٔ قبلی: ${scheduleSummary(previous)}", color = colors.muted, fontSize = 12.sp)
                    Text("برنامهٔ جدید: ${scheduleSummary(incoming)}", color = colors.text, fontSize = 12.sp)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(scheduleChoices[incomingId] == "new", onClick = { scheduleChoices = scheduleChoices + (incomingId to "new") })
                        Text("ساعت جدید", color = colors.text, modifier = Modifier.clickable { scheduleChoices = scheduleChoices + (incomingId to "new") })
                        Spacer(Modifier.width(10.dp))
                        RadioButton(scheduleChoices[incomingId] == "previous", onClick = { scheduleChoices = scheduleChoices + (incomingId to "previous") })
                        Text("ساعت قبلی", color = colors.text, modifier = Modifier.clickable { scheduleChoices = scheduleChoices + (incomingId to "previous") })
                    }
                }
            }
            Button(onClick = { confirmImport = true }, enabled = !needsChoice, Modifier.fillMaxWidth().heightIn(min = 52.dp),
                colors = ButtonDefaults.buttonColors(containerColor = colors.accent, disabledContainerColor = colors.panel2), shape = RoundedCornerShape(13.dp)) {
                AppIcon(R.drawable.ic_check_native, null, Modifier.size(23.dp)); Spacer(Modifier.width(7.dp)); Text("وارد کردن برنامه", fontSize = 16.sp)
            }
        }
        if (current.courses.isNotEmpty()) {
            Divider(color = colors.line)
            Text("اگر قبلاً برنامه دارید، پیش از جایگزینی یک نسخهٔ پشتیبان داخلی ساخته می‌شود.", color = colors.muted, fontSize = 12.sp)
        }
        OutlinedButton(onClick = onBackupRestore, Modifier.fillMaxWidth().heightIn(min = 48.dp), border = BorderStroke(1.dp, colors.line)) {
            AppIcon(R.drawable.upload, null, Modifier.size(22.dp)); Spacer(Modifier.width(8.dp)); Text("بارگذاری فایل پشتیبان", color = colors.text)
        }
    }

    if (confirmImport) ConfirmDialog(
        "جایگزینی برنامه", "درس‌های فایل آموزشیار جای برنامهٔ فعلی را می‌گیرند. لینک‌ها، کلاس‌ها و یادداشت‌های قبلیِ درس‌های هم‌نام حفظ می‌شوند.", colors,
        onDismiss = { confirmImport = false }, onConfirm = {
            val resolved = imported.orEmpty().map { incoming ->
                val previous = findPreviousCourse(incoming, current.courses)
                if (previous == null) incoming
                else {
                    val keepOldSchedule = scheduleChoices[incoming.id] == "previous" || !hasSchedule(incoming)
                    incoming.copy(
                        id = previous.id,
                        teacher = incoming.teacher.ifBlank { previous.teacher },
                        className = incoming.className.ifBlank { previous.className },
                        scheduleByWeek = if (keepOldSchedule) previous.scheduleByWeek else incoming.scheduleByWeek,
                        links = incoming.links.ifEmpty { previous.links },
                        notes = mergeNotes(incoming.notes, previous.notes)
                    )
                }
            }
            runCatching {
                store.saveAutomaticBackup()
                store.update { it.copy(courses = resolved) }
            }.onSuccess { toast("${resolved.size.faDigits()} درس وارد شد.") }
                .onFailure { toast("وارد کردن برنامه انجام نشد.") }
            confirmImport = false
        }
    )
}

private fun hasSchedule(course: Course) = course.scheduleByWeek.any { it.isNotEmpty() }
private fun scheduleSignature(course: Course) = course.scheduleByWeek.map { rows -> rows.sortedWith(compareBy<Meeting> { weekDays.indexOf(it.day) }.thenBy { it.start }).joinToString("|") { "${it.day}:${it.start}-${it.end}" } }.joinToString("||")
private fun courseKey(value: String) = value.lowercase().replace(Regex("[\\s‌\\p{Punct}]+"), "")

private fun findPreviousCourse(incoming: Course, oldCourses: List<Course>): Course? {
    val matches = oldCourses.filter { courseKey(it.title) == courseKey(incoming.title) }
    if (matches.size <= 1) return matches.firstOrNull()
    val exactTeacher = matches.filter { courseKey(it.teacher) == courseKey(incoming.teacher) }
    return exactTeacher.singleOrNull() ?: matches.maxByOrNull { old ->
        incoming.scheduleByWeek.sumOf { incomingWeek -> incomingWeek.sumOf { item ->
            old.scheduleByWeek.flatten().count { it.day == item.day && (it.start == item.start || it.end == item.end) }
        } }
    }
}

private fun mergeNotes(newNotes: List<CourseNote>, oldNotes: List<CourseNote>): List<CourseNote> {
    val seen = mutableSetOf<String>()
    return (newNotes + oldNotes).filter { note -> seen.add(courseKey(note.title) + "|" + note.text.trim()) }
}

@Composable
private fun LinkDialog(link: CourseLink?, colors: NativePalette, onDismiss: () -> Unit, onSave: (String, String) -> Unit) {
    var title by remember(link?.id) { mutableStateOf(link?.title.orEmpty()) }
    var url by remember(link?.id) { mutableStateOf(link?.url.orEmpty()) }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxWidth().padding(horizontal = 22.dp).widthIn(max = 450.dp), color = colors.panel, shape = RoundedCornerShape(19.dp), border = BorderStroke(1.dp, colors.line)) {
            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (link == null) "افزودن لینک" else "ویرایش لینک", Modifier.weight(1f), color = colors.text, fontSize = 19.sp, fontWeight = FontWeight.Bold)
                    IconButton(onClick = onDismiss) { AppIcon(R.drawable.ic_close_native, "بستن", Modifier.size(28.dp)) }
                }
                OutlinedTextField(title, { title = it.faDigits() }, Modifier.fillMaxWidth(), label = { Text("عنوان لینک") }, singleLine = true)
                OutlinedTextField(url, { url = it.trim() }, Modifier.fillMaxWidth(), label = { Text("نشانی لینک") }, singleLine = true)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onDismiss, Modifier.weight(1f), border = BorderStroke(1.dp, colors.line)) { Text("لغو", color = colors.text) }
                    Button(onClick = { onSave(title, url) }, Modifier.weight(1f), colors = ButtonDefaults.buttonColors(containerColor = colors.accent)) { AppIcon(R.drawable.ic_check_native, null, Modifier.size(22.dp)); Spacer(Modifier.width(5.dp)); Text("ذخیره") }
                }
            }
        }
    }
}

@Composable
private fun NoteDialog(note: CourseNote?, colors: NativePalette, onDismiss: () -> Unit, onSave: (String, String) -> Unit) {
    var title by remember(note?.id) { mutableStateOf(note?.title.orEmpty()) }
    var body by remember(note?.id) { mutableStateOf(note?.text.orEmpty()) }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxWidth().padding(horizontal = 20.dp).widthIn(max = 470.dp), color = colors.panel, shape = RoundedCornerShape(19.dp), border = BorderStroke(1.dp, colors.line)) {
            Column(Modifier.heightIn(max = 650.dp).verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (note == null) "یادداشت تازه" else "ویرایش یادداشت", Modifier.weight(1f), color = colors.text, fontSize = 19.sp, fontWeight = FontWeight.Bold)
                    IconButton(onClick = onDismiss) { AppIcon(R.drawable.ic_close_native, "بستن", Modifier.size(28.dp)) }
                }
                OutlinedTextField(title, { title = it.faDigits().take(100) }, Modifier.fillMaxWidth(), label = { Text("عنوان") }, singleLine = true)
                OutlinedTextField(body, { body = it.faDigits().take(5000) }, Modifier.fillMaxWidth().heightIn(min = 160.dp), label = { Text("متن یادداشت") }, minLines = 5)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onDismiss, Modifier.weight(1f), border = BorderStroke(1.dp, colors.line)) { Text("لغو", color = colors.text) }
                    Button(onClick = { onSave(title, body) }, Modifier.weight(1f), colors = ButtonDefaults.buttonColors(containerColor = colors.accent)) { AppIcon(R.drawable.ic_check_native, null, Modifier.size(22.dp)); Spacer(Modifier.width(5.dp)); Text("ذخیره") }
                }
            }
        }
    }
}

@Composable
private fun ScheduleDialog(draft: ScheduleEditor, colors: NativePalette, onDismiss: () -> Unit, onSave: (ScheduleEditor) -> Unit) {
    var week by remember(draft.oldWeek, draft.oldMeeting) { mutableStateOf(draft.week) }
    var day by remember(draft.oldWeek, draft.oldMeeting) { mutableStateOf(draft.day) }
    var start by remember(draft.oldWeek, draft.oldMeeting) { mutableStateOf(draft.start) }
    var end by remember(draft.oldWeek, draft.oldMeeting) { mutableStateOf(draft.end) }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxWidth().padding(horizontal = 17.dp).widthIn(max = 480.dp), color = colors.panel, shape = RoundedCornerShape(19.dp), border = BorderStroke(1.dp, colors.line)) {
            Column(Modifier.heightIn(max = 700.dp).verticalScroll(rememberScrollState()).padding(17.dp), verticalArrangement = Arrangement.spacedBy(11.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (draft.oldMeeting == null) "افزودن زمان" else "ویرایش زمان", Modifier.weight(1f), color = colors.text, fontSize = 19.sp, fontWeight = FontWeight.Bold)
                    IconButton(onClick = onDismiss) { AppIcon(R.drawable.ic_close_native, "بستن", Modifier.size(28.dp)) }
                }
                Text("نوع هفته", color = colors.muted, fontSize = 13.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    ChoiceChip("فرد", week == "0", colors, Modifier.weight(1f)) { week = "0" }
                    ChoiceChip("زوج", week == "1", colors, Modifier.weight(1f)) { week = "1" }
                    ChoiceChip("هر دو", week == "both", colors, Modifier.weight(1f)) { week = "both" }
                }
                Text("روز هفته", color = colors.muted, fontSize = 13.sp)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    weekDays.forEach { item ->
                        val short = when (item) { "شنبه" -> "ش"; "یکشنبه" -> "ی"; "دوشنبه" -> "د"; "سه‌شنبه" -> "س"; "چهارشنبه" -> "چ"; "پنجشنبه" -> "پ"; else -> "ج" }
                        Surface(onClick = { day = item }, modifier = Modifier.size(40.dp), color = if (day == item) colors.accent else colors.panel2,
                            shape = CircleShape, border = BorderStroke(1.dp, if (day == item) colors.accent else colors.line)) {
                            Box(contentAlignment = Alignment.Center) { Text(short, color = if (day == item) Color.White else colors.text, fontSize = 14.sp, fontWeight = FontWeight.Bold) }
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(start, { start = it.faDigits().take(5) }, Modifier.weight(1f), label = { Text("از ساعت") }, singleLine = true)
                    OutlinedTextField(end, { end = it.faDigits().take(5) }, Modifier.weight(1f), label = { Text("تا ساعت") }, singleLine = true)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onDismiss, Modifier.weight(1f).heightIn(min = 48.dp), border = BorderStroke(1.dp, colors.line)) { Text("لغو", color = colors.text) }
                    Button(onClick = { onSave(draft.copy(week = week, day = day, start = start, end = end)) }, Modifier.weight(1f).heightIn(min = 48.dp), colors = ButtonDefaults.buttonColors(containerColor = colors.accent)) { AppIcon(R.drawable.ic_check_native, null, Modifier.size(22.dp)); Spacer(Modifier.width(5.dp)); Text("ذخیره") }
                }
            }
        }
    }
}

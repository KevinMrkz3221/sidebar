let isPinned = false;
let currentWidth = 450;
let apps = [];

const DEFAULT_APPS = [
    { name: 'Gemini', url: 'https://gemini.google.com' },
    { name: 'WhatsApp', url: 'https://web.whatsapp.com' },
    { name: 'YouTube Music', url: 'https://music.youtube.com' }
];

// Pomodoro State
let pomodoroTimer = null;
let timeLeft = 25 * 60;
let isWorking = true;
let pomodoroHistory = [];
let timerStatus = 'stopped'; // 'running', 'paused', 'stopped'
let targetEndTime = null;

// Multi-Notes State
let allNotes = [];
let activeNoteId = null;

// Tasks State
let allTasks = [];

// DOM Elements (Shared)
const notesArea = document.getElementById('notes-area');
const notesStatus = document.getElementById('notes-status');
const notesListContainer = document.getElementById('notes-list-container');
const listView = document.getElementById('notes-list-view');
const editView = document.getElementById('notes-edit-view');
const minutesDisplay = document.getElementById('timer-minutes');
const secondsDisplay = document.getElementById('timer-seconds');
const startBtn = document.getElementById('timer-start');
const pauseBtn = document.getElementById('timer-pause');
const resetBtn = document.getElementById('timer-reset');
const labelDisplay = document.getElementById('timer-label');
const transBtn = document.getElementById('translate-btn');
const transText = document.getElementById('trans-text');
const picker = document.getElementById('main-color-picker');
const hexLabel = document.getElementById('hex-value');
const rgbLabel = document.getElementById('rgb-value');

// SidePanel Settings
let userSettings = {
    theme: 'emerald',
    visibility: {
        pomodoro: true,
        notes: true,
        translator: true,
        colorpicker: true,
        tasks: true,
        weather: true
    },
    weatherLocation: ''
};

// Initialize
chrome.storage.local.get(['customApps', 'lastApp', 'pomodoroHistory', 'allNotes', 'recentColors', 'timerStatus', 'targetEndTime', 'isWorking', 'userSettings'], (result) => {
    apps = result.customApps || DEFAULT_APPS;
    pomodoroHistory = result.pomodoroHistory || [];
    allNotes = result.allNotes || [];
    timerStatus = result.timerStatus || 'stopped';
    targetEndTime = result.targetEndTime || null;
    isWorking = result.isWorking !== undefined ? result.isWorking : true;
    userSettings = result.userSettings || userSettings;
    allTasks = result.allTasks || [];

    const recentColors = result.recentColors || ['#3ea6ff', '#ff4b4b', '#4bff4b', '#ffeb3b'];
    renderApps();
    renderHistory();
    renderColorHistory(recentColors);
    renderNotesList();
    renderTasks();
    applySettings();

    // Initialize weather
    updateWeather();

    // Initialize/Sync Timer if running
    if (timerStatus === 'running' && targetEndTime) {
        syncTimer();
    } else {
        updateDisplay();
    }
});

// Sync Listener (Cross-tab)
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
        if (changes.allNotes) {
            allNotes = changes.allNotes.newValue || [];
            renderNotesList();
            // Update active note if visible
            if (activeNoteId && notesArea) {
                const note = allNotes.find(n => n.id === activeNoteId);
                if (note && note.content !== notesArea.value) {
                    notesArea.value = note.content;
                }
            }
        }
        if (changes.pomodoroHistory) {
            pomodoroHistory = changes.pomodoroHistory.newValue || [];
            renderHistory();
        }
        if (changes.recentColors) {
            renderColorHistory(changes.recentColors.newValue || []);
        }
        if (changes.allTasks) {
            allTasks = changes.allTasks.newValue || [];
            renderTasks();
        }
        // Pomodoro Sync
        if (changes.timerStatus || changes.targetEndTime || changes.isWorking) {
            timerStatus = (changes.timerStatus ? changes.timerStatus.newValue : timerStatus) || 'stopped';
            targetEndTime = (changes.targetEndTime ? changes.targetEndTime.newValue : targetEndTime) || null;
            isWorking = (changes.isWorking ? changes.isWorking.newValue : isWorking) !== false;

            if (timerStatus === 'running') {
                syncTimer();
            } else if (timerStatus === 'paused' || timerStatus === 'stopped') {
                clearInterval(pomodoroTimer);
                pomodoroTimer = null;
                if (timerStatus === 'stopped') {
                    timeLeft = (parseInt(document.getElementById('work-duration').value) || 25) * 60;
                }
                updateDisplay();
                if (startBtn && pauseBtn) {
                    startBtn.style.display = 'inline-block';
                    pauseBtn.style.display = 'none';
                }
            }
        }
        // Global Settings Sync
        if (changes.userSettings) {
            userSettings = changes.userSettings.newValue || userSettings;
            applySettings();
            if (changes.userSettings.newValue.weatherLocation !== changes.userSettings.oldValue?.weatherLocation) {
                updateWeather();
            }
        }
    }
});
// End of storage sync setup

function renderApps() {
    const container = document.getElementById('apps-container');
    const list = document.getElementById('apps-list');
    container.innerHTML = '';
    list.innerHTML = '';

    apps.forEach((app, index) => {
        // Render in Sidebar
        const iconDiv = document.createElement('div');
        iconDiv.className = 'app-icon';
        iconDiv.setAttribute('data-url', app.url);
        iconDiv.title = app.name;

        const img = document.createElement('img');
        const domain = new URL(app.url).hostname;
        img.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

        iconDiv.appendChild(img);
        iconDiv.addEventListener('click', () => handleAppClick(iconDiv, app.url));
        container.appendChild(iconDiv);

        // Render in Settings List
        const appItem = document.createElement('div');
        appItem.className = 'app-item';
        appItem.innerHTML = `
            <span>${app.name}</span>
            <button class="delete-btn" data-index="${index}">&times;</button>
        `;
        list.appendChild(appItem);
    });

    // Add delete listeners
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = e.target.getAttribute('data-index');
            apps.splice(index, 1);
            saveApps();
        });
    });
}

function handleAppClick(icon, url) {
    const frame = document.getElementById('app-frame');
    const isCurrentlyActive = icon.classList.contains('active');
    const isExpanded = document.body.classList.contains('expanded');

    // If clicking the already active app, just toggle the sidebar view
    if (isCurrentlyActive) {
        if (isExpanded) {
            document.body.classList.remove('expanded');
            window.parent.postMessage({ type: 'TOGGLE_SIDEBAR', expanded: false, width: 60 }, '*');
        } else {
            document.body.classList.add('expanded');
            window.parent.postMessage({ type: 'TOGGLE_SIDEBAR', expanded: true, width: currentWidth }, '*');
        }
        return;
    }

    // Switching to a different app
    document.querySelectorAll('.app-icon').forEach(i => i.classList.remove('active'));
    document.getElementById('settings-trigger').classList.remove('active');
    document.getElementById('settings-panel').classList.remove('active');
    document.getElementById('pomodoro-trigger').classList.remove('active');
    document.getElementById('pomodoro-panel').classList.remove('active');
    document.querySelectorAll('.tool-icon').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.tool-panel').forEach(i => i.classList.remove('active'));

    icon.classList.add('active');
    document.body.classList.add('expanded');

    // Only update src if it's a different application
    if (frame.src !== url) {
        frame.src = url;
    }

    window.parent.postMessage({ type: 'TOGGLE_SIDEBAR', expanded: true, width: currentWidth }, '*');
    chrome.storage.local.set({ lastApp: url });
}

function saveApps() {
    chrome.storage.local.set({ customApps: apps }, () => {
        renderApps();
    });
}


// Add App
document.getElementById('add-app-btn').addEventListener('click', () => {
    const name = document.getElementById('new-app-name').value;
    const url = document.getElementById('new-app-url').value;

    if (name && url) {
        try {
            new URL(url); // Validate URL
            apps.push({ name, url });
            saveApps();
            document.getElementById('new-app-name').value = '';
            document.getElementById('new-app-url').value = '';
        } catch (e) {
            showNotification('Configuración', 'Por favor ingresa una URL válida (incluyendo https://)');
        }
    }
});

// Pomodoro Logic (Elements already declared at top)

function updateDisplay() {
    const mins = Math.floor(Math.max(0, timeLeft) / 60);
    const secs = Math.max(0, timeLeft) % 60;
    minutesDisplay.textContent = mins.toString().padStart(2, '0');
    secondsDisplay.textContent = secs.toString().padStart(2, '0');
    labelDisplay.textContent = isWorking ? 'Focus Time' : 'Break Time';
}

function syncTimer() {
    if (pomodoroTimer) clearInterval(pomodoroTimer);

    startBtn.style.display = 'none';
    pauseBtn.style.display = 'inline-block';

    pomodoroTimer = setInterval(() => {
        const now = Date.now();
        timeLeft = Math.round((targetEndTime - now) / 1000);
        updateDisplay();

        if (timeLeft <= 0) {
            clearInterval(pomodoroTimer);
            pomodoroTimer = null;
            handleTimerComplete();
        }
    }, 1000);
}

function startTimer() {
    if (pomodoroTimer) return;

    const now = Date.now();
    targetEndTime = now + (timeLeft * 1000);
    timerStatus = 'running';

    chrome.storage.local.set({ targetEndTime, timerStatus, isWorking });
    syncTimer();
}

function pauseTimer() {
    clearInterval(pomodoroTimer);
    pomodoroTimer = null;
    timerStatus = 'paused';
    chrome.storage.local.set({ timerStatus });

    startBtn.style.display = 'inline-block';
    pauseBtn.style.display = 'none';
}

function resetTimer() {
    clearInterval(pomodoroTimer);
    pomodoroTimer = null;
    timerStatus = 'stopped';
    const workMins = parseInt(document.getElementById('work-duration').value) || 25;
    timeLeft = workMins * 60;
    isWorking = true;

    chrome.storage.local.set({ timerStatus, targetEndTime: null, isWorking });
    updateDisplay();
    startBtn.style.display = 'inline-block';
    pauseBtn.style.display = 'none';
}

// Utility: Notifications
function showNotification(title, message) {
    if (chrome.notifications) {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: title,
            message: message,
            priority: 2
        });
    } else {
        alert(`${title}: ${message}`);
    }
}

function handleTimerComplete() {
    // Only the tab that finishes handles the storage update
    // But since storage update triggers sync in all tabs, it's efficient
    if (timerStatus !== 'running') return;

    const sound = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
    sound.play().catch(() => { });

    if (isWorking) {
        // Log session
        const now = new Date();
        const session = {
            type: 'Work',
            time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            date: now.toISOString().split('T')[0]
        };
        pomodoroHistory.push(session);

        // Prepare break
        const breakMins = parseInt(document.getElementById('break-duration').value) || 5;
        timeLeft = breakMins * 60;
        isWorking = false;
        timerStatus = 'stopped'; // Require manual start for break too for sync clarity or auto?

        chrome.storage.local.set({ pomodoroHistory, isWorking, timerStatus, targetEndTime: null });
        showNotification('Pomodoro Hub', '¡Sesión de trabajo finalizada! Hora de un descanso.');
    } else {
        // Switch back to work
        const workMins = parseInt(document.getElementById('work-duration').value) || 25;
        timeLeft = workMins * 60;
        isWorking = true;
        timerStatus = 'stopped';

        chrome.storage.local.set({ isWorking, timerStatus, targetEndTime: null });
        showNotification('Pomodoro Hub', '¡El descanso ha terminado! A trabajar.');
    }

    renderHistory();
    updateDisplay();
    startBtn.style.display = 'inline-block';
    pauseBtn.style.display = 'none';
}

function renderHistory() {
    const list = document.getElementById('history-list');
    const today = new Date().toISOString().split('T')[0];

    const todaySessions = pomodoroHistory.filter(s => s.date === today);

    list.innerHTML = todaySessions.length ? '' : '<p style="color:#666; font-size:12px; text-align:center;">No sessions today yet</p>';

    todaySessions.reverse().forEach(session => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
            <span>🍅 Work Session</span>
            <span class="history-time">${session.time}</span>
        `;
        list.appendChild(item);
    });
}

document.getElementById('export-history').addEventListener('click', () => {
    if (pomodoroHistory.length === 0) {
        showNotification('Pomodoro Hub', 'No hay historial para exportar todavía.');
        return;
    }

    const csvRows = ['Date,Time,Type'];
    pomodoroHistory.forEach(session => {
        csvRows.push(`${session.date},${session.time},${session.type}`);
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pomodoro_history_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

startBtn.addEventListener('click', startTimer);
pauseBtn.addEventListener('click', pauseTimer);
resetBtn.addEventListener('click', resetTimer);


// Multi-Notes Logic (Elements already declared at top)
let saveTimeout;

function renderNotesList() {
    notesListContainer.innerHTML = '';
    if (allNotes.length === 0) {
        notesListContainer.innerHTML = '<p style="color:#666; font-size:12px; text-align:center; padding:20px;">No notes yet. Click + to create one.</p>';
        return;
    }

    allNotes.forEach(note => {
        const item = document.createElement('div');
        item.className = 'note-item';

        const lines = note.content.trim().split('\n');
        const title = lines[0] || 'Untitled Note';
        const preview = lines.slice(1).join(' ') || 'No additional content...';

        item.innerHTML = `
            <div class="note-title">${title}</div>
            <div class="note-preview">${preview}</div>
        `;

        item.onclick = () => openNote(note.id);
        notesListContainer.appendChild(item);
    });
}

function openNote(id) {
    activeNoteId = id;
    const note = allNotes.find(n => n.id === id);
    notesArea.value = note ? note.content : '';
    listView.style.display = 'none';
    editView.style.display = 'block';
    notesStatus.textContent = '';
}

function createNote() {
    const newNote = {
        id: Date.now().toString(),
        content: '',
        timestamp: Date.now()
    };
    allNotes.unshift(newNote);
    saveNotes();
    openNote(newNote.id);
}

function saveNotes() {
    chrome.storage.local.set({ allNotes });
}

function deleteActiveNote() {
    if (!activeNoteId) return;
    if (confirm('Are you sure you want to delete this note?')) {
        allNotes = allNotes.filter(n => n.id !== activeNoteId);
        saveNotes();
        goBackToNotes();
    }
}

function goBackToNotes() {
    activeNoteId = null;
    listView.style.display = 'block';
    editView.style.display = 'none';
    renderNotesList();
}

notesArea.addEventListener('input', () => {
    if (!activeNoteId) return;

    notesStatus.textContent = 'Saving...';
    notesStatus.classList.add('saving');

    const noteIndex = allNotes.findIndex(n => n.id === activeNoteId);
    if (noteIndex !== -1) {
        allNotes[noteIndex].content = notesArea.value;
        allNotes[noteIndex].timestamp = Date.now();
    }

    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveNotes();
        notesStatus.textContent = 'Saved';
        notesStatus.classList.remove('saving');
        setTimeout(() => {
            if (notesStatus.textContent === 'Saved') notesStatus.textContent = '';
        }, 2000);
    }, 800);
});

document.getElementById('add-note-btn').onclick = createNote;
document.getElementById('back-to-notes').onclick = goBackToNotes;
document.getElementById('delete-note-btn').onclick = deleteActiveNote;

// Translator Logic (Elements already declared at top)

transBtn.addEventListener('click', async () => {
    const text = document.getElementById('trans-source').value.trim();
    if (!text) return;

    const from = document.getElementById('lang-from').value;
    const to = document.getElementById('lang-to').value;

    transBtn.disabled = true;
    transText.textContent = 'Translating...';
    transText.classList.remove('placeholder');

    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(url);
        const data = await response.json();
        const result = data[0].map(x => x[0]).join('');
        transText.textContent = result;
    } catch (e) {
        transText.textContent = 'Error: Could not translate. Please try again.';
        console.error(e);
    } finally {
        transBtn.disabled = false;
    }
});

// Swap Languages Logic
document.getElementById('swap-langs').addEventListener('click', () => {
    const fromSel = document.getElementById('lang-from');
    const toSel = document.getElementById('lang-to');

    let fromVal = fromSel.value;
    let toVal = toSel.value;

    // If 'from' is auto, we need to pick a default for the new 'to'
    // since 'to' cannot be 'auto'
    if (fromVal === 'auto') {
        fromVal = 'en'; // Default to English if we swap from Auto
    }

    fromSel.value = toVal;
    toSel.value = fromVal;

    // Optional: Trigger translation if there is source text
    if (document.getElementById('trans-source').value.trim()) {
        transBtn.click();
    }
});

// Color Picker Logic (Elements already declared at top)

if (picker) {
    picker.addEventListener('input', (e) => {
        const color = e.target.value;
        updateColorValues(color);
    });
}

// Tasks Manager Logic
function renderTasks() {
    const activeContainer = document.getElementById('tasks-active-container');
    const completedContainer = document.getElementById('tasks-completed-container');
    const divider = document.getElementById('completed-tasks-divider');

    if (!activeContainer || !completedContainer || !divider) return;

    activeContainer.innerHTML = '';
    completedContainer.innerHTML = '';

    const activeTasks = allTasks.filter(t => !t.completed);
    const completedTasks = allTasks.filter(t => t.completed);

    divider.style.display = completedTasks.length > 0 ? 'flex' : 'none';

    const renderItem = (task, container) => {
        const item = document.createElement('div');
        item.className = `task-item ${task.completed ? 'completed' : ''}`;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'task-checkbox';
        checkbox.checked = task.completed;
        checkbox.onchange = () => toggleTask(task.id);

        const text = document.createElement('span');
        text.className = 'task-text';
        text.textContent = task.text;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-task-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.onclick = () => deleteTask(task.id);

        item.appendChild(checkbox);
        item.appendChild(text);
        item.appendChild(deleteBtn);
        container.appendChild(item);
    };

    activeTasks.forEach(task => renderItem(task, activeContainer));
    completedTasks.forEach(task => renderItem(task, completedContainer));
}

function addTask() {
    const input = document.getElementById('new-task-input');
    const text = input.value.trim();
    if (!text) return;

    const newTask = {
        id: Date.now(),
        text: text,
        completed: false
    };

    allTasks.unshift(newTask);
    input.value = '';
    chrome.storage.local.set({ allTasks });
    renderTasks();
}

function toggleTask(id) {
    allTasks = allTasks.map(task =>
        task.id === id ? { ...task, completed: !task.completed } : task
    );
    chrome.storage.local.set({ allTasks });
    renderTasks();
}

function deleteTask(id) {
    allTasks = allTasks.filter(task => task.id !== id);
    chrome.storage.local.set({ allTasks });
    renderTasks();
}

document.getElementById('add-task-btn').addEventListener('click', addTask);
document.getElementById('new-task-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTask();
});

// Sidebar Tool Triggers
function setupToolToggle(triggerId, panelId) {
    const trigger = document.getElementById(triggerId);
    const panel = document.getElementById(panelId);

    if (trigger && panel) {
        trigger.addEventListener('click', () => {
            const isActive = trigger.classList.contains('active');

            // Deactivate all
            document.querySelectorAll('.tool-icon, .pomodoro-icon, .app-icon, .settings-icon').forEach(i => i.classList.remove('active'));
            document.querySelectorAll('.tool-panel, .pomodoro-panel, .settings-panel').forEach(p => p.classList.remove('active'));

            if (!isActive) {
                trigger.classList.add('active');
                panel.classList.add('active');
                document.body.classList.add('expanded');
                window.parent.postMessage({ type: 'TOGGLE_SIDEBAR', expanded: true, width: currentWidth }, '*');
            } else {
                document.body.classList.remove('expanded');
                window.parent.postMessage({ type: 'TOGGLE_SIDEBAR', expanded: false, width: 60 }, '*');
            }
        });
    }
}

setupToolToggle('notes-trigger', 'notes-panel');
setupToolToggle('translator-trigger', 'translator-panel');
setupToolToggle('colorpicker-trigger', 'colorpicker-panel');
setupToolToggle('pomodoro-trigger', 'pomodoro-panel');
setupToolToggle('tasks-trigger', 'tasks-panel');
setupToolToggle('settings-trigger', 'settings-panel');

function updateColorValues(hex) {
    if (!hexLabel || !rgbLabel) return;
    hexLabel.textContent = hex.toUpperCase();

    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const rgb = `rgb(${r}, ${g}, ${b})`;
    rgbLabel.textContent = rgb;
}

// Copy functionality for color values
document.querySelectorAll('.copy-small').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const text = document.getElementById(targetId).textContent;
        navigator.clipboard.writeText(text);
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = originalText, 1500);

        if (targetId === 'hex-value') addToColorHistory(text);
    });
});

function addToColorHistory(hex) {
    chrome.storage.local.get(['recentColors'], (result) => {
        let colors = result.recentColors || [];
        if (colors.includes(hex)) return;
        colors.unshift(hex);
        colors = colors.slice(0, 10);
        chrome.storage.local.set({ recentColors: colors });
        renderColorHistory(colors);
    });
}

function renderColorHistory(colors) {
    const container = document.getElementById('color-history');
    if (!container) return;
    container.innerHTML = '';
    colors.forEach(color => {
        const bubble = document.createElement('div');
        bubble.className = 'color-bubble';
        bubble.style.backgroundColor = color;
        bubble.title = color;
        bubble.onclick = () => {
            if (picker) {
                picker.value = color;
                updateColorValues(color);
            }
        };
        container.appendChild(bubble);
    });
}

// Initial state
if (isPinned) document.body.classList.add('pinned-mode');

// Pin Toggle
document.getElementById('pin-toggle').addEventListener('click', () => {
    isPinned = !isPinned;
    document.getElementById('pin-toggle').classList.toggle('pinned', isPinned);
    document.body.classList.toggle('pinned-mode', isPinned); // Control collapse visibility

    const width = document.body.classList.contains('expanded') ? currentWidth : 60;
    window.parent.postMessage({
        type: 'TOGGLE_PIN',
        pinned: isPinned,
        width: width
    }, '*');
});

// Collapse Sidebar manually
document.getElementById('collapse-sidebar').addEventListener('click', () => {
    if (document.body.classList.contains('expanded')) {
        // Close any active panel
        document.querySelectorAll('.tool-icon, .pomodoro-icon, .app-icon, .settings-icon').forEach(i => i.classList.remove('active'));
        document.querySelectorAll('.tool-panel, .pomodoro-panel, .settings-panel').forEach(p => p.classList.remove('active'));
        document.body.classList.remove('expanded');
        window.parent.postMessage({ type: 'TOGGLE_SIDEBAR', expanded: false, width: 60 }, '*');
    } else {
        // Step 2: If no app is open, hide the entire sidebar into the tag
        window.parent.postMessage({ type: 'HIDE_SIDEBAR' }, '*');
    }
});

function applySettings() {
    // 0. Update Theme
    // Remove all theme classes first
    document.body.classList.remove('theme-emerald', 'theme-dark', 'theme-light');
    document.body.classList.add(`theme-${userSettings.theme || 'emerald'}`);

    // Update theme selector UI
    document.querySelectorAll('.theme-option').forEach(opt => {
        opt.classList.toggle('active', opt.getAttribute('data-theme') === userSettings.theme);
    });

    // 1. Update Toggles in UI
    for (const tool in userSettings.visibility) {
        const checkbox = document.getElementById(`toggle-${tool}`);
        if (checkbox) checkbox.checked = userSettings.visibility[tool];

        // 2. Apply visibility to icons
        const trigger = document.getElementById(`${tool}-trigger`);
        if (trigger) trigger.style.display = userSettings.visibility[tool] ? 'flex' : 'none';

        // 3. Close panel if it was open but now hidden
        if (!userSettings.visibility[tool]) {
            const panel = document.getElementById(`${tool === 'weather' ? 'weather-widget' : tool + '-panel'}`);
            if (panel && panel.classList.contains('active')) {
                document.getElementById('collapse-sidebar').click();
            }
        }
    }

    // 4. Update Weather Widget Visibility
    const weatherWidget = document.getElementById('weather-widget');
    if (weatherWidget) weatherWidget.style.display = userSettings.visibility.weather ? 'flex' : 'none';

    // 5. Update Weather Location Input
    const locInput = document.getElementById('weather-location-input');
    if (locInput) locInput.value = userSettings.weatherLocation || '';
}

function saveSettings() {
    chrome.storage.local.set({ userSettings });
}

// Settings Change Listeners
document.querySelectorAll('.theme-option').forEach(opt => {
    opt.addEventListener('click', () => {
        const theme = opt.getAttribute('data-theme');
        userSettings.theme = theme;
        saveSettings();
        applySettings();
    });
});

document.querySelectorAll('.toggle-item input').forEach(input => {
    input.addEventListener('change', (e) => {
        const tool = e.target.id.replace('toggle-', '');
        userSettings.visibility[tool] = e.target.checked;
        saveSettings();
        applySettings();
    });
});

let weatherLocTimeout;
document.getElementById('weather-location-input').addEventListener('input', (e) => {
    userSettings.weatherLocation = e.target.value;
    clearTimeout(weatherLocTimeout);
    weatherLocTimeout = setTimeout(() => {
        saveSettings();
        updateWeather();
    }, 1000); // Debounce
});

// Weather Logic
const WMO_CODE_MAP = {
    0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
    45: '🌫️', 48: '🌫️',
    51: '🌦️', 53: '🌦️', 55: '🌦️',
    61: '🌧️', 63: '🌧️', 65: '🌧️',
    71: '🌨️', 73: '🌨️', 75: '🌨️',
    80: '🌦️', 81: '🌦️', 82: '🌦️',
    95: '⛈️'
};

async function updateWeather() {
    try {
        let latitude, longitude, city;

        if (userSettings.weatherLocation && userSettings.weatherLocation.trim()) {
            // Step 1: Manual Location (Open-Meteo Geocoding API)
            console.log('Weather: Searching for:', userSettings.weatherLocation);

            let searchName = userSettings.weatherLocation.trim();
            const fetchGeo = async (name) => {
                const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=es&format=json`;
                const resp = await fetch(url);
                return await resp.json();
            };

            let geoData = await fetchGeo(searchName);

            // Retry with just city name if "City, CC" failed
            if ((!geoData.results || geoData.results.length === 0) && searchName.includes(',')) {
                const cityNameOnly = searchName.split(',')[0].trim();
                console.log('Weather: Retrying with city only:', cityNameOnly);
                geoData = await fetchGeo(cityNameOnly);
            }

            if (geoData.results && geoData.results.length > 0) {
                const res = geoData.results[0];
                latitude = res.latitude;
                longitude = res.longitude;
                city = res.name;
                console.log('Weather: Found:', city, latitude, longitude);
            } else {
                throw new Error('City not found: ' + userSettings.weatherLocation);
            }
        } else {
            // Step 2: Automatic Geolocation
            console.log('Weather: Fetching automatic location...');
            try {
                const pos = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
                });
                latitude = pos.coords.latitude;
                longitude = pos.coords.longitude;

                // Use a simple city name for display in auto mode
                city = 'Your Location';
                try {
                    const ipResponse = await fetch('https://ipapi.co/json/');
                    const ipData = await ipResponse.json();
                    city = ipData.city || 'Your Location';
                } catch (e) {
                    console.warn('Weather: City name fallback failed');
                }
            } catch (geoError) {
                console.warn('Weather: Geolocation failed, using IP fallback...', geoError);
                const ipResponse = await fetch('https://ipapi.co/json/');
                const ipData = await ipResponse.json();
                latitude = ipData.latitude;
                longitude = ipData.longitude;
                city = ipData.city || 'Unknown';
            }
        }

        if (!latitude || !longitude) throw new Error('Could not determine location coords');

        // Step 3: Fetch weather data
        console.log('Weather: Fetching data for:', city, latitude, longitude);
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`;
        const weatherResponse = await fetch(weatherUrl);
        if (!weatherResponse.ok) throw new Error('Weather API returned error ' + weatherResponse.status);

        const weatherData = await weatherResponse.json();
        const current = weatherData.current_weather;

        if (!current) throw new Error('No weather data available');

        // Step 4: Update UI
        document.getElementById('weather-icon').textContent = WMO_CODE_MAP[current.weathercode] || '🌡️';
        document.getElementById('weather-temp').textContent = `${Math.round(current.temperature)}°`;
        document.getElementById('weather-city').textContent = city;
        document.getElementById('weather-city').title = city;
        console.log('Weather: UI updated successfully');

    } catch (e) {
        console.error('Weather error details:', e);
        document.getElementById('weather-city').textContent = 'Error';
        document.getElementById('weather-city').title = e.message;
    }
}

// Initial fetch and refresh every 30 mins
setInterval(updateWeather, 30 * 60 * 1000);

// Sync width from parent
window.addEventListener('message', (event) => {
    if (event.data.type === 'SYNC_WIDTH') {
        if (event.data.width > 100) {
            currentWidth = event.data.width;
        }
    }
});

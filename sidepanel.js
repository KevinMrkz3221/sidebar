let isPinned = false;
let currentWidth = 450;
let apps = [];

const DEFAULT_APPS = [
    { name: 'Gemini', url: 'https://gemini.google.com' },
    { name: 'WhatsApp', url: 'https://web.whatsapp.com' },
    { name: 'YouTube Music', url: 'https://music.youtube.com' }
];

// Initialize
chrome.storage.local.get(['customApps', 'lastApp'], (result) => {
    apps = result.customApps || DEFAULT_APPS;
    renderApps();

    // Auto-open last app disabled to favor collapsed initial state
    /*
    if (result.lastApp) {
        setTimeout(() => {
            const lastIcon = document.querySelector(`.app-icon[data-url="${result.lastApp}"]`);
            if (lastIcon) {
                lastIcon.click();
                document.body.classList.add('expanded');
            }
        }, 100);
    }
    */
});

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
    document.getElementById('settings-trigger').classList.remove('active'); // Deactivate settings icon
    document.getElementById('settings-panel').classList.remove('active'); // Hide settings view

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

// Settings Toggle
document.getElementById('settings-trigger').addEventListener('click', () => {
    // Deactivate all app icons
    document.querySelectorAll('.app-icon').forEach(i => i.classList.remove('active'));

    // Toggle settings active state
    const settingsPanel = document.getElementById('settings-panel');
    const trigger = document.getElementById('settings-trigger');

    trigger.classList.add('active');
    settingsPanel.classList.add('active');

    // Ensure sidebar is expanded
    if (!document.body.classList.contains('expanded')) {
        document.body.classList.add('expanded');
        window.parent.postMessage({ type: 'TOGGLE_SIDEBAR', expanded: true, width: currentWidth }, '*');
    }
});

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
            alert('Please enter a valid URL (including https://)');
        }
    }
});

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
        // Step 1: If an app is open, just close the app view but keep the sidebar icons visible
        document.querySelectorAll('.app-icon').forEach(i => i.classList.remove('active'));
        document.getElementById('settings-trigger').classList.remove('active');
        document.getElementById('settings-panel').classList.remove('active');
        document.body.classList.remove('expanded');
        window.parent.postMessage({ type: 'TOGGLE_SIDEBAR', expanded: false, width: 60 }, '*');
    } else {
        // Step 2: If no app is open, hide the entire sidebar into the tag
        window.parent.postMessage({ type: 'HIDE_SIDEBAR' }, '*');
    }
});

// Sync width from parent
window.addEventListener('message', (event) => {
    if (event.data.type === 'SYNC_WIDTH') {
        if (event.data.width > 100) {
            currentWidth = event.data.width;
        }
    }
});

(function () {
    if (document.getElementById('sidepanel-hub-root')) return;

    const root = document.createElement('div');
    root.id = 'sidepanel-hub-root';

    root.style.position = 'fixed';
    root.style.left = '0';
    root.style.top = '0';
    root.style.height = '100vh';
    root.style.width = '60px'; // Set initial width
    root.style.backgroundColor = 'transparent'; // Ensure transparency
    root.style.zIndex = '2147483647';
    root.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

    // Floating Trigger (The "Label")
    const trigger = document.createElement('div');
    trigger.id = 'sidepanel-hub-trigger';
    trigger.innerHTML = '&#9654;'; // Simple arrow or label
    trigger.style.cssText = `
        position: fixed;
        left: 0;
        top: 50%;
        transform: translateY(-50%);
        width: 12px;
        height: 60px;
        background: #1a1a1a;
        border: 1px solid #333;
        border-left: none;
        border-radius: 0 8px 8px 0;
        cursor: pointer;
        z-index: 2147483646;
        display: none;
        align-items: center;
        justify-content: center;
        color: #888;
        font-size: 10px;
        transition: all 0.2s;
        box-shadow: 2px 0 10px rgba(0,0,0,0.3);
    `;

    trigger.onmouseover = () => { trigger.style.background = '#252525'; trigger.style.color = 'white'; };
    trigger.onmouseout = () => { trigger.style.background = '#1a1a1a'; trigger.style.color = '#888'; };
    trigger.onclick = () => {
        isSidebarHidden = false;
        updateVisibility();
    };

    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('sidepanel.html');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.backgroundColor = 'transparent';

    root.appendChild(iframe);
    document.documentElement.appendChild(root);
    document.documentElement.appendChild(trigger);

    const resizer = document.createElement('div');
    resizer.style.width = '10px';
    resizer.style.height = '100%';
    resizer.style.position = 'absolute';
    resizer.style.right = '-5px';
    resizer.style.top = '0';
    resizer.style.cursor = 'ew-resize';
    resizer.style.zIndex = '2147483647';
    resizer.style.backgroundColor = 'transparent';
    root.appendChild(resizer);

    let isResizing = false;
    let isPinned = false;
    let isSidebarHidden = true;
    let expandedWidth = 450;
    let currentWidth = 60;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.userSelect = 'none';
        iframe.style.pointerEvents = 'none';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newWidth = Math.max(60, Math.min(window.innerWidth - 100, e.clientX));
        currentWidth = newWidth;
        if (newWidth > 100) expandedWidth = newWidth; // Save as expanded if wide enough
        root.style.width = newWidth + 'px';
        updatePageShift(newWidth);

        // Sync back to iframe so it knows the new width
        iframe.contentWindow.postMessage({ type: 'SYNC_WIDTH', width: newWidth }, '*');
    });

    window.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.userSelect = 'auto';
            iframe.style.pointerEvents = 'auto';
            // Save final width to storage
            chrome.storage?.local.set({ sidebarWidth: expandedWidth });
        }
    });

    window.addEventListener('message', (event) => {
        if (event.data.type === 'TOGGLE_SIDEBAR') {
            const width = event.data.expanded ? expandedWidth : 60;
            currentWidth = width;
            root.style.width = width + 'px';
            if (event.data.expanded) isSidebarHidden = false;
            updateVisibility();
            updatePageShift(width);
        } else if (event.data.type === 'TOGGLE_PIN') {
            isPinned = event.data.pinned;
            if (event.data.width) currentWidth = event.data.width;

            if (isPinned) {
                isSidebarHidden = false;
            } else {
                // If unpinning, only hide if we are NOT in an expanded view
                if (currentWidth <= 60) {
                    isSidebarHidden = true;
                } else {
                    isSidebarHidden = false;
                }
            }
            updateVisibility();
            updatePageShift(currentWidth);
        } else if (event.data.type === 'HIDE_SIDEBAR') {
            isSidebarHidden = true;
            updateVisibility();
        }
    });

    function updateVisibility() {
        if (!isPinned && isSidebarHidden) {
            root.style.transform = `translateX(-${currentWidth}px)`;
            trigger.style.display = 'flex';
            trigger.style.opacity = '1';
        } else {
            root.style.transform = 'translateX(0)';
            trigger.style.display = 'none';
            trigger.style.opacity = '0';
        }
    }

    // Load saved width
    chrome.storage?.local.get(['sidebarWidth'], (result) => {
        if (result.sidebarWidth) expandedWidth = result.sidebarWidth;
    });

    // Close on click-away if unpinned
    document.addEventListener('mousedown', (e) => {
        if (!isPinned && !root.contains(e.target) && !trigger.contains(e.target) && !isSidebarHidden) {
            isSidebarHidden = true;
            updateVisibility();
        }
    });

    function updatePageShift(width) {
        if (isPinned) {
            document.documentElement.style.setProperty('margin-left', width + 'px', 'important');
            document.documentElement.style.setProperty('width', `calc(100% - ${width}px)`, 'important');
            document.documentElement.style.setProperty('transition', 'none', 'important');
        } else {
            document.documentElement.style.setProperty('margin-left', '0', 'important');
            document.documentElement.style.setProperty('width', '100%', 'important');
        }
        updateVisibility();
    }

    // Initial sync
    updatePageShift(60);
})();

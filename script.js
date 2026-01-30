// ===== Mode Management =====
const STORAGE_KEY = 'tonari-kosen-mode';
const DEFAULT_MODE = 'startup';

// Get current mode from localStorage (default to startup)
function getMode() {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_MODE;
}

// Set mode and update display
function setMode(mode) {
    localStorage.setItem(STORAGE_KEY, mode);
    updateDisplay(mode);
}

// Update page display based on mode
function updateDisplay(mode) {
    const landing = document.getElementById('landing');
    const mainContent = document.getElementById('main-content');
    const startupElements = document.querySelectorAll('[data-mode="startup"]');
    const localElements = document.querySelectorAll('[data-mode="local"]');
    const modeIndicator = document.getElementById('mode-indicator');
    const modeToggle = document.getElementById('mode-toggle');

    // Always hide landing, show main content
    if (landing) landing.style.display = 'none';
    if (mainContent) mainContent.style.display = 'block';

    // Update mode indicator text
    if (modeIndicator) {
        modeIndicator.textContent = mode === 'startup' ? 'スタートアップ用' : '地域用';
    }

    // Update toggle button state
    if (modeToggle) {
        modeToggle.setAttribute('data-current-mode', mode);
    }

    // Show/hide elements based on mode
    if (mode === 'startup') {
        startupElements.forEach(el => el.style.display = '');
        localElements.forEach(el => el.style.display = 'none');
    } else {
        startupElements.forEach(el => el.style.display = 'none');
        localElements.forEach(el => el.style.display = '');
    }
}

// Toggle between modes
function toggleMode() {
    const currentMode = getMode();
    const newMode = currentMode === 'startup' ? 'local' : 'startup';
    setMode(newMode);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function () {
    // Always start with the current mode (defaults to startup)
    const currentMode = getMode();
    updateDisplay(currentMode);

    // Set up mode toggle handler
    const modeToggle = document.getElementById('mode-toggle');
    if (modeToggle) {
        modeToggle.addEventListener('click', toggleMode);
    }
});

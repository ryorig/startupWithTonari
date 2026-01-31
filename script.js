// ===== Mode Management =====
const STORAGE_KEY = 'tonari-kosen-mode';
const DEFAULT_MODE = 'startup';
const VALID_MODES = ['startup', 'local', 'student'];

// Get current mode from localStorage (default to startup)
function getMode() {
    const savedMode = localStorage.getItem(STORAGE_KEY);
    return VALID_MODES.includes(savedMode) ? savedMode : DEFAULT_MODE;
}

// Set mode and update display
function setMode(mode) {
    if (!VALID_MODES.includes(mode)) return;
    localStorage.setItem(STORAGE_KEY, mode);
    updateDisplay(mode);
}

// Update page display based on mode
function updateDisplay(mode) {
    const landing = document.getElementById('landing');
    const mainContent = document.getElementById('main-content');

    // Always hide landing, show main content
    if (landing) landing.style.display = 'none';
    if (mainContent) mainContent.style.display = 'block';

    // Update navigation buttons
    const navButtons = document.querySelectorAll('.page-nav__btn');
    navButtons.forEach(btn => {
        btn.classList.remove('page-nav__btn--active');
        if (btn.dataset.page === mode) {
            btn.classList.add('page-nav__btn--active');
        }
    });

    // Show/hide elements based on mode
    VALID_MODES.forEach(m => {
        const elements = document.querySelectorAll(`[data-mode="${m}"]`);
        elements.forEach(el => {
            el.style.display = m === mode ? '' : 'none';
        });
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function () {
    // Start with the current mode (defaults to startup)
    const currentMode = getMode();
    updateDisplay(currentMode);

    // Set up navigation button handlers
    const navButtons = document.querySelectorAll('.page-nav__btn');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.dataset.page;
            if (page) setMode(page);
        });
    });
});

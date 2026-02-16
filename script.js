// ===== Mode Management =====
const STORAGE_KEY = 'tonari-kosen-mode';
const DEFAULT_MODE = 'student';
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

    // Update navigation buttons (both desktop and mobile)
    const navButtons = document.querySelectorAll('.page-nav__btn, .mobile-page-nav__btn');
    navButtons.forEach(btn => {
        btn.classList.remove('page-nav__btn--active', 'mobile-page-nav__btn--active');
        if (btn.dataset.page === mode) {
            if (btn.classList.contains('page-nav__btn')) {
                btn.classList.add('page-nav__btn--active');
            } else {
                btn.classList.add('mobile-page-nav__btn--active');
            }
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

// ===== Mobile Menu =====
function toggleMobileMenu() {
    const nav = document.querySelector('.header__nav');
    const toggle = document.querySelector('.header__menu-toggle');

    if (nav && toggle) {
        nav.classList.toggle('header__nav--open');
        toggle.classList.toggle('header__menu-toggle--active');

        // Update aria-label
        const isOpen = nav.classList.contains('header__nav--open');
        toggle.setAttribute('aria-label', isOpen ? 'メニューを閉じる' : 'メニューを開く');
    }
}

function closeMobileMenu() {
    const nav = document.querySelector('.header__nav');
    const toggle = document.querySelector('.header__menu-toggle');

    if (nav) nav.classList.remove('header__nav--open');
    if (toggle) {
        toggle.classList.remove('header__menu-toggle--active');
        toggle.setAttribute('aria-label', 'メニューを開く');
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function () {
    // Start with the current mode (defaults to startup)
    const currentMode = getMode();
    updateDisplay(currentMode);

    // Set up navigation button handlers (desktop and mobile)
    const navButtons = document.querySelectorAll('.page-nav__btn, .mobile-page-nav__btn');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.dataset.page;
            if (page) {
                setMode(page);
                closeMobileMenu();
            }
        });
    });

    // Set up hamburger menu toggle
    const menuToggle = document.querySelector('.header__menu-toggle');
    if (menuToggle) {
        menuToggle.addEventListener('click', toggleMobileMenu);
    }

    // Close menu when clicking nav links
    const navLinks = document.querySelectorAll('.header__nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', closeMobileMenu);
    });

    // Close menu when clicking CTA button
    const ctaButton = document.querySelector('.header__cta');
    if (ctaButton) {
        ctaButton.addEventListener('click', closeMobileMenu);
    }

});


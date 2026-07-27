// ===== Mode Management =====
const STORAGE_KEY = 'tonari-kosen-mode';
const DEFAULT_MODE = 'student';
const VALID_MODES = ['startup', 'local', 'student'];
const STUDENT_REGISTRATION_STORAGE_KEY = 'tonari-student-registration';

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

// ===== Student Registration Wizard =====
function setupStudentRegistration() {
    const modal = document.getElementById('student-registration-modal');
    const form = document.getElementById('student-registration-form');
    if (!modal || !form) return;

    const steps = Array.from(form.querySelectorAll('[data-registration-step]'));
    const questionStepCount = steps.length - 1;
    const progressBar = document.getElementById('registration-progress-bar');
    const stepNumber = document.getElementById('registration-step-number');
    const nextButton = form.querySelector('[data-registration-next]');
    const prevButton = form.querySelector('[data-registration-prev]');
    const submitButton = form.querySelector('[data-registration-submit]');
    const summary = document.getElementById('registration-summary');
    const success = document.getElementById('registration-success');
    const header = modal.querySelector('.registration-modal__header');
    const actions = form.querySelector('.registration-form__actions');
    let currentStep = 0;

    function setError(step, fieldName, message) {
        const field = step.querySelector(`[name="${fieldName}"]`);
        const error = step.querySelector(`[data-error-for="${fieldName}"]`);
        if (field) field.setAttribute('aria-invalid', message ? 'true' : 'false');
        if (error) error.textContent = message;
    }

    function clearErrors() {
        form.querySelectorAll('.registration-field__error').forEach(error => {
            error.textContent = '';
        });
        form.querySelectorAll('[aria-invalid]').forEach(field => {
            field.removeAttribute('aria-invalid');
        });
    }

    function validateStep() {
        const step = steps[currentStep];
        if (!step || currentStep >= questionStepCount) return true;

        clearErrors();
        const fields = Array.from(step.querySelectorAll('input:not([type="checkbox"]), select'));
        let valid = true;

        fields.forEach(field => {
            if (field.checkValidity()) return;
            valid = false;
            const message = field.validity.valueMissing
                ? '入力してください。'
                : '正しい形式で入力してください。';
            setError(step, field.name, message);
        });

        if (currentStep === 5) {
            const checkedInterests = step.querySelectorAll('input[name="interests"]:checked');
            if (checkedInterests.length === 0) {
                valid = false;
                setError(step, 'interests', '1つ以上選択してください。');
            }
        }

        if (!valid) {
            const invalidField = step.querySelector('[aria-invalid="true"]') ||
                step.querySelector('input[name="interests"]');
            if (invalidField) invalidField.focus();
        }
        return valid;
    }

    function getRegistrationData() {
        const data = Object.fromEntries(new FormData(form).entries());
        delete data.consent;
        data.interests = Array.from(form.querySelectorAll('input[name="interests"]:checked'))
            .map(input => input.value);
        return data;
    }

    function validateConfirmation() {
        const confirmationStep = steps[questionStepCount];
        const consent = form.querySelector('#registration-consent');
        clearErrors();
        if (consent.checked) return true;

        setError(confirmationStep, 'consent', '保存に同意してください。');
        consent.focus();
        return false;
    }

    function renderSummary() {
        const data = getRegistrationData();
        const rows = [
            ['お名前', data.name],
            ['メールアドレス', data.email],
            ['在籍高専', data.school],
            ['学科・コース', data.course],
            ['学年', data.grade],
            ['興味分野', data.interests.join('、')]
        ];

        summary.replaceChildren();
        rows.forEach(([label, value]) => {
            const labelElement = document.createElement('dt');
            const valueElement = document.createElement('dd');
            labelElement.textContent = label;
            valueElement.textContent = value || '未入力';
            summary.append(labelElement, valueElement);
        });
    }

    function showStep(stepIndex) {
        currentStep = Math.max(0, Math.min(stepIndex, steps.length - 1));
        steps.forEach((step, index) => {
            step.classList.toggle('is-active', index === currentStep);
        });

        const isConfirmation = currentStep === questionStepCount;
        if (isConfirmation) renderSummary();
        progressBar.style.width = `${Math.min(currentStep + 1, questionStepCount) / questionStepCount * 100}%`;
        stepNumber.textContent = isConfirmation ? '確認' : `${currentStep + 1} / ${questionStepCount}`;
        prevButton.hidden = currentStep === 0;
        nextButton.hidden = isConfirmation;
        submitButton.hidden = !isConfirmation;

        const focusTarget = steps[currentStep].querySelector('input, select, textarea, button');
        if (focusTarget) focusTarget.focus();
    }

    function resetRegistration() {
        form.reset();
        clearErrors();
        form.hidden = false;
        success.hidden = true;
        header.hidden = false;
        actions.hidden = false;
        showStep(0);
    }

    function openRegistration() {
        resetRegistration();
        modal.hidden = false;
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('registration-modal-open');
    }

    function closeRegistration() {
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('registration-modal-open');
    }

    document.querySelectorAll('[data-open-student-registration]').forEach(trigger => {
        trigger.addEventListener('click', openRegistration);
    });

    modal.querySelectorAll('[data-registration-close]').forEach(closeButton => {
        closeButton.addEventListener('click', closeRegistration);
    });

    nextButton.addEventListener('click', () => {
        if (validateStep()) showStep(currentStep + 1);
    });

    prevButton.addEventListener('click', () => showStep(currentStep - 1));

    form.addEventListener('submit', event => {
        event.preventDefault();
        if (!validateConfirmation()) return;
        const registration = {
            ...getRegistrationData(),
            registeredAt: new Date().toISOString()
        };
        localStorage.setItem(STUDENT_REGISTRATION_STORAGE_KEY, JSON.stringify(registration));
        form.querySelectorAll('.registration-step').forEach(step => {
            step.classList.remove('is-active');
        });
        actions.hidden = true;
        success.hidden = false;
        header.hidden = true;
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !modal.hidden) closeRegistration();
    });

    showStep(0);
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

    setupStudentRegistration();

});

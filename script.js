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

// ===== Student Registration Wizard =====
function setupStudentRegistration() {
    const modal = document.getElementById('student-registration-modal');
    const form = document.getElementById('student-registration-form');
    const methodScreen = modal?.querySelector('[data-registration-method-screen]');
    const authScreen = modal?.querySelector('[data-registration-auth-screen]');
    if (!modal || !form || !methodScreen || !authScreen) return;

    const steps = Array.from(form.querySelectorAll('[data-registration-step]'));
    const questionStepCount = steps.length - 1;
    const methodInput = form.querySelector('#registration-method');
    const methodButtons = Array.from(methodScreen.querySelectorAll('[data-registration-method]'));
    const authTitle = authScreen.querySelector('[data-registration-auth-title]');
    const authContinueButton = authScreen.querySelector('[data-registration-auth-continue]');
    const authBackButton = authScreen.querySelector('[data-registration-auth-back]');
    const progressBar = document.getElementById('registration-progress-bar');
    const stepNumber = document.getElementById('registration-step-number');
    const nextButton = form.querySelector('[data-registration-next]');
    const prevButton = form.querySelector('[data-registration-prev]');
    const submitButton = form.querySelector('[data-registration-submit]');
    const summary = document.getElementById('registration-summary');
    const success = document.getElementById('registration-success');
    const header = modal.querySelector('.registration-modal__header');
    const actions = form.querySelector('.registration-form__actions');
    const academicEmailPattern = /^[^@\s]+@[^@\s.]+(?:\.[^@\s.]+)*\.ac\.jp$/i;
    const portfolioUrlPattern = /^https:\/\/\S+$/i;
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
            if (field.name === 'email' && field.value &&
                !academicEmailPattern.test(field.value.trim())) {
                valid = false;
                setError(step, field.name,
                    '学校発行の「ac.jp」で終わるメールアドレスを入力してください。');
                return;
            }
            if (field.name === 'portfolio' && field.value &&
                !portfolioUrlPattern.test(field.value.trim())) {
                valid = false;
                setError(step, field.name,
                    'https://から始まる閲覧可能なURLを入力してください。');
                return;
            }
            if (field.checkValidity()) return;
            valid = false;
            let message = field.validity.valueMissing
                ? '入力してください。'
                : '正しい形式で入力してください。';

            if (field.name === 'email' && !field.validity.valueMissing) {
                message = '学校発行の「ac.jp」で終わるメールアドレスを入力してください。';
            }
            if (field.name === 'portfolio' && !field.validity.valueMissing) {
                message = 'https://から始まる閲覧可能なURLを入力してください。';
            }
            setError(step, field.name, message);
        });

        const interestInputs = step.querySelectorAll('input[name="interests"]');
        if (interestInputs.length > 0) {
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
        if (data.email) data.email = data.email.trim().toLowerCase();
        if (data.portfolio) data.portfolio = data.portfolio.trim();
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
            ['登録方法', data.registrationMethod],
            ['お名前', data.name],
            ['メールアドレス', data.email],
            ['在籍高専', data.school],
            ['学科・コース', data.course],
            ['学年', data.grade],
            ['ポートフォリオ', data.portfolio],
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

    function showStep(stepIndex, shouldFocus = true) {
        currentStep = Math.max(0, Math.min(stepIndex, steps.length - 1));
        steps.forEach((step, index) => {
            step.classList.toggle('is-active', index === currentStep);
        });

        const isConfirmation = currentStep === questionStepCount;
        if (isConfirmation) renderSummary();
        progressBar.style.width = `${Math.min(currentStep + 1, questionStepCount) / questionStepCount * 100}%`;
        stepNumber.textContent = isConfirmation ? '確認' : `${currentStep + 1} / ${questionStepCount}`;
        prevButton.hidden = false;
        nextButton.hidden = isConfirmation;
        submitButton.hidden = !isConfirmation;

        if (shouldFocus) {
            const focusTarget = steps[currentStep].querySelector('input, select, textarea, button');
            if (focusTarget) focusTarget.focus();
        }
    }

    function showMethodSelection(shouldFocus = true) {
        methodScreen.hidden = false;
        authScreen.hidden = true;
        header.hidden = true;
        form.hidden = true;
        modal.setAttribute('aria-labelledby', 'registration-modal-title');

        if (shouldFocus && methodButtons[0]) methodButtons[0].focus();
    }

    function showAuthentication(method, shouldFocus = true) {
        methodInput.value = method;
        methodScreen.hidden = true;
        authScreen.hidden = false;
        header.hidden = true;
        form.hidden = true;
        authTitle.textContent = `${method}認証`;
        authContinueButton.textContent = `${method}認証を続ける`;
        modal.setAttribute('aria-labelledby', 'registration-auth-title');

        if (shouldFocus) authContinueButton.focus();
    }

    function startRegistration(method) {
        methodInput.value = method;
        methodScreen.hidden = true;
        authScreen.hidden = true;
        form.hidden = false;
        success.hidden = true;
        header.hidden = false;
        actions.hidden = false;
        modal.setAttribute('aria-labelledby', 'registration-wizard-title');
        showStep(0);
    }

    function resetRegistration() {
        form.reset();
        clearErrors();
        authScreen.hidden = true;
        success.hidden = true;
        actions.hidden = false;
        showStep(0, false);
        showMethodSelection(false);
    }

    function openRegistration() {
        resetRegistration();
        modal.hidden = false;
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('registration-modal-open');
        if (methodButtons[0]) methodButtons[0].focus();
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

    methodButtons.forEach(button => {
        button.addEventListener('click', () => showAuthentication(button.dataset.registrationMethod));
    });

    authContinueButton.addEventListener('click', () => startRegistration(methodInput.value));
    authBackButton.addEventListener('click', () => showMethodSelection());

    nextButton.addEventListener('click', () => {
        if (validateStep()) showStep(currentStep + 1);
    });

    prevButton.addEventListener('click', () => {
        if (currentStep === 0) {
            showMethodSelection();
            return;
        }
        showStep(currentStep - 1);
    });

    form.addEventListener('submit', event => {
        event.preventDefault();
        if (!validateConfirmation()) return;
        form.querySelectorAll('.registration-step').forEach(step => {
            step.classList.remove('is-active');
        });
        actions.hidden = true;
        success.hidden = false;
        header.hidden = true;
        modal.setAttribute('aria-labelledby', 'registration-success-title');
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !modal.hidden) closeRegistration();
    });

    resetRegistration();
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

// ===== Progressive Web App =====
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(error => {
            console.warn('Service worker registration failed:', error);
        });
    });
}

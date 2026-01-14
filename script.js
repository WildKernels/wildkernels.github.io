document.addEventListener('DOMContentLoaded', () => {
    // Theme Toggle Logic
    const themeToggleBtn = document.getElementById('theme-toggle');
    const body = document.body;

    // 1. Check Local Storage first (User Preference overrides System)
    const savedTheme = localStorage.getItem('theme');

    // 2. Check System Preference
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)');

    function setTheme(theme) {
        body.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        updateThemeIcon(theme);
    }

    // Initialize Theme
    if (savedTheme) {
        setTheme(savedTheme);
    } else if (systemPrefersDark.matches) {
        setTheme('dark');
    } else {
        setTheme('light');
    }

    // Handle Toggle Click
    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = body.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
    });

    function updateThemeIcon(theme) {
        themeToggleBtn.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
    }

    // Active State for Navigation (Based on URL)
    const navItems = document.querySelectorAll('.bottom-nav .nav-item, .desktop-nav .nav-link');
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';

    navItems.forEach(item => {
        item.classList.remove('active');
        const href = item.getAttribute('href');
        if (href === currentPath) {
            item.classList.add('active');
        }
    });

    // Top App Bar & Bottom Nav Elevation on Scroll
    const topAppBar = document.querySelector('.top-app-bar');
    const bottomNav = document.querySelector('.bottom-nav');
    
    function updateScrollState() {
        // Top App Bar Logic: Tinted (scrolled) when NOT at top
        if (window.scrollY > 0) {
            topAppBar.classList.add('scrolled');
        } else {
            topAppBar.classList.remove('scrolled');
        }

        // Bottom Nav Logic: Tinted (scrolled) when NOT at bottom
        if (bottomNav) {
            // Check if we are near the bottom of the page
            // Buffer of 10px to handle mobile rounding/overscroll
            const isBottom = (window.innerHeight + Math.ceil(window.scrollY)) >= document.body.offsetHeight - 10;

            if (!isBottom) {
                // Not at bottom -> Tinted (scrolled state)
                bottomNav.classList.add('scrolled');
            } else {
                // At bottom -> Flat (default state)
                bottomNav.classList.remove('scrolled');
            }
        }
    }

    window.addEventListener('scroll', updateScrollState);
    
    // Initial check in case page is refreshed mid-scroll
    updateScrollState();
});

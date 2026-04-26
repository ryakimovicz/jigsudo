/**
 * MASTER LOCK - Logic for the 7-wheel industrial lock sequence.
 */

import { translations } from "./translations.js?v=1.4.8";
import { getCurrentLang } from "./i18n.js?v=1.4.8";
import { showToast } from "./ui.js?v=1.4.8";

class MasterLock {

    constructor() {
        this.overlay = null;
        this.icon = null;
        this.wheels = [];
        this.digitHeight = 60; // Must match CSS
        this.isInitialized = false;
        this.hasCompletedVictory = false;
    }

    init() {
        if (this.isInitialized) return;
        
        this.createIcon();
        this.createOverlay();
        this.isInitialized = true;
        
        // Listen for board resizes to update digit height if needed (mobile vs desktop)
        window.addEventListener('resize', () => {
             const firstDigit = document.querySelector('.wheel-digit');
             if (firstDigit) this.digitHeight = firstDigit.offsetHeight;
        });
    }

    createIcon() {
        const gameSection = document.getElementById('game-section');
        if (!gameSection) return;

        this.icon = document.createElement('div');
        this.icon.id = 'master-lock-icon';
        this.icon.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" style="stroke: var(--primary-color)"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4" style="stroke: var(--text-muted)"></path>
            </svg>
        `;
        gameSection.appendChild(this.icon);
        
        // Clic notification
        this.icon.addEventListener('click', () => {
            if (this.icon.classList.contains('expanding') || this.hasCompletedVictory) return;
            const lang = getCurrentLang();
            const msg = translations[lang].lock_need_all_levels || translations['es'].lock_need_all_levels;
            showToast(msg, 4000);
        });

        // Auto-visibility based on route
        window.addEventListener('routeChanged', (e) => {
            if (this.hasCompletedVictory) return; // Stay invisible after win

            const { route, hash } = e.detail;
            const isAtGame = route === 'game-section' || (route === 'history-section' && hash.split('/').length > 1);
            if (isAtGame) {
                this.showIcon();
            } else {
                this.hideIcon();
            }
        });
    }

    createOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'master-lock-overlay';
        
        this.overlay.innerHTML = `
            <div class="safe-mechanism">
                <div class="safe-rivet rivet-tl"></div>
                <div class="safe-rivet rivet-tr"></div>
                <div class="safe-rivet rivet-bl"></div>
                <div class="safe-rivet rivet-br"></div>
                
                <h2 class="safe-header" data-i18n="label_security_bypass">${translations[getCurrentLang()].label_security_bypass || 'Security Bypass'}</h2>
                
                <div class="wheels-wrapper">
                    ${Array(7).fill(0).map((_, i) => `
                        <div class="safe-wheel" data-index="${i}">
                            <div class="wheel-strip">
                                ${this.generateDigitStripHTML()}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);
        this.wheels = Array.from(this.overlay.querySelectorAll('.safe-wheel'));
    }

    generateDigitStripHTML() {
        // We repeat the 1-9 sequence multiple times for the spinning effect
        const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        // Repeat 5 times to ensure enough length for long spins
        const extended = [...digits, ...digits, ...digits, ...digits, ...digits];
        return extended.map(d => `<div class="wheel-digit">${d}</div>`).join('');
    }

    /**
     * Resets the lock to initial state
     */
    reset() {
        this.hasCompletedVictory = false; // Allow showing for new games
        if (this.overlay) this.overlay.classList.remove('active');
        // We don't hide the icon here by default, as it should stay visible during levels
        this.wheels.forEach(w => {
            w.classList.remove('unlocked');
            const strip = w.querySelector('.wheel-strip');
            strip.style.transition = 'none';
            strip.style.transform = 'translateY(0)';
        });

        // v1.2.7: Clear inline expansion/opacity styles used during victory
        if (this.icon) {
            this.icon.style.transform = '';
            this.icon.style.opacity = '';
        }
        this.wheels.forEach(w => {
            w.style.overflow = ''; // Restore clipping
            const digits = w.querySelectorAll('.wheel-digit');
            digits.forEach(d => d.style.opacity = ''); // Show all digits again
        });
        if (this.overlay) {
            this.overlay.classList.remove('disintegrated');
        }
    }

    showIcon() {
        if (this.icon) this.icon.classList.add('visible');
    }

    hideIcon() {
        if (this.icon) this.icon.classList.remove('visible');
    }

    /**
     * The Master Sequence
     * @param {number[]} code - Array of 7 integers (1-9)
     */
    async showVictorySequence(code) {
        if (!this.overlay || !this.icon) return;

        // 1. Initial State: Center and Expand Icon
        this.icon.classList.add('expanding');
        
        // Calculate Translation to Center of available space (viewport minus sidebar)
        const iconRect = this.icon.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // v1.3.1: Account for sidebar width in centering
        const sidebarWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-current-width')) || 0;
        const isMobile = window.innerWidth <= 768;
        const currentSidebar = isMobile ? 0 : sidebarWidth;

        const targetCenterX = currentSidebar + (viewportWidth - currentSidebar) / 2;
        const targetCenterY = viewportHeight / 2;

        const deltaX = targetCenterX - (iconRect.left + iconRect.width / 2);
        const deltaY = targetCenterY - (iconRect.top + iconRect.height / 2);
        
        // Move to center and scale up (Calculated to match safe box approx size)
        this.icon.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(8)`;
        
        // 1.5 Sync Fade: As it reaches center, open the mechanism
        await new Promise(r => setTimeout(r, 450));

        // 2. Open Safe Modal
        this.overlay.classList.add('active');
        this.overlay.style.background = 'transparent'; // Ensure transparent per user request
        this.overlay.style.backdropFilter = 'none';
        
        // Immediate cross-fade: the icon vanishes as the modal finishes entering
        setTimeout(() => {
            if (this.icon) this.icon.style.opacity = '0';
            this.hasCompletedVictory = true; // Mark as done to prevent re-show
        }, 100);
        
        // Wait for modal transition (0.6s total in CSS)
        await new Promise(r => setTimeout(r, 400));
        
        // Update digit height just in case (CSS media queries)
        const firstDigit = this.overlay.querySelector('.wheel-digit');
        if (firstDigit) this.digitHeight = firstDigit.offsetHeight;

        console.log("[Lock] Starting sequence for code:", code);

        // 2. Start fast chaotic spin (visual only)
        this.wheels.forEach((w, i) => {
            const strip = w.querySelector('.wheel-strip');
            strip.style.transition = `transform ${1.5 + i * 0.2}s cubic-bezier(0.45, 0.05, 0.55, 0.95)`;
            
            // Spin to a random high multiple of the strip
            const randomExtra = Math.floor(Math.random() * 3) + 2; // 2-4 full loops
            const targetY = -(randomExtra * 9 * this.digitHeight);
            strip.style.transform = `translateY(${targetY}px)`;
            
            // v1.2.7: Ensure digits are visible for transformation
            w.style.overflow = 'hidden'; 
        });

        await new Promise(r => setTimeout(r, 1500));

        // 3. Precise Stop on Target
        const promises = this.wheels.map((w, i) => {
            return new Promise(resolve => {
                const targetDigit = code[i] || 1;
                const strip = w.querySelector('.wheel-strip');
                
                // We are at a high random Y. Now move to the target position in the LAST copy of the strip.
                // The strip has 5 copies of 1-9. We'll land on the 4th copy for safety.
                const targetIndex = 27 + (targetDigit - 1); // 9*3 + index
                const finalY = -(targetIndex * this.digitHeight);
                
                strip.style.transition = `transform 1.2s cubic-bezier(0.16, 1, 0.3, 1)`;
                strip.style.transform = `translateY(${finalY}px)`;
                
                setTimeout(() => {
                    w.classList.add('unlocked');
                    resolve();
                }, 1200 + i * 100); // Slight stagger for impact
            });
        });

        await Promise.all(promises);
        
        // 4. Final Unlock Pause
        await new Promise(r => setTimeout(r, 800));
        
        // v1.2.7: Return the actual elements for in-place transformation
        // We find the active digit element at the target translation
        return this.wheels.map((w, i) => {
            const targetDigit = code[i] || 1;
            const targetIndex = 27 + (targetDigit - 1);
            const digits = w.querySelectorAll('.wheel-digit');
            
            // Set target digit to fully opaque and siblings to 0
            digits.forEach((d, idx) => {
                d.style.opacity = (idx === targetIndex) ? '1' : '0';
            });

            const el = digits[targetIndex];
            return el; 
        });
    }


    /**
     * v1.2.7: Hides the physical boxes and borders of the wheels
     * while keeping the digits visible for the victory transformation.
     */
    disintegrate() {
        if (this.overlay) {
            this.overlay.classList.add('disintegrated');
        }
        const mechanism = document.querySelector('.safe-mechanism');
        if (mechanism) mechanism.classList.add('disintegrated');
    }

    /**
     * v1.2.7: Restores the lock to its original industrial state.
     * Essential for subsequent games.
     */
    reset() {
        this.hasCompletedVictory = false; // Allow showing for new games
        if (this.overlay) {
            this.overlay.classList.remove('disintegrated');
            this.overlay.classList.remove('active');
            this.overlay.style.background = '';
            this.overlay.style.backdropFilter = '';
            this.overlay.style.opacity = '';
            this.overlay.style.transform = '';
        }
        
        const mechanism = document.querySelector('.safe-mechanism');
        if (mechanism) {
            mechanism.classList.remove('disintegrated');
            // Remove any accumulated victory trays
            const tray = mechanism.querySelector('.victory-tray');
            if (tray) tray.remove();
        }

        // v1.2.7: Physical Reset of the Wheels
        this.wheels.forEach(w => {
            w.classList.remove('unlocked');
            const strip = w.querySelector('.wheel-strip');
            if (strip) {
                strip.style.transition = 'none';
                strip.style.transform = 'translateY(0)';
            }
            // Restore visibility to all digits
            const digits = w.querySelectorAll('.wheel-digit');
            digits.forEach(d => {
                d.style.opacity = '';
                d.style.visibility = '';
            });
        });

        if (this.icon) {
            this.icon.classList.remove('expanding');
            this.icon.classList.remove('visible');
            this.icon.style.transform = '';
            this.icon.style.opacity = '';
        }
    }

    async close() {
        if (this.overlay) {
            this.overlay.style.opacity = '0';
            this.overlay.style.transform = 'scale(0.9)'; // Subtle shrink on close
            await new Promise(r => setTimeout(r, 600));
            this.overlay.classList.remove('active');
            this.overlay.style.opacity = '';
            this.overlay.style.transform = '';
        }
        if (this.icon) {
            this.icon.classList.remove('expanding');
            this.icon.classList.remove('visible'); // FULLY HIDE PERMANENTLY
            this.icon.style.transform = '';
            this.icon.style.opacity = '';
        }
    }
}

export const masterLock = new MasterLock();

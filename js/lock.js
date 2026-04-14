/**
 * MASTER LOCK - Logic for the 7-wheel industrial lock sequence.
 */

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
                
                <h2 class="safe-header">Security Bypass</h2>
                
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
        
        // Calculate Translation to Center of viewport
        const iconRect = this.icon.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        const deltaX = (viewportWidth / 2) - (iconRect.left + iconRect.width / 2);
        const deltaY = (viewportHeight / 2) - (iconRect.top + iconRect.height / 2);
        
        // Move to center and scale up (Calculated to match safe box approx size)
        this.icon.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(8)`;
        
        // 1.5 Sync Fade: As it reaches center, open the mechanism
        await new Promise(r => setTimeout(r, 450));

        // 2. Open Safe Modal
        this.overlay.classList.add('active');
        
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
        
        // Return the positions of the winning digits for the "flying" animation
        return this.wheels.map(w => {
            const digitEl = w.querySelector('.wheel-digit'); // This is dummy, we need the actual visible one
            // Calculating the center of the wheel is more robust
            const rect = w.getBoundingClientRect();
            return {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };
        });
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

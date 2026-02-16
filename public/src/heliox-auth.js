// ===== Heliox Firebase Authentication =====
const firebaseConfig = {
    apiKey: "",
    authDomain: "login-96909.firebaseapp.com",
    projectId: "login-96909",
    storageBucket: "login-96909.appspot.com",
    messagingSenderId: "1041589784359",
    appId: "1:1041589784359:web:a213e9d92307d5b831a302"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const HelioxAuth = {
    currentUser: null,
    userProfile: null,

    init() {
        this.setupFormListeners();
        this.setupAuthListeners();

        // Handle redirect result (for Google sign-in fallback)
        auth.getRedirectResult().then(result => {
            if (result.user) {
                console.log('Redirect sign-in success');
            }
        }).catch(e => console.warn('Redirect result error:', e.message));

        // Auth state listener
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                this.currentUser = user;
                await this.loadUserProfile(user);
                this.showApp();
            } else {
                this.currentUser = null;
                this.userProfile = null;
                this.showAuth();
            }
        });
    },

    showAuth() {
        document.getElementById('auth-screen')?.classList.remove('hidden');
        document.getElementById('app')?.classList.add('hidden');
    },

    showApp() {
        document.getElementById('auth-screen')?.classList.add('hidden');
        document.getElementById('app')?.classList.remove('hidden');
        this.updateUIWithUser();
    },

    // ===== Profile Management =====
    async loadUserProfile(user) {
        try {
            const doc = await db.collection('users').doc(user.uid).get();
            if (doc.exists) {
                this.userProfile = doc.data();
            } else {
                const profile = {
                    username: user.displayName || user.email?.split('@')[0] || 'User',
                    email: user.email,
                    photoURL: user.photoURL || null,
                    tone: 'balanced',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                await db.collection('users').doc(user.uid).set(profile);
                this.userProfile = profile;
            }
            localStorage.setItem('heliox_profile', JSON.stringify(this.userProfile));
        } catch (e) {
            console.warn('Firestore unavailable, using local:', e.message);
            const saved = localStorage.getItem('heliox_profile');
            this.userProfile = saved ? JSON.parse(saved) : {
                username: user.displayName || user.email?.split('@')[0] || 'User',
                email: user.email,
                photoURL: user.photoURL || null,
                tone: 'balanced'
            };
        }
    },

    async saveUserTone(tone) {
        if (this.userProfile) this.userProfile.tone = tone;
        localStorage.setItem('heliox_tone', tone);
        if (this.currentUser) {
            try { await db.collection('users').doc(this.currentUser.uid).update({ tone }); }
            catch (e) { console.warn('Save tone failed:', e.message); }
        }
        // Update profile panel tone display
        const el = document.getElementById('profile-tone-value');
        if (el) el.textContent = tone.charAt(0).toUpperCase() + tone.slice(1);
    },

    getUserTone() {
        return this.userProfile?.tone || localStorage.getItem('heliox_tone') || 'balanced';
    },
    getUsername() {
        return this.userProfile?.username || this.currentUser?.displayName || 'User';
    },
    getEmail() {
        return this.userProfile?.email || this.currentUser?.email || '';
    },

    // ===== Update UI =====
    updateUIWithUser() {
        // Header greeting
        const greeting = document.getElementById('user-greeting');
        if (greeting) greeting.textContent = `Hi, ${this.getUsername()}`;

        // Avatar - check localStorage first (user uploaded), then Firebase
        const savedAvatar = localStorage.getItem('heliox_avatar');
        const avatarUrl = savedAvatar || this.currentUser?.photoURL;
        const avatar = document.getElementById('user-avatar');
        if (avatar && avatarUrl) {
            avatar.innerHTML = `<img src="${avatarUrl}" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">`;
        }

        // Profile panel info
        const pName = document.getElementById('profile-name');
        const pEmail = document.getElementById('profile-email');
        const pTone = document.getElementById('profile-tone-value');
        const pAvatar = document.getElementById('profile-avatar-img');
        if (pName) pName.textContent = this.getUsername();
        if (pEmail) pEmail.textContent = this.getEmail();
        if (pTone) pTone.textContent = this.getUserTone().charAt(0).toUpperCase() + this.getUserTone().slice(1);
        if (pAvatar && avatarUrl) {
            pAvatar.src = avatarUrl;
            pAvatar.style.display = 'block';
            const fallback = document.getElementById('profile-avatar-fallback');
            if (fallback) fallback.style.display = 'none';
        }

        // Set active tone in profile
        const toneToSet = this.getUserTone();
        document.querySelectorAll('.tone-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.tone === toneToSet);
        });
    },

    // ===== Auth Methods =====
    async loginWithEmail(email, password) {
        try {
            await auth.signInWithEmailAndPassword(email, password);
            return { success: true };
        } catch (e) {
            return { success: false, error: this.getErrorMessage(e.code) };
        }
    },

    async registerWithEmail(username, email, password) {
        try {
            const result = await auth.createUserWithEmailAndPassword(email, password);
            await result.user.updateProfile({ displayName: username });
            try {
                await db.collection('users').doc(result.user.uid).set({
                    username, email, photoURL: null, tone: 'balanced',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } catch (e) { console.warn('Firestore write failed:', e.message); }
            return { success: true };
        } catch (e) {
            return { success: false, error: this.getErrorMessage(e.code) };
        }
    },

    async loginWithGoogle() {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('email');
        provider.addScope('profile');
        try {
            // Try popup first
            await auth.signInWithPopup(provider);
            return { success: true };
        } catch (e) {
            console.warn('Popup failed, trying redirect:', e.code);
            if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
                // Fallback to redirect
                try {
                    await auth.signInWithRedirect(provider);
                    return { success: true };
                } catch (e2) {
                    return { success: false, error: this.getErrorMessage(e2.code) };
                }
            }
            return { success: false, error: this.getErrorMessage(e.code) };
        }
    },

    async logout() {
        try { await auth.signOut(); }
        catch (e) { console.error('Logout error:', e); }
    },

    getErrorMessage(code) {
        const msgs = {
            'auth/user-not-found': 'No account found with this email.',
            'auth/wrong-password': 'Incorrect password.',
            'auth/email-already-in-use': 'This email is already registered.',
            'auth/weak-password': 'Password must be at least 6 characters.',
            'auth/invalid-email': 'Please enter a valid email.',
            'auth/too-many-requests': 'Too many attempts. Try again later.',
            'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
            'auth/popup-blocked': 'Popup was blocked. Trying redirect...',
            'auth/network-request-failed': 'Network error. Check your connection.',
            'auth/invalid-credential': 'Invalid credentials. Try again.',
            'auth/operation-not-allowed': 'This sign-in method is not enabled.',
            'auth/unauthorized-domain': 'This domain is not authorized for sign-in. Add localhost to Firebase Console > Authentication > Settings > Authorized domains.'
        };
        return msgs[code] || `Error: ${code || 'Unknown error'}. Please try again.`;
    },

    // ===== Form Listeners =====
    setupFormListeners() {
        document.getElementById('show-register')?.addEventListener('click', () => {
            document.getElementById('login-form')?.classList.add('hidden');
            document.getElementById('register-form')?.classList.remove('hidden');
        });
        document.getElementById('show-login')?.addEventListener('click', () => {
            document.getElementById('register-form')?.classList.add('hidden');
            document.getElementById('login-form')?.classList.remove('hidden');
        });

        // Login
        document.getElementById('login-submit')?.addEventListener('click', async () => {
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;
            const errEl = document.getElementById('login-error');
            if (!email || !password) { errEl.textContent = 'Fill in all fields.'; return; }
            errEl.textContent = '';
            const btn = document.getElementById('login-submit');
            btn.disabled = true; btn.textContent = 'Signing in...';
            const r = await this.loginWithEmail(email, password);
            if (!r.success) { errEl.textContent = r.error; btn.disabled = false; btn.textContent = 'Sign In'; }
        });

        // Register
        document.getElementById('register-submit')?.addEventListener('click', async () => {
            const username = document.getElementById('register-username').value.trim();
            const email = document.getElementById('register-email').value.trim();
            const password = document.getElementById('register-password').value;
            const errEl = document.getElementById('register-error');
            if (!username || !email || !password) { errEl.textContent = 'Fill in all fields.'; return; }
            if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; return; }
            errEl.textContent = '';
            const btn = document.getElementById('register-submit');
            btn.disabled = true; btn.textContent = 'Creating...';
            const r = await this.registerWithEmail(username, email, password);
            if (!r.success) { errEl.textContent = r.error; btn.disabled = false; btn.textContent = 'Create Account'; }
        });

        // Google
        document.getElementById('google-login-btn')?.addEventListener('click', async () => {
            const errEl = document.getElementById('login-error');
            errEl.textContent = '';
            const r = await this.loginWithGoogle();
            if (!r.success) errEl.textContent = r.error;
        });
        document.getElementById('google-register-btn')?.addEventListener('click', async () => {
            const errEl = document.getElementById('register-error');
            errEl.textContent = '';
            const r = await this.loginWithGoogle();
            if (!r.success) errEl.textContent = r.error;
        });

        // Enter key
        document.getElementById('login-password')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('login-submit')?.click(); });
        document.getElementById('register-password')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('register-submit')?.click(); });
    },

    // ===== Auth Event Listeners =====
    setupAuthListeners() {
        // Logout
        document.getElementById('logout-btn')?.addEventListener('click', () => this.logout());
        document.getElementById('profile-logout-btn')?.addEventListener('click', () => {
            document.getElementById('profile-panel')?.classList.add('hidden');
            this.logout();
        });

        // Profile panel toggle
        document.getElementById('user-profile-btn')?.addEventListener('click', () => {
            const panel = document.getElementById('profile-panel');
            panel?.classList.toggle('hidden');
        });
        document.getElementById('close-profile')?.addEventListener('click', () => {
            document.getElementById('profile-panel')?.classList.add('hidden');
        });

        // Tone options (inside profile panel)
        document.querySelectorAll('.tone-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const tone = opt.dataset.tone;
                document.querySelectorAll('.tone-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                this.saveUserTone(tone);
            });
        });
    }
};

// Tone instruction for system prompt
function getToneInstruction() {
    const tone = HelioxAuth.getUserTone();
    const map = {
        balanced: 'Respond in a balanced, clear, and helpful tone. Be informative yet approachable.',
        friendly: 'Respond warmly and encouragingly. Use casual language and emojis occasionally. Be a supportive study buddy.',
        professional: 'Respond in a formal, professional tone. Be precise, structured, and avoid casual language.',
        creative: 'Respond creatively with vivid language, metaphors, and playful explanations. Make learning fun.',
        concise: 'Be extremely concise. Give direct answers with minimal explanation. Use bullet points.',
        teacher: 'Respond like a patient teacher. Break down topics step by step. Use examples and analogies.'
    };
    return map[tone] || map.balanced;
}

document.addEventListener('DOMContentLoaded', () => { HelioxAuth.init(); });

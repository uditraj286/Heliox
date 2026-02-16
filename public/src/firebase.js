/**
 * Heliox - Firebase Configuration
 * Load from environment config - never commit real keys
 */
import { getConfig } from '../env/config.example.js';

let firebaseApp = null;
let firebaseAuth = null;

export async function initializeFirebase() {
    const config = getConfig();
    if (!config.firebase.apiKey) {
        console.warn('Firebase not configured. Auth features disabled.');
        return null;
    }
    
    try {
        const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js');
        const { getAuth } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
        
        firebaseApp = initializeApp(config.firebase);
        firebaseAuth = getAuth(firebaseApp);
        return firebaseAuth;
    } catch (error) {
        console.error('Firebase initialization failed:', error);
        return null;
    }
}

export function getFirebaseAuth() {
    return firebaseAuth;
}

export function getFirebaseApp() {
    return firebaseApp;
}

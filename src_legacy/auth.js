/**
 * Heliox - Authentication Module
 * Firebase Auth with persistent sessions
 */
import { initializeFirebase, getFirebaseAuth } from './firebase.js';

let currentUser = null;
let authStateListeners = [];

export async function initAuth() {
    const auth = await initializeFirebase();
    if (!auth) return null;
    
    const { onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
    
    return new Promise((resolve) => {
        onAuthStateChanged(auth, (user) => {
            currentUser = user;
            authStateListeners.forEach(listener => listener(user));
            resolve(user);
        });
    });
}

export function onAuthStateChange(callback) {
    authStateListeners.push(callback);
    if (currentUser !== null) callback(currentUser);
    return () => {
        authStateListeners = authStateListeners.filter(l => l !== callback);
    };
}

export async function signUp(email, password, displayName) {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error('Auth not initialized');
    
    const { createUserWithEmailAndPassword, updateProfile } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
    
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCredential.user, { displayName });
    return userCredential.user;
}

export async function signIn(email, password) {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error('Auth not initialized');
    
    const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
    return (await signInWithEmailAndPassword(auth, email, password)).user;
}

export async function signOut() {
    const auth = getFirebaseAuth();
    if (!auth) return;
    
    const { signOut: firebaseSignOut } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
    await firebaseSignOut(auth);
}

export function getCurrentUser() {
    return currentUser;
}

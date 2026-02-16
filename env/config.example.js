/**
 * Heliox - Configuration Example
 * Copy this file and rename to config.js with your actual values
 * NEVER commit config.js to version control
 */
export function getConfig() {
    return {
        // Backend proxy endpoint - all API calls go through this
        proxyEndpoint: window.HELIOX_PROXY_ENDPOINT || 'https://your-backend.workers.dev',
        
        // Firebase configuration
        firebase: {
            apiKey: window.HELIOX_FIREBASE_API_KEY || '',
            authDomain: window.HELIOX_FIREBASE_AUTH_DOMAIN || '',
            projectId: window.HELIOX_FIREBASE_PROJECT_ID || '',
            storageBucket: window.HELIOX_FIREBASE_STORAGE_BUCKET || '',
            messagingSenderId: window.HELIOX_FIREBASE_MESSAGING_SENDER_ID || '',
            appId: window.HELIOX_FIREBASE_APP_ID || ''
        },
        
        // Spotify configuration
        spotify: {
            clientId: window.HELIOX_SPOTIFY_CLIENT_ID || '',
            redirectUri: window.location.origin + '/callback'
        },
        
        // Feature flags
        features: {
            spotifyIntegration: false,
            voiceInput: false,
            darkMode: true
        }
    };
}

// Development mode detection
export function isDevelopment() {
    return window.location.hostname === 'localhost' || 
           window.location.hostname === '127.0.0.1';
}

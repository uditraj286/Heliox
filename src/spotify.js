/**
 * Heliox - Spotify Integration
 * Playlist creation from chat context
 */
import { SPOTIFY_CONFIG } from '../config.js';

let spotifyAccessToken = null;
let spotifyRefreshToken = null;

const SPOTIFY_AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

// Production Redirect URI
const REDIRECT_URI = window.location.origin + window.location.pathname;
const PROXY_ENDPOINT = 'https://heliox-api.uditraj286.workers.dev';

export function getSpotifyAuthUrl() {
    if (!SPOTIFY_CONFIG.CLIENT_ID) {
        console.warn('Spotify not configured');
        return null;
    }
    const params = new URLSearchParams({
        client_id: SPOTIFY_CONFIG.CLIENT_ID,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        scope: 'playlist-modify-public playlist-modify-private user-read-private',
        state: crypto.randomUUID()
    });
    return `${SPOTIFY_AUTH_ENDPOINT}?${params.toString()}`;
}

export async function handleSpotifyCallback(code) {
    try {
        const response = await fetch(PROXY_ENDPOINT + '/spotify/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, redirectUri: REDIRECT_URI })
        });
        if (!response.ok) throw new Error('Token exchange failed');
        const data = await response.json();
        spotifyAccessToken = data.access_token;
        spotifyRefreshToken = data.refresh_token;
        localStorage.setItem('spotify_connected', 'true');
        return true;
    } catch (error) {
        console.error('Spotify auth error:', error);
        return false;
    }
}

export function isSpotifyConnected() {
    return localStorage.getItem('spotify_connected') === 'true' && spotifyAccessToken;
}

export async function createPlaylist(name, tracks) {
    if (!spotifyAccessToken) throw new Error('Not connected to Spotify');
    try {
        const userResponse = await fetch(`${SPOTIFY_API_BASE}/me`, {
            headers: { 'Authorization': `Bearer ${spotifyAccessToken}` }
        });
        const user = await userResponse.json();
        const playlistResponse = await fetch(`${SPOTIFY_API_BASE}/users/${user.id}/playlists`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${spotifyAccessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: name,
                description: 'Created by Heliox AI',
                public: false
            })
        });
        const playlist = await playlistResponse.json();
        if (tracks && tracks.length > 0) {
            await fetch(`${SPOTIFY_API_BASE}/playlists/${playlist.id}/tracks`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${spotifyAccessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ uris: tracks })
            });
        }
        return playlist;
    } catch (error) {
        console.error('Playlist creation failed:', error);
        throw error;
    }
}

export async function searchTracks(query, limit = 10) {
    if (!spotifyAccessToken) return [];
    try {
        const params = new URLSearchParams({ q: query, type: 'track', limit: limit.toString() });
        const response = await fetch(`${SPOTIFY_API_BASE}/search?${params}`, {
            headers: { 'Authorization': `Bearer ${spotifyAccessToken}` }
        });
        const data = await response.json();
        return data.tracks?.items || [];
    } catch (error) {
        console.error('Track search failed:', error);
        return [];
    }
}

export function disconnectSpotify() {
    spotifyAccessToken = null;
    spotifyRefreshToken = null;
    localStorage.removeItem('spotify_connected');
}

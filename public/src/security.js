/**
 * Heliox - Security Module
 * Input sanitization and XSS protection
 */

const BLOCKED_PATTERNS = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /data:\s*text\/html/gi
];

export function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    let sanitized = input.trim();
    sanitized = sanitized.replace(/[<>]/g, (char) => {
        return char === '<' ? '&lt;' : '&gt;';
    });
    return sanitized;
}

export function sanitizeHTML(html) {
    if (typeof html !== 'string') return '';
    let sanitized = html;
    BLOCKED_PATTERNS.forEach(pattern => {
        sanitized = sanitized.replace(pattern, '');
    });
    return sanitized;
}

export function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    const escapeMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;'
    };
    return str.replace(/[&<>"'/]/g, char => escapeMap[char]);
}

export function validateUrl(url) {
    try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
        return false;
    }
}

export function createSafeElement(tag, attributes = {}, textContent = '') {
    const element = document.createElement(tag);
    Object.entries(attributes).forEach(([key, value]) => {
        if (key.startsWith('on')) return;
        if (key === 'href' || key === 'src') {
            if (!validateUrl(value) && !value.startsWith('/') && !value.startsWith('#')) return;
        }
        element.setAttribute(key, escapeHTML(value));
    });
    if (textContent) {
        element.textContent = textContent;
    }
    return element;
}

let requestCount = 0;
let lastResetTime = Date.now();
const RATE_LIMIT = 30;
const RATE_WINDOW = 60000;

export function checkRateLimit() {
    const now = Date.now();
    if (now - lastResetTime > RATE_WINDOW) {
        requestCount = 0;
        lastResetTime = now;
    }
    if (requestCount >= RATE_LIMIT) {
        return false;
    }
    requestCount++;
    return true;
}

export function resetRateLimit() {
    requestCount = 0;
    lastResetTime = Date.now();
}

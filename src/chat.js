/**
 * Heliox - Chat Module
 * Gemini API integration with Google Grounding
 */
import { getConfig } from '../env/config.example.js';
import { sanitizeInput, checkRateLimit, escapeHTML } from './security.js';
import { getModel, isModelAvailable, getModelGroundingMessage } from './models.js';

const HELIOX_SYSTEM_PROMPT = `You are Heliox, an independent AI assistant.
You must never mention, reveal, reference, or imply the name of any underlying AI model, provider, or company, including but not limited to Google, Gemini, OpenAI, GPT, or any internal model identifiers.
If asked about your model, training, or provider, respond with: "I'm Heliox, an AI assistant designed to help you with accurate, grounded information."
You must always present Heliox as a product designed and developed by Devreon Devs.
Attribution: Product name: Heliox | Designed & Developed by: Devreon Devs | Website: https://devreondevs.com
Maintain a professional, editorial, research-focused tone at all times.
Deliver verified, source-backed answers. Format responses with clear structure using markdown.`;

let responseCache = new Map();
const CACHE_TTL = 300000;

export async function sendMessage(message, modelId, chatHistory = []) {
    const sanitizedMessage = sanitizeInput(message);
    if (!sanitizedMessage) throw new Error('Empty message');
    if (!checkRateLimit()) throw new Error('Rate limit exceeded. Please wait.');
    if (!isModelAvailable(modelId)) {
        const groundingMsg = getModelGroundingMessage(modelId);
        throw new Error(groundingMsg || 'Model not available');
    }
    const cacheKey = `${modelId}:${sanitizedMessage}`;
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    const config = getConfig();
    const endpoint = config.proxyEndpoint + '/chat';
    const payload = {
        message: sanitizedMessage,
        model: modelId,
        history: chatHistory.slice(-10).map(m => ({
            role: m.role,
            content: m.content
        })),
        systemPrompt: HELIOX_SYSTEM_PROMPT,
        enableGrounding: true
    };
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || 'Request failed');
        }
        const data = await response.json();
        const result = normalizeResponse(data);
        responseCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
    } catch (error) {
        console.error('Chat error:', error);
        throw error;
    }
}

function normalizeResponse(data) {
    return {
        answer: data.answer || data.text || '',
        sources: (data.sources || data.groundingMetadata?.webSearchQueries || []).map(s => ({
            title: s.title || s.snippet || 'Source',
            url: s.url || s.uri || '#',
            domain: extractDomain(s.url || s.uri || '')
        })).slice(0, 6),
        followUps: (data.followUps || data.suggestedQuestions || []).slice(0, 6)
    };
}

function extractDomain(url) {
    try {
        return new URL(url).hostname.replace('www.', '');
    } catch {
        return '';
    }
}

export function parseMarkdown(text) {
    if (!text) return '';
    let html = escapeHTML(text);
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>');
    html = html.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    html = html.replace(/\n/g, '<br>');
    return html;
}

export function clearCache() {
    responseCache.clear();
}

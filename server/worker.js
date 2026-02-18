/**
 * Heliox Production Backend Proxy
 * Cloudflare Workers - Secure Gemini API Gateway
 * 
 * Features:
 * - API key is stored as Cloudflare secret (never exposed to client)
 * - Domain-restricted CORS (only your domains can call this)
 * - Rate limiting with KV storage
 * - Input validation & sanitization
 * - Streaming support via SSE
 * - Non-streaming fallback
 * 
 * Deploy:   cd server && wrangler deploy
 * Secrets:  wrangler secret put HELIOX_GEMINI_API_KEY
 */

// ===== CONFIGURATION =====
const ALLOWED_ORIGINS = [
    'https://uditraj286.github.io',
    'https://heliox.devreondevs.com',
    'https://www.heliox.devreondevs.com',
    'https://devreondevs.com',
    'http://localhost:3000',
    'http://localhost:8080',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8080',
];

const GEMINI_MODEL = 'gemini-1.5-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const RATE_LIMIT_MAX = 60;         // requests per window
const RATE_LIMIT_WINDOW = 60;      // window in seconds
const MAX_MESSAGE_LENGTH = 15000;
const MAX_HISTORY_LENGTH = 30;

// ===== CORS HELPER =====
function getCorsHeaders(request) {
    const origin = request.headers.get('Origin') || '';
    const isAllowed = ALLOWED_ORIGINS.some(allowed => {
        if (allowed === origin) return true;
        // Allow wildcard subdomains
        if (allowed.includes('*')) {
            const pattern = allowed.replace('*', '.*');
            return new RegExp(`^${pattern}$`).test(origin);
        }
        return false;
    });

    return {
        'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
    };
}

// ===== RATE LIMITING (KV-backed for production, in-memory fallback) =====
const memoryRateLimits = new Map();

async function checkRateLimit(ip, env) {
    // Try KV first (production), fallback to memory
    if (env.RATE_LIMITER) {
        try {
            const key = `rl:${ip}`;
            const data = await env.RATE_LIMITER.get(key, 'json');
            const now = Math.floor(Date.now() / 1000);

            if (!data || now > data.resetAt) {
                await env.RATE_LIMITER.put(key, JSON.stringify({
                    count: 1,
                    resetAt: now + RATE_LIMIT_WINDOW
                }), { expirationTtl: RATE_LIMIT_WINDOW + 10 });
                return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
            }

            if (data.count >= RATE_LIMIT_MAX) {
                return { allowed: false, remaining: 0, retryAfter: data.resetAt - now };
            }

            data.count++;
            await env.RATE_LIMITER.put(key, JSON.stringify(data), {
                expirationTtl: data.resetAt - now + 10
            });
            return { allowed: true, remaining: RATE_LIMIT_MAX - data.count };
        } catch (e) {
            console.warn('KV rate limit error, falling back to memory:', e.message);
        }
    }

    // In-memory fallback
    const now = Date.now();
    const entry = memoryRateLimits.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW * 1000 };

    if (now > entry.resetTime) {
        entry.count = 0;
        entry.resetTime = now + RATE_LIMIT_WINDOW * 1000;
    }

    if (entry.count >= RATE_LIMIT_MAX) {
        return { allowed: false, remaining: 0 };
    }

    entry.count++;
    memoryRateLimits.set(ip, entry);
    return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count };
}

// ===== INPUT VALIDATION =====
function validateInput(body) {
    if (!body || typeof body !== 'object') {
        return { valid: false, error: 'Invalid request body' };
    }
    if (typeof body.message !== 'string') {
        return { valid: false, error: 'Message is required and must be a string' };
    }
    if (body.message.trim().length < 1) {
        return { valid: false, error: 'Message cannot be empty' };
    }
    if (body.message.length > MAX_MESSAGE_LENGTH) {
        return { valid: false, error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` };
    }
    if (body.history && !Array.isArray(body.history)) {
        return { valid: false, error: 'History must be an array' };
    }
    if (body.history && body.history.length > MAX_HISTORY_LENGTH) {
        body.history = body.history.slice(-MAX_HISTORY_LENGTH);
    }
    return { valid: true };
}

// ===== BUILD GEMINI REQUEST =====
function buildGeminiRequest(message, history, systemPrompt, enableGrounding = true) {
    const contents = [];

    // System instruction via user/model pair
    if (systemPrompt) {
        contents.push({
            role: 'user',
            parts: [{ text: `[System Instructions - Follow strictly]: ${systemPrompt}` }]
        });
        contents.push({
            role: 'model',
            parts: [{ text: 'I understand and will follow these instructions carefully.' }]
        });
    }

    // Chat history
    if (history && Array.isArray(history)) {
        for (const msg of history) {
            if (msg.content && typeof msg.content === 'string') {
                contents.push({
                    role: msg.role === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.content }]
                });
            }
        }
    }

    // Current message
    contents.push({
        role: 'user',
        parts: [{ text: message }]
    });

    const request = {
        contents,
        generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 8192,
        },
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
        ]
    };

    // Add Google Search grounding tool
    if (enableGrounding) {
        request.tools = [{ googleSearch: {} }];
    }

    return request;
}

// ===== EXTRACT SOURCES FROM GROUNDING =====
function extractSources(response) {
    const sources = [];
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;

    if (groundingMetadata?.groundingChunks) {
        for (const chunk of groundingMetadata.groundingChunks) {
            if (chunk.web) {
                sources.push({
                    title: chunk.web.title || 'Source',
                    url: chunk.web.uri || '',
                    domain: extractDomain(chunk.web.uri || '')
                });
            }
        }
    }

    // Deduplicate
    const seen = new Set();
    return sources.filter(s => {
        if (seen.has(s.url)) return false;
        seen.add(s.url);
        return true;
    }).slice(0, 8);
}

function extractDomain(url) {
    try { return new URL(url).hostname.replace('www.', ''); }
    catch { return ''; }
}

// ===== GENERATE FOLLOW-UP SUGGESTIONS =====
function generateFollowUps(answer, message) {
    const followUps = [];
    const topics = answer.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    const uniqueTopics = [...new Set(topics)].slice(0, 3);

    for (const topic of uniqueTopics) {
        if (topic.length > 3 && !message.toLowerCase().includes(topic.toLowerCase())) {
            followUps.push(`Tell me more about ${topic}`);
        }
    }

    if (followUps.length < 2) {
        followUps.push('Can you explain this in more detail?');
    }
    if (followUps.length < 3) {
        followUps.push('What are practical applications of this?');
    }

    return followUps.slice(0, 6);
}

// ===== NON-STREAMING CHAT HANDLER =====
async function handleChatRequest(request, env) {
    const corsHeaders = getCorsHeaders(request);
    const clientIP = request.headers.get('CF-Connecting-IP') ||
                     request.headers.get('X-Forwarded-For') ||
                     request.headers.get('X-Real-IP') || 'unknown';

    // Rate limit check
    const rateCheck = await checkRateLimit(clientIP, env);
    if (!rateCheck.allowed) {
        return new Response(JSON.stringify({
            error: 'Rate limit exceeded. Please wait before sending more requests.',
            retryAfter: rateCheck.retryAfter || RATE_LIMIT_WINDOW
        }), {
            status: 429,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
                'Retry-After': String(rateCheck.retryAfter || RATE_LIMIT_WINDOW)
            }
        });
    }

    // Parse body
    let body;
    try {
        body = await request.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    // Validate
    const validation = validateInput(body);
    if (!validation.valid) {
        return new Response(JSON.stringify({ error: validation.error }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    // API key
    const apiKey = env.HELIOX_GEMINI_API_KEY;
    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'API not configured. Contact administrator.' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    try {
        const geminiRequest = buildGeminiRequest(
            body.message,
            body.history,
            body.systemPrompt,
            body.enableGrounding !== false
        );

        const geminiResponse = await fetch(
            `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(geminiRequest)
            }
        );

        if (!geminiResponse.ok) {
            const errorData = await geminiResponse.json().catch(() => ({}));
            console.error('Gemini API error:', JSON.stringify(errorData));
            return new Response(JSON.stringify({
                error: 'Unable to process your request right now.',
                details: errorData.error?.message || `Status ${geminiResponse.status}`
            }), {
                status: geminiResponse.status >= 500 ? 502 : geminiResponse.status,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const data = await geminiResponse.json();
        const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        if (!answer) {
            return new Response(JSON.stringify({
                answer: 'I was unable to generate a response for this query. Please try rephrasing.',
                sources: [],
                followUps: ['Can you rephrase your question?']
            }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const sources = extractSources(data);
        const followUps = generateFollowUps(answer, body.message);

        return new Response(JSON.stringify({
            answer,
            sources,
            followUps
        }), {
            status: 200,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
                'X-RateLimit-Remaining': String(rateCheck.remaining)
            }
        });

    } catch (error) {
        console.error('Request failed:', error);
        return new Response(JSON.stringify({ error: 'An unexpected error occurred. Please try again.' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}

// ===== STREAMING CHAT HANDLER (SSE) =====
async function handleStreamRequest(request, env) {
    const corsHeaders = getCorsHeaders(request);
    const clientIP = request.headers.get('CF-Connecting-IP') ||
                     request.headers.get('X-Forwarded-For') ||
                     request.headers.get('X-Real-IP') || 'unknown';

    // Rate limit check
    const rateCheck = await checkRateLimit(clientIP, env);
    if (!rateCheck.allowed) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const validation = validateInput(body);
    if (!validation.valid) {
        return new Response(JSON.stringify({ error: validation.error }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const apiKey = env.HELIOX_GEMINI_API_KEY;
    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'API not configured' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const geminiRequest = buildGeminiRequest(
        body.message,
        body.history,
        body.systemPrompt,
        body.enableGrounding !== false
    );

    // Use Gemini streaming endpoint
    try {
        const geminiResponse = await fetch(
            `${GEMINI_API_BASE}/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(geminiRequest)
            }
        );

        if (!geminiResponse.ok) {
            const errorData = await geminiResponse.text();
            console.error('Gemini streaming error:', errorData);
            return new Response(JSON.stringify({ error: 'Gemini API error' }), {
                status: 502,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Create a TransformStream to proxy the SSE response
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const reader = geminiResponse.body.getReader();

        // Process stream in background
        (async () => {
            let buffer = '';
            let allSources = [];
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const dataStr = line.slice(6).trim();
                            if (!dataStr || dataStr === '[DONE]') continue;

                            try {
                                const chunk = JSON.parse(dataStr);
                                const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
                                const grounding = chunk.candidates?.[0]?.groundingMetadata;

                                // Collect grounding sources
                                if (grounding?.groundingChunks) {
                                    for (const gc of grounding.groundingChunks) {
                                        if (gc.web) {
                                            allSources.push({
                                                title: gc.web.title || 'Source',
                                                url: gc.web.uri || '',
                                                domain: extractDomain(gc.web.uri || '')
                                            });
                                        }
                                    }
                                }

                                if (text) {
                                    // Send text chunk to client
                                    const sseData = JSON.stringify({ type: 'text', content: text });
                                    await writer.write(encoder.encode(`data: ${sseData}\n\n`));
                                }
                            } catch (parseErr) {
                                // Skip unparseable chunks
                            }
                        }
                    }
                }

                // Deduplicate sources and send final metadata
                const seen = new Set();
                const uniqueSources = allSources.filter(s => {
                    if (seen.has(s.url)) return false;
                    seen.add(s.url);
                    return true;
                }).slice(0, 8);

                const metaData = JSON.stringify({
                    type: 'done',
                    sources: uniqueSources,
                    followUps: []
                });
                await writer.write(encoder.encode(`data: ${metaData}\n\n`));
                await writer.write(encoder.encode(`data: [DONE]\n\n`));
            } catch (e) {
                const errData = JSON.stringify({ type: 'error', message: e.message });
                try { await writer.write(encoder.encode(`data: ${errData}\n\n`)); } catch {}
            } finally {
                try { await writer.close(); } catch {}
            }
        })();

        return new Response(readable, {
            status: 200,
            headers: {
                ...corsHeaders,
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            }
        });

    } catch (error) {
        console.error('Stream request failed:', error);
        return new Response(JSON.stringify({ error: 'Streaming failed' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}

// ===== HEALTH CHECK =====
function handleHealthCheck(request) {
    const corsHeaders = getCorsHeaders(request);
    return new Response(JSON.stringify({
        status: 'ok',
        service: 'Heliox API',
        version: '2.0.0',
        timestamp: new Date().toISOString()
    }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

// ===== WORKER ENTRY POINT =====
export default {
    async fetch(request, env, ctx) {
        const corsHeaders = getCorsHeaders(request);

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        const url = new URL(request.url);
        const path = url.pathname;

        // Route handling
        if (path === '/chat' && request.method === 'POST') {
            return handleChatRequest(request, env);
        }

        if (path === '/chat/stream' && request.method === 'POST') {
            return handleStreamRequest(request, env);
        }

        if (path === '/health' && request.method === 'GET') {
            return handleHealthCheck(request);
        }

        // 404
        return new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

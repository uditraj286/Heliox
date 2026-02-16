/**
 * Heliox Local Development Server
 * Mirrors production Cloudflare Worker behavior
 * Supports both /chat and /chat/stream endpoints
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Load environment variables from .dev.vars
const envPath = path.join(__dirname, '.dev.vars');
let HELIOX_GEMINI_API_KEY = '';

try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/HELIOX_GEMINI_API_KEY=(.*)/);
    if (match) HELIOX_GEMINI_API_KEY = match[1].trim();
} catch (e) {
    console.warn('⚠️ Could not read .dev.vars file:', e.message);
}

const PORT = 8787;
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// CORS headers
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};

// Build Gemini request body
function buildGeminiRequest(data) {
    const contents = [];

    if (data.systemPrompt) {
        contents.push({
            role: 'user',
            parts: [{ text: `[System Instructions]: ${data.systemPrompt}` }]
        });
        contents.push({
            role: 'model',
            parts: [{ text: 'Understood.' }]
        });
    }

    if (data.history && Array.isArray(data.history)) {
        data.history.forEach(msg => {
            if (msg.content && typeof msg.content === 'string') {
                contents.push({
                    role: msg.role === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.content }]
                });
            }
        });
    }

    contents.push({
        role: 'user',
        parts: [{ text: data.message }]
    });

    return {
        contents,
        tools: [{ googleSearch: {} }],
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
}

// Extract sources from grounding
function extractSources(geminiData) {
    const sources = [];
    const chunks = geminiData.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    chunks.forEach(chunk => {
        if (chunk.web) {
            sources.push({
                title: chunk.web.title || 'Source',
                url: chunk.web.uri || '',
                domain: extractDomain(chunk.web.uri || '')
            });
        }
    });
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

// Read request body
function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch (e) { reject(new Error('Invalid JSON')); }
        });
        req.on('error', reject);
    });
}

// Make HTTPS request (returns full response)
function httpsRequest(url, options, postData) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        });
        req.on('error', reject);
        if (postData) req.write(postData);
        req.end();
    });
}

// ===== SERVER =====
const server = http.createServer(async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
    }

    // Health check
    if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({ status: 'ok', service: 'Heliox API (dev)', timestamp: new Date().toISOString() }));
        return;
    }

    // ===== NON-STREAMING CHAT =====
    if (req.url === '/chat' && req.method === 'POST') {
        let data;
        try { data = await readBody(req); }
        catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders });
            res.end(JSON.stringify({ error: 'Invalid JSON body' }));
            return;
        }

        if (!HELIOX_GEMINI_API_KEY) {
            res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders });
            res.end(JSON.stringify({ error: 'API key not configured. Add HELIOX_GEMINI_API_KEY to server/.dev.vars' }));
            return;
        }

        if (!data.message || typeof data.message !== 'string' || data.message.trim().length < 1) {
            res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders });
            res.end(JSON.stringify({ error: 'Message is required' }));
            return;
        }

        const geminiRequest = buildGeminiRequest(data);
        const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${HELIOX_GEMINI_API_KEY}`;

        console.log(`📡 [/chat] Sending to ${GEMINI_MODEL}...`);

        try {
            const response = await httpsRequest(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, JSON.stringify(geminiRequest));

            if (response.status !== 200) {
                console.error('Gemini API Error:', response.data.substring(0, 200));
                res.writeHead(response.status, { 'Content-Type': 'application/json', ...corsHeaders });
                res.end(JSON.stringify({ error: 'Gemini API failed', details: response.data.substring(0, 200) }));
                return;
            }

            const geminiData = JSON.parse(response.data);
            const answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const sources = extractSources(geminiData);

            console.log(`✅ [/chat] Got ${answer.length} chars, ${sources.length} sources`);

            res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
            res.end(JSON.stringify({ answer, sources: sources.slice(0, 8), followUps: [] }));

        } catch (e) {
            console.error('Request Error:', e.message);
            res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders });
            res.end(JSON.stringify({ error: 'Network error connecting to Gemini' }));
        }
        return;
    }

    // ===== STREAMING CHAT (SSE) =====
    if (req.url === '/chat/stream' && req.method === 'POST') {
        let data;
        try { data = await readBody(req); }
        catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders });
            res.end(JSON.stringify({ error: 'Invalid JSON body' }));
            return;
        }

        if (!HELIOX_GEMINI_API_KEY) {
            res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders });
            res.end(JSON.stringify({ error: 'API key not configured' }));
            return;
        }

        if (!data.message || typeof data.message !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders });
            res.end(JSON.stringify({ error: 'Message is required' }));
            return;
        }

        const geminiRequest = buildGeminiRequest(data);
        const streamUrl = `${GEMINI_API_BASE}/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${HELIOX_GEMINI_API_KEY}`;

        console.log(`📡 [/chat/stream] Streaming from ${GEMINI_MODEL}...`);

        // Set SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            ...corsHeaders
        });

        const postData = JSON.stringify(geminiRequest);
        const parsedUrl = new URL(streamUrl);

        const apiReq = https.request({
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (apiRes) => {
            if (apiRes.statusCode !== 200) {
                let errorBody = '';
                apiRes.on('data', chunk => errorBody += chunk);
                apiRes.on('end', () => {
                    console.error('Gemini Stream Error:', errorBody.substring(0, 200));
                    const errData = JSON.stringify({ type: 'error', message: `Gemini API error: ${apiRes.statusCode}` });
                    res.write(`data: ${errData}\n\n`);
                    res.write(`data: [DONE]\n\n`);
                    res.end();
                });
                return;
            }

            let buffer = '';
            let allSources = [];

            apiRes.on('data', (chunk) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6).trim();
                        if (!dataStr || dataStr === '[DONE]') continue;

                        try {
                            const parsed = JSON.parse(dataStr);
                            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
                            const grounding = parsed.candidates?.[0]?.groundingMetadata;

                            if (grounding?.groundingChunks) {
                                grounding.groundingChunks.forEach(gc => {
                                    if (gc.web) {
                                        allSources.push({
                                            title: gc.web.title || 'Source',
                                            url: gc.web.uri || '',
                                            domain: extractDomain(gc.web.uri || '')
                                        });
                                    }
                                });
                            }

                            if (text) {
                                const sseData = JSON.stringify({ type: 'text', content: text });
                                res.write(`data: ${sseData}\n\n`);
                            }
                        } catch (parseErr) {
                            // Skip unparseable chunks
                        }
                    }
                }
            });

            apiRes.on('end', () => {
                // Deduplicate sources
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
                res.write(`data: ${metaData}\n\n`);
                res.write(`data: [DONE]\n\n`);
                res.end();
                console.log(`✅ [/chat/stream] Stream complete, ${uniqueSources.length} sources`);
            });

            apiRes.on('error', (e) => {
                console.error('Stream read error:', e.message);
                const errData = JSON.stringify({ type: 'error', message: e.message });
                res.write(`data: ${errData}\n\n`);
                res.end();
            });
        });

        apiReq.on('error', (e) => {
            console.error('Stream request error:', e.message);
            const errData = JSON.stringify({ type: 'error', message: 'Network error' });
            res.write(`data: ${errData}\n\n`);
            res.end();
        });

        // Handle client disconnect
        req.on('close', () => {
            apiReq.destroy();
        });

        apiReq.write(postData);
        apiReq.end();
        return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json', ...corsHeaders });
    res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, () => {
    console.log(`\n🚀 Heliox API Server (Development)`);
    console.log(`   http://localhost:${PORT}`);
    console.log(`   Endpoints:`);
    console.log(`     POST /chat          - Non-streaming response`);
    console.log(`     POST /chat/stream   - Streaming SSE response`);
    console.log(`     GET  /health        - Health check`);
    console.log(`   Model: ${GEMINI_MODEL}`);
    console.log(`   API Key: ${HELIOX_GEMINI_API_KEY ? '✅ Loaded' : '❌ Missing (add to .dev.vars)'}`);
    console.log('');
});

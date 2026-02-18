/**
 * Heliox Grounded Streaming Engine
 * Implements:
 * - Real-time streaming with Google Grounding
 * - Smooth typing effect (ChatGPT-style)
 * - File attachments & context
 * - Full UI Fidelity
 */

// Backend API Setup - Change to your worker URL when deploying
// For streaming, we use /chat/stream; for non-streaming fallback, /chat
const BACKEND_STREAM_URL = 'https://heliox-api.uditraj286.workers.dev/chat/stream';
const BACKEND_CHAT_URL = 'https://heliox-api.uditraj286.workers.dev/chat';
console.log('Backend pointing to:', BACKEND_STREAM_URL);
const CONFIG = {
    // apiKey removed - using backend proxy
    models: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-lite-preview-02-05'],
    model: 'gemini-1.5-flash',

    systemPrompt: `You are Heliox, an advanced AI assistant created by Devreon Devs — built to help **everyone**: coders, professionals, creators, students, teachers, hobbyists, and curious people of all kinds.

## YOUR CORE CAPABILITIES:

### 🎓 KNOWLEDGE & LEARNING (All Subjects)
- **Mathematics:** Solve problems step-by-step (algebra, calculus, geometry, trigonometry, statistics, linear algebra, probability). Show full working with formulas. Use clear notation.
- **Physics:** Explain concepts, solve numerical problems, draw free-body diagrams in text, derive equations.
- **Chemistry:** Balance equations, explain reactions, molecular structures, periodic table concepts, organic chemistry.
- **Biology:** Explain processes (photosynthesis, cell division, genetics), diagrams in text form.
- **History & Social Studies:** Provide detailed timelines, cause-effect analysis, compare movements/events.
- **English & Literature:** Grammar help, essay outlines, literary analysis, writing improvement.
- **Economics:** Supply-demand, macro/micro concepts, solve numerical problems.
- **Computer Science Theory:** Data structures, algorithms, complexity analysis, OS concepts, networking.

### 💻 CODING & PROGRAMMING HELP
- Write clean, well-commented code in any language (Python, JavaScript, Java, C/C++, Rust, Go, TypeScript, etc.)
- Debug code: identify bugs, explain why they occur, provide corrected code.
- Explain concepts: recursion, OOP, async/await, closures, pointers, etc.
- Data Structures & Algorithms: implement and explain with time/space complexity.
- Web Development: HTML, CSS, JS, React, Node.js, databases, APIs.
- Provide complete, runnable code examples — never half-baked snippets.

## RESPONSE FORMATTING RULES:
1. **Always use Markdown** for readability:
   - Use \`code\` for inline code, \`\`\`language for code blocks
   - Use **bold** for key terms, *italics* for emphasis
   - Use ## headings to organize long answers
   - Use numbered lists for step-by-step solutions
   - Use bullet points for features/concepts
2. **Math problems (very important):**
   - Show every step like a human teacher.
   - Use **human maths symbols**, not computer ones:
     - Use × (multiplication), ÷ (division), √ (square root), ≤, ≥, ≠, fractions like \`3/4\` written as \( \dfrac{3}{4} \).
     - Avoid \`*\`, \`/\`, \`**\` for maths unless writing **program code**.
   - Clearly label formulas and box or bold the final answer.
3. **Code:** Always specify the language, add comments, and explain the logic after the code block.
4. **Keep it detailed but readable** — use spacing and short paragraphs.
5. **You are not only for students.** Help with any safe topic: work, life, learning, creativity, and fun projects.
6. **Respect user length limits:** When the user asks for a specific word, sentence, or paragraph limit (for example “in 50 words” or “in 3 short paragraphs”), keep your reply within that limit as closely as possible and never go far over it.

## SAFETY AND LANGUAGE RULES (ALWAYS FOLLOW):
- Never use swear words, slurs, or explicit sexual language — even if the user does.
- Politely refuse and redirect if the user asks for:
  - Harmful, violent, illegal, or self-harm instructions.
  - Explicit adult content.
  - Hate, harassment, or bullying.
- You may briefly explain why you cannot help, then offer a safer alternative or supportive guidance. 

## IDENTITY:
- You are Heliox, not any other AI. Never mention underlying models.
- If asked: "I'm Heliox, a general-purpose AI assistant designed by Devreon Devs to help with coding, maths, creativity, work, and learning."
- Do NOT greet unless greeted first.
- Use emojis 🌟 sparingly, only when being friendly.`
};


// --- Typewriter Engine ---
class Typewriter {
    constructor(element, onComplete) {
        this.element = element;
        this.queue = [];
        this.isTyping = false;
        this.onComplete = onComplete;
        this.typingSpeed = 10; 
        this.currentRaw = '';
    }

    add(text) {
        if (!text) return;
        this.queue.push(...text.split(''));
        if (!this.isTyping) this.process();
    }

    process() {
        if (this.queue.length === 0) {
            this.isTyping = false;
            if (this.onComplete) this.onComplete();
            return;
        }

        this.isTyping = true;
        // Process a chunk of characters to keep up with fast streams
        const chunk = this.queue.splice(0, 3).join(''); 
        this.currentRaw += chunk;
        this.element.innerHTML = parseMarkdown(this.currentRaw);
        
        const container = document.getElementById('messages-container');
        if(container) container.scrollTop = container.scrollHeight;

        setTimeout(() => this.process(), this.typingSpeed);
    }
    
    start(initialText = '') {
        this.currentRaw = initialText;
        this.element.innerHTML = parseMarkdown(this.currentRaw);
    }

    cancel() {
        this.queue = [];
        this.isTyping = false;
        this.onComplete = null;
    }
}

// --- Streaming Client (SSE) ---
class HelioxStreamClient {
    constructor() {
        this.abortController = null;
        this.lastFollowUps = [];
        this.lastSources = [];
    }

    abort() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }

    async *streamChat(history) {
        this.abortController = new AbortController();
        const signal = this.abortController.signal;
        this.lastFollowUps = [];
        this.lastSources = [];

        const userMessage = history[history.length - 1];
        const previousHistory = history.slice(0, -1).map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            content: msg.content
        }));

        const requestBody = {
            message: userMessage.content,
            history: previousHistory,
            systemPrompt: CONFIG.systemPrompt + '\\n\\n## TONE INSTRUCTION:\\n' + (typeof getToneInstruction === 'function' ? getToneInstruction() : 'Respond in a balanced, clear, and helpful tone.')
        };

        try {
            console.log(`📡 Streaming from: ${BACKEND_STREAM_URL}...`);

            const response = await fetch(BACKEND_STREAM_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: signal
            });

            if (!response.ok) {
                let errorMsg = response.statusText;
                try { const e = await response.json(); errorMsg = e.error || errorMsg; } catch(e){}
                throw new Error(errorMsg || `Server error: ${response.status}`);
            }

            // Read SSE stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let allSources = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6).trim();
                        if (!dataStr || dataStr === '[DONE]') continue;

                        try {
                            const chunk = JSON.parse(dataStr);

                            if (chunk.type === 'text' && chunk.content) {
                                yield {
                                    candidates: [{
                                        content: { parts: [{ text: chunk.content }] }
                                    }]
                                };
                            }

                            if (chunk.type === 'done') {
                                if (chunk.sources && chunk.sources.length > 0) {
                                    allSources = chunk.sources;
                                    this.lastSources = allSources;
                                    // Yield grounding metadata
                                    yield {
                                        candidates: [{
                                            content: { parts: [{ text: '' }] },
                                            groundingMetadata: {
                                                groundingChunks: allSources.map(s => ({
                                                    web: { uri: s.url, title: s.title }
                                                }))
                                            }
                                        }]
                                    };
                                }
                                if (chunk.followUps) {
                                    this.lastFollowUps = chunk.followUps;
                                }
                            }

                            if (chunk.type === 'error') {
                                throw new Error(chunk.message || 'Streaming error');
                            }
                        } catch (parseErr) {
                            if (parseErr.message && !parseErr.message.includes('JSON')) throw parseErr;
                            // Skip unparseable SSE chunks
                        }
                    }
                }
            }

            return;

        } catch (error) {
            if (error.name === 'AbortError') throw error;
            console.warn(`⚠️ Stream failed:`, error.message);

            // Fallback to non-streaming /chat endpoint
            console.log('📡 Falling back to non-streaming endpoint...');
            try {
                const fallbackResponse = await fetch(BACKEND_CHAT_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                    signal: signal
                });

                if (!fallbackResponse.ok) {
                    let errorMsg = fallbackResponse.statusText;
                    try { const e = await fallbackResponse.json(); errorMsg = e.error || errorMsg; } catch(e){}
                    throw new Error(errorMsg || `Server error: ${fallbackResponse.status}`);
                }

                const data = await fallbackResponse.json();
                this.lastFollowUps = data.followUps || [];

                yield {
                    candidates: [{
                        content: { parts: [{ text: data.answer }] },
                        groundingMetadata: {
                            groundingChunks: data.sources ? data.sources.map(s => ({
                                web: { uri: s.url, title: s.title }
                            })) : []
                        }
                    }]
                };
                return;
            } catch (fallbackErr) {
                throw fallbackErr;
            }
        }
    }

    async generateSuggestions(history, lastAnswer) {
        if (this.lastFollowUps && this.lastFollowUps.length > 0) {
            const suggestions = this.lastFollowUps;
            this.lastFollowUps = [];
            return suggestions;
        }
        return [];
    }
}

// --- State & Initialization ---
const state = {
    messages: [],
    uploadedFiles: [],
    client: new HelioxStreamClient(),
    isStreaming: false,
    streamStartTime: null
};

document.addEventListener('DOMContentLoaded', () => {
    setupTheme();
    setupEventListeners();
    setupModelSelector();
    setupFileUpload();
    setupVoiceInput();
    setupKeyboardShortcuts();
    setupSearchInChat();
    setupSpotifyPlayer();
    setupShortcutsModal();
    loadHistory();
    setupSpotifyAuthFlow();
});

// --- Core Logic ---

async function handleUserMessage(text) {
    if((!text && state.uploadedFiles.length === 0) || state.isStreaming) return;

    document.getElementById('welcome-view').classList.add('hidden');
    document.getElementById('chat-view').classList.remove('hidden');
    document.querySelectorAll('.smart-suggestions').forEach(el => el.remove());

    // 1. User Message
    const userMsg = { role: 'user', content: text, files: [...state.uploadedFiles] };
    state.messages.push(userMsg);
    state.uploadedFiles = [];
    renderFilesPreview();
    
    // Append User Message to UI without re-rendering everything
    appendMessageHTML(userMsg, state.messages.length - 1);
    scrollToBottom();

    // 2. Assistant Placeholder
    const assistantMsgIndex = state.messages.length;
    const placeholderMsg = { role: 'assistant', content: '', grounding: null, isThinking: true };
    state.messages.push(placeholderMsg);
    
    // Create streaming container
    const msgDiv = createAssistantMessageDiv(assistantMsgIndex);
    document.getElementById('messages-container').appendChild(msgDiv);
    const contentDiv = msgDiv.querySelector('.message-content');
    const thinkingEl = msgDiv.querySelector('.thinking-indicator');
    
    // Mark as streaming & show thinking
    state.isStreaming = true;
    state.streamStartTime = Date.now();
    showStopButton(true);
    
    // 3. Streaming & Typing
    let fullText = '';
    let groundingMetadata = null;
    let firstChunkReceived = false;
    let wasStopped = false;
    
    const typewriter = new Typewriter(contentDiv, async () => {
        // Typing Complete — remove cursor
        msgDiv.classList.remove('typing');
        state.isStreaming = false;
        showStopButton(false);
        
        // Calculate response time
        const responseTime = ((Date.now() - state.streamStartTime) / 1000).toFixed(1);
        const wordCount = fullText.split(/\\s+/).filter(w => w).length;
        
        state.messages[assistantMsgIndex].content = fullText;
        state.messages[assistantMsgIndex].grounding = groundingMetadata;
        state.messages[assistantMsgIndex].isThinking = false;
        state.messages[assistantMsgIndex].responseTime = responseTime;
        state.messages[assistantMsgIndex].wordCount = wordCount;
        state.messages[assistantMsgIndex].wasStopped = wasStopped;

        // Show buttons IMMEDIATELY (no waiting for suggestions)
        updateAssistantMessageUI(msgDiv, assistantMsgIndex, groundingMetadata, fullText, []);
        saveChat();

        // Fetch suggestions ASYNC (non-blocking) and append when ready
        if (!wasStopped && fullText.length > 20) {
            try {
                const history = state.messages.slice(0, assistantMsgIndex);
                const suggestions = await state.client.generateSuggestions(history, fullText);
                if (suggestions && suggestions.length > 0) {
                    state.messages[assistantMsgIndex].followUps = suggestions;
                    // Append suggestions to the existing message (don't re-render entire message)
                    const msgEl = document.getElementById(`msg-${assistantMsgIndex}`) || document.querySelectorAll('.assistant-message')[assistantMsgIndex];
                    if (msgEl) {
                        const existing = msgEl.querySelector('.smart-suggestions');
                        if (existing) existing.remove();
                        const sugDiv = document.createElement('div');
                        sugDiv.className = 'smart-suggestions';
                        sugDiv.innerHTML = suggestions.map(q => `<button class="suggestion-chip" onclick="handleUserMessage('${escapeHTML(q)}')">${escapeHTML(q)}</button>`).join('');
                        msgEl.appendChild(sugDiv);
                    }
                    saveChat();
                }
            } catch (e) { console.warn('Suggestions failed:', e.message); }
        }
    });
    
    typewriter.start('');

    try {
        const history = state.messages.slice(0, -1); // exclude placeholder
        const stream = state.client.streamChat(history);
        
        for await (const chunk of stream) {
            const candidate = chunk.candidates?.[0];
            if (candidate) {
                const textPart = candidate.content?.parts?.[0]?.text;
                if (textPart) {
                    // First chunk: transition from thinking to typing
                    if (!firstChunkReceived) {
                        firstChunkReceived = true;
                        if (thinkingEl) {
                            thinkingEl.classList.add('fade-out');
                            setTimeout(() => thinkingEl.remove(), 300);
                        }
                        contentDiv.style.display = '';
                        msgDiv.classList.add('typing');
                    }
                    fullText += textPart;
                    typewriter.add(textPart);
                }
                if (candidate.groundingMetadata) {
                    groundingMetadata = candidate.groundingMetadata;
                }
            }
        }
    } catch (error) {
        // Check if it was user-initiated abort
        if (error.name === 'AbortError') {
            console.log('⏹️ Stream stopped by user');
            wasStopped = true;
            // Don't show error, just finalize what we have
            if (thinkingEl) thinkingEl.remove();
            contentDiv.style.display = '';
            msgDiv.classList.remove('typing');
            state.isStreaming = false;
            showStopButton(false);
            
            if (fullText) {
                // We have partial content — finalize it
                fullText += '\\n\\n*— Response stopped by user*';
                typewriter.cancel();
                contentDiv.innerHTML = parseMarkdown(fullText);
                state.messages[assistantMsgIndex].content = fullText;
                state.messages[assistantMsgIndex].wasStopped = true;
                state.messages[assistantMsgIndex].isThinking = false;
                updateAssistantMessageUI(msgDiv, assistantMsgIndex, groundingMetadata, fullText, []);
                saveChat();
            } else {
                // No content yet — remove the placeholder
                state.messages.pop();
                msgDiv.closest('div')?.remove() || msgDiv.remove();
            }
            return;
        }
        
        console.error(error);
        if (thinkingEl) thinkingEl.remove();
        contentDiv.style.display = '';
        msgDiv.classList.remove('typing');
        state.isStreaming = false;
        showStopButton(false);
        contentDiv.innerHTML = `<p class="error-text"><strong>Error:</strong> ${escapeHTML(error.message)}</p>`;
        state.messages[assistantMsgIndex].content = `Error: ${error.message}`;
        state.messages[assistantMsgIndex].isError = true;
        saveChat();
    }
}

// Stop streaming function - robust version
function stopStreaming() {
    if (state.isStreaming) {
        console.log('⏹️ Stop button pressed');
        state.client.abort();
        // Immediate visual feedback
        showStopButton(false);
    }
}

// Show/hide stop button (replaces send button during streaming)
function showStopButton(show) {
    ['send-btn', 'chat-send-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;
        
        if (show) {
            btn.classList.add('stop-mode');
            btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;
            btn.title = 'Stop generating';
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); stopStreaming(); };
        } else {
            btn.classList.remove('stop-mode');
            btn.title = 'Send message';
            btn.onclick = null; // Remove stop handler, original handlers remain
            if (id === 'send-btn') {
                btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`;
            } else {
                btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;
            }
        }
    });
}

// --- DOM Generators ---

function appendMessageHTML(msg, index) {
    const container = document.getElementById('messages-container');
    const div = document.createElement('div');
    if (msg.role === 'user') {
        const isSpotifyCommand = typeof msg.content === 'string' && msg.content.trim().toLowerCase().startsWith('@spotify');
        div.innerHTML = `
            <div class="message user-message">
                <div class="message-content">
                    ${msg.files?.map(f => `<img src="${f.preview}" style="max-width:200px; border-radius:8px; margin-bottom:8px; display:block;">`).join('') || ''}
                    ${isSpotifyCommand
                        ? `<span class="spotify-mention" style="display:inline-flex;align-items:center;gap:4px;margin-right:6px;">
                                <img src="${SPOTIFY_LOGO_URL}" alt="Spotify" style="width:14px;height:14px;border-radius:999px;object-fit:cover;">
                                <span>@spotify</span>
                           </span>${escapeHTML(msg.content.replace(/^@spotify/i, '').trim())}`
                        : escapeHTML(msg.content)}
                </div>
            </div>`;
    } else {
        div.innerHTML = createCompleteAssistantHTML(msg, index);
    }
    container.appendChild(div);
}

function createAssistantMessageDiv(index) {
    const div = document.createElement('div');
    div.innerHTML = `
        <div class="message assistant-message" id="msg-${index}">
            <div class="thinking-indicator">
                <div class="thinking-header">
                    <div class="thinking-sparkle">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="currentColor" opacity="0.9"/>
                            <path d="M19 14L19.75 16.25L22 17L19.75 17.75L19 20L18.25 17.75L16 17L18.25 16.25L19 14Z" fill="currentColor" opacity="0.6"/>
                            <path d="M5 2L5.5 3.5L7 4L5.5 4.5L5 6L4.5 4.5L3 4L4.5 3.5L5 2Z" fill="currentColor" opacity="0.4"/>
                        </svg>
                    </div>
                    <span class="thinking-text">Thinking</span>
                    <div class="typing-dots">
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                    </div>
                </div>
                <div class="thinking-shimmer">
                    <div class="shimmer-line" style="width: 85%"></div>
                    <div class="shimmer-line" style="width: 65%"></div>
                    <div class="shimmer-line" style="width: 75%"></div>
                </div>
            </div>
            <div class="message-content" style="display:none;"></div>
        </div>
    `;
    const el = div.firstElementChild;
    const indicator = el.querySelector('.thinking-indicator');
    if (indicator) {
        // Clicking anywhere on the thinking/typing area will also stop the response
        indicator.addEventListener('click', () => {
            if (state.isStreaming) {
                stopStreaming();
            }
        });
    }
    return el;
}

function updateAssistantMessageUI(msgElement, index, grounding, text, followUps) {
    const msg = state.messages[index] || {};
    const completeHTML = createCompleteAssistantHTML({
        role: 'assistant',
        content: text,
        grounding: grounding,
        followUps: followUps,
        isThinking: false,
        responseTime: msg.responseTime,
        wordCount: msg.wordCount,
        wasStopped: msg.wasStopped
    }, index);
    
    msgElement.outerHTML = completeHTML;
    setupActionListeners();
    setupCodeCanvasButtons();
    scrollToBottom();
}

function createCompleteAssistantHTML(msg, index) {
    if (msg.isThinking) return `<div class="message assistant-message"><div class="message-content"><em>Heliox is typing...</em></div></div>`;

    const groundingChunks = msg.grounding?.groundingChunks?.filter(c => c.web?.uri) || [];
    const sourceCount = groundingChunks.length;
    const uniqueSources = [...new Map(groundingChunks.map(c => [c.web.uri, c.web])).values()];

    const tabs = `
        <div class="response-tabs">
            <button class="response-tab active" data-tab="assistant"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> Assistant</button>
            <button class="response-tab" data-tab="links"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg> Links${sourceCount > 0 ? ` <span class="tab-badge">${sourceCount}</span>` : ''}</button>
            <button class="response-tab" data-tab="images"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg> Images</button>
        </div>`;

    // Tab content panels
    const assistantPanel = `<div class="tab-panel active" data-panel="assistant">
        <div class="message-content">${parseMarkdown(msg.content)}</div>
    </div>`;

    const linksPanel = `<div class="tab-panel" data-panel="links">
        ${uniqueSources.length > 0 ? `
            <div class="links-grid">
                ${uniqueSources.map((w, i) => {
                    const hostname = new URL(w.uri).hostname;
                    const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
                    return `
                    <a href="${w.uri}" class="source-card" target="_blank" rel="noopener">
                        <div class="source-card-header">
                            <img src="${faviconUrl}" alt="" class="source-favicon" onerror="this.style.display='none'">
                            <span class="source-card-domain">${hostname}</span>
                            <span class="source-card-index">${i + 1}</span>
                        </div>
                        <div class="source-card-title">${escapeHTML(w.title)}</div>
                        <div class="source-card-url">${w.uri.length > 60 ? w.uri.substring(0, 60) + '...' : w.uri}</div>
                    </a>`;
                }).join('')}
            </div>
        ` : '<p class="empty-tab">No links found for this response.</p>'}
    </div>`;

    const imagesPanel = `<div class="tab-panel" data-panel="images">
        <p class="empty-tab">No images available for this response.</p>
    </div>`;

    // Response stats
    const statsHTML = (msg.responseTime || msg.wordCount) ? `
        <div class="response-stats">
            ${msg.responseTime ? `<span class="stat-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${msg.responseTime}s</span>` : ''}\
            ${msg.wordCount ? `<span class="stat-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> ${msg.wordCount} words</span>` : ''}\
            ${msg.wasStopped ? `<span class="stat-item stat-stopped"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg> Stopped</span>` : ''}\
        </div>` : '';

    const actions = `
        <div class="message-actions">
            <button class="action-btn share-btn" title="Share">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            </button>
            <button class="action-btn copy-btn" title="Copy">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button class="action-btn regenerate-btn" data-index="${index}" title="Regenerate">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            </button>
            ${sourceCount > 0 ? `<button class="sources-badge" data-index="${index}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/></svg> ${sourceCount} sources</button>` : ''}
            <div class="feedback-btns">
                <button class="feedback-btn like-btn" title="Good response">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
                </button>
                <button class="feedback-btn dislike-btn" title="Bad response">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path></svg>
                </button>
            </div>
        </div>`;

    const suggestions = (msg.followUps && msg.followUps.length) ? `
        <div class="smart-suggestions">
            ${msg.followUps.map(q => `<button class="suggestion-chip" onclick="handleUserMessage('${escapeHTML(q)}')">${escapeHTML(q)}</button>`).join('')}
        </div>` : '';

    return `
        <div class="message assistant-message" id="msg-${index}">
            ${tabs}
            ${assistantPanel}
            ${linksPanel}
            ${imagesPanel}
            ${statsHTML}
            ${actions}
            ${suggestions}
        </div>
    `;
}


// --- Utils (Copied) ---
function scrollToBottom() { const c = document.getElementById('messages-container'); if(c) c.scrollTop = c.scrollHeight; }
function escapeHTML(str) { return str ? str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]) : ''; }
function parseMarkdown(text) { 
    if (!text) return '';
    let html = escapeHTML(text);
    // Code blocks with syntax highlighting — Production Code Canvas
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
        const langLabel = lang || 'plaintext';
        const codeId = 'code-' + Math.random().toString(36).substr(2, 9);
        const rawCode = code.trim();
        const lines = rawCode.split('\n');
        const lineCount = lines.length;
        const lineNumbers = lines.map((_, i) => `<span class="canvas-line-num">${i + 1}</span>`).join('');
        const extMap = { python: 'py', javascript: 'js', typescript: 'ts', java: 'java', cpp: 'cpp', c: 'c', html: 'html', css: 'css', go: 'go', rust: 'rs', ruby: 'rb', php: 'php', sql: 'sql', bash: 'sh', shell: 'sh', json: 'json', yaml: 'yml', xml: 'xml', swift: 'swift', kotlin: 'kt', csharp: 'cs', r: 'r', dart: 'dart', lua: 'lua', perl: 'pl', scala: 'scala', jsx: 'jsx', tsx: 'tsx', vue: 'vue', markdown: 'md', plaintext: 'txt' };
        const ext = extMap[langLabel.toLowerCase()] || 'txt';
        const fileName = `code.${ext}`;
        
        // Queue syntax highlighting
        setTimeout(() => {
            const el = document.getElementById(codeId);
            if (el && typeof hljs !== 'undefined') hljs.highlightElement(el);
        }, 0);

        return `<div class="inline-canvas" data-code-id="${codeId}" data-lang="${langLabel}">
            <div class="canvas-header">
                <div class="canvas-header-left">
                    <div class="canvas-dots"><div class="canvas-dot red"></div><div class="canvas-dot yellow"></div><div class="canvas-dot green"></div></div>
                    <div class="canvas-tab">
                        <span class="canvas-filename">${fileName}</span>
                        <span class="canvas-lang-badge">${langLabel.toUpperCase()}</span>
                    </div>\
                    <span class="canvas-line-info">${lineCount} line${lineCount !== 1 ? 's' : ''}</span>
                </div>
                <div class="canvas-header-right">
                    <button class="canvas-action-btn canvas-copy-inline-btn" data-code-id="${codeId}" title="Copy code">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        <span>Copy</span>
                    </button>
                    <button class="canvas-action-btn canvas-download-inline-btn" data-code-id="${codeId}" data-lang="${langLabel}" title="Download file">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        <span>Download</span>
                    </button>
                    <button class="canvas-action-btn canvas-expand-inline-btn" data-code-id="${codeId}" data-lang="${langLabel}" title="Expand fullscreen">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                        <span>Expand</span>
                    </button>
                </div>
            </div>
            <div class="canvas-body">
                <div class="canvas-line-numbers">${lineNumbers}</div>
                <pre class="canvas-code"><code id="${codeId}" class="language-${langLabel}">${escapeHTML(rawCode)}</code></pre>
            </div>
            <div id="${codeId}-raw" style="display:none">${rawCode}</div>
        </div>`;
    });
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    // Headings
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    // Bold and italic
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Horizontal rule
    html = html.replace(/^---$/gm, '<hr>');
    // Unordered list items
    html = html.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>');
    // Ordered list items
    html = html.replace(/^\s*\d+\.\s+(.+)$/gm, '<li>$1</li>');
    // Wrap consecutive <li> in <ul>
    html = html.replace(/(<li>.*?<\/li>)(\s*<li>.*?<\/li>)*/gs, (match) => `<ul>${match}</ul>`);
    // Paragraphs (double newlines)
    html = html.replace(/\n\n/g, '</p><p>');
    // Single newlines become <br>
    html = html.replace(/\n/g, '<br>');
    return `<p>${html}</p>`;
}

// Code copy helper — inline canvas copy button
window.copyCodeBlock = function(codeId) {
    const rawEl = document.getElementById(codeId + '-raw') || document.getElementById(codeId);
    if (!rawEl) return;
    const text = rawEl.innerText || rawEl.textContent;
    navigator.clipboard.writeText(text).then(() => {
        // Find the matching copy button
        const btn = document.querySelector(`.canvas-copy-inline-btn[data-code-id="${codeId}"]`);
        if (btn) {
            const origHTML = btn.innerHTML;
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> <span>Copied!</span>';
            btn.style.color = '#2dd4bf';
            setTimeout(() => { btn.innerHTML = origHTML; btn.style.color = ''; }, 2000);
        }
    });
};

// Setup Code Canvas buttons (called after message is rendered)
function setupCodeCanvasButtons() {
    // Copy buttons
    document.querySelectorAll('.canvas-copy-inline-btn:not([data-bound])').forEach(btn => {
        btn.setAttribute('data-bound', 'true');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const codeId = btn.dataset.codeId;
            copyCodeBlock(codeId);
        });
    });

    // Download buttons
    document.querySelectorAll('.canvas-download-inline-btn:not([data-bound])').forEach(btn => {
        btn.setAttribute('data-bound', 'true');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const codeId = btn.dataset.codeId;
            const lang = btn.dataset.lang;
            downloadCodeBlock(codeId, lang);
        });
    });

    // Expand/Fullscreen buttons
    document.querySelectorAll('.canvas-expand-inline-btn:not([data-bound])').forEach(btn => {
        btn.setAttribute('data-bound', 'true');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const codeId = btn.dataset.codeId;
            const lang = btn.dataset.lang;
            openCodeCanvas(codeId, lang);
        });
    });
}

// Code download helper
window.downloadCodeBlock = function(codeId, lang) {
    const rawEl = document.getElementById(codeId + '-raw');
    const codeEl = document.getElementById(codeId);
    const text = rawEl ? (rawEl.textContent || rawEl.innerText) : (codeEl ? codeEl.innerText : '');
    if (!text) return;
    const extMap = { python: 'py', javascript: 'js', typescript: 'ts', java: 'java', cpp: 'cpp', c: 'c', html: 'html', css: 'css', go: 'go', rust: 'rs', ruby: 'rb', php: 'php', swift: 'swift', kotlin: 'kt', sql: 'sql', bash: 'sh', shell: 'sh', json: 'json', xml: 'xml', yaml: 'yml', csharp: 'cs', r: 'r', dart: 'dart', lua: 'lua', perl: 'pl', scala: 'scala', jsx: 'jsx', tsx: 'tsx', markdown: 'md' };
    const ext = extMap[lang?.toLowerCase()] || 'txt';
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `heliox-code.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
};

// === CODE CANVAS SYSTEM - ChatGPT Style Side Panel ===
window.openCodeCanvas = function(codeId, lang) {
    const codeEl = document.getElementById(codeId);
    if (!codeEl) return;
    const code = codeEl.innerText;
    
    // Remove existing canvas if any
    document.getElementById('code-canvas-overlay')?.remove();

    const lines = code.split('\n');
    const lineNumbers = lines.map((_, i) => `<span class="canvas-line-num">${i + 1}</span>`).join('');
    const extMap = { python: 'py', javascript: 'js', typescript: 'ts', java: 'java', cpp: 'cpp', c: 'c', html: 'html', css: 'css', go: 'go', rust: 'rs', ruby: 'rb', php: 'php', sql: 'sql', bash: 'sh', json: 'json', yaml: 'yml' };
    const ext = extMap[lang?.toLowerCase()] || 'txt';
    const fileName = `code.${ext}`;
    const charCount = code.length;
    const wordCount = code.split(/\s+/).filter(Boolean).length;
    
    const overlay = document.createElement('div');
    overlay.id = 'code-canvas-overlay';
    overlay.className = 'code-canvas-overlay';
    overlay.innerHTML = `
        <div class="code-canvas-panel">
            <div class="canvas-header">
                <div class="canvas-header-left">
                    <div class="canvas-dots">
                        <div class="canvas-dot red"></div>
                        <div class="canvas-dot yellow"></div>
                        <div class="canvas-dot green"></div>
                    </div>
                    <div class="canvas-tab">
                        <span class="canvas-filename">${fileName}</span>
                        <span class="canvas-lang-badge">${(lang || 'code').toUpperCase()}</span>
                    </div>
                    <span class="canvas-line-info">${lines.length} lines</span>
                </div>
                <div class="canvas-header-right">
                    <button class="canvas-action-btn" id="canvas-copy-btn" title="Copy all">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        <span>Copy</span>
                    </button>
                    <button class="canvas-action-btn" id="canvas-download-btn" title="Download file">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        <span>Download</span>
                    </button>
                    <button class="canvas-action-btn canvas-close-btn" id="canvas-close-btn" title="Close canvas">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            </div>
            <div class="canvas-body">
                <div class="canvas-line-numbers">${lineNumbers}</div>
                <pre class="canvas-code"><code class="language-${lang || 'plaintext'}">${escapeHTML(code)}</code></pre>
            </div>
            <div class="canvas-footer">
                <div class="canvas-footer-left">
                    <span class="canvas-footer-item">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        ${fileName}
                    </span>
                    <span class="canvas-footer-item">${(lang || 'plaintext').toUpperCase()}</span>
                </div>
                <div class="canvas-footer-right">
                    <span class="canvas-footer-item">Ln ${lines.length}, Col 1</span>
                    <span class="canvas-footer-item">${charCount} chars</span>
                    <span class="canvas-footer-item">${wordCount} words</span>
                    <span class="canvas-footer-item">UTF-8</span>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    
    // Apply syntax highlighting
    if (typeof hljs !== 'undefined') {
        const codeBlock = overlay.querySelector('.canvas-code code');
        if (codeBlock) hljs.highlightElement(codeBlock);
    }
    
    // Animate in
    requestAnimationFrame(() => overlay.classList.add('active'));

    // Canvas actions
    document.getElementById('canvas-close-btn').onclick = () => closeCodeCanvas();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeCodeCanvas(); });
    document.addEventListener('keydown', canvasEscHandler);
    
    document.getElementById('canvas-copy-btn').onclick = () => {
        navigator.clipboard.writeText(code).then(() => {
            const btn = document.getElementById('canvas-copy-btn');
            btn.classList.add('canvas-copy-done');
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> <span>Copied!</span>';
            setTimeout(() => { 
                btn.classList.remove('canvas-copy-done');
                btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> <span>Copy</span>'; 
            }, 2000);
        });
    };
    
    document.getElementById('canvas-download-btn').onclick = () => downloadCodeBlock(codeId, lang);
};

function canvasEscHandler(e) {
    if (e.key === 'Escape') closeCodeCanvas();
}

function closeCodeCanvas() {
    const overlay = document.getElementById('code-canvas-overlay');
    if (!overlay) return;
    overlay.classList.remove('active');
    document.removeEventListener('keydown', canvasEscHandler);
    setTimeout(() => overlay.remove(), 400);
}


function setupTheme() {
    // Force old dark mode by default, no toggle.
    document.body.classList.add('dark');
}
// Handle send with @spotify command detection
function handleSend(inputEl) {
    if (!inputEl) return;
    const text = inputEl.value.trim();
    if (!text && state.uploadedFiles.length === 0) return;
    inputEl.value = '';
    inputEl.style.height = 'auto';
    
    // Check for @spotify command
    const spotifyMatch = text.match(/^@spotify\\s+(.+)/i);
    if (spotifyMatch) {
        handleSpotifyCommand(spotifyMatch[1].trim());
        return;
    }
    
    handleUserMessage(text);
}

function setupEventListeners() {
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarClose = document.getElementById('sidebar-close');
    if (sidebarToggle && sidebar) {
        const updateIcons = () => {
            const isCollapsed = sidebar.classList.contains('collapsed');
            sidebarToggle.innerHTML = isCollapsed
                ? `<svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\">
                        <line x1=\"3\" y1=\"6\" x2=\"21\" y2=\"6\"></line>
                        <line x1=\"3\" y1=\"12\" x2=\"21\" y2=\"12\"></line>\
                        <line x1=\"3\" y1=\"18\" x2=\"21\" y2=\"18\"></line>
                   </svg>`
                : `<svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\">
                        <line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"></line>
                        <line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"></line>
                   </svg>`;

            // Show the floating close icon only when sidebar is open (and on small screens)
            if (sidebarClose) {
                const isMobile = window.matchMedia('(max-width: 768px)').matches;
                sidebarClose.style.display = !isCollapsed && isMobile ? 'inline-flex' : 'none';
            }
        };
        updateIcons();

        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            updateIcons();
        });

        if (sidebarClose) {
            sidebarClose.addEventListener('click', () => {
                sidebar.classList.add('collapsed');
                updateIcons();
            });
        }
    }
    ['message-input', 'chat-message-input'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(el); } });
            el.addEventListener('input', () => { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 150) + 'px'; });
        }
    });
}

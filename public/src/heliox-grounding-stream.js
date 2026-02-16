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
const BACKEND_STREAM_URL = 'http://localhost:8787/chat/stream';
const BACKEND_CHAT_URL = 'http://localhost:8787/chat';
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

### ðŸ’» CODING & PROGRAMMING HELP
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
            systemPrompt: CONFIG.systemPrompt + '\n\n## TONE INSTRUCTION:\n' + (typeof getToneInstruction === 'function' ? getToneInstruction() : 'Respond in a balanced, clear, and helpful tone.')
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
                const lines = buffer.split('\n');
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
        const wordCount = fullText.split(/\s+/).filter(w => w).length;
        
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
            console.log('â¹ï¸ Stream stopped by user');
            wasStopped = true;
            // Don't show error, just finalize what we have
            if (thinkingEl) thinkingEl.remove();
            contentDiv.style.display = '';
            msgDiv.classList.remove('typing');
            state.isStreaming = false;
            showStopButton(false);
            
            if (fullText) {
                // We have partial content — finalize it
                fullText += '\n\n*— Response stopped by user*';
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
        console.log('â¹ï¸ Stop button pressed');
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
            ${msg.responseTime ? `<span class="stat-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${msg.responseTime}s</span>` : ''}
            ${msg.wordCount ? `<span class="stat-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> ${msg.wordCount} words</span>` : ''}
            ${msg.wasStopped ? `<span class="stat-item stat-stopped"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg> Stopped</span>` : ''}
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
                    </div>
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
    const spotifyMatch = text.match(/^@spotify\s+(.+)/i);
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
                ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                   </svg>`
                : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
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
    ['send-btn', 'chat-send-btn'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', (e) => {
            if (document.getElementById(id).classList.contains('stop-mode')) return;
            const inputId = id === 'send-btn' ? 'message-input' : 'chat-message-input';
            handleSend(document.getElementById(inputId));
        });
    });
    // History panel
    document.getElementById('history-btn')?.addEventListener('click', () => {
        const panel = document.getElementById('history-panel');
        panel?.classList.toggle('hidden');
        if (!panel?.classList.contains('hidden')) renderHistoryPanel();
    });
    document.getElementById('close-history')?.addEventListener('click', () => document.getElementById('history-panel')?.classList.add('hidden'));
    document.getElementById('clear-history-btn')?.addEventListener('click', () => {
        if (confirm('Clear all chat history?')) {
            localStorage.removeItem('heliox_chats');
            localStorage.removeItem('heliox_history');
            startNewChat();
            renderHistoryPanel();
        }
    });
    document.getElementById('new-chat-btn')?.addEventListener('click', startNewChat);
    document.getElementById('download-chat-btn')?.addEventListener('click', downloadChat);
    document.querySelectorAll('.quick-action-btn').forEach(btn => btn.addEventListener('click', () => handleUserMessage(btn.dataset.prompt)));

    // Sidebar navigation
    document.getElementById('discover-btn')?.addEventListener('click', () => showSidebarToast('Discover feature coming soon!'));
    document.getElementById('spaces-btn')?.addEventListener('click', () => showSidebarToast('Spaces feature coming soon!'));
    document.getElementById('more-btn')?.addEventListener('click', () => showSidebarToast('More options coming soon!'));
    
    // Spotify toggle
    document.getElementById('spotify-toggle-btn')?.addEventListener('click', () => {
        const player = document.getElementById('spotify-player');
        if (player) player.classList.toggle('hidden');
    });

    // Profile panel toggle (handled by heliox-auth.js setupAuthListeners)
    // Profile settings
    document.getElementById('theme-toggle-profile')?.addEventListener('click', () => {
        document.body.classList.toggle('dark');
        localStorage.setItem('heliox_theme', document.body.classList.contains('dark') ? 'dark' : 'light');
    });
    document.getElementById('clear-chats-profile')?.addEventListener('click', () => {
        if (confirm('Clear all chat history?')) {
            localStorage.removeItem('heliox_chats');
            localStorage.removeItem('heliox_history');
            startNewChat();
            renderHistoryPanel();
            document.getElementById('profile-panel')?.classList.add('hidden');
        }
    });

    // Quick action buttons
    document.querySelectorAll('.quick-action-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const prompt = btn.dataset.prompt;
            if (prompt) handleUserMessage(prompt);
        });
    });

    // Profile photo upload
    const avatarFileInput = document.getElementById('avatar-file-input');
    document.getElementById('profile-avatar-wrapper')?.addEventListener('click', () => avatarFileInput?.click());
    document.getElementById('change-photo-btn')?.addEventListener('click', () => avatarFileInput?.click());
    avatarFileInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { alert('Image must be under 2MB'); return; }
        const reader = new FileReader();
        reader.onload = (evt) => {
            const dataUrl = evt.target.result;
            // Save to localStorage
            localStorage.setItem('heliox_avatar', dataUrl);
            // Update profile panel avatar
            const img = document.getElementById('profile-avatar-img');
            const fallback = document.getElementById('profile-avatar-fallback');
            if (img) { img.src = dataUrl; img.style.display = 'block'; }
            if (fallback) fallback.style.display = 'none';
            // Update sidebar avatar
            const sidebarAvatar = document.getElementById('user-avatar');
            if (sidebarAvatar) sidebarAvatar.innerHTML = `<img src="${dataUrl}" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">`;
        };
        reader.readAsDataURL(file);
    });
}
function setupModelSelector() {
    ['model-selector-btn', 'chat-model-selector-btn'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdownId = id === 'model-selector-btn' ? 'model-dropdown' : 'chat-model-dropdown';
            document.getElementById(dropdownId)?.classList.toggle('show');
    });
    });
    // Only allow selecting non-disabled models (e.g. prevent choosing GPT-5.2 while it's "Coming Soon")
    document.querySelectorAll('.model-option:not(.disabled)').forEach(opt => {
        opt.addEventListener('click', () => {
            const labelEl = opt.querySelector('.model-name');
            const modelLabel = labelEl ? labelEl.textContent : opt.textContent.trim();
            document.querySelectorAll('span[id$="model-name"]').forEach(el => {
                el.textContent = modelLabel;
            });
            document.querySelectorAll('.model-dropdown').forEach(d => d.classList.remove('show'));
        });
    });
    document.addEventListener('click', () => {
        document.querySelectorAll('.model-dropdown').forEach(d => d.classList.remove('show'));
    });
}
function setupFileUpload() {
    const fileInput = document.getElementById('file-input');
    ['attach-btn', 'chat-attach-btn'].forEach(id => document.getElementById(id)?.addEventListener('click', () => fileInput?.click()));
    fileInput?.addEventListener('change', (e) => {
        Array.from(e.target.files).forEach(file => {
            if (file.size > 10 * 1024 * 1024) return alert('File too large');
            const reader = new FileReader();
            reader.onload = (evt) => {
                state.uploadedFiles.push({ name: file.name, type: file.type, base64: evt.target.result.split(',')[1], preview: evt.target.result });
                renderFilesPreview();
            };
            reader.readAsDataURL(file);
        });
        fileInput.value = '';
    });
}
function renderFilesPreview() {
    // Render to both preview areas
    ['files-preview', 'chat-files-preview'].forEach(containerId => {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (state.uploadedFiles.length === 0) { 
            container.classList.add('hidden'); 
            container.innerHTML = ''; 
            return; 
        }
        container.classList.remove('hidden');
        container.innerHTML = state.uploadedFiles.map((f, i) => {
            if (f.type.startsWith('image')) {
                return `<div class="file-preview-item image-preview">
                    <img src="${f.preview}" alt="${escapeHTML(f.name)}" class="preview-thumb">
                    <div class="preview-info">
                        <span class="preview-name">${escapeHTML(f.name.length > 20 ? f.name.substring(0, 17) + '...' : f.name)}</span>
                        <span class="preview-size">${f.type.split('/')[1]?.toUpperCase() || 'IMAGE'}</span>
                    </div>
                    <button class="preview-remove" onclick="removeFile(${i})" aria-label="Remove">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>`;
            } else {
                return `<div class="file-preview-item doc-preview">
                    <div class="preview-doc-icon">ðŸ“„</div>
                    <div class="preview-info">
                        <span class="preview-name">${escapeHTML(f.name.length > 20 ? f.name.substring(0, 17) + '...' : f.name)}</span>
                        <span class="preview-size">${f.type.split('/')[1]?.toUpperCase() || 'FILE'}</span>
                    </div>
                    <button class="preview-remove" onclick="removeFile(${i})" aria-label="Remove">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>`;
            }
        }).join('');
    });
}
window.removeFile = (index) => { state.uploadedFiles.splice(index, 1); renderFilesPreview(); };

function setupVoiceInput() {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) return;
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;
    
    let isRecording = false;
    let audioContext = null;
    let analyser = null;
    let micStream = null;
    let animFrameId = null;
    let recordingTimer = null;
    let recordingSeconds = 0;
    let activeOverlay = null;
    
    function createRecordingOverlay(btn) {
        // Remove any existing overlay
        removeRecordingOverlay();
        
        const overlay = document.createElement('div');
        overlay.className = 'voice-recording-overlay';
        overlay.innerHTML = `
            <div class="voice-recording-content">
                <div class="recording-pulse-ring"></div>
                <div class="recording-visualizer">
                    ${Array(24).fill(0).map(() => '<div class="freq-bar"></div>').join('')}
                </div>
                <div class="recording-info">
                    <div class="recording-label">
                        <span class="recording-dot"></span>
                        <span>Listening...</span>
                    </div>
                    <div class="recording-time">0:00</div>
                </div>
                <div class="recording-transcript" id="live-transcript"></div>
                <button class="recording-stop-btn" id="stop-recording-btn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="6" width="12" height="12" rx="2"></rect>
                    </svg>
                    <span>Stop</span>
                </button>
            </div>
        `;
        document.body.appendChild(overlay);
        
        // Animate in
        requestAnimationFrame(() => overlay.classList.add('active'));
        
        // Stop button
        overlay.querySelector('#stop-recording-btn').addEventListener('click', () => stopRecording());
        
        activeOverlay = overlay;
        return overlay;
    }
    
    function removeRecordingOverlay() {
        if (activeOverlay) {
            activeOverlay.classList.remove('active');
            setTimeout(() => activeOverlay?.remove(), 300);
            activeOverlay = null;
        }
    }
    
    function startVisualization() {
        if (!analyser || !activeOverlay) return;
        const bars = activeOverlay.querySelectorAll('.freq-bar');
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        function draw() {
            analyser.getByteFrequencyData(dataArray);
            
            const step = Math.floor(dataArray.length / bars.length);
            bars.forEach((bar, i) => {
                const value = dataArray[i * step] || 0;
                const height = Math.max(4, (value / 255) * 48);
                bar.style.height = height + 'px';
            });
            
            animFrameId = requestAnimationFrame(draw);
        }
        draw();
    }
    
    function startTimer() {
        recordingSeconds = 0;
        recordingTimer = setInterval(() => {
            recordingSeconds++;
            const mins = Math.floor(recordingSeconds / 60);
            const secs = recordingSeconds % 60;
            const timeEl = activeOverlay?.querySelector('.recording-time');
            if (timeEl) timeEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        }, 1000);
    }
    
    async function startRecording(btn) {
        try {
            // Get mic stream for visualizer
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(micStream);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 128;
            analyser.smoothingTimeConstant = 0.8;
            source.connect(analyser);
            
            // Create overlay
            createRecordingOverlay(btn);
            
            // Start visualizer + timer
            startVisualization();
            startTimer();
            
            // Start speech recognition
            recognition.start();
            isRecording = true;
            
            // Update mic buttons
            document.querySelectorAll('#voice-btn, #chat-voice-btn').forEach(b => b.classList.add('recording'));
            
        } catch(e) {
            console.error('Mic access failed:', e);
            showSidebarToast('Microphone access denied');
        }
    }
    
    function stopRecording() {
        isRecording = false;
        
        // Stop speech recognition
        try { recognition.stop(); } catch(e) {}
        
        // Stop visualizer
        if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
        
        // Stop timer
        if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
        
        // Close audio
        if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
        if (audioContext) { audioContext.close(); audioContext = null; }
        
        // Remove overlay
        removeRecordingOverlay();
        
        // Reset buttons
        document.querySelectorAll('#voice-btn, #chat-voice-btn').forEach(b => b.classList.remove('recording'));
    }
    
    // Attach to both voice buttons
    ['voice-btn', 'chat-voice-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', () => {
            if (isRecording) {
                stopRecording();
            } else {
                startRecording(btn);
            }
        });
    });
    
    // Speech recognition events
    recognition.onresult = (e) => {
        let interimText = '';
        let finalText = '';
        
        for (let i = e.resultIndex; i < e.results.length; i++) {
            const transcript = e.results[i][0].transcript;
            if (e.results[i].isFinal) {
                finalText += transcript;
            } else {
                interimText += transcript;
            }
        }
        
        // Show live transcript
        const liveEl = activeOverlay?.querySelector('#live-transcript');
        if (liveEl) {
            liveEl.textContent = interimText || finalText;
            liveEl.classList.toggle('final', !!finalText);
        }
        
        if (finalText) {
            const target = !document.getElementById('chat-view').classList.contains('hidden') 
                ? document.getElementById('chat-message-input') 
                : document.getElementById('message-input');
            if (target) { 
                target.value += (target.value ? ' ' : '') + finalText; 
                target.focus(); 
            }
        }
    };
    
    recognition.onend = () => {
        if (isRecording) {
            stopRecording();
        }
    };
    
    recognition.onerror = (e) => {
        console.error('Speech error:', e.error);
        stopRecording();
        if (e.error === 'not-allowed') {
            showSidebarToast('Microphone access denied');
        }
    };
}
function startNewChat() {
    // Save current chat before starting new one
    if (state.messages.length > 0) saveChat();
    state.messages = [];
    state.uploadedFiles = [];
    state.currentChatId = 'chat_' + Date.now();
    document.getElementById('messages-container').innerHTML = '';
    document.getElementById('welcome-view').classList.remove('hidden');
    document.getElementById('chat-view').classList.add('hidden');
    document.getElementById('chat-title').textContent = 'New Chat';
    renderFilesPreview();
}

function saveChat() {
    // Save current messages to local storage
    localStorage.setItem('heliox_history', JSON.stringify(state.messages));
    
    // Also save to multi-chat storage
    if (state.messages.length > 0) {
        const chats = JSON.parse(localStorage.getItem('heliox_chats') || '[]');
        const firstUserMsg = state.messages.find(m => m.role === 'user');
        const title = firstUserMsg ? firstUserMsg.content.slice(0, 40) + (firstUserMsg.content.length > 40 ? '...' : '') : 'New Chat';
        const chatId = state.currentChatId || 'chat_' + Date.now();
        
        const existingIdx = chats.findIndex(c => c.id === chatId);
        const chatData = {
            id: chatId,
            title: title,
            messages: state.messages,
            timestamp: Date.now()
        };
        
        if (existingIdx >= 0) {
            chats[existingIdx] = chatData;
        } else {
            chats.unshift(chatData);
        }
        
        localStorage.setItem('heliox_chats', JSON.stringify(chats.slice(0, 50)));
        state.currentChatId = chatId;
    }
}

function loadHistory() {
    // Always start with a fresh new chat on page reopen
    // Previous chats are preserved in storage and accessible via History panel
    state.currentChatId = 'chat_' + Date.now();
    state.messages = [];
    document.getElementById('messages-container').innerHTML = '';
    document.getElementById('welcome-view').classList.remove('hidden');
    document.getElementById('chat-view').classList.add('hidden');
    document.getElementById('chat-title').textContent = 'New Chat';
}

function loadChatById(chatId) {
    const chats = JSON.parse(localStorage.getItem('heliox_chats') || '[]');
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    
    state.currentChatId = chat.id;
    state.messages = chat.messages || [];
    
    document.getElementById('messages-container').innerHTML = '';
    state.messages.forEach((m, i) => appendMessageHTML(m, i));
    document.getElementById('welcome-view').classList.add('hidden');
    document.getElementById('chat-view').classList.remove('hidden');
    document.getElementById('chat-title').textContent = chat.title || 'Chat';
    document.getElementById('history-panel')?.classList.add('hidden');
    
    scrollToBottom();
    setupActionListeners();
    
    // Update active history to this chat
    localStorage.setItem('heliox_history', JSON.stringify(state.messages));
}

function deleteChatById(chatId) {
    let chats = JSON.parse(localStorage.getItem('heliox_chats') || '[]');
    chats = chats.filter(c => c.id !== chatId);
    localStorage.setItem('heliox_chats', JSON.stringify(chats));
    if (state.currentChatId === chatId) startNewChat();
    renderHistoryPanel();
}

function renderHistoryPanel() {
    const chats = JSON.parse(localStorage.getItem('heliox_chats') || '[]');
    const list = document.getElementById('history-list');
    if (!list) return;
    
    if (chats.length === 0) {
        list.innerHTML = '<p class="history-empty">No chat history yet</p>';
        return;
    }
    
    list.innerHTML = chats.map(chat => {
        const date = new Date(chat.timestamp);
        const timeStr = formatDate(date.getTime());
        return `
            <div class="history-item" data-id="${escapeHTML(chat.id)}">
                <span class="history-title">${escapeHTML(chat.title || 'New Chat')}</span>
                <span class="history-date">${timeStr}</span>
                <button class="delete-chat-btn" data-id="${escapeHTML(chat.id)}" aria-label="Delete">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        `;
    }).join('');
    
    // Click to load chat
    list.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.delete-chat-btn')) {
                loadChatById(item.dataset.id);
            }
        });
    });
    
    // Delete button
    list.querySelectorAll('.delete-chat-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteChatById(btn.dataset.id);
        });
    });
}

function formatDate(timestamp) {
    const diff = Date.now() - timestamp;
    if (diff < 86400000) return 'Today';
    if (diff < 172800000) return 'Yesterday';
    return new Date(timestamp).toLocaleDateString();
}

function downloadChat() {
    if (!state.messages.length) return;
    let content = `Heliox Chat — ${new Date().toLocaleString()}\n${'='.repeat(50)}\n\n`;
    state.messages.forEach(m => {
        content += `[${m.role.toUpperCase()}]\n${m.content}\n\n`;
    });
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `heliox-chat-${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
}

function showSidebarToast(message) {
    // Remove existing toast
    document.querySelector('.sidebar-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'sidebar-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

function setupActionListeners() {
    // --- Tab Switching ---
    document.querySelectorAll('.response-tabs').forEach(tabBar => {
        tabBar.querySelectorAll('.response-tab').forEach(tab => {
            tab.onclick = () => {
                const msg = tab.closest('.message');
                const targetPanel = tab.dataset.tab;
                
                // Update active tab
                tabBar.querySelectorAll('.response-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Show/hide panels
                msg.querySelectorAll('.tab-panel').forEach(panel => {
                    panel.classList.toggle('active', panel.dataset.panel === targetPanel);
                });
            };
        });
    });

    // --- Copy Button with feedback ---
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.onclick = async () => {
            const msg = btn.closest('.message');
            const content = msg.querySelector('.message-content')?.innerText || '';
            try {
                await navigator.clipboard.writeText(content);
                const originalHTML = btn.innerHTML;
                btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
                btn.style.color = '#2dd4bf';
                setTimeout(() => { btn.innerHTML = originalHTML; btn.style.color = ''; }, 2000);
            } catch(e) { console.error('Copy failed:', e); }
        };
    });

    // --- Share Button ---
    document.querySelectorAll('.share-btn').forEach(btn => {
        btn.onclick = async () => {
            const msg = btn.closest('.message');
            const content = msg.querySelector('.message-content')?.innerText || '';
            if (navigator.share) {
                try { await navigator.share({ title: 'Heliox Response', text: content }); } catch(err) {}
            } else {
                await navigator.clipboard.writeText(content);
                const originalHTML = btn.innerHTML;
                btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
                setTimeout(() => { btn.innerHTML = originalHTML; }, 2000);
            }
        };
    });

    // --- Sources Badge ---
    document.querySelectorAll('.sources-badge').forEach(badge => {
        badge.onclick = () => {
            // Switch to Links tab when clicking sources badge
            const msg = badge.closest('.message');
            const linksTab = msg.querySelector('.response-tab[data-tab="links"]');
            if (linksTab) linksTab.click();
            badge.classList.toggle('active');
        };
    });

    // --- Regenerate Button ---
    document.querySelectorAll('.regenerate-btn').forEach(btn => {
        btn.onclick = () => {
            if (state.isStreaming) return;
            const idx = parseInt(btn.dataset.index);
            if (state.messages[idx-1]?.role === 'user') {
                const t = state.messages[idx-1].content;
                state.messages = state.messages.slice(0, idx-1);
                const container = document.getElementById('messages-container');
                while (container.children.length > idx-1) {
                    container.removeChild(container.lastChild);
                }
                handleUserMessage(t);
            }
        };
    });

    // --- Like / Dislike Buttons ---
    document.querySelectorAll('.like-btn').forEach(btn => {
        btn.onclick = () => {
            const isActive = btn.classList.toggle('active');
            btn.querySelector('svg').style.fill = isActive ? 'currentColor' : 'none';
            // Remove dislike if active
            const dislikeBtn = btn.closest('.feedback-btns')?.querySelector('.dislike-btn');
            if (dislikeBtn?.classList.contains('active')) {
                dislikeBtn.classList.remove('active');
                dislikeBtn.querySelector('svg').style.fill = 'none';
            }
        };
    });

    document.querySelectorAll('.dislike-btn').forEach(btn => {
        btn.onclick = () => {
            const isActive = btn.classList.toggle('active');
            btn.querySelector('svg').style.fill = isActive ? 'currentColor' : 'none';
            // Remove like if active
            const likeBtn = btn.closest('.feedback-btns')?.querySelector('.like-btn');
            if (likeBtn?.classList.contains('active')) {
                likeBtn.classList.remove('active');
                likeBtn.querySelector('svg').style.fill = 'none';
            }
        };
    });
}

// ===== KEYBOARD SHORTCUTS =====
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Don't trigger shortcuts when typing in inputs
        const tag = document.activeElement?.tagName?.toLowerCase();
        const isInput = tag === 'input' || tag === 'textarea';
        
        // Esc - Stop generating / Close modals
        if (e.key === 'Escape') {
            if (state.isStreaming) {
                stopStreaming();
                return;
            }
            // Close modals
            document.getElementById('shortcuts-modal')?.classList.add('hidden');
            document.getElementById('profile-panel')?.classList.add('hidden');
            document.getElementById('history-panel')?.classList.add('hidden');
            document.getElementById('search-bar')?.classList.add('hidden');
            document.getElementById('spotify-player')?.classList.add('hidden');
            closeCodeCanvas();
            return;
        }
        
        // Ctrl/Cmd shortcuts
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'k': // New Chat
                    e.preventDefault();
                    startNewChat();
                    break;
                case 'f': // Search in Chat
                    if (!document.getElementById('welcome-view')?.classList.contains('hidden') === false) {
                        e.preventDefault();
                        toggleSearchBar();
                    }
                    break;
                case 'h': // Toggle History
                    e.preventDefault();
                    const panel = document.getElementById('history-panel');
                    panel?.classList.toggle('hidden');
                    if (!panel?.classList.contains('hidden')) renderHistoryPanel();
                    break;
                case 'd': // Toggle Dark Mode
                    e.preventDefault();
                    document.body.classList.toggle('dark');
                    localStorage.setItem('heliox_theme', document.body.classList.contains('dark') ? 'dark' : 'light');
                    break;
                case 's': // Download Chat
                    e.preventDefault();
                    downloadChat();
                    break;
                case 'm': // Toggle Spotify
                    e.preventDefault();
                    document.getElementById('spotify-player')?.classList.toggle('hidden');
                    break;
            }
        }
        
        // ? key to show shortcuts (only when not typing)
        if (e.key === '?' && !isInput) {
            document.getElementById('shortcuts-modal')?.classList.toggle('hidden');
        }
    });
}

// ===== SEARCH IN CHAT =====
function setupSearchInChat() {
    const searchBtn = document.getElementById('search-chat-btn');
    const searchBar = document.getElementById('search-bar');
    const searchInput = document.getElementById('search-input');
    const searchClose = document.getElementById('search-close');
    const searchCount = document.getElementById('search-results-count');
    
    if (!searchBtn || !searchBar || !searchInput) return;
    
    searchBtn.addEventListener('click', toggleSearchBar);
    searchClose?.addEventListener('click', () => {
        searchBar.classList.add('hidden');
        clearSearchHighlights();
    });
    
    let searchTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            performSearch(searchInput.value.trim());
        }, 200);
    });
}

function toggleSearchBar() {
    const searchBar = document.getElementById('search-bar');
    const searchInput = document.getElementById('search-input');
    if (!searchBar) return;
    
    searchBar.classList.toggle('hidden');
    if (!searchBar.classList.contains('hidden')) {
        searchInput?.focus();
    } else {
        clearSearchHighlights();
    }
}

function performSearch(query) {
    const searchCount = document.getElementById('search-results-count');
    clearSearchHighlights();
    
    if (!query || query.length < 2) {
        if (searchCount) searchCount.textContent = '';
        return;
    }
    
    const container = document.getElementById('messages-container');
    if (!container) return;
    
    const messageContents = container.querySelectorAll('.message-content');
    let totalMatches = 0;
    
    messageContents.forEach(el => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
        const textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);
        
        textNodes.forEach(node => {
            const text = node.textContent;
            const regex = new RegExp(escapeRegex(query), 'gi');
            if (regex.test(text)) {
                const span = document.createElement('span');
                span.innerHTML = text.replace(new RegExp(escapeRegex(query), 'gi'), match => {
                    totalMatches++;
                    return `<mark class="search-highlight">${escapeHTML(match)}</mark>`;
                });
                node.parentNode.replaceChild(span, node);
            }
        });
    });
    
    if (searchCount) {
        searchCount.textContent = totalMatches > 0 ? `${totalMatches} found` : 'No results';
    }
    
    // Scroll to first match
    const firstMatch = container.querySelector('.search-highlight');
    if (firstMatch) {
        firstMatch.classList.add('active');
        firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function clearSearchHighlights() {
    document.querySelectorAll('.search-highlight').forEach(mark => {
        const parent = mark.parentNode;
        parent.replaceChild(document.createTextNode(mark.textContent), mark);
        parent.normalize();
    });
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ===== SPOTIFY - @spotify command integration =====
// Global spotify state
const spotifyState = {
    token: null,             // app-level client-credentials token (for search)
    audio: new Audio(),      // HTMLAudioElement used for previews and SDK sync
    currentTracks: [],
    currentIndex: -1,
    playlist: [],
    isPlaying: false,
    playlists: {},           // local (in-app) playlists by name
    currentPlaylistName: '', // name of active playlist (if any)
    userToken: null,         // OAuth token for full-track playback
    deviceId: null,          // Web Playback SDK device ID
    player: null,            // Spotify.Player instance
    sdkReady: false,         // whether the Web Playback SDK has loaded
    currentTrackLiked: false, // whether active track is in Liked Songs
    sdkPositionSec: 0,       // current position from Web Playback SDK
    sdkDurationSec: 0        // total duration from Web Playback SDK
};

// Use a public, always-available Spotify glyph for stability
const SPOTIFY_LOGO_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Spotify_logo_without_text.svg/3840px-Spotify_logo_without_text.svg.png';

function loadSpotifyPlaylists() {
    try {
        const raw = localStorage.getItem('heliox_spotify_playlists');
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
            spotifyState.playlists = data;
        }
    } catch (e) {
        console.warn('Failed to load Spotify playlists:', e);
    }
}

function saveSpotifyPlaylists() {
    try {
        localStorage.setItem('heliox_spotify_playlists', JSON.stringify(spotifyState.playlists || {}));
    } catch (e) {
        console.warn('Failed to save Spotify playlists:', e);
    }
}

function setupSpotifyPlayer() {
    // Spotify is handled via @spotify commands in chat input
    loadSpotifyPlaylists();
    // Default volume a bit softer
    spotifyState.audio.volume = 0.8;

    spotifyState.audio.addEventListener('ended', () => {
        const next = spotifyState.currentIndex + 1;
        if (next < spotifyState.currentTracks.length && spotifyState.currentTracks[next]?.preview_url) {
            playSpotifyTrack(next);
        } else {
            spotifyState.isPlaying = false;
            updateMiniPlayer();
        }
    });
    spotifyState.audio.addEventListener('play', () => { 
        spotifyState.isPlaying = true; 
        updateMiniPlayer(); 
        updateSpotifyDock();
    });
    spotifyState.audio.addEventListener('pause', () => { 
        spotifyState.isPlaying = false; 
        updateMiniPlayer(); 
        updateSpotifyDock();
    });

    // Progress + duration sync
    spotifyState.audio.addEventListener('timeupdate', () => {
        updateSpotifyProgress();
    });
    spotifyState.audio.addEventListener('loadedmetadata', () => {
        updateSpotifyProgress(true);
    });

    // Wire seek + volume sliders in the dock UI
    const seek = document.getElementById('spotify-seek');
    if (seek) {
        seek.addEventListener('input', (e) => {
            const val = Number(e.target.value);
            const duration = spotifyState.audio.duration || 0;
            if (!duration) return;
            spotifyState.audio.currentTime = (val / 100) * duration;
        });
    }
    const vol = document.getElementById('spotify-volume');
    if (vol) {
        vol.addEventListener('input', (e) => {
            const v = Math.max(0, Math.min(100, Number(e.target.value)));
            // If we're connected to Spotify SDK, adjust device volume, otherwise local preview volume
            if (spotifyState.userToken && spotifyState.deviceId) {
                fetch('https://api.spotify.com/v1/me/player/volume?volume_percent=' + v + '&device_id=' + encodeURIComponent(spotifyState.deviceId), {
                    method: 'PUT',
                    headers: { 'Authorization': 'Bearer ' + spotifyState.userToken }
                }).catch(err => console.error('Spotify volume error', err));
                if (spotifyState.player && typeof spotifyState.player.setVolume === 'function') {
                    spotifyState.player.setVolume(v / 100).catch(() => {});
                }
            } else {
                spotifyState.audio.volume = v / 100;
            }
        });
    }

    // Like button (save to Liked Songs)
    const likeBtn = document.getElementById('spotify-like-btn');
    if (likeBtn) {
        likeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSpotifyLike();
        });
    }
}

// ===== Spotify OAuth + Web Playback SDK (full-track playback) =====
const SPOTIFY_AUTH_SCOPES = [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state'
].join(' ');

function setupSpotifyAuthFlow() {
    // Connect button
    const connectBtn = document.getElementById('spotify-connect-btn');
    if (connectBtn) {
        connectBtn.addEventListener('click', () => {
            startSpotifyLogin();
        });
    }

    // If redirected back from Spotify with ?code=, finish PKCE flow
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const stateParam = params.get('state');
    if (code && stateParam === 'heliox_spotify') {
        completeSpotifyLogin(code).then(() => {
            params.delete('code');
            params.delete('state');
            const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
            window.history.replaceState({}, '', newUrl);
        }).catch(err => {
            console.error('Spotify login failed:', err);
            showSpotifyError('Spotify login failed. Please try again.');
        });
    }

    // Load existing token from storage if any
    const savedToken = localStorage.getItem('heliox_spotify_user_token');
    const savedExpiry = Number(localStorage.getItem('heliox_spotify_user_token_exp') || 0);
    if (savedToken && savedExpiry > Date.now()) {
        spotifyState.userToken = savedToken;
        initWebPlaybackSDK();
    }
}

function getSpotifyRedirectUri() {
    return window.location.origin + window.location.pathname;
}

async function startSpotifyLogin() {
    // NOTE: for full-track playback you must use your own Spotify app client ID here.
    const clientId = '63699e41233347cebad1bc4fe559d650';
    const verifier = generateRandomString(64);
    const challenge = await pkceChallengeFromVerifier(verifier);
    localStorage.setItem('heliox_spotify_pkce_verifier', verifier);

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: getSpotifyRedirectUri(),
        scope: SPOTIFY_AUTH_SCOPES,
        code_challenge_method: 'S256',
        code_challenge: challenge,
        state: 'heliox_spotify'
    });
    window.location.href = 'https://accounts.spotify.com/authorize?' + params.toString();
}

async function completeSpotifyLogin(code) {
    const clientId = '63699e41233347cebad1bc4fe559d650';
    const verifier = localStorage.getItem('heliox_spotify_pkce_verifier');
    if (!verifier) throw new Error('Missing PKCE verifier, please try connecting again.');

    const body = new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: getSpotifyRedirectUri(),
        code_verifier: verifier
    });

    const resp = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
    });
    const data = await resp.json();
    if (!resp.ok || !data.access_token) {
        throw new Error(data.error_description || 'Failed to get Spotify access token');
    }

    const expiresInMs = (data.expires_in || 3600) * 1000;
    spotifyState.userToken = data.access_token;
    localStorage.setItem('heliox_spotify_user_token', data.access_token);
    localStorage.setItem('heliox_spotify_user_token_exp', String(Date.now() + expiresInMs));
    initWebPlaybackSDK();
    showSpotifyInfo('Spotify connected. You can now play full songs inside this tab.');
}

function generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

async function pkceChallengeFromVerifier(v) {
    const encoder = new TextEncoder();
    const data = encoder.encode(v);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    const base64Digest = btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    return base64Digest;
}

function initWebPlaybackSDK() {
    if (!spotifyState.userToken) return;
    if (spotifyState.player) return; // already created

    function createPlayer() {
        if (!window.Spotify) return;
        spotifyState.sdkReady = true;
        const player = new Spotify.Player({
            name: 'Heliox Chat Player',
            getOAuthToken: cb => { cb(spotifyState.userToken); },
            volume: spotifyState.audio.volume
        });
        spotifyState.player = player;

        player.addListener('ready', ({ device_id }) => {
            spotifyState.deviceId = device_id;
            console.log('Spotify Web Playback ready with Device ID', device_id);
        });
        player.addListener('not_ready', ({ device_id }) => {
            console.log('Spotify device ID has gone offline', device_id);
        });
        player.addListener('player_state_changed', state => {
            if (!state) return;
            const paused = state.paused;
            spotifyState.isPlaying = !paused;

            // Capture position/duration from SDK for progress bar
            try {
                const track = state.track_window?.current_track;
                spotifyState.sdkPositionSec = (state.position || 0) / 1000;
                spotifyState.sdkDurationSec = (track?.duration_ms || state.duration || 0) / 1000;
                // Keep our currentTracks index roughly aligned if possible
                if (track?.id) {
                    const idx = spotifyState.currentTracks.findIndex(t => t.id === track.id);
                    if (idx !== -1) spotifyState.currentIndex = idx;
                }
            } catch (e) {
                console.warn('Failed to read SDK track state', e);
            }

            updateSpotifyDock();
        });
        player.addListener('initialization_error', e => console.error('Spotify init error', e));
        player.addListener('authentication_error', e => console.error('Spotify auth error', e));
        player.addListener('account_error', e => console.error('Spotify account error', e));

        player.connect();
    }

    if (window.Spotify) {
        createPlayer();
    } else {
        window.onSpotifyWebPlaybackSDKReady = () => {
            createPlayer();
        };
    }
}

async function getSpotifyToken() {
    if (spotifyState.token) return spotifyState.token;
    // Use the same client credentials as configured for Heliox
    const CID = '63699e41233347cebad1bc4fe559d650';
    const CSC = 'e5fc54aafe454cf7aa853290ef7d35ce';
    try {
        const resp = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + btoa(CID + ':' + CSC) },
            body: 'grant_type=client_credentials'
        });
        const data = await resp.json();
        spotifyState.token = data.access_token;
        setTimeout(() => spotifyState.token = null, 50 * 60 * 1000);
        return spotifyState.token;
    } catch (e) { console.warn('Spotify token error:', e); return null; }
}

async function spotifySearchTracks(query, limit = 6) {
    const token = await getSpotifyToken();
    if (!token) {
        showSpotifyError('Unable to connect to Spotify. Please try again.');
        return [];
    }
    try {
        const resp = await fetch('https://api.spotify.com/v1/search?q=' + encodeURIComponent(query) + '&type=track&limit=' + limit, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await resp.json();
        return data.tracks?.items || [];
    } catch (e) {
        console.error('Spotify search failed:', e);
        showSpotifyError('Spotify search failed. Please try again.');
        return [];
    }
}

async function handleSpotifyCommand(query) {
    document.getElementById('welcome-view').classList.add('hidden');
    document.getElementById('chat-view').classList.remove('hidden');
    const userMsg = { role: 'user', content: '@spotify ' + query };
    state.messages.push(userMsg);
    appendMessageHTML(userMsg, state.messages.length - 1);
    scrollToBottom();

    const lower = query.toLowerCase().trim();

    // --- Playback control commands ---
    if (/^(pause|stop)\b/.test(lower)) {
        if (spotifyState.audio && !spotifyState.audio.paused) {
            spotifyState.audio.pause();
            showSpotifyInfo('Paused Spotify playback.');
        } else {
            showSpotifyInfo('Nothing is currently playing.');
        }
        return;
    }

    if (/^(resume|play)\b$/.test(lower)) {
        if (spotifyState.audio && spotifyState.audio.src) {
            spotifyState.audio.play().catch(() => showSpotifyError('Unable to resume Spotify playback.'));
            showSpotifyInfo('Resumed Spotify playback.');
        } else {
            showSpotifyInfo('No track loaded. Try `@spotify <song name>` first.');
        }
        return;
    }

    if (/^(next|skip)\b/.test(lower)) {
        spotifyNext();
        showSpotifyInfo('Skipped to the next Spotify track.');
        return;
    }

    if (/^(prev|previous|back)\b/.test(lower)) {
        spotifyPrev();
        showSpotifyInfo('Playing previous Spotify track.');
        return;
    }

    const volumeMatch = lower.match(/^volume\s+(\d{1,3})\b/);
    if (volumeMatch) {
        let v = parseInt(volumeMatch[1], 10);
        if (Number.isNaN(v)) v = 100;
        v = Math.max(0, Math.min(100, v));
        if (spotifyState.audio) {
            spotifyState.audio.volume = v / 100;
            showSpotifyInfo('Spotify volume set to ' + v + '%.');
        }
        return;
    }

    // --- Local playlist commands (@spotify create/add/play playlist ...) ---
    const createNamed = query.match(/^create\s+playlist\s+(.+)/i);
    if (createNamed) {
        const name = createNamed[1].trim();
        if (!name) {
            showSpotifyError('Please provide a name, e.g. `@spotify create playlist focus`.');
            return;
        }
        const key = name.toLowerCase();
        if (!spotifyState.playlists[key]) {
            spotifyState.playlists[key] = { name, tracks: [] };
            saveSpotifyPlaylists();
        }
        showSpotifyInfo('Created playlist "' + name + '". Use `@spotify add [song] to playlist ' + name + '` to add tracks.');
        return;
    }

    const addToNamed = query.match(/^add\s+(.+)\s+to\s+playlist\s+(.+)/i);
    if (addToNamed) {
        const trackQuery = addToNamed[1].trim();
        const playlistName = addToNamed[2].trim();
        const key = playlistName.toLowerCase();
        if (!spotifyState.playlists[key]) {
            spotifyState.playlists[key] = { name: playlistName, tracks: [] };
        }
        const tracks = await spotifySearchTracks(trackQuery, 1);
        if (!tracks.length) return;
        spotifyState.playlists[key].tracks.push(tracks[0]);
        saveSpotifyPlaylists();
        showSpotifyInfo('Added "' + tracks[0].name + '" to playlist "' + playlistName + '".');
        return;
    }

    const playNamed = query.match(/^play\s+playlist\s+(.+)/i);
    if (playNamed) {
        const playlistName = playNamed[1].trim();
        const key = playlistName.toLowerCase();
        const pl = spotifyState.playlists[key];
        if (!pl || !pl.tracks || pl.tracks.length === 0) {
            showSpotifyError('Playlist "' + playlistName + '" is empty or does not exist. Try `@spotify create playlist ' + playlistName + '` first.');
            return;
        }
        spotifyState.currentTracks = pl.tracks;
        spotifyState.currentPlaylistName = pl.name;
        renderLocalPlaylistMessage(pl);
        const firstPlayable = pl.tracks.findIndex(t => t.preview_url);
        if (firstPlayable >= 0) {
            setTimeout(() => playSpotifyTrack(firstPlayable), 300);
        }
        return;
    }

    // Thematic playlist helper (existing behavior)
    const playlistMatch = query.match(/^playlist\s+(.+)/i);
    if (playlistMatch) { await handleSpotifyPlaylist(playlistMatch[1].trim()); return; }

    try {
        const tracks = await spotifySearchTracks(query, 6);
        spotifyState.currentTracks = tracks;
        if (tracks.length === 0) { showSpotifyError('No tracks found for "' + query + '".'); return; }

        state.messages.push({ role: 'assistant', content: 'Found tracks', isSpotify: true });
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message assistant';
        msgDiv.innerHTML = '<div class="message-avatar"><img src="' + SPOTIFY_LOGO_URL + '" alt="Spotify" style="width:20px;height:20px;border-radius:999px;object-fit:cover;"></div>' +
            '<div class="message-body"><div class="spotify-inline-results">' +
            '<div class="spotify-inline-header"><img src="' + SPOTIFY_LOGO_URL + '" alt="Spotify" style="width:16px;height:16px;border-radius:999px;object-fit:cover;margin-right:6px;">Results for "' + escapeHTML(query) + '"</div>' +
            '<div class="spotify-inline-tracks">' +
            tracks.map((t, i) => {
                const art = t.album?.images?.[2]?.url || t.album?.images?.[0]?.url || '';
                const dur = t.duration_ms ? Math.floor(t.duration_ms/60000) + ':' + String(Math.floor((t.duration_ms%60000)/1000)).padStart(2,'0') : '';
                const hasPreview = !!t.preview_url;
                return '<div class="spotify-inline-track' + (hasPreview ? '' : ' no-preview') + '" data-idx="' + i + '" onclick="playSpotifyTrack(' + i + ')">' +
                    (art ? '<img src="' + art + '" class="spotify-inline-art" alt="">' : '<div class="spotify-inline-art" style="background:rgba(255,255,255,0.08)"></div>') +
                    '<div class="spotify-inline-info"><span class="spotify-inline-name">' + escapeHTML(t.name) + '</span><span class="spotify-inline-artist">' + escapeHTML(t.artists?.map(a => a.name).join(', ') || '') + '</span></div>' +
                    '<span class="spotify-inline-duration">' + dur + '</span>' +
                    (hasPreview ? '<button class="spotify-inline-play" onclick="playSpotifyTrack(' + i + ');event.stopPropagation();"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></button>' : '<span style="font-size:0.7rem;color:rgba(255,255,255,0.4);margin-left:4px;">Open in Spotify</span>') +
                    '</div>';
            }).join('') +
            '</div>' +
            '<div class="spotify-mini-bar hidden" id="spotify-mini-bar"><img class="spotify-mini-art" id="mini-art" src="" alt=""><div class="spotify-mini-info"><span class="spotify-mini-title" id="mini-title"></span><span class="spotify-mini-artist" id="mini-artist"></span></div><div class="spotify-mini-controls"><button class="spotify-mini-btn" onclick="spotifyPrev()"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="19 20 9 12 19 4"/></svg></button><button class="spotify-mini-btn play-btn" id="mini-play-btn" onclick="spotifyTogglePlay()"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></button><button class="spotify-mini-btn" onclick="spotifyNext()"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20"/></svg></button></div></div>' +
            '</div>' +
            '<div style="margin-top:8px;font-size:0.78rem;color:var(--text-muted)">Tip: Type <code class="inline-code">@spotify playlist [genre/mood]</code> to create a playlist</div></div>';
        document.getElementById('messages-container').appendChild(msgDiv);
        scrollToBottom();
        const fp = tracks.findIndex(t => t.preview_url);
        if (fp >= 0) {
            setTimeout(() => playSpotifyTrack(fp), 300);
        } else {
            showSpotifyInfo('These tracks do not expose 30-second previews. Click any row to open the full song in Spotify.');
        }
    } catch (e) { showSpotifyError('Spotify search failed.'); console.error(e); }
}

async function handleSpotifyPlaylist(theme) {
    const token = await getSpotifyToken();
    if (!token) { showSpotifyError('Unable to connect to Spotify.'); return; }
    try {
        const resp = await fetch('https://api.spotify.com/v1/search?q=' + encodeURIComponent(theme) + '&type=track&limit=10', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await resp.json();
        const tracks = data.tracks?.items || [];
        spotifyState.currentTracks = tracks;
        if (tracks.length === 0) { showSpotifyError('No playlist for "' + theme + '".'); return; }

        state.messages.push({ role: 'assistant', content: 'Playlist: ' + theme, isSpotify: true });
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message assistant';
        msgDiv.innerHTML = '<div class="message-avatar"><img src="' + SPOTIFY_LOGO_URL + '" alt="Spotify" style="width:20px;height:20px;border-radius:999px;object-fit:cover;"></div>' +
            '<div class="message-body"><div class="spotify-playlist-card"><div class="playlist-header"><img src="' + SPOTIFY_LOGO_URL + '" alt="Spotify" style="width:22px;height:22px;border-radius:999px;object-fit:cover;margin-right:6px;"><span class="playlist-title">' + escapeHTML(theme) + ' Playlist</span><span style="font-size:0.75rem;color:rgba(255,255,255,0.4)">' + tracks.length + ' tracks</span></div>' +
            '<div class="playlist-tracks">' +
            tracks.map((t, i) => {
            const hasPreview = !!t.preview_url;
            return '<div class="playlist-track-item' + (hasPreview ? '' : ' no-preview') + '" onclick="playSpotifyTrack(' + i + ')"><span class="playlist-track-num">' + (i+1) + '</span><span style="flex:1">' + escapeHTML(t.name) + '</span><span style="color:rgba(255,255,255,0.3);font-size:0.75rem">' + escapeHTML(t.artists?.[0]?.name || '') + '</span>' + (hasPreview ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="#1DB954" style="flex-shrink:0"><polygon points="5 3 19 12 5 21 5 3"/></svg>' : '<span style="font-size:0.7rem;color:rgba(255,255,255,0.5);margin-left:4px;">Open in Spotify</span>') + '</div>';
            }).join('') +
            '</div></div>' +
            '<div class="spotify-mini-bar hidden" id="spotify-mini-bar"><img class="spotify-mini-art" id="mini-art" src="" alt=""><div class="spotify-mini-info"><span class="spotify-mini-title" id="mini-title"></span><span class="spotify-mini-artist" id="mini-artist"></span></div><div class="spotify-mini-controls"><button class="spotify-mini-btn" onclick="spotifyPrev()"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="19 20 9 12 19 4"/></svg></button><button class="spotify-mini-btn play-btn" id="mini-play-btn" onclick="spotifyTogglePlay()"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></button><button class="spotify-mini-btn" onclick="spotifyNext()"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20"/></svg></button></div></div>' +
            '</div>';
        document.getElementById('messages-container').appendChild(msgDiv);
        scrollToBottom();
        const fp = tracks.findIndex(t => t.preview_url);
        if (fp >= 0) setTimeout(() => playSpotifyTrack(fp), 300);
    } catch (e) { showSpotifyError('Playlist creation failed.'); }
}

function renderLocalPlaylistMessage(playlist) {
    const tracks = playlist.tracks || [];
    state.messages.push({ role: 'assistant', content: 'Playlist: ' + playlist.name, isSpotify: true });
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message assistant';
    msgDiv.innerHTML = '<div class="message-avatar"><img src="' + SPOTIFY_LOGO_URL + '" alt="Spotify" style="width:20px;height:20px;border-radius:999px;object-fit:cover;"></div>' +
        '<div class="message-body"><div class="spotify-playlist-card"><div class="playlist-header">' +
        '<img src="' + SPOTIFY_LOGO_URL + '" alt="Spotify" style="width:22px;height:22px;border-radius:999px;object-fit:cover;margin-right:6px;">' +
        '<span class="playlist-title">' + escapeHTML(playlist.name) + ' (local)</span>' +
        '<span style="font-size:0.75rem;color:rgba(255,255,255,0.4)">' + tracks.length + ' tracks</span></div>' +
        '<div class="playlist-tracks">' +
        tracks.map((t, i) => {
            const hasPreview = !!t.preview_url;
            return '<div class="playlist-track-item' + (hasPreview ? '' : ' no-preview') + '" onclick="playSpotifyTrack(' + i + ')">' +
                '<span class="playlist-track-num">' + (i + 1) + '</span>' +
                '<span style="flex:1">' + escapeHTML(t.name) + '</span>' +
                '<span style="color:rgba(255,255,255,0.3);font-size:0.75rem">' + escapeHTML(t.artists?.[0]?.name || '') + '</span>' +
                (hasPreview ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="#1DB954" style="flex-shrink:0"><polygon points="5 3 19 12 5 21 5 3"/></svg>' : '<span style="font-size:0.7rem;color:rgba(255,255,255,0.5);margin-left:4px;">Open in Spotify</span>') +
            '</div>';
        }).join('') +
        '</div></div>' +
        '<div class="spotify-mini-bar hidden" id="spotify-mini-bar"><img class="spotify-mini-art" id="mini-art" src="" alt=""><div class="spotify-mini-info"><span class="spotify-mini-title" id="mini-title"></span><span class="spotify-mini-artist" id="mini-artist"></span></div><div class="spotify-mini-controls"><button class="spotify-mini-btn" onclick="spotifyPrev()"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="19 20 9 12 19 4"/></svg></button><button class="spotify-mini-btn play-btn" id="mini-play-btn" onclick="spotifyTogglePlay()"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></button><button class="spotify-mini-btn" onclick="spotifyNext()"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20"/></svg></button></div></div>' +
        '</div>';
    document.getElementById('messages-container').appendChild(msgDiv);
    scrollToBottom();
}

function showSpotifyError(message) {
    state.messages.push({ role: 'assistant', content: message });
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message assistant';
    msgDiv.innerHTML = '<div class="message-avatar"><img src="' + SPOTIFY_LOGO_URL + '" alt="Spotify" style="width:20px;height:20px;border-radius:999px;object-fit:cover;"></div><div class="message-body"><div class="message-content"><p>' + escapeHTML(message) + '</p></div></div>';
    document.getElementById('messages-container').appendChild(msgDiv);
    scrollToBottom();
}

function showSpotifyInfo(message) {
    state.messages.push({ role: 'assistant', content: message });
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message assistant';
    msgDiv.innerHTML = '<div class="message-avatar"><img src="' + SPOTIFY_LOGO_URL + '" alt="Spotify" style="width:20px;height:20px;border-radius:999px;object-fit:cover;"></div><div class="message-body"><div class="message-content"><p>' + escapeHTML(message) + '</p></div></div>';
    document.getElementById('messages-container').appendChild(msgDiv);
    scrollToBottom();
}

window.playSpotifyTrack = function(index) {
    const track = spotifyState.currentTracks[index];
    if (!track) return;
    spotifyState.currentIndex = index;

    // Prefer full-track playback via Web Playback SDK when connected
    if (spotifyState.userToken && spotifyState.deviceId && track.uri) {
        fetch('https://api.spotify.com/v1/me/player/play?device_id=' + encodeURIComponent(spotifyState.deviceId), {
            method: 'PUT',
            headers: {
                'Authorization': 'Bearer ' + spotifyState.userToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ uris: [track.uri] })
        }).catch(err => console.error('Spotify play error', err));
    } else if (track.preview_url) {
        // Fallback to 30s preview inside chatbot if no full playback session
    spotifyState.audio.src = track.preview_url;
    spotifyState.audio.play();
    } else {
        // Final fallback: open full track in Spotify app/site
        const url = track.external_urls?.spotify;
        if (url) window.open(url, '_blank', 'noopener');
        else showSpotifyError('This track has no preview available from Spotify.');
    }

    // Make sure the dock/player panel is visible whenever a track starts or we control playback
    const helperPanel = document.getElementById('spotify-player');
    if (helperPanel) helperPanel.classList.remove('hidden');
    document.querySelectorAll('.spotify-inline-track').forEach(el => el.classList.remove('playing'));
    document.querySelector('.spotify-inline-track[data-idx="' + index + '"]')?.classList.add('playing');
    updateMiniPlayer();
    updateSpotifyDock();
};

window.spotifyTogglePlay = function() {
    // If we're connected to the Web Playback SDK, control the user's Spotify player
    if (spotifyState.userToken && spotifyState.deviceId) {
        // Ask current playback state, then toggle
        fetch('https://api.spotify.com/v1/me/player', {
            headers: { 'Authorization': 'Bearer ' + spotifyState.userToken }
        }).then(r => r.json()).then(state => {
            const isPaused = state?.is_playing === false;
            const endpoint = isPaused ? 'play' : 'pause';
            return fetch('https://api.spotify.com/v1/me/player/' + endpoint + '?device_id=' + encodeURIComponent(spotifyState.deviceId), {
                method: 'PUT',
                headers: { 'Authorization': 'Bearer ' + spotifyState.userToken }
            });
        }).catch(err => {
            console.error('Spotify toggle error', err);
        });
        return;
    }

    // Fallback: control local preview audio
    if (spotifyState.audio.paused) spotifyState.audio.play();
    else spotifyState.audio.pause();
};

window.spotifyNext = function() {
    if (spotifyState.userToken && spotifyState.deviceId) {
        fetch('https://api.spotify.com/v1/me/player/next?device_id=' + encodeURIComponent(spotifyState.deviceId), {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + spotifyState.userToken }
        }).catch(err => console.error('Spotify next error', err));
        return;
    }
    for (let i = spotifyState.currentIndex + 1; i < spotifyState.currentTracks.length; i++) {
        if (spotifyState.currentTracks[i]?.preview_url) { playSpotifyTrack(i); return; }
    }
};

window.spotifyPrev = function() {
    if (spotifyState.userToken && spotifyState.deviceId) {
        fetch('https://api.spotify.com/v1/me/player/previous?device_id=' + encodeURIComponent(spotifyState.deviceId), {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + spotifyState.userToken }
        }).catch(err => console.error('Spotify prev error', err));
        return;
    }
    for (let i = spotifyState.currentIndex - 1; i >= 0; i--) {
        if (spotifyState.currentTracks[i]?.preview_url) { playSpotifyTrack(i); return; }
    }
};

function updateMiniPlayer() {
    const bars = document.querySelectorAll('.spotify-mini-bar');
    const track = spotifyState.currentTracks[spotifyState.currentIndex];
    if (!track) { 
        bars.forEach(b => b.classList.add('hidden')); 
        updateSpotifyDock(); 
        return; 
    }
    bars.forEach(bar => {
        bar.classList.remove('hidden');
        const art = bar.querySelector('.spotify-mini-art');
        const title = bar.querySelector('.spotify-mini-title');
        const artist = bar.querySelector('.spotify-mini-artist');
        const playBtn = bar.querySelector('.play-btn');
        const artUrl = track.album?.images?.[2]?.url || track.album?.images?.[0]?.url || '';
        if (art) art.src = artUrl;
        if (title) title.textContent = track.name;
        if (artist) artist.textContent = track.artists?.map(a => a.name).join(', ') || '';
        if (playBtn) playBtn.innerHTML = spotifyState.isPlaying
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    });
}

// Update the fixed dock-style player in the bottom-right panel
function updateSpotifyDock() {
    const container = document.getElementById('spotify-now-playing');
    const iframe = document.getElementById('spotify-embed-player');
    if (!container || !iframe) return;

    const track = spotifyState.currentTracks[spotifyState.currentIndex];
    if (!track || !track.id) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    const newSrc = 'https://open.spotify.com/embed/track/' + track.id + '?utm_source=heliox_chat';
    if (iframe.src !== newSrc) {
        iframe.src = newSrc;
    }
}

// Keep seek bar + time labels in sync with audio element
function updateSpotifyProgress(forceDuration = false) {
    const curLabel = document.getElementById('spotify-current-time');
    const durLabel = document.getElementById('spotify-duration');
    const seek = document.getElementById('spotify-seek');
    if (!curLabel || !durLabel || !seek) return;

    let current;
    let duration;

    const track = spotifyState.currentTracks[spotifyState.currentIndex];

    // Prefer SDK timing when connected to full Spotify playback
    if (spotifyState.userToken && spotifyState.deviceId && spotifyState.sdkDurationSec) {
        current = spotifyState.sdkPositionSec || 0;
        duration = spotifyState.sdkDurationSec;
    } else {
        const audio = spotifyState.audio;
        current = audio.currentTime || 0;
        duration = audio.duration;
        // Fallback to track duration if metadata missing (e.g. preview)
        if ((!duration || isNaN(duration)) && track?.duration_ms) {
            duration = track.duration_ms / 1000;
        }
        if (!duration || isNaN(duration)) duration = 30;
    }

    curLabel.textContent = formatTimeShort(current);
    if (forceDuration || !durLabel.textContent || durLabel.textContent === '0:00') {
        durLabel.textContent = formatTimeShort(duration);
    }

    const pct = duration ? Math.min(100, Math.max(0, (current / duration) * 100)) : 0;
    seek.value = String(pct);
}

function formatTimeShort(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ':' + String(r).padStart(2, '0');
}

// ===== Liked Songs helpers =====
function updateSpotifyLikeButton() {
    const btn = document.getElementById('spotify-like-btn');
    if (!btn) return;
    if (spotifyState.currentTrackLiked) btn.classList.add('active');
    else btn.classList.remove('active');
}

async function refreshSpotifyLikeState(track) {
    if (!spotifyState.userToken || !track?.id) return;
    try {
        const resp = await fetch('https://api.spotify.com/v1/me/tracks/contains?ids=' + encodeURIComponent(track.id), {
            headers: { 'Authorization': 'Bearer ' + spotifyState.userToken }
        });
        const data = await resp.json();
        spotifyState.currentTrackLiked = Array.isArray(data) && !!data[0];
        updateSpotifyLikeButton();
    } catch (e) {
        console.warn('Failed to read liked state', e);
    }
}

async function toggleSpotifyLike() {
    const track = spotifyState.currentTracks[spotifyState.currentIndex];
    if (!spotifyState.userToken || !track?.id) {
        showSpotifyError('Connect Spotify to save songs to your Liked Songs.');
        return;
    }
    const currentlyLiked = spotifyState.currentTrackLiked;
    const method = currentlyLiked ? 'DELETE' : 'PUT';
    try {
        await fetch('https://api.spotify.com/v1/me/tracks?ids=' + encodeURIComponent(track.id), {
            method,
            headers: { 'Authorization': 'Bearer ' + spotifyState.userToken }
        });
        spotifyState.currentTrackLiked = !currentlyLiked;
        updateSpotifyLikeButton();
    } catch (e) {
        console.error('Failed to toggle liked state', e);
        showSpotifyError('Could not update Liked Songs for this track.');
    }
}

// ===== SHORTCUTS MODAL =====
function setupShortcutsModal() {
    const modal = document.getElementById('shortcuts-modal');
    const closeBtn = document.getElementById('close-shortcuts');
    const shortcutsBtn = document.getElementById('shortcuts-btn');
    if (!modal) return;
    shortcutsBtn?.addEventListener('click', () => modal.classList.toggle('hidden'));
    closeBtn?.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
}


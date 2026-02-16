/**
 * Heliox Core Engine v11 (Stable API Config)
 * Fix: Removed invalid fallback models. 
 * Logic: Tries User URL (Gemini 2.5) -> Fallback to Gemini 1.5 Flash (Reliable)
 */

const CONFIG = {
    apiKey: '',
    textModelUrl: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", // User specific Request
    models: [
        { id: 'gemini-2.5-flash', name: 'Flash 2.5' }, // Quota prone
        { id: 'gemini-1.5-flash', name: 'Flash 1.5' }, // Reliable Fallback
        { id: 'gemini-1.5-pro', name: 'Pro 1.5' }      // High Quality Fallback
    ],
    systemPrompt: `You are Heliox, a helpful AI assistant.
Guidelines:
- Do NOT greet unless greeted first.
- Use emojis 🌟 only when friendly/greeting.
- No bullet points for simple answers; use paragraphs.
- Be clear and accurate.
- If response involves facts, cite sources if available.`,
};

class HelioxClient {
    async chat(history, uploadedFiles = []) {
        // Build contents
        const contents = [
            { role: 'user', parts: [{ text: CONFIG.systemPrompt }] },
            { role: 'model', parts: [{ text: "Understood." }] },
            ...history.map(msg => {
                const parts = [{ text: msg.content }];
                if (msg.files && msg.files.length) {
                    msg.files.forEach(f => parts.push({ inline_data: { mime_type: f.type, data: f.base64 } }));
                }
                return { role: msg.role === 'user' ? 'user' : 'model', parts };
            })
        ];

        let lastError = null;
        
        // 1. Try Primary URL (Gemini 2.5 Flash)
        try {
            // console.log("Attempting Primary:", CONFIG.textModelUrl);
            return await this._makeRequest(CONFIG.textModelUrl, contents);
        } catch (e) {
            console.warn("Primary URL failed:", e);
            lastError = e;
            
            // 2. Fallback Loop
            // Skip the first model in the list if it matches the primary URL check (approx logic)
            // We just try all fallback models in sequence now
            for (const model of CONFIG.models) { 
                // Skip if this model ID is likely the same as the one that just failed
                if (CONFIG.textModelUrl.includes(model.id)) continue;

                try {
                    // console.log(`Attempting Fallback: ${model.name}`);
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent`;
                    return await this._makeRequest(url, contents);
                } catch (err) {
                    console.warn(`${model.name} fallback failed:`, err);
                    // Only continue if recoverable (e.g. quota, 503). 
                    // If 404 (Not Found), definitely continue.
                    if (!this._isRecoverable(err) && !err.message.includes('404')) throw err;
                }
            }
        }
        throw lastError || new Error("All conversational models failed.");
    }

    async _makeRequest(url, contents) {
        const response = await fetch(`${url}?key=${CONFIG.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents, tools: [{ google_search: {} }] })
        });

        if (!response.ok) {
            let errorMsg = `API Error ${response.status}`;
            try { const err = await response.json(); errorMsg = err.error.message || JSON.stringify(err); } catch(e){}
            throw new Error(errorMsg);
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];
        if (!candidate) throw new Error("No response content from AI");

        return {
            text: candidate.content?.parts?.[0]?.text || "",
            grounding: candidate.groundingMetadata
        };
    }

    async generateSuggestions(history, lastAnswer) {
        try {
            const prompt = `Based on conversation, suggest 3 short follow-up questions. Return JSON: {"suggestions": ["Q1", "Q2", "Q3"]}.`;
            // Use 1.5 Flash for suggestions as it is most reliable
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${CONFIG.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [
                        { role: 'user', parts: [{ text: "Context: " + history.map(m=>m.content).join('\n') + "\nAnswer: " + lastAnswer + "\n" + prompt }] }
                    ],
                    generationConfig: { responseMimeType: "application/json" }
                })
            });
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            return text ? JSON.parse(text).suggestions || [] : [];
        } catch (e) { return []; }
    }

    _isRecoverable(e) {
        const m = e.message.toLowerCase();
        return m.includes('429') || m.includes('503') || m.includes('quota') || m.includes('exhausted') || m.includes('resource') || m.includes('not found') || m.includes('404');
    }
}

const state = {
    messages: [],
    uploadedFiles: [],
    client: new HelioxClient()
};

document.addEventListener('DOMContentLoaded', () => {
    setupTheme();
    setupEventListeners();
    setupModelSelector();
    setupFileUpload();
    setupVoiceInput();
    loadHistory();
});

function setupTheme() {
    const saved = localStorage.getItem('heliox_theme');
    if (saved === 'dark') document.body.classList.add('dark');
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
        document.body.classList.toggle('dark');
        localStorage.setItem('heliox_theme', document.body.classList.contains('dark') ? 'dark' : 'light');
    });
}

function setupEventListeners() {
    document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('collapsed');
    });

    ['message-input', 'chat-message-input'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('keydown', (e) => { 
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(el); } 
            });
            el.addEventListener('input', () => { 
                el.style.height = 'auto'; 
                el.style.height = Math.min(el.scrollHeight, 150) + 'px'; 
            });
        }
    });

    ['send-btn', 'chat-send-btn'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', () => {
            const inputId = id === 'send-btn' ? 'message-input' : 'chat-message-input';
            handleSend(document.getElementById(inputId));
        });
    });

    document.getElementById('history-btn')?.addEventListener('click', toggleHistoryPanel);
    document.getElementById('close-history')?.addEventListener('click', toggleHistoryPanel);
    document.getElementById('clear-history-btn')?.addEventListener('click', () => {
        if(confirm('Clear history?')) { localStorage.removeItem('heliox_history'); startNewChat(); }
    });

    document.getElementById('new-chat-btn')?.addEventListener('click', startNewChat);
    document.getElementById('download-chat-btn')?.addEventListener('click', downloadChat);
    
    document.querySelectorAll('.quick-action-btn').forEach(btn => 
        btn.addEventListener('click', () => handleUserMessage(btn.dataset.prompt))
    );
}

function setupModelSelector() {
    ['model-selector-btn', 'chat-model-btn'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = document.getElementById(id === 'model-selector-btn' ? 'model-dropdown' : 'chat-model-dropdown');
            dropdown?.classList.toggle('show');
        });
    });
    document.querySelectorAll('.model-option').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('span[id$="model-name"]').forEach(el => el.textContent = opt.textContent);
            document.querySelectorAll('.model-dropdown').forEach(d => d.classList.remove('show'));
        });
    });
    document.addEventListener('click', () => document.querySelectorAll('.model-dropdown').forEach(d => d.classList.remove('show')));
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
    const container = document.getElementById('files-preview');
    if (!container) return;
    if (state.uploadedFiles.length === 0) { container.classList.add('hidden'); container.innerHTML = ''; return; }
    container.classList.remove('hidden');
    container.innerHTML = state.uploadedFiles.map((f, i) => `
        <div class="file-chip" style="display:inline-flex; align-items:center; background:rgba(100,100,100,0.2); padding:4px 8px; border-radius:12px; margin-right:4px;">
            ${f.type.startsWith('image') ? `<img src="${f.preview}" style="width:20px; height:20px; object-fit:cover; border-radius:4px; margin-right:6px;">` : '📄 '}
            ${escapeHTML(f.name.substring(0, 15))} <span onclick="removeFile(${i})" style="margin-left:8px; cursor:pointer;">&times;</span>
        </div>
    `).join('');
}

window.removeFile = (index) => { state.uploadedFiles.splice(index, 1); renderFilesPreview(); };

function setupVoiceInput() {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    ['voice-btn', 'chat-voice-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', () => { try { recognition.start(); btn.style.color = '#2dbca1'; } catch(e) { recognition.stop(); btn.style.color = ''; }});
    });
    recognition.onresult = (e) => {
        const txt = e.results[0][0].transcript;
        const target = !document.getElementById('chat-view').classList.contains('hidden') ? document.getElementById('chat-message-input') : document.getElementById('message-input');
        if(target) { target.value += (target.value ? ' ' : '') + txt; target.focus(); }
        document.querySelectorAll('#voice-btn, #chat-voice-btn').forEach(b => b.style.color = '');
    };
    recognition.onend = () => document.querySelectorAll('#voice-btn, #chat-voice-btn').forEach(b => b.style.color = '');
}

function handleSend(inputEl) {
    const text = inputEl.value.trim();
    if (text || state.uploadedFiles.length) {
        handleUserMessage(text);
        inputEl.value = '';
        if(inputEl.id === 'message-input') { try{document.getElementById('chat-message-input').value = '';}catch(e){} }
        else { try{document.getElementById('message-input').value = '';}catch(e){} }
        inputEl.style.height = 'auto';
    }
}

async function handleUserMessage(text) {
    document.getElementById('welcome-view').classList.add('hidden');
    document.getElementById('chat-view').classList.remove('hidden');
    document.querySelectorAll('.smart-suggestions').forEach(el => el.remove());

    state.messages.push({ role: 'user', content: text, files: [...state.uploadedFiles] });
    state.uploadedFiles = [];
    renderFilesPreview();
    renderMessages();
    
    // Placeholder
    const msgIndex = state.messages.length;
    state.messages.push({ role: 'assistant', content: 'Thinking...', grounding: null, followUps: [], isThinking: true });
    renderMessages();

    try {
        const history = state.messages.slice(0, -1);
        const result = await state.client.chat(history);
        
        // Update placeholder
        state.messages[msgIndex] = {
            role: 'assistant',
            content: result.text,
            grounding: result.grounding,
            followUps: []
        };
        renderMessages();
        
        const suggestions = await state.client.generateSuggestions(history, result.text);
        if (suggestions.length) {
            state.messages[msgIndex].followUps = suggestions;
            renderMessages();
        }
        saveChat();
    } catch (error) {
        state.messages[msgIndex] = {
            role: 'assistant',
            content: `**Error:** ${error.message}\n\n*Note: If you see "Resource Exhausted", the API limit is reached for this model.*`,
            isError: true
        };
        renderMessages();
    }
}

function scrollToBottom() {
    const container = document.getElementById('messages-container');
    if(container) container.scrollTop = container.scrollHeight;
}

// --- RENDER ---
function renderMessages() {
    const container = document.getElementById('messages-container');
    if (!container) return;

    container.innerHTML = state.messages.map((msg, index) => {
        if (msg.role === 'user') {
            return `
                <div class="message user-message">
                    <div class="message-content">
                        ${msg.files?.map(f => `<img src="${f.preview}" style="max-width:200px; border-radius:8px; margin-bottom:8px; display:block;">`).join('') || ''}
                        ${escapeHTML(msg.content)}
                    </div>
                </div>`;
        } else {
            return createOriginalAssistantMessage(msg, index);
        }
    }).join('');
    
    scrollToBottom();
    setupActionListeners(); 
}

function createOriginalAssistantMessage(msg, index) {
    if (msg.isThinking) return `<div class="message assistant-message"><div class="message-content"><em>Heliox is typing...</em></div></div>`;

    const sourceCount = msg.grounding?.groundingChunks?.filter(c => c.web?.uri)?.length || 0;
    
    // Tabs
    const tabs = `
        <div class="response-tabs">
            <button class="response-tab active" data-tab="assistant"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> Assistant</button>
            <button class="response-tab" data-tab="links"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg> Links</button>
            <button class="response-tab" data-tab="images"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg> Images</button>
        </div>
    `;

    const actions = `
        <div class="message-actions">
            <button class="action-btn share-btn" title="Share"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></button>
            <button class="action-btn copy-btn" title="Copy"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
            <button class="action-btn regenerate-btn" data-index="${index}" title="Regenerate"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button>
            ${sourceCount > 0 ? `<button class="sources-badge" data-index="${index}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/></svg> ${sourceCount} sources</button>` : ''}
        </div>
    `;

    const sources = sourceCount > 0 ? `
        <div class="sources-section">
            <div class="sources-list hidden" id="sources-${index}">
                ${getSourcesListHTML(msg.grounding)}
            </div>
        </div>
    ` : '';

    const suggestions = (msg.followUps && msg.followUps.length) ? `
        <div class="smart-suggestions" style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
            ${msg.followUps.map(q => `<button class="suggestion-chip" onclick="handleUserMessage('${escapeHTML(q)}')">${escapeHTML(q)}</button>`).join('')}
        </div>
    ` : '';

    return `
        <div class="message assistant-message">
            ${tabs}
            <div class="message-content">${parseMarkdown(msg.content)}</div>
            ${actions}
            ${sources}
            ${suggestions}
        </div>
    `;
}

function getSourcesListHTML(grounding) {
    const chunks = grounding?.groundingChunks?.filter(c => c.web?.uri) || [];
    const unique = [...new Map(chunks.map(c => [c.web.uri, c.web])).values()];
    return unique.map(w => `<a href="${w.uri}" class="source-item" target="_blank" style="display:block; margin-bottom:4px; color:var(--accent-primary); text-decoration:none;">${escapeHTML(w.title)} <span style="font-size:0.8em; opacity:0.7;">(${new URL(w.uri).hostname})</span></a>`).join('');
}

function setupActionListeners() {
    document.querySelectorAll('.copy-btn').forEach(btn => btn.onclick = (e) => navigator.clipboard.writeText(e.target.closest('.message').querySelector('.message-content').innerText));
    document.querySelectorAll('.share-btn').forEach(btn => btn.onclick = async (e) => {
        const text = e.target.closest('.message').querySelector('.message-content').innerText;
        if (navigator.share) try { await navigator.share({ text }); } catch(err) {} else navigator.clipboard.writeText(text);
    });
    document.querySelectorAll('.sources-badge').forEach(badge => badge.onclick = () => {  document.getElementById(`sources-${badge.dataset.index}`)?.classList.toggle('hidden'); badge.classList.toggle('active'); });
    document.querySelectorAll('.regenerate-btn').forEach(btn => btn.onclick = () => {
        const idx = parseInt(btn.dataset.index);
        if (state.messages[idx-1]?.role === 'user') { const t = state.messages[idx-1].content; state.messages = state.messages.slice(0, idx-1); handleUserMessage(t); }
    });
}

function escapeHTML(str) { return str ? str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]) : ''; }
function parseMarkdown(text) { 
    if (!text) return '';
    let html = escapeHTML(text);
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    html = html.replace(/\n/g, '<br>');
    return html;
}
function toggleHistoryPanel() { document.getElementById('history-panel')?.classList.toggle('hidden'); }
function startNewChat() { state.messages = []; state.uploadedFiles = []; document.getElementById('welcome-view').classList.remove('hidden'); document.getElementById('chat-view').classList.add('hidden'); renderFilesPreview(); }
function saveChat() { localStorage.setItem('heliox_history', JSON.stringify(state.messages)); }
function loadHistory() { const saved = localStorage.getItem('heliox_history'); if (saved) { try { state.messages = JSON.parse(saved); if(state.messages.length) { renderMessages(); document.getElementById('welcome-view').classList.add('hidden'); document.getElementById('chat-view').classList.remove('hidden'); scrollToBottom(); } } catch(e){} } }
function downloadChat() { if(!state.messages.length) return; const t = state.messages.map(m=>`[${m.role}]\n${m.content}`).join('\n\n'); const b=new Blob([t],{type:'text/plain'}); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='chat.txt'; a.click(); }

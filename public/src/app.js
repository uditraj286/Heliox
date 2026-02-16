/**
 * Heliox - Main Application
 * Designed & Developed by Devreon Devs
 * Standalone version - works without external dependencies
 */

// App State
const state = {
    currentChatId: null,
    currentModel: 'gemini-3',
    messages: [],
    isLoading: false,
    theme: localStorage.getItem('heliox_theme') || 'light',
    uploadedFiles: []
};

// Initialize Application
document.addEventListener('DOMContentLoaded', init);

async function init() {
    setupTheme();
    setupEventListeners();
    setupInputHandlers();
    setupFileUpload();
    await loadChatsFromStorage();
    console.log('Heliox initialized - Designed & Developed by Devreon Devs');
}

// Theme Setup
function setupTheme() {
    if (state.theme === 'dark') {
        document.body.classList.add('dark');
    }
}

function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    document.body.classList.toggle('dark');
    localStorage.setItem('heliox_theme', state.theme);
}

// Event Listeners
function setupEventListeners() {
    // Theme toggle
    document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

    // Download chat button
    document.getElementById('download-chat-btn')?.addEventListener('click', downloadChat);
    
    // New chat button
    document.getElementById('new-chat-btn')?.addEventListener('click', startNewChat);
    
    // History button
    document.getElementById('history-btn')?.addEventListener('click', toggleHistoryPanel);
    
    // Close history
    document.getElementById('close-history')?.addEventListener('click', () => {
        document.getElementById('history-panel')?.classList.add('hidden');
    });
    
    // Clear history
    document.getElementById('clear-history-btn')?.addEventListener('click', clearAllChats);
    
    // Mobile sidebar toggle
    document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('collapsed');
    });
    
    // Model selector - Welcome screen
    document.getElementById('model-selector-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('model-dropdown')?.classList.toggle('show');
    });
    
    // Model selector - Chat screen
    document.getElementById('chat-model-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('chat-model-dropdown')?.classList.toggle('show');
    });
    
    // Close model dropdown on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.model-selector')) {
            document.querySelectorAll('.model-dropdown').forEach(d => d.classList.remove('show'));
        }
    });
    
    // Model selection
    document.querySelectorAll('.model-option:not(.disabled)').forEach(option => {
        option.addEventListener('click', () => {
            const modelId = option.dataset.model;
            state.currentModel = modelId;
            const modelName = modelId === 'gemini-3' ? 'Gemini 3' : 'GPT-5.2';
            document.querySelectorAll('[id$="selected-model-name"]').forEach(el => {
                el.textContent = modelName;
            });
            document.querySelectorAll('.model-dropdown').forEach(d => d.classList.remove('show'));
        });
    });
    
    // Quick action buttons
    document.querySelectorAll('.quick-action-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const prompt = btn.dataset.prompt;
            if (prompt) {
                document.getElementById('message-input').value = prompt;
                handleSendMessage(prompt);
            }
        });
    });
}

// File Upload
function setupFileUpload() {
    const fileInput = document.getElementById('file-input');
    const attachBtn = document.getElementById('attach-btn');
    const chatAttachBtn = document.getElementById('chat-attach-btn');
    
    // Welcome screen attach button
    attachBtn?.addEventListener('click', () => {
        fileInput?.click();
    });
    
    // Chat screen attach button
    chatAttachBtn?.addEventListener('click', () => {
        fileInput?.click();
    });
    
    // File input change
    fileInput?.addEventListener('change', handleFileSelect);
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    files.forEach(file => {
        if (file.size > 10 * 1024 * 1024) { // 10MB limit
            alert(`File "${file.name}" is too large. Maximum size is 10MB.`);
            return;
        }
        
        const fileData = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            name: file.name,
            type: file.type,
            size: file.size,
            file: file
        };
        
        // If it's an image, create preview
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                fileData.preview = e.target.result;
                state.uploadedFiles.push(fileData);
                renderFilesPreview();
            };
            reader.readAsDataURL(file);
        } else {
            state.uploadedFiles.push(fileData);
            renderFilesPreview();
        }
    });
    
    // Reset input
    e.target.value = '';
}

function renderFilesPreview() {
    const container = document.getElementById('files-preview');
    if (!container) return;
    
    if (state.uploadedFiles.length === 0) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
    }
    
    container.classList.remove('hidden');
    container.innerHTML = state.uploadedFiles.map(file => {
        const isImage = file.type.startsWith('image/');
        return `
            <div class="file-item" data-id="${file.id}">
                ${isImage && file.preview ? 
                    `<img src="${file.preview}" alt="${escapeHTML(file.name)}" class="file-image-preview">` :
                    `<svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>`
                }
                <span class="file-name">${escapeHTML(file.name)}</span>
                <button class="file-remove" data-id="${file.id}" aria-label="Remove file">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        `;
    }).join('');
    
    // Add remove listeners
    container.querySelectorAll('.file-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const fileId = btn.dataset.id;
            state.uploadedFiles = state.uploadedFiles.filter(f => f.id !== fileId);
            renderFilesPreview();
        });
    });
}

// Input Handlers
function setupInputHandlers() {
    const welcomeInput = document.getElementById('message-input');
    const welcomeSendBtn = document.getElementById('send-btn');
    
    if (welcomeInput && welcomeSendBtn) {
        welcomeInput.addEventListener('input', () => {
            welcomeSendBtn.disabled = !welcomeInput.value.trim();
            autoResizeTextarea(welcomeInput);
        });
        
        welcomeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (welcomeInput.value.trim()) {
                    handleSendMessage(welcomeInput.value);
                }
            }
        });
        
        welcomeSendBtn.addEventListener('click', () => {
            if (welcomeInput.value.trim()) {
                handleSendMessage(welcomeInput.value);
            }
        });
    }
}

function setupChatInputHandler() {
    const chatInput = document.getElementById('chat-message-input');
    const chatSendBtn = document.getElementById('chat-send-btn');
    
    if (chatInput && chatSendBtn) {
        chatInput.addEventListener('input', () => {
            chatSendBtn.disabled = !chatInput.value.trim();
            autoResizeTextarea(chatInput);
        });
        
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (chatInput.value.trim()) {
                    handleSendMessage(chatInput.value);
                    chatInput.value = '';
                    chatSendBtn.disabled = true;
                }
            }
        });
        
        chatSendBtn.addEventListener('click', () => {
            if (chatInput.value.trim()) {
                handleSendMessage(chatInput.value);
                chatInput.value = '';
                chatSendBtn.disabled = true;
            }
        });
    }
}

function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
}

// Chat Logic
async function handleSendMessage(message) {
    if (state.isLoading || !message.trim()) return;
    
    const sanitizedMessage = sanitizeInput(message);
    
    // Generate chat ID if new chat
    if (!state.currentChatId) {
        state.currentChatId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    // Add user message
    state.messages.push({
        role: 'user',
        content: sanitizedMessage,
        timestamp: Date.now()
    });
    
    // Switch to chat view
    showChatView();
    renderMessages();
    
    // Update title
    const chatTitle = sanitizedMessage.slice(0, 40) + (sanitizedMessage.length > 40 ? '...' : '');
    document.getElementById('chat-title').textContent = chatTitle;
    
    // Show typing indicator
    state.isLoading = true;
    showTypingIndicator();
    
    try {
        // Call the API
        const response = await callHelioxAPI(sanitizedMessage);
        
        // Add assistant message
        state.messages.push({
            role: 'assistant',
            content: response.answer,
            sources: response.sources || [],
            followUps: response.followUps || [],
            timestamp: Date.now()
        });
        
        // Save to local storage
        saveChat({
            id: state.currentChatId,
            title: chatTitle,
            model: state.currentModel,
            messages: state.messages,
            timestamp: state.messages[0]?.timestamp || Date.now()
        });
        
        
    } catch (error) {
        console.error('Chat error:', error);
        state.messages.push({
            role: 'assistant',
            content: `I apologize, but I couldn't process your request. ${error.message || 'Please try again.'}`,
            isError: true,
            timestamp: Date.now()
        });
        state.isLoading = false;
        hideTypingIndicator();
        renderMessages(false);
    }
}

// API Call - Uses gemini.js
async function callHelioxAPI(message) {
    // Use the askGemini function from gemini.js
    if (typeof window.askGemini === 'function') {
        const result = await window.askGemini(message);
        return {
            answer: result.answer,
            sources: result.sources || [],
            followUps: result.followUps || []
        };
    } else {
        console.error('askGemini not loaded!');
        return getDemoResponse(message);
    }
}

function formatAIResponse(text) {
    // Clean up and format the AI response
    return text;
}

function generateRelevantSources(query) {
    // Generate relevant source suggestions based on query
    const sources = [
        { title: 'Wikipedia', url: 'https://wikipedia.org', domain: 'wikipedia.org' },
        { title: 'Google Scholar', url: 'https://scholar.google.com', domain: 'scholar.google.com' },
        { title: 'Research Papers', url: 'https://arxiv.org', domain: 'arxiv.org' },
        { title: 'Documentation', url: 'https://docs.google.com', domain: 'docs.google.com' }
    ];
    return sources.slice(0, Math.floor(Math.random() * 3) + 2);
}

function generateFollowUps(query) {
    // Generate contextual follow-up questions
    const baseFollowUps = [
        'Can you explain more about this topic?',
        'What are the practical applications?',
        'How does this compare to alternatives?',
        'What are the latest developments?',
        'Can you provide examples?'
    ];
    return baseFollowUps.slice(0, 4);
}

function getSystemPrompt() {
    return `You are Heliox, an intelligent AI assistant created by Devreon Devs.

RESPONSE STYLE:
- Use bullet points with bold headers like: "- **Topic:** Explanation..."
- Keep responses conversational yet informative
- End with a friendly, encouraging conclusion
- Use markdown formatting for clarity

IDENTITY RULES:
- You are Heliox, not any other AI assistant
- Never mention underlying models, training, or providers
- If asked, say: "I'm Heliox, designed by Devreon Devs to help with accurate, grounded information."

TONE:
- Professional but friendly
- Research-focused and accurate
- Helpful and encouraging
- Clean and structured

Company: Devreon Devs - https://devreondevs.com`;
}

function getDemoResponse(message) {
    // Demo fallback when API not connected
    const lowerMsg = message.toLowerCase();
    
    let answer = `- **Your question:** ${message.slice(0, 80)}${message.length > 80 ? '...' : ''}\n\n`;
    answer += `- **Quick overview:** I'm Heliox, your AI research assistant powered by advanced language models. I deliver verified, source-backed answers with real-time grounding.\n\n`;
    answer += `- **Getting started:** To enable full functionality, connect the backend API to get grounded answers with web sources.\n\n`;
    answer += `Yo, as a developer building next-gen AI tools, dive into the documentation to unlock the full potential of Heliox—it's the key for creating intelligent, source-backed applications!\n\n`;
    answer += `*Designed & Developed by Devreon Devs*`;
    
    return {
        answer: answer,
        sources: [
            { title: 'Heliox Documentation', url: 'https://devreondevs.com', domain: 'devreondevs.com' },
            { title: 'Getting Started Guide', url: 'https://devreondevs.com/docs', domain: 'devreondevs.com' },
            { title: 'API Reference', url: 'https://devreondevs.com/api', domain: 'devreondevs.com' },
            { title: 'Deployment Guide', url: 'https://devreondevs.com/deploy', domain: 'devreondevs.com' },
            { title: 'Best Practices', url: 'https://devreondevs.com/best-practices', domain: 'devreondevs.com' },
            { title: 'Community Forum', url: 'https://community.devreondevs.com', domain: 'community.devreondevs.com' },
            { title: 'GitHub Repository', url: 'https://github.com/devreondevs', domain: 'github.com' },
            { title: 'Cloudflare Workers', url: 'https://workers.cloudflare.com', domain: 'workers.cloudflare.com' },
            { title: 'Gemini API Docs', url: 'https://ai.google.dev', domain: 'ai.google.dev' },
            { title: 'Tutorial Videos', url: 'https://youtube.com/@devreondevs', domain: 'youtube.com' }
        ],
        followUps: [
            'What are the main types of AI',
            'How does machine learning differ from traditional programming',
            'What are real-world applications of AI in healthcare',
            'What are the main risks and ethical concerns of AI',
            'What is the history of AI development milestones'
        ]
    };
}

// UI Functions
function showChatView() {
    document.getElementById('welcome-view')?.classList.add('hidden');
    document.getElementById('chat-view')?.classList.remove('hidden');
    setupChatInputHandler();
}

function showWelcomeView() {
    document.getElementById('welcome-view')?.classList.remove('hidden');
    document.getElementById('chat-view')?.classList.add('hidden');
    document.getElementById('chat-title').textContent = 'New Chat';
}



function renderMessages() {
    const container = document.getElementById('messages-container');
    if (!container) return;
    
    container.innerHTML = state.messages.map((msg, index) => {
        if (msg.role === 'user') {
            return `<div class="message user-message">
                <div class="message-content">${escapeHTML(msg.content)}</div>
            </div>`;
        } else {
            return createAssistantMessageHTML(msg, index);
        }
    }).join('');
    
    setupMessageActions();
    container.scrollTop = container.scrollHeight;
}

function createAssistantMessageHTML(msg, index) {
    const sourceCount = msg.sources?.length || 0;
    
    // Response tabs (Assistant, Links, Images)
    const tabsHTML = `
        <div class="response-tabs">
            <button class="response-tab active" data-tab="assistant">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                Assistant
            </button>
            <button class="response-tab" data-tab="links">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                </svg>
                Links
            </button>
            <button class="response-tab" data-tab="images">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                Images
            </button>
        </div>
    `;
    
    // Action buttons row with sources badge and feedback
    const actionsHTML = `
        <div class="message-actions">
            <button class="action-btn share-btn" title="Share">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="18" cy="5" r="3"></circle>
                    <circle cx="6" cy="12" r="3"></circle>
                    <circle cx="18" cy="19" r="3"></circle>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                </svg>
            </button>
            <button class="action-btn copy-btn" data-content="${escapeHTML(msg.content)}" title="Copy">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
            </button>
            <button class="action-btn edit-btn" title="Edit">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
            </button>
            <button class="action-btn regenerate-btn" title="Regenerate">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                </svg>
            </button>
            ${sourceCount > 0 ? `
                <button class="sources-badge" data-index="${index}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg>
                    ${sourceCount} sources
                </button>
            ` : ''}
            <div class="feedback-btns">
                <button class="feedback-btn like-btn" title="Good response">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                    </svg>
                </button>
                <button class="feedback-btn dislike-btn" title="Bad response">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path>
                    </svg>
                </button>
                <button class="feedback-btn more-btn" title="More options">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="1"></circle>
                        <circle cx="19" cy="12" r="1"></circle>
                        <circle cx="5" cy="12" r="1"></circle>
                    </svg>
                </button>
            </div>
        </div>
    `;
    
    // Sources section (hidden by default)
    const sourcesHTML = msg.sources?.length ? `
        <div class="sources-section">
            <div class="sources-list hidden" id="sources-${index}">
                ${msg.sources.map(s => `
                    <a href="${escapeHTML(s.url)}" class="source-item" target="_blank" rel="noopener">
                        <span class="source-domain">${escapeHTML(s.domain)}</span>
                        <span class="source-title">${escapeHTML(s.title)}</span>
                    </a>
                `).join('')}
            </div>
        </div>
    ` : '';
    
    // Follow-ups section
    const followUpsHTML = msg.followUps?.length ? `
        <div class="follow-ups-section">
            <h4 class="follow-ups-title">Follow-ups</h4>
            ${msg.followUps.map(q => `
                <button class="follow-up-btn" data-prompt="${escapeHTML(q)}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9 10 4 15 9 20"></polyline>
                        <path d="M20 4v7a4 4 0 0 1-4 4H4"></path>
                    </svg>
                    ${escapeHTML(q)}
                </button>
            `).join('')}
        </div>
    ` : '';
    
    return `
        <div class="message assistant-message ${msg.isError ? 'error' : ''}">
            ${tabsHTML}
            <div class="message-content">${parseMarkdown(msg.content)}</div>
            ${actionsHTML}
            ${sourcesHTML}
            ${followUpsHTML}
        </div>
    `;
}

function setupMessageActions() {
    // Follow-up buttons
    document.querySelectorAll('.follow-up-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const prompt = btn.dataset.prompt;
            if (prompt) handleSendMessage(prompt);
        });
    });
    
    // Sources badge toggle
    document.querySelectorAll('.sources-badge').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = btn.dataset.index;
            const list = document.getElementById(`sources-${index}`);
            list?.classList.toggle('hidden');
            btn.classList.toggle('active');
        });
    });
    
    // Copy button
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            navigator.clipboard.writeText(btn.dataset.content);
            const originalIcon = btn.innerHTML;
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            setTimeout(() => {
                btn.innerHTML = originalIcon;
            }, 2000);
        });
    });

    // Share button
    document.querySelectorAll('.share-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const messageEl = btn.closest('.message');
            const content = messageEl.querySelector('.message-content').textContent;
            
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: 'Heliox Response',
                        text: content
                    });
                } catch (err) {
                    // Start copy fallback
                    navigator.clipboard.writeText(content);
                    const originalIcon = btn.innerHTML;
                    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                    setTimeout(() => btn.innerHTML = originalIcon, 2000);
                }
            } else {
                navigator.clipboard.writeText(content);
                const originalIcon = btn.innerHTML;
                btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                setTimeout(() => btn.innerHTML = originalIcon, 2000);
            }
        });
    });

    // Like button
    document.querySelectorAll('.like-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('active');
            btn.querySelector('svg').style.fill = btn.classList.contains('active') ? 'currentColor' : 'none';
            // Remove dislike if active
            const dislikeBtn = btn.closest('.feedback-btns').querySelector('.dislike-btn');
            if (dislikeBtn.classList.contains('active')) {
                dislikeBtn.classList.remove('active');
                dislikeBtn.querySelector('svg').style.fill = 'none';
            }
        });
    });

    // Dislike button
    document.querySelectorAll('.dislike-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('active');
            btn.querySelector('svg').style.fill = btn.classList.contains('active') ? 'currentColor' : 'none';
            // Remove like if active
            const likeBtn = btn.closest('.feedback-btns').querySelector('.like-btn');
            if (likeBtn.classList.contains('active')) {
                likeBtn.classList.remove('active');
                likeBtn.querySelector('svg').style.fill = 'none';
            }
        });
    });
}

function downloadChat() {
    if (state.messages.length === 0) {
        alert('No chat history to download.');
        return;
    }
    
    let content = `Heliox Chat History - ${new Date().toLocaleString()}\n\n`;
    state.messages.forEach(msg => {
        const time = new Date(msg.timestamp).toLocaleTimeString();
        content += `[${msg.role.toUpperCase()}] (${time})\n${msg.content}\n\n`;
        if (msg.role === 'assistant' && msg.sources && msg.sources.length > 0) {
            content += `Sources:\n${msg.sources.map(s => `- ${s.title} (${s.url})`).join('\n')}\n\n`;
        }
    });
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `heliox-chat-${state.currentChatId || 'new'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function showTypingIndicator() {
    const container = document.getElementById('messages-container');
    if (!container) return;
    
    const indicator = document.createElement('div');
    indicator.id = 'typing-indicator';
    indicator.className = 'typing-indicator';
    indicator.innerHTML = '<span></span><span></span><span></span>';
    container.appendChild(indicator);
    container.scrollTop = container.scrollHeight;
}

function hideTypingIndicator() {
    document.getElementById('typing-indicator')?.remove();
}

// Chat Management
function startNewChat() {
    state.currentChatId = null;
    state.messages = [];
    showWelcomeView();
    document.getElementById('message-input').value = '';
    document.getElementById('message-input').focus();
}

function toggleHistoryPanel() {
    const panel = document.getElementById('history-panel');
    panel?.classList.toggle('hidden');
    if (!panel?.classList.contains('hidden')) {
        renderHistoryPanel();
    }
}

async function renderHistoryPanel() {
    const chats = await getAllChats();
    const list = document.getElementById('history-list');
    if (!list) return;
    
    if (chats.length === 0) {
        list.innerHTML = '<p class="history-empty">No chat history yet</p>';
        return;
    }
    
    list.innerHTML = chats.map(chat => `
        <div class="history-item" data-id="${escapeHTML(chat.id)}">
            <span class="history-title">${escapeHTML(chat.title || 'New Chat')}</span>
            <span class="history-date">${formatDate(chat.timestamp)}</span>
            <button class="delete-chat-btn" data-id="${escapeHTML(chat.id)}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </button>
        </div>
    `).join('');
    
    // Click to load chat
    list.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.delete-chat-btn')) {
                loadChat(item.dataset.id);
                document.getElementById('history-panel')?.classList.add('hidden');
            }
        });
    });
    
    // Delete button
    list.querySelectorAll('.delete-chat-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await deleteChat(btn.dataset.id);
            renderHistoryPanel();
            updateChatHistoryList();
        });
    });
}

async function loadChat(chatId) {
    const chats = await getAllChats();
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    
    state.currentChatId = chat.id;
    state.messages = chat.messages || [];
    state.currentModel = chat.model || 'gemini-3';
    
    document.getElementById('chat-title').textContent = chat.title || 'Chat';
    showChatView();
    renderMessages();
}

// Local Storage Functions
const STORAGE_KEY = 'heliox_chats';

function saveChat(chat) {
    try {
        const chats = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        const index = chats.findIndex(c => c.id === chat.id);
        if (index >= 0) {
            chats[index] = chat;
        } else {
            chats.unshift(chat);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(chats.slice(0, 50)));
        updateChatHistoryList();
    } catch (e) {
        console.error('Failed to save chat:', e);
    }
}

async function getAllChats() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
        return [];
    }
}

async function deleteChat(chatId) {
    try {
        const chats = await getAllChats();
        const filtered = chats.filter(c => c.id !== chatId);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
        
        if (state.currentChatId === chatId) {
            startNewChat();
        }
    } catch (e) {
        console.error('Failed to delete chat:', e);
    }
}

async function clearAllChats() {
    if (confirm('Are you sure you want to clear all chat history?')) {
        localStorage.removeItem(STORAGE_KEY);
        startNewChat();
        renderHistoryPanel();
        updateChatHistoryList();
    }
}

async function loadChatsFromStorage() {
    updateChatHistoryList();
}

async function updateChatHistoryList() {
    const chats = await getAllChats();
    const list = document.getElementById('chat-history-list');
    if (!list) return;
    
    list.innerHTML = chats.slice(0, 5).map(chat => `
        <button class="chat-history-item" data-id="${escapeHTML(chat.id)}">
            ${escapeHTML(chat.title || 'New Chat')}
        </button>
    `).join('');
    
    list.querySelectorAll('.chat-history-item').forEach(item => {
        item.addEventListener('click', () => loadChat(item.dataset.id));
    });
}

// Utility Functions
function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input.trim().replace(/[<>]/g, c => c === '<' ? '&lt;' : '&gt;');
}

function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return str.replace(/[&<>"']/g, c => map[c]);
}

function parseMarkdown(text) {
    if (!text) return '';
    let html = escapeHTML(text);
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    html = html.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    return `<p>${html}</p>`;
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 86400000) {
        return 'Today';
    } else if (diff < 172800000) {
        return 'Yesterday';
    } else {
        return date.toLocaleDateString();
    }
}

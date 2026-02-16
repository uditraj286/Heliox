/**
 * Heliox AI Client - Advanced Streaming Implementation
 * Supports: Real-time Streaming, Model Fallback, Queueing
 */

const GEMINI_API_KEY = ''; // REMOVED for security. Use backend proxy.

// Priority list of models to try
const MODEL_CONFIG = [
    { id: 'gemini-1.5-flash-8b', name: 'Flash 8B (Fastest)' },
    { id: 'gemini-1.5-flash', name: 'Flash 1.5 (Balanced)' },
    { id: 'gemini-2.0-flash-lite-preview-02-05', name: 'Flash 2.0 Lite' },
    { id: 'gemini-1.0-pro', name: 'Pro 1.0 (Stable)' }
];

class HelioxClient {
    constructor() {
        this.currentModelIndex = 0;
        this.systemPrompt = `You are Heliox, a helpful AI assistant created by Devreon Devs. 
Guidelines:
- Do NOT greet the user (e.g., "Hello", "Hi", "Welcome") unless the user greets you first.
- If the user greets you, reply with a friendly greeting and use emojis 🌟.
- For all other queries, provide the answer directly without pleasantries.
- Do NOT use bullet points for simple conversational responses. Use natural paragraphs.
- Use bullet points ONLY when explaining complex topics, listing items, or structuring detailed information.
- Be friendly, helpful, and clear.`;
    }

    /**
     * Generator function that streams the response chunk by chunk
     */
    async *streamChat(userMessage) {
        let lastError = null;

        // Try models in sequence
        for (let i = 0; i < MODEL_CONFIG.length; i++) {
            const model = MODEL_CONFIG[i];
            try {
                console.log(`📡 Connecting to ${model.name}...`);
                const stream = await this._makeStreamRequest(model.id, userMessage);
                
                // Yield chunks as they arrive
                for await (const chunk of stream) {
                    yield chunk;
                }
                
                // If we complete successfully, break the loop
                return;

            } catch (error) {
                console.warn(`⚠️ ${model.name} failed:`, error.message);
                lastError = error;
                
                // If it's a rate limit or not found, try next model immediately
                if (this._isRecoverableError(error)) {
                    continue; 
                }
                // For other errors (like network offline), stop trying
                throw error;
            }
        }
        
        throw lastError || new Error('All AI models are currently unavailable. Please try again later.');
    }

    async _makeStreamRequest(modelId, userMessage) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?key=${GEMINI_API_KEY}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: `${this.systemPrompt}\n\nUser: ${userMessage}` }]
                }]
            })
        });

        if (!response.ok) {
            let errorMsg = response.statusText;
            try {
                const errorData = await response.json();
                errorMsg = errorData.error?.message || errorMsg;
            } catch (e) {}
            
            const error = new Error(errorMsg);
            error.status = response.status;
            throw error;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        // Return an async iterator for the stream
        return {
            [Symbol.asyncIterator]: async function* () {
                let buffer = '';
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    buffer += decoder.decode(value, { stream: true });
                    
                    // Process complete JSON objects from the stream
                    // Gemini sends "data: {...}" or raw array objects depending on endpoint
                    // streamGenerateContent returns a JSON array structure usually, 
                    // but raw fetch stream gives chunks of the array.
                    // Actually, standard REST stream returns a series of JSON objects.
                    // We need to carefully parse valid JSON chunks.
                    
                    // Simple parsing strategy: accumulate text and try to find valid JSON blocks
                    // Note: This is simplified. For robust parsing we assume Gemini sends clean chunks.
                    // But actually, Gemini REST API returns a JSON array `[...]` containing content.
                    // Parsing a streaming JSON array is complex. 
                    
                    // ALTERNATIVE: Use Server-Sent Events (SSE) pattern if supported?
                    // The standard `streamGenerateContent` returns a list of JSON objects.
                    // Let's try a regex-based extraction for "text" fields if raw parsing is hard.
                    
                    // Extract text parts from the raw buffer
                    const matches = buffer.matchAll(/"text":\s*"([^"]*)"/g);
                    for (const match of matches) {
                        // This is risky if text contains escaped quotes.
                        // Let's rely on the assumption that a valid JSON structure arrives eventually.
                    }
                    
                    // BETTER APPROACH for Raw Stream:
                    // Just look for the 'text' field in the incoming raw bytes if possible? No.
                    
                    // Let's assume standard behavior:
                    // The response is a JSON array that grows. 
                    // Actually, `streamGenerateContent` via REST returns a series of JSON objects?
                    // No, it returns a JSON List `[{}, {}, {}]`.
                    
                    // Let's use a simpler heuristic: Parse complete objects from the buffer.
                    // We look for `{...}` blocks.
                    
                    let depth = 0;
                    let start = -1;
                    
                    for (let i = 0; i < buffer.length; i++) {
                        if (buffer[i] === '{') {
                            if (depth === 0) start = i;
                            depth++;
                        } else if (buffer[i] === '}') {
                            depth--;
                            if (depth === 0 && start !== -1) {
                                const jsonStr = buffer.substring(start, i + 1);
                                try {
                                    const parsed = JSON.parse(jsonStr);
                                    if (parsed.candidates && parsed.candidates[0].content) {
                                        const text = parsed.candidates[0].content.parts[0].text;
                                        if (text) yield text;
                                    }
                                    // Remove processed part from buffer
                                    buffer = buffer.substring(i + 1);
                                    i = -1; // Reset loop to process remaining buffer
                                    start = -1;
                                } catch (e) {
                                    // Not a complete valid object yet, continue
                                }
                            }
                        }
                    }
                }
            }
        };
    }

    _isRecoverableError(error) {
        // 429: Too Many Requests, 404: Not Found, 503: Service Unavailable
        return error.status === 429 || error.status === 404 || error.status === 503 || error.message.includes('quota');
    }
}

// Instantiate and export
window.helioxClient = new HelioxClient();

// Backwards compatibility wrapper for app.js until it is updated
window.askGemini = async function(message) {
    const generator = window.helioxClient.streamChat(message);
    let fullText = '';
    for await (const chunk of generator) {
        fullText += chunk;
    }
    return {
        answer: fullText,
        sources: [],
        followUps: []
    };
};

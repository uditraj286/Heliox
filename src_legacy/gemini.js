/**
 * Gemini API Handler for Heliox
 * Clean, simple implementation
 */

const GEMINI_API_KEY = '';

// Simple Gemini API call
async function askGemini(userMessage) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    const systemPrompt = `You are Heliox, a helpful AI assistant created by Devreon Devs. 
Format your responses with:
- Bullet points using bold headers like "- **Topic:** explanation"
- Be friendly and helpful
- Keep responses clear and structured`;

    const requestData = {
        contents: [{
            parts: [{
                text: `${systemPrompt}\n\nUser: ${userMessage}`
            }]
        }]
    };

    try {
        console.log('📤 Sending request to Gemini...');
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        const result = await response.json();
        console.log('📥 Gemini Response:', result);

        if (result.error) {
            throw new Error(result.error.message);
        }

        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!text) {
            throw new Error('No response text received');
        }

        console.log('✅ Success!');
        return {
            success: true,
            answer: text,
            sources: [
                { title: 'Heliox AI', url: 'https://devreondevs.com', domain: 'devreondevs.com' }
            ],
            followUps: [
                'Tell me more about this',
                'What are the practical applications?',
                'Can you give an example?'
            ]
        };

    } catch (error) {
        console.error('❌ Gemini Error:', error.message);
        return {
            success: false,
            error: error.message,
            answer: `**Heliox Response:**\n\nI received your message: "${userMessage}"\n\nCurrently running in demo mode. The AI will respond once the API connection is established.\n\n*Powered by Devreon Devs*`,
            sources: [],
            followUps: ['How do I connect the API?', 'What features are available?']
        };
    }
}

// Export for use in app.js
window.askGemini = askGemini;

// Test function - run in console: testGemini()
window.testGemini = async function() {
    console.log('🧪 Testing Gemini API...');
    const result = await askGemini('Hello, what is AI?');
    console.log('Result:', result);
    return result;
};

console.log('✅ Gemini API loaded. Test with: testGemini()');

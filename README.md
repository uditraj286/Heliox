# Heliox - AI Assistant with Grounded Search

**Designed & Developed by [Devreon Devs](https://devreondevs.com)**

A production-ready AI chatbot delivering verified, source-backed answers using Google Grounding technology.

## Features

- **Grounded Search**: Every answer is verified with live Google search
- **Source Citations**: Clear attribution with clickable source links
- **Follow-up Questions**: Intelligent context-aware suggestions
- **Firebase Authentication**: Secure email/password login
- **Local Chat Storage**: IndexedDB-based chat persistence
- **Model Selection**: Gemini 3 (active) + GPT-5.2 (coming soon)
- **Spotify Integration**: Create playlists from chat context
- **Dark Mode**: Full theme support
- **Mobile Responsive**: Works on all devices

## Project Structure

```
/public
  index.html      # Main HTML entry
  styles.css      # All CSS styles
/src
  app.js          # Main application
  auth.js         # Firebase authentication
  chat.js         # Chat & Gemini API
  models.js       # Model configuration
  spotify.js      # Spotify integration
  storage.js      # IndexedDB storage
  security.js     # Input sanitization
  firebase.js     # Firebase setup
/server
  worker.js       # Cloudflare Worker API
  wrangler.toml   # Worker configuration
/assets
  logo.svg        # Brand logo
/env
  config.example.js  # Configuration template
```

## Setup

### 1. Clone and Install

```bash
git clone <repository>
cd heliox
npm install
```

### 2. Configure Environment

Copy the config template and add your keys:

```javascript
// In your HTML or as environment variables
window.HELIOX_PROXY_ENDPOINT = 'https://your-worker.workers.dev';
window.HELIOX_FIREBASE_API_KEY = 'your-firebase-key';
// ... other Firebase config
```

### 3. Deploy Backend (Cloudflare Workers)

```bash
# Login to Cloudflare
npx wrangler login

# Add your Gemini API key as a secret
cd server
npx wrangler secret put HELIOX_GEMINI_API_KEY

# Deploy
npm run deploy:worker
```

### 4. Deploy Frontend (Cloudflare Pages)

```bash
# Via Cloudflare Dashboard:
# 1. Create new Pages project
# 2. Connect your repository
# 3. Set build output directory: public
# 4. Deploy
```

## Local Development

```bash
# Start local frontend server (Terminal 1)
npm run dev

# In another terminal, start the local backend server (Terminal 2)
# This runs a lightweight Node.js server at http://localhost:8787
npm run dev:worker
```

## Security

- **No API keys in frontend**: All keys stored in backend
- **Input sanitization**: XSS protection on all inputs
- **Rate limiting**: 30 requests/minute per IP
- **CSP headers**: Content Security Policy enabled
- **CORS**: Properly configured for security

## API Endpoints

### POST /chat

Request:
```json
{
  "message": "What is quantum computing?",
  "model": "gemini-3",
  "history": [],
  "systemPrompt": "...",
  "enableGrounding": true
}
```

Response:
```json
{
  "answer": "Structured editorial response...",
  "sources": [
    {
      "title": "Source Title",
      "url": "https://example.com",
      "domain": "example.com"
    }
  ],
  "followUps": [
    "Related question 1",
    "Related question 2"
  ]
}
```

## Branding

- **Product**: Heliox
- **Developer**: Devreon Devs
- **Website**: https://devreondevs.com

The AI never reveals underlying model names (Gemini, GPT, etc.) and presents itself as an independent product.

## License

MIT License - See LICENSE file for details.

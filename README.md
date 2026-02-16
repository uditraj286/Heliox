# 🌌 Heliox - AI Assistant with Grounded Search

**Designed & Developed by [Devreon Devs](https://devreondevs.com)**

Heliox is a production-grade AI chatbot that delivers verified, source-backed answers using Google Grounding technology. It is built for researchers, developers, and power users who need accuracy and real-time intelligence.

---

## 🚀 Live Demo
[Check out Heliox here](https://heliox.devreondevs.com)

---

## ✨ Key Features

- **🔍 Grounded Search**: Real-time verification via Google Search for every answer.
- **📚 Source Citations**: Interactive source cards with direct links and favicons.
- **⚡ SSE Streaming**: Smooth, real-time typing effect (ChatGPT-style).
- **🛡️ Secure Backend**: API keys are protected in a Cloudflare Worker proxy (never exposed).
- **🎵 Spotify Integration**: Context-aware music playback directly inside the dashboard.
- **🎨 Devreon Branding**: Premium executive interface with full Dark Mode support.

---

## 🛠️ Tech Stack

- **Frontend**: Vanilla JS, CSS3, HTML5 (High performance, no bloat)
- **Backend**: Cloudflare Workers (Serverless API Gateway)
- **AI Model**: Google Gemini 2.0 Flash
- **Auth**: Firebase Authentication
- **Storage**: IndexedDB (Local chat history persistence)

---

## 🏗️ Getting Started (For Developers)

### 1. Prerequisites
- [Node.js](https://nodejs.org/) installed.
- A [Cloudflare account](https://dash.cloudflare.com/) for the backend.
- A [Gemini API Key](https://aistudio.google.com/).

### 2. Local Setup
```bash
# Clone the repository
git clone https://github.com/uditraj286/Heliox.git
cd Heliox

# Install dependencies
npm install

# Start the local backend (Port 8787)
cd server
node local-server.cjs

# Start the frontend (Port 3000)
# (In a new terminal)
npx http-server public -p 3000
```

### 3. Production Deployment

#### Backend (Cloudflare Workers)
```bash
cd server
npx wrangler login
npx wrangler secret put HELIOX_GEMINI_API_KEY # Paste your key when prompted
npx wrangler deploy
```

#### Frontend (GitHub Pages / Cloudflare Pages)
1. Point your hosting provider to the `public/` directory.
2. Ensure your `BACKEND_URL` in `public/src/heliox-grounding-stream.js` points to your deployed worker.

---

## 🤝 Contribution
Developed by **Udit Raj** and the **Devreon Devs** team. We welcome contributions to make Heliox the standard for grounded AI assistants.

## 📄 License
MIT License. Created with 🌌 for the Devreon Ecosystem.

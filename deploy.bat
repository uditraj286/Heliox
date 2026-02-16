@echo off
echo 🌌 Heliox Production Deployment Helper
echo ---------------------------------------
echo.
cd /d "D:\chatbot ai\server"
echo 1. Login to Cloudflare...
npx wrangler login
echo.
echo 2. Setting API Secret...
npx wrangler secret put HELIOX_GEMINI_API_KEY
echo.
echo 3. Deploying Backend Worker...
npx wrangler deploy
echo.
echo ---------------------------------------
echo ✅ Deployment sequence complete.
pause

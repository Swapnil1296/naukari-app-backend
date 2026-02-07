# Backend Server Setup

## Quick Start

1. **Install dependencies:**
```bash
cd backend
npm install
```

2. **Configure environment:**
```bash
# Copy example and edit with your credentials
cp .env.example .env
```

Edit `.env` with your actual credentials:
```env
PORT=3001
NAUKRI_USERNAME=your_naukri_email@gmail.com
NAUKRI_PASSWORD=your_password
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password
EMAIL_RECIPIENT=recipient@gmail.com
OPENAI_API_KEY=sk-proj-...
FRONTEND_URL=http://localhost:3000
```

3. **Start server:**
```bash
npm start
```

Server runs on `http://localhost:3001`

## Environment Variables

### Required
- `NAUKRI_USERNAME` - Your Naukri.com login email
- `NAUKRI_PASSWORD` - Your Naukri.com password
- `EMAIL_USER` - Gmail address for sending notifications
- `EMAIL_PASS` - Gmail app password (not regular password)

### Optional
- `PORT` - Server port (default: 3001)
- `EMAIL_RECIPIENT` - Where to send job notifications
- `OPENAI_API_KEY` - For AI-powered job matching
- `FRONTEND_URL` - Frontend URL for CORS (default: http://localhost:3000)

## Gmail App Password

To get Gmail app password:
1. Go to Google Account settings
2. Security → 2-Step Verification
3. App passwords
4. Generate new app password
5. Use that password in `EMAIL_PASS`

## API Endpoints

- `GET /health` - Health check
- `GET /api/status` - Scraper status
- `POST /api/scrape/start` - Start scraper
- `POST /api/scrape/stop` - Stop scraper
- `GET /api/scrape/logs` - Get logs
- `POST /api/reset-counter` - Reset daily counter
- `GET /api/session/status` - Check session files
- `DELETE /api/session/clear` - Clear sessions

## Troubleshooting

### "text is not iterable" error
**Cause:** Environment variables not loaded
**Fix:** 
1. Check `.env` file exists in `backend/` folder
2. Verify all credentials are set
3. Restart server

### Email errors
**Cause:** Missing or invalid email credentials
**Fix:**
1. Use Gmail app password, not regular password
2. Enable 2-factor authentication on Gmail
3. Generate app-specific password

### Session issues
**Cause:** Corrupted session files
**Fix:** Use the "Clear Sessions" button in UI or delete `*session.json` files

## Development

```bash
# Start with auto-reload (if using nodemon)
npm run dev

# Check logs
tail -f ../scraper-errors.log
```

## Deployment

### Deploy on Render

1. **Connect repo:** In [Render Dashboard](https://dashboard.render.com) → **New** → **Web Service** → connect your Git repo (use the `backend` folder as **Root Directory** if the repo is the full app).

2. **Settings:**
   - **Runtime:** Node
   - **Build Command:** `npm install && npx puppeteer browsers install chrome`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/health` (optional)

3. **Environment variables** (Dashboard → Environment): set at least:
   - `NODE_ENV` = `production`
   - `PUPPETEER_HEADLESS` = `true`
   - `PUPPETEER_CACHE_DIR` = `/opt/render/project/src/.cache/puppeteer` (so Chrome is found at runtime)
   - `PORT` is set by Render; add `MONGODB_URI`, `NAUKRI_USERNAME`, `NAUKRI_PASSWORD`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_RECIPIENT`, `FRONTEND_URL` (and `OPENAI_API_KEY` if using AI).

4. **Optional:** Use the included `render.yaml` (Render Blueprint) to define the service; override or add env vars in the Dashboard.

**Note:** Scraping/auto-apply uses Puppeteer; on Render the browser runs headless. For heavy or long-running scrapes, consider memory/time limits on the free tier.

**Email on Render:** If you get "Connection timeout" with Gmail, use a Gmail App Password (not your normal password), and ensure your Render service can reach `smtp.gmail.com:465`. Some networks block outbound SMTP; if it still fails, consider a transactional email provider (e.g. SendGrid, Resend).

See `../README-DEPLOYMENT.md` for Railway deployment if needed.

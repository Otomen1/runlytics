# ⚡ Runlytics — GPX Running Coach

A 100% offline running analytics platform. Upload GPX files from any GPS watch or app and get deep coaching insights — no account, no backend, no Strava required.

---

## Project Structure

```
runlytics/
├── public/
│   └── favicon.svg          # App icon
├── src/
│   ├── App.jsx              # Full application (all-in-one)
│   └── main.jsx             # React entry point
├── index.html               # HTML shell
├── package.json             # Dependencies
├── vite.config.js           # Vite build config
├── vercel.json              # Vercel deploy config
├── .gitignore
└── README.md
```

---

## Run Locally

```bash
# 1. Install dependencies
npm install

# 2. Start dev server
npm run dev

# App opens at http://localhost:3000
```

---

## Deploy to Vercel (free, permanent URL)

### Option A — Vercel CLI (fastest)
```bash
npm install -g vercel
vercel
# Follow prompts → get live URL in ~60 seconds
```

### Option B — GitHub + Vercel (auto-deploy on every update)

1. Push this folder to a GitHub repo:
```bash
git init
git add .
git commit -m "Initial Runlytics setup"
git remote add origin https://github.com/YOUR_USERNAME/runlytics.git
git push -u origin main
```

2. Go to **vercel.com** → Import Project → Select your repo → Deploy

Every time you update `src/App.jsx` and push to GitHub, Vercel auto-redeploys within ~60 seconds.

### Option C — Drag & Drop to Vercel

```bash
npm run build
```
Then drag the `/dist` folder to **vercel.com/new** → instant deploy.

---

## Deploy to Netlify

```bash
npm run build
# Drag /dist folder to netlify.com/drop
```

Or connect GitHub repo at app.netlify.com for auto-deploy.

---

## Update the App (after Claude builds new features)

1. Open `src/App.jsx`
2. Select all → paste new code from Claude
3. Save → Vite auto-reloads locally
4. Push to GitHub → Vercel auto-deploys

---

## How to Get GPX Files

| App | Steps |
|-----|-------|
| **Strava** | Activity page → ⋮ menu → Export GPX |
| **Garmin** | connect.garmin.com → Activity → Export → GPX |
| **Coros** | Coros app → Activity → Share → GPX |
| **Apple Watch** | WorkOutDoors app → Export GPX |
| **Polar** | Flow → Training → Export GPX |
| **Suunto** | App → Activity → Export GPX |

---

## Features

- 📊 **Dashboard** — streak, consistency, weekly volume, monthly comparison
- 🧠 **Coach Insights** — structured signal / risk / recommendation cards
- 🗺️ **Route Map** — SVG GPS route with start/end markers
- 📈 **Pace Chart** — with avg reference line and faster/slower highlighting
- ⛰️ **Elevation Profile** — noise-filtered with 3m threshold + Gaussian smoothing
- ❤️ **HR Zones** — time in minutes per zone, overtraining detection
- ⚡ **Training Load** — score 0–100 per activity based on HR × duration
- 🎯 **Smart Goals** — weekly/monthly targets with daily average needed
- 🔮 **Race Predictions** — 5K, 10K, Half Marathon via Riegel formula
- 🔥 **Streak Tracker** — consecutive run days

---

## Tech Stack

- **React 18** + **Vite 5**
- **Recharts** for all charts
- **localStorage** for data persistence
- Zero backend · Zero API keys · 100% offline

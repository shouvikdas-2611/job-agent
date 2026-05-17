# 🎯 Job Agent — AI-Powered Job Digest Service

Upload your resume once. Get AI-curated, ranked job matches delivered to your inbox — India academic roles first.

> 💡 **First time setting up?** Read `SETUP_NOTES.md` — it captures every error hit during the original installation and exactly how each was fixed.

---

## ✨ Features

- **AI Resume Parsing** — Gemini reads your resume and extracts skills, experience, seniority, and ideal job titles automatically
- **Frequency recommendation** — AI suggests daily/weekly/biweekly based on your profile type, with a reason
- **Instant digest on signup** — First job email arrives within 2–5 minutes of uploading your resume
- **Live progress bar** — See exactly what the agent is doing in real time (searching → scoring → deadline check → sending)
- **"Send now" button** — Trigger a fresh digest any time from the website
- **Reset sent history** — Clear the dedup log so all jobs appear fresh again (useful for testing)
- **🇮🇳 India-first priority** — 4-tier search, each tier independently contributes its top 5:
  1. **India Academic** — IITs, IIMs, IISc, NITs, IIITs via FacultyPlus, FacultyTick, direct portals
  2. **India Industry** — corporate roles via JSearch + Adzuna
  3. **Abroad Academic** — jobs.ac.uk, EURAXESS, HigherEdJobs
  4. **Abroad Industry** — off by default, opt-in only
- **Deadline detection** — Extracts application deadlines from job descriptions, flags expired/urgent/open postings with colour-coded badges
- **Smart ranking** — Gemini scores each job 0–100, with salary and remote-preference penalties
- **"Why matched" reasoning** — Every job card shows a specific sentence explaining why it was included
- **Deduplication** — Never see the same job twice across digests

---

## 💰 Cost — Fully Free

| Service | Usage | Cost |
|---|---|---|
| Google Gemini 2.5 Flash | Resume parsing + job scoring + deadline extraction | **Free** (15 RPM, 1M tokens/day) |
| JSearch (RapidAPI) | Job aggregation — Indeed, LinkedIn, Glassdoor, ZipRecruiter | **Free** (150 req/mo) |
| Adzuna | India industry jobs | **Free** (250 req/mo) |
| FacultyPlus / FacultyTick | India academic RSS aggregators | **Free** |
| IIT/IIM/IISc direct scraping | 14 premier institutions | **Free** |
| Turso | Cloud SQLite database | **Free** (500 MB) |
| Render | 24/7 hosting | **Free** (750 hrs/mo) |
| Gmail | Email delivery | **Free** (500/day) |
| **Total** | | **$0/month** |

---

## 🔑 API Keys Required (all free)

| Key | Where to get | Time |
|---|---|---|
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) → **"Create API key in new project"** | 2 min |
| `RAPIDAPI_KEY` | [rapidapi.com/jsearch](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch) → Subscribe free | 3 min |
| `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` | [developer.adzuna.com](https://developer.adzuna.com) → Register | 3 min |
| `EMAIL_USER` + `EMAIL_PASSWORD` | Gmail + [App Password](https://myaccount.google.com/apppasswords) (not your real password) | 3 min |
| `TURSO_DB_URL` + `TURSO_AUTH_TOKEN` | [turso.tech](https://turso.tech) → Create DB → Connect tab | 2 min |

> ⚠️ **Gemini key:** Always use **"Create API key in new project"** — existing projects may have `limit: 0` on the free tier.
> ⚠️ **Gmail App Password:** Paste the 16 characters **without spaces**. Enable 2FA first or the option won't appear.

---

## 🚀 Local Setup

### 1. Install dependencies
```bash
cd job-agent
npm install --ignore-scripts
```
> The `--ignore-scripts` flag is required — skips native C++ compilation that fails on some machines.

### 2. Configure environment
```bash
cp .env.example .env
# Fill in all your API keys
```

### 3. Test email first
```bash
node src/test-email.js your@gmail.com
```
You should receive a sample digest within 30 seconds. Fix `.env` before continuing if this fails.

### 4. Start the server
```bash
npm start
```
Open **http://localhost:3000** — upload your resume, fill in the form, and subscribe.

---

## 🌐 Deploy to Render (free, 24/7)

### Prerequisites
- Code pushed to a GitHub repo
- Turso database created at [turso.tech](https://turso.tech) (region: Mumbai or Singapore)

### Steps
1. [render.com](https://render.com) → **New Web Service** → connect GitHub repo
2. **Build command:** `npm install --ignore-scripts`
3. **Start command:** `npm start`
4. **Region:** Singapore
5. **Plan:** Free
6. Add all 12 environment variables (see `.env.example`)
7. Click **Create Web Service** — live in ~3 minutes

### Environment variables to add in Render
```
GEMINI_API_KEY          → your AIza... key
RAPIDAPI_KEY            → your RapidAPI key
ADZUNA_APP_ID           → your Adzuna App ID
ADZUNA_APP_KEY          → your Adzuna App Key
EMAIL_SERVICE           → gmail
EMAIL_USER              → yourname@gmail.com
EMAIL_PASSWORD          → your 16-char App Password (no spaces)
EMAIL_FROM_NAME         → Job Agent
TURSO_DB_URL            → libsql://jobagent-yourname.turso.io
TURSO_AUTH_TOKEN        → eyJ... your Turso token
NODE_ENV                → production
PORT                    → 3000
```

> **After changing env vars in Render:** push a new commit or click Manual Deploy — Render does not auto-redeploy on env var changes alone.

---

## 🇮🇳 India Academic Sources (Primary Tier)

| Source | Coverage | Method |
|---|---|---|
| **FacultyPlus.com** | IITs, IIMs, IISc, NITs, IIITs, private universities | 8 RSS category feeds |
| **FacultyTick.com** | Backup aggregator | RSS feed |
| **IIT Delhi / Madras / Bombay / Kanpur / Kharagpur / Roorkee** | Direct faculty pages | HTML scraping |
| **IIT Guwahati / Hyderabad / Indore / Gandhinagar** | Direct faculty pages | HTML scraping |
| **IISc Bangalore** | Open positions page | HTML scraping |
| **IIM Ahmedabad / Bangalore / Calcutta** | Faculty recruitment pages | HTML scraping |
| **JSearch (India + academic filter)** | Cross-listed university roles on Indeed/LinkedIn India | API |

---

## 📧 Email Digest Layout

Each job card shows:
- **Match score** (0–100%) with colour coding
- **Why matched** — specific sentence from Gemini explaining the match
- **Deadline badge** — one of:
  - 🔴 Deadline passed — 15 May 2026 (closed 3 days ago)
  - ⚠️ Closes TODAY
  - 🟠 Closing soon — 3 days left
  - 🟢 Open — 44 days left
  - ⚪ No deadline mentioned
- **Remote badge** if applicable
- **Salary** if listed
- Apply button (greyed out with "deadline passed" text if expired)

```
🎯 Your Job Matches — 14 curated openings this week
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎓 India — Academic & Faculty (Top Priority)  (5 roles)
   Assistant Professor CS @ IIT Bombay              92%
   Why matched: Strong ML PhD match, PyTorch stack aligns
   🟢 Open — 16 June 2026 (30 days left)

💼 India — Industry Roles  (5 roles)
   ...

🌍 Abroad — Academic & Research  (4 roles)
   ...
```

---

## 🛠 API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/subscribe` | Upload resume, subscribe, trigger instant digest |
| `POST` | `/api/run-now` | Send digest immediately `{ email }` |
| `POST` | `/api/reset-sent` | Clear sent-jobs history `{ email }` — jobs appear fresh again |
| `GET`  | `/api/progress/:email` | Poll live progress status (step, %, detail, done) |
| `POST` | `/api/unsubscribe` | Opt out `{ email }` |
| `GET`  | `/api/subscriptions` | List active subscriptions |
| `GET`  | `/api/health` | Health check |

---

## 📁 Project Structure

```
job-agent/
├── src/
│   ├── server.js                 Express server + all routes
│   ├── database.js               Turso (libsql) — auto-falls-back to local SQLite in dev
│   ├── resume-parser.js          PDF/DOCX → Gemini → profile + frequency recommendation
│   ├── india-academic-search.js  FacultyPlus, FacultyTick, 14 IIT/IIM/IISc direct pages
│   ├── academic-search.js        Abroad academic — jobs.ac.uk, EURAXESS, HigherEdJobs
│   ├── job-search.js             4-tier orchestrator
│   ├── job-matcher.js            Gemini scoring, top-5-per-tier, salary/remote penalties
│   ├── deadline-extractor.js     Regex + Gemini deadline detection + status badges
│   ├── email-sender.js           HTML email with all badges + reasoning
│   ├── scheduler.js              Cron jobs + live progress tracking
│   └── test-email.js             Email config tester
├── templates/
│   └── index.html                Web UI — subscribe, send-now, reset-sent, progress bar
├── SETUP_NOTES.md                Installation log — errors faced and fixes applied
├── README.md                     This file
├── package.json
├── .env.example                  All key slots with instructions
└── .gitignore
```

---

## 📅 Cron Schedule

| Frequency | When |
|---|---|
| Daily | Every day at 8:00 AM IST |
| Weekly | Every Monday at 8:00 AM IST |
| Bi-weekly | 1st and 15th of every month at 8:00 AM IST |

Timezone can be changed in `src/scheduler.js`.

---

## 🐛 Troubleshooting

| Problem | Fix |
|---|---|
| `Cannot find module 'test_email.js'` | Use hyphen: `node src/test-email.js` |
| `Invalid login` on email test | Gmail App Password has spaces — remove them |
| `[404] model not found` | Update model name to `gemini-2.5-flash` in `resume-parser.js` and `job-matcher.js` |
| `[429] limit: 0` | Create a **new** Gemini API key using **"Create API key in new project"** |
| No matches on second "Send now" | Dedup working correctly — click **Clear history** on website then Send now again |
| No industry matches — only academic | Should be fixed (top-5-per-tier). If it recurs, check `job-matcher.js` uses `TOP_N_PER_TIER = 5` |
| Subscriptions lost after Render redeploy | Add `TURSO_DB_URL` and `TURSO_AUTH_TOKEN` to Render env vars |
| Render not picking up new env vars | Push a new commit or click Manual Deploy in Render dashboard |
| Cron not firing | Render free tier spins down — use [cron-job.org](https://cron-job.org) to ping your URL every 10 min |

---

## ⚠️ LinkedIn Note

LinkedIn does not offer a public Jobs API. JSearch aggregates roles that appear on LinkedIn through data partnerships — many LinkedIn-listed jobs still appear in digests. Direct LinkedIn scraping violates their ToS and is not included.

---

## 📝 License

MIT — free to use, modify, and deploy.

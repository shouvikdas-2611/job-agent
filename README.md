# 🎯 Job Agent — AI-Powered Job Digest Service

Upload your resume once. Get AI-curated, ranked job matches delivered to your inbox — India academic roles first.

> 💡 **First time setting up?** Read `SETUP_NOTES.md` — it captures every error encountered during the original installation and exactly how each was fixed.

---

## ✨ Features

- **AI Resume Parsing** — Gemini reads your resume and extracts skills, experience, seniority, and ideal job titles automatically
- **Frequency recommendation** — AI suggests daily/weekly/biweekly based on your profile type, with a reason
- **Instant digest on signup** — First job email arrives within 2–5 minutes of uploading your resume
- **Live progress bar** — See exactly what the agent is doing in real time (searching → scoring → deadline check → sending)
- **"Send now" button** — Trigger a fresh digest any time from the website
- **Reset sent history** — Clear the dedup log so all jobs appear fresh again (useful for testing)
- **🇮🇳 India-first priority** — 4-tier search, each tier independently contributes its top 5:
  1. **India Academic** — IITs, IIMs, IISc, NITs via FacultyPlus, FacultyTick, direct portals
  2. **India Industry** — corporate roles via JSearch + Adzuna
  3. **Abroad Academic** — jobs.ac.uk, EURAXESS, HigherEdJobs
  4. **Abroad Industry** — off by default, opt-in only
- **Deadline detection** — Regex extraction of application deadlines, flags expired/urgent/open with colour-coded badges
- **Smart ranking** — Gemini scores all jobs in one call, with salary and remote-preference penalties
- **"Why matched" reasoning** — Every job card shows a specific sentence explaining why it was included
- **Deduplication** — Never see the same job twice across digests

---

## 💰 Cost — Fully Free

| Service | Usage | Cost |
|---|---|---|
| Google Gemini 2.5 Flash | Resume parsing + job scoring (1 call/digest) | **Free** (20 req/day) |
| JSearch (RapidAPI) | Job aggregation — Indeed, LinkedIn, Glassdoor | **Free** (150 req/mo) |
| Adzuna | India industry jobs | **Free** (250 req/mo) |
| FacultyPlus / FacultyTick | India academic RSS aggregators | **Free** |
| IIT/IIM/IISc direct scraping | 14 premier institutions | **Free** |
| Brevo SMTP | Email delivery from cloud (300 emails/day) | **Free** |
| Turso | Cloud SQLite database | **Free** (500 MB) |
| Render | 24/7 hosting | **Free** (750 hrs/mo) |
| **Total** | | **$0/month** |

---

## ⚡ Gemini Quota — Important

The free tier for `gemini-2.5-flash` allows **20 API requests per day**. The app is optimised to use exactly **1 call per digest run**:

| Step | Gemini calls |
|---|---|
| Resume parsing (on signup only) | 1 |
| Job scoring (all jobs in one call) | 1 per digest |
| Deadline extraction | 0 (regex only) |

This means 19 digest runs per day are available after the initial signup. For weekly digests with a handful of users, you will never hit the limit. If quota is exhausted for the day, it resets at **midnight UTC (5:30 AM IST)**.

---

## 🔑 API Keys Required (all free)

| Key | Where to get | Notes |
|---|---|---|
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) → **"Create API key in new project"** | Must use "new project" |
| `RAPIDAPI_KEY` | [rapidapi.com/jsearch](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch) → Subscribe free | 150 req/month |
| `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` | [developer.adzuna.com](https://developer.adzuna.com) | 250 req/month |
| `EMAIL_USER` | Your Gmail address | Used as FROM address |
| `EMAIL_PASSWORD` | Gmail [App Password](https://myaccount.google.com/apppasswords) | Local dev only |
| `BREVO_SMTP_LOGIN` + `BREVO_SMTP_KEY` | [brevo.com](https://brevo.com) → SMTP & API → Generate key | Required for Render |
| `TURSO_DB_URL` + `TURSO_AUTH_TOKEN` | [turso.tech](https://turso.tech) → Create DB → Connect tab | Required for Render |

---

## 🚀 Local Setup

### 1. Install dependencies
```bash
cd job-agent
npm install --ignore-scripts
```

### 2. Configure environment
```bash
cp .env.example .env
# Fill in your API keys
```

### 3. Test email
```bash
node src/test-email.js your@gmail.com
```

### 4. Start the server
```bash
npm start
```
Open **http://localhost:3000**

---

## 🌐 Deploy to Render (free, 24/7)

### Prerequisites
- Code on GitHub (private or public)
- Turso database created at [turso.tech](https://turso.tech) (region: Mumbai or Singapore)
- Brevo account at [brevo.com](https://brevo.com) with SMTP key generated

### Steps
1. [render.com](https://render.com) → **New Web Service** → connect GitHub repo
2. **Build command:** `npm install --ignore-scripts`
3. **Start command:** `npm start`
4. **Region:** Singapore
5. **Plan:** Free
6. Add all environment variables (see table below)
7. Deploy

### All 14 environment variables for Render

```
GEMINI_API_KEY          AIza... key from Google AI Studio
RAPIDAPI_KEY            your RapidAPI key
ADZUNA_APP_ID           your Adzuna App ID
ADZUNA_APP_KEY          your Adzuna App Key
EMAIL_USER              yourname@gmail.com
EMAIL_PASSWORD          your 16-char Gmail App Password (no spaces)
EMAIL_FROM_NAME         Job Agent
BREVO_SMTP_LOGIN        your-brevo-account@email.com
BREVO_SMTP_KEY          xsmtpib-... key from Brevo SMTP & API page
TURSO_DB_URL            libsql://jobagent-yourname.turso.io
TURSO_AUTH_TOKEN        eyJ... Turso token
RENDER_EXTERNAL_URL     https://your-app-name.onrender.com
NODE_ENV                production
PORT                    3000
```

> **Why Brevo?** Render's shared IPs are blocked by Gmail for direct SMTP. Brevo is an SMTP relay — your email routes through their trusted IPs. Your Gmail address still appears as the sender.
>
> **Why Turso?** Render's free tier resets the filesystem on every redeploy. Turso persists your subscriptions and sent-jobs history independently.
>
> **After changing env vars in Render:** push a new commit or use Manual Deploy — Render does not redeploy on env var changes alone.

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
| **JSearch (India + academic filter)** | Cross-listed roles on Indeed/LinkedIn India | API |

All sources run in parallel with 30s timeouts. If some pages are slow, others still deliver.

---

## 🎓 Abroad Academic Sources (Tertiary Tier)

| Source | Coverage |
|---|---|
| **jobs.ac.uk** | UK universities — RSS |
| **EURAXESS** | European research — RSS (3 URL fallbacks) |
| **HigherEdJobs** | US universities — RSS |
| **JSearch (academic filter)** | Cross-listed university roles globally |

---

## 📧 Email Digest Layout

Each job card shows:
- **Match score** (%) with colour coding
- **Why matched** — specific sentence from Gemini explaining the match
- **Deadline badge** — one of:
  - 🔴 Deadline passed — 15 May 2026 (closed 3 days ago)
  - ⚠️ Closes TODAY
  - 🟠 Closing soon — 3 days left
  - 🟢 Open — 44 days left
  - ⚪ No deadline found
- 🌐 Remote badge if applicable
- 💰 Salary if listed
- Apply button (grey with "deadline passed" if expired)

```
🎯 Your Job Matches — 14 openings this week
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎓 India — Academic & Faculty (Top Priority)  (5 roles)
   Assistant Professor CS @ IIT Bombay              92%
   Why matched: Strong ML PhD, PyTorch stack, IIT location ideal
   🟢 Open — 30 June 2026 (44 days left)

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
| `POST` | `/api/reset-sent` | Clear sent-jobs history `{ email }` |
| `GET`  | `/api/progress/:email` | Live progress (step, %, detail, done) |
| `POST` | `/api/unsubscribe` | Opt out `{ email }` |
| `GET`  | `/api/subscriptions` | List active subscriptions |
| `GET`  | `/api/health` | Health check |

---

## 📁 Project Structure

```
job-agent/
├── src/
│   ├── server.js                 Express + all routes + keep-alive ping
│   ├── database.js               Turso (libsql) — falls back to local SQLite in dev
│   ├── resume-parser.js          PDF/DOCX → Gemini → profile + freq recommendation
│   ├── india-academic-search.js  FacultyPlus, FacultyTick, 14 IIT/IIM/IISc pages
│   ├── academic-search.js        Abroad academic — jobs.ac.uk, EURAXESS, HigherEdJobs
│   ├── job-search.js             4-tier orchestrator
│   ├── job-matcher.js            One-shot Gemini scoring + top-5-per-tier picker
│   ├── deadline-extractor.js     Regex-only deadline detection (zero Gemini calls)
│   ├── email-sender.js           Brevo SMTP + HTML email with badges
│   ├── scheduler.js              Cron + live progress tracking per email
│   └── test-email.js             Email config tester
├── templates/
│   └── index.html                UI — subscribe, send-now, reset-sent, progress bar
├── SETUP_NOTES.md                Full installation log — all errors and fixes
├── README.md                     This file
├── package.json
├── .env.example
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
| `Cannot find module test_email.js` | Use hyphen: `node src/test-email.js` |
| `Invalid login` on email test | Gmail App Password has spaces — remove them |
| `[404] model not found` | Update model to `gemini-2.5-flash` in `resume-parser.js` and `job-matcher.js` |
| `[429] limit: 0` | Create **new** Gemini API key using **"Create API key in new project"** |
| `[429] quota exceeded` | 20/day limit hit from testing — wait until 5:30 AM IST for reset |
| No matches on second "Send now" | Dedup working — click **Clear history** on website, then Send now |
| No industry matches | Check `job-matcher.js` uses `TOP_N_PER_TIER = 5` |
| `Connection timeout` on email | Add `BREVO_SMTP_LOGIN` and `BREVO_SMTP_KEY` to Render env vars |
| Subscriptions lost on Render redeploy | Add `TURSO_DB_URL` and `TURSO_AUTH_TOKEN` to Render env vars |
| Render not picking up new env vars | Push a new commit or click Manual Deploy in Render dashboard |
| Cron not firing reliably | Add `RENDER_EXTERNAL_URL` env var — enables keep-alive self-ping every 10 min |

---

## ⚠️ LinkedIn Note

LinkedIn does not offer a public Jobs API. JSearch aggregates roles that appear on LinkedIn through data partnerships — many LinkedIn-listed jobs appear in digests via this path. Direct LinkedIn scraping violates their ToS and is not included.

---

## 📝 License

MIT — free to use, modify, and deploy.

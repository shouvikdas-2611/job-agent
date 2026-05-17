# 🎯 Job Agent — AI-Powered Job Digest Service

Upload your resume once. Get AI-curated, ranked job matches delivered to your inbox — India academic roles first.

---

## ✨ Features

- **AI Resume Parsing** — Google Gemini reads your resume and extracts skills, experience, seniority, and ideal job titles automatically
- **Instant digest on signup** — First job email arrives within 2–3 minutes of uploading your resume, no waiting for a scheduled run
- **"Send me jobs now" button** — Trigger a fresh digest any time directly from the website
- **Frequency recommendation** — AI suggests the best schedule (daily/weekly/biweekly) based on your profile, with a reason
- **🇮🇳 India-first priority** — 4-tier search ordered by relevance:
  1. **India Academic** (PRIMARY) — IITs, IIMs, IISc, NITs, IIITs via FacultyPlus, FacultyTick, direct portals
  2. **India Industry** — corporate roles via JSearch + Adzuna
  3. **Abroad Academic** — jobs.ac.uk, EURAXESS, HigherEdJobs
  4. **Abroad Industry** — off by default, opt-in only
- **Premier institution scraping** — direct scraping of IIT Delhi/Madras/Bombay/Kanpur/Kharagpur/Roorkee/Indore/Gandhinagar/Hyderabad/Guwahati, IISc Bangalore, IIM Ahmedabad/Bangalore/Calcutta
- **Smart ranking** — Gemini scores each job 0–100 against your profile, weighted by tier
- **Tier-balanced digests** — up to 6 India-Academic + 4 India-Industry + 3 Abroad-Academic + 2 Abroad-Industry per email
- **Deduplication** — never see the same job twice across digests
- **Flexible schedule** — daily, weekly, or bi-weekly at 8 AM IST

---

## 💰 Cost — Fully Free

| Service | Usage | Cost |
|---|---|---|
| Google Gemini API | Resume parsing + job scoring | **Free** (1M tokens/day) |
| JSearch (RapidAPI) | Job aggregation — Indeed, LinkedIn, Glassdoor | **Free** (150 req/mo) |
| Adzuna | India industry jobs | **Free** (250 req/mo) |
| FacultyPlus / FacultyTick | India academic RSS feeds | **Free** |
| IIT/IIM/IISc direct scraping | Premier institution jobs | **Free** |
| Turso | Cloud database | **Free** (500 MB) |
| Render | 24/7 hosting | **Free** (750 hrs/mo) |
| Gmail | Email delivery | **Free** (500/day) |
| **Total** | | **$0/month** |

---

## 🔑 API Keys Needed (all free, no credit card)

| Key | Where to get | Time |
|---|---|---|
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) → Get API key | 2 min |
| `RAPIDAPI_KEY` | [rapidapi.com/jsearch](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch) → Subscribe free | 3 min |
| `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` | [developer.adzuna.com](https://developer.adzuna.com) → Register | 3 min |
| `EMAIL_USER` + `EMAIL_PASSWORD` | Your Gmail + [App Password](https://myaccount.google.com/apppasswords) | 3 min |
| `TURSO_DB_URL` + `TURSO_AUTH_TOKEN` | [turso.tech](https://turso.tech) → Create DB (for deployment) | 2 min |

---

## 🚀 Local Setup

### 1. Install dependencies
```bash
cd job-agent
npm install --ignore-scripts
```

> `--ignore-scripts` skips native compilation — all packages are pure JS, no build tools needed.

### 2. Configure environment
```bash
cp .env.example .env
# Fill in your API keys
```

### 3. Test email works
```bash
node src/test-email.js your@gmail.com
```
You should receive a sample digest within 30 seconds. Fix `.env` before continuing if this fails.

### 4. Start the server
```bash
npm start
```
Open **http://localhost:3000** — upload your resume and subscribe.

---

## 🌐 Deploy to Render (free, 24/7)

### Prerequisites
- Code pushed to a GitHub repo (private is fine)
- Turso database created at [turso.tech](https://turso.tech) — free, takes 2 minutes

### Steps
1. Sign up at [render.com](https://render.com) → **New Web Service**
2. Connect your GitHub repo
3. Set **Build command**: `npm install --ignore-scripts`
4. Set **Start command**: `npm start`
5. Add all environment variables from your `.env` in the Render dashboard
6. Click **Deploy**

Your app will be live at `https://your-app-name.onrender.com` within a few minutes, running 24/7.

> **Why Turso?** Render's free tier resets the filesystem on every redeploy. Turso keeps your subscriptions and sent-job history safe in a persistent cloud database, so nothing is lost when you push new code.

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

All sources run in parallel. If some institution pages are slow or down, others still deliver results.

**Field-aware queries:** A PhD in CS at senior level searches `"associate professor computer science"`. An economics postdoc searches `"assistant professor economics"`. Derived automatically from your resume.

---

## 🎓 Abroad Academic Sources (Tertiary Tier)

| Source | Coverage |
|---|---|
| **jobs.ac.uk** | UK universities — RSS |
| **EURAXESS** | European research positions — RSS |
| **HigherEdJobs** | US universities — RSS |
| **JSearch (academic filter)** | Cross-listed university roles globally |

---

## 📧 Email Digest Layout

```
🎯 Your Job Matches — 13 curated openings this week
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎓 India — Academic & Faculty (Top Priority)
   Assistant Professor CS @ IIT Bombay          92% match
   Associate Professor @ IIM Bangalore          88% match
   Faculty Position @ IISc Bangalore            85% match
   ...

💼 India — Industry Roles
   Senior ML Engineer @ Flipkart                82% match
   ...

🌍 Abroad — Academic & Research
   Lecturer in CS @ Univ of Bath                75% match
   ...

🌐 Abroad — Industry Roles   (only shown if opted in)
   ...
```

Sections only appear if they have matches. Jobs are ranked by match score within each tier.

---

## 🛠 API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/subscribe` | Upload resume, create subscription, trigger instant digest |
| `POST` | `/api/run-now` | Send digest immediately for an email `{ email }` |
| `POST` | `/api/unsubscribe` | Opt out `{ email }` |
| `GET`  | `/api/subscriptions` | List active subscriptions |
| `GET`  | `/api/health` | Health check |

---

## 📁 Project Structure

```
job-agent/
├── src/
│   ├── server.js                # Express server + all routes
│   ├── database.js              # Turso (libsql) — cloud-persistent SQLite
│   ├── resume-parser.js         # PDF/DOCX → text → Gemini → structured profile
│   ├── india-academic-search.js # FacultyPlus, FacultyTick, IIT/IIM/IISc scraping
│   ├── academic-search.js       # Abroad academic — jobs.ac.uk, EURAXESS, HigherEdJobs
│   ├── job-search.js            # Main orchestrator — 4-tier priority search
│   ├── job-matcher.js           # Gemini scoring + tier-balanced picker
│   ├── email-sender.js          # HTML email with 4 priority sections
│   ├── scheduler.js             # node-cron jobs + processSubscription
│   └── test-email.js            # Email config tester
├── templates/
│   └── index.html               # Web UI — subscribe + send now + freq recommendation
├── data/                        # Local SQLite (dev only, gitignored)
├── .env.example                 # All required keys with instructions
├── package.json
└── README.md
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
| `Invalid login` on email test | Gmail App Password has spaces — remove them from `EMAIL_PASSWORD` in `.env` |
| `GEMINI_API_KEY missing` | Add key from [aistudio.google.com](https://aistudio.google.com) to `.env` |
| `No jobs found` | Broaden location field, check `RAPIDAPI_KEY` is valid |
| Resume parse failed | Make sure PDF has selectable text — scanned images won't work |
| Cron not firing on Render | Normal — Render free tier spins down after inactivity. Upgrade to a paid plan or use a cron ping service like [cron-job.org](https://cron-job.org) |
| Subscriptions lost on Render redeploy | Add `TURSO_DB_URL` and `TURSO_AUTH_TOKEN` to Render env vars |

---

## ⚠️ LinkedIn Note

LinkedIn does not offer a public Jobs API. JSearch aggregates roles that appear on LinkedIn through data partnerships, so many LinkedIn-listed jobs still appear in digests — just ingested via a different path. Direct LinkedIn scraping violates their Terms of Service and is not included.

---

## 📝 License

MIT — free to use, modify, and deploy.

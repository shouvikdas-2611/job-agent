# 🗒️ Setup Notes — Job Agent (First Installation Log)

This file captures everything learned during the first setup of Job Agent —
errors hit, fixes applied, and decisions made. Use this as a reference for
any fresh installation.

---

## ✅ Stack Decisions Made

| Component | Choice | Why |
|---|---|---|
| AI model | Google Gemini (free) | Anthropic Claude API requires paid plan — switched to Gemini free tier |
| Gemini model | `gemini-2.5-flash` | `gemini-1.5-flash` → 404, `gemini-2.0-flash` → deprecated June 2026, `gemini-2.5-flash` is current stable free model |
| Database | Turso (libsql) | Render free tier resets filesystem on redeploy — Turso persists data independently |
| Hosting | Render (free) | Railway requires credit card; Render free tier works with Turso for persistence |
| Job sources | JSearch + Adzuna + FacultyPlus + direct IIT/IIM scraping | LinkedIn has no public API — JSearch aggregates LinkedIn/Indeed cross-posts |

---

## 🔑 API Keys Required

| Key | Where | Notes |
|---|---|---|
| `GEMINI_API_KEY` | aistudio.google.com → Get API key → **Create API key in NEW project** | Must use "new project" — existing projects may have `limit: 0` on free tier |
| `RAPIDAPI_KEY` | rapidapi.com → JSearch → Subscribe free | 150 req/month free |
| `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` | developer.adzuna.com → Register | 250 req/month free. Organisation field: type "Personal Project". Website: any valid URL |
| `EMAIL_USER` | Your Gmail address | — |
| `EMAIL_PASSWORD` | myaccount.google.com/apppasswords → Create → 16-char code | Must enable 2FA first. Paste WITHOUT spaces |
| `TURSO_DB_URL` | turso.tech → Create DB → Connect tab | Format: `libsql://dbname-username.turso.io` |
| `TURSO_AUTH_TOKEN` | turso.tech → Connect tab → Create token | Copy immediately — shown only once |

---

## ⚠️ Errors Hit & Fixes

### 1. `Cannot find module 'test_email.js'`
- **Cause:** Underscore used instead of hyphen
- **Fix:** `node src/test-email.js` (hyphen, not underscore)

### 2. `[404] models/gemini-1.5-flash is not found`
- **Cause:** Model name deprecated/renamed
- **Fix:** Changed to `gemini-2.5-flash` in both `resume-parser.js` and `job-matcher.js`

### 3. `[429] Quota exceeded, limit: 0`
- **Cause:** API key was created in an existing Google Cloud project that had `limit: 0` on free tier
- **Fix:** Created a **brand new** API key using **"Create API key in new project"** on aistudio.google.com. New projects always start with proper free tier quota.

### 4. `[404] models/gemini-2.0-flash is not found`
- **Cause:** `gemini-2.0-flash` deprecated and shut down June 1, 2026
- **Fix:** Updated to `gemini-2.5-flash`

### 5. No industry matches in digest — only academic
- **Cause:** Fixed quota system filled `india_academic` (6 slots) first, blocking `india_industry`
- **Fix:** Switched to **top-5-per-tier** — each tier independently picks its best 5, no tier blocks another

### 6. "No matches" on second/third "Send now" trigger
- **Cause:** Deduplication working correctly — jobs from first digest were marked "already sent"
- **Fix:** Added `/api/reset-sent` endpoint + "Clear history" button on UI. Use before re-testing.

### 7. Reasoning not showing in email
- **Cause:** `reason` field was being scored by Gemini but not rendering visibly in email template
- **Fix:** Added coloured "Why matched" bar under each job card in email

### 8. `better-sqlite3` native compilation failure
- **Cause:** Requires C++ build tools — fails on some machines and all Render free deployments
- **Fix:** Replaced with pure-JS JSON database locally, then switched to Turso (libsql) for cloud persistence

---

## 📦 npm Install Notes

**Always use:**
```bash
npm install --ignore-scripts
```

The `--ignore-scripts` flag prevents native C++ compilation which fails on Render's Linux servers and some Windows machines. All packages in this project are pure JS — no compilation needed.

---

## 🚀 Render Deployment Notes

### Build & Start commands
- Build: `npm install --ignore-scripts`
- Start: `npm start`

### Environment variables to add in Render dashboard
All 12 keys from `.env` must be added manually (Render has no file upload):
```
GEMINI_API_KEY
RAPIDAPI_KEY
ADZUNA_APP_ID
ADZUNA_APP_KEY
EMAIL_SERVICE=gmail
EMAIL_USER
EMAIL_PASSWORD
EMAIL_FROM_NAME=Job Agent
TURSO_DB_URL
TURSO_AUTH_TOKEN
NODE_ENV=production
PORT=3000
```

### Region
Pick **Singapore** — closest to India, lowest latency.

### After env var changes
Render does NOT auto-redeploy when you change env vars alone. Must either:
- Push a new commit (triggers redeploy automatically), or
- Render dashboard → Manual Deploy → Deploy latest commit

### Free tier spin-down
Render free tier spins down after 15 min inactivity. The web UI will be slow on first load (cold start ~30 sec). The **cron scheduler keeps firing** even when the service is idle — weekly digests are unaffected.

---

## 🗄️ Turso Setup Notes

1. Sign up at turso.tech (GitHub login recommended)
2. Create database — name: `jobagent`, region: **Mumbai** or Singapore
3. Go to database → **Connect** tab
4. Copy **Database URL** → starts with `libsql://`
5. Click **Create token** → copy immediately (shown only once)
6. Paste both into `.env` as `TURSO_DB_URL` and `TURSO_AUTH_TOKEN`

**Local dev without Turso:** if `TURSO_DB_URL` is blank, the app automatically falls back to a local SQLite file at `data/jobagent.db`. No setup needed for local testing.

---

## 📧 Gmail App Password Notes

- Regular Gmail password does NOT work — Gmail blocks it
- Must create an App Password at myaccount.google.com/apppasswords
- **2FA must be enabled first** — if App Passwords option is missing, 2FA is not on
- Google shows the password as `abcd efgh ijkl mnop` — paste into `.env` WITHOUT spaces: `abcdefghijklmnop`
- App Password disappears after closing the dialog — save it immediately

---

## 🔄 Workflow for Future Code Changes

```bash
# Make changes to files locally
git add .
git commit -m "describe change"
git push
# Render auto-redeploys in ~2 minutes
```

---

## 🧪 Testing Flow

### 1. Test email config (before starting server)
```bash
node src/test-email.js your@gmail.com
```

### 2. Start locally
```bash
npm start
# Open http://localhost:3000
```

### 3. After subscribing — trigger instant digest
Use the "Send now" button on the website, or:
```bash
curl -X POST http://localhost:3000/api/run-now \
  -H "Content-Type: application/json" \
  -d '{"email":"your@gmail.com"}'
```

### 4. If no matches on second run — reset sent history
Use the "Clear history" button on the website, or:
```bash
curl -X POST http://localhost:3000/api/reset-sent \
  -H "Content-Type: application/json" \
  -d '{"email":"your@gmail.com"}'
```
Then trigger "Send now" again — all jobs appear fresh.

### 5. Check live progress
After triggering, the website shows a live progress bar (polls every 2 seconds):
- 10% → Searching sources
- 25% → Found N postings
- 40–65% → AI scoring batches
- 72% → Checking deadlines
- 92% → Sending email
- 100% → Done ✅ (bar turns green) or ❌ (bar turns red with error)

---

## 📋 Features Added During This Setup

Beyond the base spec, these features were added based on real usage:

| Feature | Why added |
|---|---|
| Instant digest on signup | Original only had scheduled sends — no immediate feedback |
| "Send now" button on website | Needed for testing without curl commands |
| Live progress bar | Digest takes 2-5 min — no visibility into what's happening |
| Frequency recommendation | AI suggests best schedule based on resume type |
| Top-5-per-tier (not fixed quotas) | Fixed quotas blocked industry jobs when academic filled up |
| Salary range field | Filter/score jobs based on minimum expected salary |
| Remote preference field | Score down jobs that don't match work mode preference |
| Deadline extraction + badges | Govt/academic postings don't remove expired listings |
| "Why matched" reasoning in email | Scores alone weren't enough — needed explanation |
| Reset sent history | Dedup blocked re-testing; needed clean-slate option |
| Turso persistent DB | Render free tier wipes local files on every redeploy |

---

## 📁 File Reference

```
job-agent/
├── src/
│   ├── server.js                 All routes: /subscribe, /run-now, /reset-sent, /progress/:email
│   ├── database.js               Turso async client — auto-falls-back to local SQLite
│   ├── resume-parser.js          Gemini resume parse → profile + freq recommendation
│   ├── india-academic-search.js  FacultyPlus, FacultyTick, 14 IIT/IIM/IISc direct pages
│   ├── academic-search.js        jobs.ac.uk, EURAXESS, HigherEdJobs RSS feeds
│   ├── job-search.js             4-tier orchestrator (india_academic → india_industry → abroad_academic → abroad_industry)
│   ├── job-matcher.js            Gemini scoring, top-5-per-tier, salary/remote penalties, threshold=40
│   ├── deadline-extractor.js     Regex + Gemini deadline detection → open/urgent/expired/unknown badges
│   ├── email-sender.js           HTML email with deadline badges, reasoning, remote badge, salary
│   ├── scheduler.js              Cron + in-memory progress tracking per email
│   └── test-email.js             Email config tester (run before starting server)
├── templates/
│   └── index.html                Web UI — subscribe, send-now, reset-sent, progress bar
├── SETUP_NOTES.md                ← this file
├── README.md                     Full setup + deployment guide
├── package.json
├── .env.example                  All key slots with instructions
└── .gitignore                    Excludes .env, node_modules/, data/
```

---

## 🔧 Render Production Fixes (Session 2)

### Issues found from Render logs and fixes applied:

**Issue 1 — JSearch timeout (15s) on Render**
- Render free tier has slower network than local — 15s wasn't enough
- Fix: All API timeouts raised to 30s across `india-academic-search.js`, `job-search.js`, `academic-search.js`

**Issue 2 — EURAXESS returning 404**
- EURAXESS changed their RSS URL
- Fix: `academic-search.js` now tries 3 URL formats silently, logs once if all fail, and skips cleanly

**Issue 3 — Gemini 503 "Service Unavailable / high demand"**
- Gemini free tier occasionally overloads during peak hours
- Fix: Added `geminiWithRetry()` in `job-matcher.js` and `deadline-extractor.js` — retries up to 3 times with 15s/30s backoff before giving up

**Issue 4 — Nodemailer "Connection timeout"**
- Default nodemailer has no explicit timeout — silent failure on slow Render network
- Fix: Added `connectionTimeout: 30000`, `greetingTimeout: 15000`, `socketTimeout: 60000` to transporter config in `email-sender.js`

**Issue 5 — Render spinning down mid-digest**
- Render free tier spins down after 15 min inactivity
- Digests take 3-5 min — if triggered from cold start, instance could spin down mid-run
- Fix: Self-ping every 10 min using `RENDER_EXTERNAL_URL` env var in `server.js`
- **Action required:** Add `RENDER_EXTERNAL_URL=https://your-app.onrender.com` to Render env vars

### New env var needed on Render:
```
RENDER_EXTERNAL_URL = https://job-agent-75x8.onrender.com
```
(Replace with your actual Render URL)

---

## 🔧 Email Fix — Brevo SMTP (Session 3)

### Problem
Gmail SMTP (port 587) still gave "Connection timeout" on Render even after switching from port 465.

### Root Cause
Render's free tier uses **shared IP addresses** — thousands of apps run from the same IP pool. Many of those apps sent spam, so Gmail blocks TCP connections from these IPs entirely (before authentication even happens).

### Fix
Switched to **Brevo SMTP relay** (formerly Sendinblue):
- Brevo routes outgoing email through their own trusted IP pool
- Gmail whitelists Brevo's IPs
- Your Gmail address still appears as the sender — only the routing path changes
- Free: 300 emails/day, no card required

### Setup steps for Brevo
1. Sign up at **brevo.com**
2. Login → click your name (top right) → **SMTP & API**
3. Click **"Generate a new SMTP key"** → copy the `xsmtpib-...` key

### New env vars needed (add to Render dashboard)
```
BREVO_SMTP_LOGIN = your-brevo-account@email.com   ← the email you signed up with
BREVO_SMTP_KEY   = xsmtpib-your-key-here           ← from Brevo SMTP & API page
```

### How the code works now
- If `BREVO_SMTP_KEY` is set → uses Brevo (production/Render)
- If `BREVO_SMTP_KEY` is blank → falls back to Gmail direct SMTP (local dev)
- `EMAIL_USER` still used as the FROM address in all emails

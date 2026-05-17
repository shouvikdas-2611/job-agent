# 🗒️ Setup Notes — Job Agent (Complete Installation Log)

This file captures everything encountered during the full setup of Job Agent — every error hit, every fix applied, every decision made. Use as a reference for fresh installations.

---

## ✅ Tech Stack Decisions

| Component | Choice | Why |
|---|---|---|
| AI model | Google Gemini 2.5 Flash | Anthropic Claude API requires paid plan — Gemini has free tier |
| Gemini model | `gemini-2.5-flash` | 1.5-flash → 404 not found; 2.0-flash → deprecated June 2026; 2.5-flash is current stable free model |
| Database | Turso (libsql) | Render free tier resets filesystem on every redeploy — Turso persists data independently |
| Email relay | Brevo SMTP | Render's shared IPs are blocked by Gmail for direct SMTP — Brevo routes through trusted IPs |
| Hosting | Render free tier | Railway requires credit card; Render free + Turso = fully free persistent deployment |
| Job sources | JSearch + Adzuna + FacultyPlus + IIT/IIM/IISc direct scraping | LinkedIn has no public API — JSearch aggregates LinkedIn/Indeed cross-posts |

---

## 🔑 All API Keys

| Key | Where | Critical notes |
|---|---|---|
| `GEMINI_API_KEY` | aistudio.google.com → Get API key | Must use **"Create API key in new project"** — existing projects may have `limit: 0` |
| `RAPIDAPI_KEY` | rapidapi.com → JSearch → Subscribe free | 150 req/month free |
| `ADZUNA_APP_ID` | developer.adzuna.com → Register | Organisation: "Personal Project", Website: any valid URL |
| `ADZUNA_APP_KEY` | Same as above | Two separate values — App ID (short) and App Key (long) |
| `EMAIL_USER` | Your Gmail address | Used as FROM address in all emails |
| `EMAIL_PASSWORD` | myaccount.google.com/apppasswords | Enable 2FA first; paste 16 chars WITHOUT spaces |
| `BREVO_SMTP_LOGIN` | brevo.com → SMTP & API | The email you signed up with |
| `BREVO_SMTP_KEY` | brevo.com → SMTP & API → Generate | Starts with `xsmtpib-`; copy immediately |
| `TURSO_DB_URL` | turso.tech → DB → Connect tab | Format: `libsql://dbname-username.turso.io` |
| `TURSO_AUTH_TOKEN` | turso.tech → Connect tab → Create token | Starts with `eyJ`; copy immediately — shown only once |
| `RENDER_EXTERNAL_URL` | Your Render app URL | e.g. `https://job-agent-75x8.onrender.com` |

---

## 📦 npm Install

**Always use:**
```bash
npm install --ignore-scripts
```
Skips native C++ compilation — all packages are pure JS. Required on Render and some Windows machines.

---

## 📋 Session 1 — Initial Setup

### Error: `Cannot find module test_email.js`
- **Cause:** Underscore used instead of hyphen
- **Fix:** `node src/test-email.js` (hyphen, not underscore)

### Error: `[404] models/gemini-1.5-flash is not found`
- **Cause:** Model name deprecated/renamed
- **Fix:** Changed to `gemini-2.5-flash` in both `resume-parser.js` and `job-matcher.js`

### Error: `[429] Quota exceeded, limit: 0`
- **Cause:** API key created in an existing Google Cloud project with `limit: 0` on free tier
- **Fix:** Created brand new API key using **"Create API key in new project"** on aistudio.google.com. New projects always start with proper free tier quota.

### Error: `[404] models/gemini-2.0-flash is not found`
- **Cause:** `gemini-2.0-flash` deprecated and shut down June 1, 2026
- **Fix:** Updated to `gemini-2.5-flash`

### Issue: No industry matches — only academic
- **Cause:** Fixed quota system (6 india_academic, 4 india_industry slots) filled academic first, blocking industry
- **Fix:** Switched to **top-5-per-tier** — each tier independently picks its best 5

### Issue: No matches on second/third "Send now" trigger
- **Cause:** Deduplication working correctly — jobs from first digest marked "already sent"
- **Fix:** Added `/api/reset-sent` endpoint + "Clear history" button on UI

### Issue: `better-sqlite3` native compilation failure
- **Cause:** Requires C++ build tools — fails on Render and some Windows machines
- **Fix:** Replaced with Turso (libsql) for cloud persistence; local dev falls back to local SQLite file automatically

---

## 📋 Session 2 — Render Deployment Fixes

### Fix 1: JSearch timeout (15s) on Render
- Render free tier has slower network than local
- **Fix:** All API timeouts raised to **30s** across all search files

### Fix 2: EURAXESS returning 404
- EURAXESS changed their RSS URL
- **Fix:** `academic-search.js` now tries 3 URL formats silently, logs once if all fail

### Fix 3: Gemini 503 "Service Unavailable / high demand"
- Gemini free tier occasionally overloads during peak hours
- **Fix:** Added `geminiWithRetry()` in `job-matcher.js` and `deadline-extractor.js` — retries up to 3 times with 20s/40s backoff

### Fix 4: Nodemailer "Connection timeout"
- Default nodemailer has no explicit timeout settings — silent failure on slow Render network
- **Fix:** Added `connectionTimeout: 30000`, `greetingTimeout: 15000`, `socketTimeout: 60000`

### Fix 5: Render spinning down mid-digest
- Render free tier spins down after 15 min inactivity; digests take 3-5 min
- **Fix:** Self-ping every 10 min using `RENDER_EXTERNAL_URL` env var in `server.js`
- **Action:** Add `RENDER_EXTERNAL_URL=https://your-app.onrender.com` to Render env vars

---

## 📋 Session 3 — Email Connection Fix

### Problem: `Connection timeout` at email send step (persistent)
Even after raising timeouts, nodemailer kept timing out when trying to connect to Gmail SMTP from Render.

### Root Cause
Render uses **shared IP addresses** — thousands of apps run from the same IP pool. Many sent spam, so Gmail blocks TCP connections from these IPs entirely (before authentication even happens). This affects both port 465 and port 587.

### Fix: Brevo SMTP Relay
Switched to [Brevo](https://brevo.com) (formerly Sendinblue):
- Brevo routes outgoing email through their own trusted IP pool
- Gmail whitelists Brevo's IPs
- Your Gmail address still appears as the sender
- Free: 300 emails/day, no card required

### How the code works now (`email-sender.js`)
```
If BREVO_SMTP_KEY is set → use Brevo (production/Render)
If BREVO_SMTP_KEY is blank → fall back to Gmail direct SMTP (local dev)
```

### Brevo setup (2 minutes)
1. Sign up at brevo.com
2. Login → click your name (top right) → **SMTP & API**
3. Click **"Generate a new SMTP key"** → copy the `xsmtpib-...` key

### New env vars for Render
```
BREVO_SMTP_LOGIN = your-brevo-account@email.com
BREVO_SMTP_KEY   = xsmtpib-your-key-here
```

---

## 📋 Session 4 — Gemini Quota Fix

### Problem: `[429] Too Many Requests — quotaValue: 20`
Error appeared during scoring after several test runs.

### Root Cause
`gemini-2.5-flash` free tier allows only **20 requests per day** (not per minute — per **day**). The previous batched scoring approach used 3-4 Gemini calls per digest:
- Resume parsing: 1 call (on signup)
- Job scoring (batches of 15): 2-3 calls
- Deadline extraction: 1 call
- **Total: 4-5 calls per digest run**

With 20 calls/day limit, quota was exhausted after ~4-5 test runs.

### Fix 1: One-shot scoring (`job-matcher.js`)
Replaced batched scoring (3 calls) with **all jobs in ONE Gemini call**:
- Compressed job descriptions to 200 chars each
- All 30+ jobs sent in a single prompt
- Reduced from 3 calls → **1 call per digest**

### Fix 2: Regex-only deadline extraction (`deadline-extractor.js`)
Removed Gemini from deadline extraction entirely:
- Regex patterns catch 90%+ of govt/academic deadline phrases
- "last date:", "closing date:", "apply by", "deadline:", DD/MM/YYYY, ISO dates, etc.
- Reduced from 1 call → **0 calls for deadlines**

### Net result
| | Before | After |
|---|---|---|
| Calls per digest | 4 | **1** |
| Digests per day | 5 | **20** |
| Weekly digest (10 users) | Hits quota | Well within free tier |

### Quota reset time
Resets at **midnight UTC = 5:30 AM IST** daily.

---

## 🧪 Testing Workflow

### 1. Test email config
```bash
node src/test-email.js your@gmail.com
```

### 2. Start locally
```bash
npm start
# Open http://localhost:3000
```

### 3. Trigger instant digest
Use the "Send now" button on the website.

### 4. No matches? Reset history first
Use the "Clear history" button, then "Send now" again.

### 5. Check live progress
After triggering, the website shows a live progress bar:
```
10% → Searching sources (IITs, FacultyPlus, JSearch...)
25% → Found N postings
35% → N new (not previously sent)
40-65% → AI scoring (1 Gemini call)
72% → Checking deadlines (regex, instant)
85% → Deadlines checked
92% → Sending email
100% → ✅ Done (green bar) or ❌ Error (red bar)
```

---

## 🔄 Future Code Change Workflow

```bash
# 1. Make changes locally
git add .
git commit -m "describe change"
git push
# Render auto-redeploys in ~2 minutes

# 2. If you added new env vars, also add them in Render dashboard
# Render → your service → Environment → Add variable → Save Changes
# Then: Manual Deploy or push another commit
```

---

## 📁 File Reference

```
job-agent/
├── src/
│   ├── server.js           Routes: /subscribe /run-now /reset-sent /progress /unsubscribe /health
│   ├── database.js         Turso async client; auto-falls-back to local SQLite
│   ├── resume-parser.js    Gemini resume → profile + frequency recommendation
│   ├── india-academic-search.js  FacultyPlus, FacultyTick, 14 IIT/IIM/IISc direct pages
│   ├── academic-search.js  jobs.ac.uk, EURAXESS (3 URL fallbacks), HigherEdJobs
│   ├── job-search.js       4-tier orchestrator (india_academic → india_industry → abroad_academic → abroad_industry)
│   ├── job-matcher.js      One-shot Gemini scoring (1 call), top-5-per-tier, salary/remote penalties
│   ├── deadline-extractor.js  Regex-only deadline detection; 0 Gemini calls
│   ├── email-sender.js     Brevo SMTP (cloud) / Gmail fallback (local); deadline badges + reasoning
│   ├── scheduler.js        Cron + in-memory progress store per email
│   └── test-email.js       Email config tester
├── templates/
│   └── index.html          Web UI — subscribe, send-now, reset-sent, progress bar
├── SETUP_NOTES.md          ← this file
├── README.md               Full setup + deployment guide
├── package.json
├── .env.example
└── .gitignore
```

---

## ⚡ Gemini Quota Quick Reference

| Action | Gemini calls used |
|---|---|
| Upload resume + subscribe | 1 (resume parse) |
| Each digest run (Send now / scheduled) | 1 (scoring) |
| Daily limit (free tier) | 20 |
| Weekly digest, 10 users | 10/week — well within limit |
| Quota reset | Midnight UTC (5:30 AM IST) |

**If you hit quota:** wait until 5:30 AM IST — do NOT keep retrying, it won't help and wastes retries.

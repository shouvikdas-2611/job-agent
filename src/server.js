// src/server.js
require('dotenv').config();
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const db = require('./database');
const { extractTextFromFile, parseResumeWithClaude } = require('./resume-parser');
const { startScheduler, runForUser, processSubscription, getProgress } = require('./scheduler');
const { verifyEmailConfig } = require('./email-sender');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'templates')));

// ── File upload setup ────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(['.pdf', '.docx', '.txt'].includes(ext) ? null : new Error('Only PDF, DOCX, TXT allowed'), ['.pdf', '.docx', '.txt'].includes(ext));
  }
});

// ── Routes ───────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Subscribe — parse resume, save, send instant digest
app.post('/api/subscribe', upload.single('resume'), async (req, res) => {
  try {
    const {
      email, name, frequency, location, jobType,
      cat_india_academic, cat_india_industry, cat_abroad_academic, cat_abroad_industry,
      min_salary, salary_currency, remote_preference
    } = req.body;

    // Validate
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'Valid email required' });
    if (!['daily', 'weekly', 'biweekly'].includes(frequency))
      return res.status(400).json({ error: 'frequency must be daily, weekly, or biweekly' });
    if (!req.file)
      return res.status(400).json({ error: 'Resume file required' });

    // 1. Extract text from resume
    console.log(`📄 Parsing resume for ${email}`);
    const resumeText = await extractTextFromFile(req.file.path, req.file.mimetype);
    if (resumeText.length < 100)
      return res.status(400).json({ error: 'Resume too short or unreadable. Try a text-based PDF.' });

    // 2. Parse with Gemini
    const profile = await parseResumeWithClaude(resumeText);

    // 3. Build search_categories from checkboxes (user choice overrides auto-detect)
    const userSelected = [];
    if (cat_india_academic === 'on')  userSelected.push('india_academic');
    if (cat_india_industry === 'on')  userSelected.push('india_industry');
    if (cat_abroad_academic === 'on') userSelected.push('abroad_academic');
    if (cat_abroad_industry === 'on') userSelected.push('abroad_industry');

    if (userSelected.length > 0) {
      profile.search_categories = userSelected;
      if (userSelected.includes('india_academic') || userSelected.includes('abroad_academic')) {
        profile.academic_suitable = true;
      }
    } else {
      profile.search_categories = profile.search_categories || ['india_academic', 'india_industry', 'abroad_academic'];
    }

    // Attach salary + remote preferences to profile so matcher uses them
    if (min_salary)         profile.min_salary        = parseInt(min_salary);
    if (salary_currency)    profile.salary_currency   = salary_currency;
    if (remote_preference)  profile.remote_preference = remote_preference;

    console.log(`✅ Parsed: ${profile.name || email} | categories: ${profile.search_categories.join(', ')}`);

    // 4. Save subscription
    const subscriptionId = await db.createSubscription({
      email,
      name:       name || profile.name,
      frequency,
      profile,
      resumeText,
      location:   location || null,
      jobType:    jobType  || null
    });

    // 5. Clean up uploaded file
    fs.unlinkSync(req.file.path);

    // 6. Respond immediately with profile + recommendation
    const rec = profile.frequency_recommendation || { frequency: 'weekly', reason: 'Best cadence for faculty job postings' };
    res.json({
      success: true,
      subscriptionId,
      profile: {
        name:              profile.name,
        current_title:     profile.current_title,
        years_experience:  profile.years_experience,
        seniority_level:   profile.seniority_level,
        top_skills:        (profile.skills || []).slice(0, 10),
        preferred_titles:  profile.preferred_titles,
        academic_suitable: profile.academic_suitable,
        academic_field:    profile.academic_field
      },
      frequency_recommendation: rec,
      message: `🎉 Subscribed! Searching for jobs now — your first digest will arrive in your inbox in a few minutes.`
    });

    // 7. Trigger instant digest in background (don't block the HTTP response)
    const sub = await db.getSubscriptionByEmail(email);
    if (sub) {
      processSubscription(sub).then(result => {
        console.log(`📧 Instant digest for ${email}:`, result);
      }).catch(err => {
        console.error(`📧 Instant digest failed for ${email}:`, err.message);
      });
    }

  } catch (err) {
    console.error('Subscribe error:', err);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

// Send now — trigger an immediate digest for any subscribed email
app.post('/api/run-now', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });

    const sub = await db.getSubscriptionByEmail(email);
    if (!sub) return res.status(404).json({ error: `No subscription found for ${email}. Please subscribe first.` });
    if (!sub.active) return res.status(400).json({ error: `${email} is unsubscribed. Please re-subscribe.` });

    // Respond immediately, run in background
    res.json({ success: true, message: `Searching jobs for ${email} — digest arriving in your inbox shortly!` });

    processSubscription(sub).then(result => {
      console.log(`📧 Manual digest for ${email}:`, result);
    }).catch(err => {
      console.error(`📧 Manual digest failed for ${email}:`, err.message);
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset sent-jobs history — clears dedup log so all jobs appear fresh again
app.post('/api/reset-sent', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });

    const sub = await db.getSubscriptionByEmail(email);
    if (!sub) return res.status(404).json({ error: `No subscription found for ${email}` });

    const result = await db.resetSentJobs(sub.id);
    console.log(`🔄 Reset sent-jobs for ${email} — deleted ${result.deleted} entries`);
    res.json({
      success: true,
      deleted: result.deleted,
      message: `✅ Sent history cleared for ${email}. Next digest will show all matching jobs fresh.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Progress polling — frontend calls this every 2s to get live status
app.get('/api/progress/:email', (req, res) => {
  const progress = getProgress(decodeURIComponent(req.params.email));
  if (!progress) return res.json({ active: false });
  res.json({ active: true, ...progress });
});

// Unsubscribe
app.post('/api/unsubscribe', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    const result = await db.unsubscribe(email);
    res.json({ success: result.changes > 0, message: result.changes > 0 ? `${email} unsubscribed.` : 'Email not found.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List active subscriptions
app.get('/api/subscriptions', async (req, res) => {
  try {
    const subs = await db.getActiveSubscriptions();
    res.json(subs.map(s => ({
      email:        s.email,
      name:         s.name,
      frequency:    s.frequency,
      title:        s.profile.current_title,
      created_at:   s.created_at,
      last_sent_at: s.last_sent_at
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'templates', 'index.html'));
});

// ── Startup ──────────────────────────────────────────────────────────────────
async function start() {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️  GEMINI_API_KEY not set. Get free key at https://aistudio.google.com');
  } else {
    console.log('✅ Gemini API key found');
  }

  const emailOk = await verifyEmailConfig();
  if (!emailOk) {
    console.warn('⚠️  Email config invalid — emails will fail. Check .env');
  } else {
    console.log('✅ Email configured correctly');
  }

  startScheduler();

  app.listen(PORT, () => {
    console.log(`\n🚀 Job Agent running on http://localhost:${PORT}`);
    console.log(`   POST /api/subscribe   — upload resume, instant digest fires`);
    console.log(`   POST /api/run-now     — send digest immediately {email}`);
    console.log(`   POST /api/reset-sent  — clear sent history {email}`);
    console.log(`   GET  /api/progress/:email — live progress status`);
    console.log(`   POST /api/unsubscribe — opt out {email}`);
    console.log(`   GET  /api/health      — health check`);
  });

  // Keep-alive self-ping every 10 min — prevents Render free tier
  // from spinning down mid-digest (digests take 3-5 min to complete)
  if (process.env.RENDER_EXTERNAL_URL) {
    const axios = require('axios');
    setInterval(async () => {
      try {
        await axios.get(`${process.env.RENDER_EXTERNAL_URL}/api/health`, { timeout: 5000 });
      } catch (e) { /* ignore — server may be mid-restart */ }
    }, 10 * 60 * 1000);
    console.log('🔄 Keep-alive ping enabled (every 10 min)');
  }
}

start();

// src/scheduler.js
// Cron jobs + progress tracking so frontend can poll /api/progress/:email

const cron = require('node-cron');
const db   = require('./database');
const { searchJobs }              = require('./job-search');
const { scoreJobs, pickBalanced } = require('./job-matcher');
const { extractDeadlines }        = require('./deadline-extractor');
const { sendJobDigest }           = require('./email-sender');

// ── In-memory progress store (per email) ─────────────────────────────────────
// { email: { step, detail, pct, done, error, updatedAt } }
const progressStore = {};

function setProgress(email, step, detail, pct, done = false, error = null) {
  progressStore[email] = { step, detail, pct, done, error, updatedAt: new Date().toISOString() };
  console.log(`  [${email}] ${pct}% — ${step}: ${detail}`);
}

function getProgress(email) {
  return progressStore[email] || null;
}

function clearProgress(email) {
  // Keep for 5 minutes after done so UI can read final state
  setTimeout(() => delete progressStore[email], 5 * 60 * 1000);
}

// ── Main processing function ──────────────────────────────────────────────────
async function processSubscription(sub) {
  const email = sub.email;
  console.log(`\n[${new Date().toISOString()}] Processing ${email} (${sub.frequency})`);

  try {
    // Step 1 — Search jobs
    setProgress(email, 'Searching', 'Scanning IITs, IIMs, IISc, FacultyPlus, JSearch, Adzuna...', 10);
    const jobs = await searchJobs(sub.profile, sub.location, sub.job_type);
    console.log(`  → Found ${jobs.length} jobs from APIs`);

    if (jobs.length === 0) {
      setProgress(email, 'Done', 'No jobs found from any source. Try again later.', 100, true);
      clearProgress(email);
      return { sent: false, reason: 'no jobs found' };
    }
    setProgress(email, 'Searching', `Found ${jobs.length} postings across all sources`, 25);

    // Step 2 — Dedup
    setProgress(email, 'Filtering', 'Removing jobs already sent in previous digests...', 30);
    const alreadySent = await db.getAlreadySentJobIds(sub.id);
    const newJobs     = jobs.filter(j => !alreadySent.has(j.id));
    console.log(`  → ${newJobs.length} new (not previously sent)`);

    if (newJobs.length === 0) {
      setProgress(email, 'Done', 'All matching jobs were already sent. Check back next week!', 100, true);
      clearProgress(email);
      return { sent: false, reason: 'all jobs already sent' };
    }
    setProgress(email, 'Filtering', `${newJobs.length} new jobs to rank (${jobs.length - newJobs.length} already sent)`, 35);

    // Step 3 — Score with Gemini
    const batchCount = Math.ceil(newJobs.length / 15);
    setProgress(email, 'Ranking', `AI scoring ${newJobs.length} jobs in ${batchCount} batch${batchCount > 1 ? 'es' : ''}...`, 40);
    const allRanked = await scoreJobs(sub.profile, newJobs, (batchNum, totalBatches) => {
      const pct = 40 + Math.round((batchNum / totalBatches) * 25);
      setProgress(email, 'Ranking', `Scored batch ${batchNum}/${totalBatches}...`, pct);
    });
    const ranked = pickBalanced(allRanked);

    const counts = {
      india_academic:  ranked.filter(j => j.job_category === 'india_academic').length,
      india_industry:  ranked.filter(j => j.job_category === 'india_industry').length,
      abroad_academic: ranked.filter(j => j.job_category === 'abroad_academic').length,
      abroad_industry: ranked.filter(j => j.job_category === 'abroad_industry').length
    };
    console.log(`  → Top picks → 🇮🇳 Acad: ${counts.india_academic}, 🇮🇳 Ind: ${counts.india_industry}, 🌍 Acad: ${counts.abroad_academic}, 🌍 Ind: ${counts.abroad_industry}`);

    if (ranked.length === 0) {
      setProgress(email, 'Done', 'Jobs found but none scored above match threshold. Try broadening your profile.', 100, true);
      clearProgress(email);
      return { sent: false, reason: 'no jobs scored above threshold' };
    }
    setProgress(email, 'Ranking', `Top ${ranked.length} matches selected (🇮🇳 Acad: ${counts.india_academic}, 🇮🇳 Ind: ${counts.india_industry}, 🌍 Acad: ${counts.abroad_academic})`, 68);

    // Step 4 — Extract deadlines (non-fatal — email still sends if this fails)
    // Small gap after scoring to avoid hitting Gemini 20 RPM rate limit
    await new Promise(r => setTimeout(r, 10000));
    setProgress(email, 'Checking deadlines', `Verifying application deadlines for ${ranked.length} jobs...`, 72);
    let enriched = ranked;
    try {
      enriched = await extractDeadlines(ranked);
      const expiredCount = enriched.filter(j => j.deadline_status === 'expired').length;
      const urgentCount  = enriched.filter(j => j.deadline_status === 'urgent' || j.deadline_status === 'today').length;
      console.log(`  → Deadlines — expired: ${expiredCount}, urgent: ${urgentCount}`);
      const deadlineSummary = expiredCount > 0
        ? `${expiredCount} posting${expiredCount > 1 ? 's have' : ' has'} passed deadline — flagged in email`
        : urgentCount > 0
          ? `${urgentCount} posting${urgentCount > 1 ? 's close' : ' closes'} within 7 days — flagged in email`
          : 'All postings have valid deadlines';
      setProgress(email, 'Checking deadlines', deadlineSummary, 85);
    } catch (err) {
      // Gemini quota hit or timeout — skip deadline badges, still send email
      console.warn(`  → ⚠️ Deadline extraction skipped (${err.message.slice(0, 80)}) — sending email without deadline info`);
      setProgress(email, 'Checking deadlines', 'Deadline check skipped (quota limit) — sending email now', 85);
      // Regex-based deadlines already extracted — only Gemini fallback skipped
      // Jobs already have deadline_status from regex pass; mark rest as unknown
      enriched = ranked.map(j => ({
        ...j,
        deadline_status: j.deadline_status || 'unknown',
        deadline_label:  j.deadline_label  || 'No deadline found',
        deadline_str:    j.deadline_str    || null
      }));
    }

    // Step 5 — Send email
    setProgress(email, 'Sending email', `Sending digest to ${email}...`, 92);
    await sendJobDigest(email, sub.name, enriched, sub.frequency);
    console.log(`  → ✅ Email sent to ${email}`);

    // Step 6 — Mark sent
    await db.markJobsSent(sub.id, ranked.map(j => j.id));
    await db.updateLastSent(sub.id);

    setProgress(email, 'Done',
      `✅ Digest sent! ${ranked.length} jobs — ${counts.india_academic} India academic, ${counts.india_industry} India industry, ${counts.abroad_academic} abroad academic. Check your inbox.`,
      100, true
    );
    clearProgress(email);
    return { sent: true, count: ranked.length };

  } catch (err) {
    console.error(`  → ❌ Error processing ${email}:`, err.message);
    setProgress(email, 'Error', `❌ ${err.message}`, 100, true, err.message);
    clearProgress(email);
    return { sent: false, reason: err.message };
  }
}

// ── Cron jobs ─────────────────────────────────────────────────────────────────
async function runDigests(frequency) {
  console.log(`\n========== Running ${frequency.toUpperCase()} digests ==========`);
  const subs = await db.getActiveSubscriptions(frequency);
  console.log(`Found ${subs.length} active ${frequency} subscriptions`);
  for (const sub of subs) {
    await processSubscription(sub);
    await new Promise(r => setTimeout(r, 2000));
  }
  console.log(`========== ${frequency.toUpperCase()} digests complete ==========\n`);
}

function startScheduler() {
  cron.schedule('0 8 * * *',    () => runDigests('daily'),    { timezone: 'Asia/Kolkata' });
  cron.schedule('0 8 * * 1',    () => runDigests('weekly'),   { timezone: 'Asia/Kolkata' });
  cron.schedule('0 8 1,15 * *', () => runDigests('biweekly'), { timezone: 'Asia/Kolkata' });
  console.log('📅 Scheduler started:');
  console.log('   • Daily   → every day @ 8:00 AM IST');
  console.log('   • Weekly  → every Monday @ 8:00 AM IST');
  console.log('   • Biweekly→ 1st & 15th @ 8:00 AM IST');
}

async function runForUser(email) {
  const sub = await db.getSubscriptionByEmail(email);
  if (!sub) throw new Error(`No subscription found for ${email}`);
  return processSubscription(sub);
}

module.exports = { startScheduler, runForUser, processSubscription, getProgress };

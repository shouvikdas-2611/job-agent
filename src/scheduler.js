// src/scheduler.js
// Cron jobs for daily / weekly / biweekly digests
// Also exports processSubscription so server.js can trigger it immediately on signup

const cron = require('node-cron');
const db   = require('./database');
const { searchJobs }             = require('./job-search');
const { scoreJobs, pickBalanced } = require('./job-matcher');
const { extractDeadlines }       = require('./deadline-extractor');
const { sendJobDigest }          = require('./email-sender');

async function processSubscription(sub) {
  console.log(`\n[${new Date().toISOString()}] Processing ${sub.email} (${sub.frequency})`);

  try {
    // 1. Fetch jobs from all active tiers
    const jobs = await searchJobs(sub.profile, sub.location, sub.job_type);
    console.log(`  → Found ${jobs.length} jobs from APIs`);
    if (jobs.length === 0) return { sent: false, reason: 'no jobs found' };

    // 2. Filter already-sent jobs
    const alreadySent = await db.getAlreadySentJobIds(sub.id);
    const newJobs     = jobs.filter(j => !alreadySent.has(j.id));
    console.log(`  → ${newJobs.length} new (not previously sent)`);
    if (newJobs.length === 0) return { sent: false, reason: 'all jobs already sent' };

    // 3. Score with Gemini
    const allRanked = await scoreJobs(sub.profile, newJobs);
    const ranked    = pickBalanced(allRanked);

    const counts = {
      india_academic:  ranked.filter(j => j.job_category === 'india_academic').length,
      india_industry:  ranked.filter(j => j.job_category === 'india_industry').length,
      abroad_academic: ranked.filter(j => j.job_category === 'abroad_academic').length,
      abroad_industry: ranked.filter(j => j.job_category === 'abroad_industry').length
    };
    console.log(`  → Top picks → 🇮🇳 Acad: ${counts.india_academic}, 🇮🇳 Ind: ${counts.india_industry}, 🌍 Acad: ${counts.abroad_academic}, 🌍 Ind: ${counts.abroad_industry}`);

    if (ranked.length === 0) return { sent: false, reason: 'no jobs scored ≥50' };

    // 4. Extract deadlines — enriches each job with deadline_status, deadline_label, deadline_str
    const enriched = await extractDeadlines(ranked);
    const expiredCount = enriched.filter(j => j.deadline_status === 'expired').length;
    const urgentCount  = enriched.filter(j => j.deadline_status === 'urgent' || j.deadline_status === 'today').length;
    console.log(`  → Deadlines — expired: ${expiredCount}, urgent (≤7 days): ${urgentCount}, unknown: ${enriched.filter(j=>j.deadline_status==='unknown').length}`);

    // 5. Send email
    await sendJobDigest(sub.email, sub.name, enriched, sub.frequency);
    console.log(`  → ✅ Email sent to ${sub.email}`);

    // 5. Mark sent + update timestamp
    await db.markJobsSent(sub.id, ranked.map(j => j.id));
    await db.updateLastSent(sub.id);

    return { sent: true, count: ranked.length };
  } catch (err) {
    console.error(`  → ❌ Error processing ${sub.email}:`, err.message);
    return { sent: false, reason: err.message };
  }
}

async function runDigests(frequency) {
  console.log(`\n========== Running ${frequency.toUpperCase()} digests ==========`);
  const subs = await db.getActiveSubscriptions(frequency);
  console.log(`Found ${subs.length} active ${frequency} subscriptions`);

  for (const sub of subs) {
    await processSubscription(sub);
    await new Promise(r => setTimeout(r, 2000)); // small gap between users
  }
  console.log(`========== ${frequency.toUpperCase()} digests complete ==========\n`);
}

function startScheduler() {
  // Daily: every day at 8:00 AM IST
  cron.schedule('0 8 * * *',   () => runDigests('daily'),    { timezone: 'Asia/Kolkata' });
  // Weekly: every Monday at 8:00 AM IST
  cron.schedule('0 8 * * 1',   () => runDigests('weekly'),   { timezone: 'Asia/Kolkata' });
  // Biweekly: 1st and 15th at 8:00 AM IST
  cron.schedule('0 8 1,15 * *',() => runDigests('biweekly'), { timezone: 'Asia/Kolkata' });

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

module.exports = { startScheduler, runForUser, processSubscription };

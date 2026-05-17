// src/job-matcher.js
// Scores and ranks jobs using Gemini.
// Each tier independently contributes its top 5 — no tier blocks another.

const { GoogleGenerativeAI } = require('@google/generative-ai');

function getGemini() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing. Get a free key at https://aistudio.google.com');
  }
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
}

// ── Gemini call with retry on 503 ─────────────────────────────────────────────
async function geminiWithRetry(model, prompt, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await model.generateContent(prompt);
    } catch (err) {
      const is503 = err.message?.includes('503') || err.message?.includes('overloaded') || err.message?.includes('high demand');
      const is429 = err.message?.includes('429') || err.message?.includes('quota');
      if ((is503 || is429) && attempt < maxRetries) {
        const wait = attempt * 15000; // 15s, 30s
        console.warn(`  Gemini ${is503 ? '503' : '429'} on attempt ${attempt}/${maxRetries} — retrying in ${wait/1000}s...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
}

// ── Score jobs in batches ────────────────────────────────────────────────────
async function scoreJobs(profile, jobs) {
  if (jobs.length === 0) return [];

  const model = getGemini();
  const batches = [];
  for (let i = 0; i < jobs.length; i += 15) batches.push(jobs.slice(i, i + 15));

  const allScored = [];

  for (const batch of batches) {
    const jobsForPrompt = batch.map((job, idx) => ({
      idx,
      title:        job.title,
      company:      job.company,
      location:     job.location,
      remote:       job.remote || false,
      salary:       job.salary || null,
      job_category: job.job_category || 'india_industry',
      description:  (job.description || '').slice(0, 800)
    }));

    // Build preference context from profile
    const salaryPref  = profile.min_salary
      ? `Minimum expected salary: ${profile.min_salary} ${profile.salary_currency || 'INR'}/year`
      : null;
    const remotePref  = profile.remote_preference
      ? `Work mode preference: ${profile.remote_preference}`  // 'remote', 'onsite', 'both'
      : null;
    const prefLines   = [salaryPref, remotePref].filter(Boolean).join('\n- ');

    const prompt = `You are an expert recruiter scoring job listings for a candidate. Score each job 0–100.

CANDIDATE PROFILE:
- Current title: ${profile.current_title}
- Experience: ${profile.years_experience} years (${profile.seniority_level} level)
- Skills: ${(profile.skills || []).join(', ')}
- Key technologies: ${(profile.key_technologies || []).join(', ')}
- Industries: ${(profile.industries || []).join(', ')}
- Education: ${profile.education_level || 'unknown'}
- Academic background: ${profile.academic_suitable ? 'YES — PhD/research/teaching' : 'No'}
- Academic field: ${profile.academic_field || 'N/A'}${prefLines ? '\n- ' + prefLines : ''}

JOBS TO SCORE:
${JSON.stringify(jobsForPrompt, null, 2)}

Return ONLY a raw JSON array — no markdown, no explanation:
[
  {"idx": 0, "score": 87, "reason": "one clear sentence max 20 words explaining why this is a good match"},
  ...
]

Scoring rules:
- 90–100: Perfect — title, field, seniority, and location all align
- 70–89: Strong — most qualifications fit, minor gaps
- 50–69: Partial — transferable skills, worth considering
- Below 50: Weak — significant mismatch
- Deduct 10–15 points if salary is listed and clearly below candidate expectations
- Deduct 10 points if remote_preference is 'remote' but job is onsite (or vice versa)

For india_academic / abroad_academic: weight PhD, research field, publications, teaching experience heavily.
For india_industry / abroad_industry: weight technical skills, stack, years of experience.

The "reason" field must be a specific, useful sentence — e.g. "Strong ML PhD match, PyTorch stack aligns, IIT location ideal" not just "good match".

Return only the JSON array.`;

    try {
      const result = await geminiWithRetry(model, prompt);
      const text   = result.response.text().trim()
        .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

      const match = text.match(/\[[\s\S]*\]/);
      if (!match) { console.warn('Gemini scoring batch returned no array'); continue; }

      const scores = JSON.parse(match[0]);
      for (const s of scores) {
        if (batch[s.idx]) {
          allScored.push({ ...batch[s.idx], score: s.score, reason: s.reason || '' });
        }
      }
    } catch (err) {
      console.error('Scoring batch error:', err.message);
    }

    if (batches.length > 1) await new Promise(r => setTimeout(r, 4000));
  }

  return allScored
    .sort((a, b) => b.score - a.score)
    .filter(j => j.score >= 40); // lowered from 50 so industry jobs aren't cut too early
}

// ── Top-5-per-tier picker ────────────────────────────────────────────────────
// Each tier independently contributes its best 5 matches.
// No tier can block another — india_academic filling up doesn't cut industry slots.
const TOP_N_PER_TIER = 5;

function pickBalanced(scored) {
  const tiers = ['india_academic', 'india_industry', 'abroad_academic', 'abroad_industry'];

  const result = [];
  const tierStats = {};

  for (const tier of tiers) {
    const tierJobs = scored
      .filter(j => j.job_category === tier)
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_N_PER_TIER);

    tierStats[tier] = { found: scored.filter(j => j.job_category === tier).length, included: tierJobs.length };
    result.push(...tierJobs);
  }

  // Log tier summary for debugging
  console.log('  → Tier summary:',
    Object.entries(tierStats)
      .map(([t, s]) => `${t}: ${s.included}/${s.found}`)
      .join(' | ')
  );

  // Sort final list: by tier order first, then score within tier
  const tierOrder = { india_academic: 1, india_industry: 2, abroad_academic: 3, abroad_industry: 4 };
  return result.sort((a, b) => {
    const ta = tierOrder[a.job_category] || 99;
    const tb = tierOrder[b.job_category] || 99;
    if (ta !== tb) return ta - tb;
    return b.score - a.score;
  });
}

module.exports = { scoreJobs, pickBalanced };

// src/job-matcher.js
// Scores jobs using Gemini in ONE call per digest (not batches).
// Free tier: gemini-2.5-flash allows 20 requests/day.
// Previous batched approach used 3-4 calls per run — now uses exactly 1.

const { GoogleGenerativeAI } = require('@google/generative-ai');

function getGemini() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing. Get a free key at https://aistudio.google.com');
  }
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
}

// ── Retry on 503/429 ──────────────────────────────────────────────────────────
async function geminiWithRetry(model, prompt, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await model.generateContent(prompt);
    } catch (err) {
      const is503 = err.message?.includes('503') || err.message?.includes('overloaded') || err.message?.includes('high demand');
      const is429 = err.message?.includes('429') || err.message?.includes('quota');
      if ((is503 || is429) && attempt < maxRetries) {
        const wait = attempt * 20000; // 20s, 40s
        console.warn(`  Gemini ${is503 ? '503' : '429'} attempt ${attempt}/${maxRetries} — retrying in ${wait/1000}s...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
}

// ── Single one-shot scoring call ─────────────────────────────────────────────
// All jobs sent in ONE Gemini request using compressed 200-char descriptions.
// Reduces quota usage: 3 batch calls → 1 call per digest run.
async function scoreJobs(profile, jobs) {
  if (jobs.length === 0) return [];

  const model = getGemini();

  // Compress jobs — 200 chars per description keeps total prompt under token limit
  const jobsForPrompt = jobs.map((job, idx) => ({
    idx,
    title:        job.title,
    company:      job.company,
    location:     job.location,
    remote:       !!job.remote,
    salary:       job.salary || null,
    category:     job.job_category || 'india_industry',
    desc:         (job.description || '').slice(0, 200)
  }));

  const salaryPref = profile.min_salary
    ? `Min salary: ${profile.min_salary} ${profile.salary_currency || 'INR'}/yr` : '';
  const remotePref = profile.remote_preference
    ? `Work mode: ${profile.remote_preference}` : '';

  const prompt = `Expert recruiter scoring ${jobs.length} jobs for this candidate. Score each 0-100.

CANDIDATE:
Title: ${profile.current_title} | ${profile.years_experience}yrs | ${profile.seniority_level}
Skills: ${(profile.skills || []).slice(0, 8).join(', ')}
Tech: ${(profile.key_technologies || []).slice(0, 6).join(', ')}
Education: ${profile.education_level || 'unknown'} | Academic: ${profile.academic_suitable ? 'YES (PhD/research)' : 'No'} | Field: ${profile.academic_field || 'N/A'}
${salaryPref}${remotePref ? ' | ' + remotePref : ''}

JOBS (category: india_academic/india_industry/abroad_academic/abroad_industry):
${JSON.stringify(jobsForPrompt)}

Return ONLY raw JSON array, no markdown:
[{"idx":0,"score":87,"reason":"specific 12-word reason"},...]

Scoring:
90-100=perfect match | 70-89=strong | 50-69=partial | 40-49=weak borderline | <40=skip
Academic roles: weight PhD+field+seniority heavily
Industry roles: weight tech stack+experience heavily
Deduct 15pts: salary clearly below expectation
Deduct 10pts: remote mismatch
reason=SPECIFIC (e.g. "ML PhD aligns, PyTorch match, IIT role ideal")

Return only the JSON array.`;

  try {
    const result = await geminiWithRetry(model, prompt);
    const text   = result.response.text().trim()
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    const match = text.match(/\[[\s\S]*\]/);
    if (!match) { console.warn('Gemini scoring returned no array'); return []; }

    const scores = JSON.parse(match[0]);
    const allScored = [];
    for (const s of scores) {
      if (jobs[s.idx]) {
        allScored.push({ ...jobs[s.idx], score: s.score, reason: s.reason || '' });
      }
    }

    const filtered = allScored.sort((a, b) => b.score - a.score).filter(j => j.score >= 40);
    console.log(`  → Scored ${jobs.length} jobs → ${filtered.length} above threshold (1 Gemini call used)`);
    return filtered;

  } catch (err) {
    console.error('Scoring error:', err.message);
    return [];
  }
}

// ── Top-5-per-tier picker ─────────────────────────────────────────────────────
// Each tier independently picks its best 5 — no tier blocks another.
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

  console.log('  → Tier summary:',
    Object.entries(tierStats)
      .map(([t, s]) => `${t}: ${s.included}/${s.found}`)
      .join(' | ')
  );

  const tierOrder = { india_academic: 1, india_industry: 2, abroad_academic: 3, abroad_industry: 4 };
  return result.sort((a, b) => {
    const ta = tierOrder[a.job_category] || 99;
    const tb = tierOrder[b.job_category] || 99;
    if (ta !== tb) return ta - tb;
    return b.score - a.score;
  });
}

module.exports = { scoreJobs, pickBalanced };

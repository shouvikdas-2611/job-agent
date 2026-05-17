// src/job-matcher.js
// Scores and ranks jobs against a candidate profile using Google Gemini (free tier)
// Implements tier-based quotas: India academic gets the most slots

const { GoogleGenerativeAI } = require('@google/generative-ai');

function getGemini() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing. Get a free key at https://aistudio.google.com');
  }
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
}

// ── Score jobs in batches ────────────────────────────────────────────────────
async function scoreJobs(profile, jobs) {
  if (jobs.length === 0) return [];

  const model = getGemini();

  // 15 jobs per batch — stays well within Gemini's free tier token limits
  const batches = [];
  for (let i = 0; i < jobs.length; i += 15) batches.push(jobs.slice(i, i + 15));

  const allScored = [];

  for (const batch of batches) {
    const jobsForPrompt = batch.map((job, idx) => ({
      idx,
      title:        job.title,
      company:      job.company,
      location:     job.location,
      job_category: job.job_category || 'india_industry',
      description:  (job.description || '').slice(0, 800)
    }));

    const prompt = `You are an expert recruiter scoring job listings for a candidate. Score each job 0–100.

CANDIDATE PROFILE:
- Current title: ${profile.current_title}
- Experience: ${profile.years_experience} years (${profile.seniority_level} level)
- Skills: ${(profile.skills || []).join(', ')}
- Key technologies: ${(profile.key_technologies || []).join(', ')}
- Industries: ${(profile.industries || []).join(', ')}
- Education: ${profile.education_level || 'unknown'}
- Academic background: ${profile.academic_suitable ? 'YES — PhD/research/teaching experience' : 'No'}
- Academic field: ${profile.academic_field || 'N/A'}

JOBS TO SCORE:
${JSON.stringify(jobsForPrompt, null, 2)}

Return ONLY a raw JSON array — no markdown, no explanation:
[
  {"idx": 0, "score": 87, "reason": "one sentence, max 15 words"},
  ...
]

Scoring:
- 90–100: Perfect match — title, field, seniority all align
- 70–89: Strong match — most qualifications fit
- 50–69: Partial match — transferable skills
- Below 50: Weak match

For india_academic / abroad_academic roles: weight PhD, research field, publications, teaching experience.
For india_industry / abroad_industry roles: weight technical skills, stack match, years of experience.

Return only the JSON array.`;

    try {
      const result = await model.generateContent(prompt);
      const text   = result.response.text().trim()
        .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

      const match = text.match(/\[[\s\S]*\]/);
      if (!match) { console.warn('Gemini scoring batch returned no array'); continue; }

      const scores = JSON.parse(match[0]);
      for (const s of scores) {
        if (batch[s.idx]) {
          allScored.push({ ...batch[s.idx], score: s.score, reason: s.reason });
        }
      }
    } catch (err) {
      console.error('Scoring batch error:', err.message);
    }

    // Respect Gemini free tier: 15 RPM → 1 request per 4 seconds is safe
    if (batches.length > 1) await new Promise(r => setTimeout(r, 4000));
  }

  return allScored
    .sort((a, b) => b.score - a.score)
    .filter(j => j.score >= 50);
}

// ── Tier-based balanced picker ───────────────────────────────────────────────
// Quotas reflect India-first priority
const TIER_QUOTAS = {
  india_academic:  6,   // PRIMARY focus
  india_industry:  4,   // SECONDARY
  abroad_academic: 3,   // TERTIARY
  abroad_industry: 2    // QUATERNARY — only if opted in
};

function pickBalanced(scored, customQuotas = TIER_QUOTAS) {
  const byCategory = {
    india_academic:  scored.filter(j => j.job_category === 'india_academic'),
    india_industry:  scored.filter(j => j.job_category === 'india_industry'),
    abroad_academic: scored.filter(j => j.job_category === 'abroad_academic'),
    abroad_industry: scored.filter(j => j.job_category === 'abroad_industry')
  };

  const result = [];
  for (const [category, quota] of Object.entries(customQuotas)) {
    result.push(...(byCategory[category] || []).slice(0, quota));
  }

  // Sort by tier (1→4), then by score within same tier
  return result.sort((a, b) => {
    if (a.tier !== b.tier) return (a.tier || 99) - (b.tier || 99);
    return b.score - a.score;
  });
}

module.exports = { scoreJobs, pickBalanced };

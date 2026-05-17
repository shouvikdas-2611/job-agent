// src/deadline-extractor.js
// Extracts application deadlines from job descriptions using Gemini.
// Handles govt/academic postings that use phrases like:
//   "last date", "closing date", "apply before", "deadline", "walk-in date" etc.
// Also does regex pre-pass to avoid burning Gemini quota when date is obvious.

const { GoogleGenerativeAI } = require('@google/generative-ai');

function getGemini() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
}

// ── Regex pre-pass — catches most common patterns without calling Gemini ─────
const DATE_PATTERNS = [
  // "Last date: 30 June 2025" / "Last date of application: 15-07-2025"
  /(?:last\s*date|closing\s*date|apply\s*(?:by|before|on|latest\s*by)|deadline|submission\s*(?:date|deadline)|walk[\s-]?in\s*date|due\s*date)[:\s–-]+([0-9]{1,2}[\s/-][A-Za-z0-9]+[\s/-][0-9]{2,4})/gi,
  // ISO style: 2025-06-30
  /(?:last\s*date|closing\s*date|apply\s*(?:by|before)|deadline)[:\s–-]+([0-9]{4}-[0-9]{2}-[0-9]{2})/gi,
  // "30 June 2025" or "June 30, 2025" near deadline keywords
  /(?:by|before|on|till|until|upto)\s+([0-9]{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+[0-9]{2,4})/gi,
];

function regexExtractDate(text) {
  for (const pattern of DATE_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match && match[1]) {
      const parsed = new Date(match[1].replace(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/, '$2/$1/$3'));
      if (!isNaN(parsed.getTime())) return parsed;
      const parsed2 = new Date(match[1]);
      if (!isNaN(parsed2.getTime())) return parsed2;
    }
  }
  return null;
}

// ── Gemini extraction for ambiguous descriptions ──────────────────────────────
async function geminiExtractDeadlines(jobs) {
  if (!process.env.GEMINI_API_KEY || jobs.length === 0) return {};

  const model = getGemini();
  const today = new Date().toISOString().split('T')[0];

  // Only send jobs that need Gemini (regex found nothing)
  const toProcess = jobs.filter(j => !j._deadlineDate).slice(0, 20); // cap at 20
  if (toProcess.length === 0) return {};

  const items = toProcess.map((job, idx) => ({
    idx,
    id: job.id,
    description: (job.description || '').slice(0, 600)
  }));

  const prompt = `Today is ${today}. Extract application deadlines from these job descriptions.

For each item, look for phrases like: "last date", "closing date", "apply by", "apply before", "deadline", "walk-in date", "last date of application", "applications close", "apply on or before".

Return ONLY a raw JSON array, no markdown:
[
  {"idx": 0, "id": "job_id", "deadline_str": "30 June 2025", "deadline_iso": "2025-06-30"},
  ...
]

If no deadline is found, set both fields to null.

Jobs:
${JSON.stringify(items, null, 2)}

Return only the JSON array.`;

  try {
    const result = await model.generateContent(prompt);
    const text   = result.response.text().trim()
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return {};

    const parsed = JSON.parse(match[0]);
    const map = {};
    for (const item of parsed) {
      if (item.id && item.deadline_iso) {
        const d = new Date(item.deadline_iso);
        if (!isNaN(d.getTime())) {
          map[item.id] = { date: d, str: item.deadline_str };
        }
      }
    }
    return map;
  } catch (err) {
    console.error('Deadline extraction error:', err.message);
    return {};
  }
}

// ── Main function — enriches jobs with deadline info ─────────────────────────
async function extractDeadlines(jobs) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Step 1: regex pre-pass on all jobs
  for (const job of jobs) {
    const text = `${job.title || ''} ${job.description || ''}`;
    const regexDate = regexExtractDate(text);
    if (regexDate) {
      job._deadlineDate = regexDate;
      job._deadlineStr  = regexDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    }
  }

  // Step 2: Gemini for remaining jobs (batch, rate-limit safe)
  const needsGemini = jobs.filter(j => !j._deadlineDate);
  if (needsGemini.length > 0) {
    try {
      const geminiResults = await geminiExtractDeadlines(needsGemini);
      for (const job of needsGemini) {
        if (geminiResults[job.id]) {
          job._deadlineDate = geminiResults[job.id].date;
          job._deadlineStr  = geminiResults[job.id].str;
        }
      }
    } catch (err) {
      console.error('Gemini deadline batch failed:', err.message);
      // Non-fatal — continue without deadline info
    }
  }

  // Step 3: compute status for all jobs
  for (const job of jobs) {
    if (job._deadlineDate) {
      const diffMs   = job._deadlineDate.getTime() - today.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        job.deadline_status = 'expired';
        job.deadline_label  = `Closed ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} ago`;
        job.deadline_str    = job._deadlineStr || job._deadlineDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      } else if (diffDays === 0) {
        job.deadline_status = 'today';
        job.deadline_label  = 'Closes TODAY';
        job.deadline_str    = job._deadlineStr || 'Today';
      } else if (diffDays <= 7) {
        job.deadline_status = 'urgent';
        job.deadline_label  = `${diffDays} day${diffDays === 1 ? '' : 's'} left`;
        job.deadline_str    = job._deadlineStr || job._deadlineDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      } else {
        job.deadline_status = 'open';
        job.deadline_label  = `${diffDays} days left`;
        job.deadline_str    = job._deadlineStr || job._deadlineDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      }
    } else {
      job.deadline_status = 'unknown';
      job.deadline_label  = 'No deadline found';
      job.deadline_str    = null;
    }

    // Clean up temp fields
    delete job._deadlineDate;
    delete job._deadlineStr;
  }

  return jobs;
}

module.exports = { extractDeadlines };

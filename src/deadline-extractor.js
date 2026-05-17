// src/deadline-extractor.js
// Extracts application deadlines from job descriptions using REGEX ONLY.
// No Gemini calls — preserves the 20/day free quota for scoring.
// Handles govt/academic phrases: "last date", "closing date", "apply before", etc.

// ── Regex patterns ────────────────────────────────────────────────────────────
const DATE_PATTERNS = [
  // "Last date: 30 June 2025" / "Last date of application: 15-07-2025"
  /(?:last\s*date|closing\s*date|apply\s*(?:by|before|on|latest\s*by)|deadline|submission\s*(?:date|deadline)|walk[\s-]?in\s*date|due\s*date|application\s*deadline)[:\s–-]+([0-9]{1,2}[\s./-][A-Za-z0-9]+[\s./-][0-9]{2,4})/gi,
  // ISO: 2025-06-30
  /(?:last\s*date|closing\s*date|apply\s*(?:by|before)|deadline|application\s*deadline)[:\s–-]+([0-9]{4}-[0-9]{2}-[0-9]{2})/gi,
  // "apply by 30 June 2025" / "before 15 May 2026"
  /(?:by|before|on|till|until|upto|latest\s*by)\s+([0-9]{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+[0-9]{2,4})/gi,
  // "June 30, 2025" after deadline keywords
  /(?:last\s*date|deadline|closing)[^.]{0,30}((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+[0-9]{1,2},?\s+[0-9]{4})/gi,
  // DD/MM/YYYY or DD-MM-YYYY near deadline keyword
  /(?:last\s*date|deadline|closing\s*date)[:\s–-]+([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{4})/gi,
];

function regexExtractDate(text) {
  for (const pattern of DATE_PATTERNS) {
    pattern.lastIndex = 0;
    const m = pattern.exec(text);
    if (m && m[1]) {
      // Try DD/MM/YYYY → MM/DD/YYYY conversion
      const reordered = m[1].replace(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/, '$2/$1/$3');
      const d1 = new Date(reordered);
      if (!isNaN(d1.getTime()) && d1.getFullYear() > 2020) return d1;
      const d2 = new Date(m[1]);
      if (!isNaN(d2.getTime()) && d2.getFullYear() > 2020) return d2;
    }
  }
  return null;
}

// ── Main function ─────────────────────────────────────────────────────────────
async function extractDeadlines(jobs) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const job of jobs) {
    const text = `${job.title || ''} ${job.description || ''}`;
    const date = regexExtractDate(text);

    if (date) {
      const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);
      const dateStr  = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

      if (diffDays < 0) {
        job.deadline_status = 'expired';
        job.deadline_label  = `Closed ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} ago`;
        job.deadline_str    = dateStr;
      } else if (diffDays === 0) {
        job.deadline_status = 'today';
        job.deadline_label  = 'Closes TODAY';
        job.deadline_str    = dateStr;
      } else if (diffDays <= 7) {
        job.deadline_status = 'urgent';
        job.deadline_label  = `${diffDays} day${diffDays === 1 ? '' : 's'} left`;
        job.deadline_str    = dateStr;
      } else {
        job.deadline_status = 'open';
        job.deadline_label  = `${diffDays} days left`;
        job.deadline_str    = dateStr;
      }
    } else {
      job.deadline_status = 'unknown';
      job.deadline_label  = 'No deadline found';
      job.deadline_str    = null;
    }
  }

  return jobs;
}

module.exports = { extractDeadlines };

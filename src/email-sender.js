// src/email-sender.js
// Sends formatted job digest emails with 4 priority-tiered sections.
//
// Uses Brevo HTTP API (https://api.brevo.com/v3/smtp/email) on port 443.
// Render free tier blocks ALL outbound SMTP ports (25/465/587) — so SMTP
// (nodemailer) cannot work there. The HTTP API uses port 443 which is never
// blocked. Falls back to Gmail SMTP via nodemailer only for local dev.

const axios      = require('axios');
const nodemailer = require('nodemailer');

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

// Local-dev-only Gmail transporter (used when BREVO_API_KEY is not set)
function createGmailTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    },
    connectionTimeout: 30000,
    greetingTimeout:   15000,
    socketTimeout:     60000,
    tls: { rejectUnauthorized: false }
  });
}

// Log which transport is active at startup
if (process.env.BREVO_API_KEY) {
  console.log('📧 Email transport: Brevo HTTP API (port 443 — works on Render)');
} else if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
  console.log('📧 Email transport: Gmail SMTP (local dev only — will fail on Render)');
} else {
  console.log('⚠️  No email transport configured. Set BREVO_API_KEY for production.');
}

const TIER_META = {
  india_academic:  { emoji: '🎓', label: 'India — Academic & Faculty (Top Priority)',  color: '#7c3aed' },
  india_industry:  { emoji: '💼', label: 'India — Industry Roles',                     color: '#2563eb' },
  abroad_academic: { emoji: '🌍', label: 'Abroad — Academic & Research',               color: '#0891b2' },
  abroad_industry: { emoji: '🌐', label: 'Abroad — Industry Roles',                    color: '#64748b' }
};

const TIER_ORDER = ['india_academic', 'india_industry', 'abroad_academic', 'abroad_industry'];

function buildHtmlEmail(name, jobs, frequency) {
  const nameParts = (name || '').split(' ').filter(p => !/^(Dr|Prof|Mr|Mrs|Ms|Mx)\.?$/i.test(p));
  const greeting = nameParts.length ? `Hi ${nameParts[0]},` : 'Hi there,';
  const periodLabel = { daily: 'today', weekly: 'this week', biweekly: 'in the last 2 weeks' }[frequency];

  const grouped = {};
  for (const tier of TIER_ORDER) grouped[tier] = [];
  for (const job of jobs) {
    const cat = job.job_category || 'india_industry';
    if (grouped[cat]) grouped[cat].push(job);
  }

  const renderJobCard = (job, i) => {
    const scoreColor = job.score >= 85 ? '#16a34a' : job.score >= 70 ? '#0891b2' : '#ca8a04';
    const remoteBadge = job.remote
      ? '<span style="background:#dbeafe;color:#1e40af;padding:2px 7px;border-radius:99px;font-size:11px;font-weight:500;margin-left:6px;">🌐 Remote</span>'
      : '';
    const salaryLine = job.salary
      ? `<div style="font-size:13px;color:#059669;font-weight:500;margin-bottom:8px;">💰 ${escapeHtml(job.salary)}</div>`
      : '';
    const reasonLine = job.reason
      ? `<div style="font-size:13px;color:#374151;background:#f9fafb;border-left:3px solid ${scoreColor};padding:6px 10px;border-radius:0 6px 6px 0;margin-bottom:10px;">
           <span style="color:#6b7280;font-weight:500;">Why matched: </span>${escapeHtml(job.reason)}
         </div>`
      : '';

    // Deadline badge
    let deadlineBadge = '';
    if (job.deadline_status === 'expired') {
      deadlineBadge = `<div style="margin-bottom:10px;">
        <span style="background:#fef2f2;border:1px solid #fca5a5;color:#991b1b;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:500;">
          🔴 Deadline passed — ${escapeHtml(job.deadline_str)} (${escapeHtml(job.deadline_label)})
        </span>
      </div>`;
    } else if (job.deadline_status === 'today') {
      deadlineBadge = `<div style="margin-bottom:10px;">
        <span style="background:#fef9c3;border:1px solid #fde047;color:#854d0e;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:600;">
          ⚠️ Closes TODAY — ${escapeHtml(job.deadline_str)}
        </span>
      </div>`;
    } else if (job.deadline_status === 'urgent') {
      deadlineBadge = `<div style="margin-bottom:10px;">
        <span style="background:#fff7ed;border:1px solid #fdba74;color:#9a3412;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:500;">
          🟠 Closing soon — ${escapeHtml(job.deadline_str)} (${escapeHtml(job.deadline_label)})
        </span>
      </div>`;
    } else if (job.deadline_status === 'open') {
      deadlineBadge = `<div style="margin-bottom:10px;">
        <span style="background:#f0fdf4;border:1px solid #86efac;color:#166534;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:500;">
          🟢 Open — ${escapeHtml(job.deadline_str)} (${escapeHtml(job.deadline_label)})
        </span>
      </div>`;
    } else {
      deadlineBadge = `<div style="margin-bottom:10px;">
        <span style="background:#f9fafb;border:1px solid #e5e7eb;color:#6b7280;padding:3px 10px;border-radius:6px;font-size:12px;">
          ⚪ No deadline mentioned
        </span>
      </div>`;
    }

    return `
      <div style="border:1px solid ${job.deadline_status === 'expired' ? '#fca5a5' : '#e5e7eb'};border-radius:8px;padding:16px;margin-bottom:12px;background:${job.deadline_status === 'expired' ? '#fffafa' : '#fff'};">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
          <div style="flex:1;">
            <div style="font-size:11px;color:#6b7280;font-weight:600;margin-bottom:3px;">${escapeHtml(job.source)}</div>
            <a href="${job.url}" style="font-size:16px;font-weight:600;color:#111827;text-decoration:none;line-height:1.3;">
              ${escapeHtml(job.title)}
            </a>
            <div style="font-size:13px;color:#4b5563;margin-top:4px;">
              <strong>${escapeHtml(job.company)}</strong> · ${escapeHtml(job.location || 'N/A')}${remoteBadge}
            </div>
          </div>
          <div style="background:${scoreColor};color:#fff;padding:4px 10px;border-radius:12px;font-size:13px;font-weight:600;white-space:nowrap;margin-left:12px;text-align:center;">
            ${job.score}%<br><span style="font-size:10px;font-weight:400;">match</span>
          </div>
        </div>
        ${deadlineBadge}
        ${reasonLine}
        ${salaryLine}
        <a href="${job.url}" style="display:inline-block;background:${job.deadline_status === 'expired' ? '#6b7280' : '#2563eb'};color:#fff;padding:7px 16px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500;">
          ${job.deadline_status === 'expired' ? 'View (deadline passed)' : 'View &amp; Apply →'}
        </a>
      </div>
    `;
  };

  const noMatchesLine = (tier) => {
    const reasons = {
      india_academic:  'No new India academic postings matched your profile this period.',
      india_industry:  'No India industry roles scored above threshold — try broadening your location or skills.',
      abroad_academic: 'No international academic postings found this period.',
      abroad_industry: 'No international industry roles found (opt-in tier).'
    };
    return `<div style="font-size:13px;color:#9ca3af;font-style:italic;padding:8px 12px;background:#f9fafb;border-radius:6px;margin-bottom:12px;">${reasons[tier] || 'No matches this period.'}</div>`;
  };

  const sectionHeader = (meta, count) => `
    <div style="margin:24px 0 12px;padding:10px 14px;border-left:4px solid ${meta.color};background:#f9fafb;border-radius:4px;">
      <h2 style="font-size:15px;color:${meta.color};margin:0;">
        ${meta.emoji} ${meta.label}
        <span style="color:#9ca3af;font-weight:normal;font-size:13px;">(${count} ${count === 1 ? 'role' : 'roles'})</span>
      </h2>
    </div>
  `;

  let bodyContent = '';
  let cardIdx = 0;
  for (const tier of TIER_ORDER) {
    const tierJobs = grouped[tier];
    // Always show active tiers — show "no matches" message if empty
    const isActiveTier = tier !== 'abroad_industry' ||
      (jobs.some(j => j.job_category === 'abroad_industry'));
    if (!isActiveTier) continue;
    bodyContent += sectionHeader(TIER_META[tier], tierJobs.length);
    if (tierJobs.length === 0) {
      bodyContent += noMatchesLine(tier);
    } else {
      for (const job of tierJobs) {
        bodyContent += renderJobCard(job, cardIdx++);
      }
    }
  }

  if (bodyContent === '') {
    bodyContent = '<p style="color:#6b7280;text-align:center;padding:20px;">No new matches this period. We\'ll keep looking.</p>';
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:20px;">
  <div style="max-width:640px;margin:0 auto;">
    <div style="background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;padding:24px;border-radius:8px 8px 0 0;">
      <h1 style="margin:0;font-size:24px;">🎯 Your Job Matches</h1>
      <p style="margin:6px 0 0;opacity:0.9;font-size:14px;">${jobs.length} curated openings from ${periodLabel}</p>
    </div>
    <div style="background:#fff;padding:20px;border-radius:0 0 8px 8px;">
      <p style="margin:0 0 16px;color:#374151;">${greeting}</p>
      <p style="margin:0 0 8px;color:#6b7280;font-size:14px;">
        AI-curated picks from IITs, IIMs, IISc, NITs, FacultyPlus, plus job aggregators. Roles are ranked by priority — <strong>India academic first</strong>.
      </p>
      ${bodyContent}
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;">
        <p style="font-size:12px;color:#9ca3af;margin:0;">
          You're receiving ${frequency} updates. <a href="#" style="color:#6b7280;">Manage preferences</a>
        </p>
      </div>
    </div>
  </div>
</body></html>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendJobDigest(toEmail, name, jobs, frequency) {
  if (jobs.length === 0) {
    console.log(`No jobs to send to ${toEmail}`);
    return { skipped: true };
  }

  const subject  = `🎯 ${jobs.length} new job matches for you (${frequency})`;
  const htmlBody = buildHtmlEmail(name, jobs, frequency);
  const fromName = process.env.EMAIL_FROM_NAME || 'Job Agent';
  const fromAddr = process.env.EMAIL_USER;

  // ── Production: Brevo HTTP API (port 443 — never blocked by Render) ────────
  if (process.env.BREVO_API_KEY) {
    try {
      const response = await axios.post(
        BREVO_API_URL,
        {
          sender:      { name: fromName, email: fromAddr },
          to:          [{ email: toEmail, name: name || toEmail }],
          subject:     subject,
          htmlContent: htmlBody
        },
        {
          headers: {
            'api-key':      process.env.BREVO_API_KEY,
            'Content-Type': 'application/json',
            'Accept':       'application/json'
          },
          timeout: 30000
        }
      );
      console.log(`  ✉️  Email sent via Brevo API — messageId: ${response.data?.messageId || 'ok'}`);
      return { messageId: response.data?.messageId || 'sent' };
    } catch (err) {
      const status = err.response?.status;
      const body   = err.response?.data;
      console.error(`  ✗ Brevo API send failed:`);
      console.error(`    status: ${status || 'no response'}`);
      console.error(`    detail: ${JSON.stringify(body || err.message)}`);
      if (status === 401) {
        console.error(`    → Invalid BREVO_API_KEY. Generate a v3 API key at Brevo → SMTP & API → API Keys tab.`);
      } else if (status === 400) {
        console.error(`    → Check that sender email (${fromAddr}) is a verified sender in Brevo.`);
      }
      throw new Error(`Brevo API error: ${status} ${JSON.stringify(body || err.message)}`);
    }
  }

  // ── Local dev fallback: Gmail SMTP ────────────────────────────────────────
  try {
    const transporter = createGmailTransporter();
    const info = await transporter.sendMail({
      from:    `"${fromName}" <${fromAddr}>`,
      to:      toEmail,
      subject: subject,
      html:    htmlBody
    });
    console.log(`  ✉️  Email sent via Gmail SMTP — messageId: ${info.messageId}`);
    return { messageId: info.messageId };
  } catch (err) {
    console.error(`  ✗ Gmail SMTP send failed: ${err.code} ${err.message}`);
    console.error(`    → For production, set BREVO_API_KEY (Gmail SMTP is blocked on Render).`);
    throw err;
  }
}

async function verifyEmailConfig() {
  // Brevo HTTP API — verify by checking the account endpoint
  if (process.env.BREVO_API_KEY) {
    try {
      await axios.get('https://api.brevo.com/v3/account', {
        headers: { 'api-key': process.env.BREVO_API_KEY, 'Accept': 'application/json' },
        timeout: 10000
      });
      return true;
    } catch (err) {
      console.error(`  ✗ Brevo API key check failed: ${err.response?.status || err.message}`);
      return false;
    }
  }

  // Gmail SMTP fallback verification
  if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
    return new Promise((resolve) => {
      createGmailTransporter().verify((err) => {
        if (err) console.error(`  ✗ Gmail SMTP verify failed: ${err.message}`);
        resolve(!err);
      });
    });
  }

  return false;
}

module.exports = { sendJobDigest, verifyEmailConfig };

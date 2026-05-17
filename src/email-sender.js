// src/email-sender.js
// Sends formatted job digest emails with 4 priority-tiered sections

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

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
    return `
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:12px;background:#fff;">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
          <div style="flex:1;">
            <div style="font-size:11px;color:#6b7280;font-weight:600;">#${i + 1} · ${escapeHtml(job.source)}</div>
            <a href="${job.url}" style="font-size:17px;font-weight:600;color:#111827;text-decoration:none;line-height:1.3;">
              ${escapeHtml(job.title)}
            </a>
            <div style="font-size:14px;color:#4b5563;margin-top:4px;">
              <strong>${escapeHtml(job.company)}</strong> · ${escapeHtml(job.location || 'N/A')}
              ${job.remote ? ' · 🌐 Remote' : ''}
            </div>
          </div>
          <div style="background:${scoreColor};color:#fff;padding:4px 10px;border-radius:12px;font-size:13px;font-weight:600;white-space:nowrap;margin-left:12px;">
            ${job.score}% match
          </div>
        </div>
        <div style="font-size:13px;color:#6b7280;font-style:italic;margin-bottom:10px;">
          💡 ${escapeHtml(job.reason || '')}
        </div>
        ${job.salary ? `<div style="font-size:13px;color:#059669;font-weight:500;margin-bottom:10px;">💰 ${escapeHtml(job.salary)}</div>` : ''}
        <a href="${job.url}" style="display:inline-block;background:#2563eb;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500;">
          View & Apply →
        </a>
      </div>
    `;
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
    if (tierJobs.length === 0) continue;
    bodyContent += sectionHeader(TIER_META[tier], tierJobs.length);
    for (const job of tierJobs) {
      bodyContent += renderJobCard(job, cardIdx++);
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

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || 'Job Agent'}" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: `🎯 ${jobs.length} new job matches for you (${frequency})`,
    html: buildHtmlEmail(name, jobs, frequency)
  };

  const info = await transporter.sendMail(mailOptions);
  return { messageId: info.messageId };
}

async function verifyEmailConfig() {
  return new Promise((resolve) => {
    transporter.verify((err) => resolve(!err));
  });
}

module.exports = { sendJobDigest, verifyEmailConfig };

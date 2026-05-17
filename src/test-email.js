// src/test-email.js
// Quick test to verify email setup works
// Run with: node src/test-email.js your-email@example.com

require('dotenv').config();
const { sendJobDigest, verifyEmailConfig } = require('./email-sender');

async function main() {
  const toEmail = process.argv[2];
  if (!toEmail) {
    console.error('Usage: node src/test-email.js your-email@example.com');
    process.exit(1);
  }

  console.log('Verifying email config...');
  const ok = await verifyEmailConfig();
  if (!ok) {
    console.error('❌ Email config failed. Check EMAIL_USER and EMAIL_PASSWORD in .env');
    process.exit(1);
  }
  console.log('✅ Config OK\n');

  const sampleJobs = [
    {
      id: 'test1',
      title: 'Senior Software Engineer',
      company: 'Acme Corp',
      location: 'Bangalore, India',
      url: 'https://example.com/job1',
      source: 'JSearch',
      salary: '₹25L - ₹40L',
      remote: true,
      score: 92,
      reason: 'Strong match on Node.js, system design, and 5+ years experience'
    },
    {
      id: 'test2',
      title: 'Backend Developer',
      company: 'TechStart',
      location: 'Remote',
      url: 'https://example.com/job2',
      source: 'Adzuna',
      salary: null,
      remote: true,
      score: 78,
      reason: 'Good fit on backend stack, transferable cloud skills'
    }
  ];

  console.log(`Sending test email to ${toEmail}...`);
  const result = await sendJobDigest(toEmail, 'Test User', sampleJobs, 'weekly');
  console.log('✅ Sent!', result);
}

main().catch(e => { console.error(e); process.exit(1); });

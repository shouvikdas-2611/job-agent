// src/database.js
// Uses Turso (libsql) for persistent cloud SQLite — free tier, no card needed.
// In local dev (no TURSO_DB_URL set): falls back to a local file DB automatically.
// Get free Turso DB at: https://turso.tech

const { createClient } = require('@libsql/client');
const path = require('path');
const fs   = require('fs');

function getClient() {
  const url   = process.env.TURSO_DB_URL;
  const token = process.env.TURSO_AUTH_TOKEN;

  if (url && token) {
    // Production — Turso cloud
    return createClient({ url, authToken: token });
  }

  // Local dev — SQLite file (no Turso account needed)
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return createClient({ url: `file:${path.join(dataDir, 'jobagent.db')}` });
}

const client = getClient();

// ── Bootstrap tables ─────────────────────────────────────────────────────────
async function init() {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      email       TEXT    NOT NULL UNIQUE,
      name        TEXT,
      frequency   TEXT    NOT NULL,
      profile_json TEXT   NOT NULL,
      resume_text TEXT    NOT NULL,
      location    TEXT,
      job_type    TEXT,
      active      INTEGER DEFAULT 1,
      created_at  TEXT    DEFAULT (datetime('now')),
      last_sent_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sent_jobs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER NOT NULL,
      job_id          TEXT    NOT NULL,
      sent_at         TEXT    DEFAULT (datetime('now')),
      UNIQUE(subscription_id, job_id)
    );
    CREATE INDEX IF NOT EXISTS idx_sub_active ON subscriptions(active);
    CREATE INDEX IF NOT EXISTS idx_sent_sub   ON sent_jobs(subscription_id);
  `);
}

// Run init immediately — callers await the exported functions which all depend on this
const ready = init().catch(e => console.error('DB init error:', e.message));

// ── Public API (all async) ────────────────────────────────────────────────────

async function createSubscription(data) {
  await ready;
  const result = await client.execute({
    sql: `INSERT INTO subscriptions (email, name, frequency, profile_json, resume_text, location, job_type)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET
            name         = excluded.name,
            frequency    = excluded.frequency,
            profile_json = excluded.profile_json,
            resume_text  = excluded.resume_text,
            location     = excluded.location,
            job_type     = excluded.job_type,
            active       = 1`,
    args: [
      data.email,
      data.name        || null,
      data.frequency,
      JSON.stringify(data.profile),
      data.resumeText,
      data.location    || null,
      data.jobType     || null
    ]
  });

  if (result.lastInsertRowid) return Number(result.lastInsertRowid);
  const row = await client.execute({ sql: 'SELECT id FROM subscriptions WHERE email = ?', args: [data.email] });
  return Number(row.rows[0].id);
}

async function getActiveSubscriptions(frequency) {
  await ready;
  const sql  = frequency
    ? 'SELECT * FROM subscriptions WHERE active = 1 AND frequency = ?'
    : 'SELECT * FROM subscriptions WHERE active = 1';
  const args = frequency ? [frequency] : [];
  const res  = await client.execute({ sql, args });
  return res.rows.map(r => ({ ...r, profile: JSON.parse(r.profile_json) }));
}

async function getSubscriptionByEmail(email) {
  await ready;
  const res = await client.execute({ sql: 'SELECT * FROM subscriptions WHERE email = ?', args: [email] });
  if (!res.rows.length) return null;
  const r = res.rows[0];
  return { ...r, profile: JSON.parse(r.profile_json) };
}

async function unsubscribe(email) {
  await ready;
  const res = await client.execute({ sql: 'UPDATE subscriptions SET active = 0 WHERE email = ?', args: [email] });
  return { changes: res.rowsAffected };
}

async function resetSentJobs(subscriptionId) {
  await ready;
  const res = await client.execute({
    sql:  'DELETE FROM sent_jobs WHERE subscription_id = ?',
    args: [subscriptionId]
  });
  return { deleted: res.rowsAffected };
}

async function markJobsSent(subscriptionId, jobIds) {
  await ready;
  for (const jobId of jobIds) {
    await client.execute({
      sql:  'INSERT OR IGNORE INTO sent_jobs (subscription_id, job_id) VALUES (?, ?)',
      args: [subscriptionId, jobId]
    });
  }
}

async function getAlreadySentJobIds(subscriptionId) {
  await ready;
  const res = await client.execute({ sql: 'SELECT job_id FROM sent_jobs WHERE subscription_id = ?', args: [subscriptionId] });
  return new Set(res.rows.map(r => r.job_id));
}

async function updateLastSent(subscriptionId) {
  await ready;
  await client.execute({ sql: "UPDATE subscriptions SET last_sent_at = datetime('now') WHERE id = ?", args: [subscriptionId] });
}

module.exports = {
  createSubscription,
  getActiveSubscriptions,
  getSubscriptionByEmail,
  unsubscribe,
  resetSentJobs,
  markJobsSent,
  getAlreadySentJobIds,
  updateLastSent
};

// src/job-search.js
// Priority-tiered job search:
//   Tier 1 — India Academic    (HIGHEST priority — faculty/professor in India)
//   Tier 2 — India Industry    (corporate roles in India)
//   Tier 3 — Abroad Academic   (international universities)
//   Tier 4 — Abroad Industry   (international corporate — OFF by default)

const axios = require('axios');
const { searchIndiaAcademicJobs } = require('./india-academic-search');
const { searchAcademicJobs: searchAbroadAcademicJobs } = require('./academic-search');

// ============ JSearch (RapidAPI) — used for industry tiers ============
async function searchJSearch(query, location, page = 1) {
  if (!process.env.RAPIDAPI_KEY) return [];

  try {
    const response = await axios.get('https://jsearch.p.rapidapi.com/search', {
      params: {
        query: `${query} in ${location || 'remote'}`,
        page: String(page),
        num_pages: '1',
        date_posted: 'week'
      },
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
      },
      timeout: 30000
    });

    return (response.data.data || []).map(job => ({
      id: job.job_id,
      title: job.job_title,
      company: job.employer_name,
      location: job.job_city
        ? `${job.job_city}, ${job.job_country}`
        : (job.job_is_remote ? 'Remote' : job.job_country),
      description: (job.job_description || '').slice(0, 1500),
      url: job.job_apply_link || job.job_google_link,
      posted_at: job.job_posted_at_datetime_utc,
      salary: job.job_min_salary
        ? `${job.job_salary_currency || '$'}${job.job_min_salary} - ${job.job_max_salary}`
        : null,
      source: job.job_publisher || 'JSearch',
      remote: job.job_is_remote,
      _country: (job.job_country || '').toLowerCase()
    }));
  } catch (err) {
    console.error('JSearch error:', err.message);
    return [];
  }
}

// ============ Adzuna ============
async function searchAdzuna(query, location, country = 'in') {
  if (!process.env.ADZUNA_APP_ID || !process.env.ADZUNA_APP_KEY) return [];

  try {
    const response = await axios.get(
      `https://api.adzuna.com/v1/api/jobs/${country}/search/1`,
      {
        params: {
          app_id: process.env.ADZUNA_APP_ID,
          app_key: process.env.ADZUNA_APP_KEY,
          what: query,
          where: location || '',
          results_per_page: 20,
          max_days_old: 7,
          sort_by: 'date'
        },
        timeout: 30000
      }
    );

    return (response.data.results || []).map(job => ({
      id: `adzuna_${job.id}`,
      title: job.title,
      company: job.company?.display_name || 'Unknown',
      location: job.location?.display_name || location,
      description: (job.description || '').slice(0, 1500),
      url: job.redirect_url,
      posted_at: job.created,
      salary: job.salary_min ? `${job.salary_min} - ${job.salary_max}` : null,
      source: 'Adzuna',
      remote: /remote/i.test(job.title + job.description),
      _country: country
    }));
  } catch (err) {
    console.error('Adzuna error:', err.message);
    return [];
  }
}

// ============ Tier 2: India Industry ============
async function searchIndiaIndustryJobs(profile, location) {
  const titles = profile.preferred_titles || [profile.current_title];
  const jobs = [];
  const seen = new Set();

  for (const title of titles.slice(0, 3)) {
    const [jsearch, adzuna] = await Promise.all([
      searchJSearch(title, location || 'India'),
      searchAdzuna(title, location || 'India', 'in')
    ]);

    for (const job of [...jsearch, ...adzuna]) {
      if (seen.has(job.id) || !job.title) continue;
      // India filter
      const inIndia = (job._country === 'in' || job._country === 'india' ||
                       /india|bengaluru|bangalore|mumbai|delhi|chennai|hyderabad|kolkata|pune|gurgaon|noida/i.test(job.location || ''));
      if (!inIndia) continue;
      seen.add(job.id);
      jobs.push({ ...job, job_category: 'india_industry', tier: 2 });
    }
  }
  return jobs;
}

// ============ Tier 4: Abroad Industry (OPT-IN ONLY) ============
async function searchAbroadIndustryJobs(profile, location) {
  const titles = profile.preferred_titles || [profile.current_title];
  const jobs = [];
  const seen = new Set();

  for (const title of titles.slice(0, 2)) {
    const jsearch = await searchJSearch(title, location || 'United States');
    for (const job of jsearch) {
      if (seen.has(job.id) || !job.title) continue;
      // Exclude India for this tier (already covered by Tier 2)
      const inIndia = (job._country === 'in' || /india/i.test(job.location || ''));
      if (inIndia) continue;
      seen.add(job.id);
      jobs.push({ ...job, job_category: 'abroad_industry', tier: 4 });
    }
  }
  return jobs;
}

// ============ Main orchestrator (priority-tiered) ============
async function searchJobs(profile, location, jobType) {
  // Read user's explicit category preferences (set during signup)
  const categories = profile.search_categories || ['india_academic', 'india_industry', 'abroad_academic'];

  const includeIndiaAcademic  = categories.includes('india_academic');
  const includeIndiaIndustry  = categories.includes('india_industry');
  const includeAbroadAcademic = categories.includes('abroad_academic');
  const includeAbroadIndustry = categories.includes('abroad_industry'); // OFF unless explicit

  console.log(`  → Active tiers: ${[
    includeIndiaAcademic   && '🇮🇳 IN-Acad',
    includeIndiaIndustry   && '🇮🇳 IN-Ind',
    includeAbroadAcademic  && '🌍 Abroad-Acad',
    includeAbroadIndustry  && '🌍 Abroad-Ind'
  ].filter(Boolean).join(' | ')}`);

  const allJobs = [];
  const seen = new Set();

  // Tier 1 — India Academic (HIGHEST priority — runs first)
  if (includeIndiaAcademic) {
    const tier1 = await searchIndiaAcademicJobs(profile);
    for (const job of tier1) {
      if (!seen.has(job.id)) { seen.add(job.id); allJobs.push(job); }
    }
    console.log(`     → Tier 1 (India Academic): ${tier1.length} jobs`);
  }

  // Tier 2 — India Industry
  if (includeIndiaIndustry) {
    const tier2 = await searchIndiaIndustryJobs(profile, location);
    for (const job of tier2) {
      if (!seen.has(job.id)) { seen.add(job.id); allJobs.push(job); }
    }
    console.log(`     → Tier 2 (India Industry): ${tier2.length} jobs`);
  }

  // Tier 3 — Abroad Academic
  if (includeAbroadAcademic) {
    const tier3raw = await searchAbroadAcademicJobs(profile, location);
    const tier3 = tier3raw.map(j => ({ ...j, job_category: 'abroad_academic', tier: 3 }));
    for (const job of tier3) {
      if (!seen.has(job.id)) { seen.add(job.id); allJobs.push(job); }
    }
    console.log(`     → Tier 3 (Abroad Academic): ${tier3.length} jobs`);
  }

  // Tier 4 — Abroad Industry (opt-in only)
  if (includeAbroadIndustry) {
    const tier4 = await searchAbroadIndustryJobs(profile, location);
    for (const job of tier4) {
      if (!seen.has(job.id)) { seen.add(job.id); allJobs.push(job); }
    }
    console.log(`     → Tier 4 (Abroad Industry): ${tier4.length} jobs`);
  }

  return allJobs;
}

module.exports = { searchJobs };

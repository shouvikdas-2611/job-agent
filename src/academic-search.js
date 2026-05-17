// src/academic-search.js
// Fetches academic/professor/research jobs from RSS feeds and academic-specific APIs
// Sources: jobs.ac.uk, EURAXESS, THEunijobs RSS, plus JSearch with academic queries

const axios = require('axios');

// ============ Simple RSS parser (no extra deps) ============
function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      if (!m) return '';
      return m[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim();
    };
    items.push({
      title: get('title'),
      link: get('link'),
      description: get('description'),
      pubDate: get('pubDate'),
      category: get('category')
    });
  }
  return items;
}

// ============ jobs.ac.uk (UK academia) ============
// Provides RSS feeds for keyword searches
async function searchJobsAcUk(query) {
  try {
    const url = `https://www.jobs.ac.uk/search/?keywords=${encodeURIComponent(query)}&format=rss`;
    const response = await axios.get(url, { timeout: 30000, headers: { 'User-Agent': 'JobAgent/1.0' } });
    const items = parseRSS(response.data);

    return items.slice(0, 25).map(item => ({
      id: `jobsacuk_${Buffer.from(item.link).toString('base64').slice(0, 24)}`,
      title: item.title,
      company: extractEmployer(item.title, item.description) || 'UK University',
      location: extractLocation(item.description) || 'United Kingdom',
      description: item.description.slice(0, 1500),
      url: item.link,
      posted_at: item.pubDate,
      salary: extractSalary(item.description),
      source: 'jobs.ac.uk',
      remote: /remote/i.test(item.description),
      job_category: 'academic'
    }));
  } catch (err) {
    console.error('jobs.ac.uk error:', err.message);
    return [];
  }
}

// ============ EURAXESS (European research jobs) ============
async function searchEuraxess(query) {
  // Try multiple URL formats — EURAXESS changes their RSS endpoints periodically
  const urls = [
    `https://euraxess.ec.europa.eu/jobs/search/rss?keywords=${encodeURIComponent(query)}`,
    `https://euraxess.ec.europa.eu/jobs/search?keywords=${encodeURIComponent(query)}&format=rss`,
    `https://euraxess.ec.europa.eu/jobs?keywords=${encodeURIComponent(query)}&format=rss`
  ];

  for (const url of urls) {
    try {
      const response = await axios.get(url, { timeout: 30000, headers: { 'User-Agent': 'JobAgent/1.0' } });
      if (response.status !== 200) continue;
      const items = parseRSS(response.data);
      if (items.length === 0) continue;

      return items.slice(0, 25).map(item => ({
        id: `euraxess_${Buffer.from(item.link).toString('base64').slice(0, 24)}`,
        title: item.title,
        company: extractEmployer(item.title, item.description) || 'European Research Institution',
        location: extractLocation(item.description) || 'Europe',
        description: item.description.slice(0, 1500),
        url: item.link,
        posted_at: item.pubDate,
        salary: null,
        source: 'EURAXESS',
        remote: false,
        job_category: 'academic'
      }));
    } catch (err) {
      // Try next URL silently
    }
  }
  console.error('EURAXESS: all URLs failed — skipping this source');
  return [];
}

// ============ HigherEdJobs RSS (US universities) ============
async function searchHigherEdJobs(query) {
  try {
    // HigherEdJobs provides category-based RSS; we use the general faculty feed
    const url = `https://www.higheredjobs.com/rss/articleFeed.cfm?categoryID=1`;
    const response = await axios.get(url, { timeout: 30000, headers: { 'User-Agent': 'JobAgent/1.0' } });
    const items = parseRSS(response.data);
    const queryLower = query.toLowerCase();

    return items
      .filter(item =>
        item.title.toLowerCase().includes(queryLower) ||
        item.description.toLowerCase().includes(queryLower)
      )
      .slice(0, 15)
      .map(item => ({
        id: `heduc_${Buffer.from(item.link).toString('base64').slice(0, 24)}`,
        title: item.title,
        company: extractEmployer(item.title, item.description) || 'US University',
        location: extractLocation(item.description) || 'United States',
        description: item.description.slice(0, 1500),
        url: item.link,
        posted_at: item.pubDate,
        salary: null,
        source: 'HigherEdJobs',
        remote: false,
        job_category: 'academic'
      }));
  } catch (err) {
    console.error('HigherEdJobs error:', err.message);
    return [];
  }
}

// ============ JSearch with academic-tuned queries ============
// Many university postings get cross-listed on Indeed/LinkedIn — catch them
async function searchAcademicViaJSearch(title, location) {
  if (!process.env.RAPIDAPI_KEY) return [];

  // Add academic context to query
  const academicQuery = `${title} university OR college OR faculty`;

  try {
    const response = await axios.get('https://jsearch.p.rapidapi.com/search', {
      params: {
        query: `${academicQuery} in ${location || 'worldwide'}`,
        page: '1',
        num_pages: '1',
        date_posted: 'month',  // Academic jobs have longer posting windows
        employment_types: 'FULLTIME'
      },
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
      },
      timeout: 30000
    });

    return (response.data.data || [])
      .filter(job => isAcademicEmployer(job.employer_name, job.job_title, job.job_description))
      .map(job => ({
        id: job.job_id,
        title: job.job_title,
        company: job.employer_name,
        location: job.job_city ? `${job.job_city}, ${job.job_country}` : job.job_country,
        description: (job.job_description || '').slice(0, 1500),
        url: job.job_apply_link || job.job_google_link,
        posted_at: job.job_posted_at_datetime_utc,
        salary: job.job_min_salary ? `${job.job_salary_currency || '$'}${job.job_min_salary} - ${job.job_max_salary}` : null,
        source: `${job.job_publisher} (Academic)`,
        remote: job.job_is_remote,
        job_category: 'academic'
      }));
  } catch (err) {
    console.error('JSearch academic error:', err.message);
    return [];
  }
}

// ============ Helpers to identify academic roles ============
function isAcademicEmployer(company, title, description) {
  const text = `${company || ''} ${title || ''} ${description || ''}`.toLowerCase();
  const academicKeywords = [
    'university', 'college', 'institute of technology', 'polytechnic',
    'professor', 'faculty', 'tenure', 'postdoc', 'lecturer',
    'research scholar', 'academic', 'iit ', 'iisc', 'iim '
  ];
  return academicKeywords.some(kw => text.includes(kw));
}

function extractEmployer(title, description) {
  // Try to extract from common patterns like "Assistant Professor at MIT"
  const text = `${title} ${description}`;
  const atMatch = text.match(/at\s+([A-Z][A-Za-z\s&]{2,50}?)(?:\s+in|\s+\(|,|$)/);
  if (atMatch) return atMatch[1].trim();
  const uniMatch = text.match(/(University of [A-Z][A-Za-z\s]+|[A-Z][A-Za-z]+\s+University|[A-Z][A-Za-z]+\s+College)/);
  if (uniMatch) return uniMatch[1].trim();
  return null;
}

function extractLocation(text) {
  const locMatch = text.match(/Location[:\s]+([A-Z][^,\n.]{2,40})/i);
  return locMatch ? locMatch[1].trim() : null;
}

function extractSalary(text) {
  const salMatch = text.match(/([£$€])\s?([\d,]+)\s*(?:-|to)\s*[£$€]?\s?([\d,]+)/);
  return salMatch ? salMatch[0] : null;
}

// ============ Main orchestrator ============
async function searchAcademicJobs(profile, location) {
  const titles = profile.preferred_titles || [profile.current_title];

  // Generate academic-specific search terms based on seniority
  const academicTitles = generateAcademicTitles(profile, titles);

  const allJobs = [];
  const seen = new Set();

  for (const title of academicTitles.slice(0, 3)) {
    const results = await Promise.all([
      searchJobsAcUk(title),
      searchEuraxess(title),
      searchHigherEdJobs(title),
      searchAcademicViaJSearch(title, location)
    ]);

    for (const list of results) {
      for (const job of list) {
        if (!seen.has(job.id) && job.title && job.company) {
          seen.add(job.id);
          allJobs.push(job);
        }
      }
    }
  }

  return allJobs;
}

function generateAcademicTitles(profile, baseTitles) {
  const seniority = profile.seniority_level || 'mid';
  const fieldHints = (profile.skills || []).slice(0, 3).join(' ');

  const titleMap = {
    entry: ['lecturer', 'postdoctoral researcher', 'teaching fellow'],
    mid: ['assistant professor', 'lecturer', 'research scientist'],
    senior: ['associate professor', 'senior lecturer', 'principal investigator'],
    lead: ['professor', 'department chair', 'research director'],
    principal: ['full professor', 'chair professor', 'distinguished professor'],
    executive: ['dean', 'provost', 'department head']
  };

  const generic = titleMap[seniority] || titleMap.mid;
  // Combine with field — e.g. "assistant professor computer science"
  return generic.map(t => fieldHints ? `${t} ${fieldHints.split(' ')[0]}` : t);
}

module.exports = { searchAcademicJobs };

// src/india-academic-search.js
// India-focused academic/faculty job scraper
// Sources (in priority order):
//   1. FacultyPlus.com RSS feeds (aggregates IITs, IIMs, IISc, NITs, universities)
//   2. FacultyTick.com RSS (backup aggregator)
//   3. IIT Council faculty recruitment portal (iitsystem.ac.in)
//   4. Direct IIT careers pages (IIT Delhi, Madras, Bombay, Kanpur, Roorkee, Indore, Gandhinagar)
//   5. JSearch filtered for India + academic keywords

const axios = require('axios');

// ============ RSS parser (no extra deps) ============
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

const HTTP_OPTS = {
  timeout: 30000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobAgent/1.0)' }
};

// ============ FacultyPlus.com RSS feeds ============
// WordPress site → /feed/ works, plus category-specific feeds
async function searchFacultyPlus(profile) {
  const feeds = [
    'https://www.facultyplus.com/feed/',                                       // All recent
    'https://www.facultyplus.com/category/iit/feed/',                          // All IITs
    'https://www.facultyplus.com/category/iim/feed/',                          // All IIMs
    'https://www.facultyplus.com/category/iisc/feed/',                         // IISc
    'https://www.facultyplus.com/category/nit/feed/',                          // NITs
    'https://www.facultyplus.com/category/jobs-by-designation/professor/feed/',
    'https://www.facultyplus.com/category/jobs-by-designation/associate-professor/feed/',
    'https://www.facultyplus.com/category/jobs-by-designation/assistant-professor/feed/'
  ];

  const fieldKeywords = extractFieldKeywords(profile);
  const allJobs = [];
  const seen = new Set();

  for (const feedUrl of feeds) {
    try {
      const response = await axios.get(feedUrl, HTTP_OPTS);
      const items = parseRSS(response.data);

      for (const item of items) {
        const text = `${item.title} ${item.description}`.toLowerCase();
        // Field-level relevance filter — keep if any field keyword matches OR seniority matches
        const relevant = fieldKeywords.some(kw => text.includes(kw.toLowerCase())) ||
                         matchesSeniority(text, profile.seniority_level);

        if (!relevant) continue;
        if (seen.has(item.link)) continue;
        seen.add(item.link);

        allJobs.push({
          id: `facultyplus_${Buffer.from(item.link).toString('base64').slice(0, 24)}`,
          title: item.title,
          company: extractIndianInstitution(item.title, item.description) || 'Indian Institution',
          location: extractIndianCity(item.title + ' ' + item.description) || 'India',
          description: item.description.slice(0, 1500),
          url: item.link,
          posted_at: item.pubDate,
          salary: extractIndianSalary(item.description),
          source: 'FacultyPlus',
          remote: false,
          job_category: 'india_academic',
          tier: 1
        });
      }
    } catch (err) {
      // Silently skip broken feeds — some categories may not have feed endpoints
      console.error(`FacultyPlus ${feedUrl.split('/').slice(-3, -1).join('/')} error: ${err.message}`);
    }
  }

  return allJobs.slice(0, 40);
}

// ============ FacultyTick.com (backup aggregator) ============
async function searchFacultyTick(profile) {
  try {
    const response = await axios.get('https://facultytick.com/feed/', HTTP_OPTS);
    const items = parseRSS(response.data);
    const fieldKeywords = extractFieldKeywords(profile);

    return items
      .filter(item => {
        const text = `${item.title} ${item.description}`.toLowerCase();
        return fieldKeywords.some(kw => text.includes(kw.toLowerCase())) ||
               matchesSeniority(text, profile.seniority_level);
      })
      .slice(0, 20)
      .map(item => ({
        id: `facultytick_${Buffer.from(item.link).toString('base64').slice(0, 24)}`,
        title: item.title,
        company: extractIndianInstitution(item.title, item.description) || 'Indian Institution',
        location: extractIndianCity(item.title + ' ' + item.description) || 'India',
        description: item.description.slice(0, 1500),
        url: item.link,
        posted_at: item.pubDate,
        salary: null,
        source: 'FacultyTick',
        remote: false,
        job_category: 'india_academic',
        tier: 1
      }));
  } catch (err) {
    console.error('FacultyTick error:', err.message);
    return [];
  }
}

// ============ IIT/IIM/IISc direct career pages (HTML scraper) ============
// These are stable URLs; we scrape titles + links from listing pages
const INDIAN_PREMIER_INSTITUTIONS = [
  { name: 'IIT Delhi',        url: 'https://home.iitd.ac.in/jobs-iitd/faculty.php',         city: 'New Delhi' },
  { name: 'IIT Madras',       url: 'https://facapp.iitm.ac.in/',                            city: 'Chennai' },
  { name: 'IIT Bombay',       url: 'https://www.iitb.ac.in/en/faculty-recruitment',         city: 'Mumbai' },
  { name: 'IIT Kanpur',       url: 'https://www.iitk.ac.in/dofa/faculty-recruitment',       city: 'Kanpur' },
  { name: 'IIT Kharagpur',    url: 'http://www.iitkgp.ac.in/job-openings',                  city: 'Kharagpur' },
  { name: 'IIT Roorkee',      url: 'https://iitr.ac.in/Careers/Faculty Positions.html',     city: 'Roorkee' },
  { name: 'IIT Guwahati',     url: 'https://www.iitg.ac.in/recruitment/faculty',            city: 'Guwahati' },
  { name: 'IIT Hyderabad',    url: 'https://faculty.iith.ac.in/',                           city: 'Hyderabad' },
  { name: 'IIT Indore',       url: 'https://www.iiti.ac.in/recruitments/faculty-positions', city: 'Indore' },
  { name: 'IIT Gandhinagar',  url: 'https://iitgn.ac.in/careers/faculty-rolling',           city: 'Gandhinagar' },
  { name: 'IISc Bangalore',   url: 'https://iisc.ac.in/positions-open/',                    city: 'Bengaluru' },
  { name: 'IIM Ahmedabad',    url: 'https://www.iima.ac.in/faculty-research/faculty-recruitment', city: 'Ahmedabad' },
  { name: 'IIM Bangalore',    url: 'https://www.iimb.ac.in/recruitment',                    city: 'Bengaluru' },
  { name: 'IIM Calcutta',     url: 'https://www.iimcal.ac.in/faculty/faculty-recruitment',  city: 'Kolkata' }
];

async function searchIndianPremierInstitutions(profile) {
  const fieldKeywords = extractFieldKeywords(profile);
  const results = [];

  // Fetch each in parallel, but don't fail the whole pipeline if some are slow
  const promises = INDIAN_PREMIER_INSTITUTIONS.map(async (inst) => {
    try {
      const response = await axios.get(inst.url, { ...HTTP_OPTS, timeout: 8000 });
      const html = response.data;

      // Extract anchor tags that mention faculty / professor / assistant / associate
      const anchorRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      const found = [];
      while ((m = anchorRegex.exec(html)) !== null && found.length < 8) {
        const href = m[1];
        const text = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (!text || text.length < 10 || text.length > 250) continue;

        const lower = text.toLowerCase();
        const isFacultyLink = /faculty|professor|recruitment|hiring|position|opening|vacancy|advertisement/i.test(lower);
        if (!isFacultyLink) continue;

        // Field relevance — if profile has fields, prefer matching; otherwise include all
        const matchesField = fieldKeywords.length === 0 ||
                             fieldKeywords.some(kw => lower.includes(kw.toLowerCase())) ||
                             /assistant professor|associate professor|^professor|rolling advertisement/i.test(lower);
        if (!matchesField) continue;

        // Resolve relative URLs
        let absoluteUrl = href;
        if (href.startsWith('/')) {
          const u = new URL(inst.url);
          absoluteUrl = `${u.protocol}//${u.host}${href}`;
        } else if (!href.startsWith('http')) {
          absoluteUrl = new URL(href, inst.url).href;
        }

        found.push({
          id: `${inst.name.replace(/\s/g, '').toLowerCase()}_${Buffer.from(absoluteUrl).toString('base64').slice(0, 20)}`,
          title: text,
          company: inst.name,
          location: `${inst.city}, India`,
          description: `Faculty/research opportunity at ${inst.name}. ${text}`,
          url: absoluteUrl,
          posted_at: new Date().toISOString(),
          salary: null,
          source: inst.name,
          remote: false,
          job_category: 'india_academic',
          tier: 1
        });
      }
      results.push(...found);
    } catch (err) {
      // Many of these will fail intermittently — that's OK, others provide coverage
    }
  });

  await Promise.allSettled(promises);
  return results;
}

// ============ JSearch with India + academic filter ============
async function searchJSearchIndiaAcademic(profile) {
  if (!process.env.RAPIDAPI_KEY) return [];

  const academicTitles = generateAcademicTitles(profile);
  const allJobs = [];
  const seen = new Set();

  for (const title of academicTitles.slice(0, 2)) {
    try {
      const response = await axios.get('https://jsearch.p.rapidapi.com/search', {
        params: {
          query: `${title} in India`,
          page: '1',
          num_pages: '1',
          date_posted: 'month',
          employment_types: 'FULLTIME'
        },
        headers: {
          'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
        },
        timeout: 30000
      });

      for (const job of response.data.data || []) {
        if (!isAcademicEmployer(job.employer_name, job.job_title, job.job_description)) continue;
        if (!isInIndia(job)) continue;
        if (seen.has(job.job_id)) continue;
        seen.add(job.job_id);

        allJobs.push({
          id: job.job_id,
          title: job.job_title,
          company: job.employer_name,
          location: job.job_city ? `${job.job_city}, India` : 'India',
          description: (job.job_description || '').slice(0, 1500),
          url: job.job_apply_link || job.job_google_link,
          posted_at: job.job_posted_at_datetime_utc,
          salary: job.job_min_salary ? `₹${job.job_min_salary} - ${job.job_max_salary}` : null,
          source: `${job.job_publisher} (Academic India)`,
          remote: job.job_is_remote,
          job_category: 'india_academic',
          tier: 1
        });
      }
    } catch (err) {
      console.error('JSearch India academic error:', err.message);
    }
  }

  return allJobs;
}

// ============ Helpers ============
function extractFieldKeywords(profile) {
  const set = new Set();
  if (profile.academic_field) {
    profile.academic_field.toLowerCase().split(/[\s,\/]+/).forEach(w => w.length > 2 && set.add(w));
  }
  (profile.skills || []).slice(0, 6).forEach(s => {
    s.toLowerCase().split(/[\s,\/]+/).forEach(w => w.length > 2 && set.add(w));
  });
  (profile.industries || []).slice(0, 3).forEach(i => set.add(i.toLowerCase()));
  return Array.from(set);
}

function matchesSeniority(text, seniority) {
  const seniorityMap = {
    entry: ['lecturer', 'teaching assistant', 'junior'],
    mid: ['assistant professor', 'lecturer'],
    senior: ['associate professor', 'senior lecturer'],
    lead: ['professor', 'reader', 'principal'],
    principal: ['full professor', 'chair', 'distinguished'],
    executive: ['dean', 'director', 'head of department']
  };
  const keywords = seniorityMap[seniority] || seniorityMap.mid;
  return keywords.some(kw => text.includes(kw));
}

function generateAcademicTitles(profile) {
  const seniority = profile.seniority_level || 'mid';
  const field = profile.academic_field || (profile.skills || []).slice(0, 1).join(' ') || '';

  const baseTitles = {
    entry: ['lecturer', 'postdoctoral fellow'],
    mid: ['assistant professor', 'lecturer'],
    senior: ['associate professor', 'senior lecturer'],
    lead: ['professor', 'reader'],
    principal: ['professor', 'chair professor'],
    executive: ['professor', 'dean']
  }[seniority] || ['assistant professor'];

  return baseTitles.map(t => field ? `${t} ${field.split(' ').slice(0, 2).join(' ')}` : t);
}

function extractIndianInstitution(title, description) {
  const text = `${title} ${description}`;
  // Common patterns
  const patterns = [
    /(IIT\s+[A-Za-z]+)/,
    /(IIM\s+[A-Za-z]+)/,
    /(NIT\s+[A-Za-z]+)/,
    /(IIIT\s+[A-Za-z]+)/,
    /(IISc[A-Za-z\s]*)/,
    /(BITS\s+[A-Za-z]+)/,
    /(Indian Institute of [A-Za-z\s]{3,40})/i,
    /(University of [A-Za-z\s]{3,40})/i,
    /([A-Z][A-Za-z]+\s+University)/,
    /([A-Z][A-Za-z]+\s+Institute of Technology)/,
    /([A-Z][A-Za-z]+\s+College of Engineering)/
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

function extractIndianCity(text) {
  const cities = [
    'Bengaluru', 'Bangalore', 'Mumbai', 'Delhi', 'Chennai', 'Hyderabad', 'Kolkata',
    'Pune', 'Ahmedabad', 'Jaipur', 'Lucknow', 'Kanpur', 'Roorkee', 'Kharagpur',
    'Guwahati', 'Indore', 'Bhopal', 'Bhubaneswar', 'Patna', 'Gandhinagar',
    'Trivandrum', 'Kochi', 'Mangalore', 'Mysore', 'Coimbatore', 'Madurai',
    'Goa', 'Nagpur', 'Surat', 'Vadodara', 'Chandigarh', 'Dehradun', 'Shillong'
  ];
  for (const c of cities) {
    if (text.includes(c)) return c;
  }
  return null;
}

function extractIndianSalary(text) {
  const m = text.match(/(?:₹|Rs\.?|INR)\s*[\d,]+(?:\s*(?:-|to)\s*(?:₹|Rs\.?|INR)?\s*[\d,]+)?/i);
  return m ? m[0] : null;
}

function isAcademicEmployer(company, title, description) {
  const text = `${company || ''} ${title || ''} ${description || ''}`.toLowerCase();
  return /university|college|institute of technology|polytechnic|professor|faculty|tenure|postdoc|lecturer|academic|iit |iim |iisc|nit |iiit/i.test(text);
}

function isInIndia(job) {
  const country = (job.job_country || '').toLowerCase();
  const city = (job.job_city || '').toLowerCase();
  if (country === 'in' || country === 'india') return true;
  const indianCities = ['bangalore', 'bengaluru', 'mumbai', 'delhi', 'chennai', 'hyderabad', 'kolkata', 'pune'];
  return indianCities.some(c => city.includes(c));
}

// ============ Main orchestrator ============
async function searchIndiaAcademicJobs(profile) {
  console.log('  🇮🇳 Searching India academic sources...');

  const [facultyPlus, facultyTick, premier, jsearch] = await Promise.all([
    searchFacultyPlus(profile),
    searchFacultyTick(profile),
    searchIndianPremierInstitutions(profile),
    searchJSearchIndiaAcademic(profile)
  ]);

  console.log(`     FacultyPlus: ${facultyPlus.length}, FacultyTick: ${facultyTick.length}, Premier institutions: ${premier.length}, JSearch: ${jsearch.length}`);

  // Deduplicate by URL/id
  const seen = new Set();
  const merged = [];
  for (const job of [...premier, ...facultyPlus, ...facultyTick, ...jsearch]) {
    const key = job.url || job.id;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(job);
  }

  return merged;
}

module.exports = { searchIndiaAcademicJobs };

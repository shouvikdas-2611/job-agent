// src/resume-parser.js
// Extracts structured info from resumes using Google Gemini (free tier)
// Free tier: 15 RPM, 1M tokens/day — no credit card needed
// Get API key free at: https://aistudio.google.com

const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdfParse = require('pdf-parse');
const mammoth  = require('mammoth');
const fs       = require('fs');

function getGemini() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing. Get a free key at https://aistudio.google.com');
  }
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
}

// ── File text extraction ─────────────────────────────────────────────────────
async function extractTextFromFile(filePath, mimeType) {
  const buffer = fs.readFileSync(filePath);

  if (mimeType === 'application/pdf' || filePath.endsWith('.pdf')) {
    const data = await pdfParse(buffer);
    return data.text;
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    filePath.endsWith('.docx')
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (mimeType === 'text/plain' || filePath.endsWith('.txt')) {
    return buffer.toString('utf-8');
  }
  throw new Error('Unsupported file type. Please upload PDF, DOCX, or TXT.');
}

// ── Parse resume with Gemini ─────────────────────────────────────────────────
async function parseResumeWithClaude(resumeText) {
  // Function name kept as-is so no other file needs changing
  const model = getGemini();

  const prompt = `You are a resume parser. Extract key information from this resume and return ONLY a valid JSON object. No markdown fences, no explanation, no preamble — just raw JSON.

Required schema:
{
  "name": "full name or null",
  "current_title": "most recent job title",
  "years_experience": number,
  "seniority_level": "entry|mid|senior|lead|principal|executive",
  "skills": ["array of technical skills"],
  "industries": ["array of industries worked in"],
  "preferred_titles": ["3-5 job titles this person should search for"],
  "key_technologies": ["top 10 technologies/tools"],
  "education_level": "high_school|bachelors|masters|phd|other",
  "summary": "2-sentence professional summary",
  "academic_suitable": boolean,
  "academic_field": "primary academic field if applicable (e.g. computer science, economics) or null",
  "publications_count": 0,
  "based_in_india": boolean,
  "search_categories": ["india_academic", "india_industry", "abroad_academic"],
  "frequency_recommendation": {
    "frequency": "daily|weekly|biweekly",
    "reason": "one sentence explaining why, max 15 words"
  }
}

Rules for frequency_recommendation:
- "weekly" for most academic candidates — faculty roles post 1-2x/week, daily repeats too much
- "daily" only if the candidate is actively job hunting in industry with urgent need
- "biweekly" only if very senior (professor/director level) where roles are rare

Rules for search_categories:
- Always include "india_academic" if academic_suitable is true (PhD, teaching, research, publications)
- Always include "india_industry"
- Include "abroad_academic" if academic_suitable is true
- Do NOT include "abroad_industry" unless the resume clearly shows international career intent

Resume:
"""
${resumeText.slice(0, 8000)}
"""

Return only the JSON object.`;

  const result = await model.generateContent(prompt);
  const text   = result.response.text().trim();

  // Strip any accidental markdown fences
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Last resort: extract the first {...} block
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Gemini returned unparseable JSON. Raw: ' + cleaned.slice(0, 300));
  }
}

module.exports = { extractTextFromFile, parseResumeWithClaude };
